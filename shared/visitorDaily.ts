/**
 * 어드민 '방문자 발자국'의 날짜별 줄 — 방문자(비회원 · 회원)와 그날 가입한 사람, 회원 전환률(2026-11-06 오너:
 * "비회원 회원 그리고 오늘 회원가입 숫자도 나타나게 그럼 회원 전환률을 알 수 있게").
 *
 *  · 가입 = 그날(한국 날짜) 새로 생긴 회원 행(hiq_members). 웹 · 앱을 갈라 볼 때는 **가입 직후 첫 발자국**이 웹이었나 앱이었나로 가른다
 *    (2026-10-30~11-06 실측: 새 회원 96명 중 89명이 발자국이 있다 — 없는 사람은 웹 · 앱 어느 쪽에도 안 들고 '전체'에만 든다).
 *  · 전환 = 그날 가입 ÷ 그날 비회원 방문자. 비회원으로 왔다가 그날 가입한 사람은 비회원에도 든다(가입 전 발자국에 회원 id 가 없다).
 * ⚠️ 서버(routes/modules/adminVisitors)가 임포트하는 shared 파일 — 상대 임포트는 './x.js'.
 */

export interface DailyVisits { day: string; guests: number; members: number }
export interface DailySignups { day: string; total: number; here: number }
/** 화면의 한 줄 — d 는 보이는 날짜(MM.DD), day 는 줄 세우는 날짜(YYYY-MM-DD) */
export interface DailyRow { day: string; d: string; guests: number; members: number; signups: number; signupsAll: number }

const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** 방문 줄과 가입 줄을 날짜로 합친다 — 한쪽에만 있는 날도 남긴다. 오래된 날부터 */
export function mergeDaily(visits: readonly DailyVisits[], signups: readonly DailySignups[]): DailyRow[] {
    const m = new Map<string, DailyRow>();
    const row = (day: string) => m.get(day) ?? (m.set(day, { day, d: `${day.slice(5, 7)}.${day.slice(8, 10)}`, guests: 0, members: 0, signups: 0, signupsAll: 0 }), m.get(day)!);
    for (const v of visits) { if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v.day))) continue; const r = row(v.day); r.guests = n(v.guests); r.members = n(v.members); }
    for (const s of signups) { if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s.day))) continue; const r = row(s.day); r.signups = n(s.here); r.signupsAll = n(s.total); }
    return [...m.values()].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
}

/** 전환률(%, 소수 한 자리) — 비회원이 없으면 null */
export function conversionPct(signups: number, guests: number): number | null {
    if (!(guests > 0)) return null;
    return Math.round((signups / guests) * 1000) / 10;
}

/** "1.1%" · 비회원이 없으면 "—" */
export function conversionText(signups: number, guests: number): string {
    const p = conversionPct(signups, guests);
    return p == null ? "—" : `${p.toFixed(1)}%`;
}

/** 기간 합계 — 맨 위 한 줄(비회원 · 가입 · 전환) */
export function dailyTotals(rows: readonly DailyRow[]): { guests: number; signups: number; signupsAll: number; pct: string } {
    const guests = rows.reduce((a, r) => a + r.guests, 0);
    const signups = rows.reduce((a, r) => a + r.signups, 0);
    const signupsAll = rows.reduce((a, r) => a + r.signupsAll, 0);
    return { guests, signups, signupsAll, pct: conversionText(signups, guests) };
}
