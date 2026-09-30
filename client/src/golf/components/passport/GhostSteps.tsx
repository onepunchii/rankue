/**
 * 빈 화면 그림 — 흐린 발자국 넷이 빈 칸으로 걸어 들어간다(장식, 실제 위치가 아니다). 발자국 탭은 점선 **도장 칸**(①),
 * 앨범 탭은 점선 **사진 칸**(카메라) — 두 빈 화면이 같은 말투로 "여기가 첫 자리"라고 말한다.
 */
import { FOOT } from "@shared/golfFootprints";

export function GhostSteps({ goal = "stamp" }: { goal?: "stamp" | "photo" }) {
    const steps = [[18, 78, -1], [34, 64, 1], [46, 48, -1], [60, 34, 1]] as const;
    return (
        <svg viewBox="0 0 120 100" className="w-[132px] h-[110px]" aria-hidden="true">
            {goal === "stamp" ? (
                <>
                    <circle cx="92" cy="22" r="15" fill="none" stroke="#FFFFFF59" strokeWidth="1.6" strokeDasharray="3 3.2" />
                    <text x="92" y="22" textAnchor="middle" dominantBaseline="central" fontSize="13" fontWeight="800" fill="#FFFFFF73">1</text>
                </>
            ) : (
                <>
                    <rect x="76" y="6" width="32" height="32" rx="8" fill="none" stroke="#9BEF5C99" strokeWidth="1.6" strokeDasharray="3 3.2" />
                    {/* 카메라 — 몸통 · 렌즈 · 위 턱 */}
                    <rect x="83.5" y="16" width="17" height="12" rx="3" fill="none" stroke="#9BEF5C" strokeWidth="1.6" />
                    <path d="M88.5 16 L90 13.5 H94 L95.5 16" fill="none" stroke="#9BEF5C" strokeWidth="1.6" strokeLinejoin="round" />
                    <circle cx="92" cy="22" r="3" fill="none" stroke="#9BEF5C" strokeWidth="1.6" />
                </>
            )}
            {steps.map(([x, y, side], i) => (
                <g key={i} transform={`translate(${x} ${y}) rotate(${48}) scale(${side * 1.25} 1.25)`} fill={goal === "photo" ? "#9BEF5C" : "#FFFFFF"} fillOpacity={goal === "photo" ? 0.12 + i * 0.08 : 0.14 + i * 0.07}>
                    <path d={FOOT.sole} />
                    {FOOT.toes.map(([cx, cy, r], k) => <circle key={k} cx={cx} cy={cy} r={r} />)}
                </g>
            ))}
        </svg>
    );
}
