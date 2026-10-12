/**
 * 등산 — 정상 도장 · 도장첩 · 와펜 · 핀(2026-10-13 오너: "산은 각 지역으로 묶어도 되고 특성으로 묶고 다양한 스탬프를 받을 수 있게 …
 * 지금 골프의 도장깨기가 너무 잘 되어 있어서 비슷하게 접목해 주고").
 *
 * 골프의 도장깨기와 **짜임은 같고 물건은 다르다**(골프의 규칙 파일 · 그림을 가져다 쓰지 않는다):
 *   정상 도장   산 한 곳 — 정상 가까이에서 위치로 인증한 산행이 하나라도 있으면 찍힌다. 인증 없이 적은 산은 흐린 '기록'이다(칸이 차지 않는다).
 *   도장첩      산의 묶음. 권역으로도(100대 명산 여덟 권 · 명산 플러스 여덟 권), 특성으로도(국립공원 · 도립공원 · 높은 산 50 · 하늘 가까운 산 · 섬의 산) 묶는다.
 *               한 산이 여러 권에 들 수 있다 — 설악산 하나로 강원 · 국립공원 · 높은 산 · 하늘 가까운 산의 칸이 같이 찬다.
 *   와펜        도장첩 한 권을 다 채우면 받는 자수 패치. 100대 명산 여덟 권을 전부 채우면 '완등' 와펜.
 *   핀          산을 새로 가지 않아도 쌓이는 것 — 첫 정상 · 오른 산의 수 · 천 미터 · 사철 · 전국 한 바퀴.
 *               **빨리 · 야간 · 새벽 · 악천후로 받는 것은 없다**(산에서는 사고를 부른다).
 *
 * 도장첩의 칸은 자료에서 만든다(hikingBooks) — 골프처럼 손으로 적은 명단이 아니라 산의 목록 소속 · 권역 · 특성으로.
 * 순수 함수만(서버 · 화면이 같이 쓴다). ⚠️ 서버가 임포트하는 shared 파일 — 상대 임포트는 반드시 './x.js'.
 */
import { HIKING_REGIONS, type HikingRegionId } from "./hikingMountains.js";
import { HIKING_FEATURES } from "./hikingFeatures.js";
import { hikingGradesDue } from "./hikingGrade.js";

const ms = (v: Date | string | number): number => (v instanceof Date ? v.getTime() : typeof v === "number" ? v : new Date(v).getTime());
const KST_MS = 9 * 3_600_000;

export type HikingSeason = "spring" | "summer" | "autumn" | "winter";
export const HIKING_SEASONS: readonly HikingSeason[] = ["spring", "summer", "autumn", "winter"];
export const HIKING_SEASON_NAME: Readonly<Record<HikingSeason, string>> = { spring: "봄", summer: "여름", autumn: "가을", winter: "겨울" };
/** 한국 날짜의 철 — 3~5 봄 · 6~8 여름 · 9~11 가을 · 12~2 겨울 */
export function hikingSeasonOf(at: Date | string | number): HikingSeason {
    const m = new Date(ms(at) + KST_MS).getUTCMonth() + 1;
    return m >= 3 && m <= 5 ? "spring" : m >= 6 && m <= 8 ? "summer" : m >= 9 && m <= 11 ? "autumn" : "winter";
}
/** 한국 날짜 "2026-10-13" — 하루에 같은 산의 인증은 한 번만 */
export const kstDay = (at: Date | string | number): string => new Date(ms(at) + KST_MS).toISOString().slice(0, 10);

/** 도장첩의 칸이 되는 산(요약에서 쓰는 것만) */
export interface StampMountain {
    id: string;
    slug: string;
    name: string;
    heightM: number | null;
    region: string | null;
    tier: number;
    lists: readonly string[];
    traits: readonly string[];
}

export type HikingBookKind = "kfs" | "plus" | "theme" | "season";
export interface HikingBook {
    /** "kfs-gangwon" · "plus-capital" · "nationalparks" */
    id: string;
    kind: HikingBookKind;
    /** "강원" · "국립공원의 산" */
    name: string;
    /** 책장의 구역 이름 */
    series: string;
    note: string;
    region: HikingRegionId | null;
    /** 와펜 그림의 이름(client/public/hiking/art/patch-<art>.webp) */
    art: string;
    slots: StampMountain[];
}
export const HIKING_SERIES = { kfs: "산림청 100대 명산", plus: "명산 플러스", theme: "특성으로 묶은 산", season: "철 따라 가는 산" } as const;
/** 특성 도장첩 — [이름표, 이름, 설명, 드는 산]. 명산(tier 1)만 칸이 된다(이름뿐인 봉우리 수백 곳을 칸으로 만들지 않는다) */
const THEMES: readonly [string, string, string, (m: StampMountain) => boolean][] = [
    ["nationalparks", "국립공원의 산", "국립공원으로 지정된 산", (m) => m.lists.includes("nationalparks")],
    ["over1500", "하늘 가까운 산", "해발 1,500m 이상의 명산", (m) => m.traits.includes("over1500")],
    ["highest50", "높은 산 50", "남한에서 높은 산 쉰 곳", (m) => m.lists.includes("highest50")],
    ["island", "섬의 산", "섬에 있는 명산", (m) => m.traits.includes("island")],
    ["provincialparks", "도립공원의 산", "도립공원으로 지정된 산", (m) => m.lists.includes("provincialparks")],
];
const byHeight = (a: StampMountain, b: StampMountain) => (b.heightM ?? 0) - (a.heightM ?? 0) || a.name.localeCompare(b.name, "ko");

/** 산의 목록 → 도장첩 전부(책장의 순서). 칸이 없는 권은 만들지 않는다 */
export function hikingBooks(mountains: readonly StampMountain[]): HikingBook[] {
    const famous = mountains.filter((m) => m.tier === 1);
    const out: HikingBook[] = [];
    for (const [kind, list] of [["kfs", "kfs100"], ["plus", "kfs100plus"]] as const) {
        for (const r of HIKING_REGIONS) {
            const slots = famous.filter((m) => m.region === r.id && m.lists.includes(list)).sort(byHeight);
            if (slots.length) out.push({ id: `${kind}-${r.id}`, kind, name: r.name, series: HIKING_SERIES[kind], note: `${r.name}의 ${kind === "kfs" ? "100대 명산" : "명산 플러스"} ${slots.length}곳`, region: r.id, art: `${kind}-${r.id}`, slots });
        }
    }
    for (const [id, name, note, has] of THEMES) {
        const slots = famous.filter(has).sort(byHeight);
        if (slots.length) out.push({ id, kind: "theme", name, series: HIKING_SERIES.theme, note: `${note} ${slots.length}곳`, region: null, art: id, slots });
    }
    // 철 따라 가는 산 — 소개 글에 그 말이 나오는 100대 명산(shared/hikingFeatures). 어느 철에 올라도 칸이 찬다
    for (const f of HIKING_FEATURES) {
        const slots = famous.filter((m) => m.traits.includes(f.id)).sort(byHeight);
        if (slots.length) out.push({ id: f.id, kind: "season", name: f.name, series: HIKING_SERIES.season, note: `${f.note} ${slots.length}곳`, region: null, art: f.id, slots });
    }
    return out;
}
/** 묶음의 묶음 — 그 줄의 권을 전부 채우면 받는 큰 와펜 */
export const HIKING_GRANDS: readonly { id: string; kind: HikingBookKind; name: string; how: string; art: string }[] = [
    { id: "kfs-all", kind: "kfs", name: "100대 명산 완등", how: "100대 명산 도장첩을 전부", art: "kfs-all" },
    { id: "plus-all", kind: "plus", name: "명산 플러스 완등", how: "명산 플러스 도장첩을 전부", art: "plus-all" },
];

/** 정상에 오른 기록 하나 */
export interface Summit {
    mountainId: string;
    at: Date | string | number;
    /** 정상 가까이에서 위치로 인증했는가 */
    verified: boolean;
}
/** 산 한 곳의 도장 */
export interface MountainStamp {
    mountainId: string;
    /** 인증 도장인가 — false 면 흐린 기록 */
    verified: boolean;
    /** 도장을 얻은 때(ms) — 첫 인증, 인증이 없으면 첫 기록 */
    firstAt: number;
    /** 인증한 산행의 수(기록만이면 기록의 수) */
    count: number;
    /** 인증하고 오른 철(봄 → 겨울 순) */
    seasons: HikingSeason[];
}
/** 기록 → 산마다의 도장(얻은 순서) */
export function mountainStamps(summits: readonly Summit[]): MountainStamp[] {
    const ordered = [...summits].filter((s) => Number.isFinite(ms(s.at))).sort((a, b) => ms(a.at) - ms(b.at));
    const map = new Map<string, MountainStamp & { seen: Set<HikingSeason> }>();
    for (const s of ordered) {
        const t = ms(s.at);
        let st = map.get(s.mountainId);
        if (!st) { st = { mountainId: s.mountainId, verified: false, firstAt: t, count: 0, seasons: [], seen: new Set() }; map.set(s.mountainId, st); }
        if (s.verified) {
            // 처음 인증되는 순간 — 도장을 얻은 때는 그 인증의 때다(먼저 적어 둔 기록의 날이 아니다)
            if (!st.verified) { st.verified = true; st.firstAt = t; st.count = 0; }
            st.count++; st.seen.add(hikingSeasonOf(t));
        } else if (!st.verified) st.count++;
    }
    return Array.from(map.values()).map(({ seen, ...st }) => ({ ...st, seasons: HIKING_SEASONS.filter((x) => seen.has(x)) })).sort((a, b) => a.firstAt - b.firstAt);
}

export interface HikingSlotState { m: StampMountain; stamp: MountainStamp | null; record: MountainStamp | null }
export interface HikingBookState { book: HikingBook; slots: HikingSlotState[]; got: number; total: number; done: boolean }
export function hikingBookStates(books: readonly HikingBook[], stamps: readonly MountainStamp[]): HikingBookState[] {
    const by = new Map(stamps.map((s) => [s.mountainId, s]));
    return books.map((book) => {
        const slots = book.slots.map((m): HikingSlotState => { const s = by.get(m.id) ?? null; return { m, stamp: s?.verified ? s : null, record: s && !s.verified ? s : null }; });
        const got = slots.filter((s) => s.stamp).length;
        return { book, slots, got, total: slots.length, done: got === slots.length };
    });
}

// ── 핀 ───────────────────────────────────────────────────────────
export type HikingPinId = "first" | "m10" | "m30" | "m50" | "m100" | "over1000" | "seasons" | "regions";
export interface HikingPin { id: HikingPinId; name: string; how: string; art: string }
export const HIKING_PINS: readonly HikingPin[] = [
    { id: "first", name: "첫 정상", how: "정상에서 인증한 첫 산", art: "pin-boot" },
    { id: "m10", name: "열 산", how: "인증한 산 10곳", art: "pin-pack" },
    { id: "m30", name: "서른 산", how: "인증한 산 30곳", art: "pin-poles" },
    { id: "m50", name: "쉰 산", how: "인증한 산 50곳", art: "pin-ridge" },
    { id: "m100", name: "백 산", how: "인증한 산 100곳", art: "pin-stone" },
    { id: "over1000", name: "천 미터", how: "해발 1,000m 이상의 산 하나", art: "pin-cloud" },
    { id: "seasons", name: "사철 산행", how: "봄 · 여름 · 가을 · 겨울에 다 오름", art: "pin-seasons" },
    { id: "regions", name: "전국 한 바퀴", how: "여덟 권역에 도장 하나씩", art: "pin-compass" },
];
export const hikingPin = (id: string): HikingPin | undefined => HIKING_PINS.find((p) => p.id === id);
const COUNT_PINS: readonly [HikingPinId, number][] = [["m10", 10], ["m30", 30], ["m50", 50], ["m100", 100]];

// ── 받는 것 ────────────────────────────────────────────────────────
/** patch 는 도장첩 한 권의 와펜 · grand 는 묶음 전부의 큰 와펜 · pin 은 핀 · grade 는 오른 산행 등급(shared/hikingGrade) */
export type HikingAwardKind = "patch" | "grand" | "pin" | "grade";
export interface HikingAwardDue { kind: HikingAwardKind; key: string; earnedAt: number }
export const hikingAwardId = (kind: HikingAwardKind, key: string) => `${kind}:${key}`;

/**
 * 기록 → 지금까지 받았어야 할 것 전부(받은 순서). mountains 는 산의 요약(권역 · 높이를 본다) — 도장첩도 여기서 만든다.
 * 인증 도장만 센다. 받은 때는 그 조건을 채운 도장 · 산행의 때다.
 */
export function hikingAwardsDue(mountains: readonly StampMountain[], summits: readonly Summit[]): HikingAwardDue[] {
    const out: HikingAwardDue[] = [];
    const stamps = mountainStamps(summits).filter((s) => s.verified);
    if (stamps.length === 0) return out;
    const info = new Map(mountains.map((m) => [m.id, m]));
    const states = hikingBookStates(hikingBooks(mountains), stamps);
    for (const st of states) if (st.done) out.push({ kind: "patch", key: st.book.id, earnedAt: Math.max(...st.slots.map((s) => s.stamp!.firstAt)) });
    for (const g of HIKING_GRANDS) {
        const mine = states.filter((s) => s.book.kind === g.kind);
        if (mine.length > 0 && mine.every((s) => s.done)) out.push({ kind: "grand", key: g.id, earnedAt: Math.max(...mine.flatMap((s) => s.slots.map((x) => x.stamp!.firstAt))) });
    }
    // 산행 등급 — 인증한 서로 다른 산의 수로 오른다
    for (const g of hikingGradesDue(stamps.map((s) => s.firstAt))) out.push({ kind: "grade", key: g.id, earnedAt: g.earnedAt });
    // 핀 — 도장을 얻은 순서로
    out.push({ kind: "pin", key: "first", earnedAt: stamps[0].firstAt });
    for (const [id, n] of COUNT_PINS) if (stamps.length >= n) out.push({ kind: "pin", key: id, earnedAt: stamps[n - 1].firstAt });
    const high = stamps.find((s) => (info.get(s.mountainId)?.heightM ?? 0) >= 1000);
    if (high) out.push({ kind: "pin", key: "over1000", earnedAt: high.firstAt });
    const firstIn = new Map<string, number>();
    for (const s of stamps) { const r = info.get(s.mountainId)?.region; if (r && !firstIn.has(r)) firstIn.set(r, s.firstAt); }
    if (HIKING_REGIONS.every((r) => firstIn.has(r.id))) out.push({ kind: "pin", key: "regions", earnedAt: Math.max(...HIKING_REGIONS.map((r) => firstIn.get(r.id)!)) });
    // 사철 — 인증한 산행(어느 산이든)이 네 철에 다 있다. 받은 때는 넷째 철의 첫 산행
    const seasonFirst = new Map<HikingSeason, number>();
    for (const s of [...summits].filter((x) => x.verified && Number.isFinite(ms(x.at))).sort((a, b) => ms(a.at) - ms(b.at))) { const k = hikingSeasonOf(s.at); if (!seasonFirst.has(k)) seasonFirst.set(k, ms(s.at)); }
    if (seasonFirst.size === HIKING_SEASONS.length) out.push({ kind: "pin", key: "seasons", earnedAt: Math.max(...Array.from(seasonFirst.values())) });
    return out.sort((a, b) => a.earnedAt - b.earnedAt);
}

// ── 정상 인증 ──────────────────────────────────────────────────────
/** 정상에서 이 안이면 인증(m). 정상석 둘레와 산 위의 위치 오차를 받아 주되, 능선 아래는 안 되는 거리 */
export const SUMMIT_RADIUS_M = 150;
/** 이보다 흐린 위치(정확도 반경, m)는 판단에 쓰지 않는다 */
export const SUMMIT_MAX_ACCURACY_M = 200;
/** 남기는 거리 구간 — 좌표는 저장하지 않는다 */
export type SummitBucket = "<150m" | "150-500m" | "500m-2km" | ">2km" | "coarse" | "no-fix";
export type SummitReason = "ok" | "far" | "coarse" | "no-fix" | "no-summit";
export function judgeSummit(distanceM: number | null, accuracyM: number | null | undefined): { verified: boolean; bucket: SummitBucket; reason: SummitReason } {
    if (distanceM == null || !Number.isFinite(distanceM)) return { verified: false, bucket: "no-fix", reason: "no-fix" };
    if (accuracyM != null && Number.isFinite(accuracyM) && accuracyM > SUMMIT_MAX_ACCURACY_M) return { verified: false, bucket: "coarse", reason: "coarse" };
    if (distanceM <= SUMMIT_RADIUS_M) return { verified: true, bucket: "<150m", reason: "ok" };
    return { verified: false, bucket: distanceM <= 500 ? "150-500m" : distanceM <= 2000 ? "500m-2km" : ">2km", reason: "far" };
}
/** 인증이 안 됐을 때의 한 줄 */
export function summitHint(reason: SummitReason, bucket: SummitBucket): string {
    if (reason === "no-fix") return "위치를 잡지 못했어요. 하늘이 트인 곳에서 다시 눌러 주세요.";
    if (reason === "coarse") return "위치가 흐려요. 잠시 뒤에 다시 눌러 주세요.";
    if (reason === "no-summit") return "이 산은 정상의 자리를 아직 몰라 인증할 수 없어요.";
    return bucket === "150-500m" ? "정상이 가까워요. 조금만 더 올라가서 눌러 주세요." : bucket === "500m-2km" ? "정상까지 아직 남았어요." : "정상 가까이에서 눌러 주세요.";
}
