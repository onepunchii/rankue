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
import { Textarea } from "@/components/ui/textarea";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { LucideHeart, LucideMessageSquare, LucideUser, LucideSend } from "lucide-react";
import { cn } from "@/lib/utils";

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

interface PhotoDetailDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    photo: any;
    isAdmin?: boolean;
    currentMemberId?: string;
}

export function PhotoDetailDialog({ open, onOpenChange, photo, isAdmin, currentMemberId }: PhotoDetailDialogProps) {
    const [commentContent, setCommentContent] = useState("");
    const { toast } = useToast();

    // Fetch Comments
    const { data: comments, isLoading: isCommentsLoading } = useQuery<Comment[]>({
        queryKey: [`/api/hiq/photos/${photo?.id}/comments`],
        enabled: !!photo?.id && open
    });

    // Like Mutation
    const likeMutation = useMutation({
        mutationFn: async () => {
            return await apiRequest(`/api/hiq/crews/${photo.crewId}/photos/${photo.id}/like`, {
                method: "POST"
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: [`/api/hiq/crews/${photo.crewId}/photos`] });
        },
        onError: (error: any) => {
            toast({
                title: "좋아요 처리 실패",
                description: error.message,
                variant: "destructive"
            });
        }
    });

    // Create Comment Mutation
    const commentMutation = useMutation({
        mutationFn: async (content: string) => {
            return await apiRequest(`/api/hiq/photos/${photo.id}/comments`, {
                method: "POST",
                body: JSON.stringify({ content })
            });
        },
        onSuccess: () => {
            setCommentContent("");
            queryClient.invalidateQueries({ queryKey: [`/api/hiq/photos/${photo.id}/comments`] });
            queryClient.invalidateQueries({ queryKey: [`/api/hiq/crews/${photo.crewId}/photos`] });
        },
        onError: (error: any) => {
            toast({
                title: "댓글 작성 실패",
                description: error.message,
                variant: "destructive"
            });
        }
    });

    // Delete Photo Mutation
    const deletePhotoMutation = useMutation({
        mutationFn: async () => {
            return await apiRequest(`/api/hiq/crews/${photo.crewId}/photos/${photo.id}`, {
                method: "DELETE"
            });
        },
        onSuccess: () => {
            toast({ title: "사진이 삭제되었습니다." });
            onOpenChange(false);
            queryClient.invalidateQueries({ queryKey: [`/api/hiq/crews/${photo.crewId}/photos`] });
        },
        onError: (error: any) => {
            toast({
                title: "삭제 실패",
                description: error.message || "권한이 없거나 오류가 발생했습니다.",
                variant: "destructive"
            });
        }
    });

    // Delete Comment Mutation
    const deleteCommentMutation = useMutation({
        mutationFn: async (commentId: string) => {
            return await apiRequest(`/api/hiq/crews/${photo.crewId}/photo-comments/${commentId}`, {
                method: "DELETE"
            });
        },
        onSuccess: () => {
            toast({ title: "댓글이 삭제되었습니다." });
            queryClient.invalidateQueries({ queryKey: [`/api/hiq/photos/${photo.id}/comments`] });
            queryClient.invalidateQueries({ queryKey: [`/api/hiq/crews/${photo.crewId}/photos`] });
        },
        onError: (error: any) => {
            toast({
                title: "삭제 실패",
                description: error.message || "권한이 없거나 오류가 발생했습니다.",
                variant: "destructive"
            });
        }
    });

    const handleSubmitComment = () => {
        if (!commentContent.trim()) return;
        commentMutation.mutate(commentContent);
    };

    if (!photo) return null;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg bg-[#141414] border-white/5 p-0 overflow-hidden flex flex-col max-h-[90vh]">
                <DialogHeader className="pl-6 pr-16 py-4 border-b border-white/5 flex flex-row items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-white/10 overflow-hidden border border-white/5">
                        {photo.author?.profileImageUrl ? (
                            <img src={photo.author.profileImageUrl} className="w-full h-full object-cover" alt="" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-[10px] font-black uppercase text-white/20">
                                {photo.author?.name?.charAt(0)}
                            </div>
                        )}
                    </div>
                    <div className="flex-1">
                        <DialogTitle className="text-sm font-bold text-white">{photo.author?.name}</DialogTitle>
                        <p className="text-[10px] font-bold text-white/20 uppercase tracking-widest">
                            {formatDistanceToNow(new Date(photo.createdAt), { addSuffix: true, locale: ko })}
                        </p>
                    </div>
                    {(isAdmin || photo.uploaderId === currentMemberId) && (
                        <button
                            onClick={() => {
                                if (confirm("이 사진을 삭제하시겠습니까?")) {
                                    deletePhotoMutation.mutate();
                                }
                            }}
                            className="p-2 text-white/20 hover:text-red-500 transition-colors"
                            title="사진 삭제"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                        </button>
                    )}
                </DialogHeader>

                <div className="flex-1 overflow-y-auto">
                    {/* Photo Display */}
                    <div className="bg-black aspect-square flex items-center justify-center overflow-hidden">
                        <img src={photo.url} className="w-full h-full object-contain" alt="" />
                    </div>

                    {/* Actions Row */}
                    <div className="px-6 py-4 flex items-center gap-4">
                        <button
                            onClick={() => likeMutation.mutate()}
                            disabled={likeMutation.isPending}
                            className={cn(
                                "flex items-center gap-1.5 transition-all",
                                likeMutation.isPending && "opacity-50"
                            )}
                        >
                            <LucideHeart className={cn(
                                "w-6 h-6 transition-colors",
                                photo.isLiked ? "text-red-500 fill-red-500" : "text-white/20 hover:text-red-500"
                            )} />
                            <span className={cn(
                                "text-sm font-bold transition-colors",
                                photo.isLiked ? "text-red-500" : "text-white/20"
                            )}>
                                {photo.likeCount || 0}
                            </span>
                        </button>
                        <div className="flex items-center gap-1.5">
                            <LucideMessageSquare className="w-6 h-6 text-white/20" />
                            <span className="text-sm font-bold text-white/20">{photo.commentCount || 0}</span>
                        </div>
                    </div>

                    {/* Comments List */}
                    <div className="px-6 pb-6 space-y-5">
                        <h4 className="text-[10px] font-black text-white/20 uppercase tracking-widest flex items-center gap-2">
                            <span className="w-1 h-1 rounded-full bg-[#10B981]" />
                            댓글 {comments?.length || 0}
                        </h4>
                        {isCommentsLoading ? (
                            <div className="py-8 text-center text-white/20 text-[10px] uppercase font-black tracking-widest">불러오는 중...</div>
                        ) : comments && comments.length > 0 ? (
                            <div className="space-y-5">
                                {comments.map((comment) => (
                                    <div key={comment.id} className="flex gap-3 group/comment">
                                        <div className="w-7 h-7 rounded-full bg-white/5 overflow-hidden flex-shrink-0">
                                            {comment.author.profileImageUrl ? (
                                                <img src={comment.author.profileImageUrl} className="w-full h-full object-cover" alt="" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-[10px] font-black text-white/20">
                                                    {comment.author.name.charAt(0)}
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex-1 space-y-1">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-bold text-white/90">{comment.author.name}</span>
                                                <span className="text-[10px] font-black text-white/20 uppercase tracking-tighter">
                                                    {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true, locale: ko })}
                                                </span>
                                            </div>
                                            <p className="text-xs text-white/60 leading-relaxed font-medium">{comment.content}</p>
                                        </div>
                                        {(isAdmin || comment.authorId === currentMemberId) && (
                                            <button
                                                onClick={() => {
                                                    if (confirm("댓글을 삭제하시겠습니까?")) {
                                                        deleteCommentMutation.mutate(comment.id);
                                                    }
                                                }}
                                                className="p-1 text-white/10 hover:text-red-500 transition-colors self-start mt-1 opacity-0 group-hover/comment:opacity-100"
                                                title="댓글 삭제"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="py-12 text-center text-white/10 text-[10px] font-black uppercase tracking-widest italic">
                                첫 댓글을 남겨보세요
                            </div>
                        )}
                    </div>
                </div>

                {/* Comment Input */}
                <div className="p-4 bg-[#141414] border-t border-white/5">
                    <div className="relative flex items-center gap-2">
                        <input
                            type="text"
                            placeholder="댓글 달기..."
                            value={commentContent}
                            onChange={(e) => setCommentContent(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSubmitComment();
                                }
                            }}
                            className="flex-1 bg-white/5 border border-white/5 text-white text-sm rounded-full h-10 px-4 focus:outline-none focus:border-[#10B981]/50 focus:bg-white/10 transition-all placeholder:text-white/20"
                        />
                        <Button
                            disabled={!commentContent.trim() || commentMutation.isPending}
                            onClick={handleSubmitComment}
                            size="icon"
                            className="w-10 h-10 rounded-full bg-[#10B981] hover:bg-[#059669] text-black transition-all shadow-lg shadow-[#10B981]/10 flex-shrink-0"
                        >
                            <LucideSend className="w-4 h-4 ml-0.5" />
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog >
    );
}
