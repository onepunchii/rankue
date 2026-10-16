/**
 * 어드민 · 당구 › 온라인 대전(2026-10-16 어드민 전수 조사 — "무결성 오류는 건수만 보이고 어느 판인지 열어 볼 수 없다").
 * 끝난 온라인 대전 전부 — 두 사람 · 점수/목표 · 샷 수 · 끝난 까닭 · 레이팅 변화 · 다시 볼 것(shared/simMatchFlags — 레이팅을 옮기는 길만 본다).
 * 펼치면 이닝마다 낸 점수 · 샷 흐름(앱/서버 어긋남은 붉게) · 채팅 건수(글은 싣지 않는다) · 무효(미리보기로 바뀌는 레이팅을 먼저 본다) · 되살리기.
 * 옆에는 온라인 레이팅 표 — 누르면 그 사람의 대전만.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { appConfirm } from "@/components/AppDialog";
import { endReasonLabel, type AdminOnlineDetail, type AdminOnlineRow, type AdminRatingChange, type AdminRatingRow } from "@shared/simMatchFlags";
import { EmptyState, FilterChips, KpiTile, Panel, Pill, SearchBox, kstDateTime, lastSeenLabel } from "./adminUtils";

const LIST = "/api/hiq/admin/billiards/online";
const RATINGS = "/api/hiq/admin/billiards/online/ratings";
const PERIODS = [{ id: "7", label: "7일" }, { id: "30", label: "30일" }, { id: "365", label: "1년" }] as const;
const COLORS = ["#0a6b3f", "#2563eb"] as const;
const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "±0");

/** 이닝마다 낸 점수 — 가장 큰 이닝은 붉게 */
function InningBars({ values, color }: { values: number[]; color: string }) {
    const max = Math.max(1, ...values);
    return (
        <div className="flex h-9 min-w-0 flex-1 items-end gap-[2px] overflow-hidden" aria-hidden>
            {values.map((v, i) => <span key={i} className="w-[6px] shrink-0 rounded-t-[2px]" style={{ height: `${Math.max(2, (v / max) * 100)}%`, background: v === max && v > 0 ? "#dc2626" : color, opacity: v ? 1 : 0.22 }} title={`${i + 1}이닝 ${v}`} />)}
        </div>
    );
}

function ChangeList({ changes }: { changes: AdminRatingChange[] }) {
    if (!changes.length) return <p className="text-[12.5px] text-black/50">레이팅이 바뀌는 사람이 없어요(레이팅에 반영되지 않은 판).</p>;
    return (
        <ul className="space-y-1">
            {changes.map((c) => (
                <li key={`${c.memberId}|${c.gameType}`} className="flex items-center gap-2 text-[12.5px]">
                    <span className="min-w-0 flex-1 truncate font-bold text-black/75">{c.name} <span className="font-medium text-black/40">{c.gameType === "3c" ? "3쿠션" : "4구"}</span></span>
                    <span className="tabular-nums text-black/55">{c.before ?? "—"} → <b className="text-black/85">{c.after ?? "—"}</b></span>
                    <span className={`w-12 text-right font-black tabular-nums ${(c.after ?? 1000) - (c.before ?? 1000) >= 0 ? "text-brand" : "text-red-600"}`}>{signed((c.after ?? 1000) - (c.before ?? 1000))}</span>
                </li>
            ))}
        </ul>
    );
}

function MatchDetail({ g, onOpenMember, onDone }: { g: AdminOnlineRow; onOpenMember?: (id: string) => void; onDone: () => void }) {
    const { toast } = useToast();
    const detail = useQuery<AdminOnlineDetail>({ queryKey: [`${LIST}/${g.id}`] });
    const [reason, setReason] = useState("");
    const [preview, setPreview] = useState<AdminRatingChange[] | null>(null);
    const shots = Array.isArray(detail.data?.shots) ? detail.data!.shots : [];
    const innings = useMemo(() => [0, 1].map((p) => {
        const mine = shots.filter((s) => s.player === p && s.inning != null);
        const n = Math.max(0, ...mine.map((s) => s.inning ?? 0));
        const out = Array.from({ length: n }, () => 0);
        for (const s of mine) out[(s.inning ?? 1) - 1] += s.points;
        return out;
    }), [shots]);
    const mism = shots.filter((s) => s.mismatch).length;
    const minutes = shots.length > 1 ? Math.max(1, Math.round((Date.parse(shots[shots.length - 1].at) - Date.parse(shots[0].at)) / 60_000)) : 0;

    const peek = useMutation({
        mutationFn: () => apiRequest(`${LIST}/${g.id}/void-preview`),
        onSuccess: (d: any) => setPreview(Array.isArray(d?.changes) ? d.changes : []),
        onError: (e: any) => toast({ title: e?.message || "미리보지 못했어요", variant: "destructive" }),
    });
    const act = useMutation({
        mutationFn: (kind: "void" | "restore") => apiRequest(`${LIST}/${g.id}/${kind}`, { method: "POST", body: { reason } }),
        onSuccess: (d: any, kind) => {
            const n = Array.isArray(d?.changes) ? d.changes.length : 0;
            toast({ title: kind === "void" ? "무효로 했어요" : "되살렸어요", description: n ? `레이팅을 다시 계산했어요 — ${n}명이 바뀌었습니다.` : "레이팅이 바뀐 사람은 없어요." });
            setReason(""); setPreview(null); onDone();
        },
        onError: (e: any) => toast({ title: e?.message || "처리하지 못했어요", variant: "destructive" }),
    });

    return (
        <div className="mt-3 rounded-2xl bg-black/[0.03] p-3" data-testid="admin-online-detail">
            {detail.isLoading ? <p className="text-[12.5px] text-black/45">샷 기록을 불러오는 중…</p> : (
                <>
                    <div className="space-y-2.5">
                        {g.players.map((p, i) => (
                            <div key={p.id} className="flex items-end gap-3">
                                <span className="w-24 shrink-0 truncate text-[12.5px] font-bold text-black/65">{p.name}</span>
                                {innings[i].length ? <InningBars values={innings[i]} color={COLORS[i]} /> : <span className="flex-1 text-[12px] text-black/35">이닝 기록 없음</span>}
                                {onOpenMember && <button type="button" onClick={() => onOpenMember(p.id)} className="shrink-0 text-[12px] font-bold text-brand">회원 보기</button>}
                            </div>
                        ))}
                    </div>
                    {shots.length > 0 && (
                        <div className="mt-3">
                            <p className="mb-1 text-[11.5px] font-bold text-black/40">샷 흐름 — 위 {g.players[0].name} · 아래 {g.players[1].name}{mism ? " · 붉은 칸은 앱과 서버 계산이 다른 샷" : ""}</p>
                            <div className="flex h-8 items-center gap-px overflow-hidden" aria-hidden>
                                {shots.slice(0, 240).map((s) => (
                                    <span key={s.idx} className={`flex h-full w-[4px] shrink-0 flex-col ${s.player === 0 ? "justify-start" : "justify-end"}`}>
                                        <span className="w-full rounded-[1px]" style={{ height: `${s.points > 0 ? 50 : 18}%`, background: s.mismatch ? "#dc2626" : COLORS[s.player], opacity: s.points > 0 ? 1 : 0.3 }} />
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                    <p className="mt-2 text-[12px] text-black/50">샷 {shots.length}번{minutes ? ` · ${minutes}분` : ""} · 채팅 {detail.data?.chats ?? 0}건{mism ? <b className="text-red-600"> · 어긋난 샷 {mism}번</b> : ""}</p>
                </>
            )}

            {g.cup ? (
                <p className="mt-3 text-[12.5px] text-black/50">월대회 판이라 대진이 걸려 있어요 — 여기서 무효로 하지 않습니다.</p>
            ) : g.voided ? (
                <div className="mt-3 space-y-2">
                    <p className="text-[12.5px] text-black/65"><b>무효로 한 판</b> — {kstDateTime(g.voided.at)} {g.voided.by} · {g.voided.reason}</p>
                    <div className="flex flex-col gap-2 sm:flex-row">
                        <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="되살리는 까닭(작업 기록에 남아요)" className="h-9 text-[13px]" />
                        <Button data-admin-write variant="outline" disabled={!reason.trim() || act.isPending} className="h-9 shrink-0 text-[13px] font-bold"
                            onClick={async () => { if (await appConfirm({ message: "이 판을 되살릴까요?\n\n원래 끝난 까닭으로 돌리고 레이팅을 다시 계산합니다.", confirmText: "되살리기" })) act.mutate("restore"); }}>되살리기</Button>
                    </div>
                </div>
            ) : (
                <div className="mt-3 space-y-2">
                    {preview && (
                        <div className="rounded-xl bg-white p-3" data-testid="admin-online-preview">
                            <p className="mb-1.5 text-[12px] font-black text-black/60">무효로 하면 레이팅이 이렇게 바뀌어요</p>
                            <ChangeList changes={preview} />
                        </div>
                    )}
                    <div className="flex flex-col gap-2 sm:flex-row">
                        <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="무효로 하는 까닭(작업 기록에 남아요)" className="h-9 text-[13px]" />
                        {!preview ? (
                            <Button variant="outline" disabled={peek.isPending} onClick={() => peek.mutate()} className="h-9 shrink-0 text-[13px] font-bold">{peek.isPending ? "계산하는 중…" : "무효 미리보기"}</Button>
                        ) : (
                            <Button data-admin-write variant="outline" disabled={!reason.trim() || act.isPending}
                                onClick={async () => { if (await appConfirm({ message: `이 판을 무효로 할까요?\n\n${g.players.map((p) => `${p.name} ${p.score}`).join(" : ")}\n\n두 사람의 기록 · 이달의 랭킹에서 빠지고 레이팅을 다시 계산합니다. 되살릴 수 있어요.`, tone: "danger", confirmText: "무효로 하기" })) act.mutate("void"); }}
                                className="h-9 shrink-0 border-red-500/40 text-[13px] font-bold text-red-600 hover:bg-red-50">무효로 하기</Button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export default function BilliardsOnlineView({ onOpenMember }: { onOpenMember?: (id: string) => void }) {
    const qc = useQueryClient();
    const [days, setDays] = useState<string>("30");
    const [type, setType] = useState<"all" | "3c" | "4c">("all");
    const [view, setView] = useState<"all" | "flag" | "void">("all");
    const [q, setQ] = useState("");
    const [member, setMember] = useState<AdminRatingRow | null>(null);
    const [open, setOpen] = useState<string | null>(null);
    const [rType, setRType] = useState<"3c" | "4c">("3c");
    const list = useQuery<AdminOnlineRow[]>({ queryKey: [LIST, { days, ...(type !== "all" ? { type } : {}), ...(q.trim() ? { q: q.trim() } : {}), ...(member ? { member: member.memberId } : {}) }] });
    const ratings = useQuery<AdminRatingRow[]>({ queryKey: [RATINGS] });
    const rows = useMemo(() => (Array.isArray(list.data) ? list.data : []), [list.data]);
    const live = rows.filter((g) => !g.voided);
    const shown = view === "flag" ? live.filter((g) => g.flags.length) : view === "void" ? rows.filter((g) => g.voided) : rows;
    const board = (Array.isArray(ratings.data) ? ratings.data : []).filter((r) => r.gameType === rType);
    const refresh = () => { void qc.invalidateQueries({ queryKey: [LIST] }); void qc.invalidateQueries({ queryKey: [RATINGS] }); };

    return (
        <div className="space-y-4" data-testid="admin-billiards-online">
            <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
                <KpiTile label="끝난 대전" value={live.length} unit="판" onClick={() => setView("all")} />
                <KpiTile label="레이팅 판" value={live.filter((g) => g.rated).length} unit="판" tone="brand" />
                <KpiTile label="다시 볼 것" value={live.filter((g) => g.flags.length).length} unit="판" tone={live.some((g) => g.flags.length) ? "alert" : "default"} onClick={() => setView("flag")} />
                <KpiTile label="무효로 한 판" value={rows.length - live.length} unit="판" onClick={() => setView("void")} />
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
                <section className="min-w-0">
                    {/* 옆에 레이팅 표가 서는 넓이에서도 칩이 잘리지 않게 — 묶음마다 줄을 바꿔 선다 */}
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                        <div className="shrink-0"><FilterChips value={days} onChange={setDays} options={PERIODS.map((p) => ({ id: p.id, label: p.label }))} /></div>
                        <div className="shrink-0"><FilterChips value={type} onChange={setType} options={[{ id: "all", label: "전체" }, { id: "3c", label: "3쿠션" }, { id: "4c", label: "4구" }]} /></div>
                        <div className="shrink-0"><FilterChips value={view} onChange={setView} options={[{ id: "all", label: "모든 판" }, { id: "flag", label: "다시 볼 것", alert: true }, { id: "void", label: "무효" }]} /></div>
                        <SearchBox value={q} onChange={setQ} placeholder="선수 이름" className="w-full sm:ml-auto sm:w-48" />
                    </div>
                    {member && (
                        <p className="mb-2 flex items-center gap-2 text-[12.5px] text-black/60">
                            <span><b className="text-black/80">{member.name}</b>의 대전만 보는 중</span>
                            <button type="button" onClick={() => setMember(null)} className="font-bold text-brand">모두 보기</button>
                            {onOpenMember && <button type="button" onClick={() => onOpenMember(member.memberId)} className="font-bold text-brand">회원 보기</button>}
                        </p>
                    )}
                    {list.isLoading ? <EmptyState>불러오는 중…</EmptyState> : shown.length === 0 ? (
                        <EmptyState>{view === "flag" ? "다시 볼 대전이 없어요." : view === "void" ? "무효로 한 판이 없어요." : "대전이 없어요."}</EmptyState>
                    ) : (
                        <Panel className="divide-y divide-black/[0.06]">
                            {shown.map((g) => (
                                <div key={g.id} className={`px-4 py-3 ${g.voided ? "bg-black/[0.02]" : ""}`}>
                                    <button type="button" onClick={() => setOpen(open === g.id ? null : g.id)} className="flex w-full flex-col gap-1.5 text-left sm:flex-row sm:items-start sm:gap-3" data-testid="admin-online-row">
                                        {/* 폰에서는 꼬리표 · 시각을 한 줄 위로 — 이름 칸이 좁아져 잘리지 않게 */}
                                        <div className="flex items-center gap-2 sm:block sm:w-[92px] sm:shrink-0">
                                            <div className="flex flex-wrap gap-1">
                                                <Pill tone="info">{g.gameType === "3c" ? "3쿠션" : "4구"}</Pill>
                                                {g.rated ? <Pill tone="brand">레이팅</Pill> : <Pill tone="neutral">{g.handicap ? "짧은 판" : "친선"}</Pill>}
                                                {g.voided && <Pill tone="alert">무효</Pill>}
                                            </div>
                                            <p className="text-[11.5px] text-black/45 sm:mt-1">{kstDateTime(g.endedAt)}</p>
                                        </div>
                                        <div className={`w-full min-w-0 flex-1 ${g.voided ? "opacity-60" : ""}`}>
                                            {g.players.map((p, i) => (
                                                <p key={p.id} className="flex items-center gap-2 text-[13.5px]">
                                                    <span className={`min-w-0 flex-1 truncate ${p.winner ? "font-black" : "font-bold text-black/70"}`}>{p.winner && <span className="mr-1 rounded bg-brand/10 px-1 text-[11px] font-black text-brand">승</span>}{p.name}</span>
                                                    <span className="tabular-nums text-black/75">{p.score}<span className="text-black/35">/{p.target}</span></span>
                                                    <span className="w-11 text-right text-[12px] tabular-nums text-black/45">샷 {p.shots}</span>
                                                    <span className={`w-10 text-right text-[12px] font-bold tabular-nums ${g.delta == null ? "text-black/25" : (i === 0 ? g.delta : -g.delta) >= 0 ? "text-brand" : "text-red-600"}`}>{g.delta == null ? "—" : signed(i === 0 ? g.delta : -g.delta)}</span>
                                                </p>
                                            ))}
                                            <p className="mt-0.5 text-[12px] text-black/40">{endReasonLabel(g.endReason)} · HR {Math.max(...g.players.map((p) => p.highRun))}{g.reality ? " · 리얼리티" : ""}{g.cup ? " · 월대회" : ""}</p>
                                            {g.flags.length > 0 && <div className="mt-1.5 flex flex-wrap gap-1">{g.flags.map((f) => <span key={f.id} className="rounded-md bg-red-500/10 px-1.5 py-0.5 text-[12px] font-bold text-red-700">{f.text}</span>)}</div>}
                                            {g.voided && <p className="mt-1 text-[12px] text-black/55">{g.voided.by} — {g.voided.reason}</p>}
                                        </div>
                                    </button>
                                    {open === g.id && <MatchDetail g={g} onOpenMember={onOpenMember} onDone={refresh} />}
                                </div>
                            ))}
                        </Panel>
                    )}
                </section>

                <aside className="min-w-0">
                    <div className="mb-2 flex items-center gap-2">
                        <h3 className="text-[13px] font-black text-black/70">온라인 레이팅</h3>
                        <div className="ml-auto"><FilterChips value={rType} onChange={setRType} options={[{ id: "3c", label: "3쿠션" }, { id: "4c", label: "4구" }]} /></div>
                    </div>
                    {board.length === 0 ? <EmptyState>{ratings.isLoading ? "불러오는 중…" : "아직 레이팅이 없어요."}</EmptyState> : (
                        <Panel className="divide-y divide-black/[0.06]">
                            {board.slice(0, 40).map((r, i) => (
                                <button key={r.memberId} type="button" onClick={() => setMember(member?.memberId === r.memberId ? null : r)} data-testid="admin-rating-row"
                                    className={`flex w-full items-center gap-2.5 px-3.5 py-2 text-left ${member?.memberId === r.memberId ? "bg-brand/[0.06]" : "hover:bg-black/[0.02]"}`}>
                                    <span className="w-5 shrink-0 text-right text-[12px] font-black tabular-nums text-black/35">{i + 1}</span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-[13px] font-black">{r.name}</span>
                                        <span className="block text-[11.5px] text-black/45">{r.matches}판 · 비김 포함 {r.wins}승 · {lastSeenLabel(r.updatedAt)}</span>
                                    </span>
                                    <span className="text-[15px] font-black tabular-nums">{r.rating}</span>
                                </button>
                            ))}
                        </Panel>
                    )}
                    <p className="mt-2 text-[11.5px] leading-snug text-black/40">레이팅은 핸디전 판만으로 쌓여요. 무효로 하거나 되살리면 처음부터 다시 계산합니다(지금 표와 새 계산이 같은지 미리보기에서 확인돼요).</p>
                </aside>
            </div>
        </div>
    );
}
