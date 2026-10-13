/**
 * 등산 도장첩의 예시(2026-10-13 오너: "등산에 도장첩 예시 만들어줘 — 수집욕이 올라가게. 지금 골프는 예시 버튼을 잘 활용하는데 등산은 부족하네").
 *
 * 예시는 '다 모은 모습'이다: 도장첩의 모든 산에 도장이 찍히고, 모든 권이 채워져 와펜이 제 색으로 달리고, 산행 등급이 맨 위에 선다.
 * 누구의 기록도 아니다 — 산의 목록에서 **셈으로 만든 것**이고(같은 산은 늘 같은 날이 나온다), 화면은 늘 '예시'라고 적는다.
 * 받은 순번("몇 번째로 받음")처럼 실제로만 있는 숫자는 만들지 않는다.
 *
 * 켜는 법: 주소에 ?example=1 — 책장(/hiking/stamps)과 각 권(/hiking/stamps/<권>)이 같이 본다(책장에서 권으로 들어가도 예시가 이어진다).
 */
export const HIKING_EXAMPLE_PARAM = "example";

/** 주소가 예시를 켰는가 — search 는 "?a=1&example=1" 또는 "a=1&example=1" */
export function isHikingExample(search: string | null | undefined): boolean {
    return new URLSearchParams(String(search ?? "").replace(/^\?/, "")).get(HIKING_EXAMPLE_PARAM) === "1";
}
/** 예시를 켠 주소 · 끈 주소 */
export function withHikingExample(path: string, on = true): string {
    const [base, q = ""] = path.split("?");
    const p = new URLSearchParams(q);
    if (on) p.set(HIKING_EXAMPLE_PARAM, "1"); else p.delete(HIKING_EXAMPLE_PARAM);
    const s = p.toString();
    return s ? `${base}?${s}` : base;
}

/** 글자에서 고른 수(0 이상) — 같은 글자면 늘 같은 수 */
function pick(id: string, salt: number): number {
    let h = 2166136261 ^ salt;
    for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
}

const DAY_MS = 86_400_000;
/** 예시의 기록이 퍼지는 기간 — 지난 세 해 */
export const EXAMPLE_SPAN_DAYS = 1095;

export interface ExampleSummit { id: string; mountainId: string; at: string; verified: true }

/**
 * 모든 산에 인증 도장 하나씩 — 날은 지난 세 해에 고르게, 한국 시각 오전 11시(정상에 서는 때). 넷에 하나꼴로는 다른 철에 한 번 더 오른 것으로 둔다
 * (도장 밑에 철이 쌓이는 모습을 보이려고). 같은 목록 · 같은 '오늘'이면 늘 같은 결과.
 */
export function exampleSummits(mountainIds: readonly string[], nowMs: number): ExampleSummit[] {
    // '오늘'은 날 단위로 자른다 — 그리는 동안 값이 흔들리지 않게
    const today = Math.floor((nowMs + 9 * 3_600_000) / DAY_MS) * DAY_MS - 9 * 3_600_000;
    const out: ExampleSummit[] = [];
    for (const id of [...new Set(mountainIds)]) {
        const ago = 7 + (pick(id, 1) % (EXAMPLE_SPAN_DAYS - 7));
        const first = today - ago * DAY_MS + 11 * 3_600_000;
        out.push({ id: `example:${id}:1`, mountainId: id, at: new Date(first).toISOString(), verified: true });
        if (pick(id, 2) % 4 === 0 && ago > 200) {
            // 석 달 ~ 여섯 달 뒤 — 철이 달라진다
            const again = first + (90 + (pick(id, 3) % 90)) * DAY_MS;
            if (again < today) out.push({ id: `example:${id}:2`, mountainId: id, at: new Date(again).toISOString(), verified: true });
        }
    }
    return out;
}

export const HIKING_EXAMPLE_COPY = {
    /** 머리줄의 단추 */
    button: "예시",
    /** 예시 화면 맨 위의 띠 */
    banner: "예시예요. 도장첩을 다 채우면 이런 모습이 돼요.",
    bookBanner: "예시예요. 이 권을 다 채운 모습이에요.",
    exit: "내 도장첩으로",
    exitGuest: "도장첩으로",
    /** 도장이 아직 없는 회원에게 */
    freshTitle: "아직 도장이 없어요",
    freshSub: "다 모으면 어떻게 되는지 먼저 볼까요?",
    /** 방문자에게 */
    guestTitle: "다 모은 도장첩 보기",
    guestSub: "산마다 도장이 찍히고, 권을 채울 때마다 와펜이 달려요.",
    chip: "예시",
} as const;
