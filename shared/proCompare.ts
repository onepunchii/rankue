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
    /** 통산 하이런(PBA 공식) — 비교표 칸. 옛 응답엔 없다 */
    highRun?: number | null;
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
export interface CompareAvgResponse {
    avg: number;
    members: CompareMembers | null;
    pros: ComparePro[];
    /**
     * 재미 등급·사다리 위 자리(proTier) — 2026-10-06 추가: 비로그인 홈의 예시 카드가 실제 프로와 함께 등급 칩·사다리를 그린다.
     * 선택 필드다 — CDN 에 10분(낡은 채로는 하루까지) 남는 옛 본문에는 없으니 화면은 없을 때를 견뎌야 한다. 프로가 모자라면 null.
     */
    tier?: 0 | 1 | 2 | 3 | 4 | null;
    pos?: number | null;
}
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

/* ── 온라인게임 "닮은 프로"(2026-09-27, 홈 온라인게임 카드 아래) ── */

/** 닮은 프로를 알려 주기 전 최소 온라인 3쿠션 대전 수 */
export const LOOKALIKE_MIN_MATCHES = 3;

/**
 * 재미 등급 — 프로 에버리지 분포에서 내 자리. 0 아마추어 · 1 LPBA 신인급 · 2 LPBA 상위권 · 3 PBA 중위권 · 4 PBA 톱10급.
 * 경계: LPBA 하위 25%·LPBA 중앙값·PBA 중앙값·PBA 10번째 선수.
 * pos(0~100)는 사다리 위 점 자리 — 사다리가 등급마다 같은 폭(5칸)이라 **내 등급 칸 안에서** 경계 사이 비율로 놓는다
 * (전체 분포 백분위로 놓으면 점이 칩의 등급과 다른 칸에 찍힌다). 아마추어 칸은 0 ~ 첫 경계, 톱10 칸은 경계 ~ 최고 프로.
 */
export function proTier(pool: readonly ComparePro[], avg: number): { tier: 0 | 1 | 2 | 3 | 4; pos: number } | null {
    const lp = pool.filter((p) => p.league === "LPBA").map((p) => p.average).sort((a, b) => a - b);
    const pb = pool.filter((p) => p.league === "PBA").map((p) => p.average).sort((a, b) => a - b);
    if (lp.length < 4 || pb.length < 10) return null;
    const q = (arr: number[], f: number) => arr[Math.min(arr.length - 1, Math.max(0, Math.floor((arr.length - 1) * f)))];
    const cuts = [q(lp, 0.25), q(lp, 0.5), q(pb, 0.5), pb[pb.length - 10]];
    let tier = 0;
    while (tier < cuts.length && avg >= cuts[tier]) tier++;
    const lo = tier === 0 ? 0 : cuts[tier - 1];
    const hi = tier === 4 ? Math.max(pb[pb.length - 1], cuts[3] + 0.01) : cuts[tier];
    const frac = Math.max(0, Math.min(1, (avg - lo) / Math.max(1e-6, hi - lo)));
    const pos = Math.max(2, Math.min(98, Math.round(((tier + frac) / 5) * 100)));
    return { tier: tier as 0 | 1 | 2 | 3 | 4, pos };
}

/** 다음 목표 — 내 에버리지보다 높은 프로 가운데 가장 가까운 한 명(없으면 null: 모든 자격 프로보다 높다) */
export function nextPro(pool: readonly ComparePro[], avg: number, exclude?: string | null): ComparePro | null {
    let best: ComparePro | null = null;
    for (const p of pool) {
        if (p.memCode === exclude || !(p.average > avg)) continue;
        if (!best || p.average < best.average || (p.average === best.average && p.memCode < best.memCode)) best = p;
    }
    return best;
}

/** GET /sim/lookalike — 로그인 회원의 온라인 3쿠션(최근 10판) 기준 */
export interface LookalikeResponse {
    needed: number;
    /** 최근(최대 10판) 끝난 온라인 3쿠션 대전 수 */
    matches: number;
    ready: boolean;
    avg: number | null;
    highRun: number | null;
    /** 온라인 핸디(다마수, 3쿠션) */
    target: number | null;
    pro: ComparePro | null;
    next: ComparePro | null;
    tier: 0 | 1 | 2 | 3 | 4 | null;
    pos: number | null;
}

/* ── 실전(매칭 대결) "내 실전 핸디"(2026-09-27, 홈 전적 카드 아래) ── */

export interface RealSide {
    type: "3c" | "4c";
    /** 공식(랭크) 경기 수 — 핸디를 매기는 기준 */
    games: number;
    needed: number;
    ready: boolean;
    /** 프로필 에버리지(avg_3c·avg_4c) */
    avg: number | null;
    /** 핸디를 매기는 최근 공식 10경기 평균 — '다음 핸디까지'의 기준 */
    handiAvg: number | null;
    highRun: number | null;
    winRate: number | null;
    handi: number | null;
    members: CompareMembers | null;
    nextHandi: { handi: number; avg: number; gap: number } | null;
    /** 3쿠션만 — 닮은 프로·다음 프로·재미 등급 */
    pro: ComparePro | null;
    next: ComparePro | null;
    tier: 0 | 1 | 2 | 3 | 4 | null;
    pos: number | null;
    /** 4구만 — 같은 핸디 회원(인원·평균 에버·평균 최고 하이런) */
    peers: { count: number; avg: number | null; highRun: number | null } | null;
}
export interface RealCompareResponse { "3c": RealSide; "4c": RealSide; preferred: "3c" | "4c" }
