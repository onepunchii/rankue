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
import { LucideImage, LucideX, LucideCamera } from "@/lib/icons";
import { uploadImage } from "@/lib/imageUtils";
import { useRef } from "react";

import { CrewData } from "@/types/crew";

interface CreatePostDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    crewId: string;
    isAdmin?: boolean;
    crew?: CrewData;
}

export function CreatePostDialog({ open, onOpenChange, crewId, isAdmin, crew }: CreatePostDialogProps) {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [category, setCategory] = useState("자유글");
    const [title, setTitle] = useState("");
    const [content, setContent] = useState("");
    const [isNotice, setIsNotice] = useState(false);
    const [images, setImages] = useState<string[]>([]);
    const [isCompressing, setIsCompressing] = useState(false);
    const [answers, setAnswers] = useState<Record<string, string>>({});
    const fileInputRef = useRef<HTMLInputElement>(null);

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
            setImages([]);
            setAnswers({});
        },
        onError: (error: any) => {
            toast({
                title: "게시글 등록 실패",
                description: error.message || "오류가 발생했습니다.",
                variant: "destructive"
            });
        }
    });

    const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files) return;

        setIsCompressing(true);
        try {
            const compressedImages: string[] = [];
            for (let i = 0; i < files.length; i++) {
                if (images.length + compressedImages.length >= 5) {
                    toast({ title: "사진은 최대 5장까지 등록 가능합니다.", variant: "destructive" });
                    break;
                }
                const url = await uploadImage(files[i], 'post', { maxSize: 800, quality: 0.6 });
                compressedImages.push(url);
            }
            setImages([...images, ...compressedImages]);
        } catch (error) {
            console.error("Compression error:", error);
            toast({ title: "이미지 압축 중 오류가 발생했습니다.", variant: "destructive" });
        } finally {
            setIsCompressing(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    const removeImage = (index: number) => {
        setImages(images.filter((_, i) => i !== index));
    };

    const handleSubmit = () => {
        if (!title.trim()) {
            toast({ title: "제목을 입력해주세요.", variant: "destructive" });
            return;
        }

        let finalContent = content;

        if (category === "가입인사" && crew?.introQuestions && crew.introQuestions.length > 0) {
            // Validate required questions
            for (const q of crew.introQuestions) {
                if (q.required && !answers[q.id]?.trim()) {
                    toast({ title: `필수 항목에 답해주세요: ${q.text}`, variant: "destructive" });
                    return;
                }
            }

            // Format answers
            finalContent = crew.introQuestions
                .map(q => `Q. ${q.text}\nA. ${answers[q.id] || '(미답변)'}`)
                .join('\n\n');
        } else if (!content.trim()) {
            toast({ title: "내용을 입력해주세요.", variant: "destructive" });
            return;
        }

        createPostMutation.mutate({
            title,
            content: finalContent,
            category,
            isNotice: category === "공지사항" ? true : isNotice,
            images: images.length > 0 ? images : null
        });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-white border-black/[0.08] text-ink-1 max-w-md rounded-card p-0 gap-0">
                <DialogHeader className="p-6 pb-0">
                    <DialogTitle className="text-xl font-semibold text-brand">게시글 작성</DialogTitle>
                    <DialogDescription className="text-black/55">
                        크루 멤버들과 공유할 내용을 작성해주세요.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar max-h-[60vh] md:max-h-[70vh]">
                    <div className="space-y-2">
                        <Label className="text-xs font-semibold text-black/55">카테고리</Label>
                        <Select value={category} onValueChange={(val) => {
                            setCategory(val);
                            if (val === "공지사항") setIsNotice(true);
                        }}>
                            <SelectTrigger className="bg-surface-3 border-black/10 h-12 rounded-tile">
                                <SelectValue placeholder="카테고리 선택" />
                            </SelectTrigger>
                            <SelectContent className="bg-white border-black/[0.08] text-ink-1 rounded-tile">
                                {categories.map(c => (
                                    <SelectItem key={c} value={c}>{c}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label className="text-xs font-semibold text-black/55">제목</Label>
                        <Input
                            placeholder="제목을 입력하세요"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="bg-surface-3 border-black/10 h-12 rounded-tile placeholder:text-black/40"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label className="text-xs font-semibold text-black/55">내용</Label>
                        {category === "가입인사" && crew?.introQuestions && crew.introQuestions.length > 0 ? (
                            <div className="space-y-4 p-4 bg-surface-3 rounded-tile">
                                {crew.introQuestions.map((q) => (
                                    <div key={q.id} className="space-y-2">
                                        <div className="flex items-center gap-1.5">
                                            <Label className="text-[12px] font-semibold text-black/70">{q.text}</Label>
                                            {q.required && <span className="text-brand text-[12px] font-semibold">필수</span>}
                                        </div>
                                        <Input
                                            value={answers[q.id] || ""}
                                            onChange={(e) => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                                            placeholder="답변을 입력하세요"
                                            className="bg-white border-black/10 h-10 text-sm rounded-lg placeholder:text-black/40"
                                        />
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <Textarea
                                placeholder="내용을 입력하세요"
                                value={content}
                                onChange={(e) => setContent(e.target.value)}
                                className="bg-surface-3 border-black/10 min-h-[150px] resize-none rounded-tile placeholder:text-black/40"
                            />
                        )}
                    </div>

                    <div className="space-y-2">
                        <Label className="text-xs font-semibold text-black/55">사진 ({images.length}/5)</Label>
                        <div className="flex flex-wrap gap-2">
                            {images.map((img, idx) => (
                                <div key={idx} className="relative w-20 h-20 rounded-tile overflow-hidden ">
                                    <img src={img} alt="preview" className="w-full h-full object-cover" />
                                    <button
                                        onClick={() => removeImage(idx)}
                                        className="absolute top-1 right-1 p-1 bg-black/60 rounded-full hover:bg-black/80 transition-colors"
                                        title="사진 삭제"
                                        aria-label="사진 삭제"
                                    >
                                        <LucideX className="w-3 h-3 text-white" />
                                    </button>
                                </div>
                            ))}
                            {images.length < 5 && (
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={isCompressing}
                                    className="w-20 h-20 rounded-tile border-2 border-dashed border-black/10 flex flex-col items-center justify-center gap-1 hover:bg-black/[0.04] transition-colors disabled:opacity-50"
                                >
                                    {isCompressing ? (
                                        <div className="w-4 h-4 border-2 border-brand border-t-transparent animate-spin rounded-full" />
                                    ) : (
                                        <>
                                            <LucideCamera className="w-6 h-6 text-black/40" />
                                            <span className="text-[12px] font-medium text-black/55">추가</span>
                                        </>
                                    )}
                                </button>
                            )}
                        </div>
                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleImageChange}
                            accept="image/*"
                            multiple
                            className="hidden"
                            title="사진 선택"
                            aria-label="사진 선택"
                        />
                    </div>

                    {isAdmin && category !== "공지사항" && (
                        <div className="flex items-center justify-between p-3 rounded-tile bg-surface-3 ">
                            <div className="space-y-0.5">
                                <Label className="text-sm font-semibold text-ink-1">공지사항으로 등록</Label>
                                <p className="text-[12px] text-black/55">게시판 상단에 고정됩니다.</p>
                            </div>
                            <Switch checked={isNotice} onCheckedChange={setIsNotice} />
                        </div>
                    )}
                </div>

                <DialogFooter className="p-6 pt-2">
                    <Button
                        onClick={handleSubmit}
                        disabled={createPostMutation.isPending}
                        className="w-full h-12 rk-btn-primary rounded-tile font-semibold text-[15px]"
                    >
                        {createPostMutation.isPending ? "등록 중..." : "등록하기"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
