/**
 * 어드민 · 낚시 › 랭킹 점검(2026-10-17 어드민 전수 조사 — "400cm · 999마리 · 300kg 까지 통과한다").
 * 어종마다 큰 순 100줄 — 지금 랭킹에 오른 줄(사람마다 가장 좋은 한 줄) · 같은 사람의 다른 줄 · 뺀 줄 · 가린 줄을 함께.
 * 맨 위 단계를 훨씬 넘는 값은 '다시 볼 것'(shared/fishingRankAudit — 어종의 크기를 지어 쓰지 않고 이미 있는 단계만 쓴다).
 * '랭킹에서 빼기'는 위반 처리가 아니다 — 일지 · 수족관에는 그대로 두고, 올린 사람에게 다시 적으라는 안내만 간다. 위반은 '조과 검수'의 가리기다.
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { appConfirm } from "@/components/AppDialog";
import { FISH_UNIT_LABEL } from "@shared/fishingFish";
import type { AdminRankBoard, AdminRankRow, AdminRankSpecies } from "@shared/fishingRankAudit";
import { EmptyState, FilterChips, Panel, Pill, kstDateTime } from "./adminUtils";

const BASE = "/api/hiq/admin/fishing";

export default function FishingRankAuditView({ onOpenMember }: { onOpenMember?: (id: string) => void }) {
    const { toast } = useToast();
    const qc = useQueryClient();
    const species = useQuery<AdminRankSpecies[]>({ queryKey: [`${BASE}/ranking/species`] });
    const list = Array.isArray(species.data) ? species.data : [];
    const [pick, setPick] = useState<string>("");
    useEffect(() => { if (!pick && list[0]) setPick(list[0].species); }, [list, pick]);
    const board = useQuery<AdminRankBoard>({ queryKey: [`${BASE}/ranking`, { species: pick }], enabled: !!pick });
    const [open, setOpen] = useState<string | null>(null);
    const [reason, setReason] = useState("");
    const [notify, setNotify] = useState(true);

    // 지금 랭킹에 오른 줄 — 사람마다 가장 좋은 한 줄(뺀 줄 · 가린 줄은 건너뛴다). 서버의 랭킹과 같은 셈
    const ranked = useMemo(() => {
        const out = new Map<string, number>();
        const seen = new Set<string>();
        let n = 0;
        for (const r of board.data?.rows ?? []) {
            if (r.voided || r.hidden || seen.has(r.memberId)) continue;
            seen.add(r.memberId); out.set(r.catchId, ++n);
        }
        return out;
    }, [board.data]);
    const unit = board.data ? FISH_UNIT_LABEL[board.data.unit] : "";

    const act = useMutation({
        mutationFn: (v: { row: AdminRankRow; kind: "rank-void" | "rank-restore" }) => apiRequest(`${BASE}/catches/${v.row.catchId}/${v.kind}`, { method: "POST", body: { reason, notify } }),
        onSuccess: (_d, v) => { toast({ title: v.kind === "rank-void" ? "랭킹에서 뺐어요" : "랭킹에 되돌렸어요" }); setOpen(null); setReason(""); void qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0] ?? "").startsWith(`${BASE}/ranking`) }); },
        onError: (e: any) => toast({ title: e?.message || "처리하지 못했어요", variant: "destructive" }),
    });

    if (species.isLoading) return <EmptyState>불러오는 중…</EmptyState>;
    if (!list.length) return <EmptyState>아직 공개 조과가 있는 랭킹 어종이 없어요.</EmptyState>;
    return (
        <div className="space-y-3" data-testid="admin-fishing-rank">
            <div className="min-w-0 max-w-full">
                <FilterChips value={pick} onChange={(v) => { setPick(v); setOpen(null); }} options={list.map((s) => ({ id: s.species, label: s.species, count: s.people, alert: s.review > 0 }))} />
            </div>
            <p className="text-[12px] leading-snug text-black/45">맨 위 단계(어종마다의 '짜' · 수 · 킬로 · 지)를 훨씬 넘는 값에 '다시 볼 것'이 붙어요. 랭킹에서 빼도 올린 사람의 일지 · 수족관에는 그대로 있고, 다시 적으라는 안내만 갑니다. 위반이면 '조과 검수'에서 가리세요.</p>
            {board.isLoading ? <EmptyState>불러오는 중…</EmptyState> : !board.data?.rows.length ? <EmptyState>기록이 없어요.</EmptyState> : (
                <Panel className="divide-y divide-black/[0.06]">
                    {board.data.rows.map((r) => {
                        const rank = ranked.get(r.catchId);
                        return (
                            <div key={r.catchId} className={`px-4 py-2.5 ${r.voided || r.hidden ? "bg-black/[0.02]" : ""}`}>
                                <button type="button" onClick={() => { setOpen(open === r.catchId ? null : r.catchId); setReason(""); setNotify(true); }} className="flex w-full items-center gap-3 text-left" data-testid="admin-fishing-rank-row">
                                    <span className={`w-7 shrink-0 text-right text-[13px] font-black tabular-nums ${rank ? "text-black/70" : "text-black/25"}`}>{rank ?? "–"}</span>
                                    {r.thumbUrl ? <img src={r.thumbUrl} alt="" loading="lazy" className="h-9 w-12 shrink-0 rounded-md object-cover" /> : <span className="h-9 w-12 shrink-0 rounded-md bg-black/[0.05]" aria-hidden />}
                                    <span className={`min-w-0 flex-1 ${r.voided || r.hidden ? "opacity-60" : ""}`}>
                                        <span className="flex flex-wrap items-center gap-x-1.5 text-[13.5px]"><b className="font-black">{r.name}</b>{!rank && !r.voided && !r.hidden && <span className="text-[11.5px] text-black/40">같은 사람의 다른 기록</span>}{r.voided && <Pill tone="neutral">랭킹에서 뺌</Pill>}{r.hidden && <Pill tone="warn">가림</Pill>}</span>
                                        <span className="block text-[12px] text-black/45">{r.day} · {r.place}</span>
                                        {r.review && <span className="mt-1 inline-block rounded-md bg-red-500/10 px-1.5 py-0.5 text-[12px] font-bold text-red-700">{r.review.text}</span>}
                                    </span>
                                    <span className="shrink-0 text-[16px] font-black tabular-nums">{r.value}<span className="text-[12px] text-black/45">{unit}</span></span>
                                </button>
                                {open === r.catchId && (
                                    <div className="mt-2 space-y-2 rounded-xl bg-black/[0.03] p-3" data-testid="admin-fishing-rank-detail">
                                        {r.voided && <p className="text-[12.5px] text-black/60">뺀 까닭 — {r.voided.reason} · {r.voided.by} {kstDateTime(r.voided.at)}</p>}
                                        {onOpenMember && <button type="button" onClick={() => onOpenMember(r.memberId)} className="text-[12px] font-bold text-brand">회원 보기</button>}
                                        {!r.voided && (
                                            <label className="flex items-center gap-2 text-[12.5px] text-black/65">
                                                <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="h-4 w-4 accent-[#0a6b3f]" />
                                                올린 사람에게 '잘못 적었다면 다시 적어 주세요' 알림 보내기
                                            </label>
                                        )}
                                        <div className="flex flex-col gap-2 sm:flex-row">
                                            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={r.voided ? "되돌리는 까닭" : "빼는 까닭(예: 단위를 잘못 적은 듯)"} className="h-9 text-[13px]" />
                                            <Button data-admin-write variant="outline" disabled={!reason.trim() || act.isPending} className={`h-9 shrink-0 text-[13px] font-bold ${r.voided ? "" : "border-red-500/40 text-red-600 hover:bg-red-50"}`}
                                                onClick={async () => { if (await appConfirm({ message: r.voided ? `${r.name}님의 ${r.value}${unit} 기록을 랭킹에 되돌릴까요?` : `${r.name}님의 ${r.value}${unit} 기록을 랭킹에서 뺄까요?\n\n일지 · 수족관에는 그대로 남아요.`, tone: r.voided ? "default" : "danger", confirmText: r.voided ? "되돌리기" : "랭킹에서 빼기" })) act.mutate({ row: r, kind: r.voided ? "rank-restore" : "rank-void" }); }}>
                                                {r.voided ? "랭킹에 되돌리기" : "랭킹에서 빼기"}
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </Panel>
            )}
        </div>
    );
}
