import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/lib/i18n";
import { LucideUserX } from "@/lib/icons";
import { invalidateAfterBlock } from "./ReportDialog";

// 설정 > 차단한 사용자 — 차단은 되돌릴 수 있어야 한다(실수로 누른 차단, 화해).
// 커뮤니티·크루 어디서 차단했든 hiqBlocks 한 테이블이라 목록도 하나다.
interface BlockedMember {
    id: string;
    name: string | null;
    blockedAt: string;
}

export function BlockedMembersSection() {
    const { t } = useT();
    const { toast } = useToast();
    const queryClient = useQueryClient();

    const { data, isLoading, isError } = useQuery<BlockedMember[]>({
        queryKey: ["/api/hiq/community/blocks"],
        staleTime: 0, // 다른 화면에서 방금 차단한 사람이 바로 보여야 한다(쿼리 캐시가 localStorage 에 남는다)
        retry: false,
    });

    const unblock = useMutation({
        mutationFn: async (memberId: string) => apiRequest(`/api/hiq/community/blocks/${memberId}`, { method: "DELETE" }),
        onSuccess: () => {
            toast({ title: t("settings.unblocked") });
            invalidateAfterBlock(queryClient);
        },
        onError: (e: any) => toast({ title: e?.message || t("community.error"), variant: "destructive" }),
    });

    // 목록을 못 읽으면(비로그인 등) 섹션만 숨긴다 — 설정 화면 전체가 깨지면 안 된다
    if (isError) return null;
    const list = data ?? [];

    return (
        <section className="rk-card p-5">
            <div className="flex items-center gap-2 mb-1">
                <LucideUserX className="w-4 h-4 text-brand" />
                <h2 className="text-[15px] font-bold">{t("settings.blockedTitle")}</h2>
            </div>
            <p className="text-[12px] text-black/45 mb-4">{t("settings.blockedDesc")}</p>
            {isLoading ? null : list.length === 0 ? (
                <p className="h-12 px-4 flex items-center bg-black/[0.03] rounded-tile text-[13px] text-black/45">
                    {t("settings.blockedEmpty")}
                </p>
            ) : (
                <div className="space-y-2">
                    {list.map((m) => (
                        <div key={m.id} className="flex items-center justify-between gap-3 h-12 pl-4 pr-2 bg-black/[0.03] rounded-tile">
                            <span className="text-[14px] font-medium truncate">{m.name || t("community.thisUser")}</span>
                            <button
                                disabled={unblock.isPending}
                                onClick={() => unblock.mutate(m.id)}
                                className="shrink-0 h-8 px-3 rounded-full bg-white border border-black/[0.08] text-[12.5px] font-semibold text-ink-2 active:scale-[0.97] transition-transform disabled:opacity-40"
                            >
                                {t("settings.unblock")}
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
}
