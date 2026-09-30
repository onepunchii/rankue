/**
 * 골프 발자국(2026-09-30 오너: "도장깨기 지도에 발자국 기능 — 내가 어디 구장 순서로 갔는지 귀엽게").
 *
 * 도장(골프장당 하나)을 **처음 간 순서**로 이어 점 지도 위에 걷는 발자국으로 그린다. 화면(FootprintMap)과
 * 공유 카드(server/services/golfFootprintsCard.ts)가 이 파일 하나로 같은 그림을 만든다 — 투영은 shared/golfDotMap.
 *
 * 모든 길이는 **지도 좌표**다. 화면 크기와 무관하게 같은 모양이 나오도록, 호출자는 "화면 1px 이 지도 좌표로 얼마인가"
 * (unit = 틀 너비 / 화면 너비)를 곱해서 넘긴다.
 */
import { KOREA_CORNERS, mapX, mapY, type MapBox } from "./golfDotMap.js";

// ── API 계약 ─────────────────────────────────────────────────────────
export interface FootprintStop {
    /** rankue_golf_clubs.id — 옛 기록(이름만 있는 도장)은 null */
    clubId: string | null;
    name: string;
    /** 골프장 페이지 슬러그(있으면 누를 수 있다) */
    slug: string | null;
    /** 도장깨기 묶음(경기·강원…) */
    region: string | null;
    /** 좌표를 모르면 null — 목록에는 있고 지도에는 없다 */
    lat: number | null;
    lng: number | null;
    /** ISO. 연도를 고르면 **그해** 첫 방문 */
    firstVisitedAt: string;
    lastVisitedAt: string;
    /** 그 기간 라운드 수 */
    visits: number;
    /** 그 기간 베스트(18홀 타수). 모르면 null */
    bestScore: number | null;
}
export interface FootprintsResponse {
    /** 고른 연도(한국 시각). 전체면 null */
    year: number | null;
    /** 발자국이 있는 해(최근 먼저) */
    years: number[];
    /** 그 기간 골프 라운드 수(여권의 '라운드'와 같은 규칙 — 골프장을 모르는 기록도 센다) */
    rounds: number;
    /** 처음 간 순서 */
    stops: FootprintStop[];
}

/** 한국 시각의 연도. 서버(UTC)에서 getFullYear() 를 쓰면 1월 1일 오전 9시 전 라운드가 전년도로 간다. */
export function kstYear(v: Date | string | number): number {
    const d = v instanceof Date ? v : new Date(v);
    return new Date(d.getTime() + 9 * 3600_000).getUTCFullYear();
}

/** 연도 질의값 — 2000~2100 정수만. 나머지(전체·잘못된 값)는 null. */
export function parseFootprintYear(v: unknown): number | null {
    const n = typeof v === "string" && /^\d{4}$/.test(v) ? Number(v) : typeof v === "number" ? v : NaN;
    return Number.isInteger(n) && n >= 2000 && n <= 2100 ? n : null;
}

// ── 틀 ───────────────────────────────────────────────────────────────
type LatLng = { lat: number; lng: number };

/**
 * 틀의 최소 폭 = 전국 틀의 이만큼. 0.6 으로 그려 보니 경기·충청만 다닌 발자국(오너 실제 3곳)이 짧은 구간마다
 * 배지에 먹혀 발자국이 한두 개만 남았다. 0.45 면 한반도 가운데 절반쯤이 보이고 길이 또렷하다(2026-09-30 시안).
 */
export const FOOTPRINT_MIN_SHARE = 0.45;

/** 점들을 감싸는 상자(여백 22%·16%, 최소 44) — CourseDotMap fitBox 와 같은 여백. 이상치는 빼지 않는다. */
function rawBox(pts: readonly LatLng[], aspect: number): MapBox {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of pts) {
        const x = mapX(p.lng), y = mapY(p.lat);
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    let w = Math.max(x1 - x0, 44) * 1.22, h = Math.max(y1 - y0, 44) * 1.16;
    if (w / h > aspect) h = w / aspect; else w = h * aspect;
    return [cx - w / 2, cy - h / 2, w, h];
}

/**
 * 발자국 틀. 방문한 곳을 모두 담되 **전국 틀의 minShare 배보다 작아지지 않게** 한다.
 *
 * 왜: 전국 그대로면 용인·이천만 다닌 사람의 발자국이 손톱만 해진다. 방문한 곳에만 딱 맞추면 한반도 모양이 사라져
 * "어디를 걸었는지"가 안 읽힌다(점 몇 개만 남는다). 그 사이 — 절반쯤 당겨 들어간 틀.
 * 전국 틀 밖으로 삐져나가지 않게 밀어 넣는다(울릉도처럼 틀 밖 도장이 있으면 밀지 않는다 — 도장이 화면 밖으로 나간다).
 * CourseDotMap fitBox 의 '이상치 빼기'는 쓰지 않는다: 빠진 도장(제주 한 곳)이 화면 밖으로 나간다.
 */
export function fitFootprintBox(pts: readonly LatLng[], aspect: number, minShare = FOOTPRINT_MIN_SHARE): MapBox {
    const korea = rawBox(KOREA_CORNERS, aspect);
    if (!pts.length) return korea;
    let [x, y, w, h] = rawBox(pts, aspect);
    const minW = korea[2] * minShare;
    if (w < minW) {
        const cx = x + w / 2, cy = y + h / 2;
        w = minW; h = minW / aspect;
        x = cx - w / 2; y = cy - h / 2;
    }
    if (w <= korea[2] && h <= korea[3]) {
        const cx = Math.min(Math.max(x, korea[0]), korea[0] + korea[2] - w);
        const cy = Math.min(Math.max(y, korea[1]), korea[1] + korea[3] - h);
        const inside = pts.every((p) => {
            const px = mapX(p.lng), py = mapY(p.lat);
            return px > cx + w * 0.04 && px < cx + w * 0.96 && py > cy + h * 0.04 && py < cy + h * 0.96;
        });
        if (inside) { x = cx; y = cy; }
    }
    return [x, y, w, h];
}

// ── 길 ───────────────────────────────────────────────────────────────
export interface Pt { x: number; y: number }
interface Seg { a: Pt; c: Pt; b: Pt }
export interface Trail {
    /** SVG path d — 구간마다 살짝 휜 2차 곡선 */
    d: string;
    /** 촘촘한 표본(발자국 놓기·길이 재기) */
    samples: { x: number; y: number; dx: number; dy: number; s: number }[];
    /** 전체 길이 */
    length: number;
    /** 정류장(도장)이 길 위 어디쯤인가 — 0(출발)~1(도착) */
    stopAt: number[];
}

/**
 * 도장을 순서대로 잇는 길. 곧은 선은 딱딱해서 구간마다 **번갈아 살짝 휜다**(구간 길이의 bend 배).
 * 곡선은 정류장을 반드시 지난다(2차 베지어의 끝점이 정류장).
 */
export function buildTrail(pts: readonly Pt[], bend = 0.16, perSeg = 48): Trail {
    const segs: Seg[] = [];
    for (let i = 0; i + 1 < pts.length; i++) {
        const a = pts[i], b = pts[i + 1];
        const dx = b.x - a.x, dy = b.y - a.y;
        const len = Math.hypot(dx, dy);
        const side = i % 2 === 0 ? 1 : -1;
        const nx = len ? -dy / len : 0, ny = len ? dx / len : 0;
        segs.push({ a, b, c: { x: (a.x + b.x) / 2 + nx * len * bend * side, y: (a.y + b.y) / 2 + ny * len * bend * side } });
    }
    const f = (v: number) => (Math.round(v * 100) / 100).toString();
    const d = segs.length
        ? `M${f(segs[0].a.x)},${f(segs[0].a.y)}` + segs.map((sg) => ` Q${f(sg.c.x)},${f(sg.c.y)} ${f(sg.b.x)},${f(sg.b.y)}`).join("")
        : "";
    const samples: Trail["samples"] = [];
    const stopS: number[] = [0];
    let s = 0;
    let prev: Pt | null = null;
    for (const sg of segs) {
        for (let k = prev ? 1 : 0; k <= perSeg; k++) {
            const t = k / perSeg, u = 1 - t;
            const x = u * u * sg.a.x + 2 * u * t * sg.c.x + t * t * sg.b.x;
            const y = u * u * sg.a.y + 2 * u * t * sg.c.y + t * t * sg.b.y;
            // 접선(미분) — 발자국이 길 방향을 보게
            const dx = 2 * u * (sg.c.x - sg.a.x) + 2 * t * (sg.b.x - sg.c.x);
            const dy = 2 * u * (sg.c.y - sg.a.y) + 2 * t * (sg.b.y - sg.c.y);
            if (prev) s += Math.hypot(x - prev.x, y - prev.y);
            samples.push({ x, y, dx, dy, s });
            prev = { x, y };
        }
        stopS.push(s);
    }
    const length = s;
    return { d, samples, length, stopAt: stopS.map((v) => (length ? v / length : 0)) };
}

export interface FootMark {
    x: number; y: number;
    /** 길 방향(도, SVG 기준 — 0 = 오른쪽) */
    angle: number;
    /** 1 = 오른발, -1 = 왼발 */
    side: 1 | -1;
    /** 길 위 위치 0~1 — 순서대로 나타나게(애니메이션 지연)·색 섞기에 쓴다 */
    t: number;
}

/**
 * 길을 따라 발자국을 찍는다 — 일정한 보폭(spacing), 좌우 번갈아(stride 만큼 옆으로).
 * 정류장 둘레(clear 안)는 비운다: 번호 배지 밑에 깔리면 지저분하다.
 */
export function placeFootprints(trail: Trail, stops: readonly Pt[], spacing: number, stride: number, clear: number): FootMark[] {
    const out: FootMark[] = [];
    if (!trail.samples.length || trail.length <= 0 || spacing <= 0) return out;
    let side: 1 | -1 = -1;
    let j = 0;
    // 첫 발은 반 보 뒤에서 — 출발 배지에 바로 붙지 않게
    for (let target = spacing / 2; target < trail.length; target += spacing) {
        while (j + 1 < trail.samples.length && trail.samples[j + 1].s < target) j++;
        const p = trail.samples[j], q = trail.samples[Math.min(j + 1, trail.samples.length - 1)];
        const span = q.s - p.s;
        const k = span > 0 ? (target - p.s) / span : 0;
        const x = p.x + (q.x - p.x) * k, y = p.y + (q.y - p.y) * k;
        const dx = p.dx + (q.dx - p.dx) * k, dy = p.dy + (q.dy - p.dy) * k;
        const len = Math.hypot(dx, dy) || 1;
        if (stops.some((st) => Math.hypot(st.x - x, st.y - y) < clear)) continue;
        side = side === 1 ? -1 : 1;
        // 진행 방향의 오른쪽 = (-dy, dx) (SVG 는 y 가 아래로 자란다)
        const nx = -dy / len, ny = dx / len;
        out.push({ x: x + nx * stride * side, y: y + ny * stride * side, angle: (Math.atan2(dy, dx) * 180) / Math.PI, side, t: target / trail.length });
    }
    return out;
}

/**
 * 발 한 짝(오른발) — 발끝이 위(-y), 지도 좌표 1 = 화면 1px 기준 길이 약 12.
 * 오른발은 엄지가 안쪽(왼쪽, -x). 왼발은 좌우로 뒤집어(scale(-1,1)) 쓴다.
 * 👣 이모지 대신 그림으로: 이모지는 기기마다 모양·색이 다르고, 공유 카드(서버)에는 이모지 글꼴이 없다.
 */
export const FOOT = {
    sole: "M-1.3,-3.3 C0.7,-3.9 2.8,-3.1 2.9,-1.0 C3.0,0.9 2.2,2.0 2.1,3.5 C2.0,5.3 1.2,6.3 0,6.3 C-1.4,6.3 -2.1,5.3 -2.0,3.9 C-1.9,2.5 -1.1,1.5 -1.4,0.2 C-1.8,-1.1 -2.9,-2.7 -1.3,-3.3 Z",
    toes: [
        [-1.25, -5.15, 1.1],
        [0.45, -5.6, 0.74],
        [1.62, -5.2, 0.64],
        [2.5, -4.42, 0.54],
        [3.08, -3.45, 0.46],
    ] as const,
};

/**
 * 번호 배지가 겹치지 않게 살짝 떼어 놓는다(용인·이천처럼 골프장이 붙어 있으면 ①②④가 한 덩어리가 된다).
 * 서로 밀어내기를 몇 번 되풀이할 뿐이라 결과가 늘 같다(새로고침해도 배지가 춤추지 않는다).
 * 원래 자리는 길이 지나는 곳이라 그대로 두고, 밀려난 배지에서 원래 자리까지 가는 선을 호출자가 긋는다.
 */
export function spreadBadges(pts: readonly Pt[], minDist: number, iters = 48): Pt[] {
    const out = pts.map((p) => ({ x: p.x, y: p.y }));
    for (let it = 0; it < iters; it++) {
        let moved = false;
        for (let i = 0; i < out.length; i++) {
            for (let j = i + 1; j < out.length; j++) {
                let dx = out[j].x - out[i].x, dy = out[j].y - out[i].y;
                let d = Math.hypot(dx, dy);
                if (d >= minDist) continue;
                // 완전히 같은 자리면 번호로 정한 방향으로 — 무작위를 쓰면 그릴 때마다 달라진다
                if (d < 1e-6) { const a = (j * 2.399) % (2 * Math.PI); dx = Math.cos(a); dy = Math.sin(a); d = 1; }
                const push = (minDist - d) / 2 + 1e-3;
                const ux = dx / d, uy = dy / d;
                out[i].x -= ux * push; out[i].y -= uy * push;
                out[j].x += ux * push; out[j].y += uy * push;
                moved = true;
            }
        }
        if (!moved) break;
    }
    return out;
}

/** 두 색(#RRGGBB)을 t(0~1) 만큼 섞는다 — 오래된 발자국은 라임, 최근 발자국은 주황. */
export function mixHex(a: string, b: string, t: number): string {
    const p = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
    const k = Math.min(1, Math.max(0, t));
    const c = [0, 1, 2].map((i) => Math.round(p(a, i) + (p(b, i) - p(a, i)) * k));
    return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * 지도 위 흐린 지역 이름 — 여권 묶음(지역 정복 지도와 같은 여섯 이름), 대략 그 묶음 골프장들의 가운데.
 * 왜: 발자국 틀은 절반쯤 당겨 들어가 있어 점만으로는 "여기가 어디쯤"인지 안 읽힌다(2026-09-30 시안). 이름 몇 개면 된다.
 * 배지와 겹치는 이름은 호출자가 뺀다(labelsClear).
 */
export const REGION_LABELS = [
    { name: "경기", lat: 37.55, lng: 127.2 },
    { name: "강원", lat: 37.72, lng: 128.35 },
    { name: "충청", lat: 36.62, lng: 127.25 },
    { name: "전라", lat: 35.25, lng: 126.95 },
    { name: "경상", lat: 35.95, lng: 128.7 },
    { name: "제주", lat: 33.38, lng: 126.55 },
] as const;

/**
 * 틀 안에 있고 배지(r 안)·발자국(가로 ±halfW, 세로 ±halfH 안)과 겹치지 않는 지역 이름 — 지도 좌표.
 * 발자국이 글자 위를 지나가면 둘 다 지저분해진다(2026-09-30 시안: '충청'·'전라'가 발자국에 먹혔다) — 그 이름은 뺀다.
 */
export function labelsClear(
    box: MapBox, badges: readonly Pt[], r: number,
    marks: readonly Pt[] = [], halfW = 0, halfH = 0,
): { name: string; x: number; y: number }[] {
    const [bx, by, bw, bh] = box;
    return REGION_LABELS.map((l) => ({ name: l.name, x: mapX(l.lng), y: mapY(l.lat) }))
        .filter((l) => l.x > bx + bw * 0.08 && l.x < bx + bw * 0.92 && l.y > by + bh * 0.05 && l.y < by + bh * 0.95)
        .filter((l) => badges.every((b) => Math.hypot(b.x - l.x, b.y - l.y) > r))
        .filter((l) => marks.every((m) => Math.abs(m.x - l.x) > halfW || Math.abs(m.y - l.y) > halfH));
}

/** 화면·카드가 같이 쓰는 색 */
export const FOOT_COLORS = { old: "#8BE84A", recent: "#FF8A3D", stop: "#64DD17", stopInk: "#051907", latest: "#FF8A3D" } as const;

/**
 * 처음 간 순서대로 골프장을 이은 **직선거리 합**(km, 반올림). 실제로 이동한 거리가 아니다 — 화면에는
 * "이으면 N km" 로만 적는다(지어낸 숫자가 되지 않게). 좌표 없는 곳은 건너뛴다.
 */
export function trailKm(stops: readonly { lat: number | null; lng: number | null }[]): number {
    const pts = stops.filter((s) => s.lat != null && s.lng != null) as { lat: number; lng: number }[];
    let km = 0;
    const rad = Math.PI / 180;
    for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
        const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
        km += 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(x)));
    }
    return Math.round(km);
}

/** 지도에 놓을 수 있는 정류장만(좌표가 있는 것) — 번호는 원래 순서(1부터)를 그대로 가진다. */
export function placedStops<T extends { lat: number | null; lng: number | null }>(stops: readonly T[]): (T & { n: number; x: number; y: number; lat: number; lng: number })[] {
    const out: (T & { n: number; x: number; y: number; lat: number; lng: number })[] = [];
    stops.forEach((s, i) => {
        if (s.lat == null || s.lng == null || !Number.isFinite(s.lat) || !Number.isFinite(s.lng)) return;
        out.push({ ...s, n: i + 1, x: mapX(s.lng), y: mapY(s.lat), lat: s.lat, lng: s.lng });
    });
    return out;
}
