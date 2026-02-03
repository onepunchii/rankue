import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
    LucideChevronLeft,
    LucideShare2,
    LucideSettings,
    LucideLoader2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { HiqMember, HiqCrew, HiqStore } from "@shared/schema";
import { ClubSettingsDialog } from "@/components/hiq/ClubSettingsDialog";
import { CreateActivityDialog } from "@/components/hiq/CreateActivityDialog";
import { CreatePostDialog } from "@/components/hiq/CreatePostDialog";
import { CrewChatTab } from "@/components/hiq/tabs/CrewChatTab";
import { CrewGalleryTab } from "@/components/hiq/tabs/CrewGalleryTab";
import { CrewHomeTab } from "@/components/hiq/tabs/CrewHomeTab";
import { CrewBoardTab } from "@/components/hiq/tabs/CrewBoardTab";
import { CreateSettlementDialog } from "@/components/hiq/settlement/CreateSettlementDialog";
import { SettlementDetailDialog } from "@/components/hiq/settlement/SettlementDetailDialog";
import { PostDetailDialog } from "@/components/hiq/PostDetailDialog";
import { HiqNavigation } from "@/components/hiq/HiqNavigation";

export default function HiqClubDetail() {
    const [match, params] = useRoute("/club/:id");
    const [_, setLocation] = useLocation();
    const { toast } = useToast();
    const id = params?.id;

    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isCreateActivityOpen, setIsCreateActivityOpen] = useState(false);
    const [isCreatePostOpen, setIsCreatePostOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'home' | 'board' | 'gallery' | 'chat'>('home');
    const [boardCategory, setBoardCategory] = useState("전체");
    const [isCreateSettlementOpen, setIsCreateSettlementOpen] = useState(false);
    const [selectedSettlementId, setSelectedSettlementId] = useState<string | null>(null);
    const [selectedPost, setSelectedPost] = useState<any>(null);

    // Swipe Navigation Logic
    const TABS: Array<'home' | 'board' | 'gallery' | 'chat'> = ['home', 'board', 'gallery', 'chat'];
    const handleSwipe = (direction: number) => {
        const currentIndex = TABS.indexOf(activeTab);
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
        },
        onError: (err: Error) => {
            toast({ title: "가입 실패", description: err.message, variant: "destructive" });
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

    if (isLoading) return <div className="h-[100dvh] bg-[#0f0f0f] flex items-center justify-center text-white/20"><LucideLoader2 className="animate-spin w-8 h-8" /></div>;
    if (!crewData) return <div className="h-[100dvh] bg-[#0f0f0f] flex items-center justify-center text-white/20">데이터를 찾을 수 없습니다.</div>;

    const { crew, baseStore, members } = crewData;
    const myMemberData = members.find((m: any) => m.member.id === me?.id);
    const isMember = !!myMemberData && myMemberData.role !== 'pending';
    const isPending = !!myMemberData && myMemberData.role === 'pending';
    const isNotMember = !myMemberData;
    const isAdmin = !!myMemberData && (myMemberData.role === 'leader' || myMemberData.role === 'manage');
    const hasPending = members.some((m: any) => m.role === 'pending');

    return (
        <div className="h-[100dvh] bg-[#0f0f0f] text-white font-sans flex flex-col overflow-hidden relative">
            {/* 1. 고정 헤더 영역 */}
            <div className="shrink-0 z-30 bg-[#0A0A0A]/90 backdrop-blur-xl border-b border-white/5">
                <div className="px-6 py-3 flex items-center justify-between">
                    <Button variant="ghost" className="p-0 h-auto text-white" onClick={() => setLocation("/club")}>
                        <LucideChevronLeft className="w-7 h-7" />
                    </Button>
                    <div className="text-lg font-bold text-white tracking-tight line-clamp-1 max-w-[220px]">
                        {crew.name}
                    </div>
                    {isAdmin ? (
                        <Button variant="ghost" className="p-0 h-auto text-white relative" onClick={() => setIsSettingsOpen(true)}>
                            <LucideSettings className="w-6 h-6" />
                            {hasPending && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[#10B981] border-2 border-[#0A0A0A]" />}
                        </Button>
                    ) : (
                        <Button variant="ghost" className="p-0 h-auto text-white">
                            <LucideShare2 className="w-6 h-6" />
                        </Button>
                    )}
                </div>

                <div className="px-6 flex items-center">
                    {[
                        { id: 'home', label: '홈' },
                        { id: 'board', label: '게시판' },
                        { id: 'gallery', label: '사진첩' },
                        { id: 'chat', label: '채팅' }
                    ].map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
                            className="flex-1 py-3 relative group"
                        >
                            <span className={cn(
                                "text-[15px] font-semibold transition-all duration-300 tracking-tight",
                                activeTab === tab.id ? "text-[#10B981]" : "text-white/20 group-hover:text-white/40"
                            )}>
                                {tab.label}
                            </span>
                            {activeTab === tab.id && (
                                <motion.div
                                    layoutId="crew-tab-active"
                                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#10B981]"
                                />
                            )}
                        </button>
                    ))}
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
                            className="h-full overflow-y-auto custom-scrollbar"
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
                                onCreateActivity={() => setIsCreateActivityOpen(true)}
                                onShareToChat={(msg) => shareToChatMutation.mutate(msg)}
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
                            className="h-full overflow-y-auto custom-scrollbar"
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
                </AnimatePresence>
            </main>

            {/* 하단 내비게이션 (채팅이 아닐 때만 표시) */}
            {activeTab !== 'chat' && <HiqNavigation />}

            {/* 다이얼로그 모달 모음 */}
            {isAdmin && <ClubSettingsDialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen} crew={crew} members={members} me={me} />}
            {isAdmin && <CreateSettlementDialog open={isCreateSettlementOpen} onOpenChange={setIsCreateSettlementOpen} crewId={id as string} members={members} me={me} onSubmit={(data) => createSettlementMutation.mutate(data)} isPending={createSettlementMutation.isPending} />}
            <SettlementDetailDialog open={!!selectedSettlementId} onOpenChange={(open) => !open && setSelectedSettlementId(null)} settlement={selectedSettlement} meId={me?.id} />
            <PostDetailDialog open={!!selectedPost} onOpenChange={(open) => !open && setSelectedPost(null)} post={selectedPost} isAdmin={isAdmin} currentMemberId={me?.id} />
            <CreateActivityDialog open={isCreateActivityOpen} onOpenChange={setIsCreateActivityOpen} crewId={id as string} />
            <CreatePostDialog open={isCreatePostOpen} onOpenChange={setIsCreatePostOpen} crewId={id as string} isAdmin={isAdmin} />
        </div>
    );
}
