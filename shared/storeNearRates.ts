/**
 * 이 근처 10분 요금 견주기(2026-10-18) — 매장 상세의 '이 근처 당구장' 판에서, 가까운 다섯 곳의 10분 요금과 이 매장을 큐대 눈금 위에 놓는다.
 * 화면(client/src/components/hiq/stores/StoreTableMap StoreNearTable)이 쓰고, 규칙은 여기서 시험한다(storeNearRates.test).
 *
 * 받은 값만 쓴다 — 지어내지 않는다. 다만 모은 자료에 시간당 요금(1만~2만 원대)이 10분 칸에 들어간 줄이 서른 곳쯤 있어(2026-10-18 실측:
 * 대대 12 · 중대 18 · 포켓 2) 견줄 때만 800~4,000원 밖의 값을 뺀다. 매장 화면의 요금표는 받은 그대로 둔다.
 * ⚠️ 서버가 부를 수도 있다 — 상대 임포트는 ./x.js(지금은 없다).
 */

export const RATE10_MIN = 800;
export const RATE10_MAX = 4000;
/** 10분 요금으로 믿을 만한 값인가(견줄 때만) */
export const rate10Ok = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= RATE10_MIN && v <= RATE10_MAX;

/** i = 가까운 순 번호(0부터 — 화면의 노란 공 번호는 i + 1) */
export interface NearRatePoint { i: number; v: number }
export interface NearRateCompare {
    points: NearRatePoint[];
    /** 이 매장(믿을 만한 값이 없으면 null — 그때는 근처 범위만 보인다) */
    mine: number | null;
    /** 근처만의 평균(이 매장은 빼고), 10원 단위 */
    avg: number;
    /** 눈금의 양 끝 — 근처 + 이 매장 */
    lo: number;
    hi: number;
    /** 이 매장 − 근처 평균 */
    diff: number | null;
    /** 큐대 눈금의 양 끝(100원 단위) — 값이 몰려 있어도 최소 RATE_MIN_SPAN 은 펼쳐, 170원 차이가 큐대 끝과 끝처럼 보이지 않게 */
    from: number;
    to: number;
}
export const RATE_MIN_SPAN = 600;

/** 눈금 양 끝 — 값의 범위를 100원 단위로 넓히고, 좁으면 가운데를 두고 RATE_MIN_SPAN 까지 */
export function rateDomain(lo: number, hi: number, minSpan = RATE_MIN_SPAN): { from: number; to: number } {
    const mid = (lo + hi) / 2;
    const a = Math.min(lo, mid - minSpan / 2), b = Math.max(hi, mid + minSpan / 2);
    return { from: Math.floor(a / 100) * 100, to: Math.ceil(b / 100) * 100 };
}

/** 근처 값이 모자라면 null — 이 매장 값이 있으면 둘, 없으면 셋은 있어야 견줄 만하다 */
export function nearRateCompare(mine: number | null | undefined, near: readonly (number | null | undefined)[]): NearRateCompare | null {
    const points = near.map((v, i) => ({ i, v })).filter((p): p is NearRatePoint => rate10Ok(p.v));
    const m = rate10Ok(mine) ? mine : null;
    if (points.length < (m != null ? 2 : 3)) return null;
    const avg = Math.round(points.reduce((a, p) => a + p.v, 0) / points.length / 10) * 10;
    const vals = [...points.map((p) => p.v), ...(m != null ? [m] : [])];
    const lo = Math.min(...vals), hi = Math.max(...vals);
    return { points, mine: m, avg, lo, hi, diff: m != null ? m - avg : null, ...rateDomain(lo, hi) };
}

/** 평균과 50원 안쪽이면 '비슷해요' */
export type RateVerdict = "lower" | "higher" | "same";
export function rateVerdict(diff: number): RateVerdict {
    return Math.abs(diff) < 50 ? "same" : diff < 0 ? "lower" : "higher";
}

/** 눈금 위 자리(%) — 양 끝 공이 판 밖으로 나가지 않게 안쪽 pad 만큼 띄운다. 모두 같은 값이면 가운데 */
export function ratePos(v: number, lo: number, hi: number, pad = 7): number {
    if (hi <= lo) return 50;
    return pad + ((100 - 2 * pad) * (v - lo)) / (hi - lo);
}

/**
 * 공을 겹치지 않게 층으로 — 주어진 차례대로(이 매장을 맨 먼저 주면 늘 맨 아래 층) 앞서 놓인 공과 gap(%)보다 가까우면 한 층 위로.
 * 층이 maxLanes 를 넘으면 맨 위층에 겹쳐 둔다. 반환은 층 번호(0 = 큐대 바로 위).
 */
export function rateLanes(pos: readonly number[], gap: number, maxLanes = 4): number[] {
    const placed: number[][] = [];
    return pos.map((p) => {
        let lane = placed.findIndex((ps) => ps.every((q) => Math.abs(q - p) >= gap));
        if (lane < 0) lane = placed.length < maxLanes ? placed.length : maxLanes - 1;
        (placed[lane] ??= []).push(p);
        return lane;
    });
}
