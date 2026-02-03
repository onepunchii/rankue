import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

interface CreatePostDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    crewId: string;
    isAdmin?: boolean;
}

export function CreatePostDialog({ open, onOpenChange, crewId, isAdmin }: CreatePostDialogProps) {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [category, setCategory] = useState("자유글");
    const [title, setTitle] = useState("");
    const [content, setContent] = useState("");
    const [isNotice, setIsNotice] = useState(false);

    const categories = isAdmin
        ? ["공지사항", "가입인사", "크루후기", "자유글"]
        : ["가입인사", "크루후기", "자유글"];

    const createPostMutation = useMutation({
        mutationFn: async (data: any) => {
            return await apiRequest(`/api/hiq/crews/${crewId}/posts`, {
                method: "POST",
                body: data
            });
        },
        onSuccess: () => {
            toast({ title: "게시글이 등록되었습니다." });
            queryClient.invalidateQueries({ queryKey: [`/api/hiq/crews/${crewId}/posts`] });
            onOpenChange(false);
            setTitle("");
            setContent("");
            setIsNotice(false);
            setCategory("자유글");
        },
        onError: (error: any) => {
            toast({
                title: "게시글 등록 실패",
                description: error.message || "오류가 발생했습니다.",
                variant: "destructive"
            });
        }
    });

    const handleSubmit = () => {
        if (!title.trim() || !content.trim()) {
            toast({ title: "제목과 내용을 입력해주세요.", variant: "destructive" });
            return;
        }
        createPostMutation.mutate({
            title,
            content,
            category,
            isNotice: category === "공지사항" ? true : isNotice
        });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-[#1a1a1a] border-white/10 text-white max-w-md">
                <DialogHeader>
                    <DialogTitle className="text-xl font-black">게시글 작성</DialogTitle>
                    <DialogDescription className="text-white/40">
                        크루 멤버들과 공유할 내용을 작성해주세요.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label className="text-xs font-black text-white/40 uppercase tracking-widest">카테고리</Label>
                        <Select value={category} onValueChange={(val) => {
                            setCategory(val);
                            if (val === "공지사항") setIsNotice(true);
                        }}>
                            <SelectTrigger className="bg-black/20 border-white/10 h-12 rounded-none">
                                <SelectValue placeholder="카테고리 선택" />
                            </SelectTrigger>
                            <SelectContent className="bg-[#1a1a1a] border-white/10 text-white rounded-none">
                                {categories.map(c => (
                                    <SelectItem key={c} value={c}>{c}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label className="text-xs font-black text-white/40 uppercase tracking-widest">제목</Label>
                        <Input
                            placeholder="제목을 입력하세요"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="bg-black/20 border-white/10 h-12 rounded-none"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label className="text-xs font-black text-white/40 uppercase tracking-widest">내용</Label>
                        <Textarea
                            placeholder="내용을 입력하세요"
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            className="bg-black/20 border-white/10 min-h-[150px] resize-none rounded-none"
                        />
                    </div>

                    {isAdmin && category !== "공지사항" && (
                        <div className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5">
                            <div className="space-y-0.5">
                                <Label className="text-sm font-bold">공지사항으로 등록</Label>
                                <p className="text-[10px] text-white/40">게시판 상단에 고정됩니다.</p>
                            </div>
                            <Switch checked={isNotice} onCheckedChange={setIsNotice} />
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button
                        onClick={handleSubmit}
                        disabled={createPostMutation.isPending}
                        className="w-full h-12 bg-[#10B981] hover:bg-[#059669] text-black font-black rounded-none"
                    >
                        {createPostMutation.isPending ? "등록 중..." : "등록하기"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
