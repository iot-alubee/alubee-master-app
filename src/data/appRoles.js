// App roles, units, and screen access catalog for Admin Panel

import { getUserByEmail } from './orgData';

export const APP_ROLES = [
  { id: 'jmd_1', label: 'JMD 1', fullAccess: true },
  { id: 'jmd_2', label: 'JMD 2', fullAccess: true },
  { id: 'md', label: 'MD', fullAccess: true },
  { id: 'member_supervisor', label: 'Member - Supervisor', fullAccess: false },
  { id: 'member_employee', label: 'Member - Employee', fullAccess: false },
  { id: 'admin', label: 'Admin', fullAccess: true },
];

export const APP_UNITS = [
  { id: 'u1', label: 'Unit I' },
  { id: 'u2', label: 'Unit II' },
];

/** Screens members can be granted access to */
export const APP_SCREENS = [
  { id: 'tasks', label: 'Tasks' },
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'ageing', label: 'Ageing Report' },
  { id: 'erp', label: 'ERP Dashboard' },
  { id: 'stores', label: 'Stores Dashboard' },
  { id: 'exec_summary', label: 'Exec Summary' },
  { id: 'revenue', label: 'Revenue' },
  { id: 'supplier', label: 'Supplier' },
  { id: 'requests', label: 'Requests' },
  { id: 'maintenance', label: 'Maintenance' },
  { id: 'child_parts', label: 'Child Parts' },
  { id: 'logistics', label: 'Logistics' },
  { id: 'customers', label: 'Customers' },
  { id: 'security', label: 'Security Panel' },
  { id: 'hr', label: 'HR' },
  { id: 'it', label: 'IT' },
  { id: 'mws', label: 'MWS Dashboard' },
  { id: 'admin', label: 'Admin Panel' },
];

export const FULL_ACCESS_SCREEN_IDS = APP_SCREENS.map((s) => s.id);

export function roleHasFullAccess(roleId) {
  return !!APP_ROLES.find((r) => r.id === roleId)?.fullAccess;
}

export function getRoleLabel(roleId) {
  return APP_ROLES.find((r) => r.id === roleId)?.label || roleId || '—';
}

/** Member - Supervisor reports to JMD of their unit */
export function autoReportingTo(roleId, unitId) {
  if (roleId !== 'member_supervisor') return '';
  if (unitId === 'u1') return 'JMD 1';
  if (unitId === 'u2') return 'JMD 2';
  return '';
}

/**
 * Map new app roles onto legacy Dashboard permission flags.
 * Existing screens check role === 'owner' | 'dept_head' | 'member' | 'viewer'
 */
export function toLegacyRole(roleId) {
  if (roleHasFullAccess(roleId)) return 'owner';
  if (roleId === 'member_supervisor') return 'dept_head';
  if (roleId === 'member_employee') return 'member';
  return 'member';
}

export function canAccessScreen(userProfile, screenId) {
  if (!userProfile) return false;
  if (roleHasFullAccess(userProfile.appRole)) return true;
  const dept = String(userProfile.dept || userProfile.department || '').toLowerCase();
  if (screenId === 'it' && dept === 'it') return true;
  if (screenId === 'hr' && dept === 'hr') return true;
  const access = userProfile.pageAccess || [];
  return access.includes(screenId);
}

/** Map old org-chart role → Admin app role (no phone numbers involved). */
export function legacyRoleToAppRole(legacyUser) {
  if (!legacyUser) return '';
  if (legacyUser.role === 'owner') {
    return String(legacyUser.email || '').toLowerCase() === 'md@alubee.com' ? 'md' : 'admin';
  }
  if (legacyUser.role === 'dept_head') return 'member_supervisor';
  return 'member_employee';
}

/**
 * Screen IDs the old email login would see (from role / dept / known specialty IDs).
 * Used only to pre-fill Admin pageAccess when Work Email is mapped — mobiles stay Admin-only.
 */
export function pageAccessForOrgUser(legacyUser) {
  if (!legacyUser) return [];
  const role = legacyUser.role;
  const dept = legacyUser.dept;
  const id = legacyUser.id;
  const isOwner = role === 'owner';
  const isDH = role === 'dept_head';
  const isPPC = dept === 'ppc';

  if (isOwner) return [...FULL_ACCESS_SCREEN_IDS];

  const screens = new Set(['tasks', 'requests', 'maintenance', 'logistics']);
  if (isDH || isPPC) screens.add('dashboard');
  if (isDH) screens.add('ageing');
  if (id === 'gokila' || id === 'madubala_u2' || dept === 'pdc') screens.add('erp');
  if (id === 'agilan' || id === 'thilagavathi') screens.add('stores');
  if (isPPC) {
    screens.add('exec_summary');
    screens.add('revenue');
    screens.add('supplier');
    screens.add('customers');
  }
  if (['agilan', 'mohan', 'pachayappan', 'gopi', 'udhay'].includes(id)) {
    screens.add('child_parts');
  }
  if (dept === 'security') screens.add('security');
  if (dept === 'hr') screens.add('hr');
  if (dept === 'it') screens.add('it');
  return APP_SCREENS.map((s) => s.id).filter((sid) => screens.has(sid));
}

/**
 * Resolve Work Email → suggested Admin fields from org chart.
 * Returns { found:false } if email is not in the directory.
 * Does not store or hardcode mobile numbers — Admin still enters mobile + PIN.
 */
export function suggestFromWorkEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  if (!e) return { found: false };
  const legacy = getUserByEmail(e);
  if (!legacy) return { found: false, email: e };
  const appRole = legacyRoleToAppRole(legacy);
  return {
    found: true,
    email: e,
    name: legacy.name || '',
    unit: legacy.unit || '',
    department: legacy.dept || '',
    role: appRole,
    pageAccess: pageAccessForOrgUser(legacy),
    reportingTo: autoReportingTo(appRole, legacy.unit) || '',
  };
}

/** Firebase Auth email derived from mobile (keeps Auth email/password) */
export function mobileToAuthEmail(mobile) {
  const digits = String(mobile || '').replace(/\D/g, '');
  const normalized = digits.length > 10 ? digits.slice(-10) : digits;
  return `${normalized}@mobile.alubee.com`;
}

export function normalizeMobile(mobile) {
  const digits = String(mobile || '').replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
}

/** Firebase Auth needs 6+ chars — derive a stable password from mobile + PIN */
export function pinToAuthPassword(mobile, pin) {
  const m = normalizeMobile(mobile);
  const p = String(pin || '').replace(/\D/g, '');
  return `Alubee#${m}#${p}`;
}

export function isValidPin(pin) {
  return /^\d{4}$/.test(String(pin || ''));
}

/** Users that must appear on every device (web + Android) even if Firestore is blocked. */
export const SEEDED_USERS = [];

export function getSeededUserByMobile(mobile) {
  const m = normalizeMobile(mobile);
  return SEEDED_USERS.find((u) => u.mobile === m && u.active !== false) || null;
}

export function getSeededUserByAuthEmail(email) {
  if (!email) return null;
  const e = String(email).toLowerCase();
  return SEEDED_USERS.find((u) => (u.authEmail || u.email || '').toLowerCase() === e && u.active !== false) || null;
}


