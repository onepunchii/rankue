/**
 * 알림 카테고리별 켬/끔(2026-09-13 오너: "크루 알림·온라인게임 알림 등 몇 개 카테고리로 나눠서 알림 설정").
 *
 * 규칙 두 가지:
 *  1. 끄면 **푸시만** 멈춘다. 인앱 알림함에는 그대로 쌓인다 — 나중에 들어와서 볼 수 있어야 한다.
 *  2. 저장은 "끈 것만" 담는다({"rooms": false}). 없는 키는 켜짐이라, 카테고리를 새로 만들어도 마이그레이션이 필요 없다.
 *
 * 축이 둘이다 — **종목(sport)** 과 **성격(무엇에 대한 알림인가)**. 종목이 먼저다:
 * 알림의 category 가 GOLF 면 골프 칸들(golf_*) 중에서 고른다 — 당구 칸으로는 절대 가지 않는다.
 *
 * 2026-10-01 오너: "설정 알림에 당구만 상세 토글이 있다 — 골프도 만들어 줘". 골프 한 칸(golf)을 성격별 일곱 칸으로 쪼갰다.
 * 옛 'golf' 키는 **이어받는 값**으로만 남긴다: 예전에 골프를 통째로 꺼 둔 사람({golf:false})은 새 칸을 하나하나 켜기
 * 전까지 골프 칸이 모두 꺼진 채다(갑자기 골프 푸시가 쏟아지지 않게). 새 칸을 켜거나 끈 값이 있으면 그게 이긴다.
 * 보내는 쪽이 옛 pref:"golf" 를 넘겨도 notificationService 가 type 으로 다시 고른다(golf.ts·chat.ts 는 고치지 않았다).
 */

export type SportScope = "BILLIARDS" | "GOLF";
export type GolfPrefKey = "golf_join" | "golf_urgent" | "golf_watch" | "golf_chat" | "golf_crew" | "golf_players" | "golf_notice";
/** "golf" 는 옛 한 칸 — 화면엔 없고, 꺼 둔 기록을 새 칸들이 이어받는 데만 쓴다 */
export type PrefKey = "sim" | "rooms" | "crew" | "game" | "players" | "notice" | GolfPrefKey | "golf";

export interface PrefMeta {
    readonly key: PrefKey;
    /** 이 칸이 어느 종목 것인가. 화면은 종목별로 묶어 보여 주고, 안 쓰는 종목은 감춘다. */
    readonly sport: SportScope;
    readonly title: string;
    readonly desc: string;
}

/** 순서가 곧 설정 화면의 순서다. */
export const PREFS: readonly PrefMeta[] = [
    { key: "sim", sport: "BILLIARDS", title: "settings.notifSim", desc: "settings.notifSimDesc" },
    { key: "rooms", sport: "BILLIARDS", title: "settings.notifRooms", desc: "settings.notifRoomsDesc" },
    { key: "crew", sport: "BILLIARDS", title: "settings.notifCrew", desc: "settings.notifCrewDesc" },
    { key: "game", sport: "BILLIARDS", title: "settings.notifGame", desc: "settings.notifGameDesc" },
    // 관심 선수(2026-09-13 오너 제안 7번): 세계랭킹 새 회차에서 팔로우한 선수의 순위가 바뀌면
    { key: "players", sport: "BILLIARDS", title: "settings.notifPlayers", desc: "settings.notifPlayersDesc" },
    { key: "notice", sport: "BILLIARDS", title: "settings.notifNotice", desc: "settings.notifNoticeDesc" },
    // 골프(2026-10-01) — 성격별. 화면 순서 = 이 순서
    { key: "golf_join", sport: "GOLF", title: "settings.notifGolfJoin", desc: "settings.notifGolfJoinDesc" },
    { key: "golf_urgent", sport: "GOLF", title: "settings.notifGolfUrgent", desc: "settings.notifGolfUrgentDesc" },
    { key: "golf_watch", sport: "GOLF", title: "settings.notifGolfWatch", desc: "settings.notifGolfWatchDesc" },
    { key: "golf_chat", sport: "GOLF", title: "settings.notifGolfChat", desc: "settings.notifGolfChatDesc" },
    { key: "golf_crew", sport: "GOLF", title: "settings.notifGolfCrew", desc: "settings.notifGolfCrewDesc" },
    { key: "golf_players", sport: "GOLF", title: "settings.notifGolfPlayers", desc: "settings.notifGolfPlayersDesc" },
    { key: "golf_notice", sport: "GOLF", title: "settings.notifGolfNotice", desc: "settings.notifGolfNoticeDesc" },
];

const isGolfKey = (k: PrefKey): k is GolfPrefKey => k.startsWith("golf_");

/** 저장·읽기에서 알아듣는 키 — 화면 칸 + 옛 'golf' */
export const PREF_KEYS: readonly PrefKey[] = [...PREFS.map((p) => p.key), "golf"];

/** 그 종목의 칸들. 설정 화면이 '당구' / '골프' 로 묶을 때 쓴다. */
export function prefsForSport(sport: SportScope): readonly PrefMeta[] {
    return PREFS.filter((p) => p.sport === sport);
}

/**
 * 보내는 쪽이 pref 를 안 정했을 때 (category, type) 으로 고른다. 옛 호출부를 한 번에 고치지 않아도 되게 둔다.
 * **종목이 먼저다** — GOLF 면 성격을 보지 않는다. 모르는 조합은 'notice'(끌 수 있는 쪽이 기본이다 — 알림함에는 어차피 남는다).
 */
export function prefKeyFor(category?: string | null, type?: string | null, params?: unknown): PrefKey {
    const t = (type ?? "").toUpperCase();
    if ((category ?? "").toUpperCase() === "GOLF") return golfPrefKeyFor(t, params);
    if (t === "SIM_ROOM") return "rooms";
    if (t === "SIM_MATCH") return "sim";
    if (t === "TOURNAMENT" || t === "ACTIVITY" || t === "ACTIVITY_REMINDER" || t === "POLL" || t === "POLL_REMINDER"
        || t === "SETTLEMENT" || t === "CHAT" || t === "POST_COMMENT" || t === "CREW" || t === "COMMUNITY") return "crew";
    if (t === "MATCH" || t === "FRIEND" || t === "CHALLENGE") return "game";
    if (t === "PLAYER_RANK") return "players";
    return "notice";
}

/**
 * 골프 알림의 성격. 관심 골프장 알림도 type 은 GOLF_URGENT 라(알림함 '내 차례' 묶음·티오프까지 유효) params.watchSlug 로 가른다.
 * 크루 성격(정모·투표·정산·댓글)은 골프 크루 칸, 나머지(친구·사진 처리 결과·공지…)는 골프 소식.
 */
function golfPrefKeyFor(t: string, params?: unknown): GolfPrefKey {
    if (t === "JOIN") return "golf_join";
    if (t === "GOLF_URGENT") {
        const watch = !!params && typeof params === "object" && typeof (params as { watchSlug?: unknown }).watchSlug === "string";
        return watch ? "golf_watch" : "golf_urgent";
    }
    if (t === "CHAT") return "golf_chat";
    if (t === "PLAYER_RANK") return "golf_players";
    if (t === "TOURNAMENT" || t === "ACTIVITY" || t === "ACTIVITY_REMINDER" || t === "POLL" || t === "POLL_REMINDER"
        || t === "SETTLEMENT" || t === "POST_COMMENT" || t === "CREW" || t === "COMMUNITY") return "golf_crew";
    return "golf_notice";
}

/** 저장된 값을 안전하게 읽는다. 객체가 아니거나 모르는 키는 버린다. */
export function normalizePrefs(raw: unknown): Partial<Record<PrefKey, boolean>> {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    const out: Partial<Record<PrefKey, boolean>> = {};
    for (const k of PREF_KEYS) {
        const v = (raw as Record<string, unknown>)[k];
        if (typeof v === "boolean") out[k] = v;
    }
    return out;
}

/** 한 칸의 켬/끔 — 골프 칸은 제 값이 없으면 옛 'golf' 값을 이어받는다 */
function effective(p: Partial<Record<PrefKey, boolean>>, key: PrefKey): boolean {
    const own = p[key];
    if (own !== undefined) return own;
    if (isGolfKey(key)) return p.golf !== false;
    return true;
}

/** 이 카테고리의 푸시를 보내도 되나. 설정이 없거나 키가 없으면 켜짐이다. 옛 pref:"golf" 는 골프 소식으로 본다 */
export function isPushAllowed(raw: unknown, key: PrefKey): boolean {
    return effective(normalizePrefs(raw), key === "golf" ? "golf_notice" : key);
}

/** 화면이 보여줄 전체 상태(켜짐 기본). 옛 'golf' 는 화면에 없으니 빼고 보낸다 */
export function fullPrefs(raw: unknown): Record<Exclude<PrefKey, "golf">, boolean> {
    const p = normalizePrefs(raw);
    return Object.fromEntries(PREFS.map((m) => [m.key, effective(p, m.key)])) as Record<Exclude<PrefKey, "golf">, boolean>;
}
