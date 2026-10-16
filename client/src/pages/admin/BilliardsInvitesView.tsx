/**
 * 어드민 · 당구 › 친구 초대(2026-10-16 어드민 전수 조사 — "가짜 계정 서른 개로 한정 큐를 받아 가도 지금은 알 길이 없다").
 * 초대한 사람 순위(단계 1 · 3 · 10 · 30명 · 고른 한정 큐) · 한정 큐 열두 자루의 남은 수와 번호별 주인 · 초대로 든 가입(다시 볼 것 — shared/inviteAdmin).
 * 펼치면 두 사람 회원 보기 · 초대 취소(까닭 · 보상도 거두기 — 기본 켬). 취소한 초대는 표시만 남고 초대 수에서 빠진다(같은 사람이 다시 넣지도 못한다).
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { appConfirm } from "@/components/AppDialog";
import { INVITE_STEPS, caseImage, caseItem } from "@shared/cueCase";
import type { AdminInviteRow, AdminInvites } from "@shared/inviteAdmin";
import { EmptyState, FilterChips, KpiTile, Panel, Pill, SearchBox, kstDateTime, lastSeenLabel } from "./adminUtils";

const KEY = ["/api/hiq/admin/billiards/invites"] as const;
const itemName = (id: string) => caseItem(id)?.name.ko ?? id;
const no = (n: number) => `No.${String(n).padStart(2, "0")}`;

/** 단계 넷(1 · 3 · 10 · 30명) — 채운 것만 진하게 */
function Ladder({ count }: { count: number }) {
    return (
        <span className="flex items-center gap-1" aria-label={`초대 ${count}명`}>
            {INVITE_STEPS.map((n) => (
                <span key={n} className={`rounded-[5px] px-1 text-[11px] font-black tabular-nums ${count >= n ? "bg-brand text-white" : "bg-black/[0.05] text-black/30"}`}>{n}</span>
            ))}
        </span>
    );
}

export default function BilliardsInvitesView({ onOpenMember }: { onOpenMember?: (id: string) => void }) {
    const { toast } = useToast();
    const qc = useQueryClient();
    const list = useQuery<AdminInvites>({ queryKey: KEY });
    const [view, setView] = useState<"flag" | "all" | "canceled">("all");
    const [q, setQ] = useState("");
    const [inviter, setInviter] = useState<string | null>(null);
    const [open, setOpen] = useState<string | null>(null);
    const [reason, setReason] = useState("");
    const [takeBack, setTakeBack] = useState(true);

    const rows = useMemo(() => (Array.isArray(list.data?.rows) ? list.data!.rows : []), [list.data]);
    const top = Array.isArray(list.data?.top) ? list.data!.top : [];
    const stock = Array.isArray(list.data?.stock) ? list.data!.stock : [];
    const live = rows.filter((r) => !r.canceled);
    const flagged = live.filter((r) => r.flags.length);
    const term = q.trim();
    const shown = rows
        .filter((r) => (view === "canceled" ? !!r.canceled : view === "flag" ? !r.canceled && r.flags.length > 0 : true))
        .filter((r) => !inviter || r.inviterId === inviter)
        .filter((r) => !term || r.inviteeName.includes(term) || r.inviterName.includes(term));
    const given = stock.reduce((s, x) => s + x.holders.length, 0), cap = stock.reduce((s, x) => s + x.limit, 0);
    const focus = inviter ? top.find((t) => t.memberId === inviter) : null;

    const cancel = useMutation({
        mutationFn: (r: AdminInviteRow) => apiRequest(`/api/hiq/admin/billiards/invites/${r.inviteeId}/cancel`, { method: "POST", body: { reason, takeBack } }),
        onSuccess: (d: any) => {
            const taken: string[] = Array.isArray(d?.taken) ? d.taken : [];
            toast({ title: "초대를 취소했어요", description: taken.length ? `거둔 것 — ${taken.map(itemName).join(" · ")}` : "거둔 보상은 없어요." });
            setOpen(null); setReason("");
            void qc.invalidateQueries({ queryKey: KEY });
        },
        onError: (e: any) => toast({ title: e?.message || "취소하지 못했어요", variant: "destructive" }),
    });

    if (list.isLoading) return <EmptyState>불러오는 중…</EmptyState>;
    return (
        <div className="space-y-4" data-testid="admin-billiards-invites">
            <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
                <KpiTile label="초대로 든 가입" value={live.length} unit="명" tone="brand" onClick={() => { setView("all"); setInviter(null); }} />
                <KpiTile label="초대한 사람" value={top.length} unit="명" />
                <KpiTile label="다시 볼 것" value={flagged.length} unit="건" tone={flagged.length ? "alert" : "default"} onClick={() => { setView("flag"); setInviter(null); }} />
                <KpiTile label="한정 큐 나감" value={given} unit={`/ ${cap}`} sub="30명마다 한 자루" />
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <section>
                    <h3 className="mb-2 text-[13px] font-black text-black/70">초대한 사람</h3>
                    {top.length === 0 ? <EmptyState>아직 초대로 든 가입이 없어요. 첫 초대가 들어오면 여기에 쌓입니다.</EmptyState> : (
                        <Panel className="divide-y divide-black/[0.06]">
                            {top.slice(0, 30).map((t, i) => (
                                <button key={t.memberId} type="button" onClick={() => setInviter(inviter === t.memberId ? null : t.memberId)} data-testid="admin-inviter-row"
                                    className={`flex w-full items-center gap-3 px-4 py-2.5 text-left ${inviter === t.memberId ? "bg-brand/[0.06]" : "hover:bg-black/[0.02]"}`}>
                                    <span className="w-5 shrink-0 text-right text-[12px] font-black tabular-nums text-black/35">{i + 1}</span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-[13.5px] font-black">{t.name}</span>
                                        <span className="mt-0.5 flex items-center gap-2"><Ladder count={t.count} />{t.picks.total > 0 && <span className="text-[11.5px] font-bold text-black/45">한정 큐 {t.picks.total - t.picks.left}/{t.picks.total} 고름</span>}</span>
                                    </span>
                                    {t.suspicious > 0 && <Pill tone="alert">다시 볼 것 {t.suspicious}</Pill>}
                                    <span className="w-12 shrink-0 text-right text-[15px] font-black tabular-nums">{t.count}<span className="text-[11px] text-black/40">명</span></span>
                                </button>
                            ))}
                        </Panel>
                    )}
                </section>

                <section>
                    <h3 className="mb-2 text-[13px] font-black text-black/70">한정 큐 열두 자루 <span className="font-bold text-black/40">— 자루마다 {stock[0]?.limit ?? 10}개, 번호 순</span></h3>
                    {/* 세로로 채우는 두 단 — 주인이 많은 자루만 길어지고 옆 칸이 비지 않는다 */}
                    <Panel className="columns-2 gap-x-4 px-3 py-1">
                        {stock.map((s) => {
                            const x = caseItem(s.itemId);
                            const left = s.limit - s.holders.length;
                            return (
                                <div key={s.itemId} className="break-inside-avoid border-b border-black/[0.06] py-2.5" data-testid="admin-invite-stock">
                                    <div className="flex items-center gap-2">
                                        <span className="min-w-0 flex-1 truncate text-[12.5px] font-black">{x?.name.ko ?? s.itemId}</span>
                                        <span className={`shrink-0 text-[12px] font-black tabular-nums ${left === 0 ? "text-red-600" : "text-black/55"}`}>{left === 0 ? "다 나감" : `${s.holders.length}/${s.limit}`}</span>
                                    </div>
                                    {x && <img src={caseImage(x)} alt="" loading="lazy" draggable={false} className="mt-1.5 h-[14px] w-full object-contain object-left" />}
                                    <div className="mt-1.5 flex h-1 gap-[2px]" aria-hidden>
                                        {Array.from({ length: s.limit }, (_, k) => <span key={k} className={`flex-1 rounded-full ${k < s.holders.length ? "bg-brand" : "bg-black/[0.07]"}`} />)}
                                    </div>
                                    {s.holders.length > 0 && (
                                        <div className="mt-1.5 flex flex-wrap gap-1">
                                            {s.holders.map((h) => (
                                                <button key={h.serial} type="button" onClick={() => onOpenMember?.(h.memberId)} className="max-w-full truncate rounded-md bg-black/[0.04] px-1.5 py-0.5 text-[12px] font-bold text-black/65 hover:bg-black/[0.08]">
                                                    <span className="tabular-nums text-black/40">{no(h.serial)}</span> {h.name}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </Panel>
                </section>
            </div>

            <section>
                <div className="mb-2 flex flex-col gap-2 lg:flex-row lg:items-center">
                    <h3 className="text-[13px] font-black text-black/70">초대로 든 가입{focus ? <span className="font-bold text-black/45"> — {focus.name}님이 초대한 {rows.filter((r) => r.inviterId === focus.memberId).length}명</span> : null}</h3>
                    {focus && <button type="button" onClick={() => setInviter(null)} className="self-start text-[12px] font-bold text-brand lg:self-auto">모두 보기</button>}
                    <div className="flex flex-col gap-2 lg:ml-auto lg:flex-row lg:items-center">
                        <FilterChips value={view} onChange={setView} options={[{ id: "all", label: "전부" }, { id: "flag", label: "다시 볼 것", alert: true }, { id: "canceled", label: "취소한 초대" }]} />
                        <SearchBox value={q} onChange={setQ} placeholder="초대한 · 초대받은 사람" className="lg:w-56" />
                    </div>
                </div>
                {shown.length === 0 ? (
                    <EmptyState>{rows.length === 0 ? "아직 초대로 든 가입이 없어요." : view === "flag" ? "다시 볼 초대가 없어요." : view === "canceled" ? "취소한 초대가 없어요." : "맞는 초대가 없어요."}</EmptyState>
                ) : (
                    <Panel className="divide-y divide-black/[0.06]">
                        {shown.slice(0, 300).map((r) => (
                            <div key={r.inviteeId} className={`px-4 py-3 ${r.canceled ? "opacity-60" : ""}`}>
                                <button type="button" onClick={() => { setOpen(open === r.inviteeId ? null : r.inviteeId); setReason(""); setTakeBack(true); }} className="flex w-full items-start gap-3 text-left" data-testid="admin-invite-row">
                                    <div className="min-w-0 flex-1">
                                        <p className="flex flex-wrap items-center gap-x-1.5 text-[13.5px]">
                                            <span className="font-black">{r.inviteeName}</span>
                                            <span className="text-black/35">←</span>
                                            <span className="font-bold text-black/60">{r.inviterName}</span>
                                            {r.canceled && <Pill tone="neutral">취소함</Pill>}
                                        </p>
                                        <p className="mt-0.5 text-[12px] text-black/45">
                                            {kstDateTime(r.at)} 초대로 셈 · 마지막 접속 {lastSeenLabel(r.inviteeSeenAt ?? r.inviteeJoinedAt)} · 경기 <span className={r.games === 0 ? "font-bold text-black/60" : ""}>{r.games}판</span>
                                        </p>
                                        {r.flags.length > 0 && <div className="mt-1.5 flex flex-wrap gap-1">{r.flags.map((f) => <span key={f.id} className="rounded-md bg-red-500/10 px-1.5 py-0.5 text-[12px] font-bold text-red-700">{f.text}</span>)}</div>}
                                        {r.canceled && <p className="mt-1 text-[12px] text-black/55">{kstDateTime(r.canceled.at)} {r.canceled.by} — {r.canceled.reason}</p>}
                                    </div>
                                </button>
                                {open === r.inviteeId && (
                                    <div className="mt-3 rounded-2xl bg-black/[0.03] p-3" data-testid="admin-invite-detail">
                                        <div className="flex flex-wrap gap-2">
                                            {onOpenMember && !r.withdrawn && <Button variant="outline" className="h-8 text-[12.5px] font-bold" onClick={() => onOpenMember(r.inviteeId)}>초대받은 {r.inviteeName}</Button>}
                                            {onOpenMember && <Button variant="outline" className="h-8 text-[12.5px] font-bold" onClick={() => onOpenMember(r.inviterId)}>초대한 {r.inviterName}</Button>}
                                        </div>
                                        {!r.canceled && (
                                            <div className="mt-3 space-y-2">
                                                <label className="flex items-start gap-2.5">
                                                    <Switch checked={takeBack} onCheckedChange={setTakeBack} className="mt-0.5 shrink-0" data-admin-write />
                                                    <span className="min-w-0">
                                                        <span className="block text-[12.5px] font-bold text-black/70">보상도 거두기</span>
                                                        <span className="block text-[12px] leading-snug text-black/45">줄어든 수만큼 단계 보상 · 넘친 한정 큐(늦게 고른 것부터). 증정한 물건은 그대로 둬요.</span>
                                                    </span>
                                                </label>
                                                <div className="flex flex-col gap-2 sm:flex-row">
                                                    <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="취소하는 까닭(작업 기록에 남아요)" className="h-9 text-[13px]" />
                                                    <Button data-admin-write variant="outline" disabled={!reason.trim() || cancel.isPending}
                                                        onClick={async () => { if (await appConfirm({ message: `${r.inviterName}님의 초대에서 ${r.inviteeName}님을 뺄까요?\n\n초대 수가 하나 줄어요.${takeBack ? "\n줄어든 수에 맞지 않는 보상은 거둡니다." : ""}\n같은 사람은 초대 코드를 다시 넣을 수 없어요.`, tone: "danger", confirmText: "초대 취소" })) cancel.mutate(r); }}
                                                        className="h-9 shrink-0 border-red-500/40 text-[13px] font-bold text-red-600 hover:bg-red-50">초대 취소</Button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                    </Panel>
                )}
            </section>
        </div>
    );
}
