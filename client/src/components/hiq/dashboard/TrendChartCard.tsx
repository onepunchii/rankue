import { useState, useMemo } from "react";
import { LucideInfo, LucideTrendingUp, LucideTrendingDown } from "lucide-react";
import { ChartDataPoint, SmoothTrendChart } from "./SmoothTrendChart";
import { HiqGameHistory } from "@shared/schema";
import { cn } from "@/lib/utils";

interface TrendChartCardProps {
    history: HiqGameHistory[] | undefined;
}

export const TrendChartCard = ({ history }: TrendChartCardProps) => {
    const [activeTrendTab, setActiveTrendTab] = useState<'3C' | '4B'>('3C');

    // Calculate Trend Data (Last 10 Games)
    // Calculate Trend Data (Last 10 Games) Helper
    const getTrendData = (type: '3c' | '4c') => {
        if (!history) return [];
        const games = history
            .filter(g => g.gameType === type && g.gameMode === "match" && (g as any).isRanked) // 공식 경기 필터링
            .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

        const last10 = games.slice(-10);
        return last10.map(g => ({
            value: parseFloat(g.average || "0"),
            date: new Date(g.createdAt).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' }),
            gameId: g.id
        }));
    };

    const trend3c = useMemo(() => getTrendData('3c'), [history]);
    const trend4c = useMemo(() => getTrendData('4c'), [history]);

    return (
        <div className="space-y-4 mb-10">
            <header className="mb-1">
                <h2 className="text-[19px] font-bold tracking-tight text-ink-1">평균 추이</h2>
                <p className="text-black/55 text-[13px] mt-1 flex items-center gap-1.5 font-medium">
                    <LucideInfo className="w-3.5 h-3.5" /> 최근 10경기 평균 변화
                </p>
            </header>

            {/* Sliding Toggle Switch */}
            <div className="bg-black/[0.04] p-1 rounded-2xl flex mb-6 relative h-11">
                <div className={cn(
                    "absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-xl transition-all duration-300 ease-out z-0 shadow-[0_1px_2px_rgba(0,0,0,0.06)]",
                    activeTrendTab === '3C' ? "left-1 bg-brand/12 border border-brand/25" : "left-[calc(50%+2px)] bg-blue-500/12 border border-brand/25"
                )} />
                <button onClick={() => setActiveTrendTab('3C')} className={cn("flex-1 rounded-xl text-[14px] font-semibold relative z-10 transition-colors bg-transparent border-none outline-none", activeTrendTab === '3C' ? "text-brand" : "text-black/45")}>3쿠션</button>
                <button onClick={() => setActiveTrendTab('4B')} className={cn("flex-1 rounded-xl text-[14px] font-semibold relative z-10 transition-colors bg-transparent border-none outline-none", activeTrendTab === '4B' ? "text-brand" : "text-black/45")}>4구</button>
            </div>

            {activeTrendTab === '3C' ? (
                <SmoothTrendChart
                    key="3c-chart"
                    title="3쿠션 평균"
                    subTitle="대대 3쿠션"
                    data={trend3c as ChartDataPoint[]}
                    color="green"
                />
            ) : (
                <SmoothTrendChart
                    key="4c-chart"
                    title="4구 평균"
                    subTitle="중대 4구"
                    data={trend4c as ChartDataPoint[]}
                    color="blue"
                />
            )}
        </div>
    );
};
