import { memo } from "react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import type { ShotOutcome } from "@shared/sim/rules";
import { outcomeMessage, outcomePointsLabel, outcomeTone } from "../outcomeText";

// 샷 결과 배너. 테이블 영역 아래쪽에 알약 하나 — 공이 멈춘 뒤(onOutcome) 2초 남짓 보이고 사라진다.
// 득점은 brand 테두리·글자, 미스·파울은 기본 잉크. 장식 애니메이션 없음(opacity 전환만).
// sub 가 있으면(다이아몬드 시스템 "시스템 20 · 실제 23") 그 아래 작은 알약 한 줄을 같은 타이밍으로 보인다.
interface Props {
    outcome: ShotOutcome | null;
    visible: boolean;
    sub?: string | null;
}

export const OutcomeBanner = memo(function OutcomeBanner({ outcome, visible, sub }: Props) {
    const { t } = useT();
    if (!outcome) return null;
    const tone = outcomeTone(outcome);
    const points = outcomePointsLabel(outcome);
    return (
        <div
            role="status"
            aria-live="polite"
            className={cn(
                "absolute left-3 right-3 bottom-3 flex flex-col items-center gap-1.5 pointer-events-none transition-opacity duration-200",
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
            {sub && (
                <span className="inline-flex items-center max-w-full px-3 h-8 rounded-pill border border-surface-line bg-surface-1 text-[12px] font-medium text-ink-3 rk-num truncate">
                    {sub}
                </span>
            )}
        </div>
    );
});
