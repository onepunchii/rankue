import { storage } from '../storage/index.js';
import { InsertHiqNotification } from '../../shared/schema.js';
import { sendPushNative } from './pushNative.js';

// 딥링크 URL 구성 — 알림 탭 시 이동. 카테고리/타입 기반 최소 매핑(없으면 홈).
function deepLinkUrl(category?: string, type?: string, params?: any): string {
    if (params?.url && typeof params.url === 'string' && params.url.startsWith('/')) return params.url;
    if (category === 'crew' && params?.crewId) return `/crew/${params.crewId}`;
    if (category === 'match' || type === 'match') return '/history';
    return '/';
}

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

        // 3. 실제 푸시 발송 — FCM(안드로이드·웹)/APNs(iOS) 자동 판별. 토큰 없으면 DB만.
        if (pushToken) {
            const url = deepLinkUrl(category, type, deepLinkParams);
            const r = await sendPushNative(pushToken, { title, body, url, tag: category ?? undefined });
            if (r === 'ok') console.log(`[Push] Sent to member ${memberId}`);
            else if (r === 'dead') {
                // 만료·무효 토큰 정리(빈 값 → 다음 등록 때 갱신)
                await storage.updatePushToken(memberId, '').catch(() => {});
                console.log(`[Push] Dead token cleared for member ${memberId}`);
            } else console.log(`[Push] Skipped (no push env) for member ${memberId}, saved to DB.`);
        } else {
            console.log(`[Push] No token for member ${memberId}, saved to DB only.`);
        }
    }
}

export const notificationService = new NotificationService();
