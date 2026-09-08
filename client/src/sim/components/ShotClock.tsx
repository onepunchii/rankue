import { memo } from "react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { SHOT_CLOCK_S } from "@shared/sim/rules";

/**
 * 40초 룰 시계를 눈에 보이게 — 남은 시간만큼 줄어드는 고리와 가운데 숫자(2026-09-08 오너: "타이머가 가려져 있음, 시각화해줘").
 * 색: 10초 이하면 진하게(ink-1) · 내 차례면 brand · 상대 차례면 ink-3. 고리는 12시에서 시작해 시계 방향으로 준다.
 * 글자는 숫자만 크게 두고 "초"는 읽기 도우미에만(칩이 좁아 두 글자가 들어가면 숫자가 작아진다).
 */
export interface ShotClockProps {
    seconds: number;
    mine: boolean;
    /** 지름(px). 헤더 34, 대기 패널 56. */
    size?: number;
    className?: string;
}

export const ShotClock = memo(function ShotClock({ seconds, mine, size = 34, className }: ShotClockProps) {
    const { t } = useT();
    const left = Math.max(0, Math.min(SHOT_CLOCK_S, seconds));
    const urgent = left <= 10;
    const stroke = Math.max(3, Math.round(size * 0.09));
    const r = (size - stroke) / 2;
    const circ = 2 * Math.PI * r;
    const dash = (left / SHOT_CLOCK_S) * circ;
    const color = urgent ? "var(--ink-1)" : mine ? "rgb(var(--brand))" : "var(--ink-3)";
    return (
        <span
            role="timer" aria-live="polite" aria-label={t("sim.match.shotClockLabel")}
            className={cn("relative inline-flex items-center justify-center shrink-0", className)}
            style={{ width: size, height: size }}
        >
            <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
                <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-line)" strokeWidth={stroke} />
                <circle
                    cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
                    strokeDasharray={`${dash} ${circ - dash}`}
                />
            </svg>
            <span
                className={cn("absolute rk-num font-bold leading-none", urgent ? "text-ink-1" : mine ? "text-brand" : "text-ink-2")}
                style={{ fontSize: Math.round(size * 0.42) }}
            >
                {left}
            </span>
            <span className="sr-only">{t("sim.match.shotClock").replace("{n}", String(left))}</span>
        </span>
    );
});
