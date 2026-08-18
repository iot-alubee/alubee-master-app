import React, { createContext, useContext, useEffect, useState } from 'react';
import { signOut, onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';
import { getUserByEmail } from '../data/orgData';
import {
  FULL_ACCESS_SCREEN_IDS,
  roleHasFullAccess,
  toLegacyRole,
  getSeededUserByAuthEmail,
} from '../data/appRoles';
import {
  getUserByAuthEmail,
  getUserByAuthUid,
  getUserByMobile,
  loginWithMobile,
} from '../utils/userService';

const AuthContext = createContext();
export const useAuth = () => useContext(AuthContext);

function mergeLegacyProfile(user) {
  const legacy = getUserByEmail(user?.email);
  if (!legacy) return null;
  const appRole =
    legacy.role === 'owner'
      ? legacy.email === 'md@alubee.com'
        ? 'md'
        : 'admin'
      : legacy.role === 'dept_head'
        ? 'member_supervisor'
        : 'member_employee';
  return {
    ...legacy,
    appRole,
    role: toLegacyRole(appRole),
    pageAccess: roleHasFullAccess(appRole) ? FULL_ACCESS_SCREEN_IDS : FULL_ACCESS_SCREEN_IDS.filter((id) => id !== 'admin'),
    employeeName: legacy.name,
    mobile: '',
    reportingTo: '',
    fromLegacy: true,
  };
}

function mobileFromAuthEmail(email) {
  const e = String(email || '').toLowerCase();
  const m = e.match(/^(\d{10})@mobile\.alubee\.com$/);
  return m ? m[1] : '';
}

function withAuthMobile(profile, user) {
  if (!profile) return null;
  const fromAuth = mobileFromAuthEmail(user?.email);
  const mobile = String(profile.mobile || '').replace(/\D/g, '').slice(-10) || fromAuth;
  return {
    ...profile,
    mobile: mobile || profile.mobile || '',
    email: profile.email || user?.email || '',
    authEmail: profile.authEmail || user?.email || '',
  };
}

async function resolveProfile(user) {
  if (!user) return null;
  const seeded = getSeededUserByAuthEmail(user.email);
  if (seeded) return withAuthMobile({ ...seeded }, user);
  try {
    const byUid = await getUserByAuthUid(user.uid);
    if (byUid) return withAuthMobile(byUid, user);
    const byEmail = await getUserByAuthEmail(user.email);
    if (byEmail) return withAuthMobile(byEmail, user);
    const mobile = mobileFromAuthEmail(user.email);
    if (mobile) {
      const byMobile = await getUserByMobile(mobile);
      if (byMobile) return withAuthMobile(byMobile, user);
    }
  } catch (err) {
    console.warn('Firestore profile lookup failed', err?.code || err?.message);
  }
  return withAuthMobile(mergeLegacyProfile(user), user);
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const login = async (mobile, pin) => {
    const profile = await loginWithMobile(mobile, pin);
    if (profile) {
      const m = String(mobile || '').replace(/\D/g, '').slice(-10);
      setUserProfile({
        ...profile,
        mobile: profile.mobile || m,
        email: profile.email || (m ? `${m}@mobile.alubee.com` : ''),
        authEmail: profile.authEmail || profile.email || (m ? `${m}@mobile.alubee.com` : ''),
      });
    }
    return profile;
  };
  const logout = () => signOut(auth);

  useEffect(() => {
    return onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (!user) {
        setUserProfile(null);
        setLoading(false);
        return;
      }
      try {
        const profile = await resolveProfile(user);
        if (profile) {
          // Keep existing profile object when same person — avoids Admin remount flicker
          setUserProfile((prev) => {
            if (
              prev &&
              prev.id === profile.id &&
              prev.mobile === profile.mobile &&
              prev.appRole === profile.appRole &&
              prev.authUid === profile.authUid
            ) {
              return prev;
            }
            return profile;
          });
        }
      } catch (err) {
        console.error('resolveProfile failed', err);
        setUserProfile((prev) => prev || mergeLegacyProfile(user));
      }
      setLoading(false);
    });
  }, []);

  return (
    <AuthContext.Provider value={{ currentUser, userProfile, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}
