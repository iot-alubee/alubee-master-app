import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  where,
  serverTimestamp,
  onSnapshot,
} from 'firebase/firestore';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
  initializeAuth,
  getAuth,
  browserSessionPersistence,
  setPersistence,
} from 'firebase/auth';
import { initializeApp, getApps } from 'firebase/app';
import { db, auth, getFirebaseConfig } from '../firebase';
import {
  mobileToAuthEmail,
  normalizeMobile,
  roleHasFullAccess,
  FULL_ACCESS_SCREEN_IDS,
  toLegacyRole,
  autoReportingTo,
  unitForAppRole,
  roleNeedsUnit,
  roleNeedsReportingTo,
  pinToAuthPassword,
  isValidPin,
  SEEDED_USERS,
  getSeededUserByMobile,
  getSeededUserByAuthEmail,
  suggestFromWorkEmail,
  resolveStoredAppRole,
} from '../data/appRoles';
import {
  listLocalUsers,
  getLocalUserByMobile,
  getLocalUserByAuthEmail,
  upsertLocalUser,
  softDeleteLocalUser,
  subscribeLocalUsers,
  mergeUserLists,
} from './localUserStore';
import {
  readSharedUsers,
  upsertSharedUser,
  deactivateSharedUser,
  subscribeSharedUsers,
  refreshApproverIndex,
  readApproverByRole,
  replaceSharedUsers,
} from './sharedUserStore';
export { replaceSharedUsers, refreshApproverIndex } from './sharedUserStore';
export const USERS_COLLECTION = 'appUsers';

/** Secondary Auth app so creating users does not sign out the admin */
function getSecondaryAuth() {
  const name = 'AlubeeSecondary';
  const existing = getApps().find((a) => a.name === name);
  const app = existing || initializeApp(getFirebaseConfig(), name);
  let secondary;
  try {
    secondary = getAuth(app);
  } catch {
    secondary = initializeAuth(app, { persistence: browserSessionPersistence });
  }
  // Session-only — never overwrite the admin's primary IndexedDB session
  try {
    setPersistence(secondary, browserSessionPersistence);
  } catch (_) {}
  return secondary;
}

/**
 * Create Auth for mobile, or reclaim an orphan Auth account (e.g. old built-in admin)
 * and reset its password to the PIN the admin just entered.
 */
async function ensureAuthAccount(secondaryAuth, authEmail, authPassword, mobile) {
  try {
    const credential = await createUserWithEmailAndPassword(secondaryAuth, authEmail, authPassword);
    return credential.user.uid;
  } catch (err) {
    if (err?.code !== 'auth/email-already-in-use') throw err;
  }

  // Already exists — try the PIN the admin entered now
  try {
    const cred = await signInWithEmailAndPassword(secondaryAuth, authEmail, authPassword);
    return cred.user.uid;
  } catch (_) {}

  // Collect known passwords so we can sign in and reset to the new PIN
  const candidates = new Set();
  candidates.add(pinToAuthPassword(mobile, '1430')); // old hardcoded admin PIN
  candidates.add('jeevaMuthu14#'); // older long password

  const local = getLocalUserByMobile(mobile);
  if (local?.pin) candidates.add(pinToAuthPassword(mobile, local.pin));

  try {
    const shared = await readSharedUsers();
    const hit = shared.find((u) => u.mobile === mobile);
    if (hit?.pin) candidates.add(pinToAuthPassword(mobile, hit.pin));
  } catch (_) {}

  for (const legacy of candidates) {
    if (!legacy || legacy === authPassword) continue;
    try {
      const cred = await signInWithEmailAndPassword(secondaryAuth, authEmail, legacy);
      await updatePassword(cred.user, authPassword);
      return cred.user.uid;
    } catch (_) {}
  }

  throw new Error(
    'This mobile already has a login account we cannot reset from here. Delete that user in Firebase Console → Authentication, then create again.'
  );
}

export function profileFromDoc(id, data) {
  if (!data) return null;
  const appRole = resolveStoredAppRole(data);
  const pageAccess = roleHasFullAccess(appRole)
    ? FULL_ACCESS_SCREEN_IDS
    : Array.isArray(data.pageAccess)
      ? data.pageAccess
      : [];

  return {
    id,
    name: data.employeeName || data.name || '',
    email: data.linkedEmail || data.authEmail || data.email || '',
    linkedEmail: data.linkedEmail || '',
    authEmail: data.authEmail || data.email || '',
    employeeId: data.employeeId || '',
    employeeName: data.employeeName || data.name || '',
    mobile: data.mobile || '',
    unit: appRole === 'md' ? '' : (unitForAppRole(appRole, data.unit) || data.unit || 'u1'),
    dept: data.department || data.dept || null,
    department: data.department || data.dept || null,
    appRole,
    role: toLegacyRole(appRole),
    reportingTo: data.reportingTo || '',
    pageAccess,
    pin: data.pin || '',
    authUid: data.authUid || '',
    active: data.active !== false,
    createdAt: data.createdAt || null,
  };
}

function profileFromCacheRecord(u) {
  if (!u) return null;
  return profileFromDoc(u.id, { ...u, appRole: resolveStoredAppRole(u), role: resolveStoredAppRole(u) });
}

async function getAppUserByDocId(id) {
  if (!id) return null;
  try {
    const snap = await getDoc(doc(db, USERS_COLLECTION, id));
    if (snap.exists()) return profileFromDoc(snap.id, snap.data());
  } catch (_) {}
  return null;
}

export async function getUserByMobile(mobile) {
  const seeded = getSeededUserByMobile(mobile);
  if (seeded) return { ...seeded };
  const m = normalizeMobile(mobile);
  if (!m) return null;

  // Direct document id — Android often cannot run collection queries
  const byId = await getAppUserByDocId(`u_${m}`);
  if (byId && byId.active !== false) return byId;

  try {
    const q = query(collection(db, USERS_COLLECTION), where('mobile', '==', m));
    const snap = await getDocs(q);
    if (!snap.empty) {
      const d = snap.docs[0];
      return profileFromDoc(d.id, d.data());
    }
  } catch (err) {
    console.warn('getUserByMobile Firestore unavailable', err?.code || err?.message);
  }

  try {
    const shared = await readSharedUsers();
    const hit = shared.find((u) => u.mobile === m && u.active !== false);
    if (hit) return profileFromCacheRecord(hit);
  } catch (_) {}

  const local = getLocalUserByMobile(m);
  if (local) return profileFromCacheRecord(local);
  return null;
}

export async function getUserByAuthEmail(email) {
  const seeded = getSeededUserByAuthEmail(email);
  if (seeded) return { ...seeded };
  if (!email) return null;
  const e = String(email).toLowerCase();
  const mobileMatch = e.match(/^(\d{10})@mobile\.alubee\.com$/);
  if (mobileMatch) {
    const byMobile = await getUserByMobile(mobileMatch[1]);
    if (byMobile) return byMobile;
  }
  try {
    const q = query(collection(db, USERS_COLLECTION), where('authEmail', '==', e));
    const snap = await getDocs(q);
    if (!snap.empty) {
      const d = snap.docs[0];
      return profileFromDoc(d.id, d.data());
    }
  } catch (err) {
    console.warn('getUserByAuthEmail Firestore unavailable', err?.code || err?.message);
  }
  try {
    const shared = await readSharedUsers();
    const hit = shared.find((u) => (u.authEmail || u.email || '').toLowerCase() === e && u.active !== false);
    if (hit) return profileFromCacheRecord(hit);
  } catch (_) {}
  const local = getLocalUserByAuthEmail(email);
  if (local) return profileFromCacheRecord(local);
  return null;
}

/** Find app user by Work Email (linkedEmail) — keeps mail↔mobile mapping unique. */
export async function getUserByLinkedEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  if (!e) return null;
  try {
    const q = query(collection(db, USERS_COLLECTION), where('linkedEmail', '==', e));
    const snap = await getDocs(q);
    const hit = snap.docs
      .map((d) => profileFromDoc(d.id, d.data()))
      .find((u) => u.active !== false);
    if (hit) return hit;
  } catch (err) {
    console.warn('getUserByLinkedEmail Firestore unavailable', err?.code || err?.message);
  }
  try {
    const shared = await readSharedUsers();
    const hit = shared.find(
      (u) => String(u.linkedEmail || '').toLowerCase() === e && u.active !== false
    );
    if (hit) return profileFromDoc(hit.id, { ...hit, role: hit.appRole || hit.role });
  } catch (_) {}
  const local = listLocalUsers().find(
    (u) => String(u.linkedEmail || '').toLowerCase() === e && u.active !== false
  );
  if (local) return profileFromDoc(local.id, { ...local, role: local.appRole || local.role });
  return null;
}

export async function getUserByAuthUid(uid) {
  if (!uid) return null;
  try {
    const q = query(collection(db, USERS_COLLECTION), where('authUid', '==', uid));
    const snap = await getDocs(q);
    if (!snap.empty) {
      const d = snap.docs[0];
      return profileFromDoc(d.id, d.data());
    }
  } catch (err) {
    console.warn('getUserByAuthUid Firestore unavailable', err?.code || err?.message);
  }
  try {
    const shared = await readSharedUsers();
    const hit = shared.find((u) => u.authUid === uid && u.active !== false);
    if (hit) return profileFromCacheRecord(hit);
  } catch (_) {}
  return null;
}

/** Find active Admin Panel user by app role (jmd_1, jmd_2, md, …) */
export async function findActiveUserByAppRole(appRole) {
  if (!appRole) return null;
  const match = (u) =>
    u &&
    u.active !== false &&
    (u.appRole === appRole || u.role === appRole);

  // Fast path: dedicated approver index (works on Android even if local cache is empty)
  try {
    const indexed = await readApproverByRole(appRole);
    if (indexed?.mobile || indexed?.email) {
      return {
        id: indexed.id || `role_${appRole}`,
        name: indexed.name || appRole,
        email: indexed.email || (indexed.mobile ? `${indexed.mobile}@mobile.alubee.com` : ''),
        authEmail: indexed.email || (indexed.mobile ? `${indexed.mobile}@mobile.alubee.com` : ''),
        mobile: indexed.mobile || '',
        appRole,
        role: toLegacyRole(appRole),
        unit: indexed.unit || '',
        active: true,
      };
    }
  } catch (_) {}

  try {
    const shared = await readSharedUsers();
    const hit = shared.find(match);
    if (hit) return profileFromDoc(hit.id, { ...hit, role: hit.appRole || hit.role });
  } catch (_) {}

  const local = listLocalUsers().find(match);
  if (local) return profileFromDoc(local.id, { ...local, role: local.appRole || local.role });

  try {
    const q = query(collection(db, USERS_COLLECTION), where('role', '==', appRole));
    const snap = await getDocs(q);
    const active = snap.docs
      .map((d) => profileFromDoc(d.id, d.data()))
      .find((u) => u.active !== false);
    if (active) return active;
  } catch (err) {
    console.warn('findActiveUserByAppRole Firestore unavailable', err?.code || err?.message);
  }
  return null;
}

export function subscribeAppUsers(callback) {
  let remote = [];
  let shared = [];
  let local = listLocalUsers();
  let lastJson = '';

  const emit = () => {
    const merged = mergeUserLists(
      [...remote, ...shared],
      local.map((u) => ({ ...u, fromLocal: true }))
    );
    const withSeeds = mergeUserLists(merged, SEEDED_USERS);
    withSeeds.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    const next = withSeeds.map((u) => {
      if (u.appRole && u.name) return u;
      return profileFromDoc(u.id, { ...u, role: u.appRole || u.role });
    });
    // Skip identical snapshots so Admin table does not remount/flicker
    const json = JSON.stringify(
      next.map((u) => ({
        id: u.id,
        name: u.name,
        mobile: u.mobile,
        linkedEmail: u.linkedEmail,
        appRole: u.appRole,
        unit: u.unit,
        dept: u.dept || u.department,
        pageAccess: u.pageAccess,
        active: u.active,
        reportingTo: u.reportingTo,
        employeeId: u.employeeId,
      }))
    );
    if (json === lastJson) return;
    lastJson = json;
    callback(next);
  };

  const unsubLocal = subscribeLocalUsers((list) => {
    local = list;
    emit();
  });

  let unsubRemote = () => {};
  try {
    unsubRemote = onSnapshot(
      collection(db, USERS_COLLECTION),
      (snap) => {
        remote = snap.docs.map((d) => profileFromDoc(d.id, d.data()));
        emit();
      },
      () => {
        remote = [];
        emit();
      }
    );
  } catch {
    emit();
  }

  const unsubShared = subscribeSharedUsers((list) => {
    shared = list.map((u) => profileFromDoc(u.id, { ...u, role: u.appRole || u.role }));
    emit();
  });

  // One-shot background sync of local-only users — do not re-run on every snapshot
  (async () => {
    const locals = listLocalUsers().filter((u) => u.active !== false);
    for (const u of locals) {
      try {
        await upsertSharedUser(u);
      } catch (err) {
        console.warn('shared user sync failed', err?.code || err?.message);
      }
    }
  })();

  return () => {
    unsubLocal && unsubLocal();
    unsubRemote && unsubRemote();
    unsubShared && unsubShared();
  };
}

/** Builtin Admin is always present in code — no empty bootstrap needed. */
export async function isAppUsersEmpty() {
  return false;
}

export async function listAppUsers() {
  const snap = await getDocs(collection(db, USERS_COLLECTION));
  return snap.docs.map((d) => profileFromDoc(d.id, d.data()));
}

/**
 * Create a new app user + Firebase Auth account.
 * If Auth already exists from a previous half-success, completes the profile instead of failing.
 * Always saves a local profile backup so Admin table shows the user even if Firestore is blocked.
 */
export async function createAppUser(payload) {
  const mobile = normalizeMobile(payload.mobile);
  if (!mobile || mobile.length !== 10) {
    throw new Error('Mobile number must be 10 digits');
  }
  if (!isValidPin(payload.pin || payload.password)) {
    throw new Error('PIN must be exactly 4 digits');
  }
  const pin = String(payload.pin || payload.password).replace(/\D/g, '');

  const role = payload.role;
  const unit = unitForAppRole(role, payload.unit);
  const required = ['department', 'employeeId', 'employeeName', 'role'];
  for (const key of required) {
    if (!payload[key]) throw new Error(`${key} is required`);
  }
  if (roleNeedsUnit(role) && !unit) throw new Error('unit is required');

  const existing = await getUserByMobile(mobile);
  if (existing && existing.active !== false) {
    throw new Error('A user with this mobile number already exists');
  }

  const authEmail = mobileToAuthEmail(mobile);
  const authPassword = pinToAuthPassword(mobile, pin);
  const reportingTo = roleNeedsReportingTo(role)
    ? (autoReportingTo(role, unit) || payload.reportingTo || '')
    : '';

  if (roleNeedsReportingTo(role) && !reportingTo) throw new Error('Reporting to is required');

  const linkedEmail = String(payload.linkedEmail || '').trim().toLowerCase();
  const fromLinked =
    !roleHasFullAccess(payload.role) &&
    !(Array.isArray(payload.pageAccess) && payload.pageAccess.length) &&
    linkedEmail
      ? suggestFromWorkEmail(linkedEmail).pageAccess || []
      : [];
  const pageAccess = roleHasFullAccess(payload.role)
    ? FULL_ACCESS_SCREEN_IDS
    : Array.isArray(payload.pageAccess) && payload.pageAccess.length
      ? payload.pageAccess
      : fromLinked;

  if (!roleHasFullAccess(payload.role) && pageAccess.length === 0) {
    throw new Error('Select at least one screen');
  }

  if (linkedEmail) {
    const byLink = await getUserByLinkedEmail(linkedEmail);
    if (byLink && byLink.active !== false) {
      throw new Error(`Work Email ${linkedEmail} is already mapped to another mobile user`);
    }
  }

  const secondaryAuth = getSecondaryAuth();
  let authUid = '';
  try {
    authUid = await ensureAuthAccount(secondaryAuth, authEmail, authPassword, mobile);

    const docId = `u_${mobile}`;
    const record = {
      unit,
      department: payload.department,
      employeeId: String(payload.employeeId).trim(),
      employeeName: String(payload.employeeName).trim(),
      role,
      reportingTo,
      mobile,
      linkedEmail,
      authEmail,
      authUid,
      pageAccess,
      pin,
      pinSet: true,
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    let firestoreSaved = false;
    try {
      await setDoc(doc(db, USERS_COLLECTION, docId), record, { merge: true });
      firestoreSaved = true;
    } catch (err) {
      console.warn('Firestore appUsers save blocked; using local backup', err?.code || err?.message);
    }

    const profile = profileFromDoc(docId, {
      ...record,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    upsertLocalUser({ ...profile, pin, fromLocal: !firestoreSaved });
    try {
      await upsertSharedUser({ ...profile, pin });
    } catch (err) {
      console.warn('shared user save failed', err?.code || err?.message);
    }

    return profile;
  } finally {
    try {
      await signOut(secondaryAuth);
    } catch (_) {}
  }
}

export async function updateAppUser(userId, payload) {
  if (!userId) {
    throw new Error('User id is required');
  }

  let existing = null;
  let fromFirestore = false;
  try {
    const ref = doc(db, USERS_COLLECTION, userId);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      existing = snap.data();
      fromFirestore = true;
    }
  } catch (_) {}

  if (!existing) {
    const local = listLocalUsers().find((u) => u.id === userId);
    if (!local) throw new Error('User not found');
    existing = {
      ...local,
      role: local.appRole || local.role,
      department: local.department || local.dept,
      employeeName: local.employeeName || local.name,
      authEmail: local.email || local.authEmail,
    };
  }

  const role = payload.role || existing.role;
  const unit = unitForAppRole(role, payload.unit !== undefined ? payload.unit : existing.unit);
  const department = payload.department || existing.department;
  const employeeId = String(payload.employeeId ?? existing.employeeId).trim();
  const employeeName = String(payload.employeeName ?? existing.employeeName).trim();
  const reportingTo = roleNeedsReportingTo(role)
    ? (autoReportingTo(role, unit) || payload.reportingTo || existing.reportingTo || '')
    : '';

  if (!department || !employeeId || !employeeName || !role) {
    throw new Error('All fields are mandatory');
  }
  if (roleNeedsUnit(role) && !unit) throw new Error('Unit is required');
  if (roleNeedsReportingTo(role) && !reportingTo) throw new Error('Reporting to is required');

  const pageAccess = roleHasFullAccess(role)
    ? FULL_ACCESS_SCREEN_IDS
    : Array.isArray(payload.pageAccess)
      ? payload.pageAccess
      : existing.pageAccess || [];

  if (!roleHasFullAccess(role) && pageAccess.length === 0) {
    throw new Error('Select at least one screen');
  }

  const updates = {
    unit,
    department,
    employeeId,
    employeeName,
    role,
    reportingTo,
    pageAccess,
    updatedAt: serverTimestamp(),
  };

  if (payload.linkedEmail !== undefined) {
    updates.linkedEmail = String(payload.linkedEmail || '').trim().toLowerCase();
    if (updates.linkedEmail) {
      const byLink = await getUserByLinkedEmail(updates.linkedEmail);
      if (byLink && byLink.active !== false && byLink.id !== userId) {
        throw new Error(`Work Email ${updates.linkedEmail} is already mapped to another mobile user`);
      }
    }
  }

  if (payload.pin) {
    if (!isValidPin(payload.pin)) throw new Error('PIN must be exactly 4 digits');
    const pin = String(payload.pin).replace(/\D/g, '');
    const mobile = existing.mobile;
    const authEmail = existing.authEmail || mobileToAuthEmail(mobile);
    const newAuthPassword = pinToAuthPassword(mobile, pin);
    const secondaryAuth = getSecondaryAuth();
    try {
      const oldPin = existing.pin;
      if (oldPin) {
        try {
          await signInWithEmailAndPassword(secondaryAuth, authEmail, pinToAuthPassword(mobile, oldPin));
          if (secondaryAuth.currentUser) await updatePassword(secondaryAuth.currentUser, newAuthPassword);
        } catch {
          try {
            await signInWithEmailAndPassword(secondaryAuth, authEmail, newAuthPassword);
          } catch (e2) {
            if (e2?.code === 'auth/user-not-found') {
              await createUserWithEmailAndPassword(secondaryAuth, authEmail, newAuthPassword);
            }
          }
        }
      } else {
        try {
          await signInWithEmailAndPassword(secondaryAuth, authEmail, newAuthPassword);
        } catch (e2) {
          if (e2?.code === 'auth/user-not-found') {
            await createUserWithEmailAndPassword(secondaryAuth, authEmail, newAuthPassword);
          }
        }
      }
      updates.pin = pin;
      updates.pinSet = true;
    } finally {
      try { await signOut(secondaryAuth); } catch (_) {}
    }
  }

  if (fromFirestore) {
    try {
      await updateDoc(doc(db, USERS_COLLECTION, userId), updates);
    } catch (err) {
      console.warn('Firestore update blocked; updating local backup', err?.code || err?.message);
    }
  }

  const profile = profileFromDoc(userId, { ...existing, ...updates, updatedAt: new Date().toISOString() });
  upsertLocalUser({ ...profile, pin: updates.pin || existing.pin || '', fromLocal: true });
  try {
    await upsertSharedUser({ ...profile, pin: updates.pin || existing.pin || '' });
  } catch (err) {
    console.warn('shared user update failed', err?.code || err?.message);
  }
  return profile;
}

/** Soft-delete: marks inactive. Does not wipe other Firebase data. */
export async function deleteAppUser(userId) {
  if (!userId) {
    throw new Error('User id is required');
  }
  try {
    const ref = doc(db, USERS_COLLECTION, userId);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, {
        active: false,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    console.warn('Firestore delete blocked; soft-deleting local backup', err?.code || err?.message);
  }
  softDeleteLocalUser(userId);
  try {
    await deactivateSharedUser(userId);
  } catch (err) {
    console.warn('shared user delete failed', err?.code || err?.message);
  }
}

export async function updateAppUserAccess(userId, { pageAccess, reportingTo, active, department, role }) {
  const ref = doc(db, USERS_COLLECTION, userId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('User not found');
  const data = snap.data();
  const nextRole = role || data.role;
  const updates = {
    updatedAt: serverTimestamp(),
  };
  if (pageAccess !== undefined) {
    updates.pageAccess = roleHasFullAccess(nextRole) ? FULL_ACCESS_SCREEN_IDS : pageAccess;
  }
  if (reportingTo !== undefined) updates.reportingTo = reportingTo;
  if (active !== undefined) updates.active = active;
  if (department !== undefined) updates.department = department;
  if (role !== undefined) updates.role = role;
  await updateDoc(ref, updates);
}

export async function loginWithMobile(mobile, pin) {
  const m = normalizeMobile(mobile);
  if (!m || m.length !== 10) throw new Error('Enter a valid 10-digit mobile number');
  if (!isValidPin(pin)) throw new Error('Enter a valid 4-digit PIN');

  const authEmail = mobileToAuthEmail(m);
  const authPassword = pinToAuthPassword(m, pin);

  // Auth FIRST — Android often cannot read user profiles until signed in
  try {
    await signInWithEmailAndPassword(auth, authEmail, authPassword);
  } catch (err) {
    const code = err?.code || '';
    if (
      code === 'auth/user-not-found' ||
      code === 'auth/invalid-email'
    ) {
      throw new Error('No account found for this mobile number. Contact Admin.');
    }
    if (
      code === 'auth/wrong-password' ||
      code === 'auth/invalid-credential' ||
      code === 'auth/invalid-login-credentials'
    ) {
      throw new Error('Incorrect mobile number or PIN.');
    }
    throw new Error(err?.message || 'Login failed. Check mobile and PIN.');
  }

  // Now load profile (shared Firestore / local / appUsers) after Auth
  let profile =
    (await getUserByMobile(m)) ||
    (await getUserByAuthEmail(authEmail)) ||
    (auth.currentUser ? await getUserByAuthUid(auth.currentUser.uid) : null);

  if (!profile) {
    // Auth ok but profile missing — keep a usable local profile so the app can open
    profile = {
      id: `u_${m}`,
      mobile: m,
      email: authEmail,
      authEmail,
      name: m,
      employeeName: m,
      employeeId: '',
      unit: 'u1',
      dept: '',
      department: '',
      appRole: 'member_employee',
      role: 'member',
      pageAccess: [],
      reportingTo: '',
      active: true,
      authUid: auth.currentUser?.uid || '',
    };
  }

  if (profile.active === false) {
    try { await signOut(auth); } catch (_) {}
    throw new Error('This account is inactive. Contact Admin.');
  }

  // Cache on device so next login / Admin list works offline on this phone
  try {
    upsertLocalUser({ ...profile, pin, fromLocal: true });
  } catch (_) {}

  return profile;
}



