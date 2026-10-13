/**
 * 올해의 산행(2026-10-13) — 배낭 화면의 한 해 요약. 정상에서 인증한 기록과 산행 요약만으로 셈한다(새로 받는 자료 없음).
 * 겨루는 숫자가 아니다: 빠르기 · 순위는 없고, 얼마나 올랐는지와 처음 오른 산을 돌아보는 것뿐이다.
 * ⚠️ 서버가 임포트할 수 있는 shared 파일 — 상대 임포트는 반드시 './x.js'. 순수 함수만(해는 받아서 쓴다).
 */
const KST_MS = 9 * 3_600_000;
/** 그 시각(ms)이 한국에서 몇 년 · 몇 월인가 */
const kst = (t: number) => { const d = new Date(t + KST_MS); return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1 }; };

export interface YearSummit { mountainId: string; at: number; verified: boolean }
export interface YearTrip { startedAt: number; endedAt: number; km: number; gainM: number }
export interface YearReport {
    year: number;
    /** 정상에서 인증한 횟수 · 오른 산의 수(같은 산 여러 번은 한 곳) · 그 가운데 올해 처음 오른 산 */
    climbs: number; mountains: number; firsts: number;
    /** 오른 산의 높이를 더한 값(같은 산은 한 번) · 가장 높았던 산 */
    heightSum: number; highest: { mountainId: string; heightM: number } | null;
    /** 달마다 인증한 횟수(1월부터 12칸) · 산에 간 달의 수 */
    byMonth: number[]; activeMonths: number;
    /** 남긴 산행 요약 — 횟수 · 길 위의 거리(km) · 오른 높이(m) · 걸은 시간(분) */
    trips: number; km: number; gainM: number; minutes: number;
}

export function hikingYearReport(year: number, summits: readonly YearSummit[], trips: readonly YearTrip[], heightOf: (id: string) => number | null | undefined): YearReport {
    const mine = summits.filter((s) => s.verified);
    const inYear = mine.filter((s) => kst(s.at).y === year);
    const ids = [...new Set(inYear.map((s) => s.mountainId))];
    // 올해 처음 = 그 산의 첫 인증이 올해
    const firstAt = new Map<string, number>();
    for (const s of mine) { const f = firstAt.get(s.mountainId); if (f == null || s.at < f) firstAt.set(s.mountainId, s.at); }
    const byMonth = Array.from({ length: 12 }, () => 0);
    for (const s of inYear) byMonth[kst(s.at).m - 1]++;
    let heightSum = 0, highest: YearReport["highest"] = null;
    for (const id of ids) {
        const h = heightOf(id);
        if (h == null || !Number.isFinite(h) || h <= 0) continue;
        heightSum += h;
        if (!highest || h > highest.heightM) highest = { mountainId: id, heightM: h };
    }
    const ts = trips.filter((t) => kst(t.startedAt).y === year && t.endedAt > t.startedAt);
    return {
        year, climbs: inYear.length, mountains: ids.length, firsts: ids.filter((id) => kst(firstAt.get(id)!).y === year).length,
        heightSum: Math.round(heightSum), highest, byMonth, activeMonths: byMonth.filter((n) => n > 0).length,
        trips: ts.length, km: Math.round(ts.reduce((a, t) => a + (Number.isFinite(t.km) ? t.km : 0), 0) * 10) / 10,
        gainM: Math.round(ts.reduce((a, t) => a + (Number.isFinite(t.gainM) ? t.gainM : 0), 0)), minutes: Math.round(ts.reduce((a, t) => a + (t.endedAt - t.startedAt) / 60_000, 0)),
    };
}

/** 돌아볼 것이 있는가 — 올해 인증도 산행 요약도 없으면 구역을 그리지 않는다 */
export const hasYearReport = (r: YearReport): boolean => r.climbs > 0 || r.trips > 0;

/** 높이의 합을 견주는 말 — 한라산(1,947m)을 몇 번 오른 만큼인가. 한 번이 안 되면 빈 말 */
export function heightSumNote(heightSum: number): string {
    const n = Math.floor((heightSum / 1947) * 10) / 10;
    return n >= 1 ? `한라산을 ${Number.isInteger(n) ? n : n.toFixed(1)}번 오른 높이예요` : "";
}
