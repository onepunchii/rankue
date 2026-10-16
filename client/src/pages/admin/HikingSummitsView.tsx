/**
 * 어드민 · 등산 › 정상 인증(2026-10-17 어드민 전수 조사 — "POST /summits 는 앱이 보낸 위경도를 그대로 믿는다. 와펜은 거두지 않는다").
 * 정상 인증 전부 — 산 · 회원 · 때 · 거리 구간 · 다시 볼 것(shared/hikingSummitFlags — 좌표는 남기지 않아 시간과 산의 자리로만 본다).
 * 펼치면 그 사람의 그날 인증 흐름 · 회원 보기 · 인증 취소(미리보기로 거둘 와펜 · 핀 · 등급을 먼저 본다) · 되살리기.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { appConfirm } from "@/components/AppDialog";
import type { AdminHikingAwardLoss, AdminSummitRow } from "@shared/hikingSummitFlags";
import { EmptyState, FilterChips, KpiTile, Panel, Pill, SearchBox, kstDateTime, kstTime } from "./adminUtils";

const LIST = "/api/hiq/admin/hiking/summits";
const PERIODS = [{ id: "7", label: "7일" }, { id: "30", label: "30일" }, { id: "365", label: "1년" }] as const;

function SummitDetail({ s, all, onOpenMember, onDone }: { s: AdminSummitRow; all: AdminSummitRow[]; onOpenMember?: (id: string) => void; onDone: () => void }) {
    const { toast } = useToast();
    const [reason, setReason] = useState("");
    const [losses, setLosses] = useState<AdminHikingAwardLoss[] | null>(null);
    const day = all.filter((x) => x.memberId === s.memberId && x.day === s.day).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    const peek = useMutation({
        mutationFn: () => apiRequest(`${LIST}/${s.id}/revoke-preview`),
        onSuccess: (d: any) => setLosses(Array.isArray(d?.losses) ? d.losses : []),
        onError: (e: any) => toast({ title: e?.message || "미리보지 못했어요", variant: "destructive" }),
    });
    const act = useMutation({
        mutationFn: (kind: "revoke" | "restore") => apiRequest(`${LIST}/${s.id}/${kind}`, { method: "POST", body: { reason } }),
        onSuccess: (d: any, kind) => {
            const n = Array.isArray(d?.losses) ? d.losses.length : 0;
            toast({ title: kind === "revoke" ? "인증을 취소했어요" : "인증을 되살렸어요", description: kind === "revoke" ? (n ? `거둔 것 ${n}개` : "거둔 것은 없어요") : d?.awarded ? `다시 받은 것 ${d.awarded}개` : undefined });
            setReason(""); setLosses(null); onDone();
        },
        onError: (e: any) => toast({ title: e?.message || "처리하지 못했어요", variant: "destructive" }),
    });
    return (
        <div className="mt-3 rounded-2xl bg-black/[0.03] p-3" data-testid="admin-summit-detail">
            <p className="mb-1.5 text-[12px] font-black text-black/55">{s.memberName}님의 이날 인증 {day.filter((x) => !x.voided).length}곳</p>
            <ol className="space-y-1">
                {day.map((x) => (
                    <li key={x.id} className={`flex items-center gap-2 text-[12.5px] ${x.id === s.id ? "font-black text-black/85" : "text-black/60"}`}>
                        <span className="w-12 shrink-0 tabular-nums text-black/45">{kstTime(x.at)}</span>
                        <span className="min-w-0 flex-1 truncate">{x.mountainName}{x.heightM ? ` · ${x.heightM}m` : ""}</span>
                        {x.voided && <Pill tone="neutral">취소함</Pill>}
                        {x.flags.length > 0 && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />}
                    </li>
                ))}
            </ol>
            {onOpenMember && <button type="button" onClick={() => onOpenMember(s.memberId)} className="mt-2 text-[12px] font-bold text-brand">회원 보기</button>}
            {s.voided ? (
                <div className="mt-3 space-y-2">
                    <p className="text-[12.5px] text-black/65"><b>취소한 인증</b> — {kstDateTime(s.voided.at)} {s.voided.by} · {s.voided.reason}</p>
                    <div className="flex flex-col gap-2 sm:flex-row">
                        <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="되살리는 까닭(작업 기록에 남아요)" className="h-9 text-[13px]" />
                        <Button data-admin-write variant="outline" disabled={!reason.trim() || act.isPending} className="h-9 shrink-0 text-[13px] font-bold"
                            onClick={async () => { if (await appConfirm({ message: "이 인증을 되살릴까요?\n\n받을 와펜 · 핀 · 등급은 다시 적어요(번호는 새로).", confirmText: "되살리기" })) act.mutate("restore"); }}>되살리기</Button>
                    </div>
                </div>
            ) : (
                <div className="mt-3 space-y-2">
                    {losses && (
                        <div className="rounded-xl bg-white p-3" data-testid="admin-summit-preview">
                            <p className="mb-1 text-[12px] font-black text-black/60">취소하면 거둘 것</p>
                            {losses.length ? <div className="flex flex-wrap gap-1">{losses.map((l) => <span key={`${l.kind}:${l.key}`} className="rounded-md bg-red-500/10 px-1.5 py-0.5 text-[12px] font-bold text-red-700">{l.name}</span>)}</div>
                                : <p className="text-[12.5px] text-black/50">거둘 것이 없어요(도장첩의 도장 · 등급만 줄어요).</p>}
                        </div>
                    )}
                    <div className="flex flex-col gap-2 sm:flex-row">
                        <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="취소하는 까닭(작업 기록에 남아요)" className="h-9 text-[13px]" />
                        {!losses ? (
                            <Button variant="outline" disabled={peek.isPending} onClick={() => peek.mutate()} className="h-9 shrink-0 text-[13px] font-bold">{peek.isPending ? "계산하는 중…" : "취소 미리보기"}</Button>
                        ) : (
                            <Button data-admin-write variant="outline" disabled={!reason.trim() || act.isPending}
                                onClick={async () => { if (await appConfirm({ message: `${s.memberName}님의 ${s.mountainName} 정상 인증을 취소할까요?\n\n인증 없는 기록(흐린 도장)으로 남아요.${losses.length ? `\n거둘 것: ${losses.map((l) => l.name).join(" · ")}` : ""}\n되살릴 수 있어요.`, tone: "danger", confirmText: "인증 취소" })) act.mutate("revoke"); }}
                                className="h-9 shrink-0 border-red-500/40 text-[13px] font-bold text-red-600 hover:bg-red-50">인증 취소</Button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export default function HikingSummitsView({ onOpenMember }: { onOpenMember?: (id: string) => void }) {
    const qc = useQueryClient();
    const [days, setDays] = useState<string>("30");
    const [view, setView] = useState<"all" | "flag" | "void">("all");
    const [q, setQ] = useState("");
    const [open, setOpen] = useState<string | null>(null);
    const list = useQuery<AdminSummitRow[]>({ queryKey: [LIST, { days, ...(q.trim() ? { q: q.trim() } : {}) }] });
    const rows = useMemo(() => (Array.isArray(list.data) ? list.data : []), [list.data]);
    const live = rows.filter((r) => !r.voided);
    const shown = view === "flag" ? live.filter((r) => r.flags.length) : view === "void" ? rows.filter((r) => r.voided) : rows;
    return (
        <div className="space-y-4" data-testid="admin-hiking-summits">
            <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
                <KpiTile label="정상 인증" value={live.length} unit="번" tone="brand" onClick={() => setView("all")} />
                <KpiTile label="인증한 사람" value={new Set(live.map((r) => r.memberId)).size} unit="명" />
                <KpiTile label="다시 볼 것" value={live.filter((r) => r.flags.length).length} unit="번" tone={live.some((r) => r.flags.length) ? "alert" : "default"} onClick={() => setView("flag")} />
                <KpiTile label="취소한 인증" value={rows.length - live.length} unit="번" onClick={() => setView("void")} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
                <div className="shrink-0"><FilterChips value={days} onChange={setDays} options={PERIODS.map((p) => ({ id: p.id, label: p.label }))} /></div>
                <div className="shrink-0"><FilterChips value={view} onChange={setView} options={[{ id: "all", label: "전부" }, { id: "flag", label: "다시 볼 것", alert: true }, { id: "void", label: "취소한 인증" }]} /></div>
                <SearchBox value={q} onChange={setQ} placeholder="회원 · 산 이름" className="w-full sm:ml-auto sm:w-56" />
            </div>
            <p className="text-[12px] leading-snug text-black/45">정상 인증은 서버가 정상까지의 거리를 재고 구간만 남겨요(좌표는 남기지 않음). 그래서 하루에 너무 많은 곳 · 산과 산 사이를 너무 빨리 옮긴 인증을 골라 보여 줍니다.</p>
            {list.isLoading ? <EmptyState>불러오는 중…</EmptyState> : shown.length === 0 ? (
                <EmptyState>{rows.length === 0 ? "아직 정상 인증이 없어요." : view === "flag" ? "다시 볼 인증이 없어요." : view === "void" ? "취소한 인증이 없어요." : "맞는 인증이 없어요."}</EmptyState>
            ) : (
                <Panel className="divide-y divide-black/[0.06]">
                    {shown.map((s) => (
                        <div key={s.id} className={`px-4 py-3 ${s.voided ? "bg-black/[0.02]" : ""}`}>
                            <button type="button" onClick={() => setOpen(open === s.id ? null : s.id)} className="flex w-full items-start gap-3 text-left" data-testid="admin-summit-row">
                                <div className={`min-w-0 flex-1 ${s.voided ? "opacity-60" : ""}`}>
                                    <p className="flex flex-wrap items-center gap-x-1.5 text-[13.5px]">
                                        <span className="font-black">{s.mountainName}</span>{s.heightM && <span className="text-[12px] text-black/40">{s.heightM}m</span>}
                                        <span className="text-black/30">·</span><span className="font-bold text-black/65">{s.memberName}</span>
                                        {s.voided && <Pill tone="neutral">취소함</Pill>}
                                    </p>
                                    <p className="mt-0.5 text-[12px] text-black/45">{kstDateTime(s.at)} · 정상까지 {s.bucket ?? "-"}</p>
                                    {s.flags.length > 0 && <div className="mt-1.5 flex flex-wrap gap-1">{s.flags.map((f) => <span key={f.id} className="rounded-md bg-red-500/10 px-1.5 py-0.5 text-[12px] font-bold text-red-700">{f.text}</span>)}</div>}
                                    {s.voided && <p className="mt-1 text-[12px] text-black/55">{s.voided.by} — {s.voided.reason}</p>}
                                </div>
                            </button>
                            {open === s.id && <SummitDetail s={s} all={rows} onOpenMember={onOpenMember} onDone={() => void qc.invalidateQueries({ queryKey: [LIST] })} />}
                        </div>
                    ))}
                </Panel>
            )}
        </div>
    );
}
