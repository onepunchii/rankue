import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";
import { LucideHeart, LucideMessageSquare, LucideCrown, LucideShield, LucideTrash2 } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { PostDetailDialog } from "./PostDetailDialog";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface PostAuthor {
    name: string;
    profileImageUrl?: string;
    role?: 'leader' | 'manage' | 'member' | string;
}

interface Post {
    id: string;
    crewId: string;
    authorId: string;
    title: string;
    content: string;
    category?: string;
    isNotice: boolean;
    createdAt: string;
    author?: PostAuthor;
    likeCount: number;
    commentCount: number;
    isLiked: boolean;
    images?: string[];
}

interface SocialPostCardProps {
    post: Post;
    isMember?: boolean;
    isAdmin?: boolean;
    currentMemberId?: string;
}

export function SocialPostCard({ post, isMember, isAdmin, currentMemberId }: SocialPostCardProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [isDetailOpen, setIsDetailOpen] = useState(false);
    const { toast } = useToast();

    const canDelete = isAdmin || post.authorId === currentMemberId;
    const content = post?.content || "";
    const isLongText = content.length > 150 || content.split('\n').length > 3;

    // Like Mutation with Optimistic Update
    const likeMutation = useMutation({
        mutationFn: async () => {
            return await apiRequest(`/api/hiq/crews/${post.crewId}/posts/${post.id}/like`, {
                method: "POST"
            });
        },
        onMutate: async () => {
            // Cancel any outgoing refetches (so they don't overwrite our optimistic update)
            await queryClient.cancelQueries({ queryKey: [`/api/hiq/crews/${post.crewId}/posts`] });

            // Snapshot the previous value
            const previousPosts = queryClient.getQueryData<Post[]>([`/api/hiq/crews/${post.crewId}/posts`]);

            // Optimistically update to the new value
            if (previousPosts) {
                queryClient.setQueryData<Post[]>([`/api/hiq/crews/${post.crewId}/posts`], (old) => {
                    return old?.map(p => {
                        if (p.id === post.id) {
                            return {
                                ...p,
                                isLiked: !p.isLiked,
                                likeCount: p.isLiked ? (p.likeCount - 1) : (p.likeCount + 1)
                            };
                        }
                        return p;
                    });
                });
            }

            return { previousPosts };
        },
        onError: (err, _, context) => {
            // Rollback on error
            if (context?.previousPosts) {
                queryClient.setQueryData([`/api/hiq/crews/${post.crewId}/posts`], context.previousPosts);
            }
            toast({
                title: "오류 발생",
                description: "좋아요 처리에 실패했습니다.",
                variant: "destructive"
            });
        },
        onSettled: () => {
            // Always refetch after error or success to make sure the server state is in sync
            queryClient.invalidateQueries({ queryKey: [`/api/hiq/crews/${post.crewId}/posts`] });
        },
    });

    // Delete Mutation
    const deleteMutation = useMutation({
        mutationFn: async () => {
            return await apiRequest(`/api/hiq/crews/${post.crewId}/posts/${post.id}`, {
                method: "DELETE"
            });
        },
        onSuccess: () => {
            toast({ title: "게시글이 삭제되었습니다." });
            queryClient.invalidateQueries({ queryKey: [`/api/hiq/crews/${post.crewId}/posts`] });
        },
        onError: (error: any) => {
            toast({
                title: "삭제 실패",
                description: error.message || "권한이 없거나 오류가 발생했습니다.",
                variant: "destructive"
            });
        }
    });

    const handleActionClick = (callback: () => void) => {
        if (!isMember) {
            toast({
                title: "접근 제한",
                description: "멤버 전용 메뉴입니다. 크루에 가입해주세요.",
                variant: "destructive"
            });
            return;
        }
        callback();
    };

    return (
        <article className="rk-card p-5 group hover:border-surface-line-strong transition-all flex flex-col gap-3">
            {/* Header: Author + Time */}
            <header className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-white/10 overflow-hidden border border-white/5">
                        {post.author?.profileImageUrl ? (
                            <img
                                src={post.author.profileImageUrl}
                                className="w-full h-full object-cover"
                                alt={`${post.author.name}의 프로필`}
                            />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-[12px] font-bold text-white/45">
                                {post.author?.name?.charAt(0)}
                            </div>
                        )}
                    </div>
                    <div className="flex flex-col">
                        <div className="flex items-center gap-1.5">
                            <span className="text-sm font-semibold text-white leading-none">{post.author?.name}</span>
                            {post.author?.role === 'leader' && (
                                <Badge variant="leader">방장</Badge>
                            )}
                            {post.author?.role === 'manage' && (
                                <Badge variant="manage">부방장</Badge>
                            )}
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <time className="text-[12px] font-medium text-white/55">
                        {post.createdAt ? formatDistanceToNow(new Date(post.createdAt), { addSuffix: true, locale: ko }) : '--'}
                    </time>
                    {canDelete && (
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <button
                                    className="p-1.5 text-white/45 hover:text-red-500 transition-colors"
                                    disabled={deleteMutation.isPending}
                                    title="게시글 삭제"
                                >
                                    <LucideTrash2 className="w-3.5 h-3.5" />
                                </button>
                            </AlertDialogTrigger>
                            <AlertDialogContent className="bg-[#141416] border-white/10 rounded-card">
                                <AlertDialogHeader>
                                    <AlertDialogTitle className="text-white">게시글 삭제</AlertDialogTitle>
                                    <AlertDialogDescription className="text-white/60">
                                        정말로 이 게시글을 삭제하시겠습니까? 삭제된 게시글은 복구할 수 없습니다.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel className="bg-white/5 text-white border-white/10 hover:bg-white/10">취소</AlertDialogCancel>
                                    <AlertDialogAction
                                        onClick={() => deleteMutation.mutate()}
                                        className="bg-red-500 hover:bg-red-600 text-white"
                                    >
                                        삭제
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    )}
                </div>
            </header>

            {/* Body: Title + Content */}
            <div className="space-y-1.5">
                <h3
                    onClick={() => handleActionClick(() => setIsDetailOpen(true))}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleActionClick(() => setIsDetailOpen(true)) }}
                    role="button"
                    tabIndex={0}
                    className="text-base font-bold text-white group-hover:text-brand cursor-pointer transition-colors line-clamp-1 outline-none focus:text-brand"
                >
                    {post.title}
                </h3>
                <div
                    className="relative cursor-pointer focus:outline-none"
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                        handleActionClick(() => {
                            isLongText ? setIsExpanded(!isExpanded) : setIsDetailOpen(true)
                        });
                    }}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            handleActionClick(() => {
                                isLongText ? setIsExpanded(!isExpanded) : setIsDetailOpen(true)
                            });
                        }
                    }}
                >
                    <p
                        className={cn(
                            "text-sm text-white/60 leading-relaxed whitespace-pre-wrap transition-all duration-300",
                            !isExpanded && "line-clamp-3"
                        )}
                    >
                        {content}
                    </p>

                    {post.images && post.images.length > 0 && !isExpanded && (
                        <div className={cn(
                            "mt-3 grid gap-1 rounded-xl overflow-hidden",
                            post.images.length === 1 ? "grid-cols-1" : "grid-cols-2"
                        )}>
                            {post.images.slice(0, post.images.length === 3 ? 3 : 4).map((img, idx) => (
                                <div key={idx} className={cn(
                                    "relative aspect-square bg-white/5",
                                    post.images?.length === 3 && idx === 0 && "row-span-2 aspect-auto"
                                )}>
                                    <img src={img} className="w-full h-full object-cover" alt="post content" />
                                    {idx === 3 && post.images!.length > 4 && (
                                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                            <span className="text-sm font-bold text-white">+{post.images!.length - 4}</span>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {isLongText && !isExpanded && (
                        <span className="mt-1 block text-xs font-medium text-white/55 hover:text-brand transition-colors ">
                            ... 더 보기
                        </span>
                    )}
                    {isExpanded && (
                        <span className="mt-2 block text-xs font-medium text-white/55 hover:text-white/70 transition-colors">
                            접기
                        </span>
                    )}
                </div>
            </div>

            {/* Footer: Engagement & Tag */}
            <footer className="flex items-center justify-between pt-3 border-t border-white/5">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => handleActionClick(() => likeMutation.mutate())}
                        disabled={likeMutation.isPending}
                        className={cn(
                            "flex items-center gap-1.5 group/like transition-all",
                            likeMutation.isPending && "opacity-50"
                        )}
                        aria-label={post.isLiked ? "좋아요 취소" : "좋아요"}
                    >
                        <LucideHeart className={cn(
                            "w-4 h-4 transition-colors",
                            post.isLiked ? "text-red-500 fill-red-500" : "text-white/45 group-hover/like:text-red-500"
                        )} />
                        <span className={cn(
                            "text-xs font-semibold tabular-nums transition-colors",
                            post.isLiked ? "text-red-500" : "text-white/55 group-hover/like:text-white/70"
                        )}>
                            {post.likeCount || 0}
                        </span>
                    </button>
                    <button
                        onClick={() => handleActionClick(() => setIsDetailOpen(true))}
                        className="flex items-center gap-1.5 group/comment"
                        aria-label={`댓글 ${post.commentCount || 0}개`}
                    >
                        <LucideMessageSquare className="w-4 h-4 text-white/45 group-hover/comment:text-brand transition-colors" />
                        <span className="text-xs font-medium tabular-nums text-white/55 group-hover/comment:text-white/70">{post.commentCount || 0}</span>
                    </button>
                </div>
                {post.category && post.category !== "자유글" && (
                    <span className="text-[12px] font-bold text-brand/70">
                        #{post.category}
                    </span>
                )}
            </footer>

            <PostDetailDialog
                open={isDetailOpen}
                onOpenChange={setIsDetailOpen}
                post={post}
                isAdmin={isAdmin}
                currentMemberId={currentMemberId}
            />
        </article>
    );
}

// Helper Components
function Badge({ variant, children }: { variant: 'leader' | 'manage', children: React.ReactNode }) {
    const styles = {
        leader: "bg-yellow-500/10 border-yellow-500/20 text-yellow-500",
        manage: "bg-blue-500/10 border-blue-500/20 text-blue-400"
    };

    return (
        <div className={cn("flex items-center gap-1 px-1.5 py-0.5 border rounded-md", styles[variant])}>
            {variant === 'leader' ? <LucideCrown className="w-2.5 h-2.5 fill-current" /> : <LucideShield className="w-2.5 h-2.5 fill-current" />}
            <span className="text-[12px] font-bold leading-none">{children}</span>
        </div>
    );
}


