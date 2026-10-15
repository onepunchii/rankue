/**
 * 올해의 목표(2026-10-15 오너 3번 · "서버에 저장") — 정상 인증 횟수 · 높이의 합 · 100대 명산(누적) 셋. 비운 칸은 목표가 아니다.
 * 진행은 이미 있는 올해의 산행 요약(hikingYear)으로 센다. nickys-hiking-pal(MIT)의 목표 · 견주기를 우리 말로 옮김.
 * ⚠️ 서버가 임포트한다 — 상대 임포트는 './x.js'.
 */
export interface HikingGoal { year: number; climbs: number | null; heightM: number | null; kfs: number | null }
export interface GoalRow { key: "climbs" | "heightM" | "kfs"; label: string; have: number; want: number; pct: number; unit: string }

export const EVEREST_M = 8849;
const LIMIT = { climbs: 365, heightM: 1_000_000, kfs: 100 } as const;

const num = (v: unknown, max: number): number | null => {
    if (v === null || v === undefined || v === "") return null;
    const n = Math.round(Number(v));
    return Number.isFinite(n) && n >= 1 && n <= max ? n : NaN;
};

export function cleanGoal(raw: unknown, thisYear: number): { ok: true; value: HikingGoal } | { ok: false; error: string } {
    const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const year = Number(o.year ?? thisYear);
    if (year !== thisYear && year !== thisYear + 1) return { ok: false, error: "올해나 내년의 목표만 정할 수 있어요" };
    const climbs = num(o.climbs, LIMIT.climbs), heightM = num(o.heightM, LIMIT.heightM), kfs = num(o.kfs, LIMIT.kfs);
    if ([climbs, heightM, kfs].some((v) => Number.isNaN(v))) return { ok: false, error: "목표는 1 이상의 숫자로 적어 주세요(100대 명산은 100까지)" };
    return { ok: true, value: { year, climbs, heightM, kfs } };
}

export function goalRows(goal: HikingGoal | null, have: { climbs: number; heightSum: number; kfs: number }): GoalRow[] {
    if (!goal) return [];
    const row = (key: GoalRow["key"], label: string, h: number, w: number | null, unit: string): GoalRow | null =>
        w ? { key, label, have: h, want: w, pct: Math.min(100, Math.floor((h / w) * 100)), unit } : null;
    return [
        row("climbs", "정상 인증", have.climbs, goal.climbs, "번"),
        row("heightM", "높이의 합", have.heightSum, goal.heightM, "m"),
        row("kfs", "100대 명산", have.kfs, goal.kfs, "곳"),
    ].filter((r): r is GoalRow => !!r);
}

export function everestNote(heightSum: number): string {
    if (heightSum <= 0) return "";
    const pct = Math.floor((heightSum / EVEREST_M) * 100);
    return pct >= 100 ? `에베레스트(8,849m)를 ${(heightSum / EVEREST_M).toFixed(1)}번 오른 높이예요` : `에베레스트(8,849m)의 ${pct}%만큼 올랐어요`;
}
