/**
 * 어드민 · 당구 › 월대회(2026-10-16 어드민 전수 조사 · 2026-11-03 운영자가 여는 대회로 — 오너: "우리가 지정된 날짜에 방을 만듬 … 대전자(승인된)가 참석").
 * 순서: ① 대회 만들기 — 기준 달의 성적으로 추천된 사람이 미리 골라져 있고, 빼고 더한 뒤 '대진 짜기'(짜는 중 — 회원에게 안 보인다)
 *       ② 대진표에서 판을 눌러 경기 시각을 정한다(한국 시각 · 10분 전부터 입장 · 15분 뒤 판정)
 *       ③ '대회 열기' — 첫 라운드의 판이 다 시각을 가져야 열린다. 출전자에게 알림이 간다.
 * 치르는 중에는 다음 라운드의 시각을 정하고, 결과를 정하거나 바꿀 수 있다. 짜는 중인 대회는 지우고, 치르는 중인 대회는 무효로 할 수 있다.
 * 규칙은 shared/simCup(대진) · shared/simCupAdmin(손대도 되는 때).
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { appConfirm } from "@/components/AppDialog";
import { cupRoundSize, cupSize } from "@shared/simCup";
import { CUP_OUTCOME_LABEL, CUP_STATUS_LABEL, type AdminCupCandidates, type AdminCupDetail, type AdminCupGameView, type AdminCups } from "@shared/simCupAdmin";
import { EmptyState, FilterChips, Panel, Pill, kstDateTime } from "./adminUtils";

const LIST = "/api/hiq/admin/billiards/cups";
const roundName = (round: number, rounds: number, kind: "main" | "third") => {
    if (kind === "third") return "3·4위전";
    const n = cupRoundSize(round, rounds);
    return n === 2 ? "결승" : n === 4 ? "준결승" : `${n}강`;
};
const MATCH_LABEL: Record<string, string> = { waiting: "대기 방", playing: "치는 중", finished: "끝남", canceled: "닫힘" };
const monthLabel = (m: string) => `${Number(m.slice(5))}월`;
/** 한국 시각의 달 "YYYY-MM" — n 달 앞뒤 */
const kstMonth = (shift = 0) => { const d = new Date(Date.now() + 9 * 3_600_000); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + shift); return d.toISOString().slice(0, 7); };
/** datetime-local 의 값(한국 시각으로 읽는다) ↔ ISO */
const kstInputOf = (iso: string | null) => (iso ? new Date(Date.parse(iso) + 9 * 3_600_000).toISOString().slice(0, 16) : "");
const isoOfKstInput = (v: string) => { const t = Date.parse(`${v}:00+09:00`); return Number.isFinite(t) ? new Date(t).toISOString() : null; };

function Seat({ p, ready, won, lost, score }: { p: AdminCupGameView["p1"]; ready: boolean; won: boolean; lost: boolean; score: number | null }) {
    return (
        <div className={`flex items-center gap-2 px-2.5 py-1.5 ${won ? "bg-brand/[0.07]" : ""}`}>
            <span className={`w-6 shrink-0 rounded text-center text-[11px] font-black tabular-nums ${p ? "bg-black/[0.06] text-black/55" : "text-black/25"}`}>{p?.seed ?? "–"}</span>
            <span className={`min-w-0 flex-1 truncate text-[13px] ${won ? "font-black text-black/90" : lost ? "font-bold text-black/40 line-through decoration-black/20" : p ? "font-bold text-black/75" : "text-black/30"}`}>{p?.name ?? "아직 안 정해짐"}</span>
            {p && <span title={ready ? "입장함" : "아직 입장 안 함"} className={`h-1.5 w-1.5 shrink-0 rounded-full ${ready ? "bg-brand" : "bg-black/15"}`} />}
            {score !== null && <span className="w-6 text-right text-[12.5px] font-black tabular-nums text-black/70">{score}</span>}
        </div>
    );
}

function GameCard({ g, rounds, picked, onPick }: { g: AdminCupGameView; rounds: number; picked: boolean; onPick?: () => void }) {
    const winner = g.winnerId;
    const when = g.scheduledAt ? kstDateTime(g.scheduledAt) : g.p1 && g.p2 ? "시각 미정" : "";
    return (
        <button type="button" onClick={onPick} disabled={!onPick} data-testid="admin-cup-game"
            className={`w-full overflow-hidden rounded-xl border bg-white text-left ${picked ? "border-brand ring-2 ring-brand/20" : "border-black/[0.08]"} ${onPick ? "hover:border-black/20" : "cursor-default"}`}>
            <div className="flex items-center gap-1.5 border-b border-black/[0.05] px-2.5 py-1">
                <span className="text-[11px] font-black text-black/45">{roundName(g.round, rounds, g.kind)}{g.kind === "main" && g.round < rounds ? ` · ${g.slot + 1}` : ""}</span>
                {g.notes.length > 0 && <span className="rounded bg-amber-500/15 px-1 text-[10.5px] font-black text-amber-700">운영자 {g.notes.length}</span>}
                <span className={`ml-auto text-[11px] font-bold ${!g.outcome && !g.match && g.p1 && g.p2 && !g.scheduledAt ? "text-amber-700" : "text-black/40"}`}>
                    {g.outcome ? CUP_OUTCOME_LABEL[g.outcome] : g.match ? MATCH_LABEL[g.match.status] ?? g.match.status : when}
                </span>
            </div>
            <Seat p={g.p1} ready={g.p1Ready} won={!!winner && winner === g.p1?.id} lost={!!g.outcome && g.outcome !== "bye" && !!g.p1 && winner !== g.p1.id} score={g.match?.score?.[0] ?? null} />
            <div className="h-px bg-black/[0.05]" />
            <Seat p={g.p2} ready={g.p2Ready} won={!!winner && winner === g.p2?.id} lost={!!g.outcome && g.outcome !== "bye" && !!g.p2 && winner !== g.p2.id} score={g.match?.score?.[1] ?? null} />
        </button>
    );
}

/** 대진표 — 라운드마다 한 줄(넓은 화면은 가로로), 3·4위전은 결승 옆에 */
function Bracket({ games, rounds, picked, onPick }: { games: AdminCupGameView[]; rounds: number; picked?: string | null; onPick?: (g: AdminCupGameView) => void }) {
    const cols = Array.from({ length: rounds }, (_, i) => i + 1);
    return (
        <div className="-mx-1 overflow-x-auto px-1 pb-1">
            <div className="grid min-w-max auto-cols-[minmax(210px,1fr)] grid-flow-col gap-3">
                {cols.map((r) => {
                    const list = games.filter((g) => g.round === r).sort((a, b) => (a.kind === b.kind ? a.slot - b.slot : a.kind === "main" ? -1 : 1));
                    return (
                        <div key={r} className="flex flex-col gap-2">
                            <p className="text-[12px] font-black text-black/55">{roundName(r, rounds, "main")}</p>
                            {/* 칸은 앞 라운드 두 칸의 가운데에 오도록 세로로 고르게 */}
                            <div className="flex flex-1 flex-col justify-around gap-2.5">
                                {list.map((g) => <GameCard key={`${g.kind}-${g.round}-${g.slot}`} g={g} rounds={rounds} picked={!!g.id && picked === g.id} onPick={onPick && g.id ? () => onPick(g) : undefined} />)}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

/** ① 대회 만들기 — 기준 달의 후보에서 고른다(추천은 미리 골라 둔다) */
function CreateCup({ rules, onMade }: { rules: AdminCups["rules"]; onMade: (id: string) => void }) {
    const { toast } = useToast();
    const months = [kstMonth(-1), kstMonth(0), kstMonth(-2)];
    const [month, setMonth] = useState(months[0]);
    const cand = useQuery<AdminCupCandidates>({ queryKey: [`${LIST}/candidates?month=${month}`] });
    const [picked, setPicked] = useState<Set<string>>(new Set());
    // 달을 바꾸면 그 달의 추천으로 다시 고른다(많으면 레이팅 높은 순으로 최대 인원까지)
    useEffect(() => {
        const list = cand.data?.candidates ?? [];
        setPicked(new Set(list.filter((c) => c.suggested).slice(0, rules.maxEntrants).map((c) => c.memberId)));
    }, [cand.data, rules.maxEntrants]);
    const make = useMutation({
        mutationFn: () => apiRequest(LIST, { method: "POST", body: { month, memberIds: [...picked] } }) as Promise<{ id: string }>,
        onSuccess: (d) => { toast({ title: "대진을 짰어요 — 판마다 경기 시각을 정한 뒤 '대회 열기'를 눌러 주세요" }); onMade(d.id); },
        onError: (e: any) => toast({ title: e?.message || "만들지 못했어요", variant: "destructive" }),
    });
    const n = picked.size, size = cupSize(n);
    const toggle = (id: string) => setPicked((cur) => { const next = new Set(cur); if (next.has(id)) next.delete(id); else if (next.size < rules.maxEntrants) next.add(id); return next; });
    const list = cand.data?.candidates ?? [];
    return (
        <div data-testid="admin-cup-create"><Panel className="space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-[15px] font-black">대회 만들기 — 3쿠션</h3>
                <FilterChips value={month} onChange={setMonth} options={months.map((m) => ({ id: m, label: `${monthLabel(m)} 성적` }))} />
            </div>
            <p className="text-[12px] text-black/50">
                추천: 그 달 {rules.minMatches}판 이상 · 레이팅 {rules.minRating} 이상(미리 골라 둠). 빼고 더해 {rules.minEntrants}~{rules.maxEntrants}명. 시드는 레이팅 순.
                경기는 판마다 정한 시각 {rules.enterEarlyMin}분 전부터 입장하고, {rules.noShowMin}분 안에 안 들어온 사람은 기권이에요.
            </p>
            {cand.isLoading ? <p className="text-[12.5px] text-black/45">후보를 불러오는 중…</p> : cand.data?.taken ? (
                <p className="text-[12.5px] font-bold text-amber-700">{monthLabel(month)} 성적의 대회가 이미 있어요({CUP_STATUS_LABEL[cand.data.taken] ?? cand.data.taken}). 다른 달을 고르세요.</p>
            ) : list.length === 0 ? (
                <p className="text-[12.5px] text-black/45">{monthLabel(month)}에 온라인 3쿠션 레이팅 판을 친 사람이 없어요.</p>
            ) : (
                <>
                    <div className="grid max-h-[320px] gap-1 overflow-y-auto sm:grid-cols-2">
                        {list.map((c) => (
                            <label key={c.memberId} className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12.5px] ${picked.has(c.memberId) ? "bg-brand/[0.07]" : "bg-black/[0.03]"}`}>
                                <input type="checkbox" checked={picked.has(c.memberId)} onChange={() => toggle(c.memberId)} className="h-4 w-4 accent-[#0a6b3f]" />
                                <b className="min-w-0 flex-1 truncate text-black/80">{c.name}</b>
                                <span className="shrink-0 tabular-nums text-black/50">{c.rating} · {c.matches}판</span>
                                {c.suggested && <span className="shrink-0 rounded bg-brand/10 px-1 text-[10.5px] font-black text-brand">추천</span>}
                            </label>
                        ))}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        {size ? <Pill tone="brand">{n}명 → {size}강</Pill> : <Pill tone="neutral">{n}명 — {rules.minEntrants}명 이상 골라 주세요</Pill>}
                        <Button data-admin-write disabled={!size || make.isPending} className="h-9 text-[13px] font-bold sm:ml-auto" onClick={() => make.mutate()}>
                            {make.isPending ? "짜는 중…" : "이 사람들로 대진 짜기"}
                        </Button>
                    </div>
                </>
            )}
        </Panel></div>
    );
}

function GameActions({ g, rounds, running, onDone }: { g: AdminCupGameView; rounds: number; running: boolean; onDone: () => void }) {
    const { toast } = useToast();
    const [reason, setReason] = useState("");
    const [winner, setWinner] = useState<string | null | undefined>(undefined);
    const [forfeit, setForfeit] = useState(false);
    const [at, setAt] = useState(kstInputOf(g.scheduledAt));
    useEffect(() => { setReason(""); setWinner(undefined); setForfeit(false); setAt(kstInputOf(g.scheduledAt)); }, [g.id, g.scheduledAt]);
    const run = useMutation({
        mutationFn: (kind: "decide" | "change") => apiRequest(`${LIST}/games/${g.id}/${kind}`, { method: "POST", body: { winnerId: winner, loserForfeit: forfeit, reason } }),
        onSuccess: (_d: any, kind) => { toast({ title: kind === "decide" ? "결과를 정하고 대진을 굴렸어요" : "결과를 바꾸고 대진을 다시 굴렸어요" }); setReason(""); onDone(); },
        onError: (e: any) => toast({ title: e?.message || "처리하지 못했어요", variant: "destructive" }),
    });
    const schedule = useMutation({
        mutationFn: (iso: string | null) => apiRequest(`${LIST}/games/${g.id}/schedule`, { method: "POST", body: { at: iso, reason: reason.trim() || undefined } }),
        onSuccess: (_d: any, iso) => { toast({ title: iso ? `경기 시각을 ${kstDateTime(iso)}(한국)로 정했어요${running && g.p1 && g.p2 ? " — 두 사람에게 알렸어요" : ""}` : "시각을 지웠어요(일정 미정)" }); onDone(); },
        onError: (e: any) => toast({ title: e?.message || "정하지 못했어요", variant: "destructive" }),
    });
    const open = !g.outcome;
    const chooser = (g.decide.ok || g.change.ok) && g.p1 && g.p2;
    const nameOf = (id: string | null | undefined) => (id === null ? "둘 다 기권" : id === g.p1?.id ? g.p1?.name : g.p2?.name);
    const iso = at ? isoOfKstInput(at) : null;
    return (
        <div data-testid="admin-cup-actions"><Panel className="space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-2">
                <h4 className="text-[14px] font-black">{roundName(g.round, rounds, g.kind)} — {g.p1?.name ?? "?"} : {g.p2?.name ?? "?"}</h4>
                {g.outcome && <Pill tone="info">{CUP_OUTCOME_LABEL[g.outcome]}</Pill>}
                {g.match && <Pill tone="neutral">대전 {MATCH_LABEL[g.match.status] ?? g.match.status}{g.match.score ? ` ${g.match.score[0]}:${g.match.score[1]}` : ""}</Pill>}
            </div>
            <p className="text-[12px] text-black/50">경기 {g.scheduledAt ? `${kstDateTime(g.scheduledAt)}(한국)` : "시각 미정"}{g.decidedAt ? ` · 가림 ${kstDateTime(g.decidedAt)}` : ""} · 입장 {g.p1?.name ?? "-"} {g.p1Ready ? "○" : "×"} / {g.p2?.name ?? "-"} {g.p2Ready ? "○" : "×"}</p>

            {g.schedule.ok && (
                <div className="space-y-2 rounded-xl bg-black/[0.03] p-3" data-testid="admin-cup-schedule">
                    <p className="text-[12.5px] font-black text-black/65">경기 시각(한국 시각) <span className="font-medium text-black/45">— 10분 전부터 입장 · 15분 뒤 판정. 바꾸면 그 판의 입장 기록이 지워져요</span></p>
                    <div className="flex flex-wrap items-center gap-2">
                        <Input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} className="h-9 w-auto text-[13px]" />
                        <Button data-admin-write variant="outline" disabled={!iso || schedule.isPending} className="h-9 text-[13px] font-bold" onClick={() => schedule.mutate(iso)}>{g.scheduledAt ? "시각 바꾸기" : "시각 정하기"}</Button>
                        {g.scheduledAt && <Button data-admin-write variant="ghost" disabled={schedule.isPending} className="h-9 text-[12.5px] text-black/55" onClick={() => schedule.mutate(null)}>시각 지우기</Button>}
                    </div>
                </div>
            )}
            {chooser && (
                <div className="space-y-2 rounded-xl bg-black/[0.03] p-3">
                    <p className="text-[12.5px] font-black text-black/65">{open ? "결과 정하기" : "결과 바꾸기"}{!open && <span className="font-medium text-black/45"> — 대전 기록 · 레이팅은 그대로, 대진만 바뀌어요</span>}</p>
                    <div className="flex flex-wrap gap-1.5">
                        {[g.p1!.id, g.p2!.id, null].map((id) => (
                            <button key={String(id)} type="button" onClick={() => setWinner(id)}
                                className={`h-8 rounded-full px-3 text-[12.5px] font-bold ${winner === id ? "bg-brand text-white" : "border border-black/[0.1] bg-white text-black/65"}`}>{id === null ? "둘 다 기권" : `${nameOf(id)} 승`}</button>
                        ))}
                    </div>
                    {winner && (
                        <label className="flex items-center gap-2 text-[12.5px] text-black/65">
                            <input type="checkbox" checked={forfeit} onChange={(e) => setForfeit(e.target.checked)} className="h-4 w-4 accent-[#0a6b3f]" />
                            진 사람은 기권으로(메달 · 3·4위전 자격 없음)
                        </label>
                    )}
                </div>
            )}
            {!chooser && !open && <p className="text-[12.5px] text-black/45">{g.change.why}</p>}
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="까닭(대진표 운영 기록 · 작업 기록에 남아요 — 결과를 정하거나 바꿀 때는 꼭)" className="h-9 text-[13px]" />
            {chooser && (
                <div className="flex flex-wrap gap-2">
                    <Button data-admin-write variant="outline" disabled={!reason.trim() || winner === undefined || run.isPending} className="h-9 border-red-500/40 text-[13px] font-bold text-red-600 hover:bg-red-50"
                        onClick={async () => { if (await appConfirm({ message: `${open ? "결과를 정할까요?" : "결과를 바꿀까요?"}\n\n${nameOf(winner)}${winner ? " 승" : ""}${winner && forfeit ? "(상대 기권)" : ""}\n\n열린 대회 방은 닫히고, 승자가 다음 칸에 앉습니다.`, tone: "danger", confirmText: open ? "정하기" : "바꾸기" })) run.mutate(open ? "decide" : "change"); }}>
                        {open ? "결과 정하기" : "결과 바꾸기"}
                    </Button>
                </div>
            )}
            {g.notes.length > 0 && (
                <ul className="space-y-1 border-t border-black/[0.06] pt-2">
                    {g.notes.map((n, i) => <li key={i} className="text-[12px] text-black/55"><b className="text-black/70">{n.text}</b> · {n.reason} · {n.by} {kstDateTime(n.at)}</li>)}
                </ul>
            )}
        </Panel></div>
    );
}

export default function BilliardsCupView() {
    const qc = useQueryClient();
    const { toast } = useToast();
    const list = useQuery<AdminCups>({ queryKey: [LIST] });
    const cups = Array.isArray(list.data?.cups) ? list.data!.cups : [];
    const [cupId, setCupId] = useState<string | null>(null);
    const current = cupId ?? cups[0]?.id ?? null;
    const detail = useQuery<AdminCupDetail>({ queryKey: [`${LIST}/${current}`], enabled: !!current });
    const [picked, setPicked] = useState<string | null>(null);
    const [voidReason, setVoidReason] = useState("");
    const game = detail.data?.games.find((g) => g.id === picked) ?? null;
    const refresh = () => { void qc.invalidateQueries({ queryKey: [LIST] }); void qc.invalidateQueries({ queryKey: [`${LIST}/${current}`] }); };
    const act = useMutation({
        mutationFn: (kind: "sync" | "publish" | "remove" | "void") => kind === "remove"
            ? apiRequest(`${LIST}/${current}`, { method: "DELETE" })
            : apiRequest(`${LIST}/${current}/${kind}`, { method: "POST", body: kind === "void" ? { reason: voidReason } : {} }),
        onSuccess: (d: any, kind) => {
            toast({ title: kind === "sync" ? "지금 시각까지 굴렸어요" : kind === "publish" ? `대회를 열었어요 — 출전자 ${d?.entrants ?? 0}명에게 알렸어요` : kind === "remove" ? "짜던 대회를 지웠어요" : "대회를 무효로 했어요", description: kind === "sync" ? `새로 짝 ${d?.paired ?? 0} · 결과 ${d?.decided ?? 0}${d?.finished ? " · 대회 끝" : ""}` : undefined });
            if (kind === "remove") setCupId(null);
            setVoidReason("");
            refresh();
        },
        onError: (e: any) => toast({ title: e?.message || "처리하지 못했어요", variant: "destructive" }),
    });
    const d = detail.data;
    const unscheduled = useMemo(() => (d?.games ?? []).filter((g) => g.kind === "main" && g.round === 1 && !g.outcome && g.p1 && g.p2 && !g.scheduledAt).length, [d]);

    if (list.isLoading) return <EmptyState>불러오는 중…</EmptyState>;
    return (
        <div className="space-y-4" data-testid="admin-billiards-cup">
            {list.data?.rules && <CreateCup rules={list.data.rules} onMade={(id) => { setCupId(id); setPicked(null); refresh(); }} />}

            <section>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                    <h3 className="text-[13px] font-black text-black/70">대회</h3>
                    {cups.length > 0 && <div className="min-w-0 max-w-full"><FilterChips value={current ?? ""} onChange={(v) => { setCupId(v); setPicked(null); }} options={cups.map((c) => ({ id: c.id, label: `${monthLabel(c.month)} ${CUP_STATUS_LABEL[c.status] ?? c.status}`, alert: c.status === "draft" }))} /></div>}
                    {d?.cup.status === "running" && <Button data-admin-write variant="outline" disabled={act.isPending} onClick={() => act.mutate("sync")} className="h-8 text-[12.5px] font-bold sm:ml-auto">지금 굴리기</Button>}
                </div>
                {cups.length === 0 ? (
                    <EmptyState>아직 만든 대회가 없어요. 위에서 출전자를 고르고 대진을 짜 주세요.</EmptyState>
                ) : !d ? <EmptyState>불러오는 중…</EmptyState> : d.cup.status === "skipped" ? (
                    <EmptyState>{monthLabel(d.cup.month)} 대회는 출전자가 3명이 안 돼 열지 않았어요.</EmptyState>
                ) : (
                    <div className="space-y-3">
                        <p className="text-[12.5px] text-black/50">{monthLabel(d.cup.month)} 성적 · {d.cup.size}강 · {CUP_STATUS_LABEL[d.cup.status] ?? d.cup.status}{d.cup.status !== "draft" ? ` · ${kstDateTime(d.cup.startsAt)} 열림` : ""} · 가린 판 {d.cup.decided}/{d.cup.games}{d.cup.finishedAt ? ` · ${kstDateTime(d.cup.finishedAt)} 끝` : ""}</p>
                        {d.cup.status === "draft" && (
                            <Panel className="flex flex-wrap items-center gap-2 p-3" >
                                <p className="min-w-0 flex-1 text-[12.5px] text-black/60">{unscheduled > 0 ? `첫 라운드 ${unscheduled}판의 경기 시각을 정하면 열 수 있어요 — 판을 눌러 정하세요.` : "첫 라운드 시각이 다 있어요. 열면 출전자에게 알림이 가요."}</p>
                                <Button data-admin-write disabled={unscheduled > 0 || act.isPending} className="h-9 text-[13px] font-bold" data-testid="admin-cup-publish"
                                    onClick={async () => { if (await appConfirm({ message: "대회를 열까요?\n\n회원에게 대진표가 보이고, 출전자에게 알림이 갑니다.", confirmText: "열기" })) act.mutate("publish"); }}>대회 열기</Button>
                                <Button data-admin-write variant="ghost" disabled={act.isPending} className="h-9 text-[12.5px] text-red-600"
                                    onClick={async () => { if (await appConfirm({ message: "짜던 대회를 지울까요?", tone: "danger", confirmText: "지우기" })) act.mutate("remove"); }}>지우기</Button>
                            </Panel>
                        )}
                        <Panel className="p-3"><Bracket games={d.games} rounds={d.rounds} picked={picked} onPick={(g) => setPicked(picked === g.id ? null : g.id)} /></Panel>
                        {game && <GameActions g={game} rounds={d.rounds} running={d.cup.status === "running"} onDone={refresh} />}
                        {d.cup.status === "running" && (
                            <Panel className="flex flex-wrap items-center gap-2 p-3">
                                <Input value={voidReason} onChange={(e) => setVoidReason(e.target.value)} placeholder="무효로 하는 까닭" className="h-9 min-w-[200px] flex-1 text-[13px]" />
                                <Button data-admin-write variant="outline" disabled={!voidReason.trim() || act.isPending} className="h-9 border-red-500/40 text-[13px] font-bold text-red-600 hover:bg-red-50"
                                    onClick={async () => { if (await appConfirm({ message: "이 대회를 무효로 할까요?\n\n열린 대회 방이 닫히고, 회원에게 대진표가 안 보입니다. 메달은 나가지 않습니다.", tone: "danger", confirmText: "무효로 하기" })) act.mutate("void"); }}>대회 무효</Button>
                            </Panel>
                        )}
                        {d.cup.status === "finished" && (
                            <Panel className="divide-y divide-black/[0.06]">
                                {d.entries.filter((e) => e.place).sort((a, b) => (a.place ?? 99) - (b.place ?? 99)).map((e) => (
                                    <div key={e.memberId} className="flex items-center gap-3 px-4 py-2 text-[13px]">
                                        <span className="w-10 font-black tabular-nums">{e.place}등</span><span className="flex-1 font-bold">{e.name}</span>
                                        {e.medal ? <Pill tone="brand">메달</Pill> : e.forfeit ? <Pill tone="neutral">기권</Pill> : null}
                                    </div>
                                ))}
                            </Panel>
                        )}
                    </div>
                )}
            </section>
        </div>
    );
}
