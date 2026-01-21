import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { apiRequest } from './queryClient';

export interface NotificationPayload {
  title: string;
  body: string;
  data?: any;
}

import { initializeApp } from "firebase/app";
import { getMessaging, getToken, onMessage } from "firebase/messaging";

const firebaseConfig = {
  apiKey: "AIzaSyDcyFj0c6aWbkCk0nH4sJ3_PS1CxLjLeOw",
  authDomain: "polli-a71b7.firebaseapp.com",
  projectId: "polli-a71b7",
  storageBucket: "polli-a71b7.firebasestorage.app",
  messagingSenderId: "737747715451",
  appId: "1:737747715451:web:143bfcb0396cc68acf69de",
  measurementId: "G-JER9YDSNWY"
};

class PushNotificationService {
  private isInitialized = false;

  async initialize(): Promise<boolean> {
    if (this.isInitialized) return true;

    // 1. Native Platform (Capacitor) 처리
    if (Capacitor.isNativePlatform()) {
      try {
        const permissionStatus = await PushNotifications.requestPermissions();
        if (permissionStatus.receive !== 'granted') return false;
        await PushNotifications.register();
        this.setupNativeListeners();
        this.isInitialized = true;
        return true;
      } catch (error) {
        console.error('Error initializing native push:', error);
        return false;
      }
    }

    // 2. Web/PWA Platform (Firebase Messaging) 처리
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      try {
        const app = initializeApp(firebaseConfig);
        const messaging = getMessaging(app);

        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          console.warn('Notification permission not granted.');
          return false;
        }

        // Wait for Service Worker to be ready
        const registration = await navigator.serviceWorker.ready;

        const token = await getToken(messaging, {
          vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
          serviceWorkerRegistration: registration
        });

        if (token) {
          console.log('Web Push token generated:', token);
          await this.saveTokenToServer(token);

          // Visual feedback for debugging
          /*
          // Remove in production if too annoying, but useful for debugging now
          if ('Notification' in window && Notification.permission === 'granted') {
             new Notification('알림 설정 완료', { body: '이제 중요한 알림을 받아보실 수 있습니다!' });
          }
          */

          onMessage(messaging, (payload) => {
            console.log('Web message received:', payload);
            this.handleNotificationReceived({
              title: payload.notification?.title,
              body: payload.notification?.body,
              data: payload.data
            });
          });

          this.isInitialized = true;
          return true;
        }
        return false;
      } catch (error) {
        console.error('Error initializing web push:', error);
        return false;
      }
    }

    return false;
  }

  private setupNativeListeners() {
    // Called when the app receives a push notification
    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.log('Push notification received:', notification);
      this.handleNotificationReceived(notification);
    });

    // Called when user taps on a push notification
    PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
      console.log('Push notification action performed:', notification);
      this.handleNotificationTapped(notification);
    });

    // Called when device is registered for push notifications
    PushNotifications.addListener('registration', async (token) => {
      console.log('Push registration success, token:', token.value);
      await this.saveTokenToServer(token.value);
    });

    // Called when push registration fails
    PushNotifications.addListener('registrationError', (error) => {
      console.error('Push registration error:', error);
    });
  }

  private async saveTokenToServer(token: string) {
    try {
      await apiRequest('/api/user/push-token', {
        method: 'POST',
        body: { pushToken: token }
      });
      console.log('Push token saved to server');
    } catch (error) {
      console.error('Failed to save push token:', error);
    }
  }

  private handleNotificationReceived(notification: any) {
    // Handle in-app notification display
    const { title, body, data } = notification;

    if ('Notification' in window && Notification.permission === 'granted') {
      // Use ServiceWorker registration to show notification (more reliable on Android)
      // Even in the foreground, PWA notifications often require SW registration to manifest
      navigator.serviceWorker.ready.then(registration => {
        const iconUrl = 'https://www.polli.co.kr/polli_og_marketing_v1.png';
        registration.showNotification(title || 'Polli', {
          body: body || '',
          icon: iconUrl,
          badge: iconUrl,
          data: data,
          tag: 'polli-notification',
          renotify: true,
          vibrate: [200, 100, 200],
          requireInteraction: true,
        } as any);
      });
    }
  }

  private handleNotificationTapped(notification: any) {
    const { data } = notification.notification;

    // Navigate based on notification data
    if (data?.surveyId) {
      window.location.href = `/survey/${data.surveyId}`;
    } else if (data?.route) {
      window.location.href = data.route;
    } else {
      window.location.href = '/';
    }
  }

  // Send notification to specific user (server-side function)
  static async sendToUser(userId: string, payload: NotificationPayload) {
    try {
      await apiRequest('/api/notifications/send', {
        method: 'POST',
        body: {
          userId,
          ...payload
        }
      });
    } catch (error) {
      console.error('Failed to send notification:', error);
    }
  }

  // Send notification to all users (server-side function)
  static async sendToAll(payload: NotificationPayload) {
    try {
      await apiRequest('/api/notifications/broadcast', {
        method: 'POST',
        body: payload
      });
    } catch (error) {
      console.error('Failed to broadcast notification:', error);
    }
  }
}

export const pushNotificationService = new PushNotificationService();

// Web push notification fallback for browsers
export class WebPushService {
  static async requestPermission(): Promise<boolean> {
    if (!('Notification' in window)) {
      console.warn('This browser does not support notifications');
      return false;
    }

    if (Notification.permission === 'granted') {
      return true;
    }

    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }

    return false;
  }

  static async showNotification(title: string, options?: NotificationOptions) {
    if (await this.requestPermission()) {
      // For standalone/fallback, we still prefer SW registration if available
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        const registration = await navigator.serviceWorker.ready;
        registration.showNotification(title, {
          icon: '/polli_og_marketing_v1.png',
          badge: '/polli_og_marketing_v1.png',
          ...options
        });
      } else {
        new Notification(title, {
          icon: '/polli_og_marketing_v1.png',
          badge: '/polli_og_marketing_v1.png',
          ...options
        });
      }
    }
  }
}