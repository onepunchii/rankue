import { memo, useMemo } from "react";
import { format } from "date-fns";
import { LucidePin, LucideLayoutList, LucideReceipt, LucidePlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { SocialPostCard } from "@/components/hiq/SocialPostCard";

export interface Post {
    id: string;
    crewId: string;
    authorId: string;
    title: string;
    content: string;
    category?: string;
    isNotice: boolean;
    createdAt: string;
    author?: {
        name: string;
        profileImageUrl?: string;
        role?: string;
    };
    likeCount: number;
    commentCount: number;
    isLiked: boolean;
}

interface CrewBoardTabProps {
    posts: Post[];
    category: string;
    onCategoryChange: (cat: string) => void;
    onPostClick: (post: Post) => void;
    isMember: boolean;
    isAdmin: boolean;
    currentMemberId?: string;
    onCreatePost: () => void;
    onCreateSettlement: () => void;
}

export const CrewBoardTab = memo(({
    posts, category, onCategoryChange, onPostClick, isMember, isAdmin, currentMemberId, onCreatePost, onCreateSettlement
}: CrewBoardTabProps) => {

    const filteredPosts = useMemo(() => {
        return posts?.filter(p => category === "전체" || p.category === category) || [];
    }, [posts, category]);

    const notices = useMemo(() => {
        return posts?.filter(p => p.isNotice).slice(0, 3) || [];
    }, [posts]);

    return (
        <div className="h-full space-y-6 pt-6">
            {/* Category Filter Chips */}
            <div className="px-6 flex items-center gap-2 overflow-x-auto scrollbar-hide pb-1">
                {["전체", "공지사항", "가입인사", "크루후기", "자유글"].map((cat) => (
                    <button
                        key={cat}
                        onClick={() => onCategoryChange(cat)}
                        className={cn(
                            "px-5 py-2.5 rounded-full text-[13px] font-semibold transition-all whitespace-nowrap",
                            category === cat
                                ? "bg-[#10B981] text-black shadow-[0_0_15px_rgba(16,185,129,0.3)]"
                                : "bg-white/5 text-white/40 hover:bg-white/10"
                        )}
                    >
                        {cat}
                    </button>
                ))}
            </div>

            {/* Pinned Notices Section */}
            {notices.length > 0 && (
                <div className="px-6 space-y-2">
                    <h4 className="text-[10px] font-extrabold text-white/20 uppercase tracking-widest pl-1">필독 공지</h4>
                    <div className="bg-[#10B981]/5 border border-[#10B981]/10 rounded-2xl overflow-hidden">
                        {notices.map((notice) => (
                            <div
                                key={notice.id}
                                className="px-4 py-3 flex items-center gap-3 border-b border-[#10B981]/5 last:border-0 hover:bg-[#10B981]/10 transition-colors cursor-pointer"
                                onClick={() => onPostClick(notice)}
                            >
                                <LucidePin className="w-3.5 h-3.5 text-[#10B981] rotate-45" />
                                <span className="text-xs font-semibold text-white/80 flex-1 truncate">{notice.title || "제목 없음"}</span>
                                <span className="text-[10px] font-semibold text-white/20">
                                    {notice.createdAt ? format(new Date(notice.createdAt), "MM.dd") : "--.--"}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Main Feed */}
            <div className="px-6 space-y-4 pb-32">
                {filteredPosts.length > 0 ? (
                    filteredPosts.map((post) => (
                        <SocialPostCard
                            key={post.id}
                            post={post}
                            isMember={isMember}
                            isAdmin={isAdmin}
                            currentMemberId={currentMemberId}
                        />
                    ))
                ) : (
                    <div className="py-24 text-center">
                        <LucideLayoutList className="w-12 h-12 text-white/5 mx-auto mb-4" />
                        <p className="text-sm font-bold text-white/20">아직 등록된 게시글이 없습니다</p>
                    </div>
                )}
            </div>

            {/* Floating Action Buttons */}
            {isMember && (
                <div className="fixed bottom-24 right-6 flex flex-col items-end gap-4 z-30">
                    {isAdmin && (
                        <button
                            onClick={onCreateSettlement}
                            className="w-14 h-14 bg-[#333] text-white border border-white/20 rounded-full shadow-lg flex items-center justify-center hover:bg-[#444] active:scale-95 transition-all"
                            title="정산 요청 생성"
                            aria-label="정산 요청 생성"
                        >
                            <LucideReceipt className="w-7 h-7" />
                        </button>
                    )}
                    <button
                        onClick={onCreatePost}
                        className="w-14 h-14 bg-white text-black rounded-full shadow-[0_0_20px_rgba(255,255,255,0.3)] flex items-center justify-center hover:bg-white/90 active:scale-95 transition-all"
                        title="새 게시글 작성"
                        aria-label="새 게시글 작성"
                    >
                        <LucidePlus className="w-8 h-8" />
                    </button>
                </div>
            )}
        </div>
    );
});

CrewBoardTab.displayName = "CrewBoardTab";
