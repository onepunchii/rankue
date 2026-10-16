/**
 * 어드민 · 당구 › 큐 케이스(2026-10-16 어드민 전수 조사 — "부정 경기를 지워도 그 경기로 받은 큐와 한정 번호는 남는다").
 * 받은 기록을 가진 사람마다 맞춰 보기 — 지금 기록이 그 조건을 받쳐 주는가(shared/cueCaseAudit). 받쳐 주지 않는 줄만 거둔다.
 * 그 순간에만 아는 것(다마 오름 · 넘김) · 고른 한정 큐 · 운영자 증정은 다시 판정할 수 없어 거두지 않는다(증정은 '굿즈 · 배지'에서 회수).
 * 위에는 한정판 번호 현황.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { appConfirm } from "@/components/AppDialog";
import { caseImage, caseItem, type CaseKind } from "@shared/cueCase";
import { ORIGIN_LABEL, canTakeBack, type CaseAuditMember, type CaseAuditRow, type CaseAuditSweep } from "@shared/cueCaseAudit";
import { EmptyState, FilterChips, KpiTile, Panel, Pill, SearchBox, kstDate } from "./adminUtils";

const KEY = ["/api/hiq/admin/billiards/case-audit"] as const;
const KIND_NAME: Record<CaseKind, string> = { cue: "큐", chalk: "초크", glove: "장갑", pennant: "페넌트" };
const KINDS: CaseKind[] = ["cue", "chalk", "glove", "pennant"];
const no = (n: number | null) => (n == null ? "" : `No.${String(n).padStart(2, "0")}`);

function ItemTile({ r, picked, onPick }: { r: CaseAuditRow; picked: boolean; onPick?: () => void }) {
    const x = caseItem(r.itemId);
    const bad = canTakeBack(r);
    return (
        <button type="button" disabled={!bad} onClick={onPick} data-testid={bad ? "admin-case-bad" : undefined}
            className={`flex min-w-0 flex-col rounded-xl border p-2 text-left ${bad ? (picked ? "border-red-500 bg-red-50" : "border-red-300 bg-white") : "border-black/[0.06] bg-white"} ${bad ? "" : "cursor-default"}`}>
            <span className="flex h-10 items-center justify-center">
                {x && <img src={caseImage(x)} alt="" loading="lazy" draggable={false} className={x.kind === "cue" ? "h-[12px] w-full object-contain" : "h-10 w-10 object-contain"} />}
            </span>
            <span className="mt-1 truncate text-[12px] font-black text-black/80">{x?.name.ko ?? r.itemId}</span>
            <span className="truncate text-[11.5px] text-black/45">{r.serial != null && x?.limit ? `${no(r.serial)} · ` : ""}{kstDate(r.earnedAt)}</span>
            <span className={`mt-0.5 truncate text-[11.5px] font-bold ${bad ? "text-red-600" : r.origin === "earned" ? "text-brand" : "text-black/40"}`}>
                {bad ? (picked ? "거둘 것" : "남겨 둠") : r.origin === "earned" ? "기록이 받쳐 줌" : ORIGIN_LABEL[r.origin]}
            </span>
        </button>
    );
}

function MemberCase({ m, onOpenMember, onDone }: { m: CaseAuditMember; onOpenMember?: (id: string) => void; onDone: () => void }) {
    const { toast } = useToast();
    const bad = m.rows.filter(canTakeBack);
    const [picked, setPicked] = useState<Set<string>>(() => new Set(bad.map((r) => r.itemId)));
    const [reason, setReason] = useState("");
    const [kind, setKind] = useState<"all" | CaseKind>("all");
    const take = useMutation({
        mutationFn: () => apiRequest(`/api/hiq/admin/billiards/case/${m.memberId}/take-back`, { method: "POST", body: { itemIds: [...picked], reason } }),
        onSuccess: (d: any) => { toast({ title: `${Array.isArray(d?.taken) ? d.taken.length : 0}개를 거뒀어요` }); setReason(""); onDone(); },
        onError: (e: any) => toast({ title: e?.message || "거두지 못했어요", variant: "destructive" }),
    });
    const shown = m.rows.filter((r) => kind === "all" || caseItem(r.itemId)?.kind === kind).sort((a, b) => Number(canTakeBack(b)) - Number(canTakeBack(a)));
    return (
        <div className="mt-3 rounded-2xl bg-black/[0.03] p-3" data-testid="admin-case-detail">
            <div className="mb-2 flex flex-wrap items-center gap-2">
                <div className="min-w-0 max-w-full"><FilterChips value={kind} onChange={setKind} options={[{ id: "all", label: "전부", count: m.rows.length }, ...KINDS.map((k) => ({ id: k, label: KIND_NAME[k], count: m.rows.filter((r) => caseItem(r.itemId)?.kind === k).length }))]} /></div>
                {onOpenMember && <button type="button" onClick={() => onOpenMember(m.memberId)} className="ml-auto text-[12px] font-bold text-brand">회원 보기</button>}
            </div>
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5 xl:grid-cols-7">
                {shown.map((r) => <ItemTile key={r.itemId} r={r} picked={picked.has(r.itemId)} onPick={() => setPicked((p) => { const n = new Set(p); if (n.has(r.itemId)) n.delete(r.itemId); else n.add(r.itemId); return n; })} />)}
            </div>
            {bad.length > 0 && (
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="거두는 까닭(작업 기록에 남아요)" className="h-9 text-[13px]" />
                    <Button data-admin-write variant="outline" disabled={!reason.trim() || picked.size === 0 || take.isPending}
                        onClick={async () => { if (await appConfirm({ message: `${m.name}님의 큐 케이스에서 ${picked.size}개를 거둘까요?\n\n지금 기록이 조건을 받쳐 주지 않는 것만 거둡니다. 한정판이면 그 번호는 비어요.`, tone: "danger", confirmText: "거두기" })) take.mutate(); }}
                        className="h-9 shrink-0 border-red-500/40 text-[13px] font-bold text-red-600 hover:bg-red-50">{picked.size}개 거두기</Button>
                </div>
            )}
        </div>
    );
}

export default function BilliardsCaseView({ onOpenMember }: { onOpenMember?: (id: string) => void }) {
    const qc = useQueryClient();
    const sweep = useQuery<CaseAuditSweep>({ queryKey: KEY, staleTime: 30_000 });
    const [open, setOpen] = useState<string | null>(null);
    const [view, setView] = useState<"all" | "bad">("all");
    const [q, setQ] = useState("");
    const members = Array.isArray(sweep.data?.members) ? sweep.data!.members : [];
    const limited = Array.isArray(sweep.data?.limited) ? sweep.data!.limited : [];
    const badRows = members.reduce((s, m) => s + m.unsupported, 0);
    const shown = members.filter((m) => (view === "bad" ? m.unsupported > 0 : true)).filter((m) => !q.trim() || m.name.includes(q.trim()));

    if (sweep.isLoading) return <EmptyState>받은 기록을 하나씩 맞춰 보는 중…</EmptyState>;
    return (
        <div className="space-y-4" data-testid="admin-billiards-case">
            <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
                <KpiTile label="가진 사람" value={sweep.data?.total ?? 0} unit="명" onClick={() => setView("all")} />
                <KpiTile label="받은 기록" value={members.reduce((s, m) => s + m.rows.length, 0)} unit="줄" tone="brand" />
                <KpiTile label="기록이 받쳐 주지 않음" value={badRows} unit="줄" tone={badRows ? "alert" : "default"} onClick={() => setView("bad")} />
                <KpiTile label="한정판 나감" value={limited.reduce((s, x) => s + x.given, 0)} unit={`/ ${limited.reduce((s, x) => s + x.limit, 0)}`} sub={`${limited.length}종`} />
            </div>

            <section>
                <h3 className="mb-2 text-[13px] font-black text-black/70">한정판 번호</h3>
                <Panel className="grid grid-cols-2 gap-x-4 gap-y-3 p-3 sm:grid-cols-3 xl:grid-cols-6">
                    {limited.map((l) => {
                        const x = caseItem(l.itemId);
                        return (
                            <div key={l.itemId} className="min-w-0" data-testid="admin-case-limited">
                                <div className="flex items-center gap-1.5">
                                    <span className="min-w-0 flex-1 truncate text-[12px] font-black text-black/75">{x?.name.ko ?? l.itemId}</span>
                                    <span className={`shrink-0 text-[11.5px] font-black tabular-nums ${l.given >= l.limit ? "text-red-600" : "text-black/50"}`}>{l.given}/{l.limit}</span>
                                </div>
                                {x && <img src={caseImage(x)} alt="" loading="lazy" draggable={false} className="mt-1 h-[11px] w-full object-contain object-left" />}
                                <div className="mt-1 h-1 overflow-hidden rounded-full bg-black/[0.07]"><div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, (l.given / Math.max(1, l.limit)) * 100)}%` }} /></div>
                            </div>
                        );
                    })}
                </Panel>
            </section>

            <section>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                    <h3 className="text-[13px] font-black text-black/70">사람마다 맞춰 보기</h3>
                    <div className="shrink-0"><FilterChips value={view} onChange={setView} options={[{ id: "all", label: "모든 사람" }, { id: "bad", label: "받쳐 주지 않음", alert: true, count: members.filter((m) => m.unsupported).length }]} /></div>
                    <SearchBox value={q} onChange={setQ} placeholder="이름" className="w-full sm:ml-auto sm:w-48" />
                </div>
                <p className="mb-2 text-[12px] leading-snug text-black/45">
                    실전 경기를 지우거나 온라인 대전을 무효로 하면 그 판으로 받은 것이 '받쳐 주지 않음'으로 떠요. 경기를 끝낸 순간에 받은 것(다마 오름 · 다마 넘김),
                    고른 한정 큐, 운영자가 증정한 것은 다시 판정할 수 없어 여기서 거두지 않습니다.
                </p>
                {shown.length === 0 ? <EmptyState>{view === "bad" ? "모든 받은 기록이 지금 기록과 맞아요." : "아직 큐 케이스를 받은 사람이 없어요."}</EmptyState> : (
                    <Panel className="divide-y divide-black/[0.06]">
                        {shown.map((m) => (
                            <div key={m.memberId} className="px-4 py-3">
                                <button type="button" onClick={() => setOpen(open === m.memberId ? null : m.memberId)} className="flex w-full items-center gap-3 text-left" data-testid="admin-case-row">
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-[13.5px] font-black">{m.name}</span>
                                        <span className="block text-[12px] text-black/45">{KINDS.map((k) => `${KIND_NAME[k]} ${m.rows.filter((r) => caseItem(r.itemId)?.kind === k).length}`).join(" · ")}</span>
                                    </span>
                                    {m.unsupported > 0 ? <Pill tone="alert">받쳐 주지 않음 {m.unsupported}</Pill> : <Pill tone="brand">모두 맞음</Pill>}
                                </button>
                                {open === m.memberId && <MemberCase key={m.rows.map((r) => r.itemId).join(",")} m={m} onOpenMember={onOpenMember} onDone={() => void qc.invalidateQueries({ queryKey: KEY })} />}
                            </div>
                        ))}
                    </Panel>
                )}
                {sweep.data && sweep.data.total > sweep.data.scanned && <p className="mt-2 text-[12px] text-black/45">받은 기록이 많은 {sweep.data.scanned}명까지만 맞춰 봤어요(전체 {sweep.data.total}명).</p>}
            </section>
        </div>
    );
}
