import { Area, AreaChart, ResponsiveContainer, YAxis } from "recharts";
import { LucideChevronRight } from "lucide-react";

interface StatsChartProps {
    recentScores: { id: number; score: number }[];
    stats: {
        bestScore: number;
        totalRounds: number;
        avgScore: number;
    };
}

export function StatsChart({ recentScores, stats }: StatsChartProps) {
    return (
        <div className="mb-4 relative z-10">
            {/* Header */}
            <div className="flex items-center justify-between mb-4 px-2">
                <h2 className="text-lg font-semibold text-white">Score Trend</h2>
                <LucideChevronRight className="w-5 h-5 text-white/20" />
            </div>

            <div className="bg-white/[0.03] border border-white/5 rounded-[2rem] p-6 backdrop-blur-sm">
                {/* Graph */}
                <div className="h-32 w-full mb-6">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={recentScores}>
                            <defs>
                                <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#64DD17" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#64DD17" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <YAxis hide domain={['dataMin - 5', 'dataMax + 5']} />
                            <Area
                                type="monotone"
                                dataKey="score"
                                stroke="#64DD17"
                                strokeWidth={3}
                                fillOpacity={1}
                                fill="url(#colorScore)"
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>

                {/* Key Stats Grid */}
                <div className="grid grid-cols-3 gap-4 border-t border-white/5 pt-4">
                    {/* 1. Best Score */}
                    <div className="flex flex-col items-center">
                        <span className="text-[9px] font-bold text-white/40 uppercase mb-1 tracking-wider">Best Score</span>
                        <span className="text-xl font-black text-white">
                            {stats.bestScore} <span className="text-xs text-[#64DD17] font-bold">타</span>
                        </span>
                    </div>

                    {/* 2. Avg Score (Most Important) */}
                    <div className="flex flex-col items-center relative">
                        {/* Dividers */}
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-px h-8 bg-white/10" />
                        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-px h-8 bg-white/10" />

                        <span className="text-[9px] font-bold text-white/40 uppercase mb-1 tracking-wider">Avg Score</span>
                        <span className="text-xl font-black text-[#64DD17]">
                            {stats.avgScore}
                        </span>
                    </div>

                    {/* 3. Total Rounds (Activity) */}
                    <div className="flex flex-col items-center">
                        <span className="text-[9px] font-bold text-white/40 uppercase mb-1 tracking-wider">Rounds</span>
                        <span className="text-xl font-black text-white">
                            {stats.totalRounds} <span className="text-xs text-white/40 font-bold">회</span>
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}
