import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LucideImagePlus, LucideX } from "@/lib/icons";
import { apiRequest } from "@/lib/queryClient";
import { uploadImage } from "@/lib/imageUtils";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/lib/i18n";
import { GameResultCard } from "./GameResultCard";
import { BOARD_KEYS, type CommunityBoard, type CommunityGameCard } from "./types";

interface WritePostDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    board: CommunityBoard; // 열릴 때의 기본 게시판 — 다이얼로그 안에서 변경 가능
}

const ALL_BOARDS: CommunityBoard[] = ["brag", "ask", "store", "lesson"];

interface MyHistoryItem extends CommunityGameCard {
    id: string;
    createdAt: string;
}

// 게시판별 글쓰기.
// - 자랑(brag): 제목 없음(캡션이 곧 제목), 사진 또는 경기결과 카드 중 1개 필수
// - 물어보기(ask): 진입 마찰 0 — 한 줄만 써도 됨. #장비 태그 제공(중고거래 수요 관찰)
// - 우리 매장(store)·레슨(lesson): 최근 30일 경기 기록 매장을 소속 근거로 선택
export const WritePostDialog = ({ open, onOpenChange, board: initialBoard }: WritePostDialogProps) => {
    const { t } = useT();
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [board, setBoard] = useState<CommunityBoard>(initialBoard);
    const [prevInitial, setPrevInitial] = useState(initialBoard);
    if (prevInitial !== initialBoard) {
        setPrevInitial(initialBoard);
        setBoard(initialBoard);
    }

    const [title, setTitle] = useState("");
    const [content, setContent] = useState("");
    const [images, setImages] = useState<string[]>([]);
    const [isUploading, setIsUploading] = useState(false);
    const [historyId, setHistoryId] = useState<string | null>(null);
    const [isPickingResult, setIsPickingResult] = useState(false);
    const [storeId, setStoreId] = useState<string | null>(null);
    const [regionName, setRegionName] = useState("");
    const [tagEquip, setTagEquip] = useState(false);

    const hasTitle = board === "store" || board === "lesson";
    const hasStorePick = board === "store" || board === "lesson";

    const { data: myHistory = [] } = useQuery<MyHistoryItem[]>({
        queryKey: ["/api/hiq/community/my-history"],
        queryFn: async () => apiRequest("/api/hiq/community/my-history"),
        enabled: open && board === "brag",
    });

    const { data: myStores = [] } = useQuery<{ id: string; name: string }[]>({
        queryKey: ["/api/hiq/community/my-stores"],
        queryFn: async () => apiRequest("/api/hiq/community/my-stores"),
        enabled: open && hasStorePick,
    });

    const pickedHistory = myHistory.find(h => h.id === historyId) || null;

    const reset = () => {
        setTitle(""); setContent(""); setImages([]); setHistoryId(null);
        setIsPickingResult(false); setStoreId(null); setRegionName(""); setTagEquip(false);
    };

    const submitMutation = useMutation({
        mutationFn: async () => apiRequest("/api/hiq/community/posts", {
            method: "POST",
            body: {
                board,
                title: hasTitle && title.trim() ? title.trim() : undefined,
                content: content.trim(),
                images,
                historyId: historyId || undefined,
                tags: tagEquip ? ["장비"] : [],
                regionName: regionName.trim() || undefined,
                storeId: storeId || undefined,
            },
        }),
        onSuccess: () => {
            toast({ title: t("community.posted") });
            queryClient.invalidateQueries({ queryKey: ["/api/hiq/community/posts"] });
            reset();
            onOpenChange(false);
        },
        onError: (e: any) => toast({ title: e?.message || t("community.error"), variant: "destructive" }),
    });

    const handleFiles = async (files: FileList | null) => {
        if (!files?.length) return;
        const remain = 3 - images.length;
        const picked = Array.from(files).slice(0, remain);
        if (!picked.length) return;
        setIsUploading(true);
        try {
            // 캔버스 webp 재인코딩을 거치므로 EXIF(GPS 좌표)는 업로드 전에 제거된다
            const urls = await Promise.all(picked.map(f => uploadImage(f, "community", { maxSize: 1280, quality: 0.8 })));
            setImages(prev => [...prev, ...urls].slice(0, 3));
        } catch (e: any) {
            toast({ title: e?.message || t("community.uploadError"), variant: "destructive" });
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    const canSubmit = !!content.trim() && !isUploading && !submitMutation.isPending
        && (board !== "brag" || images.length > 0 || !!historyId);

    return (
        <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
            <DialogContent hideClose className="bg-white text-ink-1 max-w-md w-[92%] max-h-[86vh] overflow-y-auto rounded-[28px] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.18)]">
                <DialogHeader className="text-left mb-2">
                    <DialogTitle className="text-[19px] font-bold text-ink-1">{t(`community.writeTitle.${board}`)}</DialogTitle>
                    <DialogDescription className="text-[12.5px] font-medium text-black/55">
                        {t("community.noChatNotice")}
                    </DialogDescription>
                </DialogHeader>

                <button
                    onClick={() => { reset(); onOpenChange(false); }}
                    className="absolute top-5 right-5 w-9 h-9 rounded-full bg-black/[0.04] flex items-center justify-center hover:bg-black/[0.08] transition-colors"
                    aria-label={t("community.close")}
                >
                    <LucideX className="w-4 h-4 text-black/45" />
                </button>

                <div className="flex flex-col gap-3">
                    {/* 게시판 선택 */}
                    <div className="flex gap-1.5 flex-wrap">
                        {ALL_BOARDS.map(b => (
                            <button
                                key={b}
                                onClick={() => setBoard(b)}
                                className={`h-9 px-3.5 rounded-full text-[13px] font-semibold transition-colors ${board === b ? "bg-ink-1 text-white" : "bg-black/[0.04] text-ink-3 hover:bg-black/[0.07]"}`}
                            >
                                {t(BOARD_KEYS[b])}
                            </button>
                        ))}
                    </div>

                    {hasTitle && (
                        <input
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            maxLength={100}
                            placeholder={t("community.titlePlaceholder")}
                            className="h-12 px-4 rounded-2xl bg-black/[0.03] text-[14.5px] font-semibold text-ink-1 placeholder:text-black/35 placeholder:font-medium outline-none focus:bg-black/[0.05] transition-colors"
                        />
                    )}

                    <textarea
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        maxLength={4000}
                        rows={board === "ask" ? 3 : 5}
                        placeholder={t(`community.contentPlaceholder.${board}`)}
                        className="px-4 py-3.5 rounded-2xl bg-black/[0.03] text-[14.5px] font-medium text-ink-1 placeholder:text-black/35 outline-none focus:bg-black/[0.05] transition-colors resize-none leading-relaxed"
                    />

                    {/* 사진 미리보기 */}
                    {images.length > 0 && (
                        <div className="grid grid-cols-3 gap-1.5">
                            {images.map((url, i) => (
                                <div key={url} className="relative aspect-square">
                                    <img src={url} className="w-full h-full object-cover rounded-xl" alt="" />
                                    <button
                                        onClick={() => setImages(prev => prev.filter((_, j) => j !== i))}
                                        className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/55 flex items-center justify-center"
                                        aria-label={t("community.removePhoto")}
                                    >
                                        <LucideX className="w-3.5 h-3.5 text-white" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* 경기결과 카드 선택 (자랑 전용 — 전적 DB 스냅샷, 위조 불가) */}
                    {pickedHistory && (
                        <div className="relative">
                            <GameResultCard card={pickedHistory} compact />
                            <button
                                onClick={() => setHistoryId(null)}
                                className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/40 flex items-center justify-center"
                                aria-label={t("community.removeResult")}
                            >
                                <LucideX className="w-3.5 h-3.5 text-white" />
                            </button>
                        </div>
                    )}

                    {board === "brag" && isPickingResult && !pickedHistory && (
                        <div className="rounded-2xl bg-black/[0.03] p-3 flex flex-col gap-1.5 max-h-56 overflow-y-auto">
                            <p className="text-[12px] font-semibold text-black/50 px-1">{t("community.resultPickDesc")}</p>
                            {myHistory.length === 0 && (
                                <p className="text-[13px] font-medium text-black/40 px-1 py-2">{t("community.noHistory")}</p>
                            )}
                            {myHistory.map(h => (
                                <button
                                    key={h.id}
                                    onClick={() => { setHistoryId(h.id); setIsPickingResult(false); }}
                                    className="flex items-center justify-between h-11 px-3 rounded-xl bg-white hover:bg-black/[0.02] text-left transition-colors"
                                >
                                    <span className="text-[13px] font-semibold text-ink-1">
                                        {h.gameType === "3c" ? t("community.threeBall") : t("community.fourBall")}
                                        {" · "}{h.isWinner ? t("community.win") : t("community.loss")}
                                        {h.opponentName ? ` · vs ${h.opponentName}` : ""}
                                    </span>
                                    <span className="text-[12px] font-medium text-black/45 tabular-nums">
                                        {new Date(h.createdAt).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })}
                                    </span>
                                </button>
                            ))}
                        </div>
                    )}

                    {/* 우리 매장·레슨: 소속 근거 매장 (최근 30일 경기 기록, GPS 미사용) */}
                    {hasStorePick && (
                        <div className="flex flex-col gap-1.5">
                            <p className="text-[12px] font-semibold text-black/50 px-1">{t("community.storePickDesc")}</p>
                            {myStores.length === 0 ? (
                                <p className="text-[12.5px] font-medium text-black/40 px-1">{t("community.noRecentStore")}</p>
                            ) : (
                                <div className="flex flex-wrap gap-1.5">
                                    {myStores.map(s => (
                                        <button
                                            key={s.id}
                                            onClick={() => setStoreId(storeId === s.id ? null : s.id)}
                                            className={`h-9 px-3.5 rounded-full text-[13px] font-semibold transition-colors ${storeId === s.id ? "bg-brand text-white" : "bg-black/[0.04] text-ink-2 hover:bg-black/[0.07]"}`}
                                        >
                                            {s.name}
                                        </button>
                                    ))}
                                </div>
                            )}
                            <input
                                value={regionName}
                                onChange={(e) => setRegionName(e.target.value)}
                                maxLength={30}
                                placeholder={t("community.regionPlaceholder")}
                                className="h-11 px-4 rounded-2xl bg-black/[0.03] text-[13.5px] font-medium text-ink-1 placeholder:text-black/35 outline-none focus:bg-black/[0.05] transition-colors"
                            />
                        </div>
                    )}

                    {/* 첨부 도구 */}
                    <div className="flex items-center gap-2">
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            multiple
                            className="hidden"
                            onChange={(e) => handleFiles(e.target.files)}
                        />
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={images.length >= 3 || isUploading}
                            className="flex items-center gap-1.5 h-10 px-3.5 rounded-full bg-black/[0.04] text-[13px] font-semibold text-ink-2 hover:bg-black/[0.07] disabled:opacity-40 transition-colors"
                        >
                            <LucideImagePlus className="w-4 h-4" />
                            {isUploading ? t("community.uploading") : `${t("community.attachPhoto")} ${images.length}/3`}
                        </button>
                        {board === "brag" && !pickedHistory && (
                            <button
                                onClick={() => setIsPickingResult(v => !v)}
                                className="flex items-center gap-1.5 h-10 px-3.5 rounded-full bg-brand/10 text-[13px] font-semibold text-brand hover:bg-brand/15 transition-colors"
                            >
                                {t("community.attachResult")}
                            </button>
                        )}
                        {board === "ask" && (
                            <button
                                onClick={() => setTagEquip(v => !v)}
                                className={`h-10 px-3.5 rounded-full text-[13px] font-semibold transition-colors ${tagEquip ? "bg-[#F5B721] text-ink-1" : "bg-[#F5B721]/15 text-[#8a6a0a] hover:bg-[#F5B721]/25"}`}
                            >
                                {t("community.tagEquip")}
                            </button>
                        )}
                    </div>

                    {board === "brag" && !canSubmit && !!content.trim() && !isUploading && (
                        <p className="text-[12px] font-medium text-black/45 px-1">{t("community.bragRule")}</p>
                    )}

                    <button
                        disabled={!canSubmit}
                        onClick={() => submitMutation.mutate()}
                        className="w-full h-12 rounded-full bg-brand text-white text-[15px] font-bold disabled:opacity-40 active:scale-[0.98] transition-transform"
                    >
                        {submitMutation.isPending ? t("community.submitting") : t("community.submit")}
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    );
};
