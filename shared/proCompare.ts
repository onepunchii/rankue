/**
 * "나와 비교하기"(2026-09-27, 오너 승인 시안) — 선수 페이지(PBA·UMB)에서 내 3쿠션 에버리지를 프로와 견준다.
 * 가입 전 방문자는 에버리지를 직접 넣어 보고, 회원은 자기 기록으로 본다. 순수 계산만 둔다(테스트 동반) —
 * 서버(회원 분포·비슷한 프로)와 화면(비율·남은 거리·예상 기간)이 같은 식을 쓴다.
 */

/** 회원 분포에 넣는 최소 3쿠션 경기 수 — 몇 판만 친 기록이 비율로 튀지 않게 */
export const COMPARE_MIN_GAMES = 5;
/** 입력 슬라이더 범위(아마추어~프로) */
export const COMPARE_AVG_MIN = 0.1;
export const COMPARE_AVG_MAX = 2.5;

/** 입력 에버리지 정리 — 범위 밖·숫자 아님은 null. 캐시가 잘 맞게 소수 둘째 자리로 자른다. */
export function normalizeAvg(v: unknown): number | null {
    const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
    if (!Number.isFinite(n) || n < COMPARE_AVG_MIN || n > COMPARE_AVG_MAX) return null;
    return Math.round(n * 100) / 100;
}

/**
 * 내림차순 정렬된 값들 사이에서 value 의 순위와 상위 %. 나보다 **큰** 값의 수 + 1 이 순위(같은 값은 공동).
 * 상위 % 는 올림 — 1명 중 1위가 "상위 100%"가 되지 않게 최소 1%.
 */
export function rankAmong(sortedDesc: readonly number[], value: number): { rank: number; total: number; topPct: number } | null {
    const total = sortedDesc.length;
    if (total === 0) return null;
    // 이분 탐색 — 첫 번째로 value 이하가 되는 자리
    let lo = 0, hi = total;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (sortedDesc[mid] > value) lo = mid + 1; else hi = mid;
    }
    const rank = lo + 1;
    const topPct = Math.max(1, Math.min(100, Math.ceil((Math.min(rank, total) / total) * 100)));
    return { rank, total, topPct };
}

/** 프로 대비 비율(%) — 프로 값이 없거나 0 이면 null */
export function proRatio(me: number, pro: number | null | undefined): number | null {
    if (pro == null || !(pro > 0) || !(me >= 0)) return null;
    return Math.round((me / pro) * 100);
}

/**
 * 이 선수까지 남은 기간(개월) — 최근 성장 속도(월당 에버리지 증가)로 나눈 **추정**.
 * 오르지 않았거나(≤ 0.002/월) 10년이 넘으면 null — 화면은 기간 없이 남은 거리만 보인다.
 */
export function reachMonths(gap: number, perMonth: number | null | undefined): number | null {
    if (!(gap > 0) || perMonth == null || !(perMonth > 0.002)) return null;
    const m = Math.ceil(gap / perMonth);
    return m <= 120 ? m : null;
}

export interface ComparePro {
    memCode: string;
    nameKo: string;
    nameEn: string | null;
    league: "PBA" | "LPBA";
    nationCode: string | null;
    average: number;
}

/** 에버리지가 가장 가까운 프로 n 명(자격 선수만 들어온다). 같은 거리면 에버리지가 높은 쪽 먼저, 그다음 memCode. */
export function nearestPros(pool: readonly ComparePro[], avg: number, n = 2, exclude?: string | null): ComparePro[] {
    return pool
        .filter((p) => p.memCode !== exclude)
        .map((p) => ({ p, d: Math.abs(p.average - avg) }))
        .sort((a, b) => a.d - b.d || b.p.average - a.p.average || (a.p.memCode < b.p.memCode ? -1 : 1))
        .slice(0, n)
        .map((x) => x.p);
}

/** 서버 응답 — GET /compare/avg?avg= (공개) · GET /compare/me (회원) */
export interface CompareMembers { rank: number; total: number; topPct: number }
export interface CompareAvgResponse { avg: number; members: CompareMembers | null; pros: ComparePro[] }
export interface CompareMyStats {
    /** 회원 3쿠션 에버리지(프로필 값) */
    avg: number;
    games: number;
    highRun: number | null;
    /** 0~1, 대전(match) 기준. 대전이 없으면 null */
    winRate: number | null;
    /** 최근 3개월 월평균 에버리지 변화 — 자료가 모자라면 null */
    perMonth: number | null;
}
export interface CompareMeResponse { stats: CompareMyStats | null; members: CompareMembers | null; pros: ComparePro[] }
