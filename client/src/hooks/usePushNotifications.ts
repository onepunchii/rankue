import React, { useEffect } from 'react';
import { pushNotificationService, WebPushService } from '@/lib/push-notifications';
import { Capacitor } from '@capacitor/core';

export function usePushNotifications() {
  React.useEffect(() => {
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