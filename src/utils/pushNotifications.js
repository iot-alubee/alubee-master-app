// Push: save token for tasks (fcm_tokens) + requests (alubee_app_fcm_tokens).
// Tap opens the correct screen from payload (requests / tasks / security / …).

import { doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
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
let currentProfile = null;

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
  const payload = {
    token: tokenValue,
    userId,
    userName: profile?.name || profile?.employeeName || '',
    mobile: mobile || '',
    email: workEmail,
    linkedEmail: workEmail,
    appRole: profile?.appRole || '',
    role: profile?.role || profile?.appRole || 'member',
    unit: profile?.unit || 'u1',
    dept: profile?.dept || profile?.department || '',
    updatedAt: new Date().toISOString(),
  };

  // Task / security / legacy Cloud Functions look here
  if (mobile) {
    try {
      await setDoc(doc(db, FCM_COL, mobile), payload, { merge: true });
    } catch (err) {
      console.warn('fcm_tokens mobile save failed', err?.code || err?.message);
    }
  }
  if (userId && userId !== mobile) {
    try {
      await setDoc(doc(db, FCM_COL, String(userId)), payload, { merge: true });
    } catch (err) {
      console.warn('fcm_tokens userId save failed', err?.code || err?.message);
    }
  }
  if (workEmail && workEmail.includes('@') && !workEmail.endsWith('@mobile.alubee.com')) {
    try {
      await setDoc(doc(db, FCM_COL, workEmail.replace(/[@.]/g, '_')), payload, { merge: true });
    } catch (_) {}
  }

  // Request OD pushes (our store)
  if (mobile) {
    try {
      const ref = doc(db, 'working_days_config', FCM_BACKUP_DOC);
      const snap = await getDoc(ref);
      const items = snap.exists() ? { ...(snap.data()?.items || {}) } : {};
      items[mobile] = payload;
      await setDoc(ref, { items, updatedAt: new Date().toISOString() }, { merge: true });
    } catch (err) {
      console.warn('fcm backup save failed', err?.code || err?.message);
    }
  }
}

export async function initPushNotifications(userProfile, onNotificationReceived) {
  if (!isNative || !userProfile) return;
  currentProfile = userProfile;

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
        const data = flattenNotifData(action.notification?.data || {});
        const type = data.type || '';
        const screen =
          data.screen ||
          (type === 'request' || type === 'od' ? 'requests' : type === 'task' || type === 'task_assigned' ? 'tasks' : 'dashboard');
        const intent = {
          tapped: true,
          screen,
          tab: data.tab || null,
          taskId: data.taskId || null,
          requestId: data.requestId || null,
          type: type || null,
        };
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
