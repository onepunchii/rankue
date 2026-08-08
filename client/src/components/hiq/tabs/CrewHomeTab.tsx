import { useState, memo, useMemo } from "react";
import {
    LucideCalendar, LucideMapPin, LucideVote, LucideChevronRight, LucidePlus,
    LucideChevronDown, LucideUsers, LucideFlag, LucideTarget, LucideLogOut
} from "@/lib/icons";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { HiqCrew, HiqStore } from "@shared/schema";
import { ClubActivityList } from "@/components/hiq/view/ClubActivityList";
import { CrewMemberList } from "@/components/hiq/CrewMemberList";
import { useQuery } from "@tanstack/react-query";
import { Progress } from "@/components/ui/progress";
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useT } from "@/lib/i18n";

const StatCard = ({ title, subTitle, children }: { title: string, subTitle?: string, children: React.ReactNode }) => {
    return (
        <div className="rounded-2xl p-5 flex flex-col items-center justify-center text-center">
            <div className="flex flex-col items-center gap-1.5 mb-2">
                <span className="text-black/55 text-[12px] font-medium">{title}</span>
            </div>
            <div>
                {children}
            </div>
            {subTitle && (
                <span className="text-black/40 text-[12px] font-medium mt-2">{subTitle}</span>
            )}
        </div>
    );
};

interface CrewHomeTabProps {
    crew: HiqCrew;
    baseStore: HiqStore | null;
    baseListing?: { code: string; name: string; address: string } | null;
    members: any[]; // Extended member data with profile info
    isMember: boolean;
    isPending: boolean;
    isNotMember: boolean;
    isAdmin: boolean;
    me: any;
    onJoin: () => void;
    onLeave?: () => void;
    isLeaving?: boolean;
    isLeader?: boolean;
    onCreateActivity: () => void;
    onCreatePoll: () => void;
    onShareToChat: (msg: string) => void;
    onPollClick: () => void;
    // Received from parent for API symmetry but not used in this view.
    sportTab?: 'BILLIARDS' | 'GOLF';
    setSportTab?: (tab: 'BILLIARDS' | 'GOLF') => void;
}

export const CrewHomeTab = memo(({
    crew, baseStore, baseListing = null, members, isMember, isPending, isNotMember, isAdmin, me, onJoin, onLeave, isLeaving, isLeader, onCreateActivity, onCreatePoll, onShareToChat,
    onPollClick
}: CrewHomeTabProps) => {
    const { t } = useT();
    const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);

    const activeMembers = useMemo(() => members.filter((m: any) => m.role !== 'pending'), [members]);

    // 커버/엠블럼 이미지가 없으면 크루 이니셜 타일로 대체
    const crewInitial = crew.name?.trim().charAt(0).toUpperCase() || "?";

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

        const totalPoints = statsMembers.reduce((acc, m) => acc + (m.member.totalSimPoints || 0), 0);
        const totalRounds = statsMembers.reduce((acc, m) => acc + (m.member.totalGolfGames || 0), 0);

        return {
            statsMembers,
            isGolf,
            avg3c,
            avg4c,
            avgHdcp,
            avgGolfScore,
            totalRounds,
            totalPoints
        };
    }, [activeMembers, crew.sportCategory]);

    return (
        <div className="space-y-8 pb-32">
            {/* Hero Section */}
            <div className="relative">
                <div className="relative w-full overflow-hidden">
                    {crew.coverImage ? (
                        <img
                            src={crew.coverImage}
                            className="w-full h-[240px] object-cover"
                            alt="Crew Cover"
                        />
                    ) : (
                        <div className="w-full h-[240px] bg-surface-2 flex items-center justify-center">
                            <span className="text-[72px] font-bold text-brand/40 leading-none tracking-tight">{crewInitial}</span>
                        </div>
                    )}
                    {/* Fade only the bottom edge into the page — keep the photo vivid. */}
                    <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#f2f0eb] via-[#f2f0eb]/50 to-transparent" />
                </div>

                <div className="px-6 -mt-10 relative z-10 flex items-end gap-4">
                    <div className="w-20 h-20 rounded-2xl bg-surface-2 border-2 border-brand/20 overflow-hidden">
                        {crew.emblem ? (
                            <img
                                src={crew.emblem}
                                className="w-full h-full object-cover"
                                alt="Crew Logo"
                            />
                        ) : (
                            <div className="w-full h-full bg-brand/10 flex items-center justify-center">
                                <span className="text-[30px] font-bold text-brand leading-none">{crewInitial}</span>
                            </div>
                        )}
                    </div>
                    <div className="pb-1">
                        <h1 className="text-2xl font-semibold text-[rgba(0,0,0,0.87)] leading-tight tracking-tight">
                            {crew.name}
                        </h1>
                        <p className="text-[13px] text-black/60 font-medium mt-1">
                            {crew.shortIntro || crew.region || t("crewHome.ourCrew")}
                        </p>
                    </div>
                </div>
            </div>

            {/* Info Section */}
            <div className="px-6 space-y-5">
                <div className="relative">
                    <div className={cn(
                        "text-black/60 text-[15px] leading-relaxed font-normal transition-all duration-300 whitespace-pre-wrap",
                        !isDescriptionExpanded && "line-clamp-3"
                    )}>
                        {crew.description || t("crewHome.noDescription")}
                    </div>
                    {(crew.description?.length || 0) > 60 && (
                        <button
                            onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
                            className="text-brand text-xs font-semibold mt-3 hover:text-brand/70 transition-colors inline-flex items-center gap-1"
                        >
                            {isDescriptionExpanded ? t("crewHome.collapse") : t("crewHome.expand")}
                            <LucideChevronDown className={cn("w-3.5 h-3.5 transition-transform", isDescriptionExpanded && "rotate-180")} />
                        </button>
                    )}
                </div>

                <div className="flex flex-wrap gap-2">
                    {crew.meetingDay && (
                        <div className="flex items-center gap-1.5 px-4 py-2 bg-black/[0.04] rounded-full text-black/70 text-xs font-semibold">
                            <LucideCalendar className="w-3.5 h-3.5 text-brand" />
                            {crew.meetingDay} {crew.meetingTime}
                        </div>
                    )}
                    <div className="flex items-center gap-1.5 px-4 py-2 bg-black/[0.04] rounded-full text-black/70 text-xs font-semibold">
                        <LucideMapPin className="w-3.5 h-3.5 text-brand" />
                        {crew.region || t("crewHome.region")}
                    </div>
                </div>

                {/* Team Performance Dashboard */}
                <div className="grid grid-cols-2 gap-3 mt-6 relative">
                    <div className="absolute top-0 bottom-0 left-1/2 w-[1px] bg-black/10 -translate-x-1/2" />
                    <div className="absolute left-0 right-0 top-1/2 h-[1px] bg-black/10 -translate-y-1/2" />

                    <StatCard title={t("crewHome.ranking")}>
                        <span className="text-base font-medium text-black/40">{t("crewHome.rankingPending")}</span>
                    </StatCard>

                    <StatCard title={stats.isGolf ? t("crewHome.clubAverage") : t("crewHome.teamAverage")}>
                        <div className="flex items-center gap-3 mt-1 px-2">
                            {/* 골프: 평균 타수와 HDCP는 다른 값 — 평균 타수에 "HDCP" 라벨을 달면 안 된다 */}
                            <div className="flex flex-col items-center">
                                <span className="text-2xl font-bold text-[rgba(0,0,0,0.87)] leading-none tabular-nums">{stats.isGolf ? stats.avgGolfScore : stats.avg3c}</span>
                                <span className="text-xs text-black/55 font-medium mt-1 tracking-tight">{stats.isGolf ? t("ranking.golfAvgScore") : t("ranking.threeCushion")}</span>
                            </div>
                            <div className="h-8 w-px bg-black/10" />
                            <div className="flex flex-col items-center">
                                <span className="text-2xl font-bold text-[rgba(0,0,0,0.87)] leading-none tabular-nums">{stats.isGolf ? stats.avgHdcp : stats.avg4c}</span>
                                <span className="text-xs text-black/55 font-medium mt-1 tracking-tight">{stats.isGolf ? "HDCP" : t("ranking.fourBall")}</span>
                            </div>
                        </div>
                    </StatCard>

                    <StatCard title={stats.isGolf ? t("crewHome.totalRounds") : t("crewHome.totalPoints")}>
                        <span className="text-3xl font-bold text-[rgba(0,0,0,0.87)] tracking-tight tabular-nums">
                            {stats.isGolf ? (
                                <>{stats.totalRounds} <span className="text-lg font-normal text-black/55">{t("crewHome.roundsUnit")}</span></>
                            ) : (
                                stats.totalPoints.toLocaleString()
                            )}
                        </span>
                    </StatCard>

                    <StatCard title={t("crewHome.activeMembers")}>
                        <span className="text-3xl font-bold text-[rgba(0,0,0,0.87)] tracking-tight tabular-nums">{stats.statsMembers.length} <span className="text-lg font-normal text-black/55">{t("crewHome.membersUnit")}</span></span>
                    </StatCard>
                </div>
            </div>

            {/* Activities Section */}
            <div className="px-6 space-y-4">
                <div className="flex items-center gap-2 mb-4">
                    <div className="w-1.5 h-1.5 rounded-full bg-brand" />
                    <h2 className="text-[15px] font-semibold text-black/55">{t("crewHome.schedule")}</h2>
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
                        <div className="w-1.5 h-1.5 rounded-full bg-brand" />
                        <h2 className="text-[15px] font-semibold text-black/55">{t("crewHome.activePolls")}</h2>
                    </div>
                    {isMember && (
                        <Button
                            variant="ghost"
                            onClick={onCreatePoll}
                            className="h-10 px-3 text-[13px] font-medium text-black/55 hover:text-brand flex items-center gap-1.5"
                        >
                            <LucidePlus className="w-4 h-4" />
                            {t("crewHome.create")}
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
                    <div className="w-1.5 h-1.5 rounded-full bg-brand" />
                    <h2 className="text-[15px] font-semibold text-black/55">{t("crewHome.baseCamp")}</h2>
                </div>
                {baseStore ? (
                    <Card className="bg-surface-2 border-surface-line rounded-card overflow-hidden group hover:border-brand/50 transition-all">
                        <CardContent className="p-5">
                            <div className="flex items-center justify-between mb-4">
                                <div>
                                    <h3 className="text-lg font-bold text-[rgba(0,0,0,0.87)] tracking-tight">{baseStore.name}</h3>
                                    <p className="text-xs text-black/55 mt-0.5">{baseStore.address}</p>
                                </div>
                                <span className="bg-brand/10 text-brand text-xs font-semibold px-2.5 py-1 rounded-full border border-brand/20">{t("crewHome.official")}</span>
                            </div>
                            <div className="flex gap-2.5">
                                <Button variant="outline" className="flex-1 rounded-xl text-xs h-10 border-black/10 text-[rgba(0,0,0,0.87)] hover:bg-black/[0.04]">{t("crewHome.call")}</Button>
                                <Button className="flex-1 rounded-xl text-xs h-10 bg-brand text-brand-fg">{t("crewHome.viewLocation")}</Button>
                            </div>
                        </CardContent>
                    </Card>
                ) : baseListing ? (
                    /* 디렉토리 베이스 매장 — 매장 페이지(/stores/:code)로 연결 */
                    <Card className="bg-surface-2 border-surface-line rounded-card overflow-hidden group hover:border-brand/50 transition-all">
                        <CardContent className="p-5">
                            <div className="flex items-center justify-between mb-4">
                                <div className="min-w-0">
                                    <h3 className="text-lg font-bold text-[rgba(0,0,0,0.87)] tracking-tight truncate">{baseListing.name}</h3>
                                    <p className="text-xs text-black/55 mt-0.5 truncate">{baseListing.address}</p>
                                </div>
                            </div>
                            <a
                                href={`/stores/${baseListing.code}`}
                                className="flex items-center justify-center w-full rounded-xl text-xs font-semibold h-10 bg-brand text-brand-fg"
                            >
                                {t("crewHome.viewLocation")}
                            </a>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="py-14 text-center bg-black/[0.04] rounded-card border border-dashed border-black/10 text-black/55 text-xs font-medium">
                        {t("crewHome.noBaseCamp")}
                    </div>
                )}
            </div>

            {/* Members Section */}
            <div className="px-6 pb-20">
                <div className="flex items-center gap-2 mb-6">
                    <div className="w-1.5 h-1.5 rounded-full bg-brand" />
                    <h2 className="text-[15px] font-semibold text-black/55">{t("crewHome.members")} <span className="ml-1 tabular-nums">{activeMembers.length}</span></h2>
                </div>
                <CrewMemberList members={activeMembers} currentMemberId={me?.id} sportCategory={crew.sportCategory} crewId={crew.id} />
            </div>

            {/* 크루 탈퇴 (일반 멤버 · 크루장 제외) */}
            {isMember && !isLeader && onLeave && (
                <div className="px-6 pt-2 pb-4 flex justify-center">
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <button
                                disabled={isLeaving}
                                className="inline-flex items-center gap-1.5 text-[13px] font-medium text-black/40 hover:text-red-500 transition-colors disabled:opacity-40"
                            >
                                <LucideLogOut className="w-4 h-4" />
                                {t("crewHome.leaveCrew")}
                            </button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="bg-white text-[rgba(0,0,0,0.87)] rounded-card">
                            <AlertDialogHeader>
                                <AlertDialogTitle className="text-[rgba(0,0,0,0.87)]">{t("crewHome.leaveConfirmTitle")}</AlertDialogTitle>
                                <AlertDialogDescription className="text-black/55">
                                    {t("crewHome.leaveConfirmDesc")}
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel className="bg-black/[0.04] border-black/10 text-[rgba(0,0,0,0.87)] hover:bg-black/[0.06] hover:text-[rgba(0,0,0,0.87)]">{t("crewHome.cancel")}</AlertDialogCancel>
                                <AlertDialogAction onClick={onLeave} className="bg-red-500 text-white hover:bg-red-600">{t("crewHome.leaveAction")}</AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </div>
            )}

            {/* Join CTA for non-members / pending */}
            {(isNotMember || isPending) && (
                <div className="fixed bottom-[5.5rem] left-0 right-0 px-6 py-2 z-50 pointer-events-none">
                    {isPending ? (
                        <div className="flex items-center gap-2 pointer-events-auto">
                            <div className="flex-1 h-14 rounded-2xl flex items-center justify-center text-base font-semibold bg-white text-black/55 ring-1 ring-black/10 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
                                {t("crewHome.pendingApproval")}
                            </div>
                            {onLeave && (
                                <Button
                                    onClick={onLeave}
                                    disabled={isLeaving}
                                    variant="outline"
                                    className="h-14 px-5 rounded-2xl text-sm font-semibold bg-white border-black/10 text-black/60 hover:bg-black/[0.04] hover:text-[rgba(0,0,0,0.87)] shadow-[0_1px_2px_rgba(0,0,0,0.06)] disabled:opacity-40"
                                >
                                    {t("crewHome.cancelRequest")}
                                </Button>
                            )}
                        </div>
                    ) : (
                        <Button
                            onClick={onJoin}
                            className="w-full h-14 rounded-2xl text-base font-semibold tracking-normal transition-all active:scale-95 pointer-events-auto shadow-[0_1px_2px_rgba(0,0,0,0.06)] bg-brand text-brand-fg hover:bg-brand/90"
                        >
                            {t("crewHome.joinCrew")}
                        </Button>
                    )}
                </div>
            )}
        </div>
    );
});

const PollPreview = ({ crewId, isMember }: { crewId: string; isMember: boolean }) => {
    const { t } = useT();
    const { data: polls, isLoading } = useQuery<any[]>({
        queryKey: [`/api/hiq/crews/${crewId}/polls`],
        enabled: !!crewId,
    });

    if (isLoading) return <div className="h-24 bg-black/[0.04] rounded-card animate-pulse" />;

    if (!polls || polls.length === 0) return (
        <div className="p-8 text-center bg-black/[0.04] border border-dashed border-black/10 rounded-card">
            <p className="text-xs font-medium text-black/55">{t("crewHome.noPolls")}</p>
        </div>
    );

    // Show up to 3 polls
    const recentPolls = polls.slice(0, 3);

    return (
        <div className="space-y-3">
            {recentPolls.map((poll) => {
                const totalVotes = poll.totalVotes || 0;
                // Sort options by voteCount desc so the displayed "현재 1위" reflects the actual leader
                // (backend returns options ordered by createdAt).
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
                                            poll.status === 'active' ? "text-brand" : "text-black/55"
                                        )}>{poll.status === 'active' ? t("crewHome.pollActive") : t("crewHome.pollEnded")}</span>
                                        {poll.isAnonymous && <span className="text-xs font-semibold text-brand"> {t("crewHome.pollAnonymous")}</span>}
                                        {poll.allowMultiple && <span className="text-xs font-semibold text-purple-500"> {t("crewHome.pollMultiple")}</span>}
                                    </div>
                                    <h3 className="text-base font-semibold text-[rgba(0,0,0,0.87)] leading-tight tracking-tight">{poll.title}</h3>
                                </div>
                                <div className="w-10 h-10 bg-brand/10 rounded-xl flex items-center justify-center">
                                    <LucideVote className="w-5 h-5 text-brand" />
                                </div>
                            </div>

                            {bestOption && (
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="text-black/55 font-medium">{t("crewHome.currentLeader")} {bestOption.text}</span>
                                        <span className="text-black/70 font-semibold tabular-nums">{bestOption.voteCount}{t("crewHome.votesSuffix")}</span>
                                    </div>
                                    <Progress value={totalVotes > 0 ? (bestOption.voteCount / totalVotes) * 100 : 0} className="h-1.5 bg-black/[0.06]" />
                                </div>
                            )}

                            <div className="flex items-center justify-between mt-5 pt-4 border-t border-black/[0.08]">
                                <div className="flex items-center gap-1.5 text-black/55">
                                    <LucideUsers className="w-3.5 h-3.5" />
                                    <span className="text-xs font-medium tabular-nums">{totalVotes}{t("crewHome.participantsSuffix")}</span>
                                </div>
                                <LucideChevronRight className="w-4 h-4 text-black/40 group-hover:text-[rgba(0,0,0,0.87)] transition-colors" />
                            </div>
                        </CardContent>
                    </Card>
                );
            })}
        </div>
    );
};

CrewHomeTab.displayName = "CrewHomeTab";
