/**
 * 1차 렌더러: Canvas 2D.
 *
 * 두 층으로 그린다.
 *  - 정적 층(오프스크린 캔버스): 라사·레일·다이아몬드·스팟. resize/setTable 때만 다시 그린다.
 *  - 동적 층(화면 캔버스): 매 draw() 마다 정적 층을 복사한 뒤 큐대 → 공 → 강조 링 순서로 얹는다.
 *
 * 공은 색별 스프라이트(오프스크린 캔버스)로 한 번 렌더해 두고 drawImage 로 찍는다 — draw() 안에서는
 * 그라데이션·경로 객체를 만들지 않는다(할당 없음). ctx.filter 는 iOS 가 지원하지 않아 쓰지 않는다.
 * 떠 있는 공(엔진 2.2 airborne, z > R)은 높이만큼 그림자를 오른쪽 아래로 밀고 옅게 따로 그린 뒤, 스프라이트를 원으로
 * 잘라(구운 접촉 그림자 제거) 1 + 0.25·(z − R)/R(상한 1.5)배로 찍는다 — 새 캔버스·객체 없이 경로 연산만 쓴다.
 *
 * 캔버스 내부 색은 물리적 사물(천·나무·큐대)이라 리터럴을 쓴다. 다만 공 색과 강조 링은 오버레이(경로·조준선)와
 * 같은 색이어야 하므로 디자인 토큰(--ball-*, --brand, --surface-1)을 resize 마다 읽는다(render/tokens.ts).
 * 캔버스는 마운트에 absolute·inset 0 으로 얹는다 — 오버레이와 같은 좌표계(패딩 박스)를 쓰기 위해서다.
 * 마운트는 반드시 크기를 가져야 하고(absolute 자식은 부모를 키우지 않는다), position 이 static 이면 relative 로 바꾼다.
 */
import type { TableSpec } from "@shared/sim/params";
import type { RenderFrame, Renderer, SafeInsets, Viewport } from "./Renderer";
import { computeLayout, NO_INSETS, screenToWorld, worldToScreen, type TableLayout } from "./tableGeometry";
import { DEFAULT_PALETTE, readPalette, rgba, scaleColor, type Palette } from "./tokens";

export interface Canvas2DRendererOptions {
    /** 세이프 에어리어 인셋. 함수면 resize 마다 다시 읽는다. 기본 0. */
    readonly insets?: SafeInsets | (() => SafeInsets);
    /** ¼·½·¾ 지점의 희미한 센터 스팟. 기본 true. */
    readonly centreSpots?: boolean;
    /** 테스트·워커용 캔버스 팩토리. 기본 document.createElement("canvas"). */
    readonly createCanvas?: () => HTMLCanvasElement;
    /** DPR 강제(테스트용). 기본 min(devicePixelRatio, 2). */
    readonly dpr?: number;
}

// ── 팔레트(캔버스 내부 전용) ──────────────────────────────────────────────
const FELT_CENTRE = "#1A7A48";
const FELT_EDGE = "#0B5D3B";
const FELT_VIGNETTE = "rgba(0, 0, 0, 0.38)";
const RAIL_WOOD = "#5A3A22";
const RAIL_WOOD_EDGE = "#3E2716";
const RAIL_NOSE = "rgba(0, 0, 0, 0.45)";
const DIAMOND = "rgba(240, 233, 214, 0.9)";
const SPOT = "rgba(255, 255, 255, 0.14)";
const BALL_OUTLINE = "rgba(0, 0, 0, 0.45)";
const SHADOW = "rgba(0, 0, 0, 0.30)";
const CUE_SHAFT = "#C9955A";
const CUE_BUTT = "#4E2E19";
const CUE_EDGE = "rgba(0, 0, 0, 0.35)";
const CUE_FERRULE = "#EDE6D6";
const CUE_TIP = "#2F4A66";

type BallColour = "white" | "yellow" | "red";
/** 음영 쪽 색 = 토큰 색 × 배수(좌상단 광원 기준 반대편). 흰 공은 덜, 붉은 공은 더 어둡게. */
const BALL_SHADE: Record<BallColour, number> = { white: 0.76, yellow: 0.66, red: 0.55 };
/** 강조 링의 바깥 후광 알파(surface-1 토큰에 곱한다). */
const RING_HALO_ALPHA = 0.75;

function ballColour(id: string): BallColour {
    if (id.startsWith("red")) return "red";
    if (id.startsWith("yellow")) return "yellow";
    return "white";
}

// ── 큐대 치수(m) ───────────────────────────────────────────────────────────
const CUE_LENGTH = 1.45;
const CUE_GAP = 0.012;
const CUE_PULLBACK_MAX = 0.25;
const CUE_TIP_W = 0.012;
const CUE_BUTT_W = 0.030;
const CUE_FERRULE_L = 0.03;
const CUE_TIP_L = 0.008;

/** 스프라이트 한 변 = 3R(공 지름 + 그림자 여백). */
const SPRITE_RADII = 3;
/** 접촉 그림자의 오프셋·타원 비율(R 배). 스프라이트와 떠 있는 공의 그림자가 같은 값을 쓴다. */
const SHADOW_DX = 0.16;
const SHADOW_DY = 0.22;
const SHADOW_RX = 1.02;
const SHADOW_RY = 0.92;
/** 떠 있는 공: 이 높이(m) 아래는 천 위로 본다. */
const AIR_EPS = 1e-6;
/** 높이(R 단위) 상한과 그 안에서의 공 확대율·그림자 확대·그림자 페이드. */
const AIR_LIFT_MAX = 2;
const AIR_SCALE_PER_R = 0.25;
const AIR_SHADOW_GROW_PER_R = 0.18;
const AIR_SHADOW_FADE_PER_R = 0.9;

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

function defaultCreateCanvas(): HTMLCanvasElement {
    return document.createElement("canvas");
}

function defaultDpr(): number {
    const d = typeof window !== "undefined" && window.devicePixelRatio ? window.devicePixelRatio : 1;
    return Math.min(d, 2);
}

export class Canvas2DRenderer implements Renderer {
    private readonly opts: Canvas2DRendererOptions;
    private readonly createCanvas: () => HTMLCanvasElement;
    /** 실제 적용 DPR. opts.dpr 이 없으면 resize 마다 devicePixelRatio 를 다시 읽는다(디스플레이 이동·줌). */
    private dpr: number;

    private el: HTMLElement | null = null;
    private table: TableSpec | null = null;
    private layout: TableLayout | null = null;
    private canvas: HTMLCanvasElement | null = null;
    private ctx: CanvasRenderingContext2D | null = null;
    private staticCanvas: HTMLCanvasElement | null = null;
    private observer: ResizeObserver | null = null;
    private lastFrame: RenderFrame | null = null;
    private cssW = 0;
    private cssH = 0;
    /** 색별 스프라이트. 스프라이트 한 변(CSS px)은 spriteSide. */
    private sprites: Record<BallColour, HTMLCanvasElement | null> = { white: null, yellow: null, red: null };
    private spriteSide = 0;
    private ballPx = 0;
    private palette: Palette = DEFAULT_PALETTE;
    private ringHalo = rgba(DEFAULT_PALETTE.surface1, RING_HALO_ALPHA);
    private ringBrand = rgba(DEFAULT_PALETTE.brand);

    constructor(opts: Canvas2DRendererOptions = {}) {
        this.opts = opts;
        this.createCanvas = opts.createCanvas ?? defaultCreateCanvas;
        this.dpr = opts.dpr ?? defaultDpr();
    }

    // ── 생명주기 ─────────────────────────────────────────────────────────
    mount(el: HTMLElement, table: TableSpec): void {
        if (this.el) this.dispose();
        this.el = el;
        this.table = table;

        const canvas = this.createCanvas();
        // 오버레이 캔버스와 똑같이 패딩 박스에 absolute 로 얹는다 — 마운트에 패딩이 있어도 두 캔버스와 clientWidth 가 한 좌표계.
        canvas.style.display = "block";
        canvas.style.position = "absolute";
        canvas.style.inset = "0";
        canvas.style.width = "100%";
        canvas.style.height = "100%";
        canvas.style.touchAction = "none";
        if (typeof getComputedStyle === "function") {
            try {
                if (getComputedStyle(el).position === "static") el.style.position = "relative";
            } catch { /* 계산 불가 환경(가짜 요소) — 무시 */ }
        }
        el.appendChild(canvas);
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");
        this.staticCanvas = this.createCanvas();

        if (typeof ResizeObserver !== "undefined") {
            this.observer = new ResizeObserver(() => this.resize());
            this.observer.observe(el);
        }
        this.resize();
    }

    setTable(table: TableSpec): void {
        this.table = table;
        if (this.el) this.resize();
    }

    resize(): void {
        if (!this.el || !this.table || !this.canvas || !this.staticCanvas) return;
        const w = Math.max(0, this.el.clientWidth);
        const h = Math.max(0, this.el.clientHeight);
        this.cssW = w;
        this.cssH = h;
        const insets = this.readInsets();
        this.layout = computeLayout({ width: w, height: h }, this.table, insets);
        if (this.opts.dpr === undefined) this.dpr = defaultDpr();
        this.palette = readPalette(this.el.ownerDocument);
        this.ringHalo = rgba(this.palette.surface1, RING_HALO_ALPHA);
        this.ringBrand = rgba(this.palette.brand);

        const pw = Math.max(1, Math.round(w * this.dpr));
        const ph = Math.max(1, Math.round(h * this.dpr));
        this.canvas.width = pw;
        this.canvas.height = ph;
        this.staticCanvas.width = pw;
        this.staticCanvas.height = ph;

        this.drawStatic();
        this.buildSprites();
        if (this.lastFrame) this.draw(this.lastFrame);
        else this.blitStatic();
    }

    dispose(): void {
        this.observer?.disconnect();
        this.observer = null;
        if (this.canvas && this.canvas.parentNode) this.canvas.parentNode.removeChild(this.canvas);
        this.canvas = null;
        this.ctx = null;
        this.staticCanvas = null;
        this.sprites = { white: null, yellow: null, red: null };
        this.layout = null;
        this.lastFrame = null;
        this.el = null;
    }

    // ── 좌표 ─────────────────────────────────────────────────────────────
    project(x: number, y: number): [number, number] {
        if (!this.layout) return [0, 0];
        return worldToScreen(this.layout, x, y);
    }

    unproject(px: number, py: number): [number, number] {
        if (!this.layout) return [0, 0];
        return screenToWorld(this.layout, px, py);
    }

    viewport(): Viewport | null {
        if (!this.layout) return null;
        return { width: this.cssW, height: this.cssH, dpr: this.dpr, insets: this.layout.insets, scale: this.layout.scale };
    }

    /** 오버레이 등이 같은 배치를 쓰도록 노출. */
    getLayout(): TableLayout | null {
        return this.layout;
    }

    screenshot(): Promise<Blob | null> {
        const c = this.canvas;
        if (!c || typeof c.toBlob !== "function") return Promise.resolve(null);
        return new Promise((resolve) => {
            try {
                c.toBlob((b) => resolve(b), "image/png");
            } catch {
                resolve(null);
            }
        });
    }

    // ── 동적 층 ───────────────────────────────────────────────────────────
    draw(frame: RenderFrame): void {
        this.lastFrame = frame;
        const ctx = this.ctx;
        const L = this.layout;
        if (!ctx || !L || !this.staticCanvas) return;
        this.blitStatic();

        const balls = frame.balls;
        const cue = frame.cue;

        // 큐대는 공보다 먼저(뒤에) 그린다. 인셋 사각형(조작 층 밖)으로 클립 — 1.45 m 큐대는 테이블 밖으로 길게 나가 오른쪽
        // 열의 슬라이더·버튼 틈으로 비쳤다(2026-09-07 리뷰). ThreeRenderer 는 같은 사각형을 scissor 로 자른다.
        if (cue && cue.visible && balls.length > 0) {
            const cueId = cue.ballId ?? frame.highlightBallId;
            let cb = balls[0];
            if (cueId !== undefined) {
                for (let i = 0; i < balls.length; i++) {
                    if (balls[i].id === cueId) { cb = balls[i]; break; }
                }
            }
            const ins = L.insets;
            ctx.save();
            ctx.beginPath();
            ctx.rect(ins.left, ins.top, Math.max(0, L.container.width - ins.left - ins.right), Math.max(0, L.container.height - ins.top - ins.bottom));
            ctx.clip();
            this.drawCue(ctx, L, cb.r[0], cb.r[1], cue.phi, cue.pullback);
            ctx.restore();
        }

        const half = this.spriteSide / 2;
        const Rm = L.table.ball.R;
        for (let i = 0; i < balls.length; i++) {
            const b = balls[i];
            const sprite = this.sprites[ballColour(b.id)];
            if (!sprite) continue;
            const px = L.originX + b.r[0] * L.scale;
            const py = L.originY - b.r[1] * L.scale;
            const lift = b.r[2] - Rm;
            if (lift > AIR_EPS) {
                this.drawAirborne(ctx, sprite, px, py, lift / Rm);
                continue;
            }
            ctx.drawImage(sprite, px - half, py - half, this.spriteSide, this.spriteSide);
        }

        if (frame.highlightBallId !== undefined) {
            for (let i = 0; i < balls.length; i++) {
                const b = balls[i];
                if (b.id !== frame.highlightBallId) continue;
                const px = L.originX + b.r[0] * L.scale;
                const py = L.originY - b.r[1] * L.scale;
                const rr = this.ballPx + 2.5;
                ctx.beginPath();
                ctx.arc(px, py, rr, 0, Math.PI * 2);
                ctx.lineWidth = 3.5;
                ctx.strokeStyle = this.ringHalo;
                ctx.stroke();
                ctx.lineWidth = 1.5;
                ctx.strokeStyle = this.ringBrand;
                ctx.stroke();
                break;
            }
        }
    }

    /**
     * 떠 있는 공. lift 는 R 단위 높이. 그림자는 (R + h) 에 비례해 오른쪽 아래로 밀리고 커지며 옅어지고(globalAlpha),
     * 공은 1 + 0.25·lift(상한)배로 찍되 원으로 잘라 스프라이트에 구운 접촉 그림자를 숨긴다. 객체 할당 없음(경로 연산만).
     */
    private drawAirborne(ctx: CanvasRenderingContext2D, sprite: HTMLCanvasElement, px: number, py: number, lift: number): void {
        const Rpx = this.ballPx;
        const l = lift < AIR_LIFT_MAX ? lift : AIR_LIFT_MAX;
        const grow = 1 + AIR_SHADOW_GROW_PER_R * l;
        ctx.globalAlpha = 1 / (1 + AIR_SHADOW_FADE_PER_R * l);
        ctx.beginPath();
        ctx.ellipse(px + Rpx * SHADOW_DX * (1 + lift), py + Rpx * SHADOW_DY * (1 + lift), Rpx * SHADOW_RX * grow, Rpx * SHADOW_RY * grow, 0, 0, Math.PI * 2);
        ctx.fillStyle = SHADOW;
        ctx.fill();
        ctx.globalAlpha = 1;

        const scale = 1 + AIR_SCALE_PER_R * l;
        const side = this.spriteSide * scale;
        ctx.save();
        ctx.beginPath();
        ctx.arc(px, py, Rpx * scale + 0.75, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(sprite, px - side / 2, py - side / 2, side, side);
        ctx.restore();
    }

    private blitStatic(): void {
        const ctx = this.ctx;
        if (!ctx || !this.staticCanvas) return;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, this.canvas!.width, this.canvas!.height);
        ctx.drawImage(this.staticCanvas, 0, 0);
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }

    /** 큐대: 공 뒤(−phi)에 놓인 테이퍼 막대. 좌표는 모두 숫자 지역변수로만 계산한다. */
    private drawCue(ctx: CanvasRenderingContext2D, L: TableLayout, bx: number, by: number, phi: number, pullback: number): void {
        const s = L.scale;
        const pb = pullback < 0 ? 0 : pullback > 1 ? 1 : pullback;
        // 화면 방향: 테이블 y 가 화면 아래로 뒤집히므로 sin 부호만 반전
        const dx = -Math.cos(phi);
        const dy = Math.sin(phi);
        const nx = -dy;
        const ny = dx;
        const R = L.table.ball.R;
        const cx = L.originX + bx * s;
        const cy = L.originY - by * s;

        const gap = (R + CUE_GAP + pb * CUE_PULLBACK_MAX) * s;
        const len = CUE_LENGTH * s;
        const tipW = Math.max(2, CUE_TIP_W * s);
        const buttW = Math.max(3, CUE_BUTT_W * s);
        const ferruleL = CUE_FERRULE_L * s;
        const tipL = CUE_TIP_L * s;

        // 샤프트(팁 쪽 절반은 밝은 나무, 손잡이 절반은 짙은 나무)
        const t0x = cx + dx * gap, t0y = cy + dy * gap;
        const midD = gap + len * 0.55;
        const midW = tipW + (buttW - tipW) * 0.55;
        const mx = cx + dx * midD, my = cy + dy * midD;
        const ex = cx + dx * (gap + len), ey = cy + dy * (gap + len);

        ctx.beginPath();
        ctx.moveTo(t0x + nx * tipW / 2, t0y + ny * tipW / 2);
        ctx.lineTo(mx + nx * midW / 2, my + ny * midW / 2);
        ctx.lineTo(mx - nx * midW / 2, my - ny * midW / 2);
        ctx.lineTo(t0x - nx * tipW / 2, t0y - ny * tipW / 2);
        ctx.closePath();
        ctx.fillStyle = CUE_SHAFT;
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = CUE_EDGE;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(mx + nx * midW / 2, my + ny * midW / 2);
        ctx.lineTo(ex + nx * buttW / 2, ey + ny * buttW / 2);
        ctx.lineTo(ex - nx * buttW / 2, ey - ny * buttW / 2);
        ctx.lineTo(mx - nx * midW / 2, my - ny * midW / 2);
        ctx.closePath();
        ctx.fillStyle = CUE_BUTT;
        ctx.fill();
        ctx.strokeStyle = CUE_EDGE;
        ctx.stroke();

        // 페룰(흰 띠)
        const f1x = cx + dx * (gap + ferruleL), f1y = cy + dy * (gap + ferruleL);
        ctx.beginPath();
        ctx.moveTo(t0x + nx * tipW / 2, t0y + ny * tipW / 2);
        ctx.lineTo(f1x + nx * tipW / 2, f1y + ny * tipW / 2);
        ctx.lineTo(f1x - nx * tipW / 2, f1y - ny * tipW / 2);
        ctx.lineTo(t0x - nx * tipW / 2, t0y - ny * tipW / 2);
        ctx.closePath();
        ctx.fillStyle = CUE_FERRULE;
        ctx.fill();

        // 팁(가죽)
        const p0x = cx + dx * (gap - tipL), p0y = cy + dy * (gap - tipL);
        ctx.beginPath();
        ctx.moveTo(p0x + nx * tipW / 2, p0y + ny * tipW / 2);
        ctx.lineTo(t0x + nx * tipW / 2, t0y + ny * tipW / 2);
        ctx.lineTo(t0x - nx * tipW / 2, t0y - ny * tipW / 2);
        ctx.lineTo(p0x - nx * tipW / 2, p0y - ny * tipW / 2);
        ctx.closePath();
        ctx.fillStyle = CUE_TIP;
        ctx.fill();
    }

    // ── 정적 층 ───────────────────────────────────────────────────────────
    private drawStatic(): void {
        const L = this.layout;
        const sc = this.staticCanvas;
        if (!L || !sc) return;
        const ctx = sc.getContext("2d");
        if (!ctx) return;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, sc.width, sc.height);
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

        const { outer, play, railPx } = L;
        const cornerR = Math.max(3, railPx * 0.55);

        // 레일: 나무 띠 + 바깥 테두리
        roundedRect(ctx, outer.x, outer.y, outer.w, outer.h, cornerR);
        ctx.fillStyle = RAIL_WOOD;
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = RAIL_WOOD_EDGE;
        ctx.stroke();

        // 라사: 가운데가 살짝 밝고 레일 쪽으로 어두워지는 비네트
        const cx = play.x + play.w / 2;
        const cy = play.y + play.h / 2;
        const felt = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.hypot(play.w, play.h) * 0.6);
        felt.addColorStop(0, FELT_CENTRE);
        felt.addColorStop(0.7, FELT_EDGE);
        felt.addColorStop(1, FELT_EDGE);
        ctx.fillStyle = felt;
        ctx.fillRect(play.x, play.y, play.w, play.h);

        // 레일 안쪽 그늘(쿠션이 드리우는 그림자) — 얇은 안쪽 띠
        ctx.save();
        ctx.beginPath();
        ctx.rect(play.x, play.y, play.w, play.h);
        ctx.clip();
        const inner = Math.max(2, railPx * 0.35);
        const grad = ctx.createLinearGradient(0, play.y, 0, play.y + inner);
        grad.addColorStop(0, FELT_VIGNETTE);
        grad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = grad;
        ctx.fillRect(play.x, play.y, play.w, inner);
        const gradB = ctx.createLinearGradient(0, play.y + play.h, 0, play.y + play.h - inner);
        gradB.addColorStop(0, FELT_VIGNETTE);
        gradB.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = gradB;
        ctx.fillRect(play.x, play.y + play.h - inner, play.w, inner);
        const gradL = ctx.createLinearGradient(play.x, 0, play.x + inner, 0);
        gradL.addColorStop(0, FELT_VIGNETTE);
        gradL.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = gradL;
        ctx.fillRect(play.x, play.y, inner, play.h);
        const gradR = ctx.createLinearGradient(play.x + play.w, 0, play.x + play.w - inner, 0);
        gradR.addColorStop(0, FELT_VIGNETTE);
        gradR.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = gradR;
        ctx.fillRect(play.x + play.w - inner, play.y, inner, play.h);
        ctx.restore();

        // 쿠션 코 라인: 라사 경계에 살짝 어두운 선
        ctx.lineWidth = 1;
        ctx.strokeStyle = RAIL_NOSE;
        ctx.strokeRect(play.x + 0.5, play.y + 0.5, play.w - 1, play.h - 1);

        // 센터 스팟(¼·½·¾)
        if (this.opts.centreSpots !== false) {
            const spotR = Math.max(1.5, L.table.ball.R * L.scale * 0.22);
            ctx.fillStyle = SPOT;
            for (let i = 1; i <= 3; i++) {
                const [sx, sy] = worldToScreen(L, L.table.width / 2, (L.table.length * i) / 4);
                ctx.beginPath();
                ctx.arc(sx, sy, spotR, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // 다이아몬드: 작은 밝은 점
        const dR = Math.max(1.5, railPx * 0.16);
        ctx.fillStyle = DIAMOND;
        for (const d of L.diamonds) {
            ctx.beginPath();
            ctx.arc(d.sx, d.sy, dR, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // ── 공 스프라이트 ─────────────────────────────────────────────────────
    private buildSprites(): void {
        const L = this.layout;
        if (!L) return;
        const R = L.table.ball.R * L.scale;
        this.ballPx = R;
        this.spriteSide = R * SPRITE_RADII;
        const devSide = Math.max(1, Math.ceil(this.spriteSide * this.dpr));
        for (const colour of ["white", "yellow", "red"] as const) {
            const c = this.sprites[colour] ?? this.createCanvas();
            c.width = devSide;
            c.height = devSide;
            const ctx = c.getContext("2d");
            if (!ctx) continue;
            ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
            ctx.clearRect(0, 0, this.spriteSide, this.spriteSide);
            this.paintBall(ctx, this.spriteSide / 2, this.spriteSide / 2, R, colour);
            this.sprites[colour] = c;
        }
    }

    private paintBall(ctx: CanvasRenderingContext2D, cx: number, cy: number, R: number, colour: BallColour): void {
        // 접촉 그림자: 오른쪽 아래로 살짝 밀린 타원(블러 없이 알파로만)
        ctx.beginPath();
        ctx.ellipse(cx + R * SHADOW_DX, cy + R * SHADOW_DY, R * SHADOW_RX, R * SHADOW_RY, 0, 0, Math.PI * 2);
        ctx.fillStyle = SHADOW;
        ctx.fill();

        // 본체: 좌상단 광원 기준 명암
        const lx = cx - R * 0.35;
        const ly = cy - R * 0.35;
        const main = colour === "red" ? this.palette.ballRed : colour === "yellow" ? this.palette.ballYellow : this.palette.ballWhite;
        const base = ctx.createRadialGradient(lx, ly, R * 0.1, cx, cy, R);
        base.addColorStop(0, rgba(main));
        base.addColorStop(1, rgba(scaleColor(main, BALL_SHADE[colour])));
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.fillStyle = base;
        ctx.fill();

        // 하이라이트
        const gloss = ctx.createRadialGradient(lx, ly, 0, lx, ly, R * 0.55);
        gloss.addColorStop(0, "rgba(255,255,255,0.55)");
        gloss.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = gloss;
        ctx.fill();

        // 얇은 외곽선
        ctx.lineWidth = 1;
        ctx.strokeStyle = BALL_OUTLINE;
        ctx.stroke();
    }

    private readInsets(): SafeInsets {
        const ins = this.opts.insets;
        if (!ins) return NO_INSETS;
        return typeof ins === "function" ? ins() : ins;
    }
}
