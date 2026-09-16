import { memo } from "react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { THICKNESS_UI_STEPS, thicknessStepLabel, type ActiveThickness, type ThicknessStep } from "../controlsMath";
import { HoldButton } from "./HoldButton";
import { ChevronLeftIcon, ChevronRightIcon, UndoIcon } from "./railIcons";

/**
 * 두께 독(테이블 왼쪽 아래). 흰 알약 묶음 두 줄, 칩 44 px · 간격 8 px:
 *  1. 정면 · ½ · ⅓ · ¼ · ⅛ — 현재 조준이 가장 가까운 적구에 대해 어느 단계인지 brand 틴트(activeThickness)
 *  2. [되돌리기(onUndo 가 있을 때)] · ±0.1° 미세 조절(길게 누르면 가속)
 *     좌/우 버튼은 2026-09-17 에 뺐다(오너: "크게 안 쓰는 것 같다") — 두께 칩이 지금 겨누는 쪽으로 맞춘다.
 * 375 px 폰에서 한 줄(정면 52 + 40×4 + 좌우·±0.1° 40×4 = 368 px)은 샷 버튼과 겹쳐 두 줄로 나눴다. 둘째 줄은 첫 줄보다 짧아
 * 되돌리기 하나가 들어간다 — 툴바에 두면 샷 뒤 버튼 수가 늘어 열을 넘쳤다(2026-09-07 리뷰). 높이 = 4 + 44 + 8 + 44 + 4 (+테두리 2) = 106.
 * 배경은 불투명 surface-1 — 토큰이 var() 라 Tailwind 투명도 수식어(surface-1/90)를 못 쓴다.
 */
interface Props {
    active: ActiveThickness | null;
    disabled?: boolean;
    onThickness: (step: ThicknessStep) => void;
    onNudge: (dir: -1 | 1) => void;
    /** 되돌리기(연습·드릴에서 샷 뒤). 없으면 자리를 비운다. */
    onUndo?: (() => void) | null;
    className?: string;
}

/** 독 전체 높이(px) — 페이지가 TABLE_INSETS.bottom 을 정할 때 쓴다. */
export const DOCK_HEIGHT = 4 + 44 + 8 + 44 + 4 + 2;

const CHIP = "h-11 rounded-tile border text-[13px] font-semibold rk-num disabled:opacity-40";
const CHIP_ON = "border-brand/45 bg-brand/[0.08] text-ink-1";
const CHIP_OFF = "border-surface-line bg-surface-1 text-ink-3";

export const ThicknessDock = memo(function ThicknessDock(p: Props) {
    const { t } = useT();
    return (
        <div
            role="group"
            aria-label={t("sim.controls.thickness")}
            className={cn("flex flex-col gap-2 p-1 rounded-tile bg-surface-1 border border-surface-line rk-shadow", p.className)}
        >
            <div className="flex gap-2">
                {THICKNESS_UI_STEPS.map((step) => {
                    const on = p.active?.step === step;
                    return (
                        <button
                            key={step} type="button" aria-pressed={on} disabled={p.disabled}
                            onClick={() => p.onThickness(step)}
                            className={cn(CHIP, step === 1 ? "min-w-[52px] px-2" : "w-10", on ? CHIP_ON : CHIP_OFF)}
                        >
                            {thicknessStepLabel(step, t("sim.aim.fullBall"))}
                        </button>
                    );
                })}
            </div>
            <div className="flex gap-2">
                <div className="flex-1" />
                {p.onUndo && (
                    <button
                        type="button" onClick={p.onUndo} aria-label={t("sim.controls.undo")} title={t("sim.controls.undo")}
                        className={cn(CHIP, "w-10 flex items-center justify-center", CHIP_OFF, "text-ink-2 active:bg-surface-3")}
                    >
                        <UndoIcon />
                    </button>
                )}
                <HoldButton label={t("sim.controls.nudgeLeft")} disabled={p.disabled} onTick={() => p.onNudge(1)} className="h-11 w-10 rounded-tile">
                    <ChevronLeftIcon />
                </HoldButton>
                <HoldButton label={t("sim.controls.nudgeRight")} disabled={p.disabled} onTick={() => p.onNudge(-1)} className="h-11 w-10 rounded-tile">
                    <ChevronRightIcon />
                </HoldButton>
            </div>
        </div>
    );
});
