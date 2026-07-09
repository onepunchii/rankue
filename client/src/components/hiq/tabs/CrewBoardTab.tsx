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
                                ? "bg-brand text-brand-fg"
                                : "bg-white/5 text-white/55 hover:bg-white/10"
                        )}
                    >
                        {cat}
                    </button>
                ))}
            </div>

            {/* Pinned Notices Section */}
            {notices.length > 0 && (
                <div className="px-6 space-y-2">
                    <h4 className="text-[12px] font-medium text-white/55 pl-1">필독 공지</h4>
                    <div className="bg-brand/12 border border-brand/25 rounded-tile overflow-hidden">
                        {notices.map((notice) => (
                            <div
                                key={notice.id}
                                className="px-4 py-3 flex items-center gap-3 border-b border-brand/25 last:border-0 hover:bg-brand/12 transition-colors cursor-pointer"
                                onClick={() => onPostClick(notice)}
                            >
                                <LucidePin className="w-3.5 h-3.5 text-brand rotate-45" />
                                <span className="text-xs font-semibold text-white/80 flex-1 truncate">{notice.title || "제목 없음"}</span>
                                <span className="text-[12px] font-medium text-white/55 tabular-nums">
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
                        <LucideLayoutList className="w-12 h-12 text-white/45 mx-auto mb-4" />
                        <p className="text-sm font-medium text-white/55">아직 등록된 게시글이 없습니다</p>
                    </div>
                )}
            </div>

            {/* Floating Action Buttons */}
            {isMember && (
                <div className="fixed bottom-24 right-6 flex flex-col items-end gap-4 z-30">
                    {isAdmin && (
                        <button
                            onClick={onCreateSettlement}
                            className="w-14 h-14 bg-surface-3 text-white border border-white/20 rounded-full shadow-lg flex items-center justify-center hover:bg-surface-2 active:scale-95 transition-all"
                            title="정산 요청 생성"
                            aria-label="정산 요청 생성"
                        >
                            <LucideReceipt className="w-7 h-7" />
                        </button>
                    )}
                    <button
                        onClick={onCreatePost}
                        className="w-14 h-14 bg-brand text-brand-fg rounded-full shadow-lg flex items-center justify-center hover:bg-brand/90 active:scale-95 transition-all"
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
