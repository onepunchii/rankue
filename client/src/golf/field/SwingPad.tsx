/**
 * 하이브리드 스윙 입력 v0.2(A안): 패드를 아래로 당겨 파워(20~115 %) → 놓으면 임팩트 창(공 그림)이 뜨고 바늘이 sweepMs 동안
 * 왼쪽→오른쪽으로 지나간다 → 공을 한 번 탭. 탭 시각 = impactMs(회전 타이밍: 가운데 0, 늦으면 페이스 열림),
 * 탭 세로 위치 = tapY(컨택 높이: 공 중심 0, 위 = 얇게·탑, 아래 잔디 = 뒷땅), 놓을 때 가로 흘림 = padX(패스 오차).
 * 힐/토(tapX)는 1차 화면에서 0. 탭이 없으면 t = +2.5·zone(몸이 너무 빨리 돈 것).
 * 시계는 performance.now(), 탭은 PointerEvent.timeStamp — 화면 프레임에 묶이지 않는다.
 */
import { useEffect, useRef, useState, type PointerEvent as RPE } from "react";
import { cn } from "@/lib/utils";

export interface SwingResult { powerPct: number; impactMs: number; padX: number; tapX: number; tapY: number }
interface Props {
    zoneMs: number;          // 창 폭(±)
    sweepMs: number;         // 바늘 통과 시간
    /** 티 위 우드면 공 아래에 티를, 아니면 잔디를 그린다 */
    teed?: boolean;
    disabled?: boolean;
    onShot: (r: SwingResult) => void;
    /** 파워가 바뀔 때(미리보기 갱신용) */
    onPower?: (powerPct: number) => void;
}

const MAX_PULL_PX = 170;      // 이만큼 당기면 100 %
const BALL_PX = 30;           // 임팩트 창의 공 반지름(px). tapY 100 = 1.5R = 45 px
const TAP_WINDOW_EXTRA = 1.2; // 바늘이 끝을 지나고도 잠깐 기다린다(탑 판정용)

export function SwingPad({ zoneMs, sweepMs, teed, disabled, onShot, onPower }: Props) {
    const [phase, setPhase] = useState<"idle" | "pull" | "impact">("idle");
    const [power, setPower] = useState(0);
    const [needle, setNeedle] = useState(0);          // 0..1 (0.5 = 가운데)
    const start = useRef<{ x: number; y: number } | null>(null);
    const release = useRef<{ t0: number; power: number; padX: number } | null>(null);
    const raf = useRef(0);
    const barRef = useRef<HTMLDivElement>(null);
    const done = useRef(false);

    useEffect(() => () => cancelAnimationFrame(raf.current), []);

    const finish = (impactMs: number, tapX: number, tapY: number) => {
        if (!release.current || done.current) return;
        done.current = true;
        cancelAnimationFrame(raf.current);
        const r = release.current;
        release.current = null;
        setPhase("idle"); setNeedle(0); setPower(0);
        // 엔진 입력 범위(±400 ms) 안으로 — 바늘이 다 지나간 뒤의 늦은 탭은 어차피 탑이다
        onShot({ powerPct: r.power, impactMs: Math.max(-400, Math.min(400, Math.round(impactMs))), padX: r.padX, tapX, tapY });
    };

    const onDown = (e: RPE) => {
        if (disabled) return;
        if (phase === "impact") {
            // 임팩트 탭
            const r = release.current; if (!r) return;
            const dtMs = e.timeStamp - r.t0;
            const impactMs = dtMs - sweepMs / 2;
            const bar = barRef.current?.getBoundingClientRect();
            // 세로: 공 중심 기준 위가 +. 1.5R 밖은 잘라낸다(공 위 = 헛스윙에 가까운 탑, 공 아래 = 잔디·티)
            const tapY = bar ? Math.max(-100, Math.min(100, Math.round((((bar.top + bar.height / 2) - e.clientY) / BALL_PX / 1.5) * 100))) : 0;
            finish(impactMs, 0, tapY);
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
        if (p < 20) { setPhase("idle"); setPower(0); start.current = null; return; }   // 너무 짧게 당기면 취소
        const pad = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const padX = Math.max(-100, Math.min(100, Math.round(((e.clientX - start.current.x) / (pad.width * 0.35)) * 100)));
        start.current = null;
        const t0 = e.timeStamp;
        release.current = { t0, power: p, padX };
        setPhase("impact");
        const loop = () => {
            if (!release.current) return;
            const el = performance.now() - t0;
            // performance.now 와 event.timeStamp 는 같은 시계(DOMHighResTimeStamp)
            setNeedle(el / sweepMs);
            if (el > sweepMs * TAP_WINDOW_EXTRA) { finish(zoneMs * 2.5, 0, 0); return; }
            raf.current = requestAnimationFrame(loop);
        };
        raf.current = requestAnimationFrame(loop);
    };

    const zoneFrac = Math.min(0.5, zoneMs / sweepMs);       // 창 반폭(0..0.5)
    const perfectFrac = zoneFrac * 0.33;
    const powerRatio = Math.min(1, power / 100);

    return (
        <div
            className={cn("relative select-none touch-none h-full w-full rounded-[1.5rem] overflow-hidden", disabled ? "opacity-40" : "")}
            style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02))", overscrollBehavior: "none" }}
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        >
            {phase !== "impact" ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 pointer-events-none">
                    <div className="w-[70%] h-3 rounded-full bg-white/10 overflow-hidden">
                        <div className={cn("h-full rounded-full transition-[width] duration-75", power > 100 ? "bg-red-400" : "bg-[#64DD17]")} style={{ width: `${Math.min(100, (power / 115) * 100)}%` }} />
                    </div>
                    <div className="text-[13px] font-bold text-white/70 tabular-nums">{phase === "pull" ? `${power} %` : "아래로 당겨 파워 · 놓으면 바늘 · 탭으로 임팩트"}</div>
                    {phase === "pull" && <div className="text-[11px] text-white/40">놓을 때 좌우로 흘리면 패스가 틀어집니다</div>}
                </div>
            ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 pointer-events-none">
                    {/* 임팩트 창: 정면에서 본 공. 바늘(클럽) 이 왼→오로 지나간다. 공 중심 = 정타, 위 = 얇게·탑, 아래(잔디·티) = 뒷땅·스카이 */}
                    <div ref={barRef} className="relative w-[84%] rounded-xl bg-white/[0.06] overflow-hidden" style={{ height: BALL_PX * 3 + 8 }}>
                        {/* 창(±zone) · 퍼펙트(±0.33) */}
                        <div className="absolute top-0 bottom-0 bg-[#64DD17]/20" style={{ left: `${(0.5 - zoneFrac) * 100}%`, width: `${zoneFrac * 200}%` }} />
                        <div className="absolute top-0 bottom-0 bg-[#64DD17]/45" style={{ left: `${(0.5 - perfectFrac) * 100}%`, width: `${perfectFrac * 200}%` }} />
                        {/* 지면: 잔디 또는 티 */}
                        {teed ? (
                            <div className="absolute left-1/2 -translate-x-1/2 w-[6px] rounded-b bg-white/50" style={{ top: `calc(50% + ${BALL_PX - 2}px)`, height: BALL_PX * 0.8 }} />
                        ) : (
                            <div className="absolute inset-x-0 bg-[#2f7a34]" style={{ top: `calc(50% + ${BALL_PX - 3}px)`, bottom: 0 }} />
                        )}
                        {/* 공 */}
                        <div className="absolute left-1/2 top-1/2 rounded-full bg-white shadow-[inset_-6px_-6px_10px_rgba(0,0,0,0.25)]" style={{ width: BALL_PX * 2, height: BALL_PX * 2, transform: "translate(-50%, -50%)" }} />
                        <div className="absolute left-1/2 top-1/2 w-[9px] h-[9px] rounded-full border-2 border-[#051907]/40 -translate-x-1/2 -translate-y-1/2" />
                        <div className="absolute left-2 top-1 text-[9px] font-bold text-white/40">위 = 얇게</div>
                        <div className="absolute left-2 bottom-1 text-[9px] font-bold text-white/60">{teed ? "아래 = 스카이" : "아래 = 뒷땅"}</div>
                        {/* 바늘(클럽헤드) */}
                        <div className="absolute top-0 bottom-0 w-[3px] bg-white rounded-full shadow-[0_0_8px_rgba(255,255,255,0.8)]" style={{ left: `calc(${Math.min(1, needle) * 100}% - 1px)` }} />
                    </div>
                    <div className="text-[12px] font-bold text-white/70">바늘이 공에 올 때 공 가운데를 탭 · 파워 {release.current?.power ?? power} %</div>
                </div>
            )}
            <div className="absolute left-3 top-2 text-[10px] font-extrabold tracking-[0.2em] text-white/30">SWING PAD</div>
            <div className="absolute right-3 top-2 text-[10px] font-bold text-white/30 tabular-nums">창 ±{Math.round(zoneMs)} ms</div>
            {phase === "pull" && <div className="absolute inset-x-0 top-0 h-1 bg-[#64DD17]/60" style={{ width: `${powerRatio * 100}%` }} />}
        </div>
    );
}
