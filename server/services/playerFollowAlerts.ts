/**
 * 관심 선수 순위 변동 알림(2026-09-13 오너 제안 7번).
 *
 * 언제: UMB 동기화가 **새 회차를 적재한 부문**에 대해서만(크론 handleUmbSync · 수동 스크립트). 적재가 없는 날은 아무것도 안 한다.
 * 무엇을: 그 부문의 최신 회차와 직전 회차를 비교해, 팔로우된 선수 중 순위가 바뀐 선수의 팔로워에게 한 건씩.
 * 어디로: 탭하면 /player/{부문}/{선수} — 인앱 알림함(NotificationInbox)과 네이티브 푸시(deepLinkUrl) 둘 다 params.url 을 본다.
 * 끄기: 설정 > 알림 > 관심 선수(pref 'players'). 끄면 푸시만 멈추고 알림함에는 남는다.
 *
 * 멱등성: 같은 회차를 두 번 적재하는 경우는 백필뿐이라(크론은 "이미 가진 최신보다 새것"만 본다) 따로 중복 방어를 두지 않았다.
 * 백필 스크립트는 이 함수를 부르지 않는다.
 */
import { storage } from "../storage/index.js";
import { notificationService } from "./notificationService.js";
import { rankChangeMessage } from "../../shared/playerAlerts.js";
import type { UmbCategory } from "./umbService.js";
import { isGolfTour, type GolfTour } from "../../shared/golfTours.js";

export type FollowAlertResult = Record<string, { candidates: number; sent: number }>;

const CATEGORIES: ReadonlySet<string> = new Set(["players", "ladies", "juniors"]);

export async function notifyFollowersOfNewEditions(ingestedCategories: readonly string[]): Promise<FollowAlertResult> {
    const out: FollowAlertResult = {};
    for (const category of new Set(ingestedCategories)) {
        if (!CATEGORIES.has(category)) continue;
        try {
            out[category] = await notifyFollowersForCategory(category as UmbCategory);
        } catch (e) {
            console.error(`[FollowAlerts] ${category} 실패:`, (e as Error)?.message);
            out[category] = { candidates: 0, sent: 0 };
        }
    }
    return out;
}

export async function notifyFollowersForCategory(category: UmbCategory): Promise<{ candidates: number; sent: number }> {
    const editions = await storage.umb.getLatestEditions(category, 2);
    if (editions.length === 0) return { candidates: 0, sent: 0 };
    const latest = editions[0].edition;
    const prev = editions[1]?.edition ?? null;
    const rows = await storage.umb.followedRows(category, latest, prev);

    let sent = 0;
    for (const r of rows) {
        const msg = rankChangeMessage({ name: r.nativeName || r.playerName, rank: r.rank, prevRank: r.prevRank, points: r.points });
        if (!msg) continue;
        await notificationService.sendAndSaveNotification({
            memberId: r.memberId,
            title: msg.title,
            body: msg.body,
            category: "BILLIARDS",
            type: "PLAYER_RANK",
            pref: "players",
            params: { url: `/player/${category}/${r.playerUmbId}`, edition: latest, playerUmbId: r.playerUmbId },
        }).catch((e) => console.error(`[FollowAlerts] ${r.memberId} ← ${r.playerUmbId} 발송 실패:`, (e as Error)?.message));
        sent++;
    }
    return { candidates: rows.length, sent };
}

/* ── 골프(2026-09-13): 같은 규칙, 표만 golf_rankings. 팔로우 표는 category 에 투어 id 가 들어간다 ── */
export async function notifyGolfFollowers(newEditionTours: readonly string[]): Promise<FollowAlertResult> {
    const out: FollowAlertResult = {};
    for (const tour of new Set(newEditionTours)) {
        if (!isGolfTour(tour)) continue;
        try {
            out[tour] = await notifyGolfFollowersForTour(tour);
        } catch (e) {
            console.error(`[FollowAlerts] golf ${tour} 실패:`, (e as Error)?.message);
            out[tour] = { candidates: 0, sent: 0 };
        }
    }
    return out;
}

export async function notifyGolfFollowersForTour(tour: GolfTour): Promise<{ candidates: number; sent: number }> {
    const editions = await storage.golfRank.getLatestEditions(tour, 2);
    if (editions.length === 0) return { candidates: 0, sent: 0 };
    const latest = editions[0].edition;
    const prev = editions[1]?.edition ?? null;
    const rows = await storage.golfRank.followedRows(tour, latest, prev);
    let sent = 0;
    for (const r of rows) {
        const msg = rankChangeMessage({ name: r.nativeName || r.playerName, rank: r.rank, prevRank: r.prevRank, points: r.points });
        if (!msg) continue;
        await notificationService.sendAndSaveNotification({
            memberId: r.memberId, title: msg.title, body: msg.body,
            category: "GOLF", type: "PLAYER_RANK", pref: "golf",   // 종목이 먼저다 — 골프 알림은 골프 칸 하나로(shared/notificationPrefs)
            params: { url: `/golfer/${tour}/${r.playerUmbId}`, edition: latest, playerUmbId: r.playerUmbId },
        }).catch((e) => console.error(`[FollowAlerts] golf ${r.memberId} ← ${r.playerUmbId} 발송 실패:`, (e as Error)?.message));
        sent++;
    }
    return { candidates: rows.length, sent };
}
