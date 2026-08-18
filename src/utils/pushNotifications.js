// Push: save token for tasks (fcm_tokens) + requests (alubee_app_fcm_tokens).
// Native Android uses Capacitor FCM. iPhone home-screen / web uses Firebase web push.

import { doc, setDoc, getDoc } from 'firebase/firestore';
import app, { db, getWebPushVapidKey } from '../firebase';
import { normalizeAppMobile, getProfileMobile } from './requestService';
import { flattenNotifData, storePendingNotifTap } from './mobileApp';

const FCM_COL = 'fcm_tokens';
const FCM_BACKUP_DOC = 'alubee_app_fcm_tokens';
const CHANNEL_ID = 'alubee_tasks';

let isNative = false;
try {
  isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
} catch (_) {}

let listenersReady = false;
let webListenersReady = false;
let currentProfile = null;

export function isNativeApp() {
  return isNative;
}

function isIosDevice() {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isStandaloneDisplay() {
  try {
    return window.navigator.standalone === true
      || window.matchMedia('(display-mode: standalone)').matches;
  } catch {
    return false;
  }
}

function intentFromData(raw) {
  const data = flattenNotifData(raw || {});
  const type = data.type || '';
  const screen =
    data.screen ||
    (type === 'request' || type === 'od' ? 'requests' : type === 'task' || type === 'task_assigned' ? 'tasks' : 'dashboard');
  return {
    tapped: true,
    screen,
    tab: data.tab || null,
    taskId: data.taskId || null,
    requestId: data.requestId || null,
    type: type || null,
  };
}

function dispatchNotifTap(intent) {
  storePendingNotifTap(intent);
  window.dispatchEvent(new CustomEvent('alubee_notification_tap', { detail: intent }));
}

async function saveTokenForUser(tokenValue, userProfile) {
  const profile = userProfile || currentProfile;
  if (!profile || !tokenValue) return;
  const mobile = getProfileMobile(profile) || normalizeAppMobile(profile?.mobile);
  const userId = profile?.id || mobile || 'unknown';
  const workEmail = String(profile?.linkedEmail || profile?.email || profile?.authEmail || '').toLowerCase();
  const platform = isNative ? 'android' : 'web';
  const base = {
    userId,
    userName: profile?.name || profile?.employeeName || '',
    mobile: mobile || '',
    email: workEmail,
    linkedEmail: workEmail,
    appRole: profile?.appRole || '',
    role: profile?.role || profile?.appRole || 'member',
    unit: profile?.unit || 'u1',
    dept: profile?.dept || profile?.department || '',
    platform,
    updatedAt: new Date().toISOString(),
  };

  async function mergeInto(ref) {
    const snap = await getDoc(ref);
    const prev = snap.exists() ? snap.data() : {};
    const tokens = [...new Set([...(prev.tokens || []), prev.token, prev.webToken, tokenValue].filter(Boolean))];
    const next = {
      ...base,
      tokens,
      token: platform === 'android' ? tokenValue : (prev.androidToken || prev.token || tokenValue),
    };
    if (platform === 'web') next.webToken = tokenValue;
    else next.androidToken = tokenValue;
    await setDoc(ref, next, { merge: true });
  }

  if (mobile) {
    try {
      await mergeInto(doc(db, FCM_COL, mobile));
    } catch (err) {
      console.warn('fcm_tokens mobile save failed', err?.code || err?.message);
    }
  }
  if (userId && userId !== mobile) {
    try {
      await mergeInto(doc(db, FCM_COL, String(userId)));
    } catch (err) {
      console.warn('fcm_tokens userId save failed', err?.code || err?.message);
    }
  }
  if (workEmail && workEmail.includes('@') && !workEmail.endsWith('@mobile.alubee.com')) {
    try {
      await mergeInto(doc(db, FCM_COL, workEmail.replace(/[@.]/g, '_')));
    } catch (_) {}
  }

  if (mobile) {
    try {
      const ref = doc(db, 'working_days_config', FCM_BACKUP_DOC);
      const snap = await getDoc(ref);
      const items = snap.exists() ? { ...(snap.data()?.items || {}) } : {};
      const prev = items[mobile] || {};
      const tokens = [...new Set([...(prev.tokens || []), prev.token, prev.webToken, tokenValue].filter(Boolean))];
      items[mobile] = {
        ...base,
        tokens,
        token: platform === 'android' ? tokenValue : (prev.androidToken || prev.token || tokenValue),
        ...(platform === 'web' ? { webToken: tokenValue } : { androidToken: tokenValue }),
      };
      await setDoc(ref, { items, updatedAt: new Date().toISOString() }, { merge: true });
    } catch (err) {
      console.warn('fcm backup save failed', err?.code || err?.message);
    }
  }
}

function attachWebTapListeners() {
  if (webListenersReady || typeof window === 'undefined') return;
  webListenersReady = true;

  if (navigator.serviceWorker) {
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type !== 'alubee_notification_tap') return;
      dispatchNotifTap(intentFromData(event.data.data || {}));
    });
  }

  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('screen') || params.get('requestId') || params.get('taskId')) {
      dispatchNotifTap(intentFromData({
        screen: params.get('screen'),
        tab: params.get('tab'),
        requestId: params.get('requestId'),
        taskId: params.get('taskId'),
      }));
    }
  } catch (_) {}
}

async function registerWebToken(userProfile) {
  const { getMessaging, getToken, onMessage, isSupported } = await import('firebase/messaging');
  const supported = await isSupported();
  if (!supported) throw new Error('Web push is not supported in this browser. On iPhone, open Alubee from the Home Screen icon (Safari).');

  const vapidKey = getWebPushVapidKey();
  if (!vapidKey) throw new Error('Missing web push key. Add FIREBASE_VAPID_KEY on Cloud Run (Firebase Console → Project settings → Cloud Messaging → Web Push certificates).');

  const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' });
  await navigator.serviceWorker.ready;

  const messaging = getMessaging(app);
  const token = await getToken(messaging, {
    vapidKey,
    serviceWorkerRegistration: registration,
  });
  if (!token) throw new Error('Could not get a notification token');
  await saveTokenForUser(token, userProfile);

  if (!listenersReady) {
    listenersReady = true;
    onMessage(messaging, (payload) => {
      const title = payload?.notification?.title || payload?.data?.title || 'Alubee';
      const body = payload?.notification?.body || payload?.data?.body || '';
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && body) {
        try {
          const n = new Notification(title, { body, icon: '/alubee-icon.svg', data: payload?.data || {} });
          n.onclick = () => {
            dispatchNotifTap(intentFromData(payload?.data || {}));
            window.focus();
          };
        } catch (_) {}
      }
    });
  }
  return token;
}

export function getWebPushPromptState() {
  if (isNative || typeof window === 'undefined') return { show: false, message: '', canEnable: false };
  if (typeof Notification === 'undefined' || !('serviceWorker' in navigator)) {
    return {
      show: isIosDevice(),
      canEnable: false,
      message: 'This iPhone needs iOS 16.4+. Add Alubee to the Home Screen from Safari, then open that icon.',
    };
  }
  if (isIosDevice() && !isStandaloneDisplay()) {
    return {
      show: true,
      canEnable: false,
      message: 'On iPhone, add this site to the Home Screen from Safari, then open that Alubee icon to enable alerts.',
    };
  }
  if (Notification.permission === 'granted') return { show: false, message: '', canEnable: false };
  if (Notification.permission === 'denied') {
    return {
      show: true,
      canEnable: false,
      message: 'Notifications are blocked. On iPhone: Settings → Alubee → Notifications → Allow.',
    };
  }
  return {
    show: true,
    canEnable: true,
    message: 'Tap Enable so Alubee can send request and task alerts on this iPhone.',
  };
}

export async function enableWebPushFromUserGesture(userProfile) {
  currentProfile = userProfile || currentProfile;
  attachWebTapListeners();
  if (typeof Notification === 'undefined') {
    throw new Error('Notifications are not available in this browser');
  }
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Notification permission was not allowed');
  await registerWebToken(currentProfile);
}

async function initWebPush(userProfile) {
  attachWebTapListeners();
  if (typeof Notification === 'undefined' || !('serviceWorker' in navigator)) return;
  if (Notification.permission === 'granted') {
    try {
      await registerWebToken(userProfile);
    } catch (err) {
      console.warn('Web push token refresh failed', err?.message || err);
    }
    return;
  }
  if (Notification.permission === 'default' && !isIosDevice()) {
    try {
      const perm = await Notification.requestPermission();
      if (perm === 'granted') await registerWebToken(userProfile);
    } catch (err) {
      console.warn('Web push permission failed', err?.message || err);
    }
  }
}

export async function initPushNotifications(userProfile, onNotificationReceived) {
  if (!userProfile) return;
  currentProfile = userProfile;

  if (!isNative) {
    await initWebPush(userProfile);
    return;
  }

  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');

    try {
      await PushNotifications.createChannel({
        id: CHANNEL_ID,
        name: 'Alubee Alerts',
        description: 'Tasks, security, and request alerts',
        importance: 5,
        visibility: 1,
        sound: 'default',
        vibration: true,
      });
      await PushNotifications.createChannel({
        id: 'alubee_app',
        name: 'Alubee Requests',
        description: 'OD and request approval alerts',
        importance: 5,
        visibility: 1,
        sound: 'default',
        vibration: true,
      });
    } catch (err) {
      console.warn('createChannel', err?.message || err);
    }

    const permission = await PushNotifications.requestPermissions();
    if (permission.receive !== 'granted') {
      console.log('Push notification permission denied');
      return;
    }

    if (!listenersReady) {
      listenersReady = true;

      PushNotifications.addListener('registration', async (token) => {
        try {
          await saveTokenForUser(token.value, currentProfile);
        } catch (err) {
          console.error('save FCM token failed', err);
        }
      });

      PushNotifications.addListener('pushNotificationReceived', (notification) => {
        if (onNotificationReceived) onNotificationReceived(notification);
      });

      PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
        const intent = intentFromData(action.notification?.data || {});
        dispatchNotifTap(intent);
        setTimeout(() => dispatchNotifTap(intent), 1200);
        if (onNotificationReceived) onNotificationReceived(intent);
      });

      PushNotifications.addListener('registrationError', (err) => {
        console.error('Push registration error:', err);
      });
    }

    await PushNotifications.register();
  } catch (e) {
    console.error('Push notifications init error:', e);
  }
}

export async function sendPushToUser() {}
export async function sendPushToMobile() {}
