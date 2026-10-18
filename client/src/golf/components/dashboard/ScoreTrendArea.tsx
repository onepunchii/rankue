/**
 * 골프 홈 '스코어 트렌드'의 그래프만(2026-10-18) — recharts 를 이 파일에서만 불러 StatsChart 가 lazy 로 받는다(첫 화면 묶음에서 그래프 라이브러리를 뺀다).
 */
import { Area, AreaChart, ResponsiveContainer, YAxis } from "recharts";

export default function ScoreTrendArea({ data }: { data: readonly { score: number }[] }) {
    return (
        <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data as { score: number }[]}>
                <defs>
                    <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#64DD17" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#64DD17" stopOpacity={0} />
                    </linearGradient>
                </defs>
                <YAxis hide domain={["dataMin - 5", "dataMax + 5"]} />
                <Area type="monotone" dataKey="score" stroke="#64DD17" strokeWidth={3} fillOpacity={1} fill="url(#colorScore)" />
            </AreaChart>
        </ResponsiveContainer>
    );
}
