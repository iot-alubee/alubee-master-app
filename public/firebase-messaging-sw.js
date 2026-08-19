/* global firebase, clients, self */
importScripts('/firebase-sw-config.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js');

if (self.__ALUBEE_FIREBASE_SW__ && self.__ALUBEE_FIREBASE_SW__.apiKey) {
  if (!firebase.apps.length) firebase.initializeApp(self.__ALUBEE_FIREBASE_SW__);
  try { firebase.messaging(); } catch (_) {}
}

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

function notifPayload(notification) {
  const data = Object.assign({}, notification && notification.data);
  if (data.FCM_MSG && typeof data.FCM_MSG === 'object') {
    const inner = data.FCM_MSG.data || data.FCM_MSG;
    Object.assign(data, inner);
  }
  return data;
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = notifPayload(event.notification);
  const screen = data.screen || 'dashboard';
  const params = new URLSearchParams();
  params.set('screen', screen);
  if (data.tab) params.set('tab', data.tab);
  if (data.requestId) params.set('requestId', data.requestId);
  if (data.taskId) params.set('taskId', data.taskId);
  if (data.type) params.set('type', data.type);
  if (data.pendingApproval) params.set('pendingApproval', data.pendingApproval);
  const url = '/dashboard?' + params.toString();

  event.waitUntil((async () => {
    const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      try {
        client.postMessage({ type: 'alubee_notification_tap', data });
      } catch (_) {}
      if ('focus' in client) return client.focus();
    }
    if (clients.openWindow) return clients.openWindow(url);
  })());
});
