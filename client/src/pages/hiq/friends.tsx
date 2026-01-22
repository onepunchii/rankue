import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    LucideChevronLeft,
    LucideUserPlus,
    LucideSearch,
    LucideSword,
    LucideTrophy,
    LucideZap,
    LucideUsers,
    LucideShield,
    LucideTarget
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { apiRequest } from "@/lib/queryClient";
import { HiqMember, HiqGame } from "@shared/schema";
import { LucideCalendar } from "lucide-react";

interface HiqMemberWithH2H extends HiqMember {
    h2h?: {
        wins: number;
        losses: number;
        draws: number;
    }
}
import { HiqNavigation } from "@/components/hiq/HiqNavigation";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { useStore } from "@/contexts/StoreContext";
import { useToast } from "@/hooks/use-toast";

interface RecentOpponent extends HiqMember {
    lastGameScore: string;
    lastGameResult: 'win' | 'loss' | 'draw';
    playedAt: Date;
}

interface SearchResult extends HiqMember {
    isFriend: boolean;
    hasPlayedTogether: boolean;
}

export default function HiqRivals() {
    const [, setLocation] = useLocation();
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [searchKeyword, setSearchKeyword] = useState("");
    const queryClient = useQueryClient();
    const { store: brand } = useStore();
    const { toast } = useToast();

    // Fetch friends list
    const { data: friends = [] } = useQuery<HiqMemberWithH2H[]>({
        queryKey: ["/api/hiq/friends"],
    });

    // Fetch recent opponents
    const { data: recentOpponents = [] } = useQuery<RecentOpponent[]>({
        queryKey: ["/api/hiq/friends/recent-opponents"],
    });

    // Search users
    const { data: searchResults = [], refetch: performSearch, isLoading: isSearching } = useQuery<SearchResult[]>({
        queryKey: [`/api/hiq/friends/search`, searchKeyword],
        queryFn: async () => {
            const res = await apiRequest(`/api/hiq/friends/search?keyword=${searchKeyword}`);
            return res;
        },
        enabled: false,
    });

    // Add friend mutation
    const addFriendMutation = useMutation({
        mutationFn: async (receiverId: string) => {
            return await apiRequest("/api/hiq/friends", {
                method: "POST",
                body: { receiverId }
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/hiq/friends"] });
            queryClient.invalidateQueries({ queryKey: ["/api/hiq/friends/recent-opponents"] });
            toast({
                title: "라이벌 추가 완료",
                description: "이제 대결 상대로 선택할 수 있습니다.",
            });
        }
    });

    const [selectedFriendId, setSelectedFriendId] = useState<string | null>(null);

    const { data: vsGames, isLoading: isLoadingVsGames } = useQuery<HiqGame[]>({
        queryKey: [`/api/hiq/games/vs/${selectedFriendId}`],
        enabled: !!selectedFriendId
    });

    const selectedFriend = friends.find(f => f.id === selectedFriendId);

    const { data: me } = useQuery<HiqMember>({
        queryKey: ["/api/hiq/me"],
    });

    const handleSearch = () => {
        if (searchKeyword.trim()) {
            performSearch();
        }
    };


    const getTier = (handi: number, is3c: boolean) => {
        if (is3c) {
            if (handi >= 45) return { label: "MASTER", class: "tier-master", icon: "🔥", glow: "rgba(239, 68, 68, 0.15)" };
            if (handi >= 35) return { label: "DIAMOND", class: "tier-diamond", icon: "💠", glow: "rgba(185, 242, 255, 0.15)" };
            if (handi >= 28) return { label: "PLATINUM", class: "tier-platinum", icon: "💎", glow: "rgba(0, 255, 209, 0.15)" };
            if (handi >= 22) return { label: "GOLD", class: "tier-gold", icon: "🥇", glow: "rgba(255, 215, 0, 0.15)" };
            if (handi >= 16) return { label: "SILVER", class: "tier-silver", icon: "🥈", glow: "rgba(224, 224, 224, 0.15)" };
            return { label: "BRONZE", class: "tier-bronze", icon: "🥉", glow: "rgba(205, 127, 50, 0.15)" };
        } else {
            if (handi >= 700) return { label: "MASTER", class: "tier-master", icon: "🔥", glow: "rgba(239, 68, 68, 0.15)" };
            if (handi >= 400) return { label: "DIAMOND", class: "tier-diamond", icon: "💠", glow: "rgba(185, 242, 255, 0.15)" };
            if (handi >= 250) return { label: "PLATINUM", class: "tier-platinum", icon: "💎", glow: "rgba(0, 255, 209, 0.15)" };
            if (handi >= 150) return { label: "GOLD", class: "tier-gold", icon: "🥇", glow: "rgba(255, 215, 0, 0.15)" };
            if (handi >= 80) return { label: "SILVER", class: "tier-silver", icon: "🥈", glow: "rgba(224, 224, 224, 0.15)" };
            return { label: "BRONZE", class: "tier-bronze", icon: "🥉", glow: "rgba(205, 127, 50, 0.15)" };
        }
    };

    return (
        <div className="min-h-screen bg-[#0A0A0A] text-white pb-32 px-6 relative overflow-x-hidden font-sans">
            {/* Background Light Effect */}
            <div className="absolute top-0 right-0 w-[80dvw] h-[40dvh] bg-[#10b981]/5 blur-[120px] rounded-full -mr-[30dvw] -mt-[10dvh] pointer-events-none" />

            {/* Premium Header */}
            <div className="flex items-center justify-between py-10 relative z-10">
                <div className="flex items-center gap-5">
                    <motion.button
                        whileTap={{ scale: 0.9 }}
                        onClick={() => setLocation("/menu")}
                        className="w-12 h-12 rounded-full bg-white/[0.03] border border-white/10 flex items-center justify-center backdrop-blur-md active:scale-95 transition-all"
                    >
                        <LucideChevronLeft className="w-6 h-6 text-white/40" />
                    </motion.button>
                    <div>
                        <h1 className="text-3xl font-black tracking-tighter text-white">라이벌 리스트</h1>
                        <p className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em] mt-0.5">Competitors Arena</p>
                    </div>
                </div>
                <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setIsSearchOpen(true)}
                    className="w-12 h-12 rounded-full bg-[#10b981]/10 border border-[#10b981]/20 flex items-center justify-center backdrop-blur-md shadow-[0_0_20px_rgba(16,185,129,0.1)] active:scale-95 transition-all"
                >
                    <LucideSearch className="w-5 h-5 text-[#10b981]" />
                </motion.button>
            </div>

            {/* Recent Opponents (Glass Slider) */}
            {recentOpponents.length > 0 && (
                <div className="mb-14 relative z-10">
                    <div className="flex items-center justify-between px-2 mb-6">
                        <div className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-[#10b981] animate-pulse" />
                            <h2 className="text-[10px] font-black text-white/30 tracking-[0.3em] uppercase">최근 매칭 상대</h2>
                        </div>
                        <span className="text-[9px] font-black text-[#10b981]/60 uppercase tracking-widest">Recent Players</span>
                    </div>

                    <div className="flex gap-5 overflow-x-auto pb-8 scrollbar-hide -mx-6 px-6">
                        <AnimatePresence>
                            {recentOpponents.map((opponent, idx) => {
                                const tier = getTier(opponent.handi4c || 0, false);
                                return (
                                    <motion.div
                                        key={opponent.id}
                                        initial={{ opacity: 0, scale: 0.95, x: 50 }}
                                        animate={{ opacity: 1, scale: 1, x: 0 }}
                                        transition={{ delay: idx * 0.1 }}
                                        className="flex-shrink-0"
                                    >
                                        <div className="w-72 p-8 rounded-[3rem] bg-white/[0.03] border border-white/5 relative overflow-hidden group backdrop-blur-sm">
                                            <div className="absolute top-0 right-0 w-32 h-32 bg-[#10b981]/5 blur-[60px] rounded-full -mr-16 -mt-16 group-hover:bg-[#10b981]/10 transition-colors" />

                                            <div className="relative z-10">
                                                <div className="flex justify-between items-start mb-6">
                                                    <div>
                                                        <h3 className="text-2xl font-black text-white tracking-tighter mb-1">{opponent.name}</h3>
                                                        <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border ${tier.class} bg-white/5 backdrop-blur-md`}>
                                                            <span className="text-xs">{tier.icon}</span>
                                                            <span className="text-[9px] font-black uppercase tracking-widest">{tier.label}</span>
                                                        </div>
                                                    </div>
                                                    <div className="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center opacity-40">
                                                        <LucideZap className="w-5 h-5" />
                                                    </div>
                                                </div>

                                                <div className="mb-8 p-5 rounded-2xl bg-black/40 border border-white/5 flex items-center justify-between">
                                                    <div className="flex flex-col">
                                                        <span className="text-[8px] font-black text-white/20 uppercase tracking-widest mb-1">Last Match</span>
                                                        <span className={`text-sm font-black ${opponent.lastGameResult === 'win' ? 'text-emerald-400' : 'text-white/60'}`}>
                                                            {opponent.lastGameResult === 'win' ? 'Win' : 'Loss'} {opponent.lastGameScore}
                                                        </span>
                                                    </div>
                                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${opponent.lastGameResult === 'win' ? 'bg-emerald-400/10 text-emerald-400' : 'bg-white/5 text-white/20'}`}>
                                                        {opponent.lastGameResult === 'win' ? <LucideTrophy className="w-4 h-4" /> : <LucideTarget className="w-4 h-4" />}
                                                    </div>
                                                </div>

                                                <motion.button
                                                    whileTap={{ scale: 0.98 }}
                                                    onClick={() => addFriendMutation.mutate(opponent.id)}
                                                    className="w-full py-4 rounded-2xl bg-white/5 hover:bg-[#10b981] text-white hover:text-black border border-white/10 hover:border-[#10b981] font-black text-xs flex items-center justify-center gap-2 transition-all shadow-xl"
                                                >
                                                    <LucideUserPlus className="w-4 h-4" />
                                                    라이벌 추가하기
                                                </motion.button>
                                            </div>
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </AnimatePresence>
                    </div>
                </div>
            )}

            {/* My Rivals List */}
            <div className="space-y-8 relative z-10">
                <div className="flex items-center justify-between px-2">
                    <div className="flex items-center gap-3">
                        <LucideUsers className="w-5 h-5 text-[#10b981]" />
                        <h2 className="text-[10px] font-black text-white/30 tracking-[0.3em] uppercase">나의 라이벌</h2>
                    </div>
                    <div className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[9px] font-black text-white/40 uppercase tracking-widest">
                        {friends.length} Members
                    </div>
                </div>

                {friends.length === 0 ? (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="py-24 flex flex-col items-center text-center bg-white/[0.03] border border-white/5 rounded-[3rem] backdrop-blur-sm"
                    >
                        <div className="w-24 h-24 rounded-[2rem] bg-white/[0.03] border border-white/10 flex items-center justify-center mb-8 relative">
                            <LucideUsers className="w-10 h-10 text-white/10" />
                            <div className="absolute inset-0 bg-[#10b981]/5 blur-2xl rounded-full" />
                        </div>
                        <h3 className="text-2xl font-black mb-3 text-white tracking-tighter">아직 라이벌이 없네요</h3>
                        <p className="text-xs text-white/30 font-bold mb-10 leading-relaxed uppercase tracking-widest">Find your rivals and<br />Compete together</p>
                        <Button
                            onClick={() => setIsSearchOpen(true)}
                            className="px-12 h-16 bg-[#10b981] text-black hover:bg-[#10b981]/90 font-black rounded-2xl text-sm shadow-2xl active:scale-95 transition-all"
                        >
                            라이벌 검색하기
                        </Button>
                    </motion.div>
                ) : (
                    <div className="grid grid-cols-1 gap-4">
                        <AnimatePresence>
                            {friends.map((friend, idx) => {
                                const tier = getTier(friend.handi4c || 0, false);
                                return (
                                    <motion.div
                                        key={friend.id}
                                        initial={{ opacity: 0, scale: 0.98 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        transition={{ delay: idx * 0.05 }}
                                    >
                                        <div className="bg-white/[0.03] p-7 rounded-[2.5rem] border border-white/5 hover:border-white/10 transition-all group relative overflow-hidden">
                                            <div className="absolute top-0 right-0 w-32 h-32 bg-[#10b981]/5 blur-[60px] rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />

                                            <div className="flex items-center justify-between relative z-10">
                                                <div className="flex items-center gap-6">
                                                    <div className="relative">
                                                        <div className="w-16 h-16 rounded-[1.5rem] bg-black/20 border border-white/10 flex items-center justify-center text-3xl group-hover:scale-105 transition-transform shadow-inner">
                                                            {tier.icon}
                                                        </div>
                                                        <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-[#0A0A0A] flex items-center justify-center p-0.5 border border-white/5">
                                                            <div className="w-full h-full rounded-full bg-[#10b981] animate-pulse" />
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-3 mb-1.5">
                                                            <h3 className="text-xl font-black text-white tracking-tighter">{friend.name}</h3>
                                                            {friend.h2h ? (
                                                                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/40 border border-white/10 shadow-sm">
                                                                    <span className="text-[11px] font-black text-[#10b981]">{friend.h2h.wins}승</span>
                                                                    <div className="w-0.5 h-2 bg-white/10 rounded-full" />
                                                                    <span className="text-[11px] font-black text-[#ef4444]">{friend.h2h.losses}패</span>
                                                                </div>
                                                            ) : (
                                                                <div className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/5">
                                                                    <span className="text-[10px] font-black text-white/20">전적 없음</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center gap-3">
                                                            <div className={`px-3 py-1 rounded-full border ${tier.class} bg-white/5 text-[9px] font-black uppercase tracking-widest`}>
                                                                {tier.label}
                                                            </div>
                                                            <div className="w-1 h-1 rounded-full bg-white/10" />
                                                            <span className="text-[10px] font-black text-white/30 uppercase tracking-widest">Handi {friend.handi4c}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <motion.button
                                                    whileTap={{ scale: 0.92 }}
                                                    onClick={() => setSelectedFriendId(friend.id)}
                                                    className="w-14 h-14 rounded-2xl bg-white/[0.03] hover:bg-[#10b981]/10 border border-white/10 hover:border-[#10b981]/30 flex items-center justify-center transition-all group/btn"
                                                >
                                                    <LucideTarget className="w-6 h-6 text-white/20 group-hover/btn:text-[#10b981] group-hover:scale-110 transition-all" />
                                                </motion.button>
                                            </div>
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </AnimatePresence>
                    </div>
                )}
            </div>

            {/* Search Overlay Modal (Premium Custom) */}
            <Dialog open={isSearchOpen} onOpenChange={setIsSearchOpen}>
                <DialogContent className="bg-[#0A0A0A]/95 backdrop-blur-xl border border-white/10 text-white max-w-lg w-[95%] rounded-[3rem] p-0 overflow-hidden shadow-[0_0_100px_rgba(0,0,0,0.8)]">
                    <div className="p-10 bg-gradient-to-br from-white/[0.02] to-transparent">
                        <DialogHeader className="mb-8">
                            <div className="flex flex-col">
                                <DialogTitle className="text-4xl font-black tracking-tighter text-white">라이벌 검색</DialogTitle>
                                <DialogDescription className="text-[10px] font-black text-[#10b981]/60 uppercase tracking-[0.2em] mt-1">Smart matching system</DialogDescription>
                            </div>
                        </DialogHeader>

                        <div className="relative group mb-6">
                            <div className="absolute inset-y-0 left-6 flex items-center pointer-events-none">
                                <LucideSearch className="w-6 h-6 text-white/10 group-focus-within:text-[#10b981] transition-colors" />
                            </div>
                            <Input
                                placeholder="닉네임 또는 전화번호 입력..."
                                value={searchKeyword}
                                onChange={(e) => setSearchKeyword(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                className="h-20 pl-16 pr-8 bg-white/[0.03] border border-white/5 focus:border-[#10b981]/50 text-white placeholder:text-white/10 rounded-[2rem] text-xl font-bold transition-all shadow-inner outline-none ring-0 focus-visible:ring-0"
                            />
                        </div>

                        <Button
                            onClick={handleSearch}
                            disabled={!searchKeyword.trim() || isSearching}
                            className={`w-full h-16 bg-[#10b981] text-black hover:bg-[#10b981]/90 font-black rounded-2xl text-lg shadow-2xl transition-all active:scale-[0.98] ${isSearching ? 'opacity-50' : ''}`}
                        >
                            {isSearching ? (
                                <div className="flex items-center gap-3">
                                    <motion.div
                                        animate={{ rotate: 360 }}
                                        transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                                        className="w-6 h-6 border-3 border-black border-t-transparent rounded-full"
                                    />
                                    <span>검색 중...</span>
                                </div>
                            ) : 'Match Me'}
                        </Button>
                    </div>

                    <div className="px-10 pb-10 max-h-[45vh] overflow-y-auto scrollbar-hide space-y-4">
                        {!isSearching && searchResults.length === 0 && searchKeyword && (
                            <div className="py-16 text-center">
                                <p className="text-[11px] font-black text-white/20 uppercase tracking-[0.3em]">해당하는 멤버가 없습니다</p>
                            </div>
                        )}

                        <AnimatePresence>
                            {searchResults.map((result, idx) => {
                                const tier = getTier(result.handi4c || 0, false);
                                return (
                                    <motion.div
                                        key={result.id}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: idx * 0.05 }}
                                    >
                                        <div className="bg-white/[0.03] border border-white/5 rounded-[2rem] p-6 flex items-center justify-between group hover:bg-white/[0.08] transition-all">
                                            <div className="flex items-center gap-5">
                                                <div className="w-14 h-14 rounded-2xl bg-black/20 border border-white/10 flex items-center justify-center text-3xl">
                                                    {tier.icon}
                                                </div>
                                                <div>
                                                    <p className="font-black text-xl text-white tracking-tighter mb-0.5">{result.name}</p>
                                                    <p className={`text-[9px] font-black uppercase tracking-widest ${tier.class}`}>{tier.label} Tier</p>
                                                </div>
                                            </div>

                                            <motion.button
                                                whileTap={{ scale: 0.95 }}
                                                onClick={() => {
                                                    addFriendMutation.mutate(result.id);
                                                    setIsSearchOpen(false);
                                                    setSearchKeyword("");
                                                }}
                                                disabled={result.isFriend || addFriendMutation.isPending}
                                                className={`px-6 py-3 rounded-xl font-black text-xs transition-all shadow-xl ${result.isFriend
                                                    ? 'bg-white/5 text-white/20'
                                                    : 'bg-white text-black active:scale-95'
                                                    }`}
                                            >
                                                {result.isFriend ? '라이벌' : '추가하기'}
                                            </motion.button>
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </AnimatePresence>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Friend Match History Dialog */}
            <Dialog open={!!selectedFriendId} onOpenChange={(open) => !open && setSelectedFriendId(null)}>
                <DialogContent className="bg-[#050505] border-[#222] text-white max-w-lg w-[95%] rounded-3xl p-0 overflow-hidden">
                    <DialogHeader className="p-6 bg-gradient-to-b from-[#0e4d2a]/20 to-transparent border-b border-white/5">
                        <DialogTitle className="text-xl font-black flex items-center gap-2">
                            <LucideSword className="w-5 h-5 text-[#10b981]" />
                            VS {selectedFriend?.name}
                        </DialogTitle>
                        <DialogDescription className="text-white/40 text-[10px] uppercase font-bold tracking-widest mt-1">
                            Head to Head History
                        </DialogDescription>
                    </DialogHeader>

                    <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto scrollbar-hide">
                        {isLoadingVsGames ? (
                            <div className="py-12 flex justify-center">
                                <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }} className="w-8 h-8 border-2 border-[#10b981] border-t-transparent rounded-full" />
                            </div>
                        ) : vsGames && vsGames.length > 0 ? (
                            vsGames.map((game, i) => {
                                const isMeP1 = game.player1Id === me?.id;
                                const myScore = isMeP1 ? game.player1Score : game.player2Score;
                                const friendScore = isMeP1 ? game.player2Score : game.player1Score;

                                const isWin = game.winnerId === me?.id;
                                const isLoss = game.winnerId === selectedFriendId;
                                const resultLabel = isWin ? 'WIN' : (isLoss ? 'LOSE' : 'DRAW');
                                const resultColor = isWin ? 'text-[#10b981]' : (isLoss ? 'text-red-500' : 'text-gray-400');
                                const resultBg = isWin ? 'bg-[#10b981]/20' : (isLoss ? 'bg-red-500/20' : 'bg-white/10');

                                return (
                                    <div key={game.id} className="bg-white/5 border border-white/5 rounded-2xl p-4 flex items-center justify-between">
                                        <div>
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${resultBg} ${resultColor}`}>
                                                    {resultLabel}
                                                </span>
                                                <span className="text-[10px] font-bold text-white/40 flex items-center gap-1">
                                                    <LucideCalendar className="w-3 h-3" />
                                                    {format(new Date(game.playedAt), "yyyy.MM.dd", { locale: ko })}
                                                </span>
                                            </div>
                                            <div className="flex items-baseline gap-1">
                                                <span className="text-sm font-bold text-white/60">{game.gameType === '3c' ? '3구' : '4구'}</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <div className="text-right">
                                                <p className="text-[9px] font-black text-white/30 uppercase">SCORE (ME : YOU)</p>
                                                <p className="text-xl font-black text-white">
                                                    {myScore} : {friendScore}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        ) : (
                            <div className="py-12 text-center text-white/40">
                                <p className="text-xs font-bold">대결 기록이 없습니다.</p>
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            <HiqNavigation />
        </div>
    );
}

const toast = ({ title, description }: { title: string, description: string }) => {
    // This is a simple fallback if useToast isn't used correctly, but we should use the hook
    console.log(title, description);
};
