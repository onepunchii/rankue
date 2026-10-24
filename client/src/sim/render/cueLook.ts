/**
 * 상대 · 공 꾸미기를 두 렌더러가 그리는 법(2026-10-24 — 모양은 shared/cueStyles, 받는 조건은 shared/cueCase).
 * 겉모습만 바뀐다 — 큐 길이 · 굵기 · 공 크기 · 물리는 그대로다. 흰 공 · 노란 공의 바탕색도 그대로(점 무늬 · 마감만).
 *
 *  - paintShaftMap: 3D 상대 원통에 감을 질감. 캔버스 위 = 이음쇠 쪽, 아래 = 팁 쪽(원통의 +y 가 이음쇠).
 *  - paintBallSkinMap: 3D 공의 등거리 원통 질감. 점 자리(적도 넷 · 극 둘)는 기본 공과 같고, 모양은 점마다 접평면에 투영해 찍는다
 *    (극에서도 별 · 하트가 찌그러지지 않는다). 2D 캔버스가 없으면(시험 환경) false — 부르는 쪽이 기본 공으로 남는다.
 *  - drawDotShape: 점 하나의 모양 — 3D 마스크와 2D 공 가운데 표시가 같이 쓴다.
 */
import { RAINBOW_DOTS, type BallDotShape, type BallStyle, type ShaftStyle } from "@shared/cueStyles";
import { parseColor, rgba, type RGBA } from "./tokens";

/** 기본 점의 각반지름(rad) — ThreeRenderer 의 DOT_ANGLE 과 같다(지름 10 mm 남짓) */
export const SKIN_DOT_ANGLE = 0.16;
/** 모양 점(별 · 하트 …)은 조금 크게 — 작으면 동그라미와 구별이 안 된다 */
export const SKIN_SHAPE_ANGLE = 0.22;
/** 이음쇠 쪽 고리 띠 — 상대 길이에 대한 자리 · 두께(큐 케이스 그림 shared/cueStyleArt 와 같은 비율) */
export const SHAFT_RINGS: readonly (readonly [number, number])[] = [[0.042, 0.0042], [0.061, 0.0084], [0.08, 0.0042]];

const hex = (s: string, fallback: RGBA): RGBA => parseColor(s) ?? fallback;

/** 점 하나 — 가운데 (cx, cy), 반지름 r. ink = 점 색, detail = 지구 점의 흰 선 색 */
export function drawDotShape(ctx: CanvasRenderingContext2D, shape: BallDotShape, cx: number, cy: number, r: number, ink: string, detail = "#FFFFFF"): void {
    ctx.fillStyle = ink;
    ctx.strokeStyle = ink;
    const poly = (pts: readonly (readonly [number, number])[]) => {
        ctx.beginPath();
        pts.forEach(([x, y], i) => (i ? ctx.lineTo(cx + x * r, cy + y * r) : ctx.moveTo(cx + x * r, cy + y * r)));
        ctx.closePath();
        ctx.fill();
    };
    switch (shape) {
        case "star": {
            const pts: [number, number][] = [];
            for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, k = i % 2 ? 0.45 : 1.15; pts.push([Math.cos(a) * k, Math.sin(a) * k]); }
            poly(pts);
            return;
        }
        case "ring":
            ctx.beginPath();
            ctx.arc(cx, cy, r * 0.78, 0, Math.PI * 2);
            ctx.lineWidth = Math.max(1, r * 0.42);
            ctx.stroke();
            return;
        case "heart":
            ctx.beginPath();
            ctx.moveTo(cx, cy + r * 0.95);
            ctx.bezierCurveTo(cx - r * 1.5, cy - r * 0.1, cx - r * 0.9, cy - r * 1.25, cx, cy - r * 0.45);
            ctx.bezierCurveTo(cx + r * 0.9, cy - r * 1.25, cx + r * 1.5, cy - r * 0.1, cx, cy + r * 0.95);
            ctx.closePath();
            ctx.fill();
            return;
        case "five":
            for (const [x, y] of [[0, 0], [-0.62, -0.62], [0.62, -0.62], [-0.62, 0.62], [0.62, 0.62]] as const) {
                ctx.beginPath();
                ctx.arc(cx + x * r, cy + y * r, r * 0.34, 0, Math.PI * 2);
                ctx.fill();
            }
            return;
        case "globe":
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = detail;
            ctx.lineWidth = Math.max(0.6, r * 0.14);
            ctx.beginPath();
            ctx.ellipse(cx, cy, r * 0.45, r, 0, 0, Math.PI * 2);
            ctx.moveTo(cx - r, cy);
            ctx.lineTo(cx + r, cy);
            ctx.stroke();
            return;
        case "crown":
            poly([[-1, 0.7], [-1, -0.45], [-0.5, 0.05], [0, -0.8], [0.5, 0.05], [1, -0.45], [1, 0.7]]);
            return;
        default:
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.fill();
    }
}

/** 점 i 번째의 색(적도 넷 → 극 둘 차례). 'default' 는 기본 공의 점 색 */
export function skinDotColor(st: BallStyle, i: number, defaultDot: RGBA): RGBA {
    if (st.dot === "rainbow") return hex(RAINBOW_DOTS[i % RAINBOW_DOTS.length], defaultDot);
    if (st.dot === "default") return defaultDot;
    return hex(st.dot, defaultDot);
}

/** 상대 질감 — w = 둘레, h = 길이(위 = 이음쇠). 원통 둘레로 이어지게 세로 결만 쓴다 */
export function paintShaftMap(ctx: CanvasRenderingContext2D, w: number, h: number, st: ShaftStyle): void {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (st.fade) {
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, st.fade[0]);
        g.addColorStop(1, st.fade[1]);
        ctx.fillStyle = g;
    } else ctx.fillStyle = st.base;
    ctx.fillRect(0, 0, w, h);
    if (st.grain && st.finish === "wood") {
        // 나뭇결 — 길이 방향의 가는 줄(자리는 고정된 순서로 — 매번 같은 큐)
        ctx.strokeStyle = st.grain;
        ctx.globalAlpha = 0.5;
        ctx.lineWidth = 1;
        for (let k = 0; k < 9; k++) {
            const x = ((k * 37) % w) + 0.5;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.bezierCurveTo(x + 2, h * 0.3, x - 2, h * 0.6, x + ((k % 3) - 1), h);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
    }
    if (st.grain && st.finish === "carbon") {
        // 카본 짜임 — 4px 칸이 엇갈린다
        ctx.fillStyle = st.grain;
        ctx.globalAlpha = 0.6;
        for (let y = 0; y < h; y += 4) for (let x = ((y / 4) % 2) * 4; x < w; x += 8) ctx.fillRect(x, y, 4, 4);
        ctx.globalAlpha = 1;
    }
    if (st.ring) {
        ctx.fillStyle = st.ring;
        for (const [at, th] of SHAFT_RINGS) ctx.fillRect(0, at * h, w, Math.max(1.5, th * h));
    }
}

const MASK = 64;
/** 마스크는 [-1.2, 1.2] 의 모양 단위(별이 1.15 까지 뻗는다) */
const MASK_SPAN = 1.2;

/** 모양 마스크(검정 = 점 색, 흰 = 지구 선) — 같은 모양은 한 번만 만든다 */
const masks = new Map<string, Uint8ClampedArray | null>();
function shapeMask(shape: BallDotShape, createCanvas: () => HTMLCanvasElement): Uint8ClampedArray | null {
    if (masks.has(shape)) return masks.get(shape)!;
    let data: Uint8ClampedArray | null = null;
    try {
        const c = createCanvas();
        c.width = MASK;
        c.height = MASK;
        const ctx = c.getContext("2d");
        if (ctx) {
            drawDotShape(ctx, shape, MASK / 2, MASK / 2, MASK / 2 / MASK_SPAN, "#000000", "#FFFFFF");
            data = ctx.getImageData(0, 0, MASK, MASK).data;
        }
    } catch { data = null; }
    masks.set(shape, data);
    return data;
}

/**
 * 공 질감(등거리 원통). 텍셀 (i, j) → 경도 φ = u·2π, 극각 θ = v·π(캔버스 위 = 로컬 +y 극) — SphereGeometry 와 flipY 질감의 짝.
 * 점 여섯: 적도 φ = 0 · ½π · π · 3/2π, 극 θ = 0 · π(기본 공의 paintBallMap 과 같은 자리).
 */
export function paintBallSkinMap(ctx: CanvasRenderingContext2D, w: number, h: number, base: RGBA, st: BallStyle, defaultDot: RGBA, createCanvas: () => HTMLCanvasElement): boolean {
    const mask = shapeMask(st.shape, createCanvas);
    if (!mask) return false;
    let img: ImageData;
    try { img = ctx.createImageData(w, h); } catch { return false; }
    const out = img.data;
    const ang = st.shape === "dot" ? SKIN_DOT_ANGLE : SKIN_SHAPE_ANGLE;
    const tanA = Math.tan(ang);
    const cosMax = Math.cos(Math.atan(tanA * MASK_SPAN * 1.42));
    // 점의 가운데 c 와 접평면의 두 축(e1 = 가로, e2 = 위 쪽). 로컬 좌표: x = −cosφ sinθ, y = cosθ, z = sinφ sinθ
    const centers: { c: readonly number[]; e1: readonly number[]; e2: readonly number[]; ink: RGBA }[] = [];
    for (let k = 0; k < 4; k++) {
        const p = (k * Math.PI) / 2;
        centers.push({ c: [-Math.cos(p), 0, Math.sin(p)], e1: [Math.sin(p), 0, Math.cos(p)], e2: [0, 1, 0], ink: skinDotColor(st, k, defaultDot) });
    }
    centers.push({ c: [0, 1, 0], e1: [1, 0, 0], e2: [0, 0, 1], ink: skinDotColor(st, 4, defaultDot) });
    centers.push({ c: [0, -1, 0], e1: [1, 0, 0], e2: [0, 0, -1], ink: skinDotColor(st, 5, defaultDot) });
    const [br, bg, bb] = base;
    for (let j = 0; j < h; j++) {
        const th = ((j + 0.5) / h) * Math.PI;
        const st0 = Math.sin(th), ct = Math.cos(th);
        for (let i = 0; i < w; i++) {
            const ph = ((i + 0.5) / w) * Math.PI * 2;
            const dx = -Math.cos(ph) * st0, dy = ct, dz = Math.sin(ph) * st0;
            let r = br, g = bg, b = bb;
            // 마감 — 바탕색 계열은 지킨다(살짝 결 · 빛만)
            if (st.finish === "carbon") {
                if (((i >> 2) + (j >> 2)) & 1) { r *= 0.9; g *= 0.9; b *= 0.9; }
            } else if (st.finish === "marble") {
                const n = Math.sin(ph * 3 + 4 * Math.sin(th * 2.3) + th * 5);
                const vein = Math.exp(-n * n * 40) * 0.4;
                r += (138 - r) * vein; g += (143 - g) * vein; b += (152 - b) * vein;
            } else if (st.finish === "pearl") {
                const t = 0.5 + 0.5 * Math.sin(ph * 2 + th * 3);
                const a = 0.16;
                r += ((245 * t + 191 * (1 - t)) - r) * a; g += ((198 * t + 216 * (1 - t)) - g) * a; b += ((224 * t + 245 * (1 - t)) - b) * a;
            }
            for (let k = 0; k < centers.length; k++) {
                const m = centers[k];
                const dot = dx * m.c[0] + dy * m.c[1] + dz * m.c[2];
                if (dot < cosMax) continue;
                const mx = (dx * m.e1[0] + dy * m.e1[1] + dz * m.e1[2]) / dot / tanA;
                const my = -(dx * m.e2[0] + dy * m.e2[1] + dz * m.e2[2]) / dot / tanA;
                const pi = Math.floor(((mx / MASK_SPAN + 1) / 2) * MASK), pj = Math.floor(((my / MASK_SPAN + 1) / 2) * MASK);
                if (pi < 0 || pj < 0 || pi >= MASK || pj >= MASK) continue;
                const o = (pj * MASK + pi) * 4;
                const a = mask[o + 3] / 255;
                if (a <= 0) continue;
                const white = mask[o] / 255;
                const ir = m.ink[0] + (255 - m.ink[0]) * white, ig = m.ink[1] + (255 - m.ink[1]) * white, ib = m.ink[2] + (255 - m.ink[2]) * white;
                r += (ir - r) * a; g += (ig - g) * a; b += (ib - b) * a;
                break;
            }
            const o = (j * w + i) * 4;
            out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = 255;
        }
    }
    ctx.putImageData(img, 0, 0);
    return true;
}

/** 2D(위에서 본 공) — 가운데에 점 하나를 찍어 꾸민 공을 알아보게. 마감은 빛 한 겹 */
export function paintBallSkinMark(ctx: CanvasRenderingContext2D, cx: number, cy: number, R: number, st: BallStyle, defaultDot: RGBA): void {
    if (st.finish === "pearl" || st.finish === "chrome") {
        const g = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.35, 0, cx, cy, R);
        // 바탕색(흰 공 · 노란 공)이 갈려 보이는 것이 먼저 — 빛은 옅게
        g.addColorStop(0, st.finish === "chrome" ? "rgba(255,255,255,0.7)" : "rgba(245,198,224,0.18)");
        g.addColorStop(1, st.finish === "chrome" ? "rgba(0,0,0,0.14)" : "rgba(191,216,245,0.14)");
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.fill();
    }
    drawDotShape(ctx, st.shape, cx, cy, R * (st.shape === "dot" ? 0.3 : 0.4), rgba(skinDotColor(st, 0, defaultDot)));
}
