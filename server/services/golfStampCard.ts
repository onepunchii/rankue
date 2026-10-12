/**
 * 도장첩 완성 카드 — 정사각형 1200×1200 PNG(2026-10-12, 기획서 9장의 '공유 카드').
 *
 * 한 권을 다 채웠을 때 내보내는 인증 카드: 위에 그 권의 표지(포스터), 표지 아래 끝에 걸친 볼마커,
 * "강원 도장첩 완성 · 12번째", 찍은 골프장 이름들. 앱의 도장첩 화면과 같은 그림(표지 · 볼마커)을 쓴다.
 *
 * 그림은 server/assets/golf-stamp 의 jpg · png 를 읽어 data URI 로 싣는다(앱이 쓰는 webp 의 사본 — resvg 가 확실히 읽는 형식으로).
 * 글자 · 숫자는 전부 satori 가 그린다(그림에는 글자가 없다).
 *
 * ⚠️ 비공개 카드다: 라우트(server/ogImage.ts)가 서명 · 만료(server/lib/stampShare.ts)를 확인한 뒤에만 부른다.
 * 엔진 · 폰트는 선수 카드와 공용(지연 로드 — 정적 import 로 /api 전체가 죽은 2026-09-14 사고 방지).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { engines, fonts, CARD_SIZE } from "./playerCard.js";

export interface StampCardInput {
    bookId: string;
    bookName: string;
    /** 초대장(회원제) 권 — 금박 톤 */
    invite: boolean;
    nickname: string;
    /** 찍은 골프장 이름(칸 순서) */
    slots: string[];
    /** 몇 번째 완성 — 기록이 없으면 null(적지 않는다) */
    serial: number | null;
    /** 다 채운 날(ms) */
    earnedAt: number;
}

const BG = "#0A0A0A";
const INK = "#F5F5F4";
const MUTED = "rgba(245,245,244,0.62)";
const LINE = "rgba(245,245,244,0.14)";
const GOLD = "#FFD36B";
const COVER_H = 640;

type El = { type: string; props: Record<string, unknown> & { children?: unknown } };
const h = (type: string, style: Record<string, unknown>, ...children: unknown[]): El =>
    ({ type, props: { style: type === "div" ? { display: "flex", ...style } : style, children: children.length === 1 ? children[0] : children } });
const img = (src: string, w: number, hgt: number, style: Record<string, unknown> = {}): El =>
    ({ type: "img", props: { src, width: w, height: hgt, style: { width: w, height: hgt, ...style } } });

// ── 그림 ──────────────────────────────────────────────────────────
function artDir(): string {
    const candidates = [
        path.join(process.cwd(), "server/assets/golf-stamp"),
        path.join(path.dirname(fileURLToPath(import.meta.url)), "../assets/golf-stamp"),
    ];
    for (const c of candidates) if (fs.existsSync(path.join(c, "marker-all-open.png"))) return c;
    throw new Error(`[golfStampCard] art not found: ${candidates.join(", ")}`);
}
const artCache = new Map<string, string>();
/** 그 권의 표지(jpg) · 볼마커(png)를 data URI 로. 이름표는 부르는 쪽이 도장첩 목록에서 꺼낸 것만 넘긴다 */
function art(kind: "cover" | "marker", bookId: string): string {
    const file = `${kind}-${bookId}.${kind === "cover" ? "jpg" : "png"}`;
    let uri = artCache.get(file);
    if (!uri) {
        uri = `data:image/${kind === "cover" ? "jpeg" : "png"};base64,${fs.readFileSync(path.join(artDir(), file)).toString("base64")}`;
        artCache.set(file, uri);
    }
    return uri;
}

/** "2026.10.12" — 한국 날짜 */
export function kstDot(ms: number): string {
    const d = new Date(ms + 9 * 3600_000);
    return `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** 글자 폭 어림(한글 1em, 영문 · 숫자 0.6em) — 긴 이름을 한 줄에 맞춰 자른다 */
export function fitText(s: string, maxEm: number): string {
    let w = 0, out = "";
    for (const ch of s) {
        const cw = /[ㄱ-힣]/.test(ch) ? 1 : ch === " " ? 0.3 : 0.62;
        if (w + cw > maxEm) return `${out.trimEnd()}…`;
        w += cw; out += ch;
    }
    return out;
}

/** 이름표 줄의 글자 크기 — 칸이 많은 권(초대장 수도권 11곳)은 작게 */
export const chipSize = (n: number) => (n <= 4 ? 40 : n <= 8 ? 34 : 28);

function tree(p: StampCardInput): El {
    const accent = p.invite ? GOLD : "#8BE84A";
    const size = chipSize(p.slots.length);
    const who = fitText(p.nickname || "나", 9);
    const when = `${p.serial != null ? `${p.serial.toLocaleString("ko-KR")}번째 완성 · ` : ""}${kstDot(p.earnedAt)}`;
    return h("div", { width: CARD_SIZE, height: CARD_SIZE, flexDirection: "column", fontFamily: "Pretendard", color: INK, backgroundColor: BG, position: "relative" },
        // 표지 — 가로를 가득 채우고 위쪽(하늘 · 산)을 보여 준다. 아래 끝은 어둠으로 녹인다
        h("div", { position: "absolute", left: 0, top: 0, width: CARD_SIZE, height: COVER_H, overflow: "hidden" },
            img(art("cover", p.bookId), CARD_SIZE, 1600, { position: "absolute", left: 0, top: -220 }),
            h("div", { position: "absolute", left: 0, top: 0, width: CARD_SIZE, height: 190, backgroundImage: "linear-gradient(180deg, rgba(10,10,10,0.55) 0%, rgba(10,10,10,0) 100%)" }),
            h("div", { position: "absolute", left: 0, top: COVER_H - 280, width: CARD_SIZE, height: 280, backgroundImage: "linear-gradient(180deg, rgba(10,10,10,0) 0%, rgba(10,10,10,0.82) 68%, #0A0A0A 100%)" }),
        ),
        // 머리 — 표지의 하늘 위
        h("div", { position: "absolute", left: 64, top: 56, width: CARD_SIZE - 128, justifyContent: "space-between", alignItems: "center" },
            h("div", { alignItems: "center", fontSize: 32, fontWeight: 800, letterSpacing: 2, color: "#FFFFFF" },
                h("div", { width: 18, height: 18, borderRadius: 9, background: "#64DD17", marginRight: 14 }), "RANKUE GOLF"),
            h("div", { fontSize: 28, fontWeight: 700, color: "#FFFFFF", background: "rgba(10,10,10,0.5)", border: "2px solid rgba(255,255,255,0.35)", borderRadius: 999, padding: "6px 22px" }, "도장깨기"),
        ),
        // 볼마커 — 표지의 아래 끝에 걸친다
        img(art("marker", p.bookId), 360, 360, { position: "absolute", left: 64, top: COVER_H - 300 }),
        // 제목 — 볼마커 오른쪽
        h("div", { position: "absolute", left: 464, top: COVER_H - 178, width: CARD_SIZE - 464 - 64, flexDirection: "column" },
            h("div", { fontSize: 30, fontWeight: 700, color: accent, letterSpacing: 1 }, p.invite ? "초대장 도장첩" : "랭큐 도장첩"),
            h("div", { marginTop: 6, fontSize: 74, fontWeight: 800, letterSpacing: -3, lineHeight: 1.08 }, `${p.bookName} 완성`),
        ),
        // 아래 — 누가 · 몇 번째 · 언제, 찍은 골프장들
        h("div", { position: "absolute", left: 64, top: COVER_H + 96, width: CARD_SIZE - 128, flexDirection: "column" },
            h("div", { alignItems: "baseline", gap: 18 },
                h("div", { fontSize: 44, fontWeight: 800, letterSpacing: -1 }, `${who} 님`),
                h("div", { fontSize: 32, fontWeight: 500, color: MUTED }, when),
            ),
            h("div", { marginTop: 14, fontSize: 30, fontWeight: 500, color: MUTED }, `${p.slots.length}곳을 다 찍고 ${p.bookName} 볼마커를 받았어요`),
            h("div", { marginTop: 30, flexWrap: "wrap", gap: 12 },
                ...p.slots.map((name) => h("div", {
                    fontSize: size, fontWeight: 700, color: INK, background: "rgba(245,245,244,0.07)", border: `2px solid ${LINE}`, borderRadius: 999, padding: `${Math.round(size * 0.3)}px ${Math.round(size * 0.72)}px`,
                }, fitText(name, 11))),
            ),
        ),
        // 발
        h("div", { position: "absolute", left: 64, bottom: 48, width: CARD_SIZE - 128, justifyContent: "space-between", alignItems: "center", borderTop: `2px solid ${LINE}`, paddingTop: 24 },
            h("div", { fontSize: 25, fontWeight: 600, color: MUTED }, "골프장에서 18홀을 끝내 찍은 도장"),
            h("div", { fontSize: 25, fontWeight: 700, color: MUTED, letterSpacing: 1 }, "www.rankue.co.kr"),
        ),
    );
}

export async function renderGolfStampCardPng(p: StampCardInput): Promise<Buffer> {
    const { satori, Resvg } = await engines();
    const svg = await satori(tree(p) as any, { width: CARD_SIZE, height: CARD_SIZE, fonts: fonts() });
    return new Resvg(svg, { fitTo: { mode: "width", value: CARD_SIZE } }).render().asPng();
}
