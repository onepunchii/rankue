import { memo } from "react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import type { ShotOutcome } from "@shared/sim/rules";
import { outcomeMessage, outcomePointsLabel, outcomeTone } from "../outcomeText";

// 샷 결과 배너. 테이블 영역 아래쪽에 알약 하나 — 공이 멈춘 뒤(onOutcome) 2초 남짓 보이고 사라진다.
// 득점은 brand 테두리·글자, 미스·파울은 기본 잉크. 장식 애니메이션 없음(opacity 전환만).
interface Props {
    outcome: ShotOutcome | null;
    visible: boolean;
}

export const OutcomeBanner = memo(function OutcomeBanner({ outcome, visible }: Props) {
    const { t } = useT();
    if (!outcome) return null;
    const tone = outcomeTone(outcome);
    const points = outcomePointsLabel(outcome);
    return (
        <div
            role="status"
            aria-live="polite"
            className={cn(
                "absolute left-3 right-3 bottom-3 flex justify-center pointer-events-none transition-opacity duration-200",
                visible ? "opacity-100" : "opacity-0",
            )}
        >
            <span
                className={cn(
                    "inline-flex items-center gap-2 max-w-full px-4 min-h-11 rounded-pill border bg-surface-1 text-[14px] font-semibold",
                    tone === "score" ? "border-brand text-brand" : "border-surface-line text-ink-1",
                )}
            >
                <span className="truncate">{outcomeMessage(t, outcome)}</span>
                {points && <span className="rk-num shrink-0">{points}</span>}
            </span>
        </div>
    );
});
