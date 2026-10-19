/**
 * 오늘의 물높이(2026-10-14) — 종이 위의 조석 곡선. 만조 · 간조의 시각을 꼭대기와 바닥에 적고, 지금을 세로줄로, 해가 없는 시간을 옅은 먹으로 칠한다.
 * 바다 지도(SeaChart)와 같은 손(종이색 · 먹 선 · 옅은 물감). 글자는 실제 너비를 재서 **화면에서 12px 아래로 내려가지 않게** 키운다.
 * 자료는 예측 조위(국립해양조사원) — 꼭대기 · 바닥은 shared/fishingPort 가 찾는다. ⚠️ 리터럴 색만.
 */
import { useLayoutEffect, useRef, useState } from "react";
import { hhmm, type TidePoint, type TideTurn } from "@shared/fishingPort";

const W = 640, H = 372, PAD_X = 26, TOP = 84, BOTTOM = 112;

export function TideCurve({ points, turns, nowMin, sun }: {
    points: readonly TidePoint[]; turns: readonly TideTurn[]; /** 오늘이면 지금(분) */ nowMin?: number | null; /** 해 뜨는 · 지는 분 */ sun?: { rise: number; set: number } | null;
}) {
    const ref = useRef<SVGSVGElement>(null);
    const [u, setU] = useState(W / 320);
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        const measure = () => { const w = el.getBoundingClientRect().width; if (w > 0) setU(W / w); };
        measure();
        const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
        ro?.observe(el);
        return () => ro?.disconnect();
    }, []);
    if (points.length < 12) return null;
    const fs = 12.2 * u;
    const lo = Math.min(...points.map((p) => p.cm)), hi = Math.max(...points.map((p) => p.cm));
    const span = Math.max(1, hi - lo);
    const x = (min: number) => PAD_X + (Math.max(0, Math.min(1440, min)) / 1440) * (W - PAD_X * 2);
    const y = (cm: number) => TOP + ((hi - cm) / span) * (H - TOP - BOTTOM);
    const base = H - BOTTOM + 14;
    const line = points.map((p, i) => `${i ? "L" : "M"}${x(p.min).toFixed(1)} ${y(p.cm).toFixed(1)}`).join(" ");
    const area = `${line} L${x(points[points.length - 1].min).toFixed(1)} ${base} L${x(points[0].min).toFixed(1)} ${base} Z`;
    const at = (min: number) => { let best = points[0]; for (const p of points) if (Math.abs(p.min - min) < Math.abs(best.min - min)) best = p; return best; };
    const now = nowMin != null && nowMin >= 0 && nowMin <= 1440 ? at(nowMin) : null;
    // 글자가 가장자리 밖으로 나가지 않게 — 글자 너비(대략)를 재서 안쪽으로 민다
    const clampX = (cx: number, chars: number) => { const half = (chars * fs * 0.58) / 2; return Math.max(PAD_X + half - 14, Math.min(W - PAD_X - half + 14, cx)); };
    // '지금' 글자 자리 — 위 가운데가 만조 글자와 겹치면(2026-10-19 인천 22:23 만조 · 21시 지금) 그 글자 왼쪽(모자라면 오른쪽)으로 비킨다
    const nowSpot = (() => {
        if (!now) return null;
        const nx = x(now.min), w2 = fs * 1.25, top = 8 - fs * 0.2, bot = 8 + fs * 1.05;
        const boxes = turns.filter((t) => t.kind === "high").map((t) => {
            const label = `만조 ${hhmm(t.min)}`, lx = clampX(x(t.min), label.length), half = (label.length * fs * 0.58) / 2, cy = y(t.cm);
            return { l: lx - half, r: lx + half, t: cy - fs * 2.7, b: cy - fs * 0.4 };
        });
        const hit = (cx: number) => boxes.find((b) => cx + w2 > b.l && cx - w2 < b.r && bot > b.t && top < b.b);
        const c = clampX(nx, 2);
        const b = hit(c);
        if (!b) return { x: c, anchor: "middle" as const };
        if (b.l - 4 - w2 * 2 > PAD_X - 10) return { x: b.l - 4, anchor: "end" as const };
        return { x: Math.min(W - PAD_X + 10, b.r + 4), anchor: "start" as const };
    })();
    return (
        <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label={`오늘의 물높이 — ${turns.map((t) => `${t.kind === "high" ? "만조" : "간조"} ${hhmm(t.min)}`).join(", ")}`} data-testid="fishing-tide-curve">
            <rect width={W} height={H} fill="#F3ECDD" />
            {/* 해가 없는 시간 */}
            {sun && sun.rise > 0 && <rect x={x(0)} y={0} width={x(sun.rise) - x(0)} height={H} fill="#0F283814" />}
            {sun && sun.set < 1440 && <rect x={x(sun.set)} y={0} width={x(1440) - x(sun.set)} height={H} fill="#0F283814" />}
            {/* 세 시간마다 눈금 */}
            {[0, 3, 6, 9, 12, 15, 18, 21, 24].map((h) => (
                <g key={h}>
                    <path d={`M${x(h * 60)} ${TOP - 30} V${base}`} stroke="#0F283814" strokeWidth={0.8 * u} strokeDasharray={`${2 * u} ${3 * u}`} />
                    {h % 6 === 0 && <text x={clampX(x(h * 60), String(h).length + 1)} y={H - 13} textAnchor="middle" fontSize={fs} fill="#0F283880">{h}시</text>}
                </g>
            ))}
            <path d={area} fill="#1F5A7824" />
            <path d={line} fill="none" stroke="#1F5A78" strokeWidth={2 * u} strokeLinejoin="round" strokeLinecap="round" />
            {/* 만조 · 간조 */}
            {turns.map((t) => {
                const cx = x(t.min), cy = y(t.cm), high = t.kind === "high";
                const label = `${high ? "만조" : "간조"} ${hhmm(t.min)}`;
                // 두 줄(이름 · 높이)을 같은 자리에 맞춘다 — 가장자리에서는 같이 안쪽으로 밀린다
                const lx = clampX(cx, label.length);
                return (
                    <g key={`${t.kind}${t.min}`} data-testid="fishing-tide-turn">
                        <circle cx={cx} cy={cy} r={3.4 * u} fill={high ? "#C8372D" : "#F3ECDD"} stroke={high ? "#C8372D" : "#1F5A78"} strokeWidth={1.4 * u} />
                        <text x={lx} y={high ? cy - fs * 1.78 : cy + fs * 1.5} textAnchor="middle" fontSize={fs} fontWeight="600" fill="#0F2838" stroke="#F3ECDD" strokeWidth={fs * 0.2} paintOrder="stroke">{label}</text>
                        <text x={lx} y={high ? cy - fs * 0.66 : cy + fs * 2.62} textAnchor="middle" fontSize={fs} fill="#0F2838B3" stroke="#F3ECDD" strokeWidth={fs * 0.2} paintOrder="stroke">{t.cm}cm</text>
                    </g>
                );
            })}
            {/* 지금 */}
            {now && (
                <g data-testid="fishing-tide-nowline">
                    <path d={`M${x(now.min)} ${14 + fs} V${base}`} stroke="#EE7B5B" strokeWidth={1.3 * u} />
                    <circle cx={x(now.min)} cy={y(now.cm)} r={4 * u} fill="#EE7B5B" stroke="#F3ECDD" strokeWidth={1.4 * u} />
                    {nowSpot && <text x={nowSpot.x} y={8 + fs * 0.8} textAnchor={nowSpot.anchor} fontSize={fs} fontWeight="600" fill="#B7462A" stroke="#F3ECDD" strokeWidth={fs * 0.2} paintOrder="stroke">지금</text>}
                </g>
            )}
        </svg>
    );
}
