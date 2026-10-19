/**
 * 등산 — 산의 권역 · 목록 · 특성 · 주소(2026-10-13 오너: "산은 각 지역으로 묶어도 되고 특성으로 묶고 다양한 스탬프를 받을 수 있게 …
 * 우리가 가장 잘하는 산에 대한 정보를 페이지 만들어서 골프처럼 사이트맵해서 정보 + 가입 유도").
 *
 * 등산은 당구 · 골프와 **따로 선 세계**다(기획 docs/01-plan/features/hiking-category.md). 이 파일은 등산의 뿌리 규칙이다 —
 * 골프의 권역(shared/golfRegions) · 도장첩(shared/golfStampBooks)을 가져다 쓰지 않는다.
 *
 *  - 권역 여덟: 정상 좌표가 속한 시도로 가른다(여러 시도에 걸친 산도 정상 한 점 기준 — 자료가 그렇다).
 *  - 목록: 공식 목록만 이름을 걸고 낸다(산림청 100대 명산 · 100대 명산 플러스 · 국립공원 · 도립공원). 높은 산 50 은 우리 자료의 높이로 센 것이다.
 *          다른 회사의 인증 프로그램 · 사설 사이트의 순위는 내지 않는다(받은 자료에는 있지만 이름을 빌리지 않는다).
 *  - 특성: 자료로 틀림없이 판정되는 것만 — 높이(1,500m 이상 · 1,000m 이상 · 500m 아래) · 섬(시군구) · 목록 소속.
 *
 * 순수 함수만(서버 · 화면 · 적재 스크립트가 같이 쓴다). ⚠️ 서버가 임포트하는 shared 파일 — 상대 임포트는 반드시 './x.js'.
 */

import { HIKING_FEATURES, type HikingFeatureId } from "./hikingFeatures.js";

export type HikingRegionId = "capital" | "gangwon" | "chungcheong" | "jeonbuk" | "jeonnam" | "gyeongbuk" | "gyeongnam" | "jeju";
export interface HikingRegion {
    id: HikingRegionId;
    /** 화면의 이름 */
    name: string;
    /** 이 권역의 시도(받은 자료의 이름 그대로 — 2026-07-01 행정구역) */
    sidos: readonly string[];
}
export const HIKING_REGIONS: readonly HikingRegion[] = [
    { id: "capital", name: "수도권", sidos: ["서울특별시", "경기도", "인천광역시"] },
    { id: "gangwon", name: "강원", sidos: ["강원특별자치도"] },
    { id: "chungcheong", name: "충청", sidos: ["충청북도", "충청남도", "대전광역시", "세종특별자치시"] },
    { id: "jeonbuk", name: "전북", sidos: ["전북특별자치도"] },
    { id: "jeonnam", name: "전남", sidos: ["전남광주통합특별시", "전라남도", "광주광역시"] },
    { id: "gyeongbuk", name: "경북", sidos: ["경상북도", "대구광역시"] },
    { id: "gyeongnam", name: "경남", sidos: ["경상남도", "부산광역시", "울산광역시"] },
    { id: "jeju", name: "제주", sidos: ["제주특별자치도"] },
];
const REGION_BY_SIDO = new Map<string, HikingRegionId>(HIKING_REGIONS.flatMap((r) => r.sidos.map((s) => [s, r.id] as const)));
export const hikingRegionOf = (sido: string | null | undefined): HikingRegionId | null => (sido ? REGION_BY_SIDO.get(sido) ?? null : null);
export const hikingRegion = (id: string | null | undefined): HikingRegion | undefined => HIKING_REGIONS.find((r) => r.id === id);

/**
 * 산 이름에서 정상 표지 설명을 뗀다(2026-10-19) — 받은 자료가 "검마산(정상안내판)" · "내대암봉(삼각점)" · "화산(종이표지)"처럼
 * 표지를 이름 칸에 적었다(검마산 페이지는 이번 주에도 검색으로 다섯 명이 들어왔다). 다른 이름("금정봉(쇠미산)")은 그대로 둔다.
 */
const MARKER_NOTE = /\s*\((?:정상)?\s*(?:안내판|삼각점|종이\s*표지|표지석|정상석|표지판|이정표)\)\s*$/u;
export const hikingDisplayName = (raw: string): string => String(raw ?? "").replace(MARKER_NOTE, "").trim() || String(raw ?? "");

/** 시도의 짧은 이름 — "강원특별자치도" → "강원" */
const SIDO_SHORT: Readonly<Record<string, string>> = {
    서울특별시: "서울", 경기도: "경기", 인천광역시: "인천", 강원특별자치도: "강원", 충청북도: "충북", 충청남도: "충남", 대전광역시: "대전", 세종특별자치시: "세종",
    전북특별자치도: "전북", 전남광주통합특별시: "전남", 전라남도: "전남", 광주광역시: "광주", 경상북도: "경북", 대구광역시: "대구", 경상남도: "경남", 부산광역시: "부산", 울산광역시: "울산", 제주특별자치도: "제주",
};
export const sidoShort = (sido: string | null | undefined): string => (sido ? SIDO_SHORT[sido] ?? sido : "");
/** "강원 양양군" — 산이 있는 곳 한 줄 */
/** 시군구를 읽히게 — 받은 자료는 "전주시완산구" · "용인시처인구"처럼 붙여 적었다(산 280곳쯤, 2026-10-19) → "전주시 완산구". 보이는 글에만 쓴다(맞춰 보는 셈은 받은 값 그대로) */
export const sigunguText = (raw: string | null | undefined): string => String(raw ?? "").trim().replace(/^(.{1,3}?시)(?=[^\s].*[구군]$)/u, "$1 ");
export const mountainPlace = (m: { sido?: string | null; sigungu?: string | null }): string => [sidoShort(m.sido), sigunguText(m.sigungu)].filter(Boolean).join(" ");

// ── 목록 ──────────────────────────────────────────────────────────
export type HikingListId = "kfs100" | "kfs100plus" | "nationalparks" | "provincialparks" | "highest50";
export interface HikingList { id: HikingListId; name: string; short: string; by: string }
/** 이름을 걸고 내는 목록 — 받은 자료의 다른 목록(사설 순위 · 다른 회사의 인증 프로그램)은 싣지 않는다 */
export const HIKING_LISTS: readonly HikingList[] = [
    { id: "kfs100", name: "산림청 100대 명산", short: "100대 명산", by: "산림청" },
    { id: "kfs100plus", name: "산림청 100대 명산 플러스", short: "명산 플러스", by: "산림청 · 한국등산트레킹지원센터" },
    { id: "nationalparks", name: "국립공원의 산", short: "국립공원", by: "국립공원공단" },
    { id: "provincialparks", name: "도립공원의 산", short: "도립공원", by: "한국자연공원협회" },
    { id: "highest50", name: "남한의 높은 산 50", short: "높은 산 50", by: "랭큐 정리" },
];
export const hikingList = (id: string): HikingList | undefined => HIKING_LISTS.find((l) => l.id === id);
export const isHikingListId = (v: unknown): v is HikingListId => HIKING_LISTS.some((l) => l.id === v);

// ── 특성 ──────────────────────────────────────────────────────────
export type HikingTrait = "over1500" | "over1000" | "under500" | "island" | HikingFeatureId;
/** how 는 목록의 오른쪽 한 줄, note 는 목록 화면의 설명(없으면 how) */
export interface HikingTraitInfo { id: HikingTrait; name: string; how: string; note?: string }
export const HIKING_TRAITS: readonly HikingTraitInfo[] = [
    { id: "over1500", name: "하늘 가까운 산", how: "해발 1,500m 이상" },
    { id: "over1000", name: "천 미터 산", how: "해발 1,000m 이상" },
    { id: "under500", name: "가볍게 오르는 산", how: "해발 500m 아래" },
    { id: "island", name: "섬의 산", how: "섬에 있는 산" },
    // 철 따라 묶은 산 — 숫자로 판정되지 않아 소개 글에 그 말이 나오는 100대 명산만(shared/hikingFeatures). 산의 traits 에는 읽을 때 얹는다(server/storage/hiking)
    ...HIKING_FEATURES.map((f): HikingTraitInfo => ({ id: f.id, name: f.name, how: f.season, note: f.note })),
];
/**
 * 섬인 시군구 — 시군구 전체가 섬인 곳만(다리가 놓였어도 섬은 섬이다). 일부만 섬인 시군(여수 · 통영 · 고흥 …)은 넣지 않는다 —
 * 그 시군의 뭍 산이 '섬의 산'이 되면 안 된다.
 */
export const ISLAND_SIGUNGU: readonly string[] = ["울릉군", "제주시", "서귀포시", "신안군", "완도군", "진도군", "남해군", "거제시", "강화군", "옹진군"];
export function hikingTraits(m: { heightM?: number | null; sigungu?: string | null }): HikingTrait[] {
    const out: HikingTrait[] = [];
    const h = m.heightM ?? null;
    if (h != null && h >= 1500) out.push("over1500");
    if (h != null && h >= 1000) out.push("over1000");
    if (h != null && h > 0 && h < 500) out.push("under500");
    if (m.sigungu && ISLAND_SIGUNGU.includes(m.sigungu)) out.push("island");
    return out;
}

// ── 묶음(목록 + 특성) ───────────────────────────────────────────────
/** 산을 묶어 보는 한 가지 — 공식 목록이거나, 자료로 판정하는 특성. 주소는 /hiking/lists/<id> 하나를 같이 쓴다 */
export interface HikingGroup { id: string; kind: "list" | "trait"; name: string; short: string; note: string }
export const HIKING_GROUPS: readonly HikingGroup[] = [
    ...HIKING_LISTS.map((l): HikingGroup => ({ id: l.id, kind: "list", name: l.name, short: l.short, note: `출처: ${l.by}` })),
    ...HIKING_TRAITS.map((t): HikingGroup => ({ id: t.id, kind: "trait", name: t.name, short: t.name, note: t.note ?? t.how })),
];
export const hikingGroup = (id: string | null | undefined): HikingGroup | undefined => HIKING_GROUPS.find((g) => g.id === id);
/** 그 산이 그 묶음에 드는가 */
export const inHikingGroup = (g: HikingGroup, m: { lists: readonly string[]; traits: readonly string[] }): boolean => (g.kind === "list" ? m.lists.includes(g.id) : m.traits.includes(g.id));

// ── 주소 ──────────────────────────────────────────────────────────
export const HIKING_HUB_PATH = "/hiking";
export const hikingMountainPath = (slug: string) => `/hiking/mountains/${encodeURIComponent(slug)}`;
export const hikingRegionPath = (id: HikingRegionId) => `/hiking/regions/${id}`;
export const hikingListPath = (id: string) => `/hiking/lists/${id}`;

const slugPart = (v: string) => v.trim().replace(/[\s/]+/g, "-").replace(/[()·.,'"?#%&]/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "");
/** 시군구의 짧은 이름 — "양양군" → "양양", "창원시 마산합포구" → "창원" */
export const sigunguShort = (v: string | null | undefined): string => {
    const first = (v ?? "").trim().split(/\s+/)[0] ?? "";
    return first.length > 2 ? first.replace(/(특별자치시|특별시|광역시|시|군|구)$/, "") : first;
};
/**
 * 산들의 주소(slug)를 정한다 — **넘기는 순서가 우선순위다.** 같은 이름 가운데 맨 앞의 산이 이름 그대로를 갖고(지리산은 '지리산'),
 * 나머지는 "지리산-통영"처럼 시군을 붙이고, 그래도 겹치면 읍면동, 마지막엔 번호.
 * taken 은 이미 정해 둔 주소(id → slug)다 — 그 산은 그 주소를 그대로 쓴다(다시 적재해도 주소가 바뀌지 않게).
 */
export function assignMountainSlugs<T extends { id: string; name: string; sigungu?: string | null; dong?: string | null }>(rows: readonly T[], taken: ReadonlyMap<string, string> = new Map()): Map<string, string> {
    const out = new Map<string, string>();
    const used = new Set<string>(taken.values());
    for (const r of rows) { const have = taken.get(r.id); if (have) out.set(r.id, have); }
    const seen = new Set<string>();
    for (const r of rows) {
        if (out.has(r.id)) continue;
        const base = slugPart(r.name) || r.id;
        const suffixed = [[base, sigunguShort(r.sigungu)], [base, sigunguShort(r.sigungu), slugPart(r.dong ?? "")]].map((p) => p.filter(Boolean).join("-")).filter((s) => s !== base);
        // 그 이름의 첫 산만 이름 그대로를 노린다
        const tries = seen.has(base) ? suffixed : [base, ...suffixed];
        seen.add(base);
        let slug = tries.find((s) => !used.has(s));
        for (let n = 2; !slug; n++) { const s = `${tries[tries.length - 1] ?? base}-${n}`; if (!used.has(s)) slug = s; }
        used.add(slug); out.set(r.id, slug);
    }
    return out;
}

/**
 * 같은 이름의 산이 한 화면에 같이 놓일 때의 이름표 — "지리산(통영)" · "백운산(포천)".
 * 주소(slug)에 시군이 붙은 산은 그 시군을, 이름 그대로를 주소로 가진 산은 dup(그 화면에 겹치는 이름들)에 들 때만 제 시군을 붙인다.
 * 겹치지 않으면 이름 그대로다.
 */
export function mountainLabel(m: { name: string; slug: string; sigungu?: string | null }, dup?: ReadonlySet<string>): string {
    if (m.slug !== m.name && m.slug.startsWith(`${m.name}-`)) return `${m.name}(${m.slug.slice(m.name.length + 1).replace(/-/g, " ")})`;
    const where = sigunguShort(m.sigungu);
    return dup?.has(m.name) && where ? `${m.name}(${where})` : m.name;
}
/** 그 목록에서 두 번 넘게 나오는 이름들 */
export function duplicateNames(list: readonly { name: string }[]): Set<string> {
    const seen = new Set<string>(), dup = new Set<string>();
    for (const m of list) { if (seen.has(m.name)) dup.add(m.name); seen.add(m.name); }
    return dup;
}

/** "1,708m" */
export const heightText = (h: number | null | undefined): string => (h != null && h > 0 ? `${Math.round(h).toLocaleString("en-US")}m` : "");
