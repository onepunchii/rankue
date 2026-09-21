import { storage } from '../storage/index.js';
import { isPushAllowed, prefKeyFor, type PrefKey } from "../../shared/notificationPrefs.js";
import { InsertHiqNotification } from '../../shared/schema.js';
import { sendPushNative, type PushPayload } from './pushNative.js';

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

const ROOM_OPEN_TTL_SEC = 30 * 60;      // 멀티방 방송의 도배 방지 간격(simMatch ROOM_BROADCAST_QUIET_MIN)과 같다
const ONLINE_GAME_TTL_SEC = 2 * 60 * 60;

/**
 * 알림 종류별 푸시 옵션(tag·group·ttl). 예전엔 종목(category='BILLIARDS')을 tag 로 넣어서, 안드로이드에서
 * 새 알림이 늘 이전 알림을 덮어써 트레이에 1개만 남았다(감사 P5). 이제 기본은 "알림마다 따로 뜬다".
 * - tag(바꿔 끼우기): 덮어쓰는 게 맞는 두 경우만.
 *   · 크루 채팅 — 크루마다 최신 메시지 1건으로 바꿔 끼운다. 채팅 30개가 트레이를 채우는 대신,
 *     탭하면 채팅방에서 다 읽는다(메신저들이 방마다 하나로 모으는 것과 같은 효과).
 *   · 멀티방 방송 — 옛 "방이 열렸어요"는 이미 닫혔을 수 있으니 새 안내로 바꾸는 게 맞다.
 *   대결 신청·댓글·가입 승인·정산 같은 건 각각 따로 봐야 하므로 tag 없음.
 * - group(iOS 알림 센터 묶음, 지우지 않음): 크루·게시글 단위.
 * - ttl: 온라인 대전 알림은 늦게 오면 이미 닫힌 방·끝난 차례를 가리킨다. 기기가 꺼져 있다 켜졌을 때
 *   몇 시간 전 안내가 뜨지 않게 한다(감사 P16). 알림함(DB)에는 그대로 남으므로 잃는 것은 없다.
 */
export function pushOptionsFor(type: string | undefined, params: any, url: string): Pick<PushPayload, 'tag' | 'group' | 'ttlSec'> {
    const opts: Pick<PushPayload, 'tag' | 'group' | 'ttlSec'> = {};
    const crewId = params?.crewId ? String(params.crewId) : '';
    if (crewId) opts.group = `crew:${crewId}`;
    if (type === 'CHAT' && crewId) opts.tag = `chat:${crewId}`;

    let u: URL | null = null;
    try { u = new URL(url, 'https://rankue.local'); } catch { u = null; }
    if (!u) return opts;
    // 채팅 방(2026-09-21 한 체계): 방마다 한 묶음, 같은 방의 새 메시지는 앞 알림을 바꿔 끼운다 — 수다스러운 방이
    // 알림 트레이를 메시지 수만큼 채우지 않게. 예전 크루 채팅은 params.crewId 로 이걸 했는데 새 경로는 url 만 보낸다.
    const room = /^\/chat\/(crew|listing|dm|support)\/([^/]+)$/.exec(u.pathname);
    if (room && type === 'CHAT') { opts.group = `chat:${room[1]}:${room[2]}`; opts.tag = `chat:${room[1]}:${room[2]}`; }
    const post = /^\/community\/([^/]+)$/.exec(u.pathname);
    if (post) opts.group = `community:${post[1]}`;
    if (u.pathname === '/online-game') {
        if (u.searchParams.get('rooms') === '1') { opts.tag = 'room-open'; opts.ttlSec = ROOM_OPEN_TTL_SEC; }
        else opts.ttlSec = ONLINE_GAME_TTL_SEC;
    }
    return opts;
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
        /** 알림 카테고리(설정에서 끌 수 있는 묶음). 생략하면 type 으로 고른다 — shared/notificationPrefs. */
        pref?: PrefKey;
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
        // 2-1. 카테고리별 켬/끔(2026-09-13 오너). **푸시만** 막는다 — 위에서 이미 알림함에 저장했다.
        const prefKey = params.pref ?? prefKeyFor(category, type);
        if (!isPushAllowed((member as { pushPrefs?: unknown }).pushPrefs, prefKey)) {
            console.log(`[Push] Muted by member ${memberId} (${prefKey}), saved to DB only.`);
            return;
        }

        const profile = await storage.getProfile(member.profileId);
        const pushToken = profile?.pushToken;

        // 3. 실제 푸시 발송 — FCM(안드로이드)/APNs(iOS) 자동 판별. 토큰 없으면(NULL) DB만.
        if (!pushToken) {
            console.log(`[Push] No token for member ${memberId}, saved to DB only.`);
            return;
        }
        const url = deepLinkUrl(category, type, deepLinkParams);
        const r = await sendPushNative(pushToken, { title, body, url, ...pushOptionsFor(type, deepLinkParams, url) });
        const who = `member ${memberId} (${r.platform})`;
        // 로그는 실제로 일어난 일을 적는다 — 예전엔 API 오류까지 전부 'no push env' 로 찍혀 원인을 가렸다(감사 P6).
        switch (r.result) {
            case 'ok':
                console.log(`[Push] Sent to ${who}`);
                break;
            case 'dead':
                // 앱 삭제·재설치·만료로 죽은 토큰. '' 가 아니라 NULL 로 비운다('' 는 "푸시 가능 회원" 조회에 섞였다, 감사 P14).
                // 그 사이 기기가 새 토큰을 등록했을 수 있으니, 방금 실패한 바로 그 토큰일 때만 지운다.
                await storage.users.clearPushToken(memberId, pushToken)
                    .catch((e) => console.error(`[Push] Dead token clear failed for ${who}:`, (e as Error)?.message));
                console.log(`[Push] Dead token cleared for ${who}: ${r.reason}`);
                break;
            case 'noenv':
                console.log(`[Push] Skipped (no push env: ${r.reason}) for ${who}, saved to DB.`);
                break;
            case 'config':
                console.warn(`[Push] Not sent — server push config error for ${who}: ${r.reason}. Token kept.`);
                break;
            default:
                console.warn(`[Push] Not sent — push service failure for ${who}: ${r.reason}. Token kept.`);
        }
    }
}

export const notificationService = new NotificationService();
