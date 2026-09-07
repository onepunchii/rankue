/**
 * 조준 오버레이. 렌더러 마운트 위에 겹치는 투명 <canvas> 하나를 소유하고, 디바이스 픽셀로
 * 조준선·고스트볼·예측 경로·쿠션 번호·두께 라벨을 그린다. 포인터 이벤트는 받지 않는다(pointer-events:none) —
 * 페이지가 래퍼에 핸들러를 단다. 좌표 변환은 state.project(Renderer.project)에 맡긴다.
 *
 * 색 규약(초록 라사 위 가독성, 2026-09-07 오너 리뷰): 조준선·큐볼 예측 경로는 **큐볼 색**(흰/노랑 92 %), 고스트볼은 큐볼 색 35 % 채움 +
 * surface-1 테두리 — 원근(player) 뷰에선 적구 위에 은은히 겹쳐 두께가 보이고, 탑다운에선 적구에 붙은 반투명 공으로 보인다.
 * brand(초록)는 라사와 겹쳐 안 보이므로 선에는 쓰지 않고 쿠션 번호 알약 테두리·다이아몬드 알약에만 남긴다.
 * 두께 알약은 [겹침 그림] 두께 — 큐 뒤에서 본 두 공(적구 원 앞에 큐볼 원이 (1 − 두께)·2r 만큼 비켜 선다).
 * state.diamond 가 있으면(다이아몬드 시스템 훈련) 레일 숫자 라벨을 경로 아래에 깔고, 유효한 조준이면 1쿠션 조준수·출발수·
 * 예측 3쿠션수를 brand 알약으로 위에 그린다(overlay/diamondSystem). 없으면 그리기는 예전과 완전히 같다.
 *
 * 색은 캔버스 안이지만 UI 요소(선·라벨)이므로 :root 의 디자인 토큰(--brand, --ink-1, --surface-1 …)을
 * 리사이즈마다 한 번 읽어 쓴다. 읽을 수 없으면(테스트·초기화 전) index.css 의 기본값으로 대체한다.
 * 그림자·블러·그라데이션 없음. draw 는 매 프레임 호출될 수 있으니 할당을 최소화한다.
 *
 * 마운트는 position 이 static 이면 relative 로 바꾼다(겹치기 위해). 그 외 마운트 스타일은 건드리지 않는다.
 */
import type { BallState, CushionId } from "@shared/sim/types";
import type { TableSpec } from "@shared/sim/params";
import { straightGuide, thicknessLabel, type BallPath, type CushionMark, type StraightGuide } from "./paths";
import type { AimAnalysis, OverlayDiamond, RailPoint, SystemLabel } from "./diamondSystem";
import { DEFAULT_PALETTE, readPalette, rgba, type Palette } from "../render/tokens";
import { RAIL_WIDTH_M } from "../render/tableGeometry";

export type { OverlayDiamond } from "./diamondSystem";

export type Project = (x: number, y: number) => readonly [number, number];

export interface OverlayPreview {
    readonly paths: readonly BallPath[];
    readonly cushions: readonly CushionMark[];
    readonly cushionCount: number;
    readonly contactIds: readonly string[];
}

export interface OverlayState {
    readonly balls: readonly BallState[];
    readonly phi: number;
    readonly cueBallId: string;
    readonly table: TableSpec;
    /** straight = 직선 안내만, preview = simulateShot 결과 경로(없으면 straight 로 대체). */
    readonly guide: "straight" | "preview";
    readonly preview?: OverlayPreview | null;
    /** 라벨에 쓸 두께. 없으면 직선 안내의 접촉 두께를 쓴다. */
    readonly thickness?: { readonly value: number; readonly side: "left" | "right" | "center" } | null;
    /** 다이아몬드 시스템(3쿠션 훈련): 현재 방향의 레일 숫자 + 조준 분석. 없으면 그리지 않는다. */
    readonly diamond?: OverlayDiamond | null;
    /** 테이블 좌표(m) → 마운트 CSS 픽셀. */
    readonly project: Project;
}

/* ------------------------------------------------------------------ 색 */

// 토큰 읽기·파싱은 render/tokens.ts 에 있다(렌더러와 공유). 기존 import 경로 호환을 위해 다시 내보낸다.
export { parseColor, rgba, type RGBA } from "../render/tokens";

/**
 * draw 마다 rgba() 문자열을 다시 만들지 않도록 resize() 에서 한 번 계산해 두는 색 문자열 묶음.
 * 팔레트가 바뀌는 시점(리사이즈 = 토큰 재읽기)에만 갱신된다.
 */
interface ColourStrings {
    readonly brand: string;
    readonly brandFaint: string;
    readonly ink1: string;
    /** 레일 숫자 라벨 글자. */
    readonly ink3: string;
    readonly surface1: string;
    readonly surfaceLine: string;
    /** 적구 경로용(60%). 공 id 접두어별. */
    readonly pathWhite: string;
    readonly pathYellow: string;
    readonly pathRed: string;
    /** 큐볼 색: 조준선·큐볼 경로(92%), 너머(30%), 고스트 채움(35%). 큐볼 id(white | yellow)별. */
    readonly cueWhite: string;
    readonly cueYellow: string;
    readonly cueWhiteFaint: string;
    readonly cueYellowFaint: string;
    readonly ghostWhite: string;
    readonly ghostYellow: string;
    /** 고스트 테두리·접촉 원호 — 초록 라사 위에서 가장 잘 보이는 surface-1(85%). */
    readonly ghostEdge: string;
    /** 두께 알약 겹침 그림: 적구 원(100%)·큐볼 원(85%). */
    readonly ballWhite: string;
    readonly ballYellow: string;
    readonly ballRed: string;
    readonly overlapWhite: string;
    readonly overlapYellow: string;
}

function buildColours(p: Palette): ColourStrings {
    return {
        brand: rgba(p.brand),
        brandFaint: rgba(p.brand, AIM_BEYOND_ALPHA),
        ink1: rgba(p.ink1),
        ink3: rgba(p.ink3),
        surface1: rgba(p.surface1),
        surfaceLine: rgba(p.surfaceLine),
        pathWhite: rgba(p.ballWhite, OBJECT_PATH_ALPHA),
        pathYellow: rgba(p.ballYellow, OBJECT_PATH_ALPHA),
        pathRed: rgba(p.ballRed, OBJECT_PATH_ALPHA),
        cueWhite: rgba(p.ballWhite, CUE_PATH_ALPHA),
        cueYellow: rgba(p.ballYellow, CUE_PATH_ALPHA),
        cueWhiteFaint: rgba(p.ballWhite, AIM_BEYOND_ALPHA),
        cueYellowFaint: rgba(p.ballYellow, AIM_BEYOND_ALPHA),
        ghostWhite: rgba(p.ballWhite, GHOST_FILL_ALPHA),
        ghostYellow: rgba(p.ballYellow, GHOST_FILL_ALPHA),
        ghostEdge: rgba(p.surface1, GHOST_EDGE_ALPHA),
        ballWhite: rgba(p.ballWhite),
        ballYellow: rgba(p.ballYellow),
        ballRed: rgba(p.ballRed),
        overlapWhite: rgba(p.ballWhite, OVERLAP_CUE_ALPHA),
        overlapYellow: rgba(p.ballYellow, OVERLAP_CUE_ALPHA),
    };
}

/* ------------------------------------------------------------------ 상수 */

const FONT = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
const AIM_WIDTH = 1.5;
const AIM_BEYOND_ALPHA = 0.3;
const OBJECT_PATH_WIDTH = 1;
const OBJECT_PATH_ALPHA = 0.6;
const CUE_PATH_ALPHA = 0.92;
const GHOST_FILL_ALPHA = 0.35;
const GHOST_EDGE_ALPHA = 0.85;
const GHOST_EDGE_WIDTH = 1.5;
const CONTACT_ARC_WIDTH = 2.5;
const CONTACT_ARC_HALF = 0.6;
/** 두께 알약 안 겹침 그림: 공 반지름·상자 폭·글자와의 간격·큐볼 원 불투명도. */
const OVERLAP_R = 6;
const OVERLAP_BOX = 38;
const OVERLAP_GAP = 4;
const OVERLAP_CUE_ALPHA = 0.85;
const NO_DASH: readonly number[] = [];
const MARK_RADIUS = 8;
const LABEL_HEIGHT = 20;
const LABEL_PAD_X = 7;
/** 두께 알약과 고스트 테두리 사이 여유(px). */
const LABEL_CLEARANCE = 8;
/** 출발선(출발점 → 큐볼) 점선. */
const DIAMOND_DASH: readonly number[] = [3, 3];
/** 레일 바깥 행(출발수)과 레일 사이 간격 px. */
const DIAMOND_ROW_GAP = 4;
/** 레일별 바깥쪽 단위 법선(월드). 조준 강조 알약 위치용. */
const RAIL_NORMALS: Readonly<Record<CushionId, readonly [number, number]>> = {
    left: [-1, 0], right: [1, 0], bottom: [0, -1], top: [0, 1],
};

/* ------------------------------------------------------------------ 오버레이 */

export interface OverlayOptions {
    /** DPR 상한. 기본 2. */
    readonly maxDpr?: number;
    /** 화면 문구(i18n). fullBall = 정면 두께 라벨(`sim.aim.fullBall`). 없으면 "100%". */
    readonly labels?: { readonly fullBall?: string };
}

export class Overlay {
    readonly canvas: HTMLCanvasElement;
    private readonly ctx: CanvasRenderingContext2D;
    private readonly mount: HTMLElement;
    private readonly maxDpr: number;
    private readonly fullLabel: string | undefined;
    private palette: Palette = DEFAULT_PALETTE;
    private col: ColourStrings = buildColours(DEFAULT_PALETTE);
    private dpr = 1;
    private w = 0;
    private h = 0;
    /** anchor() 결과(레일 라벨 화면 위치). 프레임마다 배열을 만들지 않으려고 필드에 둔다. */
    private ax = 0;
    private ay = 0;
    private last: OverlayState | null = null;
    private ro: ResizeObserver | null = null;
    private disposed = false;

    constructor(mount: HTMLElement, opts: OverlayOptions = {}) {
        this.mount = mount;
        this.maxDpr = opts.maxDpr ?? 2;
        this.fullLabel = opts.labels?.fullBall;
        const doc = mount.ownerDocument;
        const canvas = doc.createElement("canvas");
        const st = canvas.style;
        st.position = "absolute";
        st.left = "0";
        st.top = "0";
        st.width = "100%";
        st.height = "100%";
        st.pointerEvents = "none";
        st.zIndex = "2";
        if (typeof getComputedStyle === "function") {
            try {
                if (getComputedStyle(mount).position === "static") mount.style.position = "relative";
            } catch { /* 계산 불가 환경 — 무시 */ }
        }
        mount.appendChild(canvas);
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("overlay: 2d context unavailable");
        this.canvas = canvas;
        this.ctx = ctx;
        if (typeof ResizeObserver === "function") {
            this.ro = new ResizeObserver(() => this.resize());
            this.ro.observe(mount);
        }
        this.resize();
    }

    /** 마운트 크기·DPR·토큰 색을 다시 읽고, 마지막 상태가 있으면 다시 그린다. */
    resize(): void {
        if (this.disposed) return;
        const w = this.mount.clientWidth || 0;
        const h = this.mount.clientHeight || 0;
        const rawDpr = typeof window !== "undefined" && window.devicePixelRatio ? window.devicePixelRatio : 1;
        this.dpr = Math.max(1, Math.min(this.maxDpr, rawDpr));
        this.w = w;
        this.h = h;
        this.canvas.width = Math.max(1, Math.round(w * this.dpr));
        this.canvas.height = Math.max(1, Math.round(h * this.dpr));
        this.palette = readPalette(this.mount.ownerDocument);
        this.col = buildColours(this.palette);
        if (this.last) this.draw(this.last);
    }

    clear(): void {
        this.last = null;
        const c = this.ctx;
        c.setTransform(1, 0, 0, 1, 0, 0);
        c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.last = null;
        this.ro?.disconnect();
        this.ro = null;
        if (this.canvas.parentNode) this.canvas.parentNode.removeChild(this.canvas);
    }

    draw(state: OverlayState): void {
        if (this.disposed) return;
        this.last = state;
        const c = this.ctx;
        c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        c.clearRect(0, 0, this.w, this.h);
        if (this.w === 0 || this.h === 0) return;

        const cueBall = findBall(state.balls, state.cueBallId);
        if (!cueBall) return;
        const rPx = this.ballRadiusPx(state, cueBall);
        const guide = straightGuide(cueBall, state.balls, state.phi, state.table);

        c.lineCap = "round";
        c.lineJoin = "round";

        // 시스템 숫자는 경로 아래에 깔린다(조준 강조 알약은 맨 위)
        const diamond = state.diamond ?? null;
        if (diamond) this.drawDiamondLabels(state, diamond.numbers);

        const preview = state.guide === "preview" ? state.preview ?? null : null;
        if (preview) {
            this.drawPreview(state, preview, rPx);
        } else if (guide) {
            this.drawStraight(state, guide);
        }

        if (guide) {
            // 고스트는 제 자리의 반지름으로(원근에선 큐볼보다 멀어 작다) — 적구와 겹치는 정도가 실제와 같아진다
            const gPx = this.radiusPxAt(state, guide.ghost[0], guide.ghost[1]);
            this.drawGhost(state, guide, gPx);
            const th = state.thickness ?? (guide.ball ? { value: guide.ball.thickness, side: guide.ball.side } : null);
            if (th) this.drawThicknessLabel(state, guide, gPx, th.value, th.side);
        }

        if (diamond && diamond.aim) this.drawDiamondAim(state, diamond.aim, cueBall);
    }

    /* ------------------------------------------------ 그리기 조각 */

    private ballRadiusPx(state: OverlayState, cueBall: BallState): number {
        return this.radiusPxAt(state, cueBall.r[0], cueBall.r[1]);
    }

    /** (x, y) 자리의 공 반지름(px). 원근에선 먼 공이 작다 — x·y 두 방향으로 R 만큼 옮긴 점 중 더 긴 쪽(실루엣 반지름). */
    private radiusPxAt(state: OverlayState, x: number, y: number): number {
        const R = state.table.ball.R;
        const a = state.project(x, y);
        const b = state.project(x + R, y);
        const d = state.project(x, y + R);
        const bx = b[0] - a[0], by = b[1] - a[1];
        const dx = d[0] - a[0], dy = d[1] - a[1];
        const rb = Math.sqrt(bx * bx + by * by);
        const rd = Math.sqrt(dx * dx + dy * dy);
        return Math.max(2, rb > rd ? rb : rd);
    }

    private cueColour(id: string): string {
        return id === "yellow" ? this.col.cueYellow : this.col.cueWhite;
    }

    private cueFaint(id: string): string {
        return id === "yellow" ? this.col.cueYellowFaint : this.col.cueWhiteFaint;
    }

    private ghostFill(id: string): string {
        return id === "yellow" ? this.col.ghostYellow : this.col.ghostWhite;
    }

    private ballColour(id: string): string {
        if (id.startsWith("red")) return this.col.ballRed;
        if (id === "yellow") return this.col.ballYellow;
        return this.col.ballWhite;
    }

    private overlapCue(id: string): string {
        return id === "yellow" ? this.col.overlapYellow : this.col.overlapWhite;
    }

    /** 적구 경로 색(공 색 60%). 미리 만든 문자열이라 draw 안에서 할당이 없다. */
    private ballPathColor(id: string): string {
        if (id.startsWith("red")) return this.col.pathRed;
        if (id === "yellow") return this.col.pathYellow;
        return this.col.pathWhite;
    }

    /** 직선 안내: 큐볼 → 고스트(큐볼 색 실선), 고스트 → 너머(30%). */
    private drawStraight(state: OverlayState, g: StraightGuide): void {
        const c = this.ctx;
        const p0 = state.project(g.cue[0], g.cue[1]);
        const p1 = state.project(g.ghost[0], g.ghost[1]);
        c.lineWidth = AIM_WIDTH;
        c.setLineDash(NO_DASH as number[]);
        c.strokeStyle = this.cueColour(state.cueBallId);
        c.beginPath();
        c.moveTo(p0[0], p0[1]);
        c.lineTo(p1[0], p1[1]);
        c.stroke();
        if (g.beyond) {
            const p2 = state.project(g.beyond[0], g.beyond[1]);
            c.strokeStyle = this.cueFaint(state.cueBallId);
            c.beginPath();
            c.moveTo(p1[0], p1[1]);
            c.lineTo(p2[0], p2[1]);
            c.stroke();
        }
    }

    /** 예측 경로: 큐볼 실선(큐볼 색), 적구 얇게(공 색 60%), 큐볼 쿠션 번호. */
    private drawPreview(state: OverlayState, preview: OverlayPreview, rPx: number): void {
        const c = this.ctx;
        c.setLineDash(NO_DASH as number[]);
        for (const path of preview.paths) {
            if (path.id === state.cueBallId) continue;
            c.lineWidth = OBJECT_PATH_WIDTH;
            c.strokeStyle = this.ballPathColor(path.id);
            this.strokePolyline(state, path);
        }
        for (const path of preview.paths) {
            if (path.id !== state.cueBallId) continue;
            c.lineWidth = AIM_WIDTH;
            c.strokeStyle = this.cueColour(state.cueBallId);
            this.strokePolyline(state, path);
        }
        if (preview.cushions.length) this.drawCushionMarks(state, preview.cushions, rPx);
    }

    private strokePolyline(state: OverlayState, path: BallPath): void {
        const pts = path.points;
        if (pts.length < 2) return;
        const c = this.ctx;
        c.beginPath();
        const s = state.project(pts[0].x, pts[0].y);
        c.moveTo(s[0], s[1]);
        for (let i = 1; i < pts.length; i++) {
            const p = state.project(pts[i].x, pts[i].y);
            c.lineTo(p[0], p[1]);
        }
        c.stroke();
    }

    private drawCushionMarks(state: OverlayState, marks: readonly CushionMark[], rPx: number): void {
        const c = this.ctx;
        c.font = FONT;
        c.textAlign = "center";
        c.textBaseline = "middle";
        const r = Math.min(MARK_RADIUS, Math.max(6, rPx * 0.7));
        for (const m of marks) {
            const p = state.project(m.x, m.y);
            c.beginPath();
            c.arc(p[0], p[1], r, 0, Math.PI * 2);
            c.fillStyle = this.col.surface1;
            c.fill();
            c.lineWidth = 1;
            c.strokeStyle = this.col.brand;
            c.stroke();
            c.fillStyle = this.col.ink1;
            c.fillText(String(m.index), p[0], p[1] + 0.5);
        }
    }

    /**
     * 고스트볼: 큐볼 색 35 % 채움 + surface-1 테두리(반투명 공 — 원근 뷰에선 적구 위에 은은히 겹쳐 두께가 보인다)
     * + 접촉 표시(접촉점 쪽 굵은 원호·적구 진행 방향 짧은 선).
     */
    private drawGhost(state: OverlayState, g: StraightGuide, rPx: number): void {
        const c = this.ctx;
        const p = state.project(g.ghost[0], g.ghost[1]);
        c.setLineDash(NO_DASH as number[]);
        c.beginPath();
        c.arc(p[0], p[1], rPx, 0, Math.PI * 2);
        c.fillStyle = this.ghostFill(state.cueBallId);
        c.fill();
        c.lineWidth = GHOST_EDGE_WIDTH;
        c.strokeStyle = this.col.ghostEdge;
        c.stroke();

        if (!g.ball) return;
        const cp = state.project(g.ball.contactPoint[0], g.ball.contactPoint[1]);
        // 접촉점을 중심으로 한 짧은 원호(화면 각도는 project 를 거친 방향으로 계산)
        const ang = Math.atan2(cp[1] - p[1], cp[0] - p[0]);
        c.lineWidth = CONTACT_ARC_WIDTH;
        c.beginPath();
        c.arc(p[0], p[1], rPx, ang - CONTACT_ARC_HALF, ang + CONTACT_ARC_HALF);
        c.stroke();
        // 적구 진행 방향 안내선(적구 색, 60%)
        const R = state.table.ball.R;
        const len = 2.5 * R;
        const q = state.project(g.ball.contactPoint[0] + g.ball.objectDir[0] * len, g.ball.contactPoint[1] + g.ball.objectDir[1] * len);
        c.lineWidth = OBJECT_PATH_WIDTH;
        c.strokeStyle = this.ballPathColor(g.ball.id);
        c.beginPath();
        c.moveTo(cp[0], cp[1]);
        c.lineTo(q[0], q[1]);
        c.stroke();
    }

    /**
     * 고스트볼 옆 두께 알약: [겹침 그림] 두께. 그림은 큐 뒤에서 본 두 공 — 적구 원 앞에 큐볼 원이 (1 − 두께)·2r 만큼 비켜 서서
     * 적구가 그만큼 보인다(side "left" = 적구 중심이 조준선 왼쪽 = 적구의 오른쪽을 맞힘 → 큐볼 원이 오른쪽으로). 쿠션 조준(g.ball 없음)은 글자만.
     * 조준선에 수직인 쪽으로 밀어 두고 캔버스 안으로 클램프.
     */
    private drawThicknessLabel(state: OverlayState, g: StraightGuide, rPx: number, value: number, side: "left" | "right" | "center"): void {
        const c = this.ctx;
        const text = thicknessLabel(value, undefined, this.fullLabel);
        c.font = FONT;
        c.textAlign = "center";
        c.textBaseline = "middle";
        const tw = c.measureText(text).width;
        const gw = g.ball ? OVERLAP_BOX + OVERLAP_GAP : 0;
        const bw = tw + gw + LABEL_PAD_X * 2;
        const bh = LABEL_HEIGHT;

        const p = state.project(g.ghost[0], g.ghost[1]);
        // 조준선에 수직인 쪽(화면에서 더 위쪽)으로 밀어낸다. 조준선 뒤쪽으로 놓으면 개시 배치처럼
        // 큐볼과 적구가 18 cm 떨어진 경우 라벨이 큐볼을 덮는다(실측 2026-09-07).
        const t = state.project(g.ghost[0] + g.dir[0], g.ghost[1] + g.dir[1]);
        const dx = t[0] - p[0], dy = t[1] - p[1];
        let ox = -dy, oy = dx;
        if (oy > 0) { ox = -ox; oy = -oy; }
        const ol = Math.sqrt(ox * ox + oy * oy) || 1;
        // 알약이 고스트·적구를 덮지 않게: 고스트 반지름 + 여유 + 밀어내는 방향으로 잰 알약의 반폭(겹침 그림이 들어가 넓어졌다)
        const ext = (Math.abs(ox / ol) * bw + Math.abs(oy / ol) * bh) / 2;
        const dist = rPx + LABEL_CLEARANCE + ext;
        let x = p[0] + (ox / ol) * dist - bw / 2;
        let y = p[1] + (oy / ol) * dist - bh / 2;
        x = Math.max(4, Math.min(this.w - bw - 4, x));
        y = Math.max(4, Math.min(this.h - bh - 4, y));

        c.setLineDash(NO_DASH as number[]);
        roundRectPath(c, x, y, bw, bh, bh / 2);
        c.fillStyle = this.col.surface1;
        c.fill();
        c.lineWidth = 1;
        c.strokeStyle = this.col.surfaceLine;
        c.stroke();
        if (g.ball) {
            const ox = x + LABEL_PAD_X + OVERLAP_BOX / 2;
            const oy = y + bh / 2;
            const v = value < 0 ? 0 : value > 1 ? 1 : value;
            const dir = side === "right" ? -1 : side === "left" ? 1 : 0;
            const off = (1 - v) * 2 * OVERLAP_R * dir;
            c.beginPath();
            c.arc(ox, oy, OVERLAP_R, 0, Math.PI * 2);
            c.fillStyle = this.ballColour(g.ball.id);
            c.fill();
            c.beginPath();
            c.arc(ox + off, oy, OVERLAP_R, 0, Math.PI * 2);
            c.fillStyle = this.overlapCue(state.cueBallId);
            c.fill();
            c.lineWidth = 1;
            c.strokeStyle = this.col.ink3;
            c.stroke();
        }
        c.fillStyle = this.col.ink1;
        c.fillText(text, x + LABEL_PAD_X + gw + tw / 2, y + bh / 2 + 0.5);
    }

    /* ------------------------------------------------ 다이아몬드 시스템 */

    /**
     * 레일 라벨의 화면 위치. 코 라인 위 점과 바깥 법선(월드)을 project 로 옮겨 레일 폭을 화면에서 재고,
     * row 0 이면 레일 띠 중앙, row 1 이면 레일 바깥 한 줄(출발수 행)에 놓는다. 결과는 this.ax/ay(할당 없음).
     */
    private anchor(state: OverlayState, x: number, y: number, nx: number, ny: number, row: 0 | 1): void {
        const p0 = state.project(x, y);
        const p1 = state.project(x + nx * RAIL_WIDTH_M, y + ny * RAIL_WIDTH_M);
        if (row === 0) {
            this.ax = (p0[0] + p1[0]) / 2;
            this.ay = (p0[1] + p1[1]) / 2;
            return;
        }
        const dx = p1[0] - p0[0], dy = p1[1] - p0[1];
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const off = LABEL_HEIGHT / 2 + DIAMOND_ROW_GAP;
        this.ax = p1[0] + (dx / len) * off;
        this.ay = p1[1] + (dy / len) * off;
    }

    /** 알약 하나(캔버스 안으로 클램프). 글꼴·정렬은 호출자가 한 번 설정한다. */
    private pill(text: string, cx: number, cy: number, fill: string, stroke: string, ink: string): void {
        const c = this.ctx;
        const bw = c.measureText(text).width + LABEL_PAD_X * 2;
        const bh = LABEL_HEIGHT;
        const x = Math.max(2, Math.min(this.w - bw - 2, cx - bw / 2));
        const y = Math.max(2, Math.min(this.h - bh - 2, cy - bh / 2));
        roundRectPath(c, x, y, bw, bh, bh / 2);
        c.fillStyle = fill;
        c.fill();
        c.strokeStyle = stroke;
        c.stroke();
        c.fillStyle = ink;
        c.fillText(text, x + bw / 2, y + bh / 2 + 0.5);
    }

    /** 시스템 숫자 라벨: ink-3 글자, surface-1 알약, surface-line 테두리. 현재 방향의 레일만 온다. */
    private drawDiamondLabels(state: OverlayState, labels: readonly SystemLabel[]): void {
        const c = this.ctx;
        c.font = FONT;
        c.textAlign = "center";
        c.textBaseline = "middle";
        c.setLineDash(NO_DASH as number[]);
        c.lineWidth = 1;
        for (const l of labels) {
            this.anchor(state, l.x, l.y, l.nx, l.ny, l.row);
            this.pill(l.text, this.ax, this.ay, this.col.surface1, this.col.surfaceLine, this.col.ink3);
        }
    }

    /** 조준 분석: 출발선(출발점 → 큐볼, 흐린 점선) + 1쿠션 조준수·출발수·예측 3쿠션수 강조 알약(brand). */
    private drawDiamondAim(state: OverlayState, aim: AimAnalysis, cueBall: BallState): void {
        const c = this.ctx;
        const dp = state.project(aim.departure.point[0], aim.departure.point[1]);
        const cp = state.project(cueBall.r[0], cueBall.r[1]);
        c.lineWidth = 1;
        c.strokeStyle = this.col.brandFaint;
        c.setLineDash(DIAMOND_DASH as number[]);
        c.beginPath();
        c.moveTo(dp[0], dp[1]);
        c.lineTo(cp[0], cp[1]);
        c.stroke();
        c.setLineDash(NO_DASH as number[]);

        c.font = FONT;
        c.textAlign = "center";
        c.textBaseline = "middle";
        this.railPill(state, aim.firstRail, 0);
        this.railPill(state, aim.departure, aim.departure.side === "long" ? 1 : 0);
        this.railPill(state, aim.predictedThird, 0);
    }

    private railPill(state: OverlayState, rp: RailPoint, row: 0 | 1): void {
        const n = RAIL_NORMALS[rp.rail];
        this.anchor(state, rp.point[0], rp.point[1], n[0], n[1], row);
        this.pill(String(Math.round(rp.number)), this.ax, this.ay, this.col.surface1, this.col.brand, this.col.brand);
    }
}

/* ------------------------------------------------------------------ 헬퍼 */

function findBall(balls: readonly BallState[], id: string): BallState | null {
    for (let i = 0; i < balls.length; i++) if (balls[i].id === id) return balls[i];
    return null;
}

/** roundRect 가 없는 브라우저(구형 iOS)용 폴백 포함. */
function roundRectPath(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    c.beginPath();
    if (typeof (c as { roundRect?: unknown }).roundRect === "function") {
        c.roundRect(x, y, w, h, r);
        return;
    }
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
}
