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
 *  - 온라인 대전의 초구(2026-11-03 — ../breakGauge): 글자가 "초구" → 게이지가 돌면 "멈춤"(label · armed 를 페이지가 준다)
 */
interface Props {
    phase: Phase;
    onShoot: () => void;
    onRestart: () => void;
    /** 짧은 화면: 56 px 원. */
    compact?: boolean;
    className?: string;
    tour?: string;
    /** 샷 대신 쓸 글자(초구 게이지) */
    label?: string;
    /** 게이지가 도는 중 — 단추가 '멈춤'이다 */
    armed?: boolean;
}

const CIRCLE = "rounded-pill flex items-center justify-center font-semibold";

export const ShotButton = memo(function ShotButton({ phase, onShoot, onRestart, compact, className, tour, label, armed }: Props) {
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
        // 게이지를 멈추는 손은 떼는 순간이 아니라 닿는 순간이다(onPointerDown) — 탭의 지연만큼 힘이 밀리지 않게. 키보드는 click 으로
        <button type="button" onClick={armed ? undefined : onShoot} onPointerDown={armed ? (e) => { e.preventDefault(); onShoot(); } : undefined}
            disabled={!aiming} aria-label={label ?? t("sim.controls.shoot")} data-tour={tour} data-armed={armed ? "1" : undefined} className={cn("flex flex-col items-center", className)}>
            <span className={cn(circle, aiming ? "bg-brand text-brand-fg active:bg-brand-strong" : "bg-surface-3 text-ink-4", aiming && (label ? "text-[14px] font-black leading-tight text-center px-1" : "text-[17px]"), armed && "ring-4 ring-brand/30 animate-pulse")}>
                {aiming ? label ?? t("sim.controls.shoot") : ""}
            </span>
        </button>
    );
});
