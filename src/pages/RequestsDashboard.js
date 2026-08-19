import React, { useState, useEffect, useMemo } from 'react';
import { findActiveUserByAppRole, listAppUsers } from '../utils/userService';
import { getAvailability, isApproverOnline } from '../utils/settingsService';
import { readSharedUsers } from '../utils/sharedUserStore';
import { listLocalUsers } from '../utils/localUserStore';
import {
  createAppRequest,
  updateAppRequest,
  deleteAppRequest,
  subscribeAppRequests,
  listAppRequests,
  createAppRequestNotification,
  subscribeAppRequestNotifications,
  normalizeAppMobile,
  mobilesMatch,
  getProfileMobile,
  notifIsForUser,
  markAppRequestNotifRead,
  markRequestNotifsActioned,
} from '../utils/requestService';
import ITTicketActions from '../components/ITTicketActions';
import { IT_CATEGORIES, findITSupervisor, itTicketStatus, isITSupervisorFor, isITAssignee, isITRequester } from '../utils/itRequestService';
import { approvalRolesMatch } from '../data/appRoles';

// ─── ROLE DEFINITIONS ────────────────────────────────────────────────────────
// Approval flows:
// OD / VISITOR / IT: employee → jmd → md
// LEAVE: employee → reporting → jmd → md (supervisors skip reporting)
// MAINTENANCE: via main Maintenance menu

const JMD_EMAIL = 'owner@alubee.com';
const PPC_EMAIL  = 'gopi@alubee.com';
const UDHAY_EMAIL = 'udhay@alubee.com';
const PPC_EMAILS  = ['gopi@alubee.com','udhay@alubee.com'];
const PDC_ASSIGNEES  = [{name:'Mahendhiran',email:'mahendhiran@alubee.com'},{name:'Kalaivanan',email:'kalaivanan@alubee.com'}];
const GEN_ASSIGNEES  = [{name:'Murugesh',email:'murugesh@alubee.com'},{name:'Kandhan',email:'kandhan@alubee.com'}];
const MD_EMAIL  = 'md@alubee.com';
const HR_EMAIL  = 'meena@alubee.com';

// Dept → supervisor email mapping
const DEPT_SUPERVISOR = {
  pdc:          'prabha@alubee.com',
  pdc_maint:    'mahendhiran@alubee.com',
  fettling:     'nagaraj@alubee.com',       // shift A; muniraj.fettling for B — use nagaraj as primary
  cnc_vmc:      'velayutham@alubee.com',
  secondary:    'udhay@alubee.com',
  assembly:     'vignesh@alubee.com',
  final:        'pachayappan@alubee.com',
  dispatch:     'mangundu@alubee.com',
  maintenance:  'murugesh@alubee.com',
  stores:       'agilan@alubee.com',
  toolroom:     'munusamy@alubee.com',
  design:       'anbu@alubee.com',
  npd:          'basha@alubee.com',
  ppc:          'gopi@alubee.com',
  erp:          'gokila@alubee.com',
  accounts:     'mahadesh@alubee.com',
  hr:           'meena@alubee.com',
  shotblasting: 'selva@alubee.com',
  fabrication:  'john@alubee.com',
  security:     'durai.security@alubee.com',
  te:           'jmd@alubee.com',
  mould:        'sivakumar@alubee.com',
};

const LEAVE_TYPES = ['Personal', 'Health Issue'];

function isoDateOnly(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Earliest selectable leave date = tomorrow */
function minLeaveDateISO() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 1);
  return isoDateOnly(d);
}

function inclusiveDayCount(fromISO, toISO) {
  if (!fromISO || !toISO) return 0;
  const a = new Date(`${fromISO}T00:00:00`);
  const b = new Date(`${toISO}T00:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) || b < a) return 0;
  return Math.round((b - a) / 86400000) + 1;
}

function monthKeyFromISO(iso) {
  if (!iso) return '';
  return String(iso).slice(0, 7); // YYYY-MM
}

function prevMonthKey(ym) {
  const [y, m] = String(ym).split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function datesOverlap(aFrom, aTo, bFrom, bTo) {
  if (!aFrom || !aTo || !bFrom || !bTo) return false;
  return aFrom <= bTo && bFrom <= aTo;
}

function leaveConflictsWithRange(requests, employeeMobile, fromISO, toISO) {
  const mob = normalizeAppMobile(employeeMobile);
  if (!mob || !fromISO || !toISO) return null;
  return (requests || []).find((r) => {
    if (r.type !== 'leave' || r.rejected || r.cancelled || r.deleted) return false;
    if (normalizeAppMobile(r.employeeMobile) !== mob) return false;
    const f = r.dateFrom || r.date;
    const t = r.dateTo || r.date;
    return datesOverlap(fromISO, toISO, f, t);
  }) || null;
}
function sumLeaveDaysInMonth(requests, employeeMobile, ym) {
  const mob = normalizeAppMobile(employeeMobile);
  if (!mob || !ym) return 0;
  return (requests || []).reduce((sum, r) => {
    if (r.type !== 'leave' || r.rejected || r.cancelled || r.deleted) return sum;
    if (normalizeAppMobile(r.employeeMobile) !== mob) return sum;
    const flow = normalizeFlowSteps(r.flow);
    const fullyApproved = flow.length > 0 && flow.every((s) => r.approvals?.[s.role]?.status === 'Approved');
    if (!fullyApproved) return sum;
    const from = r.dateFrom || r.date || '';
    if (monthKeyFromISO(from) !== ym) return sum;
    const days = Number(r.leaveDaysApproved ?? r.leaveDays ?? 0) || 0;
    return sum + days;
  }, 0);
}

/**
 * Leave approval:
 * - Member-Employee → Reporting to → JMD → MD
 * - Member-Supervisor → JMD → MD
 */
async function resolveReportingManager(userProfile) {
  const raw = String(userProfile?.reportingTo || '').trim();
  if (!raw) return null;

  const titleMap = {
    'jmd 1': 'jmd_1',
    'jmd1': 'jmd_1',
    'jmd 2': 'jmd_2',
    'jmd2': 'jmd_2',
    md: 'md',
    admin: 'admin',
  };
  const byTitle = titleMap[raw.toLowerCase()];
  if (byTitle) {
    const u = await findActiveUserByAppRole(byTitle === 'admin' ? 'admin' : byTitle);
    const mobile = getProfileMobile(u);
    if (!mobile) return null;
    return {
      role: byTitle === 'admin' ? 'admin' : byTitle,
      mobile,
      label: raw,
      name: u?.name || raw,
    };
  }

  const m = raw.match(/^(.*)\s*\(([^)]+)\)\s*$/);
  const namePart = (m ? m[1] : raw).trim().toLowerCase();
  const empId = (m ? String(m[2]) : '').trim().toLowerCase();

  const pool = [];
  try {
    pool.push(...(await listAppUsers()));
  } catch (_) {}
  try {
    const shared = await readSharedUsers();
    pool.push(...(shared || []));
  } catch (_) {}
  try {
    pool.push(...(listLocalUsers() || []));
  } catch (_) {}

  const hit = pool.find((u) => {
    if (!u || u.active === false) return false;
    const id = String(u.employeeId || '').trim().toLowerCase();
    const nm = String(u.employeeName || u.name || '').trim().toLowerCase();
    const label = id ? `${nm} (${id})` : nm;
    if (empId && id === empId) return true;
    if (nm && nm === namePart) return true;
    if (label === raw.toLowerCase()) return true;
    return false;
  });
  const mobile = getProfileMobile(hit);
  if (!mobile) return null;
  const role = hit.appRole || hit.role || 'reporting';
  return {
    role: role === 'member_supervisor' ? 'reporting' : (role === 'jmd_1' || role === 'jmd_2' || role === 'md' ? role : 'reporting'),
    mobile,
    label: hit.employeeName || hit.name || 'Reporting Manager',
    name: hit.employeeName || hit.name || raw,
  };
}

async function buildLeaveApprovalFlow(userProfile) {
  const appRole = userProfile?.appRole || '';
  const unit = userProfile?.unit || 'u1';
  const steps = [];

  const skipReporting =
    appRole === 'member_supervisor' ||
    appRole === 'jmd_1' ||
    appRole === 'jmd_2' ||
    appRole === 'md' ||
    appRole === 'admin';

  if (!skipReporting) {
    const mgr = await resolveReportingManager(userProfile);
    if (!mgr?.mobile) {
      throw new Error('Reporting manager is not set up for your account. Ask Admin to set "Reporting to".');
    }
    steps.push({
      role: 'reporting',
      mobile: mgr.mobile,
      label: mgr.label || 'Reporting Manager',
      name: mgr.name || '',
    });
  }

  const jmdMd = await buildOdApprovalFlow(unit);
  for (const s of jmdMd) {
    if (steps.some((x) => mobilesMatch(x.mobile, s.mobile))) continue;
    steps.push(s);
  }
  if (!steps.length) throw new Error('Leave approval path could not be built.');
  return steps;
}

function getLeaveFlow(dept, avail) {
  // Legacy fallback only (email-era). Prefer stored mobile flow.
  const jmdOnline = avail?.jmd !== 'Offline';
  const mdOnline  = avail?.md  !== 'Offline';
  const steps = [];
  if (jmdOnline) steps.push({ role:'jmd', email: JMD_EMAIL, label:'JMD' });
  if (mdOnline)  steps.push({ role:'md',  email: MD_EMAIL,  label:'MD'  });
  return steps;
}

const OD_TIME_OPTIONS = ['15 Mins', '30 Mins', '1 Hour', '2 Hour', '3 Hour', '>3 Hour'];
const OD_OTHER_DESTINATIONS = ['Supplier Place', 'Bangalore', 'MD Home', 'Hosur Town'];
const COMPANY_VEHICLES = [
  '0011-THAR (V015)',
  '0993-TVS XL (V005)',
  '1111-BENZ (V014)',
  '1473-TVS XL (V003)',
  '1666-SANTA FE (V013)',
  '2004-SANTRO (V012)',
  '2568-DOST (V011)',
  '3103-ACCESS (V007)',
  '3271-DOST (V010)',
  '6465-IGNIS (V017)',
  '7346-TVS XL (V002)',
  '7997-BREZZA (V016)',
  '9376-WEGO (V004)',
];

function getOdVisitingOptions(userUnit) {
  const unit = userUnit === 'u2' || userUnit === 'Unit II' ? 'u2' : 'u1';
  const oppositeUnit = unit === 'u1' ? 'Unit II' : 'Unit I';
  return [oppositeUnit, ...OD_OTHER_DESTINATIONS];
}

const VISITOR_TYPES = ['Supplier','Customer','Contractor','Government Official','Auditor','Personal','Other'];

function getODFlow(avail) {
  const jmdOnline = avail?.jmd !== 'Offline';
  const mdOnline  = avail?.md  !== 'Offline';
  const steps = [];
  if (jmdOnline) steps.push({ role:'jmd', email: JMD_EMAIL, label:'JMD' });
  if (mdOnline)  steps.push({ role:'md',  email: MD_EMAIL,  label:'MD'  });
  return steps; // empty = auto-approve if both offline
}

function getVisitorFlow(avail) {
  const jmdOnline = avail?.jmd !== 'Offline';
  const mdOnline  = avail?.md  !== 'Offline';
  const steps = [];
  if (jmdOnline) steps.push({ role:'jmd', email: JMD_EMAIL, label:'JMD' });
  if (mdOnline)  steps.push({ role:'md',  email: MD_EMAIL,  label:'MD'  });
  return steps;
}

/** Normalize stored flow into step objects (mobile-first) */
function normalizeFlowSteps(flow) {
  if (!Array.isArray(flow) || flow.length === 0) return [];
  return flow.map((step) => {
    if (typeof step === 'object' && step?.role) {
      return {
        role: step.role,
        mobile: normalizeAppMobile(step.mobile || ''),
        email: String(step.email || '').toLowerCase(),
        label: step.label || step.role,
        name: step.name || '',
      };
    }
    return { role: String(step), mobile: '', email: '', label: String(step) };
  });
}

/**
 * Shared OD / Visitor approval: Unit I → JMD 1 → MD | Unit II → JMD 2 → MD
 * Approvers identified by Admin Panel mobile number only (no hardcoded emails).
 */
async function buildOdApprovalFlow(unit) {
  const jmdRole = unit === 'u2' ? 'jmd_2' : 'jmd_1';
  const jmdLabel = unit === 'u2' ? 'JMD 2' : 'JMD 1';
  const jmdUser = await findActiveUserByAppRole(jmdRole);
  const mdUser = await findActiveUserByAppRole('md');
  const jmdMobile = getProfileMobile(jmdUser);
  const mdMobile = getProfileMobile(mdUser);
  const avail = await getAvailability();
  const steps = [];
  if (isApproverOnline(jmdRole, avail)) {
    if (!jmdMobile) {
      throw new Error(`${jmdLabel} is not set up yet. Create a user with role ${jmdLabel} and mobile in Admin Panel.`);
    }
    steps.push({ role: jmdRole, mobile: jmdMobile, label: jmdLabel, name: jmdUser?.name || jmdLabel });
  }
  if (isApproverOnline('md', avail)) {
    if (!mdMobile) {
      throw new Error('MD is not set up yet. Create a user with role MD and mobile in Admin Panel.');
    }
    steps.push({ role: 'md', mobile: mdMobile, label: 'MD', name: mdUser?.name || 'MD' });
  }
  if (!steps.length) {
    throw new Error('Approvers are unavailable. JMD and MD cannot both be offline.');
  }
  return steps;
}

const buildVisitorApprovalFlow = buildOdApprovalFlow;

/** @deprecated kept for legacy leave/visitor fallbacks only — prefer mobile */
function getProfileEmail(userProfile) {
  if (!userProfile) return '';
  if (userProfile.email) return String(userProfile.email).toLowerCase();
  if (userProfile.authEmail) return String(userProfile.authEmail).toLowerCase();
  const mobile = getProfileMobile(userProfile);
  if (mobile) return `${mobile}@mobile.alubee.com`;
  return '';
}

const REQUEST_TYPE_META = {
  od:          { icon: '🚗', label: 'OD' },
  visitor:     { icon: '👤', label: 'Visitor' },
  maintenance: { icon: '🛠', label: 'Maintenance' },
  it:          { icon: '💻', label: 'IT' },
  leave:       { icon: '🌴', label: 'Leave' },
  machine_maintenance: { icon: '🔧', label: 'Machine Maint.' },
  pdc_maintenance: { icon: '🔧', label: 'PDC Maint.' },
  general_maintenance: { icon: '🛠', label: 'Gen. Maint.' },
};

function getNextApprover(flow, approvals) {
  for (const step of flow) {
    if (!approvals?.[step.role]?.status) return step;
  }
  return null; // all approved
}

function getOverallStatus(flow, approvals, rejected, req) {
  if (req?.type === 'it') return itTicketStatus(req);
  if (req?.cancelled) return 'Cancelled';
  if (rejected) return 'Rejected';
  if (req?.noApproval) return 'Submitted';
  const next = getNextApprover(flow, approvals);
  if (!next) return 'Approved';
  return 'Pending';
}

function emailsMatch(a, b) {
  return !!a && !!b && String(a).toLowerCase() === String(b).toLowerCase();
}

function rolesMatch(appRole, stepRole, reqUnit) {
  return approvalRolesMatch(appRole, stepRole, reqUnit);
}

/** True when this logged-in user must Approve/Reject now (mobile-first) */
function isUsersTurn(req, userMobile, appRole, userEmail) {
  if (!req || req.rejected || req.cancelled) return false;
  if (req.type === 'it') return false;
  const flow = normalizeFlowSteps(req.flow);
  if (!flow.length) {
    return mobilesMatch(req.nextApproverMobile, userMobile) || emailsMatch(req.nextApproverEmail, userEmail);
  }
  const next = getNextApprover(flow, req.approvals);
  if (!next) return false;
  if (mobilesMatch(next.mobile, userMobile)) return true;
  if (mobilesMatch(req.nextApproverMobile, userMobile)) return true;
  if (rolesMatch(appRole, next.role, req.unit)) return true;
  if (emailsMatch(next.email, userEmail)) return true;
  if (emailsMatch(req.nextApproverEmail, userEmail)) return true;
  return false;
}

/**
 * Apply approve/reject. Approvers keyed by mobile on flow steps.
 */
function buildApprovalUpdate(req, userMobile, appRole, action, rejectReason = '', userEmail = '') {
  const steps = normalizeFlowSteps(req.flow);
  const next = getNextApprover(steps, req.approvals);
  const myStep =
    steps.find((s) => mobilesMatch(s.mobile, userMobile)) ||
    steps.find((s) => rolesMatch(appRole, s.role, req.unit)) ||
    steps.find((s) => emailsMatch(s.email, userEmail)) ||
    next;
  const stepRole = myStep?.role || appRole || 'jmd_1';

  const updApprovals = {
    ...(req.approvals || {}),
    [stepRole]: {
      status: action === 'approve' ? 'Approved' : 'Rejected',
      byMobile: normalizeAppMobile(userMobile),
      by: userEmail || userMobile,
      at: new Date().toISOString(),
      reason: rejectReason || '',
      label: myStep?.label || stepRole,
    },
  };

  let nextMobile = null;
  let nextLabel = null;
  let nextRole = null;
  if (action === 'approve') {
    for (const step of steps) {
      if (!updApprovals[step.role]?.status) {
        nextMobile = step.mobile || null;
        nextLabel = step.label || step.role;
        nextRole = step.role || null;
        break;
      }
    }
  }

  return {
    updates: {
      approvals: updApprovals,
      nextApproverMobile: action === 'reject' ? null : nextMobile,
      nextApproverEmail: null,
      rejected: action === 'reject',
      rejectionReason: action === 'reject' ? rejectReason : (req.rejectionReason || ''),
    },
    nextMobile,
    nextLabel,
    nextRole,
    fullyDone: action === 'approve' && !nextMobile,
    employeeMobile: normalizeAppMobile(req.employeeMobile || req.mobile),
    stepRole,
  };
}

function myStepLabel(req, userMobile, appRole, userEmail) {
  const steps = normalizeFlowSteps(req?.flow);
  const step =
    steps.find((s) => mobilesMatch(s.mobile, userMobile)) ||
    steps.find((s) => rolesMatch(appRole, s.role, req.unit)) ||
    steps.find((s) => emailsMatch(s.email, userEmail));
  return step?.label || appRole || 'Approver';
}

// ─── COLOURS ─────────────────────────────────────────────────────────────────
const STATUS_STYLE = {
  Pending:   { bg:'#fffbeb', border:'#fde68a', color:'#b45309', label:'⏳ Pending' },
  Submitted: { bg:'#eff6ff', border:'#93c5fd', color:'#1d4ed8', label:'📋 Submitted' },
  Approved:  { bg:'#f0fdf4', border:'#86efac', color:'#15803d', label:'✅ Approved' },
  Rejected:  { bg:'#fef2f2', border:'#fca5a5', color:'#dc2626', label:'❌ Rejected' },
  Cancelled: { bg:'#f3f4f6', border:'#d1d5db', color:'#6b7280', label:'🚫 Cancelled' },
  Open:      { bg:'#fffbeb', border:'#fde68a', color:'#b45309', label:'⏳ Open' },
  Assigned:  { bg:'#eff6ff', border:'#93c5fd', color:'#1d4ed8', label:'👤 Assigned' },
  Resolved:  { bg:'#f0fdfa', border:'#99f6e4', color:'#0f766e', label:'🛠 Resolved' },
  Closed:    { bg:'#f0fdf4', border:'#86efac', color:'#15803d', label:'✅ Closed' },
};

// ─── FLOW TRACKER VISUAL ─────────────────────────────────────────────────────
function FlowTracker({ flow, approvals, rejected }) {
  return (
    <div style={{display:'flex',alignItems:'center',gap:0,marginTop:10,flexWrap:'wrap',gap:4}}>
      {flow.map((step, i) => {
        const a = approvals?.[step.role];
        const isApproved = a?.status === 'Approved';
        const isRejected = a?.status === 'Rejected' || (rejected && !a);
        const isPending  = !isApproved && !isRejected;
        const isNext     = !isApproved && !isRejected && getNextApprover(flow, approvals)?.role === step.role && !rejected;
        return (
          <React.Fragment key={step.role}>
            {i > 0 && <div style={{width:20,height:2,background:isApproved?'#16a34a':'#e5e7eb',flexShrink:0}}/>}
            <div style={{
              display:'flex',flexDirection:'column',alignItems:'center',
              background: isApproved?'#f0fdf4':isRejected?'#fef2f2':isNext?'#fffbeb':'#f9fafb',
              border:`1.5px solid ${isApproved?'#86efac':isRejected?'#fca5a5':isNext?'#fde68a':'#e5e7eb'}`,
              borderRadius:8,padding:'6px 10px',minWidth:64,
            }}>
              <span style={{fontSize:14}}>{isApproved?'✅':isRejected?'❌':isNext?'⏳':'○'}</span>
              <span style={{fontSize:10,fontWeight:700,color:isApproved?'#15803d':isRejected?'#dc2626':isNext?'#b45309':'#6b7280',marginTop:2}}>{step.label}</span>
              {a?.at && <span style={{fontSize:9,color:'#9ca3af'}}>{new Date(a.at).toLocaleDateString('en-IN',{day:'numeric',month:'short'})}</span>}
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─── REQUEST CARD ─────────────────────────────────────────────────────────────
function RequestCard({ req, userEmail, userMobile, userAppRole, isAdmin, onAction, dark, userProfile }) {
  const [expanded, setExpanded] = useState(false);
  const [editDays, setEditDays] = useState(false);
  const [newDays, setNewDays] = useState(String(req.leaveDays ?? req.days ?? ''));
  const [acting, setActing] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showReject, setShowReject] = useState(false);
  const [assignedTo, setAssignedTo] = useState(req.assignedTo || '');

  const isMaintenance =
    req.type === 'pdc_maintenance' ||
    req.type === 'general_maintenance' ||
    req.type === 'machine_maintenance';
  const isPPC = PPC_EMAILS.includes(userEmail);

  const flow = req.flow
    ? normalizeFlowSteps(req.flow)
    : req.type === 'leave'
      ? getLeaveFlow(req.dept, null)
      : (req.type === 'od' || req.type === 'visitor')
        ? getODFlow(null)
        : getVisitorFlow(null);

  const overallStatus = getOverallStatus(flow, req.approvals, req.rejected, req);
  const isMyTurn = isUsersTurn(req, userMobile, userAppRole, userEmail) && overallStatus === 'Pending';
  const itNeedsMe = req.type === 'it' && (
    (overallStatus === 'Open' && isITSupervisorFor(req, userMobile, userProfile)) ||
    (overallStatus === 'Assigned' && isITAssignee(req, userMobile)) ||
    (overallStatus === 'Resolved' && isITRequester(req, userMobile))
  );
  const isJMD = ['jmd', 'jmd_1', 'jmd_2'].includes(userAppRole);

  const requestedDays = Number(req.leaveDaysRequested ?? req.originalLeaveDays ?? req.leaveDays ?? 0) || 0;
  const currentLeaveDays = Number(req.leaveDays ?? requestedDays) || 0;
  const maxReducible = Math.max(1, currentLeaveDays);

  const ss = STATUS_STYLE[overallStatus] || STATUS_STYLE.Pending;

  const typeMeta = REQUEST_TYPE_META[req.type] || { icon: '📋', label: req.type };
  const typeIcon = typeMeta.icon;
  const typeLabel = typeMeta.label;

  async function act(action) {
    if (action === 'reject' && !rejectReason.trim()) return alert('Please enter a rejection reason');
    if (action === 'approve' && isMaintenance && isPPC && !assignedTo) return alert('Please assign the request to a maintenance person before approving');
    setActing(true);
    try {
      const { updates, nextMobile, nextLabel, nextRole, fullyDone, employeeMobile } = buildApprovalUpdate(
        req,
        userMobile,
        userAppRole,
        action,
        rejectReason,
        userEmail
      );
      if (isMaintenance && isPPC && assignedTo) updates.assignedTo = assignedTo;
      if (req.type === 'leave' && action === 'approve') {
        const typed = parseFloat(newDays);
        if (Number.isNaN(typed) || typed < 1) {
          setActing(false);
          return alert('Leave days must be at least 1');
        }
        if (typed > currentLeaveDays) {
          setActing(false);
          return alert(`Cannot increase days. Maximum allowed now is ${currentLeaveDays} (already reduced if a prior approver cut it).`);
        }
        const reduced = Math.max(1, Math.min(currentLeaveDays, typed));
        const requested = requestedDays || currentLeaveDays;
        updates.leaveDays = reduced;
        updates.leaveDaysRequested = requested;
        if (reduced < currentLeaveDays) {
          const changes = Array.isArray(req.leaveDayChanges) ? [...req.leaveDayChanges] : [];
          changes.push({
            from: currentLeaveDays,
            to: reduced,
            byMobile: normalizeAppMobile(userMobile),
            byRole: userAppRole || '',
            byLabel: myStepLabel(req, userMobile, userAppRole, userEmail),
            at: new Date().toISOString(),
          });
          updates.leaveDayChanges = changes;
          updates.daysReduced = true;
        }
        if (fullyDone) {
          updates.leaveDaysApproved = reduced;
        }
      }
      await updateAppRequest(req.id, updates);
      await markRequestNotifsActioned(req.id, userMobile, { approved: action === 'approve' }).catch(() => {});

      const typeLabel =
        req.type === 'leave' ? 'Leave' :
        req.type === 'od' ? 'OD' :
        req.type === 'visitor' ? 'Visitor' :
        req.type === 'machine_maintenance' ? 'Machine Maintenance' :
        req.type === 'pdc_maintenance' ? 'PDC Maintenance' :
        req.type === 'general_maintenance' ? 'General Maintenance' :
        (req.type || 'Request');

      const leaveDaysNow = req.type === 'leave'
        ? (Math.max(1, Math.min(currentLeaveDays, parseFloat(newDays) || currentLeaveDays)))
        : null;
      const leaveReducedNote = req.type === 'leave' && leaveDaysNow != null && leaveDaysNow < currentLeaveDays
        ? ` Leave reduced from ${currentLeaveDays} to ${leaveDaysNow} day(s).`
        : '';

      if (action === 'reject') {
        await createAppRequestNotification({
          type: 'request',
          title: `❌ ${typeLabel} Rejected`,
          message: `Your ${typeLabel} request was rejected. Reason: ${rejectReason}`,
          targetMobile: employeeMobile,
          requestId: req.id,
          pendingApproval: false,
          requestRejected: true,
        });
      } else if (nextMobile) {
        await createAppRequestNotification({
          type: 'request',
          title: `📝 ${typeLabel} — Action Required (${nextLabel || 'Approver'})`,
          message: `${req.employeeName}'s ${typeLabel} was approved${leaveReducedNote ? ' —' + leaveReducedNote : ' and'} needs your approval.`,
          targetMobile: nextMobile,
          targetRole: nextRole || '',
          nextApproverMobile: nextMobile,
          requestId: req.id,
          pendingApproval: true,
        });
      } else if (fullyDone) {
        await createAppRequestNotification({
          type: 'request',
          title: `✅ ${typeLabel} Fully Approved`,
          message: req.type === 'leave'
            ? `Your Leave request is fully approved for ${leaveDaysNow} day(s)${leaveDaysNow < requestedDays ? ` (requested ${requestedDays})` : ''}.`
            : `Your ${typeLabel} request has been fully approved.`,
          targetMobile: employeeMobile,
          requestId: req.id,
          pendingApproval: false,
          requestApproved: true,
        });
      }

      onAction && onAction();
    } catch (e) {
      alert('Action failed: ' + e.message);
    } finally {
      setActing(false);
      setShowReject(false);
    }
  }

  return (
    <div style={{background:'var(--bg-raised)',borderRadius:12,border:`1.5px solid ${isMyTurn?'#fde68a':ss.border}`,marginBottom:12,overflow:'hidden',boxShadow:isMyTurn?'0 0 0 2px #fde68a33':'0 1px 4px rgba(0,0,0,0.08)'}}>
      {/* Header */}
      <div onClick={()=>setExpanded(e=>!e)} style={{padding:'12px 16px',cursor:'pointer',display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:8}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4,flexWrap:'wrap'}}>
            <span style={{fontSize:13}}>{typeIcon}</span>
            <span style={{fontWeight:800,fontSize:13,color:'var(--text-primary)'}}>{typeLabel} — {req.employeeName}</span>
            {isMyTurn && <span style={{background:'#fef3c7',color:'#b45309',borderRadius:6,padding:'2px 8px',fontSize:10,fontWeight:800}}>⚡ Action Required</span>}
            {itNeedsMe && <span style={{background:'#dbeafe',color:'#1d4ed8',borderRadius:6,padding:'2px 8px',fontSize:10,fontWeight:800}}>⚡ Action Required</span>}
          </div>
          <div style={{fontSize:11,color:'var(--text-secondary)'}}>
            {req.dept?.toUpperCase()} · {req.date}
            {req.type === 'leave' && <> · <strong>{req.leaveDays} day{Number(req.leaveDays) !== 1 ? 's' : ''}</strong>{req.leaveDaysRequested && Number(req.leaveDays) !== Number(req.leaveDaysRequested) ? ` (of ${req.leaveDaysRequested})` : ''} · {req.leaveType} · {req.dateFrom || req.date}{req.dateTo && req.dateTo !== (req.dateFrom || req.date) ? ` → ${req.dateTo}` : ''}</>}
            {req.type === 'od'    && <> · {req.visitingTo} · {req.purpose} · {req.timeRequired}{req.companyVehicle && req.vehicle ? ` · ${req.vehicle}` : ''}</>}
            {req.type === 'visitor' && <> · {req.visitorName} ({req.visitorType})</>}
            {req.type === 'it' && <> · {req.category}{req.assignedToName ? ` · ${req.assignedToName}` : ''}</>}
            {req.type === 'machine_maintenance' && <> · {req.machineTypeLabel || req.machineType} · {req.machineNumber} · {req.problemType}{req.lineStop ? ' · Line Stop' : ''}</>}
            {req.type === 'pdc_maintenance' && <> · {req.machine} · {req.problemType}</>}
            {req.type === 'general_maintenance' && <> · {req.unitLabel || (req.unit === 'u2' ? 'Unit II' : 'Unit I')} · {req.department} · {req.problemType}</>}
          </div>
        </div>
        <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:4,flexShrink:0}}>
          <span style={{background:ss.bg,color:ss.color,border:`1px solid ${ss.border}`,borderRadius:6,padding:'2px 8px',fontSize:10,fontWeight:800,whiteSpace:'nowrap'}}>{ss.label}</span>
          <div style={{display:'flex',gap:4,alignItems:'center',marginTop:2}}>
            {((overallStatus === 'Pending' || overallStatus === 'Approved' || overallStatus === 'Open' || overallStatus === 'Assigned') && !req.securityOutTime && !req.securityInTime && (mobilesMatch(req.employeeMobile, userMobile) || emailsMatch(req.employeeEmail, userEmail))) && (
              <button onClick={async(e)=>{
                e.stopPropagation();
                if(!window.confirm('Cancel this request? You can raise a new one after cancelling.')) return;
                try {
                  await updateAppRequest(req.id, {
                    cancelled: true,
                    cancelledAt: new Date().toISOString(),
                    cancelledBy: userEmail || userMobile,
                    nextApproverMobile: null,
                  });
                  const next = getNextApprover(flow, req.approvals);
                  if (next?.mobile) {
                    await createAppRequestNotification({
                      type: 'request',
                      title: `🚫 ${typeLabel} cancelled`,
                      message: `${req.employeeName} cancelled their ${typeLabel} request.`,
                      targetMobile: next.mobile,
                      targetRole: next.role || '',
                      requestId: req.id,
                      pendingApproval: false,
                    });
                  }
                } catch(err){ alert(err.message); }
              }} style={{background:'#fff7ed',border:'1px solid #fdba74',borderRadius:5,padding:'2px 7px',color:'#c2410c',fontSize:10,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>Cancel</button>
            )}
            {userAppRole === 'admin' && req.type !== 'leave' && (
              <button onClick={async(e)=>{
                e.stopPropagation();
                if(!window.confirm('Delete this request? Admin only.')) return;
                try {
                  await deleteAppRequest(req.id);
                } catch(err){ alert(err.message); }
              }} style={{background:'#fef2f2',border:'1px solid #fca5a5',borderRadius:5,padding:'2px 7px',color:'#dc2626',fontSize:10,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>🗑</button>
            )}
            <span style={{fontSize:9,color:'var(--text-secondary)'}}>{expanded?'▲':'▼'}</span>
          </div>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{padding:'0 16px 14px',borderTop:'1px solid var(--border-subtle)'}}>
          {/* Full details */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginTop:12,marginBottom:10}}>
            <Detail label="Employee" value={req.employeeName}/>
            <Detail label="Department" value={req.dept?.toUpperCase()}/>
            {req.type === 'leave' && <>
              <Detail label="Leave Type" value={req.leaveType}/>
              <Detail label="Days Requested" value={String(req.leaveDaysRequested ?? req.leaveDays ?? '—')}/>
              <Detail
                label={overallStatus === 'Approved' ? 'Days Approved' : 'Days (current)'}
                value={`${req.leaveDaysApproved ?? req.leaveDays ?? '—'}${req.daysReduced ? ' (reduced)' : ''}`}
                highlight={!!req.daysReduced}
              />
              <Detail label="From" value={req.dateFrom || req.date}/>
              <Detail label="To" value={req.dateTo || req.date}/>
              <Detail label="Description" value={req.reason || req.description} full/>
              {req.leavesThisMonth != null && <Detail label="Leaves This Month" value={req.leavesThisMonth}/>}
              {req.leavesLastMonth  != null && <Detail label="Leaves Prev Month" value={req.leavesLastMonth}/>}
              {Array.isArray(req.leaveDayChanges) && req.leaveDayChanges.length > 0 && (
                <Detail
                  label="Day reductions"
                  full
                  highlight
                  value={req.leaveDayChanges.map((c) => `${c.from} → ${c.to} by ${c.byLabel || 'Approver'}`).join(' · ')}
                />
              )}
            </>}
            {req.type === 'od' && <>
              <Detail label="Visiting To"    value={req.visitingTo}/>
              <Detail label="Purpose"        value={req.purpose}/>
              <Detail label="Time Required"  value={req.timeRequired}/>
              <Detail label="Company Vehicle" value={req.companyVehicle ? 'Yes' : 'No'}/>
              {req.companyVehicle && <Detail label="Vehicle" value={req.vehicle} full/>}
              {req.date && <Detail label="Date" value={req.date}/>}
              {req.details && <Detail label="Details" value={req.details} full/>}
              {req.remarks && <Detail label="Remarks" value={req.remarks} full/>}
            </>}
            {req.type === 'visitor' && <>
              <Detail label="Visitor Name"   value={req.visitorName}/>
              <Detail label="Visitor Type"   value={req.visitorType}/>
              <Detail label="Purpose"        value={req.purpose}/>
              <Detail label="Coming From"    value={req.comingFrom}/>
              <Detail label="No. of People"  value={req.noOfPeople}/>
              <Detail label="Mobile"         value={req.mobileNumber}/>
              <Detail label="Date"           value={req.date}/>
            </>}
            {req.type === 'it' && <>
              <Detail label="Category" value={req.category}/>
              <Detail label="Issue" value={req.issue || req.description} full/>
              <Detail label="Assigned to" value={req.assignedToName}/>
              {req.resolveNote && <Detail label="Resolve note" value={req.resolveNote} full/>}
              {req.closedByName && <Detail label="Closed by" value={req.closedByName}/>}
            </>}
            {req.type === 'machine_maintenance' && <>
              <Detail label="Machine Type"   value={req.machineTypeLabel || req.machineType}/>
              <Detail label="Machine No."    value={req.machineNumber}/>
              {req.issueGroup && <Detail label="Equipment" value={req.issueGroup}/>}
              <Detail label="Issue"          value={req.problemType}/>
              <Detail label="Line Stop"      value={req.lineStop ? 'Yes' : 'No'}/>
              <Detail label="Priority"       value={req.priority}/>
              <Detail label="Description"    value={req.description} full/>
            </>}
            {req.type === 'pdc_maintenance' && <>
              <Detail label="Machine"        value={req.machine}/>
              <Detail label="Problem Type"   value={req.problemType}/>
              <Detail label="Priority"       value={req.priority?.split('—')[0]?.trim()}/>
              <Detail label="Description"    value={req.description} full/>
              {req.location&&<Detail label="Location" value={req.location}/>}
              {req.assignedTo&&<Detail label="Assigned To" value={req.assignedTo.split('|')[0]}/>}
            </>}
            {req.type === 'general_maintenance' && <>
              <Detail label="Unit"           value={req.unitLabel || (req.unit === 'u2' ? 'Unit II' : 'Unit I')}/>
              <Detail label="Department"     value={req.department}/>
              <Detail label="Problem Type"   value={req.problemType}/>
              <Detail label="Priority"       value={req.priority}/>
              <Detail label="Description"    value={req.description} full/>
              {req.location&&<Detail label="Location" value={req.location}/>}
              {req.assignedTo&&<Detail label="Assigned To" value={req.assignedTo.split('|')[0]}/>}
            </>}
            {req.remarks && <Detail label="Remarks" value={req.remarks} full/>}
          </div>

          {/* Flow tracker */}
          {req.type !== 'it' && !req.noApproval && flow.length > 0 && (
            <FlowTracker flow={flow} approvals={req.approvals} rejected={req.rejected}/>
          )}
          {req.noApproval && (
            <div style={{marginTop:8,fontSize:11,color:'#6b7280',fontWeight:600}}>No approval required — logged as submitted</div>
          )}

          {/* Assigned to display */}
          {req.assignedTo && (
            <div style={{marginTop:8,background:'#eff6ff',borderRadius:8,padding:'8px 12px',fontSize:12,color:'#1e40af',fontWeight:700}}>
              👷 Assigned to: {req.assignedTo.split('|')[0]}
            </div>
          )}

          {/* PPC: assignee picker for maintenance */}
          {isMyTurn && isMaintenance && isPPC && (
            <div style={{marginTop:10,background:'#fffbeb',borderRadius:8,padding:'10px 12px',border:'1px solid #fde68a'}}>
              <div style={{fontSize:11,fontWeight:700,color:'#b45309',textTransform:'uppercase',marginBottom:6}}>
                Assign to *
              </div>
              <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                {(req.type==='pdc_maintenance' ? PDC_ASSIGNEES : GEN_ASSIGNEES).map(a=>(
                  <label key={a.email} style={{display:'flex',alignItems:'center',gap:6,cursor:'pointer',background:assignedTo===a.name+'|'+a.email?'#fef3c7':'#fff',border:'1.5px solid '+(assignedTo===a.name+'|'+a.email?'#f59e0b':'#d1d5db'),borderRadius:8,padding:'8px 14px',fontWeight:700,fontSize:13}}>
                    <input type="radio" name="assignee" checked={assignedTo===a.name+'|'+a.email} onChange={()=>setAssignedTo(a.name+'|'+a.email)} style={{accentColor:'#f59e0b'}}/>
                    {a.name}
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Approver: reduce leave days (min 1, max current) */}
          {req.type === 'leave' && isMyTurn && (
            <div style={{marginTop:10,background:'#eff6ff',borderRadius:8,padding:'10px 12px',border:'1px solid #bfdbfe'}}>
              <div style={{fontSize:11,fontWeight:700,color:'#1e40af',textTransform:'uppercase',marginBottom:6}}>
                Approve days (can reduce, min 1)
              </div>
              <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                <span style={{fontSize:12,color:'#6b7280'}}>Requested {requestedDays} · Current {currentLeaveDays} →</span>
                <input
                  type="number"
                  min={1}
                  max={maxReducible}
                  step={1}
                  value={newDays}
                  onChange={(e) => {
                    const v = e.target.value;
                    const n = parseFloat(v);
                    if (v === '') { setNewDays(v); return; }
                    if (!Number.isNaN(n) && n > currentLeaveDays) {
                      setNewDays(String(currentLeaveDays));
                      return;
                    }
                    setNewDays(v);
                  }}
                  style={{width:72,padding:'6px 8px',borderRadius:7,border:'1.5px solid #bfdbfe',fontSize:14,fontWeight:800,textAlign:'center',color:'#1e40af',background:'#fff'}}
                />
                <span style={{fontSize:11,color:'#6b7280'}}>day(s)</span>
              </div>
              {Array.isArray(req.leaveDayChanges) && req.leaveDayChanges.length > 0 && (
                <div style={{marginTop:8,fontSize:11,color:'#b45309',fontWeight:700}}>
                  Reduced by prior approver: {req.leaveDayChanges.map((c) => `${c.byLabel || 'Approver'} ${c.from}→${c.to}`).join(' · ')}. You may reduce further (not increase).
                </div>
              )}
            </div>
          )}

          {req.type === 'it' && (
            <ITTicketActions req={req} userProfile={userProfile || { mobile: userMobile, appRole: userAppRole, email: userEmail, name: req.employeeName }} onDone={onAction} />
          )}

          {/* Rejection reason box */}
          {showReject && (
            <div style={{marginTop:10}}>
              <input value={rejectReason} onChange={e=>setRejectReason(e.target.value)}
                placeholder="Rejection reason (required)"
                style={{width:'100%',padding:'9px 12px',borderRadius:8,border:'1.5px solid #fca5a5',fontSize:13,boxSizing:'border-box',background:'#fff',color:'#111'}}/>
            </div>
          )}

          {/* Action buttons */}
          {isMyTurn && overallStatus === 'Pending' && (
            <div style={{display:'flex',gap:8,marginTop:10}}>
              {!showReject
                ? <button onClick={()=>setShowReject(true)} disabled={acting}
                    style={{flex:1,padding:'9px',borderRadius:8,border:'1.5px solid #fca5a5',background:'#fef2f2',color:'#dc2626',fontWeight:800,fontSize:12,cursor:'pointer',fontFamily:'inherit'}}>
                    ❌ Reject
                  </button>
                : <button onClick={()=>act('reject')} disabled={acting}
                    style={{flex:1,padding:'9px',borderRadius:8,border:'none',background:'#dc2626',color:'#fff',fontWeight:800,fontSize:12,cursor:'pointer',fontFamily:'inherit'}}>
                    {acting?'⏳':'Confirm Reject'}
                  </button>
              }
              <button onClick={()=>act('approve')} disabled={acting}
                style={{flex:2,padding:'9px',borderRadius:8,border:'none',background:'#15803d',color:'#fff',fontWeight:800,fontSize:13,cursor:'pointer',fontFamily:'inherit'}}>
                {acting?'⏳ Approving…':'✅ Approve'}
              </button>
            </div>
          )}

          {/* Rejection reason display */}
          {req.rejected && Object.values(req.approvals||{}).find(a=>a.status==='Rejected')?.reason && (
            <div style={{marginTop:8,background:'#fef2f2',borderRadius:7,padding:'8px 10px',fontSize:11,color:'#991b1b'}}>
              ❌ Reason: {Object.values(req.approvals).find(a=>a.status==='Rejected').reason}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Detail({ label, value, full, highlight }) {
  return (
    <div style={{gridColumn:full?'1/-1':'auto',background:highlight?'#eff6ff':'var(--glass-1)',borderRadius:7,padding:'7px 10px'}}>
      <div style={{fontSize:9,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',marginBottom:2}}>{label}</div>
      <div style={{fontSize:12,fontWeight:700,color:highlight?'#1e40af':'var(--text-primary)'}}>{value||'—'}</div>
    </div>
  );
}

// ─── LEAVE REQUEST FORM ───────────────────────────────────────────────────────
function LeaveForm({ userProfile, onSubmitted, onCancel }) {
  const minDate = minLeaveDateISO();
  const [form, setForm] = useState({
    leaveType: LEAVE_TYPES[0],
    dateFrom: minDate,
    dateTo: minDate,
    reason: '',
  });
  const [monthStats, setMonthStats] = useState({ thisMonth: 0, prevMonth: 0, loading: true });
  const [existingLeaves, setExistingLeaves] = useState([]);
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const inp = {
    border: '1px solid #d1d5db',
    borderRadius: 8,
    padding: '9px 12px',
    fontSize: 13,
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
    background: '#fff',
    color: '#111',
  };

  const leaveDays = useMemo(
    () => inclusiveDayCount(form.dateFrom, form.dateTo),
    [form.dateFrom, form.dateTo]
  );

  const isSupervisor = userProfile?.appRole === 'member_supervisor';
  const pathPreview = isSupervisor
    ? (userProfile?.unit === 'u2' ? 'JMD 2 → MD' : 'JMD 1 → MD')
    : `Reporting to → ${userProfile?.unit === 'u2' ? 'JMD 2' : 'JMD 1'} → MD`;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mobile = getProfileMobile(userProfile);
        const all = await listAppRequests({ employeeMobile: mobile });
        const ym = monthKeyFromISO(isoDateOnly());
        const prev = prevMonthKey(ym);
        if (!cancelled) {
          setExistingLeaves(all.filter((r) => r.type === 'leave'));
          setMonthStats({
            thisMonth: sumLeaveDaysInMonth(all, mobile, ym),
            prevMonth: sumLeaveDaysInMonth(all, mobile, prev),
            loading: false,
          });
        }
      } catch (_) {
        if (!cancelled) setMonthStats({ thisMonth: 0, prevMonth: 0, loading: false });
      }
    })();
    return () => { cancelled = true; };
  }, [userProfile]);

  function onFromChange(v) {
    setForm((f) => {
      const dateFrom = v < minDate ? minDate : v;
      const dateTo = f.dateTo < dateFrom ? dateFrom : f.dateTo;
      return { ...f, dateFrom, dateTo };
    });
  }

  function onToChange(v) {
    setForm((f) => {
      const dateTo = v < f.dateFrom ? f.dateFrom : v;
      return { ...f, dateTo };
    });
  }

  async function submit() {
    if (!form.dateFrom || !form.dateTo) return alert('Leave From and To dates are required');
    if (form.dateFrom < minDate) return alert('Cannot raise leave for today or past dates. Choose tomorrow or later.');
    if (form.dateTo < form.dateFrom) return alert('To date cannot be before From date');
    if (!leaveDays || leaveDays < 1) return alert('Invalid leave duration');
    if (!form.leaveType) return alert('Leave type is required');
    if (!form.reason.trim()) return alert('Description is required');

    const employeeMobile = getProfileMobile(userProfile);
    const clash = leaveConflictsWithRange(existingLeaves, employeeMobile, form.dateFrom, form.dateTo);
    if (clash) {
      const f = clash.dateFrom || clash.date;
      const t = clash.dateTo || clash.date;
      return alert(`Leave already exists for overlapping dates (${f} → ${t}) and is ${clash.cancelled ? 'cancelled' : 'pending or approved'}. Cancel that request first if you need a new one.`);
    }

    setSaving(true);
    try {
      const flowSteps = await buildLeaveApprovalFlow(userProfile);
      if (!employeeMobile) throw new Error('Your account has no mobile number. Contact Admin.');

      const requestId = await createAppRequest({
        type: 'leave',
        employeeMobile,
        employeeEmail: getProfileEmail(userProfile) || '',
        employeeName: userProfile?.name || userProfile?.employeeName || employeeMobile,
        dept: userProfile?.dept || userProfile?.department || '',
        unit: userProfile?.unit || '',
        reportingTo: userProfile?.reportingTo || '',
        leaveType: form.leaveType,
        leaveDays,
        leaveDaysRequested: leaveDays,
        leaveDaysApproved: null,
        dateFrom: form.dateFrom,
        dateTo: form.dateTo,
        date: form.dateFrom,
        reason: form.reason.trim(),
        description: form.reason.trim(),
        leavesThisMonth: monthStats.thisMonth,
        leavesLastMonth: monthStats.prevMonth,
        leaveDayChanges: [],
        daysReduced: false,
        approvals: {},
        rejected: false,
        flow: flowSteps,
        nextApproverMobile: flowSteps[0].mobile,
        autoApproved: false,
      });

      await createAppRequestNotification({
        type: 'request',
        title: `🌴 Leave Request — ${userProfile?.name || userProfile?.employeeName}`,
        message: `${leaveDays} day(s) ${form.leaveType} · ${form.dateFrom} → ${form.dateTo} | Awaiting ${flowSteps[0].label} approval`,
        targetMobile: flowSteps[0].mobile,
        targetRole: flowSteps[0].role,
        nextApproverMobile: flowSteps[0].mobile,
        requestId,
        pendingApproval: true,
      });
      onSubmitted();
    } catch (e) {
      alert('Submit failed: ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ padding: '0 0 16px' }}>
      <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--text-primary)', marginBottom: 16 }}>🌴 Leave Request</div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <div>
          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 4, display: 'block' }}>From *</label>
          <input type="date" min={minDate} style={inp} value={form.dateFrom} onChange={(e) => onFromChange(e.target.value)} />
        </div>
        <div>
          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 4, display: 'block' }}>To *</label>
          <input type="date" min={form.dateFrom || minDate} style={inp} value={form.dateTo} onChange={(e) => onToChange(e.target.value)} />
        </div>
        <div>
          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 4, display: 'block' }}>No. of Days</label>
          <input style={{ ...inp, fontWeight: 800, color: '#15803d', opacity: 0.95 }} value={leaveDays} readOnly />
        </div>
        <div>
          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 4, display: 'block' }}>Leave Type *</label>
          <select style={{ ...inp, cursor: 'pointer' }} value={form.leaveType} onChange={(e) => set('leaveType', e.target.value)}>
            {LEAVE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 4, display: 'block' }}>Description *</label>
          <input style={inp} value={form.reason} onChange={(e) => set('reason', e.target.value)} placeholder="Describe the leave" />
        </div>
        <div>
          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 4, display: 'block' }}>Leaves in current month</label>
          <input style={{ ...inp, opacity: 0.9 }} value={monthStats.loading ? '…' : monthStats.thisMonth} readOnly />
        </div>
        <div>
          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 4, display: 'block' }}>Leaves in previous month</label>
          <input style={{ ...inp, opacity: 0.9 }} value={monthStats.loading ? '…' : monthStats.prevMonth} readOnly />
        </div>
      </div>

      <div style={{ background: '#f0fdf4', borderRadius: 8, padding: '10px 12px', marginBottom: 14, border: '1px solid #86efac' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', marginBottom: 6, textTransform: 'uppercase' }}>Approval Path</div>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#15803d' }}>{pathPreview}</div>
        <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>Leave cannot start today or earlier</div>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onCancel} style={{ flex: 1, padding: '10px', borderRadius: 8, border: '1px solid #d1d5db', background: '#f9fafb', color: '#374151', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
        <button onClick={submit} disabled={saving} style={{ flex: 2, padding: '10px', borderRadius: 8, border: 'none', background: '#15803d', color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
          {saving ? '⏳ Submitting…' : '✅ Submit Leave Request'}
        </button>
      </div>
    </div>
  );
}

// ─── OD REQUEST FORM ──────────────────────────────────────────────────────────
function ODForm({ userProfile, onSubmitted, onCancel }) {
  const visitingOptions = getOdVisitingOptions(userProfile?.unit);
  const [form, setForm] = useState({
    visitingTo: visitingOptions[0] || '',
    purpose: '',
    timeRequired: OD_TIME_OPTIONS[0],
    companyVehicle: 'No',
    vehicle: '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const inp = { border: '1px solid #d1d5db', borderRadius: 8, padding: '9px 12px', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box', background: '#fff', color: '#111' };

  async function submit() {
    if (!form.visitingTo) return alert('Visiting To is required');
    if (!form.purpose.trim()) return alert('Purpose is required');
    if (!form.timeRequired) return alert('Time Required is required');
    if (form.companyVehicle === 'Yes' && !form.vehicle) return alert('Select a company vehicle');
    setSaving(true);
    try {
      const flowSteps = await buildOdApprovalFlow(userProfile?.unit);
      const today = new Date().toISOString().slice(0, 10);
      const employeeMobile = getProfileMobile(userProfile);
      if (!employeeMobile) throw new Error('Your account has no mobile number. Contact Admin.');

      const requestId = await createAppRequest({
        type: 'od',
        employeeMobile,
        employeeEmail: getProfileEmail(userProfile) || '',
        employeeName: userProfile?.name || userProfile?.employeeName || employeeMobile,
        dept: userProfile?.dept || userProfile?.department || '',
        unit: userProfile?.unit || '',
        visitingTo: form.visitingTo,
        purpose: form.purpose.trim(),
        timeRequired: form.timeRequired,
        companyVehicle: form.companyVehicle === 'Yes',
        vehicle: form.companyVehicle === 'Yes' ? form.vehicle : '',
        date: today,
        approvals: {},
        rejected: false,
        flow: flowSteps,
        nextApproverMobile: flowSteps[0].mobile,
        autoApproved: false,
      });

      await createAppRequestNotification({
        type: 'request',
        title: `🚗 OD Request — ${userProfile?.name || userProfile?.employeeName}`,
        message: `${form.visitingTo} · ${form.purpose.trim()} · ${form.timeRequired}${form.companyVehicle === 'Yes' ? ` · ${form.vehicle}` : ''} | Awaiting ${flowSteps[0].label} approval`,
        targetMobile: flowSteps[0].mobile,
        targetRole: flowSteps[0].role,
        nextApproverMobile: flowSteps[0].mobile,
        requestId,
        pendingApproval: true,
      });
      onSubmitted();
    } catch (e) {
      alert('Submit failed: ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ padding: '0 0 16px' }}>
      <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--text-primary)', marginBottom: 16 }}>🚗 On Duty Request</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <div style={{ gridColumn: '1/-1' }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 4, display: 'block' }}>Visiting To *</label>
          <select style={{ ...inp, cursor: 'pointer' }} value={form.visitingTo} onChange={e => set('visitingTo', e.target.value)}>
            {visitingOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
          </select>
        </div>
        <div style={{ gridColumn: '1/-1' }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 4, display: 'block' }}>Purpose *</label>
          <input style={inp} value={form.purpose} onChange={e => set('purpose', e.target.value)} placeholder="Enter purpose" />
        </div>
        <div style={{ gridColumn: '1/-1' }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 4, display: 'block' }}>Time Required *</label>
          <select style={{ ...inp, cursor: 'pointer' }} value={form.timeRequired} onChange={e => set('timeRequired', e.target.value)}>
            {OD_TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div style={{ gridColumn: '1/-1' }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 4, display: 'block' }}>Company Vehicle *</label>
          <div style={{ display: 'flex', gap: 10 }}>
            {['Yes', 'No'].map(opt => (
              <button
                key={opt}
                type="button"
                onClick={() => setForm(f => ({ ...f, companyVehicle: opt, vehicle: opt === 'No' ? '' : f.vehicle }))}
                style={{
                  flex: 1, padding: '10px 12px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 800, fontSize: 13,
                  border: form.companyVehicle === opt ? '2px solid #1e40af' : '1px solid #d1d5db',
                  background: form.companyVehicle === opt ? '#eff6ff' : '#fff',
                  color: form.companyVehicle === opt ? '#1e40af' : '#374151',
                }}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
        {form.companyVehicle === 'Yes' && (
          <div style={{ gridColumn: '1/-1' }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 4, display: 'block' }}>Vehicle *</label>
            <select style={{ ...inp, cursor: 'pointer' }} value={form.vehicle} onChange={e => set('vehicle', e.target.value)}>
              <option value="">Select vehicle</option>
              {COMPANY_VEHICLES.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onCancel} style={{ flex: 1, padding: '10px', borderRadius: 8, border: '1px solid #d1d5db', background: '#f9fafb', color: '#374151', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
        <button onClick={submit} disabled={saving} style={{ flex: 2, padding: '10px', borderRadius: 8, border: 'none', background: '#1e40af', color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
          {saving ? '⏳ Submitting…' : '✅ Submit OD Request'}
        </button>
      </div>
    </div>
  );
}

// ─── VISITOR REQUEST FORM ─────────────────────────────────────────────────────
function VisitorForm({ userProfile, onSubmitted, onCancel }) {
  const [form, setForm] = useState({
    visitorName: '',
    visitorType: VISITOR_TYPES[0],
    purpose: '',
    comingFrom: '',
    noOfPeople: '1',
    mobileNumber: '',
    date: new Date().toISOString().slice(0, 10),
    remarks: '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const inp = { border: '1px solid #d1d5db', borderRadius: 8, padding: '9px 12px', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box', background: '#fff', color: '#111' };
  const lbl = { fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 4, display: 'block' };

  async function submit() {
    if (!form.visitorName.trim()) return alert('Visitor name is required');
    if (!form.visitorType) return alert('Visitor type is required');
    if (!form.purpose.trim()) return alert('Purpose is required');
    if (!form.comingFrom.trim()) return alert('Coming From is required');
    if (!String(form.noOfPeople).trim() || Number(form.noOfPeople) < 1) return alert('No. of People is required');
    const mobile = String(form.mobileNumber || '').replace(/\D/g, '');
    if (mobile.length !== 10) return alert('Mobile number must be 10 digits');
    if (!form.date) return alert('Date is required');
    // remarks optional

    setSaving(true);
    try {
      const flowSteps = await buildVisitorApprovalFlow(userProfile?.unit);
      const employeeMobile = getProfileMobile(userProfile);
      if (!employeeMobile) throw new Error('Your account has no mobile number. Contact Admin.');

      const requestId = await createAppRequest({
        type: 'visitor',
        employeeMobile,
        employeeEmail: getProfileEmail(userProfile) || '',
        employeeName: userProfile?.name || userProfile?.employeeName || employeeMobile,
        dept: userProfile?.dept || userProfile?.department || '',
        unit: userProfile?.unit || '',
        visitorName: form.visitorName.trim(),
        visitorType: form.visitorType,
        purpose: form.purpose.trim(),
        comingFrom: form.comingFrom.trim(),
        noOfPeople: parseInt(form.noOfPeople, 10) || 1,
        mobileNumber: mobile,
        date: form.date,
        remarks: form.remarks.trim(),
        approvals: {},
        rejected: false,
        flow: flowSteps,
        nextApproverMobile: flowSteps[0].mobile,
        autoApproved: false,
      });

      await createAppRequestNotification({
        type: 'request',
        title: `👤 Visitor Request — ${userProfile?.name || userProfile?.employeeName}`,
        message: `${form.visitorName.trim()} (${form.visitorType}) from ${form.comingFrom.trim()} · ${form.purpose.trim()} on ${form.date} | Awaiting ${flowSteps[0].label} approval`,
        targetMobile: flowSteps[0].mobile,
        targetRole: flowSteps[0].role,
        nextApproverMobile: flowSteps[0].mobile,
        requestId,
        pendingApproval: true,
      });
      onSubmitted();
    } catch (e) {
      alert('Submit failed: ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ padding: '0 0 16px' }}>
      <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--text-primary)', marginBottom: 16 }}>👤 Visitor Request</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <div>
          <label style={lbl}>Visitor Name *</label>
          <input style={inp} value={form.visitorName} onChange={(e) => set('visitorName', e.target.value)} placeholder="Full name" />
        </div>
        <div>
          <label style={lbl}>Visitor Type *</label>
          <select style={{ ...inp, cursor: 'pointer' }} value={form.visitorType} onChange={(e) => set('visitorType', e.target.value)}>
            {VISITOR_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div style={{ gridColumn: '1/-1' }}>
          <label style={lbl}>Purpose *</label>
          <input style={inp} value={form.purpose} onChange={(e) => set('purpose', e.target.value)} placeholder="Purpose of visit" />
        </div>
        <div>
          <label style={lbl}>Coming From *</label>
          <input style={inp} value={form.comingFrom} onChange={(e) => set('comingFrom', e.target.value)} placeholder="Company / Location" />
        </div>
        <div>
          <label style={lbl}>No. of People *</label>
          <input type="number" min={1} style={inp} value={form.noOfPeople} onChange={(e) => set('noOfPeople', e.target.value)} />
        </div>
        <div>
          <label style={lbl}>Mobile Number *</label>
          <input
            type="tel"
            inputMode="numeric"
            maxLength={10}
            style={inp}
            value={form.mobileNumber}
            onChange={(e) => set('mobileNumber', e.target.value.replace(/\D/g, '').slice(0, 10))}
            placeholder="10-digit visitor mobile"
          />
        </div>
        <div>
          <label style={lbl}>Date *</label>
          <input type="date" style={inp} value={form.date} onChange={(e) => set('date', e.target.value)} />
        </div>
        <div style={{ gridColumn: '1/-1' }}>
          <label style={lbl}>Remarks <span style={{ fontWeight: 500, textTransform: 'none', color: '#9ca3af' }}>(optional)</span></label>
          <input style={inp} value={form.remarks} onChange={(e) => set('remarks', e.target.value)} placeholder="Optional" />
        </div>
      </div>

      <div style={{ background: '#f5f3ff', borderRadius: 8, padding: '10px 12px', marginBottom: 14, border: '1px solid #ddd6fe' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', marginBottom: 6, textTransform: 'uppercase' }}>Approval Path (same as OD)</div>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#5b21b6' }}>
          {userProfile?.unit === 'u2' ? 'Unit II → JMD 2 → MD' : 'Unit I → JMD 1 → MD'}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onCancel} style={{ flex: 1, padding: '10px', borderRadius: 8, border: '1px solid #d1d5db', background: '#f9fafb', color: '#374151', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
        <button onClick={submit} disabled={saving} style={{ flex: 2, padding: '10px', borderRadius: 8, border: 'none', background: '#7c3aed', color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
          {saving ? '⏳ Submitting…' : '✅ Submit Visitor Request'}
        </button>
      </div>
    </div>
  );
}

function ITForm({ userProfile, onSubmitted, onCancel }) {
  const [form, setForm] = useState({ category: IT_CATEGORIES[0], issue: '' });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const inp = {
    border: '1px solid #d1d5db',
    borderRadius: 8,
    padding: '9px 12px',
    fontSize: 13,
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
    background: '#fff',
    color: '#111',
  };

  async function submit() {
    if (!form.category) return alert('Select a category');
    if (!form.issue.trim()) return alert('Describe the issue');
    setSaving(true);
    try {
      const supervisor = await findITSupervisor();
      if (!supervisor) {
        throw new Error('IT Member-Supervisor is not set up. Create an IT department user with role Member-Supervisor in Admin Panel.');
      }
      const supervisorMobile = getProfileMobile(supervisor) || normalizeAppMobile(supervisor.mobile);
      if (!supervisorMobile) throw new Error('IT supervisor has no mobile number. Update it in Admin Panel.');
      const employeeMobile = getProfileMobile(userProfile);
      if (!employeeMobile) throw new Error('Your account has no mobile number. Contact Admin.');
      const today = new Date().toISOString().slice(0, 10);
      const requestId = await createAppRequest({
        type: 'it',
        employeeMobile,
        employeeEmail: getProfileEmail(userProfile) || '',
        employeeName: userProfile?.name || userProfile?.employeeName || employeeMobile,
        dept: userProfile?.dept || userProfile?.department || '',
        unit: userProfile?.unit || '',
        category: form.category,
        issue: form.issue.trim(),
        description: form.issue.trim(),
        date: today,
        itStatus: 'open',
        itSupervisorMobile: supervisorMobile,
        itSupervisorName: supervisor.name || supervisor.employeeName || 'IT Supervisor',
        assignedToMobile: null,
        assignedToName: '',
        approvals: {},
        rejected: false,
        flow: [{
          role: 'it_supervisor',
          mobile: supervisorMobile,
          label: 'IT Supervisor',
          name: supervisor.name || supervisor.employeeName || '',
        }],
        nextApproverMobile: supervisorMobile,
        autoApproved: false,
      });
      await createAppRequestNotification({
        type: 'request',
        title: `💻 IT Request — ${form.category}`,
        message: `${userProfile?.name || 'Employee'}: ${form.issue.trim()} | Awaiting assignment`,
        targetMobile: supervisorMobile,
        targetRole: 'member_supervisor',
        nextApproverMobile: supervisorMobile,
        requestId,
        pendingApproval: true,
      });
      onSubmitted();
    } catch (e) {
      alert(e.message || 'Submit failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ padding: '0 0 16px' }}>
      <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--text-primary)', marginBottom: 16 }}>💻 IT Request</div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 4, display: 'block' }}>Category *</label>
        <select style={inp} value={form.category} onChange={(e) => set('category', e.target.value)}>
          {IT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 4, display: 'block' }}>Issue *</label>
        <textarea
          style={{ ...inp, minHeight: 110, resize: 'vertical' }}
          value={form.issue}
          onChange={(e) => set('issue', e.target.value)}
          placeholder="Describe the problem"
        />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onCancel} style={{ flex: 1, padding: '10px', borderRadius: 8, border: '1px solid #d1d5db', background: '#f9fafb', color: '#374151', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
        <button onClick={submit} disabled={saving} style={{ flex: 2, padding: '10px', borderRadius: 8, border: 'none', background: '#1d4ed8', color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
          {saving ? '⏳ Submitting…' : '✅ Submit'}
        </button>
      </div>
    </div>
  );
}

function ComingSoonRequestForm({ title, icon, onCancel }) {
  return (
    <div style={{padding:'0 0 16px'}}>
      <div style={{fontWeight:800,fontSize:15,color:'var(--text-primary)',marginBottom:12}}>{icon} {title}</div>
      <div style={{background:'#fffbeb',border:'1px solid #fde68a',borderRadius:12,padding:'16px 18px',marginBottom:16,color:'#92400e',fontSize:13,lineHeight:1.5}}>
        Form fields for this request type will be added next. Tell me what details to collect and the approval path.
      </div>
      <button onClick={onCancel} style={{padding:'10px 20px',borderRadius:8,border:'1px solid #d1d5db',background:'#f9fafb',color:'#374151',fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>
        ← Back
      </button>
    </div>
  );
}

// ─── MAIN DASHBOARD ───────────────────────────────────────────────────────────
function MyRequestAlerts({ userMobile, userAppRole }) {
  const [items, setItems] = useState([]);
  useEffect(() => {
    return subscribeAppRequestNotifications((list) => {
      const mine = (list || [])
        .filter((n) => notifIsForUser(n, userMobile, userAppRole) && !n.read)
        .slice(0, 8);
      setItems(mine);
    });
  }, [userMobile, userAppRole]);

  if (!items.length) return null;

  return (
    <div style={{ marginBottom: 14, borderRadius: 12, border: '1px solid #fde68a', background: '#fffbeb', overflow: 'hidden' }}>
      <div style={{ padding: '8px 12px', fontSize: 11, fontWeight: 800, color: '#b45309', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid #fde68a' }}>
        🔔 Your request alerts ({items.length})
      </div>
      {items.map((n) => (
        <div key={n.id} style={{ padding: '10px 12px', borderBottom: '1px solid #fef3c7', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#92400e' }}>{n.title}</div>
            <div style={{ fontSize: 11, color: '#a16207', marginTop: 2 }}>{n.message}</div>
          </div>
          <button
            type="button"
            onClick={() => markAppRequestNotifRead(n.id)}
            style={{ flexShrink: 0, background: '#fff', border: '1px solid #fcd34d', borderRadius: 6, padding: '4px 8px', fontSize: 10, fontWeight: 700, color: '#b45309', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Got it
          </button>
        </div>
      ))}
    </div>
  );
}

export default function RequestsDashboard({ userProfile, onBack, dark, initialView }) {
  const userEmail = getProfileEmail(userProfile);
  const userMobile = getProfileMobile(userProfile);
  const appRole = userProfile?.appRole;
  const isAdmin =
    userProfile?.role === 'owner' ||
    appRole === 'admin' ||
    appRole === 'md' ||
    appRole === 'jmd_1' ||
    appRole === 'jmd_2';
  const isApprover =
    isAdmin ||
    appRole === 'member_supervisor' ||
    userEmail === HR_EMAIL ||
    PPC_EMAILS.includes(userEmail) ||
    Object.values(DEPT_SUPERVISOR).includes(userEmail);

  const [requests,     setRequests]     = useState([]);
  const [pendingAll,   setPendingAll]   = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [view,         setView]         = useState(initialView || 'my');
  const [newType,      setNewType]      = useState(initialView === 'new' ? 'od' : null);
  const [filter,       setFilter]       = useState('all');

  useEffect(() => {
    if (!initialView) return;
    setView(initialView);
    if (initialView === 'new') setNewType((t) => t || 'od');
  }, [initialView]);

  // Pending for this mobile / role
  useEffect(() => {
    if (!userMobile && !appRole) return;
    const unsub = subscribeAppRequests((docs) => {
      setPendingAll(docs.filter((r) => isUsersTurn(r, userMobile, appRole, userEmail)));
    }, { pendingOnly: true });
    return () => unsub && unsub();
  }, [userMobile, appRole, userEmail]);

  useEffect(() => {
    setLoading(true);
    let unsub = () => {};
    if (view === 'new') {
      setLoading(false);
      return;
    }
    if (isAdmin && view === 'all') {
      unsub = subscribeAppRequests((docs) => { setRequests(docs); setLoading(false); });
    } else if (view === 'pending') {
      unsub = subscribeAppRequests((docs) => {
        setRequests(docs.filter((r) => isUsersTurn(r, userMobile, appRole, userEmail)));
        setLoading(false);
      }, { pendingOnly: true });
    } else {
      unsub = subscribeAppRequests((docs) => { setRequests(docs); setLoading(false); }, {
        employeeMobile: userMobile || undefined,
      });
    }
    return () => unsub && unsub();
  }, [userMobile, userEmail, view, isAdmin, appRole]);

  async function handleAction() {}

  const myPending = pendingAll;

  const displayed = (() => {
    let base = requests;
    if (view === 'pending') {
      base = requests.filter((r) => isUsersTurn(r, userMobile, appRole, userEmail));
    }
    if (filter === 'all') return base;
    if (filter === 'maintenance') {
      return base.filter(r =>
        r.type === 'maintenance' ||
        r.type === 'machine_maintenance' ||
        r.type === 'pdc_maintenance' ||
        r.type === 'general_maintenance'
      );
    }
    return base.filter(r => r.type === filter);
  })();

  const tabs = [
    { id:'my',      label:'My Requests', icon:'📋' },
    ...(isApprover ? [{ id:'pending', label:`Pending${myPending.length>0?' ('+myPending.length+')':''}`, icon:'⏳' }] : []),
    ...(isAdmin    ? [{ id:'all',     label:'All',    icon:'👁‍🗨' }] : []),
    { id:'new',     label:'+ New',   icon:'✏️' },
  ];

  const newTypeOptions = [
    { type:'od',      icon:'🚗', label:'On Duty (OD)',    desc:'Site visit, customer, vendor, government office', color:'#1e40af', bg:'#eff6ff', border:'#bfdbfe' },
    { type:'visitor', icon:'👤', label:'Visitor Request', desc:'Pre-approve a visitor before they arrive', color:'#7c3aed', bg:'#f5f3ff', border:'#c4b5fd' },
    { type:'leave',   icon:'🌴', label:'Leave Request',   desc:'Personal or health leave — Reporting → JMD → MD', color:'#15803d', bg:'#f0fdf4', border:'#86efac' },
    { type:'it',      icon:'💻', label:'IT Request',      desc:'IT support, systems, access, hardware', color:'#1d4ed8', bg:'#eff6ff', border:'#93c5fd' },
  ];

  const filterTypes = ['all','od','visitor','leave','it'];

  return (
    <div style={{minHeight:'100vh',background:'var(--bg-base)',fontFamily:'Inter,system-ui,sans-serif'}}>
      {/* HEADER */}
      <div style={{background:'linear-gradient(135deg,#7c3aed,#6d28d9)',color:'#fff',padding:'14px 18px',boxShadow:'0 2px 10px rgba(124,58,237,0.4)'}}>
        <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:12}}>
          {onBack && <button onClick={onBack} style={{background:'rgba(255,255,255,0.2)',border:'none',borderRadius:9,color:'#fff',fontSize:18,cursor:'pointer',padding:'5px 12px'}}>←</button>}
          <div>
            <div style={{fontWeight:900,fontSize:17}}>📝 Requests</div>
            <div style={{fontSize:12,opacity:0.85,marginTop:2}}>OD · Visitor · Leave · IT</div>
          </div>
          {myPending.length > 0 && (
            <span style={{marginLeft:'auto',background:'#fef3c7',color:'#b45309',borderRadius:20,padding:'4px 14px',fontWeight:800,fontSize:12}}>
              ⚡ {pendingAll.length} pending your action
            </span>
          )}
        </div>
        {/* Tabs */}
        <div style={{display:'flex',gap:6,overflowX:'auto',paddingBottom:2}}>
          {tabs.map(t=>(
            <button key={t.id} onClick={()=>{ setView(t.id); if(t.id!=='new') setNewType(null); }}
              style={{padding:'7px 16px',borderRadius:20,border:'none',cursor:'pointer',fontWeight:700,fontSize:12,whiteSpace:'nowrap',flexShrink:0,
                background:view===t.id?'#fff':'rgba(255,255,255,0.18)',
                color:view===t.id?'#7c3aed':'#fff'}}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* CONTENT */}
      <div style={{padding:'16px 14px',maxWidth:680,margin:'0 auto'}}>

        <MyRequestAlerts userMobile={userMobile} userAppRole={appRole} />

        {/* NEW REQUEST */}
        {view === 'new' && !newType && (
          <div>
            <div style={{fontWeight:800,fontSize:14,color:'var(--text-primary)',marginBottom:14}}>What would you like to request?</div>
            {newTypeOptions.map(opt=>(
              <div key={opt.type} onClick={()=>setNewType(opt.type)}
                style={{background:opt.bg,border:`2px solid ${opt.border}`,borderRadius:14,padding:'18px 20px',marginBottom:12,cursor:'pointer',display:'flex',alignItems:'center',gap:16,
                  transition:'transform 0.1s',}}
                onMouseDown={e=>e.currentTarget.style.transform='scale(0.98)'}
                onMouseUp={e=>e.currentTarget.style.transform='scale(1)'}>
                <div style={{fontSize:32}}>{opt.icon}</div>
                <div>
                  <div style={{fontWeight:800,fontSize:15,color:opt.color}}>{opt.label}</div>
                  <div style={{fontSize:12,color:'#6b7280',marginTop:3}}>{opt.desc}</div>
                </div>
                <div style={{marginLeft:'auto',fontSize:20,color:opt.color}}>→</div>
              </div>
            ))}
          </div>
        )}

        {view === 'new' && newType === 'od' && <ODForm userProfile={userProfile} onSubmitted={()=>{setView('my');setNewType(null);}} onCancel={()=>setNewType(null)}/>}
        {view === 'new' && newType === 'visitor' && <VisitorForm userProfile={userProfile} onSubmitted={()=>{setView('my');setNewType(null);}} onCancel={()=>setNewType(null)}/>}
        {view === 'new' && newType === 'leave' && <LeaveForm userProfile={userProfile} onSubmitted={()=>{setView('my');setNewType(null);}} onCancel={()=>setNewType(null)}/>}
        {view === 'new' && newType === 'it' && <ITForm userProfile={userProfile} onSubmitted={()=>{setView('my');setNewType(null);}} onCancel={()=>setNewType(null)}/>}

        {/* REQUEST LIST */}
        {view !== 'new' && (
          <>
            {/* Filter bar */}
            <div style={{display:'flex',gap:6,marginBottom:14,flexWrap:'wrap'}}>
              {filterTypes.map(f=>(
                <button key={f} onClick={()=>setFilter(f)}
                  style={{padding:'5px 14px',borderRadius:16,border:`1px solid ${filter===f?'#7c3aed':'#e5e7eb'}`,
                    background:filter===f?'#7c3aed':'transparent',color:filter===f?'#fff':'#6b7280',
                    fontWeight:filter===f?700:400,fontSize:12,cursor:'pointer',fontFamily:'inherit'}}>
                  {f==='all'?'All':`${REQUEST_TYPE_META[f]?.icon || ''} ${REQUEST_TYPE_META[f]?.label || f}`}
                </button>
              ))}
              <span style={{marginLeft:'auto',fontSize:12,color:'var(--text-secondary)',alignSelf:'center'}}>{displayed.length} request{displayed.length!==1?'s':''}</span>
            </div>

            {loading && <div style={{textAlign:'center',padding:48,color:'var(--text-secondary)'}}>Loading…</div>}

            {!loading && displayed.length === 0 && (
              <div style={{textAlign:'center',padding:48,color:'var(--text-secondary)'}}>
                <div style={{fontSize:36,marginBottom:8}}>📋</div>
                <div style={{fontSize:13}}>{view==='pending'?'No requests pending your action':'No requests yet'}</div>
                {view==='my' && (
                  <button onClick={()=>setView('new')} style={{marginTop:14,padding:'10px 24px',borderRadius:8,border:'none',background:'#7c3aed',color:'#fff',fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>
                    + New Request
                  </button>
                )}
              </div>
            )}

            {displayed.map(req=>(
              <RequestCard key={req.id} req={req} userEmail={userEmail} userMobile={userMobile} userAppRole={appRole} isAdmin={isAdmin} onAction={handleAction} dark={dark} userProfile={userProfile}/>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
