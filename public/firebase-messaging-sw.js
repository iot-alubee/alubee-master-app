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

function payloadFromPush(event) {
  if (!event.data) return {};
  try {
    return event.data.json() || {};
  } catch (_) {
    try {
      return { data: { body: event.data.text() } };
    } catch (e) {
      return {};
    }
  }
}

self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    const payload = payloadFromPush(event);
    const n = payload.notification || {};
    const d = payload.data || {};
    const title = n.title || d.title || 'Alubee';
    const body = n.body || d.body || 'New Alubee update';
    await self.registration.showNotification(title, {
      body,
      data: { ...n, ...d },
      tag: String(d.requestId || d.taskId || title),
      renotify: true,
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const screen = data.screen || 'dashboard';
  const params = new URLSearchParams();
  params.set('screen', screen);
  if (data.tab) params.set('tab', data.tab);
  if (data.requestId) params.set('requestId', data.requestId);
  if (data.taskId) params.set('taskId', data.taskId);
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
