import { ReactNode } from "react";

interface RadialGaugeProps {
    /** 0–100 */
    value: number;
    size?: number;
    stroke?: number;
    /** CSS color for the progress arc (e.g. "rgb(var(--brand))") */
    color?: string;
    trackColor?: string;
    children?: ReactNode;
}

/**
 * Minimal circular progress gauge (donut). The signature element of the new
 * "pro sports app" look — replaces gradient/glow stat blobs with a clean arc.
 */
export function RadialGauge({
    value,
    size = 76,
    stroke = 7,
    color = "rgb(var(--brand))",
    trackColor = "rgba(255,255,255,0.08)",
    children,
}: RadialGaugeProps) {
    const r = (size - stroke) / 2;
    const circ = 2 * Math.PI * r;
    const pct = Math.max(0, Math.min(100, value || 0));
    const dash = (pct / 100) * circ;

    return (
        <div className="relative inline-flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
            <svg width={size} height={size} className="-rotate-90">
                <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={trackColor} strokeWidth={stroke} />
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={r}
                    fill="none"
                    stroke={color}
                    strokeWidth={stroke}
                    strokeLinecap="round"
                    strokeDasharray={`${dash} ${circ}`}
                    style={{ transition: "stroke-dasharray 0.6s cubic-bezier(0.22,1,0.36,1)" }}
                />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">{children}</div>
        </div>
    );
}
