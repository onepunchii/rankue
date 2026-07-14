import { useState, memo, useMemo } from "react";
import {
    LucideCalendar, LucideMapPin, LucideVote, LucideChevronRight, LucidePlus,
    LucideChevronDown, LucideUsers, LucideFlag, LucideTarget, LucideLogOut
} from "lucide-react";
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
    crew, baseStore, members, isMember, isPending, isNotMember, isAdmin, me, onJoin, onLeave, isLeaving, isLeader, onCreateActivity, onCreatePoll, onShareToChat,
    onPollClick
}: CrewHomeTabProps) => {
    const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);

    const activeMembers = useMemo(() => members.filter((m: any) => m.role !== 'pending'), [members]);

    // 커버/엠블럼 이미지가 없으면 외부 스톡 사진 대신 크루 이니셜 + 종목 아이콘 타일로 대체
    const crewInitial = crew.name?.trim().charAt(0).toUpperCase() || "?";
    const SportIcon = crew.sportCategory === 'GOLF' ? LucideFlag : LucideTarget;

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
                    <div className="absolute inset-0 bg-gradient-to-t from-[#f2f0eb] to-transparent opacity-90" />
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
                            <div className="w-full h-full bg-surface-3 flex flex-col items-center justify-center gap-0.5">
                                <span className="text-[26px] font-bold text-brand leading-none">{crewInitial}</span>
                                <SportIcon className="w-3.5 h-3.5 text-ink-4" />
                            </div>
                        )}
                    </div>
                    <div className="pb-1">
                        <h1 className="text-2xl font-semibold text-[rgba(0,0,0,0.87)] leading-tight tracking-tight">
                            {crew.name}
                        </h1>
                        <p className="text-[13px] text-black/60 font-medium mt-1">
                            {crew.shortIntro || crew.region || "우리 크루"}
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
                        {crew.description || "크루 소개글이 없습니다."}
                    </div>
                    {(crew.description?.length || 0) > 60 && (
                        <button
                            onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
                            className="text-brand text-xs font-semibold mt-3 hover:text-brand/70 transition-colors inline-flex items-center gap-1"
                        >
                            {isDescriptionExpanded ? "접기" : "더 보기"}
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
                        {crew.region || "지역"}
                    </div>
                </div>

                {/* Team Performance Dashboard */}
                <div className="grid grid-cols-2 gap-3 mt-6 relative">
                    <div className="absolute top-0 bottom-0 left-1/2 w-[1px] bg-black/10 -translate-x-1/2" />
                    <div className="absolute left-0 right-0 top-1/2 h-[1px] bg-black/10 -translate-y-1/2" />

                    <StatCard title="랭킹">
                        <span className="text-base font-medium text-black/40">순위 집계 전</span>
                    </StatCard>

                    <StatCard title={stats.isGolf ? "클럽 평균" : "팀 에버리지"}>
                        <div className="flex items-center gap-3 mt-1 px-2">
                            <div className="flex flex-col items-center">
                                <span className="text-2xl font-bold text-[rgba(0,0,0,0.87)] leading-none tabular-nums">{stats.isGolf ? stats.avgGolfScore : stats.avg3c}</span>
                                <span className="text-xs text-black/55 font-medium mt-1 tracking-tight">{stats.isGolf ? "HDCP" : "3C"}</span>
                            </div>
                            {!stats.isGolf && (
                                <>
                                    <div className="h-8 w-px bg-black/10" />
                                    <div className="flex flex-col items-center">
                                        <span className="text-2xl font-bold text-[rgba(0,0,0,0.87)] leading-none tabular-nums">{stats.avg4c}</span>
                                        <span className="text-xs text-black/55 font-medium mt-1 tracking-tight">4B</span>
                                    </div>
                                </>
                            )}
                        </div>
                    </StatCard>

                    <StatCard title={stats.isGolf ? "누적 라운드" : "누적 점수"}>
                        <span className="text-3xl font-bold text-[rgba(0,0,0,0.87)] tracking-tight tabular-nums">
                            {stats.isGolf ? (
                                <>{stats.totalRounds} <span className="text-lg font-normal text-black/55">회</span></>
                            ) : (
                                stats.totalPoints.toLocaleString()
                            )}
                        </span>
                    </StatCard>

                    <StatCard title="활동 멤버">
                        <span className="text-3xl font-bold text-[rgba(0,0,0,0.87)] tracking-tight tabular-nums">{stats.statsMembers.length} <span className="text-lg font-normal text-black/55">명</span></span>
                    </StatCard>
                </div>
            </div>

            {/* Activities Section */}
            <div className="px-6 space-y-4">
                <div className="flex items-center gap-2 mb-4">
                    <div className="w-1.5 h-1.5 rounded-full bg-brand" />
                    <h2 className="text-[15px] font-semibold text-black/55">정모 / 일정</h2>
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
                        <h2 className="text-[15px] font-semibold text-black/55">진행 중인 투표</h2>
                    </div>
                    {isMember && (
                        <Button
                            variant="ghost"
                            onClick={onCreatePoll}
                            className="h-10 px-3 text-[13px] font-medium text-black/55 hover:text-brand flex items-center gap-1.5"
                        >
                            <LucidePlus className="w-4 h-4" />
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
                    <div className="w-1.5 h-1.5 rounded-full bg-brand" />
                    <h2 className="text-[15px] font-semibold text-black/55">베이스 캠프</h2>
                </div>
                {baseStore ? (
                    <Card className="bg-surface-2 border-surface-line rounded-card overflow-hidden group hover:border-brand/50 transition-all">
                        <CardContent className="p-5">
                            <div className="flex items-center justify-between mb-4">
                                <div>
                                    <h3 className="text-lg font-bold text-[rgba(0,0,0,0.87)] tracking-tight">{baseStore.name}</h3>
                                    <p className="text-xs text-black/55 mt-0.5">{baseStore.address}</p>
                                </div>
                                <span className="bg-brand/10 text-brand text-xs font-semibold px-2.5 py-1 rounded-full border border-brand/20">공식</span>
                            </div>
                            <div className="flex gap-2.5">
                                <Button variant="outline" className="flex-1 rounded-xl text-xs h-10 border-black/10 text-[rgba(0,0,0,0.87)] hover:bg-black/[0.04]">전화하기</Button>
                                <Button className="flex-1 rounded-xl text-xs h-10 bg-brand text-brand-fg">위치보기</Button>
                            </div>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="py-14 text-center bg-black/[0.04] rounded-card border border-dashed border-black/10 text-black/55 text-xs font-medium">
                        베이스 캠프 정보가 없습니다
                    </div>
                )}
            </div>

            {/* Members Section */}
            <div className="px-6 pb-20">
                <div className="flex items-center gap-2 mb-6">
                    <div className="w-1.5 h-1.5 rounded-full bg-brand" />
                    <h2 className="text-[15px] font-semibold text-black/55">멤버 <span className="ml-1 tabular-nums">{activeMembers.length}</span></h2>
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
                                크루 탈퇴
                            </button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="bg-white text-[rgba(0,0,0,0.87)] rounded-card">
                            <AlertDialogHeader>
                                <AlertDialogTitle className="text-[rgba(0,0,0,0.87)]">크루에서 나가시겠어요?</AlertDialogTitle>
                                <AlertDialogDescription className="text-black/55">
                                    탈퇴하면 이 크루의 활동·채팅에 더 이상 참여할 수 없어요. 다시 가입할 수 있습니다.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel className="bg-black/[0.04] border-black/10 text-[rgba(0,0,0,0.87)] hover:bg-black/[0.06] hover:text-[rgba(0,0,0,0.87)]">취소</AlertDialogCancel>
                                <AlertDialogAction onClick={onLeave} className="bg-red-500 text-white hover:bg-red-600">탈퇴하기</AlertDialogAction>
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
                                가입 승인 대기 중...
                            </div>
                            {onLeave && (
                                <Button
                                    onClick={onLeave}
                                    disabled={isLeaving}
                                    variant="outline"
                                    className="h-14 px-5 rounded-2xl text-sm font-semibold bg-white border-black/10 text-black/60 hover:bg-black/[0.04] hover:text-[rgba(0,0,0,0.87)] shadow-[0_1px_2px_rgba(0,0,0,0.06)] disabled:opacity-40"
                                >
                                    신청 취소
                                </Button>
                            )}
                        </div>
                    ) : (
                        <Button
                            onClick={onJoin}
                            className="w-full h-14 rounded-2xl text-base font-semibold tracking-normal transition-all active:scale-95 pointer-events-auto shadow-[0_1px_2px_rgba(0,0,0,0.06)] bg-brand text-brand-fg hover:bg-brand/90"
                        >
                            크루 가입하기
                        </Button>
                    )}
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

    if (isLoading) return <div className="h-24 bg-black/[0.04] rounded-card animate-pulse" />;

    if (!polls || polls.length === 0) return (
        <div className="p-8 text-center bg-black/[0.04] border border-dashed border-black/10 rounded-card">
            <p className="text-xs font-medium text-black/55">등록된 투표가 없습니다</p>
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
                                        )}>{poll.status === 'active' ? '진행 중' : '종료'}</span>
                                        {poll.isAnonymous && <span className="text-xs font-semibold text-brand"> 익명</span>}
                                        {poll.allowMultiple && <span className="text-xs font-semibold text-purple-500"> 복수</span>}
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
                                        <span className="text-black/55 font-medium">현재 1위: {bestOption.text}</span>
                                        <span className="text-black/70 font-semibold tabular-nums">{bestOption.voteCount}표</span>
                                    </div>
                                    <Progress value={totalVotes > 0 ? (bestOption.voteCount / totalVotes) * 100 : 0} className="h-1.5 bg-black/[0.06]" />
                                </div>
                            )}

                            <div className="flex items-center justify-between mt-5 pt-4 border-t border-black/[0.08]">
                                <div className="flex items-center gap-1.5 text-black/55">
                                    <LucideUsers className="w-3.5 h-3.5" />
                                    <span className="text-xs font-medium tabular-nums">{totalVotes}명 참여</span>
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
