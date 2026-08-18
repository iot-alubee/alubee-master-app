/* global firebase, clients, self */
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js');

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

async function initFirebaseMessaging() {
  try {
    const res = await fetch('/firebase-runtime-config.json', { cache: 'no-store' });
    if (!res.ok) return;
    const cfg = await res.json();
    if (!cfg?.apiKey || !cfg?.projectId) return;
    if (!firebase.apps.length) firebase.initializeApp(cfg);
    const messaging = firebase.messaging();
    messaging.onBackgroundMessage((payload) => {
      if (payload?.notification) return;
      const title = payload?.data?.title || 'Alubee';
      const body = payload?.data?.body || '';
      return self.registration.showNotification(title, {
        body,
        icon: '/alubee-icon.svg',
        data: payload?.data || {},
      });
    });
  } catch (err) {
    console.warn('firebase-messaging-sw init failed', err);
  }
}

initFirebaseMessaging();

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
