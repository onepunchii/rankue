import { memo } from "react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { ChevronLeft, ChevronRight, LayoutList, LucideUndo2, X, LucideSparkles } from "@/lib/icons";
import type { CueInput, Phase } from "../simReducer";
import { THICKNESS_UI_STEPS, thicknessStepLabel, type ActiveThickness, type ThicknessStep } from "../controlsMath";
import { HoldButton } from "./HoldButton";
import { SpinPad } from "./SpinPad";
import { PowerControl } from "./PowerControl";

// 하단 조작 패널(엄지 범위). 세 줄:
//  1. 두께 단계(정면 · ½ · ⅓ · ¼ · ⅛) — 현재 조준이 가장 가까운 적구에 대해 어느 단계인지 표시(activeThickness)
//  2. 좌/우 · ±0.1°(길게 누르면 가속) · 되돌리기(연습) · 이닝 시트 · 나가기
//  3. 당점 패드 · 세기 · 샷(재생 중 잠금, 종료 후엔 다시하기)
// 모든 탭 대상은 44 px(h-11) 이상. 텍스트는 12 px 이상. 영어 라벨·이모지 없음.
export interface ControlsProps {
    phase: Phase;
    canUndo: boolean;
    input: CueInput;
    cueBallId: "white" | "yellow";
    active: ActiveThickness | null;
    side: "left" | "right";
    onThickness: (step: ThicknessStep) => void;
    onSide: (side: "left" | "right") => void;
    onNudge: (dir: -1 | 1) => void;
    onSpin: (a: number, b: number) => void;
    onPower: (V0: number) => void;
    onShoot: () => void;
    onRestart: () => void;
    onUndo: () => void;
    onInnings: () => void;
    onExit: () => void;
    /** 해법 찾기(연습·드릴에서만 넘긴다 — 기록 세션·대전엔 없다) */
    onSolve?: () => void;
}

const ICON_BTN = "h-11 w-11 rounded-tile border border-surface-line bg-surface-1 text-ink-2 flex items-center justify-center active:bg-surface-3 disabled:opacity-40 disabled:pointer-events-none";

function IconButton({ label, onClick, disabled, children, className }: {
    label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode; className?: string;
}) {
    return (
        <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled} className={cn(ICON_BTN, className)}>
            {children}
        </button>
    );
}

export const Controls = memo(function Controls(p: ControlsProps) {
    const { t } = useT();
    const aiming = p.phase === "aim";
    const locked = !aiming;

    return (
        <div className="shrink-0 px-3 pt-2 pb-2 flex flex-col gap-2 border-t border-surface-line bg-surface-1">
            {/* 1. 두께 */}
            <div className="flex gap-1" role="group" aria-label={t("sim.controls.thickness")}>
                {THICKNESS_UI_STEPS.map((step) => {
                    const on = p.active?.step === step;
                    return (
                        <button
                            key={step} type="button" aria-pressed={on} disabled={locked}
                            onClick={() => p.onThickness(step)}
                            className={cn(
                                "flex-1 h-11 rounded-tile border text-[14px] font-semibold rk-num disabled:opacity-40",
                                on ? "border-brand bg-brand/[0.06] text-ink-1" : "border-surface-line text-ink-3",
                            )}
                        >
                            {thicknessStepLabel(step, t("sim.aim.fullBall"))}
                        </button>
                    );
                })}
            </div>

            {/* 2. 좌/우 · ±0.1° · 되돌리기 · 이닝 · 나가기 */}
            <div className="flex items-center gap-1">
                {(["left", "right"] as const).map((s) => {
                    const on = p.side === s;
                    return (
                        <button
                            key={s} type="button" aria-pressed={on} disabled={locked}
                            onClick={() => p.onSide(s)}
                            className={cn(
                                "h-11 w-11 rounded-tile border text-[14px] font-semibold disabled:opacity-40",
                                on ? "border-brand bg-brand/[0.06] text-ink-1" : "border-surface-line text-ink-3",
                            )}
                        >
                            {s === "left" ? t("sim.controls.sideLeft") : t("sim.controls.sideRight")}
                        </button>
                    );
                })}
                <HoldButton label={t("sim.controls.nudgeLeft")} disabled={locked} onTick={() => p.onNudge(1)} className="w-11 px-0">
                    <ChevronLeft className="w-4 h-4" />
                </HoldButton>
                <HoldButton label={t("sim.controls.nudgeRight")} disabled={locked} onTick={() => p.onNudge(-1)} className="w-11 px-0">
                    <ChevronRight className="w-4 h-4" />
                </HoldButton>
                <div className="flex-1" />
                {p.canUndo && (
                    <IconButton label={t("sim.controls.undo")} onClick={p.onUndo}>
                        <LucideUndo2 className="w-4 h-4" />
                    </IconButton>
                )}
                {p.onSolve && (
                    <IconButton label={t("sim.solver.button")} onClick={p.onSolve} disabled={p.phase !== "aim"}>
                        <LucideSparkles className="w-4 h-4" />
                    </IconButton>
                )}
                <IconButton label={t("sim.controls.innings")} onClick={p.onInnings}>
                    <LayoutList className="w-4 h-4" />
                </IconButton>
                <IconButton label={t("sim.controls.exit")} onClick={p.onExit}>
                    <X className="w-4 h-4" />
                </IconButton>
            </div>

            {/* 3. 당점 · 세기 · 샷 */}
            <div className="flex items-stretch gap-2">
                <SpinPad a={p.input.a} b={p.input.b} cueBallId={p.cueBallId} disabled={locked} onChange={p.onSpin} />
                <PowerControl V0={p.input.V0} disabled={locked} onChange={p.onPower} />
                {p.phase === "finished" ? (
                    <button
                        type="button" onClick={p.onRestart}
                        className="w-[84px] shrink-0 rounded-tile bg-brand text-brand-fg text-[15px] font-semibold active:bg-brand-strong"
                    >
                        {t("sim.controls.restart")}
                    </button>
                ) : (
                    <button
                        type="button" onClick={p.onShoot} disabled={locked}
                        className="w-[84px] shrink-0 rounded-tile bg-brand text-brand-fg text-[17px] font-semibold active:bg-brand-strong disabled:opacity-40"
                    >
                        {p.phase === "shooting" ? <span className="text-[13px]">{t("sim.controls.playing")}</span> : t("sim.controls.shoot")}
                    </button>
                )}
            </div>
        </div>
    );
});
