/**
 * 아크 스윙(오너 지정 2026-09-15, 골프 슈퍼 크루 형태) — 큰 공 + 위쪽 아크 미터. 세 동작뿐이다.
 *
 *   1) 큰 공을 **뒤(아래)로 끈다** → 당긴 거리 = 파워(20~115 %)
 *   2) 끌면서 **좌우로** → 드로우(왼쪽) · 페이드(오른쪽). 엔진의 스탠스(스윙 패스)로 들어간다
 *   3) 놓으면 위쪽 아크를 바늘이 **왕복** → 가운데 초록 창에 올 때 **탭**
 *        · 창 안이면 정타, 탭 위치가 페이스를 정한다(이르면 닫힘=드로우, 늦으면 열림=페이드)
 *        · 창을 벗어나면 컨택까지 무너진다 — 이르면 클럽이 먼저 바닥을 쳐 **뒷땅**, 늦으면 올라오며 **얇게·탑**
 *        · 4번 지나도록 안 치면 헛스윙
 * 당점을 고르는 메뉴는 없다. 미스는 전부 실행의 결과다.
 */
import { useEffect, useRef, useState, type PointerEvent as RPE } from "react";
import { cn } from "@/lib/utils";
import type { ClubId } from "@shared/golf/field/types";
import type { SwingResult } from "./SwingPad";

interface Props {
    club: ClubId;
    zoneMs: number;
    sweepMs: number;
    teed?: boolean;
    disabled?: boolean;
    onShot: (r: SwingResult) => void;
    /** 끄는 동안 파워·스탠스 미리보기(필드의 예상 착지 링) */
    onAim?: (powerPct: number, stanceDeg10: number) => void;
}

const MAX_PULL_PX = 150;       // 이만큼 아래로 끌면 100 %
const SHAPE_PX = 110;          // 이만큼 좌우로 끌면 드로우·페이드 최대
const SHAPE_MAX = 30;          // stanceDeg10 최대(±3°)
const BALL_R = 44;
const MAX_PASSES = 4;
const ARC_H = 56;
/** 창을 벗어난 정도 → 당점 붕괴(이르면 뒷땅 −, 늦으면 얇게 +) */
const MISS_TAPY = 45;

/** 2차 베지어 위의 점과 접선 각도 */
function arcPoint(w: number, t: number) {
    const p0 = { x: 14, y: ARC_H - 8 }, p1 = { x: w / 2, y: 8 }, p2 = { x: w - 14, y: ARC_H - 8 };
    const u = 1 - t;
    return {
        x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
        y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
        deg: (Math.atan2(2 * u * (p1.y - p0.y) + 2 * t * (p2.y - p1.y), 2 * u * (p1.x - p0.x) + 2 * t * (p2.x - p1.x)) * 180) / Math.PI,
    };
}

export function ArcSwing({ club, zoneMs, sweepMs, teed, disabled, onShot, onAim }: Props) {
    const [phase, setPhase] = useState<"idle" | "pull" | "swing">("idle");
    const [power, setPower] = useState(0);
    const [shape, setShape] = useState(0);            // stanceDeg10 (+ 드로우)
    const [needle, setNeedle] = useState(0.5);
    const [pull, setPull] = useState({ x: 0, y: 0 });
    const [w, setW] = useState(320);
    const boxRef = useRef<HTMLDivElement>(null);
    const start = useRef<{ x: number; y: number } | null>(null);
    const release = useRef<{ t0: number; power: number; shape: number } | null>(null);
    const raf = useRef(0);
    const done = useRef(false);

    useEffect(() => {
        const el = boxRef.current; if (!el) return;
        const ro = new ResizeObserver(() => setW(el.clientWidth));
        ro.observe(el); setW(el.clientWidth);
        return () => { ro.disconnect(); cancelAnimationFrame(raf.current); };
    }, []);
    useEffect(() => { if (disabled) { setPhase("idle"); setPull({ x: 0, y: 0 }); } }, [disabled]);

    const reset = () => { setPhase("idle"); setPower(0); setShape(0); setNeedle(0.5); setPull({ x: 0, y: 0 }); onAim?.(0, 0); };

    const fire = (impactMs: number, noTap: boolean) => {
        if (done.current || !release.current) return;
        done.current = true;
        cancelAnimationFrame(raf.current);
        const r = release.current;
        release.current = null;
        reset();
        // 창 밖이면 당점까지 무너진다: 이르면 클럽이 먼저 바닥(뒷땅), 늦으면 올라오며(얇게)
        const t = impactMs / zoneMs;
        const over = Math.min(1.5, Math.max(0, Math.abs(t) - 1));
        const tapY = Math.max(-100, Math.min(100, Math.round((t < 0 ? -1 : 1) * over * MISS_TAPY)));
        onShot({
            powerPct: r.power, impactMs: Math.max(-400, Math.min(400, Math.round(impactMs))),
            padX: 0, tapX: 0, tapY, noTap, stanceDeg10: r.shape,
        });
    };

    const needleAt = (el: number) => {
        const u = el / sweepMs, pass = Math.floor(u), frac = u - pass;
        return { pos: pass % 2 === 0 ? frac : 1 - frac, pass, errMs: (frac - 0.5) * sweepMs };
    };

    const onDown = (e: RPE) => {
        if (disabled) return;
        if (phase === "swing") { const r = release.current; if (r) fire(needleAt(e.timeStamp - r.t0).errMs, false); return; }
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        start.current = { x: e.clientX, y: e.clientY };
        done.current = false;
        setPhase("pull"); setPower(0); setShape(0); setPull({ x: 0, y: 0 });
    };

    const onMove = (e: RPE) => {
        if (phase !== "pull" || !start.current) return;
        const dx = e.clientX - start.current.x, dy = e.clientY - start.current.y;
        const p = Math.max(0, Math.min(115, Math.round((dy / MAX_PULL_PX) * 100)));
        // 왼쪽으로 끌면 드로우(스탠스 +, 인투아웃), 오른쪽이면 페이드
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

    const zoneFrac = Math.min(0.48, zoneMs / sweepMs);
    const perfectFrac = zoneFrac * 0.33;
    const np = arcPoint(w, needle);
    const arcD = `M 14 ${ARC_H - 8} Q ${w / 2} 8 ${w - 14} ${ARC_H - 8}`;
    const shapeF = shape / SHAPE_MAX;
    const ballBottom = teed ? 76 : 70;   // 공이 잘리지 않게 지면 위로 넉넉히

    return (
        <div
            ref={boxRef}
            className={cn("relative select-none touch-none h-full w-full rounded-[1.5rem] overflow-hidden", disabled ? "opacity-40" : "")}
            style={{ background: "radial-gradient(130% 100% at 50% 100%, rgba(100,221,23,0.12), rgba(255,255,255,0.03) 62%)", overscrollBehavior: "none" }}
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        >
            {/* 아크 미터 */}
            <svg width={w} height={ARC_H} className="absolute left-0 top-1.5 pointer-events-none" style={{ opacity: phase === "swing" ? 1 : 0.3 }}>
                <path d={arcD} pathLength={100} fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth={18} strokeLinecap="round" />
                <path d={arcD} pathLength={100} fill="none" stroke="rgba(100,221,23,0.30)" strokeWidth={18} strokeDasharray={`${zoneFrac * 100} 100`} strokeDashoffset={-(50 - zoneFrac * 50)} />
                <path d={arcD} pathLength={100} fill="none" stroke="rgba(100,221,23,0.9)" strokeWidth={18} strokeDasharray={`${perfectFrac * 100} 100`} strokeDashoffset={-(50 - perfectFrac * 50)} />
                {phase === "swing" && <g transform={`translate(${np.x} ${np.y}) rotate(${np.deg})`}><rect x={-2.5} y={-14} width={5} height={28} rx={2.5} fill="#fff" /></g>}
            </svg>

            {/* 드로우 · 페이드 */}
            <div className="absolute inset-x-0 pointer-events-none flex items-center justify-between px-5" style={{ bottom: ballBottom + BALL_R - 14 }}>
                <span className={cn("text-[13px] font-extrabold tracking-wide transition-colors", shapeF > 0.15 ? "text-[#64DD17]" : "text-white/25")}>DRAW</span>
                <span className={cn("text-[13px] font-extrabold tracking-wide transition-colors", shapeF < -0.15 ? "text-[#64DD17]" : "text-white/25")}>FADE</span>
            </div>

            {/* 지면 · 공 */}
            <div className="absolute inset-x-0 bg-[#2f7a34]" style={{ top: `calc(100% - ${teed ? 34 : 42}px)`, bottom: 0 }} />
            {teed && <div className="absolute left-1/2 -translate-x-1/2 w-[6px] rounded-b bg-white/60" style={{ bottom: 18, height: 26 }} />}
            {phase === "pull" && pull.y > 4 && (
                <div className="absolute left-1/2 rounded-full" style={{ bottom: ballBottom, width: 12, height: pull.y, transform: `translateX(calc(-50% + ${pull.x * 0.5}px))`, background: "linear-gradient(180deg, rgba(255,72,56,0.9), rgba(255,72,56,0))" }} />
            )}
            <div
                className="absolute left-1/2 rounded-full bg-[#ffffff]"
                style={{
                    width: BALL_R * 2, height: BALL_R * 2, bottom: ballBottom - BALL_R + 6,
                    transform: `translateX(calc(-50% + ${phase === "pull" ? pull.x * 0.3 : 0}px)) translateY(${phase === "pull" ? Math.min(pull.y * 0.2, 18) : 0}px)`,
                    boxShadow: "inset -11px -11px 20px rgba(0,0,0,0.25), 0 8px 16px rgba(0,0,0,0.5)",
                }}
            >
                <div className="absolute left-1/2 top-1/2 w-[9px] h-[9px] rounded-full bg-[#64DD17]/60 -translate-x-1/2 -translate-y-1/2" />
                {phase === "swing" && <div className="absolute inset-0 rounded-full ring-2 ring-white/70 animate-pulse" />}
            </div>

            {/* 파워 · 구질 */}
            <div className="absolute right-3 top-[40%] text-right leading-none pointer-events-none">
                <div className="text-[10px] font-extrabold tracking-[0.18em] text-white/40">POWER</div>
                <div className={cn("text-[25px] font-extrabold tabular-nums", power > 100 ? "text-red-400" : "text-white")}>{power}<span className="text-[13px]">%</span></div>
                {shape !== 0 && <div className="text-[11px] font-extrabold text-[#64DD17] mt-0.5">{shape > 0 ? "드로우" : "페이드"} {Math.abs(shape / 10).toFixed(1)}°</div>}
            </div>
            <div className="absolute left-3 top-2 text-[10px] font-extrabold tracking-[0.2em] text-white/30">SWING</div>
            <div className="absolute inset-x-0 text-center text-[11.5px] font-bold pointer-events-none" style={{ top: ARC_H + 8 }}>
                <span className={cn(phase === "swing" ? "text-[#64DD17]" : "text-white/45")}>
                    {phase === "idle" ? "공을 뒤로 끌어 파워 · 좌우로 드로우/페이드" : phase === "pull" ? "놓으면 바늘이 왕복합니다" : "초록 창에 올 때 탭!"}
                </span>
            </div>
        </div>
    );
}
