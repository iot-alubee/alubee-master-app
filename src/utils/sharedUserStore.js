import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { resolveStoredAppRole } from '../data/appRoles';

/** Existing writable collection in this Firebase project (customer/supplier already use it). */
const COL = 'working_days_config';
const DOC_ID = 'alubee_app_users';

function toPlain(profile) {
  if (!profile) return null;
  return {
    id: profile.id,
    unit: profile.unit || 'u1',
    department: profile.department || profile.dept || '',
    dept: profile.department || profile.dept || '',
    employeeId: profile.employeeId || '',
    employeeName: profile.employeeName || profile.name || '',
    name: profile.employeeName || profile.name || '',
    role: resolveStoredAppRole(profile) || profile.appRole || profile.role || '',
    appRole: resolveStoredAppRole(profile) || profile.appRole || profile.role || '',
    reportingTo: profile.reportingTo || '',
    mobile: profile.mobile || '',
    linkedEmail: profile.linkedEmail || '',
    authEmail: profile.authEmail || profile.email || '',
    email: profile.linkedEmail || profile.authEmail || profile.email || '',
    authUid: profile.authUid || '',
    pageAccess: Array.isArray(profile.pageAccess) ? profile.pageAccess : [],
    pin: profile.pin || '',
    pinSet: true,
    active: profile.active !== false,
    createdAt: profile.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export async function readSharedUsers() {
  try {
    const snap = await getDoc(doc(db, COL, DOC_ID));
    if (!snap.exists()) return [];
    const map = snap.data()?.users || {};
    return Object.values(map).filter(Boolean);
  } catch (err) {
    console.warn('readSharedUsers failed', err?.code || err?.message);
    return [];
  }
}

export async function upsertSharedUser(profile) {
  const plain = toPlain(profile);
  if (!plain?.id) return false;
  const ref = doc(db, COL, DOC_ID);
  let current = {};
  try {
    const snap = await getDoc(ref);
    current = snap.exists() ? (snap.data().users || {}) : {};
  } catch (_) {}

  const prev = current[plain.id] || {};
  // Avoid rewrite loops: same payload → no Firestore write (prevents Admin list flicker)
  const prevCmp = { ...prev, updatedAt: '', createdAt: '' };
  const nextCmp = { ...plain, updatedAt: '', createdAt: prev.createdAt || plain.createdAt || '' };
  if (JSON.stringify(prevCmp) === JSON.stringify(nextCmp)) {
    return false;
  }

  current[plain.id] = {
    ...prev,
    ...plain,
    createdAt: prev.createdAt || plain.createdAt,
    updatedAt: new Date().toISOString(),
  };
  await setDoc(ref, { users: current, updatedAt: new Date().toISOString() }, { merge: true });
  try {
    await refreshApproverIndex(Object.values(current).filter((u) => u && u.active !== false));
  } catch (err) {
    console.warn('refreshApproverIndex failed', err?.code || err?.message);
  }
  return true;
}

export async function deactivateSharedUser(userId) {
  const ref = doc(db, COL, DOC_ID);
  const snap = await getDoc(ref);
  const current = snap.exists() ? (snap.data().users || {}) : {};
  if (!current[userId]) return false;
  current[userId] = { ...current[userId], active: false, updatedAt: new Date().toISOString() };
  await setDoc(ref, { users: current, updatedAt: new Date().toISOString() }, { merge: true });
  try {
    await refreshApproverIndex(Object.values(current).filter((u) => u && u.active !== false));
  } catch (_) {}
  return true;
}

const APPROVERS_DOC = 'alubee_approvers';

/** Keep a small role→contact index so Android can resolve JMD/MD without localStorage */
export async function refreshApproverIndex(userList) {
  const list = Array.isArray(userList) ? userList : await readSharedUsers();
  const byRole = {};
  for (const role of ['jmd_1', 'jmd_2', 'md', 'admin']) {
    const u = list.find(
      (x) =>
        x &&
        x.active !== false &&
        resolveStoredAppRole(x) === role
    );
    if (!u) continue;
    const email = String(u.authEmail || u.email || '').toLowerCase();
    const mobile = String(u.mobile || '').replace(/\D/g, '').slice(-10);
    if (!mobile || mobile.length !== 10) continue;
    byRole[role] = {
      id: u.id,
      name: u.employeeName || u.name || '',
      email,
      mobile,
      appRole: role,
      unit: u.unit || '',
    };
  }
  await setDoc(
    doc(db, COL, APPROVERS_DOC),
    { byRole, updatedAt: new Date().toISOString() },
    { merge: true }
  );
  return byRole;
}

export async function readApproverByRole(appRole) {
  if (!appRole) return null;
  try {
    const snap = await getDoc(doc(db, COL, APPROVERS_DOC));
    if (!snap.exists()) return null;
    return snap.data()?.byRole?.[appRole] || null;
  } catch (err) {
    console.warn('readApproverByRole failed', err?.code || err?.message);
    return null;
  }
}

/** Push a full user list into the shared Firestore doc (web → Android sync) */
export async function replaceSharedUsers(userList) {
  const users = {};
  (userList || []).forEach((u) => {
    const plain = toPlain(u);
    if (plain?.id && plain.active !== false) users[plain.id] = plain;
  });
  await setDoc(
    doc(db, COL, DOC_ID),
    { users, updatedAt: new Date().toISOString() },
    { merge: false }
  );
  await refreshApproverIndex(Object.values(users));
  return Object.keys(users).length;
}

export function subscribeSharedUsers(callback) {
  return onSnapshot(
    doc(db, COL, DOC_ID),
    (snap) => {
      const map = snap.exists() ? (snap.data().users || {}) : {};
      callback(Object.values(map).filter(Boolean));
    },
    () => callback([])
  );
}
