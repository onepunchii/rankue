/**
 * 등산의 색(2026-10-13) — '새벽 능선'. 당구(밝은 판) · 골프(검정 + 라임)와 섞이지 않는 등산만의 색이다.
 * 짙은 청록 바탕에 산호빛과 모래빛, 그리고 지도 · 도장이 놓이는 종이색.
 * ⚠️ 등산 화면은 테마 유틸(bg-white · text-black …)을 쓰지 않고 이 값을 리터럴로 쓴다 — 종목 테마가 바뀌어도 등산은 등산의 색이다.
 */
export const HK = {
    /** 화면 바탕 */
    bg: "#0B1F26",
    /** 카드 · 머리줄 */
    deep: "#0E2A33",
    teal: "#1F5560",
    mist: "#7FA39A",
    /** 강조(오른 산 · 지금 위치 · 주 단추) */
    coral: "#F28C6A",
    /** 보조 강조(숫자 · 받은 것) */
    sand: "#F6D9A8",
    /** 지도 · 도장이 놓이는 종이 */
    paper: "#F4EFE3",
    /** 종이 위의 글자 */
    ink: "#0E2A33",
} as const;

/** 길 위의 지점의 색 — 종이 위(높낮이 그림)와 짙은 바탕 둘 다에서 읽히는 값 */
export const POI_COLOR: Readonly<Record<string, string>> = {
    SIGN: "#3F8FA3", DANGER: "#E0533B", SHELTER: "#3D7BE0", WILD: "#4FA35A", CULTURAL: "#B07A3A", GRID: "#8E7CC3", MARK: "#8A979B",
    // 산림청 100대 명산 코스 파일의 편의 지점(2026-10-13)
    ENTRY: "#F28C6A", PARK: "#5C6F7B", BUS: "#2E9E8F", TOILET: "#6A5ACD", WATER: "#1F9BD1", VIEW: "#D9A441", PEAK: "#7A5230", REST: "#9BAA5B",
};
/** 길의 종류의 색(shared/hikingSurface) — 종이 위의 막대. 이름과 퍼센트를 늘 같이 적는다(색만으로 가르지 않는다) */
export const SURFACE_COLOR: Readonly<Record<string, string>> = {
    trail: "#3F7D58", stairs: "#D9A441", scree: "#8A7F6A", paved: "#9AA7AB", rock: "#C8553D", bridge: "#1F5560", rope: "#7A2E1E", etc: "#C9C2B0",
};

/** 권역 표지 그림 · 허브 그림(client/public/hiking/art) — 그림에는 글자가 없다 */
export const hikingCover = (region: string | null | undefined) => `/hiking/art/cover-${region ?? "gangwon"}.webp`;
export const HIKING_HERO = "/hiking/art/hero.webp";

/** 와펜(자수 패치) · 핀의 그림 — 이름은 shared/hikingStamps 의 art. 그림에는 글자가 없다 */
export const patchSrc = (art: string) => `/hiking/art/patch-${art}.webp`;
export const pinSrc = (art: string) => `/hiking/art/${art}.webp`;

/** 목록 · 특성 묶음의 표지 그림(kfs100 · nationalparks · maple …) — 그림에는 글자가 없다 */
const LIST_COVERS = new Set(["kfs100", "kfs100plus", "nationalparks", "provincialparks", "highest50", "over1500", "over1000", "under500", "island", "azalea", "maple", "reeds", "snow"]);
export const hikingListCover = (id: string | null | undefined) => (id && LIST_COVERS.has(id) ? `/hiking/art/cover-list-${id}.webp` : HIKING_HERO);
/** 산행 등급의 휘장(shared/hikingGrade) */
export const gradeSrc = (id: string) => `/hiking/art/grade-${id}.webp`;
/** 산 와펜의 그림 — 산림청 100대 명산만 있다(산의 id). 모양 · 테두리는 MountainPatch 가 그린다 */
export const mountainPatchSrc = (mountainId: string) => `/hiking/art/mt/${mountainId}.webp`;
