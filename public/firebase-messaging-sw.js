importScripts('https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js');
importScripts('https://www.gstatic.com/firebasejs/8.10.1/firebase-messaging.js');

firebase.initializeApp({
    apiKey: "AIzaSyBteerjkGJMvqxUhLFQyvU5JaVG-Rs-YrM",
    authDomain: "sunrise-463bb.firebaseapp.com",
    projectId: "sunrise-463bb",
    storageBucket: "sunrise-463bb.firebasestorage.app",
    messagingSenderId: "665993554152",
    appId: "1:665993554152:web:f2205b4d855f34420c015d",
    
});

const messaging = firebase.messaging();

// Handle background messages
messaging.setBackgroundMessageHandler(function(payload) {
  console.log('[SW] Background message:', payload);

  const notification = payload && payload.notification ? payload.notification : {};
  const title = notification.title || (payload && payload.data && payload.data.title) || 'Notification';
  const body = notification.body || (payload && payload.data && payload.data.body) || '';

  const notificationOptions = {
    body: body,
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    data: payload && payload.data ? payload.data : {},
    tag: 'notification',
    requireInteraction: false
  };

  return self.registration.showNotification(title, notificationOptions);
});

// Handle message in service worker (modern approach)
self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  const urlToOpen = '/createevent';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      // Check if there's already a window/tab with the target URL open and focused
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      // If not, open a new window/tab with the target URL
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

self.addEventListener('notificationclose', function(event) {
  console.log('[SW] Notification closed:', event.notification.tag);
});