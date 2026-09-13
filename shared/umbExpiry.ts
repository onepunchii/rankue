/**
 * UMB 포인트 만료 예고(2026-09-13 오너 제안 1번). "다음 달 ANTWERP +26 만료 → 예상 순위 16위".
 *
 * 근거는 실측이다(2025-02~2026-09 편집본 50개, 만료된 대회 12개):
 *   대회일 → 마지막으로 랭킹에 남은 날 = 361~472일, 중앙값 395일(CEB·ACBC ~12~13개월, CPB·AMECC ~14~15개월).
 *   실제로는 같은 대회 다음 회차가 랭킹에 들어온 뒤 0~80일(중앙 17일) 안에 빠진다 — 다음 회차 일정을
 *   미리 알 수 없어서(레전드엔 현재 집계 중인 대회만 있다) 대회일 기준 중앙값으로 잡고 '무렵' 이라고 말한다.
 * 그래서 화면 문구는 언제나 **예상**이다 — 날짜를 못박지 않고 월 단위로 말한다.
 */

/** 대회일로부터 며칠 뒤에 점수가 빠지는가(중앙값). */
export const EXPIRY_DAYS = 395;
/** 실측 범위 — 화면 설명용. */
export const EXPIRY_DAYS_MIN = 361;
export const EXPIRY_DAYS_MAX = 472;

const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

/** 대회 라벨에서 대회일. "… 2026-07-18" 또는 "… 14/18 Oct. 2025 …". 없으면 null(선수권 몇몇·국가선수권). */
export function eventDateOf(label: string): Date | null {
    const iso = label.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3]));
    const en = label.match(/(\d{1,2})(?:\/(\d{1,2}))?\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s*(\d{4})/i);  // 주니어는 "Sep.2025" 처럼 붙여 쓴다(2026-09 실측)
    if (en) {
        const day = en[2] ? +en[2] : +en[1];   // "14/18 Oct." 은 마지막 날을 대회일로
        return new Date(Date.UTC(+en[4], MONTHS[en[3].toLowerCase().slice(0, 3)], day));
    }
    return null;
}

export interface ExpiringEvent {
    readonly colKey: string;
    readonly label: string;
    readonly points: number;
    readonly eventDate: string;      // ISO
    readonly expiresAround: string;  // ISO — 대회일 + EXPIRY_DAYS
    /** 이 대회까지 빠졌을 때 남는 포인트(누적) */
    readonly pointsAfter: number;
}

/**
 * 지금 집계 중인 대회 중 앞으로 빠질 것을 빠르는 순서로. 이미 예상 시점을 넘긴 것도 넣는다(곧 빠진다는 뜻이라 오히려 중요하다).
 * 날짜가 없는 대회(대륙·국가선수권)는 언제 빠지는지 모르므로 뺀다 — 모르는 걸 아는 척하지 않는다.
 * 패널티(음수)는 만료 대상이 아니다.
 */
export function expiringEvents(
    eventPoints: Record<string, number> | null | undefined,
    labels: ReadonlyMap<string, string>,
    totalPoints: number,
    horizonDays = 180,
    now = new Date(),
): ExpiringEvent[] {
    if (!eventPoints) return [];
    const horizon = now.getTime() + horizonDays * 86_400_000;
    const rows: Array<Omit<ExpiringEvent, "pointsAfter"> & { t: number }> = [];
    for (const [colKey, points] of Object.entries(eventPoints)) {
        if (!(points > 0)) continue;
        const label = labels.get(colKey) ?? "";
        const d = eventDateOf(label);
        if (!d) continue;
        const exp = new Date(d.getTime() + EXPIRY_DAYS * 86_400_000);
        if (exp.getTime() > horizon) continue;
        rows.push({ colKey, label, points, eventDate: d.toISOString(), expiresAround: exp.toISOString(), t: exp.getTime() });
    }
    rows.sort((a, b) => a.t - b.t);
    let remaining = totalPoints;
    return rows.map(({ t: _t, ...r }) => { remaining -= r.points; return { ...r, pointsAfter: remaining }; });
}

/** 다른 선수 점수가 그대로라면 이 점수로 몇 위인가. others 는 최신 편집본의 **다른** 선수 점수들. */
export function projectedRank(points: number, others: readonly number[]): number {
    let above = 0;
    for (const p of others) if (p > points) above++;
    return above + 1;
}
