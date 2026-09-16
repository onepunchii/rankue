import { memo } from "react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { SHOT_CLOCK_S } from "@shared/sim/rules";

/**
 * 40초 룰 시계 — 남은 시간만큼 줄어드는 네모 테두리와 가운데 숫자
 * (2026-09-08 오너: "타이머가 가려져 있음, 시각화해줘" → 2026-09-16 오너: "동그란 시계 말고 네모나게, 줄어들면 색이 달라지게").
 *
 * 테두리는 12시에서 시작해 시계 방향으로 준다. 색은 **남은 시간을 숫자로 읽기 전에 먼저 알아채라고** 단계로 바뀐다:
 *   21초 이상 — 내 차례는 brand, 상대 차례는 ink-3(내 일이 아니면 조용히)
 *   11~20초  — 금색(--gold-fill). 슬슬 서둘러야 한다.
 *   10초 이하 — 붉은색(--ball-red), 5초부터는 깜빡인다. 세 번 넘기면 실격패다.
 * 새 색을 만들지 않고 앱에 이미 있는 토큰만 쓴다.
 *
 * 글자는 숫자만 크게 두고 "초"는 읽기 도우미에만(칩이 좁아 두 글자가 들어가면 숫자가 작아진다).
 */
export interface ShotClockProps {
    seconds: number;
    mine: boolean;
    /** 한 변(px). 헤더 34, 대기 카드 56. */
    size?: number;
    className?: string;
}

/** 남은 시간대별 색. 화면 여러 곳이 같은 기준을 쓰도록 여기 한 곳에 둔다. */
export function shotClockColor(seconds: number, mine: boolean): string {
    if (seconds <= 10) return "var(--ball-red)";
    if (seconds <= 20) return "var(--gold-fill)";
    return mine ? "rgb(var(--brand))" : "var(--ink-3)";
}

export const ShotClock = memo(function ShotClock({ seconds, mine, size = 34, className }: ShotClockProps) {
    const { t } = useT();
    const left = Math.max(0, Math.min(SHOT_CLOCK_S, seconds));
    const stroke = Math.max(3, Math.round(size * 0.09));
    const pad = stroke / 2 + 0.5;
    const side = size - pad * 2;
    const radius = Math.round(size * 0.24);
    // 둥근 모서리를 뺀 실제 둘레. 대략값으로 잡으면 마지막 몇 초에 테두리가 남거나 모자란다.
    const perimeter = 4 * side - 8 * radius + 2 * Math.PI * radius;
    const on = (left / SHOT_CLOCK_S) * perimeter;
    const color = shotClockColor(left, mine);
    const urgent = left <= 10;
    return (
        <span
            role="timer" aria-live="polite" aria-label={t("sim.match.shotClockLabel")}
            className={cn("relative inline-flex items-center justify-center shrink-0", left <= 5 && "motion-safe:animate-pulse", className)}
            style={{ width: size, height: size }}
        >
            <svg width={size} height={size} aria-hidden="true">
                <rect
                    x={pad} y={pad} width={side} height={side} rx={radius}
                    fill="none" stroke="var(--surface-line)" strokeWidth={stroke}
                />
                <rect
                    x={pad} y={pad} width={side} height={side} rx={radius}
                    fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
                    strokeDasharray={`${on} ${perimeter - on}`}
                    /* 12시에서 시작해 시계 방향으로: 경로가 왼쪽 위 모서리에서 시작하므로 반 변만큼 당기고 돌린다. */
                    strokeDashoffset={-(side / 2 - radius)}
                />
            </svg>
            <span
                className={cn("absolute rk-num font-bold leading-none", !urgent && !mine && "text-ink-2")}
                style={{ fontSize: Math.round(size * 0.42), color: urgent || left <= 20 ? color : mine ? color : undefined }}
            >
                {left}
            </span>
            <span className="sr-only">{t("sim.match.shotClock").replace("{n}", String(left))}</span>
        </span>
    );
});
