
import React, { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import {
    Radar,
    RadarChart,
    PolarGrid,
    PolarAngleAxis,
    PolarRadiusAxis,
    ResponsiveContainer,
} from "recharts";
import { Loader2, Lock, Trophy, Brain, Zap } from "lucide-react";

// Types
interface BrainStats {
    level: number;
    iq: number;
    ratings: {
        logic: number;
        math: number;
        verbal: number;
        economy: number;
        trivia: number;
    };
    report: {
        title: string;
        topPercent: string;
        comment: string;
        icon: string;
    };
    topPercent: number;
}

interface LeaderboardUser {
    id: string;
    nickname: string;
    totalScore: number;
    tier: string;
    rank: number;
}

export default function BrainRanking() {
    const [_, setLocation] = useLocation();

    // Fetch Stats
    const { data: stats, isLoading, isError } = useQuery<BrainStats>({
        queryKey: ["brainStats"],
        queryFn: async () => {
            // [Auth Fix] Get token manually
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;

            const headers: Record<string, string> = {};
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }

            const res = await fetch("/api/user/stats", { headers });
            if (!res.ok) throw new Error("Failed to fetch stats");
            return res.json();
        }
    });

    // Fetch Leaderboard Preview
    const { data: leaderboard } = useQuery<LeaderboardUser[]>({
        queryKey: ["brainLeaderboardPreview"],
        queryFn: async () => {
            const res = await fetch("/api/brain/leaderboard?limit=3");
            if (!res.ok) return [];
            return res.json();
        }
    });

    if (isLoading) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center text-white">
                <Loader2 className="w-10 h-10 animate-spin text-indigo-500" />
            </div>
        );
    }

    // Chart Data Preparation
    const chartData = stats ? [
        { subject: "논리", A: stats.ratings.logic, fullMark: 2000 },
        { subject: "수리", A: stats.ratings.math, fullMark: 2000 },
        { subject: "언어", A: stats.ratings.verbal, fullMark: 2000 },
        { subject: "경제", A: stats.ratings.economy, fullMark: 2000 },
        { subject: "상식", A: stats.ratings.trivia, fullMark: 2000 },
    ] : [];

    // Tier Calculation (Mock logic or use brainLevel)
    const getTierInfo = (level: number) => {
        const tiers = [
            { name: "Bronze", color: "text-amber-600", bg: "bg-amber-900/20" },
            { name: "Silver", color: "text-slate-300", bg: "bg-slate-800/20" },
            { name: "Gold", color: "text-yellow-400", bg: "bg-yellow-900/20" },
            { name: "Platinum", color: "text-cyan-400", bg: "bg-cyan-900/20" },
            { name: "Diamond", color: "text-purple-400", bg: "bg-purple-900/20" },
        ];
        return tiers[level - 1] || tiers[0];
    };

    const tier = stats ? getTierInfo(stats.level) : getTierInfo(1);

    return (
        <div className="min-h-screen bg-black text-white pb-20 relative overflow-hidden font-sans">
            {/* Background Effects */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#1a1a2e] via-black to-black pointer-events-none"></div>

            {/* Header */}
            <header className="relative z-10 p-6 flex items-center justify-between border-b border-white/5 bg-black/50 backdrop-blur-md sticky top-0">
                <div className="flex items-center gap-3">
                    <div onClick={() => setLocation('/home')} className="cursor-pointer">
                        <i className="fas fa-arrow-left text-white/50 hover:text-white transition-colors"></i>
                    </div>
                    <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-400">
                        Brain Rank
                    </h1>
                </div>
                <div className="flex items-center gap-2">
                    <div className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs font-medium text-white/70">
                        Season 1
                    </div>
                </div>
            </header>

            <div className="relative z-10 p-6 space-y-6 max-w-md mx-auto">

                {/* Tier Card */}
                <div className="relative p-6 rounded-3xl bg-gradient-to-br from-white/5 to-transparent border border-white/10 overflow-hidden">
                    <div className={`absolute top-0 right-0 p-20 ${tier.bg} blur-3xl rounded-full -translate-y-1/2 translate-x-1/2`}></div>

                    <div className="relative z-10 flex flex-col items-center text-center">
                        <span className={`text-sm font-bold tracking-wider uppercase mb-2 ${tier.color}`}>
                            Current Tier
                        </span>
                        <h2 className={`text-4xl font-black italic tracking-tighter mb-1 text-white drop-shadow-lg`}>
                            {tier.name} <span className="text-2xl not-italic ml-1">IV</span>
                        </h2>
                        <p className="text-xs text-white/40 mb-6 font-medium">
                            상위 {stats?.report?.topPercent || "0%"} • 다음 티어까지 145점
                        </p>

                        {/* Stats Summary Grid */}
                        <div className="grid grid-cols-2 gap-3 w-full mb-2 px-2">
                            <div className="bg-black/30 rounded-2xl p-4 border border-white/5 flex flex-col items-center justify-center backdrop-blur-sm">
                                <div className="text-[10px] text-white/40 mb-1 tracking-widest font-bold">BRAIN IQ</div>
                                <div className="text-3xl font-black text-white tracking-tighter drop-shadow-md">
                                    {stats?.iq || 0}
                                </div>
                            </div>
                            <div className="bg-black/30 rounded-2xl p-4 border border-white/5 flex flex-col items-center justify-center backdrop-blur-sm">
                                <div className="text-[10px] text-white/40 mb-1 tracking-widest font-bold">TITLE</div>
                                <div className="text-sm font-bold text-indigo-300 leading-tight text-center break-keep">
                                    {stats?.report?.title || "분석중..."}
                                </div>
                            </div>
                        </div>

                        {/* Radar Chart */}
                        <div className="w-full h-48 sm:h-56 relative -my-4">
                            <ResponsiveContainer width="100%" height="100%">
                                <RadarChart cx="50%" cy="50%" outerRadius="70%" data={chartData}>
                                    <PolarGrid stroke="rgba(255,255,255,0.1)" />
                                    <PolarAngleAxis dataKey="subject" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 10 }} />
                                    <PolarRadiusAxis angle={30} domain={[0, 2000]} tick={false} axisLine={false} />
                                    <Radar
                                        name="My Stats"
                                        dataKey="A"
                                        stroke="#818cf8"
                                        strokeWidth={2}
                                        fill="#818cf8"
                                        fillOpacity={0.3}
                                    />
                                </RadarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>

                {/* Action: Daily Quiz */}
                <div className="relative group">
                    <div className="absolute inset-0 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl blur opacity-40 group-hover:opacity-60 transition-opacity"></div>
                    <Link href="/brain-quiz">
                        <button className="relative w-full p-5 rounded-2xl bg-[#0f1016] border border-white/10 flex items-center justify-between group-hover:border-indigo-500/50 transition-all cursor-pointer">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-xl bg-indigo-500/20 flex items-center justify-center text-indigo-400">
                                    <Brain className="w-6 h-6" />
                                </div>
                                <div className="text-left">
                                    <h3 className="text-lg font-bold text-white group-hover:text-indigo-300 transition-colors">
                                        오늘의 퀴즈 도전
                                    </h3>
                                    <p className="text-xs text-white/50">
                                        매일 20문제 • 랭킹 포인트 획득
                                    </p>
                                </div>
                            </div>
                            <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-indigo-500 group-hover:text-white transition-all">
                                <i className="fas fa-chevron-right text-xs"></i>
                            </div>
                        </button>
                    </Link>
                </div>

                {/* Leaderboard Preview */}
                <div className="pt-4">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-bold text-white">실시간 랭킹</h3>
                        <Link href="/brain-leaderboard" className="text-xs text-indigo-400 hover:text-indigo-300">
                            전체보기
                        </Link>
                    </div>

                    <div className="space-y-3">
                        {leaderboard && leaderboard.length > 0 ? (
                            leaderboard.slice(0, 3).map((user, idx) => (
                                <div key={user.id || idx} className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-6 h-6 flex items-center justify-center text-sm font-bold ${idx === 0 ? 'text-yellow-400' : idx === 1 ? 'text-gray-300' : idx === 2 ? 'text-amber-600' : 'text-white/50'}`}>
                                            {idx + 1}
                                        </div>
                                        <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center text-xs font-bold text-indigo-300">
                                            {user.nickname ? user.nickname.substring(0, 1) : "?"}
                                        </div>
                                        <div className="text-sm font-medium text-white">
                                            {user.nickname || "Unknown"}
                                        </div>
                                    </div>
                                    <div className="text-sm font-bold text-white/60">
                                        {user.totalScore.toLocaleString()}
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="text-center text-white/20 text-xs py-4">
                                랭킹 데이터가 없습니다.
                            </div>
                        )}
                    </div>
                </div>

            </div>

            {/* Developer Tools (Hidden for Prod maybe) */}
            <div className="pt-8 pb-4 text-center">
                <Button
                    variant="ghost"
                    size="sm"
                    className="text-[10px] text-white/20 hover:text-white/50"
                    onClick={async () => {
                        const categories = ['LOGIC', 'MATH', 'VERBAL', 'ECONOMY', 'TRIVIA'];
                        // Generate 5 questions for each category at Level 2 (Silver)
                        for (const cat of categories) {
                            try {
                                await fetch('/api/admin/generate-questions', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ category: cat, level: 2, count: 5 })
                                });
                            } catch (e) { console.error(e); }
                        }
                        alert("Mock Questions Generated!");
                    }}
                >
                    <Lock className="w-3 h-3 mr-1" /> Dev: Generate Questions
                </Button>
            </div>

        </div>
    );
}
