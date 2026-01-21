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
import { HiqMember } from "@shared/schema";
import { HiqNavigation } from "@/components/hiq/HiqNavigation";
import { format } from "date-fns";
import { ko } from "date-fns/locale";

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

    // Fetch friends list
    const { data: friends = [] } = useQuery<HiqMember[]>({
        queryKey: ["/api/hiq/friends"],
    });

    // Fetch recent opponents
    const { data: recentOpponents = [] } = useQuery<RecentOpponent[]>({
        queryKey: ["/api/hiq/friends/recent-opponents"],
    });

    // Search users
    const { data: searchResults = [], refetch: performSearch, isLoading: isSearching } = useQuery<SearchResult[]>({
        queryKey: [`/api/hiq/friends/search?keyword=${searchKeyword}`],
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
        }
    });

    const handleSearch = () => {
        if (searchKeyword.trim()) {
            performSearch();
        }
    };

    const getTier = (handi: number, is3c: boolean) => {
        if (is3c) {
            if (handi >= 45) return { label: "MASTER", color: "#ef4444", icon: "🔥", glow: "rgba(239, 68, 68, 0.5)" };
            if (handi >= 35) return { label: "DIAMOND", color: "#B9F2FF", icon: "💠", glow: "rgba(185, 242, 255, 0.5)" };
            if (handi >= 28) return { label: "PLATINUM", color: "#00FFD1", icon: "💎", glow: "rgba(0, 255, 209, 0.5)" };
            if (handi >= 22) return { label: "GOLD", color: "#FFD700", icon: "🥇", glow: "rgba(255, 215, 0, 0.5)" };
            if (handi >= 16) return { label: "SILVER", color: "#E0E0E0", icon: "🥈", glow: "rgba(224, 224, 224, 0.5)" };
            return { label: "BRONZE", color: "#CD7F32", icon: "🥉", glow: "rgba(205, 127, 50, 0.5)" };
        } else {
            if (handi >= 700) return { label: "MASTER", color: "#ef4444", icon: "🔥", glow: "rgba(239, 68, 68, 0.5)" };
            if (handi >= 400) return { label: "DIAMOND", color: "#B9F2FF", icon: "💠", glow: "rgba(185, 242, 255, 0.5)" };
            if (handi >= 250) return { label: "PLATINUM", color: "#00FFD1", icon: "💎", glow: "rgba(0, 255, 209, 0.5)" };
            if (handi >= 150) return { label: "GOLD", color: "#FFD700", icon: "🥇", glow: "rgba(255, 215, 0, 0.5)" };
            if (handi >= 80) return { label: "SILVER", color: "#E0E0E0", icon: "🥈", glow: "rgba(224, 224, 224, 0.5)" };
            return { label: "BRONZE", color: "#CD7F32", icon: "🥉", glow: "rgba(205, 127, 50, 0.5)" };
        }
    };

    return (
        <div className="min-h-screen bg-[#0a0a0a] text-white pb-24 px-4">
            {/* Header */}
            <div className="flex items-center justify-between py-6 mb-6">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setLocation("/menu")}
                        className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-all"
                    >
                        <LucideChevronLeft className="w-5 h-5" />
                    </button>
                    <div>
                        <h1 className="text-2xl font-black flex items-center gap-2">
                            <LucideSword className="w-6 h-6 text-[#ffd700]" />
                            나의 라이벌
                        </h1>
                        <p className="text-xs text-white/40 font-bold uppercase tracking-wider">Battle Arena</p>
                    </div>
                </div>
                <Button
                    onClick={() => setIsSearchOpen(true)}
                    className="h-12 px-6 bg-[#ffd700] text-black hover:bg-[#ffea00] font-black rounded-2xl flex items-center gap-2"
                >
                    <LucideUserPlus className="w-5 h-5" />
                    라이벌 추가
                </Button>
            </div>

            {/* Recent Opponents Section */}
            {recentOpponents.length > 0 && (
                <div className="mb-8">
                    <div className="flex items-center gap-2 mb-4">
                        <LucideZap className="w-5 h-5 text-[#ffd700]" />
                        <h2 className="text-lg font-black">방금 그 사람</h2>
                        <span className="text-xs text-white/40 font-bold">최근 대결 상대</span>
                    </div>
                    <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-hide">
                        <AnimatePresence>
                            {recentOpponents.map((opponent, idx) => {
                                const tier = getTier(opponent.handi4c || 0, false);
                                return (
                                    <motion.div
                                        key={opponent.id}
                                        initial={{ opacity: 0, x: 20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: idx * 0.05 }}
                                        className="flex-shrink-0"
                                    >
                                        <Card
                                            className="w-64 rounded-3xl overflow-hidden"
                                            style={{
                                                background: 'linear-gradient(135deg, #111111 0%, #0a1f13 100%)',
                                                borderWidth: '1px',
                                                borderStyle: 'solid',
                                                borderColor: tier.color,
                                                boxShadow: `0 0 20px ${tier.glow}, 0 10px 30px rgba(0,0,0,0.6)`,
                                                transition: 'all 0.3s ease'
                                            }}
                                        >
                                            <CardContent className="p-5">
                                                <div className="flex items-start justify-between mb-4">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-3xl">{tier.icon}</span>
                                                        <div>
                                                            <p className="font-black text-lg">{opponent.name}</p>
                                                            <p
                                                                className="text-[9px] font-bold uppercase tracking-wider"
                                                                style={{
                                                                    color: tier.color,
                                                                    textShadow: `0 0 10px ${tier.glow}`
                                                                }}
                                                            >
                                                                {tier.label}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className={`mb-3 px-3 py-2 rounded-xl text-center font-black ${opponent.lastGameResult === 'win'
                                                    ? 'bg-[#0e4d2a] text-[#ffd700]'
                                                    : opponent.lastGameResult === 'loss'
                                                        ? 'bg-red-900/20 text-red-400'
                                                        : 'bg-white/5 text-white/60'
                                                    }`}>
                                                    {opponent.lastGameResult === 'win' && '✨ '}
                                                    {opponent.lastGameScore}
                                                    {opponent.lastGameResult === 'win' ? ' 승리' : opponent.lastGameResult === 'loss' ? ' 패배' : ' 무승부'}
                                                </div>
                                                <Button
                                                    onClick={() => addFriendMutation.mutate(opponent.id)}
                                                    disabled={addFriendMutation.isPending}
                                                    className="w-full h-10 bg-white/10 hover:bg-[#ffd700] hover:text-black font-black text-sm rounded-xl transition-all"
                                                >
                                                    <LucideUserPlus className="w-4 h-4 mr-2" />
                                                    라이벌 추가
                                                </Button>
                                            </CardContent>
                                        </Card>
                                    </motion.div>
                                );
                            })}
                        </AnimatePresence>
                    </div>
                </div>
            )}

            {/* Friends List */}
            <div>
                <div className="flex items-center gap-2 mb-4">
                    <LucideShield className="w-5 h-5 text-[#10b981]" />
                    <h2 className="text-lg font-black">나의 라이벌</h2>
                    <span className="px-2 py-0.5 bg-[#10b981]/20 text-[#10b981] text-xs font-black rounded-md">
                        {friends.length}명
                    </span>
                </div>

                {friends.length === 0 ? (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="py-20 text-center"
                    >
                        <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-6 border border-white/10">
                            <LucideUsers className="w-10 h-10 text-white/20" />
                        </div>
                        <p className="text-white font-black text-xl mb-2">아직 라이벌이 없습니다</p>
                        <p className="text-gray-500 text-sm font-medium mb-6">
                            경쟁할 상대를 추가하고<br />당신의 실력을 증명하세요!
                        </p>
                        <Button
                            onClick={() => setIsSearchOpen(true)}
                            className="h-14 px-8 bg-[#ffd700] text-black hover:bg-[#ffea00] font-black rounded-2xl text-base"
                        >
                            <LucideUserPlus className="w-5 h-5 mr-2" />
                            첫 라이벌 추가하기
                        </Button>
                    </motion.div>
                ) : (
                    <div className="space-y-3">
                        <AnimatePresence>
                            {friends.map((friend, idx) => {
                                const tier = getTier(friend.handi4c || 0, false);
                                return (
                                    <motion.div
                                        key={friend.id}
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, x: -20 }}
                                        transition={{ delay: idx * 0.03 }}
                                    >
                                        <Card
                                            className="rounded-3xl overflow-hidden relative hover:scale-[1.02] transition-all duration-300"
                                            style={{
                                                background: 'linear-gradient(135deg, #111111 0%, #0a1f13 100%)',
                                                borderWidth: '1px',
                                                borderStyle: 'solid',
                                                borderColor: tier.color,
                                                boxShadow: `0 0 25px ${tier.glow}, 0 15px 40px rgba(0,0,0,0.7)`
                                            }}
                                        >
                                            <CardContent className="p-6">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-4">
                                                        <span className="text-4xl">{tier.icon}</span>
                                                        <div>
                                                            <p className="font-black text-xl mb-1">{friend.name}</p>
                                                            <p
                                                                className="text-xs font-bold uppercase tracking-wider"
                                                                style={{
                                                                    color: tier.color,
                                                                    textShadow: `0 0 15px ${tier.glow}`
                                                                }}
                                                            >
                                                                {tier.label}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="text-xs text-white/40 font-bold uppercase mb-1">4구</p>
                                                        <p
                                                            className="text-3xl font-black"
                                                            style={{
                                                                color: tier.color,
                                                                textShadow: `0 0 20px ${tier.glow}`
                                                            }}
                                                        >
                                                            {friend.handi4c || 0}
                                                        </p>
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    </motion.div>
                                );
                            })}
                        </AnimatePresence>
                    </div>
                )}
            </div>

            {/* Search Modal */}
            <Dialog open={isSearchOpen} onOpenChange={setIsSearchOpen}>
                <DialogContent className="bg-[#0a0a0a] border-[#222] text-white max-w-lg w-[95%] rounded-3xl p-0 overflow-hidden">
                    <DialogHeader className="p-6 bg-gradient-to-b from-[#0e4d2a]/20 to-transparent border-b border-white/5">
                        <DialogTitle className="text-2xl font-black flex items-center gap-2">
                            <LucideSearch className="w-6 h-6 text-[#ffd700]" />
                            라이벌 찾기
                        </DialogTitle>
                        <DialogDescription className="text-white/40 text-xs uppercase font-bold tracking-widest mt-1">
                            Smart Search System
                        </DialogDescription>
                    </DialogHeader>

                    <div className="p-6">
                        {/* Search Input */}
                        <div className="mb-6">
                            <Input
                                placeholder="닉네임, ID, 또는 전화번호(-없이) 입력..."
                                value={searchKeyword}
                                onChange={(e) => setSearchKeyword(e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                                className="h-14 bg-white/5 border-white/10 text-white placeholder:text-white/30 rounded-2xl text-base font-bold px-4"
                            />
                            <Button
                                onClick={handleSearch}
                                disabled={!searchKeyword.trim() || isSearching}
                                className="w-full h-12 mt-3 bg-[#ffd700] text-black hover:bg-[#ffea00] font-black rounded-xl"
                            >
                                <LucideSearch className="w-5 h-5 mr-2" />
                                검색하기
                            </Button>
                        </div>

                        {/* Search Results */}
                        <div className="space-y-3 max-h-[400px] overflow-y-auto">
                            {isSearching && (
                                <div className="py-12 text-center">
                                    <motion.div
                                        animate={{ rotate: 360 }}
                                        transition={{ repeat: Infinity, duration: 1 }}
                                        className="w-8 h-8 border-2 border-[#ffd700] border-t-transparent rounded-full mx-auto"
                                    />
                                </div>
                            )}

                            {!isSearching && searchResults.length === 0 && searchKeyword && (
                                <div className="py-12 text-center">
                                    <p className="text-white/40 font-bold">검색 결과가 없습니다</p>
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
                                            <Card className="bg-[#151515] border-[#222] rounded-2xl">
                                                <CardContent className="p-4">
                                                    <div className="flex items-center justify-between mb-3">
                                                        <div className="flex items-center gap-3">
                                                            <span className="text-2xl">{tier.icon}</span>
                                                            <div>
                                                                <p className="font-black text-base">{result.name}</p>
                                                                <p className="text-[9px] font-bold uppercase tracking-wider" style={{ color: tier.color }}>
                                                                    {tier.label}
                                                                </p>
                                                            </div>
                                                        </div>
                                                        <p className="text-white/40 text-xs font-mono">@{result.id.slice(0, 8)}</p>
                                                    </div>

                                                    {result.hasPlayedTogether && (
                                                        <div className="mb-3 px-3 py-1.5 bg-[#10b981]/10 border border-[#10b981]/30 rounded-lg flex items-center gap-2">
                                                            <LucideTarget className="w-3 h-3 text-[#10b981]" />
                                                            <span className="text-[10px] font-black text-[#10b981] uppercase">함께 플레이한 적이 있습니다</span>
                                                        </div>
                                                    )}

                                                    <Button
                                                        onClick={() => {
                                                            addFriendMutation.mutate(result.id);
                                                            setIsSearchOpen(false);
                                                            setSearchKeyword("");
                                                        }}
                                                        disabled={result.isFriend || addFriendMutation.isPending}
                                                        className={`w-full h-10 font-black rounded-xl ${result.isFriend
                                                            ? 'bg-white/5 text-white/40 cursor-not-allowed'
                                                            : 'bg-[#ffd700] text-black hover:bg-[#ffea00]'
                                                            }`}
                                                    >
                                                        {result.isFriend ? (
                                                            <>
                                                                <LucideShield className="w-4 h-4 mr-2" />
                                                                이미 라이벌입니다
                                                            </>
                                                        ) : (
                                                            <>
                                                                <LucideUserPlus className="w-4 h-4 mr-2" />
                                                                라이벌 추가하기 🚀
                                                            </>
                                                        )}
                                                    </Button>
                                                </CardContent>
                                            </Card>
                                        </motion.div>
                                    );
                                })}
                            </AnimatePresence>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            <HiqNavigation />
        </div>
    );
}
