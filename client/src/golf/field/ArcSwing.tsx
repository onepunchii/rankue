/**
 * 스윙 조작(오너 확정 2026-09-15~16 — 골프 슈퍼 크루 구성). 화면 전체를 덮는 투명 오버레이. 입력 방식은 이것 하나다.
 *
 *   위쪽: 아크 미터 · 가운데: 티 위의 공 + POWER % · 아래: DRAW/FADE 링과 그 한가운데 놓인 공
 *   1) 링 한가운데의 공을 **뒤(아래)로 끈다** → 끌수록 **공이 커지고** 파워가 오른다(20~115 %). 붉은 빛줄기가 티까지 뻗는다
 *   2) 끌면서 **좌우로** → DRAW(왼쪽) / FADE(오른쪽). 많이 끌수록 심해진다(±5°, 엔진 스탠스 = 스윙 패스)
 *   3) 놓으면 아크를 바늘이 **왕복** → 창에 올 때 **아무 데나 탭**
 *        · 창 안: 정타. 탭 위치가 페이스(이르면 닫힘, 늦으면 열림)
 *        · 창 밖: 빨리(왼쪽) = 대가리, 늦게(오른쪽) = 뒷땅. 4번 지나도록 안 치면 헛스윙
 *   ★ 100 % 를 넘기면(오버스윙) 바늘이 빨라지고 아크가 흔들린다 — 엔진도 같은 구간에서 창을 좁힌다(zoneMsFor).
 */
import { useEffect, useRef, useState, type PointerEvent as RPE } from "react";
import { cn } from "@/lib/utils";
import { CLUBS } from "@shared/golf/field/clubs";
import { zoneMsFor } from "@shared/golf/field/impact";
import type { ClubId } from "@shared/golf/field/types";

export interface SwingResult {
    powerPct: number; impactMs: number; padX: number; tapX: number; tapY: number;
    /** 4번 지나도록 안 쳤다 */
    noTap: boolean;
    /** 끌어서 정한 스탠스(드로우 +) */
    stanceDeg10: number;
}

interface Props {
    club: ClubId;
    ballPos: number;
    /** 티 위의 공(필드 캔버스의 티)이 화면 아래에서 뜬 높이(px) */
    teeBottomPx: number;
    /** 링(=공의 집)이 화면 아래에서 뜬 높이(px) */
    homeBottomPx: number;
    onShot: (r: SwingResult) => void;
    /** 끄는 동안 파워·스탠스 미리보기(필드의 예상 착지 링) */
    onAim?: (powerPct: number, stanceDeg10: number) => void;
}

const MAX_PULL_PX = 145;        // 이만큼 끌면 100 % (115 % 까지 167 px — 화면 안에 들어온다)
const BALL_TRAVEL_MAX = 150;    // 공 그림이 따라 내려가는 한계
const SHAPE_PX = 120;           // 이만큼 좌우로 끌면 드로우·페이드 최대
const SHAPE_MAX = 50;           // stanceDeg10 최대(±5°) — 많이 끌수록 심해진다
const BALL_R_IDLE = 26, BALL_R_FULL = 48;
const RING_R = 88;
const MAX_PASSES = 4;
const ARC_W_FRAC = 0.74, ARC_H = 56;
/** 창을 벗어난 정도 → 당점 붕괴(오너 지정: 빨리 = 대가리 +, 늦게 = 뒷땅 −) */
const MISS_TAPY = 45;

/** 오버스윙(100 % 초과)이면 바늘이 빨라진다 — 115 % 에서 0.65배 */
function sweepMulFor(powerPct: number): number {
    return powerPct <= 100 ? 1 : Math.max(0.6, 1 - (0.35 * (powerPct - 100)) / 15);
}

function arcPoint(w: number, t: number) {
    const p0 = { x: 12, y: ARC_H - 10 }, p1 = { x: w / 2, y: 6 }, p2 = { x: w - 12, y: ARC_H - 10 };
    const u = 1 - t;
    return {
        x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
        y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
        deg: (Math.atan2(2 * u * (p1.y - p0.y) + 2 * t * (p2.y - p1.y), 2 * u * (p1.x - p0.x) + 2 * t * (p2.x - p1.x)) * 180) / Math.PI,
    };
}

export function ArcSwing({ club, ballPos, teeBottomPx, homeBottomPx, onShot, onAim }: Props) {
    const [phase, setPhase] = useState<"idle" | "pull" | "swing">("idle");
    const [power, setPower] = useState(0);
    const [shape, setShape] = useState(0);            // stanceDeg10 (+ 드로우)
    const [needle, setNeedle] = useState(0.5);
    const [shake, setShake] = useState(0);
    const [pull, setPull] = useState({ x: 0, y: 0 });
    const [size, setSize] = useState({ w: 375, h: 812 });
    const boxRef = useRef<HTMLDivElement>(null);
    const start = useRef<{ x: number; y: number } | null>(null);
    const release = useRef<{ t0: number; power: number; shape: number; zoneMs: number; sweepMs: number } | null>(null);
    const raf = useRef(0);
    const done = useRef(false);

    useEffect(() => {
        const el = boxRef.current; if (!el) return;
        const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
        ro.observe(el); setSize({ w: el.clientWidth, h: el.clientHeight });
        return () => { ro.disconnect(); cancelAnimationFrame(raf.current); };
    }, []);

    const reset = () => { setPhase("idle"); setPower(0); setShape(0); setNeedle(0.5); setShake(0); setPull({ x: 0, y: 0 }); onAim?.(0, 0); };

    const fire = (impactMs: number, noTap: boolean) => {
        if (done.current || !release.current) return;
        done.current = true;
        cancelAnimationFrame(raf.current);
        const r = release.current;
        release.current = null;
        reset();
        const t = impactMs / r.zoneMs;
        const over = Math.min(1.5, Math.max(0, Math.abs(t) - 1));
        const tapY = Math.max(-100, Math.min(100, Math.round((t < 0 ? 1 : -1) * over * MISS_TAPY)));
        onShot({ powerPct: r.power, impactMs: Math.max(-400, Math.min(400, Math.round(impactMs))), padX: 0, tapX: 0, tapY, noTap, stanceDeg10: r.shape });
    };

    /**
     * 경과 시간 → 바늘 위치(왕복)와 오차.
     * 오차는 **화면에 보이는 위치** 로 잰다 — 되돌아오는 패스(오른쪽→왼쪽)에서는 frac 이 뒤집히므로
     * frac 으로 재면 왼쪽(대가리)을 쳐도 늦음(뒷땅)으로 나온다. 2026-09-16 오너 제보 버그.
     */
    const needleAt = (el: number, sweepMs: number) => {
        const u = el / sweepMs, pass = Math.floor(u), frac = u - pass;
        const pos = pass % 2 === 0 ? frac : 1 - frac;
        return { pos, pass, errMs: (pos - 0.5) * sweepMs };
    };

    const onDown = (e: RPE) => {
        if (phase === "swing") { const r = release.current; if (r) fire(needleAt(e.timeStamp - r.t0, r.sweepMs).errMs, false); return; }
        const b = boxRef.current?.getBoundingClientRect(); if (!b) return;
        // 링 근처(=공의 집)에서만 끌기가 시작된다. 위쪽은 조준 띠·클럽 바가 산다
        if (e.clientY < b.bottom - homeBottomPx - RING_R - 30) return;
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
        const zoneMs = zoneMsFor(club, "tee", p, sh, ballPos);
        const sweepMs = CLUBS[club].sweepMs * sweepMulFor(p);
        const t0 = e.timeStamp;
        release.current = { t0, power: p, shape: sh, zoneMs, sweepMs };
        setPhase("swing");
        const loop = () => {
            const r = release.current; if (!r) return;
            const el = performance.now() - t0;
            const n = needleAt(el, r.sweepMs);
            setNeedle(n.pos);
            // 오버스윙이면 아크가 떨린다(치기 어렵게)
            setShake(r.power > 100 ? ((r.power - 100) / 15) * 3.5 * Math.sin(el / 26) : 0);
            if (n.pass >= MAX_PASSES) { fire(r.zoneMs * 2.6, true); return; }
            raf.current = requestAnimationFrame(loop);
        };
        raf.current = requestAnimationFrame(loop);
    };

    // 표시용 창: 끌기 전엔 100 % 기준, 끄는 중·스윙 중엔 실제 파워 기준
    const shownPower = phase === "idle" ? 100 : Math.max(20, power);
    const zoneMsNow = release.current?.zoneMs ?? zoneMsFor(club, "tee", shownPower, shape, ballPos);
    const sweepMsNow = release.current?.sweepMs ?? CLUBS[club].sweepMs * sweepMulFor(shownPower);
    const zoneFrac = Math.min(0.46, zoneMsNow / sweepMsNow);
    const perfectFrac = zoneFrac * 0.33;
    const arcW = Math.round(size.w * ARC_W_FRAC);
    const np = arcPoint(arcW, needle);
    const arcD = `M 12 ${ARC_H - 10} Q ${arcW / 2} 6 ${arcW - 12} ${ARC_H - 10}`;
    const teeY = size.h - teeBottomPx;                        // 티 위의 공(화면 y)
    const arcTop = Math.max(74, teeY - 190);
    const homeY = size.h - homeBottomPx;                      // 링 = 공의 집(화면 y)
    const travel = Math.min(pull.y, BALL_TRAVEL_MAX);
    const ballCy = homeY + (phase === "idle" ? 0 : travel);
    const ballCx = size.w / 2 + (phase === "idle" ? 0 : pull.x * 0.45);
    const ballR = BALL_R_IDLE + (BALL_R_FULL - BALL_R_IDLE) * Math.min(1, power / 100);
    const shapeF = shape / SHAPE_MAX;
    const beamTop = teeY + 8, beamH = Math.max(0, ballCy - ballR - beamTop);
    const over = power > 100;

    return (
        <div ref={boxRef} className="absolute inset-0 select-none touch-none" style={{ overscrollBehavior: "none" }}
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>

            {/* 아크 미터 — 오버스윙이면 떨린다 */}
            <svg width={arcW} height={ARC_H} className="absolute pointer-events-none"
                style={{ left: (size.w - arcW) / 2, top: arcTop, transform: `translateX(${shake}px)`, opacity: phase === "swing" ? 1 : 0.6, filter: "drop-shadow(0 3px 7px rgba(0,0,0,0.5))" }}>
                <path d={arcD} pathLength={100} fill="none" stroke="rgba(255,255,255,0.88)" strokeWidth={23} strokeLinecap="butt" />
                <path d={arcD} pathLength={100} fill="none" stroke="#2f56c8" strokeWidth={19} strokeDasharray={`${Math.min(96, zoneFrac * 200)} 100`} strokeDashoffset={-(50 - Math.min(48, zoneFrac * 100))} />
                <path d={arcD} pathLength={100} fill="none" stroke="#2fb34a" strokeWidth={19} strokeDasharray={`${zoneFrac * 100} 100`} strokeDashoffset={-(50 - zoneFrac * 50)} />
                <path d={arcD} pathLength={100} fill="none" stroke="#f4c20d" strokeWidth={19} strokeDasharray={`${perfectFrac * 100} 100`} strokeDashoffset={-(50 - perfectFrac * 50)} />
                {[0.16, 0.32, 0.68, 0.84].map((t) => { const q = arcPoint(arcW, t); return <g key={t} transform={`translate(${q.x} ${q.y}) rotate(${q.deg})`}><rect x={-0.75} y={-6} width={1.5} height={12} fill="rgba(0,0,0,0.25)" /></g>; })}
                {phase === "swing" && <g transform={`translate(${np.x} ${np.y}) rotate(${np.deg})`}><path d="M 0 -16 L 6.5 3 L 0 10 L -6.5 3 Z" fill={over ? "#ff5a3c" : "#fff"} stroke="rgba(0,0,0,0.4)" strokeWidth={1} /></g>}
            </svg>
            <div className="absolute inset-x-0 flex justify-between px-[15%] text-[9.5px] font-bold text-white/70 pointer-events-none drop-shadow" style={{ top: arcTop + ARC_H + 1 }}>
                <span>대가리(빨리)</span><span>뒷땅(늦게)</span>
            </div>

            {/* POWER — 티 위의 공 옆 */}
            <div className="absolute pointer-events-none leading-none" style={{ left: size.w / 2 + 38, top: teeY - 24, opacity: phase === "idle" ? 0.5 : 1 }}>
                <div className="text-[12px] font-extrabold tracking-[0.14em] text-white drop-shadow">POWER</div>
                <div className={cn("text-[30px] font-extrabold tabular-nums drop-shadow", over ? "text-[#ff5a3c]" : "text-white")}>{power}<span className="text-[15px]">%</span></div>
                {shape !== 0 && <div className="text-[11.5px] font-extrabold text-[#64DD17] drop-shadow mt-0.5">{shape > 0 ? "드로우" : "페이드"} {Math.abs(shape / 10).toFixed(1)}°</div>}
                {over && <div className="text-[10.5px] font-extrabold text-[#ff5a3c] drop-shadow mt-0.5">오버스윙 · 창이 좁고 빨라져요</div>}
            </div>

            {/* 붉은 빛줄기 — 티 위의 공에서 끌고 있는 공까지 */}
            {phase !== "idle" && beamH > 0 && (
                <div className="absolute pointer-events-none" style={{ left: ballCx - 16, top: beamTop, height: beamH, width: 32, background: "linear-gradient(0deg, rgba(255,64,48,0.85), rgba(255,64,48,0.04))", filter: "blur(5px)", opacity: 0.3 + 0.7 * Math.min(1, power / 100) }} />
            )}

            {/* DRAW / FADE 링 — 공의 집 */}
            <div className="absolute pointer-events-none rounded-full border-[3px] border-white/30" style={{ left: size.w / 2 - RING_R, top: homeY - RING_R, width: RING_R * 2, height: RING_R * 2 }} />
            <div className="absolute pointer-events-none flex items-center justify-between" style={{ left: 14, right: 14, top: homeY - 15 }}>
                <span className={cn("px-3 py-1 rounded-full text-[15px] font-extrabold tracking-wide backdrop-blur-sm transition-colors", shapeF > 0.15 ? "bg-[#64DD17]/30 text-[#64DD17]" : "bg-black/30 text-white/85")}>DRAW</span>
                <span className={cn("px-3 py-1 rounded-full text-[15px] font-extrabold tracking-wide backdrop-blur-sm transition-colors", shapeF < -0.15 ? "bg-[#64DD17]/30 text-[#64DD17]" : "bg-black/30 text-white/85")}>FADE</span>
            </div>
            {/* 구질 양 — 링 위에서 좌우로 뻗는 막대 */}
            {shape !== 0 && (
                <div className="absolute pointer-events-none h-[4px] rounded-full bg-[#64DD17]" style={{ top: homeY - 2, left: shape > 0 ? size.w / 2 - RING_R * Math.abs(shapeF) : size.w / 2, width: RING_R * Math.abs(shapeF), opacity: 0.85 }} />
            )}

            {/* 공 — 링 한가운데에서 시작해 끌면 커지며 따라 내려온다 */}
            <div
                className="absolute rounded-full bg-[#ffffff] pointer-events-none"
                style={{
                    width: ballR * 2, height: ballR * 2, left: ballCx - ballR, top: ballCy - ballR,
                    boxShadow: `inset -${ballR * 0.26}px -${ballR * 0.26}px ${ballR * 0.48}px rgba(0,0,0,0.25), 0 ${Math.round(ballR * 0.2)}px ${Math.round(ballR * 0.45)}px rgba(0,0,0,0.5)`,
                    transition: phase === "idle" ? "width 140ms, height 140ms, left 140ms, top 140ms" : "none",
                }}
            >
                <div className="absolute left-1/2 top-1/2 rounded-full bg-[#64DD17]/60 -translate-x-1/2 -translate-y-1/2" style={{ width: Math.max(6, ballR * 0.2), height: Math.max(6, ballR * 0.2) }} />
                {phase === "swing" && <div className="absolute inset-0 rounded-full ring-2 ring-[#64DD17]/80 animate-pulse" />}
            </div>

            <div className="absolute inset-x-0 text-center text-[11px] font-bold text-white/70 pointer-events-none drop-shadow" style={{ bottom: 6 }}>
                {phase === "idle" ? "공을 뒤로 끌어 파워 · 좌우로 DRAW / FADE" : phase === "pull" ? "놓으면 바늘이 왕복합니다" : "가운데 창에 올 때 탭!"}
            </div>
        </div>
    );
}
