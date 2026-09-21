import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LucideUserX, LucideUndo2, LucideLoader2, LucideCheck, LucideX } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { kstDateLabel, kstTime } from "@/lib/kst";

/**
 * 내가 올린 조인 글에 **누가 신청했는지**, 그리고 안 나타난 사람 표시.
 *
 * 왜 필요했나: 신청은 기록으로 쌓기 시작했는데(2026-09-09) 그걸 볼 화면이 없어서 글쓴이는 여전히
 * 누가 오는지 몰랐다. 그리고 조인의 진짜 문제는 노쇼인데, 안 왔다는 사실을 남길 곳이 아무 데도 없었다.
 *
 * 노쇼 표시는 **티타임이 지난 뒤에만** 뜬다. 치기도 전에 찍을 수 있으면 기록이 아니라 협박 수단이 된다.
 * 잘못 눌렀으면 되돌릴 수 있다 — 못 고치면 무서워서 아무도 안 쓴다.
 */

interface Applicant {
    memberId: string;
    status: "applied" | "accepted" | "rejected" | "cancelled" | "noshow";
    headcount?: number;
    appliedAt: string;
    changedAt: string;
    name: string;
    golfGrade?: string | null;
    profileImageUrl?: string | null;
    cancelCount: number;
    noShowCount: number;
}

const STATUS_LABEL: Record<Applicant["status"], string> = {
    applied: "대기",
    accepted: "확정",
    rejected: "거절",
    cancelled: "취소함",
    noshow: "안 옴",
};

const STATUS_STYLE: Record<Applicant["status"], string> = {
    applied: "bg-[#FF6B00]/15 text-[#FF6B00] border-[#FF6B00]/20",
    accepted: "bg-[#64DD17]/15 text-[#8BE84A] border-[#64DD17]/20",
    rejected: "bg-white/5 text-white/40 border-white/10",
    cancelled: "bg-white/5 text-white/40 border-white/10",
    noshow: "bg-red-500/15 text-red-400 border-red-500/20",
};

/** 티타임 몇 시간 전에 물렀는지. 하루 전 취소와 한 시간 전 취소는 전혀 다른 일이다. */
function cancelLead(teeTime?: string, changedAt?: string): string | null {
    if (!teeTime || !changedAt) return null;
    const gapMs = new Date(teeTime).getTime() - new Date(changedAt).getTime();
    if (!Number.isFinite(gapMs)) return null;
    if (gapMs <= 0) return "티타임 지나서 취소";
    const hours = Math.floor(gapMs / 3_600_000);
    if (hours < 1) return "티타임 1시간 안 남기고 취소";
    if (hours < 24) return `티타임 ${hours}시간 전 취소`;
    return `티타임 ${Math.floor(hours / 24)}일 전 취소`;
}

export function JoinApplicants({ bookingId, enabled }: { bookingId: string; enabled: boolean }) {
    const { toast } = useToast();
    const queryClient = useQueryClient();

    const { data, isLoading, isError } = useQuery<{ teeTime: string; applicants: Applicant[] }>({
        enabled,
        // 새 신청이 오면 호스트 화면에 곧 뜨게 — 열려 있는 동안만 8초 폴링
        refetchInterval: enabled ? 8_000 : false,
        refetchOnWindowFocus: true,
        staleTime: 3_000,
        queryKey: ["/api/hiq/golf/bookings", bookingId, "applicants"],
        queryFn: () => apiRequest(`/api/hiq/golf/bookings/${bookingId}/applicants`),
    });

    const noShowMutation = useMutation({
        mutationFn: ({ memberId, noShow }: { memberId: string; noShow: boolean }) =>
            apiRequest(`/api/hiq/golf/bookings/${bookingId}/applicants/${memberId}/noshow`, {
                method: "POST",
                body: { noShow },
            }),
        onSuccess: (_d, v) => {
            toast({ title: v.noShow ? "안 옴으로 표시했어요" : "표시를 되돌렸어요" });
            queryClient.invalidateQueries({ queryKey: ["/api/hiq/golf/bookings", bookingId, "applicants"] });
            queryClient.invalidateQueries({ queryKey: ["/api/hiq/golf/joins"] });
        },
        onError: (e: any) => toast({ title: e?.message || "표시하지 못했어요", variant: "destructive" }),
    });

    // 호스트 승인제(2026-09-21 오너). 승인은 정원 안에서만 — 넘치면 서버가 409 로 막는다.
    const decideMutation = useMutation({
        mutationFn: ({ memberId, accept }: { memberId: string; accept: boolean }) =>
            apiRequest(`/api/hiq/golf/bookings/${bookingId}/applicants/${memberId}/decision`, { method: "POST", body: { accept } }),
        onSuccess: (_d, v) => {
            toast({ title: v.accept ? "확정했어요 — 신청한 분께 알렸어요" : "거절했어요" });
            queryClient.invalidateQueries({ queryKey: ["/api/hiq/golf/bookings", bookingId, "applicants"] });
            queryClient.invalidateQueries({ queryKey: ["/api/hiq/golf/bookings"] }); // mine·applied 도 이 접두로 같이 새로
            queryClient.invalidateQueries({ queryKey: ["/api/hiq/golf/joins"] }); // 조인 탭 목록은 키가 다르다
        },
        onError: (e: any) => toast({ title: e?.message || "처리하지 못했어요", variant: "destructive" }),
    });

    if (!enabled) return null;

    const teePassed = !!data?.teeTime && new Date(data.teeTime).getTime() <= Date.now();
    const applicants = data?.applicants ?? [];
    const pendingCount = applicants.filter((a) => a.status === "applied").length;
    const acceptedCount = applicants.filter((a) => a.status === "accepted" || a.status === "noshow").length;

    return (
        <div className="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-3">
            <div className="flex items-center justify-between">
                <div className="text-[10px] font-black text-white/20 uppercase tracking-widest">
                    신청자
                </div>
                <div className="text-[10px] font-black text-[#FF6B00]">
                    {isLoading ? "…" : `확정 ${acceptedCount} · 대기 ${pendingCount}`}
                </div>
            </div>

            {isLoading ? (
                <div className="flex items-center gap-2 py-2 text-white/30">
                    <LucideLoader2 className="w-3.5 h-3.5 animate-spin" />
                    <span className="text-[11px] font-bold">불러오는 중…</span>
                </div>
            ) : isError ? (
                <p className="text-[11px] font-bold text-white/30 py-1">신청자를 불러오지 못했어요.</p>
            ) : applicants.length === 0 ? (
                <p className="text-[11px] font-bold text-white/30 py-1">아직 신청한 사람이 없어요.</p>
            ) : (
                <ul className="space-y-2">
                    {applicants.map((a) => {
                        const lead = a.status === "cancelled" ? cancelLead(data?.teeTime, a.changedAt) : null;
                        const history = [
                            a.noShowCount > 0 ? `노쇼 ${a.noShowCount}회` : null,
                            a.cancelCount > 0 ? `취소 ${a.cancelCount}회` : null,
                        ].filter(Boolean).join(" · ");

                        return (
                            <li key={a.memberId} className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-white/10 overflow-hidden flex items-center justify-center text-[11px] font-black text-white/60 shrink-0">
                                    {a.profileImageUrl
                                        ? <img src={a.profileImageUrl} alt="" className="w-full h-full object-cover" />
                                        : (a.name?.charAt(0) ?? "?")}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-[13px] font-bold text-white truncate">{a.name}</span>
                                        {Number(a.headcount) > 1 && <span className="text-[11px] font-medium text-white/60 shrink-0">{a.headcount}명</span>}
                                        <span className={cn("px-1.5 py-0.5 rounded border text-[9px] font-black shrink-0", STATUS_STYLE[a.status])}>
                                            {STATUS_LABEL[a.status]}
                                        </span>
                                    </div>
                                    <div className="text-[10px] font-bold text-white/30 truncate">
                                        {lead ?? `${kstDateLabel(a.appliedAt)} ${kstTime(a.appliedAt)} 신청`}
                                        {history && <span className="text-white/20"> · {history}</span>}
                                    </div>
                                </div>

                                {/* 티타임 전: 대기 중인 신청에 승인·거절. 티타임 뒤: 확정된 사람에게 노쇼 표시. */}
                                {!teePassed && a.status === "applied" && (
                                    <span className="shrink-0 flex gap-1.5">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); decideMutation.mutate({ memberId: a.memberId, accept: true }); }}
                                            disabled={decideMutation.isPending}
                                            className="h-8 px-3 rounded-xl bg-[#64DD17] text-[#051907] text-[12px] font-semibold flex items-center gap-1 disabled:opacity-40"
                                        ><LucideCheck className="w-3.5 h-3.5" />승인</button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); decideMutation.mutate({ memberId: a.memberId, accept: false }); }}
                                            disabled={decideMutation.isPending}
                                            className="h-8 px-2.5 rounded-xl bg-white/5 border border-white/10 text-white/60 text-[12px] font-medium flex items-center gap-1 disabled:opacity-40"
                                        ><LucideX className="w-3.5 h-3.5" />거절</button>
                                    </span>
                                )}
                                {teePassed && (a.status === "accepted" || a.status === "noshow") && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            noShowMutation.mutate({ memberId: a.memberId, noShow: a.status !== "noshow" });
                                        }}
                                        disabled={noShowMutation.isPending}
                                        className={cn(
                                            "shrink-0 h-8 px-2.5 rounded-xl border text-[10px] font-black flex items-center gap-1 transition-colors disabled:opacity-40",
                                            a.status === "noshow"
                                                ? "bg-white/5 border-white/10 text-white/60 hover:bg-white/10"
                                                : "bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20",
                                        )}
                                    >
                                        {a.status === "noshow"
                                            ? <><LucideUndo2 className="w-3 h-3" />되돌리기</>
                                            : <><LucideUserX className="w-3 h-3" />안 옴</>}
                                    </button>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}

            {!teePassed && applicants.length > 0 && (
                <p className="text-[10px] font-bold text-white/20">
                    안 온 사람 표시는 티타임이 지난 뒤에 할 수 있어요.
                </p>
            )}
        </div>
    );
}

export default JoinApplicants;
