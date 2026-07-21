import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";
import { LucideHeart, LucideMessageSquare, LucideCrown, LucideShield, LucideTrash2 } from "@/lib/icons";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/lib/i18n";
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
    const { t } = useT();

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
                title: t("socialPost.errorOccurred"),
                description: t("socialPost.likeFailed"),
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
            toast({ title: t("socialPost.postDeleted") });
            queryClient.invalidateQueries({ queryKey: [`/api/hiq/crews/${post.crewId}/posts`] });
        },
        onError: (error: any) => {
            toast({
                title: t("socialPost.deleteFailed"),
                description: error.message || t("socialPost.noPermissionOrError"),
                variant: "destructive"
            });
        }
    });

    const handleActionClick = (callback: () => void) => {
        if (!isMember) {
            toast({
                title: t("socialPost.accessRestricted"),
                description: t("socialPost.membersOnly"),
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
                    <div className="w-8 h-8 rounded-full bg-black/[0.06] overflow-hidden ">
                        {post.author?.profileImageUrl ? (
                            <img
                                src={post.author.profileImageUrl}
                                className="w-full h-full object-cover"
                                alt={`${post.author.name} ${t("socialPost.profileAlt")}`}
                            />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-[12px] font-bold text-black/40">
                                {post.author?.name?.charAt(0)}
                            </div>
                        )}
                    </div>
                    <div className="flex flex-col">
                        <div className="flex items-center gap-1.5">
                            <span className="text-sm font-semibold text-ink-1 leading-none">{post.author?.name}</span>
                            {post.author?.role === 'leader' && (
                                <Badge variant="leader">{t("socialPost.leader")}</Badge>
                            )}
                            {post.author?.role === 'manage' && (
                                <Badge variant="manage">{t("socialPost.manager")}</Badge>
                            )}
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <time className="text-[12px] font-medium text-black/55">
                        {post.createdAt ? formatDistanceToNow(new Date(post.createdAt), { addSuffix: true, locale: ko }) : '--'}
                    </time>
                    {canDelete && (
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <button
                                    className="p-1.5 text-black/40 hover:text-red-500 transition-colors"
                                    disabled={deleteMutation.isPending}
                                    title={t("socialPost.deletePost")}
                                >
                                    <LucideTrash2 className="w-3.5 h-3.5" />
                                </button>
                            </AlertDialogTrigger>
                            <AlertDialogContent className="bg-white border-black/[0.08] rounded-card">
                                <AlertDialogHeader>
                                    <AlertDialogTitle className="text-ink-1">{t("socialPost.deletePost")}</AlertDialogTitle>
                                    <AlertDialogDescription className="text-black/60">
                                        {t("socialPost.deleteConfirmDesc")}
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel className="bg-surface-3 text-ink-1 border-black/10 hover:bg-black/[0.06]">{t("socialPost.cancel")}</AlertDialogCancel>
                                    <AlertDialogAction
                                        onClick={() => deleteMutation.mutate()}
                                        className="bg-red-500 hover:bg-red-600 text-white"
                                    >
                                        {t("socialPost.delete")}
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
                    className="text-base font-bold text-ink-1 group-hover:text-brand cursor-pointer transition-colors line-clamp-1 outline-none focus:text-brand"
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
                            "text-sm text-black/70 leading-relaxed whitespace-pre-wrap transition-all duration-300",
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
                                    "relative aspect-square bg-black/[0.04]",
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
                        <span className="mt-1 block text-xs font-medium text-black/55 hover:text-brand transition-colors ">
                            {t("socialPost.seeMore")}
                        </span>
                    )}
                    {isExpanded && (
                        <span className="mt-2 block text-xs font-medium text-black/55 hover:text-ink-1 transition-colors">
                            {t("socialPost.collapse")}
                        </span>
                    )}
                </div>
            </div>

            {/* Footer: Engagement & Tag */}
            <footer className="flex items-center justify-between pt-3 border-t border-black/10">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => handleActionClick(() => likeMutation.mutate())}
                        disabled={likeMutation.isPending}
                        className={cn(
                            "flex items-center gap-1.5 group/like transition-all",
                            likeMutation.isPending && "opacity-50"
                        )}
                        aria-label={post.isLiked ? t("socialPost.unlike") : t("socialPost.like")}
                    >
                        <LucideHeart className={cn(
                            "w-4 h-4 transition-colors",
                            post.isLiked ? "text-red-500 fill-red-500" : "text-black/40 group-hover/like:text-red-500"
                        )} />
                        <span className={cn(
                            "text-xs font-semibold tabular-nums transition-colors",
                            post.isLiked ? "text-red-500" : "text-black/55 group-hover/like:text-ink-1"
                        )}>
                            {post.likeCount || 0}
                        </span>
                    </button>
                    <button
                        onClick={() => handleActionClick(() => setIsDetailOpen(true))}
                        className="flex items-center gap-1.5 group/comment"
                        aria-label={`${t("socialPost.comments")} ${post.commentCount || 0}`}
                    >
                        <LucideMessageSquare className="w-4 h-4 text-black/40 group-hover/comment:text-brand transition-colors" />
                        <span className="text-xs font-medium tabular-nums text-black/55 group-hover/comment:text-ink-1">{post.commentCount || 0}</span>
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
        leader: "bg-[#cba258]/12 border-[#cba258]/25 text-[#a97f3d]",
        manage: "bg-brand/10 border-brand/20 text-brand"
    };

    return (
        <div className={cn("flex items-center gap-1 px-1.5 py-0.5 border rounded-md", styles[variant])}>
            {variant === 'leader' ? <LucideCrown className="w-2.5 h-2.5 fill-current" /> : <LucideShield className="w-2.5 h-2.5 fill-current" />}
            <span className="text-[12px] font-bold leading-none">{children}</span>
        </div>
    );
}


