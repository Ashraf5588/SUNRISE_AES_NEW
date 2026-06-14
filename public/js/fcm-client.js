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
      try {
        const registration = await navigator.serviceWorker.ready;
        await registration.showNotification(title, {
          body,
          icon: '/favicon.ico',
          data: payload && payload.data ? payload.data : {}
        });
      } catch (err) {
        console.error('Service Worker notification error:', err);
        new Notification(title, { body, icon: '/favicon.ico' });
      }
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

    // Browser support check
    if (!('serviceWorker' in navigator) || !('Notification' in window) || !('PushManager' in window)) {
      console.warn('Push notifications are not supported in this browser.');
      return;
    }

    if (!window.isSecureContext) {
      console.warn('Push notifications require HTTPS or localhost.');
      return;
    }

    // Firebase availability check
    if (!window.firebase || !window.firebase.messaging) {
      console.warn('Firebase messaging script is not loaded. Retrying in 1 second...');
      setTimeout(initFcm, 1000);
      return;
    }

    try {
      // Check if Firebase is already initialized
      if (!firebase.apps || firebase.apps.length === 0) {
        firebase.initializeApp(firebaseConfig);
      }

      const messaging = firebase.messaging();

      // Set up foreground message handler
      messaging.onMessage(async (payload) => {
        console.log('Foreground message:', payload);
        await showNotification(payload);
      });

      // Register service worker with error handling
      let registration;
      try {
        const reg = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' });
        registration = reg;
        console.log('Service Worker registered successfully:', reg);
      } catch (swError) {
        console.error('Service Worker registration error:', swError);
        // Try without scope
        const reg = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
        registration = reg;
      }

      const registration_ready = await navigator.serviceWorker.ready;
      console.log('Service Worker ready:', registration_ready);

      // Request notification permission
      const permission = await Notification.requestPermission();
      console.log('Notification permission:', permission);

      if (permission !== 'granted') {
        console.warn('User denied notification permission');
        return;
      }

      // Get FCM token with retry logic
      let token = null;
      let retries = 3;
      
      while (!token && retries > 0) {
        try {
          token = await messaging.getToken({
            vapidKey: vapidKey,
            serviceWorkerRegistration: registration
          });
          
          if (token) {
            console.log('✅ FCM Token obtained:', token);
            break;
          }
        } catch (tokenError) {
          retries--;
          console.warn(`FCM token error (${retries} retries left):`, tokenError.message);
          if (retries > 0) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
      }

      if (!token) {
        console.error('❌ Failed to obtain FCM token after retries');
        return;
      }

      // Save token to server
      try {
        const response = await fetch('/save-fcm-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: token })
        });

        if (response.ok) {
          console.log('✅ FCM token saved successfully');
        } else {
          console.error('❌ Failed to save FCM token:', response.status, response.statusText);
        }
      } catch (fetchError) {
        console.error('❌ Error saving FCM token to server:', fetchError);
      }

    } catch (error) {
      console.error('❌ FCM initialization error:', error);
      console.error('Error details:', error.message || error.code || error);
    }
  }

  window.initFcmNotifications = initFcm;
})();