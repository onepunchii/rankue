/**
 * 바다 지도(2026-10-14 오너: "등산처럼 지도 … 우와 소리 나게" → "지도 디자인 업그레이드 · 풍랑특보 디자인도 다시 · 지도 확대 · 픽셀을 찍으면 팝업").
 *
 * 종이 해도 한 장: 종이색 바다 · 해안을 따라 옅어지는 얕은 바다의 띠(등심선 느낌) · 뭍의 그림자와 빗금 · 경위도 눈금과 숫자 · 축척 · 방위표.
 * - 확대: 두 손가락으로 벌리기 · 두 번 누르기 · + / − 단추. 한 손가락으로 끄는 것은 키운 뒤에만(안 키웠을 때는 화면 스크롤) — 등산 코스 지도와 같은 손짓(hiking/lib/useBoxZoom).
 *   키울수록 바다의 칸이 잘게 나뉜다(11 → 5.5 → 2.75). 글자 · 점 · 선은 화면에서 같은 크기로 남는다.
 * - 풍랑특보: 네모 상자가 아니라 **번진 빗금 물감**(그 구역의 어림 자리)과 꼬리표(구역 이름 + 특보). 특보가 없는 구역은 그리지 않는다
 *   (구역 고르기 — 출조 탭 — 에서만 옅은 점선 테두리와 이름).
 * - 바다의 픽셀: 지점의 낚시지수를 거리로 섞은 어림(PIXEL_REACH_KM 안만). 칸을 누르면 그 자리의 위경도를 돌려준다(팝업은 부른 쪽이 띄운다).
 *
 * 뭍의 윤곽선은 골프의 점 지도가 쓰는 것(golf/data/koreaMapData)을 **화면에서만** 빌려 쓴다. 울릉도 · 독도는 윤곽선에 없어 동해에 칸을 따로 그린다.
 * ⚠️ 구역의 자리는 **어림**이다(기상청 해상 광역의 실제 경계선이 아니다). ⚠️ 리터럴 색만. 화면 글자 12px 아래 금지.
 */
import { useMemo } from "react";
import { KOREA_MAP_PATHS } from "@/golf/data/koreaMapData";
import { latLngToOutline, outlineToLatLng } from "@/golf/lib/koreaOutline";
import { useBoxZoom } from "@/hiking/lib/useBoxZoom";
import { LucideMinus, LucidePlus } from "@/lib/icons";
import { SEA_AREAS, layoutTags, type SeaArea, type SeaState } from "@shared/fishingSea";
import { FISHING_INDEX_STEPS, type FishingIndexStep } from "@shared/fishingPort";
import type { KmBox } from "@shared/hikingCourseMap";

const VIEW = { x: -44, y: -6, w: 544, h: 692 } as const;
const HOME: KmBox = { x: VIEW.x, y: VIEW.y, w: VIEW.w, h: VIEW.h };
const LAND = Object.values(KOREA_MAP_PATHS);
const INSET = { x: 392, y: 190, w: 104, h: 60 } as const;

/** 구역의 네모(위경도 — 어림) · 꼬리표를 다는 자리 */
const ZONES: Readonly<Record<string, { lat: [number, number]; lng: [number, number]; at: [number, number] }>> = {
    "west-mid": { lat: [36.05, 37.85], lng: [124.9, 126.9], at: [37.0, 125.62] },
    "west-south": { lat: [34.8, 36.0], lng: [124.9, 126.6], at: [35.32, 125.58] },
    "south-west": { lat: [33.8, 34.75], lng: [126.05, 127.75], at: [34.08, 127.16] },
    "south-east": { lat: [34.2, 35.15], lng: [127.8, 129.35], at: [34.45, 128.72] },
    jeju: { lat: [32.85, 33.74], lng: [125.85, 127.15], at: [33.02, 126.52] },
    "east-mid": { lat: [37.1, 38.6], lng: [128.45, 130.6], at: [37.98, 129.6] },
    "east-south": { lat: [35.2, 37.05], lng: [129.25, 130.6], at: [36.05, 130.0] },
};

/** 특보의 색 — 뜻 하나씩. 물감(번진 빗금) · 꼬리표의 글자 · 범례 */
const WASH: Readonly<Record<SeaState, { fill: string; hatch: string; line: string; word: string | null; tag: string | null; ink: string }>> = {
    clear: { fill: "#1F5A7814", hatch: "#1F5A7800", line: "#1F5A7840", word: null, tag: null, ink: "#0F2838A6" },
    pre: { fill: "#F2C56A66", hatch: "#B8862A8C", line: "#B8862A99", word: "예비특보", tag: "풍랑 예비특보", ink: "#7A5510" },
    far: { fill: "#F2C56A66", hatch: "#B8862A8C", line: "#B8862A99", word: "먼바다", tag: "먼바다 풍랑특보", ink: "#7A5510" },
    warn: { fill: "#EE7B5B70", hatch: "#B7462AA6", line: "#B7462AB3", word: "주의보", tag: "풍랑주의보", ink: "#8E2A14" },
    alert: { fill: "#D8432F9E", hatch: "#7A1A0CB3", line: "#8E2A14CC", word: "경보", tag: "풍랑경보", ink: "#5E1608" },
};
export const SEA_LEGEND: readonly { state: SeaState; text: string }[] = [
    { state: "clear", text: "특보 없음" }, { state: "far", text: "먼바다 · 예비" }, { state: "warn", text: "주의보" }, { state: "alert", text: "경보" },
];
export const seaWashColor = (s: SeaState) => WASH[s].fill;
export const seaWashLine = (s: SeaState) => WASH[s].line;
export const seaTagText = (s: SeaState) => WASH[s].tag;

export interface SeaTemp { name: string; lat: number; lng: number; wtem: number }

/** 낚시지수의 점 — 좋을수록 크고 짙다(국립해양조사원의 다섯 단계). 나쁜 곳은 빈 점 */
export const SPOT_DOT: Readonly<Record<FishingIndexStep, { r: number; fill: string; line: string }>> = {
    매우좋음: { r: 6.4, fill: "#0F4A66", line: "#F3ECDD" }, 좋음: { r: 5, fill: "#3F86A8", line: "#F3ECDD" }, 보통: { r: 3.7, fill: "#9CBFCC", line: "#F3ECDD" },
    나쁨: { r: 2.9, fill: "#F3ECDD", line: "#8AA0A8" }, 매우나쁨: { r: 2.4, fill: "#F3ECDD", line: "#B5C0C2" },
};
export interface ChartSpot { name: string; lat: number; lng: number; step: FishingIndexStep | null }

/**
 * 바다의 픽셀(2026-10-14 오너: "바다를 픽셀로 … 해당 픽셀을 찍으면 그 바다 정보") — 지점의 낚시지수를 칸마다 거리로 섞어(가까울수록 무겁게)
 * 다섯 단계 중 하나로 칠한다. 지점에서 멀수록 옅고, PIXEL_REACH_KM 밖은 칠하지 않는다(모르는 바다를 아는 척하지 않는다).
 * 칸의 색은 **어림**이다 — 국립해양조사원이 매긴 것은 점(지점)뿐이다. 화면에 그렇게 적는다.
 */
export const PIXEL_REACH_KM = 42;
const PIXEL: readonly string[] = ["#CDB487", "#E2D0A8", "#A9C9D3", "#4A8FB0", "#0F4A66"];
/** 칸의 무게 — 매우나쁨 · 나쁨은 종이에 스치듯, 좋음 · 매우좋음은 또렷하게 */
const PIXEL_WEIGHT: readonly number[] = [0.32, 0.45, 0.8, 1, 1];
export const PIXEL_LEGEND = PIXEL;
const KM = (() => { const [, y1] = latLngToOutline(35, 127), [, y2] = latLngToOutline(36, 127); return Math.abs(y2 - y1) / 111; })();
/** 키운 만큼 칸을 잘게 — 세 단계 */
const cellFor = (zoom: number) => (zoom < 1.8 ? 11 : zoom < 3.5 ? 5.5 : 2.75);
const CHUNK = 66; // 11 · 5.5 · 2.75 의 배수 — 보이는 곳만 덩이로 센다

let PATHS: Path2D[] | null = null;
let CTX: CanvasRenderingContext2D | null | undefined;
const CHUNKS = new Map<string, { x: number; y: number }[]>();
/** 한 덩이 안의 바다 칸(뭍 윤곽선 안 · 울릉 독도 칸은 뺀다) — 덩이마다 한 번만 센다 */
function seaChunk(cell: number, cx: number, cy: number): { x: number; y: number }[] {
    const key = `${cell}:${cx}:${cy}`;
    const hit = CHUNKS.get(key);
    if (hit) return hit;
    if (CTX === undefined) CTX = typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d");
    if (!PATHS) PATHS = CTX && typeof Path2D !== "undefined" ? LAND.map((d) => new Path2D(d)) : [];
    const out: { x: number; y: number }[] = [];
    for (let x = cx; x < cx + CHUNK - 0.01; x += cell) for (let y = cy; y < cy + CHUNK - 0.01; y += cell) {
        const mx = x + cell / 2, my = y + cell / 2;
        if (mx < VIEW.x || mx > VIEW.x + VIEW.w || my < VIEW.y || my > VIEW.y + VIEW.h) continue;
        if (mx > INSET.x - 4 && mx < INSET.x + INSET.w + 4 && my > INSET.y - 4 && my < INSET.y + INSET.h + 4) continue;
        if (CTX && PATHS.some((p) => CTX!.isPointInPath(p, mx, my))) continue;
        out.push({ x, y });
    }
    CHUNKS.set(key, out);
    return out;
}
/** 칸의 단계(0 매우나쁨 … 4 매우좋음)와 가장 가까운 지점까지의 거리(km) — 닿는 지점이 없으면 null */
export function pixelOf(spots: readonly { x: number; y: number; score: number }[], cx: number, cy: number): { score: number; km: number } | null {
    let w = 0, sum = 0, near = Infinity;
    for (const s of spots) {
        const d = Math.hypot(s.x - cx, s.y - cy) / KM;
        if (d > PIXEL_REACH_KM) continue;
        near = Math.min(near, d);
        const k = 1 / Math.max(4, d) ** 2;
        w += k; sum += k * s.score;
    }
    return w ? { score: Math.round(sum / w), km: near } : null;
}
/** 위경도의 구역(어림 — 구역의 네모로 본다) */
export function zoneAt(lat: number, lng: number): { id: string; name: string } | null {
    for (const def of SEA_AREAS) { const z = ZONES[def.id]; if (z && lat >= z.lat[0] && lat <= z.lat[1] && lng >= z.lng[0] && lng <= z.lng[1]) return { id: def.id, name: def.name }; }
    return null;
}

export function SeaChart({ areas, picked, onPick, temps, ports, port, spots, spot, onSpot, pixels, cell, onCell, me }: {
    /** 내 위치(기기에서 잰 값 — 저장 · 전송하지 않는다) */ me?: { lat: number; lng: number } | null;
    areas: readonly SeaArea[]; picked: string | null; onPick: (id: string) => void; temps?: readonly SeaTemp[];
    /** 항구의 점 — 고른 항구(port)는 이름과 함께 도드라진다 */
    ports?: readonly { code: string; name: string; lat: number; lng: number }[]; port?: string | null;
    /** 낚시지수의 점 — 고른 어종의 그날. 누르면 그 지점을 고른다. 이름은 고른 지점과 가장 좋은 몇 곳에만 적는다 */
    spots?: readonly ChartSpot[]; spot?: string | null; onSpot?: (name: string) => void;
    /** 바다를 픽셀로 칠한다(spots 의 단계로) — 칸을 누르면 그 자리의 위경도를 돌려준다 */
    pixels?: boolean; cell?: { lat: number; lng: number } | null; onCell?: (at: { lat: number; lng: number; km: number }) => void;
}) {
    const z = useBoxZoom(HOME, HOME, VIEW.w / 6);
    const v = z.view;
    // 화면에서 1px 가 그림에서 몇 칸인가 — 글자 · 점 · 선을 화면 크기로 맞춘다
    const u = v.w / Math.max(1, z.px);
    const fs = 12.4 * u;
    const by = new Map(areas.map((a) => [a.id, a]));
    const tap = (fn: () => void) => () => { if (!z.wasDragged()) fn(); };
    const zoneMode = !pixels; // 출조 탭: 구역을 고른다

    // 픽셀 — 보이는 덩이만, 키운 만큼 잘게
    const size = cellFor(z.zoom);
    const pts = useMemo(() => (pixels && spots?.length
        ? spots.filter((s) => s.step).map((s) => { const [x, y] = latLngToOutline(s.lat, s.lng); return { x, y, score: FISHING_INDEX_STEPS.indexOf(s.step!) }; }).filter((p) => p.x < VIEW.x + VIEW.w - 6)
        : []), [pixels, spots]);
    const c0x = Math.floor((v.x - VIEW.x) / CHUNK) * CHUNK + VIEW.x, c0y = Math.floor((v.y - VIEW.y) / CHUNK) * CHUNK + VIEW.y;
    const c1x = Math.ceil((v.x + v.w - VIEW.x) / CHUNK) * CHUNK + VIEW.x, c1y = Math.ceil((v.y + v.h - VIEW.y) / CHUNK) * CHUNK + VIEW.y;
    const tiles = useMemo(() => {
        if (!pts.length) return [];
        const out: { x: number; y: number; score: number; km: number }[] = [];
        for (let cx = c0x; cx < c1x; cx += CHUNK) for (let cy = c0y; cy < c1y; cy += CHUNK) for (const c of seaChunk(size, cx, cy)) {
            const p = pixelOf(pts, c.x + size / 2, c.y + size / 2);
            if (p) out.push({ ...c, ...p });
        }
        return out;
    }, [pts, size, c0x, c0y, c1x, c1y]);
    const cellXY = cell ? latLngToOutline(cell.lat, cell.lng) : null;
    const pickedTile = cellXY ? tiles.find((t) => cellXY[0] >= t.x && cellXY[0] < t.x + size && cellXY[1] >= t.y && cellXY[1] < t.y + size) ?? null : null;

    // 경위도 눈금(위도 33~38 · 경도 125~130)
    const lats = [33, 34, 35, 36, 37, 38], lngs = [125, 126, 127, 128, 129, 130];
    const grid = [
        ...lats.map((lat) => { const [, y] = latLngToOutline(lat, 127); return `M${VIEW.x} ${y} H${VIEW.x + VIEW.w}`; }),
        ...lngs.map((lng) => { const [x] = latLngToOutline(36, lng); return `M${x} ${VIEW.y} V${VIEW.y + VIEW.h}`; }),
    ].join(" ");
    // 지점의 이름 — 키울수록 더 많이(서로 너무 가까우면 건너뛴다)와 고른 곳. 꼬리표가 이 이름을 덮지 않게 먼저 셈한다
    const spotNames = (() => {
        const rank = (s: ChartSpot) => (s.step ? FISHING_INDEX_STEPS.indexOf(s.step) : -1);
        const drawn = (spots ?? []).filter((s) => s.step).sort((a, b) => rank(a) - rank(b));
        const named: ChartSpot[] = [];
        const most = z.zoom < 1.5 ? 6 : z.zoom < 3 ? 14 : 40;
        for (const s of [...drawn].reverse()) {
            if ((z.zoom < 1.5 && rank(s) < 3) || named.length >= most) break;
            const [x, y] = latLngToOutline(s.lat, s.lng);
            if (x < v.x || x > v.x + v.w || y < v.y || y > v.y + v.h) continue;
            if (named.every((n) => { const [nx, ny] = latLngToOutline(n.lat, n.lng); return Math.abs(nx - x) > fs * 3.2 || Math.abs(ny - y) > fs * 1.25; })) named.push(s);
        }
        const pickedSpot = drawn.find((s) => s.name === spot) ?? null;
        const place = (s: ChartSpot): [number, number] => { const [x, y] = latLngToOutline(s.lat, s.lng); return x > VIEW.x + VIEW.w - 6 ? [INSET.x + 30, INSET.y + 19] : [x, y]; };
        const short = (n: string) => n.replace(/\(.*\)$/, "").replace(/(북동|남동|북서|남서|북북서|남남동|남남서|동북동|동남동|동측|서측|남측|북측)$/, "");
        const dotR = (st: FishingIndexStep) => (tiles.length ? Math.max(2.4, SPOT_DOT[st].r * 0.62) : SPOT_DOT[st].r);
        // 글이 차지하는 네모(지도 칸) — 점 옆에서 시작해 글자 수만큼
        const boxes = [...named, ...(pickedSpot ? [pickedSpot] : [])].map((s) => {
            const [x, y] = place(s), left = x > v.x + v.w * 0.6, off = (dotR(s.step!) + 3.5) * u, w = short(s.name).length * fs;
            const x0 = left ? x - off - w : x - (dotR(s.step!) + 1) * u;
            return { x0, y0: y - fs * 0.7, x1: left ? x + (dotR(s.step!) + 1) * u : x + off + w, y1: y + fs * 0.6 };
        });
        return { drawn, named, pickedSpot, place, short, dotR, boxes };
    })();
    // 풍랑특보 꼬리표 — 센 특보부터 놓고 겹치면 비킨다(layoutTags). 경도 · 위도 숫자도 꼬리표 밑이면 뺀다
    const TAG_H = 38, RANK: Readonly<Record<SeaState, number>> = { alert: 4, warn: 3, far: 2, pre: 1, clear: 0 };
    // 낚시지수 보기(pixels)에는 꼬리표를 달지 않는다 — 특보는 '특보 · 항구' 보기에 있다(오너 10/17). 번진 물감 색은 남긴다
    const tagDefs = pixels ? [] : SEA_AREAS.flatMap((def) => {
        const zz = ZONES[def.id], a = by.get(def.id), w = a ? WASH[a.state] : null;
        if (!zz || !a || !w?.tag) return [];
        const [ax, ay] = latLngToOutline(zz.at[0], zz.at[1]);
        if (ax < v.x - 40 * u || ax > v.x + v.w + 40 * u || ay < v.y - 30 * u || ay > v.y + v.h + 30 * u) return [];
        const tw = Math.max(def.name.length, w.tag.length) * 12.6 + 34;
        return [{ def, a, w, tw, box: { id: def.id, cx: ax, cy: ay, w: tw * u, h: TAG_H * u, rank: RANK[a.state] } }];
    });
    // 구역 고르기에서 특보 없는 구역의 이름(아래 글)은 이미 놓인 것으로 — 꼬리표가 그 글을 덮지 않게
    const nameBoxes = zoneMode ? SEA_AREAS.flatMap((def) => {
        const zz = ZONES[def.id], a = by.get(def.id);
        if (!zz || !a || a.state !== "clear") return [];
        const [x, y] = latLngToOutline(zz.at[0], zz.at[1]), hw = (def.name.length * fs) / 2 + 2 * u;
        return [{ x0: x - hw, y0: y - fs * 1.05, x1: x + hw, y1: y + fs * 0.3 }];
    }) : [];
    // 지도 위의 단추 — 키우기 · 줄이기(오른쪽 아래 40×80) · 키웠을 때 '전국 보기'(오른쪽 위)
    const buttonBoxes = [
        { x0: v.x + v.w - 56 * u, y0: v.y + v.h - 96 * u, x1: v.x + v.w, y1: v.y + v.h },
        ...(z.zoom > 1.01 ? [{ x0: v.x + v.w - 96 * u, y0: v.y, x1: v.x + v.w, y1: v.y + 46 * u }] : []),
    ];
    const tagAt = layoutTags(tagDefs.map((t) => t.box), { x0: v.x + 6 * u, y0: v.y + 22 * u, x1: v.x + v.w - 6 * u, y1: v.y + v.h - 58 * u }, 4 * u, [...nameBoxes, ...buttonBoxes], spotNames.boxes);
    const underTag = (x: number, y: number) => tagDefs.some((t) => { const p = tagAt.get(t.def.id); return !!p && Math.abs(x - p.cx) < t.box.w / 2 + 14 * u && Math.abs(y - p.cy) < t.box.h / 2 + 8 * u; });
    // 축척 — 화면에서 56px 이상이 되는 둥근 km
    const scaleKm = [10, 20, 50, 100].find((km) => (km * KM) / u >= 56) ?? 100;

    return (
        <div className="relative">
            <svg ref={z.svgRef} viewBox={`${v.x} ${v.y} ${v.w} ${v.h}`} className="block w-full select-none" role="group" aria-label="바다 지도" data-testid="fishing-chart" data-zoom={z.zoom.toFixed(2)}
                style={{ touchAction: z.touchAction, aspectRatio: `${VIEW.w} / ${VIEW.h}` }} {...z.handlers}>
                <defs>
                    <pattern id="fs-wave" width="26" height="12" patternUnits="userSpaceOnUse" patternTransform={`scale(${1 / Math.sqrt(z.zoom)})`}><path d="M0 6 q6.5 -5 13 0 t13 0" fill="none" stroke="#1F5A7824" strokeWidth="0.9" /></pattern>
                    <pattern id="fs-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform={`rotate(35) scale(${1 / z.zoom})`}><path d="M0 0 V5" stroke="#0F283812" strokeWidth="1.4" /></pattern>
                    {(["pre", "far", "warn", "alert"] as const).map((s) => (
                        <pattern key={s} id={`fs-storm-${s}`} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform={`rotate(-38) scale(${1 / Math.sqrt(z.zoom)})`}><path d="M0 0 V7" stroke={WASH[s].hatch} strokeWidth="2.1" /></pattern>
                    ))}
                    <filter id="fs-soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="9" /></filter>
                    <radialGradient id="fs-vignette" cx="50%" cy="45%" r="75%"><stop offset="70%" stopColor="#0F2838" stopOpacity="0" /><stop offset="100%" stopColor="#0F2838" stopOpacity="0.09" /></radialGradient>
                </defs>
                <rect x={VIEW.x} y={VIEW.y} width={VIEW.w} height={VIEW.h} fill="#EFE8D8" />
                <rect x={VIEW.x} y={VIEW.y} width={VIEW.w} height={VIEW.h} fill="url(#fs-wave)" />
                {/* 얕은 바다의 띠 — 해안선을 넓게 세 번 그어 바다 쪽으로 옅어지게(뭍이 위에 덮인다) */}
                <g fill="none" strokeLinejoin="round" pointerEvents="none">
                    <g stroke="#9CC3CF" strokeOpacity="0.16" strokeWidth={30 / z.zoom ** 0.6}>{LAND.map((d, i) => <path key={i} d={d} />)}</g>
                    <g stroke="#9CC3CF" strokeOpacity="0.22" strokeWidth={17 / z.zoom ** 0.6}>{LAND.map((d, i) => <path key={i} d={d} />)}</g>
                    <g stroke="#BFD8DC" strokeOpacity="0.5" strokeWidth={7 / z.zoom ** 0.6}>{LAND.map((d, i) => <path key={i} d={d} />)}</g>
                </g>
                <path d={grid} fill="none" stroke="#1F5A7826" strokeWidth={0.6 * u} strokeDasharray={`${2 * u} ${3 * u}`} pointerEvents="none" />

                {/* 구역 고르기(출조 탭) — 옅은 점선 테두리. 특보 구역은 아래의 물감이 말한다 */}
                {zoneMode && SEA_AREAS.map((def) => {
                    const zz = ZONES[def.id], a = by.get(def.id);
                    if (!zz || !a) return null;
                    const [x1, y1] = latLngToOutline(zz.lat[1], zz.lng[0]), [x2, y2] = latLngToOutline(zz.lat[0], zz.lng[1]);
                    const on = picked === def.id;
                    return (
                        <g key={def.id} role="button" tabIndex={0} aria-pressed={on} aria-label={`${def.name} ${WASH[a.state].word ?? "특보 없음"}`} onClick={tap(() => onPick(def.id))}
                            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(def.id); } }}
                            data-testid={`fishing-sea-${def.id}`} data-state={a.state} style={{ cursor: "pointer", outline: "none" }}>
                            <rect x={x1} y={y1} width={x2 - x1} height={y2 - y1} rx={18} fill={on ? "#1F5A781A" : "#1F5A7808"} stroke={on ? "#0F2838" : "#1F5A7840"} strokeWidth={(on ? 1.9 : 0.8) * u} strokeDasharray={on ? undefined : `${4 * u} ${3 * u}`} />
                        </g>
                    );
                })}

                {/* 풍랑특보 — 번진 물감 + 빗금(어림 자리) */}
                <g pointerEvents="none" data-testid="fishing-chart-storms">
                    {/* 낚시지수 보기에서는 물감을 깔지 않는다 — 잘 잡히는 파랑이 먼저 보여야 한다(2026-10-18 오너). 특보는 '특보 · 항구' 보기에 */}
                    {!pixels && SEA_AREAS.map((def) => {
                        const zz = ZONES[def.id], a = by.get(def.id);
                        if (!zz || !a || a.state === "clear") return null;
                        const [x1, y1] = latLngToOutline(zz.lat[1], zz.lng[0]), [x2, y2] = latLngToOutline(zz.lat[0], zz.lng[1]);
                        const r = { x: x1 + 6, y: y1 + 6, width: x2 - x1 - 12, height: y2 - y1 - 12 };
                        const wide = { x: r.x - 14, y: r.y - 14, width: r.width + 28, height: r.height + 28 };
                        return (
                            <g key={def.id} data-state={a.state}>
                                <mask id={`fs-feather-${def.id}`} maskUnits="userSpaceOnUse"><rect {...r} rx={26} fill="#FFFFFF" filter="url(#fs-soft)" /></mask>
                                <g mask={`url(#fs-feather-${def.id})`}>
                                    <rect {...wide} fill={WASH[a.state].fill} />
                                    <rect {...wide} fill={`url(#fs-storm-${a.state})`} />
                                </g>
                            </g>
                        );
                    })}
                </g>

                {/* 바다의 픽셀 — 칸 사이에 종이가 비치게 조금씩 띄운다. 지점에서 멀수록 옅다 */}
                {tiles.length > 0 && (
                    <g data-testid="fishing-chart-pixels" style={{ cursor: "pointer" }} onClick={(e) => {
                        if (z.wasDragged()) return;
                        const t = tiles[Number((e.target as SVGElement).getAttribute("data-i"))];
                        if (!t) return;
                        const at = outlineToLatLng(t.x + size / 2, t.y + size / 2);
                        onCell?.({ ...at, km: Math.round(t.km) });
                    }}>
                        {/* 좋은 칸이 위에 · 진하게, 나쁜 칸은 옅게 — 눈이 먼저 가는 곳이 '잘 잡히는 곳'이게(2026-10-18 오너) */}
                        {tiles.map((t, i) => ({ t, i })).sort((a, b) => a.t.score - b.t.score).map(({ t, i }) => <rect key={`${t.x}:${t.y}`} data-i={i} data-score={t.score} x={t.x + size * 0.07} y={t.y + size * 0.07} width={size * 0.86} height={size * 0.86} rx={size * 0.15} fill={PIXEL[t.score]}
                            opacity={(t.km < PIXEL_REACH_KM * 0.35 ? 1 : t.km < PIXEL_REACH_KM * 0.68 ? 0.78 : 0.5) * PIXEL_WEIGHT[t.score]} />)}
                    </g>
                )}

                {/* 뭍 — 그림자 · 종이색 · 빗금 */}
                <g fill="#0F283826" stroke="#0F283826" strokeWidth="5" strokeLinejoin="round" pointerEvents="none">{LAND.map((d, i) => <path key={i} d={d} />)}</g>
                <g fill="#C9BFA4" opacity="0.6" transform="translate(2.5 3)" pointerEvents="none">{LAND.map((d, i) => <path key={i} d={d} />)}</g>
                <g fill="#EAE2CC" stroke="#0F283855" strokeWidth={0.6 / Math.sqrt(z.zoom)} strokeLinejoin="round" pointerEvents="none">{LAND.map((d, i) => <path key={i} d={d} />)}</g>
                <g fill="url(#fs-hatch)" pointerEvents="none">{LAND.map((d, i) => <path key={i} d={d} />)}</g>
                <rect x={VIEW.x} y={VIEW.y} width={VIEW.w} height={VIEW.h} fill="url(#fs-vignette)" pointerEvents="none" />

                {/* 울릉도 · 독도 — 윤곽선 자료에 없어 따로 그린다 */}
                <g pointerEvents="none">
                    <rect x={INSET.x} y={INSET.y} width={INSET.w} height={INSET.h} rx="6" fill="#EFE8D8" stroke="#0F283840" strokeWidth="0.7" strokeDasharray="2 2" />
                    <ellipse cx={INSET.x + 30} cy={INSET.y + 19} rx="12" ry="10" fill="#EAE2CC" stroke="#0F283845" strokeWidth="0.5" />
                    <circle cx={INSET.x + 72} cy={INSET.y + 21} r="2.4" fill="#EAE2CC" stroke="#0F283855" strokeWidth="0.5" />
                    <circle cx={INSET.x + 78} cy={INSET.y + 19.5} r="1.9" fill="#EAE2CC" stroke="#0F283855" strokeWidth="0.5" />
                    <text x={INSET.x + INSET.w / 2} y={INSET.y + INSET.h - 5} textAnchor="middle" fontSize={fs * 0.97} fill="#0F2838A6">울릉 · 독도</text>
                </g>

                {/* 구역의 이름 — 구역 고르기에서만(특보 구역은 꼬리표가 이름을 단다) */}
                {zoneMode && (
                    <g pointerEvents="none">
                        {SEA_AREAS.map((def) => {
                            const zz = ZONES[def.id], a = by.get(def.id);
                            if (!zz || !a || a.state !== "clear") return null;
                            const [x, y] = latLngToOutline(zz.at[0], zz.at[1]);
                            return <text key={def.id} x={x} y={y} textAnchor="middle" fontSize={fs} fontWeight="600" fill="#0F2838B3" stroke="#EFE8D8" strokeWidth={fs * 0.22} paintOrder="stroke">{def.name}</text>;
                        })}
                    </g>
                )}

                {/* 관측소의 수온 — 받은 것만 */}
                {temps && temps.length > 0 && (
                    <g pointerEvents="none" data-testid="fishing-chart-temps">
                        {temps.map((t) => {
                            const [x, y] = latLngToOutline(t.lat, t.lng);
                            return (
                                <g key={t.name} transform={`translate(${x} ${y})`}>
                                    <circle r={2.4 * u} fill="#1F5A78" stroke="#F3ECDD" strokeWidth={0.8 * u} />
                                    <text x={3.6 * u} y={fs * 0.34} fontSize={fs * 0.97} fill="#1F5A78" stroke="#F3ECDD" strokeWidth={fs * 0.22} paintOrder="stroke" className="tabular-nums">{t.wtem.toFixed(1)}°</text>
                                </g>
                            );
                        })}
                    </g>
                )}

                {/* 항구 — 작은 먹점. 고른 항구는 붉은 점과 이름 */}
                {ports && ports.length > 0 && (
                    <g pointerEvents="none" data-testid="fishing-chart-ports">
                        {ports.filter((p) => p.code !== port).map((p) => { const [x, y] = latLngToOutline(p.lat, p.lng); return x > VIEW.x + VIEW.w - 6 ? null : <circle key={p.code} cx={x} cy={y} r={1.7 * u} fill="#0F2838" opacity="0.55" />; })}
                        {ports.filter((p) => p.code === port).map((p) => {
                            const [px, y] = latLngToOutline(p.lat, p.lng);
                            const off = px > VIEW.x + VIEW.w - 6, x = off ? INSET.x + 30 : px, cy = off ? INSET.y + 19 : y;
                            const left = x > v.x + v.w * 0.62;
                            return (
                                <g key={p.code} data-testid="fishing-chart-port">
                                    <circle cx={x} cy={cy} r={6.5 * u} fill="#C8372D" opacity="0.2" />
                                    <circle cx={x} cy={cy} r={3.3 * u} fill="#C8372D" stroke="#F3ECDD" strokeWidth={1.2 * u} />
                                    <text x={x + (left ? -6 : 6) * u} y={cy - 5 * u} textAnchor={left ? "end" : "start"} fontSize={fs} fontWeight="600" fill="#8E2A14" stroke="#F3ECDD" strokeWidth={fs * 0.24} paintOrder="stroke">{p.name}</text>
                                </g>
                            );
                        })}
                    </g>
                )}

                {/* 낚시지수의 점 — 나쁜 곳부터 그려 좋은 곳이 위에 온다. 픽셀이 면을, 점이 자리를 말한다 */}
                {spots && spots.length > 0 && (() => {
                    const { drawn, named, pickedSpot, place, short, dotR } = spotNames;
                    return (
                        <g data-testid="fishing-chart-spots">
                            {drawn.map((s) => {
                                const [x, y] = place(s), d = SPOT_DOT[s.step!], r = dotR(s.step!), on = s.name === spot;
                                return (
                                    <g key={s.name} role="button" tabIndex={0} aria-label={`${s.name} ${s.step}`} aria-pressed={on} onClick={(e) => { e.stopPropagation(); if (!z.wasDragged()) onSpot?.(s.name); }}
                                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSpot?.(s.name); } }} data-testid="fishing-chart-spot" data-step={s.step} style={{ cursor: "pointer", outline: "none" }}>
                                        <circle cx={x} cy={y} r={11 * u} fill="transparent" />
                                        {on && <circle cx={x} cy={y} r={(r + 4.5) * u} fill="none" stroke="#C8372D" strokeWidth={1.6 * u} />}
                                        <circle cx={x} cy={y} r={r * u} fill={d.fill} stroke={d.line} strokeWidth={1.1 * u} />
                                    </g>
                                );
                            })}
                            <g pointerEvents="none">
                                {[...named.filter((s) => s.name !== spot), ...(pickedSpot ? [pickedSpot] : [])].map((s) => {
                                    const [x, y] = place(s), on = s.name === spot, left = x > v.x + v.w * 0.6;
                                    return <text key={s.name} x={x + (left ? -1 : 1) * (dotR(s.step!) + 3.5) * u} y={y + fs * 0.34} textAnchor={left ? "end" : "start"} fontSize={fs} fontWeight="600" fill={on ? "#8E2A14" : "#0F2838"} stroke="#EFE8D8" strokeWidth={fs * 0.24} paintOrder="stroke">{short(s.name)}</text>;
                                })}
                            </g>
                        </g>
                    );
                })()}

                {/* 고른 칸 — 붉은 테 */}
                {pickedTile && <rect x={pickedTile.x - size * 0.06} y={pickedTile.y - size * 0.06} width={size * 1.12} height={size * 1.12} rx={size * 0.2} fill="none" stroke="#C8372D" strokeWidth={2 * u} pointerEvents="none" data-testid="fishing-chart-cell" />}

                {/* 내 위치 — 붉은 점 + 옅은 원(화면 크기 그대로) */}
                {me && (() => { const [mx, my] = latLngToOutline(me.lat, me.lng); return (
                    <g pointerEvents="none" data-testid="fishing-chart-me">
                        <circle cx={mx} cy={my} r={14 * u} fill="#C8372D2E" />
                        <circle cx={mx} cy={my} r={5.5 * u} fill="#C8372D" stroke="#FBF7EE" strokeWidth={2 * u} />
                        <text x={mx - 9 * u} y={my + 17 * u} textAnchor="end" fontSize={fs} fontWeight="600" fill="#8E2A14" stroke="#EFE8D8" strokeWidth={fs * 0.24} paintOrder="stroke">나</text>
                    </g>
                ); })()}

                {/* 풍랑특보의 꼬리표 — 구역 이름 + 특보(화면 크기 그대로) */}
                <g pointerEvents="none" data-testid="fishing-chart-tags">
                    {tagDefs.map(({ def, a, w, tw }) => {
                        const th = TAG_H, p = tagAt.get(def.id);
                        if (!p || !w.tag) return null;
                        const x = p.cx, y = p.cy;
                        return (
                            <g key={def.id} transform={`translate(${x} ${y}) scale(${u})`} data-state={a.state}>
                                <rect x={-tw / 2} y={-th / 2} width={tw} height={th} rx={8} fill="#FBF7EE" stroke={w.line} strokeWidth="1.3" />
                                <rect x={-tw / 2} y={-th / 2} width={5} height={th} rx={2} fill={w.line} />
                                {/* 물결 하나 — 풍랑의 표 */}
                                <path d={`M${-tw / 2 + 11} 2 q3 -5 6 0 t6 0`} fill="none" stroke={w.ink} strokeWidth="1.7" strokeLinecap="round" />
                                <text x={-tw / 2 + 28} y={-3} fontSize="12.4" fontWeight="600" fill="#0F2838">{def.name}</text>
                                <text x={-tw / 2 + 28} y={12} fontSize="12.4" fill={w.ink}>{w.tag}</text>
                            </g>
                        );
                    })}
                </g>

                {/* 경위도 숫자 · 축척 · 방위표 — 화면 가장자리에 붙는다 */}
                <g pointerEvents="none" fontSize={fs * 0.97} fill="#1F5A78B3">
                    {lngs.map((lng) => { const [x] = latLngToOutline(36, lng); return x > v.x + 30 * u && x < v.x + v.w - 30 * u && !underTag(x, v.y + 10 * u) ? <text key={lng} x={x} y={v.y + 14 * u} textAnchor="middle" stroke="#EFE8D8" strokeWidth={fs * 0.2} paintOrder="stroke">{lng}°</text> : null; })}
                    {lats.map((lat) => { const [, y] = latLngToOutline(lat, 127); return y > v.y + 70 * u && y < v.y + v.h - 16 * u && !underTag(v.x + 14 * u, y - 7 * u) ? <text key={lat} x={v.x + 4 * u} y={y - 3 * u} stroke="#EFE8D8" strokeWidth={fs * 0.2} paintOrder="stroke">{lat}°</text> : null; })}
                </g>
                <g transform={`translate(${v.x + 48 * u} ${v.y + 46 * u})`} pointerEvents="none" data-testid="fishing-chart-scale">
                    <rect x={0} y={-3 * u} width={scaleKm * KM} height={4 * u} fill="#F3ECDD" stroke="#0F2838B3" strokeWidth={0.8 * u} />
                    <rect x={0} y={-3 * u} width={(scaleKm * KM) / 2} height={4 * u} fill="#0F2838B3" />
                    <text x={scaleKm * KM + 5 * u} y={1 * u} fontSize={fs * 0.97} fill="#0F2838B3" stroke="#EFE8D8" strokeWidth={fs * 0.2} paintOrder="stroke">{scaleKm}km</text>
                </g>
                <g transform={`translate(${v.x + 24 * u} ${v.y + 44 * u}) scale(${u})`} pointerEvents="none">
                    <circle r="15" fill="#F3ECDDEE" stroke="#0F283855" strokeWidth="0.9" />
                    <circle r="11" fill="none" stroke="#0F283826" strokeWidth="0.7" />
                    <path d="M0 -12 L2.6 -2.6 L12 0 L2.6 2.6 L0 12 L-2.6 2.6 L-12 0 L-2.6 -2.6 Z" fill="#0F283833" />
                    <path d="M0 -13 L3.2 0 L0 -2 L-3.2 0 Z" fill="#C8372D" />
                    <path d="M0 13 L3.2 0 L0 2 L-3.2 0 Z" fill="#0F2838" />
                </g>
            </svg>

            {/* 확대 단추 — 오른쪽 아래 */}
            <div className="absolute bottom-2.5 right-2.5 flex flex-col overflow-hidden rounded-xl" style={{ background: "#FBF7EEE6", boxShadow: "0 1px 0 #0000001F, inset 0 0 0 1px #0F28381F" }}>
                <button type="button" aria-label="키우기" disabled={!z.canIn} onClick={() => z.step(1.8)} className="flex h-10 w-10 items-center justify-center active:bg-[#0F28380F] disabled:opacity-35" data-testid="fishing-chart-in"><LucidePlus weight="bold" className="h-4 w-4" style={{ color: "#0F2838" }} /></button>
                <i aria-hidden className="mx-2 h-px" style={{ background: "#0F28381F" }} />
                <button type="button" aria-label="줄이기" disabled={!z.canOut} onClick={() => z.step(1 / 1.8)} className="flex h-10 w-10 items-center justify-center active:bg-[#0F28380F] disabled:opacity-35" data-testid="fishing-chart-out"><LucideMinus weight="bold" className="h-4 w-4" style={{ color: "#0F2838" }} /></button>
            </div>
            {z.moved && (
                <button type="button" onClick={z.reset} className="absolute right-2.5 top-2.5 h-8 rounded-full px-3 text-[12.5px] font-semibold rk-hit44" style={{ background: "#0F2838E6", color: "#F3ECDD" }} data-testid="fishing-chart-reset">전국 보기</button>
            )}
        </div>
    );
}
