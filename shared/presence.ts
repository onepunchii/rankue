/**
 * 친구·크루 접속 알림(2026-10-01 오너: "내가 앱에 있을 때 크루 멤버나 친구가 들어오면 누가 들어왔다고 알려 주면 어때?" → 제안 1~4 "응 진행해").
 *
 *  1. **앱 안 배너만** — 내가 앱을 보고 있을 때 위에 한 줄. 앱 밖으로 폰을 울리는 푸시는 보내지 않는다(크루가 50명이면 하루 종일 울린다).
 *  2. **누구:** 서로 친구 + 최근 30일 안에 같이 친(경기·라운드·정모) 크루원. 같은 사람은 6시간에 한 번, 한 번 앱을 여는 동안 3번까지.
 *  3. **바로 할 일:** 당구 친구 '같이 한 판 초대'(1:1 방에 온라인 대전 카드), 골프 친구 '1:1 채팅', 크루원 '크루 채팅'.
 *  4. **설정:** '친구가 들어오면 알려 주기'(받기)·'내 접속 알리기'(보내기) — 둘 다 기본 켜짐.
 * '들어왔다' = 30분 넘게 비어 있다가 새로 열린 앱 세션(hiq_app_sessions — 30분 안에 다시 오면 같은 세션을 잇는다).
 */
export const PRESENCE_POLL_MS = 45_000;
/** 같은 사람 배너 간격 */
export const PRESENCE_SAME_PERSON_MS = 6 * 60 * 60 * 1000;
/** 앱을 한 번 여는 동안 최대 배너 수 */
export const PRESENCE_MAX_PER_SESSION = 3;
/** 최근 같이 친 크루원으로 치는 기간 */
export const PRESENCE_COPLAY_DAYS = 30;
/** 배너가 저절로 닫히기까지 */
export const PRESENCE_BANNER_MS = 9_000;

export type PresenceRelation = "friend" | "crew";
export type PresenceSport = "BILLIARDS" | "GOLF";

export interface PresenceArrival {
    id: string;
    name: string;
    avatar: string | null;
    relation: PresenceRelation;
    sport: PresenceSport;
    crewId: string | null;
    crewName: string | null;
    openedAt: string;
}

/** 배너로 띄울 사람만 고른다 — 같은 사람 6시간·세션당 3명. seen 은 memberId → 마지막으로 띄운 시각(ms) */
export function pickArrivalsToShow(
    arrivals: readonly PresenceArrival[], seen: Readonly<Record<string, number>>, shownThisSession: number, nowMs: number,
): PresenceArrival[] {
    const room = Math.max(0, PRESENCE_MAX_PER_SESSION - shownThisSession);
    const out: PresenceArrival[] = [];
    const ids = new Set<string>();
    for (const a of arrivals) {
        if (out.length >= room) break;
        if (ids.has(a.id)) continue;
        const last = seen[a.id];
        if (last && nowMs - last < PRESENCE_SAME_PERSON_MS) continue;
        ids.add(a.id);
        out.push(a);
    }
    return out;
}

/** 배너의 할 일 — 친구면 1:1(당구는 대전 초대까지), 크루원이면 크루 방 */
export function arrivalAction(a: Pick<PresenceArrival, "relation" | "sport" | "crewId">): "sim-invite" | "dm" | "crew-chat" {
    if (a.relation === "friend") return a.sport === "BILLIARDS" ? "sim-invite" : "dm";
    return a.crewId ? "crew-chat" : "dm";
}
