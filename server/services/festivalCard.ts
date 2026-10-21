/**
 * 축제 카드 — 정사각형 1200×1200 PNG(2026-10-21). 축제 페이지가 메신저 · 검색 미리보기에 랭큐 공용 그림을 달고 나가던 것.
 * 산 카드(hikingMountainCard)와 같은 식구: 위는 우리 그림(강가 마을의 등불 — 전국 축제 표지), 아래는 큰 이름 + 산호색 기간 + 옅은 자리.
 * 한국관광공사 사진은 얹지 않는다 — 공공누리 제3유형(변경 금지)이라 카드에 합성하지 않는다. 글자 · 숫자는 satori 가 그린다.
 * 그림은 server/assets/festivals/cover.png(표지 webp 의 사본을 색 40가지로 줄인 판화 — 종이 결을 그대로 두면 600KB 를 넘었다).
 * 엔진 · 폰트는 선수 카드와 공용(지연 로드). 그림을 바꾸면 shared/ogCards 의 FESTIVAL_CARD_VERSION 을 올릴 것.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { engines, fonts, CARD_SIZE } from "./playerCard.js";
import { fitSize, nameLines } from "./cardText.js";

export interface FestivalCardInput {
    title: string;
    /** '2026년 10월 21일(수) ~ 25일(일)' */
    period: string;
    /** '강원 · 강릉커피거리 및 강릉시일원' */
    place: string;
    /** 오른쪽 위 알약 — '지금 열려요' · 'D-3' · null(끝난 축제) */
    tag: string | null;
    /** 알약이 산호색(열려 있음)인가 */
    live: boolean;
}

const BG = "#0B1F26";
const PAPER = "#F4EFE3";
const CORAL = "#F28C6A";
const SAND = "#F6D9A8";
const MUTED = "rgba(244,239,227,0.66)";
const COVER_H = 660, PAD = 72;

type El = { type: string; props: Record<string, unknown> & { children?: unknown } };
const h = (type: string, style: Record<string, unknown>, ...children: unknown[]): El =>
    ({ type, props: { style: type === "div" ? { display: "flex", ...style } : style, children: children.length === 1 ? children[0] : children } });
const img = (src: string, w: number, hgt: number, style: Record<string, unknown> = {}): El =>
    ({ type: "img", props: { src, width: w, height: hgt, style: { width: w, height: hgt, ...style } } });

let coverUri: string | null = null;
function cover(): string {
    if (coverUri) return coverUri;
    const candidates = [
        path.join(process.cwd(), "server/assets/festivals/cover.png"),
        path.join(path.dirname(fileURLToPath(import.meta.url)), "../assets/festivals/cover.png"),
    ];
    const file = candidates.find((c) => fs.existsSync(c));
    if (!file) throw new Error(`[festivalCard] art not found: ${candidates.join(", ")}`);
    coverUri = `data:image/png;base64,${fs.readFileSync(file).toString("base64")}`;
    return coverUri;
}

function tree(p: FestivalCardInput): El {
    const room = CARD_SIZE - PAD * 2;
    const name = nameLines(p.title, room, 170, 132);
    return h("div", { width: CARD_SIZE, height: CARD_SIZE, flexDirection: "column", fontFamily: "Pretendard", color: PAPER, backgroundColor: BG, position: "relative" },
        h("div", { position: "absolute", left: 0, top: 0, width: CARD_SIZE, height: COVER_H, overflow: "hidden" },
            img(cover(), CARD_SIZE, CARD_SIZE, { position: "absolute", left: 0, top: -150 }),
            h("div", { position: "absolute", left: 0, top: 0, width: CARD_SIZE, height: 200, backgroundImage: "linear-gradient(180deg, rgba(11,31,38,0.6) 0%, rgba(11,31,38,0) 100%)" }),
            h("div", { position: "absolute", left: 0, top: COVER_H - 280, width: CARD_SIZE, height: 280, backgroundImage: "linear-gradient(180deg, rgba(11,31,38,0) 0%, rgba(11,31,38,0.82) 70%, #0B1F26 100%)" }),
        ),
        h("div", { position: "absolute", left: 60, top: 52, width: CARD_SIZE - 120, justifyContent: "space-between", alignItems: "center" },
            h("div", { alignItems: "center", fontSize: 32, fontWeight: 800, letterSpacing: 2, color: "#FFFFFF" },
                h("div", { width: 18, height: 18, borderRadius: 9, background: CORAL, marginRight: 14 }), "RANKUE 전국 축제"),
            p.tag ? h("div", { fontSize: 30, fontWeight: 700, color: "#2A1208", background: p.live ? CORAL : SAND, borderRadius: 999, padding: "8px 26px" }, p.tag) : "",
        ),
        h("div", { position: "absolute", left: PAD, top: COVER_H - 10, width: room, height: CARD_SIZE - COVER_H + 10, flexDirection: "column", justifyContent: "center" },
            h("div", { flexDirection: "column" }, ...name.lines.map((l) =>
                h("div", { fontSize: name.size, fontWeight: 800, letterSpacing: -name.size * 0.035, lineHeight: 1.06, whiteSpace: "nowrap" }, l))),
            h("div", { marginTop: 22, fontSize: fitSize([p.period], room, 56), fontWeight: 700, color: CORAL, whiteSpace: "nowrap" }, p.period),
            p.place ? h("div", { marginTop: 12, fontSize: fitSize([p.place], room, 42), fontWeight: 500, color: MUTED, whiteSpace: "nowrap" }, p.place) : "",
        ),
    );
}

export async function renderFestivalCardPng(p: FestivalCardInput): Promise<Buffer> {
    const { satori, Resvg } = await engines();
    const svg = await satori(tree(p) as any, { width: CARD_SIZE, height: CARD_SIZE, fonts: fonts() });
    return new Resvg(svg, { fitTo: { mode: "width", value: CARD_SIZE } }).render().asPng();
}
