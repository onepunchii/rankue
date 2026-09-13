/**
 * 알림 카테고리별 켬/끔(2026-09-13 오너: "크루 알림·온라인게임 알림 등 몇 개 카테고리로 나눠서 알림 설정").
 *
 * 규칙 두 가지:
 *  1. 끄면 **푸시만** 멈춘다. 인앱 알림함에는 그대로 쌓인다 — 나중에 들어와서 볼 수 있어야 한다.
 *  2. 저장은 "끈 것만" 담는다({"rooms": false}). 없는 키는 켜짐이라, 카테고리를 새로 만들어도 마이그레이션이 필요 없다.
 *
 * 카테고리는 '무엇에 대한 알림인가'로 가른다 — 보내는 코드의 위치가 아니라 받는 사람이 느끼는 묶음이다.
 */

export type PrefKey = "sim" | "rooms" | "crew" | "game" | "notice";

export const PREF_KEYS: readonly PrefKey[] = ["sim", "rooms", "crew", "game", "notice"];

/** 화면 문구 키(i18n). 순서가 곧 설정 화면의 순서다. */
export const PREF_LABELS: Readonly<Record<PrefKey, { title: string; desc: string }>> = {
    sim: { title: "settings.notifSim", desc: "settings.notifSimDesc" },
    rooms: { title: "settings.notifRooms", desc: "settings.notifRoomsDesc" },
    crew: { title: "settings.notifCrew", desc: "settings.notifCrewDesc" },
    game: { title: "settings.notifGame", desc: "settings.notifGameDesc" },
    notice: { title: "settings.notifNotice", desc: "settings.notifNoticeDesc" },
};

/**
 * 보내는 쪽이 pref 를 안 정했을 때 (category, type) 으로 고른다. 옛 호출부를 한 번에 고치지 않아도 되게 둔다.
 * 모르는 조합은 'notice' 로 본다 — 끌 수 있는 쪽이 기본이다(알림함에는 어차피 남는다).
 */
export function prefKeyFor(category?: string | null, type?: string | null): PrefKey {
    const t = (type ?? "").toUpperCase();
    if (t === "SIM_MATCH" || t === "SIM_ROOM") return t === "SIM_ROOM" ? "rooms" : "sim";
    if (t === "TOURNAMENT" || t === "ACTIVITY" || t === "ACTIVITY_REMINDER" || t === "POLL" || t === "POLL_REMINDER"
        || t === "SETTLEMENT" || t === "CHAT" || t === "POST_COMMENT" || t === "CREW") return "crew";
    if (t === "MATCH" || t === "FRIEND" || t === "CHALLENGE") return "game";
    if (t === "COMMUNITY") return "crew";
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
