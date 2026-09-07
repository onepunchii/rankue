import { memo } from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { formatSpeed, POWER_FINE_STEP, powerPercent } from "../controlsMath";
import { V0_MAX, V0_MIN } from "../simReducer";

/**
 * 세로 큐 슬라이더(세기 V0). 오른쪽 툴바 아래에 놓이고 남은 높이를 채운다.
 *  - 불투명 흰 알약(surface-1 + surface-line, 44 px 폭) 하나가 읽기·트랙·큐대를 모두 감싼다 — 캔버스 위에 바로 놓으면 3D 렌더러의
 *    바닥·라사 위에서 글자가 안 읽히고, 렌더러가 그리는 큐대(1.45 m)가 슬라이더 틈으로 비쳤다(2026-09-07 리뷰; 목업의 28×300 흰 알약).
 *  - 위에 "28%" 읽기(rk-num 12 px) 한 줄, 그 아래 트랙. m/s 는 title 로만(2026-09-07 오너: 깔끔하게 퍼센트로). 한 줄인 이유는
 *    오른쪽 열 높이 예산(375×812 에서 툴바 8개 md).
 *  - 엄지(thumb)가 큐대 그림(SVG: 팁·페룰·샤프트·손잡이 — 그려진 사물이라 나무색 리터럴)이다. inverted 세로 슬라이더라
 *    아래로 끌수록 세지고, 큐대가 아래로(공에서 멀리) 당겨진다 — 참조 게임의 큐 슬라이더와 같은 손맛.
 *    radix 는 엄지를 트랙 안에 가두므로 큐대 길이만큼 이동 범위가 줄어든다(트랙 − CUE_PX). 그래서 큐대는 100 px 로 짧게.
 *  - 터치 폭 44 px(w-11), touch-none. 미세 조절 ± 는 페이지가 샷 버튼 옆에 따로 둔다.
 *  - compact(짧은 화면): 큐대를 80 px 로, 트랙 최소 높이를 낮춘다. 트랙 최소 높이는 flex 에서 툴바보다 우선한다.
 */
interface Props {
    V0: number;
    disabled?: boolean;
    onChange: (V0: number) => void;
    compact?: boolean;
    className?: string;
}

/** 큐대 엄지 높이(px). 트랙 높이 − 이 값 = 엄지 이동 거리. compact 는 CUE_PX_SM. */
export const CUE_PX = 100;
export const CUE_PX_SM = 80;
/** 트랙 최소 높이(px): 큐대 + 이동 거리 ≥ 60. */
const TRACK_MIN = 160;
const TRACK_MIN_SM = 140;
/**
 * 알약 전체 최소 높이(px) — 페이지가 오른쪽 열의 고정 높이를 셀 때(railLayout.railFitsMd) 쓴다.
 * py-2(16) + 읽기 한 줄(12, leading-none) + gap-1(4) + 트랙 최소 + 테두리 2.
 */
export const POWER_RAIL_MIN_MD = 16 + 12 + 4 + TRACK_MIN + 2;
export const POWER_RAIL_MIN_SM = 16 + 12 + 4 + TRACK_MIN_SM + 2;

// 큐대 색(그려진 사물 — 렌더러 Canvas2DRenderer 의 큐대와 같은 톤)
const CUE_SHAFT = "#C9955A";
const CUE_BUTT = "#4E2E19";
const CUE_FERRULE = "#EDE6D6";
const CUE_TIP = "#2F4A66";
const CUE_EDGE = "rgba(0,0,0,0.35)";

/** 팁이 위. 세로 100 × 가로 20 뷰박스(높이는 px 로 늘여 그린다), 손잡이 쪽이 살짝 굵다. */
function CueStick({ height }: { height: number }) {
    return (
        <svg width="20" height={height} viewBox={`0 0 20 ${CUE_PX}`} preserveAspectRatio="none" aria-hidden="true" className="block">
            <rect x="8" y="1" width="4" height="3" rx="1" fill={CUE_TIP} stroke={CUE_EDGE} strokeWidth="0.5" />
            <rect x="8" y="4" width="4" height="6" fill={CUE_FERRULE} stroke={CUE_EDGE} strokeWidth="0.5" />
            <path d="M8 10h4l1.2 46H6.8z" fill={CUE_SHAFT} stroke={CUE_EDGE} strokeWidth="0.5" />
            <path d="M6.8 56h6.4L14 98H6z" fill={CUE_BUTT} stroke={CUE_EDGE} strokeWidth="0.5" />
        </svg>
    );
}

export const PowerRail = memo(function PowerRail({ V0, disabled, onChange, compact, className }: Props) {
    const { t } = useT();
    const cuePx = compact ? CUE_PX_SM : CUE_PX;
    return (
        <div className={cn("flex flex-col items-center gap-1 w-11 py-2 rounded-pill bg-surface-1 border border-surface-line rk-shadow", className)}>
            <span className="shrink-0 rk-num text-[12px] leading-none font-semibold text-ink-1 whitespace-nowrap" title={`${formatSpeed(V0)} m/s`}>
                {powerPercent(V0)}%
            </span>
            <SliderPrimitive.Root
                aria-label={t("sim.controls.power")}
                orientation="vertical"
                inverted
                min={V0_MIN} max={V0_MAX} step={POWER_FINE_STEP}
                value={[V0]}
                disabled={disabled}
                onValueChange={([v]) => onChange(v)}
                className="relative flex-1 w-full flex justify-center touch-none select-none data-[disabled]:opacity-50"
                style={{ minHeight: compact ? TRACK_MIN_SM : TRACK_MIN }}
            >
                <SliderPrimitive.Track className="relative w-2 h-full rounded-full bg-surface-3">
                    <SliderPrimitive.Range className="absolute w-full rounded-full bg-brand" />
                </SliderPrimitive.Track>
                <SliderPrimitive.Thumb
                    aria-label={t("sim.controls.power")}
                    className="flex w-full items-start justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 rounded-pill"
                    style={{ height: cuePx }}
                >
                    <CueStick height={cuePx} />
                </SliderPrimitive.Thumb>
            </SliderPrimitive.Root>
        </div>
    );
});
