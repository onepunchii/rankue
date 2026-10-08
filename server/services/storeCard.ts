/**
 * 당구장 카드 이미지 — 정사각형 1200×1200 PNG (2026-09-30 오너: "매장 검색에는 이미지가 없고, 하단에 선수 카드처럼 줄지어 나오게").
 *
 * 매장 페이지 1,199곳에 대표 이미지가 하나도 없어 네이버 결과가 글만 나왔다. 선수 카드(playerCard.ts)와 같은
 * 펠트 그린·상아 팔레트로, 우리가 가진 **객관 정보만** 싣는다(오너 정책: 소개·자유텍스트 요금은 싣지 않는다).
 *
 * 둘째 판 — **당구대 그림**(2026-10-08 오너: "이미지 너무 별로인데 … 매장이랑 이런 거 이미지도 같이" → 시안 넷 중 "당구장은 시안 B"):
 *   첫 판은 글자뿐이고 카드의 절반이 빈 자리였다. 매장에는 로고도 사진도 없다 — 검색 결과의 90~110px 에서 '당구장'으로 읽힐 것이 없었다.
 *     위(640)  위에서 본 캐롬 당구대(우리가 그린 그림 — tableSvg). 흰 공·노란 공·빨간 공과 옅은 길 한 줄.
 *              공 자리는 매장 코드에서 나온다 — 매장마다 달라 줄지어 떠도 서로 다르고, 같은 매장은 늘 같은 그림이다.
 *     아래     동네(금색) · 이름을 칸 너비에 맞는 가장 큰 글자로(한두 줄) · 테이블 수와 10분 요금 한 줄.
 *   영업시간은 뺐다(작은 크기에서 읽히지 않았다 — 페이지 본문에 있다).
 *
 * 엔진·폰트는 선수 카드와 공용(지연 로드). 그림을 바꾸면 shared/ogCards 의 CARD_VERSION 을 올릴 것.
 */
import { engines, fonts, CARD_SIZE } from "./playerCard.js";
import { fitSize, nameLines } from "./cardText.js";

export { storeCardUrl } from "../../shared/ogCards.js";

export interface StoreCardInput {
    /** 매장 코드 — 당구대 그림의 공 자리를 정한다 */
    code: string;
    name: string;
    /** "서울 중구" */
    area: string;
    tables: { label: string; n: number }[];
    /** "10분 1,900원" · 테이블마다 다르면 가장 싼 값에 "~" — 없으면 null */
    rate?: string | null;
}

const FELT_DEEP = "#062A1E";
const IVORY = "#F5F1E6";
const GOLD = "#E8C46A";
const MUTED = "rgba(245,241,230,0.64)";

/** 당구대 그림의 높이 · 양옆 여백 */
const ART_H = 640, PAD = 72;

type El = { type: string; props: Record<string, unknown> & { children?: unknown } };
const h = (type: string, style: Record<string, unknown>, ...children: unknown[]): El =>
    ({ type, props: { style: type === "div" ? { display: "flex", ...style } : style, children: children.length === 1 ? children[0] : children } });

const r1 = (v: number) => Math.round(v * 10) / 10;

/**
 * 위에서 본 캐롬 당구대 — 나무 틀 · 쿠션 · 펠트 · 포인트(다이아몬드) · 공 셋 · 수구에서 1적구를 지나 쿠션으로 가는 옅은 길.
 * 그림일 뿐 그 매장의 사실이 아니다(테이블 수·요금은 아래 글자에 있다). 공 자리는 code 로 정해진다(같은 코드 = 같은 그림).
 */
export function tableSvg(code: string, w: number, hgt: number): string {
    let seed = [...code].reduce((a, ch) => (Math.imul(a, 31) + ch.charCodeAt(0)) >>> 0, 7);
    const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    const m = 56, rail = 44, r = 34;
    const fx = m + rail, fy = m + rail, fw = w - 2 * (m + rail), fh = hgt - 2 * (m + rail);
    const balls: { x: number; y: number }[] = [];
    // 서로 붙지 않게 놓는다. 자리를 못 찾아도 멈춘다(무한 반복 방지 — 60번 안에 못 놓으면 마지막 자리를 그대로 쓴다)
    for (let tries = 0; balls.length < 3 && tries < 60; tries++) {
        const p = { x: fx + r * 2 + rnd() * (fw - r * 4), y: fy + r * 2 + rnd() * (fh - r * 4) };
        if (tries >= 57 || balls.every((b) => Math.hypot(b.x - p.x, b.y - p.y) > r * 5)) balls.push(p);
    }
    const colors = ["#F7F3E8", "#F2C230", "#D8372C"];
    const dia: string[] = [];
    for (let i = 1; i < 8; i++) { const x = r1(fx + (fw * i) / 8); dia.push(`<circle cx="${x}" cy="${m + rail / 2}" r="5.5"/><circle cx="${x}" cy="${hgt - m - rail / 2}" r="5.5"/>`); }
    for (let i = 1; i < 4; i++) { const y = r1(fy + (fh * i) / 4); dia.push(`<circle cx="${m + rail / 2}" cy="${y}" r="5.5"/><circle cx="${w - m - rail / 2}" cy="${y}" r="5.5"/>`); }
    const [cue, obj] = balls;
    const hitY = cue.y < hgt / 2 ? fy + fh : fy;
    const hitX = Math.max(fx, Math.min(fx + fw, obj.x + (obj.x - cue.x) * 0.5));
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${hgt}" viewBox="0 0 ${w} ${hgt}">`
        + `<defs><linearGradient id="wd" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6B4428"/><stop offset="1" stop-color="#3A2214"/></linearGradient>`
        + `<radialGradient id="ft" cx="0.42" cy="0.36" r="0.85"><stop offset="0" stop-color="#1FA06E"/><stop offset="1" stop-color="#0C6B49"/></radialGradient></defs>`
        + `<rect width="${w}" height="${hgt}" fill="#03170F"/>`
        + `<rect x="${m}" y="${m}" width="${w - 2 * m}" height="${hgt - 2 * m}" rx="38" fill="url(#wd)"/>`
        + `<rect x="${fx - 14}" y="${fy - 14}" width="${fw + 28}" height="${fh + 28}" rx="10" fill="#085236"/>`
        + `<rect x="${fx}" y="${fy}" width="${fw}" height="${fh}" rx="4" fill="url(#ft)"/>`
        + `<g fill="#F5F1E6" fill-opacity="0.85">${dia.join("")}</g>`
        + `<path d="M${r1(cue.x)} ${r1(cue.y)} L${r1(obj.x)} ${r1(obj.y)} L${r1(hitX)} ${hitY}" fill="none" stroke="#F5F1E6" stroke-opacity="0.34" stroke-width="5" stroke-dasharray="14 16" stroke-linecap="round"/>`
        + balls.map((b, i) => `<ellipse cx="${r1(b.x + 9)}" cy="${r1(b.y + 12)}" rx="${r}" ry="${r1(r * 0.86)}" fill="#000" fill-opacity="0.28"/>`
            + `<circle cx="${r1(b.x)}" cy="${r1(b.y)}" r="${r}" fill="${colors[i]}"/><circle cx="${r1(b.x - 11)}" cy="${r1(b.y - 12)}" r="9" fill="#FFFFFF" fill-opacity="0.75"/>`).join("")
        + `</svg>`;
}

/** "대대 6대 · 중대 5대 · 10분 1,900원" */
export function storeFactsLine(p: Pick<StoreCardInput, "tables" | "rate">): string {
    return [...p.tables.slice(0, 3).map((t) => `${t.label} ${t.n}대`), ...(p.rate ? [p.rate] : [])].join(" · ");
}

function tree(p: StoreCardInput): El {
    const room = CARD_SIZE - PAD * 2;
    const name = nameLines(p.name, room, 168, 140);
    const line = storeFactsLine(p);
    const art = `data:image/svg+xml;base64,${Buffer.from(tableSvg(p.code, CARD_SIZE, ART_H)).toString("base64")}`;
    return h("div", { width: CARD_SIZE, height: CARD_SIZE, flexDirection: "column", fontFamily: "Pretendard", color: IVORY, backgroundColor: FELT_DEEP },
        { type: "img", props: { src: art, width: CARD_SIZE, height: ART_H, style: { width: CARD_SIZE, height: ART_H } } },
        h("div", { flex: 1, flexDirection: "column", justifyContent: "center", padding: `0 ${PAD}px` },
            p.area ? h("div", { fontSize: 46, fontWeight: 700, color: GOLD, marginBottom: 12, whiteSpace: "nowrap" }, p.area) : "",
            h("div", { flexDirection: "column" }, ...name.lines.map((l) =>
                h("div", { fontSize: name.size, fontWeight: 800, letterSpacing: -name.size * 0.035, lineHeight: 1.04, whiteSpace: "nowrap" }, l))),
            line ? h("div", { marginTop: 22, fontSize: fitSize([line], room, 46), fontWeight: 700, color: MUTED, whiteSpace: "nowrap" }, line) : ""),
    );
}

export async function renderStoreCardPng(p: StoreCardInput): Promise<Buffer> {
    const { satori, Resvg } = await engines();
    const svg = await satori(tree(p) as any, { width: CARD_SIZE, height: CARD_SIZE, fonts: fonts() });
    return new Resvg(svg, { fitTo: { mode: "width", value: CARD_SIZE } }).render().asPng();
}
