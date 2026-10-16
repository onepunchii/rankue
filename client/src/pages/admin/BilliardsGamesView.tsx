/**
 * 어드민 · 당구 › 실전 경기(2026-10-16 어드민 전수 조사 — "'1이닝 16점' · 짜고 친 공식전을 회원을 한 명씩 열어 찾아야 한다").
 * 끝난 당구 경기(매치 · 대회)를 한 목록에서 — 선수 · 점수/목표 · 하이런 · 이닝 · 이상 표시(shared/billiardsGameFlags — 사람이 다시 볼 것을 고르는 체).
 * 펼치면 이닝마다 낸 점수(막대), 회원 보기, 지우기(RP · 에버리지를 되돌린다 — 까닭을 적어야 하고 작업 기록에 남는다).
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { appConfirm } from "@/components/AppDialog";
import type { AdminGameRow } from "@shared/billiardsGameFlags";
import { EmptyState, FilterChips, KpiTile, Panel, Pill, SearchBox, kstDateTime } from "./adminUtils";

const PERIODS = [{ id: "1", label: "오늘" }, { id: "7", label: "7일" }, { id: "30", label: "30일" }, { id: "365", label: "1년" }] as const;

function InningBars({ innings, color }: { innings: number[]; color: string }) {
    const max = Math.max(1, ...innings);
    return (
        <div className="flex h-10 items-end gap-[2px]" aria-hidden>
            {innings.map((v, i) => <span key={i} className="w-[6px] rounded-t-[2px]" style={{ height: `${Math.max(2, (v / max) * 100)}%`, background: v === max && v > 0 ? "#dc2626" : color, opacity: v ? 1 : 0.25 }} title={`${i + 1}이닝 ${v}`} />)}
        </div>
    );
}

export default function BilliardsGamesView({ onOpenMember }: { onOpenMember?: (id: string) => void }) {
    const { toast } = useToast();
    const qc = useQueryClient();
    const [days, setDays] = useState<string>("30");
    const [type, setType] = useState<"all" | "3c" | "4c">("all");
    const [flagged, setFlagged] = useState(true);
    const [q, setQ] = useState("");
    const [open, setOpen] = useState<string | null>(null);
    const [reason, setReason] = useState("");
    const key = ["/api/hiq/admin/billiards/games", { days, ...(type !== "all" ? { type } : {}), ...(q.trim() ? { q: q.trim() } : {}) }] as const;
    const list = useQuery<AdminGameRow[]>({ queryKey: key });
    const rows = useMemo(() => (Array.isArray(list.data) ? list.data : []), [list.data]);
    const shown = flagged ? rows.filter((g) => g.flags.length) : rows;
    const del = useMutation({
        mutationFn: (id: string) => apiRequest(`/api/hiq/admin/games/${id}`, { method: "DELETE", body: { reason } }),
        onSuccess: () => { toast({ title: "지웠어요 — RP · 에버리지를 되돌렸습니다" }); setOpen(null); setReason(""); void qc.invalidateQueries({ queryKey: ["/api/hiq/admin/billiards/games"] }); },
        onError: (e: any) => toast({ title: e?.message || "지우지 못했어요", variant: "destructive" }),
    });

    return (
        <div className="space-y-3" data-testid="admin-billiards-games">
            <div className="grid grid-cols-3 gap-2.5">
                <KpiTile label="끝난 경기" value={rows.length} unit="판" />
                <KpiTile label="공식전" value={rows.filter((g) => g.ranked).length} unit="판" tone="brand" />
                <KpiTile label="다시 볼 것" value={rows.filter((g) => g.flags.length).length} unit="판" tone={rows.some((g) => g.flags.length) ? "alert" : "default"} onClick={() => setFlagged(true)} />
            </div>
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
                <FilterChips value={days} onChange={setDays} options={PERIODS.map((p) => ({ id: p.id, label: p.label }))} />
                <FilterChips value={type} onChange={setType} options={[{ id: "all", label: "전체" }, { id: "3c", label: "3쿠션" }, { id: "4c", label: "4구" }]} />
                <FilterChips value={flagged ? "flag" : "all"} onChange={(v) => setFlagged(v === "flag")} options={[{ id: "flag", label: "다시 볼 것만", alert: true }, { id: "all", label: "모든 경기" }]} />
                <SearchBox value={q} onChange={setQ} placeholder="선수 · 매장 이름" className="lg:ml-auto lg:w-60" />
            </div>
            {list.isLoading ? <EmptyState>불러오는 중…</EmptyState> : shown.length === 0 ? <EmptyState>{flagged ? "다시 볼 경기가 없어요." : "경기가 없어요."}</EmptyState> : (
                <Panel className="divide-y divide-black/[0.06]">
                    {shown.map((g) => (
                        <div key={g.id} className="px-4 py-3">
                            <button type="button" onClick={() => { setOpen(open === g.id ? null : g.id); setReason(""); }} className="flex w-full items-start gap-3 text-left" data-testid="admin-game-row">
                                <div className="w-[92px] shrink-0">
                                    <div className="flex flex-wrap gap-1"><Pill tone="info">{g.gameType === "3c" ? "3쿠션" : "4구"}</Pill>{g.ranked && <Pill tone="brand">공식</Pill>}</div>
                                    <p className="mt-1 text-[11.5px] text-black/45">{kstDateTime(g.playedAt)}</p>
                                </div>
                                <div className="min-w-0 flex-1">
                                    {g.players.map((p, i) => (
                                        <p key={i} className="flex items-center gap-2 text-[13.5px]">
                                            <span className={`min-w-0 flex-1 truncate ${p.winner ? "font-black" : "font-bold text-black/70"}`}>{p.winner && <span className="mr-1 rounded bg-brand/10 px-1 text-[11px] font-black text-brand">승</span>}{p.name}{!p.id && <span className="ml-1 text-[11px] font-bold text-black/35">게스트</span>}</span>
                                            <span className="tabular-nums text-black/75">{p.score}<span className="text-black/35">/{p.target}</span></span>
                                            <span className={`w-14 text-right text-[12px] tabular-nums ${g.flags.some((f) => f.id === "highRun") && p.highRun >= (g.gameType === "3c" ? 10 : 40) ? "font-black text-red-600" : "text-black/45"}`}>HR {p.highRun}</span>
                                        </p>
                                    ))}
                                    <p className="mt-0.5 text-[12px] text-black/40">{g.totalInnings}이닝{g.storeName ? ` · ${g.storeName}` : ""}{g.bracket ? " · 크루 대진" : ""}</p>
                                    {g.flags.length > 0 && <div className="mt-1.5 flex flex-wrap gap-1">{g.flags.map((f) => <span key={f.id} className="rounded-md bg-red-500/10 px-1.5 py-0.5 text-[12px] font-bold text-red-700">{f.text}</span>)}</div>}
                                </div>
                            </button>
                            {open === g.id && (
                                <div className="mt-3 rounded-2xl bg-black/[0.03] p-3" data-testid="admin-game-detail">
                                    <div className="space-y-2.5">
                                        {g.players.map((p, i) => (
                                            <div key={i} className="flex items-end gap-3">
                                                <span className="w-24 shrink-0 truncate text-[12.5px] font-bold text-black/65">{p.name}</span>
                                                {p.innings?.length ? <InningBars innings={p.innings} color={["#0a6b3f", "#2563eb", "#9333ea", "#db2777"][i] ?? "#555"} /> : <span className="text-[12px] text-black/35">이닝 기록 없음</span>}
                                                {p.id && onOpenMember && <button type="button" onClick={() => onOpenMember(p.id!)} className="ml-auto shrink-0 text-[12px] font-bold text-brand">회원 보기</button>}
                                            </div>
                                        ))}
                                    </div>
                                    {g.bracket ? (
                                        <p className="mt-3 text-[12.5px] text-black/50">크루 대진에 묶인 판이라 여기서 지울 수 없어요 — 크루 대진을 먼저 정리해야 합니다.</p>
                                    ) : (
                                        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                                            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="지우는 까닭(작업 기록에 남아요)" className="h-9 text-[13px]" />
                                            <Button data-admin-write variant="outline" disabled={!reason.trim() || del.isPending}
                                                onClick={async () => { if (await appConfirm({ message: `이 경기를 지울까요?\n\n${g.players.map((p) => `${p.name} ${p.score}`).join(" : ")}\n\n이 판으로 오르내린 RP · 에버리지를 되돌립니다. 되돌릴 수 없어요.`, tone: "danger", confirmText: "지우기" })) del.mutate(g.id); }}
                                                className="h-9 shrink-0 border-red-500/40 text-[13px] font-bold text-red-600 hover:bg-red-50">경기 지우기</Button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </Panel>
            )}
        </div>
    );
}
