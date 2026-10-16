/**
 * 어드민 · 낚시 › 장식(2026-10-17 어드민 전수 조사 — "금 닻(99)은 기록만 적으면 받는다").
 * 수족관 장식을 가진 사람마다 맞춰 보기 — 지금 기록(가린 조과는 빼고)이 받쳐 주지 않는 장식만 거둔다(shared/fishingDecorAudit, 큐 케이스와 같은 선).
 * 가짜 기록이 의심되면 '조과 검수'에서 그 조과를 가린 뒤 여기서 거둔다. 한정(금 닻)을 가진 사람에겐 근거(한 해 어종 · 사진 · 날)를 붙인다.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { appConfirm } from "@/components/AppDialog";
import { decorImage } from "@shared/fishingDecor";
import { canTakeBackDecor, type DecorAuditMember, type DecorAuditSweep } from "@shared/fishingDecorAudit";
import { EmptyState, FilterChips, KpiTile, Panel, Pill, kstDate } from "./adminUtils";

const KEY = "/api/hiq/admin/fishing/decor-audit";
const no = (n: number) => `No.${String(n).padStart(2, "0")}`;

function MemberDecor({ m, onOpenMember, onDone }: { m: DecorAuditMember; onOpenMember?: (id: string) => void; onDone: () => void }) {
    const { toast } = useToast();
    const bad = m.rows.filter(canTakeBackDecor);
    const [picked, setPicked] = useState<Set<string>>(() => new Set(bad.map((r) => r.itemId)));
    const [reason, setReason] = useState("");
    const take = useMutation({
        mutationFn: () => apiRequest(`/api/hiq/admin/fishing/decor/${m.memberId}/take-back`, { method: "POST", body: { itemIds: [...picked], reason } }),
        onSuccess: (d: any) => { toast({ title: `${Array.isArray(d?.taken) ? d.taken.length : 0}개를 거뒀어요` }); setReason(""); onDone(); },
        onError: (e: any) => toast({ title: e?.message || "거두지 못했어요", variant: "destructive" }),
    });
    return (
        <div className="mt-3 rounded-2xl bg-black/[0.03] p-3" data-testid="admin-decor-detail">
            {m.evidence && (
                <p className="mb-2 text-[12.5px] text-black/65">한정 장식의 근거 — 한 해 어종 <b>{m.evidence.yearSpecies}</b>종 · 사진 있는 기록 <b>{m.evidence.photos}</b> / {m.evidence.catches} · 기록한 날 <b>{m.evidence.days}</b>일</p>
            )}
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
                {m.rows.map((r) => {
                    const off = canTakeBackDecor(r), on = picked.has(r.itemId);
                    return (
                        <button key={r.itemId} type="button" disabled={!off} onClick={() => setPicked((p) => { const n = new Set(p); if (n.has(r.itemId)) n.delete(r.itemId); else n.add(r.itemId); return n; })}
                            className={`flex min-w-0 flex-col items-center rounded-xl border p-2 ${off ? (on ? "border-red-500 bg-red-50" : "border-red-300 bg-white") : "cursor-default border-black/[0.06] bg-white"}`} data-testid={off ? "admin-decor-bad" : undefined}>
                            <img src={decorImage(r.itemId, true)} alt="" loading="lazy" draggable={false} className="h-12 w-12 object-contain" />
                            <span className="mt-1 w-full truncate text-center text-[12px] font-black text-black/80">{r.name}</span>
                            <span className="text-[11.5px] tabular-nums text-black/45">{no(r.serial)} · {kstDate(r.earnedAt)}</span>
                            <span className={`text-[11.5px] font-bold ${off ? "text-red-600" : r.granted ? "text-black/40" : "text-brand"}`}>{off ? (on ? "거둘 것" : "남겨 둠") : r.granted ? "운영자 증정" : "기록이 받쳐 줌"}</span>
                        </button>
                    );
                })}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
                {onOpenMember && <button type="button" onClick={() => onOpenMember(m.memberId)} className="text-[12px] font-bold text-brand">회원 보기</button>}
            </div>
            {bad.length > 0 && (
                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                    <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="거두는 까닭(작업 기록에 남아요)" className="h-9 text-[13px]" />
                    <Button data-admin-write variant="outline" disabled={!reason.trim() || picked.size === 0 || take.isPending}
                        onClick={async () => { if (await appConfirm({ message: `${m.name}님의 수족관 장식 ${picked.size}개를 거둘까요?\n\n지금 기록이 받쳐 주지 않는 것만 거둡니다. 한정이면 그 번호는 비어요.`, tone: "danger", confirmText: "거두기" })) take.mutate(); }}
                        className="h-9 shrink-0 border-red-500/40 text-[13px] font-bold text-red-600 hover:bg-red-50">{picked.size}개 거두기</Button>
                </div>
            )}
        </div>
    );
}

export default function FishingDecorAuditView({ onOpenMember }: { onOpenMember?: (id: string) => void }) {
    const qc = useQueryClient();
    const q = useQuery<DecorAuditSweep>({ queryKey: [KEY] });
    const [open, setOpen] = useState<string | null>(null);
    const [view, setView] = useState<"all" | "bad" | "limited">("all");
    const members = Array.isArray(q.data?.members) ? q.data!.members : [];
    const limited = Array.isArray(q.data?.limited) ? q.data!.limited : [];
    const shown = members.filter((m) => (view === "bad" ? m.unsupported > 0 : view === "limited" ? !!m.evidence : true));
    if (q.isLoading) return <EmptyState>장식을 하나씩 맞춰 보는 중…</EmptyState>;
    return (
        <div className="space-y-4" data-testid="admin-fishing-decor">
            <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
                <KpiTile label="장식을 가진 사람" value={members.length} unit="명" onClick={() => setView("all")} />
                <KpiTile label="받은 장식" value={members.reduce((s, m) => s + m.rows.length, 0)} unit="개" tone="brand" />
                <KpiTile label="기록이 받쳐 주지 않음" value={members.reduce((s, m) => s + m.unsupported, 0)} unit="개" tone={members.some((m) => m.unsupported) ? "alert" : "default"} onClick={() => setView("bad")} />
                {limited.map((l) => <KpiTile key={l.itemId} label={`한정 · ${l.name}`} value={l.given} unit={`/ ${l.limit}`} onClick={() => setView("limited")} />)}
            </div>
            <div className="flex flex-wrap items-center gap-2">
                <div className="shrink-0"><FilterChips value={view} onChange={setView} options={[{ id: "all", label: "모든 사람" }, { id: "bad", label: "받쳐 주지 않음", alert: true, count: members.filter((m) => m.unsupported).length }, { id: "limited", label: "한정 장식 가진 사람", count: members.filter((m) => m.evidence).length }]} /></div>
            </div>
            <p className="text-[12px] leading-snug text-black/45">장식은 조과 기록으로만 받아요(스스로 적는 기록). 가짜 기록이 의심되면 '조과 검수'에서 그 조과를 가리세요 — 가린 조과는 장식을 받쳐 주지 않게 되고, 그때 여기서 거둘 수 있어요. 운영자가 증정한 것은 '굿즈 · 배지'에서 회수합니다.</p>
            {shown.length === 0 ? <EmptyState>{view === "bad" ? "모든 장식이 지금 기록과 맞아요." : "아직 장식을 받은 사람이 없어요."}</EmptyState> : (
                <Panel className="divide-y divide-black/[0.06]">
                    {shown.map((m) => (
                        <div key={m.memberId} className="px-4 py-3">
                            <button type="button" onClick={() => setOpen(open === m.memberId ? null : m.memberId)} className="flex w-full items-center gap-3 text-left" data-testid="admin-decor-row">
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-[13.5px] font-black">{m.name}</span>
                                    <span className="block text-[12px] text-black/45">장식 {m.rows.length}개{m.evidence ? ` · 한 해 어종 ${m.evidence.yearSpecies}종` : ""}</span>
                                </span>
                                {m.evidence && <Pill tone="info">한정</Pill>}
                                {m.unsupported > 0 ? <Pill tone="alert">받쳐 주지 않음 {m.unsupported}</Pill> : <Pill tone="brand">모두 맞음</Pill>}
                            </button>
                            {open === m.memberId && <MemberDecor key={m.rows.map((r) => r.itemId).join(",")} m={m} onOpenMember={onOpenMember} onDone={() => void qc.invalidateQueries({ queryKey: [KEY] })} />}
                        </div>
                    ))}
                </Panel>
            )}
        </div>
    );
}
