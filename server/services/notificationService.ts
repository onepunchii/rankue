import { storage } from '../storage/index.js';
import { InsertHiqNotification } from '../../shared/schema.js';
import { sendPushNative } from './pushNative.js';

// 딥링크 URL 구성 — 알림 탭 시 이동. 카테고리/타입 기반 최소 매핑(없으면 홈).
// params는 {url} 또는 {crewId, tab} 두 형태가 섞여 있다(발송처마다 다름). 인앱 알림함
// (NotificationInbox)과 이 푸시 경로가 **둘 다** 이해해야 어느 쪽으로 열어도 같은 곳에 도착한다.
function deepLinkUrl(category?: string, type?: string, params?: any): string {
    if (params?.url && typeof params.url === 'string' && params.url.startsWith('/') && !params.url.startsWith('//')) {
        return params.url;
    }
    // category === 'crew' 조건이 붙어 있던 탓에 사실상 죽은 분기였다 — 크루 알림의 category는
    // 종목(BILLIARDS/GOLF)이라 절대 'crew'가 아니어서, crewId만 실린 알림(채팅·가입승인)을
    // 탭하면 크루가 아니라 홈으로 떨어졌다.
    if (params?.crewId) {
        const crewPath = `/crew/${encodeURIComponent(String(params.crewId))}`;
        const tab = typeof params.tab === 'string' ? params.tab.toLowerCase() : '';
        return tab ? `${crewPath}/${encodeURIComponent(tab)}` : crewPath;
    }
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

        const member = await storage.getMemberById(memberId);
        if (!member) return;

        // 1. DB에 알림 내역 먼저 저장. 푸시 가능 여부(프로필·토큰)와 무관하게 인앱 알림함에는 남아야 한다.
        // (매장에서 전화번호만으로 등록된 회원은 profileId가 없어서, 예전엔 여기서 나가버려 알림함이 영영 비어 있었다.)
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

        // 2. 푸시 토큰 조회 — pushToken은 profile에 있으므로 프로필이 없으면 푸시 단계만 건너뛴다.
        if (!member.profileId) {
            console.log(`[Push] No profile for member ${memberId}, saved to DB only.`);
            return;
        }
        const profile = await storage.getProfile(member.profileId);
        const pushToken = profile?.pushToken;

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
