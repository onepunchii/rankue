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
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { getTier } from "@/lib/hiqUtils";
import { apiRequest } from "@/lib/queryClient";
import { MemberActivityStats } from "@/components/hiq/member/MemberActivityStats";

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
                        onClick={() => handleMemberClick(item)}
                    />
                ))}
            </div>

            <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
                <SheetContent side="bottom" className="h-[75vh] rounded-t-[2rem] bg-[#141416] border-t border-white/10 p-0 overflow-hidden">
                    <SheetTitle className="sr-only">멤버 상세 정보</SheetTitle>
                    <SheetDescription className="sr-only">선택한 멤버의 상세 통계와 정보를 확인합니다.</SheetDescription>

                    {selectedMember && sheetData && (
                        <div className="h-full flex flex-col overflow-y-auto pb-safe">
                            <div className="relative pt-12 pb-8 px-6 flex flex-col items-center bg-[#141416]">
                                <div className="absolute top-3 w-12 h-1 bg-white/10 rounded-full left-1/2 -translate-x-1/2" />
                                <Avatar className={cn(
                                    "w-24 h-24 mb-4 border-4",
                                    selectedMember.member.gender === 'female' ? "border-pink-500/30" : "border-white/5"
                                )}>
                                    <AvatarImage
                                        src={selectedMember.member.profileImageUrl}
                                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                    />
                                    <AvatarFallback className="text-2xl font-semibold bg-surface-3 text-white/45">
                                        {selectedMember.member.nickname?.[0] || selectedMember.member.name?.[0]}
                                    </AvatarFallback>
                                </Avatar>

                                <div className="flex items-center gap-3 mb-1">
                                    <h2 className="text-3xl font-semibold text-white tracking-tight">
                                        {selectedMember.member.nickname || selectedMember.member.name}
                                    </h2>
                                    <div className="flex items-center gap-1.5">
                                        {selectedMember.role === 'leader' && (
                                            <Badge variant="outline" className="bg-yellow-500/10 border-yellow-500/20 text-yellow-500 gap-1 px-2">
                                                <LucideCrown className="w-3 h-3" /> 크루장
                                            </Badge>
                                        )}
                                        {selectedMember.role === 'manage' && (
                                            <Badge variant="outline" className="bg-blue-500/10 border-blue-500/20 text-blue-400 gap-1 px-2">
                                                <LucideShield className="w-3 h-3" /> 운영진
                                            </Badge>
                                        )}
                                    </div>
                                </div>
                                <p className="text-[13px] font-medium text-white/45 mb-6">
                                    {selectedMember.member.birthYear ? `${Math.floor((new Date().getFullYear() - selectedMember.member.birthYear) / 10) * 10}대` : '연령 미입력'}
                                    {' • '}
                                    {selectedMember.member.gender === 'female' ? '여성' : '남성'}
                                </p>

                                <MemberStatsDisplay
                                    sportCategory={sportCategory}
                                    sheetData={sheetData}
                                    member={selectedMember.member}
                                />
                            </div>

                            {/* Activity Persona & Stats */}
                            {memberActivities && (
                                <div className="px-6 pb-4">
                                    <div className="flex items-center gap-2 mb-3">
                                        <div className="w-1.5 h-1.5 rounded-full bg-brand" />
                                        <h2 className="text-[15px] font-semibold text-white/55">활동 성향</h2>
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
                                        <span className="text-[12px] font-medium text-white/45">소개글</span>
                                        {currentMemberId === selectedMember.member.id && !isEditingBio && (
                                            <button
                                                onClick={() => {
                                                    setNewBio(selectedMember.member.introduction || "");
                                                    setIsEditingBio(true);
                                                }}
                                                className="p-1 hover:bg-white/5 rounded"
                                                title="소개글 수정"
                                            >
                                                <LucideEdit2 className="w-3 h-3 text-white/40" />
                                            </button>
                                        )}
                                    </div>

                                    {isEditingBio ? (
                                        <div className="flex flex-col gap-3">
                                            <textarea
                                                autoFocus
                                                className="w-full bg-white/5 border border-white/10 rounded-tile p-4 text-sm text-white focus:outline-none focus:border-brand/50 min-h-[80px] resize-none"
                                                value={newBio}
                                                onChange={(e) => setNewBio(e.target.value)}
                                                placeholder="자신을 한 줄로 소개해 보세요!"
                                            />
                                            <div className="flex gap-2">
                                                <Button
                                                    onClick={() => setIsEditingBio(false)}
                                                    variant="ghost"
                                                    className="flex-1 h-9 text-white/40 text-xs"
                                                >
                                                    취소
                                                </Button>
                                                <Button
                                                    onClick={() => updateBioMutation.mutate()}
                                                    disabled={updateBioMutation.isPending}
                                                    className="flex-1 h-9 rk-btn-primary text-[13px] rounded-tile"
                                                >
                                                    {updateBioMutation.isPending ? <LucideLoader2 className="w-4 h-4 animate-spin" /> : <><LucideCheck className="w-4 h-4 mr-1" /> 저장</>}
                                                </Button>
                                            </div>
                                        </div>
                                    ) : (
                                        <p className="text-white/80 text-sm leading-relaxed font-medium">
                                            {selectedMember.member.introduction || "아직 소갯말이 없습니다."}
                                        </p>
                                    )}
                                </div>
                                {/* 크루 활동 정보 카드 */}
                                <div className="p-5 rk-card space-y-4">
                                    {/* 가입일 */}
                                    <div className="flex items-center justify-between">
                                        <span className="text-[12px] font-medium text-white/45">크루 가입일</span>
                                        <span className="text-[13px] font-semibold text-white/60 tabular-nums">
                                            {new Date(selectedMember.joinedAt).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\. /g, '.').replace(/\.$/, '')}
                                        </span>
                                    </div>
                                    {/* 활동 카운트 3칸 */}
                                    <div className="grid grid-cols-3 gap-2">
                                        <div className="flex flex-col items-center gap-1.5 py-3 rounded-tile bg-white/[0.04] border border-surface-line">
                                            <LucideCalendarCheck className="w-4 h-4 text-brand" />
                                            <span className="text-[17px] font-bold text-white tabular-nums">
                                                {selectedMember.activityCounts?.group1 || 0}
                                                <span className="text-[12px] ml-0.5 font-medium text-white/38">회</span>
                                            </span>
                                            <span className="text-[12px] font-medium text-white/45">{sportCategory === 'GOLF' ? '라운딩' : '모임'}</span>
                                        </div>
                                        <div className="flex flex-col items-center gap-1.5 py-3 rounded-tile bg-white/[0.04] border border-surface-line">
                                            {sportCategory === 'GOLF' ? <LucideMonitor className="w-4 h-4 text-brand" /> : <LucideTrophy className="w-4 h-4 text-brand" />}
                                            <span className="text-[17px] font-bold text-white tabular-nums">
                                                {selectedMember.activityCounts?.group2 || 0}
                                                <span className="text-[12px] ml-0.5 font-medium text-white/38">회</span>
                                            </span>
                                            <span className="text-[12px] font-medium text-white/45">{sportCategory === 'GOLF' ? '스크린' : '대회'}</span>
                                        </div>
                                        <div className="flex flex-col items-center gap-1.5 py-3 rounded-tile bg-white/[0.04] border border-surface-line">
                                            <LucideBeer className="w-4 h-4 text-brand" />
                                            <span className="text-[17px] font-bold text-white tabular-nums">
                                                {selectedMember.activityCounts?.group3 || 0}
                                                <span className="text-[12px] ml-0.5 font-medium text-white/38">회</span>
                                            </span>
                                            <span className="text-[12px] font-medium text-white/45">뒷풀이</span>
                                        </div>
                                    </div>
                                </div>

                            </div>

                            <div className="mt-4 p-6 bg-[#141416] border-t border-white/5 flex flex-col gap-2 pb-safe">
                                <div className="flex gap-3">
                                    <Button
                                        disabled
                                        className="flex-1 h-12 rk-btn-primary rounded-tile disabled:opacity-40"
                                        title="대결 신청 (준비 중)"
                                    >
                                        <LucideSwords className="w-4 h-4 mr-2" />
                                        대결 신청
                                    </Button>
                                    <Button
                                        disabled
                                        variant="outline"
                                        className="h-12 w-12 rounded-xl border-white/10 bg-white/5 p-0 disabled:opacity-40"
                                        title="메시지 보내기 (준비 중)"
                                    >
                                        <LucideMessageCircle className="w-5 h-5" />
                                    </Button>
                                </div>
                                <p className="text-[12px] font-medium text-white/38 text-center">준비 중인 기능입니다</p>
                            </div>
                        </div>
                    )}
                </SheetContent>
            </Sheet>
        </>
    );
}

function MemberListItem({ item, currentMemberId, sportCategory, onClick }: {
    item: CrewMemberItemType,
    currentMemberId?: string,
    sportCategory: string,
    onClick: () => void
}) {
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

    return (
        <div
            onClick={onClick}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && onClick()}
            className={cn(
                "flex items-center justify-between p-4 mb-2 rounded-tile border transition-all duration-300 cursor-pointer group outline-none focus-visible:ring-2 focus-visible:ring-brand",
                isMe
                    ? "bg-brand/[0.06] border-brand/20"
                    : "bg-surface-2 border-surface-line hover:border-white/10"
            )}
        >
            <div className="flex items-center gap-4">
                <div className="relative">
                    <Avatar className={cn(
                        "w-14 h-14 border-2 transition-transform duration-500 group-hover:scale-105",
                        isMe ? "border-brand/30" : "border-surface-line"
                    )}>
                        <AvatarImage
                            src={m.profileImageUrl}
                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                            className="object-cover"
                        />
                        <AvatarFallback className="bg-surface-3 text-white/40 text-lg font-semibold">
                            {m.nickname?.[0] || m.name?.[0]}
                        </AvatarFallback>
                    </Avatar>
                    {isMe && (
                        <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-brand rounded-full border-2 border-surface-2 flex items-center justify-center">
                            <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                        </div>
                    )}
                </div>

                <div className="flex flex-col justify-center gap-1.5">
                    <div className="flex items-center gap-1.5">
                        <span className="text-white font-semibold text-[17px] leading-tight tracking-tight">
                            {m.nickname || m.name}
                        </span>
                        {isLeader && <LucideCrown className="w-3.5 h-3.5 text-yellow-500" />}
                        {isAdmin && <LucideShield className="w-3.5 h-3.5 text-blue-400" />}

                        <div className={cn(
                            "flex items-center gap-1 px-1.5 py-0.5 rounded-lg bg-white/5 border border-white/5 ml-1",
                            tier.class
                        )}>
                            <span className="text-[12px] font-semibold">{tier.label}</span>
                        </div>
                        <div className="flex items-center gap-1 ml-1">
                            {isMe && <Badge variant="secondary" className="px-1.5 py-0.5 h-auto text-[12px] bg-brand/12 text-brand border-0">나</Badge>}
                            {isNewbie && <Badge variant="secondary" className="px-1.5 py-0.5 h-auto text-[12px] bg-rose-500/10 text-rose-500 border-0">New</Badge>}
                            <Badge variant="secondary" className={cn(
                                "px-1.5 py-0.5 h-auto text-[12px] border-0",
                                m.gender === 'female' ? "bg-pink-500/10 text-pink-500" : "bg-blue-500/10 text-blue-400"
                            )}>
                                {m.gender === 'female' ? '여' : '남'}
                            </Badge>
                        </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                        <p className="text-[13px] text-white/50 leading-tight line-clamp-1">
                            {m.introduction || (sportCategory === 'GOLF' ? "골프를 즐기는 랭커" : "당구를 즐기는 랭커")}
                        </p>
                    </div>
                </div>
            </div>
            <div className="flex items-center gap-3 pl-2">
                {sportCategory === 'GOLF'
                    ? golfScore > 0 && (
                        <div className="flex flex-col items-end leading-none">
                            <span className="text-[17px] font-bold text-white tabular-nums tracking-tight">{golfScore.toFixed(0)}</span>
                            <span className="text-[12px] font-medium text-white/45 mt-1">평균</span>
                        </div>
                    )
                    : (m.avg4c && m.avg4c > 0) && (
                        <div className="flex flex-col items-end leading-none">
                            <span className="text-[17px] font-bold text-white tabular-nums tracking-tight">{avg4c}</span>
                            <span className="text-[12px] font-medium text-white/45 mt-1">4구</span>
                        </div>
                    )}
                <LucideChevronRight className="w-5 h-5 text-white/45 group-hover:text-white/55 transition-colors" />
            </div>
        </div>
    );
}

const MemberStatsDisplay = ({ sportCategory, sheetData, member }: any) => (
    <div className="flex items-center justify-center gap-8 w-full max-w-sm py-4">
        {sportCategory === 'GOLF' ? (
            <>
                <div className="flex flex-col items-center gap-1">
                    <div className={cn("flex items-center gap-1 px-2 py-0.5 rounded-full mb-1 border", sheetData.tier.class)}>
                        <span className="text-[12px] font-semibold">{sheetData.tier.label}</span>
                    </div>
                    <span className="text-4xl font-bold text-white tracking-tight tabular-nums">
                        {sheetData.golfScore > 0 ? sheetData.golfScore.toFixed(0) : "-"}
                    </span>
                    <span className="text-[12px] text-white/45 font-medium">평균 점수</span>
                </div>
                <div className="w-px h-16 bg-white/10" />
                <div className="flex flex-col items-center gap-1">
                    <span className="text-[12px] text-blue-500 font-semibold bg-blue-500/10 px-2 py-0.5 rounded-full mb-1">최고 점수</span>
                    <span className="text-4xl font-bold text-white tracking-tight tabular-nums">
                        {member.golfBestScore && member.golfBestScore > 0 ? member.golfBestScore : "-"}
                    </span>
                    <span className="text-[12px] text-white/45 font-medium">최고</span>
                </div>
            </>
        ) : (
            <>
                <div className="flex flex-col items-center gap-1">
                    <span className="text-[12px] text-brand font-semibold bg-brand/12 px-2 py-0.5 rounded-full mb-1">3C</span>
                    <span className="text-4xl font-bold text-white tracking-tight tabular-nums">
                        {member.avg3c ? member.avg3c.toFixed(3) : "0.000"}
                    </span>
                    <span className="text-[12px] text-white/45 font-medium">평균</span>
                </div>
                <div className="w-px h-16 bg-white/10" />
                <div className="flex flex-col items-center gap-1">
                    <span className="text-[12px] text-blue-500 font-semibold bg-blue-500/10 px-2 py-0.5 rounded-full mb-1">4C</span>
                    <span className="text-4xl font-bold text-white tracking-tight tabular-nums">
                        {member.avg4c ? member.avg4c.toFixed(3) : "0.000"}
                    </span>
                    <span className="text-[12px] text-white/45 font-medium">평균</span>
                </div>
            </>
        )}
    </div>
);



