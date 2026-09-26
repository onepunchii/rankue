import { useState, useMemo } from "react";
import { HiqMember } from "@shared/schema";
import {
    Sheet,
    SheetContent,
    SheetTitle,
    SheetDescription
} from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
    LucideSwords,
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
import { CREW_BTN, CREW_CARD, CREW_TEXT, CrewEmpty, CrewRoleBadge, IconButton } from "@/components/hiq/crew-ui";
import { MemberSearchBar } from "@/components/hiq/club/MemberSearchBar";
import { golfScoreOf, memberStat } from "@/components/hiq/club/memberStat";
import { filterSortMembers, type MemberSort } from "@shared/crewManage";

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
    /** 보는 사람이 이 크루의 활동 멤버인가. 없으면 목록에서 추정한다(내가 목록에 있고 대기가 아니면 멤버). */
    isMember?: boolean;
    /** 크루 주 종목(3c·4c…) — 없으면 캐시된 크루 정보에서 읽는다. 당구 대표 기록을 3구/4구 중 무엇으로 보일지 정한다. */
    gameType?: string | null;
}

/** 크루 가입일 — 한국어는 기존처럼 "2026.09.26", 그 밖의 언어는 그 언어의 날짜 모양. */
function formatJoinDate(value: Date | string, locale: string): string {
    const d = new Date(value);
    if (!Number.isFinite(d.getTime())) return "";
    const s = d.toLocaleDateString(locale, { year: "numeric", month: "2-digit", day: "2-digit" });
    return locale === "ko" ? s.replace(/\. /g, ".").replace(/\.$/, "") : s;
}

// 멤버 수가 이보다 많을 때만 검색·정렬 줄을 보인다 — 몇 명 안 되는 크루에선 자리만 차지한다.
const SEARCH_THRESHOLD = 6;

export function CrewMemberList({ members, currentMemberId, sportCategory = "BILLIARDS", crewId, isMember, gameType }: CrewMemberListProps) {
    const { t, locale } = useT();
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [selectedMember, setSelectedMember] = useState<CrewMemberItemType | null>(null);
    const [isSheetOpen, setIsSheetOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [sort, setSort] = useState<MemberSort>("role");

    // 비멤버·게스트에게 멤버 전용 요청(대회 기록·대결 신청)을 보내지 않는다 — 서버가 403/401 로 막는다.
    // 예전엔 비멤버에게도 '대결 신청' 버튼이 보여 누르면 403 토스트가 떴다.
    const viewerIsMember = isMember ?? (!!currentMemberId && members.some((m) => m.member.id === currentMemberId && m.role !== "pending"));
    // 크루 주 종목 — 크루 화면이 이미 받아 둔 GET /crews/:id 캐시에서 읽는다(새 요청 없음).
    const crewGameType = gameType ?? (queryClient.getQueryData<any>([`/api/hiq/crews/${crewId}`])?.crew?.gameType ?? null);

    // 크루 대회 우승 횟수 — 명예의 전당과 같은 소스. 회원마다 조회하면 N+1 이라 한 번에 받는다.
    const { data: hallOfFame } = useQuery<{ honors?: Array<{ memberId: string; wins: number }> }>({
        queryKey: [`/api/hiq/crews/${crewId}/tournaments/hall-of-fame`],
        enabled: !!crewId && viewerIsMember,
    });
    const winsByMember = useMemo(() => {
        const map: Record<string, number> = {};
        for (const h of hallOfFame?.honors ?? []) map[h.memberId] = (map[h.memberId] ?? 0) + h.wins;
        return map;
    }, [hallOfFame]);

    const sortedMembers = useMemo(() => filterSortMembers(members, query, sort, locale), [members, query, sort, locale]);

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
        },
        onError: (e: any) => toast({ title: e?.message || t("clubSettings.actionFailed"), variant: "destructive" }),
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
        enabled: isSheetOpen && !!selectedMember && !!currentMemberId
    });

    const isMe = currentMemberId === selectedMember?.member?.id;

    // 나와의 상대전적 — 라이벌 화면에만 있던 정보를 크루 프로필에도 붙인다.
    // 크루에서 멤버를 열었을 때 가장 궁금한 숫자다("나랑 붙으면 누가 이겼더라").
    const { data: h2h } = useQuery<{ total: number; myWins: number; friendWins: number; winRate: number }>({
        queryKey: [`/api/hiq/stats/h2h/${selectedMember?.member?.id}`],
        // 이 전적은 당구 경기만 센다 — 골프 크루에서 "나와 N승 M패" 로 보여주면 남의 종목 숫자다(2026-09-09 검토).
        enabled: isSheetOpen && !!selectedMember && !isMe && !!currentMemberId && sportCategory !== "GOLF",
        staleTime: 60 * 1000,
    });

    // 대결 신청 상태 — 내가 보낸 것/받은 것(24시간 내 대기 중). 크루원 전용 라우트다.
    const { data: challengeData } = useQuery<{ challenges: any[]; myId: string }>({
        queryKey: [`/api/hiq/crews/${crewId}/challenges`],
        enabled: isSheetOpen && viewerIsMember,
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
            // 데이터가 전혀 없는 경우 0으로 처리하여 '-'가 나오도록 함
            const golfScore = golfScoreOf(m);
            return { golfScore, tier: getTier(golfScore, false, 'GOLF') };
        }
        return { golfScore: 0, tier: getTier(Number(m.handi4c || 0), false, 'BILLIARDS') };
    }, [selectedMember, sportCategory]);

    // 나이대·성별 — 서버는 크루원이 아닌 조회자에게 둘 다 지워서 보낸다(stripMemberPrivacy).
    // 모르면 그리지 않는다: 예전엔 성별이 null 이면 '남성'으로 찍혔다.
    const profileLine = (m: EnhancedHiqMember) => {
        const parts: string[] = [];
        if (m.birthYear) parts.push(`${Math.floor((new Date().getFullYear() - m.birthYear) / 10) * 10}${t("crewMemberList.ageSuffix")}`);
        if (m.gender === "female") parts.push(t("crewMemberList.female"));
        else if (m.gender === "male") parts.push(t("crewMemberList.male"));
        return parts.join(" · ");
    };

    return (
        <>
            <div className="flex flex-col gap-2">
                {members.length >= SEARCH_THRESHOLD && (
                    <MemberSearchBar query={query} onQuery={setQuery} sort={sort} onSort={setSort} />
                )}
                {sortedMembers.length === 0 && query ? (
                    <CrewEmpty title={t("crewMgmt.noMemberMatch")} />
                ) : (
                    sortedMembers.map((item) => (
                        <MemberListItem
                            key={item.member.id}
                            item={item}
                            currentMemberId={currentMemberId}
                            sportCategory={sportCategory}
                            gameType={crewGameType}
                            tournamentWins={winsByMember[item.member.id]}
                            onClick={() => handleMemberClick(item)}
                        />
                    ))
                )}
            </div>

            <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
                <SheetContent side="bottom" hideClose className="max-w-md mx-auto h-[80dvh] rounded-t-card bg-surface-0 border-surface-line p-0 overflow-hidden">
                    <SheetTitle className="sr-only">{t("crewMemberList.sheetTitle")}</SheetTitle>
                    <SheetDescription className="sr-only">{t("crewMemberList.sheetDescription")}</SheetDescription>

                    {selectedMember && sheetData && (
                        /* 액션바를 하단에 고정하기 위해 스크롤을 본문에만 준다.
                           예전에는 시트 전체가 스크롤돼 대결 버튼이 내용에 밀려 사라졌다. */
                        <div className="h-full flex flex-col">
                        <div className="flex-1 min-h-0 overflow-y-auto">
                            <div className="relative pt-10 pb-6 px-4 flex flex-col items-center">
                                <div className="absolute top-2.5 w-10 h-1 bg-surface-3 rounded-full left-1/2 -translate-x-1/2" aria-hidden="true" />
                                {/* 회원 신고·차단 — 소개글·프로필 사진도 UGC 다 (Apple 1.2). 오른쪽 위는 시트 닫기 자리라 왼쪽에 둔다 */}
                                {!isMe && currentMemberId && (
                                    <div className="absolute top-2 left-2">
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
                                <Avatar className="w-24 h-24 mb-4 border-4 border-surface-1">
                                    <AvatarImage
                                        src={selectedMember.member.profileImageUrl}
                                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                    />
                                    <AvatarFallback className="text-[22px] font-semibold bg-surface-3 text-ink-3">
                                        {selectedMember.member.nickname?.[0] || selectedMember.member.name?.[0]}
                                    </AvatarFallback>
                                </Avatar>

                                <div className="flex items-center justify-center flex-wrap gap-2 mb-1 max-w-full">
                                    <h2 className={cn(CREW_TEXT.title, "truncate max-w-full")}>
                                        {selectedMember.member.nickname || selectedMember.member.name}
                                    </h2>
                                    <CrewRoleBadge role={selectedMember.role} />
                                </div>
                                {profileLine(selectedMember.member) && (
                                    <p className={cn(CREW_TEXT.sub, "mb-2")}>{profileLine(selectedMember.member)}</p>
                                )}

                                <MemberStatsDisplay
                                    sportCategory={sportCategory}
                                    sheetData={sheetData}
                                    member={selectedMember.member}
                                />

                                {/* 나와의 상대전적 — 크루 멤버를 열었을 때 가장 궁금한 숫자 */}
                                {!isMe && h2h && h2h.total > 0 && (
                                    <div className="flex items-center gap-2 px-3.5 py-2 rounded-pill bg-brand/10 mb-1">
                                        <LucideSwords className="w-4 h-4 text-brand" />
                                        <span className="text-[13px] font-semibold text-brand rk-num">
                                            {t("crewMemberList.h2hLabel")} {h2h.myWins}{t("crewMemberList.winUnit")} {h2h.friendWins}{t("crewMemberList.loseUnit")}
                                        </span>
                                    </div>
                                )}
                                {/* 전적·하이런 — 데이터가 있는데 안 쓰고 있었다 */}
                                {sportCategory !== "GOLF" && (selectedMember.member.totalBilliardsGames || 0) > 0 && (
                                    <p className={cn(CREW_TEXT.caption, "rk-num")}>
                                        {t("crewMemberList.totalGames")} {selectedMember.member.totalBilliardsGames}
                                        {(selectedMember.member as any).highRun3c || (selectedMember.member as any).highRun4c
                                            ? ` · ${t("crewMemberList.highRun")} ${Math.max((selectedMember.member as any).highRun3c || 0, (selectedMember.member as any).highRun4c || 0)}`
                                            : ""}
                                    </p>
                                )}
                            </div>

                            {/* Activity Persona & Stats */}
                            {memberActivities && (
                                <div className="px-4 pb-4">
                                    <h2 className={cn(CREW_TEXT.section, "mb-3")}>{t("crewMemberList.activityTendency")}</h2>
                                    <MemberActivityStats
                                        activities={memberActivities.activities || []}
                                        totalCount={memberActivities.totalCount || 0}
                                        sportCategory={sportCategory as 'GOLF' | 'BILLIARDS'}
                                    />
                                </div>
                            )}

                            <div className="px-4 pb-6 flex flex-col gap-3">
                                {/* 소갯말 카드 */}
                                <div className={cn(CREW_CARD, "flex flex-col gap-2")}>
                                    <div className="flex items-center justify-between min-h-11 -my-2">
                                        <span className={CREW_TEXT.caption}>{t("crewMemberList.bioLabel")}</span>
                                        {isMe && !isEditingBio && (
                                            <IconButton
                                                label={t("crewMemberList.editBio")}
                                                className="-mr-2"
                                                onClick={() => {
                                                    setNewBio(selectedMember.member.introduction || "");
                                                    setIsEditingBio(true);
                                                }}
                                            >
                                                <LucideEdit2 />
                                            </IconButton>
                                        )}
                                    </div>

                                    {isEditingBio ? (
                                        <div className="flex flex-col gap-3">
                                            <textarea
                                                autoFocus
                                                aria-label={t("crewMemberList.bioLabel")}
                                                maxLength={200}
                                                className="w-full bg-surface-1 border border-surface-line rounded-tile p-3.5 text-[15px] font-medium text-ink-1 placeholder:text-ink-4 focus:outline-none focus:border-brand min-h-[88px] resize-none"
                                                value={newBio}
                                                onChange={(e) => setNewBio(e.target.value)}
                                                placeholder={t("crewMemberList.bioPlaceholder")}
                                            />
                                            <div className="flex gap-2">
                                                <button type="button" onClick={() => setIsEditingBio(false)} className={cn(CREW_BTN.secondary, "flex-1")}>
                                                    {t("crewMemberList.cancel")}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => updateBioMutation.mutate()}
                                                    disabled={updateBioMutation.isPending}
                                                    className={cn(CREW_BTN.primary, "flex-1")}
                                                >
                                                    {updateBioMutation.isPending ? <LucideLoader2 className="w-4 h-4 animate-spin" /> : <><LucideCheck className="w-4 h-4" /> {t("crewMemberList.save")}</>}
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <p className="text-[15px] font-medium text-ink-2 leading-relaxed">
                                            {selectedMember.member.introduction || t("crewMemberList.noBio")}
                                        </p>
                                    )}
                                </div>
                                {/* 크루 활동 정보 카드 */}
                                <div className={cn(CREW_CARD, "flex flex-col gap-4")}>
                                    <div className="flex items-center justify-between">
                                        <span className={CREW_TEXT.caption}>{t("crewMemberList.joinedDate")}</span>
                                        <span className="text-[13px] font-semibold text-ink-2 rk-num">
                                            {formatJoinDate(selectedMember.joinedAt, locale)}
                                        </span>
                                    </div>
                                    {/* 활동 카운트 3칸 — 전부 0이면 숨긴다. 0/0/0 이 큰 칸 3개를
                                        차지하면서 정작 당구 기록을 아래로 밀어내고 있었다. */}
                                    {((selectedMember.activityCounts?.group1 || 0)
                                        + (selectedMember.activityCounts?.group2 || 0)
                                        + (selectedMember.activityCounts?.group3 || 0)) > 0 && (
                                    <div className="grid grid-cols-3 gap-2">
                                        <ActivityCount icon={<LucideCalendarCheck />} value={selectedMember.activityCounts?.group1 || 0}
                                            label={sportCategory === 'GOLF' ? t("crewMemberList.rounding") : t("crewMemberList.meetup")} />
                                        <ActivityCount icon={sportCategory === 'GOLF' ? <LucideMonitor /> : <LucideTrophy />} value={selectedMember.activityCounts?.group2 || 0}
                                            label={sportCategory === 'GOLF' ? t("crewMemberList.screenGolf") : t("crewMemberList.tournament")} />
                                        <ActivityCount icon={<LucideBeer />} value={selectedMember.activityCounts?.group3 || 0} label={t("crewMemberList.afterParty")} />
                                    </div>
                                    )}
                                </div>
                            </div>
                        </div>

                            {/* 하단 액션 — 대결 신청(상대에게 알림). 크루원끼리만 된다(서버 requireCrewMember) —
                                비멤버·게스트에게는 버튼을 그리지 않는다. 색은 중립 토큰: 예전 당구 라사·노란 공 색은
                                골프 크루(어두운 테마)에서도 그대로 나와 어색했다. */}
                            {!isMe && viewerIsMember && (
                            <div className="shrink-0 px-4 pt-3 bg-surface-1 border-t border-surface-line flex flex-col gap-2" style={{ paddingBottom: "calc(12px + env(safe-area-inset-bottom))" }}>
                                {receivedChallenge ? (
                                    <>
                                        <p className="text-[13px] font-semibold text-ink-1 text-center">
                                            {t("crewMemberList.challengeReceived")}
                                        </p>
                                        <div className="flex gap-2">
                                            <button
                                                type="button"
                                                onClick={() => respondMutation.mutate(true)}
                                                disabled={respondMutation.isPending}
                                                className={cn(CREW_BTN.primary, "flex-1")}
                                            >
                                                <LucideSwords className="w-4 h-4" />
                                                {t("crewMemberList.accept")}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => respondMutation.mutate(false)}
                                                disabled={respondMutation.isPending}
                                                className={CREW_BTN.secondary}
                                            >
                                                {t("crewMemberList.decline")}
                                            </button>
                                        </div>
                                    </>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => challengeMutation.mutate()}
                                        disabled={!!sentChallenge || challengeMutation.isPending}
                                        className={cn(CREW_BTN.primary, "w-full")}
                                    >
                                        {challengeMutation.isPending ? (
                                            <LucideLoader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <>
                                                <LucideSwords className="w-4 h-4" />
                                                {sentChallenge ? t("crewMemberList.challengeWaiting") : t("crewMemberList.matchRequest")}
                                            </>
                                        )}
                                    </button>
                                )}
                                <p className={cn(CREW_TEXT.caption, "text-center")}>
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

function ActivityCount({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
    const { t } = useT();
    return (
        <div className="flex flex-col items-center gap-1.5 py-3 rounded-tile bg-surface-3 [&_svg]:w-4 [&_svg]:h-4 [&_svg]:text-brand">
            {icon}
            <span className="text-[17px] font-semibold text-ink-1 rk-num">
                {value}
                <span className="text-[12px] ml-0.5 font-medium text-ink-3">{t("crewMemberList.countUnit")}</span>
            </span>
            <span className={CREW_TEXT.caption}>{label}</span>
        </div>
    );
}

function MemberListItem({ item, currentMemberId, sportCategory, gameType, onClick, tournamentWins }: {
    item: CrewMemberItemType,
    currentMemberId?: string,
    sportCategory: string,
    gameType?: string | null,
    onClick: () => void,
    tournamentWins?: number,
}) {
    const { t } = useT();
    const m = item.member;
    const isMe = m.id === currentMemberId;

    const joinedDate = new Date(item.joinedAt);
    const daysSinceJoined = (Date.now() - joinedDate.getTime()) / (1000 * 3600 * 24);
    const isNewbie = daysSinceJoined < 7;

    // 등급 — getTier 는 "GOLD" 같은 영문 코드와 테마 대응 색 클래스(tier-gold, 골프 어두운 테마 포함)를 준다.
    // 예전엔 한국어 라벨("골드")로 색을 찾아 늘 회색이었고, 라벨도 번역 없이 영문 코드가 찍혔다.
    const tier = sportCategory === 'GOLF'
        ? getTier(golfScoreOf(m), false, 'GOLF')
        : getTier(Number(m.handi4c || 0), false, 'BILLIARDS');
    // 대표 기록 — 크루 주 종목(3쿠션이면 3구 에버)에 맞춘다. 기록이 없으면 숫자 칸을 비운다.
    const stat = memberStat(m, sportCategory, gameType);

    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                "w-full flex items-center gap-3 p-3.5 rounded-card text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand",
                isMe ? "bg-brand/10" : "rk-card active:bg-surface-3",
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
                    <AvatarFallback className="bg-brand/10 text-brand text-[15px] font-semibold">
                        {m.nickname?.[0] || m.name?.[0]}
                    </AvatarFallback>
                </Avatar>
            </div>

            {/* Identity */}
            <div className="flex flex-col min-w-0 flex-1 gap-1">
                <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-ink-1 font-semibold text-[15px] leading-tight truncate">
                        {m.nickname || m.name}
                    </span>
                    <CrewRoleBadge role={item.role} />
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
                    {isMe && (
                        <span className="shrink-0 text-[12px] font-semibold text-brand">{t("crewMemberList.me")}</span>
                    )}
                </div>
                <div className="flex items-center gap-1.5 min-w-0 text-[12px] font-medium leading-none">
                    <span className={cn("shrink-0 px-1.5 py-0.5 rounded-md border", tier.class)}>{t(`crewMgmt.tier.${tier.label}`)}</span>
                    {isNewbie && <span className="text-brand shrink-0">{t("crewMemberList.newbie")}</span>}
                    <span className="text-ink-3 truncate">
                        {m.introduction || (sportCategory === 'GOLF' ? t("crewMemberList.defaultBioGolf") : t("crewMemberList.defaultBioBilliards"))}
                    </span>
                </div>
            </div>

            {/* Stat */}
            <div className="flex items-center gap-2 shrink-0">
                {stat && (
                    <div className="flex flex-col items-end leading-none">
                        <span className="text-[17px] font-semibold text-ink-1 rk-num">{stat.value}</span>
                        <span className="text-[12px] font-medium text-ink-3 mt-1">{t(stat.labelKey)}</span>
                    </div>
                )}
                <LucideChevronRight className="w-4 h-4 text-ink-4" />
            </div>
        </button>
    );
}

// 당구공 한 알 위에 숫자를 얹은 스탯. 공 색이 종목을 말한다(노랑=4구, 빨강=3쿠션).
// 하이라이트는 실제 공의 반사광을 흉내 낸 작은 점 하나 — 공 위의 빛이라 테마와 무관하게 흰색이다.
const BallStat = ({ label, ballColor, value, sub }: { label: string; ballColor: string; value: string | null; sub: string }) => (
    <div className="flex flex-col items-center gap-2">
        <div
            className="relative w-[68px] h-[68px] rounded-full flex items-center justify-center shadow-[var(--shadow-card)]"
            style={{ background: value ? ballColor : "var(--surface-3)" }}
        >
            {value && <span className="absolute top-[11px] left-[15px] w-[13px] h-[9px] rounded-full bg-[var(--ball-white)] opacity-35" />}
            <span className={cn("text-[13px] font-semibold", value ? "text-[var(--ball-white)]" : "text-ink-4")}>{label}</span>
        </div>
        <span className="text-[22px] font-semibold text-ink-1 rk-num leading-none">
            {value ?? <span className="text-ink-4">–</span>}
        </span>
        <span className={CREW_TEXT.caption}>{sub}</span>
    </div>
);

const MemberStatsDisplay = ({ sportCategory, sheetData, member }: any) => {
    const { t } = useT();
    return (
    <div className="flex items-center justify-center gap-8 w-full max-w-sm py-4">
        {sportCategory === 'GOLF' ? (
            <>
                <div className="flex flex-col items-center gap-1">
                    <span className={cn("px-2 py-0.5 rounded-md border mb-1 text-[12px] font-semibold", sheetData.tier.class)}>
                        {t(`crewMgmt.tier.${sheetData.tier.label}`)}
                    </span>
                    <span className="text-[22px] font-semibold text-ink-1 rk-num">
                        {sheetData.golfScore > 0 ? sheetData.golfScore.toFixed(0) : "-"}
                    </span>
                    <span className={CREW_TEXT.caption}>{t("crewMgmt.golfAvgStrokes")}</span>
                </div>
                <div className="w-px h-16 bg-surface-line" />
                <div className="flex flex-col items-center gap-1">
                    <span className="rk-chip bg-brand/10 text-brand mb-1">{t("crewMemberList.bestScore")}</span>
                    <span className="text-[22px] font-semibold text-ink-1 rk-num">
                        {member.golfBestScore && member.golfBestScore > 0 ? member.golfBestScore : "-"}
                    </span>
                    <span className={CREW_TEXT.caption}>{t("crewMemberList.best")}</span>
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
