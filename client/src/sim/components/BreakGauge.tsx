import { memo, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { breakGaugePercent, breakZone, type BreakGauge as Gauge, type BreakZone } from "../breakGauge";
import { CUE_PX, CUE_PX_SM, CueStick } from "./PowerRail";

/**
 * 초구 힘 게이지(2026-11-03 — 규칙은 ../breakGauge). 초구 차례 동안 오른쪽 힘 막대(PowerRail) 자리를 이것이 차지한다 — 힘은 늘 같은 자리에 있다.
 * 2026-11-03 오너: "멘트 다 빼고 … 파워가 세면 빨간색 … 맥스파워에서 빨라지듯" → 글은 숫자 하나뿐, 막대는 초록 → 노랑 → 주황 → 빨강,
 * 최대 근처에서는 테두리가 붉게 빛난다. 큐대는 힘 막대처럼 셀수록 아래로(공에서 멀리) 당겨진다.
 *  - 누르기 전(run 없음): 빈 막대 · 0%. 눌러도 시작한다(샷 단추와 같은 일).
 *  - 도는 중: requestAnimationFrame 으로 막대 · 큐대 · 숫자만 고친다(조작 층은 memo, 화면을 다시 그리지 않는다). 누르면 멈추고 바로 친다.
 *  - 색은 그려진 사물(게임 힘 막대)이라 리터럴 — 힘 막대의 나무색과 같은 까닭.
 */
const ZONE_INK: Record<BreakZone, string> = { soft: "#2FBF5B", mid: "#E8B420", hard: "#F07A1F", max: "#E5402F" };
/** 막대 전체에 깔린 색 — 채운 만큼만 보인다(위 = 약함, 아래 = 셈) */
const BAR = `linear-gradient(to bottom, ${ZONE_INK.soft} 0%, ${ZONE_INK.soft} 30%, ${ZONE_INK.mid} 50%, ${ZONE_INK.hard} 72%, ${ZONE_INK.max} 90%, ${ZONE_INK.max} 100%)`;

interface Props {
    run: { gauge: Gauge; startedAt: number } | null;
    /** 누르기 전엔 시작, 도는 중엔 멈춤(=샷) — 페이지의 샷 단추와 같은 함수 */
    onPress: () => void;
    compact?: boolean;
    className?: string;
    skin?: string | null;
}

export const BreakGauge = memo(function BreakGauge({ run, onPress, compact, className, skin }: Props) {
    const { t } = useT();
    const cuePx = compact ? CUE_PX_SM : CUE_PX;
    const box = useRef<HTMLButtonElement>(null);
    const fill = useRef<HTMLSpanElement>(null);
    const cue = useRef<HTMLSpanElement>(null);
    const num = useRef<HTMLSpanElement>(null);
    useEffect(() => {
        const paint = (pct: number) => {
            const zone = breakZone(pct);
            if (fill.current) fill.current.style.clipPath = `inset(0 0 ${100 - pct}% 0 round 999px)`;
            if (cue.current) cue.current.style.top = `calc((100% - ${cuePx}px) * ${pct / 100})`;
            if (num.current) { num.current.textContent = `${Math.round(pct)}%`; num.current.style.color = pct > 0 ? ZONE_INK[zone] : ""; }
            if (box.current) box.current.style.boxShadow = zone === "max" ? `0 0 0 3px ${ZONE_INK.max}55, 0 0 18px ${ZONE_INK.max}88` : "";
        };
        if (!run) { paint(0); return; }
        let raf = 0;
        const tick = () => { paint(breakGaugePercent(run.gauge, performance.now() - run.startedAt)); raf = requestAnimationFrame(tick); };
        tick();
        return () => cancelAnimationFrame(raf);
    }, [run, cuePx]);
    return (
        <button
            ref={box}
            type="button"
            // 멈추는 손은 닿는 순간 — 탭이 떨어지기를 기다린 만큼 힘이 밀리지 않게
            onPointerDown={(e) => { e.preventDefault(); onPress(); }}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPress(); } }}
            aria-label={t(run ? "sim.break.stop" : "sim.break.go")}
            data-testid="break-gauge"
            data-running={run ? "1" : undefined}
            className={cn("flex flex-col items-center gap-1 w-11 py-2 rounded-pill bg-surface-1 border border-surface-line rk-shadow touch-none select-none transition-shadow", className)}
        >
            <span ref={num} className="shrink-0 rk-num text-[12px] leading-none font-black text-ink-1 whitespace-nowrap">0%</span>
            <span className="relative flex-1 w-full flex justify-center" style={{ minHeight: compact ? 140 : 160 }}>
                <span className="relative w-3 h-full rounded-pill bg-surface-3 overflow-hidden" aria-hidden="true">
                    <span ref={fill} className="absolute inset-0 rounded-pill" style={{ background: BAR, clipPath: "inset(0 0 100% 0 round 999px)" }} />
                </span>
                <span ref={cue} className="absolute left-0 right-0 flex justify-center pointer-events-none" style={{ top: 0, height: cuePx }} aria-hidden="true">
                    <CueStick height={cuePx} skin={skin} />
                </span>
            </span>
        </button>
    );
});
