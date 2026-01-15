import React, { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Loader2, Trophy, Crown, Medal, Flame, ChevronUp, ChevronDown, Minus, Activity, Calculator, BookOpen, Coins, Globe, ChevronLeft, ChevronRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from 'recharts';
import { motion } from "framer-motion";

interface LeaderboardUser {
    id: string;
    username: string;
    avatarUrl: string | null;
    brainLevel: number;
    totalScore: number;
    brainRatingLogic: number;
    brainRatingMath: number;
    brainRatingVerbal: number;
    brainRatingEconomy: number;
    brainRatingTrivia: number;
    brainCurrentStreak?: number;
    brainLastRank?: number;
}

const CATEGORIES = [
    { id: 'TOTAL', label: '종합' },
    { id: 'LOGIC', label: '논리', icon: Activity },
    { id: 'MATH', label: '수리', icon: Calculator },
    { id: 'VERBAL', label: '언어', icon: BookOpen },
    { id: 'ECONOMY', label: '경제', icon: Coins },
    { id: 'TRIVIA', label: '상식', icon: Globe },
];

export default function BrainLeaderboard() {
    const [_, setLocation] = useLocation();
    const { user } = useAuth();
    const [activeCategory, setActiveCategory] = useState('TOTAL');
    const [selectedUser, setSelectedUser] = useState<LeaderboardUser | null>(null);

    const { data: leaderboard = [], isLoading, isError } = useQuery<LeaderboardUser[]>({
        queryKey: ["brainLeaderboard", activeCategory],
        queryFn: async () => {
            const res = await fetch(`/api/brain/leaderboard?category=${activeCategory}`);
            if (!res.ok) throw new Error("Failed to fetch leaderboard");
            return res.json();
        }
    });

    const getRankChange = (u: LeaderboardUser, currentRank: number) => {
        if (!u.brainLastRank) return <Minus className="w-3 h-3 text-white/20 ml-1" />;
        const diff = u.brainLastRank - currentRank;
        if (diff > 0) return <span className="text-[10px] text-red-500 font-bold ml-1">↑{diff}</span>;
        if (diff < 0) return <span className="text-[10px] text-blue-500 font-bold ml-1">↓{Math.abs(diff)}</span>;
        return <Minus className="w-3 h-3 text-white/20 ml-1" />;
    };

    // Chart Data Helper
    const getChartData = (u: LeaderboardUser) => [
        { subject: '논리', A: u.brainRatingLogic, fullMark: 2000 },
        { subject: '수리', A: u.brainRatingMath, fullMark: 2000 },
        { subject: '언어', A: u.brainRatingVerbal, fullMark: 2000 },
        { subject: '경제', A: u.brainRatingEconomy, fullMark: 2000 },
        { subject: '상식', A: u.brainRatingTrivia, fullMark: 2000 },
    ];

    const getLevelTitle = (level: number) => {
        const tiers = ["Bronze", "Silver", "Gold", "Platinum", "Diamond"];
        return tiers[Math.max(0, Math.min(4, level - 1))] || "Bronze";
    };

    return (
        <div className="min-h-screen bg-black text-white font-sans pb-24">
            {/* Header */}
            <header className="sticky top-0 z-20 bg-black/95 backdrop-blur-md">
                <div className="flex items-center justify-between p-4">
                    <div onClick={() => setLocation('/brain-ranking')} className="cursor-pointer p-2 -ml-2">
                        <ChevronLeft className="w-6 h-6 text-white" />
                    </div>
                    <h1 className="text-lg font-bold">브레인 랭킹</h1>
                    <div className="w-8"></div>
                </div>

                {/* Categories */}
                <div className="flex overflow-x-auto hide-scrollbar px-4 border-b border-white/5 bg-black/50 backdrop-blur-sm">
                    {CATEGORIES.map(cat => {
                        const isActive = activeCategory === cat.id;
                        return (
                            <button
                                key={cat.id}
                                onClick={() => setActiveCategory(cat.id)}
                                className={`
                                    relative py-4 px-4 text-sm font-bold whitespace-nowrap transition-colors outline-none
                                    ${isActive ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'}
                                `}
                            >
                                {cat.label}
                                {isActive && (
                                    <motion.div
                                        layoutId="activeTab"
                                        className="absolute bottom-0 left-0 right-0 h-[2px] bg-orange-500 shadow-[0_-2px_8px_rgba(249,115,22,0.5)]"
                                        transition={{ type: "spring", stiffness: 500, damping: 30 }}
                                    />
                                )}
                            </button>
                        );
                    })}
                </div>
            </header>

            {isError ? (
                <div className="flex flex-col items-center justify-center py-20 text-white/50 space-y-4">
                    <Crown className="w-12 h-12 opacity-20" />
                    <p>랭킹을 불러올 수 없습니다.</p>
                    <Button onClick={() => window.location.reload()} variant="outline" className="text-white border-white/20">새로고침</Button>
                </div>
            ) : isLoading ? (
                <div className="flex justify-center py-20">
                    <Loader2 className="w-8 h-8 animate-spin text-white/40" />
                </div>
            ) : (
                <main className="p-4 space-y-4 max-w-md mx-auto relative z-10">
                    {/* Background Effect */}
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-96 bg-indigo-900/20 blur-[100px] pointer-events-none -z-10"></div>

                    {/* 1st Place Card - Premium Gold Style */}
                    {leaderboard[0] && (
                        <motion.div
                            initial={{ y: 20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            className="relative w-full aspect-[4/5] max-h-[420px] bg-gradient-to-b from-yellow-900/20 to-black rounded-[32px] border border-yellow-500/20 flex flex-col items-center justify-center p-6 mb-8 overflow-hidden"
                            onClick={() => setSelectedUser(leaderboard[0])}
                        >
                            {/* Ambient Glow */}
                            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-32 bg-yellow-500/30 blur-[60px] rounded-full pointer-events-none"></div>

                            {/* Crown & Avatar */}
                            <div className="relative mb-6">
                                <div className="absolute -top-10 left-1/2 -translate-x-1/2 flex flex-col items-center">
                                    <Crown className="w-10 h-10 text-yellow-400 fill-yellow-400 drop-shadow-[0_0_15px_rgba(250,204,21,0.5)] animate-bounce" />
                                </div>
                                <div className="w-28 h-28 rounded-full p-[2px] bg-gradient-to-b from-yellow-300 via-yellow-500 to-yellow-900 shadow-2xl relative z-10">
                                    <Avatar className="w-full h-full border-4 border-black">
                                        <AvatarImage src={leaderboard[0].avatarUrl || undefined} className="object-cover" />
                                        <AvatarFallback className="bg-zinc-900 text-2xl font-bold text-yellow-500">{leaderboard[0].username?.[0] || '?'}</AvatarFallback>
                                    </Avatar>
                                </div>
                                {/* Rank Batch */}
                                <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-yellow-600 to-yellow-800 text-white font-black text-xs px-3 py-1 rounded-full shadow-lg border border-yellow-400/50 whitespace-nowrap z-20">
                                    1ST WINNER
                                </div>
                            </div>

                            {/* User Info */}
                            <h2 className="text-2xl font-black text-white mb-1 tracking-tight drop-shadow-md">{leaderboard[0].username}</h2>
                            <p className="text-white/40 font-medium text-sm mb-6 flex items-center gap-1">
                                <Medal className="w-3 h-3 text-yellow-600" />
                                Lv.{leaderboard[0].brainLevel} {getLevelTitle(leaderboard[0].brainLevel)}
                            </p>

                            {/* Score Display */}
                            <div className="flex flex-col items-center">
                                <div className="text-[10px] text-yellow-500/50 tracking-widest font-bold mb-1">TOTAL SCORE</div>
                                <div className="text-4xl font-black text-white tracking-tighter drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]">
                                    {leaderboard[0].totalScore.toLocaleString()}
                                </div>
                            </div>

                            {/* Shine Effect Overlay */}
                            <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/5 to-white/0 opacity-0 hover:opacity-100 transition-opacity pointer-events-none" />
                        </motion.div>
                    )}

                    {/* Ranking List (2nd ~) */}
                    <div className="space-y-3">
                        {leaderboard.slice(1).map((user, idx) => {
                            const rank = idx + 2;
                            const isTop3 = rank <= 3;

                            return (
                                <motion.div
                                    key={user.id}
                                    initial={{ y: 10, opacity: 0 }}
                                    animate={{ y: 0, opacity: 1 }}
                                    transition={{ delay: idx * 0.05 }}
                                    onClick={() => setSelectedUser(user)}
                                    className={`relative flex items-center justify-between p-4 rounded-2xl border transition-all cursor-pointer group overflow-hidden
                                        ${isTop3 ? 'bg-white/5 border-white/10' : 'bg-transparent border-transparent hover:bg-white/5'}
                                    `}
                                >
                                    {/* Decoration for Top 3 */}
                                    {rank === 2 && <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-gray-300 to-gray-500 opacity-50"></div>}
                                    {rank === 3 && <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-amber-600 to-amber-800 opacity-50"></div>}

                                    <div className="flex items-center gap-4">
                                        <div className={`w-8 text-center font-black italic text-lg ${rank === 2 ? 'text-gray-300 drop-shadow' :
                                            rank === 3 ? 'text-amber-600 drop-shadow' : 'text-white/20'
                                            }`}>
                                            {rank}
                                        </div>

                                        <div className="relative">
                                            <Avatar className={`w-10 h-10 border ${isTop3 ? 'border-white/20' : 'border-white/5'}`}>
                                                <AvatarImage src={user.avatarUrl || undefined} />
                                                <AvatarFallback className="bg-zinc-800 text-xs text-white/50">{user.username?.[0]}</AvatarFallback>
                                            </Avatar>
                                            {isTop3 && <div className="absolute -top-1 -right-1 text-[8px]">
                                                {rank === 2 ? '🥈' : '🥉'}
                                            </div>}
                                        </div>

                                        <div className="flex flex-col">
                                            <div className="flex items-center gap-2">
                                                <span className={`font-bold text-sm ${isTop3 ? 'text-white' : 'text-white/80'}`}>{user.username}</span>
                                                {getRankChange(user, rank)}
                                            </div>
                                            <span className="text-[10px] text-white/30">
                                                Lv.{user.brainLevel} {getLevelTitle(user.brainLevel)}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="text-right">
                                        <div className="text-sm font-bold text-indigo-100 tracking-tight">
                                            {user.totalScore.toLocaleString()}
                                        </div>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>
                </main>
            )}

            {/* Popup */}
            <Dialog open={!!selectedUser} onOpenChange={(open) => !open && setSelectedUser(null)}>
                <DialogContent className="bg-zinc-950 border-zinc-800 text-white w-[90%] rounded-3xl p-6">
                    <DialogHeader className="mb-4">
                        <div className="flex items-center gap-4">
                            <Avatar className="w-14 h-14 border border-white/10">
                                <AvatarImage src={selectedUser?.avatarUrl || undefined} />
                                <AvatarFallback>{selectedUser?.username?.[0]}</AvatarFallback>
                            </Avatar>
                            <div>
                                <DialogTitle className="text-xl font-bold">{selectedUser?.username}</DialogTitle>
                                <DialogDescription className="text-zinc-400 text-xs">
                                    Lv.{selectedUser?.brainLevel} • {selectedUser?.totalScore.toLocaleString()} pts
                                </DialogDescription>
                            </div>
                        </div>
                    </DialogHeader>

                    <div className="h-[250px] w-full relative">
                        {selectedUser && (
                            <ResponsiveContainer width="100%" height="100%">
                                <RadarChart cx="50%" cy="50%" outerRadius="70%" data={getChartData(selectedUser)}>
                                    <PolarGrid stroke="#3f3f46" strokeDasharray="3 3" />
                                    <PolarAngleAxis dataKey="subject" tick={{ fill: '#a1a1aa', fontSize: 11 }} />
                                    <PolarRadiusAxis angle={30} domain={[0, 2000]} tick={false} axisLine={false} />
                                    <Radar
                                        name="Stats"
                                        dataKey="A"
                                        stroke="#fbbf24"
                                        fill="#fbbf24"
                                        fillOpacity={0.3}
                                    />
                                </RadarChart>
                            </ResponsiveContainer>
                        )}
                        <div className="absolute top-0 right-0 p-2 bg-white/5 rounded-lg border border-white/5">
                            <div className="text-[10px] text-white/40 uppercase font-bold text-center">Main Stat</div>
                            <div className="text-center font-bold text-yellow-400 text-lg">
                                {selectedUser && CATEGORIES.find(c => c.id !== 'TOTAL' &&
                                    Math.max(selectedUser.brainRatingLogic, selectedUser.brainRatingMath, selectedUser.brainRatingVerbal, selectedUser.brainRatingEconomy, selectedUser.brainRatingTrivia) ===
                                    (c.id === 'LOGIC' ? selectedUser.brainRatingLogic :
                                        c.id === 'MATH' ? selectedUser.brainRatingMath :
                                            c.id === 'VERBAL' ? selectedUser.brainRatingVerbal :
                                                c.id === 'ECONOMY' ? selectedUser.brainRatingEconomy : selectedUser.brainRatingTrivia)
                                )?.label || "Balanced"}
                            </div>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
