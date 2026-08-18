import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const _a = "AIzaSyCJkWS0OjEbyAAiFCH7NRmIzfpLAZNP1iU";
const _b = "alubee-tasks.firebaseapp.com";
const _c = "alubee-tasks";
const _d = "alubee-tasks.firebasestorage.app";
const _e = "709761987440";
const _f = "1:709761987440:web:baa05c51002625433195b5";

const firebaseConfig = {
  apiKey:            _a,
  authDomain:        _b,
  projectId:         _c,
  storageBucket:     _d,
  messagingSenderId: _e,
  appId:             _f,
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export default app;
