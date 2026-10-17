/**
 * 낚시터 카드 — 정사각형 1200×1200 PNG(2026-10-18 — 산 카드 · 골프장 카드와 같은 식구). 검색 결과 · 메신저 미리보기에서 낚시터마다 한 장.
 *   위(640)  그 종류의 판화 표지(저수지 · 바다 · 평지 · 기타 · 계곡) + 첫 대상 어종의 어탁(우리 어탁이 있을 때만)
 *   아래     이름(칸 너비에 맞는 가장 큰 글자) · 살구색 한 줄(자리 · 종류) · 옅은 한 줄(대상 어종 · 요금)
 * 내용은 받은 칸만. 그림에는 글자가 없고 글자 · 숫자는 satori 가 그린다. 그림은 server/assets/fishing(앱 webp 의 png 사본 — 색을 줄인 판화).
 * 엔진 · 폰트는 선수 카드와 공용(지연 로드). 그림을 바꾸면 shared/ogCards 의 FISHING_CARD_VERSION 을 올릴 것.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { engines, fonts, CARD_SIZE } from "./playerCard.js";
import { fitSize, nameLines } from "./cardText.js";

export interface FishingSpotCardInput {
    name: string;
    /** "경기 안산 · 바다 낚시터" */
    place: string;
    /** "우럭 · 참돔 · 농어 · 1일 99,000원" — 없으면 빈 글자 */
    detail: string;
    /** 종류 id(reservoir · sea · flat · etc · valley) */
    kind: string;
    /** 첫 대상 어종의 우리 어탁 id(gyotaku-<id>) — 없으면 얹지 않는다 */
    fish: string | null;
}

const BG = "#0B1E2D", PAPER = "#F3ECDD", SUN = "#F4A963", MUTED = "rgba(243,236,221,0.66)";
const COVER_H = 640, PAD = 72;
const KINDS = ["reservoir", "sea", "flat", "etc", "valley"];

type El = { type: string; props: Record<string, unknown> & { children?: unknown } };
const h = (type: string, style: Record<string, unknown>, ...children: unknown[]): El =>
    ({ type, props: { style: type === "div" ? { display: "flex", ...style } : style, children: children.length === 1 ? children[0] : children } });
const img = (src: string, w: number, hgt: number, style: Record<string, unknown> = {}): El =>
    ({ type: "img", props: { src, width: w, height: hgt, style: { width: w, height: hgt, ...style } } });

function artDir(): string {
    const candidates = [path.join(process.cwd(), "server/assets/fishing"), path.join(path.dirname(fileURLToPath(import.meta.url)), "../assets/fishing")];
    for (const c of candidates) if (fs.existsSync(path.join(c, "cover-sea.png"))) return c;
    throw new Error(`[fishingSpotCard] art not found: ${candidates.join(", ")}`);
}
const cache = new Map<string, { uri: string; w: number; h: number }>();
/** png → data URI · 크기(요청의 글자가 파일 이름이 되지 않게 — 종류는 다섯 가운데, 어탁은 [a-z]+ 만) */
function art(file: string): { uri: string; w: number; h: number } | null {
    let a = cache.get(file);
    if (!a) {
        const p = path.join(artDir(), file);
        if (!fs.existsSync(p)) return null;
        const buf = fs.readFileSync(p);
        a = { uri: `data:image/png;base64,${buf.toString("base64")}`, w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
        cache.set(file, a);
    }
    return a;
}

function tree(p: FishingSpotCardInput): El {
    const room = CARD_SIZE - PAD * 2;
    const name = nameLines(p.name, room, 180, 140);
    const cover = art(`cover-${KINDS.includes(p.kind) ? p.kind : "etc"}.png`);
    const fish = p.fish && /^[a-z]+$/.test(p.fish) ? art(`gyotaku-${p.fish}.png`) : null;
    const fw = 460, fh = fish ? Math.round((fish.h / fish.w) * fw) : 0;
    return h("div", { width: CARD_SIZE, height: CARD_SIZE, flexDirection: "column", fontFamily: "Pretendard", color: PAPER, backgroundColor: BG, position: "relative" },
        h("div", { position: "absolute", left: 0, top: 0, width: CARD_SIZE, height: COVER_H, overflow: "hidden" },
            cover ? img(cover.uri, CARD_SIZE, COVER_H, { position: "absolute", left: 0, top: 0 }) : "",
            h("div", { position: "absolute", left: 0, top: 0, width: CARD_SIZE, height: 200, backgroundImage: "linear-gradient(180deg, rgba(11,30,45,0.6) 0%, rgba(11,30,45,0) 100%)" }),
            h("div", { position: "absolute", left: 0, top: COVER_H - 260, width: CARD_SIZE, height: 260, backgroundImage: "linear-gradient(180deg, rgba(11,30,45,0) 0%, rgba(11,30,45,0.82) 70%, #0B1E2D 100%)" }),
        ),
        h("div", { position: "absolute", left: 60, top: 52, width: CARD_SIZE - 120, justifyContent: "space-between", alignItems: "center" },
            h("div", { alignItems: "center", fontSize: 32, fontWeight: 800, letterSpacing: 2, color: "#FFFFFF" },
                h("div", { width: 18, height: 18, borderRadius: 9, background: SUN, marginRight: 14 }), "RANKUE 낚시"),
            h("div", { fontSize: 28, fontWeight: 700, color: "#2A1606", background: SUN, borderRadius: 999, padding: "8px 24px" }, "전국 낚시터"),
        ),
        // 어탁 — 한지 판 위의 먹 그림(표지의 아래 끝에 걸친다)
        fish ? h("div", { position: "absolute", right: 60, top: COVER_H - 250, width: fw + 48, height: fh + 48, background: PAPER, borderRadius: 18, justifyContent: "center", alignItems: "center", transform: "rotate(-3deg)", boxShadow: "0 18px 40px rgba(0,0,0,0.45)" },
            img(fish.uri, fw, fh)) : "",
        h("div", { position: "absolute", left: PAD, top: COVER_H + (fish ? 40 : 6), width: room, height: CARD_SIZE - COVER_H - (fish ? 40 : 6), flexDirection: "column", justifyContent: "center" },
            h("div", { flexDirection: "column" }, ...name.lines.map((l) => h("div", { fontSize: name.size, fontWeight: 800, letterSpacing: -name.size * 0.035, lineHeight: 1.05, whiteSpace: "nowrap" }, l))),
            p.place ? h("div", { marginTop: 22, fontSize: fitSize([p.place], room, 58), fontWeight: 700, color: SUN, whiteSpace: "nowrap" }, p.place) : "",
            p.detail ? h("div", { marginTop: 14, fontSize: fitSize([p.detail], room, 44), fontWeight: 500, color: MUTED, whiteSpace: "nowrap" }, p.detail) : "",
        ),
    );
}

export async function renderFishingSpotCardPng(p: FishingSpotCardInput): Promise<Buffer> {
    const { satori, Resvg } = await engines();
    const svg = await satori(tree(p) as any, { width: CARD_SIZE, height: CARD_SIZE, fonts: fonts() });
    return new Resvg(svg, { fitTo: { mode: "width", value: CARD_SIZE } }).render().asPng();
}
