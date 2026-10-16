/**
 * 수족관 꾸미기(2026-10-16 오너: "랭큐 낚시는 조건 달성을 통한 굿즈로 수족관 꾸미기로 가면 어때?" → 자리 칸 고르기 · 크루원 구경 + 카드 공유 · 24점).
 *
 * 장식은 조과 기록으로만 열린다(돈 · 결제와 묶지 않는다). 그림은 어탁과 같은 손 — 먹 판화(client/public/fishing/decor).
 * 자리는 여섯 칸: 배경(수평선 위 하늘) · 바닥 · 왼쪽 · 가운데 · 오른쪽 · 소품. 큰 장식은 왼쪽 · 가운데 · 오른쪽 어디든.
 * 받은 장식은 저장소의 받은 기록(fishing_decor_awards)에 남는다 — 기록을 지워도 이미 받은 것은 그대로(큐 케이스와 같은 규칙).
 * 금 닻 하나만 수량 한정(99) — 몇 번째 주인인지(serial)가 남는다.
 * 판정은 순수 함수(decorProgress) — 서버가 받은 기록을 넣을 때와 화면이 남은 수를 보여 줄 때 같은 것을 쓴다.
 */
import { fishByName, fishRecords, type FishWater } from "./fishingFish.js";

export type DecorKind = "bg" | "floor" | "big" | "prop";
export type DecorSlot = "bg" | "floor" | "left" | "center" | "right" | "prop";
export const DECOR_SLOTS: readonly DecorSlot[] = ["bg", "floor", "left", "center", "right", "prop"];
export const DECOR_SLOT_NAME: Readonly<Record<DecorSlot, string>> = { bg: "배경", floor: "바닥", left: "왼쪽", center: "가운데", right: "오른쪽", prop: "소품" };
/** 그 칸에 놓을 수 있는 종류 */
export const SLOT_KIND: Readonly<Record<DecorSlot, DecorKind>> = { bg: "bg", floor: "floor", left: "big", center: "big", right: "big", prop: "prop" };

export type DecorRule =
    | { k: "start" }
    | { k: "catches"; n: number }
    | { k: "species"; n: number }
    | { k: "days"; n: number }
    | { k: "spotDays"; spot: "boat" | "rock" | "pier" | "shore" | "lake" | "river" | "pay"; label: string; n: number }
    | { k: "waterDays"; water: FishWater; n: number }
    | { k: "waterSpecies"; water: FishWater; n: number }
    | { k: "anyOf"; fish: readonly string[]; label: string }
    | { k: "photos"; n: number }
    | { k: "released"; n: number }
    | { k: "seals"; n: number }
    | { k: "trips"; n: number }
    | { k: "yearSpecies"; n: number };

/** 물속에 놓는 방식 — 바닥에 선다 · 위에서 매달린다 · 물에 뜬다 */
export type DecorPlace = "stand" | "hang" | "float";

export interface DecorItem {
    id: string;
    kind: DecorKind;
    name: string;
    rule: DecorRule;
    /** 수족관 안에서의 높이(세상 높이 1000 기준). 배경 · 바닥은 띠의 높이 */
    h: number;
    place: DecorPlace;
    /** 금빛으로 칠한다(금빛 찌 · 금 닻) */
    gold?: boolean;
    /** 밤에 빛난다(집어등 · 등대) — 그림 속 빛의 자리(그림 크기 비율) */
    glow?: readonly [number, number];
    /** 거품이 올라온다(그림 속 자리) */
    bubbles?: readonly [number, number];
    /** 물살에 흔들린다(수초) */
    sway?: boolean;
    /** 수량 한정 */
    limit?: number;
}

export const DECOR_LIMITED = 99;
export const DECOR: readonly DecorItem[] = [
    // 배경 — 수평선 위의 하늘(물 위 띠)
    { id: "bg-dawn", kind: "bg", name: "새벽 바다", rule: { k: "waterDays", water: "sea", n: 10 }, h: 1, place: "stand" },
    { id: "bg-moon", kind: "bg", name: "달밤", rule: { k: "anyOf", fish: ["galchi", "bollak"], label: "갈치 · 볼락(밤낚시 어종)" }, h: 1, place: "stand" },
    { id: "bg-mist", kind: "bg", name: "저수지 물안개", rule: { k: "spotDays", spot: "lake", label: "저수지 · 댐", n: 3 }, h: 1, place: "stand" },
    // 바닥
    { id: "floor-sand", kind: "floor", name: "고운 모래", rule: { k: "start" }, h: 74, place: "stand" },
    { id: "floor-pebble", kind: "floor", name: "몽돌", rule: { k: "spotDays", spot: "shore", label: "해변 · 원투", n: 3 }, h: 120, place: "stand" },
    { id: "floor-ledge", kind: "floor", name: "갯바위 턱", rule: { k: "spotDays", spot: "rock", label: "갯바위", n: 3 }, h: 140, place: "stand" },
    { id: "floor-mud", kind: "floor", name: "민물 진흙", rule: { k: "waterDays", water: "fresh", n: 10 }, h: 104, place: "stand" },
    // 큰 장식 — 왼쪽 · 가운데 · 오른쪽
    { id: "seagrass", kind: "big", name: "잘피", rule: { k: "catches", n: 1 }, h: 300, place: "stand", sway: true },
    { id: "rock", kind: "big", name: "갯바위", rule: { k: "species", n: 5 }, h: 230, place: "stand", bubbles: [0.32, 0.18] },
    { id: "kelp", kind: "big", name: "미역 숲", rule: { k: "species", n: 10 }, h: 400, place: "stand", sway: true },
    { id: "wreck", kind: "big", name: "난파선", rule: { k: "species", n: 15 }, h: 330, place: "stand", bubbles: [0.55, 0.42] },
    { id: "lighthouse", kind: "big", name: "등대", rule: { k: "species", n: 20 }, h: 430, place: "stand", glow: [0.5, 0.12] },
    { id: "tetrapod", kind: "big", name: "테트라포드", rule: { k: "spotDays", spot: "pier", label: "방파제 · 항", n: 3 }, h: 270, place: "stand" },
    { id: "boat", kind: "big", name: "낚싯배", rule: { k: "spotDays", spot: "boat", label: "선상", n: 3 }, h: 280, place: "stand", bubbles: [0.4, 0.6] },
    { id: "trap", kind: "big", name: "통발", rule: { k: "days", n: 10 }, h: 190, place: "stand", bubbles: [0.82, 0.3] },
    { id: "reed", kind: "big", name: "갈대", rule: { k: "waterSpecies", water: "fresh", n: 1 }, h: 380, place: "stand", sway: true },
    { id: "lotus", kind: "big", name: "연꽃", rule: { k: "waterSpecies", water: "fresh", n: 3 }, h: 320, place: "stand", sway: true },
    // 소품
    { id: "shell", kind: "prop", name: "조개 무더기", rule: { k: "released", n: 5 }, h: 110, place: "stand" },
    { id: "anchor", kind: "prop", name: "닻과 밧줄", rule: { k: "days", n: 30 }, h: 170, place: "stand" },
    { id: "lamp", kind: "prop", name: "집어등", rule: { k: "anyOf", fish: ["munui", "gabojingeo", "jukkumi"], label: "무늬오징어 · 갑오징어 · 주꾸미" }, h: 170, place: "hang", glow: [0.44, 0.5] },
    { id: "frame", kind: "prop", name: "어탁 액자", rule: { k: "photos", n: 10 }, h: 140, place: "stand" },
    { id: "float", kind: "prop", name: "금빛 찌", rule: { k: "seals", n: 1 }, h: 190, place: "float", gold: true },
    { id: "crewbuoy", kind: "prop", name: "크루 깃발 부표", rule: { k: "trips", n: 3 }, h: 170, place: "float" },
    { id: "goldanchor", kind: "prop", name: "금 닻", rule: { k: "yearSpecies", n: 15 }, h: 200, place: "stand", gold: true, limit: DECOR_LIMITED },
];
const BY_ID = new Map(DECOR.map((d) => [d.id, d]));
export const decorItem = (id: string | null | undefined): DecorItem | null => BY_ID.get(String(id ?? "")) ?? null;
export const decorImage = (id: string, small = false) => `/fishing/decor/${small ? "s/" : ""}${id}.webp`;

/** 판정에 쓰는 조과 한 줄 — 서버는 표에서, 화면은 받은 기록에서 만든다 */
export interface DecorCatch {
    day: string;
    spot: string | null;
    species: string;
    released: boolean;
    photo: boolean;
    tripId: string | null;
    lengthCm?: number | null;
    count?: number | null;
    weightKg?: number | null;
    ji?: number | null;
}
export interface DecorState { cur: number; need: number; done: boolean }

const SEA_SPOTS = new Set(["boat", "rock", "pier", "shore"]);
const FRESH_SPOTS = new Set(["lake", "river"]);
/** 그 조과의 물 — 어종을 알면 어종으로, 모르면 자리로(유료 낚시터는 알 수 없다) */
function waterOf(c: DecorCatch): FishWater | null {
    const f = fishByName(c.species);
    if (f) return f.water;
    if (c.spot && SEA_SPOTS.has(c.spot)) return "sea";
    if (c.spot && FRESH_SPOTS.has(c.spot)) return "fresh";
    return null;
}

export function decorProgress(list: readonly DecorCatch[]): Record<string, DecorState> {
    const species = new Set<string>(), days = new Set<string>(), spotDays = new Map<string, Set<string>>();
    const waterDays = { sea: new Set<string>(), fresh: new Set<string>() }, waterSpecies = { sea: new Set<string>(), fresh: new Set<string>() };
    const yearSpecies = new Map<string, Set<string>>(), trips = new Set<string>();
    let photos = 0, released = 0;
    for (const c of list) {
        const f = fishByName(c.species);
        days.add(c.day);
        if (f) {
            species.add(f.id);
            waterSpecies[f.water].add(f.id);
            const y = c.day.slice(0, 4), set = yearSpecies.get(y) ?? new Set<string>();
            set.add(f.id); yearSpecies.set(y, set);
        }
        if (c.spot) { const s = spotDays.get(c.spot) ?? new Set<string>(); s.add(c.day); spotDays.set(c.spot, s); }
        const w = waterOf(c);
        if (w) waterDays[w].add(c.day);
        if (c.photo) photos++;
        if (c.released) released++;
        if (c.tripId) trips.add(c.tripId);
    }
    const seals = fishRecords(list).filter((r) => r.tier).length;
    const bestYear = Math.max(0, ...[...yearSpecies.values()].map((s) => s.size));
    const out: Record<string, DecorState> = {};
    for (const d of DECOR) {
        const r = d.rule;
        const [cur, need] =
            r.k === "start" ? [1, 1]
            : r.k === "catches" ? [list.length, r.n]
            : r.k === "species" ? [species.size, r.n]
            : r.k === "days" ? [days.size, r.n]
            : r.k === "spotDays" ? [spotDays.get(r.spot)?.size ?? 0, r.n]
            : r.k === "waterDays" ? [waterDays[r.water].size, r.n]
            : r.k === "waterSpecies" ? [waterSpecies[r.water].size, r.n]
            : r.k === "anyOf" ? [r.fish.some((id) => species.has(id)) ? 1 : 0, 1]
            : r.k === "photos" ? [photos, r.n]
            : r.k === "released" ? [released, r.n]
            : r.k === "seals" ? [seals, r.n]
            : r.k === "trips" ? [trips.size, r.n]
            : [bestYear, r.n];
        out[d.id] = { cur: Math.min(cur, need), need, done: cur >= need };
    }
    return out;
}

/** 여는 조건(사람에게 보이는 글) */
export function decorHow(d: DecorItem): string {
    const r = d.rule;
    switch (r.k) {
        case "start": return "수족관을 열면 바로";
        case "catches": return r.n === 1 ? "첫 조과를 적으면" : `조과 ${r.n}건`;
        case "species": return `만난 어종 ${r.n}종`;
        case "days": return `출조 ${r.n}날`;
        case "spotDays": return `${r.label} 출조 ${r.n}날`;
        case "waterDays": return `${r.water === "sea" ? "바다" : "민물"} 출조 ${r.n}날`;
        case "waterSpecies": return r.n === 1 ? "민물 어종 첫 기록" : `${r.water === "sea" ? "바다" : "민물"} 어종 ${r.n}종`;
        case "anyOf": return `${r.label} 중 하나를 기록`;
        case "photos": return `사진 붙인 조과 ${r.n}건`;
        case "released": return `놓아 준 기록 ${r.n}건`;
        case "seals": return "어종 하나의 첫 낙관(단계)";
        case "trips": return `크루 정출에 조과 ${r.n}번`;
        case "yearSpecies": return `한 해에 만난 어종 ${r.n}종 · 선착순 ${d.limit ?? DECOR_LIMITED}명`;
    }
}

/**
 * 자리 — 저장한 값: 장식 id = 그 장식 · "" = 일부러 비움 · 없음 = 알아서(가진 것 중 어려운 것부터).
 * 받은 것만, 칸에 맞는 종류만 남긴다. 같은 장식을 두 칸에 두지 않는다.
 */
export type DecorLayout = Partial<Record<DecorSlot, string>>;
export function cleanLayout(raw: unknown, owned: ReadonlySet<string>): DecorLayout {
    const out: DecorLayout = {};
    if (!raw || typeof raw !== "object") return out;
    const used = new Set<string>();
    for (const slot of DECOR_SLOTS) {
        const v = (raw as Record<string, unknown>)[slot];
        if (v === "") { out[slot] = ""; continue; }
        if (typeof v !== "string") continue;
        const d = decorItem(v);
        if (!d || d.kind !== SLOT_KIND[slot] || !owned.has(d.id) || used.has(d.id)) continue;
        used.add(d.id); out[slot] = d.id;
    }
    return out;
}
/** 실제로 놓이는 것 — 저장한 자리 + 빈 '알아서' 칸에는 가진 것 중 늦게(어렵게) 열리는 것부터 */
export function resolveLayout(saved: DecorLayout, owned: ReadonlySet<string>): Record<DecorSlot, string | null> {
    const clean = cleanLayout(saved, owned);
    const used = new Set(Object.values(clean).filter((v): v is string => !!v));
    const out = {} as Record<DecorSlot, string | null>;
    // 가운데를 먼저 채운다(가장 눈에 띄는 칸에 가장 어려운 것)
    for (const slot of ["bg", "floor", "center", "left", "right", "prop"] as const) {
        const v = clean[slot];
        if (v !== undefined) { out[slot] = v || null; continue; }
        const pick = [...DECOR].reverse().find((d) => d.kind === SLOT_KIND[slot] && owned.has(d.id) && !used.has(d.id)) ?? null;
        if (pick) used.add(pick.id);
        out[slot] = pick?.id ?? null;
    }
    return out;
}

/** 응답 — 내 수족관이면 items(받은 것 · 남은 수)까지, 크루원 수족관이면 놓인 것만 */
export interface DecorRow { id: string; cur: number; need: number; have: boolean; serial: number | null; owners: number; earnedAt: string | null }
export interface TankFishRow { species: string; count: number }
export interface TankView {
    mine: boolean;
    name: string;
    fish: TankFishRow[];
    /** 어종 id → 낙관(단계 이름) */
    seals: [string, string][];
    layout: DecorLayout;
    placed: Record<DecorSlot, string | null>;
    owned: number;
    items: DecorRow[] | null;
}
/** 크루원 수족관 목록의 한 줄 */
export interface CrewTankRow { memberId: string; name: string; species: number; decor: number; me: boolean; /** 가장 많이 잡은 어종(타일의 어탁) */ top: string | null }
