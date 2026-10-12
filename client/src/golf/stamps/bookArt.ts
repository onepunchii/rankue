/**
 * 도장첩의 겉모습 — 권마다의 잉크 색 · 가운데 무늬 · 표지 · 볼마커(2026-10-12).
 * 어느 골프장이 어느 권인지는 shared/golfStampBooks(규칙), 여기는 그림과 색뿐이다.
 *
 * 그림은 client/public/golf/stamp-art/ 에 있다 — 화면의 주소(/golf/stamps)와 겹치지 않게 폴더 이름을 달리했다.
 * 그림 모델로 그린 뒤 따낸 것이라 실제 골프장 · 로고 · 글자가 없다. 권의 이름 · 골프장 이름 · 숫자는 전부 화면이 얹는다:
 *   cover-<권>.webp   도장첩 표지(600×800, 위 3분의 1 이 빈 하늘 — 제목 자리)
 *   marker-<권>.webp  그 권을 다 채우면 받는 볼마커(400×400, 투명 바탕) · marker-all-open 은 누구나 일곱 권 전부
 *   trophy-1..5.webp  찍은 골프장 수 트로피(440×440, 투명 바탕, 네모 깃발이 비어 있다 — 숫자 자리)
 */
import { STAMP_ALL_OPEN, STAMP_TROPHY_STEPS } from "@shared/golfStampBooks";

export type StampGlyph = "sunsea" | "tree" | "peaks" | "lake" | "flower" | "sunrise" | "volcano" | "gate";

export interface BookArt {
    /** 종이 위 잉크 색 — 도장은 늘 종이(도장첩 속지) 위에 찍힌다 */
    ink: string;
    /** 도장 가운데 무늬 */
    glyph: StampGlyph;
    /** 표지의 하늘이 어두운가 — 제목을 흰 글자로 */
    darkSky?: boolean;
}

export const BOOK_ART: Readonly<Record<string, BookArt>> = {
    seohae: { ink: "#E0602A", glyph: "sunsea", darkSky: true },
    gyeonggi: { ink: "#4F8F1C", glyph: "tree" },
    gangwon: { ink: "#2F6BD6", glyph: "peaks" },
    chungcheong: { ink: "#12908A", glyph: "lake" },
    honam: { ink: "#D23F57", glyph: "flower" },
    yeongnam: { ink: "#CF7A12", glyph: "sunrise" },
    jeju: { ink: "#3A3A3A", glyph: "volcano" },
    "invite-capital": { ink: "#8E6A1C", glyph: "gate", darkSky: true },
    "invite-regional": { ink: "#8E6A1C", glyph: "gate" },
};

export const coverSrc = (bookId: string) => `/golf/stamp-art/cover-${bookId}.webp`;
/** 볼마커 그림 — 권의 id, 또는 STAMP_ALL_OPEN(누구나 일곱 권 전부) */
export const markerSrc = (bookId: string) => `/golf/stamp-art/marker-${bookId}.webp`;
export const ALL_OPEN_MARKER = markerSrc(STAMP_ALL_OPEN);

/** 도장 가운데 무늬 — 24×24 상자의 선 그림(SVG path 의 d). 색 · 굵기는 도장이 정한다 */
export const GLYPH_PATHS: Readonly<Record<StampGlyph, readonly string[]>> = {
    sunsea: ["M4 13h16", "M7.5 13a4.5 4.5 0 0 1 9 0", "M3 17.5c1.5-1.2 3-1.2 4.5 0s3 1.2 4.5 0 3-1.2 4.5 0 3 1.2 4.5 0", "M12 4.5v2M6 7l1.4 1.4M18 7l-1.4 1.4"],
    tree: ["M6.5 9a5.5 5.5 0 1 0 11 0a5.5 5.5 0 1 0-11 0", "M12 14.5V21M8.5 21h7"],
    peaks: ["M2 20l6.5-12 3.5 6 2.5-4 7.5 10z", "M6.6 11.5l1.9 1.2 1.9-1.2"],
    lake: ["M7 12c1-3.5 3-5 5-5s4 1.5 5 5z", "M3 16c1.5-1.2 3-1.2 4.5 0s3 1.2 4.5 0 3-1.2 4.5 0 3 1.2 4.5 0", "M3 20c1.5-1.2 3-1.2 4.5 0s3 1.2 4.5 0 3-1.2 4.5 0 3 1.2 4.5 0"],
    flower: ["M9.8 12a2.2 2.2 0 1 0 4.4 0a2.2 2.2 0 1 0-4.4 0", "M12 9.8c-3-5.5 3-5.5 0 0M14.2 12c5.5-3 5.5 3 0 0M12 14.2c3 5.5-3 5.5 0 0M9.8 12c-5.5 3-5.5-3 0 0"],
    sunrise: ["M3 16.5h18", "M7 16.5a5 5 0 0 1 10 0", "M12 5.5V8M5.5 9l1.7 1.7M18.5 9l-1.7 1.7", "M6 20.5h12"],
    volcano: ["M2 16c4-.5 6-6 8-6h4c2 0 4 5.5 8 6z", "M4 20h3m2 0h3m2 0h3m2 0h1"],
    gate: ["M5 21V8l7-4 7 4v13", "M9 21v-8h6v8M12 13v8"],
};

export interface TrophyArt {
    /** 이 수만큼 찍으면 받는다 */
    at: number;
    src: string;
    /** 깃발 네모의 자리(그림 한 변에 대한 비율) — 따낼 때 그림에서 찾은 값. 숫자를 그 한가운데에 얹는다 */
    flag: { x: number; y: number; w: number; h: number };
    /** 깃발 위 숫자의 색 — 맨 위 트로피만 깃발이 상아색이라 짙은 글자 */
    ink: string;
}

const FLAGS: TrophyArt["flag"][] = [
    { x: 0.3879, y: 0.0883, w: 0.3011, h: 0.1859 },
    { x: 0.4202, y: 0.0873, w: 0.291, h: 0.1778 },
    { x: 0.4394, y: 0.0853, w: 0.2748, h: 0.1849 },
    { x: 0.4131, y: 0.0903, w: 0.2839, h: 0.1758 },
    { x: 0.397, y: 0.1611, w: 0.3001, h: 0.1667 },
];

/** 트로피 다섯 — 단계는 규칙(STAMP_TROPHY_STEPS)에서 읽는다 */
export const TROPHIES: readonly TrophyArt[] = STAMP_TROPHY_STEPS.map((at, i) => ({
    at, src: `/golf/stamp-art/trophy-${i + 1}.webp`, flag: FLAGS[i], ink: i === STAMP_TROPHY_STEPS.length - 1 ? "#5B4300" : "#FFFFFF",
}));
