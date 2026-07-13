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
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { HiqMember, HiqCrew, HiqStore } from "@shared/schema";
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

export default function HiqClubDetail() {
    const [match, params] = useRoute("/club/:id");
    // 호환 별칭: 이미 발송된 푸시 페이로드가 /crew/:id/:tab 로 진입할 수 있다.
    const [, crewParams] = useRoute("/crew/:id/:tab?");
    const [_, setLocation] = useLocation();
    const { toast } = useToast();
    const id = params?.id ?? crewParams?.id;

    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isCreateActivityOpen, setIsCreateActivityOpen] = useState(false);
    const [isCreatePollOpen, setIsCreatePollOpen] = useState(false);
    const [isCreatePostOpen, setIsCreatePostOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'home' | 'board' | 'gallery' | 'chat' | 'poll'>('home');
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

    const { data: posts } = useQuery<any[]>({
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
            toast({ title: "채팅방에 공유되었습니다." });
            queryClient.invalidateQueries({ queryKey: [`/api/hiq/crews/${id}/chats`] });
        }
    });

    const { data: crewData, isLoading } = useQuery<{ crew: HiqCrew, baseStore: HiqStore, members: any[] }>({
        queryKey: [`/api/hiq/crews/${id}`],
        enabled: !!id,
    });

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
                title: data.role === 'pending' ? "가입 신청 완료" : "가입 완료!",
                description: data.role === 'pending' ? "크루장의 승인을 기다려주세요." : "크루 멤버가 되었습니다."
            });
            queryClient.invalidateQueries({ queryKey: [`/api/hiq/crews/${id}`] });
            // 내 크루 목록 및 디스커버리(멤버 수) 리스트 갱신 — 가입 즉시 반영
            queryClient.invalidateQueries({ queryKey: ['/api/hiq/crews/mine'] });
            queryClient.invalidateQueries({ queryKey: ['/api/hiq/crews'] });
        },
        onError: (err: Error) => {
            toast({ title: "가입 실패", description: err.message, variant: "destructive" });
        }
    });

    // Leave crew / cancel a pending join request (self only). Server rejects a leader leaving.
    const leaveMutation = useMutation({
        mutationFn: async () => {
            return await apiRequest(`/api/hiq/crews/${id}/members/${me?.id}`, { method: "DELETE" });
        },
        onSuccess: () => {
            toast({ title: "크루에서 나왔습니다." });
            queryClient.invalidateQueries({ queryKey: [`/api/hiq/crews/${id}`] });
            queryClient.invalidateQueries({ queryKey: ['/api/hiq/crews/mine'] });
            queryClient.invalidateQueries({ queryKey: ['/api/hiq/crews'] });
            setLocation("/club");
        },
        onError: (err: Error) => {
            toast({ title: "처리 실패", description: err.message, variant: "destructive" });
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
            toast({ title: "정산이 등록되었습니다", description: "채팅방에 전송되었습니다." });
            setIsCreateSettlementOpen(false);
            queryClient.invalidateQueries({ queryKey: [`/api/hiq/crews/${id}/chats`] });
            setActiveTab('chat');
        },
        onError: (err: Error) => {
            toast({ title: "등록 실패", description: err.message, variant: "destructive" });
        }
    });

    if (isLoading) return <div className="h-[100dvh] bg-[#0A0A0A] flex items-center justify-center text-ink-3"><LucideLoader2 className="animate-spin w-8 h-8" /></div>;
    if (!crewData || !crewData.crew) return <div className="h-[100dvh] bg-[#0A0A0A] flex items-center justify-center text-ink-3">데이터를 찾을 수 없습니다.</div>;

    const { crew, baseStore, members = [] } = crewData;
    const myMemberData = members.find((m: any) => m.member?.id === me?.id);
    const isMember = !!myMemberData && myMemberData.role !== 'pending';
    const isPending = !!myMemberData && myMemberData.role === 'pending';
    const isNotMember = !myMemberData;
    const isAdmin = !!myMemberData && (myMemberData.role === 'leader' || myMemberData.role === 'manage');
    const hasPending = members.some((m: any) => m.role === 'pending');

    const handleShare = async () => {
        const shareUrl = typeof window !== 'undefined' ? window.location.href : '';
        const shareData = {
            title: crew?.name ?? '크루',
            text: `${crew?.name} 크루를 확인해보세요`,
            url: shareUrl,
        };
        try {
            if (typeof navigator !== 'undefined' && navigator.share) {
                await navigator.share(shareData);
                return;
            }
            if (typeof navigator !== 'undefined' && navigator.clipboard) {
                await navigator.clipboard.writeText(shareUrl);
                toast({ title: "링크가 복사되었습니다." });
                return;
            }
            toast({ title: "공유를 지원하지 않는 환경입니다.", variant: "destructive" });
        } catch (err) {
            // 사용자가 공유 시트를 취소한 경우는 조용히 무시
            if (err instanceof DOMException && err.name === 'AbortError') return;
            toast({ title: "공유에 실패했습니다.", variant: "destructive" });
        }
    };

    return (
        <div className="h-[100dvh] bg-[#0A0A0A] text-ink-1 font-sans flex flex-col overflow-hidden relative">
            {/* 1. 고정 헤더 영역 (4+2 구조 중 상단 +2) */}
            <div className="shrink-0 z-30 bg-[#0B0B0D]/90 backdrop-blur-2xl border-b border-white/10 safe-area-top">
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
                            {hasPending && <span className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full bg-brand ring-2 ring-[#0B0B0D]" />}
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
            <main className="flex-1 overflow-hidden relative">
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
                            <CrewGalleryTab
                                crewId={id as string}
                                isMember={isMember}
                                isAdmin={isAdmin}
                                currentMemberId={me?.id}
                            />
                        </motion.div>
                    )}

                    {activeTab === 'chat' && (
                        <motion.div
                            key="chat"
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            drag="x"
                            dragConstraints={{ left: 0, right: 0 }}
                            dragElastic={0.2}
                            onDragEnd={(_, info) => {
                                const swipe = info.offset.x;
                                const velocity = info.velocity.x;
                                if (swipe < -70 || velocity < -400) handleSwipe(1);
                                else if (swipe > 70 || velocity > 400) handleSwipe(-1);
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
            <nav className="fixed bottom-0 w-full bg-[#0B0B0D]/95 backdrop-blur-2xl border-t border-white/10 flex items-center h-20 safe-area-bottom z-50">
                {[
                    { id: 'home', label: '홈', icon: LucideHome },
                    { id: 'board', label: '게시판', icon: LucideFileText },
                    { id: 'gallery', label: '사진첩', icon: LucideImage },
                    { id: 'chat', label: '채팅', icon: LucideMessageCircle },
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
                                {tab.label}
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
