/**
 * '여기' 미니 지도 — 전국 골프장 점 지도 한 장에 **이 골프장 하나**를 켠다
 * (2026-10-05 오너: "이 점들이 우리만의 시그니처" → "응 순서대로" 6번: 같은 점 문법을 다른 곳에도).
 *
 * 쓰는 곳 둘이 같은 틀·같은 자리를 쓰도록 셈을 여기 둔다:
 *  · 골프장 상세 '위치·연락'의 작은 지도(client HereMap — 점 밑에 시도 윤곽선을 깐다)
 *  · 라운드 공유 카드의 한 귀퉁이(server golfRoundCard — **점만**. 윤곽선 자료는 출처 기록이 없어 밖으로 나가는 그림에 싣지 않는다)
 *
 * 틀은 늘 전국(KOREA_CORNERS)이다 — 골프장마다 틀이 달라지면 "어디쯤"이 한눈에 안 읽힌다.
 */
import { KOREA_CORNERS, fitBox, mapX, mapY, toCells, type MapBox, type MapDot } from "./golfDotMap.js";

/** 미니 지도의 비율(너비/높이) — 한반도가 꽉 차는 세로 직사각형 */
export const HERE_ASPECT = 0.62;
/** 전국 틀 [x, y, 너비, 높이] */
export const HERE_BOX: MapBox = fitBox(KOREA_CORNERS, HERE_ASPECT);

/**
 * 이 좌표의 지도 위 자리. 틀 밖이면 null — 좌표가 틀린 골프장이나 먼 섬(울릉도)은 미니 지도를 그리지 않는다
 * (엉뚱한 자리에 점을 켜느니 없는 편이 낫다).
 */
export function herePoint(lat: number | null | undefined, lng: number | null | undefined): { x: number; y: number } | null {
    if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    const x = mapX(lng), y = mapY(lat);
    const [bx, by, bw, bh] = HERE_BOX;
    // 가장자리 4% 안쪽이어야 한다 — 켜진 점의 고리가 잘리지 않게
    const mx = bw * 0.04, my = bh * 0.04;
    if (x < bx + mx || x > bx + bw - mx || y < by + my || y > by + bh - my) return null;
    return { x, y };
}

/** 켜진 점의 뜻 — 허브 지도의 색과 같다. null 이면 흰 점(그냥 '여기') */
export type HereTone = "urgent" | "join" | "booking" | "watch" | null;
/** 허브 지도와 같은 순서 — 긴급 > 조인 > 부킹 > 내 관심. 새 색을 지어내지 않는다 */
export const hereTone = (counts: { booking?: number; join?: number; urgent?: number } | null | undefined, watching: boolean): HereTone =>
    (counts?.urgent ?? 0) > 0 ? "urgent" : (counts?.join ?? 0) > 0 ? "join" : (counts?.booking ?? 0) > 0 ? "booking" : watching ? "watch" : null;

const f = (v: number) => (Math.round(v * 100) / 100).toString();

/**
 * 점만으로 그린 미니 지도 SVG(서버 카드용). 골프장 좌표가 없으면(dots 가 비면) 켜진 점 하나만 남는다 — 그때는 null 을 돌려
 * 부르는 쪽이 지도를 빼게 한다(점 하나로는 어디인지 알 수 없다).
 */
export function hereMapSvg(dots: readonly { lat: number; lng: number }[], at: { lat: number | null; lng: number | null }, o: {
    /** 그림 너비(px) — 높이는 비율로 */
    width: number;
    /** 가로 칸 수 */
    cols?: number;
    /** 켜진 점의 색 */
    color?: string;
    /** 켜진 점 둘레 테두리 — 지도가 놓인 바탕색 */
    bg?: string;
    /** 켜진 점의 반지름(그림 px) */
    mark?: number;
    /** 한 칸의 골프장 수(1·2·3곳 이상)별 점 색 — 기본은 작은 지도용의 옅은 흰색. 지도가 주인공인 큰 카드는 더 밝게 준다 */
    fills?: readonly [string, string, string];
}): { svg: string; width: number; height: number } | null {
    const here = herePoint(at.lat, at.lng);
    if (!here || dots.length < 20) return null;
    const width = o.width, height = Math.round(width / HERE_ASPECT);
    const u = HERE_BOX[2] / width; // 그림 1px = 지도 칸 u
    const g = HERE_BOX[2] / (o.cols ?? 20);
    const cells = toCells(dots.map((d, i): MapDot => ({ key: String(i), lat: d.lat, lng: d.lng, tone: "on" })), g);
    const fill = o.fills ?? ["rgba(255,255,255,0.22)", "rgba(255,255,255,0.34)", "rgba(255,255,255,0.48)"];
    const body = cells.map((c) => `<circle cx="${f(c.x)}" cy="${f(c.y)}" r="${f(g * 0.3)}" fill="${fill[Math.min(c.n, 3) - 1]}"/>`).join("");
    const color = o.color ?? "#64DD17", bg = o.bg ?? "#0A0A0A";
    const r = (o.mark ?? 5) * u;
    const mark = `<circle cx="${f(here.x)}" cy="${f(here.y)}" r="${f(r * 2.3)}" fill="${color}" fill-opacity="0.22"/>`
        + `<circle cx="${f(here.x)}" cy="${f(here.y)}" r="${f(r)}" fill="${color}" stroke="${bg}" stroke-width="${f(r * 0.36)}"/>`;
    return {
        svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${HERE_BOX.map(f).join(" ")}">${body}${mark}</svg>`,
        width, height,
    };
}
