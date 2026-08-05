import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
    LucideX,
    LucideShare2,
    LucideMoreVertical,
    LucideLoader2,
    LucideHome,
    LucideFileText,
    LucideImage,
    LucideMessageCircle
} from "@/lib/icons";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { HiqMember, HiqCrew, HiqStore } from "@shared/schema";
import { useSeo } from "@/hooks/useSeo";
import { crewTitle, crewDescription } from "@shared/crewMeta";
import { ClubSettingsDialog } from "@/components/hiq/ClubSettingsDialog";
import { CreateActivityDialog } from "@/components/hiq/CreateActivityDialog";
import { CreateGolfActivityModal } from "@/components/hiq/club/activity/CreateGolfActivityModal";
import { CreatePostDialog } from "@/components/hiq/CreatePostDialog";
import { CrewBoardTab, CrewChatTab, CrewGalleryTab, CrewHomeTab, CrewPollTab } from "@/components/hiq/tabs";
import { CreatePollDialog } from "@/components/hiq/CreatePollDialog";
import { CreateSettlementDialog } from "@/components/hiq/settlement/CreateSettlementDialog";
import { SettlementDetailDialog } from "@/components/hiq/settlement/SettlementDetailDialog";
import { PostDetailDialog } from "@/components/hiq/PostDetailDialog";
import { HiqNavigation } from "@/components/hiq/HiqNavigation";
import { useT } from "@/lib/i18n";

export default function HiqClubDetail() {
    const [match, params] = useRoute("/club/:id");
    // 호환 별칭: 이미 발송된 푸시 페이로드가 /crew/:id/:tab 로 진입할 수 있다.
    const [, crewParams] = useRoute("/crew/:id/:tab?");
    const [_, setLocation] = useLocation();
    const { toast } = useToast();
    const { t } = useT();
    const id = params?.id ?? crewParams?.id;

    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isCreateActivityOpen, setIsCreateActivityOpen] = useState(false);
    const [isCreatePollOpen, setIsCreatePollOpen] = useState(false);
    const [isCreatePostOpen, setIsCreatePostOpen] = useState(false);
    // 딥링크 탭은 반드시 useState "초기값"으로 반영한다. 마운트 직후 useEffect에서
    // setActiveTab을 하면 AnimatePresence(mode="wait")가 home 탭의 exit 완료 신호를
    // 못 받아 다음 탭이 영영 마운트되지 않는다 → /crew/:id/board 진입 시 빈 화면.
    const [activeTab, setActiveTab] = useState<'home' | 'board' | 'gallery' | 'chat' | 'poll'>(() => {
        const validTabs = ['home', 'board', 'gallery', 'chat', 'poll'];
        let tab: string | null | undefined = crewParams?.tab;
        if (!tab && typeof window !== 'undefined') {
            tab = new URLSearchParams(window.location.search).get('tab');
        }
        const normalized = tab?.toLowerCase();
        return (normalized && validTabs.includes(normalized) ? normalized : 'home') as any;
    });
    const [boardCategory, setBoardCategory] = useState("전체");
    const [isCreateSettlementOpen, setIsCreateSettlementOpen] = useState(false);
    const [selectedSettlementId, setSelectedSettlementId] = useState<string | null>(null);
    const [selectedPost, setSelectedPost] = useState<any>(null);
    const [sportTab, setSportTab] = useState<'BILLIARDS' | 'GOLF'>('BILLIARDS');

    // Swipe Navigation Logic (Removed 'poll' from direct swipe)
    const TABS: Array<'home' | 'board' | 'gallery' | 'chat'> = ['home', 'board', 'gallery', 'chat'];
    // Force refresh on mount to ensure fresh data after the fix
    useEffect(() => {
        if (id) {
            queryClient.invalidateQueries({ queryKey: [`/api/hiq/crews/${id}`] });
        }
    }, [id]);

    // 딥링크로 전달된 탭(?tab= 또는 /crew/:id/:tab 별칭)을 초기 활성 탭으로 반영한다.
    useEffect(() => {
        const validTabs = ['home', 'board', 'gallery', 'chat', 'poll'];
        let tab: string | null | undefined = crewParams?.tab;
        if (!tab && typeof window !== 'undefined') {
            tab = new URLSearchParams(window.location.search).get('tab');
        }
        const normalized = tab?.toLowerCase();
        if (normalized && validTabs.includes(normalized)) {
            setActiveTab(normalized as 'home' | 'board' | 'gallery' | 'chat' | 'poll');
        }
    }, [id, crewParams?.tab]);

    const handleSwipe = (direction: number) => {
        if (activeTab === 'poll') return; // Disable swipe when in poll tab if navigated via home
        const currentIndex = TABS.indexOf(activeTab as any);
        const nextIndex = currentIndex + direction;
        if (nextIndex >= 0 && nextIndex < TABS.length) {
            setActiveTab(TABS[nextIndex]);
        }
    };

    const { data: selectedSettlement } = useQuery({
        queryKey: [`/api/hiq/settlements/${selectedSettlementId}`],
        enabled: !!selectedSettlementId
    });

    const { data: me } = useQuery<HiqMember>({ queryKey: ["/api/hiq/me"] });

    const { data: posts, isLoading: postsLoading } = useQuery<any[]>({
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
        }
    });

    const { data: crewData, isLoading } = useQuery<{ crew: HiqCrew, baseStore: HiqStore, members: any[] }>({
        queryKey: [`/api/hiq/crews/${id}`],
        enabled: !!id,
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

    const joinMutation = useMutation({
        mutationFn: async () => {
            return await apiRequest(`/api/hiq/crews/${id}/join`, { method: "POST" });
        },
        onSuccess: (data: any) => {
            toast({
                title: data.role === 'pending' ? t("clubDetail.joinPendingTitle") : t("clubDetail.joinDoneTitle"),
                description: data.role === 'pending' ? t("clubDetail.joinPendingDesc") : t("clubDetail.joinDoneDesc")
            });
            queryClient.invalidateQueries({ queryKey: [`/api/hiq/crews/${id}`] });
            // 내 크루 목록 및 디스커버리(멤버 수) 리스트 갱신 — 가입 즉시 반영
            queryClient.invalidateQueries({ queryKey: ['/api/hiq/crews/mine'] });
            queryClient.invalidateQueries({ queryKey: ['/api/hiq/crews'] });
        },
        onError: (err: Error) => {
            toast({ title: t("clubDetail.joinFailed"), description: err.message, variant: "destructive" });
        }
    });

    // Leave crew / cancel a pending join request (self only). Server rejects a leader leaving.
    const leaveMutation = useMutation({
        mutationFn: async () => {
            return await apiRequest(`/api/hiq/crews/${id}/members/${me?.id}`, { method: "DELETE" });
        },
        onSuccess: () => {
            toast({ title: t("clubDetail.leftCrew") });
            queryClient.invalidateQueries({ queryKey: [`/api/hiq/crews/${id}`] });
            queryClient.invalidateQueries({ queryKey: ['/api/hiq/crews/mine'] });
            queryClient.invalidateQueries({ queryKey: ['/api/hiq/crews'] });
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
            setActiveTab('chat');
        },
        onError: (err: Error) => {
            toast({ title: t("clubDetail.createFailed"), description: err.message, variant: "destructive" });
        }
    });

    if (isLoading) return <div className="h-[100dvh] bg-[#f2f0eb] flex items-center justify-center text-ink-3"><LucideLoader2 className="animate-spin w-8 h-8" /></div>;
    if (!crewData || !crewData.crew) return <div className="h-[100dvh] bg-[#f2f0eb] flex items-center justify-center text-ink-3">{t("clubDetail.notFound")}</div>;

    const { crew, baseStore, members = [] } = crewData;
    const myMemberData = members.find((m: any) => m.member?.id === me?.id);
    const isMember = !!myMemberData && myMemberData.role !== 'pending';
    const isPending = !!myMemberData && myMemberData.role === 'pending';
    const isNotMember = !myMemberData;

    // 게시판·사진첩은 서버도 크루원 전용으로 막혀 있다 — 비멤버·승인 대기자에게는
    // 빈 목록 대신 가입 안내를 보여준다.
    const membersOnlyNotice = (
        <div className="h-full flex flex-col items-center justify-center gap-1.5 px-8 text-center">
            <p className="text-[15px] font-bold text-ink-2">{t("clubDetail.membersOnlyTitle")}</p>
            <p className="text-[13px] font-medium text-black/45">
                {isPending ? t("clubDetail.membersOnlyPending") : t("clubDetail.membersOnlyDesc")}
            </p>
        </div>
    );
    const isAdmin = !!myMemberData && (myMemberData.role === 'leader' || myMemberData.role === 'manage');
    const hasPending = members.some((m: any) => m.role === 'pending');

    const handleShare = async () => {
        const shareUrl = typeof window !== 'undefined' ? window.location.href : '';
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

    // fixed inset-0 = 뷰포트(초기 컨테이닝블록) 기준이라 #root의 padding-top(env)과 무관해진다.
    // (App/Router 래퍼를 거쳐 렌더돼 음수 marginTop이 #root 패딩을 상쇄하지 못하던 이중 인셋 문제 해소.)
    // 노치 상단 인셋은 이제 아래 헤더의 pt-[env]가 유일하게 담당한다.
    return (
        <div className="fixed inset-0 z-0 bg-[#f2f0eb] text-ink-1 font-sans flex flex-col overflow-hidden">
            {/* 1. 고정 헤더 영역 (4+2 구조 중 상단 +2) — 흰 배경이 노치까지 차오르고 본문은 상태바 아래에서 시작 */}
            <div className="shrink-0 z-30 bg-white/90 border-b border-black/10 pt-[env(safe-area-inset-top)]">
                <div className="px-6 py-4 flex items-center justify-between">
                    {/* 좌측: 메인으로 가기 */}
                    <Button
                        variant="ghost"
                        className="p-3 -ml-3 h-auto text-ink-2 hover:text-ink-1 transition-colors"
                        onClick={() => setLocation("/dashboard")}
                    >
                        <LucideX className="w-6 h-6" />
                    </Button>

                    {/* 중앙: 타이틀 */}
                    <div className="text-lg font-bold text-ink-1 line-clamp-1 max-w-[200px] text-center">
                        {crew?.name}
                    </div>

                    {/* 우측: 관리자/설정 */}
                    {isAdmin ? (
                        <Button
                            variant="ghost"
                            className="p-3 -mr-3 h-auto text-ink-2 hover:text-ink-1 transition-colors relative"
                            onClick={() => setIsSettingsOpen(true)}
                        >
                            <LucideMoreVertical className="w-6 h-6" />
                            {hasPending && <span className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full bg-brand ring-2 ring-white" />}
                        </Button>
                    ) : (
                        <Button
                            variant="ghost"
                            className="p-3 -mr-3 h-auto text-ink-2 hover:text-ink-1 transition-colors"
                            onClick={handleShare}
                        >
                            <LucideShare2 className="w-6 h-6" />
                        </Button>
                    )}
                </div>
            </div>

            {/* 2. 가변 컨텐츠 영역 */}
            <main className="flex-1 min-h-0 overflow-hidden relative">
                <AnimatePresence mode="wait">
                    {activeTab === 'home' && (
                        <motion.div
                            key="home"
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            drag="x"
                            dragDirectionLock
                            dragConstraints={{ left: 0, right: 0 }}
                            dragElastic={0.2}
                            onDragEnd={(_, info) => {
                                const swipe = info.offset.x;
                                const velocity = info.velocity.x;
                                if (swipe < -100 || velocity < -500) handleSwipe(1);
                                else if (swipe > 100 || velocity > 500) handleSwipe(-1);
                            }}
                            className="h-full overflow-y-auto custom-scrollbar pb-32"
                        >
                            <CrewHomeTab
                                crew={crew}
                                baseStore={baseStore}
                                members={members}
                                isMember={isMember}
                                isPending={isPending}
                                isNotMember={isNotMember}
                                isAdmin={isAdmin}
                                me={me}
                                onJoin={() => joinMutation.mutate()}
                                onLeave={() => leaveMutation.mutate()}
                                isLeaving={leaveMutation.isPending}
                                isLeader={myMemberData?.role === 'leader'}
                                onCreateActivity={() => setIsCreateActivityOpen(true)}
                                onCreatePoll={() => setIsCreatePollOpen(true)}
                                onShareToChat={(msg) => shareToChatMutation.mutate(msg)}
                                onPollClick={() => setActiveTab('poll')}
                                sportTab={sportTab}
                                setSportTab={setSportTab}
                            />
                        </motion.div>
                    )}

                    {activeTab === 'board' && (
                        <motion.div
                            key="board"
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            drag="x"
                            dragDirectionLock
                            dragConstraints={{ left: 0, right: 0 }}
                            dragElastic={0.2}
                            onDragEnd={(_, info) => {
                                const swipe = info.offset.x;
                                const velocity = info.velocity.x;
                                if (swipe < -100 || velocity < -500) handleSwipe(1);
                                else if (swipe > 100 || velocity > 500) handleSwipe(-1);
                            }}
                            className="h-full overflow-y-auto custom-scrollbar pb-32"
                        >
                            {!isMember ? (
                                membersOnlyNotice
                            ) : postsLoading ? (
                                <div className="h-full flex items-center justify-center text-[13.5px] font-medium text-black/40">{t("common.loading")}</div>
                            ) : (
                                <CrewBoardTab
                                    posts={posts || []}
                                    category={boardCategory}
                                    onCategoryChange={setBoardCategory}
                                    onPostClick={setSelectedPost}
                                    isMember={isMember}
                                    isAdmin={isAdmin}
                                    currentMemberId={me?.id}
                                    onCreatePost={() => setIsCreatePostOpen(true)}
                                    onCreateSettlement={() => setIsCreateSettlementOpen(true)}
                                />
                            )}
                        </motion.div>
                    )}

                    {activeTab === 'gallery' && (
                        <motion.div
                            key="gallery"
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            drag="x"
                            dragDirectionLock
                            dragConstraints={{ left: 0, right: 0 }}
                            dragElastic={0.2}
                            onDragEnd={(_, info) => {
                                const swipe = info.offset.x;
                                const velocity = info.velocity.x;
                                if (swipe < -100 || velocity < -500) handleSwipe(1);
                                else if (swipe > 100 || velocity > 500) handleSwipe(-1);
                            }}
                            className="h-full overflow-y-auto custom-scrollbar pb-32"
                        >
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

                    {activeTab === 'chat' && (
                        <motion.div
                            key="chat"
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            drag="x"
                            dragDirectionLock
                            dragConstraints={{ left: 0, right: 0 }}
                            dragElastic={0.2}
                            onDragEnd={(_, info) => {
                                const swipe = info.offset.x;
                                const velocity = info.velocity.x;
                                if (swipe < -100 || velocity < -500) handleSwipe(1);
                                else if (swipe > 100 || velocity > 500) handleSwipe(-1);
                            }}
                            className="h-full flex flex-col overflow-hidden"
                        >
                            <CrewChatTab
                                crewId={id as string}
                                isMember={isMember}
                                isAdmin={isAdmin}
                                currentMemberId={me?.id}
                                onSettlementClick={(id) => setSelectedSettlementId(id)}
                            />
                        </motion.div>
                    )}

                    {activeTab === 'poll' && (
                        <motion.div
                            key="poll"
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            drag="x"
                            dragDirectionLock
                            dragConstraints={{ left: 0, right: 0 }}
                            dragElastic={0.2}
                            onDragEnd={(_, info) => {
                                const swipe = info.offset.x;
                                const velocity = info.velocity.x;
                                if (swipe < -100 || velocity < -500) handleSwipe(1);
                                else if (swipe > 100 || velocity > 500) handleSwipe(-1);
                            }}
                            className="h-full overflow-y-auto custom-scrollbar pb-32"
                        >
                            <CrewPollTab
                                crewId={id as string}
                                isAdmin={isAdmin}
                                isMember={isMember}
                            />
                        </motion.div>
                    )}
                </AnimatePresence>
            </main>

            {/* 3. 인앱 하단 네비게이션 (전용 4버튼 레이아웃) */}
            <nav className="fixed bottom-0 w-full bg-white/95 border-t border-black/10 z-50 pb-[env(safe-area-inset-bottom)]">
                <div className="flex items-center h-20">
                {[
                    { id: 'home', label: 'clubDetail.tabHome', icon: LucideHome },
                    { id: 'board', label: 'clubDetail.tabBoard', icon: LucideFileText },
                    { id: 'gallery', label: 'clubDetail.tabGallery', icon: LucideImage },
                    { id: 'chat', label: 'clubDetail.tabChat', icon: LucideMessageCircle },
                ].map((tab) => {
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
                            className={cn(
                                "flex-1 flex flex-col items-center justify-center h-full transition-all active:scale-95 relative",
                                isActive ? "text-brand" : "text-ink-3 hover:text-ink-2"
                            )}
                        >
                            <tab.icon size={24} strokeWidth={isActive ? 2.5 : 1.5} />
                            <span className="text-[12px] mt-1.5 font-semibold">
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
            {isAdmin && <ClubSettingsDialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen} crew={crew} members={members} me={me} />}
            {isAdmin && <CreateSettlementDialog open={isCreateSettlementOpen} onOpenChange={setIsCreateSettlementOpen} crewId={id as string} members={members} me={me} onSubmit={(data) => createSettlementMutation.mutate(data)} isPending={createSettlementMutation.isPending} />}
            <SettlementDetailDialog open={!!selectedSettlementId} onOpenChange={(open) => !open && setSelectedSettlementId(null)} settlement={selectedSettlement} meId={me?.id} />
            <PostDetailDialog open={!!selectedPost} onOpenChange={(open) => !open && setSelectedPost(null)} post={selectedPost} isAdmin={isAdmin} currentMemberId={me?.id} />
            {crew.sportCategory === 'GOLF' ? (
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
