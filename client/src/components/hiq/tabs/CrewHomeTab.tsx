import { useState, memo, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    LucideFlag, LucideTent, LucideCalendar, LucideMapPin, LucideVote, LucideChevronRight, LucidePlus
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { HiqCrew, HiqStore, HiqMember } from "@shared/schema";
import { ClubActivityList } from "@/components/hiq/view/ClubActivityList";
import { CrewMemberList } from "@/components/hiq/CrewMemberList";
import { useQuery } from "@tanstack/react-query";
import { Progress } from "@/components/ui/progress";

// Tailwind JIT 호환성을 위한 색상 매핑
const COLOR_VARIANTS: Record<string, { bg: string, border: string, text: string }> = {
    emerald: { bg: "bg-brand/5", border: "border-brand/10", text: "text-brand" },
    blue: { bg: "bg-blue-500/5", border: "border-blue-500/10", text: "text-blue-500" },
    pink: { bg: "bg-pink-500/5", border: "border-pink-500/10", text: "text-pink-500" },
};

const StatCard = ({ title, subTitle, children }: { title: string, subTitle?: string, children: React.ReactNode }) => {
    return (
        <div className="rounded-2xl p-5 flex flex-col items-center justify-center text-center">
            <div className="flex flex-col items-center gap-1.5 mb-2">
                <span className="text-white/55 text-[12px] font-medium">{title}</span>
            </div>
            <div>
                {children}
            </div>
            {subTitle && (
                <span className="text-white/45 text-[12px] font-medium mt-2">{subTitle}</span>
            )}
        </div>
    );
};

interface CrewHomeTabProps {
    crew: HiqCrew;
    baseStore: HiqStore | null;
    members: any[]; // Extended member data with profile info
    isMember: boolean;
    isPending: boolean;
    isNotMember: boolean;
    isAdmin: boolean;
    me: any;
    onJoin: () => void;
    onCreateActivity: () => void;
    onCreatePoll: () => void;
    onShareToChat: (msg: string) => void;
    onPollClick: () => void;
    sportTab: 'BILLIARDS' | 'GOLF';
    setSportTab: (tab: 'BILLIARDS' | 'GOLF') => void;
}

export const CrewHomeTab = memo(({
    crew, baseStore, members, isMember, isPending, isNotMember, isAdmin, me, onJoin, onCreateActivity, onCreatePoll, onShareToChat,
    onPollClick, sportTab, setSportTab
}: CrewHomeTabProps) => {
    const [isRankingInfoOpen, setIsRankingInfoOpen] = useState(false);
    const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);

    const activeMembers = useMemo(() => members.filter((m: any) => m.role !== 'pending'), [members]);

    // 이미지 에러 핸들러
    const handleImageError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
        e.currentTarget.src = "https://images.unsplash.com/photo-1544178178-5034a9269043?auto=format&fit=crop&q=80&w=1000";
    };

    const handleLogoError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
        e.currentTarget.src = "https://images.unsplash.com/photo-1511367461989-f85a21fda181?auto=format&fit=crop&q=80&w=200";
    };

    // 통계 계산 (useMemo 최적화)
    const stats = useMemo(() => {
        const statsMembers = activeMembers.filter((m: any) => m.member);
        const isGolf = crew.sportCategory === 'GOLF';

        const membersWith3c = statsMembers.filter((m: any) => (m.member.avg3c || 0) > 0);
        const membersWith4c = statsMembers.filter((m: any) => (m.member.avg4c || 0) > 0);
        const avg3c = membersWith3c.length > 0
            ? (membersWith3c.reduce((a, b) => a + (b.member.avg3c || 0), 0) / membersWith3c.length).toFixed(2)
            : "0.00";
        const avg4c = membersWith4c.length > 0
            ? (membersWith4c.reduce((a, b) => a + (b.member.avg4c || 0), 0) / membersWith4c.length).toFixed(2)
            : "0.00";

        const golfers = statsMembers.filter((m: any) => (m.member.golfAvgScore || 0) > 0 || (m.member.golfHandicap || 0) > 0);
        const avgHdcp = golfers.length > 0
            ? (golfers.reduce((a, b) => {
                const score = (b.member.golfAvgScore || 0) > 0 ? b.member.golfAvgScore : (b.member.golfHandicap || 0) + 72;
                return a + (score - 72);
            }, 0) / golfers.length).toFixed(1)
            : "0.0";
        const avgGolfScore = golfers.length > 0
            ? Math.round(golfers.reduce((a, b) => {
                const score = (b.member.golfAvgScore || 0) > 0 ? b.member.golfAvgScore : (b.member.golfHandicap || 0) + 72;
                return a + score;
            }, 0) / golfers.length)
            : "0";

        const totalPoints = statsMembers.length * 1240 + 450;
        const totalRounds = statsMembers.reduce((acc, m) => acc + (m.member.totalGolfGames || 0), 0);
        const pointsDisplay = isGolf ? `${totalRounds} 회` : totalPoints.toLocaleString();

        return {
            statsMembers,
            isGolf,
            avg3c,
            avg4c,
            avgHdcp,
            avgGolfScore,
            pointsDisplay,
            totalRounds,
            totalPoints
        };
    }, [activeMembers, crew.sportCategory]);

    return (
        <div className="space-y-8 pb-32">
            {/* Hero Section */}
            <div className="relative">
                <div className="relative w-full overflow-hidden">
                    <img
                        src={crew.coverImage || "https://images.unsplash.com/photo-1544178178-5034a9269043?auto=format&fit=crop&q=80&w=1000"}
                        className="w-full h-[240px] object-cover"
                        alt="Crew Cover"
                        onError={handleImageError}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0f0f0f] to-transparent opacity-60" />
                </div>

                <div className="px-6 -mt-10 relative z-10 flex items-end gap-4">
                    <div className="w-20 h-20 rounded-2xl bg-surface-2 border-2 border-brand/20 overflow-hidden">
                        <img
                            src={crew.emblem || "https://images.unsplash.com/photo-1511367461989-f85a21fda181?auto=format&fit=crop&q=80&w=200"}
                            className="w-full h-full object-cover"
                            alt="Crew Logo"
                            onError={handleLogoError}
                        />
                    </div>
                    <div className="pb-1">
                        <h1 className="text-2xl font-semibold text-white leading-tight tracking-tight">
                            {crew.name}
                        </h1>
                        <p className="text-[13px] text-white/65 font-medium mt-1">
                            {crew.shortIntro || crew.region || "우리 크루"}
                        </p>
                    </div>
                </div>
            </div>

            {/* Info Section */}
            <div className="px-6 space-y-5">
                <div className="relative">
                    <div className={cn(
                        "text-white/60 text-[15px] leading-relaxed font-normal transition-all duration-300 whitespace-pre-wrap",
                        !isDescriptionExpanded && "line-clamp-3"
                    )}>
                        {crew.description || "크루 소개글이 없습니다."}
                    </div>
                    {(crew.description?.length || 0) > 60 && (
                        <button
                            onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
                            className="text-brand text-xs font-semibold mt-3 hover:text-white transition-colors"
                        >
                            {isDescriptionExpanded ? "접기" : "더 보기 ∨"}
                        </button>
                    )}
                </div>

                <div className="flex flex-wrap gap-2">
                    {crew.meetingDay && (
                        <div className="flex items-center gap-1.5 px-4 py-2 bg-white/5 border border-white/10 rounded-full text-white/80 text-xs font-semibold">
                            <LucideCalendar className="w-3.5 h-3.5 text-brand" />
                            {crew.meetingDay} {crew.meetingTime}
                        </div>
                    )}
                    <div className="flex items-center gap-1.5 px-4 py-2 bg-white/5 border border-white/10 rounded-full text-white/80 text-xs font-semibold">
                        <LucideMapPin className="w-3.5 h-3.5 text-brand" />
                        {crew.region || "지역"}
                    </div>
                </div>

                {/* Team Performance Dashboard */}
                <div onClick={() => setIsRankingInfoOpen(true)} className="grid grid-cols-2 gap-3 mt-6 relative cursor-pointer">
                    <div className="absolute top-0 bottom-0 left-1/2 w-[1px] bg-white/10 -translate-x-1/2" />
                    <div className="absolute left-0 right-0 top-1/2 h-[1px] bg-white/10 -translate-y-1/2" />

                    <StatCard title="랭킹" subTitle="지역 기준">
                        <span className="text-3xl font-bold text-white tracking-tight tabular-nums">-- <span className="text-lg font-normal text-white/55">위</span></span>
                    </StatCard>

                    <StatCard title={stats.isGolf ? "클럽 평균" : "팀 에버리지"}>
                        <div className="flex items-center gap-3 mt-1 px-2">
                            <div className="flex flex-col items-center">
                                <span className="text-2xl font-bold text-white leading-none tabular-nums">{stats.isGolf ? stats.avgGolfScore : stats.avg3c}</span>
                                <span className="text-xs text-white/55 font-medium mt-1 tracking-tight">{stats.isGolf ? "HDCP" : "3C"}</span>
                            </div>
                            {!stats.isGolf && (
                                <>
                                    <div className="h-8 w-px bg-white/10" />
                                    <div className="flex flex-col items-center">
                                        <span className="text-2xl font-bold text-white leading-none tabular-nums">{stats.avg4c}</span>
                                        <span className="text-xs text-white/55 font-medium mt-1 tracking-tight">4B</span>
                                    </div>
                                </>
                            )}
                        </div>
                    </StatCard>

                    <StatCard title={stats.isGolf ? "누적 라운드" : "누적 점수"}>
                        <span className="text-3xl font-bold text-white tracking-tight tabular-nums">
                            {stats.isGolf ? (
                                <>{stats.totalRounds} <span className="text-lg font-normal text-white/55">회</span></>
                            ) : (
                                stats.totalPoints.toLocaleString()
                            )}
                        </span>
                    </StatCard>

                    <StatCard title="활동 멤버">
                        <span className="text-3xl font-bold text-white tracking-tight tabular-nums">{stats.statsMembers.length} <span className="text-lg font-normal text-white/55">명</span></span>
                    </StatCard>
                </div>

                <AnimatePresence>
                    {isRankingInfoOpen && (
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4 bg-black/80"
                            onClick={() => setIsRankingInfoOpen(false)}
                        >
                            <motion.div
                                initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
                                className="w-full max-w-md bg-[#141416] border border-white/10 rounded-t-card sm:rounded-card p-8 space-y-8"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <h2 className="text-xl font-bold tracking-tight text-white mb-6">크루 랭킹 시스템</h2>
                                <div className="space-y-4">
                                    <InfoItem title={stats.isGolf ? "클럽 평균" : "실력 점수 (30%)"} color="emerald" desc={stats.isGolf ? "평균 핸디캡 및 타수입니다." : "멤버들의 평균 에버리지입니다."} />
                                    <InfoItem title={stats.isGolf ? "누적 라운드" : "활동 점수 (50%)"} color="blue" desc={stats.isGolf ? "기록된 총 라운딩 합계입니다." : "월간 누적 득점 포인트입니다."} />
                                    <InfoItem title="규모 점수 (20%)" color="pink" desc="최근 30일간 활동한 실질 멤버 수입니다." />
                                </div>
                                <Button onClick={() => setIsRankingInfoOpen(false)} className="w-full bg-white/5 h-14 rounded-2xl border border-white/10 font-semibold mt-4">확인</Button>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Activities Section */}
            <div className="px-6 space-y-4">
                <div className="flex items-center gap-2 mb-4">
                    <div className={cn("w-1.5 h-1.5 rounded-full", crew.sportCategory === 'GOLF' ? "bg-brand" : "bg-brand")} />
                    <h2 className="text-[15px] font-semibold text-white/55">정모 / 일정</h2>
                </div>

                <ClubActivityList
                    crewId={crew.id}
                    isMember={isMember}
                    currentMemberId={me?.id}
                    sportType={crew.sportCategory === 'GOLF' ? 'GOLF' : 'BILLIARDS'}
                    onCreateClick={onCreateActivity}
                    onShareToChat={onShareToChat}
                    isAdmin={isAdmin}
                />
            </div>

            {/* Poll Preview Section */}
            <div className="px-6 space-y-4">
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                        <h2 className="text-[15px] font-semibold text-white/55">진행 중인 투표</h2>
                    </div>
                    {isMember && (
                        <Button
                            variant="ghost"
                            onClick={onCreatePoll}
                            className="h-7 px-2 text-xs font-medium text-white/55 hover:text-brand flex items-center gap-1"
                        >
                            <LucidePlus className="w-3 h-3" />
                            만들기
                        </Button>
                    )}
                </div>

                <div onClick={onPollClick} className="cursor-pointer active:scale-[0.98] transition-all">
                    <PollPreview crewId={crew.id} isMember={isMember} />
                </div>
            </div>

            {/* Base Camp Section */}
            <div className="px-6">
                <div className="flex items-center gap-2 mb-4">
                    <div className={cn("w-1.5 h-1.5 rounded-full", crew.sportCategory === 'GOLF' ? "bg-brand" : "bg-brand")} />
                    <h2 className="text-[15px] font-semibold text-white/55">베이스 캠프</h2>
                </div>
                {baseStore ? (
                    <Card className="bg-surface-2 border-surface-line rounded-card overflow-hidden group hover:border-brand/50 transition-all">
                        <CardContent className="p-5">
                            <div className="flex items-center justify-between mb-4">
                                <div>
                                    <h3 className="text-lg font-bold text-white tracking-tight">{baseStore.name}</h3>
                                    <p className="text-xs text-white/55 mt-0.5">{baseStore.address}</p>
                                </div>
                                <span className="bg-brand/10 text-brand text-xs font-semibold px-2.5 py-1 rounded-full border border-brand/20">공식</span>
                            </div>
                            <div className="flex gap-2.5">
                                <Button variant="outline" className="flex-1 rounded-xl text-xs h-10 border-white/10 text-white hover:bg-white/10">전화하기</Button>
                                <Button className="flex-1 rounded-xl text-xs h-10 bg-brand text-brand-fg">위치보기</Button>
                            </div>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="py-14 text-center bg-white/5 rounded-card border border-dashed border-white/10 text-white/55 text-xs font-medium">
                        베이스 캠프 정보가 없습니다
                    </div>
                )}
            </div>

            {/* Members Section */}
            <div className="px-6 pb-20">
                <div className="flex items-center gap-2 mb-6">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                    <h2 className="text-[15px] font-semibold text-white/55">멤버 <span className="ml-1 tabular-nums">{members.length}</span></h2>
                </div>
                <CrewMemberList members={activeMembers} currentMemberId={me?.id} sportCategory={crew.sportCategory} crewId={crew.id} />
            </div>

            {/* Join CTA for non-members */}
            {(isNotMember || isPending) && (
                <div className="fixed bottom-[5.5rem] left-0 right-0 px-6 py-2 z-50 pointer-events-none">
                    <Button
                        onClick={onJoin}
                        disabled={isPending}
                        className={cn(
                            "w-full h-14 rounded-2xl text-base font-semibold tracking-normal transition-all active:scale-95 pointer-events-auto ring-1 ring-white/10",
                            isPending ? "bg-white/5 text-white/55 border border-white/5" : "bg-brand text-brand-fg hover:bg-brand/90"
                        )}
                    >
                        {isPending ? "가입 승인 대기 중..." : "크루 가입하기"}
                    </Button>
                </div>
            )}
        </div>
    );
});

const PollPreview = ({ crewId, isMember }: { crewId: string; isMember: boolean }) => {
    const { data: polls, isLoading } = useQuery<any[]>({
        queryKey: [`/api/hiq/crews/${crewId}/polls`],
        enabled: !!crewId,
    });

    if (isLoading) return <div className="h-24 bg-white/5 rounded-card animate-pulse" />;

    if (!polls || polls.length === 0) return (
        <div className="p-8 text-center bg-white/5 border border-dashed border-white/10 rounded-card">
            <p className="text-xs font-medium text-white/55">등록된 투표가 없습니다</p>
        </div>
    );

    // Show up to 3 polls
    const recentPolls = polls.slice(0, 3);

    return (
        <div className="space-y-3">
            {recentPolls.map((poll) => {
                const totalVotes = poll.totalVotes || 0;
                const topOption = poll.options?.[0]; // Assuming options are sorted by voteCount or index? 
                // Using the first option in the list. To be safe, we might want to sort options by voteCount descending if we want "1st place".
                // But the backend `getCrewPolls` sorts options by `createdAt` asc.
                // Wait, the original code had: `const topOption = latestPoll.options?.[0];`
                // And displayed "현재 1위: topOption.text". 
                // This logic is flawed if options aren't sorted by votes. 
                // Let's sort options relative to the UI display for "1st place".
                const sortedOptions = [...(poll.options || [])].sort((a: any, b: any) => b.voteCount - a.voteCount);
                const bestOption = sortedOptions[0];

                return (
                    <Card key={poll.id} className="bg-surface-2 border-surface-line rounded-card overflow-hidden group hover:border-brand/30 transition-all">
                        <CardContent className="p-6">
                            <div className="flex items-start justify-between gap-4 mb-4">
                                <div className="flex-1 space-y-1.5">
                                    <div className="flex items-center gap-2">
                                        <span className={cn(
                                            "text-xs font-semibold",
                                            poll.status === 'active' ? "text-brand" : "text-white/55"
                                        )}>{poll.status === 'active' ? '진행 중' : '종료'}</span>
                                        {poll.isAnonymous && <span className="text-xs font-semibold text-blue-400"> 익명</span>}
                                        {poll.allowMultiple && <span className="text-xs font-semibold text-purple-400"> 복수</span>}
                                    </div>
                                    <h3 className="text-base font-semibold text-white leading-tight tracking-tight">{poll.title}</h3>
                                </div>
                                <div className="w-10 h-10 bg-brand/10 rounded-xl flex items-center justify-center">
                                    <LucideVote className="w-5 h-5 text-brand" />
                                </div>
                            </div>

                            {bestOption && (
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="text-white/55 font-medium">현재 1위: {bestOption.text}</span>
                                        <span className="text-white/70 font-semibold tabular-nums">{bestOption.voteCount}표</span>
                                    </div>
                                    <Progress value={totalVotes > 0 ? (bestOption.voteCount / totalVotes) * 100 : 0} className="h-1.5 bg-white/5" />
                                </div>
                            )}

                            <div className="flex items-center justify-between mt-5 pt-4 border-t border-white/5">
                                <div className="flex items-center gap-2">
                                    <div className="flex -space-x-2">
                                        {[1, 2, 3].map(i => (
                                            <div key={i} className="w-5 h-5 rounded-full border border-surface-2 bg-white/5 flex items-center justify-center">
                                                <LucideUser className="w-2.5 h-2.5 text-white/45" />
                                            </div>
                                        ))}
                                    </div>
                                    <span className="text-xs font-medium text-white/55 tabular-nums">{totalVotes}명 참여 중</span>
                                </div>
                                <LucideChevronRight className="w-4 h-4 text-white/45 group-hover:text-white transition-colors" />
                            </div>
                        </CardContent>
                    </Card>
                );
            })}
        </div>
    );
};

const InfoItem = ({ title, color, desc }: { title: string, color: 'emerald' | 'blue' | 'pink', desc: string }) => {
    const theme = COLOR_VARIANTS[color];
    return (
        <div className={cn("p-5 bg-white/5 border rounded-2xl", theme.border, theme.bg)}>
            <h3 className={cn("text-sm font-semibold", theme.text)}>{title}</h3>
            <p className="text-[13px] text-white/55 mt-1 leading-relaxed">{desc}</p>
        </div>
    );
};

const TabBtn = ({ label, active, onClick }: { label: string, active: boolean, onClick: () => void }) => (
    <button onClick={onClick} className={cn("flex-1 py-2 rounded-lg text-xs font-semibold transition-all", active ? "bg-brand text-brand-fg" : "text-white/55")}>{label}</button>
);

CrewHomeTab.displayName = "CrewHomeTab";

const LucideUser = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
);
