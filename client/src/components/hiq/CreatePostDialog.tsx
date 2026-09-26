import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { LucideX, LucideCamera, LucideLoader2 } from "@/lib/icons";
import { uploadImage } from "@/lib/imageUtils";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useTermsGate } from "@/components/hiq/TermsConsent";
import { CREW_BTN, CrewChip, CrewChipRow, IconButton } from "@/components/hiq/crew-ui";
import {
    CREW_POST_CATEGORIES, CREW_NOTICE_CATEGORY, CREW_DEFAULT_CATEGORY, canonicalCrewPostCategory, crewPostCategoryLabelKey,
    type CrewPostCategory,
} from "@shared/crewBoard";
import { postsKey, photosKey } from "./crew-board/postCache";

import { CrewData } from "@/types/crew";

const MAX_IMAGES = 5;
// 글 사진은 사진첩에도 그대로 들어간다(서버가 복사) — 예전 800px·q0.6 은 사진첩에서 크게 보면 뭉개졌다.
// 1600px·q0.8 WebP 는 보통 수백 KB 라 업로드 상한(8MB)·서버리스 본문 한도에 넉넉하다.
const POST_IMAGE_OPTS = { maxSize: 1600, quality: 0.8 };

export interface EditablePost {
    id: string;
    crewId: string;
    title?: string | null;
    content?: string | null;
    category?: string | null;
    images?: string[] | null;
    isNotice?: boolean | null;
}

interface CreatePostDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    crewId: string;
    isAdmin?: boolean;
    crew?: CrewData;
    /** 있으면 고치기 모드 — PATCH 로 보낸다. */
    editPost?: EditablePost | null;
}

export function CreatePostDialog({ open, onOpenChange, crewId, isAdmin, crew, editPost }: CreatePostDialogProps) {
    const { t } = useT();
    const { gate } = useTermsGate();
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const isEdit = !!editPost;
    const [category, setCategory] = useState<CrewPostCategory>(CREW_DEFAULT_CATEGORY);
    const [title, setTitle] = useState("");
    const [content, setContent] = useState("");
    const [isNotice, setIsNotice] = useState(false);
    const [images, setImages] = useState<string[]>([]);
    // 올리는 중인 장수 — 자리 표시 타일과 "2/5" 진행을 그린다.
    const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null);
    const [answers, setAnswers] = useState<Record<string, string>>({});
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // 고치기 모드: 열 때마다 글 내용으로 채운다.
    useEffect(() => {
        if (!open || !editPost) return;
        setCategory(canonicalCrewPostCategory(editPost.category) ?? CREW_DEFAULT_CATEGORY);
        setTitle(editPost.title ?? "");
        setContent(editPost.content ?? "");
        setIsNotice(!!editPost.isNotice);
        setImages(Array.isArray(editPost.images) ? editPost.images.filter(Boolean) : []);
        setError(null);
    }, [open, editPost]);

    // 공지사항은 운영진만(서버도 거부한다). 고치기에서 원래 공지였던 글은 그대로 둘 수 있게 목록에 남긴다.
    const categories = CREW_POST_CATEGORIES.filter((c) =>
        c !== CREW_NOTICE_CATEGORY || isAdmin || (isEdit && canonicalCrewPostCategory(editPost?.category) === CREW_NOTICE_CATEGORY));
    const introQuestions = !isEdit && category === "가입인사" ? (crew?.introQuestions ?? []) : [];

    const reset = () => {
        setTitle(""); setContent(""); setIsNotice(false); setCategory(CREW_DEFAULT_CATEGORY);
        setImages([]); setAnswers({}); setError(null);
    };

    const saveMutation = useMutation({
        mutationFn: async (data: Record<string, unknown>) => apiRequest(
            isEdit ? `/api/hiq/crews/${crewId}/posts/${editPost!.id}` : `/api/hiq/crews/${crewId}/posts`,
            { method: isEdit ? "PATCH" : "POST", body: data },
        ),
        onSuccess: () => {
            toast({ title: isEdit ? t("crewPost.edited") : t("createPost.created") });
            queryClient.invalidateQueries({ queryKey: [postsKey(crewId)] });
            // 글 사진은 사진첩에도 들어가고(쓰기) 빠진다(고치기) — 사진첩도 새로 받는다.
            queryClient.invalidateQueries({ queryKey: [photosKey(crewId)] });
            onOpenChange(false);
            if (!isEdit) reset();
        },
        onError: (err: any) => {
            setError(err?.message || t("createPost.genericError"));
            toast({
                title: isEdit ? t("crewPost.editFailed") : t("createPost.createFailed"),
                description: err?.message || t("createPost.genericError"),
                variant: "destructive",
            });
        },
    });

    // 여러 장을 한 장씩 올린다 — 한 장이 실패해도 나머지는 계속하고, 끝에 몇 장 실패했는지 한 번만 알린다.
    const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith("image/"));
        if (fileInputRef.current) fileInputRef.current.value = "";
        if (files.length === 0) return;
        const room = MAX_IMAGES - images.length;
        if (files.length > room) toast({ title: t("createPost.maxImages"), variant: "destructive" });
        const batch = files.slice(0, Math.max(room, 0));
        if (batch.length === 0) return;
        setUploading({ done: 0, total: batch.length });
        let failed = 0;
        for (let i = 0; i < batch.length; i++) {
            try {
                const url = await uploadImage(batch[i], 'post', POST_IMAGE_OPTS);
                setImages((prev) => (prev.length < MAX_IMAGES ? [...prev, url] : prev));
            } catch (err) {
                console.error("[CreatePostDialog] upload failed:", err);
                failed++;
            }
            setUploading({ done: i + 1, total: batch.length });
        }
        setUploading(null);
        if (failed > 0) {
            toast({ title: t("crewPost.uploadPartialFail").replace("{n}", String(failed)), variant: "destructive" });
        }
    };

    const removeImage = (index: number) => setImages((prev) => prev.filter((_, i) => i !== index));

    const handleSubmit = () => {
        setError(null);
        if (!title.trim()) { setError(t("createPost.titleRequired")); return; }

        let finalContent = content;
        if (introQuestions.length > 0) {
            for (const q of introQuestions) {
                if (q.required && !answers[q.id]?.trim()) {
                    setError(`${t("createPost.answerRequired")}: ${q.text}`);
                    return;
                }
            }
            // 가입인사 질문·답을 본문으로 — 머리글자(Q./A.)와 '미답변' 도 화면 언어로.
            finalContent = introQuestions
                .map(q => `${t("crewPost.introQ")} ${q.text}\n${t("crewPost.introA")} ${answers[q.id]?.trim() || t("crewPost.noAnswer")}`)
                .join('\n\n');
        } else if (!content.trim()) {
            setError(t("createPost.contentRequired"));
            return;
        }

        const body: Record<string, unknown> = {
            title: title.trim(),
            content: finalContent,
            category,
            images: images.length > 0 ? images : null,
        };
        // 공지(상단 고정)는 운영진만 보낸다 — 일반 멤버가 isNotice 를 실어 보내면 서버가 거부한다(고치기).
        if (isAdmin) body.isNotice = category === CREW_NOTICE_CATEGORY ? true : isNotice;
        // 첫 글이면 약관 동의부터(감사 S4) — 동의하면 그대로 올린다
        gate(() => saveMutation.mutate(body));
    };

    const busy = saveMutation.isPending || !!uploading;
    const fieldClass = "bg-surface-3 border-transparent h-12 rounded-tile text-[15px] text-ink-1 placeholder:text-ink-4";

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent hideClose className="w-[calc(100%-32px)] max-w-md max-h-[90dvh] bg-surface-1 text-ink-1 border-0 rounded-card sm:rounded-card p-0 gap-0 flex flex-col overflow-hidden">
                <DialogHeader className="px-5 pt-5 pb-3 pr-14 text-left space-y-1">
                    <DialogTitle className="text-[22px] font-semibold text-ink-1">{isEdit ? t("crewPost.editTitle") : t("createPost.title")}</DialogTitle>
                    <DialogDescription className="text-[13px] font-medium text-ink-3">
                        {isEdit ? t("crewPost.editDesc") : t("createPost.description")}
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-4 space-y-5 custom-scrollbar">
                    <div className="space-y-2">
                        <Label className="text-[13px] font-semibold text-ink-3">{t("createPost.categoryLabel")}</Label>
                        <CrewChipRow label={t("createPost.categoryLabel")} className="-mx-5 px-5">
                            {categories.map((c) => (
                                <CrewChip key={c} selected={category === c} onClick={() => {
                                    setCategory(c);
                                    if (c === CREW_NOTICE_CATEGORY) setIsNotice(true);
                                }}>
                                    {t(crewPostCategoryLabelKey(c) ?? c)}
                                </CrewChip>
                            ))}
                        </CrewChipRow>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="crew-post-title" className="text-[13px] font-semibold text-ink-3">{t("createPost.titleLabel")}</Label>
                        <Input
                            id="crew-post-title"
                            placeholder={t("createPost.titlePlaceholder")}
                            value={title}
                            maxLength={120}
                            onChange={(e) => setTitle(e.target.value)}
                            className={fieldClass}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label className="text-[13px] font-semibold text-ink-3">{t("createPost.contentLabel")}</Label>
                        {introQuestions.length > 0 ? (
                            <div className="space-y-4 p-4 bg-surface-3 rounded-tile">
                                {introQuestions.map((q) => (
                                    <div key={q.id} className="space-y-2">
                                        <div className="flex items-center gap-1.5">
                                            <Label className="text-[13px] font-semibold text-ink-2">{q.text}</Label>
                                            {q.required && <span className="text-brand text-[12px] font-semibold">{t("createPost.required")}</span>}
                                        </div>
                                        <Input
                                            value={answers[q.id] || ""}
                                            onChange={(e) => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                                            placeholder={t("createPost.answerPlaceholder")}
                                            className="bg-surface-1 border-transparent h-11 text-[15px] rounded-tile placeholder:text-ink-4"
                                        />
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <Textarea
                                placeholder={t("createPost.contentPlaceholder")}
                                value={content}
                                maxLength={4000}
                                onChange={(e) => setContent(e.target.value)}
                                className="bg-surface-3 border-transparent min-h-[150px] resize-none rounded-tile text-[15px] text-ink-1 placeholder:text-ink-4"
                            />
                        )}
                    </div>

                    <div className="space-y-2">
                        <Label className="text-[13px] font-semibold text-ink-3">
                            {t("createPost.photosLabel")} <span className="rk-num">({images.length}/{MAX_IMAGES})</span>
                        </Label>
                        <div className="flex flex-wrap gap-2">
                            {images.map((img, idx) => (
                                <div key={img + idx} className="relative w-24 h-24 rounded-tile overflow-hidden bg-surface-3">
                                    <img src={img} alt="" className="w-full h-full object-cover" />
                                    {/* 보이는 동그라미는 24px 이지만 누르는 곳은 44px */}
                                    <button
                                        type="button"
                                        onClick={() => removeImage(idx)}
                                        className="absolute top-0 right-0 w-11 h-11 flex items-start justify-end p-1"
                                        title={t("createPost.removePhoto")}
                                        aria-label={t("createPost.removePhoto")}
                                    >
                                        <span className="w-6 h-6 rounded-full bg-surface-1 text-ink-1 shadow-sm flex items-center justify-center">
                                            <LucideX className="w-3.5 h-3.5" />
                                        </span>
                                    </button>
                                </div>
                            ))}
                            {/* 올리는 중인 사진 자리 */}
                            {uploading && Array.from({ length: uploading.total - uploading.done }, (_, i) => (
                                <div key={`up-${i}`} className="w-24 h-24 rounded-tile bg-surface-3 animate-pulse flex items-center justify-center" aria-hidden="true">
                                    <LucideLoader2 className="w-5 h-5 text-ink-3 animate-spin" />
                                </div>
                            ))}
                            {images.length + (uploading ? uploading.total - uploading.done : 0) < MAX_IMAGES && (
                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={!!uploading}
                                    className="w-24 h-24 rounded-tile border-2 border-dashed border-surface-line flex flex-col items-center justify-center gap-1 text-ink-3 active:bg-surface-3 disabled:opacity-50"
                                >
                                    <LucideCamera className="w-6 h-6" />
                                    <span className="text-[12px] font-medium rk-num">
                                        {uploading ? `${uploading.done}/${uploading.total}` : t("createPost.addPhoto")}
                                    </span>
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

                    {isAdmin && category !== CREW_NOTICE_CATEGORY && (
                        <label className="flex items-center justify-between gap-3 p-4 rounded-tile bg-surface-3 cursor-pointer">
                            <span className="space-y-0.5">
                                <span className="block text-[15px] font-semibold text-ink-1">{t("createPost.registerAsNotice")}</span>
                                <span className="block text-[12px] font-medium text-ink-3">{t("createPost.noticeHint")}</span>
                            </span>
                            <Switch checked={isNotice} onCheckedChange={setIsNotice} />
                        </label>
                    )}
                </div>

                <div className="px-5 pt-3 pb-[max(20px,env(safe-area-inset-bottom))] border-t border-surface-line space-y-2">
                    {error && <p role="alert" className="text-[13px] font-medium text-destructive">{error}</p>}
                    <button type="button" onClick={handleSubmit} disabled={busy} className={cn(CREW_BTN.primary, "w-full")}>
                        {saveMutation.isPending
                            ? (isEdit ? t("crewPost.saving") : t("createPost.submitting"))
                            : (isEdit ? t("crewPost.save") : t("createPost.submit"))}
                    </button>
                </div>
                {/* 닫기 — 기본 X(32px 굵은 선) 대신 44px 아이콘 버튼 */}
                <IconButton label={t("crewPost.close")} onClick={() => onOpenChange(false)} className="absolute right-2 top-2">
                    <LucideX />
                </IconButton>
            </DialogContent>
        </Dialog>
    );
}
