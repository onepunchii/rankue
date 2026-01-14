import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Crown, MessageCircle, ChevronLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { BalanceGame } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/contexts/AuthContext";

// Mock data for detailed stats since we don't have backend for this yet
// Stat Type Definition
type StatItem = { label: string, a: number, b: number };
type GameStats = {
    gender: StatItem[];
    age: StatItem[];
    politics: StatItem[];
};

// Initial Empty Stats
const INITIAL_STATS: GameStats = {
    gender: [],
    age: [],
    politics: []
};

type Comment = {
    id: number;
    content: string;
    createdAt: string;
    userId: string;
    nickname: string;
    choice: 'A' | 'B' | null;
};

function timeAgo(dateString: string) {
    const date = new Date(dateString);
    const now = new Date();
    const diff = (now.getTime() - date.getTime()) / 1000;
    if (diff < 60) return "방금 전";
    if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
    return `${Math.floor(diff / 86400)}일 전`;
}

export default function BalanceGameArchive() {
    const [activeTab, setActiveTab] = useState<"UNVOTED" | "HISTORY">("UNVOTED");
    const [selectedGame, setSelectedGame] = useState<BalanceGame | null>(null);
    const [commentInput, setCommentInput] = useState("");

    // Auth & Votes
    const { user } = useAuth();

    // Actually fetching games
    const { data: balanceGames = [] } = useQuery<BalanceGame[]>({
        queryKey: ['/api/balance-games'],
    });

    const { data: myVotes = [], refetch: refetchMyVotes } = useQuery<any[]>({
        queryKey: ['/api/balance-games/votes/me'],
        enabled: !!user && !user.isGuest
    });

    const voteMap = new Map(myVotes.map((v: any) => [v.gameId, v.choice]));

    const unvotedGames = balanceGames.filter(g => !voteMap.has(g.id));
    const historyGames = balanceGames.filter(g => voteMap.has(g.id));

    const displayGames = activeTab === "UNVOTED" ? unvotedGames : historyGames;

    const handleVote = async (gameId: number, choice: 'A' | 'B') => {
        try {
            await apiRequest(`/api/balance-games/${gameId}/vote`, {
                method: "POST",
                body: { choice }
            });
            // Update UI
            refetchMyVotes();
            queryClient.invalidateQueries({ queryKey: ['/api/balance-games'] });
        } catch (e) {
            console.error("Vote failed", e);
        }
    };

    // Fetch Stats for Selected Game
    const { data: gameStats = INITIAL_STATS } = useQuery<GameStats>({
        queryKey: [`/api/balance-games/${selectedGame?.id}/stats`],
        enabled: !!selectedGame
    });

    // Fetch Comments
    const { data: comments = [], refetch: refetchComments } = useQuery<Comment[]>({
        queryKey: [`/api/balance-games/${selectedGame?.id}/comments`],
        enabled: !!selectedGame
    });

    // Post Comment Mutation
    const commentMutation = useMutation({
        mutationFn: async (content: string) => {
            await apiRequest(`/api/balance-games/${selectedGame?.id}/comments`, {
                method: "POST",
                body: { content }
            });
        },
        onSuccess: () => {
            setCommentInput("");
            refetchComments();
        }
    });

    const handleCommentSubmit = (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!commentInput.trim() || !user) return;
        commentMutation.mutate(commentInput);
    };

    // Calculate Percentages for Selected Game Modal
    const selCountA = selectedGame?.countA || 0;
    const selCountB = selectedGame?.countB || 0;
    const selTotal = selCountA + selCountB;
    const selPercentA = selTotal === 0 ? 50 : Math.round((selCountA / selTotal) * 100);
    const selPercentB = 100 - selPercentA;

    return (
        <div className="min-h-screen pb-20 pt-[140px]">
            {/* Header */}
            <div className="fixed top-0 left-0 right-0 z-50 bg-[#09090B]/90 backdrop-blur-xl border-b border-white/5">
                <div className="max-w-md mx-auto w-full px-4 pt-4 pb-4">
                    {/* Title */}
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <Link href="/home">
                                <Button variant="ghost" size="icon" className="-ml-2 text-white/50 hover:text-white hover:bg-white/10 w-8 h-8 rounded-full">
                                    <ChevronLeft className="w-5 h-5" />
                                </Button>
                            </Link>
                            <h1 className="text-xl font-extrabold text-white flex items-center gap-2 tracking-tight">
                                <span className="text-cyan-400 drop-shadow-[0_0_10px_rgba(34,211,238,0.5)] text-2xl">🧪</span>
                                밸런스 게임 연구소
                            </h1>
                        </div>
                    </div>

                    {/* Sliding Tabs */}
                    <div className="relative flex w-full bg-gray-900/60 rounded-full p-1 border border-gray-800">
                        {/* Active Background Slide */}
                        <motion.div
                            className="absolute inset-y-1 bg-gray-800 rounded-full shadow-inner"
                            initial={false}
                            animate={{
                                left: activeTab === "UNVOTED" ? '4px' : '50%',
                                right: activeTab === "UNVOTED" ? '50%' : '4px',
                            }}
                            transition={{ type: "spring", stiffness: 300, damping: 30 }}
                        />

                        {/* Buttons */}
                        <button
                            onClick={() => setActiveTab("UNVOTED")}
                            className={cn(
                                "relative z-10 flex-1 py-2 text-sm font-bold transition-all duration-300 flex items-center justify-center gap-1.5",
                                activeTab === "UNVOTED" ? "text-orange-400 drop-shadow-[0_0_8px_rgba(251,146,60,0.5)]" : "text-gray-500 hover:text-gray-300"
                            )}
                        >
                            <span>🔥</span> 진행 중인 매치
                        </button>
                        <button
                            onClick={() => setActiveTab("HISTORY")}
                            className={cn(
                                "relative z-10 flex-1 py-2 text-sm font-bold transition-all duration-300 flex items-center justify-center gap-1.5",
                                activeTab === "HISTORY" ? "text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]" : "text-gray-500 hover:text-gray-300"
                            )}
                        >
                            <span>✅</span> 나의 참여 기록
                        </button>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="px-4 py-6 space-y-4 max-w-md mx-auto w-full">
                {displayGames.map((game) => (
                    <ArchiveCard
                        key={game.id}
                        game={game}
                        type={activeTab}
                        userVote={voteMap.get(game.id) as 'A' | 'B' | undefined}
                        onVote={(choice) => handleVote(game.id, choice)}
                        onClick={() => activeTab === "HISTORY" && setSelectedGame(game)}
                    />
                ))}
            </div>

            {/* Detail Modal (Bottom Sheet style) */}
            <Dialog open={!!selectedGame} onOpenChange={(open) => !open && setSelectedGame(null)}>
                <DialogContent className="max-w-md w-full rounded-t-[2rem] rounded-b-none border-t border-white/10 bg-[#0F0F1A]/95 backdrop-blur-xl p-0 bottom-0 top-auto translate-y-0 data-[state=closed]:translate-y-[100%] data-[state=closed]:slide-out-to-bottom-100 data-[state=open]:slide-in-from-bottom-100 duration-300 fixed left-1/2 -translate-x-1/2 border-x-0 border-b-0 outline-none shadow-2xl">
                    <div className="h-[80vh] flex flex-col">
                        <div className="mx-auto w-12 h-1.5 bg-white/20 rounded-full my-3" />

                        <DialogHeader className="px-6 pb-4 border-b border-white/5 text-left">
                            <span className="text-[10px] font-black text-violet-400 uppercase tracking-widest mb-1">{selectedGame?.category} ANALYSIS</span>
                            <DialogTitle className="text-xl font-bold text-white leading-tight">
                                {selectedGame?.title}
                            </DialogTitle>
                        </DialogHeader>

                        <ScrollArea className="flex-1 px-6 py-6">
                            <div className="space-y-8 pb-10">
                                {/* 1. Result Summary */}
                                <div className="flex items-center justify-between gap-4">
                                    <div className="flex-1 bg-gradient-to-br from-violet-500/10 to-violet-900/10 rounded-2xl p-4 border border-violet-500/20 text-center relative overflow-hidden group">
                                        <div className="text-4xl font-black text-violet-300 relative z-10 drop-shadow-lg">{selPercentA}%</div>
                                        <div className="text-xs font-bold text-violet-400/60 uppercase relative z-10 mt-1">Option A</div>
                                        <div className="absolute inset-0 bg-violet-500/5 blur-xl group-hover:bg-violet-500/10 transition-colors" />
                                    </div>
                                    <div className="font-black italic text-transparent bg-clip-text bg-gradient-to-b from-white to-white/20 text-xl">VS</div>
                                    <div className="flex-1 bg-gradient-to-br from-emerald-500/10 to-emerald-900/10 rounded-2xl p-4 border border-emerald-500/20 text-center relative overflow-hidden group">
                                        <div className="text-4xl font-black text-emerald-300 relative z-10 drop-shadow-lg">{selPercentB}%</div>
                                        <div className="text-xs font-bold text-emerald-400/60 uppercase relative z-10 mt-1">Option B</div>
                                        <div className="absolute inset-0 bg-emerald-500/5 blur-xl group-hover:bg-emerald-500/10 transition-colors" />
                                    </div>
                                </div>

                                {/* 2. Stats Graphs */}
                                <div className="space-y-6">
                                    <StatBlock title="📢 성별 분석" data={gameStats.gender} colorA="bg-violet-500" colorB="bg-emerald-500" />
                                    <StatBlock title="🎂 연령별 분석" data={gameStats.age} colorA="bg-violet-500" colorB="bg-emerald-500" />
                                    <StatBlock title="⚖️ 정치 성향별 선택 (POLLI EXCLUSIVE)" data={gameStats.politics} colorA="bg-violet-500" colorB="bg-emerald-500" />
                                </div>

                                {/* 3. Comments */}
                                <div>
                                    <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                                        💬 의견 대결
                                        <Badge variant="secondary" className="text-[10px] h-5 px-1.5 bg-white/10 text-white/60 border border-white/5">{comments.length}</Badge>
                                    </h3>
                                    <div className="space-y-4">
                                        {comments.map((comment) => (
                                            <div key={comment.id} className="flex gap-3">
                                                <div className={cn(
                                                    "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border shrink-0",
                                                    comment.choice === 'A' ? "bg-violet-500/10 border-violet-500/30 text-violet-300" : (comment.choice === 'B' ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300" : "bg-gray-700/50 border-gray-600 text-gray-400")
                                                )}>
                                                    {comment.choice || "?"}
                                                </div>
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="text-sm font-bold text-gray-200">{comment.nickname}</span>
                                                        <span className="text-[10px] text-gray-500">{timeAgo(comment.createdAt)}</span>
                                                    </div>
                                                    <p className="text-sm text-gray-400 leading-relaxed">{comment.content}</p>
                                                </div>
                                            </div>
                                        ))}
                                        {comments.length === 0 && (
                                            <div className="text-center py-10 text-gray-500 text-sm">
                                                아직 의견이 없습니다. 첫 번째 의견을 남겨보세요!
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </ScrollArea>

                        {/* Input */}
                        <div className="p-4 border-t border-white/10 bg-[#0F0F1A]/80 backdrop-blur-md pb-8 md:pb-4">
                            <form onSubmit={handleCommentSubmit} className="flex gap-2 relative">
                                <Input
                                    value={commentInput}
                                    onChange={(e) => setCommentInput(e.target.value)}
                                    placeholder={user ? "의견을 남겨주세요..." : "로그인이 필요합니다."}
                                    disabled={!user || commentMutation.isPending}
                                    className="bg-white/5 border-white/10 text-white pl-4 pr-12 rounded-xl focus:border-violet-500/50 transition-colors"
                                />
                                <Button
                                    type="submit"
                                    disabled={!user || !commentInput.trim() || commentMutation.isPending}
                                    size="icon"
                                    className="absolute right-1 top-1 h-8 w-8 bg-violet-600 hover:bg-violet-500 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed">
                                    <MessageCircle className="w-4 h-4" />
                                </Button>
                            </form>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}

// Components
// Components
function ArchiveCard({
    game,
    type,
    userVote,
    onVote,
    onClick
}: {
    game: BalanceGame,
    type: "UNVOTED" | "HISTORY",
    userVote?: "A" | "B",
    onVote?: (choice: "A" | "B") => void,
    onClick?: () => void
}) {
    const isHistory = type === "HISTORY";

    // Calculate Percentages
    const countA = game.countA || 0;
    const countB = game.countB || 0;
    const total = countA + countB;
    const percentA = total === 0 ? 50 : Math.round((countA / total) * 100);
    const percentB = 100 - percentA;

    const myPick = userVote;
    const winner: "A" | "B" | null = total === 0 ? null : (countA > countB ? "A" : (countB > countA ? "B" : null));

    return (
        <div onClick={onClick} className={cn(
            "relative group rounded-[24px] p-6 border transition-all duration-300 overflow-hidden",
            // Dark Glass Capsule
            "bg-[#0F0F1A]/80 backdrop-blur-md border-white/5 hover:border-white/10",
            !isHistory && "cursor-pointer hover:bg-[#0F0F1A]/90 hover:shadow-xl hover:shadow-purple-500/5 active:scale-[0.99]"
        )}>
            {/* Header: Category & Badge */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <span className="text-[10px] px-2 py-0.5 rounded-lg font-black uppercase tracking-widest border transition-colors bg-white/5 text-white/50 border-white/10 group-hover:bg-white/10">
                        {game.category}
                    </span>
                    {!isHistory && (
                        <span className="text-[10px] px-2 py-0.5 rounded-lg font-black uppercase tracking-widest bg-orange-500/10 text-orange-400 border border-orange-500/20">
                            NEW
                        </span>
                    )}
                </div>
                {isHistory && (
                    <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-white/5 border border-white/10">
                        <span className="text-[10px] font-bold text-white/40">상세분석</span>
                        <ChevronLeft className="w-3 h-3 text-white/40 rotate-180" />
                    </div>
                )}
            </div>

            {/* Title */}
            <h3 className="font-black text-xl text-white tracking-tighter leading-tight mb-6 line-clamp-2 group-hover:text-cyan-50 transition-colors">
                {game.title}
            </h3>

            {/* Content: Options (Neon Plates) */}
            <div className="space-y-3 relative">
                {/* Option A (Violet) */}
                <div
                    onClick={(e) => {
                        if (!isHistory && onVote) {
                            e.stopPropagation();
                            onVote('A');
                        }
                    }}
                    className={cn(
                        "relative h-14 rounded-2xl flex items-center px-4 overflow-hidden border transition-all duration-300 group/optA",
                        "bg-gray-900/40 border-violet-500/30",
                        !isHistory && "cursor-pointer hover:bg-violet-900/20 hover:border-violet-500/60 hover:shadow-[0_0_15px_rgba(139,92,246,0.15)]",
                        isHistory && myPick === "A" && "bg-violet-900/20 border-violet-500/80 shadow-[0_0_10px_rgba(139,92,246,0.2)]",
                        isHistory && winner && winner !== "A" && "opacity-60 grayscale-[0.3]"
                    )}>
                    {isHistory && <div className="absolute inset-y-0 left-0 bg-violet-500/10" style={{ width: `${percentA}%` }} />}

                    <div className="relative z-10 flex items-center justify-between w-full">
                        <div className="flex items-center gap-3">
                            <span className="text-violet-400 font-extrabold text-lg italic mr-1 filter drop-shadow-[0_0_5px_rgba(139,92,246,0.5)]">A</span>
                            <span className="text-sm font-bold text-gray-200 group-hover/optA:text-white transition-colors">
                                {(game.optionA as any).text}
                            </span>
                        </div>
                        {isHistory && <span className="font-black text-violet-300 drop-shadow-md">{percentA}%</span>}
                    </div>
                </div>

                {/* Option B (Cyan) */}
                <div
                    onClick={(e) => {
                        if (!isHistory && onVote) {
                            e.stopPropagation();
                            onVote('B');
                        }
                    }}
                    className={cn(
                        "relative h-14 rounded-2xl flex items-center px-4 overflow-hidden border transition-all duration-300 group/optB",
                        "bg-gray-900/40 border-cyan-500/30",
                        !isHistory && "cursor-pointer hover:bg-cyan-900/20 hover:border-cyan-500/60 hover:shadow-[0_0_15px_rgba(34,211,238,0.15)]",
                        isHistory && myPick === "B" && "bg-cyan-900/20 border-cyan-500/80 shadow-[0_0_10px_rgba(34,211,238,0.2)]",
                        isHistory && winner && winner !== "B" && "opacity-60 grayscale-[0.3]"
                    )}>
                    {isHistory && <div className="absolute inset-y-0 left-0 bg-cyan-500/10" style={{ width: `${percentB}%` }} />}

                    <div className="relative z-10 flex items-center justify-between w-full">
                        <div className="flex items-center gap-3">
                            <span className="text-cyan-400 font-extrabold text-lg italic mr-1 filter drop-shadow-[0_0_5px_rgba(34,211,238,0.5)]">B</span>
                            <span className="text-sm font-bold text-gray-200 group-hover/optB:text-white transition-colors">
                                {(game.optionB as any).text}
                            </span>
                        </div>
                        {isHistory && <span className="font-black text-cyan-300 drop-shadow-md">{percentB}%</span>}
                    </div>
                </div>
            </div>

            {/* Footer / CTA */}
            {!isHistory && (
                <div className="mt-4 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-[10px] text-white/30 font-medium">
                        <span>342명 참여중</span>
                        <span>•</span>
                        <span>D-5</span>
                    </div>
                    <span className="text-[10px] text-white/40 font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                        터치하여 투표하기 →
                    </span>
                </div>
            )}
        </div>
    )
}

function StatBlock({ title, data, colorA, colorB }: { title: string, data: { label: string, a: number, b: number }[], colorA: string, colorB: string }) {
    return (
        <div className="space-y-3">
            <h4 className="text-xs font-bold text-white/50 uppercase tracking-wider">{title}</h4>
            <div className="space-y-2.5">
                {data.map((item, idx) => (
                    <div key={idx} className="flex items-center text-xs">
                        <div className="w-10 text-gray-400 font-medium shrink-0">{item.label}</div>
                        <div className="flex-1 h-2.5 bg-white/5 rounded-full overflow-hidden flex ring-1 ring-white/5">
                            <div style={{ width: `${item.a}%` }} className={cn("h-full transition-all duration-1000", colorA)} />
                            <div style={{ width: `${item.b}%` }} className={cn("h-full transition-all duration-1000", colorB)} />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
