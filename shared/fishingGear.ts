/**
 * 장비(2026-10-15 오너 선택 2번) — 낚싯대 · 릴 · 줄 · 채비 조합, 릴에는 줄을 간 날의 기록.
 * 한 테이블(fishing_gear)에 종류를 둔다. 내 장비는 나만 본다(OpenFishing 의 장비 관리를 우리 말로 옮김 — 코드는 옮기지 않았다).
 * ⚠️ 서버가 부른다 — 상대 임포트는 ./x.js.
 */
export const GEAR_KINDS = ["rod", "reel", "line", "combo"] as const;
export type GearKind = (typeof GEAR_KINDS)[number];
export const GEAR_LABEL: Readonly<Record<GearKind, string>> = { rod: "낚싯대", reel: "릴", line: "줄", combo: "채비 조합" };
export const GEAR_MAX = 100;
export const LINE_LOG_MAX = 30;

export interface LineChange { day: string; note: string | null }
export interface FishingGear {
    id: string;
    kind: GearKind;
    name: string;
    brand: string | null;
    spec: string | null;
    note: string | null;
    lineLog: LineChange[];
    createdAt: string;
}
export type FishingGearInput = Pick<FishingGear, "kind" | "name" | "brand" | "spec" | "note">;

const text = (v: unknown, max: number): string => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const orNull = (v: string) => (v ? v : null);

export function cleanGear(raw: unknown): { ok: true; value: FishingGearInput } | { ok: false; error: string } {
    const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const kind = GEAR_KINDS.find((k) => k === o.kind);
    if (!kind) return { ok: false, error: "장비 종류를 골라 주세요" };
    const name = text(o.name, 40);
    if (!name) return { ok: false, error: "이름을 적어 주세요" };
    return { ok: true, value: { kind, name, brand: orNull(text(o.brand, 30)), spec: orNull(text(o.spec, 60)), note: orNull(text(o.note, 200)) } };
}

export function cleanLineChange(raw: unknown, today: string): { ok: true; value: LineChange } | { ok: false; error: string } {
    const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const day = text(o.day, 10) || today;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day > today || day < "2000-01-01") return { ok: false, error: "날짜를 다시 확인해 주세요" };
    return { ok: true, value: { day, note: orNull(text(o.note, 80)) } };
}

export function addLineChange(log: readonly LineChange[], change: LineChange): LineChange[] {
    return [change, ...log].sort((a, b) => b.day.localeCompare(a.day)).slice(0, LINE_LOG_MAX);
}

export function daysSince(day: string, today: string): number {
    return Math.max(0, Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / 86_400_000));
}
