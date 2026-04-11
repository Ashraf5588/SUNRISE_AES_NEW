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
messaging.setBackgroundMessageHandler(function(payload) {
  console.log('[SW] Background message ', payload);

  const notification = payload && payload.notification ? payload.notification : {};
  const title = notification.title || (payload && payload.data && payload.data.title) || 'Notification';
  const body = notification.body || (payload && payload.data && payload.data.body) || '';

  return self.registration.showNotification(title, {
    body,
    icon: '/favicon.ico',
    data: payload && payload.data ? payload.data : {}
  });
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (const client of clientList) {
        if ('focus' in client) {
          if ('navigate' in client) {
            return client.navigate('/createevent').then(() => client.focus());
          }
          return client.focus();
        }
      }

      if (clients.openWindow) {
        return clients.openWindow('/createevent');
      }
    })
  );
});