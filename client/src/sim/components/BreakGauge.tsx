import { memo, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { breakGaugePercent, type BreakGauge as Gauge } from "../breakGauge";

/**
 * 초구 힘 게이지(2026-11-03 — 규칙은 ../breakGauge). 왼쪽 위 칩 열(초구 안내가 있던 자리)에 뜨는 알약 하나.
 *  - 막대가 0 → 100 → 0 으로 오르내린다. 화면을 다시 그리지 않고 requestAnimationFrame 으로 막대 · 숫자만 고친다(조작 층은 memo).
 *  - 알약 전체가 '멈춤' 단추다(샷 단추와 같은 일) — 손가락이 어디에 있든 바로 누를 수 있게. 힘은 부르는 쪽이 같은 식으로 다시 센다.
 *  - 색은 PowerRail 과 같은 흰 알약 · 채움은 brand 하나(이 화면의 초록은 샷 하나라는 규칙 — 게이지가 곧 샷이다).
 */
interface Props {
    gauge: Gauge;
    /** 게이지를 켠 때(performance.now()) */
    startedAt: number;
    onStop: () => void;
    className?: string;
}

export const BreakGauge = memo(function BreakGauge({ gauge, startedAt, onStop, className }: Props) {
    const { t } = useT();
    const fill = useRef<HTMLSpanElement>(null);
    const num = useRef<HTMLSpanElement>(null);
    useEffect(() => {
        let raf = 0;
        const tick = () => {
            const pct = breakGaugePercent(gauge, performance.now() - startedAt);
            if (fill.current) fill.current.style.width = `${pct}%`;
            if (num.current) num.current.textContent = `${Math.round(pct)}%`;
            raf = requestAnimationFrame(tick);
        };
        tick();
        return () => cancelAnimationFrame(raf);
    }, [gauge, startedAt]);
    return (
        <button
            type="button"
            onPointerDown={(e) => { e.preventDefault(); onStop(); }}
            aria-label={t("sim.break.stop")}
            data-testid="break-gauge"
            className={cn("w-[300px] landscape:w-[220px] max-w-full rounded-[20px] bg-surface-1 border border-surface-line px-4 pt-2.5 pb-3 rk-shadow touch-none select-none text-left", className)}
        >
            <span className="flex items-baseline justify-between gap-2">
                <span className="text-[13px] font-black text-ink-1">{t("sim.break.title")}</span>
                <span ref={num} className="rk-num text-[13px] font-black text-ink-2">0%</span>
            </span>
            <span className="mt-1.5 block h-3.5 rounded-pill bg-surface-3 overflow-hidden" aria-hidden="true">
                <span ref={fill} className="block h-full rounded-pill bg-brand" style={{ width: "0%" }} />
            </span>
            <span className="mt-1.5 block text-[11.5px] font-medium text-ink-3 leading-snug">{t("sim.break.tapToStop")}</span>
        </button>
    );
});
