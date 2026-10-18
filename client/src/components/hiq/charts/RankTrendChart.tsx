/**
 * 순위 · 포인트 추이 선 그래프(2026-10-18 — UMB 선수 시트 · 골퍼 시트가 같은 꼴을 따로 그리던 것을 한 부품으로).
 * recharts 는 이 파일에서만 부른다 — 시트는 lazy 로 이 파일을 받아 첫 화면 묶음에 그래프 라이브러리(620KB)가 실리지 않게 한다(shared/bundleSplit.test).
 */
import { Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface RankTrendChartProps {
    data: readonly Record<string, unknown>[];
    /** 그릴 칸("rank" · "points") */
    metric: string;
    reversed: boolean;
    allowDecimals: boolean;
    /** 톱10 띠를 깔 것인가(순위일 때만) */
    top10: boolean;
    top10Opacity: number;
    colors: { brand: string; axis: string; grid: string };
    formatValue: (v: unknown) => string;
    formatLabel: (label: any, payload: any) => React.ReactNode;
    tooltipStyle: Record<string, string | number>;
}

export default function RankTrendChart({ data, metric, reversed, allowDecimals, top10, top10Opacity, colors, formatValue, formatLabel, tooltipStyle }: RankTrendChartProps) {
    return (
        <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data as any[]} margin={{ top: 8, right: 12, bottom: 0, left: -14 }}>
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: colors.axis }} tickLine={false} axisLine={{ stroke: colors.grid }} interval="preserveStartEnd" minTickGap={40} />
                {/* domain을 [1, max]로 고정하면 1000위권 선수의 등락이 바닥 평평한 선이 된다 — 본인 범위로 */}
                <YAxis reversed={reversed} domain={["dataMin", "dataMax"]} tick={{ fontSize: 12, fill: colors.axis }} tickLine={false} axisLine={false} width={40} allowDecimals={allowDecimals} />
                {top10 && <ReferenceArea y1={1} y2={10} fill={colors.brand} fillOpacity={top10Opacity} />}
                <Tooltip formatter={(v: any) => [formatValue(v), ""]} labelFormatter={formatLabel} contentStyle={tooltipStyle} />
                <Line type="monotone" dataKey={metric} stroke={colors.brand} strokeWidth={2} dot={false} activeDot={{ r: 4, fill: colors.brand }} />
            </LineChart>
        </ResponsiveContainer>
    );
}
