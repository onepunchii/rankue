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
    LucideGamepad2,
    HelpCircle
} from "lucide-react";
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer } from "recharts";
import { apiRequest } from "@/lib/queryClient";
import { HiqMember, HiqGameHistory } from "@shared/schema";
import { ActionMiniButton } from "../../components/hiq/ActionMiniButton";
import { OpponentSelector } from "../../components/hiq/OpponentSelector";
import { useStore } from "@/contexts/StoreContext";
import { useToast } from "@/hooks/use-toast";
import { HiqNavigation } from "@/components/hiq/HiqNavigation";

// Helper to calculate target score based on average and game type
const calculateTargetScore = (avg: string | number | null | undefined, type: '3c' | '4c'): number => {
    const average = typeof avg === 'string' ? parseFloat(avg) : (avg || 0);
    if (isNaN(average) || average === 0) return type === '3c' ? 15 : 15; // Minimum defaults

    if (type === '3c') {
        const calculated = Math.round(average * 35);
        return Math.max(1, calculated);
    } else {
        const calculated = Math.round(average * 20);
        return Math.max(1, calculated);
    }
};

// Helper to calculate Record Average from history
const calculateRecordAverage = (history: HiqGameHistory[] | undefined, type: '3c' | '4c', defaultAvg: string | undefined | null) => {
    if (!history) return defaultAvg || "0.000";

    // Filter for official match games of the specific type
    const validGames = history.filter(g =>
        g.gameType === type &&
        g.gameMode === "match" &&
        (g as any).isRanked
    );

    if (validGames.length === 0) return defaultAvg || "0.000";

    const totalScore = validGames.reduce((acc, g) => acc + g.score, 0);
    const totalInnings = validGames.reduce((acc, g) => acc + g.innings, 0);

    return totalInnings > 0 ? (totalScore / totalInnings).toFixed(3) : (defaultAvg || "0.000");
};

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
    const [statsTab, setStatsTab] = useState<"3c" | "4c">("4c");

    // RP Guide Modal State
    const [isRpModalOpen, setIsRpModalOpen] = useState(false);

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
                                if (idx < newOpponents.length) {
                                    // Only update if it's a new member joining this slot or slot was empty/guest
                                    const currentMemberId = newOpponents[idx].member?.id;
                                    if (currentMemberId !== guest.id) {
                                        newOpponents[idx] = {
                                            ...newOpponents[idx],
                                            type: 'member',
                                            member: guest,
                                            target: calculateTargetScore(guest.average, gameType),
                                            name: guest.name
                                        };
                                    }
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
    }, [isGameModalOpen, inviteCode, gameMode, gameType]);

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
    });

    const { data: rankings } = useQuery<HiqMember[]>({
        queryKey: [`/api/hiq/rankings?type=${rankingTab}`],
    });

    const { data: analysis } = useQuery<any>({
        queryKey: [`/api/hiq/stats/analysis`, { type: statsTab }],
    });

    // --- Derived Stats for Score Grid ---
    const getPercentile = useCallback((type: '3c' | '4c') => {
        if (!rankings || !member) return null;
        const field = type === '3c' ? 'rating3c' : 'rating4c';
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
            const recordAvg = calculateRecordAverage(history, gameType, member.average);
            setP1Target(calculateTargetScore(recordAvg, gameType));
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


    // Calculate Live Average from History (to match History Page)
    const calculateLiveAvg = (type: '3c' | '4c') => {
        if (!history) return "0.000";
        const validGames = history.filter(g =>
            g.gameType === type &&
            g.gameMode === "match" &&
            (g as any).isRanked
        );
        if (validGames.length === 0) return "0.000";
        const totalScore = validGames.reduce((acc, g) => acc + g.score, 0);
        const totalInnings = validGames.reduce((acc, g) => acc + g.innings, 0);
        return totalInnings > 0 ? (totalScore / totalInnings).toFixed(3) : "0.000";
    };

    const liveAvg3c = calculateLiveAvg('3c');
    const liveAvg4c = calculateLiveAvg('4c');

    // --- UI Helpers ---
    const getTier = (avg: number, is3c: boolean) => {
        // 1. Base Tier (Absolute Evaluation by Average)
        let tier = { label: "BRONZE", class: "tier-bronze", icon: "🥉" };
        if (is3c) {
            if (avg >= 0.90) tier = { label: "PLATINUM", class: "tier-platinum", icon: "💎" };
            else if (avg >= 0.56) tier = { label: "GOLD", class: "tier-gold", icon: "🥇" };
            else if (avg >= 0.36) tier = { label: "SILVER", class: "tier-silver", icon: "🥈" };
        } else {
            if (avg >= 5.00) tier = { label: "PLATINUM", class: "tier-platinum", icon: "💎" };
            else if (avg >= 3.00) tier = { label: "GOLD", class: "tier-gold", icon: "🥇" };
            else if (avg >= 1.51) tier = { label: "SILVER", class: "tier-silver", icon: "🥈" };
        }

        // 2. High Tier Promotion (Relative Evaluation by RP Ranking)
        // If skilled enough for Platinum, check RP Ranking for Title Borders
        if (tier.label === "PLATINUM") {
            const p = getPercentile(is3c ? '3c' : '4c');
            if (p !== null) {
                if (p <= 1) return { label: "MASTER", class: "tier-master", icon: "🔥" };
                if (p <= 10) return { label: "DIAMOND", class: "tier-diamond", icon: "💠" };
            }
        }

        return tier;
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

    const tier = getTier(parseFloat(summary?.avg4c || "0"), false);

    return (
        <div className="min-h-screen bg-[#0A0A0A] text-white p-6 pb-32 font-sans relative overflow-x-hidden">


            {/* RP Guide Modal */}
            <AnimatePresence>
                {isRpModalOpen && (
                    <Dialog open={isRpModalOpen} onOpenChange={setIsRpModalOpen}>
                        <DialogContent className="bg-black/80 backdrop-blur-xl border-[#10b981]/30 max-w-sm rounded-3xl text-white">
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                            >
                                <DialogHeader className="mb-4">
                                    <DialogTitle className="text-xl font-bold flex items-center gap-2">
                                        <LucideTrophy className="w-5 h-5 text-[#10b981]" />
                                        <span>랭킹 포인트(RP) 가이드</span>
                                    </DialogTitle>
                                </DialogHeader>

                                {/* Section 1: Definition */}
                                <div className="mb-6 p-4 bg-white/5 rounded-2xl border border-white/5">
                                    <p className="text-sm text-gray-300 leading-relaxed font-medium">
                                        티어는 <span className="text-[#10b981] font-bold">에버리지(Avg)</span>를 기준으로 산정됩니다.
                                        <br />
                                        플래티넘 이상부터는 RP 랭킹에 따라 <span className="text-[#00e5ff] font-bold">다이아/마스터</span>가 결정됩니다!
                                    </p>
                                </div>

                                {/* Section 2: Rules */}
                                <div className="mb-6 space-y-3">
                                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest px-1">Winning Rules</h4>
                                    <div className="bg-white/5 rounded-2xl border border-white/5 p-4 space-y-3">
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm font-bold">승리 시 (Win)</span>
                                            <span className="text-[#10b981] font-black">+30 RP</span>
                                        </div>
                                        <div className="h-px bg-white/10" />
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm font-bold">패배 시 (Loss)</span>
                                            <span className="text-red-400 font-black">-15 RP</span>
                                        </div>
                                        <p className="text-[11px] text-gray-500 mt-2 bg-black/20 p-2 rounded-lg leading-relaxed">
                                            ※ <span className="text-white font-bold">초보자 보호:</span> 실버 등급 이하는 패배 시 점수가 차감되지 않거나(-0), 소폭 차감(-5)되어 부담 없이 즐길 수 있습니다.
                                        </p>
                                    </div>
                                </div>

                                {/* Section 3: Tier Table */}
                                <div>
                                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest px-1 mb-3">Tier Standards (Handicap)</h4>
                                    <div className="bg-white/5 rounded-2xl border border-white/5 overflow-hidden">
                                        <table className="w-full text-xs text-left">
                                            <thead className="bg-white/5 text-gray-400">
                                                <tr>
                                                    <th className="p-3 font-bold">Tier</th>
                                                    <th className="p-3 font-bold">3-Cushion</th>
                                                    <th className="p-3 font-bold">4-Ball</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-white/5 text-gray-300">
                                                <tr>
                                                    <td className="p-3 font-bold text-[#cd7f32]">BRONZE</td>
                                                    <td className="p-3">Avg ~ 0.35</td>
                                                    <td className="p-3">Avg ~ 1.50</td>
                                                </tr>
                                                <tr>
                                                    <td className="p-3 font-bold text-gray-300">SILVER</td>
                                                    <td className="p-3">Avg 0.36 ~ 0.55</td>
                                                    <td className="p-3">Avg 1.51 ~ 2.99</td>
                                                </tr>
                                                <tr>
                                                    <td className="p-3 font-bold text-[#ffd700]">GOLD</td>
                                                    <td className="p-3">Avg 0.56 ~ 0.89</td>
                                                    <td className="p-3">Avg 3.00 ~ 4.99</td>
                                                </tr>
                                                <tr>
                                                    <td className="p-3 font-bold text-[#00e5ff]">PLATINUM</td>
                                                    <td className="p-3">Avg 0.90 +</td>
                                                    <td className="p-3">Avg 5.00 +</td>
                                                </tr>
                                            </tbody>
                                        </table>
                                        <div className="p-3 bg-white/[0.02] text-[10px] text-center text-gray-500">
                                            * 플래티넘 달성 시, RP 랭킹으로 상위 티어 도전 가능
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        </DialogContent>
                    </Dialog>
                )}
            </AnimatePresence>

            {/* Profile & Tier Section */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="relative z-10 mb-8 pt-4"
            >
                <div className="flex items-center justify-between mb-8">
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <div className="h-1.5 w-1.5 rounded-full bg-[#10b981] shadow-[0_0_8px_#10b981]" />
                            <span className="text-[10px] font-black text-[#10b981]/60 tracking-[0.2em] uppercase">Player Active</span>
                        </div>
                        <div className="flex flex-col">
                            <h2 className="text-4xl font-black text-white tracking-tighter leading-tight">
                                {member.name}님
                            </h2>
                            <span className="text-[10px] font-black text-white/20 uppercase tracking-widest mt-0.5">DASHBOARD OVERVIEW</span>
                        </div>
                        <div className="flex items-center gap-2 mt-4">
                            <div className="px-3 py-1 rounded-full bg-white/5 border border-white/10 backdrop-blur-md flex items-center gap-2">
                                <span className="text-[9px] font-black text-white/40 uppercase">Lv.{Math.floor((member.visitCount || 0) / 5) + 1}</span>
                            </div>
                            <div className={`px-3 py-1 rounded-full border flex items-center gap-2 ${tier.class} bg-white/5 backdrop-blur-md`}>
                                <span className="text-[9px] font-black uppercase">{tier.label} TIER</span>
                            </div>
                            <div className="px-3 py-1 rounded-full bg-[#10b981]/10 border border-[#10b981]/20 backdrop-blur-md flex items-center gap-2">
                                <LucideZap className="w-3 h-3 text-[#10b981]" />
                                <span className="text-[9px] font-black text-[#10b981]">{(member as any).totalSimPoints?.toLocaleString() || 0} SP</span>
                            </div>
                        </div>
                    </div>
                    <div className="relative group">
                        <div className="absolute inset-0 bg-[#10b981]/20 blur-3xl rounded-full opacity-50" />
                        <div className="w-20 h-20 rounded-[2rem] bg-white/[0.03] border border-white/10 flex items-center justify-center text-4xl shadow-2xl backdrop-blur-xl relative z-10">
                            {tier.icon}
                        </div>
                    </div>
                </div>

                {/* Score Grid */}
                <div className="grid grid-cols-2 gap-4">
                    <motion.div
                        whileHover={{ y: -5 }}
                        className="bg-white/[0.03] p-6 rounded-[2.5rem] border border-white/5 relative overflow-hidden group backdrop-blur-sm"
                    >
                        <div className="flex flex-col">
                            <span className="text-[10px] font-black text-[#10b981] tracking-[0.2em] uppercase mb-1">3-Cushion</span>
                            <span className="text-[8px] font-bold text-white/20 uppercase tracking-widest mb-4">MATCH RATING</span>
                        </div>
                        <div className="flex items-baseline gap-2">
                            <h3 className="text-5xl font-black text-white tracking-tighter">{member.rating3c || 0}</h3>
                            <span className="text-sm font-bold text-[#10b981] ml-1">RP</span>
                            <button onClick={() => setIsRpModalOpen(true)} className="ml-1 opacity-50 hover:opacity-100 transition-opacity">
                                <HelpCircle className="w-4 h-4 text-[#10b981]" />
                            </button>
                        </div>
                        <div className="absolute top-6 right-6 flex flex-col items-end">
                            <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">AVG</span>
                            <span className="text-xl font-black text-white tracking-tight">{liveAvg3c}</span>
                        </div>
                        <div className="mt-6 flex items-center gap-1.5 text-[10px] font-black text-[#10b981] bg-[#10b981]/10 w-fit px-3 py-1 rounded-full border border-[#10b981]/20">
                            {getPercentile('3c') ? (
                                <>
                                    <ChevronUp className="w-3 h-3" />
                                    <span>TOP {getPercentile('3c')}%</span>
                                </>
                            ) : (
                                <span className="text-white/20 uppercase italic">ANALYZING...</span>
                            )}
                        </div>
                    </motion.div>

                    <motion.div
                        whileHover={{ y: -5 }}
                        className="bg-white/[0.03] p-6 rounded-[2.5rem] border border-white/5 relative overflow-hidden group backdrop-blur-sm"
                    >
                        <div className="flex flex-col">
                            <span className="text-[10px] font-black text-white/40 tracking-[0.2em] uppercase mb-1">4-Ball</span>
                            <span className="text-[8px] font-bold text-white/20 uppercase tracking-widest mb-4">MATCH RATING</span>
                        </div>
                        <div className="flex items-baseline gap-2">
                            <h3 className="text-5xl font-black text-white tracking-tighter">{member.rating4c || 0}</h3>
                            <span className="text-sm font-bold text-white/40 ml-1">RP</span>
                            <button onClick={() => setIsRpModalOpen(true)} className="ml-1 opacity-30 hover:opacity-100 transition-opacity">
                                <HelpCircle className="w-4 h-4 text-white" />
                            </button>
                        </div>
                        <div className="absolute top-6 right-6 flex flex-col items-end">
                            <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">AVG</span>
                            <span className="text-xl font-black text-white tracking-tight">{liveAvg4c}</span>
                        </div>
                        <div className={`mt-6 flex items-center gap-1.5 text-[10px] font-black ${getTrend().color} bg-white/5 w-fit px-3 py-1 rounded-full border border-white/10`}>
                            {getTrend().icon}
                            <span className="uppercase">{getTrend().label}</span>
                        </div>
                    </motion.div>
                </div>
            </motion.div>

            {/* 5-Stat Radar Chart */}
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="mb-10 bg-white/[0.03] p-6 rounded-[2.5rem] border border-white/5 relative flex flex-col items-center backdrop-blur-sm"
            >
                {prominentTitle && (
                    <div className="mb-2 px-4 py-1.5 rounded-full bg-[#10b981]/20 border border-[#10b981]/30 shadow-lg backdrop-blur-md">
                        <span className="text-xs font-black text-[#10b981] tracking-tight">{prominentTitle}</span>
                    </div>
                )}

                {/* Stats Type Switcher (3-Cushion vs 4-Ball) */}
                <div className="flex justify-center mb-0 mt-4 relative z-10">
                    <div className="flex p-1 bg-black/40 rounded-xl border border-white/5 backdrop-blur-sm">
                        <button
                            onClick={() => setStatsTab('4c')}
                            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${statsTab === '4c' ? 'bg-[#10b981] text-black shadow-lg shadow-[#10b981]/20' : 'text-gray-400 hover:text-white'}`}
                        >
                            4구
                        </button>
                        <button
                            onClick={() => setStatsTab('3c')}
                            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${statsTab === '3c' ? 'bg-[#10b981] text-black shadow-lg shadow-[#10b981]/20' : 'text-gray-400 hover:text-white'}`}
                        >
                            3구
                        </button>
                    </div>
                </div>

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
                                stroke="#10b981"
                                strokeWidth={3}
                                fill="#10b981"
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

                {/* Stat Controller Tabs */}
                <div className="w-full mt-8 flex p-1.5 bg-black/20 rounded-2xl border border-white/5">
                    {Object.keys(statInfo).map((stat) => (
                        <button
                            key={stat}
                            onClick={() => setActiveStat(stat)}
                            className={`flex-1 py-3 rounded-xl transition-all duration-300 flex flex-col items-center justify-center gap-1 ${activeStat === stat
                                ? "bg-[#10b981]/10 shadow-[0_0_15px_rgba(16,185,129,0.1)]"
                                : "hover:bg-white/5"
                                }`}
                        >
                            <span className={`text-[11px] font-black tracking-tighter transition-colors ${activeStat === stat ? "text-[#10b981]" : "text-white/30"
                                }`}>
                                {stat}
                            </span>
                            {activeStat === stat && (
                                <motion.div
                                    layoutId="stat-indicator"
                                    className="w-1 h-1 rounded-full bg-[#10b981] shadow-[0_0_5px_#10b981]"
                                />
                            )}
                        </button>
                    ))}
                </div>

                {/* Dynamic Content Card */}
                <AnimatePresence mode="wait">
                    {currentStatData && (
                        <motion.div
                            key={activeStat}
                            initial={{ opacity: 0, scale: 0.98, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.98, y: -10 }}
                            transition={{ duration: 0.3, ease: "easeOut" }}
                            className="w-full mt-4 bg-white/[0.04] rounded-[2.5rem] p-8 border border-white/10 backdrop-blur-md shadow-2xl relative overflow-hidden group"
                        >
                            <div className="absolute top-0 right-0 w-32 h-32 bg-[#10b981]/5 blur-[60px] rounded-full -mr-16 -mt-16 group-hover:bg-[#10b981]/10 transition-colors" />

                            <div className="flex items-center justify-between mb-6 relative z-10">
                                <div className="flex flex-col">
                                    <h4 className="text-2xl font-black text-white tracking-tighter mb-1">{currentStatData.title}</h4>
                                    <span className="text-[10px] font-black text-[#10b981]/60 uppercase tracking-[0.2em]">Detailed Analysis</span>
                                </div>
                                <div className="text-right flex flex-col items-end">
                                    <div className="text-4xl font-black text-[#10b981] tracking-tighter mb-1 leading-none">
                                        {activeScore}
                                    </div>
                                    <div className="px-3 py-1 rounded-full bg-[#10b981]/10 border border-[#10b981]/20 text-[10px] font-black text-[#10b981] uppercase tracking-wider">
                                        {currentStatData.data}
                                    </div>
                                </div>
                            </div>

                            <p className="text-sm text-white/50 leading-relaxed font-medium relative z-10">
                                {currentStatData.desc}
                            </p>

                            {/* Decorative line */}
                            <div className="absolute bottom-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-[#10b981]/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>

            {/* Quick Actions */}
            <div className="space-y-4 mb-12 relative z-10">
                <div className="flex items-center justify-between px-2">
                    <h3 className="text-xs font-black text-white/30 tracking-[0.3em] uppercase">Quick Command</h3>
                    <LucideSmartphone className="w-4 h-4 text-white/10" />
                </div>

                <div className="grid grid-cols-2 gap-4 auto-rows-min">
                    {/* [1] 혼자 연습하기 (1x1) */}
                    <motion.button
                        whileTap={{ scale: 0.95 }}
                        onClick={() => handleStartGame("practice")}
                        className="row-span-1 h-34 rounded-[2.5rem] bg-white/[0.08] border border-white/10 flex flex-col items-center justify-center gap-3 group relative overflow-hidden shadow-[0_0_20px_rgba(255,255,255,0.02)]"
                    >
                        <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                        <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center transition-all">
                            <LucideTrophy className="w-7 h-7 text-white/40 group-hover:text-white" />
                        </div>
                        <div className="text-center px-4">
                            <span className="block font-black text-sm text-white/60 group-hover:text-white transition-colors">혼자 연습하기</span>
                            <span className="text-[9px] font-black text-white/20 uppercase tracking-widest mt-0.5 block">PRACTICE MODE</span>
                        </div>
                    </motion.button>

                    {/* [2] 매칭 대결 (1x2 Tall) */}
                    <motion.button
                        whileTap={{ scale: 0.95 }}
                        onClick={() => handleStartGame("match")}
                        className="row-span-2 h-72 rounded-[2.5rem] bg-white/[0.08] border border-[#10b981]/30 flex flex-col items-center justify-center gap-6 group relative overflow-hidden shadow-[0_0_20px_rgba(16,185,129,0.05)]"
                    >
                        <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                        <div className="w-20 h-20 rounded-[2rem] bg-[#10b981]/10 flex items-center justify-center group-hover:neon-glow transition-all" style={{ ['--hiq-brand-color' as any]: '#10b981' }}>
                            <LucideUsers className="w-10 h-10 text-[#10b981]" />
                        </div>
                        <div className="text-center px-4">
                            <span className="block font-black text-base text-white">매칭 대결</span>
                            <span className="text-[10px] font-black text-white/20 uppercase tracking-widest mt-1 block">MATCH MODE</span>
                        </div>
                    </motion.button>

                    {/* [3] PIN 참여 (1x1) - Practice 아래 배치 */}
                    <motion.button
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setIsJoinModalOpen(true)}
                        className="h-34 rounded-[2.5rem] bg-white/[0.05] border border-[#10b981]/30 flex flex-col items-center justify-center gap-3 group relative overflow-hidden shadow-[0_0_20px_rgba(16,185,129,0.05)]"
                    >
                        <div className="absolute inset-0 bg-[#10b981]/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                        <div className="w-14 h-14 rounded-2xl bg-[#10b981]/10 flex items-center justify-center group-hover:neon-glow transition-all" style={{ ['--hiq-brand-color' as any]: '#10b981' }}>
                            <LucideHash className="w-6 h-6 text-[#10b981]" />
                        </div>
                        <div className="text-center">
                            <span className="block font-black text-sm text-white">PIN 참여</span>
                            <span className="text-[9px] font-black text-[#10b981]/40 uppercase tracking-widest mt-0.5 block">JOIN GAME</span>
                        </div>
                    </motion.button>

                    {/* [4] 온라인 게임 (Wide) */}
                    <motion.button
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setIsOnlineGameModalOpen(true)}
                        className="col-span-2 h-32 rounded-[2.5rem] bg-[#10b981]/10 border border-[#10b981]/20 flex items-center justify-start px-10 gap-6 group relative overflow-hidden shadow-[0_0_30px_rgba(16,185,129,0.05)]"
                    >
                        <div className="absolute inset-0 bg-[#10b981]/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                        <div className="w-16 h-16 rounded-[2rem] bg-[#10b981]/20 flex items-center justify-center shadow-[0_0_20px_rgba(16,185,129,0.1)] group-hover:shadow-[0_0_30px_rgba(16,185,129,0.2)] transition-all">
                            <LucideGamepad2 className="w-8 h-8 text-[#10b981]" />
                        </div>
                        <div className="text-left">
                            <span className="block font-black text-xl text-[#10b981]">e-빌리어드</span>
                            <span className="text-[10px] font-black text-[#10b981]/40 uppercase tracking-widest">Digital Sports Experience</span>
                        </div>
                    </motion.button>

                    {/* [5] 시뮬레이션 (1x1) */}
                    <motion.button
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setLocation("/simulation")}
                        className="h-32 rounded-[2.5rem] bg-white/[0.05] border border-white/10 flex flex-col items-center justify-center gap-3 group relative overflow-hidden"
                    >
                        <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                        <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center group-hover:neon-glow transition-all">
                            <LucideMonitorPlay className="w-6 h-6 text-white/40 group-hover:text-white" />
                        </div>
                        <div className="text-center">
                            <span className="block font-black text-sm text-white/70 group-hover:text-white transition-colors">시뮬레이션</span>
                            <span className="text-[9px] font-black text-white/20 uppercase tracking-widest mt-0.5 block">VIRTUAL SIM</span>
                        </div>
                    </motion.button>

                    {/* [6] 매장 찾기 (1x1) */}
                    <motion.button
                        whileTap={{ scale: 0.95 }}
                        onClick={() => {
                            toast({
                                title: "서비스 준비 중",
                                description: "가까운 매장 찾기 기능이 곧 추가됩니다.",
                            });
                        }}
                        className="h-32 rounded-[2.5rem] bg-white/[0.03] border border-white/5 flex flex-col items-center justify-center gap-3 group relative overflow-hidden opacity-50 hover:opacity-100 transition-opacity"
                    >
                        <LucideMapPin className="w-6 h-6 text-white/20 group-hover:text-white/60" />
                        <div className="text-center">
                            <span className="block font-bold text-sm text-white/30 group-hover:text-white/60 transition-colors">매장 찾기</span>
                            <span className="text-[9px] font-black text-white/10 uppercase tracking-widest mt-0.5 block">FIND CLUB</span>
                        </div>
                    </motion.button>
                </div>
            </div>

            {/* Online Game Mode Selection Modal (Premium Bento) */}
            <Dialog
                open={isOnlineGameModalOpen}
                onOpenChange={(open) => {
                    setIsOnlineGameModalOpen(open);
                    if (!open) setThreeBallSelectionMode(false);
                }}
            >
                <DialogContent hideClose className="bg-[#0A0A0A]/95 backdrop-blur-xl border border-white/10 text-white max-w-lg w-[95%] rounded-[3rem] p-0 overflow-hidden shadow-[0_0_100px_rgba(0,0,0,0.8)] focus:outline-none">
                    <div className="p-10 bg-gradient-to-br from-white/[0.02] to-transparent relative">
                        <DialogHeader className="mb-10">
                            <div className="flex flex-col items-center text-center">
                                <DialogTitle className="text-4xl font-black tracking-tighter text-white mb-2">게임 모드 선택</DialogTitle>
                                <DialogDescription className="text-[11px] font-black text-[#10b981]/60 uppercase tracking-[0.2em]">
                                    Pick your billiards arena
                                </DialogDescription>
                            </div>
                        </DialogHeader>

                        {/* Custom Close Button */}
                        <button
                            onClick={() => setIsOnlineGameModalOpen(false)}
                            className="absolute top-8 right-8 w-10 h-10 rounded-full bg-white/[0.03] border border-white/10 flex items-center justify-center hover:bg-white/10 transition-all group"
                        >
                            <span className="text-2xl text-white/20 group-hover:text-white">&times;</span>
                        </button>

                        <div className={`grid ${threeBallSelectionMode ? 'grid-cols-1' : 'grid-cols-2'} gap-6 py-2 min-h-[220px]`}>
                            {/* 3-BALL CARD */}
                            <motion.div
                                layout
                                className={`relative flex flex-col items-center justify-center p-8 rounded-[2.5rem] transition-all duration-500 border overflow-hidden cursor-pointer group/card ${threeBallSelectionMode
                                    ? "bg-[#10b981]/10 border-[#10b981]/30 col-span-1 shadow-[0_0_40px_rgba(16,185,129,0.15)] h-[280px]"
                                    : "bg-white/[0.03] hover:bg-white/[0.08] border-white/5 hover:border-[#10b981]/30 active:scale-[0.98]"
                                    }`}
                                onClick={() => !threeBallSelectionMode && setThreeBallSelectionMode(true)}
                            >
                                <div className="absolute top-0 right-0 w-32 h-32 bg-[#10b981]/5 blur-[60px] rounded-full -mr-16 -mt-16 group-hover/card:bg-[#10b981]/15 transition-colors" />

                                {!threeBallSelectionMode ? (
                                    <motion.div
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="flex flex-col items-center gap-5 relative z-10"
                                    >
                                        <div className="w-20 h-20 rounded-3xl bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center text-4xl shadow-2xl group-hover/card:scale-110 transition-transform">
                                            🎱
                                        </div>
                                        <div className="text-center">
                                            <span className="font-black text-2xl block tracking-tighter text-white mb-1">3구</span>
                                            <span className="text-[10px] font-black text-white/20 uppercase tracking-widest group-hover/card:text-[#10b981]/60 transition-colors">3-Ball Game</span>
                                        </div>
                                    </motion.div>
                                ) : (
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.95 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        className="w-full h-full flex flex-col justify-between relative z-10"
                                    >
                                        <div className="flex items-center justify-between mb-8">
                                            <div className="flex flex-col">
                                                <span className="text-lg font-black text-white tracking-tighter">테이블 규격 선택</span>
                                                <span className="text-[9px] font-black text-[#10b981] uppercase tracking-widest">Select Arena Size</span>
                                            </div>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); setThreeBallSelectionMode(false); }}
                                                className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-[10px] font-black hover:bg-white/10 transition-all"
                                            >
                                                <ChevronDown className="w-4 h-4 text-white/40 rotate-90" />
                                            </button>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <motion.button
                                                whileHover={{ y: -4 }}
                                                whileTap={{ scale: 0.96 }}
                                                onClick={(e) => { e.stopPropagation(); setLocation("/online-game?mode=3ball&table=medium"); }}
                                                className="flex flex-col items-center p-6 rounded-[1.8rem] bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 transition-all group/btn shadow-xl"
                                            >
                                                <span className="font-black text-xl text-white/80 group-hover/btn:text-white mb-1">중대</span>
                                                <span className="text-[9px] font-black text-white/20 uppercase tracking-widest group-hover/btn:text-white/40">Domestic</span>
                                            </motion.button>
                                            <motion.button
                                                whileHover={{ y: -4 }}
                                                whileTap={{ scale: 0.96 }}
                                                onClick={(e) => { e.stopPropagation(); setLocation("/online-game?mode=3ball&table=large"); }}
                                                className="flex flex-col items-center p-6 rounded-[1.8rem] bg-[#10b981]/20 hover:bg-[#10b981]/30 border border-[#10b981]/30 transition-all group/btn shadow-[0_10px_30px_rgba(16,185,129,0.2)]"
                                            >
                                                <span className="font-black text-xl text-white group-hover/btn:scale-105 transition-transform mb-1">대대</span>
                                                <span className="text-[9px] font-black text-white/60 uppercase tracking-widest group-hover/btn:text-white/80">International</span>
                                            </motion.button>
                                        </div>
                                    </motion.div>
                                )}
                            </motion.div>

                            {/* 4-BALL CARD */}
                            <AnimatePresence>
                                {!threeBallSelectionMode && (
                                    <motion.button
                                        initial={{ opacity: 0, scale: 0.9, x: 20 }}
                                        animate={{ opacity: 1, scale: 1, x: 0 }}
                                        exit={{ opacity: 0, scale: 0.9, x: 20 }}
                                        onClick={() => setLocation("/online-game?mode=4ball&table=medium")}
                                        className="relative flex flex-col items-center justify-center p-8 rounded-[2.5rem] bg-white/[0.03] hover:bg-white/[0.08] border border-white/5 hover:border-[#10b981]/30 transition-all active:scale-[0.98] group/card overflow-hidden h-full"
                                    >
                                        <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/5 blur-[60px] rounded-full -mr-16 -mt-16 group-hover/card:bg-red-500/15 transition-colors" />

                                        <div className="flex flex-col items-center gap-5 relative z-10">
                                            <div className="w-20 h-20 rounded-3xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-4xl shadow-2xl group-hover/card:scale-110 transition-transform">
                                                🔴
                                            </div>
                                            <div className="text-center">
                                                <span className="font-black text-2xl block tracking-tighter text-white mb-1">4구</span>
                                                <span className="text-[10px] font-black text-white/20 uppercase tracking-widest group-hover/card:text-[#10b981]/60 transition-colors">4-Ball Game</span>
                                            </div>
                                        </div>
                                    </motion.button>
                                )}
                            </AnimatePresence>
                        </div>
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
                                        const newType = "4c";
                                        setGameType(newType);
                                        if (member) {
                                            const recordAvg = calculateRecordAverage(history, newType, member.average);
                                            setP1Target(calculateTargetScore(recordAvg, newType));
                                        }
                                        setOpponents(prev => prev.map(o => {
                                            if (o.type === 'member' && o.member) {
                                                return { ...o, target: calculateTargetScore(o.member.average, newType) };
                                            }
                                            return o;
                                        }));
                                    }}
                                    className={`h-14 text-xl font-black rounded-2xl ${gameType === "4c" ? "bg-[#0e4d2a] text-white" : "bg-white/5 text-gray-400"}`}
                                >
                                    4구
                                </Button>
                                <Button
                                    onClick={() => {
                                        const newType = "3c";
                                        setGameType(newType);
                                        if (member) {
                                            const recordAvg = calculateRecordAverage(history, newType, member.average);
                                            setP1Target(calculateTargetScore(recordAvg, newType));
                                        }
                                        setOpponents(prev => prev.map(o => {
                                            if (o.type === 'member' && o.member) {
                                                return { ...o, target: calculateTargetScore(o.member.average, newType) };
                                            }
                                            return o;
                                        }));
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
                                    <div className="h-12 flex items-center justify-between bg-black/20 rounded-xl px-4 border border-white/5">
                                        <span className="font-black text-white text-lg truncate">
                                            {member.name}
                                        </span>
                                        <span className="text-xs font-bold text-gray-400 bg-black/30 px-2 py-1 rounded-lg">
                                            AVG {calculateRecordAverage(history, gameType, member.average)}
                                        </span>
                                    </div>

                                    {/* Big Score Control */}
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => setP1Target(prev => Math.max(0, prev - 1))}
                                            aria-label="점수 내리기"
                                            className="flex-1 h-14 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 transition-all flex items-center justify-center border border-white/5"
                                        >
                                            <ChevronDown className="w-6 h-6 text-white" />
                                        </button>
                                        <div className="h-14 min-w-[90px] flex items-center justify-center bg-black/40 rounded-xl border border-white/5 font-black text-3xl text-white tracking-tighter shadow-inner">
                                            {p1Target}
                                        </div>
                                        <button
                                            onClick={() => setP1Target(prev => prev + 1)}
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
                                                <div className="h-12 w-full flex items-center bg-black/20 rounded-xl px-4 border border-white/5 justify-between">
                                                    {opponent?.member ? (
                                                        <>
                                                            <span className="font-black text-white text-lg truncate">
                                                                {opponent.member.name}
                                                            </span>
                                                            <span className="text-xs font-bold text-gray-400 bg-black/30 px-2 py-1 rounded-lg">
                                                                AVG {opponent.member.average}
                                                            </span>
                                                        </>
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
                                                    onClick={() => updateOpponentData(idx, { target: Math.max(0, (opponent?.target || 0) - 1) })}
                                                    aria-label={`상대방 ${idx + 1} 점수 내리기`}
                                                    className="flex-1 h-14 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 transition-all flex items-center justify-center border border-white/5"
                                                >
                                                    <ChevronDown className="w-6 h-6 text-white" />
                                                </button>
                                                <div className={`h-14 min-w-[90px] flex items-center justify-center bg-black/40 rounded-xl border border-white/5 font-black text-3xl ${textColor} tracking-tighter shadow-inner`}>
                                                    {opponent?.target || 0}
                                                </div>
                                                <button
                                                    onClick={() => updateOpponentData(idx, { target: Math.max(0, (opponent?.target || 0) + 1) })}
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
            <div className="bg-white/[0.03] border border-white/5 rounded-[2.5rem] overflow-hidden backdrop-blur-sm mb-12">
                <div className="p-8 pb-4">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex flex-col">
                            <div className="flex items-center gap-2 mb-1">
                                <LucideTrophy className="w-5 h-5 text-[#ffd700]" />
                                <h3 className="text-xl font-black text-white tracking-tighter">당구장 실시간 랭킹</h3>
                            </div>
                            <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em]">Real-time Ranking</span>
                        </div>
                        <button
                            onClick={() => setLocation('/ranking')}
                            className="bg-white/5 px-4 py-2 rounded-full text-[10px] text-white/40 font-black hover:text-white hover:bg-white/10 transition-all uppercase tracking-widest"
                        >
                            View All
                        </button>
                    </div>

                    {/* Ranking Tabs */}
                    <div className="flex gap-2 p-1.5 bg-black/20 rounded-2xl border border-white/5 mb-4">
                        <Button
                            variant="ghost"
                            onClick={() => setRankingTab("4c")}
                            className={`flex-1 h-12 rounded-xl font-black text-sm transition-all ${rankingTab === "4c"
                                ? "bg-[#10b981]/20 text-[#10b981] shadow-[0_0_20px_rgba(16,185,129,0.1)] border border-[#10b981]/20"
                                : "text-white/40 hover:text-white/80"
                                }`}
                        >
                            <span className={rankingTab === "4c" ? "text-[#10b981]" : "text-white/20"}>⚪</span> 4구 랭킹
                        </Button>
                        <Button
                            variant="ghost"
                            onClick={() => setRankingTab("3c")}
                            className={`flex-1 h-12 rounded-xl font-black text-sm transition-all ${rankingTab === "3c"
                                ? "bg-[#10b981]/20 text-[#10b981] shadow-[0_0_20px_rgba(16,185,129,0.1)] border border-[#10b981]/20"
                                : "text-white/40 hover:text-white/80"
                                }`}
                        >
                            <span className={rankingTab === "3c" ? "text-[#10b981]" : "text-white/20"}>⚪</span> 3구 랭킹
                        </Button>
                    </div>
                </div>

                <div className="px-4 pb-8 space-y-3">
                    {rankings?.map((rank: any, idx: number) => (
                        <div
                            key={rank.id}
                            className={`flex items-center justify-between p-5 rounded-[2rem] border transition-all ${rank.id === member.id
                                ? "bg-[#10b981]/10 border-[#10b981]/40 shadow-[0_0_20px_rgba(16,185,129,0.05)]"
                                : "bg-white/[0.02] border-white/5 active:bg-white/[0.05]"
                                }`}
                        >
                            <div className="flex items-center gap-5">
                                <div className={`w-10 h-10 rounded-[1rem] flex items-center justify-center font-black text-sm ${idx === 0 ? "bg-[#ffd700] text-black shadow-[0_0_15px_rgba(255,215,0,0.3)]" :
                                    idx === 1 ? "bg-slate-300 text-black shadow-[0_0_15px_rgba(203,213,225,0.2)]" :
                                        idx === 2 ? "bg-amber-600 text-white shadow-[0_0_15px_rgba(217,119,6,0.2)]" :
                                            "bg-white/5 text-white/20"
                                    }`}>
                                    {idx + 1}
                                </div>
                                <div className="flex flex-col">
                                    <div className="flex items-center gap-2 mb-0.5">
                                        <span className="font-black text-lg text-white tracking-tighter">{rank.name}</span>
                                        {rank.id === member.id && (
                                            <span className="px-2 py-0.5 bg-[#10b981] text-black rounded text-[8px] font-black uppercase tracking-tighter">YOU</span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-white/20 text-[9px] font-black uppercase tracking-widest">
                                            Lv.{Math.floor(rank.visitCount / 5) + 1} Member
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="flex flex-col items-end">
                                    <span className="text-[10px] font-black text-[#10b981] uppercase tracking-widest mb-1">
                                        {rankingTab === "4c" ? "Record Rating" : "Record Rating"}
                                    </span>
                                    <div className="font-black text-2xl text-white tracking-tighter">
                                        {rankingTab === "4c" ? rank.rating4c : rank.rating3c}
                                        <span className="text-xs font-bold text-[#10b981] ml-1">RP</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                    {!rankings && (
                        <div className="py-20 flex flex-col items-center justify-center gap-4 opacity-20">
                            <LucideRefreshCw className="w-8 h-8 animate-spin-slow" />
                            <span className="text-xs font-black uppercase tracking-widest">Loading Records...</span>
                        </div>
                    )}
                </div>
            </div>



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
                <DialogContent className="bg-[#050505] border-white/5 text-white rounded-[3rem] p-8 shadow-2xl overflow-hidden">
                    <DialogHeader>
                        <DialogTitle className="text-center text-2xl font-black tracking-tighter">PIN 번호 입력</DialogTitle>
                        <DialogDescription className="text-center text-white/50">
                            호스트에게 전달받은 6자리 번호를 입력하세요.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-6 space-y-6">
                        <div className="flex justify-center">
                            <input
                                type="tel"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                maxLength={6}
                                value={joinCode}
                                onChange={(e) => setJoinCode(e.target.value.replace(/[^0-9]/g, ''))}
                                className="w-full max-w-[400px] h-20 text-center text-5xl font-black tracking-[0.4em] bg-white/5 border border-white/10 rounded-3xl focus:border-[#10b981] focus:outline-none transition-all pl-[0.4em] shadow-inner caret-[#10b981]"
                                placeholder="000000"
                                autoFocus
                            />
                        </div>
                        <Button
                            onClick={handleJoinGame}
                            disabled={joinCode.length !== 6}
                            className="w-full h-16 text-lg font-black bg-[#10b981] hover:bg-[#10b981]/90 text-black rounded-2xl disabled:bg-white/5 disabled:text-white/20 disabled:opacity-100 shadow-[0_10px_30px_rgba(16,185,129,0.2)] active:scale-[0.98] transition-all"
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
