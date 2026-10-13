/**
 * 낚시의 어종과 '짜' — 기록어 · 승급 · 어탁첩의 바탕(2026-10-14 기획 둘째 판: 기록어 + 어탁 + 크루 정출).
 *
 * 골프 · 등산이 '다녀온 곳'을 모은다면 낚시는 '잡은 크기'를 모은다. 낚시꾼의 자랑은 어종마다 다르다:
 *  - 길이(cm): 붕어 월척 → 4짜 → 5짜, 배스 런커, 감성돔 5짜, 농어 따오기 → 미터급 …
 *  - 마릿수(수): 주꾸미 · 갑오징어 — 쿨러 조과
 *  - 무게(kg): 무늬오징어 '킬로급', 문어
 *  - 지(손가락 너비): 갈치 3지 · 4지 · 5지
 * 단계의 문턱은 낚시계의 관행을 따른 것이다(월척 30.3cm · 런커 50cm · 따오기 80cm 는 통용되는 기준, 나머지는 10cm 단위의 '짜').
 * 법의 기준(금지체장)이 아니다 — 규정 안내는 수산자원관리법 원문을 대조한 뒤 따로 싣는다.
 * 이름은 낚시꾼이 부르는 이름이다(우럭 = 조피볼락, 광어 = 넙치). 받은 어종 자료의 '우럭'은 조개라 그 자료와 이름으로 잇지 않는다.
 *
 * ⚠️ 서버가 부른다 — 상대 임포트는 ./x.js.
 */

export type FishUnit = "cm" | "count" | "kg" | "ji";
export type FishWater = "sea" | "fresh";
export interface FishTier { name: string; min: number }
export interface FishKind {
    /** 어탁 그림의 이름이기도 하다(client/public/fishing/art/gyotaku-<id>.webp) */
    id: string;
    name: string;
    water: FishWater;
    unit: FishUnit;
    /** 낮은 것부터 */
    tiers: readonly FishTier[];
}

const jja = (...mins: number[]): FishTier[] => mins.map((m) => ({ name: `${Math.floor(m / 10)}짜`, min: m }));
const named = (list: [string, number][]): FishTier[] => list.map(([name, min]) => ({ name, min }));

export const FISH: readonly FishKind[] = [
    // 바다
    { id: "gamseongdom", name: "감성돔", water: "sea", unit: "cm", tiers: jja(30, 40, 50, 60) },
    { id: "chamdom", name: "참돔", water: "sea", unit: "cm", tiers: jja(40, 50, 70, 80) },
    { id: "doldom", name: "돌돔", water: "sea", unit: "cm", tiers: jja(30, 40, 50, 60) },
    { id: "ureok", name: "우럭", water: "sea", unit: "cm", tiers: named([["3짜", 30], ["개우럭", 40], ["5짜", 50]]) },
    { id: "gwangeo", name: "광어", water: "sea", unit: "cm", tiers: named([["5짜", 50], ["7짜", 70], ["대광어", 80]]) },
    { id: "nongeo", name: "농어", water: "sea", unit: "cm", tiers: named([["5짜", 50], ["7짜", 70], ["따오기", 80], ["미터급", 100]]) },
    { id: "bollak", name: "볼락", water: "sea", unit: "cm", tiers: named([["2짜", 20], ["왕볼락", 25], ["3짜", 30]]) },
    { id: "godeungeo", name: "고등어", water: "sea", unit: "cm", tiers: named([["3짜", 30], ["대고등어", 40]]) },
    { id: "busiri", name: "부시리", water: "sea", unit: "cm", tiers: named([["6짜", 60], ["8짜", 80], ["미터급", 100], ["미터오버", 120]]) },
    { id: "samchi", name: "삼치", water: "sea", unit: "cm", tiers: named([["5짜", 50], ["7짜", 70], ["미터급", 100]]) },
    { id: "galchi", name: "갈치", water: "sea", unit: "ji", tiers: named([["3지", 3], ["4지", 4], ["5지", 5]]) },
    { id: "jukkumi", name: "주꾸미", water: "sea", unit: "count", tiers: named([["10수", 10], ["30수", 30], ["50수", 50], ["100수", 100]]) },
    { id: "gabojingeo", name: "갑오징어", water: "sea", unit: "count", tiers: named([["5수", 5], ["10수", 10], ["20수", 20], ["30수", 30]]) },
    { id: "munui", name: "무늬오징어", water: "sea", unit: "kg", tiers: named([["500그램", 0.5], ["킬로급", 1], ["2킬로", 2], ["3킬로", 3]]) },
    { id: "muneo", name: "문어", water: "sea", unit: "kg", tiers: named([["킬로급", 1], ["3킬로", 3], ["5킬로", 5]]) },
    // 민물
    { id: "bungeo", name: "붕어", water: "fresh", unit: "cm", tiers: named([["준척", 27], ["월척", 30.3], ["4짜", 40], ["5짜", 50]]) },
    { id: "ingeo", name: "잉어", water: "fresh", unit: "cm", tiers: named([["5짜", 50], ["7짜", 70], ["미터급", 100]]) },
    { id: "bass", name: "배스", water: "fresh", unit: "cm", tiers: named([["3짜", 30], ["4짜", 40], ["런커", 50], ["6짜", 60]]) },
    { id: "ssogari", name: "쏘가리", water: "fresh", unit: "cm", tiers: jja(30, 40, 50) },
    { id: "megi", name: "메기", water: "fresh", unit: "cm", tiers: jja(40, 60, 80) },
    { id: "songeo", name: "송어", water: "fresh", unit: "cm", tiers: jja(40, 50, 60) },
];

const BY_ID = new Map(FISH.map((f) => [f.id, f]));
const BY_NAME = new Map(FISH.map((f) => [f.name, f]));
export const fishById = (id: string | null | undefined): FishKind | null => BY_ID.get(String(id ?? "")) ?? null;
/** 사람이 적은 이름으로 — 띄어쓰기를 걷고 꼭 맞을 때만(목록에 없는 어종은 null — 기록은 되고 어탁 · 승급만 없다) */
export const fishByName = (name: string | null | undefined): FishKind | null => BY_NAME.get(String(name ?? "").replace(/\s+/g, "")) ?? null;

export const FISH_UNIT_LABEL: Readonly<Record<FishUnit, string>> = { cm: "cm", count: "수", kg: "kg", ji: "지" };
/** 값을 그 단위의 글로 — 31.5cm · 42수 · 1.2kg · 4지 */
export function fishValueText(unit: FishUnit, v: number): string {
    return `${unit === "count" || unit === "ji" ? Math.round(v) : Math.round(v * 10) / 10}${FISH_UNIT_LABEL[unit]}`;
}

/** 조과 한 줄에서 이 어종의 '자랑하는 값' — 길이 · 마릿수 · 무게 · 지. 적지 않았으면 null */
export function fishValue(fish: Pick<FishKind, "unit">, c: { lengthCm?: number | null; count?: number | null; weightKg?: number | null; ji?: number | null }): number | null {
    const v = fish.unit === "cm" ? c.lengthCm : fish.unit === "count" ? c.count : fish.unit === "kg" ? c.weightKg : c.ji;
    return typeof v === "number" && v > 0 ? v : null;
}

/** 지금 값으로 오른 단계(없으면 null)와 다음 단계(다 올랐으면 null) */
export function fishTier(fish: Pick<FishKind, "tiers">, value: number | null): { tier: FishTier | null; index: number; next: FishTier | null; gap: number | null } {
    let index = -1;
    if (value != null) for (let i = 0; i < fish.tiers.length; i++) if (value >= fish.tiers[i].min) index = i;
    const next = fish.tiers[index + 1] ?? null;
    return { tier: index >= 0 ? fish.tiers[index] : null, index, next, gap: next && value != null ? Math.round((next.min - value) * 10) / 10 : null };
}

export interface FishRecord<C> {
    fish: FishKind;
    /** 그 어종의 기록어(자랑하는 값이 가장 큰 줄) — 값을 적은 줄이 없으면 가장 최근 줄 */
    best: C;
    value: number | null;
    tier: FishTier | null;
    tierIndex: number;
    next: FishTier | null;
    gap: number | null;
    /** 이 어종을 적은 줄 수 */
    catches: number;
    /** 처음 만난 날 */
    first: string;
}

/**
 * 내 기록어 — 목록에 있는 어종마다 한 줄. 단계를 많이 오른 것 → 길이 어종 → 큰 값 순.
 * 목록에 없는 이름(잡어 · 사람이 적은 이름)은 여기 없다 — 조과 목록에는 그대로 남는다.
 */
export function fishRecords<C extends { species: string; day: string; lengthCm?: number | null; count?: number | null; weightKg?: number | null; ji?: number | null }>(list: readonly C[]): FishRecord<C>[] {
    const by = new Map<string, FishRecord<C>>();
    for (const c of list) {
        const fish = fishByName(c.species);
        if (!fish) continue;
        const v = fishValue(fish, c);
        const cur = by.get(fish.id);
        if (!cur) { by.set(fish.id, { fish, best: c, value: v, tier: null, tierIndex: -1, next: null, gap: null, catches: 1, first: c.day }); continue; }
        cur.catches++;
        if (c.day < cur.first) cur.first = c.day;
        if (v != null && (cur.value == null || v > cur.value)) { cur.best = c; cur.value = v; }
    }
    const out = [...by.values()].map((r) => { const t = fishTier(r.fish, r.value); return { ...r, tier: t.tier, tierIndex: t.index, next: t.next, gap: t.gap }; });
    // 그 어종의 단계를 얼마나 올랐는가(오른 칸 ÷ 전체 칸)가 먼저 — 단위가 다른 어종끼리는 값으로 견줄 수 없다(62수 와 41.5cm).
    // 같으면 길이로 말하는 어종을 앞에(맨 앞 한 장이 홈에 크게 걸린다), 그다음 값.
    const climbed = (r: FishRecord<C>) => (r.tierIndex + 1) / r.fish.tiers.length;
    return out.sort((a, b) => climbed(b) - climbed(a) || Number(b.fish.unit === "cm") - Number(a.fish.unit === "cm") || (b.value ?? 0) - (a.value ?? 0) || a.fish.name.localeCompare(b.fish.name, "ko"));
}

/** 어탁첩 — 바다 · 민물. 한 칸 = 한 어종의 어탁 */
export const FISH_BOOKS = [
    { id: "sea", name: "바다 어탁첩", note: "바다에서 만나는 열다섯 어종", fish: FISH.filter((f) => f.water === "sea") },
    { id: "fresh", name: "민물 어탁첩", note: "저수지 · 강에서 만나는 여섯 어종", fish: FISH.filter((f) => f.water === "fresh") },
] as const;

/** 가장 가까운 승급 — 다음 단계까지 남은 것이 (그 단계 문턱에 견줘) 가장 적은 기록어 */
export function nearestPromotion<C>(records: readonly FishRecord<C>[]): FishRecord<C> | null {
    const open = records.filter((r) => r.next && r.gap != null && r.gap > 0);
    return open.sort((a, b) => (a.gap as number) / (a.next as FishTier).min - (b.gap as number) / (b.next as FishTier).min)[0] ?? null;
}
