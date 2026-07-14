import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
    LucideVote,
    LucidePlus,
    LucideClock,
    LucideUser,
    LucideCheckCircle2,
    LucideMoreVertical,
    LucideX,
    LucideShieldCheck,
    LucideUsers,
    LucideChevronRight,
    LucideInfo,
    LucideLoader2,
    LucideChevronDown,
    LucideTrash2,
    LucideSparkles
} from "@/lib/icons";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { CreatePollDialog } from "@/components/hiq/CreatePollDialog";
import { format, formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";

interface CrewPollTabProps {
    crewId: string;
    isAdmin: boolean;
    isMember: boolean;
}

export function CrewPollTab({ crewId, isAdmin, isMember }: CrewPollTabProps) {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [displayLimit, setDisplayLimit] = useState(3);

    const { data: polls, isLoading } = useQuery<any[]>({
        queryKey: [`/api/hiq/crews/${crewId}/polls`],
        enabled: !!crewId,
    });

    const voteMutation = useMutation({
        mutationFn: async ({ pollId, optionId }: { pollId: string; optionId: string }) => {
            return await apiRequest(`/api/hiq/crews/${crewId}/polls/${pollId}/vote`, {
                method: "POST",
                body: JSON.stringify({ optionId })
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: [`/api/hiq/crews/${crewId}/polls`] });
        },
        onError: (err: any) => {
            toast({ title: "투표 실패", description: err.message, variant: "destructive" });
        }
    });

    const deletePollMutation = useMutation({
        mutationFn: async (pollId: string) => {
            return await apiRequest(`/api/hiq/crews/${crewId}/polls/${pollId}`, {
                method: "DELETE"
            });
        },
        onSuccess: () => {
            toast({ title: "투표가 삭제되었습니다." });
            queryClient.invalidateQueries({ queryKey: [`/api/hiq/crews/${crewId}/polls`] });
        },
        onError: (err: any) => {
            toast({ title: "삭제 실패", description: err.message, variant: "destructive" });
        }
    });

    return (
        <div className="space-y-8 pb-20">
            {/* Header / CTA */}
            <div className="px-6 flex items-center justify-between">
                <div>
                    <h2 className="text-[15px] font-semibold text-black/55">크루 투표</h2>
                    <p className="text-xs text-black/40 mt-1 font-medium flex items-center gap-1.5 tabular-nums">
                        <LucideVote className="w-3 h-3" />
                        총 {polls?.length || 0}개의 투표
                    </p>
                </div>
                {isMember && (
                    <Button
                        onClick={() => setIsCreateOpen(true)}
                        className="h-10 px-4 bg-brand hover:bg-brand/90 text-brand-fg font-semibold rounded-xl flex items-center gap-2"
                    >
                        <LucidePlus className="w-4 h-4" />
                        투표 만들기
                    </Button>
                )}
            </div>

            {/* Poll List */}
            <div className="px-6 space-y-4">
                {isLoading ? (
                    <>
                        {Array.from({ length: 3 }).map((_, i) => (
                            <div
                                key={i}
                                className="bg-surface-2 rounded-card overflow-hidden animate-pulse"
                            >
                                <div className="p-6 pb-5 space-y-5">
                                    <div className="space-y-2">
                                        <div className="h-5 w-16 bg-black/[0.04] rounded-full" />
                                        <div className="h-5 w-2/3 bg-black/[0.04] rounded-lg" />
                                    </div>
                                    <div className="space-y-2.5">
                                        <div className="h-14 bg-black/[0.04] rounded-2xl" />
                                        <div className="h-14 bg-black/[0.04] rounded-2xl" />
                                    </div>
                                </div>
                                <div className="px-6 py-4 bg-black/[0.02] border-t border-black/[0.08] flex items-center gap-3">
                                    <div className="w-5 h-5 rounded-full bg-black/[0.04]" />
                                    <div className="h-3 w-24 bg-black/[0.04] rounded-full" />
                                </div>
                            </div>
                        ))}
                    </>
                ) : (!polls || polls.length === 0) ? (
                    <div className="py-24 text-center">
                        <div className="w-14 h-14 rounded-full bg-black/[0.04] flex items-center justify-center mx-auto mb-4">
                            <LucideVote className="w-7 h-7 text-black/40" />
                        </div>
                        <p className="text-[15px] font-medium text-ink-2 mb-1">진행 중인 투표가 없습니다</p>
                        <p className="text-[13px] text-ink-4">멤버들과 새로운 의견을 나눠보세요</p>
                    </div>
                ) : (
                    <>
                        {polls.slice(0, displayLimit).map((poll) => (
                            <PollCard
                                key={poll.id}
                                poll={poll}
                                votingOptionId={
                                    voteMutation.isPending && voteMutation.variables?.pollId === poll.id
                                        ? voteMutation.variables?.optionId
                                        : undefined
                                }
                                onVote={(optionId) => {
                                    if (voteMutation.isPending) return; // block double-submit / vote race
                                    voteMutation.mutate({ pollId: poll.id, optionId });
                                }}
                                onDelete={() => {
                                    if (confirm("정말로 이 투표를 삭제하시겠습니까?")) {
                                        deletePollMutation.mutate(poll.id);
                                    }
                                }}
                                isMember={isMember}
                                isAdmin={isAdmin}
                            />
                        ))}

                        {polls.length > displayLimit && (
                            <Button
                                variant="ghost"
                                onClick={() => setDisplayLimit((d) => d + 10)}
                                className="w-full h-12 bg-black/[0.04] hover:bg-black/[0.06] text-black/55 hover:text-[rgba(0,0,0,0.87)] text-[13px] font-semibold rounded-2xl flex items-center justify-center gap-2 transition-all"
                            >
                                더보기
                                <LucideChevronDown className="w-4 h-4" />
                            </Button>
                        )}
                    </>
                )}
            </div>

            <CreatePollDialog
                open={isCreateOpen}
                onOpenChange={setIsCreateOpen}
                crewId={crewId}
            />
        </div >
    );
}

function PollCard({ poll, onVote, onDelete, isMember, isAdmin, votingOptionId }: {
    poll: any;
    onVote: (id: string) => void;
    onDelete: () => void;
    isMember: boolean;
    isAdmin: boolean;
    votingOptionId?: string;
}) {
    const isClosed = poll.status === 'closed' || (poll.endTime && new Date(poll.endTime) < new Date());
    const totalVotes = poll.totalVotes || 0;
    // Strict, unique leader only — a tie must not light up multiple "winners".
    const maxVoteCount = poll.options.reduce((max: number, o: any) => Math.max(max, o.voteCount || 0), 0);
    const hasUniqueWinner = maxVoteCount > 0
        && poll.options.filter((o: any) => o.voteCount === maxVoteCount).length === 1;

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="group relative bg-surface-2 rounded-card overflow-hidden hover:border-brand/30 transition-all duration-300"
        >
            <div className="p-6 pb-5">
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                    <div className="space-y-1.5 flex-1 pr-4">
                        <div className="flex items-center gap-2 mb-1.5">
                            <Badge className={cn(
                                "h-5 px-2 text-xs font-semibold border-none",
                                isClosed ? "bg-black/[0.06] text-black/55" : "bg-brand/10 text-brand"
                            )}>
                                {isClosed ? "마감됨" : "진행 중"}
                            </Badge>
                            {poll.isAnonymous && (
                                <Badge className="h-5 px-2 bg-brand/10 text-brand text-xs font-semibold border-none">
                                    <LucideShieldCheck className="w-3 h-3 mr-1" /> 익명
                                </Badge>
                            )}
                            {poll.allowMultiple && (
                                <Badge className="h-5 px-2 bg-purple-500/10 text-purple-500 text-xs font-semibold border-none">
                                    복수 선택
                                </Badge>
                            )}
                        </div>
                        <h3 className="text-lg font-semibold text-[rgba(0,0,0,0.87)] leading-tight tracking-tight">{poll.title}</h3>
                        {poll.description && (
                            <p className="text-xs text-black/55 font-medium leading-relaxed mt-2 line-clamp-2">
                                {poll.description}
                            </p>
                        )}
                    </div>
                    {/* Right Side: Time & Delete */}
                    <div className="flex flex-col items-end gap-2">
                        {poll.endTime && !isClosed && (
                            <span className="text-xs font-semibold text-brand bg-brand/10 px-2 py-1 rounded-full tabular-nums">
                                {`${formatDistanceToNow(new Date(poll.endTime), { locale: ko })} 남음`}
                            </span>
                        )}
                        {isAdmin && (
                            <button
                                onClick={onDelete}
                                className="p-1.5 rounded-full hover:bg-red-500/10 text-black/40 hover:text-red-500 transition-colors"
                                title="투표 삭제"
                            >
                                <LucideTrash2 className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                </div>

                {/* Options */}
                <div className="space-y-2.5 mt-5">
                    {poll.options.map((option: any) => {
                        const isMyVote = poll.myVoteIds?.includes(option.id);
                        const progress = totalVotes > 0 ? (option.voteCount / totalVotes) * 100 : 0;
                        const isWinner = hasUniqueWinner && option.voteCount === maxVoteCount;
                        const isOptionVoting = votingOptionId === option.id;

                        return (
                            <button
                                key={option.id}
                                disabled={isClosed || !isMember || isOptionVoting}
                                onClick={() => onVote(option.id)}
                                className={cn(
                                    "relative w-full text-left p-4 rounded-2xl group/opt transition-all duration-300 overflow-hidden",
                                    isMyVote
                                        ? "bg-brand/[0.06] border border-brand/20"
                                        : "bg-black/[0.03] hover:border-black/10"
                                )}
                            >
                                {/* Progress Background */}
                                <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${progress}%` }}
                                    transition={{ duration: 0.8, ease: "easeOut" }}
                                    className={cn(
                                        "absolute inset-y-0 left-0",
                                        isMyVote ? "bg-brand opacity-[0.1]" : "bg-black opacity-[0.05]"
                                    )}
                                />

                                <div className="relative flex items-center justify-between z-10">
                                    <div className="flex items-center gap-3">
                                        <div className={cn(
                                            "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all",
                                            isMyVote
                                                ? "border-brand bg-brand"
                                                : "border-black/20 bg-transparent group-hover/opt:border-black/40"
                                        )}>
                                            {isMyVote && <LucideCheckCircle2 className="w-3.5 h-3.5 text-white" />}
                                        </div>
                                        <span className={cn(
                                            "text-sm font-semibold transition-colors",
                                            isMyVote ? "text-[rgba(0,0,0,0.87)]" : "text-black/60 group-hover/opt:text-[rgba(0,0,0,0.87)]"
                                        )}>
                                            {option.text}
                                        </span>
                                        {isWinner && (
                                            <LucideSparkles className="w-3.5 h-3.5 text-[#cba258] animate-pulse" />
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {isOptionVoting && (
                                            <LucideLoader2 className="w-3.5 h-3.5 text-black/40 animate-spin" />
                                        )}
                                        <span className={cn(
                                            "text-xs font-semibold tabular-nums",
                                            isMyVote ? "text-brand" : "text-black/40"
                                        )}>
                                            {option.voteCount}
                                        </span>
                                        <span className="text-xs font-medium text-black/40 tabular-nums">({Math.round(progress)}%)</span>
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-black/[0.02] border-t border-black/[0.08] flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Avatar className="w-5 h-5 ">
                        <AvatarImage src={poll.author?.profileImageUrl} />
                        <AvatarFallback className="bg-black/[0.06] text-[rgba(0,0,0,0.87)] text-xs font-semibold">
                            {poll.author?.name?.[0]}
                        </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col">
                        <span className="text-xs font-medium text-black/55">{poll.author?.name}</span>
                        <span className="text-xs text-black/40 font-medium tabular-nums">
                            {format(new Date(poll.createdAt), 'yyyy.MM.dd HH:mm', { locale: ko })}
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-1.5 text-black/40">
                    <LucideUsers className="w-3 h-3" />
                    <span className="text-xs font-semibold tabular-nums">{totalVotes}명 참여</span>
                </div>
            </div>
        </motion.div>
    );
}
