import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

export function getFirebaseConfig() {
  const runtime = (typeof window !== 'undefined' && window.__ALUBEE_FIREBASE__) || {};
  const config = {
    apiKey: runtime.apiKey || process.env.REACT_APP_FIREBASE_API_KEY,
    authDomain: runtime.authDomain || process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
    projectId: runtime.projectId || process.env.REACT_APP_FIREBASE_PROJECT_ID,
    storageBucket: runtime.storageBucket || process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: runtime.messagingSenderId || process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
    appId: runtime.appId || process.env.REACT_APP_FIREBASE_APP_ID,
  };
  if (!config.apiKey || !config.projectId) {
    throw new Error(
      'Firebase config missing. Set Cloud Run env vars, or create Production/.env.local for local dev.'
    );
  }
  return config;
}

export function getWebPushVapidKey() {
  const runtime = (typeof window !== 'undefined' && window.__ALUBEE_FIREBASE__) || {};
  return runtime.vapidKey || process.env.REACT_APP_FIREBASE_VAPID_KEY || '';
}

const app = initializeApp(getFirebaseConfig());
export const auth = getAuth(app);
export const db = getFirestore(app);
export default app;
