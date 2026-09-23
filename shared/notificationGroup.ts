/**
 * 알림함 묶음(2026-09-23 오너: "카테고리별 구별하기 … 묶음은 넷").
 *
 * 서버(목록 SQL 의 group 필터·안 읽은 수 집계)와 화면(칩·아이콘·라벨)이 **이 한 모듈**을 같이 쓴다.
 * 한쪽만 고치면 "칩에는 3건인데 열면 1건" 같은 어긋남이 난다.
 *
 * 규칙 셋:
 *  1. **모르는 type 은 "notice"** 다. 예외를 던지지 않는다 — 옛 행에 이미 18종이 섞여 있고 앞으로도 는다.
 *  2. type 비교는 **대소문자를 무시**한다. 저장된 값이 `MATCH` 와 `broadcast` 처럼 섞여 있다.
 *  3. **`MATCH` 하나에 성격이 정반대인 둘이 들어 있다** — '멀티방이 열렸어요' 전체 방송과 '당신 차례예요'.
 *     저장값만으로는 못 가르니 params.url 의 `rooms=1` 로 가른다(방송 → notice).
 *     방송은 앞으로 알림함에 저장하지 않지만 옛 행 2,023개가 남아 있어 계속 필요하다(7일 크론이 걷어간다).
 *
 * 이 파일은 node(서버)와 vite(화면) 양쪽에서 임포트된다 — 브라우저 전용 API 를 쓰지 마라.
 */

export type NotifGroup = "turn" | "chat" | "crew" | "notice";

/** 순서가 곧 칩의 순서다('전체' 칩은 화면이 앞에 따로 붙인다). */
export const NOTIF_GROUPS: readonly NotifGroup[] = ["turn", "chat", "crew", "notice"];

/**
 * 묶음별 type 목록. notice 는 **명시된 것만** 담는다 — 모르는 type 도 notice 로 가지만,
 * 그건 notifGroup 의 기본값이지 이 목록이 아니다(서버가 `type IN (...)` 을 만들 때 notice 만은
 * "다른 셋에 없는 것 전부"로 뒤집어 써야 한다).
 */
export const NOTIF_GROUP_TYPES: Record<NotifGroup, readonly string[]> = {
    // 내가 무언가 해야 하는 것. MATCH 는 방송(rooms=1)만 빼고 여기.
    turn: [
        "MATCH", "SIM_MATCH", "CHALLENGE", "FRIEND", "JOIN",
        "POLL", "POLL_REMINDER", "SETTLEMENT", "GOLF_URGENT", "ACTIVITY_REMINDER",
    ],
    chat: ["CHAT"],
    crew: ["TOURNAMENT", "ACTIVITY", "COMMUNITY", "CREW", "POST_COMMENT", "SYSTEM"],
    notice: [
        "broadcast", "suggestion_reply", "suggestion_new", "partner_approved",
        "NOTICE", "PLAYER_RANK", "MODERATION", "SIM_ROOM",
    ],
};

/** type(대문자) → 묶음. 모르는 값은 여기에 없다(= notice). */
const GROUP_OF: Record<string, NotifGroup> = Object.fromEntries(
    NOTIF_GROUPS.flatMap((g) => NOTIF_GROUP_TYPES[g].map((t) => [t.toUpperCase(), g] as const)),
);

/**
 * params(jsonb) 에서 url 을 안전하게 꺼낸다. 무엇이든 올 수 있다 — 객체, JSON 문자열, 맨 문자열, null.
 */
function urlOf(params: unknown): string {
    let p: unknown = params;
    if (typeof p === "string") {
        const s = p.trim();
        // jsonb 가 문자열로 들어온 경우엔 한 겹 벗긴다. 못 벗기면 그 문자열 자체를 url 로 본다.
        if (s.startsWith("{")) {
            try { p = JSON.parse(s); } catch { return s; }
        } else {
            return s;
        }
    }
    if (!p || typeof p !== "object" || Array.isArray(p)) return "";
    const u = (p as Record<string, unknown>).url;
    return typeof u === "string" ? u : "";
}

/**
 * '멀티방이 열렸어요' 전체 방송인가. params.url 의 쿼리에 `rooms=1` 이 있으면 방송이다.
 * URL 생성자를 쓰지 않는다 — 상대경로라 base 가 필요하고, 잘못된 문자열에서 던진다.
 */
export function isRoomBroadcast(params: unknown): boolean {
    const url = urlOf(params);
    if (!url) return false;
    const q = url.indexOf("?");
    if (q < 0) return false;
    const hash = url.indexOf("#", q);
    const query = hash < 0 ? url.slice(q + 1) : url.slice(q + 1, hash);
    for (const pair of query.split("&")) {
        if (!pair) continue;
        const eq = pair.indexOf("=");
        const k = eq < 0 ? pair : pair.slice(0, eq);
        const v = eq < 0 ? "" : pair.slice(eq + 1);
        if (k === "rooms" && v === "1") return true;
    }
    return false;
}

/** 이 알림이 어느 묶음인가. 모르면 "notice" — 절대 던지지 않는다. */
export function notifGroup(type: string | null | undefined, params: unknown): NotifGroup {
    const t = (typeof type === "string" ? type : "").trim().toUpperCase();
    if (!t) return "notice";
    // MATCH 는 하나가 아니다 — 방송이면 공지, 아니면 내 차례.
    if ((t === "MATCH" || t === "SIM_MATCH") && isRoomBroadcast(params)) return "notice";
    return GROUP_OF[t] ?? "notice";
}
