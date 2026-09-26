import { useMemo, useState } from "react";
import { useQuery, useMutation, useInfiniteQuery } from "@tanstack/react-query";
import { differenceInCalendarDays, format } from "date-fns";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/lib/i18n";
import {
    LucidePlus, LucideZap, LucideRefreshCw, LucideX, LucideMessageCircle, LucideShare2,
    LucideMinus, LucidePencil, LucideTrash2, LucideCalendarDays, LucideMapPin, LucideMoreVertical,
    LucideChevronDown, LucideLoader2, LucideCheck, LucideClock,
} from "@/lib/icons";
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { generateTeams, getSportTerminology, isFemaleParticipant, isManualFemaleName, SportType, GenderDist } from "@/lib/teamGenerator";
import { CREW_BTN, CREW_CARD, CREW_TEXT, ConfirmDialog, CrewAvatar, CrewEmpty, CrewError, CrewSkeleton, IconButton } from "@/components/hiq/crew-ui";
import { activityPhase, activityCapacity, isActivityFull, activityCategoryLabelKey } from "@shared/crewActivity";
import { encodeCrewCursor } from "@shared/crewBoard";
import { mapLink } from "@shared/storeMeta";
import { useDateLocale } from "@/components/hiq/crew-board/dateLocale";
import { CreateActivityDialog } from "../CreateActivityDialog";
import { CreateGolfActivityModal } from "../club/activity/CreateGolfActivityModal";

interface ClubActivityListProps {
    crewId: string;
    isMember: boolean;
    currentMemberId?: string;
    sportType: SportType;
    onCreateClick: () => void;
    onShareToChat?: (message: string, activityId?: string) => void;
    isAdmin?: boolean;
}

type TeamState = {
    step: 'setup' | 'result';
    count: number;
    genderDist: GenderDist;
    teams: any[];
    manualInput: string;
    showManualInput: boolean;
};

const PAST_PAGE = 20;

const participantsOf = (a: any): any[] => (Array.isArray(a?.participants) ? a.participants : []);
const manualNamesOf = (input: string) => input.split(/[\n,\s]+/).map(s => s.trim()).filter(s => s.length > 0);

/** 정모 한 칸의 상태 알약 — 오늘/진행 중은 초록 채움, 1~3일 전은 초록 테두리, 그 뒤는 회색. 빨강·주황은 골프(어두운) 테마에서 깨졌다. */
function useDdayPill() {
    const { t } = useT();
    return (activityDate: string) => {
        const phase = activityPhase(activityDate);
        if (phase === "ongoing") return { text: t("crewMeet.ongoing"), cls: "bg-brand text-brand-fg", strong: true };
        if (phase === "past") return { text: t("clubActivityListView.ended"), cls: "bg-surface-3 text-ink-3", strong: false };
        const diff = differenceInCalendarDays(new Date(activityDate), new Date());
        if (diff <= 0) return { text: t("crewMeet.today"), cls: "bg-brand text-brand-fg", strong: true };
        const text = t("crewMeet.dMinus").replace("{n}", String(diff));
        if (diff <= 3) return { text, cls: "bg-brand/10 text-brand", strong: false };
        return { text, cls: "bg-surface-3 text-ink-2", strong: false };
    };
}

/** 정모 카드 왼쪽 날짜 칸 — 월 · 큰 일 · 요일. 오늘·진행 중이면 초록 채움, 그 밖엔 연한 초록. */
function DateBlock({ date, strong }: { date: string; strong: boolean }) {
    const dateLocale = useDateLocale();
    const d = new Date(date);
    return (
        <div
            className={cn("w-[68px] shrink-0 flex flex-col items-center justify-center gap-0.5 py-3", strong ? "bg-brand text-brand-fg" : "bg-brand/10 text-brand")}
            aria-hidden="true"
        >
            <span className="text-[12px] font-semibold opacity-90">{format(d, "LLL", { locale: dateLocale })}</span>
            <span className="text-[28px] font-bold leading-none rk-num">{format(d, "d")}</span>
            <span className="text-[12px] font-semibold opacity-90">{format(d, "EEE", { locale: dateLocale })}</span>
        </div>
    );
}

export function ClubActivityList({
    crewId,
    isMember,
    currentMemberId,
    sportType,
    onCreateClick,
    onShareToChat,
    isAdmin
}: ClubActivityListProps) {
    const { toast } = useToast();
    const { t } = useT();
    const activitiesKey = `/api/hiq/crews/${crewId}/activities`;
    const [editingActivity, setEditingActivity] = useState<any | null>(null);
    const [leaveConfirmId, setLeaveConfirmId] = useState<string | null>(null);
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
    const [peopleOf, setPeopleOf] = useState<any | null>(null);
    const [showPast, setShowPast] = useState(false);

    const { data: activities, isLoading, isError: queryFailed, error, refetch } = useQuery<any[]>({
        queryKey: [activitiesKey],
        enabled: !!crewId,
    });
    // 로그인 안 한 손님은 서버가 401 을 준다 — 그건 '불러오기 실패' 가 아니라 '볼 정모 없음' 으로 보여 준다.
    const isError = queryFailed && (error as any)?.status !== 401;

    // 지난 정모 — 펼칠 때만 부른다(최근 것부터 PAST_PAGE 개씩).
    const past = useInfiniteQuery({
        queryKey: [activitiesKey, "past"],
        queryFn: ({ pageParam, signal }) => apiRequest(
            `${activitiesKey}?past=1&limit=${PAST_PAGE}${pageParam ? `&before=${encodeURIComponent(String(pageParam))}` : ""}`,
            { signal },
        ) as Promise<any[]>,
        initialPageParam: null as string | null,
        getNextPageParam: (last: any[]) => {
            const tail = last?.[last.length - 1];
            return last?.length >= PAST_PAGE && tail ? encodeCrewCursor(tail.activityDate, tail.id) : null;
        },
        enabled: showPast && !!crewId,
    });

    const invalidate = () => queryClient.invalidateQueries({ queryKey: [activitiesKey] });

    const joinMutation = useMutation({
        mutationFn: async (activityId: string) => apiRequest(`${activitiesKey}/${activityId}/join`, { method: "POST" }),
        onSuccess: () => {
            toast({ title: t("clubActivityListView.joinSuccessTitle"), description: t("clubActivityListView.joinSuccessDesc") });
            invalidate();
        },
        onError: (err: Error) => toast({ title: t("clubActivityListView.joinFailTitle"), description: err.message, variant: "destructive" }),
    });

    const deleteMutation = useMutation({
        mutationFn: async (activityId: string) => apiRequest(`${activitiesKey}/${activityId}`, { method: "DELETE" }),
        onSuccess: () => {
            setDeleteConfirmId(null);
            toast({ title: t("clubActivityListView.deleteSuccessTitle"), description: t("clubActivityListView.deleteSuccessDesc") });
            invalidate();
        },
        onError: (err: Error) => toast({ title: t("clubActivityListView.deleteFailTitle"), description: err.message, variant: "destructive" }),
    });

    const leaveMutation = useMutation({
        mutationFn: async (activityId: string) => apiRequest(`${activitiesKey}/${activityId}/join`, { method: "DELETE" }),
        onSuccess: () => {
            setLeaveConfirmId(null);
            toast({ title: t("clubActivityListView.leaveSuccessTitle"), description: t("clubActivityListView.leaveSuccessDesc") });
            invalidate();
        },
        onError: (err: Error) => toast({ title: t("clubActivityListView.leaveFailTitle"), description: err.message, variant: "destructive" }),
    });

    const ofSport = (list: any[] | undefined) =>
        (Array.isArray(list) ? list : []).filter(a => a.sportCategory === sportType || (!a.sportCategory && sportType === 'BILLIARDS'));
    const upcoming = ofSport(activities);
    const pastList = ofSport((past.data?.pages ?? []).flat());

    if (isLoading) return <CrewSkeleton rows={1} height={220} />;

    return (
        <div className="flex flex-col gap-3">
            {isError ? (
                <CrewError message={t("clubActivityListView.loadError")} onRetry={() => refetch()} />
            ) : upcoming.length === 0 ? (
                <CrewEmpty
                    icon={<LucideCalendarDays />}
                    title={t("clubActivityListView.emptyTitle")}
                    desc={isMember ? t("clubActivityListView.emptyMemberDesc") : t("clubActivityListView.emptyGuestDesc")}
                    action={isMember ? { label: t("clubActivityListView.createTitle"), onClick: onCreateClick } : undefined}
                />
            ) : (
                upcoming.map((activity) => (
                    <ActivityCard
                        key={activity.id}
                        activity={activity}
                        crewId={crewId}
                        sportType={sportType}
                        isMember={isMember}
                        isAdmin={!!isAdmin}
                        currentMemberId={currentMemberId}
                        onShareToChat={onShareToChat}
                        onJoin={() => joinMutation.mutate(activity.id)}
                        joinPending={joinMutation.isPending}
                        onLeave={() => setLeaveConfirmId(activity.id)}
                        leavePending={leaveMutation.isPending}
                        onEdit={() => setEditingActivity(activity)}
                        onDelete={() => setDeleteConfirmId(activity.id)}
                        onShowPeople={() => setPeopleOf(activity)}
                    />
                ))
            )}

            {/* 새 정모 만들기는 섹션 머리 오른쪽 '+ 정모' 알약으로 옮겼다(2026-09-26 — 만들기 자리를 섹션마다 같게) */}

            {/* 지난 정모 — 접어 두고 필요할 때 연다 */}
            <button
                type="button"
                onClick={() => setShowPast(v => !v)}
                aria-expanded={showPast}
                className={cn(CREW_BTN.ghost, "self-center")}
            >
                {showPast ? t("crewMeet.hidePast") : t("crewMeet.showPast")}
                <LucideChevronDown className={cn("w-4 h-4 transition-transform", showPast && "rotate-180")} />
            </button>
            {showPast && (
                past.isLoading ? <CrewSkeleton rows={2} height={64} /> :
                past.isError ? <CrewError onRetry={() => void past.refetch()} /> :
                pastList.length === 0 ? <p className={cn(CREW_TEXT.sub, "text-center py-2")}>{t("crewMeet.noPast")}</p> : (
                    <ul className={cn(CREW_CARD, "p-0 overflow-hidden")}>
                        {pastList.map(a => <PastRow key={a.id} activity={a} onShowPeople={() => setPeopleOf(a)} />)}
                        {past.hasNextPage && (
                            <li className="border-t border-surface-line">
                                <button
                                    type="button"
                                    onClick={() => void past.fetchNextPage()}
                                    disabled={past.isFetchingNextPage}
                                    className="w-full min-h-12 text-[13px] font-semibold text-ink-2 active:bg-surface-3 inline-flex items-center justify-center gap-1.5"
                                >
                                    {past.isFetchingNextPage && <LucideLoader2 className="w-4 h-4 animate-spin" />}
                                    {t("crewPost.loadMore")}
                                </button>
                            </li>
                        )}
                    </ul>
                )
            )}

            {sportType === 'GOLF' ? (
                <CreateGolfActivityModal
                    open={!!editingActivity}
                    onOpenChange={(open) => { if (!open) setEditingActivity(null); }}
                    crewId={crewId}
                    initialData={editingActivity}
                />
            ) : (
                <CreateActivityDialog
                    open={!!editingActivity}
                    onOpenChange={(open) => { if (!open) setEditingActivity(null); }}
                    crewId={crewId}
                    sportCategory={'BILLIARDS'}
                    initialData={editingActivity}
                />
            )}

            <ParticipantsSheet activity={peopleOf} onClose={() => setPeopleOf(null)} />

            <ConfirmDialog
                open={!!leaveConfirmId}
                onOpenChange={(open) => { if (!open) setLeaveConfirmId(null); }}
                title={t("clubActivityListView.leaveDialogTitle")}
                desc={t("clubActivityListView.leaveDialogDesc")}
                confirmLabel={t("clubActivityListView.leaveDialogTitle")}
                busy={leaveMutation.isPending}
                onConfirm={() => { if (leaveConfirmId) leaveMutation.mutate(leaveConfirmId); }}
            />
            <ConfirmDialog
                open={!!deleteConfirmId}
                onOpenChange={(open) => { if (!open) setDeleteConfirmId(null); }}
                title={t("clubActivityListView.deleteDialogTitle")}
                desc={t("clubActivityListView.deleteDialogDesc")}
                confirmLabel={t("clubActivityListView.deleteButton")}
                busy={deleteMutation.isPending}
                onConfirm={() => { if (deleteConfirmId) deleteMutation.mutate(deleteConfirmId); }}
            />
        </div>
    );
}

function ActivityCard({
    activity, sportType, isMember, isAdmin, currentMemberId, onShareToChat,
    onJoin, joinPending, onLeave, leavePending, onEdit, onDelete, onShowPeople,
}: {
    activity: any;
    crewId: string;
    sportType: SportType;
    isMember: boolean;
    isAdmin: boolean;
    currentMemberId?: string;
    onShareToChat?: (message: string, activityId?: string) => void;
    onJoin: () => void;
    joinPending: boolean;
    onLeave: () => void;
    leavePending: boolean;
    onEdit: () => void;
    onDelete: () => void;
    onShowPeople: () => void;
}) {
    const { t } = useT();
    const { toast } = useToast();
    const dateLocale = useDateLocale();
    const ddayPill = useDdayPill();
    const terms = getSportTerminology(sportType);
    const [teamOpen, setTeamOpen] = useState(false);

    const participants = participantsOf(activity);
    const isJoined = participants.some((p: any) => p.memberId === currentMemberId);
    const cap = activityCapacity(activity.maxParticipants);
    const isFull = isActivityFull(participants.length, activity.maxParticipants);
    // 만든 사람도 고치고 지울 수 있다(서버도 같은 규칙) — 예전엔 운영진만 돼서 자기 번개도 못 고쳤다.
    const canManage = isAdmin || (!!currentMemberId && activity.creatorId === currentMemberId);
    const categoryKey = activityCategoryLabelKey(activity.category);
    const pill = ddayPill(activity.activityDate);
    const dateStr = format(new Date(activity.activityDate), t("clubActivityListView.dateTimeFormat"), { locale: dateLocale });
    const countText = cap === null
        ? `${participants.length}${t("clubActivityListView.personSuffix")}`
        : `${participants.length} / ${cap}${t("clubActivityListView.personSuffix")}`;

    const share = () => {
        const fullMsg = `[${terms.emoji} ${t("clubActivityListView.shareNoticeTitle")}]\n--------------------------\n${t("clubActivityListView.shareMeetupLabel")}${activity.title}\n${t("clubActivityListView.shareLocationLabel")}${activity.locationName || t("clubActivityListView.locationTbd")}\n${t("clubActivityListView.shareDateLabel")}${dateStr}\n${t("clubActivityListView.shareParticipantsLabel")}${countText}\n--------------------------`;
        // 채팅이 있으면 정모 카드로(채팅 안에서 바로 참석) — 알림은 부르는 쪽이 띄운다. 없으면 글로 복사.
        if (onShareToChat) { onShareToChat(fullMsg, activity.id); return; }
        void navigator.clipboard?.writeText(fullMsg);
        toast({ title: t("clubActivityListView.shareCopied") });
    };

    return (
        // 2026-09-26 크루 안쪽 정리: 왼쪽 날짜 칸(월·일·요일) + 오른쪽 내용, 아래 한 줄에 [공유][팀 편성] …… [참석하기].
        // 예전엔 첫 카드만 큰 제목·초록 테두리였고, 버튼이 가로 전체 버튼 + 동그라미 + 글자 링크로 세 줄에 흩어져 있었다.
        <article className={cn(CREW_CARD, "p-0 overflow-hidden")}>
            <div className="flex">
                <DateBlock date={activity.activityDate} strong={pill.strong} />
                <div className="flex-1 min-w-0 pl-3.5 pr-4 pt-3 pb-2 flex flex-col gap-1">
                    {/* 상태 · 종류 · 참여 표시 · 관리 메뉴 */}
                    <div className="flex items-center gap-1.5 min-h-8">
                        <span className={cn("rk-chip rk-num", pill.cls)}>{pill.text}</span>
                        {categoryKey && <span className="rk-chip bg-surface-3 text-ink-2">{t(categoryKey)}</span>}
                        {isJoined && (
                            <span className="rk-chip bg-brand/10 text-brand"><LucideCheck className="w-3 h-3" />{t("clubActivityListView.joinedBadge")}</span>
                        )}
                        <span className="flex-1" />
                        {canManage && (
                            <DropdownMenu modal={false}>
                                <DropdownMenuTrigger asChild>
                                    <button type="button" aria-label={t("crewMeet.menu")} title={t("crewMeet.menu")}
                                        className="w-11 h-11 -my-2 -mr-3 rounded-full inline-flex items-center justify-center text-ink-3 active:bg-surface-3">
                                        <LucideMoreVertical className="w-5 h-5" />
                                    </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="min-w-[160px] rounded-tile bg-surface-1 border-surface-line p-1">
                                    <DropdownMenuItem className="min-h-11 px-3 text-[15px] font-medium text-ink-1 gap-2.5" onSelect={onEdit}>
                                        <LucidePencil className="text-ink-3" /> {t("clubActivityListView.editButton")}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem className="min-h-11 px-3 text-[15px] font-medium text-destructive gap-2.5" onSelect={onDelete}>
                                        <LucideTrash2 /> {t("clubActivityListView.deleteButton")}
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        )}
                    </div>

                    <h3 className="text-[17px] font-semibold text-ink-1 leading-snug line-clamp-2 break-words" title={activity.title}>{activity.title}</h3>

                    {/* 시각 · 장소(지도) — 표 대신 한 줄씩 아이콘으로 */}
                    <p className="flex items-center gap-1.5 text-[13px] font-medium text-ink-2 rk-num">
                        <LucideClock className="w-3.5 h-3.5 text-ink-3 shrink-0" />
                        {format(new Date(activity.activityDate), "p", { locale: dateLocale })}
                    </p>
                    <p className="flex items-center gap-1.5 text-[13px] font-medium text-ink-2 min-w-0">
                        <LucideMapPin className="w-3.5 h-3.5 text-ink-3 shrink-0" />
                        <span className="truncate">{activity.locationName || t("clubActivityListView.locationTbd")}</span>
                        {activity.locationName && (
                            <a
                                href={mapLink({ name: activity.locationName, address: activity.locationName })}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="shrink-0 inline-flex items-center min-h-11 -my-3 px-1 text-[13px] font-semibold text-brand"
                            >
                                {t("crewMeet.viewMap")}
                            </a>
                        )}
                    </p>
                    {activity.cost && (
                        <p className="text-[13px] font-medium text-ink-2 break-words">
                            <span className="text-ink-3">{t("clubActivityListView.costLabel")}</span> {activity.cost}
                        </p>
                    )}
                    {activity.description && (
                        <p className="text-[13px] font-medium text-ink-3 leading-relaxed whitespace-pre-wrap break-words line-clamp-2">{activity.description}</p>
                    )}

                <div className="flex flex-col gap-1 pt-1">
                {/* 참석자 — 누르면 전체 명단. 정원이 있으면 채운 만큼 막대로 */}
                <button
                    type="button"
                    onClick={onShowPeople}
                    className="flex items-center gap-2.5 min-h-11 -mx-1 px-1 rounded-tile active:bg-surface-3 text-left"
                    aria-label={`${t("clubActivityListView.attendLabel")} ${countText}`}
                >
                    <span className="flex -space-x-2 shrink-0">
                        {participants.slice(0, 4).map((p: any, idx: number) => (
                            <CrewAvatar key={p.memberId ?? idx} src={p.member?.profileImageUrl} name={p.member?.name} size={28} className="ring-2 ring-surface-1" />
                        ))}
                        {participants.length > 4 && (
                            <span className="w-7 h-7 rounded-full bg-surface-3 ring-2 ring-surface-1 flex items-center justify-center text-[12px] font-semibold text-ink-2 rk-num">
                                +{participants.length - 4}
                            </span>
                        )}
                    </span>
                    {cap !== null && (
                        <span className="flex-1 h-1.5 rounded-full bg-surface-3 overflow-hidden" aria-hidden="true">
                            <span className="block h-full rounded-full bg-brand" style={{ width: `${Math.min(100, Math.round((participants.length / Math.max(1, cap)) * 100))}%` }} />
                        </span>
                    )}
                    <span className={cn("text-[13px] font-semibold text-ink-2 rk-num shrink-0", cap === null && "flex-1")}>{countText}</span>
                </button>

                {/* 발: [공유] [팀 편성] …… [참석하기 / 참석 취소] — 한 줄, 주 동작은 오른쪽 끝 */}
                <div className="flex items-center gap-0.5 -ml-3 -mr-1">
                    <IconButton label={t("clubActivityListView.shareTitle")} onClick={share}>
                        <LucideShare2 />
                    </IconButton>
                    {canManage && (
                        <button
                            type="button"
                            onClick={() => setTeamOpen(v => !v)}
                            aria-expanded={teamOpen}
                            className={cn(CREW_BTN.ghost, "px-2 whitespace-nowrap", teamOpen && "text-brand")}
                        >
                            <LucideZap className="w-4 h-4 text-brand" /> {t("clubActivityListView.teamAssignButton")}
                        </button>
                    )}
                    <span className="flex-1" />
                    {isMember && (isJoined ? (
                        <button type="button" onClick={onLeave} disabled={leavePending} className={cn(CREW_BTN.secondarySm, "px-3.5 whitespace-nowrap")}>
                            {t("clubActivityListView.leaveButton")}
                        </button>
                    ) : (
                        <button type="button" onClick={onJoin} disabled={isFull || joinPending} className={cn(CREW_BTN.primarySm, "whitespace-nowrap")}>
                            {isFull ? t("clubActivityListView.full") : t("clubActivityListView.joinButton")}
                        </button>
                    ))}
                </div>
                </div>
                </div>
            </div>

            {/* 팀 편성 — 발의 '팀 편성'으로 펼친다(운영진·만든 사람) */}
            {canManage && teamOpen && (
                <div className="px-4 pb-4">
                    <TeamWizard
                        activity={activity}
                        sportType={sportType}
                        currentMemberId={currentMemberId}
                        onShareToChat={onShareToChat}
                        onClose={() => setTeamOpen(false)}
                    />
                </div>
            )}
        </article>
    );
}

/** 팀 편성 — 참석자(+직접 입력한 이름)를 실력·성별로 나눈다. 계산은 이 기기에서 한다(서버·AI 아님). */
function TeamWizard({ activity, sportType, currentMemberId, onShareToChat, onClose }: {
    activity: any;
    sportType: SportType;
    currentMemberId?: string;
    onShareToChat?: (message: string, activityId?: string) => void;
    onClose: () => void;
}) {
    const { t } = useT();
    const { toast } = useToast();
    const dateLocale = useDateLocale();
    const terms = getSportTerminology(sportType);
    const participants = participantsOf(activity);
    const [state, setState] = useState<TeamState>({
        step: 'setup',
        count: sportType === 'GOLF' ? 4 : 2,
        genderDist: 'spread',
        teams: [],
        manualInput: '',
        showManualInput: false,
    });
    const set = (patch: Partial<TeamState>) => setState(prev => ({ ...prev, ...patch }));

    const manualNames = manualNamesOf(state.manualInput);
    const femalesRegistered = participants.filter(isFemaleParticipant).length;
    const femalesManual = manualNames.filter(isManualFemaleName).length;
    const femalesCount = femalesRegistered + femalesManual;
    const totalCount = participants.length + manualNames.length;
    const malesCount = totalCount - femalesCount;
    // 팀 수 상한 = 등록 참석자 + 직접 입력한 이름. 예전엔 등록 참석자 수로만 막아서 명단을 붙여 넣어도 팀 수를 못 늘렸다.
    const maxTeams = Math.max(1, totalCount || 50);

    const run = (isRandom: boolean) => {
        const manual = manualNames.map((name, idx) => ({
            id: `manual-${idx}`,
            memberId: `manual-${idx}`,
            isManual: true,
            member: { id: `manual-${idx}`, name, gender: isManualFemaleName(name) ? 'female' : 'male', golfAvgScore: 0, avg4c: 0 },
        }));
        const teams = generateTeams([...participants, ...manual] as any, Math.min(state.count, maxTeams), sportType, state.genderDist, isRandom);
        set({ step: 'result', teams });
    };

    const resultText = useMemo(() => {
        if (state.step !== 'result') return "";
        const dateStr = format(new Date(activity.activityDate), t("clubActivityListView.dateTimeFormat"), { locale: dateLocale });
        const locStr = activity.locationName || t("clubActivityListView.locationTbd");
        const tStr = state.teams.map((team: any) => `[${team.name} (${terms.avgLabel}: ${+Number(team.avg).toFixed(2)})]\n${team.members.map((m: any) => {
            const score = sportType === 'GOLF' ? (m.member?.golfAvgScore || 0) : (m.member?.avg4c || 0);
            return `• ${m.member?.name}${isFemaleParticipant(m) ? t("clubActivityListView.femaleMark") : ''} (${+Number(score).toFixed(2)}${terms.unit})`;
        }).join('\n')}`).join('\n\n');
        return `[${terms.emoji} ${terms.teamLabel}${t("clubActivityListView.resultTitleSuffix")}]\n--------------------------\n${t("clubActivityListView.shareMeetupLabel")}${activity.title}\n${t("clubActivityListView.shareDateLabel")}${dateStr}\n${t("clubActivityListView.shareLocationLabel")}${locStr}\n--------------------------\n\n${tStr}`;
    }, [state.step, state.teams, activity, t, dateLocale, terms, sportType]);
    const [editedText, setEditedText] = useState<string | null>(null);

    const stepperBtn = "w-11 h-11 rounded-full bg-surface-1 inline-flex items-center justify-center text-ink-1 active:bg-surface-3 disabled:opacity-40";

    return (
        <div className="rounded-tile bg-surface-3 p-4 flex flex-col gap-4">
            <div className="flex items-center justify-between -mt-2 -mr-2">
                <h4 className="text-[15px] font-semibold text-ink-1">{terms.teamLabel}{t("clubActivityListView.wizardTitleSuffix")}</h4>
                <IconButton label={t("clubActivityListView.close")} onClick={onClose}><LucideX /></IconButton>
            </div>

            {state.step === 'setup' ? (
                <>
                    <div className="rounded-tile bg-surface-1 p-4 flex flex-col items-center gap-1">
                        <span className={CREW_TEXT.caption}>{t("clubActivityListView.currentParticipants")}</span>
                        <span className="text-[22px] font-semibold text-ink-1 rk-num">{totalCount}</span>
                        {totalCount > 0 && (
                            <div className="flex items-center gap-2">
                                <span className="rk-chip rk-num bg-surface-3 text-ink-2">{t("clubActivityListView.malePrefix")}{malesCount}</span>
                                <span className="rk-chip rk-num bg-surface-3 text-ink-2">{t("clubActivityListView.femalePrefix")}{femalesCount}</span>
                            </div>
                        )}
                    </div>

                    {/* 명단 직접 입력 */}
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                            <label htmlFor={`manual-${activity.id}`} className={CREW_TEXT.sub}>{t("clubActivityListView.manualInputLabel")}</label>
                            <button type="button" onClick={() => set({ showManualInput: !state.showManualInput })} className={cn(CREW_BTN.ghost, "-mr-3 text-brand")}>
                                {state.showManualInput ? t("clubActivityListView.hide") : t("clubActivityListView.open")}
                            </button>
                        </div>
                        {state.showManualInput && (
                            <>
                                <textarea
                                    id={`manual-${activity.id}`}
                                    value={state.manualInput}
                                    onChange={(e) => set({ manualInput: e.target.value })}
                                    placeholder={t("clubActivityListView.manualInputPlaceholder")}
                                    className="w-full h-28 bg-surface-1 rounded-tile p-3 text-[15px] text-ink-1 placeholder:text-ink-4 outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
                                />
                                <p className={CREW_TEXT.caption}>{t("clubActivityListView.manualInputHint")}</p>
                            </>
                        )}
                    </div>

                    {/* 빠른 설정 */}
                    <div className="flex flex-col gap-2">
                        <span className={CREW_TEXT.sub}>{t("clubActivityListView.quickSetupLabel")}</span>
                        <div className="grid grid-cols-3 gap-2">
                            {[2, 3, 4].map(n => (
                                <button
                                    key={n}
                                    type="button"
                                    onClick={() => set({ count: Math.max(1, Math.ceil(totalCount / n)) })}
                                    className="min-h-11 rounded-tile bg-surface-1 text-[13px] font-semibold text-ink-2 active:bg-surface-2"
                                >
                                    {n}{t("clubActivityListView.nPersonSuffix")} {terms.teamLabel}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex items-center justify-between">
                        <span className={CREW_TEXT.sub}>{terms.teamLabel}{t("clubActivityListView.countSuffix")}</span>
                        <div className="flex items-center gap-2">
                            <button type="button" className={stepperBtn} disabled={state.count <= 1}
                                onClick={() => set({ count: Math.max(1, state.count - 1) })}
                                title={t("clubActivityListView.decrease")} aria-label={t("clubActivityListView.decrease")}>
                                <LucideMinus className="w-4 h-4" />
                            </button>
                            <span className="text-[15px] font-semibold text-ink-1 rk-num min-w-14 text-center">{state.count}{t("clubActivityListView.unitSuffix")} {terms.teamLabel}</span>
                            <button type="button" className={stepperBtn} disabled={state.count >= maxTeams}
                                onClick={() => set({ count: Math.min(maxTeams, state.count + 1) })}
                                title={t("clubActivityListView.increase")} aria-label={t("clubActivityListView.increase")}>
                                <LucidePlus className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    {femalesCount > 0 && (
                        <div className="grid grid-cols-3 gap-1 rounded-tile bg-surface-1 p-1" role="radiogroup" aria-label={t("crewMeet.genderSplit")}>
                            {(['random', 'spread', 'group'] as GenderDist[]).map((mode) => (
                                <button
                                    key={mode}
                                    type="button"
                                    role="radio"
                                    aria-checked={state.genderDist === mode}
                                    onClick={() => set({ genderDist: mode })}
                                    className={cn(
                                        "min-h-11 rounded-tile text-[13px] font-semibold",
                                        state.genderDist === mode ? "bg-brand text-brand-fg" : "text-ink-2 active:bg-surface-3",
                                    )}
                                >
                                    {mode === 'random' && t("clubActivityListView.random")}
                                    {mode === 'spread' && t("clubActivityListView.spreadFemale")}
                                    {mode === 'group' && t("clubActivityListView.groupFemale")}
                                </button>
                            ))}
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                        <button type="button" onClick={() => run(false)} disabled={totalCount === 0} className={CREW_BTN.primary}>
                            {t("clubActivityListView.balanceButton")}
                        </button>
                        <button type="button" onClick={() => run(true)} disabled={totalCount === 0} className={CREW_BTN.secondary}>
                            {t("clubActivityListView.fullRandomButton")}
                        </button>
                    </div>
                </>
            ) : (
                <>
                    <p className={CREW_TEXT.sub}>
                        {terms.teamLabel}{t("clubActivityListView.resultTitleSuffix")} <span className="rk-num">({state.teams.length}{t("clubActivityListView.unitSuffix")} {terms.teamLabel})</span>
                    </p>
                    <div className="grid gap-2 grid-cols-2">
                        {state.teams.map((team, idx) => (
                            <div key={idx} className="rounded-tile bg-surface-1 p-3">
                                <div className="flex items-center justify-between mb-2 pb-2 border-b border-surface-line">
                                    {/* 팀 색은 편성 결과를 가르는 데이터 색(teamGenerator) — 테마 토큰이 아니다 */}
                                    <h5 className="text-[13px] font-semibold" style={{ color: team.color }}>{team.name}</h5>
                                    <span className="text-[12px] font-medium text-ink-3 rk-num">{team.avg} {terms.unit}</span>
                                </div>
                                <ul className="space-y-1">
                                    {team.members.map((m: any, mIdx: number) => {
                                        const isMe = m.memberId === currentMemberId;
                                        return (
                                            <li key={mIdx} className="flex items-center gap-1.5">
                                                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: team.color }} />
                                                <span className={cn("text-[13px] truncate", isMe ? "text-brand font-semibold" : "text-ink-2 font-medium")}>
                                                    {m.member?.name}{isFemaleParticipant(m) && <span className="text-ink-4"> ♀</span>}
                                                </span>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </div>
                        ))}
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between">
                            <label htmlFor={`result-text-${activity.id}`} className={CREW_TEXT.sub}>{t("clubActivityListView.resultTextLabel")}</label>
                            <span className={CREW_TEXT.caption}>{t("clubActivityListView.resultTextHint")}</span>
                        </div>
                        <textarea
                            id={`result-text-${activity.id}`}
                            value={editedText ?? resultText}
                            onChange={(e) => setEditedText(e.target.value)}
                            className="w-full h-32 bg-surface-1 rounded-tile p-3 text-[13px] text-ink-2 font-mono leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                        <button type="button" onClick={() => { setEditedText(null); set({ step: 'setup' }); }} className={CREW_BTN.secondary}>
                            <LucideRefreshCw className="w-4 h-4" /> {t("clubActivityListView.resetButton")}
                        </button>
                        <button
                            type="button"
                            className={CREW_BTN.primary}
                            onClick={() => {
                                const fullMsg = editedText ?? resultText;
                                if (onShareToChat) onShareToChat(fullMsg);
                                else {
                                    void navigator.clipboard?.writeText(fullMsg);
                                    toast({ title: t("clubActivityListView.copySuccessTitle"), description: t("clubActivityListView.copySuccessDesc") });
                                }
                            }}
                        >
                            <LucideMessageCircle className="w-4 h-4" /> {t("clubActivityListView.shareToChat")}
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}

/** 지난 정모 한 줄 — 날짜 · 제목 · 참석 수(누르면 명단). */
function PastRow({ activity, onShowPeople }: { activity: any; onShowPeople: () => void }) {
    const { t, locale } = useT();
    const categoryKey = activityCategoryLabelKey(activity.category);
    const n = participantsOf(activity).length;
    // 언어별 짧은 월·일("9월 26일" / "Sep 26")
    const day = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(new Date(activity.activityDate));
    return (
        <li className="border-t border-surface-line first:border-0">
            <button type="button" onClick={onShowPeople} className="w-full min-h-14 px-4 py-2.5 flex items-center gap-3 text-left active:bg-surface-3">
                <span className="w-16 shrink-0 text-[12px] font-semibold text-ink-3 rk-num">{day}</span>
                <span className="flex-1 min-w-0">
                    <span className="block text-[15px] font-semibold text-ink-1 truncate">{activity.title}</span>
                    {categoryKey && <span className={CREW_TEXT.caption}>{t(categoryKey)}</span>}
                </span>
                <span className="text-[13px] font-semibold text-ink-3 rk-num shrink-0">{n}{t("clubActivityListView.personSuffix")}</span>
            </button>
        </li>
    );
}

/** 참석자 전체 명단(아바타 5개 뒤로 숨던 사람까지). */
function ParticipantsSheet({ activity, onClose }: { activity: any | null; onClose: () => void }) {
    const { t } = useT();
    const participants = participantsOf(activity);
    return (
        <Sheet open={!!activity} onOpenChange={(o) => { if (!o) onClose(); }}>
            <SheetContent side="bottom" className="bg-surface-1 rounded-t-card max-h-[75dvh] overflow-y-auto px-4 pb-[max(20px,env(safe-area-inset-bottom))]">
                <SheetHeader className="text-left">
                    <SheetTitle className="text-[17px] font-semibold text-ink-1 truncate pr-10">
                        {activity?.title} <span className="rk-num text-brand ml-1">{participants.length}</span>
                    </SheetTitle>
                </SheetHeader>
                {participants.length === 0 ? (
                    <p className={cn(CREW_TEXT.sub, "py-8 text-center")}>{t("crewMeet.noParticipants")}</p>
                ) : (
                    <ul className="mt-3 flex flex-col">
                        {participants.map((p: any, i: number) => (
                            <li key={p.memberId ?? i} className="flex items-center gap-3 min-h-12 border-t border-surface-line first:border-0">
                                <CrewAvatar src={p.member?.profileImageUrl} name={p.member?.name} size={32} />
                                <span className="text-[15px] font-medium text-ink-1 truncate">{p.member?.name}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </SheetContent>
        </Sheet>
    );
}
