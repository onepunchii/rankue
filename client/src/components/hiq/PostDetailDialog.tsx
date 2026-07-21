import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { LucideSend, LucideTrash2 } from "@/lib/icons";
import { useT } from "@/lib/i18n";

interface Comment {
    id: string;
    content: string;
    createdAt: string;
    authorId: string;
    author: {
        name: string;
        profileImageUrl?: string;
    };
}

interface PostDetailDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    post: any;
    isAdmin?: boolean;
    currentMemberId?: string;
}

export function PostDetailDialog({ open, onOpenChange, post, isAdmin, currentMemberId }: PostDetailDialogProps) {
    const [commentContent, setCommentContent] = useState("");
    const { toast } = useToast();
    const { t } = useT();

    // Fetch Comments
    const { data: comments, isLoading, isError, refetch } = useQuery<Comment[]>({
        queryKey: [`/api/hiq/crews/${post?.crewId}/posts/${post?.id}/comments`],
        enabled: !!open && !!post?.id
    });

    // Create Comment Mutation
    const commentMutation = useMutation({
        mutationFn: async (content: string) => {
            if (!post?.id) throw new Error("Post ID is missing");
            if (!post?.crewId) throw new Error("Crew ID is missing");
            return await apiRequest(`/api/hiq/crews/${post.crewId}/posts/${post.id}/comments`, {
                method: "POST",
                body: JSON.stringify({ content })
            });
        },
        onSuccess: () => {
            setCommentContent("");
            queryClient.invalidateQueries({ queryKey: [`/api/hiq/crews/${post?.crewId}/posts/${post?.id}/comments`] });
            queryClient.invalidateQueries({ queryKey: [`/api/hiq/crews/${post?.crewId}/posts`] });
        },
        onError: (error: any) => {
            toast({
                title: t("postDetail.commentCreateFailed"),
                description: error.message,
                variant: "destructive"
            });
        }
    });

    // Delete Comment Mutation
    const deleteCommentMutation = useMutation({
        mutationFn: async (commentId: string) => {
            if (!post?.crewId) throw new Error("Crew ID is missing");
            return await apiRequest(`/api/hiq/crews/${post.crewId}/comments/${commentId}`, {
                method: "DELETE"
            });
        },
        onSuccess: () => {
            toast({ title: t("postDetail.commentDeleted") });
            queryClient.invalidateQueries({ queryKey: [`/api/hiq/crews/${post?.crewId}/posts/${post?.id}/comments`] });
            queryClient.invalidateQueries({ queryKey: [`/api/hiq/crews/${post?.crewId}/posts`] });
        },
        onError: (error: any) => {
            toast({
                title: t("postDetail.deleteFailed"),
                description: error.message || t("postDetail.noPermissionOrError"),
                variant: "destructive"
            });
        }
    });

    const handleSubmitComment = () => {
        if (!commentContent.trim()) return;
        commentMutation.mutate(commentContent);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg bg-white border-black/10 rounded-card p-0 overflow-hidden flex flex-col max-h-[85vh]">
                <DialogHeader className="px-8 py-6 border-b border-black/10">
                    <DialogTitle className="text-xl font-semibold text-ink-1">{post?.title}</DialogTitle>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">
                    {/* Original Post Content */}
                    <div className="space-y-4 pb-8 border-b border-black/10">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-black/[0.04] overflow-hidden ">
                                {post?.author?.profileImageUrl ? (
                                    <img src={post.author.profileImageUrl} className="w-full h-full object-cover" alt="" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-xs font-semibold text-black/55">
                                        {post?.author?.name?.charAt(0)}
                                    </div>
                                )}
                            </div>
                            <span className="text-[15px] font-bold text-ink-1">{post?.author?.name}</span>
                        </div>
                        <p className="text-[15px] text-black/70 leading-relaxed whitespace-pre-wrap font-medium">{post?.content}</p>

                        {post?.images && post.images.length > 0 && (
                            <div className="space-y-3 pt-2">
                                {post.images.map((img: string, idx: number) => (
                                    <div key={idx} className="rounded-xl overflow-hidden bg-black/[0.04]">
                                        <img src={img} className="w-full h-auto" alt={`post content ${idx}`} />
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Comments Section */}
                    <div className="space-y-5">
                        <h4 className="text-[12px] font-semibold text-black/55 flex items-center gap-2">
                            <span className="w-1 h-1 rounded-full bg-brand" />
                            {t("postDetail.comments")} {comments?.length || 0}
                        </h4>
                        {isLoading ? (
                            <div className="py-12 text-center text-black/55 text-[12px] font-semibold">{t("postDetail.loading")}</div>
                        ) : isError ? (
                            <div className="py-16 text-center flex flex-col items-center gap-3">
                                <p className="text-black/55 text-[12px] font-semibold">{t("postDetail.commentsLoadFailed")}</p>
                                <Button
                                    variant="ghost"
                                    onClick={() => refetch()}
                                    className="h-9 px-4 rounded-pill bg-black/[0.04] hover:bg-black/[0.06] text-black/70 text-[12px] font-semibold"
                                >
                                    {t("postDetail.retry")}
                                </Button>
                            </div>
                        ) : comments && comments.length > 0 ? (
                            <div className="space-y-6">
                                {comments.map((comment) => (
                                    <div key={comment.id} className="flex gap-4 group/comment">
                                        <div className="w-8 h-8 rounded-full bg-black/[0.04] overflow-hidden flex-shrink-0 transition-transform group-hover/comment:scale-105">
                                            {comment.author.profileImageUrl ? (
                                                <img src={comment.author.profileImageUrl} className="w-full h-full object-cover" alt="" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-[12px] font-medium text-black/55">
                                                    {comment.author.name.charAt(0)}
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex-1 space-y-1.5">
                                            <div className="flex items-center gap-2">
                                                <span className="text-[13px] font-bold text-ink-1">{comment.author.name}</span>
                                                <span className="text-[12px] font-medium text-black/55">
                                                    {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true, locale: ko })}
                                                </span>
                                            </div>
                                            <p className="text-[13px] text-black/70 leading-relaxed font-medium">{comment.content}</p>
                                        </div>
                                        {(isAdmin || comment.authorId === currentMemberId) && (
                                            <button
                                                onClick={() => {
                                                    if (confirm(t("postDetail.confirmDeleteComment"))) {
                                                        deleteCommentMutation.mutate(comment.id);
                                                    }
                                                }}
                                                className="shrink-0 self-start -mr-2 flex items-center justify-center min-w-[44px] min-h-[44px] text-black/40 hover:text-red-500 transition-colors md:opacity-0 md:group-hover/comment:opacity-100"
                                                title={t("postDetail.deleteComment")}
                                                aria-label={t("postDetail.deleteComment")}
                                            >
                                                <LucideTrash2 className="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="py-16 text-center text-black/55 text-[12px] font-semibold flex flex-col items-center gap-2">
                                <div className="w-8 h-px bg-black/10" />
                                {t("postDetail.firstComment")}
                            </div>
                        )}
                    </div>
                </div>

                {/* Comment Input Footer */}
                <div className="p-4 bg-white border-t border-black/10">
                    <div className="relative flex items-center gap-2">
                        <input
                            type="text"
                            placeholder={t("postDetail.commentPlaceholder")}
                            value={commentContent}
                            onChange={(e) => setCommentContent(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSubmitComment();
                                }
                            }}
                            className="flex-1 bg-black/[0.04] text-ink-1 text-sm rounded-full h-10 px-4 focus:outline-none focus:border-brand/50 focus:bg-black/[0.06] transition-all placeholder:text-black/40"
                        />
                        <Button
                            disabled={!commentContent.trim() || commentMutation.isPending}
                            onClick={handleSubmitComment}
                            size="icon"
                            className="w-10 h-10 rounded-full bg-brand hover:bg-brand-strong text-brand-fg transition-all flex-shrink-0"
                        >
                            {commentMutation.isPending ? (
                                <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                            ) : (
                                <LucideSend className="w-4 h-4 ml-0.5" />
                            )}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog >
    );
}
