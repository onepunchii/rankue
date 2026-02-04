import { Expo, ExpoPushMessage } from 'expo-server-sdk';
import { storage } from '../storage/index.js';
import { InsertHiqNotification } from '../../shared/schema.js';

const expo = new Expo();

export class NotificationService {
    /**
     * 특정 사용자에게 푸시 알림을 보내고 DB에 저장합니다.
     */
    async sendAndSaveNotification(params: {
        memberId: string;
        title: string;
        body: string;
        category?: string;
        type?: string;
        params?: any;
    }) {
        const { memberId, title, body, category, type, params: deepLinkParams } = params;

        // 1. 사용자 토큰 조회
        // memberId로 profile을 가져와야 함 (pushToken은 profile에 있음)
        const member = await storage.getMemberById(memberId);
        if (!member || !member.profileId) return;

        const profile = await storage.getProfile(member.profileId);
        const pushToken = profile?.pushToken;

        // 2. DB에 알림 내역 저장
        const notificationData: InsertHiqNotification = {
            memberId,
            title,
            body,
            category,
            type,
            params: deepLinkParams,
            isRead: false
        };
        await storage.createNotification(notificationData);

        // 3. 실제 푸시 발송 (토큰이 있는 경우에만)
        if (pushToken && Expo.isExpoPushToken(pushToken)) {
            const message: ExpoPushMessage = {
                to: pushToken,
                sound: 'default',
                title,
                body,
                data: { category, type, params: deepLinkParams },
                priority: 'high',
                channelId: 'default',
            };

            try {
                const chunks = expo.chunkPushNotifications([message]);
                for (let chunk of chunks) {
                    await expo.sendPushNotificationsAsync(chunk);
                }
                console.log(`[Push] Sent to member ${memberId}`);
            } catch (error) {
                console.error(`[Push] Failed to send to member ${memberId}:`, error);
            }
        } else {
            console.log(`[Push] No valid token for member ${memberId}, saved to DB only.`);
        }
    }
}

export const notificationService = new NotificationService();
