/**
 * 코리아둘레길 코스 카드 — 정사각형 1200×1200 PNG(2026-10-21). 코스 페이지가 메신저 · 검색 미리보기에 랭큐 공용 그림을 달고 나가던 것.
 * 축제 · 산 카드와 같은 식구: 위는 우리 그림(소나무 · 겹친 능선 — 둘레길 표지와 같은 그림), 아래는 큰 코스 이름 + 산호색 한 줄(거리 · 시간 · 난이도) + 옅은 지역,
 * 오른쪽 아래에 **그 코스의 선**(두루누비 GPX 를 줄인 것 — 자료 이용허락 제한 없음)을 길의 색으로. 시도 윤곽선은 싣지 않는다(화면에서만 쓰는 자료).
 * 그림은 server/assets/trails/cover.png(표지를 중간값 필터 후 색 40가지). 그림을 바꾸면 shared/ogCards 의 TRAIL_CARD_VERSION 을 올릴 것.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { engines, fonts, CARD_SIZE } from "./playerCard.js";
import { fitSize, nameLines } from "./cardText.js";

export interface TrailCardInput {
    /** '해파랑길' */
    route: string;
    /** 길의 색 */
    color: string;
    /** '1코스' · '3-1코스(우회로)' */
    name: string;
    /** '17km · 6시간 반 · 보통' */
    facts: string;
    /** '부산 남구' */
    place: string;
    /** 코스 선 [위도, 경도] */
    line: readonly (readonly [number, number])[];
}

const BG = "#0B1F26";
const PAPER = "#F4EFE3";
const CORAL = "#F28C6A";
const MUTED = "rgba(244,239,227,0.66)";
const COVER_H = 640, PAD = 72, SKETCH = 300;

type El = { type: string; props: Record<string, unknown> & { children?: unknown } };
const h = (type: string, style: Record<string, unknown>, ...children: unknown[]): El =>
    ({ type, props: { style: type === "div" ? { display: "flex", ...style } : style, children: children.length === 1 ? children[0] : children } });
const img = (src: string, w: number, hgt: number, style: Record<string, unknown> = {}): El =>
    ({ type: "img", props: { src, width: w, height: hgt, style: { width: w, height: hgt, ...style } } });

let coverUri: string | null = null;
function cover(): string {
    if (coverUri) return coverUri;
    const candidates = [
        path.join(process.cwd(), "server/assets/trails/cover.png"),
        path.join(path.dirname(fileURLToPath(import.meta.url)), "../assets/trails/cover.png"),
    ];
    const file = candidates.find((c) => fs.existsSync(c));
    if (!file) throw new Error(`[trailCard] art not found: ${candidates.join(", ")}`);
    coverUri = `data:image/png;base64,${fs.readFileSync(file).toString("base64")}`;
    return coverUri;
}

/** 코스 선 → SVG(data URI). 위가 북쪽 · 위도 36° 코사인으로 가로를 줄인다 · 시작은 속 찬 점, 끝은 고리 */
export function trailSketchSvg(line: readonly (readonly [number, number])[], color: string, size = SKETCH): string {
    const pad = 34;
    const xs = line.map((p) => p[1] * 0.81), ys = line.map((p) => -p[0]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const sw = Math.max(1e-6, x1 - x0), sh = Math.max(1e-6, y1 - y0);
    const s = Math.min((size - pad * 2) / sw, (size - pad * 2) / sh);
    const ox = (size - sw * s) / 2, oy = (size - sh * s) / 2;
    const pts = line.map((_, i) => [ox + (xs[i] - x0) * s, oy + (ys[i] - y0) * s] as const);
    const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
    const a = pts[0], b = pts[pts.length - 1];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`
        + `<rect width="${size}" height="${size}" rx="36" fill="#13363F"/>`
        + `<path d="${d}" fill="none" stroke="${color}" stroke-opacity="0.25" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>`
        + `<path d="${d}" fill="none" stroke="${color}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`
        + (a ? `<circle cx="${a[0].toFixed(1)}" cy="${a[1].toFixed(1)}" r="11" fill="${color}"/>` : "")
        + (b ? `<circle cx="${b[0].toFixed(1)}" cy="${b[1].toFixed(1)}" r="10" fill="${BG}" stroke="${color}" stroke-width="6"/>` : "")
        + `</svg>`;
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

function tree(p: TrailCardInput): El {
    const room = CARD_SIZE - PAD * 2 - SKETCH - 36;
    const name = nameLines(p.name, room, 150, 120);
    return h("div", { width: CARD_SIZE, height: CARD_SIZE, flexDirection: "column", fontFamily: "Pretendard", color: PAPER, backgroundColor: BG, position: "relative" },
        h("div", { position: "absolute", left: 0, top: 0, width: CARD_SIZE, height: COVER_H, overflow: "hidden" },
            img(cover(), CARD_SIZE, CARD_SIZE, { position: "absolute", left: 0, top: -280 }),
            h("div", { position: "absolute", left: 0, top: 0, width: CARD_SIZE, height: 200, backgroundImage: "linear-gradient(180deg, rgba(11,31,38,0.6) 0%, rgba(11,31,38,0) 100%)" }),
            h("div", { position: "absolute", left: 0, top: COVER_H - 280, width: CARD_SIZE, height: 280, backgroundImage: "linear-gradient(180deg, rgba(11,31,38,0) 0%, rgba(11,31,38,0.85) 70%, #0B1F26 100%)" }),
        ),
        h("div", { position: "absolute", left: 60, top: 52, width: CARD_SIZE - 120, justifyContent: "space-between", alignItems: "center" },
            h("div", { alignItems: "center", fontSize: 32, fontWeight: 800, letterSpacing: 2, color: "#FFFFFF" },
                h("div", { width: 18, height: 18, borderRadius: 9, background: CORAL, marginRight: 14 }), "RANKUE 코리아둘레길"),
            h("div", { fontSize: 30, fontWeight: 700, color: "#0B1F26", background: p.color, borderRadius: 999, padding: "8px 26px" }, p.route),
        ),
        // 코스 선 — 오른쪽 아래, 표지 끝에 걸친다
        p.line.length > 1 ? img(trailSketchSvg(p.line, p.color), SKETCH, SKETCH, { position: "absolute", right: PAD, top: COVER_H - 150, borderRadius: 36, boxShadow: "0 12px 40px rgba(0,0,0,0.45)" }) : "",
        h("div", { position: "absolute", left: PAD, top: COVER_H + 10, width: room, height: CARD_SIZE - COVER_H - 10, flexDirection: "column", justifyContent: "center" },
            h("div", { fontSize: 40, fontWeight: 700, color: p.color, marginBottom: 6 }, p.route),
            h("div", { flexDirection: "column" }, ...name.lines.map((l) =>
                h("div", { fontSize: name.size, fontWeight: 800, letterSpacing: -name.size * 0.035, lineHeight: 1.05, whiteSpace: "nowrap" }, l))),
            p.facts ? h("div", { marginTop: 20, fontSize: fitSize([p.facts], room, 50), fontWeight: 700, color: CORAL, whiteSpace: "nowrap" }, p.facts) : "",
            p.place ? h("div", { marginTop: 10, fontSize: fitSize([p.place], room, 40), fontWeight: 500, color: MUTED, whiteSpace: "nowrap" }, p.place) : "",
        ),
    );
}

export async function renderTrailCardPng(p: TrailCardInput): Promise<Buffer> {
    const { satori, Resvg } = await engines();
    const svg = await satori(tree(p) as any, { width: CARD_SIZE, height: CARD_SIZE, fonts: fonts() });
    return new Resvg(svg, { fitTo: { mode: "width", value: CARD_SIZE } }).render().asPng();
}
