/**
 * 관전·다시보기 샷 띠(2026-09-30 오너: "관전·다시보기에서 샷을 할 때 당점이 어디며 파워는 어느 정도인지 — 당구대를 가리지 않고").
 *
 * 당구대 **밑** 한 줄(높이 고정)이다. 당구대 위에는 아무것도 얹지 않는다 — 전에는 "OO님 차례" 카드가 테이블 아래쪽을 덮었는데
 * 그 말도 이 띠로 옮겼다. 두 상태:
 *  - 조준 중: "박큐 조준 중" + 샷 시계 + (있으면) 직전 샷 한 점(수구·세기 %) — 방금 샷을 놓친 사람도 무엇을 쳤는지 본다.
 *  - 샷(재생 중·재생 후): 수구 그림에 **빨간 점 = 당점**, "우 40% · 상 20%", 세기 막대(재생이 시작되면 차오른다), 큐를 세웠으면 "큐 20°".
 * 눈금과 문구는 선수 화면(당점 시트·세기 레일)과 **같은 함수**(spinReadout·powerPercent·elevationDeg)라 같은 샷이 같은 숫자로 읽힌다.
 * 서버에 더 얹는 것은 없다 — 샷마다 이미 저장된 입력(a·b·V0·θ)을 그대로 읽는다.
 */
import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { ShotInput } from "@shared/sim/types";
import { DEFAULT_CUE } from "@shared/sim/params";
import { elevationDeg, padOffsetFor, powerPercent, spinReadout } from "../controlsMath";
import { ShotClock } from "../components/ShotClock";

/** 이만큼 세워야 "큐 N°" 를 붙인다 — 0° 근처의 흔들림을 배지로 만들지 않는다 */
const CUE_ANGLE_BADGE_DEG = 5;

/** 수구 색 — 렌더러(Canvas2D·Three)와 같은 규칙: id 가 yellow 로 시작하면 노란 공, 아니면 흰 공 */
const cueFill = (cueBallId: string) => (cueBallId.startsWith("yellow") ? "#F4C542" : "#F4F2EC");

/** 작은 수구 — 점선 원이 미스큐 한계(maxOffset·R), 빨간 점이 당점. radius 는 공 반지름(px) */
export function TipBall({ input, maxOffset, size = 34 }: { input: Pick<ShotInput, "a" | "b" | "cueBallId">; maxOffset: number; size?: number }) {
    const r = size / 2;
    const dot = padOffsetFor(input.a, input.b, r);
    const dotR = Math.max(3, Math.round(size * 0.11));
    return (
        <span aria-hidden className="relative shrink-0 rounded-full ring-1 ring-inset ring-black/15" style={{ width: size, height: size, background: cueFill(input.cueBallId) }}>
            <span className="absolute rounded-full border border-dashed border-black/25" style={{ left: r - maxOffset * r, top: r - maxOffset * r, width: 2 * maxOffset * r, height: 2 * maxOffset * r }} />
            <span className="absolute rounded-full bg-[#E24B4A] ring-2 ring-white/70" style={{ left: r + dot.x - dotR, top: r + dot.y - dotR, width: dotR * 2, height: dotR * 2 }} />
        </span>
    );
}

export type ShotStripState =
    | { kind: "aim"; name: string; seconds: number | null; last: { input: ShotInput } | null }
    | { kind: "shot"; name: string; input: ShotInput; playing: boolean; shotKey: string | number }
    | { kind: "idle" };

export function ShotStrip({ state, maxOffset = DEFAULT_CUE.maxOffset }: { state: ShotStripState; maxOffset?: number }) {
    const { t } = useT();
    return (
        <div className="shrink-0 px-4 pt-2">
            <div className="min-h-[52px] rounded-card bg-surface-1 border border-surface-line px-3 py-2 flex items-center gap-3" aria-live="polite">
                {state.kind === "aim" && (
                    <>
                        <span className="min-w-0 flex-1 text-[13px] font-semibold text-ink-1 truncate">{t("sim.watch.aiming").replace("{name}", state.name)}</span>
                        {state.last && (
                            <span className="shrink-0 flex items-center gap-1.5 text-[11.5px] text-ink-3" title={t("sim.watch.lastShot")}>
                                <TipBall input={state.last.input} maxOffset={maxOffset} size={22} />
                                <span className="tabular-nums">{powerPercent(state.last.input.V0)}%</span>
                            </span>
                        )}
                        {state.seconds !== null && <ShotClock seconds={state.seconds} mine={false} size={30} />}
                    </>
                )}
                {state.kind === "shot" && <ShotReadout key={state.shotKey} name={state.name} input={state.input} playing={state.playing} maxOffset={maxOffset} />}
                {state.kind === "idle" && <span className="text-[12.5px] text-ink-3">{t("sim.watch.stripHint")}</span>}
            </div>
        </div>
    );
}

/** 샷 한 개의 당점·세기. key 가 샷마다 바뀌어 새로 붙는다 — 그래서 세기 막대가 0 에서 차오른다 */
function ShotReadout({ name, input, playing, maxOffset }: { name: string; input: ShotInput; playing: boolean; maxOffset: number }) {
    const { t } = useT();
    const pct = powerPercent(input.V0);
    // 재생 중에 붙었으면 0 → 목표로 차오른다. 이미 끝난 샷(따라잡기로 건너뛴 것)은 처음부터 목표값.
    const [shown, setShown] = useState(playing ? 0 : pct);
    useEffect(() => {
        if (!playing) { setShown(pct); return; }
        const id = requestAnimationFrame(() => setShown(pct));
        return () => cancelAnimationFrame(id);
    }, [pct, playing]);
    const deg = elevationDeg(input.theta);
    return (
        <>
            <TipBall input={input} maxOffset={maxOffset} />
            <span className="min-w-0 flex-1">
                <span className="block text-[12.5px] font-semibold text-ink-1 truncate">
                    {name} · {spinReadout(input.a, input.b, t, maxOffset)}
                </span>
                <span className="mt-1 flex items-center gap-2">
                    <span className="flex-1 h-1.5 rounded-full bg-surface-3 overflow-hidden" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={t("sim.controls.power")}>
                        <span className="block h-full rounded-full bg-brand transition-[width] duration-700 ease-out motion-reduce:transition-none" style={{ width: `${shown}%` }} />
                    </span>
                    <span className="shrink-0 text-[11.5px] font-medium text-ink-2 tabular-nums">{t("sim.controls.power")} {pct}%</span>
                </span>
            </span>
            {deg >= CUE_ANGLE_BADGE_DEG && (
                <span className={cn("shrink-0 h-6 px-2 rounded-pill text-[11.5px] font-semibold leading-6 tabular-nums", "bg-[#FF8A3D1F] text-[#FF8A3D]")}>
                    {t("sim.watch.cueAngle").replace("{n}", String(deg))}
                </span>
            )}
        </>
    );
}
