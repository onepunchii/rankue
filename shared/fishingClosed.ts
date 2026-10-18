/**
 * 금어기 달력(2026-10-18) — 수산자원관리법 시행령 별표 1(금어기)의 줄을 열두 달 막대로. 화면(client/src/fishing/spots/ClosedPage) · 검색용 화면이 같이 쓴다.
 *
 * 받은 글을 고치지 않는다 — 날짜 구간만 읽어 막대를 그리고, 글은 원문 그대로 보인다.
 *  · 'M월 D일부터 (다음 해 )M월 D일까지'로 시작하면 고정 기간(fixed)
 *  · 'M월 D일부터 M월 D일까지의 기간 중 …' 처럼 그 안에서 따로 고시하면 window(빗금 — 실제 금어기는 그 안의 일부)
 *  · 앞에 해역 · 지역 한정이 붙거나 '다만'(예외)이 있으면 conditional(막대 + '조건 있음', 원문을 꼭 보라고)
 *  · 날짜 구간을 못 찾으면 막대 없이 글만
 * ⚠️ 서버가 부른다 — 상대 임포트는 ./x.js(지금은 없다).
 */

export interface RegRowLite { kind: string; group: string; name: string; rule: string }
export interface ClosedRange {
    /** 1월 1일 = 0 … 12월 31일 = 364(윤년 무시 — 그림의 자리만) */
    from: number;
    to: number;
    /** 해를 넘긴다(12월 → 다음 해 1월) */
    wraps: boolean;
    kind: "fixed" | "window";
    conditional: boolean;
}
export const FISHING_CLOSED_PATH = "/fishing/closed";

const CUM = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
export const dayOfYear = (m: number, d: number) => CUM[m - 1] + d - 1;
const RANGE = /(\d{1,2})월 (\d{1,2})일부터 (다음 해 )?(\d{1,2})월 (\d{1,2})일까지/;

/** 금어기 글 → 막대 하나(못 읽으면 null) */
export function closedRange(rule: string): ClosedRange | null {
    const m = RANGE.exec(rule);
    if (!m) return null;
    const [fm, fd, next, tm, td] = [Number(m[1]), Number(m[2]), !!m[3], Number(m[4]), Number(m[5])];
    if (fm < 1 || fm > 12 || tm < 1 || tm > 12 || fd < 1 || fd > 31 || td < 1 || td > 31) return null;
    const from = dayOfYear(fm, fd), to = dayOfYear(tm, td);
    const after = rule.slice(m.index + m[0].length);
    const window = /^의 기간 중/.test(after);
    const lead = rule.slice(0, m.index).trim();
    return { from, to, wraps: next || to < from, kind: window ? "window" : "fixed", conditional: lead.length > 0 || /다만|한정|고시|제외/.test(rule) };
}

/** 그날(MM-DD)이 막대 안인가 */
export function closedOn(r: ClosedRange, month: number, day: number): boolean {
    const t = dayOfYear(month, day);
    return r.wraps ? t >= r.from || t <= r.to : t >= r.from && t <= r.to;
}

/** 이번 달 · 오늘 금어기인 줄(조건 있는 줄도 포함 — 화면이 '조건 있음'을 단다) */
export function closedNow<R extends RegRowLite>(rows: readonly R[], month: number, day: number): R[] {
    return rows.filter((r) => r.kind === "closed").filter((r) => { const c = closedRange(r.rule); return !!c && closedOn(c, month, day); });
}

/** 무리의 차례 — 표의 차례 그대로 */
export const CLOSED_GROUPS = ["어류", "갑각류", "패류", "두족류", "해조류", "기타"] as const;

export function closedSeo(total: number): { title: string; description: string; h1: string } {
    return {
        h1: "금어기 달력",
        title: `금어기 달력 — 이번 달 잡으면 안 되는 어종 · 갑각류 · 조개 ${total}가지 | 랭큐 낚시`,
        description: `수산자원관리법 시행령 별표 1의 금어기 ${total}줄을 열두 달 막대로 보여 줘요. 이번 달 금어기 · 해역 한정 · 예외는 원문 그대로 함께 적어요.`,
    };
}
