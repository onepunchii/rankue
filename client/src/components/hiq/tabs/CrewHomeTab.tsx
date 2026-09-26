import { useState, memo, useMemo, useEffect } from "react";
import { Link } from "wouter";
import {
    LucideCalendar, LucideMapPin, LucideVote, LucideChevronRight, LucidePlus,
    LucideChevronDown, LucideUsers, LucideLogOut, LucideTrophy, LucidePhone, LucideStore,
    LucideCalendarPlus, LucideImagePlus, LucideMessageCircle,
} from "@/lib/icons";
import { CrewCover, CrewEmblem } from "@/components/hiq/crew-ui/brand";
import { daysTogether } from "@shared/crewBrand";
import { crewRowStatus } from "@shared/crewManage";
import { GAME_TYPE_LABEL } from "@/components/hiq/club/CrewRow";
import { cn } from "@/lib/utils";
import { HiqCrew, HiqStore } from "@shared/schema";
import { isPollClosed } from "@shared/crewActivity";
import { mapLink } from "@shared/storeMeta";
import { ClubActivityList } from "@/components/hiq/view/ClubActivityList";
import { CrewMemberList } from "@/components/hiq/CrewMemberList";
import { useQuery } from "@tanstack/react-query";
import { useT } from "@/lib/i18n";
import { BallDot } from "@/components/hiq/BallDot";
import {
    CREW_BTN, CREW_CARD, CREW_TEXT, ConfirmDialog, CrewEmpty, CrewError, CrewRoleBadge, CrewSection, CrewSkeleton,
} from "@/components/hiq/crew-ui";

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
    onTournamentClick: () => void;
    onCreateTournament: () => void;
    onOpenHallOfFame: () => void;
    /** 서버 활동 요약(GET /crews/:id 의 pulse) — 요약 줄의 '이번 달 정모' */
    pulse?: { monthActivities: number } | null;
    /** 내 역할(크루장·운영진 배지) */
    myRole?: string | null;
    /** 빠른 실행: 사진첩 탭으로 · 크루 채팅으로 */
    onOpenGallery: () => void;
    onOpenChat: () => void;
    // Received from parent for API symmetry but not used in this view.
    sportTab?: 'BILLIARDS' | 'GOLF';
    setSportTab?: (tab: 'BILLIARDS' | 'GOLF') => void;
}

/** 커버 높이 — 머리 버튼(44px)과 엠블럼(76px 중 38px 가 걸침)이 함께 앉는 높이 */
const COVER_H = 196;

/** 빠른 실행 한 칸 — 52px 둥근 사각 아이콘 + 12px 라벨. 칸 전체가 버튼(44px 이상). */
function QuickAction({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
    return (
        <button type="button" onClick={onClick} className="flex flex-col items-center gap-1.5 py-1 rounded-tile active:opacity-70">
            <span className="w-[52px] h-[52px] rounded-tile bg-surface-1 rk-shadow border border-surface-line flex items-center justify-center text-brand [&_svg]:w-6 [&_svg]:h-6">
                {icon}
            </span>
            <span className="text-[12px] font-semibold text-ink-2 text-center leading-tight">{label}</span>
        </button>
    );
}

/** 한 줄 통계 칸 — 숫자(17) + 라벨(12). 예전 칸은 배경 없이 숫자만 떠 있었다. */
function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
    return (
        <div className="flex flex-col items-center justify-center text-center gap-0.5 min-w-0 px-1">
            <span className="text-[17px] font-semibold text-ink-1 rk-num leading-tight truncate max-w-full">{value}</span>
            {sub && <span className="text-[12px] font-medium text-ink-3 rk-num leading-none">{sub}</span>}
            <span className="text-[12px] font-medium text-ink-3 truncate max-w-full">{label}</span>
        </div>
    );
}

export const CrewHomeTab = memo(({
    crew, baseStore, baseListing = null, members, isMember, isPending, isNotMember, isAdmin, me, onJoin, onLeave, isLeaving, isLeader, onCreateActivity, onCreatePoll, onShareToChat,
    onPollClick, onTournamentClick, onCreateTournament, onOpenHallOfFame, pulse = null, myRole = null, onOpenGallery, onOpenChat,
}: CrewHomeTabProps) => {
    const { t } = useT();
    // 내 크루 카드의 인원 버튼으로 들어오면 멤버 구역까지 내린다. 주소는 한 번 쓰고 지운다 —
    // 안 지우면 새로고침·뒤로가기마다 다시 튄다.
    useEffect(() => {
        if (typeof window === "undefined") return;
        const p = new URLSearchParams(window.location.search);
        if (p.get("focus") !== "members") return;
        p.delete("focus");
        const qs = p.toString();
        window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : ""));
        // 목록이 그려진 뒤에 재야 한다 — 두 프레임 뒤.
        const id = requestAnimationFrame(() => requestAnimationFrame(() => {
            document.getElementById("crew-members")?.scrollIntoView({ behavior: "smooth", block: "start" });
        }));
        return () => cancelAnimationFrame(id);
    }, []);

    const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
    const [confirmLeave, setConfirmLeave] = useState(false);

    const activeMembers = useMemo(() => members.filter((m: any) => m.role !== 'pending'), [members]);
    const isGolf = crew.sportCategory === 'GOLF';


    // 통계 계산 (useMemo 최적화)
    const stats = useMemo(() => {
        const statsMembers = activeMembers.filter((m: any) => m.member);
        const avgOf = (list: any[], pick: (m: any) => number) =>
            list.length > 0 ? list.reduce((a, b) => a + pick(b), 0) / list.length : 0;

        const with3c = statsMembers.filter((m: any) => (m.member.avg3c || 0) > 0);
        const with4c = statsMembers.filter((m: any) => (m.member.avg4c || 0) > 0);
        // 골프 평균 타수 — 타수가 없으면 핸디캡+72 로 어림한다(기존 계산 유지).
        const golfers = statsMembers.filter((m: any) => (m.member.golfAvgScore || 0) > 0 || (m.member.golfHandicap || 0) > 0);
        const golfScore = (m: any) => ((m.member.golfAvgScore || 0) > 0 ? m.member.golfAvgScore : (m.member.golfHandicap || 0) + 72);
        const avgGolf = avgOf(golfers, golfScore);

        return {
            count: statsMembers.length,
            avg3c: with3c.length ? avgOf(with3c, (m) => m.member.avg3c || 0).toFixed(2) : "-",
            avg4c: with4c.length ? Math.round(avgOf(with4c, (m) => m.member.avg4c || 0)).toLocaleString() : "-",
            golfers: golfers.length,
            avgGolfScore: golfers.length ? Math.round(avgGolf) : null,
            // 예전 라벨은 "HDCP" 였지만 값은 (평균 타수 − 72) — 핸디캡이 아니라 파(72) 대비 타수다.
            overPar: golfers.length ? avgGolf - 72 : null,
            totalPoints: statsMembers.reduce((acc, m) => acc + (m.member.totalSimPoints || 0), 0),
            totalRounds: statsMembers.reduce((acc, m) => acc + (m.member.totalGolfGames || 0), 0),
        };
    }, [activeMembers]);

    const overParText = stats.overPar === null ? null
        : `${stats.overPar >= 0 ? "+" : ""}${stats.overPar.toFixed(1)}`;

    // 요약 줄의 세 번째 칸 — 당구는 크루 종목(4구면 4구, 아니면 3쿠션) 평균 에버, 골프는 평균 타수(2026-09-26 A안)
    const avgCell = isGolf
        ? { label: t("crewHome.avgScore"), value: stats.avgGolfScore ?? "-" }
        : crew.gameType === "4c"
            ? { label: t("crewHome.avg4c"), value: stats.avg4c }
            : { label: t("crewHome.avg3c"), value: stats.avg3c };
    const together = daysTogether(crew.createdAt as unknown as string);
    const countLabel = crewRowStatus({ memberCount: activeMembers.length, maxMembers: crew.maxMembers }).countLabel;
    const [countNow, countMax] = countLabel.split("/");
    const gameKey = crew.gameType ? GAME_TYPE_LABEL[crew.gameType] : undefined;

    return (
        <div className="flex flex-col gap-8 pb-nav">
            {/* 1. 커버 · 엠블럼 · 이름 · 요약 줄 · 빠른 실행 (2026-09-26 크루 디자인 A안, 오너 승인 시안)
                사진이 없는 크루가 대부분이라 커버·엠블럼은 크루 id 로 자동으로 그린다(crew-ui/brand). 머리 버튼(뒤로·공유·설정)은
                club-detail 이 커버 위에 투명하게 얹는다. */}
            <div>
                <CrewCover crew={crew} height={COVER_H} alt={t("crewHub.coverAlt").replace("{name}", crew.name)} />

                <div className="px-4 -mt-[38px] relative z-10">
                    <div className="flex items-end gap-3">
                        <CrewEmblem crew={crew} size={76} ring="var(--surface-0)" showSport />
                        <div className="pb-1 flex flex-wrap gap-1.5 min-w-0">
                            <CrewRoleBadge role={myRole} />
                            {gameKey && <span className="rk-chip bg-surface-3 text-ink-2">{t(gameKey)}</span>}
                        </div>
                    </div>
                    <h1 className={cn(CREW_TEXT.title, "mt-2.5 leading-tight break-words")}>{crew.name}</h1>
                    <p className={cn(CREW_TEXT.sub, "mt-0.5 text-[14px]")}>{crew.shortIntro || crew.region || t("crewHome.ourCrew")}</p>

                    {/* 요약 한 줄: 멤버 · 이번 달 정모 · 평균 · 함께한 날 */}
                    <section className={cn(CREW_CARD, "mt-3.5 grid grid-cols-4 divide-x divide-surface-line py-3 px-0")} aria-label={t("crewHub.stats")}>
                        <Stat label={t("crewHome.members")} value={<>{countNow}{countMax && <span className="text-[12px] text-ink-3">/{countMax}</span>}</>} />
                        <Stat label={t("crewHome.monthMeetups")} value={pulse ? pulse.monthActivities : "-"} />
                        <Stat label={avgCell.label} value={avgCell.value} />
                        <Stat label={t("crewHome.together")} value={together ? <>{together.toLocaleString()}<span className="text-[12px] text-ink-3">{t("crewHome.dayUnit")}</span></> : "-"} />
                    </section>
                </div>

                {/* 빠른 실행 — 크루원만. 자주 쓰는 동작을 한 번에(정모 만들기 · 투표 · 사진 올리기 · 크루 채팅) */}
                {isMember && (
                    <div className="px-4 mt-4 grid grid-cols-4 gap-2">
                        <QuickAction icon={<LucideCalendarPlus />} label={t("crewHome.qaMeetup")} onClick={onCreateActivity} />
                        <QuickAction icon={<LucideVote />} label={t("crewHome.qaPoll")} onClick={onPollClick} />
                        <QuickAction icon={<LucideImagePlus />} label={t("crewHome.qaPhoto")} onClick={onOpenGallery} />
                        <QuickAction icon={<LucideMessageCircle />} label={t("crewHome.qaChat")} onClick={onOpenChat} />
                    </div>
                )}

                {/* 소개 · 정모 요일 · 지역 — 두 줄까지만, 더 보기로 펼친다 */}
                <div className="px-4 mt-4 flex flex-col gap-2">
                    {crew.description && (
                        <div>
                            <p className={cn(
                                "text-[15px] font-medium text-ink-2 leading-relaxed whitespace-pre-wrap",
                                !isDescriptionExpanded && "line-clamp-2"
                            )}>
                                {crew.description}
                            </p>
                            {crew.description.length > 50 && (
                                <button
                                    type="button"
                                    onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
                                    aria-expanded={isDescriptionExpanded}
                                    className={cn(CREW_BTN.ghost, "-ml-3 text-brand")}
                                >
                                    {isDescriptionExpanded ? t("crewHome.collapse") : t("crewHome.expand")}
                                    <LucideChevronDown className={cn("w-4 h-4 transition-transform", isDescriptionExpanded && "rotate-180")} />
                                </button>
                            )}
                        </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                        {crew.meetingDay && (
                            <span className="rk-chip bg-surface-3 text-ink-2 py-2">
                                <LucideCalendar className="w-3.5 h-3.5 text-brand" />
                                {crew.meetingDay} {crew.meetingTime}
                            </span>
                        )}
                        <span className="rk-chip bg-surface-3 text-ink-2 py-2">
                            <LucideMapPin className="w-3.5 h-3.5 text-brand" />
                            {crew.region || t("crewHome.region")}
                        </span>
                    </div>
                </div>
            </div>

            <div className="px-4 flex flex-col gap-8">
                {/* 2. 다음 정모 — 크루 홈에서 제일 먼저 궁금한 것 */}
                <CrewSection title={t("crewHub.nextMeetup")}>
                    <ClubActivityList
                        crewId={crew.id}
                        isMember={isMember}
                        currentMemberId={me?.id}
                        sportType={isGolf ? 'GOLF' : 'BILLIARDS'}
                        onCreateClick={onCreateActivity}
                        onShareToChat={onShareToChat}
                        isAdmin={isAdmin}
                    />
                </CrewSection>

                {/* 4. 투표 — 크루원 전용(서버가 비회원에게 403). 예전엔 비회원에게 '투표 없음' 으로 잘못 보였다. */}
                {isMember && (
                    <CrewSection title={t("crewHub.polls")} action={{ label: t("crewUi.seeAll"), onClick: onPollClick }}>
                        <PollPreview crewId={crew.id} onOpen={onPollClick} onCreate={onCreatePoll} />
                    </CrewSection>
                )}

                {/* 5. 대회 — 3쿠션/4구 전용이라 골프 크루에는 그리지 않는다(2026-09-09 오너: 두 종목을 아예 가른다). 크루원 전용. */}
                {isMember && !isGolf && (
                    <CrewSection title={t("crewHome.tournament")} action={{ label: t("crewUi.seeAll"), onClick: onTournamentClick }}>
                        <TournamentPreview crewId={crew.id} onOpen={onTournamentClick} onCreate={isAdmin ? onCreateTournament : undefined} />
                        {/* 명예의 전당은 전용 페이지로 — 홈에 펼쳐 두면 목록이 길어져 대회가 묻힌다. */}
                        <button
                            type="button"
                            onClick={onOpenHallOfFame}
                            className={cn(CREW_CARD, "w-full min-h-12 py-3 flex items-center gap-2.5 text-left active:bg-surface-3")}
                        >
                            <LucideTrophy className="w-5 h-5 text-gold shrink-0" />
                            <span className="flex-1 text-[15px] font-semibold text-ink-1">{t("hallOfFame.title")}</span>
                            <LucideChevronRight className="w-4 h-4 text-ink-4" />
                        </button>
                    </CrewSection>
                )}

                {/* 6. 베이스캠프 */}
                <CrewSection title={t("crewHome.baseCamp")}>
                    <BaseCamp baseStore={baseStore} baseListing={baseListing} />
                </CrewSection>

                {/* 7. 멤버 — 내 크루 카드의 인원 버튼이 ?focus=members 로 여기까지 데려온다(2026-09-23) */}
                <div id="crew-members" className="scroll-mt-4">
                    <CrewSection title={t("crewHome.members")} count={activeMembers.length}>
                        <CrewMemberList members={activeMembers} currentMemberId={me?.id} sportCategory={crew.sportCategory} crewId={crew.id} />
                    </CrewSection>
                </div>

                {/* 크루 탈퇴 (일반 멤버 · 크루장 제외) — 44px 보조 버튼 */}
                {isMember && !isLeader && onLeave && (
                    <div className="flex justify-center pb-4">
                        <button type="button" disabled={isLeaving} onClick={() => setConfirmLeave(true)} className={CREW_BTN.ghost}>
                            <LucideLogOut className="w-4 h-4" />
                            {t("crewHome.leaveCrew")}
                        </button>
                        <ConfirmDialog
                            open={confirmLeave}
                            onOpenChange={setConfirmLeave}
                            title={t("crewHome.leaveConfirmTitle")}
                            desc={t("crewHome.leaveConfirmDesc")}
                            confirmLabel={t("crewHome.leaveAction")}
                            busy={isLeaving}
                            onConfirm={() => { setConfirmLeave(false); onLeave(); }}
                        />
                    </div>
                )}
            </div>

            {/* 가입 버튼(비회원) · 승인 대기 */}
            {(isNotMember || isPending) && (
                <div className="fixed above-nav left-0 right-0 px-4 py-2 z-50 pointer-events-none">
                    {isPending ? (
                        <div className="flex items-center gap-2 pointer-events-auto">
                            <div className="flex-1 h-14 rounded-pill flex items-center justify-center text-[15px] font-semibold bg-surface-1 text-ink-3 rk-shadow">
                                {t("crewHome.pendingApproval")}
                            </div>
                            {onLeave && (
                                <button type="button" onClick={onLeave} disabled={isLeaving} className={cn(CREW_BTN.secondary, "h-14 px-5 rk-shadow")}>
                                    {t("crewHome.cancelRequest")}
                                </button>
                            )}
                        </div>
                    ) : (
                        <button type="button" onClick={onJoin} className={cn(CREW_BTN.primary, "w-full h-14 text-[17px] pointer-events-auto rk-shadow")}>
                            {t("crewHome.joinCrew")}
                        </button>
                    )}
                </div>
            )}
        </div>
    );
});

/**
 * 베이스캠프 카드. 예전 '전화하기'·'위치보기' 는 누를 곳만 있고 동작이 없었다.
 *  - 전화: 매장 전화번호가 있을 때만(tel:).
 *  - 지도: 주소로 지도 앱 검색(매장 페이지와 같은 mapLink).
 *  - 매장 보기: 파트너 매장은 /store/:slug(디렉토리에 연결됐으면 그쪽으로 넘어간다), 디렉토리 매장은 /stores/:code.
 */
function BaseCamp({ baseStore, baseListing }: { baseStore: HiqStore | null; baseListing: { code: string; name: string; address: string } | null }) {
    const { t } = useT();
    const place = baseStore
        ? { name: baseStore.name, address: baseStore.address ?? "", phone: baseStore.phone, href: baseStore.slug ? `/store/${baseStore.slug}` : null, official: true }
        : baseListing
            ? { name: baseListing.name, address: baseListing.address ?? "", phone: null as string | null, href: `/stores/${baseListing.code}`, official: false }
            : null;

    if (!place) return <CrewEmpty icon={<LucideStore />} title={t("crewHome.noBaseCamp")} />;

    const mapHref = place.address ? mapLink({ name: place.name, address: place.address }) : null;
    const btn = cn(CREW_BTN.secondary, "flex-1 px-2");
    return (
        <div className={cn(CREW_CARD, "flex flex-col gap-3")}>
            <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                    <h3 className="text-[17px] font-semibold text-ink-1 truncate">{place.name}</h3>
                    {place.address && <p className={cn(CREW_TEXT.sub, "mt-0.5 break-words")}>{place.address}</p>}
                </div>
                {place.official && <span className="rk-chip bg-brand/10 text-brand shrink-0">{t("crewHome.official")}</span>}
            </div>
            <div className="flex gap-2">
                {place.phone && (
                    <a href={`tel:${place.phone}`} className={btn}>
                        <LucidePhone className="w-4 h-4" /> {t("crewHome.call")}
                    </a>
                )}
                {mapHref && (
                    <a href={mapHref} target="_blank" rel="noopener noreferrer" className={btn}>
                        <LucideMapPin className="w-4 h-4" /> {t("crewHome.viewLocation")}
                    </a>
                )}
                {place.href && (
                    <Link href={place.href} className={cn(CREW_BTN.primary, "flex-1 px-2")}>
                        {t("crewHub.viewStore")}
                    </Link>
                )}
            </div>
        </div>
    );
}

// 대회 요약 — 진행 중/모집 중인 것 위주로 최대 2개. 전체는 대회 탭에서 본다. 크루원에게만 그린다.
const TournamentPreview = ({ crewId, onOpen, onCreate }: { crewId: string; onOpen: () => void; onCreate?: () => void }) => {
    const { t } = useT();
    const { data: list, isLoading, isError, refetch } = useQuery<any[]>({
        queryKey: [`/api/hiq/crews/${crewId}/tournaments`],
        enabled: !!crewId,
    });

    if (isLoading) return <CrewSkeleton rows={1} height={88} />;
    if (isError) return <CrewError onRetry={() => refetch()} />;
    if (!list || list.length === 0) return (
        <CrewEmpty
            icon={<LucideTrophy />}
            title={t("crewHome.noTournaments")}
            action={onCreate ? { label: t("crewHub.createTournament"), onClick: onCreate } : undefined}
        />
    );

    // 끝난 대회보다 진행·모집 중인 대회를 먼저
    const sorted = [...list].sort((a, b) => Number(a.status === "ended") - Number(b.status === "ended"));
    return (
        <div className="flex flex-col gap-2">
            {sorted.slice(0, 2).map((tr: any) => (
                <button key={tr.id} type="button" onClick={onOpen} className={cn(CREW_CARD, "w-full text-left flex items-center gap-3 active:bg-surface-3")}>
                    <div className="flex-1 min-w-0 flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                            <BallDot type={tr.gameType} size={11} />
                            <span className={cn("text-[12px] font-semibold", tr.status === "ended" ? "text-ink-3" : "text-brand")}>
                                {t(`crewTournament.status.${tr.status}`)}
                            </span>
                        </div>
                        <h3 className="text-[15px] font-semibold text-ink-1 truncate">{tr.title}</h3>
                        <span className={cn(CREW_TEXT.caption, "flex items-center gap-1 rk-num")}>
                            <LucideUsers className="w-3.5 h-3.5" />{tr.participantCount}/{tr.maxPlayers}
                        </span>
                    </div>
                    <LucideChevronRight className="w-4 h-4 text-ink-4 shrink-0" />
                </button>
            ))}
        </div>
    );
};

// 투표 요약에 필요한 칸만. isClosed·voterCount 는 서버가 새로 내려주는 값이라 옛 응답에는 없다(없으면 대신 계산).
interface PollSummary {
    id: string;
    title: string;
    status?: string | null;
    endTime?: string | null;
    isClosed?: boolean | null;
    voterCount?: number | null;
    totalVotes?: number | null;
    isAnonymous?: boolean;
    allowMultiple?: boolean;
    options?: { id: string; text: string; voteCount: number }[];
}

const PollPreview = ({ crewId, onOpen, onCreate }: { crewId: string; onOpen: () => void; onCreate: () => void }) => {
    const { t } = useT();
    const { data: polls, isLoading, isError, refetch } = useQuery<PollSummary[]>({
        queryKey: [`/api/hiq/crews/${crewId}/polls`],
        enabled: !!crewId,
    });

    if (isLoading) return <CrewSkeleton rows={1} height={120} />;
    if (isError) return <CrewError onRetry={() => refetch()} />;
    if (!polls || polls.length === 0) return (
        <CrewEmpty icon={<LucideVote />} title={t("crewHome.noPolls")} action={{ label: t("crewHub.createPoll"), onClick: onCreate }} />
    );

    // 진행 중인 것을 먼저, 최대 2개. '진행 중' 판정: 서버 status 는 마감 뒤에도 active 로 남아서 마감 시각으로도 본다.
    const now = new Date();
    const sorted = [...polls].sort((a, b) => Number(isPollClosed(a, now)) - Number(isPollClosed(b, now)));

    return (
        <div className="flex flex-col gap-2">
            {sorted.slice(0, 2).map((poll) => {
                const closed = isPollClosed(poll, now);
                const totalVotes = Number(poll.totalVotes) || 0;
                // 복수 선택 투표는 표 수 ≠ 사람 수 — 서버가 voterCount 를 주면 그걸 쓴다.
                const people = Number(poll.voterCount ?? poll.totalVotes) || 0;
                // 서버 옵션 순서는 만든 순서 — 표가 많은 것을 '1위' 로
                const best = [...(poll.options || [])].sort((a, b) => Number(b.voteCount) - Number(a.voteCount))[0];
                const pct = best && totalVotes > 0 ? Math.round((Number(best.voteCount) / totalVotes) * 100) : 0;
                return (
                    <button key={poll.id} type="button" onClick={onOpen} className={cn(CREW_CARD, "w-full text-left flex flex-col gap-3 active:bg-surface-3")}>
                        <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={cn("rk-chip", closed ? "bg-surface-3 text-ink-3" : "bg-brand/10 text-brand")}>
                                {closed ? t("crewHome.pollEnded") : t("crewHome.pollActive")}
                            </span>
                            {poll.isAnonymous && <span className="rk-chip bg-surface-3 text-ink-2">{t("crewHome.pollAnonymous")}</span>}
                            {poll.allowMultiple && <span className="rk-chip bg-surface-3 text-ink-2">{t("crewHome.pollMultiple")}</span>}
                        </div>
                        <h3 className="text-[15px] font-semibold text-ink-1 leading-snug line-clamp-2">{poll.title}</h3>
                        {best && totalVotes > 0 && (
                            <div className="flex flex-col gap-1.5">
                                <div className="flex items-center justify-between gap-2 text-[13px]">
                                    <span className="font-medium text-ink-2 truncate">{t("crewHome.currentLeader")} {best.text}</span>
                                    <span className="font-semibold text-ink-1 rk-num shrink-0">{best.voteCount}{t("crewHome.votesSuffix")}</span>
                                </div>
                                <div className="h-1.5 rounded-pill bg-surface-3 overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                                    <div className="h-full bg-brand rounded-pill" style={{ width: `${pct}%` }} />
                                </div>
                            </div>
                        )}
                        <span className={cn(CREW_TEXT.caption, "flex items-center gap-1 rk-num")}>
                            <LucideUsers className="w-3.5 h-3.5" />{people}{t("crewHome.participantsSuffix")}
                        </span>
                    </button>
                );
            })}
            <button type="button" onClick={onCreate} className={cn(CREW_BTN.ghost, "self-start -ml-3")}>
                <LucidePlus className="w-4 h-4" /> {t("crewHub.createPoll")}
            </button>
        </div>
    );
};

CrewHomeTab.displayName = "CrewHomeTab";
