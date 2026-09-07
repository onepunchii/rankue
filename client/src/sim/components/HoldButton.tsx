import { memo, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { createHoldRepeat, type HoldRepeat } from "../holdRepeat";

// 길게 누르면 반복·가속하는 버튼(± 0.1°, ± 0.05 m/s). 포인터를 누르는 순간 1회, 이후 holdRepeat 가 반복한다.
// 키보드(Enter/Space)는 click 만 오므로 e.detail === 0 인 click 에서 1회 실행한다(마우스 click 은 pointerdown 과 중복이라 무시).
interface Props {
    label: string;
    onTick: () => void;
    disabled?: boolean;
    className?: string;
    children: React.ReactNode;
}

export const HoldButton = memo(function HoldButton({ label, onTick, disabled, className, children }: Props) {
    const tickRef = useRef(onTick);
    tickRef.current = onTick;
    const repRef = useRef<HoldRepeat | null>(null);
    if (repRef.current === null) repRef.current = createHoldRepeat({ onTick: () => tickRef.current() });

    useEffect(() => () => repRef.current?.stop(), []);

    const stop = () => repRef.current?.stop();

    return (
        <button
            type="button"
            aria-label={label}
            title={label}
            disabled={disabled}
            onPointerDown={(e) => {
                if (disabled) return;
                if (e.pointerType === "mouse" && e.button !== 0) return;
                try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* 지원 안 함 */ }
                repRef.current?.start();
            }}
            onPointerUp={stop}
            onPointerCancel={stop}
            onPointerLeave={stop}
            onLostPointerCapture={stop}
            onContextMenu={(e) => e.preventDefault()}
            onClick={(e) => { if (e.detail === 0 && !disabled) tickRef.current(); }}
            className={cn(
                "h-11 min-w-11 px-2 rounded-tile border border-surface-line bg-surface-1 text-ink-2 flex items-center justify-center",
                "select-none touch-none active:bg-surface-3 disabled:opacity-40 disabled:pointer-events-none",
                className,
            )}
        >
            {children}
        </button>
    );
});
