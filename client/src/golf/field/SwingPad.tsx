/**
 * 스윙 패드 v0.3(오너 피드백 2026-09-15: 바늘이 너무 빠르고 한 번만 지나간다 → 왕복하고 느리게).
 * 패드를 아래로 당겨 파워(20~115 %) → 놓으면 바늘이 공을 가로질러 **왕복**한다(한 번 지나는 데 sweepMs) → 바늘이 공에 올 때 패드
 * 아무 데나 탭. 탭 시각 = impactMs(가까운 통과 시각 기준, 통과 전 −/후 +: 이르면 손이 먼저(닫힘), 늦으면 몸이 먼저(열림)).
 * 컨택(힐/토·높이)은 당점 선택기(ContactPicker)에서 미리 고른 값. 놓을 때 가로 흘림 = padX(패스 오차).
 * 4번 왕복해도 탭이 없으면 +2.5·zone(아주 늦음). 시계는 performance.now(), 탭은 PointerEvent.timeStamp.
 */
import { useEffect, useRef, useState, type PointerEvent as RPE } from "react";
import { cn } from "@/lib/utils";
import type { ContactPoint } from "./ContactPicker";

export interface SwingResult { powerPct: number; impactMs: number; padX: number; tapX: number; tapY: number }
interface Props {
    zoneMs: number;          // 창 폭(±)
    sweepMs: number;         // 바늘이 한 번 지나가는 시간
    contact: ContactPoint;   // 당점(엔진 단위)
    teed?: boolean;
    disabled?: boolean;
    onShot: (r: SwingResult) => void;
    onPower?: (powerPct: number) => void;
}

const MAX_PULL_PX = 170;   // 이만큼 당기면 100 %
const MAX_PASSES = 4;      // 왕복 2번(4회 통과) 안에 탭이 없으면 자동
const BALL_PX = 26;

export function SwingPad({ zoneMs, sweepMs, contact, teed, disabled, onShot, onPower }: Props) {
    const [phase, setPhase] = useState<"idle" | "pull" | "impact">("idle");
    const [power, setPower] = useState(0);
    const [needle, setNeedle] = useState(0);          // 0..1 (0.5 = 공)
    const start = useRef<{ x: number; y: number } | null>(null);
    const release = useRef<{ t0: number; power: number; padX: number } | null>(null);
    const raf = useRef(0);
    const done = useRef(false);

    useEffect(() => () => cancelAnimationFrame(raf.current), []);

    const finish = (impactMs: number) => {
        if (!release.current || done.current) return;
        done.current = true;
        cancelAnimationFrame(raf.current);
        const r = release.current;
        release.current = null;
        setPhase("idle"); setNeedle(0); setPower(0);
        onShot({ powerPct: r.power, impactMs: Math.max(-400, Math.min(400, Math.round(impactMs))), padX: r.padX, tapX: contact.x, tapY: contact.y });
    };

    /** 경과 시간 → 바늘 위치(왕복 삼각파)와, 가장 가까운 통과 시각 기준 오차 */
    const needleAt = (elapsed: number) => {
        const u = elapsed / sweepMs;
        const pass = Math.floor(u), frac = u - pass;
        const pos = pass % 2 === 0 ? frac : 1 - frac;
        return { pos, pass, errMs: (frac - 0.5) * sweepMs };
    };

    const onDown = (e: RPE) => {
        if (disabled) return;
        if (phase === "impact") {
            const r = release.current; if (!r) return;
            finish(needleAt(e.timeStamp - r.t0).errMs);
            return;
        }
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        start.current = { x: e.clientX, y: e.clientY };
        done.current = false;
        setPhase("pull"); setPower(0);
    };
    const onMove = (e: RPE) => {
        if (phase !== "pull" || !start.current) return;
        const dy = e.clientY - start.current.y;
        const p = Math.max(0, Math.min(115, Math.round((dy / MAX_PULL_PX) * 100)));
        setPower(p); onPower?.(p);
    };
    const onUp = (e: RPE) => {
        if (phase !== "pull" || !start.current) return;
        const dy = e.clientY - start.current.y;
        const p = Math.max(0, Math.min(115, Math.round((dy / MAX_PULL_PX) * 100)));
        if (p < 20) { setPhase("idle"); setPower(0); start.current = null; onPower?.(0); return; }   // 너무 짧게 당기면 취소
        const pad = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const padX = Math.max(-100, Math.min(100, Math.round(((e.clientX - start.current.x) / (pad.width * 0.35)) * 100)));
        start.current = null;
        const t0 = e.timeStamp;
        release.current = { t0, power: p, padX };
        setPhase("impact");
        const loop = () => {
            if (!release.current) return;
            const el = performance.now() - t0;
            const n = needleAt(el);
            setNeedle(n.pos);
            if (n.pass >= MAX_PASSES) { finish(zoneMs * 2.5); return; }
            raf.current = requestAnimationFrame(loop);
        };
        raf.current = requestAnimationFrame(loop);
    };

    const zoneFrac = Math.min(0.5, zoneMs / sweepMs);       // 창 반폭(0..0.5)
    const perfectFrac = zoneFrac * 0.33;
    const mx = (contact.x / 100) * BALL_PX, my = -(contact.y / 100) * BALL_PX * 1.5;

    return (
        <div
            className={cn("relative select-none touch-none h-full w-full rounded-[1.5rem] overflow-hidden", disabled ? "opacity-40" : "")}
            style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02))", overscrollBehavior: "none" }}
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        >
            {phase !== "impact" ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 pointer-events-none">
                    <div className="w-[72%] h-3 rounded-full bg-white/10 overflow-hidden">
                        <div className={cn("h-full rounded-full transition-[width] duration-75", power > 100 ? "bg-red-400" : "bg-[#64DD17]")} style={{ width: `${Math.min(100, (power / 115) * 100)}%` }} />
                    </div>
                    <div className="text-[13px] font-bold text-white/70 tabular-nums">{phase === "pull" ? `파워 ${power} %` : "아래로 당겨 파워"}</div>
                    <div className="text-[11px] text-white/40 text-center px-4">{phase === "pull" ? "놓으면 바늘이 왕복 · 좌우로 흘리면 패스가 틀어집니다" : "놓으면 바늘이 공을 왕복합니다 · 공에 올 때 아무 데나 탭"}</div>
                </div>
            ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 pointer-events-none">
                    <div className="relative w-[92%] rounded-xl bg-white/[0.06] overflow-hidden" style={{ height: BALL_PX * 3 + 10 }}>
                        <div className="absolute top-0 bottom-0 bg-[#64DD17]/20" style={{ left: `${(0.5 - zoneFrac) * 100}%`, width: `${zoneFrac * 200}%` }} />
                        <div className="absolute top-0 bottom-0 bg-[#64DD17]/50" style={{ left: `${(0.5 - perfectFrac) * 100}%`, width: `${perfectFrac * 200}%` }} />
                        {teed
                            ? <div className="absolute left-1/2 -translate-x-1/2 w-[5px] rounded-b bg-white/50" style={{ top: `calc(50% + ${BALL_PX - 2}px)`, height: BALL_PX * 0.8 }} />
                            : <div className="absolute inset-x-0 bg-[#2f7a34]" style={{ top: `calc(50% + ${BALL_PX - 3}px)`, bottom: 0 }} />}
                        <div className="absolute left-1/2 top-1/2 rounded-full bg-[#ffffff] shadow-[inset_-5px_-5px_9px_rgba(0,0,0,0.25)]" style={{ width: BALL_PX * 2, height: BALL_PX * 2, transform: "translate(-50%, -50%)" }} />
                        {/* 당점 마커 */}
                        <div className="absolute left-1/2 top-1/2 w-[9px] h-[9px] rounded-full bg-[#64DD17] border border-[#051907]" style={{ transform: `translate(calc(-50% + ${mx}px), calc(-50% + ${my}px))` }} />
                        {/* 바늘(클럽) */}
                        <div className="absolute top-0 bottom-0 w-[4px] bg-white rounded-full shadow-[0_0_10px_rgba(255,255,255,0.9)]" style={{ left: `calc(${needle * 100}% - 2px)` }} />
                    </div>
                    <div className="text-[12px] font-bold text-white/70">바늘이 공에 올 때 탭 · 파워 {release.current?.power ?? power} %</div>
                </div>
            )}
            <div className="absolute left-3 top-2 text-[10px] font-extrabold tracking-[0.2em] text-white/30">SWING</div>
            <div className="absolute right-3 top-2 text-[10px] font-bold text-white/30 tabular-nums">창 ±{Math.round(zoneMs)} ms</div>
        </div>
    );
}
