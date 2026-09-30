/**
 * 골프장 카드 이미지 — 정사각형 1200×1200 PNG (2026-09-30 오너: 네이버에서 선수 페이지는 카드 썸네일이 줄지어 뜨는데
 * 골프장 페이지는 "화면 정렬도 안 맞고 하단에 다양한 정보가 안 나온다").
 *
 * 왜 정사각형: 네이버·구글 썸네일은 정사각형으로 잘린다. 490곳이 쓰던 가로형 og-golf.png(1200×630, 글자 왼쪽)는
 * 가운데가 잘려 "골프 490곳"만 반쯤 보였고, 모든 골프장이 같은 그림이라 목록 밑에 카드가 모이지도 않았다.
 * 선수 카드(playerCard.ts)처럼 골프장마다 **자기 이름·로고·숫자가 든 카드 한 장**을 만든다. 중요한 건 전부 가운데에.
 *
 * 내용은 우리가 가진 사실만: 로고(골프장 페이지 로고) · 이름 · 도/시군 · 홀·운영형태 · 주중 그린피 · 회원권 시세.
 * 없는 칸은 비워 두지 않고 뺀다. 엔진·폰트는 선수 카드와 공용(지연 로드 — /api 전체가 죽는 사고 방지).
 */
import { engines, fonts, CARD_SIZE } from "./playerCard.js";

export interface GolfCourseCardInput {
    name: string;
    /** "경북 영천" */
    where: string;
    /** "27홀 · 회원제" */
    shape: string;
    /** data:image/png;base64,… — 없으면 이름 첫 글자 */
    logo?: string | null;
    tiles: { label: string; value: string; accent?: "lime" | "orange" }[];
}

const BG = "#0A0A0A";
const LIME = "#64DD17";
const ORANGE = "#FF8A3D";
const INK = "#F5F5F4";
const MUTED = "rgba(245,245,244,0.62)";
const LINE = "rgba(245,245,244,0.14)";

type El = { type: string; props: Record<string, unknown> & { children?: unknown } };
const h = (type: string, style: Record<string, unknown>, ...children: unknown[]): El =>
    ({ type, props: { style: type === "div" ? { display: "flex", ...style } : style, children: children.length === 1 ? children[0] : children } });

function monogram(name: string): string {
    const n = name.replace(/\s+/g, "").replace(/^(골프존카운티|더|the)/i, "");
    const ko = n.match(/[가-힣]{1,2}/);
    return ko ? ko[0] : n.slice(0, 2).toUpperCase();
}

function tree(p: GolfCourseCardInput): El {
    const nameSize = p.name.length > 12 ? 70 : p.name.length > 8 ? 84 : 100;
    const logo = p.logo
        ? h("div", { width: 520, height: 230, borderRadius: 44, background: "#FFFFFF", alignItems: "center", justifyContent: "center", padding: 28 },
            { type: "img", props: { src: p.logo, style: { maxWidth: 464, maxHeight: 174, objectFit: "contain" } } })
        : h("div", { width: 230, height: 230, borderRadius: 115, background: "rgba(245,245,244,0.08)", border: `3px solid ${LINE}`, alignItems: "center", justifyContent: "center", fontSize: 88, fontWeight: 800, color: MUTED }, monogram(p.name));
    const tiles = p.tiles.slice(0, 3).map((t) =>
        h("div", { flexDirection: "column", alignItems: "center", flex: 1, minWidth: 0, background: "rgba(245,245,244,0.06)", border: `2px solid ${LINE}`, borderRadius: 32, padding: "26px 16px" },
            h("div", { fontSize: 30, fontWeight: 500, color: MUTED }, t.label),
            h("div", { marginTop: 8, fontSize: t.value.length > 7 ? 46 : 58, fontWeight: 800, letterSpacing: -2, color: t.accent === "orange" ? ORANGE : t.accent === "lime" ? LIME : INK }, t.value),
        ));
    return h("div", {
        width: CARD_SIZE, height: CARD_SIZE, flexDirection: "column", alignItems: "center", justifyContent: "space-between",
        padding: "64px 72px 56px", fontFamily: "Pretendard", color: INK,
        backgroundColor: BG,
        backgroundImage: "radial-gradient(circle at 50% 34%, rgba(100,221,23,0.20) 0%, rgba(100,221,23,0.05) 40%, rgba(10,10,10,0) 70%)",
    },
        // 머리: 랭큐 골프 · 지역
        h("div", { width: "100%", justifyContent: "space-between", alignItems: "center" },
            h("div", { alignItems: "center", fontSize: 34, fontWeight: 800, letterSpacing: 2 },
                h("div", { width: 18, height: 18, borderRadius: 9, background: LIME, marginRight: 14 }), "RANKUE GOLF"),
            h("div", { fontSize: 32, fontWeight: 700, color: MUTED }, p.where),
        ),
        // 가운데: 로고 · 이름 · 모양
        h("div", { flexDirection: "column", alignItems: "center" },
            logo,
            h("div", { marginTop: 44, fontSize: nameSize, fontWeight: 800, letterSpacing: -3, textAlign: "center", maxWidth: 1040, lineHeight: 1.08 }, p.name),
            p.shape ? h("div", { marginTop: 16, fontSize: 38, fontWeight: 500, color: MUTED }, p.shape) : "",
        ),
        // 숫자 줄
        p.tiles.length
            ? h("div", { width: "100%", gap: 20 }, ...tiles)
            : h("div", { fontSize: 36, fontWeight: 700, color: MUTED }, "부킹 · 조인 · 그린피 · 회원권 시세"),
        // 발
        h("div", { width: "100%", justifyContent: "space-between", alignItems: "center", borderTop: `2px solid ${LINE}`, paddingTop: 28 },
            h("div", { fontSize: 28, fontWeight: 700, color: MUTED }, "부킹 · 조인 · 그린피 · 회원권 시세"),
            h("div", { fontSize: 28, fontWeight: 700, color: MUTED, letterSpacing: 1 }, "www.rankue.co.kr"),
        ),
    );
}

export async function renderGolfCourseCardPng(p: GolfCourseCardInput): Promise<Buffer> {
    const { satori, Resvg } = await engines();
    const svg = await satori(tree(p) as any, { width: CARD_SIZE, height: CARD_SIZE, fonts: fonts() });
    return new Resvg(svg, { fitTo: { mode: "width", value: CARD_SIZE } }).render().asPng();
}

/** 카드 주소 정본 — 프리렌더·사이트맵·클라이언트 useSeo 가 같은 규칙. 슬러그는 한글이라 인코딩한다. */
export const golfCourseCardUrl = (origin: string, slug: string) => `${origin}/og/golf-course/${encodeURIComponent(slug)}.png`;
