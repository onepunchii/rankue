import { useState, useEffect, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
    LucideChevronLeft,
    LucideShare2,
    LucideMoreVertical,
    LucideSettings,
    LucideLoader2,
    LucideHome,
    LucideFileText,
    LucideImage,
    LucideMessageCircle,
    LucideLock,
    LucideLogOut,
    LucideTrophy,
    LucideRefreshCw,
} from "@/lib/icons";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { HiqCrew, HiqStore } from "@shared/schema";
import { useSeo } from "@/hooks/useSeo";
import { crewTitle, crewDescription } from "@shared/crewMeta";
import { crewImageSrc } from "@shared/crewManage";
import { useAuth } from "@/hooks/useAuth";
import { goLogin } from "@/components/hiq/LoginGate";
import { ClubSettingsDialog, type ClubSettingsTab } from "@/components/hiq/ClubSettingsDialog";
import { CreateActivityDialog } from "@/components/hiq/CreateActivityDialog";
import { CreateGolfActivityModal } from "@/components/hiq/club/activity/CreateGolfActivityModal";
import { CreatePostDialog } from "@/components/hiq/CreatePostDialog";
import { CrewBoardTab, CrewGalleryTab, CrewHomeTab, CrewPollTab, CrewTournamentTab } from "@/components/hiq/tabs";
import { CreatePollDialog } from "@/components/hiq/CreatePollDialog";
import { CreateSettlementDialog } from "@/components/hiq/settlement/CreateSettlementDialog";
import { SettlementDetailDialog } from "@/components/hiq/settlement/SettlementDetailDialog";
import { PostDetailDialog } from "@/components/hiq/PostDetailDialog";
import { CrewActionSheet, type CrewSheetAction } from "@/components/hiq/club/CrewActionSheet";
import { CREW_BTN, CREW_TEXT, ConfirmDialog, CrewAvatar, CrewSkeleton, IconButton } from "@/components/hiq/crew-ui";
import { useT } from "@/lib/i18n";

type CrewTab = 'home' | 'board' | 'gallery' | 'chat' | 'poll' | 'tournament';
const VALID_TABS: readonly CrewTab[] = ['home', 'board', 'gallery', 'chat', 'poll', 'tournament'];
// 좌우로 밀어 넘기는 탭(투표·대회는 홈에서 들어가는 하위 화면이라 빠진다)
const SWIPE_TABS: readonly CrewTab[] = ['home', 'board', 'gallery'];
// 게시판 분류의 '전체' — 화면 글자가 아니라 서버 글(p.category)과 비교하는 데이터 값이라 번역하지 않는다.
// 보이는 이름은 CrewBoardTab 이 사전(crewBoard.categoryAll)으로 바꿔 그린다.
const BOARD_ALL = "전체";
// 하단 탭바 높이(안전영역 제외) — 본문 아래 여백도 이 값에서 나온다.
const NAV_H = 60;
const CONTENT_BOTTOM_PAD = { paddingBottom: `calc(${NAV_H + 16}px + env(safe-area-inset-bottom))` };

/** 딥링크 탭(/crew/:id/:tab 별칭 또는 ?tab=). 초기 탭과 채팅 리다이렉트가 같은 규칙을 쓴다. */
function readDeepLinkTab(routeTab?: string | null): CrewTab | null {
    let tab: string | null | undefined = routeTab;
    if (!tab && typeof window !== 'undefined') tab = new URLSearchParams(window.location.search).get('tab');
    const normalized = tab?.toLowerCase();
    return normalized && (VALID_TABS as readonly string[]).includes(normalized) ? (normalized as CrewTab) : null;
}

export default function HiqClubDetail() {
    const [, params] = useRoute("/club/:id");
    // 호환 별칭: 이미 발송된 푸시 페이로드가 /crew/:id/:tab 로 진입할 수 있다.
    const [, crewParams] = useRoute("/crew/:id/:tab?");
    const [, setLocation] = useLocation();

    // 크루 상세는 HiqNavigation 대신 자체 탭바(홈·게시판·사진첩·채팅)를 쓴다.
    // 그래서 HiqNavigation 이 켜 주는 표식이 없어 앱 설치 배너가 이 탭바를 덮고 있었다.
    // 같은 표식을 여기서도 남긴다(index.css 의 html[data-bottom-nav] 규칙).
    useEffect(() => {
        document.documentElement.dataset.bottomNav = "1";
        return () => { delete document.documentElement.dataset.bottomNav; };
    }, []);
    const { toast } = useToast();
    const { t } = useT();
    const id = params?.id ?? crewParams?.id;

    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [settingsTab, setSettingsTab] = useState<ClubSettingsTab | undefined>(undefined);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isLeaveConfirmOpen, setIsLeaveConfirmOpen] = useState(false);
    const [isCreateActivityOpen, setIsCreateActivityOpen] = useState(false);
    const [isCreatePollOpen, setIsCreatePollOpen] = useState(false);
    const [isCreatePostOpen, setIsCreatePostOpen] = useState(false);
    // 딥링크 탭은 반드시 useState "초기값"으로 반영한다. 마운트 직후 useEffect에서
    // setActiveTab을 하면 AnimatePresence(mode="wait")가 home 탭의 exit 완료 신호를
    // 못 받아 다음 탭이 영영 마운트되지 않는다 → /crew/:id/board 진입 시 빈 화면.
    // (예전엔 같은 규칙을 useEffect 로 한 번 더 적용하고 있었다 — 위 이유로 초기값 하나만 남겼다.)
    const [activeTab, setActiveTab] = useState<CrewTab>(() => readDeepLinkTab(crewParams?.tab) ?? 'home');
    const [boardCategory, setBoardCategory] = useState(BOARD_ALL);
    // 홈의 대회 "만들기" → 대회 탭으로 옮기면서 개설 다이얼로그까지 열어준다.
    const [tournamentAutoCreate, setTournamentAutoCreate] = useState(false);
    // 명예의 전당에서 역대 대회를 누르면 대회 탭으로 옮기면서 그 대진표를 연다.
    const [tournamentOpenId, setTournamentOpenId] = useState<string | null>(() => {
        if (typeof window === 'undefined') return null;
        return new URLSearchParams(window.location.search).get('open');
    });
    const [isCreateSettlementOpen, setIsCreateSettlementOpen] = useState(false);
    // 채팅의 정산 카드(chat-room openCard)가 ?settlement=<id> 로 보낸다 — 예전엔 아무도 안 읽어 크루 홈만 떴다(2026-09-22 리뷰).
    const [selectedSettlementId, setSelectedSettlementId] = useState<string | null>(() => {
        if (typeof window === 'undefined') return null;
        const v = new URLSearchParams(window.location.search).get('settlement');
        return v && /^[0-9a-f-]{36}$/i.test(v) ? v : null;
    });
    // 가입 신청 알림(서버 join 라우트)이 ?manage=members 로 보낸다 — 운영진이면 멤버 관리(가입 대기)를 곧장 연다.
    const [manageDeepLink] = useState(() => typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('manage') === 'members');
    const manageHandled = useRef(false);
    const [selectedPost, setSelectedPost] = useState<any>(null);
    const [sportTab, setSportTab] = useState<'BILLIARDS' | 'GOLF'>('BILLIARDS');

    // 채팅 탭은 2026-09-21 채팅 탭(/chat/crew/:id)으로 옮겼다 — 딥링크 'chat' 은 그리로 보낸다.
    useEffect(() => {
        if (readDeepLinkTab(crewParams?.tab) === 'chat' && id) setLocation(`/chat/crew/${id}`, { replace: true });
    }, [id, crewParams?.tab]);

    const handleSwipe = (direction: number) => {
        const currentIndex = SWIPE_TABS.indexOf(activeTab);
        if (currentIndex < 0) return; // 투표·대회(하위 화면)에서는 넘기지 않는다
        const nextIndex = currentIndex + direction;
        if (nextIndex >= 0 && nextIndex < SWIPE_TABS.length) setActiveTab(SWIPE_TABS[nextIndex]);
    };
    // 탭 컨테이너 공통 — 좌우로 밀어 탭 넘기기. 예전엔 탭마다 같은 코드가 네 벌 복사돼 있었다.
    const swipeProps = {
        initial: { opacity: 0, x: -20 },
        animate: { opacity: 1, x: 0 },
        exit: { opacity: 0, x: 20 },
        drag: "x" as const,
        dragDirectionLock: true,
        dragConstraints: { left: 0, right: 0 },
        dragElastic: 0.2,
        onDragEnd: (_: unknown, info: { offset: { x: number }; velocity: { x: number } }) => {
            const swipe = info.offset.x;
            const velocity = info.velocity.x;
            if (swipe < -100 || velocity < -500) handleSwipe(1);
            else if (swipe > 100 || velocity > 500) handleSwipe(-1);
        },
        className: "h-full overflow-y-auto custom-scrollbar",
        style: CONTENT_BOTTOM_PAD,
    };

    const { data: selectedSettlement } = useQuery({
        queryKey: [`/api/hiq/settlements/${selectedSettlementId}`],
        enabled: !!selectedSettlementId
    });

    const { member: me, isGuest } = useAuth();

    const postsQuery = useQuery<any[]>({
        queryKey: [`/api/hiq/crews/${id}/posts`],
        enabled: !!id && activeTab === 'board',
    });

    const shareToChatMutation = useMutation({
        mutationFn: async (message: string) => {
            return await apiRequest(`/api/hiq/crews/${id}/chats`, {
                method: "POST",
                body: JSON.stringify({ message })
            });
        },
        onSuccess: () => {
            toast({ title: t("clubDetail.sharedToChat") });
            queryClient.invalidateQueries({ queryKey: [`/api/hiq/crews/${id}/chats`] });
        },
        onError: (err: Error) => {
            toast({ title: t("clubDetail.actionFailed"), description: err.message, variant: "destructive" });
        }
    });

    const { data: crewData, isLoading, isError, error, refetch, isRefetching } = useQuery<{ crew: HiqCrew, baseStore: HiqStore, baseListing?: { code: string; name: string; address: string } | null, members: any[] }>({
        queryKey: [`/api/hiq/crews/${id}`],
        enabled: !!id,
        // 들어올 때마다 새로 받는다 — 쿼리 캐시가 localStorage 에 7일 남아서, 가입·승인 직후 돌아오면 옛 멤버 목록이 보였다.
        // (예전엔 마운트 때 invalidateQueries 를 불러 같은 일을 했다 — 이 화면의 구독에만 거는 편이 정확하다.)
        refetchOnMount: "always",
    });

    // 크루 페이지의 title/description/canonical. 조립식은 shared/crewMeta.ts 가 정본이고
    // server/prerender.ts 가 같은 함수를 쓴다 — 크롤러가 JS 를 실행했을 때와 안 했을 때의
    // 제목이 어긋나지 않게 하려는 것이다. 데이터 로딩 전에는 홈 기본값을 그대로 둔다.
    useSeo(
        crewData?.crew
            ? {
                  title: crewTitle(crewData.crew),
                  description: crewDescription(crewData.crew),
                  path: `/club/${id ?? ""}`,
              }
            : null,
    );

    // Set initial sportTab based on crew category - Move above conditional returns
    useEffect(() => {
        if (crewData?.crew?.sportCategory) {
            setSportTab(crewData.crew.sportCategory as 'BILLIARDS' | 'GOLF');
        }
    }, [crewData?.crew?.sportCategory]);

    // 내 자리 — 아래 조기 반환보다 먼저 계산해야 딥링크 효과(훅)가 쓸 수 있다.
    const members: any[] = crewData?.members ?? [];
    const myMemberData = members.find((m: any) => m.member?.id === me?.id);
    const myRole: string | undefined = myMemberData?.role;
    const isMember = !!myMemberData && myRole !== 'pending';
    const isPending = myRole === 'pending';
    const isNotMember = !myMemberData;
    const isLeader = myRole === 'leader';
    const isAdmin = myRole === 'leader' || myRole === 'manage';
    const hasPending = members.some((m: any) => m.role === 'pending');

    const openSettings = (tab?: ClubSettingsTab) => { setSettingsTab(tab); setIsSettingsOpen(true); };

    useEffect(() => {
        if (!manageDeepLink || manageHandled.current || !crewData || !me) return;
        manageHandled.current = true;
        // 새로고침·뒤로가기 때 다시 열리지 않게 주소에서 뗀다.
        try {
            const u = new URL(window.location.href);
            u.searchParams.delete('manage');
            window.history.replaceState(window.history.state, '', u.pathname + u.search + u.hash);
        } catch { /* 주소를 못 고쳐도 기능에는 지장 없다 */ }
        if (isAdmin) openSettings('members');
    }, [manageDeepLink, crewData, me, isAdmin]);

    const invalidateLists = () => {
        queryClient.invalidateQueries({ queryKey: [`/api/hiq/crews/${id}`] });
        // 내 크루 목록 및 디스커버리(멤버 수) 리스트 갱신 — 가입·탈퇴 즉시 반영
        queryClient.invalidateQueries({ queryKey: ['/api/hiq/crews/mine'] });
        queryClient.invalidateQueries({ queryKey: ['/api/hiq/crews'] });
    };

    const joinMutation = useMutation({
        mutationFn: async () => {
            return await apiRequest(`/api/hiq/crews/${id}/join`, { method: "POST" });
        },
        onSuccess: (data: any) => {
            toast({
                title: data.role === 'pending' ? t("clubDetail.joinPendingTitle") : t("clubDetail.joinDoneTitle"),
                description: data.role === 'pending' ? t("clubDetail.joinPendingDesc") : t("clubDetail.joinDoneDesc")
            });
            invalidateLists();
        },
        onError: (err: Error) => {
            toast({ title: t("clubDetail.joinFailed"), description: err.message, variant: "destructive" });
        }
    });
    // 게스트가 가입을 누르면 401 토스트 대신 로그인으로 보낸다. 로그인 뒤 이 크루 페이지로 되돌아온다(goLogin 의 redirect).
    const handleJoin = () => (isGuest ? goLogin(setLocation) : joinMutation.mutate());

    // Leave crew / cancel a pending join request (self only). Server rejects a leader leaving.
    const leaveMutation = useMutation({
        mutationFn: async () => {
            return await apiRequest(`/api/hiq/crews/${id}/members/${me?.id}`, { method: "DELETE" });
        },
        onSuccess: () => {
            toast({ title: isPending ? t("crewMgmt.requestCancelled") : t("clubDetail.leftCrew") });
            setIsLeaveConfirmOpen(false);
            invalidateLists();
            setLocation("/club");
        },
        onError: (err: Error) => {
            toast({ title: t("clubDetail.actionFailed"), description: err.message, variant: "destructive" });
        }
    });

    const createSettlementMutation = useMutation({
        mutationFn: async (data: any) => {
            return await apiRequest(`/api/hiq/crews/${id}/settlements`, {
                method: "POST",
                body: JSON.stringify(data)
            });
        },
        onSuccess: () => {
            toast({ title: t("clubDetail.settlementCreated"), description: t("clubDetail.settlementSentToChat") });
            setIsCreateSettlementOpen(false);
            queryClient.invalidateQueries({ queryKey: [`/api/hiq/crews/${id}/chats`] });
            setLocation(`/chat/crew/${id}`);
        },
        onError: (err: Error) => {
            toast({ title: t("clubDetail.createFailed"), description: err.message, variant: "destructive" });
        }
    });

    // 뒤로 — 앱 안에서 들어왔으면 이전 화면(목록·홈·알림함 어디서 왔든)으로. 새 탭·외부 링크로 바로 열려
    // 돌아갈 곳이 없으면 크루 목록으로. 예전 X 는 늘 대시보드로 보내서 크루 목록에서 들어와도 목록을 잃었다.
    const goBack = () => {
        if (typeof window !== 'undefined' && window.history.length > 1) window.history.back();
        else setLocation("/club");
    };

    if (isLoading) return <div className="h-[100dvh] bg-surface-0 flex items-center justify-center text-ink-3"><LucideLoader2 className="animate-spin w-8 h-8" /></div>;
    if (!crewData || !crewData.crew) {
        // 404 만 '없는 크루'다. 네트워크·서버 오류까지 "찾을 수 없어요"로 보이면 멀쩡한 크루를 지워진 줄 안다.
        const notFound = !isError || (error as any)?.status === 404;
        return (
            <div className="h-[100dvh] bg-surface-0 flex flex-col items-center justify-center gap-3 px-8 text-center" role={notFound ? undefined : "alert"}>
                <p className={CREW_TEXT.body}>{notFound ? t("clubDetail.notFound") : t("crewUi.loadFailed")}</p>
                <div className="flex gap-2">
                    <button type="button" onClick={goBack} className={CREW_BTN.secondary}>{t("common.back")}</button>
                    {!notFound && (
                        <button type="button" onClick={() => refetch()} disabled={isRefetching} className={CREW_BTN.primary}>
                            {isRefetching ? <LucideLoader2 className="w-4 h-4 animate-spin" /> : <LucideRefreshCw className="w-4 h-4" />}
                            {t("crewUi.retry")}
                        </button>
                    )}
                </div>
            </div>
        );
    }

    const { crew, baseStore, baseListing = null } = crewData;
    const isGolfCrew = crew.sportCategory === 'GOLF';

    // 게시판·사진첩·투표·대회는 서버도 크루원 전용으로 막혀 있다 — 비멤버·승인 대기자에게는
    // 빈 목록 대신 가입 안내를 보여준다. 가입 버튼도 여기 둔다(예전엔 안내만 있고 가입하려면 홈으로 돌아가야 했다).
    const membersOnlyNotice = (
        <div className="min-h-full flex flex-col items-center justify-center gap-1.5 px-8 py-12 text-center">
            <span className="w-12 h-12 mb-1 rounded-full bg-surface-3 text-ink-3 inline-flex items-center justify-center" aria-hidden="true">
                <LucideLock className="w-6 h-6" />
            </span>
            <p className={CREW_TEXT.body}>{t("clubDetail.membersOnlyTitle")}</p>
            <p className={cn(CREW_TEXT.sub, "max-w-[280px] leading-relaxed")}>
                {isPending ? t("clubDetail.membersOnlyPending") : t("crewMgmt.membersOnlyDesc")}
            </p>
            {isNotMember && (
                <button type="button" onClick={handleJoin} disabled={joinMutation.isPending} className={cn(CREW_BTN.primary, "mt-3")}>
                    {joinMutation.isPending ? <LucideLoader2 className="w-4 h-4 animate-spin" /> : crew.joinType === 'approval' ? t("crewMgmt.requestJoin") : t("crewMgmt.join")}
                </button>
            )}
        </div>
    );

    // 투표·대회는 홈에서 들어가는 하위 화면 — 탭바에 자리가 없어 돌아갈 길이 안 보였다. 머리에 '홈으로'를 둔다.
    const subHeader = (title: string) => (
        <div className="rk-no-safe sticky top-0 z-10 h-12 pl-1 pr-4 flex items-center gap-1 bg-surface-0 border-b border-surface-line">
            <IconButton label={t("crewMgmt.backToHome")} onClick={() => setActiveTab('home')}>
                <LucideChevronLeft />
            </IconButton>
            <h2 className={cn(CREW_TEXT.section, "truncate")}>{title}</h2>
        </div>
    );

    const handleShare = async () => {
        // 공개 정본 URL 은 /club/:id 다. window.location.href 는 앱 내부 경로(/crew/:id/home,
        // localhost, 데스크톱 프레임)라 남에게 보내면 안 열린다 — 사이트맵과 같은 형태로 고정 조립.
        const shareUrl = `https://www.rankue.co.kr/club/${id ?? ""}`;
        const shareData = {
            title: crew?.name ?? t("clubDetail.crewFallback"),
            text: `${crew?.name} ${t("clubDetail.shareText")}`,
            url: shareUrl,
        };
        try {
            if (typeof navigator !== 'undefined' && navigator.share) {
                await navigator.share(shareData);
                return;
            }
            if (typeof navigator !== 'undefined' && navigator.clipboard) {
                await navigator.clipboard.writeText(shareUrl);
                toast({ title: t("clubDetail.linkCopied") });
                return;
            }
            toast({ title: t("clubDetail.shareNotSupported"), variant: "destructive" });
        } catch (err) {
            // 사용자가 공유 시트를 취소한 경우는 조용히 무시
            if (err instanceof DOMException && err.name === 'AbortError') return;
            toast({ title: t("clubDetail.shareFailed"), variant: "destructive" });
        }
    };

    // 운영진이 아닌 크루원의 '더보기' — 초대 링크 공유, 크루 나가기(대기자는 신청 취소).
    // 크루장은 나갈 수 없다(서버 leaderCannotLeave) — 크루장은 운영진이라 이 메뉴 대신 설정(멤버 관리 → 크루장 넘기기)을 쓴다.
    const menuActions: CrewSheetAction[] = [
        { key: 'invite', label: t("crewMgmt.shareInvite"), icon: <LucideShare2 />, onSelect: handleShare },
        ...((isMember && !isLeader) || isPending ? [{
            key: 'leave',
            label: isPending ? t("crewMgmt.cancelRequest") : t("crewHome.leaveCrew"),
            icon: <LucideLogOut />,
            tone: 'danger' as const,
            onSelect: () => setIsLeaveConfirmOpen(true),
        }] : []),
    ];

    // 투표·대회는 홈의 하위 화면이라 탭바에선 '홈'이 켜진 채로 둔다.
    const navActive = activeTab === 'poll' || activeTab === 'tournament' ? 'home' : activeTab;

    // fixed inset-0 = 뷰포트(초기 컨테이닝블록) 기준이라 #root의 padding-top(env)과 무관해진다.
    // (App/Router 래퍼를 거쳐 렌더돼 음수 marginTop이 #root 패딩을 상쇄하지 못하던 이중 인셋 문제 해소.)
    // 노치 상단 인셋은 이제 아래 헤더의 pt-[env]가 유일하게 담당한다.
    return (
        <div className="fixed inset-0 z-0 bg-surface-0 text-ink-1 font-sans flex flex-col overflow-hidden">
            {/* 1. 고정 헤더 — 뒤로 · 엠블럼+이름 · 공유 · (운영진) 설정 / (크루원) 더보기.
                바탕은 토큰(surface-1) — 예전 흰 반투명은 골프(어두운 테마)에서 흰 띠로 떴다. */}
            <header className="shrink-0 z-30 bg-surface-1 border-b border-surface-line pt-[env(safe-area-inset-top)]">
                <div className="h-14 px-1 flex items-center gap-1">
                    <IconButton label={t("common.back")} onClick={goBack}>
                        <LucideChevronLeft />
                    </IconButton>
                    <div className="flex-1 min-w-0 flex items-center gap-2">
                        <CrewAvatar src={crewImageSrc(crew.emblem) ?? crewImageSrc(crew.coverImage)} name={crew.name} size={28} />
                        <h1 className="text-[17px] font-semibold text-ink-1 truncate">{crew.name}</h1>
                    </div>
                    {/* 공유는 누구에게나 — 예전에는 자리 하나를 관리자/비관리자로 나눠 써서, 정작 자기 크루를
                        공유하고 싶은 크루장에게만 공유 버튼이 없었다(오너 지적 2026-08-24). */}
                    <IconButton label={t("clubDetail.share")} onClick={handleShare}>
                        <LucideShare2 />
                    </IconButton>
                    {isAdmin ? (
                        <div className="relative">
                            <IconButton label={hasPending ? `${t("clubDetail.settings")} · ${t("crewUi.rolePending")}` : t("clubDetail.settings")} onClick={() => openSettings()}>
                                <LucideSettings />
                            </IconButton>
                            {hasPending && <span className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full bg-brand ring-2 ring-surface-1 pointer-events-none" aria-hidden="true" />}
                        </div>
                    ) : (isMember || isPending) ? (
                        <IconButton label={t("crewMgmt.more")} onClick={() => setIsMenuOpen(true)}>
                            <LucideMoreVertical />
                        </IconButton>
                    ) : null}
                </div>
            </header>

            {/* 2. 가변 컨텐츠 영역 */}
            <main className="flex-1 min-h-0 overflow-hidden relative">
                <AnimatePresence mode="wait">
                    {activeTab === 'home' && (
                        <motion.div key="home" {...swipeProps}>
                            <CrewHomeTab
                                crew={crew}
                                baseStore={baseStore}
                                baseListing={baseListing}
                                members={members}
                                isMember={isMember}
                                isPending={isPending}
                                isNotMember={isNotMember}
                                isAdmin={isAdmin}
                                me={me}
                                onJoin={handleJoin}
                                onLeave={() => leaveMutation.mutate()}
                                isLeaving={leaveMutation.isPending}
                                isLeader={isLeader}
                                onCreateActivity={() => setIsCreateActivityOpen(true)}
                                onCreatePoll={() => setIsCreatePollOpen(true)}
                                onShareToChat={(msg) => shareToChatMutation.mutate(msg)}
                                onPollClick={() => setActiveTab('poll')}
                                onTournamentClick={() => setActiveTab('tournament')}
                                onCreateTournament={() => { setTournamentAutoCreate(true); setActiveTab('tournament'); }}
                                onOpenHallOfFame={() => setLocation(`/crew/${id}/hall-of-fame`)}
                                sportTab={sportTab}
                                setSportTab={setSportTab}
                            />
                        </motion.div>
                    )}

                    {activeTab === 'board' && (
                        <motion.div key="board" {...swipeProps}>
                            {!isMember ? (
                                membersOnlyNotice
                            ) : postsQuery.isLoading ? (
                                <div className="px-4 pt-4"><CrewSkeleton rows={4} height={96} /></div>
                            ) : (
                                <CrewBoardTab
                                    posts={postsQuery.data || []}
                                    category={boardCategory}
                                    onCategoryChange={setBoardCategory}
                                    onPostClick={setSelectedPost}
                                    isMember={isMember}
                                    isAdmin={isAdmin}
                                    currentMemberId={me?.id}
                                    onCreatePost={() => setIsCreatePostOpen(true)}
                                    onCreateSettlement={() => setIsCreateSettlementOpen(true)}
                                    // isError·onRetry 는 게시판 작업(CrewBoardTab 개선)이 추가하는 선택 props 다 — 실패를 '글이 없어요'와
                                    // 구분해 다시 시도를 보여 준다. 그 변경이 합쳐지기 전에도 타입 검사가 통과하도록 펼쳐 넘긴다.
                                    {...({ isError: postsQuery.isError, onRetry: () => postsQuery.refetch() } as object)}
                                />
                            )}
                        </motion.div>
                    )}

                    {activeTab === 'gallery' && (
                        <motion.div key="gallery" {...swipeProps}>
                            {!isMember ? (
                                membersOnlyNotice
                            ) : (
                                <CrewGalleryTab
                                    crewId={id as string}
                                    isMember={isMember}
                                    isAdmin={isAdmin}
                                    currentMemberId={me?.id}
                                />
                            )}
                        </motion.div>
                    )}

                    {activeTab === 'poll' && (
                        <motion.div
                            key="poll"
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            className="h-full overflow-y-auto custom-scrollbar"
                            style={CONTENT_BOTTOM_PAD}
                        >
                            {subHeader(t("crewMgmt.pollTitle"))}
                            {/* 투표도 크루원 전용(서버 requireCrewMember) — 대회 탭과 같은 가입 안내로 막는다. */}
                            {isMember ? (
                                <CrewPollTab crewId={id as string} isAdmin={isAdmin} isMember={isMember} />
                            ) : membersOnlyNotice}
                        </motion.div>
                    )}

                    {activeTab === 'tournament' && (
                        <motion.div
                            key="tournament"
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            className="h-full overflow-y-auto custom-scrollbar"
                            style={CONTENT_BOTTOM_PAD}
                        >
                            {subHeader(t("crewMgmt.tournamentTitle"))}
                            {isGolfCrew ? (
                                // 대회(대진표)는 당구 크루에서만 열 수 있다(서버 tournamentBilliardsOnly) — '대회 열기'를 보여 주면 누르는 순간 거절된다.
                                <div className="min-h-full flex flex-col items-center justify-center gap-1.5 px-8 py-12 text-center">
                                    <span className="w-12 h-12 mb-1 rounded-full bg-surface-3 text-ink-3 inline-flex items-center justify-center" aria-hidden="true">
                                        <LucideTrophy className="w-6 h-6" />
                                    </span>
                                    <p className={CREW_TEXT.body}>{t("crewMgmt.tournamentBilliardsOnly")}</p>
                                    <button type="button" onClick={() => setActiveTab('home')} className={cn(CREW_BTN.secondary, "mt-3")}>
                                        {t("crewMgmt.backToHome")}
                                    </button>
                                </div>
                            ) : isMember ? (
                                <CrewTournamentTab
                                    crewId={id as string}
                                    isAdmin={isAdmin}
                                    isMember={isMember}
                                    me={me}
                                    autoOpenCreate={tournamentAutoCreate}
                                    autoOpenTournamentId={tournamentOpenId}
                                    onAutoOpenHandled={() => { setTournamentAutoCreate(false); setTournamentOpenId(null); }}
                                />
                            ) : membersOnlyNotice}
                        </motion.div>
                    )}
                </AnimatePresence>
            </main>

            {/* 3. 크루 탭바(홈·게시판·사진첩·채팅) — 60px·아이콘 22px·글자 12px. 예전 80px·24px 은 작은 화면에서 본문을 너무 먹었다.
                left-0 right-0 이라 데스크톱 프레임 규칙(index.css .rk-frame)이 프레임 폭에 맞춘다.
                하단 여백은 인라인으로 — 전역 .fixed.bottom-0 규칙이 pb 클래스를 덮어쓴다. */}
            <nav
                className="fixed bottom-0 left-0 right-0 z-50 bg-surface-1 border-t border-surface-line"
                style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
                aria-label={crew.name}
            >
                <div className="max-w-md mx-auto flex items-stretch" style={{ height: NAV_H }}>
                {[
                    { id: 'home', label: 'clubDetail.tabHome', icon: LucideHome },
                    { id: 'board', label: 'clubDetail.tabBoard', icon: LucideFileText },
                    { id: 'gallery', label: 'clubDetail.tabGallery', icon: LucideImage },
                    // 채팅은 채팅 탭(/chat/crew/:id)에 있다 — 여기 단추는 그리로 가는 문(2026-09-21)
                    { id: 'chatroom', label: 'clubDetail.tabChat', icon: LucideMessageCircle },
                ].map((tab) => {
                    const isActive = navActive === tab.id;
                    return (
                        <button
                            key={tab.id}
                            type="button"
                            aria-current={isActive ? "page" : undefined}
                            onClick={() => { if (tab.id === 'chatroom') setLocation(`/chat/crew/${id}`); else setActiveTab(tab.id as CrewTab); }}
                            className={cn(
                                "flex-1 flex flex-col items-center justify-center gap-1 relative active:bg-surface-3",
                                isActive ? "text-brand" : "text-ink-3"
                            )}
                        >
                            <tab.icon size={22} weight={isActive ? "fill" : undefined} aria-hidden="true" />
                            <span className="text-[12px] font-semibold leading-none">
                                {t(tab.label)}
                            </span>
                            {isActive && (
                                <div className="absolute top-0 inset-x-0 flex justify-center">
                                    <motion.div
                                        layoutId="bottom-nav-active"
                                        className="w-10 h-0.5 bg-brand"
                                    />
                                </div>
                            )}
                        </button>
                    );
                })}
                </div>
            </nav>

            {/* 다이얼로그 모달 모음 */}
            {isAdmin && (
                <ClubSettingsDialog
                    open={isSettingsOpen}
                    onOpenChange={setIsSettingsOpen}
                    crew={crew}
                    baseStore={baseStore}
                    baseListing={baseListing}
                    members={members}
                    me={me}
                    initialTab={settingsTab}
                />
            )}
            <CrewActionSheet
                open={isMenuOpen}
                onOpenChange={setIsMenuOpen}
                title={crew.name}
                header={<CrewAvatar src={crewImageSrc(crew.emblem) ?? crewImageSrc(crew.coverImage)} name={crew.name} size={40} />}
                actions={menuActions}
            />
            <ConfirmDialog
                open={isLeaveConfirmOpen}
                onOpenChange={(open) => { if (!leaveMutation.isPending) setIsLeaveConfirmOpen(open); }}
                title={isPending ? t("crewMgmt.cancelRequestTitle") : t("crewHome.leaveConfirmTitle")}
                desc={isPending ? t("crewMgmt.cancelRequestDesc") : t("crewHome.leaveConfirmDesc")}
                confirmLabel={isPending ? t("crewMgmt.cancelRequest") : t("crewHome.leaveAction")}
                busy={leaveMutation.isPending}
                onConfirm={() => leaveMutation.mutate()}
            />
            {isAdmin && <CreateSettlementDialog open={isCreateSettlementOpen} onOpenChange={setIsCreateSettlementOpen} crewId={id as string} members={members} me={me} onSubmit={(data) => createSettlementMutation.mutate(data)} isPending={createSettlementMutation.isPending} />}
            <SettlementDetailDialog open={!!selectedSettlementId} onOpenChange={(open) => !open && setSelectedSettlementId(null)} settlement={selectedSettlement} meId={me?.id} />
            <PostDetailDialog open={!!selectedPost} onOpenChange={(open) => !open && setSelectedPost(null)} post={selectedPost} isAdmin={isAdmin} currentMemberId={me?.id} />
            {isGolfCrew ? (
                <CreateGolfActivityModal
                    open={isCreateActivityOpen}
                    onOpenChange={setIsCreateActivityOpen}
                    crewId={id as string}
                />
            ) : (
                <CreateActivityDialog
                    open={isCreateActivityOpen}
                    onOpenChange={setIsCreateActivityOpen}
                    crewId={id as string}
                    sportCategory={crew.sportCategory as any}
                />
            )}
            <CreatePostDialog open={isCreatePostOpen} onOpenChange={setIsCreatePostOpen} crewId={id as string} isAdmin={isAdmin} crew={crew as any} />
            <CreatePollDialog open={isCreatePollOpen} onOpenChange={setIsCreatePollOpen} crewId={id as string} />
        </div>
    );
}
