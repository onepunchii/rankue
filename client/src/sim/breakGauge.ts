/**
 * 초구 타이밍 게이지(2026-11-03 오너: "초구부터 하이런까지 가는 족보가 생겼어 … 초구만 힘을 타이밍 버튼으로 게임처럼").
 *
 * 왜: 초구 배치는 늘 같고 엔진은 같은 입력에 늘 같은 결과를 낸다. 힘 슬라이더는 1% 눈금이고 초구 조준은 늘 같은 기본값에서 시작해서,
 * 소수점 끝까지 같은 초구가 되풀이됐다(10/4~11/3 3쿠션 대전 — 한 사람이 같은 초구로 39판, 초구부터 이어 친 점수 평균 1.97 · 최고 20).
 * 엔진으로 재 보면 힘이 0.5% 만 달라도 초구 뒤 공이 16~26cm 달라진다. 사람 손의 타이밍(±2~5%)이면 같은 판이 다시 나오지 않는다.
 *
 * 규칙: 온라인 대전의 첫 샷(초구)만. 샷을 누르면 힘이 0 → 100 → 0 으로 오르내리고, 한 번 더 누르면 그 힘으로 바로 친다. 조준 · 당점은 그대로 고른다.
 * 오르내리는 빠르기와 시작점은 칠 때마다 다르다 — 손에 익힌 박자로 같은 힘을 낼 수 없게. 혼자 연습은 슬라이더 그대로다.
 * 게임처럼(2026-11-03 오너 "게이지도 맥스파워에서 빨라지듯"): 바닥에서는 느리고 최대로 갈수록 빨라진다(u^BREAK_GAUGE_EASE) —
 * 내려올 때는 그 거울이라 최대 근처는 늘 휙 지나간다. 센 초구일수록 맞추기 어렵다.
 * 같은 날 오너가 쳐 보고 "타이밍이 어려운가" — 처음 값(오르는 시간 0.8~1.1초 · 2.2제곱)은 초구에 쓰는 60~80% 에서 ±5% 안에
 * 머무는 시간이 한 번에 50ms 안팎이었다(일정한 속도 게이지의 절반). 1.3~1.6초 · 1.6제곱으로 늦춰 그 창을 약 100ms 로 —
 * 사람 손 박자(±30~50ms)면 힘이 ±3~5% 흔들려 족보는 여전히 깨진다(0.5% 만 달라도 공이 16cm 넘게 달라진다).
 */

/** 0 에서 100 까지 오르는 데 걸리는 시간 — 칠 때마다 이 사이에서 고른다 */
export const BREAK_GAUGE_RISE_MIN_MS = 1300;
export const BREAK_GAUGE_RISE_MAX_MS = 1600;
/** 빨라지는 정도 — 오를 때 힘 = (지난 시간 / 오르는 시간)^이 값 */
export const BREAK_GAUGE_EASE = 1.6;

export interface BreakGauge {
    /** 0 → 100 에 걸리는 시간(ms) */
    readonly riseMs: number;
    /** 시작점 — 오르내림 한 바퀴(2 × riseMs) 안의 어디에서 시작하나(ms) */
    readonly offsetMs: number;
}

/** 새 게이지 — 빠르기와 시작점을 고른다 */
export function newBreakGauge(rand: () => number = Math.random): BreakGauge {
    const riseMs = BREAK_GAUGE_RISE_MIN_MS + (BREAK_GAUGE_RISE_MAX_MS - BREAK_GAUGE_RISE_MIN_MS) * rand();
    return { riseMs, offsetMs: rand() * 2 * riseMs };
}

/** 게이지를 켠 지 elapsedMs 뒤의 힘 %(0~100, 끊김 없는 값 — 눈금이 없다). 오를 때 u^k, 내릴 때 그 거울 */
export function breakGaugePercent(g: BreakGauge, elapsedMs: number): number {
    const period = 2 * g.riseMs;
    const t = (((elapsedMs + g.offsetMs) % period) + period) % period;
    const u = t <= g.riseMs ? t / g.riseMs : 2 - t / g.riseMs;
    return Math.min(100, Math.max(0, Math.pow(u, BREAK_GAUGE_EASE) * 100));
}

/** 힘의 색 구간 — 화면이 막대 · 숫자 색을 고른다. 셀수록 붉다(오너 "파워가 세면 빨간색") */
export type BreakZone = "soft" | "mid" | "hard" | "max";
export const breakZone = (pct: number): BreakZone => (pct >= 85 ? "max" : pct >= 65 ? "hard" : pct >= 35 ? "mid" : "soft");

/** 지금이 초구 게이지를 쓰는 차례인가 — 온라인 대전 · 치는 중 · 내 차례(aim) · 아직 아무도 안 쳤다 */
export function isBreakTurn(s: { mode: string; matchStatus: string | null | undefined; phase: string; shotCount: number | null | undefined }): boolean {
    return s.mode === "match" && s.matchStatus === "playing" && s.phase === "aim" && s.shotCount === 0;
}
