/**
 * 어드민 · 골프 › 보상 맞춰 보기(2026-10-17 어드민 전수 조사 골프 ③ — "기록을 무효화해도 이미 받은 보상은 남는다").
 * 볼마커 · 트로피 · 핀 · 태그를 받은 사람마다 지금 기록과 맞춰 본다 — 받쳐 주지 않는 것만 거둔다(shared/golfAwardAudit, 큐 케이스 · 장식과 같은 선).
 * 라운드를 '무효화'하거나 '미인증으로' 내린 뒤 여기서 거둔다. 증정한 것은 '굿즈 · 배지'에서 회수한다.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { appConfirm } from "@/components/AppDialog";
import { canTakeBackGolf, type GolfAwardAuditMember, type GolfAwardSweep } from "@shared/golfAwardAudit";
import { EmptyState, FilterChips, KpiTile, Panel, Pill } from "../adminUtils";

const KEY = "/api/hiq/admin/golf/awards";
const no = (n: number) => `No.${String(n).padStart(2, "0")}`;
/** "26.10.17" — 칸이 좁아 한 줄에 들게(한국 날짜) */
const shortDay = (iso: string) => { const t = Date.parse(iso); return Number.isFinite(t) ? new Date(t + 9 * 3600_000).toISOString().slice(2, 10).replace(/-/g, ".") : "-"; };

function MemberAwards({ m, onOpenMember, onDone }: { m: GolfAwardAuditMember; onOpenMember?: (id: string) => void; onDone: () => void }) {
    const { toast } = useToast();
    const bad = m.rows.filter(canTakeBackGolf);
    const [picked, setPicked] = useState<Set<string>>(() => new Set(bad.map((r) => r.id)));
    const [reason, setReason] = useState("");
    const take = useMutation({
        mutationFn: () => apiRequest(`${KEY}/${m.memberId}/take-back`, { method: "POST", body: { ids: [...picked], reason } }),
        onSuccess: (d: any) => { toast({ title: `${Array.isArray(d?.taken) ? d.taken.length : 0}개를 거뒀어요` }); setReason(""); onDone(); },
        onError: (e: any) => toast({ title: e?.message || "거두지 못했어요", variant: "destructive" }),
    });
    return (
        <div className="mt-3 rounded-2xl bg-black/[0.03] p-3" data-testid="admin-golf-award-detail">
            {m.dueNotHeld > 0 && <p className="mb-2 text-[12px] text-black/50">지금 기록으로 받을 것 {m.dueNotHeld}개가 아직 안 적혔어요 — 다음 라운드를 끝낼 때 적힙니다.</p>}
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
                {m.rows.map((r) => {
                    const off = canTakeBackGolf(r), on = picked.has(r.id);
                    return (
                        <button key={r.id} type="button" disabled={!off} onClick={() => setPicked((p) => { const n = new Set(p); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })}
                            className={`flex min-w-0 flex-col items-center rounded-xl border p-2 ${off ? (on ? "border-red-500 bg-red-50" : "border-red-300 bg-white") : "cursor-default border-black/[0.06] bg-white"}`} data-testid={off ? "admin-golf-award-bad" : undefined}>
                            {r.image ? <img src={r.image} alt="" loading="lazy" draggable={false} className="h-12 w-12 object-contain" /> : <span aria-hidden className="h-12 w-12 rounded-full bg-black/[0.05]" />}
                            <span className="mt-1 line-clamp-2 w-full text-center text-[12px] font-black leading-tight text-black/80">{r.name}</span>
                            <span className="text-[11.5px] leading-tight tabular-nums text-black/45">{no(r.serial)}</span>
                            <span className="text-[11.5px] leading-tight tabular-nums text-black/40">{shortDay(r.earnedAt)}</span>
                            <span className={`text-[11.5px] font-bold ${off ? "text-red-600" : r.granted ? "text-black/40" : "text-brand"}`}>{off ? (on ? "거둘 것" : "남겨 둠") : r.granted ? "운영자 증정" : "기록이 받쳐 줌"}</span>
                        </button>
                    );
                })}
            </div>
            {onOpenMember && <button type="button" onClick={() => onOpenMember(m.memberId)} className="mt-2 text-[12px] font-bold text-brand">회원 보기</button>}
            {bad.length > 0 && (
                <div data-admin-write className="mt-2 flex flex-col gap-2 sm:flex-row">
                    <Input value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} placeholder="거두는 까닭(작업 기록에 남아요)" className="h-9 text-[13px]" />
                    <Button data-admin-write variant="outline" disabled={reason.trim().length < 2 || picked.size === 0 || take.isPending}
                        onClick={async () => { if (await appConfirm({ message: `${m.name}님의 골프 보상 ${picked.size}개를 거둘까요?\n\n지금 기록이 받쳐 주지 않는 것만 거둡니다. 그 번호는 비어 있게 됩니다.`, tone: "danger", confirmText: "거두기" })) take.mutate(); }}
                        className="h-9 shrink-0 border-red-500/40 text-[13px] font-bold text-red-600 hover:bg-red-50">{picked.size}개 거두기</Button>
                </div>
            )}
        </div>
    );
}

/** 한 번에 다 못 본 사람 — 열 때 한 사람씩 맞춰 본다 */
function PendingMember({ memberId, onOpenMember, onDone }: { memberId: string; onOpenMember?: (id: string) => void; onDone: () => void }) {
    const q = useQuery<GolfAwardAuditMember>({ queryKey: [KEY, memberId], gcTime: 0 });
    if (q.isLoading) return <p className="mt-2 text-[12.5px] text-black/45">맞춰 보는 중…</p>;
    if (!q.data) return <p className="mt-2 text-[12.5px] text-red-600">맞춰 보지 못했어요.</p>;
    return <MemberAwards key={q.data.rows.map((r) => r.id).join(",")} m={q.data} onOpenMember={onOpenMember} onDone={() => { void q.refetch(); onDone(); }} />;
}

export default function GolfAwardsAuditView({ onOpenMember }: { onOpenMember?: (id: string) => void }) {
    const qc = useQueryClient();
    const q = useQuery<GolfAwardSweep>({ queryKey: [KEY], gcTime: 0 });
    const [open, setOpen] = useState<string | null>(null);
    const [view, setView] = useState<"all" | "bad">("all");
    if (q.isLoading) return <EmptyState>받은 것을 하나씩 맞춰 보는 중…</EmptyState>;
    const members = Array.isArray(q.data?.members) ? q.data!.members : [];
    const pending = Array.isArray(q.data?.pending) ? q.data!.pending : [];
    const failed = Array.isArray(q.data?.failed) ? q.data!.failed : [];
    const shown = members.filter((m) => (view === "bad" ? m.unsupported > 0 : true));
    const refresh = () => void qc.invalidateQueries({ queryKey: [KEY] });
    return (
        <div className="space-y-4" data-testid="admin-golf-awards">
            <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
                <KpiTile label="받은 사람" value={members.length + pending.length} unit="명" onClick={() => setView("all")} />
                <KpiTile label="받은 것" value={members.reduce((s, m) => s + m.rows.length, 0) + pending.reduce((s, p) => s + p.held, 0)} unit="개" tone="brand" />
                <KpiTile label="기록이 받쳐 주지 않음" value={members.reduce((s, m) => s + m.unsupported, 0)} unit="개" tone={members.some((m) => m.unsupported) ? "alert" : "default"} onClick={() => setView("bad")} />
                <KpiTile label="운영자 증정" value={members.reduce((s, m) => s + m.rows.filter((r) => r.granted).length, 0)} unit="개" />
            </div>
            <FilterChips value={view} onChange={setView} options={[{ id: "all", label: "모든 사람" }, { id: "bad", label: "받쳐 주지 않음", alert: true, count: members.filter((m) => m.unsupported).length }]} />
            <p className="text-[12px] leading-snug break-keep text-black/45">볼마커 · 트로피 · 핀 · 태그는 인증 라운드(도장)로 받아요. 잘못된 라운드는 '라운드'에서 무효화하거나 미인증으로 내리세요 — 그 도장으로 받은 것이 여기서 '받쳐 주지 않음'이 되고, 그때 거둘 수 있어요. 운영자가 증정한 것은 '굿즈 · 배지'에서 회수합니다.</p>
            {failed.length > 0 && <p className="text-[12.5px] text-red-600">맞춰 보지 못한 사람 {failed.length}명 — {failed.map((f) => f.name || f.memberId.slice(0, 8)).join(", ")}</p>}
            {shown.length === 0 && pending.length === 0 ? <EmptyState>{view === "bad" ? "모든 보상이 지금 기록과 맞아요." : "아직 받은 사람이 없어요."}</EmptyState> : (
                <Panel className="divide-y divide-black/[0.06]">
                    {shown.map((m) => (
                        <div key={m.memberId} className="px-4 py-3">
                            <button type="button" onClick={() => setOpen(open === m.memberId ? null : m.memberId)} className="flex w-full items-center gap-3 text-left" data-testid="admin-golf-award-row">
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-[13.5px] font-black">{m.name}</span>
                                    <span className="block text-[12px] text-black/45">받은 것 {m.rows.length}개{m.rows.some((r) => r.granted) ? ` · 증정 ${m.rows.filter((r) => r.granted).length}` : ""}</span>
                                </span>
                                {m.unsupported > 0 ? <Pill tone="alert">받쳐 주지 않음 {m.unsupported}</Pill> : <Pill tone="brand">모두 맞음</Pill>}
                            </button>
                            {open === m.memberId && <MemberAwards key={m.rows.map((r) => r.id).join(",")} m={m} onOpenMember={onOpenMember} onDone={refresh} />}
                        </div>
                    ))}
                    {view === "all" && pending.map((p) => (
                        <div key={p.memberId} className="px-4 py-3">
                            <button type="button" onClick={() => setOpen(open === p.memberId ? null : p.memberId)} className="flex w-full items-center gap-3 text-left">
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-[13.5px] font-black">{p.name}</span>
                                    <span className="block text-[12px] text-black/45">받은 것 {p.held}개</span>
                                </span>
                                <Pill tone="neutral">열어서 맞춰 보기</Pill>
                            </button>
                            {open === p.memberId && <PendingMember memberId={p.memberId} onOpenMember={onOpenMember} onDone={refresh} />}
                        </div>
                    ))}
                </Panel>
            )}
        </div>
    );
}
