/**
 * 라운드 브리핑 카드 — 정사각형 1200×1200 PNG(2026-10-05 오너 "응": 라운드 브리핑 7번, 단톡방 공유 카드).
 *
 * 라운드 전날 단톡방에 날씨 앱 캡처를 돌리던 자리에 들어갈 한 장이다. 그래서 캡처보다 나아야 한다:
 * **그 티오프부터 끝날 때까지**만(여섯 칸, 전반·후반), 한 줄 평과 근거 숫자, 챙길 것, 해 지는 시각을 한 장에.
 * 내용은 화면의 날씨 카드와 같은 함수(shared/golfRoundBrief)가 만든 것 그대로 — 여기서는 그리기만 한다.
 *
 * 그림 규칙:
 *  · 날씨 그림은 도형으로 그린다(해=동그라미, 구름=알약, 비·눈=구름 아래 방울). 폰트(Pretendard)에 이모지가 없어
 *    글자로 넣으면 빈 네모가 된다. 준비물도 그래서 글자만.
 *  · 예보는 바뀐다 — 카드에 **발표 시각**을 적는다(단톡방 미리보기는 처음 붙인 때의 그림이 오래 남는다).
 *  · 엔진·폰트는 선수 카드와 공용(지연 로드 — 정적 import 로 /api 전체가 죽은 사고가 있었다, playerCard.ts).
 */
import { engines, fonts, CARD_SIZE } from "./playerCard.js";
import type { WxKind } from "../../shared/golfWeather.js";
import type { BriefTone } from "../../shared/golfRoundBrief.js";
import { roundCardPath, type RoundRef } from "../../shared/golfRoundShare.js";

export interface GolfRoundCardHour { label: string; kind: WxKind; night: boolean; tmp: string; pop: string; wet: boolean }
export interface GolfRoundCardInput {
    name: string;
    /** "10월 6일(화)" */
    dateLabel: string;
    /** "07시 티오프" */
    teeLabel: string;
    verdict: string;
    /** "비 0% · 바람 2m/s · 5°→18°" */
    reason: string;
    tone: BriefTone;
    /** 한 줄 평 옆 큰 그림의 하늘 */
    sky: WxKind;
    hours: GolfRoundCardHour[];
    /** 앞쪽 몇 칸이 전반인가 */
    frontCount: number;
    gear: string[];
    /** "해 짐 18:06 · 18홀은 13:30 전에 티오프" */
    sunLine: string | null;
    /** "기상청 10/5 17시 발표" */
    stamp: string;
}

const BG = "#0A0A0A";
const LIME = "#64DD17";
const INK = "#F5F5F4";
const MUTED = "rgba(245,245,244,0.62)";
const DIM = "rgba(245,245,244,0.40)";
const LINE = "rgba(245,245,244,0.14)";
const SUN = "#FFC43D", MOON = "#C9D1FF", CLOUD = "#B9BDC4", RAIN = "#4DA3FF", SNOW = "#EAF4FF", WIND = "#FF9F0A";
/** 한 줄 평의 색 — 좋은 날은 라임, 조심할 날은 그 까닭의 색, 나머지는 흰색 */
const TONE_COLOR: Record<BriefTone, string> = { good: LIME, ok: INK, rain: RAIN, snow: SNOW, wind: WIND, cold: "#9CCBFF", heat: "#FF8A3D", night: MOON };

type El = { type: string; props: Record<string, unknown> & { children?: unknown } };
const h = (type: string, style: Record<string, unknown>, ...children: unknown[]): El =>
    ({ type, props: { style: type === "div" ? { display: "flex", ...style } : style, children: children.length === 1 ? children[0] : children } });

/** 날씨 그림 — s 는 한 변(px). 해·달은 동그라미, 구름은 알약, 비·눈은 구름 아래 방울 셋 */
function glyph(kind: WxKind, night: boolean, s: number): El {
    const disc = (color: string, d: number, style: Record<string, unknown> = {}) => h("div", { width: d, height: d, borderRadius: d / 2, background: color, ...style });
    const cloud = (w: number, style: Record<string, unknown> = {}) => h("div", { width: w, height: w * 0.52, borderRadius: w * 0.26, background: CLOUD, ...style });
    const box = (...children: El[]) => h("div", { width: s, height: s, position: "relative", alignItems: "center", justifyContent: "center" }, ...children);
    const orb = night ? MOON : SUN;
    if (kind === "clear") return box(disc(orb, s * 0.62));
    if (kind === "partly") return box(
        disc(orb, s * 0.5, { position: "absolute", top: s * 0.1, left: s * 0.42 }),
        cloud(s * 0.72, { position: "absolute", top: s * 0.42, left: s * 0.06 }),
    );
    if (kind === "cloudy") return box(cloud(s * 0.84));
    const snow = kind === "snow";
    const color = snow ? SNOW : kind === "sleet" ? "#8CC4FF" : RAIN;
    const drops = [0.24, 0.46, 0.68].map((x) => h("div", { position: "absolute", left: s * x, top: s * 0.68, width: s * 0.09, height: snow ? s * 0.09 : s * 0.2, borderRadius: s * 0.045, background: color }));
    return box(cloud(s * 0.84, { position: "absolute", top: s * 0.14, left: s * 0.08 }), ...drops);
}
/** 바람 — 길이가 다른 가로줄 셋 */
function windGlyph(s: number): El {
    const bar = (w: number, top: number) => h("div", { position: "absolute", left: s * 0.1, top: s * top, width: s * w, height: s * 0.1, borderRadius: s * 0.05, background: WIND });
    return h("div", { width: s, height: s, position: "relative" }, bar(0.8, 0.24), bar(0.56, 0.46), bar(0.7, 0.68));
}

function tree(p: GolfRoundCardInput): El {
    const nameSize = p.name.length > 14 ? 60 : p.name.length > 9 ? 72 : 84;
    const verdictSize = p.verdict.length > 9 ? 78 : 96;
    const big = p.tone === "wind" ? windGlyph(150) : glyph(p.tone === "night" ? "clear" : p.sky, p.tone === "night", 150);
    const hours = p.hours.slice(0, 6);
    const cols = hours.map((x) =>
        h("div", { flex: 1, flexDirection: "column", alignItems: "center" },
            h("div", { fontSize: 30, fontWeight: 500, color: MUTED }, x.label),
            h("div", { marginTop: 10 }, glyph(x.kind, x.night, 76)),
            h("div", { marginTop: 6, fontSize: 48, fontWeight: 800, letterSpacing: -1 }, x.tmp),
            h("div", { marginTop: 2, fontSize: 30, fontWeight: 700, color: x.wet ? RAIN : DIM }, x.pop),
        ));
    const back = hours.length - p.frontCount;
    const half = (label: string, flex: number) => h("div", { flex, justifyContent: "center", borderTop: `2px solid ${LINE}`, paddingTop: 10, fontSize: 26, fontWeight: 500, color: DIM }, label);
    const gear = p.gear.slice(0, 3).map((g) => h("div", { padding: "10px 24px", borderRadius: 30, background: "rgba(245,245,244,0.09)", fontSize: 34, fontWeight: 700 }, g));
    return h("div", {
        width: CARD_SIZE, height: CARD_SIZE, flexDirection: "column", justifyContent: "space-between",
        padding: "60px 68px 52px", fontFamily: "Pretendard", color: INK, backgroundColor: BG,
        backgroundImage: "radial-gradient(circle at 50% 30%, rgba(100,221,23,0.16) 0%, rgba(100,221,23,0.04) 42%, rgba(10,10,10,0) 70%)",
    },
        // 머리: 랭큐 골프 · 라운드 브리핑
        h("div", { justifyContent: "space-between", alignItems: "center" },
            h("div", { alignItems: "center", fontSize: 34, fontWeight: 800, letterSpacing: 2 },
                h("div", { width: 18, height: 18, borderRadius: 9, background: LIME, marginRight: 14 }), "RANKUE GOLF"),
            h("div", { fontSize: 32, fontWeight: 700, color: MUTED }, "라운드 브리핑"),
        ),
        // 어디서 · 언제
        h("div", { flexDirection: "column" },
            h("div", { fontSize: nameSize, fontWeight: 800, letterSpacing: -2, lineHeight: 1.1 }, p.name),
            h("div", { marginTop: 12, fontSize: 40, fontWeight: 500, color: MUTED }, `${p.dateLabel} · ${p.teeLabel}`),
        ),
        // 한 줄 평 + 근거 숫자
        h("div", { alignItems: "center" },
            big,
            h("div", { marginLeft: 36, flexDirection: "column", flex: 1 },
                h("div", { fontSize: verdictSize, fontWeight: 800, letterSpacing: -3, lineHeight: 1.08, color: TONE_COLOR[p.tone] }, p.verdict),
                h("div", { marginTop: 14, fontSize: 40, fontWeight: 500, color: "rgba(245,245,244,0.86)" }, p.reason),
            ),
        ),
        // 그 라운드 여섯 칸 + 전반·후반
        h("div", { flexDirection: "column" },
            h("div", {}, ...cols),
            h("div", { marginTop: 14, gap: 16 }, half("전반 9홀", p.frontCount), ...(back > 0 ? [half("후반 9홀", back)] : [])),
        ),
        // 챙길 것 · 해
        h("div", { flexDirection: "column" },
            gear.length ? h("div", { alignItems: "center", gap: 14 }, h("div", { fontSize: 30, fontWeight: 500, color: MUTED, marginRight: 4 }, "챙길 것"), ...gear) : "",
            p.sunLine ? h("div", { marginTop: gear.length ? 18 : 0, fontSize: 32, fontWeight: 500, color: MUTED }, p.sunLine) : "",
        ),
        // 발: 발표 시각 · 주소
        h("div", { justifyContent: "space-between", alignItems: "center", borderTop: `2px solid ${LINE}`, paddingTop: 24 },
            h("div", { fontSize: 28, fontWeight: 700, color: MUTED }, p.stamp),
            h("div", { fontSize: 28, fontWeight: 700, color: MUTED, letterSpacing: 1 }, "www.rankue.co.kr"),
        ),
    );
}

export async function renderGolfRoundCardPng(p: GolfRoundCardInput): Promise<Buffer> {
    const { satori, Resvg } = await engines();
    const svg = await satori(tree(p) as any, { width: CARD_SIZE, height: CARD_SIZE, fonts: fonts() });
    return new Resvg(svg, { fitTo: { mode: "width", value: CARD_SIZE } }).render().asPng();
}

/** 카드 주소 정본 — 화면의 공유 단추와 검색엔진용 화면의 og:image 가 같은 규칙 */
export const golfRoundCardUrl = (origin: string, slug: string, r: RoundRef) => `${origin}${roundCardPath(slug, r)}`;
