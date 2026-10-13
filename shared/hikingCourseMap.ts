/**
 * 등산 — 코스 지도의 셈(2026-10-13). 오너: "지도를 연결해서 내 위치가 어디이고 코스가 어디 있는지 … 우리 자료로 그리는 지도, 디테일 신경 써 줘."
 *
 * 바깥 지도(지도 회사의 조각 그림)를 쓰지 않는다 — 우리가 가진 코스 선 · 길 위의 지점 · 정상 자리로 종이 지도 한 장을 그린다.
 *   · 산에서는 신호가 약하다. 이 지도는 산 화면을 한 번 열면 받아 둔 자료만으로 그려져, 신호가 끊겨도 보인다.
 *   · 내 위치는 이 기기에서만 찍는다(서버로 가지 않는다 — client/src/hiking/lib/useMyLocation · trail/useTrail).
 *
 * 그림의 단위는 km 다 — 가운데(lat0 · lng0)에서 동쪽이 +x, **남쪽이 +y**(화면의 아래). 산 하나의 넓이(수십 km)에서는 평면으로 펴도 어긋남이 몇 m 다.
 * 순수 값과 함수만. ⚠️ 서버가 임포트할 수 있는 shared 파일 — 상대 임포트는 반드시 './x.js'.
 */
import { bearingDeg, compass8, nearKmText } from "./hikingNear.js";
import type { LinePoint } from "./hikingGeo.js";

export interface KmBox { x: number; y: number; w: number; h: number }
export interface CourseMapFrame { lat0: number; lng0: number; cos: number; /** 가장 넓게 볼 수 있는 상자(코스 전부 + 정상 + 여백) — 이 밖으로는 나가지 않는다 */ home: KmBox }

const KM_PER_LAT = 110.57;
const KM_PER_LNG = 111.32;
/** 그림 칸의 비(세로 ÷ 가로) — 휴대폰 폭에서 한 손으로 보기 좋은 살짝 긴 네모 */
export const COURSE_MAP_ASPECT = 1.08;
/** 처음 그림의 여백 — 긴 변의 이만큼, 적어도 이만큼(km) */
export const COURSE_MAP_PAD = 0.1;
export const COURSE_MAP_PAD_MIN_KM = 0.12;
/** 정상이 코스 묶음에서 이보다 멀면 처음 그림에 넣지 않는다(점봉산 — 걸을 수 있는 길이 정상에서 2km 다. 그보다 멀면 길이 콩알만 해진다) */
export const COURSE_MAP_SUMMIT_REACH_KM = 3;
/** 가장 크게 — 보이는 너비가 이만큼(km)일 때까지. 갈림길 하나하나가 갈린다 */
export const COURSE_MAP_MIN_VIEW_KM = 0.3;
/** 고른 코스로 당겨 들어간 그림의 여백(긴 변의 몫) */
export const COURSE_MAP_FOCUS_PAD = 0.16;

export const toKmXY = (f: Pick<CourseMapFrame, "lat0" | "lng0" | "cos">, lat: number, lng: number): [number, number] =>
    [(lng - f.lng0) * KM_PER_LNG * f.cos, -(lat - f.lat0) * KM_PER_LAT];

/** 코스 선들(과 정상) → 지도의 틀. 그릴 점이 없으면 null */
export function courseMapFrame(lines: readonly (readonly LinePoint[])[], summit?: { lat: number; lng: number } | null, aspect: number = COURSE_MAP_ASPECT): CourseMapFrame | null {
    let la0 = Infinity, la1 = -Infinity, lo0 = Infinity, lo1 = -Infinity, n = 0;
    for (const l of lines) for (const p of l) {
        if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) continue;
        if (p[0] < la0) la0 = p[0]; if (p[0] > la1) la1 = p[0]; if (p[1] < lo0) lo0 = p[1]; if (p[1] > lo1) lo1 = p[1];
        n++;
    }
    if (n < 2) return null;
    const cos0 = Math.cos((((la0 + la1) / 2) * Math.PI) / 180);
    if (summit && Number.isFinite(summit.lat) && Number.isFinite(summit.lng)) {
        // 정상이 코스 묶음의 상자에서 얼마나 떨어져 있나(km) — 가까우면 그림에 넣는다
        const dy = Math.max(0, la0 - summit.lat, summit.lat - la1) * KM_PER_LAT, dx = Math.max(0, lo0 - summit.lng, summit.lng - lo1) * KM_PER_LNG * cos0;
        if (Math.hypot(dx, dy) <= COURSE_MAP_SUMMIT_REACH_KM) { la0 = Math.min(la0, summit.lat); la1 = Math.max(la1, summit.lat); lo0 = Math.min(lo0, summit.lng); lo1 = Math.max(lo1, summit.lng); }
    }
    const f = { lat0: (la0 + la1) / 2, lng0: (lo0 + lo1) / 2, cos: Math.cos((((la0 + la1) / 2) * Math.PI) / 180) };
    const [x0, y1] = toKmXY(f, la0, lo0), [x1, y0] = toKmXY(f, la1, lo1);
    let w = x1 - x0, h = y1 - y0;
    const pad = Math.max(Math.max(w, h) * COURSE_MAP_PAD, COURSE_MAP_PAD_MIN_KM);
    w += pad * 2; h += pad * 2;
    // 그림 칸의 비에 맞춰 모자란 쪽을 넓힌다(길쭉한 능선이 잘리지 않게)
    if (h / w < aspect) h = w * aspect; else w = h / aspect;
    return { ...f, home: { x: -w / 2, y: -h / 2, w, h } };
}

/** 상자를 가장 넓은 그림 안에 가둔다 — 그보다 커지지 않고, 밖으로 나가지 않고, minW 보다 좁아지지 않는다 */
export function clampKmBox(b: KmBox, home: KmBox, minW: number = COURSE_MAP_MIN_VIEW_KM): KmBox {
    const w = Math.min(home.w, Math.max(Math.min(home.w, minW), b.w)), h = w * (home.h / home.w);
    return { w, h, x: Math.min(home.x + home.w - w, Math.max(home.x, b.x)), y: Math.min(home.y + home.h - h, Math.max(home.y, b.y)) };
}

/**
 * 처음 보이는 상자 — **고른 코스**(와 가까운 정상)에 맞춘다. 산의 코스 전부에 맞추면 코스가 수십 개인 산(북한산 36)에서 고른 길이 실처럼 가늘어진다.
 * 넓게 보려면 줄이면 된다(가장 넓은 그림 = frame.home).
 */
export function focusBox(f: CourseMapFrame, line: readonly LinePoint[], summit?: { lat: number; lng: number } | null): KmBox {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    const take = (lat: number, lng: number) => { const [x, y] = toKmXY(f, lat, lng); if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; };
    for (const p of line) if (Number.isFinite(p[0]) && Number.isFinite(p[1])) take(p[0], p[1]);
    if (!Number.isFinite(x0)) return f.home;
    if (summit) {
        const [sx, sy] = toKmXY(f, summit.lat, summit.lng);
        // 정상이 이 코스에서 가까우면(코스 긴 변의 절반 안) 같이 담는다 — 정상을 지나지 않는 코스도 정상이 어느 쪽인지 보인다
        const reach = Math.max(x1 - x0, y1 - y0, 0.6) * 0.5;
        if (sx >= x0 - reach && sx <= x1 + reach && sy >= y0 - reach && sy <= y1 + reach) take(summit.lat, summit.lng);
    }
    let w = x1 - x0, h = y1 - y0;
    const pad = Math.max(Math.max(w, h) * COURSE_MAP_FOCUS_PAD, COURSE_MAP_PAD_MIN_KM);
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, aspect = f.home.h / f.home.w;
    w += pad * 2; h += pad * 2;
    if (h / w < aspect) h = w * aspect; else w = h / aspect;
    return clampKmBox({ x: cx - w / 2, y: cy - h / 2, w, h }, f.home);
}

/**
 * 선을 끊을 자리 — 앞 점에서 갑자기 멀리 건너뛴 점의 차례 번호들. 옛 묶음(전국 주요 봉우리 코스)의 코스 가운데에는 구간 여럿을
 * 한 줄로 이어 붙여 직선으로 건너뛰는 것이 있다 — 지도에서는 그 자리에서 선을 끊어 그린다(없는 길을 긋지 않는다).
 */
export function lineBreaks(line: readonly LinePoint[]): number[] {
    if (line.length < 3) return [];
    const steps: number[] = [];
    for (let i = 1; i < line.length; i++) steps.push(Math.max(0, line[i][3] - line[i - 1][3]));
    const sorted = [...steps].sort((a, b) => a - b), median = sorted[Math.floor(sorted.length / 2)] || 0;
    const limit = Math.max(0.45, median * 6);
    const out: number[] = [];
    steps.forEach((s, i) => { if (s > limit) out.push(i + 1); });
    return out;
}

const SCALE_STEPS_KM = [20, 10, 5, 2, 1, 0.5, 0.2, 0.1, 0.05, 0.02] as const;
/** 축척 막대의 길이(km) — 보이는 너비의 3분의 1을 넘지 않는 가장 긴 깔끔한 수 */
export function scaleBarKm(viewWKm: number): number {
    return SCALE_STEPS_KM.find((s) => s <= viewWKm / 3) ?? SCALE_STEPS_KM[SCALE_STEPS_KM.length - 1];
}
/** 축척 막대의 글 — "500m" · "2km" */
export const scaleBarText = (km: number): string => (km < 1 ? `${Math.round(km * 1000)}m` : `${km}km`);

/** 정상을 감싸는 거리 고리(km) — 보이는 너비에 맞춰 두세 개. "정상에서 1km" */
export function summitRingsKm(viewWKm: number): number[] {
    const step = scaleBarKm(viewWKm * 1.2);
    return [step, step * 2, step * 3];
}

export interface HereOnMap {
    /** 처음 그림의 상자 안인가 — 밖이면 점을 그리지 않고 안내 한 줄을 적는다 */
    inside: boolean;
    x: number; y: number;
    /** 밖일 때의 안내 — "내 위치는 지도 밖 · 북동쪽 12km". 안이면 null */
    note: string | null;
}
/** 내 위치를 지도에 놓는다. 자리가 없으면 null */
export function hereOnMap(f: CourseMapFrame, here: { lat: number; lng: number } | null | undefined): HereOnMap | null {
    if (!here || !Number.isFinite(here.lat) || !Number.isFinite(here.lng)) return null;
    const [x, y] = toKmXY(f, here.lat, here.lng), h = f.home;
    const inside = x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h;
    if (inside) return { inside, x, y, note: null };
    const km = Math.hypot(x, y);
    // 지도의 가운데에서 내 쪽을 본 방향
    return { inside, x, y, note: `내 위치는 지도 밖 · ${compass8(bearingDeg(f.lat0, f.lng0, here.lat, here.lng))}쪽 ${nearKmText(km)}` };
}

/**
 * 내 위치가 가장 넓은 그림 안이지만 **지금 보는 그림 밖**일 때의 한 줄 — 보는 그림의 가운데에서 본 방향과 거리.
 * dx · dy 는 km(동쪽 +, 남쪽 +). 가장자리의 화살표는 떠 있는 단추에 가릴 수 있어 글로도 적는다.
 */
export function offViewNote(dxKm: number, dyKm: number): string {
    const deg = (Math.atan2(dxKm, -dyKm) * 180) / Math.PI;
    return `내 위치는 지금 보는 그림 밖 · ${compass8(deg)}쪽 ${nearKmText(Math.hypot(dxKm, dyKm))} — '내 위치'를 누르면 그리로 가요`;
}

/** 내 위치로 당겨 들어간 상자 — 보이는 너비가 이만큼(km)이 되게, 처음 그림 안에서 */
export const COURSE_MAP_HERE_VIEW_KM = 1.2;
export function boxAround(f: CourseMapFrame, x: number, y: number, viewWKm: number = COURSE_MAP_HERE_VIEW_KM): KmBox {
    const w = Math.min(f.home.w, viewWKm), h = w * (f.home.h / f.home.w);
    return clampKmBox({ w, h, x: x - w / 2, y: y - h / 2 }, f.home, Math.min(viewWKm, COURSE_MAP_MIN_VIEW_KM));
}

/** 지도에 이름표를 다는 지점의 종류 — 걷는 사람이 지도에서 찾는 것. 갈림길 · 쉼터 · 표지는 수가 많아 점만 */
export const COURSE_MAP_LABEL_KINDS: readonly string[] = ["ENTRY", "PARK", "BUS", "TOILET", "WATER", "SHELTER", "VIEW", "PEAK", "DANGER"];
/** 지도에 점으로 그리는 종류(위 + 갈림길) */
export const COURSE_MAP_DOT_KINDS: readonly string[] = [...COURSE_MAP_LABEL_KINDS, "SIGN"];

/** 글의 너비(px) 어림 — 한글은 글자 크기만큼, 숫자 · 영문은 그 0.58배 */
export const labelPx = (s: string, fontPx = 12): number => Array.from(s).reduce((w, ch) => w + (/[\u1100-\uFFDC]/.test(ch) ? fontPx : fontPx * 0.58), 0);
export interface PxRect { x0: number; y0: number; x1: number; y1: number }
/**
 * 이름표가 겹치지 않게 고른다 — 앞에 놓인 이름표(와 미리 막아 둔 자리 taken)와 겹치면 건너뛴다. 먼저 온 것이 이긴다(중요한 것부터 넘긴다).
 * x · y 는 글의 왼쪽 가운데(px), w 는 글의 너비. keep 이면 겹쳐도 그린다(나 · 정상 · 출발). 돌려주는 것은 이름표를 달 것의 차례 번호들.
 */
export function pickLabels(spots: readonly { x: number; y: number; w: number; keep?: boolean }[], taken: readonly PxRect[] = [], linePx = 16, max = 22): number[] {
    const kept: PxRect[] = [...taken], out: number[] = [];
    for (let i = 0; i < spots.length && out.length < max; i++) {
        const s = spots[i];
        const box = { x0: s.x - 2, x1: s.x + s.w + 2, y0: s.y - linePx / 2, y1: s.y + linePx / 2 };
        if (!s.keep && kept.some((k) => box.x0 < k.x1 && box.x1 > k.x0 && box.y0 < k.y1 && box.y1 > k.y0)) continue;
        kept.push(box); out.push(i);
    }
    return out;
}

export const COURSE_MAP_COPY = {
    title: "코스 지도",
    aside: "위가 북쪽 · 참고용",
    hint: "두 손가락으로 키워 보세요",
    reset: "처음 크기로",
    wide: "산 전체 보기",
    here: "내 위치",
    hereAsk: "내 위치 보기",
    hereAsking: "위치 받는 중…",
    hereNote: "내 위치는 이 기기에서만 찍어요.",
    others: "옅은 선은 이 산의 다른 코스 — 누르면 그 코스로 바뀌어요",
    source: "코스 선 · 지점: 산림청 · 한국등산트레킹지원센터. 지도는 랭큐가 그린 그림이에요(실제 길과 다를 수 있어요).",
} as const;
