import { useState, useMemo } from "react";
import { HiqMember } from "@shared/schema";
import {
    Sheet,
    SheetContent,
    SheetTitle,
    SheetDescription
} from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    LucideCrown,
    LucideShield,
    LucideSwords,
    LucideMessageCircle,
    LucideChevronRight,
    LucideLoader2,
    LucideEdit2,
    LucideCheck,
    LucideCalendarCheck,
    LucideTrophy,
    LucideMonitor,
    LucideBeer
} from "@/lib/icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { getTier } from "@/lib/hiqUtils";
import { apiRequest } from "@/lib/queryClient";
import { MemberActivityStats } from "@/components/hiq/member/MemberActivityStats";
import { UgcActionMenu } from "@/components/hiq/community/UgcActionMenu";
import { useT } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";

// --- Types ---
interface EnhancedHiqMember extends HiqMember {
    nickname?: string;
    profileImageUrl?: string;
    totalBilliardsGames?: number;
    introduction: string | null;
}

interface CrewMemberItemType {
    member: EnhancedHiqMember;
    role: string;
    joinedAt: Date | string;
    activityCounts?: {
        group1: number;
        group2: number;
        group3: number;
    };
}

interface CrewMemberListProps {
    members: CrewMemberItemType[];
    currentMemberId?: string;
    currentUserGender?: string;
    sportCategory?: "BILLIARDS" | "GOLF" | "MIXED";
    crewId: string;
}


export function CrewMemberList({ members, currentMemberId, sportCategory = "BILLIARDS", crewId }: CrewMemberListProps) {
    // 크루 대회 우승 횟수 — 명예의 전당과 같은 소스. 회원마다 조회하면 N+1 이라 한 번에 받는다.
    const { data: hallOfFame } = useQuery<{ honors?: Array<{ memberId: string; wins: number }> }>({
        queryKey: [`/api/hiq/crews/${crewId}/tournaments/hall-of-fame`],
        enabled: !!crewId,
    });
    const winsByMember = useMemo(() => {
        const map: Record<string, number> = {};
        for (const h of hallOfFame?.honors ?? []) map[h.memberId] = (map[h.memberId] ?? 0) + h.wins;
        return map;
    }, [hallOfFame]);
    const { t } = useT();
    const { toast } = useToast();
    const [selectedMember, setSelectedMember] = useState<CrewMemberItemType | null>(null);
    const [isSheetOpen, setIsSheetOpen] = useState(false);

    // Sort: Leader first, then admins, then joinedAt (ISO string comparison)
    const sortedMembers = useMemo(() => {
        return [...members].sort((a, b) => {
            const roleOrder: Record<string, number> = { leader: 3, manage: 2, member: 1, pending: 0 };
            const scoreA = roleOrder[a.role] || 0;
            const scoreB = roleOrder[b.role] || 0;

            if (scoreA !== scoreB) return scoreB - scoreA;

            // Handle both Date and string safely
            const dateA = new Date(a.joinedAt).getTime();
            const dateB = new Date(b.joinedAt).getTime();
            return dateA - dateB;
        });
    }, [members]);

    const queryClient = useQueryClient();
    const [isEditingBio, setIsEditingBio] = useState(false);
    const [newBio, setNewBio] = useState("");

    const updateBioMutation = useMutation({
        mutationFn: async () => {
            await apiRequest("/api/hiq/me", {
                method: "PATCH",
                body: { introduction: newBio }
            });
        },
        onSuccess: () => {
            // The member roster is bundled in the crew-detail query, so invalidate that exact key
            // (a prefix like ["/api/hiq/crews"] does not match [`/api/hiq/crews/${crewId}`]).
            queryClient.invalidateQueries({ queryKey: [`/api/hiq/crews/${crewId}`] });
            queryClient.invalidateQueries({ queryKey: ["/api/hiq/me"] });
            setIsEditingBio(false);
            if (selectedMember) {
                setSelectedMember({
                    ...selectedMember,
                    member: { ...selectedMember.member, introduction: newBio }
                });
            }
        }
    });

    const handleMemberClick = (memberItem: CrewMemberItemType) => {
        setIsEditingBio(false);
        setSelectedMember(memberItem);
        setIsSheetOpen(true);
    };


    const { data: memberActivities } = useQuery({
        queryKey: [`/api/hiq/crews/activities/member`, selectedMember?.member?.id, crewId],
        queryFn: async () => {
            return await apiRequest(`/api/hiq/crews/activities/member/${selectedMember?.member?.id}?crewId=${crewId}`);
        },
        enabled: isSheetOpen && !!selectedMember
    });

    const isMe = currentMemberId === selectedMember?.member?.id;

    // 나와의 상대전적 — 라이벌 화면에만 있던 정보를 크루 프로필에도 붙인다.
    // 크루에서 멤버를 열었을 때 가장 궁금한 숫자다("나랑 붙으면 누가 이겼더라").
    const { data: h2h } = useQuery<{ total: number; myWins: number; friendWins: number; winRate: number }>({
        queryKey: [`/api/hiq/stats/h2h/${selectedMember?.member?.id}`],
        // 이 전적은 당구 경기만 센다 — 골프 크루에서 "나와 N승 M패" 로 보여주면 남의 종목 숫자다(2026-09-09 검토).
        enabled: isSheetOpen && !!selectedMember && !isMe && sportCategory !== "GOLF",
        staleTime: 60 * 1000,
    });

    // 대결 신청 상태 — 내가 보낸 것/받은 것(24시간 내 대기 중)
    const { data: challengeData } = useQuery<{ challenges: any[]; myId: string }>({
        queryKey: [`/api/hiq/crews/${crewId}/challenges`],
        enabled: isSheetOpen,
        staleTime: 30 * 1000,
    });
    const sentChallenge = challengeData?.challenges?.find(
        (c) => c.fromMemberId === currentMemberId && c.toMemberId === selectedMember?.member?.id);
    const receivedChallenge = challengeData?.challenges?.find(
        (c) => c.toMemberId === currentMemberId && c.fromMemberId === selectedMember?.member?.id);

    const invalidateChallenges = () =>
        queryClient.invalidateQueries({ queryKey: [`/api/hiq/crews/${crewId}/challenges`] });

    const challengeMutation = useMutation({
        mutationFn: async () => apiRequest(`/api/hiq/crews/${crewId}/challenge`, {
            method: "POST", body: { toMemberId: selectedMember?.member?.id },
        }),
        onSuccess: () => { toast({ title: t("crewMemberList.challengeSent") }); invalidateChallenges(); },
        onError: (e: any) => toast({ title: e?.message || t("crewMemberList.challengeFailed"), variant: "destructive" }),
    });

    const respondMutation = useMutation({
        mutationFn: async (accept: boolean) =>
            apiRequest(`/api/hiq/crews/${crewId}/challenge/${receivedChallenge?.id}/respond`, {
                method: "POST", body: { accept },
            }),
        onSuccess: (_r, accept) => {
            toast({ title: accept ? t("crewMemberList.challengeAccepted") : t("crewMemberList.challengeDeclined") });
            invalidateChallenges();
        },
        onError: (e: any) => toast({ title: e?.message || t("crewMemberList.challengeFailed"), variant: "destructive" }),
    });

    const sheetData = useMemo(() => {
        if (!selectedMember) return null;
        const m = selectedMember.member;

        if (sportCategory === 'GOLF') {
            const golfAvgS = m.golfAvgScore || 0;
            const golfHandi = m.golfHandicap || 0;
            // 데이터가 전혀 없는 경우 0으로 처리하여 '-'가 나오도록 함
            const golfScore = golfAvgS > 0 ? golfAvgS : (golfHandi > 0 ? golfHandi + 72 : 0);
            const tier = getTier(golfScore, false, 'GOLF');
            return { golfScore, tier };
        } else {
            // BILLIARDS
            const tier = getTier(Number(m.handi4c || 0), false, 'BILLIARDS');
            return { golfScore: 0, tier };
        }
    }, [selectedMember, sportCategory]);

    return (
        <>
            <div className="flex flex-col gap-2">
                {sortedMembers.map((item) => (
                    <MemberListItem
                        key={item.member.id}
                        item={item}
                        currentMemberId={currentMemberId}
                        sportCategory={sportCategory}
                        tournamentWins={winsByMember[item.member.id]}
                        onClick={() => handleMemberClick(item)}
                    />
                ))}
            </div>

            <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
                <SheetContent side="bottom" className="h-[75vh] rounded-t-[2rem] bg-white border-t border-black/10 p-0 overflow-hidden">
                    <SheetTitle className="sr-only">{t("crewMemberList.sheetTitle")}</SheetTitle>
                    <SheetDescription className="sr-only">{t("crewMemberList.sheetDescription")}</SheetDescription>

                    {selectedMember && sheetData && (
                        /* 액션바를 하단에 고정하기 위해 스크롤을 본문에만 준다.
                           예전에는 시트 전체가 스크롤돼 대결 버튼이 내용에 밀려 사라졌다. */
                        <div className="h-full flex flex-col">
                        <div className="flex-1 min-h-0 overflow-y-auto">
                            <div className="relative pt-12 pb-8 px-6 flex flex-col items-center bg-white">
                                <div className="absolute top-3 w-12 h-1 bg-black/10 rounded-full left-1/2 -translate-x-1/2" />
                                {/* 회원 신고·차단 — 소개글·프로필 사진도 UGC 다 (Apple 1.2). 오른쪽 위는 시트 닫기 자리라 왼쪽에 둔다 */}
                                {!isMe && currentMemberId && (
                                    <div className="absolute top-3 left-3">
                                        <UgcActionMenu
                                            targetType="member"
                                            targetId={selectedMember.member.id}
                                            authorId={selectedMember.member.id}
                                            authorName={selectedMember.member.nickname || selectedMember.member.name}
                                            onBlocked={() => setIsSheetOpen(false)}
                                            align="left"
                                            className="w-11 h-11"
                                            iconClassName="w-5 h-5"
                                        />
                                    </div>
                                )}
                                <Avatar className={cn(
                                    "w-24 h-24 mb-4 border-4",
                                    selectedMember.member.gender === 'female' ? "border-pink-500/30" : "border-black/10"
                                )}>
                                    <AvatarImage
                                        src={selectedMember.member.profileImageUrl}
                                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                    />
                                    <AvatarFallback className="text-2xl font-semibold bg-surface-3 text-black/40">
                                        {selectedMember.member.nickname?.[0] || selectedMember.member.name?.[0]}
                                    </AvatarFallback>
                                </Avatar>

                                <div className="flex items-center gap-3 mb-1">
                                    <h2 className="text-3xl font-semibold text-ink-1 tracking-tight">
                                        {selectedMember.member.nickname || selectedMember.member.name}
                                    </h2>
                                    <div className="flex items-center gap-1.5">
                                        {selectedMember.role === 'leader' && (
                                            <Badge variant="outline" className="bg-[#cba258]/12 border-[#cba258]/25 text-[#cba258] gap-1 px-2">
                                                <LucideCrown className="w-3 h-3" /> {t("crewMemberList.leader")}
                                            </Badge>
                                        )}
                                        {selectedMember.role === 'manage' && (
                                            <Badge variant="outline" className="bg-brand/10 border-brand/25 text-brand gap-1 px-2">
                                                <LucideShield className="w-3 h-3" /> {t("crewMemberList.manager")}
                                            </Badge>
                                        )}
                                    </div>
                                </div>
                                <p className="text-[13px] font-medium text-black/55 mb-6">
                                    {selectedMember.member.birthYear ? `${Math.floor((new Date().getFullYear() - selectedMember.member.birthYear) / 10) * 10}${t("crewMemberList.ageSuffix")}` : t("crewMemberList.ageUnknown")}
                                    {' • '}
                                    {selectedMember.member.gender === 'female' ? t("crewMemberList.female") : t("crewMemberList.male")}
                                </p>

                                <MemberStatsDisplay
                                    sportCategory={sportCategory}
                                    sheetData={sheetData}
                                    member={selectedMember.member}
                                />

                                {/* 나와의 상대전적 — 크루 멤버를 열었을 때 가장 궁금한 숫자 */}
                                {!isMe && h2h && h2h.total > 0 && (
                                    <div className="flex items-center gap-2 px-3.5 py-2 rounded-full bg-brand/[0.07] mb-1">
                                        <LucideSwords className="w-3.5 h-3.5 text-brand" />
                                        <span className="text-[12.5px] font-bold text-brand tabular-nums">
                                            {t("crewMemberList.h2hLabel")} {h2h.myWins}{t("crewMemberList.winUnit")} {h2h.friendWins}{t("crewMemberList.loseUnit")}
                                        </span>
                                    </div>
                                )}
                                {/* 전적·하이런 — 데이터가 있는데 안 쓰고 있었다 */}
                                {sportCategory !== "GOLF" && (selectedMember.member.totalBilliardsGames || 0) > 0 && (
                                    <p className="text-[12px] font-medium text-black/45 tabular-nums">
                                        {t("crewMemberList.totalGames")} {selectedMember.member.totalBilliardsGames}
                                        {(selectedMember.member as any).highRun3c || (selectedMember.member as any).highRun4c
                                            ? ` · ${t("crewMemberList.highRun")} ${Math.max((selectedMember.member as any).highRun3c || 0, (selectedMember.member as any).highRun4c || 0)}`
                                            : ""}
                                    </p>
                                )}
                            </div>

                            {/* Activity Persona & Stats */}
                            {memberActivities && (
                                <div className="px-6 pb-4">
                                    <div className="flex items-center gap-2 mb-3">
                                        <div className="w-1.5 h-1.5 rounded-full bg-brand" />
                                        <h2 className="text-[15px] font-semibold text-black/55">{t("crewMemberList.activityTendency")}</h2>
                                    </div>
                                    <MemberActivityStats
                                        activities={memberActivities.activities || []}
                                        totalCount={memberActivities.totalCount || 0}
                                        sportCategory={sportCategory as 'GOLF' | 'BILLIARDS'}
                                    />
                                </div>
                            )}

                            <div className="px-6 py-4 space-y-4">
                                {/* 소갯말 카드 */}
                                <div className="p-5 rk-card flex flex-col gap-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[12px] font-medium text-black/55">{t("crewMemberList.bioLabel")}</span>
                                        {currentMemberId === selectedMember.member.id && !isEditingBio && (
                                            <button
                                                onClick={() => {
                                                    setNewBio(selectedMember.member.introduction || "");
                                                    setIsEditingBio(true);
                                                }}
                                                className="p-1 hover:bg-black/[0.04] rounded"
                                                title={t("crewMemberList.editBio")}
                                            >
                                                <LucideEdit2 className="w-3 h-3 text-black/40" />
                                            </button>
                                        )}
                                    </div>

                                    {isEditingBio ? (
                                        <div className="flex flex-col gap-3">
                                            <textarea
                                                autoFocus
                                                className="w-full bg-black/[0.04] rounded-tile p-4 text-sm text-ink-1 placeholder:text-black/40 focus:outline-none focus:border-brand/50 min-h-[80px] resize-none"
                                                value={newBio}
                                                onChange={(e) => setNewBio(e.target.value)}
                                                placeholder={t("crewMemberList.bioPlaceholder")}
                                            />
                                            <div className="flex gap-2">
                                                <Button
                                                    onClick={() => setIsEditingBio(false)}
                                                    variant="ghost"
                                                    className="flex-1 h-9 text-black/55 text-xs"
                                                >
                                                    {t("crewMemberList.cancel")}
                                                </Button>
                                                <Button
                                                    onClick={() => updateBioMutation.mutate()}
                                                    disabled={updateBioMutation.isPending}
                                                    className="flex-1 h-9 rk-btn-primary text-[13px] rounded-tile"
                                                >
                                                    {updateBioMutation.isPending ? <LucideLoader2 className="w-4 h-4 animate-spin" /> : <><LucideCheck className="w-4 h-4 mr-1" /> {t("crewMemberList.save")}</>}
                                                </Button>
                                            </div>
                                        </div>
                                    ) : (
                                        <p className="text-black/70 text-sm leading-relaxed font-medium">
                                            {selectedMember.member.introduction || t("crewMemberList.noBio")}
                                        </p>
                                    )}
                                </div>
                                {/* 크루 활동 정보 카드 */}
                                <div className="p-5 rk-card space-y-4">
                                    {/* 가입일 */}
                                    <div className="flex items-center justify-between">
                                        <span className="text-[12px] font-medium text-black/55">{t("crewMemberList.joinedDate")}</span>
                                        <span className="text-[13px] font-semibold text-black/60 tabular-nums">
                                            {new Date(selectedMember.joinedAt).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\. /g, '.').replace(/\.$/, '')}
                                        </span>
                                    </div>
                                    {/* 활동 카운트 3칸 — 전부 0이면 숨긴다. 0/0/0 이 큰 칸 3개를
                                        차지하면서 정작 당구 기록을 아래로 밀어내고 있었다. */}
                                    {((selectedMember.activityCounts?.group1 || 0)
                                        + (selectedMember.activityCounts?.group2 || 0)
                                        + (selectedMember.activityCounts?.group3 || 0)) > 0 && (
                                    <div className="grid grid-cols-3 gap-2">
                                        <div className="flex flex-col items-center gap-1.5 py-3 rounded-tile bg-black/[0.04] ">
                                            <LucideCalendarCheck className="w-4 h-4 text-brand" />
                                            <span className="text-[17px] font-bold text-ink-1 tabular-nums">
                                                {selectedMember.activityCounts?.group1 || 0}
                                                <span className="text-[12px] ml-0.5 font-medium text-black/40">{t("crewMemberList.countUnit")}</span>
                                            </span>
                                            <span className="text-[12px] font-medium text-black/55">{sportCategory === 'GOLF' ? t("crewMemberList.rounding") : t("crewMemberList.meetup")}</span>
                                        </div>
                                        <div className="flex flex-col items-center gap-1.5 py-3 rounded-tile bg-black/[0.04] ">
                                            {sportCategory === 'GOLF' ? <LucideMonitor className="w-4 h-4 text-brand" /> : <LucideTrophy className="w-4 h-4 text-brand" />}
                                            <span className="text-[17px] font-bold text-ink-1 tabular-nums">
                                                {selectedMember.activityCounts?.group2 || 0}
                                                <span className="text-[12px] ml-0.5 font-medium text-black/40">{t("crewMemberList.countUnit")}</span>
                                            </span>
                                            <span className="text-[12px] font-medium text-black/55">{sportCategory === 'GOLF' ? t("crewMemberList.screenGolf") : t("crewMemberList.tournament")}</span>
                                        </div>
                                        <div className="flex flex-col items-center gap-1.5 py-3 rounded-tile bg-black/[0.04] ">
                                            <LucideBeer className="w-4 h-4 text-brand" />
                                            <span className="text-[17px] font-bold text-ink-1 tabular-nums">
                                                {selectedMember.activityCounts?.group3 || 0}
                                                <span className="text-[12px] ml-0.5 font-medium text-black/40">{t("crewMemberList.countUnit")}</span>
                                            </span>
                                            <span className="text-[12px] font-medium text-black/55">{t("crewMemberList.afterParty")}</span>
                                        </div>
                                    </div>
                                    )}
                                </div>

                            </div>

                            </div>

                            {/* 하단 액션 — 예전에는 대결·메시지 둘 다 disabled 라서 프로필을 열어도
                                할 수 있는 게 없었다. 대결 신청을 실제로 살리고(상대에게 알림),
                                메시지는 신고·차단이 필수인 UGC 라 별도 작업으로 미룬다. */}
                            {!isMe && (
                            <div className="shrink-0 px-6 pt-4 pb-6 bg-cloth flex flex-col gap-2 pb-safe">
                                {receivedChallenge ? (
                                    <>
                                        <p className="text-[13px] font-semibold text-white/90 text-center mb-1">
                                            {t("crewMemberList.challengeReceived")}
                                        </p>
                                        <div className="flex gap-3">
                                            <Button
                                                onClick={() => respondMutation.mutate(true)}
                                                disabled={respondMutation.isPending}
                                                className="flex-1 h-12 rounded-tile font-bold text-[15px] bg-ball-yellow text-[rgba(0,0,0,0.82)] hover:bg-ball-yellow active:scale-[0.98] transition-transform border-none"
                                            >
                                                <LucideSwords className="w-4 h-4 mr-2" />
                                                {t("crewMemberList.accept")}
                                            </Button>
                                            <Button
                                                onClick={() => respondMutation.mutate(false)}
                                                disabled={respondMutation.isPending}
                                                variant="outline"
                                                className="h-12 px-5 rounded-tile border-white/20 bg-white/10 text-white/80 hover:bg-white/15 hover:text-white"
                                            >
                                                {t("crewMemberList.decline")}
                                            </Button>
                                        </div>
                                    </>
                                ) : (
                                    <Button
                                        onClick={() => challengeMutation.mutate()}
                                        disabled={!!sentChallenge || challengeMutation.isPending}
                                        className="w-full h-12 rounded-tile font-bold text-[15px] bg-ball-yellow text-[rgba(0,0,0,0.82)] hover:bg-ball-yellow active:scale-[0.98] transition-transform disabled:opacity-40 border-none"
                                        title={t("crewMemberList.matchRequestTitle")}
                                    >
                                        {challengeMutation.isPending ? (
                                            <LucideLoader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <>
                                                <LucideSwords className="w-4 h-4 mr-2" />
                                                {sentChallenge ? t("crewMemberList.challengeWaiting") : t("crewMemberList.matchRequest")}
                                            </>
                                        )}
                                    </Button>
                                )}
                                <p className="text-[12px] font-medium text-white/55 text-center">
                                    {sentChallenge ? t("crewMemberList.challengeWaitingHint") : t("crewMemberList.challengeHint")}
                                </p>
                            </div>
                            )}
                        </div>
                    )}
                </SheetContent>
            </Sheet>
        </>
    );
}

function MemberListItem({ item, currentMemberId, sportCategory, onClick, tournamentWins }: {
    item: CrewMemberItemType,
    currentMemberId?: string,
    sportCategory: string,
    onClick: () => void,
    tournamentWins?: number,
}) {
    const { t } = useT();
    const m = item.member;
    const isLeader = item.role === "leader";
    const isAdmin = item.role === "manage";
    const isMe = m.id === currentMemberId;

    const joinedDate = new Date(item.joinedAt);
    const daysSinceJoined = (Date.now() - joinedDate.getTime()) / (1000 * 3600 * 24);
    const isNewbie = daysSinceJoined < 7;

    const avg3c = m.avg3c && m.avg3c > 0 ? m.avg3c.toFixed(3) : "0.000";
    const avg4c = m.avg4c && m.avg4c > 0 ? m.avg4c.toFixed(3) : "0.000";

    const golfHandi = m.golfHandicap || 0;
    const golfAvgS = m.golfAvgScore || 0;

    // 데이터가 없는 경우 0으로 처리 (화면에는 '-' 출력)
    const golfScore = golfAvgS > 0 ? golfAvgS : (golfHandi > 0 ? golfHandi + 72 : 0);

    const tier = sportCategory === 'GOLF'
        ? getTier(golfScore, false, 'GOLF')
        : getTier(Number(m.handi4c || 0), false, 'BILLIARDS');

    const tierColor = TIER_COLOR[tier.label] || "text-black/55";
    const hasStat = sportCategory === 'GOLF' ? golfScore > 0 : !!(m.avg4c && m.avg4c > 0);
    const statValue = sportCategory === 'GOLF' ? golfScore.toFixed(0) : avg4c;
    const statUnit = sportCategory === 'GOLF' ? t("crewMemberList.avg") : t("crewMemberList.fourBall");

    return (
        <div
            onClick={onClick}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && onClick()}
            className={cn(
                "flex items-center gap-3.5 px-4 py-3.5 mb-2.5 rounded-2xl transition-all cursor-pointer group outline-none focus-visible:ring-2 focus-visible:ring-brand active:scale-[0.99]",
                isMe
                    ? "bg-brand/[0.09]"
                    : "bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:shadow-[0_3px_10px_rgba(0,0,0,0.06)]"
            )}
        >
            {/* Avatar */}
            <div className="relative shrink-0">
                <Avatar className="w-12 h-12">
                    <AvatarImage
                        src={m.profileImageUrl}
                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        className="object-cover"
                    />
                    <AvatarFallback className="bg-brand/10 text-brand text-base font-bold">
                        {m.nickname?.[0] || m.name?.[0]}
                    </AvatarFallback>
                </Avatar>
                {isMe && (
                    <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-brand rounded-full border-2 border-[#f2f0eb]" />
                )}
            </div>

            {/* Identity */}
            <div className="flex flex-col min-w-0 flex-1 gap-1">
                <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-ink-1 font-semibold text-[16px] leading-tight tracking-tight truncate">
                        {m.nickname || m.name}
                    </span>
                    {isLeader && <LucideCrown className="w-3.5 h-3.5 text-[#cba258] shrink-0" />}
                    {/* 크루 대회 우승 횟수 — 크루 안에서만 보이는 명예라 부담이 없다. */}
                    {!!tournamentWins && tournamentWins > 0 && (
                        <span
                            className="shrink-0 inline-flex items-center gap-0.5 text-[12px] font-semibold text-gold rk-num"
                            title={t("crewMember.wins").replace("{n}", String(tournamentWins))}
                        >
                            <LucideTrophy className="w-3.5 h-3.5" />
                            {tournamentWins}
                        </span>
                    )}
                    {isAdmin && <LucideShield className="w-3.5 h-3.5 text-black/40 shrink-0" />}
                    {isMe && (
                        <span className="shrink-0 px-1.5 py-px rounded-full text-[12px] font-semibold text-brand bg-brand/12">{t("crewMemberList.me")}</span>
                    )}
                </div>
                <div className="flex items-center gap-1.5 min-w-0 text-[12px] leading-none">
                    <span className={cn("font-semibold shrink-0", tierColor)}>{tier.label}</span>
                    {isNewbie && <><span className="text-black/20">·</span><span className="text-brand/80 font-medium shrink-0">{t("crewMemberList.newbie")}</span></>}
                    <span className="text-black/20 shrink-0">·</span>
                    <span className="text-black/40 font-medium truncate">
                        {m.introduction || (sportCategory === 'GOLF' ? t("crewMemberList.defaultBioGolf") : t("crewMemberList.defaultBioBilliards"))}
                    </span>
                </div>
            </div>

            {/* Stat */}
            <div className="flex items-center gap-2.5 shrink-0">
                {hasStat && (
                    <div className="flex flex-col items-end leading-none">
                        <span className="text-[18px] font-bold text-ink-1 tabular-nums tracking-tight">{statValue}</span>
                        <span className="text-[12px] font-medium text-black/40 mt-1">{statUnit}</span>
                    </div>
                )}
                <LucideChevronRight className="w-4 h-4 text-black/30 group-hover:text-black/50 transition-colors" />
            </div>
        </div>
    );
}

// Tier label → refined accent color (medal metals, tuned for the warm light theme).
const TIER_COLOR: Record<string, string> = {
    "플래티넘": "text-cyan-600",
    "골드": "text-[#cba258]",
    "실버": "text-slate-500",
    "브론즈": "text-orange-600",
};

// 당구공 한 알 위에 숫자를 얹은 스탯. 공 색이 종목을 말한다(노랑=4구, 빨강=3쿠션).
// 하이라이트는 실제 공의 반사광을 흉내 낸 작은 점 하나 — 그라데이션 워시가 아니다.
const BallStat = ({ label, ballColor, value, sub }: { label: string; ballColor: string; value: string | null; sub: string }) => (
    <div className="flex flex-col items-center gap-2">
        <div
            className="relative w-[68px] h-[68px] rounded-full flex items-center justify-center shadow-[0_3px_10px_rgba(0,0,0,0.18)]"
            style={{ background: value ? ballColor : "var(--surface-3)" }}
        >
            <span className="absolute top-[11px] left-[15px] w-[13px] h-[9px] rounded-full bg-white/35" />
            <span className={cn("text-[13px] font-bold tracking-tight", value ? "text-white/90" : "text-black/30")}>{label}</span>
        </div>
        <span className="text-[26px] font-bold text-ink-1 tracking-tight tabular-nums leading-none">
            {value ?? <span className="text-[20px] text-black/25">–</span>}
        </span>
        <span className="text-[11.5px] text-black/45 font-medium">{sub}</span>
    </div>
);

const MemberStatsDisplay = ({ sportCategory, sheetData, member }: any) => {
    const { t } = useT();
    return (
    <div className="flex items-center justify-center gap-8 w-full max-w-sm py-4">
        {sportCategory === 'GOLF' ? (
            <>
                <div className="flex flex-col items-center gap-1">
                    <div className={cn("flex items-center gap-1 px-2 py-0.5 rounded-md mb-1", sheetData.tier.class)}>
                        <span className="text-[12px] font-semibold">{sheetData.tier.label}</span>
                    </div>
                    <span className="text-4xl font-bold text-ink-1 tracking-tight tabular-nums">
                        {sheetData.golfScore > 0 ? sheetData.golfScore.toFixed(0) : "-"}
                    </span>
                    <span className="text-[12px] text-black/55 font-medium">{t("crewMemberList.avgScore")}</span>
                </div>
                <div className="w-px h-16 bg-black/10" />
                <div className="flex flex-col items-center gap-1">
                    <span className="text-[12px] text-brand font-semibold bg-brand/10 px-2 py-0.5 rounded-full mb-1">{t("crewMemberList.bestScore")}</span>
                    <span className="text-4xl font-bold text-ink-1 tracking-tight tabular-nums">
                        {member.golfBestScore && member.golfBestScore > 0 ? member.golfBestScore : "-"}
                    </span>
                    <span className="text-[12px] text-black/55 font-medium">{t("crewMemberList.best")}</span>
                </div>
            </>
        ) : (
            <>
                {/* 당구공 언어 — 4구는 노란 공, 3쿠션은 빨간 공. 초록 라사 위에 공이 놓인 모양이라
                    한눈에 종목이 구분된다(장식이 아니라 의미 코드).
                    기록이 없으면 0.000 을 띄우지 않는다 — 신규 멤버 프로필이 더 빈약해 보였다.
                    다마수를 함께 적는 이유: 같이 칠 때 실제로 필요한 숫자다. */}
                <BallStat
                    label="4C"
                    ballColor="var(--ball-yellow)"
                    value={member.avg4c ? member.avg4c.toFixed(3) : null}
                    sub={member.handi4c ? `${member.handi4c}${t("crewMemberList.handiUnit")}` : t("crewMemberList.avg")}
                />
                <BallStat
                    label="3C"
                    ballColor="var(--ball-red)"
                    value={member.avg3c ? member.avg3c.toFixed(3) : null}
                    sub={member.handi3c ? `${member.handi3c}${t("crewMemberList.handiUnit")}` : t("crewMemberList.avg")}
                />
            </>
        )}
    </div>
    );
};



