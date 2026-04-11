(() => {
  const firebaseConfig = {
    apiKey: "AIzaSyBteerjkGJMvqxUhLFQyvU5JaVG-Rs-YrM",
    authDomain: "sunrise-463bb.firebaseapp.com",
    projectId: "sunrise-463bb",
    storageBucket: "sunrise-463bb.firebasestorage.app",
    messagingSenderId: "665993554152",
    appId: "1:665993554152:web:f2205b4d855f34420c015d"
  };

  const vapidKey = "BAOLlDJ3q2msIM3ZutRA_bHOfOftrrLsQ1iSKuVwzXhPCnIgW--bwarA7koWxSXaCI5DAkeKEwlmFZKVioeZZt8";
  let started = false;

  const showNotification = async (payload) => {
    const notification = payload && payload.notification ? payload.notification : {};
    const title = notification.title || (payload && payload.data && payload.data.title) || 'Notification';
    const body = notification.body || (payload && payload.data && payload.data.body) || '';

    if (Notification.permission !== 'granted') {
      return;
    }

    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification(title, {
        body,
        icon: '/favicon.ico',
        data: payload && payload.data ? payload.data : {}
      });
      return;
    }

    new Notification(title, {
      body,
      icon: '/favicon.ico'
    });
  };

  async function initFcm() {
    if (started) {
      return;
    }
    started = true;

    if (!window.firebase || !firebase.messaging) {
      console.warn('Firebase messaging script is not loaded.');
      return;
    }

    if (!('serviceWorker' in navigator) || !('Notification' in window) || !('PushManager' in window)) {
      console.warn('Push notifications are not supported in this browser.');
      return;
    }

    if (!window.isSecureContext) {
      console.warn('Push notifications require HTTPS or localhost.');
      return;
    }

    firebase.initializeApp(firebaseConfig);

    const messaging = firebase.messaging();

    messaging.onMessage(async (payload) => {
      console.log('Foreground message:', payload);
      await showNotification(payload);
    });

    await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    const registration = await navigator.serviceWorker.ready;
    console.log('Service Worker ready:', registration);

    const permission = await Notification.requestPermission();
    console.log('Notification permission:', permission);

    if (permission !== 'granted') {
      return;
    }

    const token = await messaging.getToken({
      vapidKey,
      serviceWorkerRegistration: registration
    });

    if (!token) {
      throw new Error('FCM token was not created');
    }

    console.log('FCM Token:', token);

    const response = await fetch('/save-fcm-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });

    if (!response.ok) {
      throw new Error(`Failed to save FCM token: ${response.status}`);
    }
  }

  window.initFcmNotifications = initFcm;
})();