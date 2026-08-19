// Local backup for app users when Firestore rules block `appUsers` writes.
// Does not delete or modify any existing Firebase collections.

const KEY = 'alubee_local_app_users_v1';

function readAll() {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(list) {
  localStorage.setItem(KEY, JSON.stringify(list));
  window.dispatchEvent(new CustomEvent('alubee_local_users_changed'));
}

export function listLocalUsers() {
  return readAll();
}

export function getLocalUserByMobile(mobile) {
  const m = String(mobile || '').replace(/\D/g, '').slice(-10);
  return readAll().find((u) => u.mobile === m && u.active !== false) || null;
}

export function getLocalUserById(id) {
  return readAll().find((u) => u.id === id) || null;
}

export function getLocalUserByAuthEmail(email) {
  if (!email) return null;
  const e = String(email).toLowerCase();
  return readAll().find((u) => (u.email || u.authEmail || '').toLowerCase() === e && u.active !== false) || null;
}

export function upsertLocalUser(profile) {
  if (!profile?.id) return;
  const list = readAll();
  const idx = list.findIndex((u) => u.id === profile.id || (profile.mobile && u.mobile === profile.mobile));
  const next = {
    ...profile,
    updatedAt: new Date().toISOString(),
    appRole: profile.appRole || profile.role || '',
    role: profile.role,
  };
  if (idx >= 0) list[idx] = { ...list[idx], ...next, appRole: next.appRole, role: next.role };
  else list.push(next);
  writeAll(list);
  return next;
}

export function softDeleteLocalUser(id) {
  const list = readAll().map((u) => (u.id === id ? { ...u, active: false, updatedAt: new Date().toISOString() } : u));
  writeAll(list);
}

export function subscribeLocalUsers(callback) {
  const emit = () => callback(readAll());
  emit();
  const handler = () => emit();
  window.addEventListener('alubee_local_users_changed', handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener('alubee_local_users_changed', handler);
    window.removeEventListener('storage', handler);
  };
}

export function mergeUserLists(remoteList, localList) {
  const map = new Map();
  [...(remoteList || []), ...(localList || [])].forEach((u) => {
    if (!u) return;
    const key = u.mobile || u.id;
    if (!key) return;
    const prev = map.get(key);
    if (!prev) {
      map.set(key, u);
      return;
    }
    // Prefer active remote; otherwise keep whichever is newer/has more fields
    if (prev.active === false && u.active !== false) map.set(key, u);
    else if (u.fromLocal && !prev.fromLocal && prev.active !== false) {
      // keep remote if present
    } else if (!prev.fromLocal && u.fromLocal) {
      // keep remote
    } else {
      map.set(key, { ...prev, ...u });
    }
  });
  return Array.from(map.values());
}
