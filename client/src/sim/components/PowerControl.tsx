import { memo, useRef } from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { LucideMinus, LucidePlus } from "@/lib/icons";
import { useT } from "@/lib/i18n";
import { formatPower, POWER_FINE_STEP, stepPower } from "../controlsMath";
import { V0_MAX, V0_MIN } from "../simReducer";
import { HoldButton } from "./HoldButton";

// 세기(큐 속도 V0). 슬라이더 + ±0.05 m/s 미세 조절(길게 누르면 반복). 라벨은 "2.5 m/s · 28%".
// 큐를 뒤로 당기는 모습은 렌더러 cue.pullback(controlsMath.pullbackFor) 이 세기에 비례해 그린다.
interface Props {
    V0: number;
    disabled?: boolean;
    onChange: (V0: number) => void;
}

export const PowerControl = memo(function PowerControl({ V0, disabled, onChange }: Props) {
    const { t } = useT();
    // 길게 누르는 동안 누적되도록 최신 값을 ref 로 읽는다
    const v0Ref = useRef(V0);
    v0Ref.current = V0;

    return (
        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
            {/* 라벨 한 줄(세기 · 2.5 m/s · 28%) → 아래 줄에 [−] 슬라이더 [+]. 375px 폰에서 ± 버튼과 라벨이 겹치던 배치를 고쳤다. */}
            <div className="flex items-baseline justify-center gap-1.5 leading-tight">
                <span className="text-[12px] font-medium text-ink-4">{t("sim.controls.power")}</span>
                <span className="rk-num text-[14px] font-semibold text-ink-1 whitespace-nowrap">{formatPower(V0)}</span>
            </div>
            <div className="flex items-center gap-1">
                <HoldButton label={t("sim.controls.powerDown")} disabled={disabled} onTick={() => onChange(stepPower(v0Ref.current, -1))}>
                    <LucideMinus className="w-4 h-4" />
                </HoldButton>
            <SliderPrimitive.Root
                aria-label={t("sim.controls.power")}
                min={V0_MIN} max={V0_MAX} step={POWER_FINE_STEP}
                value={[V0]}
                disabled={disabled}
                onValueChange={([v]) => onChange(v)}
                className="relative flex flex-1 min-w-0 h-11 touch-none select-none items-center data-[disabled]:opacity-50"
            >
                <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-surface-3">
                    <SliderPrimitive.Range className="absolute h-full bg-brand" />
                </SliderPrimitive.Track>
                <SliderPrimitive.Thumb className="block h-7 w-7 rounded-full border-2 border-brand bg-surface-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40" />
            </SliderPrimitive.Root>
                <HoldButton label={t("sim.controls.powerUp")} disabled={disabled} onTick={() => onChange(stepPower(v0Ref.current, 1))}>
                    <LucidePlus className="w-4 h-4" />
                </HoldButton>
            </div>
        </div>
    );
});
