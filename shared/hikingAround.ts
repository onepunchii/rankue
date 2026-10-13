/**
 * 등산 — 산의 '둘레'(2026-10-13 오너: "골프 CC 상세 페이지 기능을 등산에도, 산 상세 페이지에 접목할 수 있는 거 접목해줘").
 * 산 화면(client/src/hiking/pages/MountainPage)의 구역 줄 · 한눈 숫자 · 위치(들머리) · 근처 맛집 · 가까운 산의 판이 쓰는 순수 셈과 글.
 * 골프의 파일을 임포트하지 않는다 — 등산은 등산의 것으로(같아야 하는 값은 시험이 골프의 것과 맞춰 본다).
 *
 * ── 근처 맛집 · 카페(네이버 지역 검색) ─────────────────────────────────────
 * 골프장 '근처'(shared/golfAround)와 **같은 약관 아래**에 있다(네이버 검색 API 특약 2026-09-07 시행 — 바꾸기 전에 약관 원문을 볼 것):
 *   · 저장 · 캐싱 금지 → 구역이 화면에 들어올 때 · 칩을 누를 때 실시간으로 부른다. 응답은 no-store, DB · CDN · 검색엔진용 화면(server/seo/hiking)에
 *     두지 않는다. 화면도 기기에 남는 캐시에 넣지 않는다 — 앱의 React Query 캐시는 localStorage 에 일주일 남으므로(lib/queryClient) 쓰지 않고,
 *     구역이 떠 있는 동안의 메모리에만 1분 둔다(칩을 오갈 때 깜박이지 않을 만큼).
 *   · 가공 금지 → 순서 · 낱말 그대로. 거리로 거르거나 다시 줄 세우지 않고, 거리 · 별점 같은 우리 표시를 얹지 않는다.
 *     (검색어를 바꿔 다시 묻는 것은 한다 — 아래 '검색에 쓸 이름'. 그때도 받은 답은 통째로 쓰거나 통째로 버린다: server/services/naverLocal.)
 *   · 결과가 나오는 구역에 광고 금지 · AI 활용(요약 · 추천) 금지.
 *   · 검색어는 **서버가** 산 이름과 정해 둔 낱말로만 만든다 — 손님이 친 말을 받아 주면 남의 검색 대리가 된다.
 *   · 방문자 발자국: 결과 구역은 data-track-as 로 구역 이름만 남긴다(결과의 글자 · 주소는 남기지 않는다 — shared/uiTrail).
 * ⚠️ **검색어의 품질은 아직 재지 않았다.** 골프는 "{이름} 근처 맛집" 을 골프장 12곳 · 490곳에 불러 보고 골랐지만(golfAround 머리말),
 *    산 이름으로는 한 번도 불러 보지 않았다. 같은 꼴이 산에서도 가까운 곳을 내는지, 아래 반경이 맞는지는 운영에서 재고 고칠 것.
 *    칩이 둘뿐인 것도 그래서다 — 낱말을 보태려면 재고 넣는다. 술을 권하는 낱말은 싣지 않는다(산에서 내려와 차를 모는 사람이 많다).
 *
 * ⚠️ 서버가 임포트하는 shared 파일 — 상대 임포트는 반드시 './x.js'.
 */
import { distM, type LinePoint } from "./hikingGeo.js";
import { bearingDeg, compass8, nearKmText, type NearMountain } from "./hikingNear.js";

// ── 구역 줄 ──────────────────────────────────────────────────────────
/** 산 화면의 구역 — 위에서 아래로 놓인 순서. 구역 줄(HkSectionNav)은 이 가운데 **화면에 실제로 있는 것만** 보여 준다 */
export const MOUNTAIN_SECTIONS = [
    { id: "courses", label: "코스" },
    { id: "photos", label: "사진" },
    { id: "weather", label: "날씨" },
    { id: "about", label: "이야기" },
    { id: "map", label: "위치" },
    { id: "food", label: "맛집" },
    { id: "nearby", label: "주변" },
] as const;
export type MountainSectionId = (typeof MOUNTAIN_SECTIONS)[number]["id"];
/** 구역이 이보다 적으면 구역 줄을 그리지 않는다 */
export const SECTION_NAV_MIN = 3;

/** 산 화면에 새로 놓인 구역의 글 */
export const MOUNTAIN_AROUND_LABEL = {
    map: "위치 · 들머리",
    trailMap: "들머리 지도 보기",
    trailRoute: "들머리까지 길찾기",
    mapAside: "카카오맵으로 열려요",
    findByName: "카카오맵에서 찾아보기",
    noCourse: "코스가 없어 산 이름으로 찾아요.",
    askDistance: "내 위치에서 거리",
    onDevice: "직선 거리예요. 내 위치는 이 기기에서만 써요.",
    here: "여기",
    naver: "네이버 검색 결과",
    dialCentre: "이 산",
    dial: "가운데가 이 산, 위쪽이 북쪽이에요. 직선 거리라 길로 가면 더 멀어요.",
    coursesSoon: "코스 준비 중",
} as const;

// ── 한눈 숫자 ─────────────────────────────────────────────────────────
/** 가장 짧은 코스와 그 자리(코스 고르기 칩의 순번) — 코스가 없으면 null. 거리가 같으면 앞의 것 */
export function shortestCourse<T extends { km: number }>(list: readonly T[]): { course: T; index: number } | null {
    let best = -1;
    list.forEach((c, i) => { if (Number.isFinite(c.km) && (best < 0 || c.km < list[best].km)) best = i; });
    return best < 0 ? null : { course: list[best], index: best };
}

// ── 내 위치에서 ───────────────────────────────────────────────────────
/** 이보다 멀면 "내 위치에서"를 적지 않는다(km) — 나라 밖에서 연 화면에 수천 km 를 적지 않게. 나라 안의 가장 먼 두 곳이 600km 남짓이다 */
export const FROM_ME_MAX_KM = 700;
/**
 * "내 위치에서 북동쪽 12km" — 내 자리에서 본 정상의 방향과 직선 거리. 자리를 모르거나 너무 멀면 null.
 * **기기에서만 센다**: 내 위치는 서버로 가지 않고 어디에도 적어 두지 않는다(client/src/hiking/lib/useMyLocation).
 */
export function fromMeText(me: { lat: number; lng: number } | null | undefined, summit: { lat: number | null; lng: number | null }): string | null {
    if (!me || summit.lat == null || summit.lng == null) return null;
    if (![me.lat, me.lng, summit.lat, summit.lng].every(Number.isFinite)) return null;
    const km = distM(me.lat, me.lng, summit.lat, summit.lng) / 1000;
    if (km > FROM_ME_MAX_KM) return null;
    // 바로 그 자리(50m 안)에서는 방향이 뜻이 없다
    const dir = km >= 0.05 ? `${compass8(bearingDeg(me.lat, me.lng, summit.lat, summit.lng))}쪽 ` : "";
    return `내 위치에서 ${dir}${nearKmText(km)}`;
}

// ── 들머리 ───────────────────────────────────────────────────────────
export interface Trailhead {
    lat: number;
    lng: number;
    /** 선의 끝 점에서 잡았는가 — 정상에서 시작해 내려오는 기록 */
    fromEnd: boolean;
}
/**
 * 코스의 들머리 — 코스 선의 첫 점이다(기록이 걷기 시작한 자리). 지도 · 길찾기에 넘긴다.
 * 다만 기록이 **정상에서 시작해 내려오는 길**이면(shared/hikingPage courseShape 와 같은 금: 정상이 앞 15% 안, 원점 회귀는 빼고)
 * 첫 점이 곧 정상이다 — 정상으로 길찾기를 걸면 안 되므로 아래쪽 끝(선의 마지막 점)을 들머리로 본다.
 */
export function courseTrailhead(c: { line: readonly LinePoint[]; km: number; summitKm: number | null; loop?: boolean } | null | undefined): Trailhead | null {
    const line = c?.line ?? [];
    if (!c || line.length === 0) return null;
    const fromEnd = !c.loop && line.length > 1 && c.summitKm != null && c.km > 0 && c.summitKm <= c.km * 0.15;
    const p = fromEnd ? line[line.length - 1] : line[0];
    return Number.isFinite(p[0]) && Number.isFinite(p[1]) ? { lat: p[0], lng: p[1], fromEnd } : null;
}
/** 지도 · 길찾기에 넘기는 들머리의 이름 */
export const trailheadName = (mountainName: string) => `${mountainName} 들머리`;

// ── 가까운 산의 판 ────────────────────────────────────────────────────
/** 가까운 산 한 곳(서버가 준 것 — 이 산에서의 직선 거리 km 가 달려 있다) */
export interface NearbySummary {
    slug: string; name: string; lat: number | null; lng: number | null; heightM: number | null;
    tier: number; lists: readonly string[]; courses: number; region: string | null; km: number;
}
/**
 * 판(동그란 그림)에 놓을 산들 — **이 산이 가운데**다(홈의 판은 가운데가 나). 방향은 이 산의 정상에서 본 것, 거리는 서버가 잰 값 그대로.
 * 자리를 모르는 산은 뺀다. 순서는 받은 그대로(가까운 순).
 */
export function nearbyDialItems(centre: { lat: number | null; lng: number | null }, nearby: readonly NearbySummary[]): NearMountain[] {
    if (centre.lat == null || centre.lng == null) return [];
    const out: NearMountain[] = [];
    for (const m of nearby) {
        if (m.lat == null || m.lng == null || !Number.isFinite(m.km)) continue;
        out.push({
            slug: m.slug, name: m.name, lat: m.lat, lng: m.lng, heightM: m.heightM, famous: m.tier === 1, kfs: m.lists.includes("kfs100"), courses: m.courses, region: m.region,
            km: m.km, bearing: bearingDeg(centre.lat, centre.lng, m.lat, m.lng),
        });
    }
    return out;
}
/** 판을 그리는 산의 수 — 한 곳뿐이면 판이 휑하다(목록만 보여 준다) */
export const NEARBY_DIAL_MIN = 2;

// ── 근처 맛집 · 카페 ──────────────────────────────────────────────────
/** 칩 — key 는 주소에 실리는 값(?kind=), word 는 검색어에 붙는 낱말이자 칩 글자 */
export const HIKING_NEARBY_KINDS = [
    { key: "food", word: "맛집" },
    { key: "cafe", word: "카페" },
] as const;
export type HikingNearbyKind = (typeof HIKING_NEARBY_KINDS)[number]["key"];
export const isHikingNearbyKind = (v: unknown): v is HikingNearbyKind => typeof v === "string" && HIKING_NEARBY_KINDS.some((k) => k.key === v);
export const hikingNearbyWord = (kind: HikingNearbyKind): string => (HIKING_NEARBY_KINDS.find((k) => k.key === kind) ?? HIKING_NEARBY_KINDS[0]).word;
/**
 * 네이버에 보내는 검색어 — "{산 이름} 근처 맛집". 화면의 '네이버 지도에서 더 보기'도 같은 말로 연다.
 * 실제로 말을 잇는 것은 server/services/naverLocal(골프의 nearbyWordQuery)이다 — 같은 말이 나오는지 시험이 맞춰 본다.
 */
export const hikingNearbyQuery = (name: string, kind: HikingNearbyKind): string => `${name} 근처 ${hikingNearbyWord(kind)}`;

/** 한 곳 — 네이버가 준 글 그대로(강조 태그만 뗀 것). 좌표는 내려오지 않는다 */
export interface HikingNearbyPlace { name: string; category: string; address: string }
export interface HikingNearbyResult { query: string; items: HikingNearbyPlace[] }

/** 이름 다듬기 — 괄호와 그 안("팔공산(비로봉)" · 닫히지 않은 "(" 뒤), 쉼표 · 가운뎃점. 괄호가 든 이름은 지도에서도 안 잡힌다 */
export function cleanMountainName(s: string): string {
    return s.replace(/[(\[（][^)\]）]*[)\]）]?/g, " ").replace(/[,·]/g, " ").replace(/\s+/g, " ").trim();
}
/**
 * 검색에 쓸 이름들 — 차례대로 묻고 처음으로 쓸 만한 답을 쓴다(server/services/naverLocal).
 *   ① 산 이름  ② 산 이름 + 시군구("백운산 포천시")
 * 같은 이름의 산이 많다(백운산 · 남산 · 봉화산 …). 이름만으로는 이름난 쪽의 동네가 나오므로, 서버가 정상의 자리로 그 답을 버리고 ②로 다시 묻는다.
 * 주소에 시군이 붙은 산("지리산-통영" — 같은 이름 가운데 뒤의 산)은 ①이 틀릴 것이 뻔해 ②부터 묻는다(하루 한도를 아낀다).
 */
export function hikingNearbyNames(m: { name: string; slug?: string | null; sigungu?: string | null }): { name: string }[] {
    const name = cleanMountainName(m.name) || m.name.trim();
    const where = (m.sigungu ?? "").trim().split(/\s+/)[0] ?? "";
    const withPlace = where ? `${name} ${where}` : "";
    const later = !!m.slug && m.slug !== m.name && m.slug.startsWith(`${m.name}-`);
    return (later ? [withPlace, name] : [name, withPlace]).filter((n, i, a) => n.length >= 2 && a.indexOf(n) === i).map((n) => ({ name: n }));
}
/**
 * '가깝다'의 반경(km) — 정상에서 이 안에 든 곳이 둘 이상이어야 그 답을 쓴다(다른 고장의 같은 이름 산을 막는 데만 쓴다 — 줄을 거르지 않는다).
 * 큰 산은 정상에서 들머리 마을까지가 멀어 골프장(15km)보다 넉넉히 잡았다. **재지 않은 값이다**(머리말).
 */
export const HIKING_NEARBY_RADIUS_KM = 30;

/** 네이버 지도 검색 주소(앱이 있으면 앱으로 넘어간다) */
export const hikingNaverMapUrl = (query: string) => `https://map.naver.com/p/search/${encodeURIComponent(query)}`;
/** 그 가게를 네이버 지도에서 찾는 주소 — 이름 + 주소 앞 세 마디(같은 이름의 다른 지점과 섞이지 않게). 골프의 줄과 같은 식 */
export const hikingPlaceUrl = (p: HikingNearbyPlace) => hikingNaverMapUrl([p.name, ...p.address.split(/\s+/).slice(0, 3)].join(" ").trim());
/** 메모리에 들고 있는 시간(ms) — 칩을 오갈 때 다시 부르지 않을 만큼만 */
export const HIKING_NEARBY_HOLD_MS = 60_000;
