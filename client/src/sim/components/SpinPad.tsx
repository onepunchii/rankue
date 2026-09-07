import { memo, useRef } from "react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { padOffsetFor, spinFromPad } from "../controlsMath";
import { DEFAULT_CUE } from "@shared/sim/params";

// 당점 패드. 큐볼 크기의 원(지름 PAD px) 안에서 누르거나 끌어 (a, b) 를 고른다.
// 반지름 0.5 R 의 미스큐 링(surface-line 원) 밖은 controlsMath.spinFromPad 가 링 위로 클램프한다.
// 두 번 탭(300 ms 안, 거의 안 움직임)하면 중앙(0, 0). 색은 현재 큐볼 색(ball-white / ball-yellow) — 공 색 코드 용도.
// 아래 한 줄은 "당점 중앙" / "당점 우 0.20 · 상 0.10" — 엔진 좌표 이름(a·b)은 화면에 내지 않는다.
export const PAD_PX = 112;
const R_PX = PAD_PX / 2;
const RING_PX = R_PX * DEFAULT_CUE.maxOffset;
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_MOVE_PX = 8;

interface Props {
    a: number;
    b: number;
    cueBallId: "white" | "yellow";
    disabled?: boolean;
    onChange: (a: number, b: number) => void;
}

/** 당점 읽기: 중앙이면 "중앙", 아니면 "우 0.20 · 상 0.10"(R 비율, +a = 오른쪽, +b = 위). */
export function spinLabel(a: number, b: number, t: (key: string) => string): string {
    const ra = Math.round(a * 100) / 100;
    const rb = Math.round(b * 100) / 100;
    if (ra === 0 && rb === 0) return t("sim.controls.spinCenter");
    const parts: string[] = [];
    if (ra !== 0) parts.push(`${t(ra > 0 ? "sim.controls.spinRight" : "sim.controls.spinLeft")} ${Math.abs(ra).toFixed(2)}`);
    if (rb !== 0) parts.push(`${t(rb > 0 ? "sim.controls.spinTop" : "sim.controls.spinBottom")} ${Math.abs(rb).toFixed(2)}`);
    return parts.join(" · ");
}

export const SpinPad = memo(function SpinPad({ a, b, cueBallId, disabled, onChange }: Props) {
    const { t } = useT();
    const pointerRef = useRef<number | null>(null);
    const lastTapRef = useRef<{ at: number; x: number; y: number } | null>(null);
    const dot = padOffsetFor(a, b, R_PX);

    const apply = (e: React.PointerEvent<HTMLDivElement>) => {
        const r = e.currentTarget.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        const s = spinFromPad(dx, dy, R_PX);
        onChange(s.a, s.b);
    };

    const end = (e: React.PointerEvent<HTMLDivElement>) => {
        if (pointerRef.current !== e.pointerId) return;
        pointerRef.current = null;
        try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* noop */ }
    };

    return (
        <div className="flex flex-col items-center gap-1 shrink-0">
            <div
                role="group"
                aria-label={t("sim.controls.spin")}
                title={t("sim.controls.spinReset")}
                aria-disabled={disabled || undefined}
                style={{ width: PAD_PX, height: PAD_PX }}
                className={cn(
                    "relative rounded-full border border-surface-line select-none touch-none overflow-hidden",
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
                {/* 미스큐 링 (0.5 R) */}
                <div
                    className="absolute rounded-full border border-dashed border-surface-line"
                    style={{ width: RING_PX * 2, height: RING_PX * 2, left: R_PX - RING_PX, top: R_PX - RING_PX }}
                />
                {/* 당점 */}
                <div
                    className="absolute w-3.5 h-3.5 rounded-full bg-brand border-2 border-surface-1"
                    style={{ left: R_PX + dot.x - 7, top: R_PX + dot.y - 7 }}
                />
            </div>
            <span className="text-[12px] leading-none whitespace-nowrap">
                <span className="font-medium text-ink-3">{t("sim.controls.spin")}</span>
                <span className="rk-num font-semibold text-ink-2 ml-1">{spinLabel(a, b, t)}</span>
            </span>
        </div>
    );
});
