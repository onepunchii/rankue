/**
 * 어드민 · 당구 › 월대회(2026-10-16 어드민 전수 조사 — "11/1 첫 대회 전에 대진 보기 · 결과 바꾸기 · 판 무효 · 다시 굴리기").
 * 위는 '다음 대회' — 이번 달 성적이 이대로면 누가 나가고 첫 라운드가 어떻게 짜이는지. 아래는 대회마다의 대진표.
 * 칸을 누르면: 기한 늘리기 · 결과 정하기(아직 안 가려진 판) · 결과 바꾸기(다음 판이 시작 전일 때만) — 까닭은 칸의 운영 기록과 작업 기록에 남는다.
 * 규칙은 shared/simCup(대진) · shared/simCupAdmin(손대도 되는 때).
 */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { appConfirm } from "@/components/AppDialog";
import { cupRoundSize } from "@shared/simCup";
import { CUP_OUTCOME_LABEL, type AdminCupDetail, type AdminCupGameView, type AdminCupNext, type AdminCups } from "@shared/simCupAdmin";
import { EmptyState, FilterChips, Panel, Pill, kstDateTime } from "./adminUtils";

const LIST = "/api/hiq/admin/billiards/cups";
const roundName = (round: number, rounds: number, kind: "main" | "third") => {
    if (kind === "third") return "3·4위전";
    const n = cupRoundSize(round, rounds);
    return n === 2 ? "결승" : n === 4 ? "준결승" : `${n}강`;
};
const MATCH_LABEL: Record<string, string> = { waiting: "대기 방", playing: "치는 중", finished: "끝남", canceled: "닫힘" };
const monthLabel = (m: string) => `${Number(m.slice(5))}월`;

function Seat({ p, ready, won, lost, score }: { p: AdminCupGameView["p1"]; ready: boolean; won: boolean; lost: boolean; score: number | null }) {
    return (
        <div className={`flex items-center gap-2 px-2.5 py-1.5 ${won ? "bg-brand/[0.07]" : ""}`}>
            <span className={`w-6 shrink-0 rounded text-center text-[11px] font-black tabular-nums ${p ? "bg-black/[0.06] text-black/55" : "text-black/25"}`}>{p?.seed ?? "–"}</span>
            <span className={`min-w-0 flex-1 truncate text-[13px] ${won ? "font-black text-black/90" : lost ? "font-bold text-black/40 line-through decoration-black/20" : p ? "font-bold text-black/75" : "text-black/30"}`}>{p?.name ?? "아직 안 정해짐"}</span>
            {p && <span title={ready ? "들어옴" : "아직 안 들어옴"} className={`h-1.5 w-1.5 shrink-0 rounded-full ${ready ? "bg-brand" : "bg-black/15"}`} />}
            {score !== null && <span className="w-6 text-right text-[12.5px] font-black tabular-nums text-black/70">{score}</span>}
        </div>
    );
}

function GameCard({ g, rounds, picked, onPick }: { g: AdminCupGameView; rounds: number; picked: boolean; onPick?: () => void }) {
    const winner = g.winnerId;
    return (
        <button type="button" onClick={onPick} disabled={!onPick} data-testid="admin-cup-game"
            className={`w-full overflow-hidden rounded-xl border bg-white text-left ${picked ? "border-brand ring-2 ring-brand/20" : "border-black/[0.08]"} ${onPick ? "hover:border-black/20" : "cursor-default"}`}>
            <div className="flex items-center gap-1.5 border-b border-black/[0.05] px-2.5 py-1">
                <span className="text-[11px] font-black text-black/45">{roundName(g.round, rounds, g.kind)}{g.kind === "main" && g.round < rounds ? ` · ${g.slot + 1}` : ""}</span>
                {g.notes.length > 0 && <span className="rounded bg-amber-500/15 px-1 text-[10.5px] font-black text-amber-700">운영자 {g.notes.length}</span>}
                <span className="ml-auto text-[11px] font-bold text-black/40">
                    {g.outcome ? CUP_OUTCOME_LABEL[g.outcome] : g.match ? MATCH_LABEL[g.match.status] ?? g.match.status : g.p1 && g.p2 ? `기한 ${kstDateTime(g.deadlineAt)}` : ""}
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

function NextCup({ n, rules }: { n: AdminCupNext; rules: AdminCups["rules"] }) {
    const rounds = n.size ? Math.log2(n.size) : 0;
    return (
        <div data-testid="admin-cup-next"><Panel className="p-4">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h3 className="text-[15px] font-black">다음 대회 — {monthLabel(n.month)} 성적으로</h3>
                <span className="text-[12.5px] text-black/50">{kstDateTime(n.startsAt)} 시작 · 3쿠션</span>
                <span className="ml-auto">{n.size ? <Pill tone="brand">지금 이대로면 {n.entrants.length}명 → {n.size}강</Pill> : <Pill tone="neutral">지금 이대로면 열리지 않아요({n.entrants.length}명)</Pill>}</span>
            </div>
            <p className="mt-1 text-[12px] text-black/45">레이팅 {rules.minRating} 이상 · 그 달 {rules.minMatches}판 이상 · {rules.maxEntrants}명까지 · 라운드마다 {rules.roundDays}일 · 3명이 안 되면 그 달은 없습니다.</p>
            {n.entrants.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                    {n.entrants.map((e) => (
                        <span key={e.memberId} className="flex items-center gap-1.5 rounded-lg bg-black/[0.04] px-2 py-1 text-[12.5px]">
                            <b className="tabular-nums text-black/45">{e.seed}</b><b className="text-black/80">{e.name}</b><span className="tabular-nums text-black/45">{e.rating} · {e.matches}판</span>
                        </span>
                    ))}
                </div>
            )}
            {n.games.length > 0 && (
                <div className="mt-3">
                    <p className="mb-1.5 text-[12px] font-black text-black/55">첫 라운드({roundName(1, rounds, "main")}) — 부전승은 열리자마자 다음 칸으로</p>
                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{n.games.map((g) => <GameCard key={g.slot} g={g} rounds={rounds} picked={false} />)}</div>
                </div>
            )}
        </Panel></div>
    );
}

function GameActions({ g, rounds, onDone }: { g: AdminCupGameView; rounds: number; onDone: () => void }) {
    const { toast } = useToast();
    const [reason, setReason] = useState("");
    const [winner, setWinner] = useState<string | null | undefined>(undefined);
    const [forfeit, setForfeit] = useState(false);
    const [hours, setHours] = useState<"12" | "24" | "48">("24");
    useEffect(() => { setReason(""); setWinner(undefined); setForfeit(false); }, [g.id]);
    const run = useMutation({
        mutationFn: (kind: "extend" | "decide" | "change") => apiRequest(`${LIST}/games/${g.id}/${kind}`, { method: "POST", body: kind === "extend" ? { hours: Number(hours), reason } : { winnerId: winner, loserForfeit: forfeit, reason } }),
        onSuccess: (_d: any, kind) => { toast({ title: kind === "extend" ? "기한을 늘렸어요" : kind === "decide" ? "결과를 정하고 대진을 굴렸어요" : "결과를 바꾸고 대진을 다시 굴렸어요" }); setReason(""); onDone(); },
        onError: (e: any) => toast({ title: e?.message || "처리하지 못했어요", variant: "destructive" }),
    });
    const open = !g.outcome;
    const chooser = (g.decide.ok || g.change.ok) && g.p1 && g.p2;
    const nameOf = (id: string | null | undefined) => (id === null ? "둘 다 기권" : id === g.p1?.id ? g.p1?.name : g.p2?.name);
    return (
        <div data-testid="admin-cup-actions"><Panel className="space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-2">
                <h4 className="text-[14px] font-black">{roundName(g.round, rounds, g.kind)} — {g.p1?.name ?? "?"} : {g.p2?.name ?? "?"}</h4>
                {g.outcome && <Pill tone="info">{CUP_OUTCOME_LABEL[g.outcome]}</Pill>}
                {g.match && <Pill tone="neutral">대전 {MATCH_LABEL[g.match.status] ?? g.match.status}{g.match.score ? ` ${g.match.score[0]}:${g.match.score[1]}` : ""}</Pill>}
            </div>
            <p className="text-[12px] text-black/50">기한 {kstDateTime(g.deadlineAt)}{g.decidedAt ? ` · 가림 ${kstDateTime(g.decidedAt)}` : ""} · 들어옴 {g.p1?.name ?? "-"} {g.p1Ready ? "○" : "×"} / {g.p2?.name ?? "-"} {g.p2Ready ? "○" : "×"}</p>

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
            {open && (
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[12.5px] font-black text-black/65">기한 늘리기</span>
                    <FilterChips value={hours} onChange={setHours} options={[{ id: "12", label: "12시간" }, { id: "24", label: "24시간" }, { id: "48", label: "48시간" }]} />
                </div>
            )}
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="까닭(대진표 운영 기록 · 작업 기록에 남아요)" className="h-9 text-[13px]" />
            <div className="flex flex-wrap gap-2">
                {open && <Button data-admin-write variant="outline" disabled={!reason.trim() || run.isPending} className="h-9 text-[13px] font-bold" onClick={() => run.mutate("extend")}>기한 {hours}시간 늘리기</Button>}
                {chooser && (
                    <Button data-admin-write variant="outline" disabled={!reason.trim() || winner === undefined || run.isPending} className="h-9 border-red-500/40 text-[13px] font-bold text-red-600 hover:bg-red-50"
                        onClick={async () => { if (await appConfirm({ message: `${open ? "결과를 정할까요?" : "결과를 바꿀까요?"}\n\n${nameOf(winner)}${winner ? " 승" : ""}${winner && forfeit ? "(상대 기권)" : ""}\n\n열린 대회 방은 닫히고, 승자가 다음 칸에 앉습니다.`, tone: "danger", confirmText: open ? "정하기" : "바꾸기" })) run.mutate(open ? "decide" : "change"); }}>
                        {open ? "결과 정하기" : "결과 바꾸기"}
                    </Button>
                )}
            </div>
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
    const game = detail.data?.games.find((g) => g.id === picked) ?? null;
    const refresh = () => { void qc.invalidateQueries({ queryKey: [LIST] }); void qc.invalidateQueries({ queryKey: [`${LIST}/${current}`] }); };
    const roll = useMutation({
        mutationFn: () => apiRequest(`${LIST}/${current}/sync`, { method: "POST", body: {} }),
        onSuccess: (d: any) => { toast({ title: "지금 시각까지 굴렸어요", description: `새로 짝 ${d?.paired ?? 0} · 결과 ${d?.decided ?? 0}${d?.finished ? " · 대회 끝" : ""}` }); refresh(); },
        onError: (e: any) => toast({ title: e?.message || "굴리지 못했어요", variant: "destructive" }),
    });

    if (list.isLoading) return <EmptyState>불러오는 중…</EmptyState>;
    const d = detail.data;
    return (
        <div className="space-y-4" data-testid="admin-billiards-cup">
            {(list.data?.next ?? []).map((n) => <NextCup key={n.gameType} n={n} rules={list.data!.rules} />)}

            <section>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                    <h3 className="text-[13px] font-black text-black/70">대회</h3>
                    {cups.length > 0 && <div className="min-w-0 max-w-full"><FilterChips value={current ?? ""} onChange={(v) => { setCupId(v); setPicked(null); }} options={cups.map((c) => ({ id: c.id, label: `${monthLabel(c.month)} ${c.status === "running" ? "치르는 중" : c.status === "finished" ? "끝남" : "안 열림"}` }))} /></div>}
                    {d?.cup.status === "running" && <Button data-admin-write variant="outline" disabled={roll.isPending} onClick={() => roll.mutate()} className="h-8 text-[12.5px] font-bold sm:ml-auto">{roll.isPending ? "굴리는 중…" : "지금 굴리기"}</Button>}
                </div>
                {cups.length === 0 ? (
                    <EmptyState>아직 열린 대회가 없어요. 첫 대회는 11월 1일 03:15 정리 작업이 10월 성적으로 엽니다.</EmptyState>
                ) : !d ? <EmptyState>불러오는 중…</EmptyState> : d.cup.status === "skipped" ? (
                    <EmptyState>{monthLabel(d.cup.month)} 대회는 출전자가 3명이 안 돼 열지 않았어요.</EmptyState>
                ) : (
                    <div className="space-y-3">
                        <p className="text-[12.5px] text-black/50">{monthLabel(d.cup.month)} 성적 · {d.cup.size}강 · {kstDateTime(d.cup.startsAt)} 시작 · 가린 판 {d.cup.decided}/{d.cup.games}{d.cup.finishedAt ? ` · ${kstDateTime(d.cup.finishedAt)} 끝` : ""}</p>
                        <Panel className="p-3"><Bracket games={d.games} rounds={d.rounds} picked={picked} onPick={(g) => setPicked(picked === g.id ? null : g.id)} /></Panel>
                        {game && <GameActions g={game} rounds={d.rounds} onDone={refresh} />}
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
