/**
 * 매장 대회 화면(2026-11-06 — shared/storeCup). /store-cup/<id> — 손님이 참가 신청하고, 대진표를 보고, 내 경기를 랭큐 점수판으로 친다.
 * 대진 · 경기 연결은 크루 대회와 같다(TournamentBracket · GameCreationModal 의 tournamentMatch — 서버가 자리를 확인한다).
 * 방문자는 '가입하고 참가 신청'(가입 팝업, 돌아오면 다시 누르면 된다). 한국어 화면 기준(매장 대회는 한국 매장의 것이다).
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import { LucideChevronLeft } from "@/lib/icons";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useSeo } from "@/hooks/useSeo";
import { openLoginSheet } from "@/components/hiq/LoginSheet";
import { goLoginPage } from "@/components/hiq/LoginGate";
import { TournamentBracket, type BracketMatch } from "@/components/hiq/tournament/TournamentBracket";
import { GameCreationModal } from "@/components/hiq/dashboard/GameCreationModal";
import { HiqNavigation } from "@/components/hiq/HiqNavigation";
import type { HiqMember } from "@shared/schema";
import { STORE_CUP_STATUS, feeText, storeCupLine, storeCupPath } from "@shared/storeCup";

interface Cup { id: string; title: string; description: string | null; status: string; gameType: "3c" | "4c"; maxPlayers: number; bestOf: number; recruitEnd: string | null; startAt: string | null; prize: string | null; entryFee: number | null; championId: string | null }
interface Participant { memberId: string; nickname: string; seed: number | null; status: string; finalRank: number | null; avg3c: number | null; avg4c: number | null }
interface CupData { cup: Cup; store: { name: string; listingCode: string | null }; participants: Participant[]; matches: BracketMatch[] }

const KST = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" });
const when = (iso: string | null) => (iso ? KST.format(new Date(iso)) : null);

export default function StoreCupPage() {
    const [, params] = useRoute("/store-cup/:id");
    const id = params?.id ?? "";
    const [, setLocation] = useLocation();
    const { member } = useAuth();
    const { toast } = useToast();
    const qc = useQueryClient();
    const key = [`/api/hiq/store-cups/${id}`];
    const { data, isLoading, isError } = useQuery<CupData>({ queryKey: key, enabled: !!id, refetchInterval: 20_000 });
    const [playMatch, setPlayMatch] = useState<{ matchId: string; opponent: HiqMember } | null>(null);

    useSeo(data ? { title: `${data.cup.title} — ${data.store.name} | 랭큐`, description: `${data.store.name}의 당구 대회 · ${storeCupLine(data.cup)}. 랭큐에서 참가 신청하고 점수판으로 대진을 치러요.`, path: storeCupPath(id) } : null);

    const join = useMutation({
        mutationFn: (on: boolean) => apiRequest(`/api/hiq/store-cups/${id}/join`, { method: on ? "POST" : "DELETE" }),
        onSuccess: (_r, on) => { toast({ title: on ? "참가 신청했어요" : "참가를 취소했어요" }); void qc.invalidateQueries({ queryKey: key }); },
        onError: (e: any) => toast({ title: e?.message || "지금은 할 수 없어요", variant: "destructive" }),
    });

    if (isLoading) return <div className="min-h-[100dvh] bg-surface-0" aria-busy="true" />;
    if (isError || !data) {
        return (
            <div className="min-h-[100dvh] bg-surface-0 px-6 py-20 text-center">
                <p className="text-[15px] font-semibold text-ink-2">대회를 찾을 수 없어요</p>
                <button type="button" onClick={() => setLocation("/stores")} className="mt-4 h-11 rounded-full bg-brand px-5 text-[14px] font-semibold text-brand-fg">당구장 찾기</button>
            </div>
        );
    }
    const { cup, store, participants, matches } = data;
    const meId = member?.id;
    const joined = !!meId && participants.some((p) => p.memberId === meId);
    const players = Object.fromEntries(participants.map((p) => [p.memberId, { memberId: p.memberId, nickname: p.nickname }]));
    const champion = cup.championId ? participants.find((p) => p.memberId === cup.championId) : null;
    const myTurn = (m: BracketMatch) => !!meId && (m.status === "ready" || m.status === "playing") && !!m.p1Id && !!m.p2Id && (m.p1Id === meId || m.p2Id === meId);
    const myMatch = matches.find(myTurn) ?? null;
    const startMatch = (m: BracketMatch) => {
        if (!meId) return;
        if (m.status === "playing") { if (m.gameId) setLocation(`/game/${m.gameId}`); return; }
        const opp = participants.find((p) => p.memberId === (m.p1Id === meId ? m.p2Id : m.p1Id));
        if (!opp) return;
        setPlayMatch({ matchId: m.id, opponent: { id: opp.memberId, name: opp.nickname, avg3c: opp.avg3c, avg4c: opp.avg4c, average: ((cup.gameType === "3c" ? opp.avg3c : opp.avg4c) ?? 0).toFixed(3) } as unknown as HiqMember });
    };
    const askJoin = () => {
        if (!member) {
            if (!openLoginSheet({ title: `${cup.title} 참가 신청`, desc: "가입하면 바로 신청할 수 있어요. 대진이 나오면 알려 드려요." })) goLoginPage(setLocation);
            return;
        }
        join.mutate(true);
    };
    const recruiting = cup.status === "recruiting";
    const full = participants.length >= cup.maxPlayers;

    return (
        <div className="min-h-screen bg-surface-0 pb-nav font-sans text-ink-1" data-testid="store-cup-page">
            <header className="sticky top-0 z-20 bg-surface-0/95 backdrop-blur">
                <div className="flex h-14 items-center gap-1 px-1">
                    <button type="button" onClick={() => (window.history.length > 1 ? window.history.back() : setLocation(store.listingCode ? `/stores/${store.listingCode}` : "/stores"))} aria-label="뒤로" className="flex h-11 w-11 items-center justify-center rounded-full text-ink-2 active:bg-surface-2">
                        <LucideChevronLeft className="h-6 w-6" />
                    </button>
                    <span className="flex-1 truncate text-[16px] font-semibold">{store.name} 대회</span>
                </div>
            </header>
            <main className="mx-auto flex max-w-[640px] flex-col gap-3 px-4">
                <section className="rk-card p-5">
                    <div className="flex items-center gap-2">
                        <span className="rounded-full bg-brand/10 px-2.5 py-1 text-[12px] font-bold text-brand">{STORE_CUP_STATUS[cup.status] ?? cup.status}</span>
                        {store.listingCode && <button type="button" onClick={() => setLocation(`/stores/${store.listingCode}`)} className="truncate text-[12.5px] font-semibold text-ink-3">{store.name}</button>}
                    </div>
                    <h1 className="mt-2 text-[24px] font-black leading-tight tracking-tight break-keep">{cup.title}</h1>
                    <p className="mt-1 text-[13.5px] font-semibold text-ink-2">{storeCupLine(cup)}</p>
                    <dl className="mt-3 space-y-1.5 text-[13.5px]">
                        {cup.startAt && <div className="flex gap-3"><dt className="w-16 shrink-0 text-ink-3">대회</dt><dd className="font-semibold">{when(cup.startAt)}</dd></div>}
                        {cup.recruitEnd && <div className="flex gap-3"><dt className="w-16 shrink-0 text-ink-3">접수 마감</dt><dd>{when(cup.recruitEnd)}</dd></div>}
                        <div className="flex gap-3"><dt className="w-16 shrink-0 text-ink-3">참가</dt><dd className="tabular-nums">{participants.length} / {cup.maxPlayers}명</dd></div>
                        {cup.entryFee ? <div className="flex gap-3"><dt className="w-16 shrink-0 text-ink-3">참가비</dt><dd>{feeText(cup.entryFee)} <span className="text-ink-3">(현장에서)</span></dd></div> : null}
                        {cup.prize && <div className="flex gap-3"><dt className="w-16 shrink-0 text-ink-3">상품</dt><dd className="break-keep">{cup.prize}</dd></div>}
                    </dl>
                    {cup.description && <p className="mt-3 whitespace-pre-line text-[14px] leading-relaxed text-ink-2 break-keep">{cup.description}</p>}
                    {champion && <p className="mt-3 rounded-xl bg-[#F5B721]/15 px-3.5 py-2.5 text-[14px] font-bold text-[#7A5208]">🏆 우승 {champion.nickname}</p>}
                    {recruiting && (
                        joined ? (
                            <button type="button" onClick={() => join.mutate(false)} disabled={join.isPending} data-testid="store-cup-leave"
                                className="mt-4 h-12 w-full rounded-xl bg-black/[0.05] text-[14.5px] font-bold text-ink-2 disabled:opacity-50">참가 신청됨 · 취소하기</button>
                        ) : (
                            <button type="button" onClick={askJoin} disabled={join.isPending || full} data-track-as="store-cup-join" data-testid="store-cup-join"
                                className="mt-4 h-12 w-full rounded-xl bg-brand text-[15px] font-bold text-brand-fg disabled:opacity-50">
                                {full ? "정원이 찼어요" : member ? "참가 신청" : "가입하고 참가 신청"}
                            </button>
                        )
                    )}
                    {myMatch && (
                        <button type="button" onClick={() => startMatch(myMatch)} data-testid="store-cup-my-match"
                            className="mt-3 h-12 w-full rounded-xl bg-brand text-[15px] font-bold text-brand-fg">
                            {myMatch.status === "playing" ? "내 경기 이어서 치기" : "내 경기 시작 — 랭큐 점수판"}
                        </button>
                    )}
                </section>

                {matches.length > 0 ? (
                    <section className="rk-card p-3" aria-label="대진표">
                        <TournamentBracket matches={matches} players={players} playerCount={participants.length} meId={meId} bestOf={cup.bestOf}
                            canClick={myTurn} onMatchClick={(m) => { if (myTurn(m)) startMatch(m); }} />
                    </section>
                ) : (
                    <section className="rk-card p-5">
                        <p className="text-[13px] font-bold text-ink-3">참가자 {participants.length}명</p>
                        {participants.length === 0 ? (
                            <p className="mt-2 text-[13.5px] text-ink-3">아직 신청한 사람이 없어요. 첫 번째로 신청해 보세요.</p>
                        ) : (
                            <ul className="mt-2 flex flex-wrap gap-1.5">
                                {participants.map((p) => <li key={p.memberId} className={`rounded-full px-3 py-1.5 text-[13px] font-semibold ${p.memberId === meId ? "bg-brand text-brand-fg" : "bg-black/[0.05]"}`}>{p.nickname}</li>)}
                            </ul>
                        )}
                        <p className="mt-3 text-[12.5px] text-ink-3 break-keep">접수가 끝나면 사장님이 대진을 만들어요. 대진이 나오면 알려 드리고, 경기는 랭큐 점수판으로 쳐요.</p>
                    </section>
                )}
            </main>
            <GameCreationModal open={!!playMatch} onOpenChange={(o) => { if (!o) setPlayMatch(null); }} member={member as unknown as HiqMember} history={undefined}
                initialMode="match" initialType={cup.gameType} tournamentMatch={playMatch} />
            <HiqNavigation />
        </div>
    );
}
