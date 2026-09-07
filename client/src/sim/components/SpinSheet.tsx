import { memo, useRef } from "react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { DEFAULT_CUE } from "@shared/sim/params";
import {
    ELEVATION_STEPS_DEG, elevationDeg, elevationFromArc, snapElevationDeg, spinFromPad, spinReadout,
} from "../controlsMath";

/**
 * 당점 · 큐 각 시트(아래에서 올라오는 시트). 툴바의 당점 버튼은 당점 탭으로, 큐 각 버튼은 큐 각 탭으로 연다.
 * 낮게(≤ 40dvh, 375×812 에서 ≈ 250 px) 만들고 배경을 어둡게 하지 않아(overlay 투명) 시트 뒤 테이블의 큐볼·큐대·첫 경로가
 * 바꾸는 대로 보인다 — 큰 공(220 px)에 64dvh 이던 첫 판은 헤드 쪽 절반을 덮어 미리보기가 안 보였다(2026-09-07 리뷰).
 * 시트 밖을 누르면 닫힌다(모달 — 테이블 제스처는 시트가 닫힌 뒤부터).
 *  - 첫 줄: 탭(당점 | 큐 각, 44 px) + 닫기 알약(44 px). 기본 X(16 px·영문)는 hideClose 로 뺀다.
 *  - 당점 탭: 공(min(40vw, 160px)) 안에서 누르거나 끌어 (a, b). 반지름 0.5 R 의 점선 미스큐 링 밖은 spinFromPad 가 링 위로 클램프.
 *    두 번 탭(300 ms) 또는 [중앙] 으로 (0, 0). 공 옆에 설명 · 읽기("당점 우 40% · 상 20%", 100 % = 링, 해법 시트와 같은 눈금) · 중앙.
 *  - 큐 각 탭: 원호 그림(공 · 큐대 · 0–45° 원호, 최대 폭 260)을 끌면 각이 따라오고, 아래 단계 칩(0·10·20·30·45°)으로 바로 고른다.
 * 열고 닫는 것만으로는 입력이 바뀌지 않고, 바꾸는 즉시 actions 로 흘러 미리보기가 갱신된다.
 * 공 색은 현재 큐볼(ball-white / ball-yellow — 공 색 코드 용도). 큐대 그림의 나무색은 그려진 사물이라 리터럴.
 */
export type SpinSheetTab = "spin" | "elevation";

export interface SpinSheetProps {
    open: boolean;
    tab: SpinSheetTab;
    onOpenChange: (open: boolean) => void;
    onTab: (tab: SpinSheetTab) => void;
    a: number;
    b: number;
    theta: number;
    cueBallId: "white" | "yellow";
    disabled?: boolean;
    onSpin: (a: number, b: number) => void;
    onElevation: (theta: number) => void;
}

const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_MOVE_PX = 8;
/** 공 지름(CSS). 375 px 폰에서 150 px — 시트가 테이블 헤드 쪽을 덮지 않게. */
const BALL_SIZE = "min(40vw, 160px)";

/* ------------------------------------------------------------------ 당점 공 */

function SpinBall({ a, b, cueBallId, disabled, onChange }: { a: number; b: number; cueBallId: "white" | "yellow"; disabled?: boolean; onChange: (a: number, b: number) => void }) {
    const { t } = useT();
    const pointerRef = useRef<number | null>(null);
    const lastTapRef = useRef<{ at: number; x: number; y: number } | null>(null);
    const ringPct = DEFAULT_CUE.maxOffset * 100;

    const apply = (e: React.PointerEvent<HTMLDivElement>) => {
        const r = e.currentTarget.getBoundingClientRect();
        const radius = r.width / 2;
        const s = spinFromPad(e.clientX - (r.left + radius), e.clientY - (r.top + r.height / 2), radius);
        onChange(s.a, s.b);
    };
    const end = (e: React.PointerEvent<HTMLDivElement>) => {
        if (pointerRef.current !== e.pointerId) return;
        pointerRef.current = null;
        try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* noop */ }
    };

    return (
        <div
            role="group"
            aria-label={t("sim.controls.spin")}
            title={t("sim.controls.spinReset")}
            aria-disabled={disabled || undefined}
            style={{ width: BALL_SIZE, height: BALL_SIZE }}
            className={cn(
                "relative shrink-0 rounded-pill border border-surface-line select-none touch-none overflow-hidden rk-shadow",
                cueBallId === "yellow" ? "bg-ball-yellow" : "bg-ball-white",
                disabled && "opacity-50",
            )}
            onPointerDown={(e) => {
                if (disabled || pointerRef.current !== null) return;
                if (e.pointerType === "mouse" && e.button !== 0) return;
                pointerRef.current = e.pointerId;
                try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* noop */ }
                const now = performance.now();
                const last = lastTapRef.current;
                lastTapRef.current = { at: now, x: e.clientX, y: e.clientY };
                if (last && now - last.at < DOUBLE_TAP_MS && Math.hypot(e.clientX - last.x, e.clientY - last.y) < DOUBLE_TAP_MOVE_PX) {
                    lastTapRef.current = null;
                    onChange(0, 0);
                    return;
                }
                apply(e);
            }}
            onPointerMove={(e) => { if (pointerRef.current === e.pointerId && !disabled) apply(e); }}
            onPointerUp={end}
            onPointerCancel={end}
            onLostPointerCapture={() => { pointerRef.current = null; }}
            onContextMenu={(e) => e.preventDefault()}
        >
            {/* 십자선 */}
            <div className="absolute left-1/2 top-0 bottom-0 w-px bg-surface-line" />
            <div className="absolute top-1/2 left-0 right-0 h-px bg-surface-line" />
            {/* 미스큐 링(0.5 R) */}
            <div
                className="absolute rounded-pill border border-dashed border-surface-line"
                style={{ width: `${ringPct}%`, height: `${ringPct}%`, left: `${50 - ringPct / 2}%`, top: `${50 - ringPct / 2}%` }}
            />
            {/* 당점 */}
            <div
                className="absolute w-5 h-5 -ml-2.5 -mt-2.5 rounded-pill bg-brand border-2 border-surface-1 rk-shadow"
                style={{ left: `${50 + a * 50}%`, top: `${50 - b * 50}%` }}
            />
        </div>
    );
}

/* ------------------------------------------------------------------ 큐 각 원호 */

// 뷰박스 260 × 150. 피벗(큐 팁이 공에 닿는 점) 오른쪽으로 큐대가 뻗고, 각이 커질수록 손잡이가 올라간다.
const VB_W = 260;
const VB_H = 150;
const PIVOT_X = 46;
const PIVOT_Y = 118;
const BALL_R = 16;
const ARC_R = 90;
const CUE_L = 150;
const CUE_SHAFT = "#C9955A";
const CUE_BUTT = "#4E2E19";
const CUE_EDGE = "rgba(0,0,0,0.35)";

function polar(deg: number, r: number): [number, number] {
    const t = (deg * Math.PI) / 180;
    return [PIVOT_X + r * Math.cos(t), PIVOT_Y - r * Math.sin(t)];
}

function ElevationArc({ theta, cueBallId, disabled, onChange }: { theta: number; cueBallId: "white" | "yellow"; disabled?: boolean; onChange: (theta: number) => void }) {
    const { t } = useT();
    const pointerRef = useRef<number | null>(null);
    const deg = elevationDeg(theta);
    const [ax, ay] = polar(ELEVATION_STEPS_DEG[ELEVATION_STEPS_DEG.length - 1], ARC_R);
    const [bx, by] = polar(0, ARC_R);
    // 큐대: 팁이 피벗, 손잡이가 θ 방향 150 단위 밖. 폭은 팁 4 → 손잡이 9.
    const rad = (deg * Math.PI) / 180;
    const ux = Math.cos(rad), uy = -Math.sin(rad);
    const nx = -uy, ny = ux;
    const tipW = 2, buttW = 4.5;
    const cue = [
        [PIVOT_X + nx * tipW, PIVOT_Y + ny * tipW],
        [PIVOT_X + ux * CUE_L + nx * buttW, PIVOT_Y + uy * CUE_L + ny * buttW],
        [PIVOT_X + ux * CUE_L - nx * buttW, PIVOT_Y + uy * CUE_L - ny * buttW],
        [PIVOT_X - nx * tipW, PIVOT_Y - ny * tipW],
    ].map((p) => p.map((v) => v.toFixed(1)).join(",")).join(" ");
    const midW = 3.2;
    const shaft = [
        [PIVOT_X + nx * tipW, PIVOT_Y + ny * tipW],
        [PIVOT_X + ux * CUE_L * 0.55 + nx * midW, PIVOT_Y + uy * CUE_L * 0.55 + ny * midW],
        [PIVOT_X + ux * CUE_L * 0.55 - nx * midW, PIVOT_Y + uy * CUE_L * 0.55 - ny * midW],
        [PIVOT_X - nx * tipW, PIVOT_Y - ny * tipW],
    ].map((p) => p.map((v) => v.toFixed(1)).join(",")).join(" ");

    const apply = (e: React.PointerEvent<HTMLDivElement>) => {
        const r = e.currentTarget.getBoundingClientRect();
        if (r.width <= 0) return;
        const k = VB_W / r.width;
        const dx = (e.clientX - r.left) * k - PIVOT_X;
        const dy = (e.clientY - r.top) * k - PIVOT_Y;
        const next = snapElevationDeg(elevationFromArc(dx, dy));
        if (next !== deg) onChange((next * Math.PI) / 180);
    };
    const end = (e: React.PointerEvent<HTMLDivElement>) => {
        if (pointerRef.current !== e.pointerId) return;
        pointerRef.current = null;
        try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* noop */ }
    };

    return (
        <div className="w-full max-w-[260px] flex flex-col gap-3">
            <div
                role="group"
                aria-label={t("sim.rail.elevation")}
                aria-disabled={disabled || undefined}
                className={cn("relative w-full select-none touch-none rounded-tile border border-surface-line bg-surface-3", disabled && "opacity-50")}
                style={{ aspectRatio: `${VB_W} / ${VB_H}` }}
                onPointerDown={(e) => {
                    if (disabled || pointerRef.current !== null) return;
                    if (e.pointerType === "mouse" && e.button !== 0) return;
                    pointerRef.current = e.pointerId;
                    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* noop */ }
                    apply(e);
                }}
                onPointerMove={(e) => { if (pointerRef.current === e.pointerId && !disabled) apply(e); }}
                onPointerUp={end}
                onPointerCancel={end}
                onLostPointerCapture={() => { pointerRef.current = null; }}
                onContextMenu={(e) => e.preventDefault()}
            >
                <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="absolute inset-0 w-full h-full" aria-hidden="true">
                    {/* 라사 */}
                    <line x1="0" y1={PIVOT_Y + BALL_R} x2={VB_W} y2={PIVOT_Y + BALL_R} className="stroke-cloth" strokeWidth="3" />
                    {/* 0° 기준선 · 원호 · 단계 눈금 */}
                    <line x1={PIVOT_X} y1={PIVOT_Y} x2={VB_W - 8} y2={PIVOT_Y} className="stroke-ink-4" strokeWidth="1" strokeDasharray="3 4" />
                    <path d={`M${bx} ${by} A${ARC_R} ${ARC_R} 0 0 0 ${ax.toFixed(1)} ${ay.toFixed(1)}`} className="stroke-ink-4" strokeWidth="1" fill="none" />
                    {ELEVATION_STEPS_DEG.map((d) => {
                        const [x, y] = polar(d, ARC_R);
                        return <circle key={d} cx={x.toFixed(1)} cy={y.toFixed(1)} r={d === deg ? 4 : 2.5} className={d === deg ? "fill-brand" : "fill-ink-4"} />;
                    })}
                    {/* 공 */}
                    <circle cx={PIVOT_X - BALL_R} cy={PIVOT_Y} r={BALL_R} className={cn(cueBallId === "yellow" ? "fill-ball-yellow" : "fill-ball-white", "stroke-ink-4")} strokeWidth="0.8" />
                    {/* 큐대 */}
                    <polygon points={cue} fill={CUE_BUTT} stroke={CUE_EDGE} strokeWidth="0.6" />
                    <polygon points={shaft} fill={CUE_SHAFT} stroke={CUE_EDGE} strokeWidth="0.6" />
                </svg>
                <span className="absolute right-2 top-2 rk-num text-[12px] font-semibold text-ink-2">{deg}°</span>
            </div>
            <div className="flex gap-1" role="group" aria-label={t("sim.rail.elevation")}>
                {ELEVATION_STEPS_DEG.map((d) => {
                    const on = d === deg;
                    return (
                        <button
                            key={d} type="button" aria-pressed={on} disabled={disabled}
                            onClick={() => onChange((d * Math.PI) / 180)}
                            className={cn(
                                "flex-1 h-11 rounded-tile border text-[13px] font-semibold rk-num disabled:opacity-40",
                                on ? "border-brand/45 bg-brand/[0.08] text-ink-1" : "border-surface-line bg-surface-1 text-ink-3",
                            )}
                        >
                            {d}°
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

/* ------------------------------------------------------------------ 시트 */

const TAB = "flex-1 h-11 rounded-tile text-[13px] font-semibold";

export const SpinSheet = memo(function SpinSheet(p: SpinSheetProps) {
    const { t } = useT();
    const readout = spinReadout(p.a, p.b, t);
    const centred = Math.abs(p.a) < 0.005 && Math.abs(p.b) < 0.005;
    const desc = p.tab === "spin" ? t("sim.spin.desc") : t("sim.spin.elevationDesc");
    return (
        <Sheet open={p.open} onOpenChange={p.onOpenChange}>
            <SheetContent
                side="bottom" hideClose overlayClassName="bg-transparent"
                className="rounded-t-card p-0 max-h-[40dvh] flex flex-col gap-0 pb-safe"
            >
                <SheetTitle className="sr-only">{t("sim.spin.title")}</SheetTitle>
                <SheetDescription className="sr-only">{desc}</SheetDescription>
                <div className="shrink-0 px-4 pt-3 flex items-center gap-2">
                    <div role="tablist" className="flex-1 p-0.5 flex gap-1 rounded-tile bg-surface-3">
                        {(["spin", "elevation"] as const).map((tab) => {
                            const on = p.tab === tab;
                            return (
                                <button
                                    key={tab} type="button" role="tab" aria-selected={on} onClick={() => p.onTab(tab)}
                                    className={cn(TAB, on ? "bg-surface-1 text-ink-1 rk-shadow" : "text-ink-3")}
                                >
                                    {tab === "spin" ? t("sim.controls.spin") : t("sim.rail.elevation")}
                                </button>
                            );
                        })}
                    </div>
                    <button
                        type="button" onClick={() => p.onOpenChange(false)}
                        className="h-11 px-4 shrink-0 rounded-pill border border-surface-line bg-surface-1 text-[13px] font-semibold text-ink-2 active:bg-surface-3"
                    >
                        {t("sim.common.close")}
                    </button>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-4 py-3 flex flex-col items-center">
                    {p.tab === "spin" ? (
                        <div className="w-full flex items-center gap-4">
                            <SpinBall a={p.a} b={p.b} cueBallId={p.cueBallId} disabled={p.disabled} onChange={p.onSpin} />
                            <div className="flex-1 min-w-0 flex flex-col items-start gap-2">
                                <p className="text-[12px] font-medium text-ink-3 leading-snug">{desc}</p>
                                <p className="text-[13px] leading-tight" aria-live="polite">
                                    <span className="font-medium text-ink-3">{t("sim.controls.spin")}</span>
                                    <span className="rk-num font-semibold text-ink-1 ml-1.5">{readout}</span>
                                </p>
                                <button
                                    type="button" onClick={() => p.onSpin(0, 0)} disabled={p.disabled || centred}
                                    className="h-11 px-4 rounded-pill border border-surface-line bg-surface-1 text-[13px] font-semibold text-ink-2 active:bg-surface-3 disabled:opacity-40"
                                >
                                    {t("sim.controls.spinCenter")}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <ElevationArc theta={p.theta} cueBallId={p.cueBallId} disabled={p.disabled} onChange={p.onElevation} />
                    )}
                </div>
            </SheetContent>
        </Sheet>
    );
});
