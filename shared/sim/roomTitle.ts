/**
 * 멀티방 방제(2026-10-06 오너: "당구 멀티방에서 방제를 만들 수 있게") — 방 목록에 뜨는 한 줄.
 *
 *  - 선택 입력이다. 비워 두면 예전처럼 방장 이름이 방의 얼굴이다.
 *  - 멀티방(공개 방)에만 있다. 코드·초대로 여는 방은 볼 사람이 정해져 있어 방제를 받지 않는다.
 *  - 20자(코드포인트). 화면 입력칸은 넘는 글을 자르고(clampRoomTitle), 서버는 자르지 않고 거부한다.
 *  - 누구에게나 보이는 자유 입력이라 서버가 금칙어(내기·욕설)를 막고 연락처를 가린다 — 그 일은 서버 몫이고,
 *    여기에는 화면과 서버가 같이 쓰는 모양(길이·정리)만 둔다.
 */

export const ROOM_TITLE_MAX = 20;

/**
 * 자주 쓰는 문구 칩. 문구는 화면 사전(`sim.match.titlePreset.<이름>`)에 다섯 언어로 있고,
 * 누르면 **지금 화면 언어의 글**이 입력칸에 들어간다(방제는 글자 그대로 저장된다 — 보는 사람 언어로 바뀌지 않는다).
 */
export const ROOM_TITLE_PRESETS = ["beginner", "casual", "serious", "quick", "practice"] as const;
export type RoomTitlePreset = (typeof ROOM_TITLE_PRESETS)[number];

export function roomTitleLength(s: string): number {
    return [...s].length;
}

/**
 * 정리: 제어문자·줄바꿈과 보이지 않는 글자(폭 없는 공백·방향 표시)를 없애고, 연속 공백을 한 칸으로 줄인 뒤 양끝을 턴다.
 * 줄바꿈을 지우는 이유는 목록의 한 줄에 그리기 때문이고, 보이지 않는 글자를 지우는 이유는 '빈 방제'와
 * 화면 글자 방향을 뒤집는 장난(RLO)을 막기 위해서다. 글자가 아니면 빈 글.
 */
export function normalizeRoomTitle(raw: unknown): string {
    if (typeof raw !== "string") return "";
    const CONTROL = new RegExp("[\\u0000-\\u001F\\u007F\\u2028\\u2029]", "g");
    const INVISIBLE = new RegExp("[\\u200B\\u200E\\u200F\\u202A-\\u202E\\u2060-\\u2064\\u2066-\\u2069\\uFEFF]", "g");
    const t = raw.replace(CONTROL, " ").replace(INVISIBLE, "").replace(/\s+/g, " ").trim();
    // 이음 글자(ZWJ·ZWNJ)는 이모지 묶음(👨‍👩‍👧)에 쓰여 남겨 둔다 — 다만 그것뿐인 글은 빈 글이다
    return t.replace(new RegExp("[\\u200C\\u200D]", "g"), "") === "" ? "" : t;
}

/** 입력칸용 — 20자를 넘으면 코드포인트 기준으로 자른다(치는 중에는 끝 공백을 살려 둔다). */
export function clampRoomTitle(raw: string): string {
    const cps = [...raw];
    return cps.length <= ROOM_TITLE_MAX ? raw : cps.slice(0, ROOM_TITLE_MAX).join("");
}

export type RoomTitleCheck =
    | { ok: true; title: string | null }
    | { ok: false; reason: "too-long" };

/**
 * 보낼 값·받은 값의 판정. 정리한 뒤 비면 null(방제 없음), 20자를 넘으면 거부.
 * 금칙어·연락처는 여기서 보지 않는다(서버가 본다).
 */
export function checkRoomTitle(raw: unknown): RoomTitleCheck {
    const t = normalizeRoomTitle(raw);
    if (!t) return { ok: true, title: null };
    if (roomTitleLength(t) > ROOM_TITLE_MAX) return { ok: false, reason: "too-long" };
    return { ok: true, title: t };
}
