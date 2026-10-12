/**
 * 시즌 태그 · 한정 볼마커(2026-10-12 — 기획서 6.1 · 6.3). 도장첩 밖에서 모으는 것 둘.
 *
 * 시즌 태그 — 해마다 그해의 백 태그 하나. 그해(한국 날짜)의 인증 라운드 수로 가죽이 바뀐다:
 *   1번 = 브라운 · 12번 = 네이비 · 24번 = 버건디. 해가 바뀌면 새 태그가 생기고 지난 태그는 장식장에 남는다.
 *   (수는 내가 정했다 — 한 달에 한 번이면 네이비, 두 번이면 버건디.)
 *
 * 한정 볼마커 — **있는 자료로 틀림없이 판정되는 것만** 연다(업적 핀과 같은 원칙). 지금 여덟 개:
 *   계절 넷(봄 · 여름 · 가을 · 겨울)  그 철에 도장첩의 골프장에서 끝낸 인증 라운드. 해마다 다시 열린다(이름표 "spring:2026")
 *   세 코스                          코스가 셋 이상인 골프장의 코스를 전부 돌았다(그 도장이 금테)
 *   새해 첫 티(숨은 것)               1월 1일(한국 날짜)에 끝낸 인증 라운드. 받기 전에는 '?'로만 보인다
 *   홀인원(전설)                     홀 타수 1 — 파를 아는 홀에서만
 *   그랜드슬램(전설)                  도장첩의 골프장을 전부 찍었다
 * 아직 열지 않은 것: 생일 라운드(회원의 생일을 받지 않는다) · 첫눈(지난 날의 날씨를 모른다) ·
 *                  바다 · 섬 · 숲 · 구름 위 · 대회 코스(어느 골프장이 드는지 사실 확인이 먼저 — 기억으로 적지 않는다).
 *
 * 받은 기록은 도장첩과 같은 표(golf_stamp_awards)에 적는다 — kind 'tag'(이름표 "2026:navy") · 'special'(이름표 "spring:2026" · "holeinone").
 * 순수 함수만. ⚠️ 서버가 임포트하는 shared 파일 — 상대 임포트는 반드시 './x.js'.
 */
import { bookStates } from "./golfStampBooks.js";
import type { DatedStamp } from "./golfStampAwards.js";
import { DEPTH_RING_MIN, GOLF_SEASONS, GOLF_SEASON_NAME, golfSeasonOf, kstDate, type GolfSeason, type SlotDepth } from "./golfStampDepth.js";

const ms = (v: Date | string | number): number => (v instanceof Date ? v.getTime() : typeof v === "number" ? v : new Date(v).getTime());

// ── 시즌 태그 ──────────────────────────────────────────────────────
export type SeasonTagTierId = "brown" | "navy" | "burgundy";
export interface SeasonTagTier { id: SeasonTagTierId; name: string; at: number; art: string }
/** 그해 인증 라운드 수 → 태그의 가죽. 낮은 것부터 */
export const SEASON_TAG_TIERS: readonly SeasonTagTier[] = [
    { id: "brown", name: "브라운", at: 1, art: "tag-brown" },
    { id: "navy", name: "네이비", at: 12, art: "tag-navy" },
    { id: "burgundy", name: "버건디", at: 24, art: "tag-burgundy" },
];
export const seasonTagTier = (id: string): SeasonTagTier | undefined => SEASON_TAG_TIERS.find((t) => t.id === id);
/** 받은 기록의 이름표 — "2026:navy" */
export const seasonTagKey = (year: number, tier: SeasonTagTierId) => `${year}:${tier}`;
export function parseSeasonTagKey(key: string): { year: number; tier: SeasonTagTier } | null {
    const [y, t] = key.split(":");
    const tier = seasonTagTier(t ?? "");
    return tier && /^\d{4}$/.test(y) ? { year: Number(y), tier } : null;
}

export interface SeasonTagYear {
    year: number;
    /** 그해 인증 라운드 수 */
    rounds: number;
    /** 지금의 가죽(가장 높은 것) — 라운드가 없으면 null */
    tier: SeasonTagTier | null;
    /** 다음 가죽까지 — 맨 위면 null */
    next: { tier: SeasonTagTier; left: number } | null;
}
/** 그해의 라운드 수 → 태그 한 해 */
export const seasonTagOf = (year: number, rounds: number): SeasonTagYear => {
    const got = SEASON_TAG_TIERS.filter((t) => rounds >= t.at);
    const next = SEASON_TAG_TIERS.find((t) => rounds < t.at);
    return { year, rounds, tier: got[got.length - 1] ?? null, next: next ? { tier: next, left: next.at - rounds } : null };
};
/** 인증 라운드를 끝낸 때들 → 해마다의 태그(최근 해부터). thisYear 를 주면 라운드가 없어도 그해가 맨 앞에 온다 */
export function seasonTagYears(times: readonly (Date | string | number)[], thisYear?: number): SeasonTagYear[] {
    const count = new Map<number, number>();
    for (const t of times) { const v = ms(t); if (Number.isFinite(v)) { const y = kstDate(v).year; count.set(y, (count.get(y) ?? 0) + 1); } }
    if (thisYear != null && !count.has(thisYear)) count.set(thisYear, 0);
    return Array.from(count.entries()).sort((a, b) => b[0] - a[0]).map(([y, n]) => seasonTagOf(y, n));
}
/** 받았어야 할 태그(받은 순서) — 그해의 N번째 라운드를 끝낸 때가 받은 때 */
export function seasonTagsDue(times: readonly (Date | string | number)[]): { key: string; earnedAt: number }[] {
    const byYear = new Map<number, number[]>();
    for (const t of times) { const v = ms(t); if (Number.isFinite(v)) { const y = kstDate(v).year; byYear.set(y, [...(byYear.get(y) ?? []), v]); } }
    const out: { key: string; earnedAt: number }[] = [];
    byYear.forEach((list, year) => {
        list.sort((a, b) => a - b);
        for (const tier of SEASON_TAG_TIERS) if (list.length >= tier.at) out.push({ key: seasonTagKey(year, tier.id), earnedAt: list[tier.at - 1] });
    });
    return out.sort((a, b) => a.earnedAt - b.earnedAt);
}

// ── 한정 볼마커 ─────────────────────────────────────────────────────
export type SpecialMarkerId = GolfSeason | "three" | "newyear" | "holeinone" | "grand";
export type SpecialGroup = "season" | "theme" | "hidden" | "legend";
export interface SpecialMarker {
    id: SpecialMarkerId;
    name: string;
    /** 받는 조건 한 줄 */
    how: string;
    /** 그림 파일의 이름(client/public/golf/stamp-art/<art>.webp) */
    art: string;
    group: SpecialGroup;
    /** 해마다 다시 열린다 — 이름표에 해가 붙는다("spring:2026") */
    yearly?: boolean;
    /** 받기 전에는 이름 · 조건을 숨긴다 */
    hidden?: boolean;
}
/** 장식장에 놓이는 순서 */
export const SPECIAL_MARKERS: readonly SpecialMarker[] = [
    ...GOLF_SEASONS.map((s): SpecialMarker => ({
        id: s, name: `${GOLF_SEASON_NAME[s]} 볼마커`, how: `${GOLF_SEASON_NAME[s]}에 도장첩의 골프장에서 라운드`, group: "season", yearly: true,
        art: ({ spring: "special-spring", summer: "special-summer", autumn: "special-autumn", winter: "special-winter" } as const)[s],
    })),
    { id: "three", name: "세 코스", how: "27홀 이상 골프장의 코스를 전부", art: "special-three", group: "theme" },
    { id: "newyear", name: "새해 첫 티", how: "1월 1일에 끝낸 라운드", art: "special-newyear", group: "hidden", hidden: true },
    { id: "holeinone", name: "홀인원", how: "한 번에 넣은 홀", art: "special-holeinone", group: "legend" },
    { id: "grand", name: "그랜드슬램", how: "도장첩의 골프장을 전부", art: "special-grand", group: "legend" },
];
export const specialMarker = (id: string): SpecialMarker | undefined => SPECIAL_MARKERS.find((m) => m.id === id);
/** 받은 기록의 이름표 — 해마다 열리는 것은 "spring:2026", 아니면 id 그대로 */
export const specialKey = (id: SpecialMarkerId, year?: number) => (specialMarker(id)?.yearly ? `${id}:${year}` : id);
export function parseSpecialKey(key: string): { marker: SpecialMarker; year: number | null } | null {
    const [id, y] = key.split(":");
    const marker = specialMarker(id);
    if (!marker) return null;
    if (marker.yearly) return /^\d{4}$/.test(y ?? "") ? { marker, year: Number(y) } : null;
    return y == null ? { marker, year: null } : null;
}

/** 한정 볼마커 판정에 쓰는 인증 라운드 하나 */
export interface SpecialRound {
    at: Date | string | number;
    /** 도장첩의 골프장에서 친 라운드인가 */
    elite: boolean;
    /** 홀 타수(1~18번) · 그 홀의 파(모르면 null) */
    strokes?: readonly (number | null)[] | null;
    pars?: readonly (number | null)[] | null;
}

/** 받았어야 할 한정 볼마커(받은 순서) */
export function specialMarkersDue(rounds: readonly SpecialRound[], depths: ReadonlyMap<string, SlotDepth>, stamps: readonly DatedStamp[]): { key: string; earnedAt: number }[] {
    const ordered = [...rounds].filter((r) => Number.isFinite(ms(r.at))).sort((a, b) => ms(a.at) - ms(b.at));
    const first = new Map<string, number>();
    const put = (key: string, at: number) => { if (!first.has(key)) first.set(key, at); };
    for (const r of ordered) {
        const t = ms(r.at), d = kstDate(t);
        if (r.elite) put(specialKey(golfSeasonOf(t), d.year), t);
        if (d.month === 1 && d.day === 1) put("newyear", t);
        // 파를 아는 홀에서만 — 타수 칸에 잘못 들어간 1 을 홀인원으로 치지 않게
        if (r.strokes?.some((s, i) => s === 1 && (r.pars?.[i] ?? null) != null)) put("holeinone", t);
    }
    // 세 코스 — 코스 조각이 있는(코스 셋 이상) 골프장의 금테
    const three = Array.from(depths.values()).filter((d) => d.nines && d.nines.total >= DEPTH_RING_MIN && d.gold && d.goldAt != null).map((d) => d.goldAt!);
    if (three.length) put("three", Math.min(...three));
    // 그랜드슬램 — 도장첩 전부
    const dated = [...stamps].filter((s) => Number.isFinite(ms(s.firstDate))).sort((a, b) => ms(a.firstDate) - ms(b.firstDate));
    const states = bookStates(dated);
    if (states.length > 0 && states.every((s) => s.done)) put("grand", Math.max(...states.flatMap((s) => s.slots.map((x) => ms(x.stamp!.firstDate)))));
    return Array.from(first.entries()).map(([key, earnedAt]) => ({ key, earnedAt })).sort((a, b) => a.earnedAt - b.earnedAt);
}
