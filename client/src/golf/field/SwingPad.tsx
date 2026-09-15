/**
 * 하이브리드 스윙 입력(제안서 §2, 오너 확정): 패드를 아래로 당겨 파워(20~115 %) → 놓으면 같은 자리에 임팩트 바가 뜨고
 * 바늘이 sweepMs 동안 왼쪽→오른쪽으로 지나간다 → 한 번 탭. 탭 시각 = impactMs(가운데가 0), 탭 가로 위치 = tapX(타점),
 * 놓을 때 가로 흘림 = padX(패스 오차). 탭이 없으면 t = +2.5·zone(탑).
 * 시계는 performance.now(), 탭은 PointerEvent.timeStamp — 화면 프레임에 묶이지 않는다.
 */
import { useEffect, useRef, useState, type PointerEvent as RPE } from "react";
import { cn } from "@/lib/utils";

export interface SwingResult { powerPct: number; impactMs: number; padX: number; tapX: number }
interface Props {
    zoneMs: number;          // 창 폭(±)
    sweepMs: number;         // 바늘 통과 시간
    disabled?: boolean;
    onShot: (r: SwingResult) => void;
    /** 파워가 바뀔 때(미리보기 갱신용) */
    onPower?: (powerPct: number) => void;
}

const MAX_PULL_PX = 170;      // 이만큼 당기면 100 %
const TAP_WINDOW_EXTRA = 1.2; // 바늘이 끝을 지나고도 잠깐 기다린다(탑 판정용)

export function SwingPad({ zoneMs, sweepMs, disabled, onShot, onPower }: Props) {
    const [phase, setPhase] = useState<"idle" | "pull" | "impact">("idle");
    const [power, setPower] = useState(0);
    const [needle, setNeedle] = useState(0);          // 0..1 (0.5 = 가운데)
    const start = useRef<{ x: number; y: number } | null>(null);
    const release = useRef<{ t0: number; power: number; padX: number } | null>(null);
    const raf = useRef(0);
    const barRef = useRef<HTMLDivElement>(null);
    const done = useRef(false);

    useEffect(() => () => cancelAnimationFrame(raf.current), []);

    const finish = (impactMs: number, tapX: number) => {
        if (!release.current || done.current) return;
        done.current = true;
        cancelAnimationFrame(raf.current);
        const r = release.current;
        release.current = null;
        setPhase("idle"); setNeedle(0); setPower(0);
        // 엔진 입력 범위(±400 ms) 안으로 — 바늘이 다 지나간 뒤의 늦은 탭은 어차피 탑이다
        onShot({ powerPct: r.power, impactMs: Math.max(-400, Math.min(400, Math.round(impactMs))), padX: r.padX, tapX });
    };

    const onDown = (e: RPE) => {
        if (disabled) return;
        if (phase === "impact") {
            // 임팩트 탭
            const r = release.current; if (!r) return;
            const dtMs = e.timeStamp - r.t0;
            const impactMs = dtMs - sweepMs / 2;
            const bar = barRef.current?.getBoundingClientRect();
            const tapX = bar ? Math.max(-100, Math.min(100, Math.round(((e.clientX - (bar.left + bar.width / 2)) / (bar.width / 2)) * 100))) : 0;
            finish(impactMs, tapX);
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
            if (el > sweepMs * TAP_WINDOW_EXTRA) { finish(zoneMs * 2.5, 0); return; }
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
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none">
                    <div ref={barRef} className="relative w-[84%] h-12 rounded-xl bg-white/[0.08] overflow-hidden">
                        {/* 창(±zone) · 퍼펙트(±0.33) */}
                        <div className="absolute top-0 bottom-0 bg-[#64DD17]/25" style={{ left: `${(0.5 - zoneFrac) * 100}%`, width: `${zoneFrac * 200}%` }} />
                        <div className="absolute top-0 bottom-0 bg-[#64DD17]/60" style={{ left: `${(0.5 - perfectFrac) * 100}%`, width: `${perfectFrac * 200}%` }} />
                        <div className="absolute top-0 bottom-0 w-[2px] bg-white/70 left-1/2 -translate-x-1/2" />
                        {/* 페이스 아이콘(타점 기준선) */}
                        <div className="absolute inset-x-0 bottom-0 flex justify-between px-2 text-[9px] font-bold text-white/40"><span>힐</span><span>토</span></div>
                        {/* 바늘 */}
                        <div className="absolute top-0 bottom-0 w-[3px] bg-white rounded-full shadow-[0_0_8px_rgba(255,255,255,0.8)]" style={{ left: `calc(${Math.min(1, needle) * 100}% - 1px)` }} />
                    </div>
                    <div className="text-[12px] font-bold text-white/70">지금! 탭 (가운데 = 퍼펙트 · 파워 {release.current?.power ?? power} %)</div>
                </div>
            )}
            <div className="absolute left-3 top-2 text-[10px] font-extrabold tracking-[0.2em] text-white/30">SWING PAD</div>
            <div className="absolute right-3 top-2 text-[10px] font-bold text-white/30 tabular-nums">창 ±{Math.round(zoneMs)} ms</div>
            {phase === "pull" && <div className="absolute inset-x-0 top-0 h-1 bg-[#64DD17]/60" style={{ width: `${powerRatio * 100}%` }} />}
        </div>
    );
}
