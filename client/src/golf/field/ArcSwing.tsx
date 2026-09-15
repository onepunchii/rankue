/**
 * 스윙 조작(오너 확정 2026-09-15 — 골프 슈퍼 크루 화면 구성 그대로). 화면 전체를 덮는 투명 오버레이. 다른 입력 방식은 없다.
 *
 *   위쪽: 아크 미터(티 위의 공 위에 뜬다) · 가운데: 티 위의 공 + POWER % · 아래: 큰 공 + DRAW/FADE 링
 *   1) 아래 큰 공을 **뒤(아래)로 끈다** → 파워(20~115 %). 붉은 빛줄기가 티 위의 공까지 뻗는다
 *   2) 끌면서 **좌우로** → DRAW(왼쪽) / FADE(오른쪽). 엔진의 스탠스(스윙 패스 ±3°)로 들어간다
 *   3) 놓으면 아크를 바늘이 **왕복** → 가운데 창에 올 때 **아무 데나 탭**
 *        · 창 안: 정타. 탭 위치가 페이스(이르면 닫힘, 늦으면 열림)
 *        · 창 밖: 빨리(왼쪽) = 대가리, 늦게(오른쪽) = 뒷땅. 4번 지나도록 안 치면 헛스윙
 */
import { useEffect, useRef, useState, type PointerEvent as RPE } from "react";
import { cn } from "@/lib/utils";

export interface SwingResult {
    powerPct: number; impactMs: number; padX: number; tapX: number; tapY: number;
    /** 4번 지나도록 안 쳤다 */
    noTap: boolean;
    /** 끌어서 정한 스탠스(드로우 +) */
    stanceDeg10: number;
}

interface Props {
    zoneMs: number;
    sweepMs: number;
    /** 티 위의 공(필드 캔버스의 티)이 화면 아래에서 뜬 높이(px) */
    teeBottomPx: number;
    /** 아래 조작 영역 높이(px) — 여기서만 끌기가 시작된다 */
    ctrlH: number;
    onShot: (r: SwingResult) => void;
    /** 끄는 동안 파워·스탠스 미리보기(필드의 예상 착지 링) */
    onAim?: (powerPct: number, stanceDeg10: number) => void;
}

const MAX_PULL_PX = 150;        // 이만큼 아래로 끌면 100 %
const SHAPE_PX = 110;           // 이만큼 좌우로 끌면 드로우·페이드 최대
const SHAPE_MAX = 30;           // stanceDeg10 최대(±3°)
const BALL_R = 46;              // 아래 큰 공
const BALL_CENTER_BOTTOM = 96;  // 큰 공 중심의 화면 아래 높이
const RING_R = 92;              // DRAW/FADE 링
const MAX_PASSES = 4;
const ARC_W_FRAC = 0.74, ARC_H = 56;
/** 창을 벗어난 정도 → 당점 붕괴(오너 지정: 빨리 = 대가리 +, 늦게 = 뒷땅 −) */
const MISS_TAPY = 45;

function arcPoint(w: number, t: number) {
    const p0 = { x: 12, y: ARC_H - 10 }, p1 = { x: w / 2, y: 6 }, p2 = { x: w - 12, y: ARC_H - 10 };
    const u = 1 - t;
    return {
        x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
        y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
        deg: (Math.atan2(2 * u * (p1.y - p0.y) + 2 * t * (p2.y - p1.y), 2 * u * (p1.x - p0.x) + 2 * t * (p2.x - p1.x)) * 180) / Math.PI,
    };
}

export function ArcSwing({ zoneMs, sweepMs, teeBottomPx, ctrlH, onShot, onAim }: Props) {
    const [phase, setPhase] = useState<"idle" | "pull" | "swing">("idle");
    const [power, setPower] = useState(0);
    const [shape, setShape] = useState(0);            // stanceDeg10 (+ 드로우)
    const [needle, setNeedle] = useState(0.5);
    const [pull, setPull] = useState({ x: 0, y: 0 });
    const [size, setSize] = useState({ w: 375, h: 812 });
    const boxRef = useRef<HTMLDivElement>(null);
    const start = useRef<{ x: number; y: number } | null>(null);
    const release = useRef<{ t0: number; power: number; shape: number } | null>(null);
    const raf = useRef(0);
    const done = useRef(false);

    useEffect(() => {
        const el = boxRef.current; if (!el) return;
        const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
        ro.observe(el); setSize({ w: el.clientWidth, h: el.clientHeight });
        return () => { ro.disconnect(); cancelAnimationFrame(raf.current); };
    }, []);

    const reset = () => { setPhase("idle"); setPower(0); setShape(0); setNeedle(0.5); setPull({ x: 0, y: 0 }); onAim?.(0, 0); };

    const fire = (impactMs: number, noTap: boolean) => {
        if (done.current || !release.current) return;
        done.current = true;
        cancelAnimationFrame(raf.current);
        const r = release.current;
        release.current = null;
        reset();
        const t = impactMs / zoneMs;
        const over = Math.min(1.5, Math.max(0, Math.abs(t) - 1));
        const tapY = Math.max(-100, Math.min(100, Math.round((t < 0 ? 1 : -1) * over * MISS_TAPY)));
        onShot({ powerPct: r.power, impactMs: Math.max(-400, Math.min(400, Math.round(impactMs))), padX: 0, tapX: 0, tapY, noTap, stanceDeg10: r.shape });
    };

    const needleAt = (el: number) => {
        const u = el / sweepMs, pass = Math.floor(u), frac = u - pass;
        return { pos: pass % 2 === 0 ? frac : 1 - frac, pass, errMs: (frac - 0.5) * sweepMs };
    };

    const onDown = (e: RPE) => {
        if (phase === "swing") { const r = release.current; if (r) fire(needleAt(e.timeStamp - r.t0).errMs, false); return; }
        const b = boxRef.current?.getBoundingClientRect(); if (!b) return;
        if (e.clientY < b.bottom - ctrlH) return;          // 조작 영역(아래)에서만 끌기가 시작된다
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        start.current = { x: e.clientX, y: e.clientY };
        done.current = false;
        setPhase("pull"); setPower(0); setShape(0); setPull({ x: 0, y: 0 });
    };
    const onMove = (e: RPE) => {
        if (phase !== "pull" || !start.current) return;
        const dx = e.clientX - start.current.x, dy = e.clientY - start.current.y;
        const p = Math.max(0, Math.min(115, Math.round((dy / MAX_PULL_PX) * 100)));
        const sh = Math.max(-SHAPE_MAX, Math.min(SHAPE_MAX, Math.round((-dx / SHAPE_PX) * SHAPE_MAX)));
        setPull({ x: dx, y: Math.max(0, dy) }); setPower(p); setShape(sh); onAim?.(p, sh);
    };
    const onUp = (e: RPE) => {
        if (phase !== "pull" || !start.current) return;
        const dy = e.clientY - start.current.y;
        const p = Math.max(0, Math.min(115, Math.round((dy / MAX_PULL_PX) * 100)));
        const sh = shape;
        start.current = null;
        if (p < 20) { reset(); return; }
        const t0 = e.timeStamp;
        release.current = { t0, power: p, shape: sh };
        setPull({ x: 0, y: 0 });
        setPhase("swing");
        const loop = () => {
            if (!release.current) return;
            const n = needleAt(performance.now() - t0);
            setNeedle(n.pos);
            if (n.pass >= MAX_PASSES) { fire(zoneMs * 2.6, true); return; }
            raf.current = requestAnimationFrame(loop);
        };
        raf.current = requestAnimationFrame(loop);
    };

    const zoneFrac = Math.min(0.46, zoneMs / sweepMs);
    const perfectFrac = zoneFrac * 0.33;
    const arcW = Math.round(size.w * ARC_W_FRAC);
    const np = arcPoint(arcW, needle);
    const arcD = `M 12 ${ARC_H - 10} Q ${arcW / 2} 6 ${arcW - 12} ${ARC_H - 10}`;
    const teeY = size.h - teeBottomPx;                       // 티 위의 공(화면 y)
    const arcTop = Math.max(72, teeY - 152);                 // 아크는 티 위의 공 위쪽
    const ballCy = size.h - BALL_CENTER_BOTTOM;              // 큰 공 중심(화면 y)
    const shapeF = shape / SHAPE_MAX;
    const beamH = Math.max(0, ballCy - BALL_R - teeY - 8);   // 붉은 줄기: 티 위의 공 → 큰 공

    return (
        <div ref={boxRef} className="absolute inset-0 select-none touch-none" style={{ overscrollBehavior: "none" }}
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>

            {/* 아크 미터 */}
            <svg width={arcW} height={ARC_H} className="absolute pointer-events-none"
                style={{ left: (size.w - arcW) / 2, top: arcTop, opacity: phase === "swing" ? 1 : 0.6, filter: "drop-shadow(0 3px 7px rgba(0,0,0,0.5))" }}>
                <path d={arcD} pathLength={100} fill="none" stroke="rgba(255,255,255,0.88)" strokeWidth={23} strokeLinecap="butt" />
                <path d={arcD} pathLength={100} fill="none" stroke="#2f56c8" strokeWidth={19} strokeDasharray={`${Math.min(96, zoneFrac * 200)} 100`} strokeDashoffset={-(50 - Math.min(48, zoneFrac * 100))} />
                <path d={arcD} pathLength={100} fill="none" stroke="#2fb34a" strokeWidth={19} strokeDasharray={`${zoneFrac * 100} 100`} strokeDashoffset={-(50 - zoneFrac * 50)} />
                <path d={arcD} pathLength={100} fill="none" stroke="#f4c20d" strokeWidth={19} strokeDasharray={`${perfectFrac * 100} 100`} strokeDashoffset={-(50 - perfectFrac * 50)} />
                {[0.16, 0.32, 0.68, 0.84].map((t) => { const q = arcPoint(arcW, t); return <g key={t} transform={`translate(${q.x} ${q.y}) rotate(${q.deg})`}><rect x={-0.75} y={-6} width={1.5} height={12} fill="rgba(0,0,0,0.25)" /></g>; })}
                {phase === "swing" && <g transform={`translate(${np.x} ${np.y}) rotate(${np.deg})`}><path d="M 0 -16 L 6.5 3 L 0 10 L -6.5 3 Z" fill="#fff" stroke="rgba(0,0,0,0.4)" strokeWidth={1} /></g>}
            </svg>
            <div className="absolute inset-x-0 flex justify-between px-[15%] text-[9.5px] font-bold text-white/70 pointer-events-none drop-shadow" style={{ top: arcTop + ARC_H + 1 }}>
                <span>대가리(빨리)</span><span>뒷땅(늦게)</span>
            </div>

            {/* POWER — 티 위의 공 옆 */}
            <div className="absolute pointer-events-none leading-none" style={{ left: size.w / 2 + 38, top: teeY - 24, opacity: phase === "idle" ? 0.55 : 1 }}>
                <div className="text-[12px] font-extrabold tracking-[0.14em] text-white drop-shadow">POWER</div>
                <div className={cn("text-[30px] font-extrabold tabular-nums drop-shadow", power > 100 ? "text-red-400" : "text-white")}>{power}<span className="text-[15px]">%</span></div>
                {shape !== 0 && <div className="text-[11.5px] font-extrabold text-[#64DD17] drop-shadow mt-0.5">{shape > 0 ? "드로우" : "페이드"} {Math.abs(shape / 10).toFixed(1)}°</div>}
            </div>

            {/* 붉은 빛줄기 — 티 위의 공에서 큰 공까지, 파워만큼 진해진다 */}
            {phase !== "idle" && beamH > 0 && (
                <div className="absolute left-1/2 pointer-events-none" style={{ top: teeY + 8, height: beamH, width: 30, transform: `translateX(calc(-50% + ${pull.x * 0.15}px))`, background: "linear-gradient(0deg, rgba(255,64,48,0.8), rgba(255,64,48,0.04))", filter: "blur(5px)", opacity: 0.3 + 0.7 * Math.min(1, power / 100) }} />
            )}

            {/* 아래 조작: DRAW/FADE 링 + 큰 공 */}
            <div className="absolute pointer-events-none rounded-full border-[3px] border-white/30" style={{ left: size.w / 2 - RING_R, top: ballCy - RING_R, width: RING_R * 2, height: RING_R * 2 }} />
            <div className="absolute pointer-events-none flex items-center justify-between" style={{ left: 16, right: 16, top: ballCy - 15 }}>
                <span className={cn("px-3 py-1 rounded-full text-[15px] font-extrabold tracking-wide backdrop-blur-sm transition-colors", shapeF > 0.15 ? "bg-[#64DD17]/25 text-[#64DD17]" : "bg-black/30 text-white/85")}>DRAW</span>
                <span className={cn("px-3 py-1 rounded-full text-[15px] font-extrabold tracking-wide backdrop-blur-sm transition-colors", shapeF < -0.15 ? "bg-[#64DD17]/25 text-[#64DD17]" : "bg-black/30 text-white/85")}>FADE</span>
            </div>
            {phase === "pull" && pull.y > 4 && (
                <div className="absolute left-1/2 rounded-full pointer-events-none" style={{ top: ballCy - 6, width: 14, height: Math.min(pull.y, 150), transform: `translateX(calc(-50% + ${pull.x * 0.5}px))`, background: "linear-gradient(180deg, rgba(255,72,56,0.9), rgba(255,72,56,0))" }} />
            )}
            <div
                className="absolute left-1/2 rounded-full bg-[#ffffff] pointer-events-none"
                style={{
                    width: BALL_R * 2, height: BALL_R * 2, top: ballCy - BALL_R,
                    transform: `translateX(calc(-50% + ${phase === "pull" ? pull.x * 0.3 : 0}px)) translateY(${phase === "pull" ? Math.min(pull.y * 0.2, 18) : 0}px)`,
                    boxShadow: "inset -12px -12px 22px rgba(0,0,0,0.25), 0 10px 22px rgba(0,0,0,0.5)",
                }}
            >
                <div className="absolute left-1/2 top-1/2 w-[9px] h-[9px] rounded-full bg-[#64DD17]/60 -translate-x-1/2 -translate-y-1/2" />
                {phase === "swing" && <div className="absolute inset-0 rounded-full ring-2 ring-[#64DD17]/80 animate-pulse" />}
            </div>
            <div className="absolute inset-x-0 text-center text-[11px] font-bold text-white/75 pointer-events-none drop-shadow" style={{ top: ballCy - RING_R - 24 }}>
                {phase === "idle" ? "공을 뒤로 끌어 파워 · 좌우로 DRAW / FADE" : phase === "pull" ? "놓으면 바늘이 왕복합니다" : "가운데 창에 올 때 탭!"}
            </div>
        </div>
    );
}
