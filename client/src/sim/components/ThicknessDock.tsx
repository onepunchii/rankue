import { memo } from "react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { THICKNESS_UI_STEPS, thicknessStepLabel, type ActiveThickness, type ThicknessStep } from "../controlsMath";
import { HoldButton } from "./HoldButton";
import { ChevronLeftIcon, ChevronRightIcon, SpinIcon, UndoIcon } from "./railIcons";

/**
 * 두께 독(테이블 왼쪽 아래). 흰 알약 묶음 두 줄, 칩 44 px · 간격 8 px:
 *  1. 자동 초점 · ½ · ⅓ · ¼ · ⅛ — 초점 공(자동 초점으로 고른 공, 아니면 조준선이 가리키는 공)에 대해 어느 단계인지 brand 틴트.
 *     2026-09-26 오너: "정면 버튼을 수구·적구 자동 초점 버튼으로, ½·¼ 는 초점 잡힌 상태에서" — 첫 칩을 누르면 초점 공을 정면으로
 *     겨누고, 이미 정면이면 다음 공(3쿠션: 빨간 공 → 상대 수구, 4구: 빨간 공 둘)으로 넘어간다. 공 색 점이 지금 초점을 말한다.
 *  2. 당점 프리셋(무회전 · 밀어치기 · 끌어치기) · [되돌리기(onUndo 가 있을 때)] · ±0.1° 미세 조절(길게 누르면 가속)
 *     좌/우 버튼은 2026-09-17 에 뺐다(오너: "크게 안 쓰는 것 같다") — 두께 칩이 지금 겨누는 쪽으로 맞춘다.
 *     그 자리에 당점 프리셋을 넣었다: 당점은 샷마다 바꾸는 값인데 지금까지 **시트를 열어야만** 바꿀 수 있어
 *     가장 깊이 숨어 있었다. 위·아래 회전 셋이면 실전 대부분이 1탭으로 끝난다(옆당점은 정밀해야 해서 시트에 남긴다).
 * 375 px 폰에서 한 줄(정면 52 + 40×4 + 좌우·±0.1° 40×4 = 368 px)은 샷 버튼과 겹쳐 두 줄로 나눴다. 둘째 줄은 첫 줄보다 짧아
 * 되돌리기 하나가 들어간다 — 툴바에 두면 샷 뒤 버튼 수가 늘어 열을 넘쳤다(2026-09-07 리뷰). 높이 = 4 + 44 + 8 + 44 + 4 (+테두리 2) = 106.
 * 배경은 불투명 surface-1 — 토큰이 var() 라 Tailwind 투명도 수식어(surface-1/90)를 못 쓴다.
 */
interface Props {
    active: ActiveThickness | null;
    /**
     * 자동 초점 공 id(두께 칩의 기준 공). 첫 칩(예전 '정면')이 이 공 색 점을 보여 주고, 누르면 onFocus —
     * 그 공을 정면으로, 이미 정면이면 다음 공으로 넘어간다(2026-09-26 오너).
     */
    focusBallId?: string | null;
    onFocus?: () => void;
    disabled?: boolean;
    onThickness: (step: ThicknessStep) => void;
    onNudge: (dir: -1 | 1) => void;
    /** 지금 당점 — 프리셋 칩의 켜짐 표시에 쓴다. */
    spin: { readonly a: number; readonly b: number };
    /** 세로 당점만 바꾼다(옆당점은 링 안으로 줄어들 뿐 사라지지 않는다). */
    onSpinVertical: (b: number) => void;
    /** 되돌리기(연습·드릴에서 샷 뒤). 없으면 자리를 비운다. */
    onUndo?: (() => void) | null;
    className?: string;
}

/** 독 전체 높이(px) — 페이지가 TABLE_INSETS.bottom 을 정할 때 쓴다. */
export const DOCK_HEIGHT = 4 + 44 + 8 + 44 + 4 + 2;

const CHIP = "h-11 rounded-tile border text-[13px] font-semibold rk-num disabled:opacity-40";

/**
 * 당점 프리셋(2026-09-17, 좌/우 버튼을 뺀 자리). 세로 회전만 정한다 — 옆당점은 정밀해야 해서 시트에 남긴다.
 * 0.3 은 미스큐 링(0.5 R) 안쪽이라 안전하면서 회전은 확실히 걸리는 값이다.
 *
 * 셋을 위에서 아래 순서로 둔다(2026-09-17 오너: "당점 위로 공 중간 하단 공 3개") — 공의 세로축과 같은 차례라
 * 버튼 배열 자체가 뜻이 된다. 무회전을 버튼으로 두면 "지금 회전이 없다"가 켜짐으로 보여, 토글로 감추는 것보다 낫다.
 *
 * 글자 대신 공 그림(SpinIcon, 툴바가 쓰는 것과 같다)을 쓴다: 5개 언어에서 40 px 안에 들어가는 낱말을 찾기 어렵고,
 * 당점은 공 위의 점이 글자보다 빨리 읽힌다. 뜻은 aria-label 로 남긴다.
 */
const SPIN_PRESET_B = 0.3;
const SPIN_PRESETS = [
    { key: "top", b: SPIN_PRESET_B, labelKey: "sim.spin.presetTop" },
    { key: "center", b: 0, labelKey: "sim.spin.presetCenter" },
    { key: "back", b: -SPIN_PRESET_B, labelKey: "sim.spin.presetBack" },
] as const;
const CHIP_ON = "border-brand/45 bg-brand/[0.08] text-ink-1";
/** 초점 공 색 점 — 빨간 공·노란 공·흰 공(흰 공은 테두리로 모양을 잡는다). 모르면 비운 동그라미. */
function ballDotClass(id: string | null | undefined): string {
    if (!id) return "border-ink-4 bg-transparent";
    if (id.startsWith("red")) return "border-transparent bg-ball-red";
    if (id === "yellow") return "border-transparent bg-ball-yellow";
    return "border-ink-4 bg-ball-white";
}
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
                    if (step === 1 && p.onFocus) {
                        const label = t("sim.aim.autoFocus");
                        return (
                            <button
                                key={step} type="button" aria-pressed={on} disabled={p.disabled}
                                aria-label={t("sim.aim.autoFocusAria")} title={t("sim.aim.autoFocusAria")}
                                onClick={p.onFocus}
                                className={cn(CHIP, "min-w-[52px] px-2 inline-flex items-center justify-center gap-1", on ? CHIP_ON : CHIP_OFF)}
                            >
                                <span aria-hidden="true" className={cn("w-3 h-3 rounded-full shrink-0 border", ballDotClass(p.focusBallId))} />
                                {label}
                            </button>
                        );
                    }
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
            {/*
              * 둘째 줄만 간격이 6 px 이다(첫 줄은 8). 당점 셋이 들어오면서 연습 화면(되돌리기가 뜨는 유일한 곳)의
              * 둘째 줄이 길어져 오른쪽 샷 버튼까지 1 px 만 남았다 — 실측. 버튼을 줄이면 탭 대상 하한(40 px)이 깨지므로
              * 버튼 수가 더 많은 이 줄의 간격만 좁혔다(독 286 px, 샷 버튼까지 9 px). 대전엔 되돌리기가 없어 넉넉하다.
              */}
            <div className="flex gap-1.5">
                {SPIN_PRESETS.map((preset) => {
                    // 옆당점(a)은 건드리지 않고 세로(b)만 본다 — 옆을 준 채로 밀어치기를 고를 수 있어야 한다.
                    const on = Math.abs(p.spin.b - preset.b) < 0.02;
                    const label = t(preset.labelKey);
                    return (
                        <button
                            key={preset.key} type="button" aria-pressed={on} disabled={p.disabled}
                            aria-label={label} title={label}
                            onClick={() => p.onSpinVertical(preset.b)}
                            className={cn(CHIP, "w-10 flex items-center justify-center", on ? CHIP_ON : CHIP_OFF)}
                        >
                            <SpinIcon a={0} b={preset.b} />
                        </button>
                    );
                })}
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
