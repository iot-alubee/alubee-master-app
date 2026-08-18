import { listAppUsers } from './userService';
import { readSharedUsers } from './sharedUserStore';
import { listLocalUsers } from './localUserStore';
import {
  createAppRequestNotification,
  getProfileMobile,
  mobilesMatch,
  normalizeAppMobile,
  updateAppRequest,
  markRequestNotifsActioned,
} from './requestService';

export const IT_CATEGORIES = [
  'Printer/Scanner',
  'PC/Laptop',
  'IoT',
  'Network/Internet',
  'IBM server',
];

export function isITDepartment(user) {
  const d = String(user?.dept || user?.department || '').toLowerCase();
  return d === 'it';
}

export function itTicketStatus(req) {
  if (!req) return 'Open';
  if (req.cancelled) return 'Cancelled';
  const s = String(req.itStatus || 'open').toLowerCase();
  if (s === 'closed') return 'Closed';
  if (s === 'resolved') return 'Resolved';
  if (s === 'assigned') return 'Assigned';
  return 'Open';
}

export function itTicketDate(req) {
  const c = req?.date || String(req?.createdAt || '').slice(0, 10);
  return c || '';
}

function userKey(u) {
  return normalizeAppMobile(u?.mobile) || String(u?.id || '');
}

export async function listITTeam() {
  const pool = [];
  try {
    pool.push(...(await listAppUsers()));
  } catch (_) {}
  try {
    pool.push(...(await readSharedUsers()));
  } catch (_) {}
  try {
    pool.push(...listLocalUsers());
  } catch (_) {}
  const seen = new Set();
  return pool.filter((u) => {
    if (!u || u.active === false || !isITDepartment(u)) return false;
    const key = userKey(u);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isSupervisorRole(u) {
  const r = String(u?.appRole || u?.role || '');
  return r === 'member_supervisor' || r === 'dept_head';
}

function isEmployeeRole(u) {
  const r = String(u?.appRole || u?.role || '');
  return r === 'member_employee' || r === 'member';
}

export async function findITSupervisor() {
  const team = await listITTeam();
  return team.find((u) => isSupervisorRole(u)) || null;
}

export function listITEngineers(team) {
  const engineers = (team || []).filter((u) => isEmployeeRole(u));
  return engineers.length ? engineers : (team || []);
}

export function isITSupervisorFor(req, userMobile, userProfile) {
  if (mobilesMatch(req?.itSupervisorMobile, userMobile)) return true;
  if (isITDepartment(userProfile) && isSupervisorRole(userProfile)) return true;
  return false;
}

export function isITAssignee(req, userMobile) {
  return mobilesMatch(req?.assignedToMobile, userMobile);
}

export function isITRequester(req, userMobile) {
  return mobilesMatch(req?.employeeMobile, userMobile);
}

export async function assignITTicket(req, engineer, byProfile) {
  if (!req?.id) throw new Error('Request id required');
  if (!engineer) throw new Error('Select an IT team member');
  const engineerMobile = getProfileMobile(engineer) || normalizeAppMobile(engineer.mobile);
  if (!engineerMobile) throw new Error('That IT member has no mobile number');
  const engineerName = engineer.name || engineer.employeeName || 'IT Engineer';
  const byMobile = getProfileMobile(byProfile);
  await updateAppRequest(req.id, {
    itStatus: 'assigned',
    assignedToMobile: engineerMobile,
    assignedToName: engineerName,
    assignedAt: new Date().toISOString(),
    assignedByMobile: byMobile,
    assignedByName: byProfile?.name || byProfile?.employeeName || '',
    nextApproverMobile: engineerMobile,
  });
  await markRequestNotifsActioned(req.id, byMobile, { approved: true }).catch(() => {});
  await createAppRequestNotification({
    type: 'request',
    title: `💻 IT ticket assigned — ${req.category || 'IT'}`,
    message: `A ticket from ${req.employeeName} (${req.category}) has been assigned to you. Issue: ${req.issue || req.description || ''}`,
    targetMobile: engineerMobile,
    requestId: req.id,
    pendingApproval: false,
  });
  await createAppRequestNotification({
    type: 'request',
    title: '💻 Your IT ticket has been assigned',
    message: `Your ticket has been assigned to IT Engineer ${engineerName}.`,
    targetMobile: normalizeAppMobile(req.employeeMobile),
    requestId: req.id,
    pendingApproval: false,
  });
}

export async function resolveITTicket(req, byProfile, note = '') {
  if (!req?.id) throw new Error('Request id required');
  await updateAppRequest(req.id, {
    itStatus: 'resolved',
    resolvedAt: new Date().toISOString(),
    resolvedByMobile: getProfileMobile(byProfile),
    resolvedByName: byProfile?.name || byProfile?.employeeName || '',
    resolveNote: note || '',
    nextApproverMobile: normalizeAppMobile(req.employeeMobile),
  });
  await createAppRequestNotification({
    type: 'request',
    title: '💻 IT ticket resolved — please close',
    message: `${byProfile?.name || 'IT Engineer'} marked your ${req.category || 'IT'} ticket as resolved. Please close the request if the issue is fixed.`,
    targetMobile: normalizeAppMobile(req.employeeMobile),
    requestId: req.id,
    pendingApproval: false,
  });
}

export async function closeITTicket(req, byProfile) {
  if (!req?.id) throw new Error('Request id required');
  const closer = byProfile?.name || byProfile?.employeeName || 'Requester';
  await updateAppRequest(req.id, {
    itStatus: 'closed',
    closedAt: new Date().toISOString(),
    closedByMobile: getProfileMobile(byProfile),
    closedByName: closer,
    nextApproverMobile: null,
  });
  const targets = [
    normalizeAppMobile(req.itSupervisorMobile),
    normalizeAppMobile(req.assignedToMobile),
  ].filter((m, i, arr) => m && arr.indexOf(m) === i);
  await Promise.all(targets.map((mobile) => createAppRequestNotification({
    type: 'request',
    title: `✅ IT ticket closed — ${req.category || 'IT'}`,
    message: `${closer} closed the IT request (${req.category}). Issue: ${req.issue || ''}`,
    targetMobile: mobile,
    requestId: req.id,
    pendingApproval: false,
    requestApproved: true,
  })));
}
