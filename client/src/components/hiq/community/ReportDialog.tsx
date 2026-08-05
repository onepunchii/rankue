import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/lib/i18n";
import { invalidateCommunityPosts } from "./types";

// 신고 다이얼로그 — 모든 UGC 표면에서 재사용 (Apple 1.2 / Play UGC 필수).
// 차단 버튼도 함께 제공: 신고와 차단이 한 동선에 있어야 심사 요건을 채운다.
interface ReportDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    targetType: "community_post" | "community_comment" | "member";
    targetId: string;
    targetAuthorId?: string; // 차단 대상 (본인 콘텐츠면 undefined로 숨김)
    targetAuthorName?: string;
}

const REASONS = ["abuse", "gambling", "trade", "privacy", "spam", "other"] as const;

export const ReportDialog = ({ open, onOpenChange, targetType, targetId, targetAuthorId, targetAuthorName }: ReportDialogProps) => {
    const { t } = useT();
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [reason, setReason] = useState<string | null>(null);

    const reportMutation = useMutation({
        mutationFn: async () => apiRequest("/api/hiq/community/reports", {
            method: "POST",
            body: { targetType, targetId, reason },
        }),
        onSuccess: () => {
            toast({ title: t("community.reportDone") });
            onOpenChange(false);
            setReason(null);
            invalidateCommunityPosts(queryClient);
        },
        onError: (e: any) => toast({ title: e?.message || t("community.error"), variant: "destructive" }),
    });

    const blockMutation = useMutation({
        mutationFn: async () => apiRequest("/api/hiq/community/blocks", {
            method: "POST",
            body: { memberId: targetAuthorId },
        }),
        onSuccess: () => {
            toast({ title: t("community.blocked") });
            onOpenChange(false);
            invalidateCommunityPosts(queryClient);
        },
        onError: (e: any) => toast({ title: e?.message || t("community.error"), variant: "destructive" }),
    });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-white text-ink-1 max-w-md w-[92%] rounded-[28px] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.18)]">
                <DialogHeader className="text-left mb-1">
                    <DialogTitle className="text-[19px] font-bold text-ink-1">{t("community.reportTitle")}</DialogTitle>
                    <DialogDescription className="text-[12.5px] font-medium text-black/55">
                        {t("community.reportDesc")}
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col gap-1.5 mt-2">
                    {REASONS.map((r) => (
                        <button
                            key={r}
                            onClick={() => setReason(r)}
                            className={`h-11 px-4 rounded-2xl text-left text-[14px] font-semibold transition-colors ${reason === r ? "bg-brand/10 text-brand border border-brand/25" : "bg-black/[0.03] text-ink-2 border border-transparent hover:bg-black/[0.06]"}`}
                        >
                            {t(`community.reportReason.${r}`)}
                        </button>
                    ))}
                </div>

                <button
                    disabled={!reason || reportMutation.isPending}
                    onClick={() => reportMutation.mutate()}
                    className="mt-3 w-full h-12 rounded-full bg-brand text-white text-[15px] font-bold disabled:opacity-40 active:scale-[0.98] transition-transform"
                >
                    {t("community.report")}
                </button>

                {targetAuthorId && (
                    <button
                        disabled={blockMutation.isPending}
                        onClick={() => {
                            if (window.confirm(t("community.blockConfirm").replace("{name}", targetAuthorName || ""))) {
                                blockMutation.mutate();
                            }
                        }}
                        className="w-full h-11 rounded-full text-[13.5px] font-semibold text-red-600/80 hover:bg-red-50 transition-colors"
                    >
                        {t("community.blockUser")}
                    </button>
                )}
            </DialogContent>
        </Dialog>
    );
};
