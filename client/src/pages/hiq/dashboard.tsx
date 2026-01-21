import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
    LucideBarChart3,
    LucideSettings,
    LucideTrophy,
    LucideUsers,
    ChevronDown,
    ChevronUp,
    Check,
    User,
    LucideSmartphone,
    LucideLogOut,
    LucideRefreshCw,
    LucideCalculator,
    LucideZap,
    LucideHash,
    LucideCheckCircle2,
    LucideLayoutGrid,
    ChevronRight,
    LucideDelete,
    LucideMapPin,
    LucideShoppingBag,
    LucideMonitorPlay,
    LucideGamepad2
} from "lucide-react";
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer } from "recharts";
import { apiRequest } from "@/lib/queryClient";
import { HiqMember, HiqGameHistory } from "@shared/schema";
import { ActionMiniButton } from "../../components/hiq/ActionMiniButton";
import { OpponentSelector } from "../../components/hiq/OpponentSelector";
import { useStore } from "@/contexts/StoreContext";
import { useToast } from "@/hooks/use-toast";
import { HiqNavigation } from "@/components/hiq/HiqNavigation";

function PlayerStatsDisplay({ memberId }: { memberId: string }) {
    const { data: analysis, isLoading: analysisLoading } = useQuery<{
        summary: {
            overallAvg: string;
            recentAvg: string;
            highRun: number;
            wins: number;
            losses: number;
            matchCount: number;
        }
    }>({
        queryKey: [`/api/hiq/stats/analysis`, { memberId }],
    });

    if (analysisLoading) return (
        <div className="grid grid-cols-2 gap-2 animate-pulse">
            <div className="h-10 bg-white/5 rounded-lg" />
            <div className="h-10 bg-white/5 rounded-lg" />
        </div>
    );

    const summary = analysis?.summary;

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
                <div className="bg-black/20 p-2 rounded-xl border border-white/5 flex flex-col items-center justify-center">
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Win Rate</span>
                    <span className="text-lg font-black text-[#6366f1]">
                        {summary && summary.matchCount > 0 ? Math.round((summary.wins / summary.matchCount) * 100) : 0}%
                    </span>
                    <span className="text-[8px] text-gray-600 font-bold">{summary?.wins || 0}W {summary?.losses || 0}L</span>
                </div>
                <div className="bg-black/20 p-2 rounded-xl border border-white/5 flex flex-col items-center justify-center">
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Average</span>
                    <div className="flex items-center gap-1.5 mt-1">
                        <span className="text-xs font-bold text-gray-400">{summary?.overallAvg || '0.00'}</span>
                        <ChevronRight className="w-3 h-3 text-gray-700" />
                        <span className="text-sm font-black text-white">{summary?.recentAvg || '0.00'}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function HiqDashboard() {
    const { toast } = useToast();
    const [, setLocation] = useLocation();
    const { store: brand } = useStore();
    // --- Types ---
    type OpponentType = 'member' | 'guest';
    interface Opponent {
        type: OpponentType;
        member?: HiqMember;
        name?: string;
        target: number;
    }

    // --- State ---
    const [activeStat, setActiveStat] = useState<string | null>(null);
    const [isGameModalOpen, setIsGameModalOpen] = useState(false);
    const [gameMode, setGameMode] = useState<"practice" | "match">("practice");
    const [gameType, setGameType] = useState<"3c" | "4c">("4c");
    const [isOnlineGameModalOpen, setIsOnlineGameModalOpen] = useState(false);
    const [threeBallSelectionMode, setThreeBallSelectionMode] = useState(false);

    // Multi-opponent State
    const [numberOfPlayers, setNumberOfPlayers] = useState(2);
    const [opponents, setOpponents] = useState<Opponent[]>([]);
    const [rankingTab, setRankingTab] = useState<"3c" | "4c">("4c");

    // Invite & Polling State
    const [inviteCode, setInviteCode] = useState<string | null>(null);
    const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);
    const [joinCode, setJoinCode] = useState("");

    // Verify Pin/Invite State
    // No scanner needed for Host.

    // Auto-resize opponents array based on numberOfPlayers
    useEffect(() => {
        setOpponents(prev => {
            const requiredLength = numberOfPlayers - 1;
            if (prev.length === requiredLength) return prev;

            if (prev.length > requiredLength) {
                return prev.slice(0, requiredLength);
            } else {
                const newOpponents = [...prev];
                while (newOpponents.length < requiredLength) {
                    newOpponents.push({ type: 'member', target: 0 }); // Default
                }
                return newOpponents;
            }
        });
    }, [numberOfPlayers]);

    // Reset when modal closes
    useEffect(() => {
        if (!isGameModalOpen) {
            setOpponents([]);
            setNumberOfPlayers(2);
            setInviteCode(null);
        } else {
            // Init with 1 empty slot
            setOpponents([{ type: 'guest', target: 0, name: '' }]); // Default guest
        }
    }, [isGameModalOpen]);

    // Polling Effect


    // Auto-generate PIN when Match modal opens
    useEffect(() => {
        if (isGameModalOpen && gameMode === "match" && !inviteCode) {
            const createRoom = async () => {
                try {
                    const res = await apiRequest("/api/hiq/invite", { method: "POST" });
                    setInviteCode(res.code);
                } catch (e) {
                    console.error("Failed to create room PIN", e);
                }
            };
            createRoom();
        }
    }, [isGameModalOpen, gameMode, inviteCode]);

    // Polling Effect for Integrated Room PIN
    useEffect(() => {
        if (isGameModalOpen && inviteCode && gameMode === "match") {
            const interval = setInterval(async () => {
                try {
                    const res = await apiRequest(`/api/hiq/invite/${inviteCode}`);
                    // res.guests contains all joined members
                    if (res.guests && res.guests.length > 0) {
                        setOpponents(prev => {
                            const newOpponents = [...prev];
                            res.guests.forEach((guest: any, idx: number) => {
                                // Match joining guests to member slots starting from P2 (idx 0 in opponents)
                                if (idx < newOpponents.length) {
                                    newOpponents[idx] = {
                                        ...newOpponents[idx],
                                        type: 'member',
                                        member: guest
                                    };
                                }
                            });
                            return newOpponents;
                        });
                    }
                } catch (e) {
                    console.error("Polling error", e);
                }
            }, 3000);
            return () => clearInterval(interval);
        }
    }, [isGameModalOpen, inviteCode, gameMode]);

    const handleJoinGame = async () => {
        if (joinCode.length !== 6) return;
        try {
            await apiRequest(`/api/hiq/invite/${joinCode}/join`, { method: "POST" });
            setIsJoinModalOpen(false);
            setJoinCode("");
            toast({
                title: "참여 완료",
                description: "호스트가 상대를 확인 중입니다.",
            });
        } catch (e) {
            toast({
                title: "참여 실패",
                description: "코드를 확인해주세요.",
                variant: "destructive"
            });
        }
    };





    const [p1Target, setP1Target] = useState<number>(0);
    const [useFinishRule, setUseFinishRule] = useState(false);
    const [finishTargetCount, setFinishTargetCount] = useState(1);
    const [usePbaRule, setUsePbaRule] = useState(false);

    // Score Correction Modal State
    const [isScoreModalOpen, setIsScoreModalOpen] = useState(false);
    const [editAverage, setEditAverage] = useState<string>("");
    const [editHandi3c, setEditHandi3c] = useState<number>(0);
    const [editHandi4c, setEditHandi4c] = useState<number>(0);
    const [activeEditType, setActiveEditType] = useState<"3c" | "4c">("4c");

    const { data: member, isLoading } = useQuery<HiqMember>({
        queryKey: ["/api/hiq/me"],
    });

    const { data: history } = useQuery<HiqGameHistory[]>({
        queryKey: ["/api/hiq/history"],
        enabled: isScoreModalOpen,
    });

    const { data: rankings } = useQuery<HiqMember[]>({
        queryKey: ["/api/hiq/rankings"],
    });

    const { data: analysis } = useQuery<any>({
        queryKey: ["/api/hiq/stats/analysis"],
    });

    // --- Derived Stats for Score Grid ---
    const getPercentile = useCallback((type: '3c' | '4c') => {
        if (!rankings || !member) return null;
        const field = type === '3c' ? 'handi3c' : 'handi4c';
        const scores = rankings
            .map(r => r[field])
            .filter((s): s is number => (s ?? 0) > 0)
            .sort((a, b) => b - a);

        const myScore = member[field];
        if (!myScore) return null;

        const rank = scores.indexOf(myScore);
        if (rank === -1) return null;

        return Math.max(1, Math.round(((rank + 1) / scores.length) * 100));
    }, [rankings, member]);

    const getTrend = useCallback(() => {
        if (!analysis?.summary) return { label: "유지 중", color: "text-white/30", icon: <LucideRefreshCw className="w-3 h-3 animate-spin-slow" /> };
        const overall = parseFloat(analysis.summary.overallAvg || "0");
        const recent = parseFloat(analysis.summary.recentAvg || "0");

        if (overall === 0) return { label: "신규 기록", color: "text-blue-400", icon: <LucideZap className="w-3 h-3" /> };
        if (recent > overall * 1.05) return { label: "상승 중", color: "text-red-400", icon: <ChevronUp className="w-3 h-3" /> };
        if (recent < overall * 0.95) return { label: "하락 중", color: "text-gray-500", icon: <ChevronDown className="w-3 h-3" /> };
        return { label: "유지 중", color: "text-white/30", icon: <LucideRefreshCw className="w-3 h-3 animate-spin-slow" /> };
    }, [analysis]);

    const handleLogout = () => {
        document.cookie = "hiq_user_id=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
        setLocation("/");
    };

    const handleStartGame = (mode: "practice" | "match") => {
        setGameMode(mode);
        if (member) {
            setP1Target(gameType === "3c" ? (member.handi3c || 15) : (member.handi4c || 150));
        }
        setIsGameModalOpen(true);
    };

    const openScoreModal = () => {
        if (member) {
            setEditAverage(member.average || "0");
            setEditHandi3c(member.handi3c || 15);
            setEditHandi4c(member.handi4c || 150);
            setIsScoreModalOpen(true);
        }
    };

    const handleAverageChange = (newAvg: string) => {
        setEditAverage(newAvg);
        const avg = parseFloat(newAvg);
        if (!isNaN(avg)) {
            // 4-Ball: Round to nearest 10 (avg * 10 -> round -> * 10)
            // e.g., 22.143 -> 221.43 -> 221 -> 2210 (Target: 220)
            // Correction: Just standard (avg * 100) rounded to nearest 10
            if (activeEditType === "4c") {
                // Example request: 22.143 -> 220
                // Logic: Math.floor(avg) * 10
                setEditHandi4c(Math.floor(avg) * 10);
            } else {
                // 3-Cushion: avg * 20 + 5
                setEditHandi3c(Math.floor(avg * 20 + 5));
            }
        }
    };

    const syncWithHistory = () => {
        if (!history || history.length === 0) return;

        const typeHistory = history.filter(g => g.gameType === activeEditType);
        if (typeHistory.length === 0) return;

        const totalScore = typeHistory.reduce((acc, g) => acc + g.score, 0);
        const totalInnings = typeHistory.reduce((acc, g) => acc + g.innings, 0);

        if (totalInnings > 0) {
            const realAvg = (totalScore / totalInnings).toFixed(3);
            handleAverageChange(realAvg);
        }
    };

    // Update handicap when switching types if average is set
    const handleTypeChange = (type: "3c" | "4c") => {
        setActiveEditType(type);
        // Recalculate based on current average for the new type
        const avg = parseFloat(editAverage);
        if (!isNaN(avg)) {
            if (type === "4c") {
                setEditHandi4c(Math.floor(avg) * 10);
            } else {
                setEditHandi3c(Math.floor(avg * 20 + 5));
            }
        }
    };

    const confirmScoreUpdate = async () => {
        if (!member) return;
        try {
            await apiRequest("/api/hiq/me", {
                method: "PATCH",
                body: {
                    average: editAverage,
                    handi3c: editHandi3c,
                    handi4c: editHandi4c
                }
            });
            setIsScoreModalOpen(false);
            window.location.reload(); // Refresh to show new stats
        } catch (error) {
            console.error("Failed to update scores:", error);
        }
    };

    const updateOpponentType = (index: number, type: OpponentType) => {
        setOpponents(prev => prev.map((o, i) => i === index ? { ...o, type, member: undefined, name: "" } : o));
    };

    const updateOpponentData = (index: number, data: Partial<Opponent>) => {
        setOpponents(prev => prev.map((o, i) => i === index ? { ...o, ...data } : o));
    };

    const confirmStart = async () => {
        if (!member) return;

        // Force Landscape & Fullscreen (Android/Chrome)
        // Note: This requires user interaction, which 'confirmStart' is triggered by.
        try {
            if (document.documentElement.requestFullscreen) {
                await document.documentElement.requestFullscreen();
            }
            if (screen.orientation && 'lock' in screen.orientation) {
                // @ts-ignore
                await screen.orientation.lock('landscape');
            }
        } catch (e) {
            console.warn("Landscape lock failed or not supported:", e);
        }

        const ruleFinishType = !useFinishRule ? "none" : (gameType === "4c" ? "3c" : "bank");

        try {
            const body = {
                gameMode,
                gameType,
                player1Id: member.id,
                player1Target: p1Target,

                player2Id: opponents[0]?.type === 'member' ? opponents[0].member?.id : null,
                player2Name: opponents[0]?.type === 'guest' ? opponents[0].name : undefined,
                player2Target: opponents[0]?.target || 0,

                player3Id: opponents[1]?.type === 'member' ? opponents[1].member?.id : null,
                player3Name: opponents[1]?.type === 'guest' ? opponents[1].name : undefined,
                player3Target: opponents[1]?.target || 0,

                player4Id: opponents[2]?.type === 'member' ? opponents[2].member?.id : null,
                player4Name: opponents[2]?.type === 'guest' ? opponents[2].name : undefined,
                player4Target: opponents[2]?.target || 0,

                ruleFinishType,
                finishTargetCount: useFinishRule ? finishTargetCount : 0,
                usePbaRule: gameType === "3c" ? usePbaRule : false,
                targetScore: p1Target, // Backward compatibility
                status: "playing_base"
            };

            const game = await apiRequest("/api/hiq/game/start", {
                method: "POST",
                body
            });
            setLocation(`/game/${game.id}`);
        } catch (error) {
            console.error("Failed to start game:", error);
        }
    };


    // Move hooks before early returns (Rules of Hooks)
    useEffect(() => {
        if (analysis?.stats && !activeStat) {
            const highest = [...analysis.stats].sort((a, b) => b.A - a.A)[0];
            if (highest) {
                const mapped = { 'Power': '파워', 'Technique': '기술', 'Mental': '멘탈', 'Experience': '경험', 'Trend': '흐름' }[highest.subject as string] || highest.subject;
                setActiveStat(mapped);
            }
        }
    }, [analysis, activeStat]);

    if (isLoading) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center">
                <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                    className="w-12 h-12 border-4 border-[#0e4d2a] border-t-[#ffd700] rounded-full"
                />
            </div>
        );
    }

    if (!member) {
        setLocation("/");
        return null;
    }


    // --- UI Helpers ---
    const getTier = (handi: number, is3c: boolean) => {
        if (is3c) {
            if (handi >= 45) return { label: "MASTER", class: "tier-master", icon: "🔥" };
            if (handi >= 35) return { label: "DIAMOND", class: "tier-diamond", icon: "💠" };
            if (handi >= 28) return { label: "PLATINUM", class: "tier-platinum", icon: "💎" };
            if (handi >= 22) return { label: "GOLD", class: "tier-gold", icon: "🥇" };
            if (handi >= 16) return { label: "SILVER", class: "tier-silver", icon: "🥈" };
            return { label: "BRONZE", class: "tier-bronze", icon: "🥉" };
        } else {
            if (handi >= 700) return { label: "MASTER", class: "tier-master", icon: "🔥" };
            if (handi >= 400) return { label: "DIAMOND", class: "tier-diamond", icon: "💠" };
            if (handi >= 250) return { label: "PLATINUM", class: "tier-platinum", icon: "💎" };
            if (handi >= 150) return { label: "GOLD", class: "tier-gold", icon: "🥇" };
            if (handi >= 80) return { label: "SILVER", class: "tier-silver", icon: "🥈" };
            return { label: "BRONZE", class: "tier-bronze", icon: "🥉" };
        }
    };

    const summary = analysis?.summary;
    const prominentTitle = (() => {
        if (!analysis?.stats || !summary) return null;
        const power = analysis.stats.find(s => s.subject === 'Power')?.A || 0;
        const technique = analysis.stats.find(s => s.subject === 'Technique')?.A || 0;
        const mental = analysis.stats.find(s => s.subject === 'Mental')?.A || 0;
        const trend = analysis.stats.find(s => s.subject === 'Trend')?.A || 0;

        if (technique > power + 15) return "💣 폭격기 (한방 승부사)";
        if (mental > 80) return "🐢 늪 당구 (승률 깡패)";
        if (trend > 80) return "🔥 불도저 (상승세)";
        const values = analysis.stats.map(s => s.A);
        const max = Math.max(...values);
        const min = Math.min(...values);
        if (max - min < 15 && summary.matchCount > 10) return "🤖 AI (기복 없음)";
        return null;
    })();

    const statInfo: Record<string, { title: string, desc: string, data: string }> = {
        '파워': {
            title: '파워 - 기본기',
            desc: '기본적인 득점 능력과 평균 실력입니다. 에버리지가 높을수록 점수가 상승합니다.',
            data: `AVG ${summary?.overallAvg || '0.00'}`
        },
        '기술': {
            title: '기술 - 결정력',
            desc: '난구 풀이와 폭발적인 득점 능력을 나타냅니다. 핸디 대비 하이런이 높을수록 상승합니다.',
            data: `HR ${summary?.highRun || 0}`
        },
        '멘탈': {
            title: '멘탈 - 집중력',
            desc: '위기 순간의 집중력과 대결 승률입니다. 실전에서 이기는 게임이 많을수록 강화됩니다.',
            data: `Win ${summary && summary.matchCount > 0 ? Math.round((summary.wins / summary.matchCount) * 100) : 0}%`
        },
        '경험': {
            title: '경험 - 노련미',
            desc: '게임 운영의 노련함을 담은 경기 기록의 양입니다. HiQ 기록이 쌓일수록 올라갑니다.',
            data: `Total ${summary?.matchCount || 0}게임`
        },
        '흐름': {
            title: '흐름 - 기세',
            desc: '최근 컨디션과 상승세입니다. 통산 성적보다 최근 성적이 좋을 때 높게 책정됩니다.',
            data: `Recent ${summary?.recentAvg || '0.00'}`
        }
    };

    const currentStatData = activeStat ? statInfo[activeStat] : null;
    const activeScore = analysis?.stats?.find(s => {
        const mapped = { 'Power': '파워', 'Technique': '기술', 'Mental': '멘탈', 'Experience': '경험', 'Trend': '흐름' }[s.subject as string] || s.subject;
        return mapped === activeStat;
    })?.A || 0;

    const tier = getTier(member.handi4c || 0, false);

    return (
        <div className="min-h-screen bg-black text-white p-6 pb-32 font-sans relative overflow-x-hidden">


            {/* Profile & Tier Section */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="relative z-10 mb-10 pt-4"
            >
                <div className="flex items-end justify-between mb-8">
                    <div className="space-y-1">
                        <div className="flex items-center gap-2">
                            <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                            <span className="text-[10px] font-black text-white/40 tracking-[0.2em] uppercase">Player Online</span>
                        </div>
                        <h2 className="text-4xl font-black text-premium-bright tracking-tighter leading-tight">
                            {member.name}님
                        </h2>
                        <div className="flex items-center gap-3 mt-2">
                            <div className="px-3 py-1 rounded-full bg-white/5 border border-white/10 backdrop-blur-md flex items-center gap-2">
                                <span className="text-[10px] font-black text-white/60">Lv.{Math.floor((member.visitCount || 0) / 5) + 1}</span>
                            </div>
                            <div className={`px-3 py-1 rounded-full border flex items-center gap-2 ${tier.class}`}>
                                <span className="text-[10px] font-black">{tier.label} TIER</span>
                            </div>
                            <div className="px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 backdrop-blur-md flex items-center gap-2">
                                <LucideZap className="w-3 h-3 text-blue-400" />
                                <span className="text-[10px] font-black text-blue-400">{(member as any).totalSimPoints?.toLocaleString() || 0} SP</span>
                            </div>
                        </div>
                    </div>
                    <div className="relative group">
                        <div className="absolute inset-0 bg-white/20 blur-2xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
                        <div className="w-20 h-20 rounded-3xl premium-glass flex items-center justify-center text-4xl shadow-2xl rotate-3">
                            {tier.icon}
                        </div>
                    </div>
                </div>

                {/* Score Grid */}
                <div className="grid grid-cols-2 gap-4">
                    <motion.div
                        whileHover={{ y: -5 }}
                        className="premium-glass p-5 rounded-[2rem] border-white/5 relative overflow-hidden group"
                    >
                        <p className="text-[10px] font-black text-white/30 tracking-[0.2em] uppercase mb-3">3-Cushion</p>
                        <div className="flex items-baseline gap-2">
                            <h3 className="text-4xl font-black text-white">{member.handi3c || 0}</h3>
                            <span className="text-xs font-bold text-white/40">점</span>
                        </div>
                        <div className="mt-4 flex items-center gap-1.5 text-[10px] font-bold text-green-400">
                            {getPercentile('3c') ? (
                                <>
                                    <ChevronUp className="w-3 h-3" />
                                    <span>상위 {getPercentile('3c')}%</span>
                                </>
                            ) : (
                                <span className="text-white/10 uppercase italic">Calculating...</span>
                            )}
                        </div>
                    </motion.div>

                    <motion.div
                        whileHover={{ y: -5 }}
                        className="premium-glass p-5 rounded-[2rem] border-white/5 relative overflow-hidden group"
                    >
                        <p className="text-[10px] font-black text-white/30 tracking-[0.2em] uppercase mb-3">4-Ball</p>
                        <div className="flex items-baseline gap-2">
                            <h3 className="text-4xl font-black text-white">{member.handi4c || 0}</h3>
                            <span className="text-xs font-bold text-white/40">점</span>
                        </div>
                        <div className={`mt-4 flex items-center gap-1.5 text-[10px] font-bold ${getTrend().color}`}>
                            {getTrend().icon}
                            <span>{getTrend().label}</span>
                        </div>
                    </motion.div>
                </div>
            </motion.div>

            {/* 5-Stat Radar Chart */}
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="mb-10 premium-glass p-6 rounded-[3rem] border-white/5 relative flex flex-col items-center"
            >
                {prominentTitle && (
                    <div className="mb-2 px-4 py-1.5 rounded-full bg-[#22c55e]/20 border border-[#22c55e]/30 shadow-lg backdrop-blur-md">
                        <span className="text-xs font-black text-[#22c55e] tracking-tight">{prominentTitle}</span>
                    </div>
                )}

                <div className="w-full h-[320px] relative mt-2">
                    <ResponsiveContainer width="100%" height="100%">
                        <RadarChart cx="50%" cy="50%" outerRadius="80%" data={(analysis?.stats || [
                            { subject: '파워', A: 0 },
                            { subject: '기술', A: 0 },
                            { subject: '멘탈', A: 0 },
                            { subject: '경험', A: 0 },
                            { subject: '흐름', A: 0 },
                        ]).map((s: any) => ({
                            ...s,
                            subject: {
                                'Power': '파워',
                                'Technique': '기술',
                                'Mental': '멘탈',
                                'Experience': '경험',
                                'Trend': '흐름'
                            }[s.subject as string] || s.subject
                        }))}>
                            <PolarGrid stroke="rgba(255,255,255,0.1)" strokeWidth={1} />
                            <PolarAngleAxis
                                dataKey="subject"
                                tick={(props: any) => {
                                    const { x, y, payload, cx, cy } = props;
                                    const isActive = payload.value === activeStat;

                                    // Calculate direction vector from center to push text outward
                                    const dx = x - cx;
                                    const dy = y - cy;
                                    const mag = Math.sqrt(dx * dx + dy * dy);
                                    const offset = 18; // Increase this value to push text further away
                                    const tx = x + (dx / mag) * offset;
                                    const ty = y + (dy / mag) * offset;

                                    return (
                                        <g transform={`translate(${tx},${ty})`} onClick={() => setActiveStat(payload.value)} className="cursor-pointer">
                                            <text
                                                dy={5}
                                                textAnchor="middle"
                                                fill={isActive ? "#fff" : "rgba(255,255,255,0.4)"}
                                                fontSize={isActive ? 14 : 12}
                                                fontWeight={isActive ? 900 : 700}
                                                className="transition-all duration-300"
                                            >
                                                {payload.value}
                                            </text>
                                        </g>
                                    );
                                }}
                            />
                            <Radar
                                name="My Stats"
                                dataKey="A"
                                stroke="#22c55e"
                                strokeWidth={3}
                                fill="#22c55e"
                                fillOpacity={0.6}
                                animationDuration={1000}
                            />
                        </RadarChart>
                    </ResponsiveContainer>

                    {!analysis?.stats && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <div className="bg-black/40 backdrop-blur-sm px-6 py-3 rounded-2xl border border-white/10 shadow-2xl">
                                <span className="text-sm font-black text-white/60 tracking-tight">
                                    분석된 스타일이 없습니다
                                </span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Analysis Description Card */}
                {currentStatData && (
                    <motion.div
                        key={activeStat}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="w-full mt-6 bg-white/5 rounded-2xl p-4 border border-white/10"
                    >
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex flex-col">
                                <h4 className="text-lg font-black text-white tracking-tighter">{currentStatData.title}</h4>
                            </div>
                            <div className="text-right">
                                <div className="text-2xl font-black text-[#22c55e]">{activeScore}</div>
                                <div className="mt-1 px-2 py-0.5 rounded-lg bg-white/10 border border-white/10 text-[10px] font-black text-white/60 uppercase inline-block shadow-sm">
                                    {currentStatData.data}
                                </div>
                            </div>
                        </div>
                        <p className="text-xs text-white/60 leading-relaxed font-medium">
                            {currentStatData.desc}
                        </p>
                    </motion.div>
                )}
            </motion.div>

            {/* Quick Actions */}
            <div className="space-y-4 mb-12 relative z-10">
                <div className="flex items-center justify-between px-2">
                    <h3 className="text-xs font-black text-white/30 tracking-[0.3em] uppercase">Quick Command</h3>
                    <LucideSmartphone className="w-4 h-4 text-white/10" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <motion.button
                        whileTap={{ scale: 0.95 }}
                        onClick={() => handleStartGame("practice")}
                        className="h-32 rounded-[2.5rem] bg-white/[0.05] border border-white/10 flex flex-col items-center justify-center gap-3 group relative overflow-hidden"
                    >
                        <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                        <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center group-hover:neon-glow transition-all" style={{ ['--hiq-brand-color' as any]: brand?.themeColor }}>
                            <LucideTrophy className="w-6 h-6 text-white" />
                        </div>
                        <span className="font-bold text-sm text-white">혼자 연습하기</span>
                    </motion.button>

                    <motion.button
                        whileTap={{ scale: 0.95 }}
                        onClick={() => handleStartGame("match")}
                        className="h-32 rounded-[2.5rem] bg-white/[0.05] border border-white/10 flex flex-col items-center justify-center gap-3 group relative overflow-hidden"
                    >
                        <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                        <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center group-hover:neon-glow transition-all" style={{ ['--hiq-brand-color' as any]: brand?.themeColor }}>
                            <LucideUsers className="w-6 h-6 text-white" />
                        </div>
                        <span className="font-bold text-sm text-white">매칭 대결</span>
                    </motion.button>

                    <motion.button
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setIsJoinModalOpen(true)}
                        className="h-32 rounded-[2.5rem] bg-white/[0.05] border border-white/10 flex flex-col items-center justify-center gap-3 group relative overflow-hidden"
                    >
                        <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                        <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center group-hover:neon-glow transition-all" style={{ ['--hiq-brand-color' as any]: brand?.themeColor }}>
                            <LucideHash className="w-6 h-6 text-white" />
                        </div>
                        <span className="font-bold text-sm text-white">PIN 참여</span>
                    </motion.button>

                    <motion.button
                        whileTap={{ scale: 0.95 }}
                        onClick={() => {
                            toast({
                                title: "서비스 준비 중",
                                description: "가까운 매장 찾기 기능이 곧 추가됩니다.",
                            });
                        }}
                        className="h-32 rounded-[2.5rem] bg-white/[0.05] border border-white/10 flex flex-col items-center justify-center gap-3 group relative overflow-hidden"
                    >
                        <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                        <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center group-hover:neon-glow transition-all" style={{ ['--hiq-brand-color' as any]: brand?.themeColor }}>
                            <LucideMapPin className="w-6 h-6 text-white" />
                        </div>
                        <span className="font-bold text-sm text-white">매장 찾기</span>
                    </motion.button>

                    <motion.button
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setLocation("/simulation")}
                        className="h-32 rounded-[2.5rem] bg-gradient-to-br from-[#ffd700]/10 to-transparent border border-[#ffd700]/20 flex flex-col items-center justify-center gap-3 group relative overflow-hidden"
                    >
                        <div className="absolute inset-0 bg-[#ffd700]/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                        <div className="w-12 h-12 rounded-2xl bg-[#ffd700]/20 flex items-center justify-center shadow-[0_0_20px_rgba(255,215,0,0.1)] group-hover:shadow-[0_0_30px_rgba(255,215,0,0.2)] transition-all">
                            <LucideMonitorPlay className="w-6 h-6 text-[#ffd700]" />
                        </div>
                        <span className="font-bold text-sm text-[#ffd700]/80 group-hover:text-[#ffd700]">빌리아드 시뮬레이션</span>
                    </motion.button>

                    <motion.button
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setIsOnlineGameModalOpen(true)}
                        className="h-32 rounded-[2.5rem] bg-gradient-to-br from-indigo-500/10 to-transparent border border-indigo-500/20 flex flex-col items-center justify-center gap-3 group relative overflow-hidden"
                    >
                        <div className="absolute inset-0 bg-indigo-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                        <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 flex items-center justify-center shadow-[0_0_20px_rgba(99,102,241,0.1)] group-hover:shadow-[0_0_30px_rgba(99,102,241,0.2)] transition-all">
                            <LucideGamepad2 className="w-6 h-6 text-indigo-400" />
                        </div>
                        <span className="font-bold text-sm text-indigo-400/80 group-hover:text-indigo-400">온라인 게임</span>
                    </motion.button>
                </div>
            </div>

            {/* Online Game Mode Selection Modal */}
            <Dialog
                open={isOnlineGameModalOpen}
                onOpenChange={(open) => {
                    setIsOnlineGameModalOpen(open);
                    if (!open) setThreeBallSelectionMode(false);
                }}
            >
                <DialogContent className="premium-glass border-white/10 text-white sm:max-w-md overflow-hidden">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-black text-center">게임 모드 선택</DialogTitle>
                        <DialogDescription className="text-center text-white/40">
                            플레이할 종목을 선택해주세요.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid grid-cols-2 gap-4 py-4 min-h-[160px]">
                        {/* 3-BALL CARD */}
                        <div
                            className={`relative flex flex-col items-center justify-center p-6 rounded-3xl transition-all duration-300 border overflow-hidden cursor-pointer active:scale-[0.98] ${threeBallSelectionMode
                                ? "bg-indigo-500/20 border-indigo-500/40 col-span-2 shadow-[0_0_30px_rgba(99,102,241,0.1)]"
                                : "bg-white/5 hover:bg-white/10 border-white/10 hover:border-white/20"
                                }`}
                            onClick={() => !threeBallSelectionMode && setThreeBallSelectionMode(true)}
                        >
                            {!threeBallSelectionMode ? (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="flex flex-col items-center gap-3"
                                >
                                    <div className="w-12 h-12 rounded-full bg-yellow-500/20 flex items-center justify-center text-2xl shadow-inner">
                                        🎱
                                    </div>
                                    <div className="text-center">
                                        <span className="font-bold text-lg block">3구</span>
                                        <span className="text-[10px] font-black text-white/30 uppercase tracking-tighter">3-Ball Game</span>
                                    </div>
                                </motion.div>
                            ) : (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="w-full flex flex-col gap-4"
                                >
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-xs font-black text-white/40 uppercase tracking-widest">3-BALL TABLE SIZE</span>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setThreeBallSelectionMode(false); }}
                                            className="text-[10px] font-black text-white/20 hover:text-white/60 uppercase transition-colors"
                                        >
                                            CANCEL
                                        </button>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setLocation("/online-game?mode=3ball&table=medium"); }}
                                            className="flex flex-col items-center p-4 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/10 transition-all active:scale-95 group"
                                        >
                                            <span className="font-black text-sm text-white/80 group-hover:text-white">중대</span>
                                            <span className="text-[9px] font-bold text-white/30">일반 연습용</span>
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setLocation("/online-game?mode=3ball&table=large"); }}
                                            className="flex flex-col items-center p-4 rounded-2xl bg-indigo-500/40 hover:bg-indigo-500/60 border border-indigo-400/40 transition-all active:scale-95 group"
                                        >
                                            <span className="font-black text-sm text-white group-hover:neon-glow" style={{ "--hiq-brand-color": "#818cf8" } as any}>대대</span>
                                            <span className="text-[9px] font-bold text-white/60">국제식 (추천)</span>
                                        </button>
                                    </div>
                                </motion.div>
                            )}
                        </div>

                        {/* 4-BALL CARD */}
                        <AnimatePresence>
                            {!threeBallSelectionMode && (
                                <motion.button
                                    initial={{ opacity: 0, scale: 0.9, x: 20 }}
                                    animate={{ opacity: 1, scale: 1, x: 0 }}
                                    exit={{ opacity: 0, scale: 0.9, x: 20 }}
                                    onClick={() => setLocation("/online-game?mode=4ball&table=medium")}
                                    className="flex flex-col items-center justify-center p-6 rounded-3xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 transition-all gap-3 active:scale-[0.98] group"
                                >
                                    <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform shadow-inner">
                                        🔴
                                    </div>
                                    <div className="text-center">
                                        <span className="font-bold text-lg block">4구</span>
                                        <span className="text-[10px] font-black text-white/30 uppercase tracking-tighter">4-Ball Game</span>
                                    </div>
                                </motion.button>
                            )}
                        </AnimatePresence>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Simulation Leaderboard Section */}
            <div className="mb-12 relative z-10">
                <div className="flex items-center justify-between mb-6 px-2">
                    <h3 className="text-xs font-black text-white/30 tracking-[0.3em] uppercase">Global Sim Ranking</h3>
                    <LucideTrophy className="w-4 h-4 text-[#ffd700]" />
                </div>
                <div className="space-y-3">
                    {[
                        { name: "MasterBilliard", sp: 14200, tier: "MASTER", icon: "🔥" },
                        { name: member?.name || "Player", sp: (member as any)?.totalSimPoints || 0, tier: tier.label, icon: tier.icon, isMe: true },
                        { name: "SpinKing", sp: 9800, tier: "PLATINUM", icon: "💎" }
                    ].sort((a, b) => b.sp - a.sp).map((player, i) => (
                        <Card key={i} className={`bg-white/5 border-white/5 overflow-hidden rounded-[2rem] ${player.isMe ? 'border-blue-500/30 bg-blue-500/5' : ''}`}>
                            <CardContent className="p-5 flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center font-black text-xs">
                                        {i + 1}
                                    </div>
                                    <div className="flex flex-col">
                                        <div className="flex items-center gap-2">
                                            <span className="font-black text-sm">{player.name}</span>
                                            {player.isMe && <span className="bg-blue-500 text-[8px] px-1.5 py-0.5 rounded-md font-black">ME</span>}
                                        </div>
                                        <span className="text-[10px] font-bold text-white/30">{player.tier}</span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="text-right">
                                        <div className="text-sm font-black text-blue-400">{player.sp.toLocaleString()}</div>
                                        <div className="text-[9px] font-bold text-white/20 uppercase">Sim Points</div>
                                    </div>
                                    <button className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-white/40 hover:bg-white/10 hover:text-white transition-all">
                                        <LucideMonitorPlay className="w-4 h-4" />
                                    </button>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>

            <Dialog open={isGameModalOpen} onOpenChange={setIsGameModalOpen}>
                <DialogContent hideClose className="w-screen h-screen max-w-none rounded-none border-none bg-[#0a0a0a] text-white p-0 flex flex-col focus:outline-none data-[state=open]:!zoom-in-100 data-[state=closed]:!zoom-out-100 data-[state=closed]:slide-out-to-bottom-100 data-[state=open]:slide-in-from-bottom-100 duration-200">
                    {/* Custom Header */}
                    <DialogTitle className="sr-only">
                        {gameMode === "practice" ? "혼자 연습하기" : "매칭대결하기"}
                    </DialogTitle>
                    <DialogDescription className="sr-only">
                        {gameMode === "practice" ? "연습 세션을 시작합니다." : "매칭 대결을 시작합니다."}
                    </DialogDescription>
                    <div className="h-14 flex items-center justify-between px-4 border-b border-white/10 bg-[#0a0a0a] shrink-0">
                        <button
                            onClick={() => setIsGameModalOpen(false)}
                            title="뒤로 가기"
                            className="p-2 -ml-2 text-white/80 hover:text-white"
                        >
                            <ChevronDown className="w-6 h-6 rotate-90" />
                        </button>
                        <span className="font-black text-lg">{gameMode === "practice" ? "혼자 연습하기" : "매칭대결하기"}</span>
                        <div className="w-10" />
                    </div>

                    <div className="flex-1 overflow-y-auto min-h-0 scrollbar-hide p-6 pb-32">
                        <div className="max-w-md md:max-w-4xl mx-auto transition-all duration-300">
                            <div className="flex flex-col gap-1 mb-6">
                                {gameMode === "match" && (
                                    <>
                                        <div className="p-4 rounded-2xl bg-white/5 border border-white/10 mb-2">
                                            <p className="text-gray-400 text-xs leading-relaxed text-center">
                                                이 핀번호를 상대방에게 알려주세요.<br />
                                                <span className="text-[#ffd700] font-bold">회원이 참가하면 게임 전적이 자동으로 기록됩니다.</span>
                                            </p>
                                        </div>
                                        <div className="p-8 rounded-3xl bg-[#ffd700] flex flex-col items-center justify-center shadow-[0_20px_40px_rgba(255,215,0,0.1)] border-4 border-black/5">
                                            {inviteCode ? (
                                                <span className="text-5xl font-black text-black tracking-[0.2em] font-mono drop-shadow-sm">{inviteCode}</span>
                                            ) : (
                                                <div className="flex flex-col items-center gap-3">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-3 h-3 bg-black/20 rounded-full animate-bounce [animation-duration:1s]" />
                                                        <div className="w-3 h-3 bg-black/20 rounded-full animate-bounce [animation-duration:1s] [animation-delay:0.2s]" />
                                                        <div className="w-3 h-3 bg-black/20 rounded-full animate-bounce [animation-duration:1s] [animation-delay:0.4s]" />
                                                    </div>
                                                    <span className="text-[10px] font-black text-black/40 uppercase tracking-[0.3em]">Generating PIN...</span>
                                                </div>
                                            )}
                                        </div>
                                    </>
                                )}
                            </div>
                            {/* Game Settings */}
                            <div className="grid grid-cols-2 gap-3 mb-4">
                                <Button
                                    onClick={() => {
                                        setGameType("4c");
                                        if (member) setP1Target(member.handi4c || 150);
                                    }}
                                    className={`h-14 text-xl font-black rounded-2xl ${gameType === "4c" ? "bg-[#0e4d2a] text-white" : "bg-white/5 text-gray-400"}`}
                                >
                                    4구
                                </Button>
                                <Button
                                    onClick={() => {
                                        setGameType("3c");
                                        if (member) setP1Target(member.handi3c || 15);
                                    }}
                                    className={`h-14 text-xl font-black rounded-2xl ${gameType === "3c" ? "bg-[#0e4d2a] text-white" : "bg-white/5 text-gray-400"}`}
                                >
                                    3구
                                </Button>
                            </div>

                            {/* Player Count Selector (Match Only) */}
                            {gameMode === "match" && (
                                <div className="bg-white/5 p-1 rounded-xl flex gap-1 mb-4">
                                    {[2, 3, 4].map((count) => (
                                        <button
                                            key={count}
                                            onClick={() => setNumberOfPlayers(count)}
                                            className={`flex-1 py-3 rounded-lg font-black text-sm transition-all ${numberOfPlayers === count ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}
                                        >
                                            {count}인
                                        </button>
                                    ))}
                                </div>
                            )}

                            {/* Player Grid Container */}
                            <div className="grid grid-cols-1 gap-4 pb-6">
                                {/* Player 1 (Me) */}
                                <div className="bg-white/5 rounded-2xl border border-white/5 p-4 flex flex-col gap-4 shadow-lg">
                                    {/* Header */}
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center text-black font-black text-base shrink-0 shadow-[0_0_15px_rgba(255,255,255,0.3)]">
                                                P1
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm font-bold text-gray-400">나 (Me)</span>
                                                    <div className="text-[10px] font-bold text-white bg-white/10 px-2 py-0.5 rounded-full">HOST</div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Input Display */}
                                    <div className="h-12 flex items-center bg-black/20 rounded-xl px-4 border border-white/5">
                                        <span className="font-black text-white text-lg truncate">
                                            {member.name}
                                        </span>
                                    </div>

                                    {/* Big Score Control */}
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => setP1Target(prev => Math.max(0, prev - (gameType === "4c" ? 10 : 1)))}
                                            aria-label="점수 내리기"
                                            className="flex-1 h-14 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 transition-all flex items-center justify-center border border-white/5"
                                        >
                                            <ChevronDown className="w-6 h-6 text-white" />
                                        </button>
                                        <div className="h-14 min-w-[90px] flex items-center justify-center bg-black/40 rounded-xl border border-white/5 font-black text-3xl text-white tracking-tighter shadow-inner">
                                            {p1Target}
                                        </div>
                                        <button
                                            onClick={() => setP1Target(prev => prev + (gameType === "4c" ? 10 : 1))}
                                            aria-label="점수 올리기"
                                            className="flex-1 h-14 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 transition-all flex items-center justify-center border border-white/5"
                                        >
                                            <ChevronUp className="w-6 h-6 text-white" />
                                        </button>
                                    </div>

                                    {/* Additional Stats */}
                                    <div className="mt-2 border-t border-white/5 pt-4">
                                        <PlayerStatsDisplay memberId={member.id} />
                                    </div>
                                </div>

                                {/* Opponents */}
                                {gameMode === "match" && Array.from({ length: numberOfPlayers - 1 }).map((_, idx) => {
                                    const opponent = opponents[idx];
                                    const isGuest = opponent?.type === 'guest';
                                    const badgeColor = idx === 0 ? "bg-[#ffd700]" : idx === 1 ? "bg-red-500" : "bg-blue-500";
                                    const textColor = idx === 0 ? "text-[#ffd700]" : idx === 1 ? "text-red-500" : "text-blue-500";

                                    return (
                                        <div key={idx} className="bg-white/5 rounded-2xl border border-white/5 p-4 flex flex-col gap-4 shadow-lg">
                                            {/* Header */}
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-12 h-12 ${badgeColor} rounded-full flex items-center justify-center text-black font-black text-base shrink-0 shadow-[0_0_15px_rgba(255,255,255,0.2)]`}>
                                                        P{idx + 2}
                                                    </div>
                                                    <span className={`text-sm font-bold ${textColor}`}>상대방 {idx + 1}</span>
                                                </div>

                                                {/* Toggle Switch */}
                                                <div className="flex bg-black/40 rounded-lg p-1">
                                                    <button
                                                        onClick={() => updateOpponentType(idx, 'member')}
                                                        className={`px-4 py-2 rounded-md text-xs font-bold transition-all ${!isGuest ? 'bg-white/20 text-white shadow-sm' : 'text-gray-500 hover:text-gray-400'}`}
                                                    >
                                                        회원
                                                    </button>
                                                    <button
                                                        onClick={() => updateOpponentType(idx, 'guest')}
                                                        className={`px-4 py-2 rounded-md text-xs font-bold transition-all ${isGuest ? 'bg-white/20 text-white shadow-sm' : 'text-gray-500 hover:text-gray-400'}`}
                                                    >
                                                        게스트
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Input Area */}
                                            {isGuest ? (
                                                <div className="h-12 w-full flex items-center bg-black/20 rounded-xl px-2 border border-white/5 focus-within:border-white/20 transition-colors">
                                                    <input
                                                        type="text"
                                                        value={opponent?.name || ""}
                                                        onChange={(e) => updateOpponentData(idx, { name: e.target.value })}
                                                        placeholder="이름 입력"
                                                        className="bg-transparent w-full font-bold text-white text-lg px-2 placeholder:text-gray-600 focus:outline-none"
                                                    />
                                                </div>
                                            ) : (
                                                <div className="h-12 w-full flex items-center bg-black/20 rounded-xl px-4 border border-white/5">
                                                    {opponent?.member ? (
                                                        <span className="font-black text-white text-lg truncate">
                                                            {opponent.member.name}
                                                        </span>
                                                    ) : (
                                                        <span className="font-bold text-white/20 text-sm animate-pulse">
                                                            PIN입력 대기 중...
                                                        </span>
                                                    )}
                                                </div>
                                            )}

                                            {/* Big Score Control */}
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => updateOpponentData(idx, { target: Math.max(0, (opponent?.target || 0) - (gameType === "4c" ? 10 : 1)) })}
                                                    aria-label={`상대방 ${idx + 1} 점수 내리기`}
                                                    className="flex-1 h-14 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 transition-all flex items-center justify-center border border-white/5"
                                                >
                                                    <ChevronDown className="w-6 h-6 text-white" />
                                                </button>
                                                <div className={`h-14 min-w-[90px] flex items-center justify-center bg-black/40 rounded-xl border border-white/5 font-black text-3xl ${textColor} tracking-tighter shadow-inner`}>
                                                    {opponent?.target || 0}
                                                </div>
                                                <button
                                                    onClick={() => updateOpponentData(idx, { target: Math.max(0, (opponent?.target || 0) + (gameType === "4c" ? 10 : 1)) })}
                                                    aria-label={`상대방 ${idx + 1} 점수 올리기`}
                                                    className="flex-1 h-14 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 transition-all flex items-center justify-center border border-white/5"
                                                >
                                                    <ChevronUp className="w-6 h-6 text-white" />
                                                </button>
                                            </div>

                                            {/* Additional Stats (Members Only) */}
                                            {!isGuest && opponent?.member && (
                                                <div className="mt-2 border-t border-white/5 pt-4">
                                                    <PlayerStatsDisplay
                                                        memberId={opponent.member.id}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>


                            <div className="space-y-4 mb-2 px-1">
                                <div className="flex flex-col gap-2 p-3 bg-white/5 rounded-xl border border-white/5">
                                    <label className="flex items-center gap-4 cursor-pointer group p-2">
                                        <div
                                            onClick={() => {
                                                const next = !useFinishRule;
                                                setUseFinishRule(next);
                                                if (next) setFinishTargetCount(1);
                                            }}
                                            className={`w-8 h-8 rounded-xl border-2 flex items-center justify-center transition-all ${useFinishRule ? 'bg-[#0e4d2a] border-[#0e4d2a]' : 'border-white/20 group-hover:border-white/40'}`}
                                        >
                                            {useFinishRule && <Check className="w-5 h-5 text-[#ffd700]" strokeWidth={3} />}
                                        </div>
                                        <span className={`text-base font-black ${useFinishRule ? 'text-white' : 'text-gray-500'}`}>
                                            마무리 제도 사용
                                        </span>
                                    </label>

                                    {useFinishRule && (
                                        <div className="flex items-center justify-between pl-4 pr-2 border-t border-white/5 pt-4 pb-2">
                                            <span className="text-sm font-bold text-gray-400">목표 개수</span>
                                            <div className="flex items-center gap-4 bg-black/40 rounded-xl px-4 py-2 border border-white/5">
                                                <button onClick={() => setFinishTargetCount(prev => Math.max(1, prev - 1))} title="마무리 점수 내리기" className="p-2 hover:bg-white/10 rounded-lg active:scale-90 transition-all"><ChevronDown className="w-5 h-5 text-gray-400" /></button>
                                                <span className="text-xl font-black text-white w-8 text-center">{finishTargetCount}</span>
                                                <button onClick={() => setFinishTargetCount(prev => prev + 1)} title="마무리 점수 올리기" className="p-2 hover:bg-white/10 rounded-lg active:scale-90 transition-all"><ChevronUp className="w-5 h-5 text-gray-400" /></button>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {gameType === "3c" && (
                                    <label className="flex items-center gap-4 cursor-pointer group pl-3 mt-4">
                                        <div
                                            onClick={() => setUsePbaRule(!usePbaRule)}
                                            className={`w-8 h-8 rounded-xl border-2 flex items-center justify-center transition-all ${usePbaRule ? 'bg-blue-600 border-blue-600' : 'border-white/20 group-hover:border-white/40'}`}
                                        >
                                            {usePbaRule && <Check className="w-5 h-5 text-white" strokeWidth={3} />}
                                        </div>
                                        <span className={`text-base font-black ${usePbaRule ? 'text-white' : 'text-gray-500'}`}>PBA 프로 룰 (2점제)</span>
                                    </label>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="p-4 border-t border-white/10 bg-[#0a0a0a] pb-8 shrink-0">
                        <div className="max-w-md mx-auto">
                            <Button
                                onClick={confirmStart}
                                className="w-full h-16 bg-[#ffd700] text-black hover:bg-[#ffea00] font-black text-xl rounded-2xl shadow-lg active:scale-[0.98] transition-all"
                            >
                                게임 시작
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Real-time Rankings */}
            <Card className="bg-[#151515] border-[#222] rounded-3xl overflow-hidden">
                <CardHeader className="p-6 pb-2">
                    <CardTitle className="text-xl font-black flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <LucideTrophy className="w-6 h-6 text-[#ffd700]" />
                            당구장 실시간 랭킹
                        </div>
                        <button
                            onClick={() => setLocation('/ranking')}
                            className="text-xs text-white/60 font-bold hover:text-white transition-colors"
                        >
                            자세히 보기 &gt;
                        </button>
                    </CardTitle>

                    {/* Ranking Tabs */}
                    <div className="flex gap-2 p-1 bg-white/5 rounded-2xl">
                        <Button
                            variant="ghost"
                            onClick={() => setRankingTab("4c")}
                            className={`flex-1 h-10 rounded-xl font-black text-sm transition-all ${rankingTab === "4c" ? "bg-[#14643a] text-white shadow-lg" : "text-white/50 hover:text-white/80"}`}
                        >
                            ⚪ 4구 랭킹
                        </Button>
                        <Button
                            variant="ghost"
                            onClick={() => setRankingTab("3c")}
                            className={`flex-1 h-10 rounded-xl font-black text-sm transition-all ${rankingTab === "3c" ? "bg-[#ffd700] text-white shadow-lg" : "text-white/50 hover:text-white/80"}`}
                        >
                            ⚪ 3구 랭킹
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="p-4 space-y-2">
                    {rankings?.filter((r: any) => {
                        const handi = rankingTab === "3c" ? r.handi3c : r.handi4c;
                        return handi > 0;
                    })
                        .sort((a: any, b: any) => {
                            const handiA = rankingTab === "3c" ? a.handi3c : a.handi4c;
                            const handiB = rankingTab === "3c" ? b.handi3c : b.handi4c;
                            if (handiB !== handiA) return handiB - handiA;
                            return parseFloat(b.average || "0") - parseFloat(a.average || "0");
                        })
                        .map((rank: any, idx: number) => (
                            <div
                                key={rank.id}
                                className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${rank.id === member.id ? "bg-[#0e4d2a]/20 border-[#0e4d2a] scale-[1.02]" : "bg-[#1a1a1a] border-white/5"
                                    }`}
                            >
                                <div className="flex items-center gap-4">
                                    <span className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-xs ${idx === 0 ? "bg-[#ffd700] text-black ring-4 ring-[#ffd700]/20" :
                                        idx === 1 ? "bg-gray-300 text-black ring-4 ring-gray-300/20" :
                                            idx === 2 ? "bg-amber-600 text-white ring-4 ring-amber-600/20" : "text-gray-500"
                                        }`}>
                                        {idx + 1}
                                    </span>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="font-black text-lg">{rank.name}</span>
                                            {rank.id === member.id && <span className="px-1.5 py-0.5 bg-white/10 rounded text-[8px] font-black text-white/50 uppercase tracking-tighter">YOU</span>}
                                        </div>
                                        <span className="text-gray-600 text-[10px] font-bold uppercase tracking-widest">Lv.{Math.floor(rank.visitCount / 5) + 1} Member</span>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="font-black text-xl text-white">
                                        {rankingTab === "4c" ? "4구" : "3구"} {rankingTab === "4c" ? rank.handi4c : rank.handi3c}
                                    </div>
                                </div>
                            </div>
                        ))}
                    {!rankings && <p className="text-center py-10 text-gray-500">데이터를 불러오는 중입니다...</p>}
                </CardContent>
            </Card>



            {/* Navigation Padding */}
            <div className="h-6" />
            {/* Score Correction Modal */}
            <Dialog open={isScoreModalOpen} onOpenChange={setIsScoreModalOpen}>
                <DialogContent className="bg-[#111] border-[#222] text-white rounded-3xl max-w-sm">
                    <DialogHeader>
                        <DialogTitle className="text-2xl font-black flex items-center gap-2">
                            <LucideSettings className="w-6 h-6 text-[#ffd700]" />
                            점수(핸디) 설정
                        </DialogTitle>
                        <DialogDescription className="text-gray-400">
                            내 에버리지를 입력하면 적정 점수를 추천해드립니다.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="py-2">
                        <div className="bg-[#1a1a1a] rounded-xl p-4 mb-6 border border-[#333] relative overflow-hidden">
                            <div className="flex justify-between items-center mb-2">
                                <label className="text-xs font-bold text-[#ffd700] uppercase">나의 에버리지</label>
                                <button
                                    onClick={syncWithHistory}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0e4d2a] hover:bg-[#126335] text-white text-[10px] font-bold rounded-full transition-colors"
                                >
                                    <LucideRefreshCw className="w-3 h-3" />
                                    내 기록 불러오기
                                </button>
                            </div>
                            <div className="flex items-center gap-2">
                                <input
                                    type="number"
                                    step="0.001"
                                    value={editAverage}
                                    onChange={(e) => handleAverageChange(e.target.value)}
                                    className="bg-transparent text-4xl font-black text-white w-full focus:outline-none placeholder:text-gray-700 z-10 relative"
                                    placeholder="0.000"
                                />
                                <LucideCalculator className="w-6 h-6 text-gray-500" />
                            </div>
                        </div>

                        <div className="flex bg-[#1a1a1a] p-1 rounded-xl mb-4">
                            <button
                                onClick={() => setActiveEditType("4c")}
                                className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${activeEditType === "4c" ? "bg-[#0e4d2a] text-white shadow-lg" : "text-gray-500"}`}
                            >
                                4구
                            </button>
                            <button
                                onClick={() => setActiveEditType("3c")}
                                className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${activeEditType === "3c" ? "bg-[#0e4d2a] text-white shadow-lg" : "text-gray-500"}`}
                            >
                                3구
                            </button>
                        </div>

                        <div className="bg-[#1a1a1a] rounded-xl p-4 border border-[#333]">
                            <div className="flex justify-between items-center mb-1">
                                <label className="text-xs font-bold text-gray-400 uppercase">추천 목표 점수</label>
                                <span className="text-[10px] bg-[#ffd700] text-black px-1.5 py-0.5 rounded font-black">AUTO</span>
                            </div>
                            {activeEditType === "4c" ? (
                                <div className="flex items-center gap-2">
                                    <input
                                        type="number"
                                        title="4구 핸디캡"
                                        placeholder="0"
                                        value={editHandi4c}
                                        onChange={(e) => setEditHandi4c(Number(e.target.value))}
                                        className="bg-transparent text-4xl font-black text-white w-full focus:outline-none"
                                    />
                                    <span className="text-lg font-bold text-gray-600">점</span>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2">
                                    <input
                                        type="number"
                                        title="3구 핸디캡"
                                        placeholder="0"
                                        value={editHandi3c}
                                        onChange={(e) => setEditHandi3c(Number(e.target.value))}
                                        className="bg-transparent text-4xl font-black text-white w-full focus:outline-none"
                                    />
                                    <span className="text-lg font-bold text-gray-600">점</span>
                                </div>
                            )}
                        </div>
                    </div>

                    <DialogFooter>
                        <Button
                            onClick={confirmScoreUpdate}
                            className="w-full h-14 text-lg font-black bg-[#ffd700] text-black hover:bg-[#ffe033] rounded-xl"
                        >
                            적용하기
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>


            <Dialog open={isJoinModalOpen} onOpenChange={setIsJoinModalOpen}>
                <DialogContent className="bg-[#111] border-[#333] text-white rounded-[2.5rem] p-8">
                    <DialogHeader>
                        <DialogTitle className="text-center text-xl font-bold">PIN 번호 입력</DialogTitle>
                        <DialogDescription className="text-center text-white/50">
                            호스트에게 전달받은 6자리 번호를 입력하세요.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-6 space-y-6">
                        <div className="flex justify-center">
                            <input
                                type="text"
                                maxLength={6}
                                value={joinCode}
                                onChange={(e) => setJoinCode(e.target.value.replace(/[^0-9]/g, ''))}
                                className="w-full max-w-[400px] h-18 text-center text-5xl font-black tracking-[0.4em] bg-white/5 border border-white/10 rounded-3xl focus:border-[#ffd700] focus:outline-none transition-all pl-[0.4em] shadow-inner"
                                placeholder="000000"
                            />
                        </div>
                        <div className="grid grid-cols-3 gap-3 px-2">
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                                <button
                                    key={num}
                                    title={num.toString()}
                                    onClick={() => joinCode.length < 6 && setJoinCode(prev => prev + num)}
                                    className="h-14 w-full rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-2xl font-black transition-all active:scale-95"
                                >
                                    {num}
                                </button>
                            ))}
                            <div />
                            <button
                                onClick={() => joinCode.length < 6 && setJoinCode(prev => prev + "0")}
                                title="0"
                                className="h-14 w-full rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-2xl font-black transition-all active:scale-95"
                            >
                                0
                            </button>
                            <button
                                onClick={() => setJoinCode(prev => prev.slice(0, -1))}
                                title="삭제"
                                className="h-14 w-full rounded-2xl flex items-center justify-center text-white/40 hover:text-white hover:bg-white/5 transition-all active:scale-95 group"
                            >
                                <LucideDelete className="w-8 h-8 transition-transform group-hover:scale-110" strokeWidth={3} />
                            </button>
                        </div>
                        <Button
                            onClick={handleJoinGame}
                            disabled={joinCode.length !== 6}
                            className="w-full h-14 text-lg font-black bg-[#0e4d2a] hover:bg-[#126335] text-white rounded-xl disabled:opacity-50"
                        >
                            입장하기
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            <HiqNavigation />
        </div>
    );
}
