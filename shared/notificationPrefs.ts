/**
 * 알림 카테고리별 켬/끔(2026-09-13 오너: "크루 알림·온라인게임 알림 등 몇 개 카테고리로 나눠서 알림 설정").
 *
 * 규칙 두 가지:
 *  1. 끄면 **푸시만** 멈춘다. 인앱 알림함에는 그대로 쌓인다 — 나중에 들어와서 볼 수 있어야 한다.
 *  2. 저장은 "끈 것만" 담는다({"rooms": false}). 없는 키는 켜짐이라, 카테고리를 새로 만들어도 마이그레이션이 필요 없다.
 *
 * 축이 둘이다 — **종목(sport)** 과 **성격(무엇에 대한 알림인가)**. 종목이 먼저다:
 * 알림의 category 가 GOLF 면 성격을 보지 않고 골프 칸으로 간다. 골프를 나중에 당구처럼 성격별로 쪼갤 때는
 * PREFS 에 golf_* 키를 더하고 prefKeyFor 의 골프 가지만 늘리면 된다 — 그 자리를 미리 내 둔 것이다(2026-09-13 오너).
 */

export type SportScope = "BILLIARDS" | "GOLF";
export type PrefKey = "sim" | "rooms" | "crew" | "game" | "notice" | "golf";

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
    { key: "notice", sport: "BILLIARDS", title: "settings.notifNotice", desc: "settings.notifNoticeDesc" },
    { key: "golf", sport: "GOLF", title: "settings.notifGolf", desc: "settings.notifGolfDesc" },
];

export const PREF_KEYS: readonly PrefKey[] = PREFS.map((p) => p.key);

/** 그 종목의 칸들. 설정 화면이 '당구' / '골프' 로 묶을 때 쓴다. */
export function prefsForSport(sport: SportScope): readonly PrefMeta[] {
    return PREFS.filter((p) => p.sport === sport);
}

/**
 * 보내는 쪽이 pref 를 안 정했을 때 (category, type) 으로 고른다. 옛 호출부를 한 번에 고치지 않아도 되게 둔다.
 * **종목이 먼저다** — GOLF 면 성격을 보지 않는다. 모르는 조합은 'notice'(끌 수 있는 쪽이 기본이다 — 알림함에는 어차피 남는다).
 */
export function prefKeyFor(category?: string | null, type?: string | null): PrefKey {
    if ((category ?? "").toUpperCase() === "GOLF") return "golf";
    const t = (type ?? "").toUpperCase();
    if (t === "SIM_ROOM") return "rooms";
    if (t === "SIM_MATCH") return "sim";
    if (t === "TOURNAMENT" || t === "ACTIVITY" || t === "ACTIVITY_REMINDER" || t === "POLL" || t === "POLL_REMINDER"
        || t === "SETTLEMENT" || t === "CHAT" || t === "POST_COMMENT" || t === "CREW" || t === "COMMUNITY") return "crew";
    if (t === "MATCH" || t === "FRIEND" || t === "CHALLENGE") return "game";
    return "notice";
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

/** 이 카테고리의 푸시를 보내도 되나. 설정이 없거나 키가 없으면 켜짐이다. */
export function isPushAllowed(raw: unknown, key: PrefKey): boolean {
    return normalizePrefs(raw)[key] !== false;
}

/** 화면이 보여줄 전체 상태(켜짐 기본). */
export function fullPrefs(raw: unknown): Record<PrefKey, boolean> {
    const p = normalizePrefs(raw);
    return Object.fromEntries(PREF_KEYS.map((k) => [k, p[k] !== false])) as Record<PrefKey, boolean>;
}
