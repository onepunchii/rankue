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
        <div className="space-y-4 mb-10 px-2 sm:px-0">
            <header className="mb-2 px-2">
                <h1 className="text-xl font-black italic tracking-tighter text-white">AVG TREND</h1>
                <p className="text-white/50 text-xs mt-1 flex items-center gap-1 font-bold">
                    <LucideInfo className="w-3 h-3" /> 최근 10경기 에버리지 변화 추이
                </p>
            </header>

            {/* Sliding Toggle Switch */}
            <div className="bg-[#18181b] p-1 rounded-2xl flex mb-6 border border-white/10 relative h-12">
                <div className={cn(
                    "absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-xl transition-all duration-300 ease-out z-0 filter drop-shadow-md",
                    activeTrendTab === '3C' ? "left-1 bg-[#64DD17]/20 border border-[#64DD17]/30" : "left-[calc(50%+2px)] bg-blue-500/20 border border-blue-500/30"
                )} />
                <button onClick={() => setActiveTrendTab('3C')} className={cn("flex-1 rounded-xl text-sm font-bold relative z-10 transition-colors bg-transparent border-none outline-none", activeTrendTab === '3C' ? "text-[#64DD17]" : "text-white/40")}>3-Cushion</button>
                <button onClick={() => setActiveTrendTab('4B')} className={cn("flex-1 rounded-xl text-sm font-bold relative z-10 transition-colors bg-transparent border-none outline-none", activeTrendTab === '4B' ? "text-blue-500" : "text-white/40")}>4-Ball</button>
            </div>

            {activeTrendTab === '3C' ? (
                <SmoothTrendChart
                    key="3c-chart"
                    title="3-Cushion AVG"
                    subTitle="대대 3쿠션"
                    data={trend3c as ChartDataPoint[]}
                    color="green"
                />
            ) : (
                <SmoothTrendChart
                    key="4c-chart"
                    title="4-Ball AVG"
                    subTitle="중대 4구"
                    data={trend4c as ChartDataPoint[]}
                    color="blue"
                />
            )}
        </div>
    );
};
