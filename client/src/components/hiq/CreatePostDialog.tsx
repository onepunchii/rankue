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
import { useT } from "@/lib/i18n";

import { CrewData } from "@/types/crew";

// 카테고리 값은 서버 저장·비교용 원문 유지, 화면 표시만 번역 키로 매핑
const CATEGORY_LABEL_KEYS: Record<string, string> = {
    "공지사항": "createPost.categoryNotice",
    "가입인사": "createPost.categoryGreeting",
    "크루후기": "createPost.categoryReview",
    "자유글": "createPost.categoryFree",
};

interface CreatePostDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    crewId: string;
    isAdmin?: boolean;
    crew?: CrewData;
}

export function CreatePostDialog({ open, onOpenChange, crewId, isAdmin, crew }: CreatePostDialogProps) {
    const { t } = useT();
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
            toast({ title: t("createPost.created") });
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
                title: t("createPost.createFailed"),
                description: error.message || t("createPost.genericError"),
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
                    toast({ title: t("createPost.maxImages"), variant: "destructive" });
                    break;
                }
                const url = await uploadImage(files[i], 'post', { maxSize: 800, quality: 0.6 });
                compressedImages.push(url);
            }
            setImages([...images, ...compressedImages]);
        } catch (error) {
            console.error("Compression error:", error);
            toast({ title: t("createPost.compressError"), variant: "destructive" });
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
            toast({ title: t("createPost.titleRequired"), variant: "destructive" });
            return;
        }

        let finalContent = content;

        if (category === "가입인사" && crew?.introQuestions && crew.introQuestions.length > 0) {
            // Validate required questions
            for (const q of crew.introQuestions) {
                if (q.required && !answers[q.id]?.trim()) {
                    toast({ title: `${t("createPost.answerRequired")}: ${q.text}`, variant: "destructive" });
                    return;
                }
            }

            // Format answers
            finalContent = crew.introQuestions
                .map(q => `Q. ${q.text}\nA. ${answers[q.id] || '(미답변)'}`)
                .join('\n\n');
        } else if (!content.trim()) {
            toast({ title: t("createPost.contentRequired"), variant: "destructive" });
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
                    <DialogTitle className="text-xl font-semibold text-brand">{t("createPost.title")}</DialogTitle>
                    <DialogDescription className="text-black/55">
                        {t("createPost.description")}
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar max-h-[60vh] md:max-h-[70vh]">
                    <div className="space-y-2">
                        <Label className="text-xs font-semibold text-black/55">{t("createPost.categoryLabel")}</Label>
                        <Select value={category} onValueChange={(val) => {
                            setCategory(val);
                            if (val === "공지사항") setIsNotice(true);
                        }}>
                            <SelectTrigger className="bg-surface-3 border-black/10 h-12 rounded-tile">
                                <SelectValue placeholder={t("createPost.categoryPlaceholder")} />
                            </SelectTrigger>
                            <SelectContent className="bg-white border-black/[0.08] text-ink-1 rounded-tile">
                                {categories.map(c => (
                                    <SelectItem key={c} value={c}>{t(CATEGORY_LABEL_KEYS[c] ?? c)}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label className="text-xs font-semibold text-black/55">{t("createPost.titleLabel")}</Label>
                        <Input
                            placeholder={t("createPost.titlePlaceholder")}
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="bg-surface-3 border-black/10 h-12 rounded-tile placeholder:text-black/40"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label className="text-xs font-semibold text-black/55">{t("createPost.contentLabel")}</Label>
                        {category === "가입인사" && crew?.introQuestions && crew.introQuestions.length > 0 ? (
                            <div className="space-y-4 p-4 bg-surface-3 rounded-tile">
                                {crew.introQuestions.map((q) => (
                                    <div key={q.id} className="space-y-2">
                                        <div className="flex items-center gap-1.5">
                                            <Label className="text-[12px] font-semibold text-black/70">{q.text}</Label>
                                            {q.required && <span className="text-brand text-[12px] font-semibold">{t("createPost.required")}</span>}
                                        </div>
                                        <Input
                                            value={answers[q.id] || ""}
                                            onChange={(e) => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                                            placeholder={t("createPost.answerPlaceholder")}
                                            className="bg-white border-black/10 h-10 text-sm rounded-lg placeholder:text-black/40"
                                        />
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <Textarea
                                placeholder={t("createPost.contentPlaceholder")}
                                value={content}
                                onChange={(e) => setContent(e.target.value)}
                                className="bg-surface-3 border-black/10 min-h-[150px] resize-none rounded-tile placeholder:text-black/40"
                            />
                        )}
                    </div>

                    <div className="space-y-2">
                        <Label className="text-xs font-semibold text-black/55">{t("createPost.photosLabel")} ({images.length}/5)</Label>
                        <div className="flex flex-wrap gap-2">
                            {images.map((img, idx) => (
                                <div key={idx} className="relative w-20 h-20 rounded-tile overflow-hidden ">
                                    <img src={img} alt="preview" className="w-full h-full object-cover" />
                                    <button
                                        onClick={() => removeImage(idx)}
                                        className="absolute top-1 right-1 p-1 bg-black/60 rounded-full hover:bg-black/80 transition-colors"
                                        title={t("createPost.removePhoto")}
                                        aria-label={t("createPost.removePhoto")}
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
                                            <span className="text-[12px] font-medium text-black/55">{t("createPost.addPhoto")}</span>
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
                            title={t("createPost.selectPhoto")}
                            aria-label={t("createPost.selectPhoto")}
                        />
                    </div>

                    {isAdmin && category !== "공지사항" && (
                        <div className="flex items-center justify-between p-3 rounded-tile bg-surface-3 ">
                            <div className="space-y-0.5">
                                <Label className="text-sm font-semibold text-ink-1">{t("createPost.registerAsNotice")}</Label>
                                <p className="text-[12px] text-black/55">{t("createPost.noticeHint")}</p>
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
                        {createPostMutation.isPending ? t("createPost.submitting") : t("createPost.submit")}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
