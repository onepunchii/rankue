import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/lib/i18n";
import { invalidateCommunityPosts } from "./types";

// 신고 다이얼로그 — 모든 UGC 표면에서 재사용 (Apple 1.2 / Play UGC 필수).
// 차단 버튼도 함께 제공: 신고와 차단이 한 동선에 있어야 심사 요건을 채운다.
export type ReportTargetType =
    | "community_post" | "community_comment" | "member" | "golf_booking"
    | "crew_post" | "crew_comment" | "crew_photo" | "crew_photo_comment" | "crew_chat"
    | "player_cheer";   // 선수 응원글(2026-09-13)

interface ReportDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    targetType: ReportTargetType;
    targetId: string;
    targetAuthorId?: string; // 차단 대상 (본인 콘텐츠면 undefined로 숨김)
    targetAuthorName?: string;
    // 크루 콘텐츠(crew_*)는 크루 신고 API 로 보낸다 — 서버가 대상이 이 크루 것인지 확인한다
    crewId?: string;
    onBlocked?: () => void; // 차단 직후 상세 시트·다이얼로그를 닫을 때
}

const REASONS = ["abuse", "gambling", "trade", "privacy", "spam", "other"] as const;

const isCrewTarget = (t: ReportTargetType) => t.startsWith("crew_");

// 크루·회원 신고는 자동 블라인드가 없다(운영자 검토 큐) — "3명이 신고하면 블라인드" 안내를 쓰면 거짓말이 된다
const usesReviewQueue = (t: ReportTargetType) => isCrewTarget(t) || t === "member";

// 차단·차단 해제 뒤 다시 불러올 목록 — 커뮤니티 글, 크루 글·댓글·사진·채팅, 차단 목록.
// 크루 쿼리 키는 전부 `/api/hiq/crews/<id>/...` 라 접두어로 한 번에 무효화한다.
export const invalidateAfterBlock = (queryClient: QueryClient) => {
    invalidateCommunityPosts(queryClient);
    queryClient.invalidateQueries({
        predicate: (q) => typeof q.queryKey?.[0] === "string" && (q.queryKey[0] as string).startsWith("/api/hiq/crews/"),
    });
    queryClient.invalidateQueries({ queryKey: ["/api/hiq/community/blocks"] });
};

// 차단 한 동작 — 신고 다이얼로그와 ⋯ 메뉴(UgcActionMenu)가 같이 쓴다
export function useBlockMember(onDone?: () => void) {
    const { t } = useT();
    const { toast } = useToast();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (memberId: string) => apiRequest("/api/hiq/community/blocks", {
            method: "POST",
            body: { memberId },
        }),
        onSuccess: () => {
            toast({ title: t("community.blocked") });
            invalidateAfterBlock(queryClient);
            onDone?.();
        },
        onError: (e: any) => toast({ title: e?.message || t("community.error"), variant: "destructive" }),
    });
}

// 차단 확인 문구 — 크루·회원 표면에서는 사진·채팅까지 가려진다는 걸 알린다
export const blockConfirmText = (t: (k: string) => string, targetType: ReportTargetType, name?: string) =>
    t(usesReviewQueue(targetType) ? "community.blockConfirmCrew" : "community.blockConfirm")
        .replace("{name}", name || t("community.thisUser"));

export const ReportDialog = ({ open, onOpenChange, targetType, targetId, targetAuthorId, targetAuthorName, crewId, onBlocked }: ReportDialogProps) => {
    const { t } = useT();
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [reason, setReason] = useState<string | null>(null);

    const reportMutation = useMutation({
        mutationFn: async () => {
            if (isCrewTarget(targetType) && !crewId) throw new Error(t("community.error"));
            return apiRequest(isCrewTarget(targetType) ? `/api/hiq/crews/${crewId}/reports` : "/api/hiq/community/reports", {
                method: "POST",
                body: { targetType, targetId, reason },
            });
        },
        onSuccess: () => {
            toast({ title: t("community.reportDone") });
            onOpenChange(false);
            setReason(null);
            invalidateCommunityPosts(queryClient);
        },
        onError: (e: any) => toast({ title: e?.message || t("community.error"), variant: "destructive" }),
    });

    const blockMutation = useBlockMember(() => {
        onOpenChange(false);
        onBlocked?.();
    });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-white text-ink-1 max-w-md w-[92%] rounded-[28px] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.18)]">
                <DialogHeader className="text-left mb-1">
                    <DialogTitle className="text-[19px] font-bold text-ink-1">{t("community.reportTitle")}</DialogTitle>
                    <DialogDescription className="text-[12.5px] font-medium text-black/55">
                        {t(usesReviewQueue(targetType) ? "community.reportDescReview" : "community.reportDesc")}
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
                            if (window.confirm(blockConfirmText(t, targetType, targetAuthorName))) {
                                blockMutation.mutate(targetAuthorId);
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
