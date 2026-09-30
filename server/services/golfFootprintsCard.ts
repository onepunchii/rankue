/**
 * "나의 골프 발자국" 공유 카드 — 정사각형 1200×1200 PNG (2026-09-30 오너: "도장깨기 지도에 발자국 기능 — 귀엽게").
 *
 * 앱의 발자국 지도(FootprintMap)와 **같은 그림**: 골프장 좌표로만 찍은 점 지도(윤곽선 없음 — CourseDotMap 원칙) 위에
 * 처음 간 순서대로 휜 점선 길, 좌우 번갈아 걷는 발자국, 번호 배지(최근 곳은 주황). 좌표·틀·길·발자국은 전부
 * shared/golfFootprints·golfDotMap 이 만든다 — 화면과 카드가 한 함수라 모양이 어긋나지 않는다.
 *
 * 지도는 SVG 문자열 → data URI 이미지로 싣는다(점 수백 개·마스크를 satori 트리로 만들 필요가 없다). 번호 글자만
 * satori 가 그린다 — 안쪽 SVG 의 <text> 는 resvg 에 글꼴이 없어 안 나온다.
 *
 * ⚠️ 비공개 카드다: 라우트(server/ogImage.ts)가 서명·만료(server/lib/footprintShare.ts)를 확인한 뒤에만 부른다.
 * 엔진·폰트는 선수 카드와 공용(지연 로드 — 정적 import 로 /api 전체가 죽은 2026-09-14 사고 방지).
 */
import { engines, fonts, CARD_SIZE } from "./playerCard.js";
import { toCells, type MapDot } from "../../shared/golfDotMap.js";
import {
    buildTrail, fitFootprintBox, labelsClear, placeFootprints, placedStops, spreadBadges, trailKm, mixHex, FOOT, FOOT_COLORS, type FootprintStop,
} from "../../shared/golfFootprints.js";

export interface FootprintsCardInput {
    nickname: string;
    year: number | null;
    rounds: number;
    stops: FootprintStop[];
    /** 점 지도 바탕 — 골프장 페이지 좌표 */
    dots: { lat: number; lng: number }[];
}

const BG = "#0A0A0A";
const INK = "#F5F5F4";
const MUTED = "rgba(245,245,244,0.6)";
const FAINT = "rgba(245,245,244,0.38)";
const LINE = "rgba(245,245,244,0.12)";
const LIME = "#8BE84A";

type El = { type: string; props: Record<string, unknown> & { children?: unknown } };
const h = (type: string, style: Record<string, unknown>, ...children: unknown[]): El =>
    ({ type, props: { style: type === "div" ? { display: "flex", ...style } : style, children: children.length === 1 ? children[0] : children } });

/** 카드 지도 칸(px) */
const MAP_W = 560, MAP_H = 690;

/** "2026.09.24" — 한국 날짜 */
function kstDot(iso: string): string {
    const d = new Date(new Date(iso).getTime() + 9 * 3600_000);
    return `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** 글자 폭 어림(한글 1em, 영문·숫자 0.6em) — 긴 골프장 이름을 한 줄에 맞춰 자른다. */
function fitText(s: string, maxEm: number): string {
    let w = 0, out = "";
    for (const ch of s) {
        const cw = /[ㄱ-힣]/.test(ch) ? 1 : ch === " " ? 0.3 : 0.62;
        if (w + cw > maxEm) return `${out.trimEnd()}…`;
        w += cw; out += ch;
    }
    return out;
}

const f = (v: number) => (Math.round(v * 100) / 100).toString();

/** 발 한 짝 SVG 조각 — 지도·제목 옆 장식이 같이 쓴다 */
function footSvg(x: number, y: number, angle: number, scale: number, side: 1 | -1, fill: string): string {
    const toes = FOOT.toes.map(([cx, cy, r]) => `<circle cx="${cx}" cy="${cy}" r="${r}"/>`).join("");
    return `<g transform="translate(${f(x)},${f(y)}) rotate(${f(angle + 90)}) scale(${f(side === -1 ? -scale : scale)},${f(scale)})" fill="${fill}"><path d="${FOOT.sole}"/>${toes}</g>`;
}

/** 지도 SVG(점 · 길 · 발자국 · 배지 원) + 번호를 얹을 자리(px) */
function mapSvg(p: FootprintsCardInput): { uri: string; badges: { n: number; x: number; y: number; latest: boolean }[]; labels: { name: string; x: number; y: number }[] } {
    const placed = placedStops(p.stops);
    const box = fitFootprintBox(placed, MAP_W / MAP_H);
    const u = box[2] / MAP_W; // 카드 1px = 지도 u
    const g = box[2] / 34;
    const cells = toCells(p.dots.map((d, i): MapDot => ({ key: String(i), lat: d.lat, lng: d.lng, tone: "on" })), g);
    const pts = placed.map((s) => ({ x: s.x, y: s.y }));
    const trail = buildTrail(pts);
    const R = 22; // 배지 반지름(px)
    const marks = placeFootprints(trail, pts, 30 * u, 7 * u, (R + 8) * u);
    const lastN = p.stops.length;
    // 붙어 있는 골프장(용인·이천)은 배지를 떼어 놓고 원래 자리까지 가는 선을 긋는다
    const spread = spreadBadges(pts, (2 * R + 6) * u);
    const toPx = (x: number, y: number) => ({ x: (x - box[0]) / u, y: (y - box[1]) / u });

    const dotFill = ["rgba(255,255,255,0.20)", "rgba(255,255,255,0.30)", "rgba(255,255,255,0.42)"];
    const dots = cells.map((c) => `<circle cx="${f(c.x)}" cy="${f(c.y)}" r="${f(g * 0.3)}" fill="${dotFill[Math.min(c.n, 3) - 1]}"/>`).join("");
    const feet = marks.map((m) => footSvg(m.x, m.y, m.angle, u * 2.05, m.side, mixHex(FOOT_COLORS.old, FOOT_COLORS.recent, m.t))).join("");
    const r = R * u;
    const leaders = placed.map((s, i) => {
        const b = spread[i];
        if (Math.hypot(b.x - s.x, b.y - s.y) < r * 0.3) return "";
        return `<line x1="${f(s.x)}" y1="${f(s.y)}" x2="${f(b.x)}" y2="${f(b.y)}" stroke="#FFFFFF" stroke-opacity="0.45" stroke-width="${f(2 * u)}"/>`
            + `<circle cx="${f(s.x)}" cy="${f(s.y)}" r="${f(4 * u)}" fill="#FFFFFF" fill-opacity="0.8"/>`;
    }).join("");
    const rings = placed.map((s, i) => {
        const b = spread[i];
        const latest = s.n === lastN;
        const c = latest ? FOOT_COLORS.latest : FOOT_COLORS.stop;
        return `<circle cx="${f(b.x)}" cy="${f(b.y)}" r="${f(r * (latest ? 1.75 : 1.4))}" fill="${c}" fill-opacity="${latest ? 0.26 : 0.16}"/>`
            + `<circle cx="${f(b.x)}" cy="${f(b.y)}" r="${f(r)}" fill="${c}" stroke="${BG}" stroke-width="${f(4 * u)}"/>`;
    }).join("");
    const path = trail.d
        ? `<path d="${trail.d}" fill="none" stroke="#FFFFFF" stroke-opacity="0.3" stroke-width="${f(3.2 * u)}" stroke-linecap="round" stroke-dasharray="${f(0.1 * u)} ${f(10 * u)}"/>`
        : "";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${MAP_W}" height="${MAP_H}" viewBox="${box.map(f).join(" ")}">${dots}${path}${feet}${leaders}${rings}</svg>`;
    return {
        uri: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
        badges: placed.map((s, i) => ({ n: s.n, ...toPx(spread[i].x, spread[i].y), latest: s.n === lastN })),
        // 글자(24px 두 자) + 발자국 한 짝(≈26px) 여유 — 앱 지도와 같은 규칙, 카드 크기로
        labels: labelsClear(box, spread, (R + 30) * u, [...marks, ...trail.samples], 52 * u, 34 * u)
            .map((l) => ({ name: l.name, ...toPx(l.x, l.y) })),
    };
}

/** 제목 옆 발자국 두 짝(라임 → 주황) — 카드가 무슨 카드인지 한눈에 */
function titleFeetUri(): string {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="80" viewBox="0 0 96 80">`
        + footSvg(30, 50, -70, 2.6, -1, FOOT_COLORS.old) + footSvg(66, 30, -70, 2.6, 1, FOOT_COLORS.recent) + `</svg>`;
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

function stopRow(s: FootprintStop, n: number, latest: boolean): El {
    return h("div", { alignItems: "center", gap: 20 },
        h("div", {
            width: 52, height: 52, borderRadius: 26, flexShrink: 0, alignItems: "center", justifyContent: "center",
            background: latest ? FOOT_COLORS.latest : FOOT_COLORS.stop, color: latest ? "#FFFFFF" : FOOT_COLORS.stopInk,
            fontSize: n >= 10 ? 24 : 28, fontWeight: 800,
        }, String(n)),
        h("div", { flexDirection: "column", minWidth: 0, flex: 1 },
            h("div", { alignItems: "center", gap: 12 },
                h("div", { fontSize: 34, fontWeight: 700, letterSpacing: -1, color: INK }, fitText(s.name, latest ? 8.6 : 11)),
                latest ? h("div", { fontSize: 22, fontWeight: 800, color: FOOT_COLORS.latest, border: `2px solid ${FOOT_COLORS.latest}`, borderRadius: 999, padding: "2px 12px" }, "최근") : "",
            ),
            h("div", { marginTop: 4, fontSize: 25, fontWeight: 500, color: MUTED }, `${kstDot(s.firstVisitedAt)}${s.visits > 1 ? ` · ${s.visits}회` : ""}`),
        ),
    );
}

/** 목록은 6줄까지 — 넘치면 처음 둘 · "N곳 더" · 마지막 셋(처음과 최근이 이야기의 양 끝이다) */
function listRows(stops: FootprintStop[]): El[] {
    const n = stops.length;
    const row = (i: number) => stopRow(stops[i], i + 1, i === n - 1);
    if (n <= 6) return stops.map((_, i) => row(i));
    return [
        row(0), row(1),
        // ⋮ 글자는 Pretendard 에 없어 엉뚱한 기호로 나왔다 — 점 세 개를 그린다
        h("div", { alignItems: "center", gap: 20, height: 40 },
            h("div", { width: 52, flexDirection: "column", alignItems: "center", gap: 5 },
                ...[0, 1, 2].map(() => h("div", { width: 6, height: 6, borderRadius: 3, background: FAINT }))),
            h("div", { fontSize: 26, fontWeight: 600, color: FAINT }, `${n - 5}곳 더`)),
        row(n - 3), row(n - 2), row(n - 1),
    ];
}

function tree(p: FootprintsCardInput): El {
    const map = mapSvg(p);
    const name = fitText(p.nickname || "나", 9);
    const km = trailKm(p.stops);
    return h("div", {
        width: CARD_SIZE, height: CARD_SIZE, flexDirection: "column", padding: "60px 64px 52px", fontFamily: "Pretendard", color: INK,
        backgroundColor: BG,
        backgroundImage: "radial-gradient(circle at 26% 56%, rgba(100,221,23,0.16) 0%, rgba(100,221,23,0.04) 38%, rgba(10,10,10,0) 64%)",
    },
        // 머리
        h("div", { justifyContent: "space-between", alignItems: "center" },
            h("div", { alignItems: "center", fontSize: 32, fontWeight: 800, letterSpacing: 2 },
                h("div", { width: 18, height: 18, borderRadius: 9, background: "#64DD17", marginRight: 14 }), "RANKUE GOLF"),
            h("div", { fontSize: 28, fontWeight: 700, color: MUTED, border: `2px solid ${LINE}`, borderRadius: 999, padding: "6px 22px" },
                p.year != null ? `${p.year}년` : "전체 기간"),
        ),
        // 제목
        h("div", { flexDirection: "column", marginTop: 34 },
            h("div", { alignItems: "center", gap: 18 },
                h("div", { fontSize: 78, fontWeight: 800, letterSpacing: -3, lineHeight: 1.05 }, "나의 골프 발자국"),
                { type: "img", props: { src: titleFeetUri(), width: 96, height: 80, style: { width: 96, height: 80 } } }),
            h("div", { marginTop: 12, fontSize: 34, fontWeight: 500, color: MUTED }, `${name} 님이 걸어온 순서${km >= 1 ? ` · 이으면 ${km.toLocaleString("ko-KR")}km` : ""}`),
        ),
        // 지도 + 오른쪽 기록
        h("div", { marginTop: 36, gap: 40, flex: 1 },
            h("div", { width: MAP_W, height: MAP_H, position: "relative", borderRadius: 40, overflow: "hidden", background: "rgba(255,255,255,0.03)", border: `2px solid ${LINE}` },
                { type: "img", props: { src: map.uri, width: MAP_W, height: MAP_H, style: { position: "absolute", left: 0, top: 0, width: MAP_W, height: MAP_H } } },
                // 흐린 지역 이름(점 위·배지 아래 느낌으로 옅게) — 앱 지도와 같은 자리
                ...map.labels.map((l) => h("div", {
                    position: "absolute", left: l.x - 50, top: l.y - 16, width: 100, height: 32, alignItems: "center", justifyContent: "center",
                    fontSize: 24, fontWeight: 700, color: "rgba(255,255,255,0.3)",
                }, l.name)),
                ...map.badges.map((b) => h("div", {
                    position: "absolute", left: b.x - 22, top: b.y - 22, width: 44, height: 44, alignItems: "center", justifyContent: "center",
                    fontSize: b.n >= 10 ? 19 : 23, fontWeight: 800, color: b.latest ? "#FFFFFF" : FOOT_COLORS.stopInk,
                }, String(b.n))),
            ),
            h("div", { flexDirection: "column", flex: 1, minWidth: 0 },
                h("div", { gap: 18 },
                    ...[["방문 골프장", `${p.stops.length}`, "곳", LIME], ["라운드", `${p.rounds}`, "회", INK]].map(([label, v, unit, color]) =>
                        h("div", { flexDirection: "column", flex: 1, background: "rgba(245,245,244,0.05)", border: `2px solid ${LINE}`, borderRadius: 28, padding: "18px 22px" },
                            h("div", { fontSize: 25, fontWeight: 500, color: MUTED }, label),
                            h("div", { alignItems: "baseline", marginTop: 4 },
                                h("div", { fontSize: 60, fontWeight: 800, letterSpacing: -2, color }, v),
                                h("div", { fontSize: 28, fontWeight: 700, color: MUTED, marginLeft: 6 }, unit)),
                        )),
                ),
                h("div", { flexDirection: "column", gap: 22, marginTop: 34 }, ...listRows(p.stops)),
            ),
        ),
        // 발
        h("div", { justifyContent: "space-between", alignItems: "center", borderTop: `2px solid ${LINE}`, paddingTop: 24, marginTop: 30 },
            h("div", { fontSize: 25, fontWeight: 600, color: MUTED }, "랭큐매치 18홀 기록으로 찍은 도장깨기"),
            h("div", { fontSize: 25, fontWeight: 700, color: MUTED, letterSpacing: 1 }, "www.rankue.co.kr"),
        ),
    );
}

export async function renderGolfFootprintsCardPng(p: FootprintsCardInput): Promise<Buffer> {
    const { satori, Resvg } = await engines();
    const svg = await satori(tree(p) as any, { width: CARD_SIZE, height: CARD_SIZE, fonts: fonts() });
    return new Resvg(svg, { fitTo: { mode: "width", value: CARD_SIZE } }).render().asPng();
}
