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

/**
 * 세로 범위 — 본인 범위로 잡되(1000위권 선수의 등락이 평평해지지 않게) 너무 좁히지 않는다(2026-10-18).
 * 1위 ↔ 2위만 오간 선수가 판의 꼭대기와 바닥을 오가는 벽처럼 그려졌다 — 순위는 적어도 10칸, 포인트는 값의 10% 폭을 둔다.
 */
export function trendDomain(values: readonly number[], rank: boolean): [number, number] | ["dataMin", "dataMax"] {
    const v = values.filter((x) => Number.isFinite(x));
    if (!v.length) return ["dataMin", "dataMax"];
    let lo = Math.min(...v), hi = Math.max(...v);
    const minSpan = rank ? 9 : Math.max(1, Math.abs(hi) * 0.1);
    if (hi - lo < minSpan) { const extra = minSpan - (hi - lo); lo -= extra / 2; hi += extra / 2; }
    else { const pad = (hi - lo) * 0.06; lo -= pad; hi += pad; }
    if (rank) {
        // 1위 위로는 없다 — 넘친 만큼 아래로
        if (lo < 1) { hi += 1 - lo; lo = 1; }
        return [Math.floor(lo), Math.ceil(hi)];
    }
    return [Math.floor(lo), Math.ceil(hi)];
}

export default function RankTrendChart({ data, metric, reversed, allowDecimals, top10, top10Opacity, colors, formatValue, formatLabel, tooltipStyle }: RankTrendChartProps) {
    const domain = trendDomain(data.map((d) => Number(d[metric])), reversed);
    // 순위 눈금 — 맨 위(가장 좋은 쪽)를 꼭 적는다(자동 눈금은 1위를 빼먹었다)
    const ticks = reversed && typeof domain[0] === "number" && typeof domain[1] === "number"
        ? [...new Set([domain[0], Math.round((domain[0] + domain[1]) / 2), domain[1]])]
        : undefined;
    return (
        <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data as any[]} margin={{ top: 8, right: 12, bottom: 0, left: -14 }}>
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: colors.axis }} tickLine={false} axisLine={{ stroke: colors.grid }} interval="preserveStartEnd" minTickGap={40} />
                {/* domain을 [1, max]로 고정하면 1000위권 선수의 등락이 바닥 평평한 선이 된다 — 본인 범위로, 다만 너무 좁히지 않는다(trendDomain) */}
                <YAxis reversed={reversed} domain={domain} ticks={ticks} tick={{ fontSize: 12, fill: colors.axis }} tickLine={false} axisLine={false} width={40} allowDecimals={allowDecimals} />
                {top10 && <ReferenceArea y1={1} y2={10} fill={colors.brand} fillOpacity={top10Opacity} />}
                <Tooltip formatter={(v: any) => [formatValue(v), ""]} labelFormatter={formatLabel} contentStyle={tooltipStyle} />
                <Line type="linear" dataKey={metric} stroke={colors.brand} strokeWidth={2} dot={false} activeDot={{ r: 4, fill: colors.brand }} />
            </LineChart>
        </ResponsiveContainer>
    );
}
