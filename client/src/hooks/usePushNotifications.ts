import { useEffect } from 'react';
import { pushNotificationService, WebPushService } from '@/lib/push-notifications';
import { Capacitor } from '@capacitor/core';

export function usePushNotifications() {
  useEffect(() => {
    const initializePushNotifications = async () => {
      if (Capacitor.isNativePlatform()) {
        // Initialize native push notifications on mobile
        await pushNotificationService.initialize();
      } else {
        // Initialize web push notifications on browser
        await WebPushService.requestPermission();
      }
    };

    initializePushNotifications();
  }, []);
}