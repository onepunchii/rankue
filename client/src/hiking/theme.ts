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
};

/** 권역 표지 그림 · 허브 그림(client/public/hiking/art) — 그림에는 글자가 없다 */
export const hikingCover = (region: string | null | undefined) => `/hiking/art/cover-${region ?? "gangwon"}.webp`;
export const HIKING_HERO = "/hiking/art/hero.webp";
