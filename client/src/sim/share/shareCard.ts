/**
 * 공유 카드 — 샷 하나를 1080×1350(4:5, 인스타그램·카카오톡용) PNG 로 그린다. Canvas 2D 만 쓰고 DOM 렌더러 인스턴스에
 * 의존하지 않는다(테이블 배치는 tableGeometry.computeLayout 을 가상 컨테이너로 다시 계산).
 *
 * 그리는 것: 크림 바탕(surface-0) 위 흰 카드(surface-1, 헤어라인) → 종목 알약(brand) · 제목 · 부제 →
 * 탑다운 테이블(라사·레일·다이아몬드·센터 스팟, Canvas2DRenderer 와 같은 리터럴 색) → 적구 경로(공 색 60%, 얇게) →
 * 큐볼 경로(brand, 굵게) + 번호 매긴 쿠션 점(두 번째 적구 접촉 전까지 = 판정에 센 쿠션, 그 뒤는 번호 없는 작은 점) →
 * 큐볼 출발 표식(점선 원) → 최종 위치의 공(렌더러와 같은 명암) → (선택) 세션 통계 한 줄 → brand 푸터 띠(문구·리플레이 링크·날짜).
 *
 * 규칙: 글자 영역엔 그라데이션 없음(라사·공 명암에만). 블러·그림자 필터 없음(ctx.filter 는 iOS 미지원, 그림자는 알파 타원).
 * 한글은 시스템 폰트 스택 — 캔버스에서 웹폰트를 기다리면 첫 공유가 깨질 수 있다. 문구는 전부 호출자가 i18n 으로 넘긴다.
 * 순수 레이아웃·문구 헬퍼(cardLayout·shotTitle·sessionStatsLine·replayShortText·markPlan·fitText)는 테스트 동반.
 */
import type { ShotInput, SimResult } from "@shared/sim/types";
import type { TableSpec } from "@shared/sim/params";
import type { GameType, PlayerState, ShotOutcome } from "@shared/sim/rules";
import { objectBallIds, opponentCueBall } from "@shared/sim/rules/evaluate";
import { buildPreviewPaths, cueTimeline, type BallPath, type CushionMark, type PreviewPaths } from "../overlay/paths";
import { computeLayout, worldToScreen, type Rect, type TableLayout } from "../render/tableGeometry";
import { DEFAULT_PALETTE, rgba, scaleColor, type RGBA } from "../render/tokens";
import { displayAverage, formatAverage, inningsForAverage, ruleBadge, tableLabel, type T } from "../hudMath";
import type { Phase } from "../simReducer";
import type { SimSetupConfig } from "../setupPresets";

export const CARD_W = 1080;
export const CARD_H = 1350;

/* ------------------------------------------------------------------ 색·글꼴 */

/** 디자인 토큰 리터럴(index.css :root). DOM 밖이라 CSS 변수를 못 읽는다 — 값이 바뀌면 여기도. */
const SURFACE_0 = "#f2f0eb";
const SURFACE_1 = "#ffffff";
const SURFACE_LINE = "rgba(0,0,0,0.09)";
const INK_1 = "rgba(0,0,0,0.87)";
const INK_3 = "rgba(0,0,0,0.55)";
const BRAND = rgba(DEFAULT_PALETTE.brand);
const BRAND_FG = "#ffffff";
const FOOTER_SOFT = "rgba(255,255,255,0.72)";

/** Canvas2DRenderer 와 같은 값(캔버스 내부 물리적 사물 색은 리터럴). */
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

type BallColour = "white" | "yellow" | "red";
const BALL_SHADE: Record<BallColour, number> = { white: 0.76, yellow: 0.66, red: 0.55 };
/** 적구 경로 알파(Overlay 의 OBJECT_PATH_ALPHA 와 같다). */
const OBJECT_PATH_ALPHA = 0.6;

/** 시스템 폰트 스택 — 한글은 Apple SD Gothic Neo(iOS/macOS) · Roboto(Android 는 Noto CJK 로 폴백). */
export const FONT_STACK = "-apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', Roboto, sans-serif";

/* ------------------------------------------------------------------ 레이아웃(순수) */

const MARGIN = 40;
const PAD = 56;
const CARD_RADIUS = 40;
const FOOTER_H = 120;
const BADGE_H = 48;
const TITLE_SIZE = 46;
const SUBTITLE_SIZE = 28;
const STATS_SIZE = 30;
/** 공은 실제 비율(지름 ≈ 테이블 폭의 4%)보다 살짝 키워 읽기 쉽게. 경로·표식은 실제 위치. */
const BALL_ZOOM = 1.3;
const CUE_PATH_W = 5;
/** 큐볼 경로 아래 흰 케이싱 — brand 초록이 라사 위에서 묻히지 않게(블러·그라데이션 없이 선 하나 더). */
const CUE_PATH_CASING = "rgba(255,255,255,0.55)";
const CUE_PATH_CASING_W = CUE_PATH_W + 4;
const OBJECT_PATH_W = 3;
const MARK_R = 17;
const MARK_SMALL_R = 6;

export interface TextSlot {
    readonly x: number;
    /** 베이스라인 y */
    readonly y: number;
    readonly size: number;
    readonly maxW: number;
}

export interface CardLayout {
    readonly width: number;
    readonly height: number;
    /** 흰 카드 */
    readonly card: Rect;
    readonly badge: { readonly x: number; readonly y: number; readonly h: number };
    readonly title: TextSlot;
    readonly subtitle: TextSlot;
    /** 테이블을 놓는 가상 컨테이너(카드 좌표) */
    readonly tableBox: Rect;
    /** computeLayout(tableBox 크기) — 좌표는 tableBox 원점 기준 */
    readonly table: TableLayout;
    /** 세션 통계 한 줄(가운데 정렬). 없으면 null */
    readonly stats: TextSlot | null;
    /** brand 푸터 띠 */
    readonly footer: Rect;
}

export function cardLayout(table: TableSpec, opts: { readonly hasStats: boolean } = { hasStats: false }): CardLayout {
    const card: Rect = { x: MARGIN, y: MARGIN, w: CARD_W - MARGIN * 2, h: CARD_H - MARGIN * 2 };
    const left = card.x + PAD;
    const innerW = card.w - PAD * 2;
    const badge = { x: left, y: card.y + 56, h: BADGE_H };
    const title: TextSlot = { x: left, y: card.y + 174, size: TITLE_SIZE, maxW: innerW };
    const subtitle: TextSlot = { x: left, y: card.y + 218, size: SUBTITLE_SIZE, maxW: innerW };
    const footer: Rect = { x: card.x, y: card.y + card.h - FOOTER_H, w: card.w, h: FOOTER_H };
    const tableTop = card.y + 252;
    const tableBottom = opts.hasStats ? footer.y - 108 : footer.y - 48;
    const tableBox: Rect = { x: left, y: tableTop, w: innerW, h: tableBottom - tableTop };
    const layout = computeLayout({ width: tableBox.w, height: tableBox.h }, table);
    const stats: TextSlot | null = opts.hasStats ? { x: CARD_W / 2, y: footer.y - 46, size: STATS_SIZE, maxW: innerW } : null;
    return { width: CARD_W, height: CARD_H, card, badge, title, subtitle, tableBox, table: layout, stats, footer };
}

/* ------------------------------------------------------------------ 문구(순수) */

/** 제목: 득점이면 "3쿠션 득점 · 쿠션 {n}" / "4구 득점", 아니면 "연습 샷". */
export function shotTitle(t: T, outcome: Pick<ShotOutcome, "scored" | "cushionsBeforeSecond"> | null, gameType: GameType): string {
    if (!outcome || !outcome.scored) return t("sim.share.titlePractice");
    if (gameType === "3c") return t("sim.share.title3c").replace("{n}", String(outcome.cushionsBeforeSecond));
    return t("sim.share.title4c");
}

/** 부제: "대대 · 3쿠션 UMB · 2.5 m/s" — 테이블·규칙 문구는 HUD 와 같은 키, m/s 는 단위. */
export function shotSubtitle(t: T, config: Pick<SimSetupConfig, "tableId" | "rules">, input: Pick<ShotInput, "V0">): string {
    return `${tableLabel(config, t)} · ${ruleBadge(config, t)} · ${input.V0.toFixed(1)} m/s`;
}

/** 세션 통계: "{score}/{target} · {innings}이닝 · 에버리지 {avg}" — 에버리지 규약은 hudMath(진행 중 이닝 포함). */
export function sessionStatsLine(t: T, p: Pick<PlayerState, "score" | "target" | "innings" | "currentRun">, phase: Phase, gameType?: GameType): string {
    return t("sim.share.stats")
        .replace("{score}", String(p.score))
        .replace("{target}", String(p.target))
        .replace("{innings}", String(inningsForAverage(p, phase)))
        .replace("{avg}", formatAverage(displayAverage(p, phase, gameType)));   // 4구는 캐롬 기준(1캐롬 = 10점)
}

/** 종목 알약 문구(설정 창과 같은 키). */
export function gameBadge(t: T, gameType: GameType): string {
    return t(gameType === "3c" ? "sim.setup.type3c" : "sim.setup.type4c");
}

/** 푸터에 넣을 짧은 링크 표기: 프로토콜·www 를 떼고 max 자에서 말줄임. */
export function replayShortText(url: string, max = 48): string {
    const s = url.replace(/^https?:\/\//, "").replace(/^www\./, "");
    if (s.length <= max) return s;
    return `${s.slice(0, Math.max(1, max - 1))}…`;
}

/** 폭에 맞게 말줄임. measure 는 현재 글꼴로 잰 폭. */
export function fitText(measure: (s: string) => number, text: string, maxW: number): string {
    if (maxW <= 0) return "";
    if (measure(text) <= maxW) return text;
    let s = text;
    while (s.length > 1 && measure(`${s}…`) > maxW) s = s.slice(0, -1);
    return `${s}…`;
}

/** "2026.09.07" */
export function dateLabel(d: Date = new Date()): string {
    const safe = Number.isNaN(d.getTime()) ? new Date() : d;
    const mm = String(safe.getMonth() + 1).padStart(2, "0");
    const dd = String(safe.getDate()).padStart(2, "0");
    return `${safe.getFullYear()}.${mm}.${dd}`;
}

/** PNG 파일 이름: rankue-shot-20260907-<해시 8자>.png */
export function fileNameFor(result: Pick<SimResult, "hash">, d: Date = new Date()): string {
    return `rankue-shot-${dateLabel(d).replace(/\./g, "")}-${result.hash.slice(0, 8)}.png`;
}

export interface MarkPlan {
    /** 두 번째 적구 접촉 전 쿠션(판정에 센 것) — 번호를 붙인다. */
    readonly numbered: readonly CushionMark[];
    /** 그 뒤의 쿠션 — 번호 없는 작은 점. */
    readonly plain: readonly CushionMark[];
}

/** 쿠션 표식 계획. secondContactT 가 없으면 전부 번호. */
export function markPlan(cushions: readonly CushionMark[], secondContactT: number | null): MarkPlan {
    if (secondContactT === null) return { numbered: cushions, plain: [] };
    const numbered: CushionMark[] = [];
    const plain: CushionMark[] = [];
    for (const m of cushions) (m.t <= secondContactT + 1e-9 ? numbered : plain).push(m);
    return { numbered, plain };
}

/** 카드에 그릴 경로: 끝까지(cutoff end), 적구도 끝까지. 두 번째 접촉 시각을 같이 돌려준다. */
export function cardPaths(result: Pick<SimResult, "history" | "events">, cueBallId: string, gameType: GameType): { paths: PreviewPaths; secondContactT: number | null } {
    const paths = buildPreviewPaths(result, { cueBallId, gameType, cutoff: { kind: "end" }, objectBalls: "cutoff" });
    const objectIds = objectBallIds(gameType, cueBallId);
    const opponentId = gameType === "4c" ? opponentCueBall(cueBallId) : null;
    const timeline = cueTimeline(result.events, cueBallId, objectIds, opponentId);
    return { paths, secondContactT: timeline.secondContactT };
}

/* ------------------------------------------------------------------ 그리기 */

export interface ShareCardOptions {
    readonly table: TableSpec;
    readonly gameType: GameType;
    readonly cueBallId: string;
    /** 종목 알약("3쿠션"/"4구") */
    readonly badge: string;
    readonly title: string;
    readonly subtitle: string;
    /** 세션 통계 한 줄(종료 다이얼로그에서). 없으면 테이블이 그만큼 커진다 */
    readonly stats?: string | null;
    /** "랭큐 시뮬레이터 · rankue.co.kr" */
    readonly footer: string;
    /** 리플레이 링크 짧은 표기(replayShortText) */
    readonly replayText: string;
    /** 오른쪽 아래 날짜. 기본 오늘 */
    readonly date?: string;
    /** 테스트·워커용 캔버스 팩토리. 기본 document.createElement("canvas") */
    readonly createCanvas?: () => HTMLCanvasElement;
}

function ballColour(id: string): BallColour {
    if (id.startsWith("red")) return "red";
    if (id.startsWith("yellow")) return "yellow";
    return "white";
}

function ballRgba(colour: BallColour): RGBA {
    return colour === "red" ? DEFAULT_PALETTE.ballRed : colour === "yellow" ? DEFAULT_PALETTE.ballYellow : DEFAULT_PALETTE.ballWhite;
}

/** 폰트 지정이 파싱에 실패하면 캔버스는 조용히 10px 로 남는다 → 크기 확인 후 폴백. */
function setFont(ctx: CanvasRenderingContext2D, weight: number, size: number): void {
    ctx.font = `${weight} ${size}px ${FONT_STACK}`;
    if (!String(ctx.font).includes(`${size}px`)) ctx.font = `${weight} ${size}px sans-serif`;
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    const rr = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
}

function measureWith(ctx: CanvasRenderingContext2D): (s: string) => number {
    return (s) => ctx.measureText(s).width;
}

/** 테이블 좌표(m) → 카드 px. computeLayout 은 tableBox 원점 기준이라 상자 위치를 더한다. */
function projector(L: CardLayout): (x: number, y: number) => [number, number] {
    return (x, y) => {
        const p = worldToScreen(L.table, x, y);
        return [L.tableBox.x + p[0], L.tableBox.y + p[1]];
    };
}

function drawFrame(ctx: CanvasRenderingContext2D, L: CardLayout, o: ShareCardOptions): void {
    ctx.fillStyle = SURFACE_0;
    ctx.fillRect(0, 0, L.width, L.height);

    roundedRect(ctx, L.card.x, L.card.y, L.card.w, L.card.h, CARD_RADIUS);
    ctx.fillStyle = SURFACE_1;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = SURFACE_LINE;
    ctx.stroke();

    // 종목 알약
    setFont(ctx, 700, 24);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const badgeW = ctx.measureText(o.badge).width + 40;
    roundedRect(ctx, L.badge.x, L.badge.y, badgeW, L.badge.h, L.badge.h / 2);
    ctx.fillStyle = BRAND;
    ctx.fill();
    ctx.fillStyle = BRAND_FG;
    ctx.fillText(o.badge, L.badge.x + badgeW / 2, L.badge.y + L.badge.h / 2 + 1);

    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    setFont(ctx, 700, L.title.size);
    ctx.fillStyle = INK_1;
    ctx.fillText(fitText(measureWith(ctx), o.title, L.title.maxW), L.title.x, L.title.y);

    setFont(ctx, 500, L.subtitle.size);
    ctx.fillStyle = INK_3;
    ctx.fillText(fitText(measureWith(ctx), o.subtitle, L.subtitle.maxW), L.subtitle.x, L.subtitle.y);
}

/** Canvas2DRenderer.drawStatic 과 같은 순서·색: 레일 → 라사(비네트) → 안쪽 그늘 → 코 라인 → 센터 스팟 → 다이아몬드. */
function drawTable(ctx: CanvasRenderingContext2D, L: CardLayout): void {
    const T = L.table;
    const ox = L.tableBox.x, oy = L.tableBox.y;
    const outer: Rect = { x: T.outer.x + ox, y: T.outer.y + oy, w: T.outer.w, h: T.outer.h };
    const play: Rect = { x: T.play.x + ox, y: T.play.y + oy, w: T.play.w, h: T.play.h };
    const railPx = T.railPx;

    roundedRect(ctx, outer.x, outer.y, outer.w, outer.h, Math.max(3, railPx * 0.55));
    ctx.fillStyle = RAIL_WOOD;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = RAIL_WOOD_EDGE;
    ctx.stroke();

    const cx = play.x + play.w / 2;
    const cy = play.y + play.h / 2;
    const felt = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.hypot(play.w, play.h) * 0.6);
    felt.addColorStop(0, FELT_CENTRE);
    felt.addColorStop(0.7, FELT_EDGE);
    felt.addColorStop(1, FELT_EDGE);
    ctx.fillStyle = felt;
    ctx.fillRect(play.x, play.y, play.w, play.h);

    ctx.save();
    ctx.beginPath();
    ctx.rect(play.x, play.y, play.w, play.h);
    ctx.clip();
    const inner = Math.max(2, railPx * 0.35);
    const edges: [number, number, number, number, number, number, number, number][] = [
        [0, play.y, 0, play.y + inner, play.x, play.y, play.w, inner],
        [0, play.y + play.h, 0, play.y + play.h - inner, play.x, play.y + play.h - inner, play.w, inner],
        [play.x, 0, play.x + inner, 0, play.x, play.y, inner, play.h],
        [play.x + play.w, 0, play.x + play.w - inner, 0, play.x + play.w - inner, play.y, inner, play.h],
    ];
    for (const [gx0, gy0, gx1, gy1, rx, ry, rw, rh] of edges) {
        const g = ctx.createLinearGradient(gx0, gy0, gx1, gy1);
        g.addColorStop(0, FELT_VIGNETTE);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.fillRect(rx, ry, rw, rh);
    }
    ctx.restore();

    ctx.lineWidth = 1.5;
    ctx.strokeStyle = RAIL_NOSE;
    ctx.strokeRect(play.x + 0.75, play.y + 0.75, play.w - 1.5, play.h - 1.5);

    const spotR = Math.max(1.5, T.table.ball.R * T.scale * 0.22);
    ctx.fillStyle = SPOT;
    for (let i = 1; i <= 3; i++) {
        const p = worldToScreen(T, T.table.width / 2, (T.table.length * i) / 4);
        ctx.beginPath();
        ctx.arc(p[0] + ox, p[1] + oy, spotR, 0, Math.PI * 2);
        ctx.fill();
    }

    const dR = Math.max(2, railPx * 0.16);
    ctx.fillStyle = DIAMOND;
    for (const d of T.diamonds) {
        ctx.beginPath();
        ctx.arc(d.sx + ox, d.sy + oy, dR, 0, Math.PI * 2);
        ctx.fill();
    }
}

function strokePolyline(ctx: CanvasRenderingContext2D, project: (x: number, y: number) => [number, number], path: BallPath): void {
    const pts = path.points;
    if (pts.length < 2) return;
    ctx.beginPath();
    const s = project(pts[0].x, pts[0].y);
    ctx.moveTo(s[0], s[1]);
    for (let i = 1; i < pts.length; i++) {
        const p = project(pts[i].x, pts[i].y);
        ctx.lineTo(p[0], p[1]);
    }
    ctx.stroke();
}

function drawPaths(ctx: CanvasRenderingContext2D, L: CardLayout, o: ShareCardOptions, paths: PreviewPaths, secondContactT: number | null): void {
    const project = projector(L);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.setLineDash([]);
    for (const path of paths.paths) {
        if (path.id === o.cueBallId) continue;
        ctx.lineWidth = OBJECT_PATH_W;
        ctx.strokeStyle = rgba(ballRgba(ballColour(path.id)), OBJECT_PATH_ALPHA);
        strokePolyline(ctx, project, path);
    }
    for (const path of paths.paths) {
        if (path.id !== o.cueBallId) continue;
        ctx.lineWidth = CUE_PATH_CASING_W;
        ctx.strokeStyle = CUE_PATH_CASING;
        strokePolyline(ctx, project, path);
        ctx.lineWidth = CUE_PATH_W;
        ctx.strokeStyle = BRAND;
        strokePolyline(ctx, project, path);
    }

    const plan = markPlan(paths.cushions, secondContactT);
    ctx.fillStyle = BRAND;
    for (const m of plan.plain) {
        const p = project(m.x, m.y);
        ctx.beginPath();
        ctx.arc(p[0], p[1], MARK_SMALL_R, 0, Math.PI * 2);
        ctx.fill();
    }
    setFont(ctx, 700, 20);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const m of plan.numbered) {
        const p = project(m.x, m.y);
        ctx.beginPath();
        ctx.arc(p[0], p[1], MARK_R, 0, Math.PI * 2);
        ctx.fillStyle = SURFACE_1;
        ctx.fill();
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = BRAND;
        ctx.stroke();
        ctx.fillStyle = INK_1;
        ctx.fillText(String(m.index), p[0], p[1] + 1);
    }
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
}

/** 큐볼 출발 위치: 점선 원 + 가운데 점(brand). */
function drawStartMarker(ctx: CanvasRenderingContext2D, L: CardLayout, x: number, y: number, ballPx: number): void {
    const p = projector(L)(x, y);
    ctx.setLineDash([7, 6]);
    ctx.beginPath();
    ctx.arc(p[0], p[1], ballPx, 0, Math.PI * 2);
    ctx.lineWidth = 5.5;
    ctx.strokeStyle = CUE_PATH_CASING;
    ctx.stroke();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = BRAND;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = BRAND;
    ctx.beginPath();
    ctx.arc(p[0], p[1], 4, 0, Math.PI * 2);
    ctx.fill();
}

/** Canvas2DRenderer.paintBall 과 같은 명암: 접촉 그림자(알파 타원) → 좌상단 광원 명암 → 하이라이트 → 외곽선. */
function paintBall(ctx: CanvasRenderingContext2D, cx: number, cy: number, R: number, colour: BallColour): void {
    ctx.beginPath();
    ctx.ellipse(cx + R * 0.16, cy + R * 0.22, R * 1.02, R * 0.92, 0, 0, Math.PI * 2);
    ctx.fillStyle = SHADOW;
    ctx.fill();

    const lx = cx - R * 0.35;
    const ly = cy - R * 0.35;
    const main = ballRgba(colour);
    const base = ctx.createRadialGradient(lx, ly, R * 0.1, cx, cy, R);
    base.addColorStop(0, rgba(main));
    base.addColorStop(1, rgba(scaleColor(main, BALL_SHADE[colour])));
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fillStyle = base;
    ctx.fill();

    const gloss = ctx.createRadialGradient(lx, ly, 0, lx, ly, R * 0.55);
    gloss.addColorStop(0, "rgba(255,255,255,0.55)");
    gloss.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gloss;
    ctx.fill();

    ctx.lineWidth = 1.5;
    ctx.strokeStyle = BALL_OUTLINE;
    ctx.stroke();
}

function drawBalls(ctx: CanvasRenderingContext2D, L: CardLayout, result: SimResult, ballPx: number): void {
    const project = projector(L);
    for (const b of result.final) {
        const p = project(b.r[0], b.r[1]);
        paintBall(ctx, p[0], p[1], ballPx, ballColour(b.id));
    }
}

function drawStatsAndFooter(ctx: CanvasRenderingContext2D, L: CardLayout, o: ShareCardOptions): void {
    if (L.stats && o.stats) {
        setFont(ctx, 600, L.stats.size);
        ctx.textAlign = "center";
        ctx.textBaseline = "alphabetic";
        ctx.fillStyle = INK_1;
        ctx.fillText(fitText(measureWith(ctx), o.stats, L.stats.maxW), L.stats.x, L.stats.y);
    }

    // 푸터 띠는 카드 아래 모서리로 클리핑
    ctx.save();
    roundedRect(ctx, L.card.x, L.card.y, L.card.w, L.card.h, CARD_RADIUS);
    ctx.clip();
    ctx.fillStyle = BRAND;
    ctx.fillRect(L.footer.x, L.footer.y, L.footer.w, L.footer.h);
    ctx.restore();

    const left = L.card.x + PAD;
    const right = L.card.x + L.card.w - PAD;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    setFont(ctx, 700, 30);
    ctx.fillStyle = BRAND_FG;
    const date = o.date ?? dateLabel();
    setFont(ctx, 600, 24);
    const dateW = ctx.measureText(date).width;
    setFont(ctx, 700, 30);
    ctx.fillText(fitText(measureWith(ctx), o.footer, right - left - dateW - 24), left, L.footer.y + 52);

    setFont(ctx, 500, 22);
    ctx.fillStyle = FOOTER_SOFT;
    ctx.fillText(fitText(measureWith(ctx), o.replayText, right - left), left, L.footer.y + 90);

    setFont(ctx, 600, 24);
    ctx.textAlign = "right";
    ctx.fillStyle = FOOTER_SOFT;
    ctx.fillText(date, right, L.footer.y + 52);
    ctx.textAlign = "left";
}

/** 컨텍스트에 카드를 그린다(캔버스 크기는 CARD_W×CARD_H 여야 한다). */
export function drawShareCard(ctx: CanvasRenderingContext2D, result: SimResult, o: ShareCardOptions): void {
    const L = cardLayout(o.table, { hasStats: !!o.stats });
    const { paths, secondContactT } = cardPaths(result, o.cueBallId, o.gameType);
    const ballPx = o.table.ball.R * L.table.scale * BALL_ZOOM;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    drawFrame(ctx, L, o);
    drawTable(ctx, L);
    drawPaths(ctx, L, o, paths, secondContactT);
    const start = result.history[0]?.balls.find((b) => b.id === o.cueBallId);
    if (start) drawStartMarker(ctx, L, start.r[0], start.r[1], ballPx);
    drawBalls(ctx, L, result, ballPx);
    drawStatsAndFooter(ctx, L, o);
}

function defaultCreateCanvas(): HTMLCanvasElement {
    return document.createElement("canvas");
}

/** 카드를 새 캔버스(1080×1350)에 그려 돌려준다. 2D 컨텍스트가 없으면 throw(호출자가 실패로 처리). */
export function renderShareCard(result: SimResult, o: ShareCardOptions): HTMLCanvasElement {
    const canvas = (o.createCanvas ?? defaultCreateCanvas)();
    canvas.width = CARD_W;
    canvas.height = CARD_H;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("share card: 2d context unavailable");
    drawShareCard(ctx, result, o);
    return canvas;
}

/** 캔버스 → PNG Blob. toBlob 이 없거나 실패하면 null. */
export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
    if (typeof canvas.toBlob !== "function") return Promise.resolve(null);
    return new Promise((resolve) => {
        try {
            canvas.toBlob((b) => resolve(b), "image/png");
        } catch {
            resolve(null);
        }
    });
}
