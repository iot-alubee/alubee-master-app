import { getProfileMobile } from './requestService';

const PENDING_TAP_KEY = 'alubee_mobile_pending_tap';

/** Mobile-PIN users (this app). Email-login users stay on the existing Alubee app. */
export function isMobileAppUser(profile) {
  if (!profile || profile.fromLegacy) return false;
  const mobile = getProfileMobile(profile);
  if (mobile.length === 10) return true;
  const email = String(profile.email || profile.authEmail || '').toLowerCase();
  return /@mobile\.alubee\.com$/.test(email);
}

export function storePendingNotifTap(intent) {
  try {
    sessionStorage.setItem(PENDING_TAP_KEY, JSON.stringify(intent || {}));
  } catch (_) {}
}

export function consumePendingNotifTap() {
  try {
    const raw = sessionStorage.getItem(PENDING_TAP_KEY);
    sessionStorage.removeItem(PENDING_TAP_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

export function flattenNotifData(raw) {
  const data = raw && typeof raw === 'object' ? raw : {};
  const nested = data.data && typeof data.data === 'object' ? data.data : {};
  const fcm = data.FCM_MSG && typeof data.FCM_MSG === 'object' ? data.FCM_MSG : {};
  const fcmData = fcm.data && typeof fcm.data === 'object' ? fcm.data : {};
  return { ...nested, ...fcmData, ...fcm, ...data };
}

function truthyFlag(value) {
  return value === true || value === 'true' || value === '1' || value === 1;
}

const REQUEST_TYPES = new Set(['request', 'od', 'leave', 'it']);
const TASK_TYPES = new Set([
  'task', 'task_assigned', 'task_completed', 'task_updated', 'task_cancelled',
  'task_deleted', 'task_overdue', 'task_reopened', 'delete_requested', 'overdue',
]);
const SECURITY_TYPES = new Set([
  'vehicle', 'permission', 'mobilebox', 'tea', 'dc', 'dc_approval',
  'internal', 'transfer', 'overstay', 'power', 'manpower',
]);
const SECURITY_TABS = new Set([
  'visitor', 'vehicle', 'permission', 'mobilebox', 'power', 'od', 'internal',
  'transfer', 'dc', 'tea',
]);

/** Map a push / in-app notification to the screen + tab the user should open. */
export function resolveNotifDestination(raw) {
  const data = flattenNotifData(raw || {});
  const type = String(data.type || '').toLowerCase();
  const tabIn = String(data.tab || '').toLowerCase();
  let screen = String(data.screen || '').toLowerCase();
  const requestId = data.requestId ? String(data.requestId) : '';
  const taskId = data.taskId ? String(data.taskId) : '';
  const pending = truthyFlag(data.pendingApproval);

  const securityVisitor = type === 'visitor' && (screen === 'security' || (!requestId && data.visitorId));
  const isRequest =
    !securityVisitor &&
    (screen === 'requests' || REQUEST_TYPES.has(type) || !!requestId);

  if (isRequest) {
    const approvalTab =
      pending ||
      tabIn === 'pending' ||
      tabIn === 'approvals' ||
      tabIn === 'approval';
    return {
      screen: 'requests',
      tab: approvalTab ? 'pending' : tabIn === 'all' ? 'all' : 'my',
      requestId,
      taskId,
      type: type || 'request',
    };
  }

  if (TASK_TYPES.has(type) || screen === 'tasks' || screen === 'dashboard' || taskId) {
    return {
      screen: screen === 'dashboard' && !taskId ? 'dashboard' : 'tasks',
      tab: null,
      requestId,
      taskId,
      type,
    };
  }

  if (SECURITY_TYPES.has(type) || type === 'visitor' || screen === 'security') {
    let tab = tabIn || (type === 'dc_approval' ? 'dc' : type) || 'dashboard';
    if (tab === 'internal') tab = 'od';
    if (!SECURITY_TABS.has(tab)) tab = 'dashboard';
    return { screen: 'security', tab, requestId, taskId, type };
  }

  if (screen === 'erp' || type === 'erp' || type === 'erp_reminder') {
    return { screen: 'erp', tab: null, requestId, taskId, type };
  }
  if (screen === 'stores' || type === 'stores' || type === 'stores_checklist' || type === 'stores_alloy') {
    return { screen: 'stores', tab: null, requestId, taskId, type };
  }
  if (screen === 'maintenance' || type === 'maintenance') {
    return { screen: 'maintenance', tab: null, requestId, taskId, type };
  }
  if (screen === 'revenue' || type === 'revenue') {
    return { screen: 'revenue', tab: null, requestId, taskId, type };
  }
  if (screen === 'supplier' || type === 'supplier_inward' || type === 'supplier_rag') {
    return { screen: 'supplier', tab: null, requestId, taskId, type };
  }
  if (screen === 'hr') return { screen: 'hr', tab: null, requestId, taskId, type };
  if (screen === 'it' && !requestId) return { screen: 'it', tab: null, requestId, taskId, type };
  if (screen === 'customers' || type === 'customer_dispatch' || type === 'customer_schedule') {
    return { screen: 'customers', tab: null, requestId, taskId, type };
  }
  if (screen === 'executive') {
    return { screen: 'executive', tab: null, requestId, taskId, type };
  }

  return {
    screen: screen || 'dashboard',
    tab: tabIn || null,
    requestId,
    taskId,
    type,
  };
}
