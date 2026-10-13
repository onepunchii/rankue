/**
 * 산 카드 — 정사각형 1200×1200 PNG(2026-10-13 오너: "등산 사이트맵 … 사이트맵 이미지랑 등등 잘 됐지? 등산인이 들어와서 우와 훅 할 정도로").
 *
 * 산 화면 3,700여 곳이 권역의 공용 그림 한 장을 달고 나갔다 — 검색 결과와 메신저 미리보기에서 어느 산이든 같은 그림이었다.
 * 골프장 · 당구장 카드와 같은 식구로 산마다 한 장을 그린다(위는 그림, 아래는 큰 이름 — 90~110px 로 줄어도 이름이 읽힌다):
 *   위(640)  그 산이 있는 권역의 표지 그림. 산림청 100대 명산이면 그 권역 도장첩의 와펜을 얹는다(정상에서 받는 것 — 가입의 까닭).
 *   아래     이름을 칸 너비에 맞는 가장 큰 글자로 + 살구색 한 줄(높이 · 자리) + 옅은 한 줄(등산 코스 수 · 길이).
 * 내용은 우리 표에 있는 사실만. 시도 윤곽선 · 지도는 싣지 않는다. 그림(표지 · 와펜)에는 글자가 없고 글자 · 숫자는 satori 가 그린다.
 *
 * 그림은 server/assets/hiking 의 png(앱이 쓰는 webp 의 사본 — resvg 가 확실히 읽는 형식으로). 표지는 색을 48가지로 줄인 판화다 —
 * 원본의 종이 결(잔 알갱이)을 그대로 실으면 카드 한 장이 1MB 를 넘는다(골프장 · 당구장 카드는 110~140KB).
 * 엔진 · 폰트는 선수 카드와 공용(지연 로드 — 정적 import 로 /api 전체가 죽은 2026-09-14 사고 방지).
 * 그림을 바꾸면 shared/ogCards 의 HIKING_CARD_VERSION 을 올릴 것(주소가 달라져야 검색엔진이 다시 가져간다).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { engines, fonts, CARD_SIZE } from "./playerCard.js";
import { fitSize, nameLines } from "./cardText.js";

export interface HikingMountainCardInput {
    name: string;
    /** "1,708m" — 모르면 빈 글자 */
    height: string;
    /** "강원 양양군" */
    place: string;
    /** 권역 id(capital · gangwon …) — 표지 그림을 고른다. 모르면 강원의 그림 */
    region: string | null;
    /** 산림청 100대 명산 — 와펜을 얹고 이름표를 단다 */
    kfs100: boolean;
    /** 100대 명산이 아닐 때의 이름표(속한 묶음 하나 — "국립공원의 산"). 없으면 달지 않는다 */
    badge: string | null;
    /** "등산코스 9개 · 0.9~11km" — 코스가 없으면 빈 글자 */
    courses: string;
}

const BG = "#0B1F26";
const PAPER = "#F4EFE3";
const CORAL = "#F28C6A";
const SAND = "#F6D9A8";
const MUTED = "rgba(244,239,227,0.66)";
const COVER_H = 640, PAD = 72;
const REGIONS = ["capital", "gangwon", "chungcheong", "jeonbuk", "jeonnam", "gyeongbuk", "gyeongnam", "jeju"];

type El = { type: string; props: Record<string, unknown> & { children?: unknown } };
const h = (type: string, style: Record<string, unknown>, ...children: unknown[]): El =>
    ({ type, props: { style: type === "div" ? { display: "flex", ...style } : style, children: children.length === 1 ? children[0] : children } });
const img = (src: string, w: number, hgt: number, style: Record<string, unknown> = {}): El =>
    ({ type: "img", props: { src, width: w, height: hgt, style: { width: w, height: hgt, ...style } } });

function artDir(): string {
    const candidates = [
        path.join(process.cwd(), "server/assets/hiking"),
        path.join(path.dirname(fileURLToPath(import.meta.url)), "../assets/hiking"),
    ];
    for (const c of candidates) if (fs.existsSync(path.join(c, "cover-gangwon.png"))) return c;
    throw new Error(`[hikingMountainCard] art not found: ${candidates.join(", ")}`);
}
const artCache = new Map<string, string>();
/** 권역의 표지 · 와펜(png)을 data URI 로 — 이름은 아는 권역 여덟 가운데 하나로만 만든다(요청의 글자가 파일 이름이 되지 않는다) */
function art(kind: "cover" | "patch", region: string | null): string {
    const r = region && REGIONS.includes(region) ? region : "gangwon";
    const file = `${kind}-${r}.png`;
    let uri = artCache.get(file);
    if (!uri) {
        uri = `data:image/png;base64,${fs.readFileSync(path.join(artDir(), file)).toString("base64")}`;
        artCache.set(file, uri);
    }
    return uri;
}

function tree(p: HikingMountainCardInput): El {
    const room = CARD_SIZE - PAD * 2;
    // 와펜이 있으면 이름 칸이 그만큼 좁다(와펜은 표지의 아래 끝에 걸쳐 이름의 왼쪽 위에 놓인다)
    const name = nameLines(p.name, room, 190, 150);
    const line = [p.height, p.place].filter(Boolean).join(" · ");
    const tag = p.kfs100 ? "산림청 100대 명산" : p.badge;
    return h("div", { width: CARD_SIZE, height: CARD_SIZE, flexDirection: "column", fontFamily: "Pretendard", color: PAPER, backgroundColor: BG, position: "relative" },
        // 표지 — 가로를 가득, 아래 끝은 바탕으로 녹인다
        h("div", { position: "absolute", left: 0, top: 0, width: CARD_SIZE, height: COVER_H, overflow: "hidden" },
            img(art("cover", p.region), CARD_SIZE, CARD_SIZE, { position: "absolute", left: 0, top: -210 }),
            h("div", { position: "absolute", left: 0, top: 0, width: CARD_SIZE, height: 200, backgroundImage: "linear-gradient(180deg, rgba(11,31,38,0.62) 0%, rgba(11,31,38,0) 100%)" }),
            h("div", { position: "absolute", left: 0, top: COVER_H - 260, width: CARD_SIZE, height: 260, backgroundImage: "linear-gradient(180deg, rgba(11,31,38,0) 0%, rgba(11,31,38,0.8) 70%, #0B1F26 100%)" }),
        ),
        // 머리 — 표지의 하늘 위
        h("div", { position: "absolute", left: 60, top: 52, width: CARD_SIZE - 120, justifyContent: "space-between", alignItems: "center" },
            h("div", { alignItems: "center", fontSize: 32, fontWeight: 800, letterSpacing: 2, color: "#FFFFFF" },
                h("div", { width: 18, height: 18, borderRadius: 9, background: CORAL, marginRight: 14 }), "RANKUE 등산"),
            tag ? h("div", { fontSize: 28, fontWeight: 700, color: "#2A1208", background: SAND, borderRadius: 999, padding: "8px 24px" }, tag) : "",
        ),
        // 와펜 — 100대 명산만. 표지의 아래 끝에 걸친다
        p.kfs100 ? img(art("patch", p.region), 300, 300, { position: "absolute", right: 64, top: COVER_H - 230 }) : "",
        // 아래 — 이름 · 높이와 자리 · 코스
        h("div", { position: "absolute", left: PAD, top: COVER_H + 6, width: room, height: CARD_SIZE - COVER_H - 6, flexDirection: "column", justifyContent: "center" },
            h("div", { flexDirection: "column" }, ...name.lines.map((l) =>
                h("div", { fontSize: name.size, fontWeight: 800, letterSpacing: -name.size * 0.035, lineHeight: 1.05, whiteSpace: "nowrap" }, l))),
            line ? h("div", { marginTop: 22, fontSize: fitSize([line], room, 60), fontWeight: 700, color: CORAL, whiteSpace: "nowrap" }, line) : "",
            p.courses ? h("div", { marginTop: 14, fontSize: fitSize([p.courses], room, 44), fontWeight: 500, color: MUTED, whiteSpace: "nowrap" }, p.courses) : "",
        ),
    );
}

export async function renderHikingMountainCardPng(p: HikingMountainCardInput): Promise<Buffer> {
    const { satori, Resvg } = await engines();
    const svg = await satori(tree(p) as any, { width: CARD_SIZE, height: CARD_SIZE, fonts: fonts() });
    return new Resvg(svg, { fitTo: { mode: "width", value: CARD_SIZE } }).render().asPng();
}
