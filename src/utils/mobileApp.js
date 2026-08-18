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
  return { ...nested, ...data };
}
