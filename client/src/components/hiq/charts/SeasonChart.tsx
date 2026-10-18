/**
 * PBA 선수 '시즌별 기록' 그래프(2026-10-18 — pba-player.tsx 에서 떼어 냈다). recharts 를 이 파일에서만 불러 선수 페이지가 lazy 로 받는다
 * (첫 화면 묶음에서 그래프 라이브러리를 뺀다 — shared/bundleSplit.test).
 * 상금 순위 · 포인트 순위는 선(위가 1위), 상금은 막대.
 */
import { Bar, CartesianGrid, ComposedChart, LabelList, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface SeasonChartProps {
    data: readonly Record<string, unknown>[];
    metric: "prizeRank" | "pointRank" | "prize";
    colors: { brand: string; axis: string; grid: string };
    /** 툴팁 한 줄 — [값, 이름] */
    tooltip: (v: unknown) => [string, string];
    rankLabel: (v: number) => string;
}

export default function SeasonChart({ data, metric, colors, tooltip, rankLabel }: SeasonChartProps) {
    return (
        <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data as any[]} margin={{ top: 18, right: 12, bottom: 0, left: -18 }}>
                <CartesianGrid vertical={false} stroke={colors.grid} />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: colors.axis }} axisLine={false} tickLine={false} />
                {metric === "prize" ? (
                    <YAxis tick={{ fontSize: 12, fill: colors.axis }} axisLine={false} tickLine={false} />
                ) : (
                    <YAxis reversed allowDecimals={false} domain={[1, "dataMax"]} tick={{ fontSize: 12, fill: colors.axis }} axisLine={false} tickLine={false} />
                )}
                <Tooltip formatter={(v: any) => tooltip(v)} contentStyle={{ borderRadius: 12, border: "none", boxShadow: "0 4px 14px rgba(0,0,0,0.12)", fontSize: 12 }} />
                {metric === "prize" ? (
                    <Bar dataKey="prize" fill={colors.brand} opacity={0.8} radius={[6, 6, 0, 0]} isAnimationActive={false} />
                ) : (
                    <Line dataKey={metric} stroke={colors.brand} strokeWidth={2.5} dot={{ r: 4, fill: "#fff", stroke: colors.brand, strokeWidth: 2.5 }} connectNulls isAnimationActive={false}>
                        <LabelList dataKey={metric} position="top" formatter={(v: any) => (v == null ? "" : rankLabel(Number(v)))} style={{ fontSize: 12, fontWeight: 700, fill: colors.brand }} />
                    </Line>
                )}
            </ComposedChart>
        </ResponsiveContainer>
    );
}
