import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { apiRequest } from './queryClient';

export interface NotificationPayload {
  title: string;
  body: string;
  data?: any;
}

class PushNotificationService {
  private isInitialized = false;

  async initialize(): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) {
      console.log('Push notifications are only available on native platforms');
      return false;
    }

    if (this.isInitialized) {
      return true;
    }

    try {
      // Request permission
      const permissionStatus = await PushNotifications.requestPermissions();
      
      if (permissionStatus.receive !== 'granted') {
        console.warn('Push notification permission denied');
        return false;
      }

      // Register for push notifications
      await PushNotifications.register();

      // Set up listeners
      this.setupListeners();
      
      this.isInitialized = true;
      return true;
    } catch (error) {
      console.error('Error initializing push notifications:', error);
      return false;
    }
  }

  private setupListeners() {
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
    
    // You can show custom in-app notification here
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, {
        body,
        icon: '/uploads/tl.png',
        badge: '/uploads/tl.png'
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
      new Notification(title, {
        icon: '/uploads/tl.png',
        badge: '/uploads/tl.png',
        ...options
      });
    }
  }
}