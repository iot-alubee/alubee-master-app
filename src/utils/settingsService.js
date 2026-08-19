import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import {
  listAppRequests,
  updateAppRequest,
  createAppRequestNotification,
  normalizeAppMobile,
  mobilesMatch,
  notifIsForUser,
  getProfileMobile,
} from './requestService';

const AVAIL_COL = 'approver_availability';
const AVAIL_ID = 'status';
const PREFS_COL = 'working_days_config';
const PREFS_ID = 'alubee_notif_prefs';

export const DEFAULT_AVAILABILITY = {
  md: 'Online',
  jmd_1: 'Online',
  jmd_2: 'Online',
};

export const NOTIF_TOGGLE_MODULES = [
  { id: 'tasks', label: 'Tasks' },
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'customers', label: 'Dispatch' },
  { id: 'supplier', label: 'Supplier' },
  { id: 'exec_summary', label: 'Operations' },
  { id: 'revenue', label: 'Revenue' },
  { id: 'maintenance', label: 'Maintenance' },
  { id: 'child_parts', label: 'Child Parts' },
  { id: 'ageing', label: 'Ageing' },
  { id: 'security', label: 'Security' },
  { id: 'logistics', label: 'Logistics' },
  { id: 'erp', label: 'ERP Dashboard' },
  { id: 'stores', label: 'Stores Dashboard' },
  { id: 'hr', label: 'HR' },
  { id: 'it', label: 'IT' },
];

const TYPE_TO_MODULE = {
  task_assigned: 'tasks',
  task_completed: 'tasks',
  task_updated: 'tasks',
  task_cancelled: 'tasks',
  task_deleted: 'tasks',
  task_overdue: 'tasks',
  task_reopened: 'tasks',
  delete_requested: 'tasks',
  vehicle: 'security',
  visitor: 'security',
  permission: 'security',
  mobilebox: 'security',
  tea: 'security',
  dc: 'security',
  internal: 'security',
  transfer: 'security',
  overstay: 'security',
  power: 'security',
  manpower: 'security',
  erp: 'erp',
  stores: 'stores',
  stores_checklist: 'stores',
  stores_alloy: 'stores',
  stores_transfer: 'stores',
  customer_dispatch: 'customers',
  customer_schedule: 'customers',
  bins_shortage: 'customers',
  supplier_inward: 'supplier',
  supplier_rag: 'supplier',
  revenue: 'revenue',
  maintenance: 'maintenance',
};

export function canAccessSettings(appRole) {
  return appRole === 'md' || appRole === 'jmd_1' || appRole === 'jmd_2' || appRole === 'admin';
}

/** Only MD and JMDs receive company-wide module alerts (security, dispatch, …). */
export function isBroadcastNotifRole(appRole) {
  return appRole === 'md' || appRole === 'jmd_1' || appRole === 'jmd_2';
}

export function normalizeAvailability(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const out = { ...DEFAULT_AVAILABILITY };
  if (src.md === 'Offline' || src.md === 'Online') out.md = src.md;
  if (src.jmd_1 === 'Offline' || src.jmd_1 === 'Online') out.jmd_1 = src.jmd_1;
  if (src.jmd_2 === 'Offline' || src.jmd_2 === 'Online') out.jmd_2 = src.jmd_2;
  // Legacy single JMD switch
  if (src.jmd === 'Offline' && src.jmd_1 == null && src.jmd_2 == null) {
    out.jmd_1 = 'Offline';
    out.jmd_2 = 'Offline';
  }
  return out;
}

export function isApproverOnline(role, avail) {
  const a = normalizeAvailability(avail);
  const jmdOff = a.jmd_1 === 'Offline' || a.jmd_2 === 'Offline';
  // Hard rule: if any JMD is offline, MD must remain in the chain.
  if (role === 'md') return a.md !== 'Offline' || jmdOff;
  if (role === 'jmd_1' || role === 'jmd') return a.jmd_1 !== 'Offline';
  if (role === 'jmd_2') return a.jmd_2 !== 'Offline';
  return true;
}

/** JMD and MD cannot be offline at the same time. Both JMDs may be offline only if MD is online. */
export function availabilityConflict(nextAvail) {
  const a = normalizeAvailability(nextAvail);
  const mdOff = a.md === 'Offline';
  const jmdOff = a.jmd_1 === 'Offline' || a.jmd_2 === 'Offline';
  if (mdOff && jmdOff) {
    return 'JMD and MD cannot be offline at the same time. Bring the other role online first.';
  }
  return '';
}

export async function getAvailability() {
  try {
    const snap = await getDoc(doc(db, AVAIL_COL, AVAIL_ID));
    const a = normalizeAvailability(snap.exists() ? snap.data() : {});
    if (availabilityConflict(a)) return { ...a, md: 'Online' };
    return a;
  } catch (_) {
    return { ...DEFAULT_AVAILABILITY };
  }
}

export function subscribeAvailability(callback) {
  return onSnapshot(
    doc(db, AVAIL_COL, AVAIL_ID),
    (snap) => callback(normalizeAvailability(snap.exists() ? snap.data() : {})),
    () => callback({ ...DEFAULT_AVAILABILITY })
  );
}

function nextAfterSkip(flow, approvals, skippedRole) {
  const nextApprovals = {
    ...(approvals || {}),
    [skippedRole]: {
      status: 'Approved',
      by: 'system',
      reason: skippedRole === 'md' ? 'MD offline — JMD is final' : 'JMD offline — sent to MD',
      at: new Date().toISOString(),
      skipped: true,
    },
  };
  const next = (flow || []).find((s) => s?.role && !nextApprovals[s.role]?.status);
  return { nextApprovals, next };
}

async function reroutePendingForOfflineRole(offlineRole) {
  const docs = await listAppRequests({ pendingOnly: true });
  const now = new Date().toISOString();
  for (const req of docs || []) {
    if (!req || req.rejected || req.cancelled || req.type === 'it') continue;
    const flow = Array.isArray(req.flow) ? req.flow : [];
    const waiting = flow.find((s) => s?.role && !req.approvals?.[s.role]?.status);
    if (!waiting) continue;
    const waitRole = waiting.role;
    const match =
      waitRole === offlineRole ||
      (offlineRole === 'jmd_1' && (waitRole === 'jmd' || waitRole === 'jmd_1')) ||
      (offlineRole === 'jmd_2' && waitRole === 'jmd_2');
    if (!match) continue;

    const { nextApprovals, next } = nextAfterSkip(flow, req.approvals, waitRole);
    const updates = {
      approvals: nextApprovals,
      nextApproverMobile: next?.mobile || '',
      nextApproverRole: next?.role || '',
      updatedAt: now,
    };
    if (!next) {
      updates.autoApproved = true;
    }
    await updateAppRequest(req.id, updates);

    const typeLabel =
      req.type === 'leave' ? 'Leave' :
      req.type === 'od' ? 'OD' :
      req.type === 'visitor' ? 'Visitor' : (req.type || 'Request');

    if (next?.mobile) {
      await createAppRequestNotification({
        type: 'request',
        title: `📝 ${typeLabel} — Action Required (${next.label || 'Approver'})`,
        message: `${req.employeeName || 'Employee'}'s ${typeLabel} was routed to you because an approver went offline.`,
        targetMobile: next.mobile,
        targetRole: next.role || '',
        nextApproverMobile: next.mobile,
        requestId: req.id,
        pendingApproval: true,
      }).catch(() => {});
    } else {
      const emp = normalizeAppMobile(req.employeeMobile);
      if (emp) {
        await createAppRequestNotification({
          type: 'request',
          title: `✅ ${typeLabel} Fully Approved`,
          message: `Your ${typeLabel} request is approved (final approver was offline).`,
          targetMobile: emp,
          requestId: req.id,
          pendingApproval: false,
          requestApproved: true,
        }).catch(() => {});
      }
    }
  }
}

export async function setApproverAvailability(role, nextStatus, current) {
  if (!['md', 'jmd_1', 'jmd_2'].includes(role)) {
    throw new Error('Only MD, JMD 1, and JMD 2 availability can be changed');
  }
  const updated = { ...normalizeAvailability(current), [role]: nextStatus };
  const conflict = availabilityConflict(updated);
  if (conflict) throw new Error(conflict);
  updated.updatedAt = new Date().toISOString();
  await setDoc(doc(db, AVAIL_COL, AVAIL_ID), updated, { merge: true });
  if (nextStatus === 'Offline') {
    await reroutePendingForOfflineRole(role);
  }
  return updated;
}

export async function getNotifPrefs(mobile) {
  const m = normalizeAppMobile(mobile);
  if (!m) return {};
  try {
    const snap = await getDoc(doc(db, PREFS_COL, PREFS_ID));
    const map = snap.exists() ? snap.data()?.byMobile || {} : {};
    return map[m] && typeof map[m] === 'object' ? map[m] : {};
  } catch (_) {
    return {};
  }
}

export function subscribeNotifPrefs(mobile, callback) {
  const m = normalizeAppMobile(mobile);
  if (!m) {
    callback({});
    return () => {};
  }
  return onSnapshot(
    doc(db, PREFS_COL, PREFS_ID),
    (snap) => {
      const map = snap.exists() ? snap.data()?.byMobile || {} : {};
      callback(map[m] && typeof map[m] === 'object' ? map[m] : {});
    },
    () => callback({})
  );
}

export async function setNotifPref(mobile, moduleId, enabled) {
  const m = normalizeAppMobile(mobile);
  if (!m) throw new Error('Mobile number required');
  const ref = doc(db, PREFS_COL, PREFS_ID);
  let prev = {};
  try {
    const snap = await getDoc(ref);
    prev = snap.exists() ? snap.data()?.byMobile || {} : {};
  } catch (_) {}
  const mine = { ...(prev[m] || {}), [moduleId]: !!enabled };
  await setDoc(ref, { byMobile: { ...prev, [m]: mine }, updatedAt: new Date().toISOString() }, { merge: true });
  return mine;
}

export function moduleForNotifType(type) {
  return TYPE_TO_MODULE[String(type || '')] || '';
}

/** Approvals always show. Module alerts respect the user's toggles (default on). */
export function notifAllowedByPrefs(n, prefs) {
  if (!n) return false;
  if (n.pendingApproval) return true;
  if (n.type === 'request' || n._source === 'app_request') return true;
  const mod = moduleForNotifType(n.type);
  if (!mod) return true;
  if (prefs && prefs[mod] === false) return false;
  return true;
}

function nameMatches(personName, candidate) {
  const me = String(personName || '').trim().toLowerCase();
  const val = String(candidate || '').trim().toLowerCase();
  if (!me || !val) return false;
  return val === me || val.includes(me) || me.includes(val);
}

function isPersonalNotif(n, user) {
  if (!n || !user) return false;
  const mobile = getProfileMobile(user) || user.mobile || '';
  const appRole = user.appRole || '';
  const userId = user.id || '';
  const name = user.name || user.employeeName || '';

  if (notifIsForUser(n, mobile, appRole)) return true;
  if (mobilesMatch(n.employeeMobile, mobile) || mobilesMatch(n.assignedToMobile, mobile)) return true;
  if (userId && (n.assignedPersonId === userId || n.assignedToPersonId === userId || n.raisedById === userId)) {
    return true;
  }
  if (
    nameMatches(name, n.assignedTo) ||
    nameMatches(name, n.assignedToPersonName) ||
    nameMatches(name, n.assignedToName) ||
    nameMatches(name, n.targetName)
  ) {
    return true;
  }
  const taskTypes = [
    'task_assigned', 'task_completed', 'task_updated', 'task_cancelled',
    'task_deleted', 'task_overdue', 'task_reopened', 'delete_requested',
  ];
  if (taskTypes.includes(n.type) && (nameMatches(name, n.raisedBy) || nameMatches(name, n.raisedByName))) {
    return true;
  }
  const personalSecurity = ['permission', 'visitor', 'dc', 'tea'];
  if (personalSecurity.includes(n.type) && (
    nameMatches(name, n.alubeanToMeet) ||
    nameMatches(name, n.employeeToMeet) ||
    nameMatches(name, n.employeeName)
  )) {
    return true;
  }
  return false;
}

/**
 * MD / JMD: all module alerts unless turned off in Settings (approvals always on).
 * Everyone else: only their own tasks and requests.
 */
export function notifVisibleToUser(n, user, prefs) {
  if (!n || !user) return false;
  const appRole = user.appRole || '';
  const isRequest = n.type === 'request' || n._source === 'app_request';

  if (isBroadcastNotifRole(appRole)) {
    if (isRequest) return true;
    return notifAllowedByPrefs(n, prefs);
  }

  if (isRequest) {
    return notifIsForUser(n, getProfileMobile(user) || user.mobile, appRole);
  }
  return isPersonalNotif(n, user);
}

export function filterNotifsByPrefs(list, prefs) {
  return (list || []).filter((n) => notifAllowedByPrefs(n, prefs));
}

export function filterNotifsForUser(list, user, prefs) {
  return (list || []).filter((n) => notifVisibleToUser(n, user, prefs));
}
