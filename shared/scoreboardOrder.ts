/**
 * 실전 점수판의 초구(선공)와 차례 순서(2026-10-23 오너: "초구 정하기").
 *
 * 예전엔 늘 1번 자리(호스트)가 흰 공으로 먼저 쳤다 — 이닝은 차례가 1번으로 돌아올 때 올라갔고, 새로고침하면 '이닝 배열이 가장 짧은 사람'
 * (같으면 1번)의 차례로 되살렸다. 실제 경기는 뱅킹으로 초구를 정한다. 이제 초구 자리(breaker)를 고를 수 있고, 그 자리에서부터 돈다.
 *
 *  - 차례는 자리 번호 순서로 돈다(2 → 3 → 4 → 1). 초구가 누구든 순서는 같고 **시작점만** 다르다.
 *  - 이닝 = 초구가 친(치고 있는) 이닝 수. 초구의 이닝 배열 길이 + (지금 초구 차례면 1). 따로 세지 않고 배열에서 끌어낸다 —
 *    예전 카운터는 3 · 4인 경기에서 배열과 어긋날 수 있었다(상대 카드를 잘못 눌렀다 되돌리면 +1 — useGameScore 주석의 '알려진 위험').
 *  - 공 색은 치는 순서를 따른다: 초구 = 흰 공, 다음 = 노란 공, 그다음 빨강 · 파랑. 초구가 흰 공을 치는 것이 당구의 관례다.
 */

export type Slot = 1 | 2 | 3 | 4;
export type BallTheme = "white" | "yellow" | "red" | "blue";
const THEMES: readonly BallTheme[] = ["white", "yellow", "red", "blue"];

const clampSlot = (n: unknown, total: number): Slot => {
    const v = Math.trunc(Number(n));
    return (v >= 1 && v <= total ? v : 1) as Slot;
};

/** 저장된 초구(없거나 범위 밖이면 1 — 예전 경기) */
export function breakerOf(raw: unknown, total: number): Slot {
    return clampSlot(raw, Math.max(1, Math.min(4, total)));
}

/** 다음 차례(자리 번호 순서) */
export function nextSlot(turn: Slot, total: number): Slot {
    return ((turn % total) + 1) as Slot;
}

/** 초구부터 치는 순서 — [초구, 다음, …] */
export function playOrder(breaker: Slot, total: number): Slot[] {
    const out: Slot[] = [];
    for (let i = 0; i < total; i++) out.push((((breaker - 1 + i) % total) + 1) as Slot);
    return out;
}

/** 지금 몇 이닝째인가 — 초구의 이닝 배열 길이 + (지금 초구 차례면 1). 최소 1 */
export function inningOf(arrays: readonly (readonly number[] | null | undefined)[], breaker: Slot, turn: Slot): number {
    const done = arrays[breaker - 1]?.length ?? 0;
    return Math.max(1, done + (turn === breaker ? 1 : 0));
}

/**
 * 저장된 이닝 배열에서 지금 차례를 되살린다 — 초구부터의 순서에서 이닝 배열이 가장 짧은 첫 사람.
 * (초구가 1번이면 예전 규칙 '가장 짧은 사람, 같으면 1번'과 같다)
 */
export function turnFromArrays(arrays: readonly (readonly number[] | null | undefined)[], breaker: Slot, total: number): Slot {
    let best: Slot = breaker;
    let min = Infinity;
    for (const s of playOrder(breaker, total)) {
        const len = arrays[s - 1]?.length ?? 0;
        if (len < min) { min = len; best = s; }
    }
    return best;
}

/** 자리의 공 색 — 치는 순서대로 흰 · 노랑 · 빨강 · 파랑 */
export function ballThemeOf(slot: Slot, breaker: Slot, total: number): BallTheme {
    const i = (((slot - breaker) % total) + total) % total;
    return THEMES[i] ?? "white";
}

/**
 * 초구를 아직 바꿀 수 있는가 — 아무 일도 없던 판(점수 · 이닝 기록 · 진행 중 점수 · 마무리가 모두 0)일 때만.
 * 한 번이라도 치기 시작했으면 초구는 정해진 것이다(되돌리기로 처음까지 돌아가면 다시 바꿀 수 있다).
 */
export function canChooseBreaker(s: Readonly<Record<string, unknown>>, total: number): boolean {
    for (let n = 1; n <= total; n++) {
        if (Number(s[`p${n}Score`] ?? 0) !== 0) return false;
        if (Number(s[`p${n}Run`] ?? 0) !== 0) return false;
        if (Number(s[`p${n}FinishScore`] ?? 0) !== 0) return false;
        const a = s[`p${n}Innings`];
        if (Array.isArray(a) && a.length > 0) return false;
    }
    return true;
}
