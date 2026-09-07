import { memo } from "react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import type { Phase } from "../simReducer";

/**
 * 샷 버튼 — 이 화면의 유일한 초록 주 동작. 64 px 원.
 *  - aim: "샷"(brand)
 *  - shooting·waiting(대전 상대 차례)·setup: 흐린 빈 원(비활성). 재생 중엔 페이지가 오른쪽 열을 통째로 흐리므로
 *    따로 "재생 중" 글자를 두지 않는다(보이지 않는 글자였다 — 재생 상태는 왼쪽 위 빨리감기 칩이 알린다).
 *  - finished: "다시하기"(brand, 같은 설정으로 새 세션). 대전엔 다시하기가 없어 페이지가 안 그린다
 */
interface Props {
    phase: Phase;
    onShoot: () => void;
    onRestart: () => void;
    /** 짧은 화면: 56 px 원. */
    compact?: boolean;
    className?: string;
}

const CIRCLE = "rounded-pill flex items-center justify-center font-semibold";

export const ShotButton = memo(function ShotButton({ phase, onShoot, onRestart, compact, className }: Props) {
    const { t } = useT();
    const circle = cn(CIRCLE, compact ? "h-14 w-14" : "h-16 w-16");
    if (phase === "finished") {
        return (
            <button type="button" onClick={onRestart} className={cn("flex flex-col items-center", className)}>
                <span className={cn(circle, "bg-brand text-brand-fg text-[13px] active:bg-brand-strong")}>{t("sim.controls.restart")}</span>
            </button>
        );
    }
    const aiming = phase === "aim";
    return (
        <button type="button" onClick={onShoot} disabled={!aiming} aria-label={t("sim.controls.shoot")} className={cn("flex flex-col items-center", className)}>
            <span className={cn(circle, aiming ? "bg-brand text-brand-fg text-[17px] active:bg-brand-strong" : "bg-surface-3 text-ink-4")}>
                {aiming ? t("sim.controls.shoot") : ""}
            </span>
        </button>
    );
});
