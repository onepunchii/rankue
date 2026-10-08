/**
 * 골프장 카드 이미지 — 정사각형 1200×1200 PNG (2026-09-30 오너: 네이버에서 선수 페이지는 카드 썸네일이 줄지어 뜨는데
 * 골프장 페이지는 "화면 정렬도 안 맞고 하단에 다양한 정보가 안 나온다").
 *
 * 왜 정사각형: 네이버·구글 썸네일은 정사각형으로 잘린다. 490곳이 쓰던 가로형 og-golf.png(1200×630, 글자 왼쪽)는
 * 가운데가 잘려 "골프 490곳"만 반쯤 보였고, 모든 골프장이 같은 그림이라 목록 밑에 카드가 모이지도 않았다.
 *
 * 둘째 판 — **로고 판**(2026-10-08 오너: "이미지 너무 별로인데 … 썸네일 시안 몇 개 만들어 줘 봐" → 시안 넷 중 "골프는 시안 C"):
 *   첫 판은 가운데에 로고 칸 · 이름(100px) · 숫자 칸 · 발을 쌓았다. 검색 결과의 90~110px 로 줄면 이름은 9px 이라 안 읽히고,
 *   로고는 여백 때문에 흰 네모 속 얼룩이 됐다. 그래서 요소를 둘로 줄였다 —
 *     위(640)  판에 로고를 크게. 여백을 잘라 내고(server/lib/logoTrim) 판에 꽉 차게. 골프장마다 로고가 달라 줄지어 떠도 서로 다르다.
 *     아래     이름을 칸 너비에 맞는 가장 큰 글자로(한두 줄) + 라임 한 줄(지역 · 홀 수 · 운영 형태).
 *   판의 색: 보통 로고는 흰 판, 흰색뿐인 로고(-light.png)는 어두운 판. 로고가 없으면 어두운 판에 전국 점 지도(이 골프장을 켠다),
 *   지도도 못 그리면(좌표 없음) 이름 첫 글자.
 *   그린피·회원권 시세 칸은 뺐다 — 작은 크기에서 읽히지 않았고, 그 숫자는 페이지 본문·제목에 있다.
 *
 * 내용은 우리가 가진 사실만. 엔진·폰트는 선수 카드와 공용(지연 로드 — /api 전체가 죽는 사고 방지).
 * 그림을 바꾸면 shared/ogCards 의 CARD_VERSION 을 올릴 것(주소가 달라져야 검색엔진이 다시 가져간다).
 */
import { engines, fonts, CARD_SIZE } from "./playerCard.js";
import { fitSize, nameLines } from "./cardText.js";

export { golfCourseCardUrl } from "../../shared/ogCards.js";

export interface GolfCourseCardInput {
    name: string;
    /** "강원 양양" */
    where: string;
    /** "27홀 · 대중제" — 없으면 빈 글자 */
    facts: string;
    /** 여백을 잘라 낸 로고. light = 흰색뿐인 로고(어두운 판에 놓는다) */
    logo?: { uri: string; width: number; height: number; light?: boolean } | null;
    /** 로고가 없을 때 그 자리에 서는 점 지도(점만 — 시도 윤곽선 자료는 밖으로 나가는 그림에 싣지 않는다) */
    map?: { uri: string; width: number; height: number } | null;
}

const BG = "#0A0A0A";
const PLATE_DARK = "#101010";
const LIME = "#64DD17";
const INK = "#F5F5F4";
const MUTED = "rgba(245,245,244,0.62)";
const LINE = "rgba(245,245,244,0.14)";

/** 판의 높이 · 판과 이름 사이의 라임 줄 · 양옆 여백 */
const PLATE_H = 640, RULE_H = 12, PAD = 72;
/** 로고가 판 안에서 차지할 수 있는 크기, 그리고 키울 수 있는 한도(작은 로고를 너무 키우면 뭉개진다) */
const LOGO_MAX_W = 900, LOGO_MAX_H = 430, LOGO_MAX_SCALE = 5;

type El = { type: string; props: Record<string, unknown> & { children?: unknown } };
const h = (type: string, style: Record<string, unknown>, ...children: unknown[]): El =>
    ({ type, props: { style: type === "div" ? { display: "flex", ...style } : style, children: children.length === 1 ? children[0] : children } });
const img = (src: string, w: number, hgt: number, style: Record<string, unknown> = {}): El =>
    ({ type: "img", props: { src, width: w, height: hgt, style: { width: w, height: hgt, ...style } } });

function monogram(name: string): string {
    const n = name.replace(/\s+/g, "").replace(/^(골프존카운티|더|the)/i, "");
    const ko = n.match(/[가-힣]{1,2}/);
    return ko ? ko[0] : n.slice(0, 2).toUpperCase();
}

const brand = (color: string) => h("div", { position: "absolute", top: 44, left: 56, alignItems: "center", fontSize: 30, fontWeight: 800, letterSpacing: 2, color },
    h("div", { width: 15, height: 15, borderRadius: 8, background: LIME, marginRight: 12 }), "RANKUE GOLF");

function plate(p: GolfCourseCardInput): El {
    const box = { height: PLATE_H, alignItems: "center", justifyContent: "center", position: "relative" } as const;
    if (p.logo) {
        const k = Math.min(LOGO_MAX_W / p.logo.width, LOGO_MAX_H / p.logo.height, LOGO_MAX_SCALE);
        const dark = !!p.logo.light;
        return h("div", { ...box, background: dark ? PLATE_DARK : "#FFFFFF" }, brand(dark ? INK : BG),
            img(p.logo.uri, Math.round(p.logo.width * k), Math.round(p.logo.height * k), { marginTop: 30 }));
    }
    if (p.map) return h("div", { ...box, background: PLATE_DARK }, brand(INK), img(p.map.uri, p.map.width, p.map.height));
    return h("div", { ...box, background: PLATE_DARK }, brand(INK),
        h("div", { width: 300, height: 300, borderRadius: 150, background: "rgba(245,245,244,0.08)", border: `3px solid ${LINE}`, alignItems: "center", justifyContent: "center", fontSize: 116, fontWeight: 800, color: MUTED }, monogram(p.name)));
}

function tree(p: GolfCourseCardInput): El {
    const room = CARD_SIZE - PAD * 2;
    const name = nameLines(p.name, room, 176, 150);
    const line = [p.where, p.facts].filter(Boolean).join(" · ");
    return h("div", { width: CARD_SIZE, height: CARD_SIZE, flexDirection: "column", fontFamily: "Pretendard", color: INK, backgroundColor: BG },
        plate(p),
        h("div", { height: RULE_H, background: LIME }),
        h("div", { flex: 1, flexDirection: "column", justifyContent: "center", padding: `0 ${PAD}px` },
            h("div", { flexDirection: "column" }, ...name.lines.map((l) =>
                h("div", { fontSize: name.size, fontWeight: 800, letterSpacing: -name.size * 0.035, lineHeight: 1.04, whiteSpace: "nowrap" }, l))),
            line ? h("div", { marginTop: 26, fontSize: fitSize([line], room, 54), fontWeight: 700, color: LIME, whiteSpace: "nowrap" }, line) : ""),
    );
}

export async function renderGolfCourseCardPng(p: GolfCourseCardInput): Promise<Buffer> {
    const { satori, Resvg } = await engines();
    const svg = await satori(tree(p) as any, { width: CARD_SIZE, height: CARD_SIZE, fonts: fonts() });
    return new Resvg(svg, { fitTo: { mode: "width", value: CARD_SIZE } }).render().asPng();
}
