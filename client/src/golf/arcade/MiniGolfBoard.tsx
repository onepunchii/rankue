/**
 * 미니골프 보드(2026-09-14) — 캔버스 그리기 + 손가락 입력 + 프레임 루프.
 * 골프 배틀처럼: 화면 아무 데나 누르고 당기면 공에서 반대 방향으로 조준선·파워, 벽 반사까지 예상 경로 점선, 놓으면 샷.
 * 논리 좌표(W36×H60) → 캔버스 픽셀은 scale 하나로. 그림은 전부 코드로 그린다(이미지 파일 없음, 원칙 4).
 */
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { BALL_R, COURSE_H, COURSE_W, CUP_R, type Hole, type Vec } from "@shared/golf/course";
import { MAX_DRAG, powerRatio, predictPath, type BallState } from "@shared/golf/physics";
import type { Phase } from "./useMiniGolf";

interface Props {
    hole: Hole;
    ballRef: { current: BallState };
    phase: Phase;
    tickCount: number;
    onShoot: (dragX: number, dragY: number) => boolean;
    onFrame: (elapsedSec: number) => void;
    /** 벽·범퍼·컵 사건 → 진동 등 */
    onEvents?: () => void;
}

const ROUGH = "#1e4d27";
const FAIRWAY_A = "#5fbf4a";
const FAIRWAY_B = "#56b343";
const WOOD = "#c9a15e";
const WOOD_DARK = "#8a6a34";
const BUMPER = "#f0b43c";
const LIME = "#64DD17";

export function MiniGolfBoard({ hole, ballRef, phase, tickCount, onShoot, onFrame }: Props) {
    const wrapRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [size, setSize] = useState({ w: 0, h: 0, scale: 1, ox: 0, oy: 0 });
    const dragRef = useRef<{ x: number; y: number } | null>(null);   // 논리 단위 당김 벡터
    const [, force] = useState(0);
    const lastRef = useRef<number | null>(null);
    const onFrameRef = useRef(onFrame); onFrameRef.current = onFrame;

    // 컨테이너에 맞춰 캔버스 크기(세로 비율 36:60 유지)
    useEffect(() => {
        const el = wrapRef.current; if (!el) return;
        const ro = new ResizeObserver(() => {
            const cw = el.clientWidth, ch = el.clientHeight;
            if (!cw || !ch) return;
            const scale = Math.min(cw / COURSE_W, ch / COURSE_H);
            const w = COURSE_W * scale, h = COURSE_H * scale;
            setSize({ w, h, scale, ox: (cw - w) / 2, oy: (ch - h) / 2 });
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    // 프레임 루프 — 공이 움직일 때만 물리를 돌린다(멈춰 있으면 tick 이 곧바로 돌아온다)
    useEffect(() => {
        let id = 0;
        const loop = (t: number) => {
            const last = lastRef.current ?? t;
            lastRef.current = t;
            if (!document.hidden) onFrameRef.current((t - last) / 1000);
            id = requestAnimationFrame(loop);
        };
        id = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(id);
    }, []);

    // 그리기
    useEffect(() => {
        const c = canvasRef.current; if (!c || !size.w) return;
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        if (c.width !== Math.round(size.w * dpr) || c.height !== Math.round(size.h * dpr)) {
            c.width = Math.round(size.w * dpr); c.height = Math.round(size.h * dpr);
        }
        const ctx = c.getContext("2d"); if (!ctx) return;
        ctx.setTransform(dpr * size.scale, 0, 0, dpr * size.scale, 0, 0);   // 이제 논리 단위로 그린다
        drawHole(ctx, hole, ballRef.current, dragRef.current, phase);
    }, [size, hole, tickCount, phase, ballRef]);

    const toLogical = (e: ReactPointerEvent) => {
        const r = canvasRef.current!.getBoundingClientRect();
        return { x: (e.clientX - r.left) / size.scale, y: (e.clientY - r.top) / size.scale };
    };
    const onDown = (e: ReactPointerEvent) => {
        if (phase !== "aim") return;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        const p = toLogical(e);
        dragRef.current = { x: p.x - ballRef.current.x, y: p.y - ballRef.current.y };
        // 공 근처에서 시작하면 0 에서 시작(작은 흔들림으로 튀어 나가지 않게)
        if (Math.hypot(dragRef.current.x, dragRef.current.y) < BALL_R * 3) dragRef.current = { x: 0, y: 0 };
        (e.currentTarget as HTMLElement).dataset.anchor = `${p.x},${p.y}`;
        force((n) => n + 1);
    };
    const onMove = (e: ReactPointerEvent) => {
        if (!dragRef.current || phase !== "aim") return;
        const p = toLogical(e);
        const anchor = ((e.currentTarget as HTMLElement).dataset.anchor ?? "").split(",").map(Number);
        // 당김 = 누른 지점부터 끌어온 거리(공 위치와 무관) — 엄지로 화면 아래쪽에서 조준할 수 있다
        const dx = p.x - (anchor[0] || 0), dy = p.y - (anchor[1] || 0);
        const len = Math.hypot(dx, dy), cap = MAX_DRAG * 1.15;
        dragRef.current = len > cap ? { x: (dx / len) * cap, y: (dy / len) * cap } : { x: dx, y: dy };
        force((n) => n + 1);
    };
    const onUp = () => {
        const d = dragRef.current; dragRef.current = null;
        if (d && Math.hypot(d.x, d.y) >= 1.2) onShoot(d.x, d.y);
        force((n) => n + 1);
    };

    return (
        <div ref={wrapRef} className="relative w-full h-full select-none touch-none">
            <canvas
                ref={canvasRef}
                style={{ width: size.w, height: size.h, left: size.ox, top: size.oy, position: "absolute", borderRadius: 18 }}
                onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
            />
        </div>
    );
}

function poly(ctx: CanvasRenderingContext2D, pts: readonly Vec[]) {
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
}

function drawHole(ctx: CanvasRenderingContext2D, h: Hole, ball: BallState, drag: Vec | null, phase: Phase) {
    // 러프
    ctx.fillStyle = ROUGH;
    ctx.fillRect(0, 0, COURSE_W, COURSE_H);
    // 페어웨이 + 깎은 줄무늬
    ctx.save();
    poly(ctx, h.fairway); ctx.clip();
    ctx.fillStyle = FAIRWAY_A; ctx.fillRect(0, 0, COURSE_W, COURSE_H);
    ctx.fillStyle = FAIRWAY_B;
    for (let y = 0; y < COURSE_H; y += 6) ctx.fillRect(0, y, COURSE_W, 3);
    ctx.restore();
    // 블록(장애물)은 러프색으로 메운다
    for (const b of h.blocks ?? []) { poly(ctx, b); ctx.fillStyle = ROUGH; ctx.fill(); }
    // 벽(나무) — 바깥 굵게, 안쪽 밝게
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    const walls = [h.fairway, ...(h.blocks ?? [])];
    for (const w of walls) { poly(ctx, w); ctx.strokeStyle = WOOD_DARK; ctx.lineWidth = 1.4; ctx.stroke(); }
    for (const w of walls) { poly(ctx, w); ctx.strokeStyle = WOOD; ctx.lineWidth = 0.8; ctx.stroke(); }
    // 범퍼
    for (const c of h.bumpers ?? []) {
        ctx.beginPath(); ctx.arc(c.c.x, c.c.y, c.r, 0, Math.PI * 2); ctx.fillStyle = BUMPER; ctx.fill();
        ctx.lineWidth = 0.35; ctx.strokeStyle = "#fff3cc"; ctx.stroke();
        ctx.beginPath(); ctx.arc(c.c.x, c.c.y, c.r * 0.45, 0, Math.PI * 2); ctx.fillStyle = "#d9962a"; ctx.fill();
    }
    // 티 패드
    ctx.beginPath(); ctx.arc(h.tee.x, h.tee.y, 1.5, 0, Math.PI * 2); ctx.fillStyle = "rgba(0,0,0,0.10)"; ctx.fill();
    // 컵 + 깃발
    ctx.beginPath(); ctx.arc(h.cup.x, h.cup.y, CUP_R * 1.35, 0, Math.PI * 2); ctx.fillStyle = "rgba(0,0,0,0.18)"; ctx.fill();
    ctx.beginPath(); ctx.arc(h.cup.x, h.cup.y, CUP_R, 0, Math.PI * 2); ctx.fillStyle = "#0b2410"; ctx.fill();
    ctx.lineWidth = 0.25; ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.stroke();
    if (!ball.inCup) {
        ctx.beginPath(); ctx.moveTo(h.cup.x, h.cup.y); ctx.lineTo(h.cup.x, h.cup.y - 6.5); ctx.lineWidth = 0.35; ctx.strokeStyle = "#f5f5f5"; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(h.cup.x, h.cup.y - 6.5); ctx.lineTo(h.cup.x + 3.2, h.cup.y - 5.4); ctx.lineTo(h.cup.x, h.cup.y - 4.3); ctx.closePath(); ctx.fillStyle = "#ef4444"; ctx.fill();
    }
    // 조준: 예상 경로 점선 + 방향 화살표 + 파워
    if (drag && phase === "aim" && Math.hypot(drag.x, drag.y) >= 1.2) {
        const pts = predictPath(ball, h, drag.x, drag.y, 220, 5);
        for (let i = 0; i < pts.length; i++) {
            const a = 0.9 - (i / pts.length) * 0.75;
            ctx.beginPath(); ctx.arc(pts[i].x, pts[i].y, 0.28, 0, Math.PI * 2); ctx.fillStyle = `rgba(255,255,255,${a.toFixed(2)})`; ctx.fill();
        }
        const ratio = powerRatio(drag.x, drag.y);
        const len = Math.hypot(drag.x, drag.y) || 1;
        const dx = -drag.x / len, dy = -drag.y / len;
        // 파워 게이지(공 뒤쪽, 당기는 방향으로)
        ctx.beginPath(); ctx.moveTo(ball.x, ball.y); ctx.lineTo(ball.x - dx * ratio * 7, ball.y - dy * ratio * 7);
        ctx.lineWidth = 1.1; ctx.strokeStyle = ratio > 0.8 ? "#ff5a5a" : LIME; ctx.stroke();
        // 방향 화살표
        ctx.beginPath(); ctx.moveTo(ball.x + dx * 1.2, ball.y + dy * 1.2); ctx.lineTo(ball.x + dx * 3.4, ball.y + dy * 3.4);
        ctx.lineWidth = 0.45; ctx.strokeStyle = "rgba(255,255,255,0.9)"; ctx.stroke();
    }
    // 공(그림자 → 본체 → 하이라이트)
    if (!ball.inCup) {
        ctx.beginPath(); ctx.arc(ball.x + 0.25, ball.y + 0.3, BALL_R, 0, Math.PI * 2); ctx.fillStyle = "rgba(0,0,0,0.28)"; ctx.fill();
        ctx.beginPath(); ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2); ctx.fillStyle = "#ffffff"; ctx.fill();
        ctx.beginPath(); ctx.arc(ball.x - 0.2, ball.y - 0.22, BALL_R * 0.35, 0, Math.PI * 2); ctx.fillStyle = "rgba(255,255,255,0.9)"; ctx.fill();
        ctx.beginPath(); ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2); ctx.lineWidth = 0.12; ctx.strokeStyle = "rgba(0,0,0,0.25)"; ctx.stroke();
    }
}
