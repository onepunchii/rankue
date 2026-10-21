/**
 * 축제 화면의 종목 색(2026-10-21 오너: "골프 등산 낚시에 각각 … 축제는 다 동일하니").
 * 자료와 화면의 짜임은 하나, 색 · 표지 · 틀(머리줄 · 하단 탭) · 지도 밑에 깔리는 종목의 점만 종목마다 다르다.
 *  · HIKING — 짙은 청록 + 산호빛 등불, 명산 ▲      (/hiking/festivals · 검색용 정본 /festivals 도 이 색)
 *  · GOLF   — 밤의 검정 + 금빛 등불, 골프장 ■       (/golf/festivals)
 *  · FISHING— 새벽 바다 + 호박빛 등불, 낚시터 ◆     (/fishing/festivals)
 * 색은 6자리 헥스 — 옅은 색은 뒤에 두 자리(알파)를 붙여 쓴다(t.text + "80").
 * ⚠️ 리터럴 색만(종목 테마의 CSS 변수를 쓰지 않는다 — 공개 화면은 테마가 늦게 붙을 수 있다).
 */
import { createContext, useContext, type ReactNode } from "react";
import { FESTIVALS_PATH, festivalPath, festivalSportPath, festivalsSportPath, type FestivalSport } from "@shared/festivals";

export type FestLayerKind = "mountain" | "golf" | "fishing";
export interface FestTheme {
    /** null = 검색용 정본(/festivals) */
    sport: FestivalSport | null;
    base: string;
    item: (id: string) => string;
    bg: string; text: string; accent: string; onAccent: string;
    /** 지금 열리는 등불의 속 · 빛 */
    core: string; glow: string;
    /** 곧 열리는 등불 · 알약 테 */
    soon: string;
    mapBg: string; land: string; landSel: string; landStroke: string;
    hero: string; heroPos: string;
    /** 지도 밑에 깔리는 종목의 점 */
    layer: FestLayerKind;
    /** 홈 · 메뉴의 줄 제목 */
    picksTitle: string;
    /** 축제 한 곳 화면의 '가는 길에' 순서 — 종목의 것 먼저 */
    aroundOrder: readonly FestLayerKind[];
}

const HIKING: FestTheme = {
    sport: "HIKING", base: festivalsSportPath("HIKING"), item: (id) => festivalSportPath("HIKING", id),
    bg: "#0B1F26", text: "#F4EFE3", accent: "#F28C6A", onAccent: "#2A1208", core: "#FFEDE2", glow: "#FFE1CF", soon: "#F6D9A8",
    mapBg: "radial-gradient(120% 75% at 50% 0%, #143A44 0%, #0B1F26 72%)", land: "#13363F", landSel: "#1D4C55", landStroke: "#2B5E66",
    hero: "/festivals/art/hero.webp", heroPos: "50% 56%", layer: "mountain", picksTitle: "산행 길에 들를 축제", aroundOrder: ["mountain", "golf", "fishing"],
};
const GOLF: FestTheme = {
    sport: "GOLF", base: festivalsSportPath("GOLF"), item: (id) => festivalSportPath("GOLF", id),
    bg: "#0A0A0A", text: "#FFFFFF", accent: "#FFC43D", onAccent: "#1F1500", core: "#FFF6DB", glow: "#FFF0C2", soon: "#CFE8B8",
    mapBg: "radial-gradient(120% 75% at 50% 0%, #17241B 0%, #0A0A0A 72%)", land: "#142019", landSel: "#1D3324", landStroke: "#2A4532",
    hero: "/festivals/art/hero-golf.webp", heroPos: "50% 58%", layer: "golf", picksTitle: "라운드 길에 들를 축제", aroundOrder: ["golf", "mountain", "fishing"],
};
const FISHING: FestTheme = {
    sport: "FISHING", base: festivalsSportPath("FISHING"), item: (id) => festivalSportPath("FISHING", id),
    bg: "#0B1E2D", text: "#F3ECDD", accent: "#F4A963", onAccent: "#2A1606", core: "#FFF1E2", glow: "#FFE6CC", soon: "#F8DDB0",
    mapBg: "radial-gradient(120% 75% at 50% 0%, #13324A 0%, #0B1E2D 72%)", land: "#12334A", landSel: "#1A4560", landStroke: "#255470",
    hero: "/festivals/art/hero-fishing.webp", heroPos: "50% 58%", layer: "fishing", picksTitle: "낚시 축제", aroundOrder: ["fishing", "mountain", "golf"],
};
/** 검색용 정본(/festivals) — 등산의 색, 주소는 정본 */
const NEUTRAL: FestTheme = { ...HIKING, sport: null, base: FESTIVALS_PATH, item: festivalPath };

export const FEST_THEMES: Readonly<Record<FestivalSport, FestTheme>> = { HIKING, GOLF, FISHING };
export const festTheme = (sport: FestivalSport | null) => (sport ? FEST_THEMES[sport] : NEUTRAL);

export const FestThemeCtx = createContext<FestTheme>(NEUTRAL);
const Ctx = FestThemeCtx;
export const useFestTheme = () => useContext(Ctx);

/** 구역 하나 — 제목과 오른쪽 한 줄(등산의 HkSection 과 같은 치수 · 색은 종목의 것) */
export function FestSection({ title, aside, children, className, testId }: { title: string; aside?: ReactNode; children: ReactNode; className?: string; testId?: string }) {
    const t = useContext(Ctx);
    return (
        <section className={`px-5 pt-8 ${className ?? ""}`} data-testid={testId}>
            <div className="mb-3 flex items-baseline justify-between gap-3">
                <h2 className="text-[18px] font-semibold tracking-tight" style={{ color: t.text }}>{title}</h2>
                {aside && <span className="shrink-0 text-[12.5px]" style={{ color: `${t.text}8C` }}>{aside}</span>}
            </div>
            {children}
        </section>
    );
}

/** 틀 없이 색만 — 종목 홈에 얹는 축제 줄(FestivalPicks) */
export function FestThemeScope({ sport, children }: { sport: FestivalSport | null; children: ReactNode }) {
    return <Ctx.Provider value={festTheme(sport)}>{children}</Ctx.Provider>;
}

/** 주소에서 종목 — /golf/festivals… → GOLF, /festivals… → null(검색용 정본) */
export function festSportOfPath(path: string): FestivalSport | null {
    const m = /^\/(golf|hiking|fishing)\/festivals(?:\/|$)/.exec(path);
    return m ? (m[1].toUpperCase() as FestivalSport) : null;
}
