export type BallColor = "white" | "yellow" | "red";

// 3D-glossy billiard ball rendered purely in CSS (no image assets, no blur filter).
// The sphere shading is a radial gradient; the specular highlight is a soft radial spot.
const PALETTE: Record<BallColor, { hi: string; base: string; lo: string }> = {
    white: { hi: "#ffffff", base: "#efece2", lo: "#c2bfb2" },
    yellow: { hi: "#ffe98a", base: "#f4c20d", lo: "#a97e00" },
    red: { hi: "#ff9382", base: "#e02d2d", lo: "#8c1212" },
};

export function BilliardBall({ color, size = 22 }: { color: BallColor; size?: number }) {
    const c = PALETTE[color];
    return (
        <span
            aria-hidden
            style={{
                width: size,
                height: size,
                borderRadius: "50%",
                display: "inline-block",
                position: "relative",
                background: `radial-gradient(circle at 34% 30%, ${c.hi} 0%, ${c.base} 46%, ${c.lo} 100%)`,
                boxShadow: `0 ${size * 0.09}px ${size * 0.14}px rgba(0,0,0,0.22), inset -1px -1.5px 2px rgba(0,0,0,0.18)`,
            }}
        >
            <span
                style={{
                    position: "absolute",
                    top: "14%",
                    left: "20%",
                    width: "46%",
                    height: "46%",
                    borderRadius: "50%",
                    background: "radial-gradient(circle at 38% 38%, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0) 68%)",
                }}
            />
        </span>
    );
}

// Slightly overlapping cluster (billiard-rack feel). Later balls sit in front.
export function BallCluster({ colors, size = 22 }: { colors: BallColor[]; size?: number }) {
    return (
        <div className="flex items-center" style={{ paddingRight: size * 0.28 }}>
            {colors.map((color, i) => (
                <span key={i} style={{ marginLeft: i === 0 ? 0 : -size * 0.28, zIndex: i }}>
                    <BilliardBall color={color} size={size} />
                </span>
            ))}
        </div>
    );
}
