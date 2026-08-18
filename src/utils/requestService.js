import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '../firebase';

/**
 * New request data lives in NEW docs under working_days_config
 * (already writable in this Firebase project).
 * Does NOT modify legacy `requests` / `notifications_u1` collections
 * or existing working_days_config docs (alubee_app_users, supplier, etc.).
 */
const COL = 'working_days_config';
const REQUESTS_DOC = 'alubee_app_request_store';
const NOTIFS_DOC = 'alubee_app_request_notif_store';

export const APP_REQUESTS_COL = `${COL}/${REQUESTS_DOC}`;
export const APP_REQUEST_NOTIFS_COL = `${COL}/${NOTIFS_DOC}`;

export function normalizeAppMobile(mobile) {
  const digits = String(mobile || '').replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
}

export function mobilesMatch(a, b) {
  const x = normalizeAppMobile(a);
  const y = normalizeAppMobile(b);
  return !!x && !!y && x === y && x.length === 10;
}

function rolesMatchForApproval(appRole, stepRole) {
  if (!appRole || !stepRole) return false;
  if (appRole === stepRole) return true;
  if (appRole === 'jmd_1' && (stepRole === 'jmd' || stepRole === 'jmd_1')) return true;
  if (appRole === 'jmd_2' && (stepRole === 'jmd' || stepRole === 'jmd_2')) return true;
  if (appRole === 'md' && stepRole === 'md') return true;
  return false;
}

/** True when this request is waiting on the logged-in user to approve. */
export function isRequestPendingForUser(req, userMobile, userAppRole) {
  if (!req || req.rejected || req.cancelled || req.deleted || req.active === false) return false;
  if (req.type === 'it') {
    const st = String(req.itStatus || 'open').toLowerCase();
    if (st !== 'open') return false;
    return mobilesMatch(req.itSupervisorMobile, userMobile) || mobilesMatch(req.nextApproverMobile, userMobile);
  }
  const flow = Array.isArray(req.flow) ? req.flow : [];
  const next = flow.find((st) => st?.role && !req.approvals?.[st.role]?.status);
  if (!next) return false;
  if (mobilesMatch(next.mobile, userMobile) || mobilesMatch(req.nextApproverMobile, userMobile)) return true;
  return rolesMatchForApproval(userAppRole, next.role);
}

export function getProfileMobile(profile) {
  if (!profile) return '';
  const fromField = normalizeAppMobile(profile.mobile);
  if (fromField.length === 10) return fromField;
  const email = String(profile.email || profile.authEmail || '').toLowerCase();
  const m = email.match(/^(\d{10})@mobile\.alubee\.com$/);
  return m ? m[1] : '';
}

function newId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function stripUndefined(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(stripUndefined);
  const out = {};
  Object.keys(obj).forEach((k) => {
    const v = obj[k];
    if (v === undefined) return;
    out[k] = typeof v === 'object' && v !== null && !(v instanceof Date) ? stripUndefined(v) : v;
  });
  return out;
}

async function readMap(docId, field) {
  try {
    const snap = await getDoc(doc(db, COL, docId));
    if (!snap.exists()) return {};
    return snap.data()?.[field] || {};
  } catch (err) {
    console.warn('readMap failed', docId, err?.code || err?.message);
    return {};
  }
}

/** Atomic single-key write — does not wipe sibling map entries */
async function writeMapMerge(docId, field, id, value) {
  const ref = doc(db, COL, docId);
  let prev = {};
  try {
    const snap = await getDoc(ref);
    prev = snap.exists() ? (snap.data()?.[field]?.[id] || {}) : {};
  } catch (_) {}
  const payload = stripUndefined({ ...prev, ...value, id });
  const stamp = new Date().toISOString();
  try {
    await updateDoc(ref, {
      [`${field}.${id}`]: payload,
      updatedAt: stamp,
    });
  } catch (_) {
    // Doc missing — create, preserving any siblings we can read
    let current = {};
    try {
      const snap = await getDoc(ref);
      current = snap.exists() ? { ...(snap.data()?.[field] || {}) } : {};
    } catch (__) {}
    current[id] = payload;
    await setDoc(ref, { [field]: current, updatedAt: stamp }, { merge: true });
  }
  return id;
}

export async function createAppRequest(data) {
  const id = newId('areq');
  const record = stripUndefined({
    ...data,
    id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  await writeMapMerge(REQUESTS_DOC, 'items', id, record);
  return id;
}

export async function getAppRequest(requestId) {
  if (!requestId) return null;
  const map = await readMap(REQUESTS_DOC, 'items');
  const r = map[requestId];
  if (!r || r.deleted || r.active === false) return null;
  return r;
}

export async function updateAppRequest(requestId, updates) {
  if (!requestId) throw new Error('Request id required');
  await writeMapMerge(REQUESTS_DOC, 'items', requestId, {
    ...updates,
    id: requestId,
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteAppRequest(requestId) {
  if (!requestId) return;
  const ref = doc(db, COL, REQUESTS_DOC);
  const snap = await getDoc(ref);
  const current = snap.exists() ? (snap.data()?.items || {}) : {};
  if (!current[requestId]) return;
  // Soft-delete flag — avoids wiping sibling entries
  current[requestId] = {
    ...current[requestId],
    active: false,
    deleted: true,
    updatedAt: new Date().toISOString(),
  };
  await setDoc(ref, { items: current, updatedAt: new Date().toISOString() }, { merge: true });
}

function listFromMap(map, { employeeMobile, pendingOnly, includeDeleted } = {}) {
  let docs = Object.values(map || {}).filter(Boolean);
  if (!includeDeleted) docs = docs.filter((r) => !r.deleted && r.active !== false);
  if (employeeMobile) {
    const m = normalizeAppMobile(employeeMobile);
    docs = docs.filter((r) => normalizeAppMobile(r.employeeMobile) === m);
  }
  if (pendingOnly) {
    docs = docs.filter((r) => r.rejected !== true);
  }
  docs.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  return docs;
}

export function subscribeAppRequests(callback, { employeeMobile, pendingOnly } = {}) {
  return onSnapshot(
    doc(db, COL, REQUESTS_DOC),
    (snap) => {
      const map = snap.exists() ? snap.data()?.items || {} : {};
      callback(listFromMap(map, { employeeMobile, pendingOnly }));
    },
    (err) => {
      console.warn('subscribeAppRequests failed', err?.code || err?.message);
      callback([]);
    }
  );
}

/** One-shot list of app requests (for leave month totals, etc.) */
export async function listAppRequests({ employeeMobile, pendingOnly, includeDeleted } = {}) {
  const map = await readMap(REQUESTS_DOC, 'items');
  return listFromMap(map, { employeeMobile, pendingOnly, includeDeleted });
}

/** True when this notification is meant for the logged-in user (mobile or role). */
export function notifIsForUser(n, userMobile, userAppRole) {
  if (!n) return false;
  if (mobilesMatch(n.targetMobile, userMobile) || mobilesMatch(n.nextApproverMobile, userMobile)) {
    return true;
  }
  const role = String(userAppRole || '');
  const targetRole = String(n.targetRole || '');
  if (!targetRole || !role) return false;
  if (targetRole === role) return true;
  if (targetRole === 'jmd' && (role === 'jmd_1' || role === 'jmd_2')) return true;
  return false;
}

export async function createAppRequestNotification(data) {
  const id = newId('anot');
  const targetMobile = normalizeAppMobile(data.targetMobile);
  if (!targetMobile && !data.targetRole) {
    console.error('createAppRequestNotification: missing targetMobile/targetRole', data);
    throw new Error('Notification has no target (mobile/role).');
  }
  const record = stripUndefined({
    id,
    type: data.type || 'request',
    title: data.title || '',
    message: data.message || '',
    targetMobile: targetMobile || '',
    targetRole: data.targetRole || '',
    nextApproverMobile: normalizeAppMobile(data.nextApproverMobile || targetMobile) || '',
    requestId: data.requestId || null,
    pendingApproval: !!data.pendingApproval,
    requestApproved: data.requestApproved ? true : undefined,
    requestRejected: data.requestRejected ? true : undefined,
    read: false,
    createdAt: new Date().toISOString(),
  });
  await writeMapMerge(NOTIFS_DOC, 'items', id, record);
  return id;
}

export function subscribeAppRequestNotifications(callback) {
  return onSnapshot(
    doc(db, COL, NOTIFS_DOC),
    (snap) => {
      const map = snap.exists() ? snap.data()?.items || {} : {};
      const docs = Object.values(map || {})
        .filter(Boolean)
        .map((n) => ({ ...n, _source: 'app_request' }))
        .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
      callback(docs);
    },
    () => callback([])
  );
}

export async function markAppRequestNotifRead(notifId) {
  if (!notifId) return;
  await writeMapMerge(NOTIFS_DOC, 'items', notifId, { read: true, id: notifId });
}

export async function updateAppRequestNotification(notifId, updates) {
  if (!notifId) return;
  await writeMapMerge(NOTIFS_DOC, 'items', notifId, { ...updates, id: notifId });
}

/** After approve/reject, move this user's pending request notifs off the Approvals tab. */
export async function markRequestNotifsActioned(requestId, userMobile, { approved = true } = {}) {
  if (!requestId) return;
  const map = await readMap(NOTIFS_DOC, 'items');
  const entries = Object.values(map || {}).filter((n) => {
    if (!n || n.requestId !== requestId || !n.pendingApproval) return false;
    if (!userMobile) return true;
    return mobilesMatch(n.targetMobile, userMobile) || mobilesMatch(n.nextApproverMobile, userMobile);
  });
  await Promise.all(entries.map((n) => updateAppRequestNotification(n.id, {
    pendingApproval: false,
    requestActioned: true,
    requestApproved: !!approved,
    requestRejected: !approved,
    read: true,
  })));
}
