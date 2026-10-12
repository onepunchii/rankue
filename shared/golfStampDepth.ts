/**
 * 도장의 깊이(2026-10-12 오너: "골프 마무리 하고 등산 넘어가자" — 기획서 4장 '도장 하나가 진해진다').
 *
 * 골퍼는 같은 골프장을 여러 번 간다. 그 라운드도 수집이 되게 한다 — 도장 하나가 세 단계로 진해진다:
 *
 *   코스 조각   코스(9홀)가 셋 이상인 골프장(27 · 36홀 …)에서, 돌아 본 코스 수만큼 바깥 고리가 채워진다
 *   금테       그 골프장의 코스를 전부 돌았다. 코스가 둘뿐인(18홀) 골프장 · 코스 자료가 없는 골프장은 **두 번 다녀오면** 금테
 *              (18홀은 한 번에 다 도니 '코스를 전부'로는 조건이 되지 않는다 — 금테는 늘 '다시 간 사람'의 것이다)
 *   사철       봄 · 여름 · 가을 · 겨울에 다 갔다(한국 날짜 — 3~5 · 6~8 · 9~11 · 12~2월)
 *
 * 그리고 볼마커의 등급:
 *   일반   도장첩을 다 채움(이미 있는 것 — shared/golfStampAwards 의 book · all)
 *   블랙   그 권의 도장이 전부 금테
 *   자개   그 권의 도장이 전부 사철(몇 해가 걸리는 끝판)
 *   초대장 두 권은 등급이 없다(회원과 같이 가야 하는 곳을 여러 번 가라고 재촉하지 않는다).
 *
 * 규칙 둘:
 *  - **인증 라운드만**(도장과 같다 — shared/golfOnSite). 타수는 보지 않는다(못 치는 사람도 모을 수 있어야 한다).
 *  - **코스 이름은 그 골프장 코스 자료(원장)에 있는 이름과 맞을 때만 센다.** 라운드에 적힌 전반 · 후반 코스 이름을 원장 이름과
 *    같은 방식으로 다듬어(nineKey) 견준다. 맞지 않는 이름은 조각으로 치지 않는다 — 없는 코스를 돌았다고 하지 않게.
 *
 * 순수 함수만(서버 · 화면이 같이 쓴다). ⚠️ 서버가 임포트하는 shared 파일 — 상대 임포트는 반드시 './x.js'.
 */
import { STAMP_ALL_OPEN, STAMP_BOOKS, slotForStamp, type StampLike } from "./golfStampBooks.js";

export type GolfSeason = "spring" | "summer" | "autumn" | "winter";
export const GOLF_SEASONS: readonly GolfSeason[] = ["spring", "summer", "autumn", "winter"];
export const GOLF_SEASON_NAME: Readonly<Record<GolfSeason, string>> = { spring: "봄", summer: "여름", autumn: "가을", winter: "겨울" };

/** 코스가 둘뿐인(18홀) 골프장 · 코스 자료가 없는 골프장의 금테 = 이만큼 다녀옴 */
export const DEPTH_GOLD_VISITS = 2;
/** 코스 조각을 그리는 골프장 = 코스가 이만큼 이상 */
export const DEPTH_RING_MIN = 3;

const KST_MS = 9 * 3_600_000;
const ms = (v: Date | string | number): number => (v instanceof Date ? v.getTime() : typeof v === "number" ? v : new Date(v).getTime());
/** 한국 날짜의 해 · 달 · 날 */
export function kstDate(at: Date | string | number): { year: number; month: number; day: number } {
    const d = new Date(ms(at) + KST_MS);
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}
/** 한국 날짜의 철 */
export function golfSeasonOf(at: Date | string | number): GolfSeason {
    const m = kstDate(at).month;
    return m >= 3 && m <= 5 ? "spring" : m >= 6 && m <= 8 ? "summer" : m >= 9 && m <= 11 ? "autumn" : "winter";
}

const WORDS: readonly [RegExp, string][] = [[/east/g, "동"], [/west/g, "서"], [/south/g, "남"], [/north/g, "북"]];
/**
 * 코스 이름의 알맹이 — 띄어쓰기 · 대소문자 · 꼬리('코스' · 'course' · '_18홀라운드')를 떼고, 방위는 한 글자로(EAST = 동).
 * 같은 코스가 원장에 두 표기로 들어 있는 골프장이 있어서다(파주: EAST · WEST · 동 · 서 는 코스 둘이다).
 */
export function nineKey(name: string): string {
    let k = String(name ?? "").toLowerCase().replace(/_?18홀\s*라운드/g, "").replace(/\s+/g, "").replace(/(코스|course)$/g, "");
    for (const [re, to] of WORDS) k = k.replace(re, to);
    return k;
}
const BARE = /^(in|out|인|아웃)$/;
/**
 * 그 골프장의 코스(9홀) 목록 — 원장의 코스 이름에서 겹치는 것을 걷어 낸 알맹이들.
 * 이름 있는 코스가 있는데 이름 없는 'IN' · 'OUT' 이 같이 있으면 그것은 뺀다(원장이 두 줄인 골프장의 한쪽이 코스 이름 없이 들어온 것).
 */
export function slotNineKeys(names: readonly string[]): string[] {
    const keys = Array.from(new Set(names.map(nineKey).filter(Boolean)));
    const named = keys.filter((k) => !BARE.test(k));
    return named.length >= 2 ? named : keys;
}

/** 깊이 판정에 쓰는 인증 라운드 하나 */
export interface DepthRound extends StampLike {
    /** 끝낸 때 */
    at: Date | string | number;
    /** 그 라운드에서 돈 코스 이름(전반 · 후반) — 모르면 비운다 */
    nines?: readonly (string | null | undefined)[] | null;
}

export interface SlotDepth {
    slotKey: string;
    bookId: string;
    /** 그 골프장에서 끝낸 인증 라운드 수 */
    visits: number;
    /** 코스 조각 — 코스가 셋 이상인 골프장만. 아니면 null */
    nines: { got: number; total: number } | null;
    /** 다녀온 철(봄 → 겨울 순) */
    seasons: GolfSeason[];
    gold: boolean;
    /** 금테가 된 때(ms) */
    goldAt: number | null;
    four: boolean;
    /** 사철이 된 때(ms) */
    fourAt: number | null;
}

/**
 * 인증 라운드 → 칸마다의 깊이(도장이 있는 칸만).
 * nineNames 는 칸의 이름표 → 그 골프장 원장의 코스 이름 전부(서버가 읽어 준다. 없으면 빈 목록).
 */
export function stampDepths(rounds: readonly DepthRound[], nineNames: Readonly<Record<string, readonly string[]>> = {}): Map<string, SlotDepth> {
    const ordered = [...rounds].filter((r) => Number.isFinite(ms(r.at))).sort((a, b) => ms(a.at) - ms(b.at));
    const work = new Map<string, { depth: SlotDepth; all: string[]; got: Set<string>; seen: Set<GolfSeason> }>();
    for (const r of ordered) {
        const at = slotForStamp(r);
        if (!at) continue;
        const t = ms(r.at);
        let w = work.get(at.slot.key);
        if (!w) {
            const all = slotNineKeys(nineNames[at.slot.key] ?? []);
            w = {
                all, got: new Set(), seen: new Set(),
                depth: { slotKey: at.slot.key, bookId: at.book.id, visits: 0, nines: all.length >= DEPTH_RING_MIN ? { got: 0, total: all.length } : null, seasons: [], gold: false, goldAt: null, four: false, fourAt: null },
            };
            work.set(at.slot.key, w);
        }
        const d = w.depth;
        d.visits++;
        for (const n of r.nines ?? []) { const k = n ? nineKey(n) : ""; if (k && w.all.includes(k)) w.got.add(k); }
        if (d.nines) d.nines.got = w.got.size;
        if (!d.gold && (d.nines ? d.nines.got >= d.nines.total : d.visits >= DEPTH_GOLD_VISITS)) { d.gold = true; d.goldAt = t; }
        w.seen.add(golfSeasonOf(t));
        if (!d.four && w.seen.size === GOLF_SEASONS.length) { d.four = true; d.fourAt = t; }
    }
    const out = new Map<string, SlotDepth>();
    work.forEach((w, k) => { w.depth.seasons = GOLF_SEASONS.filter((s) => w.seen.has(s)); out.set(k, w.depth); });
    return out;
}

/** 금테까지 남은 것 한 줄 — 도장 밑에 적는다. 금테면 null */
export function depthNext(d: SlotDepth): string | null {
    if (d.gold) return d.four ? null : `사철 ${d.seasons.length}/4`;
    return d.nines ? `코스 ${d.nines.got}/${d.nines.total}` : "한 번 더 가면 금테";
}

export type MarkerTier = "black" | "pearl";
export const MARKER_TIER_NAME: Readonly<Record<MarkerTier | "base", string>> = { base: "일반", black: "블랙", pearl: "자개" };
export interface MarkerTierDue { tier: MarkerTier; key: string; earnedAt: number }

/**
 * 깊이 → 받았어야 할 볼마커 등급(받은 순서). 권은 '누구나' 일곱 권만, 그리고 일곱 권 전부(all-open).
 * 그 권의 칸이 **전부** 금테(블랙) · 사철(자개)일 때 — 받은 때는 마지막 칸이 그렇게 된 때다.
 */
export function markerTiersDue(depths: ReadonlyMap<string, SlotDepth>): MarkerTierDue[] {
    const out: MarkerTierDue[] = [];
    const open = STAMP_BOOKS.filter((b) => b.kind === "open");
    const check = (key: string, slotKeys: readonly string[]) => {
        const ds = slotKeys.map((k) => depths.get(k));
        if (ds.length === 0) return;
        if (ds.every((d) => d?.gold)) out.push({ tier: "black", key, earnedAt: Math.max(...ds.map((d) => d!.goldAt!)) });
        if (ds.every((d) => d?.four)) out.push({ tier: "pearl", key, earnedAt: Math.max(...ds.map((d) => d!.fourAt!)) });
    };
    for (const b of open) check(b.id, b.slots.map((s) => s.key));
    check(STAMP_ALL_OPEN, open.flatMap((b) => b.slots.map((s) => s.key)));
    return out.sort((a, b) => a.earnedAt - b.earnedAt);
}

/** 권마다 지금의 등급 진행 — 화면의 점 셋(일반 · 블랙 · 자개)과 '금테 3/7' */
export function bookDepthProgress(bookSlotKeys: readonly string[], depths: ReadonlyMap<string, SlotDepth>): { gold: number; four: number; total: number } {
    let gold = 0, four = 0;
    for (const k of bookSlotKeys) { const d = depths.get(k); if (d?.gold) gold++; if (d?.four) four++; }
    return { gold, four, total: bookSlotKeys.length };
}
