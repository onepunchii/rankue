import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import {
    LucideTrophy, LucidePlus, LucideChevronLeft, LucideUsers, LucideRefreshCw,
    LucideArrowLeftRight, LucideTrash2, LucidePlay, LucideLoader2, LucideCheck,
} from "@/lib/icons";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/lib/i18n";
import { useLocation } from "wouter";
import { BallDot } from "@/components/hiq/BallDot";
import { TournamentBracket, type BracketMatch, type BracketPlayer, type SlotRef } from "@/components/hiq/tournament/TournamentBracket";
import { CreateCrewTournamentDialog } from "@/components/hiq/tournament/CreateCrewTournamentDialog";
import { GameCreationModal } from "@/components/hiq/dashboard/GameCreationModal";
import type { HiqMember, HiqGameHistory } from "@shared/schema";

// 크루 대회 탭. 목록 ↔ 상세를 한 컴포넌트에서 오간다(정모·투표 탭과 같은 결).
//
// 흐름: 개설(크루장) → 참가 신청(승인 없이 즉시 확정) → 대진 짜기(크루장, 자리 조정 가능)
//     → 대진에서 경기 시작(매칭 화면이 열려 핸디캡을 거기서 맞춘다) → 승자 자동 진출 → 우승.

interface Props {
    crewId: string;
    isAdmin: boolean;
    isMember: boolean;
    me: HiqMember | undefined;
    /** 홈의 "만들기"로 들어온 경우 — 탭이 열리자마자 개설 다이얼로그를 띄운다. */
    autoOpenCreate?: boolean;
    onAutoOpenHandled?: () => void;
    /** 명예의 전당에서 역대 대회를 눌러 들어온 경우 — 그 대회 대진표를 바로 연다. */
    autoOpenTournamentId?: string | null;
}

interface TournamentRow {
    id: string; title: string; description: string | null;
    gameType: "3c" | "4c"; format: "knockout" | "league";
    maxPlayers: number; status: string; championId: string | null; bestOf?: number;
    prize: string | null; startAt: string | null; recruitEnd: string | null;
    creatorId: string; participantCount: number; championName?: string | null;
}

export function CrewTournamentTab({ crewId, isAdmin, isMember, me, autoOpenCreate, onAutoOpenHandled, autoOpenTournamentId }: Props) {
    const { t } = useT();
    const [, setLocation] = useLocation();
    // 매칭 화면이 목표 점수를 뽑을 때 쓴다. 대시보드와 같은 쿼리키라 캐시를 그대로 나눠 쓴다.
    const { data: history } = useQuery<HiqGameHistory[]>({ queryKey: ["/api/hiq/history"], enabled: !!me });
    const [openId, setOpenId] = useState<string | null>(null);
    const [isCreateOpen, setIsCreateOpen] = useState(false);

    // 홈에서 "만들기"를 눌러 넘어온 경우 다이얼로그를 한 번만 자동으로 연다.
    useEffect(() => {
        if (autoOpenCreate && isAdmin) {
            setOpenId(null);
            setIsCreateOpen(true);
            onAutoOpenHandled?.();
        }
    }, [autoOpenCreate, isAdmin, onAutoOpenHandled]);

    // 명예의 전당에서 역대 대회를 눌러 넘어온 경우 그 대진표를 연다.
    useEffect(() => {
        if (autoOpenTournamentId) {
            setOpenId(autoOpenTournamentId);
            onAutoOpenHandled?.();
        }
    }, [autoOpenTournamentId, onAutoOpenHandled]);

    const { data: list, isLoading } = useQuery<TournamentRow[]>({
        queryKey: [`/api/hiq/crews/${crewId}/tournaments`],
        enabled: !!crewId && isMember,
    });

    if (openId) {
        return (
            <TournamentDetail
                crewId={crewId} tournamentId={openId} isAdmin={isAdmin} me={me} history={history}
                onBack={() => setOpenId(null)}
            />
        );
    }

    return (
        <div className="space-y-6 pt-5 pb-nav">
            <div className="px-6 flex items-center justify-between">
                <div>
                    <h2 className="text-[15px] font-semibold text-ink-3">{t("crewTournament.title")}</h2>
                    <p className="text-xs text-ink-4 mt-1 font-medium flex items-center gap-1.5 rk-num">
                        <LucideTrophy className="w-3 h-3" />
                        {t("crewTournament.count").replace("{n}", String(list?.length ?? 0))}
                    </p>
                </div>
                <div className="flex items-center gap-1.5">
                    {/* 명예의 전당 — 대회를 보러 온 자리에서 바로 갈 수 있게 */}
                    <button
                        type="button"
                        onClick={() => setLocation(`/crew/${crewId}/hall-of-fame`)}
                        className="h-10 w-10 rounded-xl border border-surface-line flex items-center justify-center active:opacity-60"
                        aria-label={t("hallOfFame.title")}
                    >
                        <LucideTrophy className="w-4 h-4 text-gold" />
                    </button>
                    {isAdmin && (
                        <Button
                            onClick={() => setIsCreateOpen(true)}
                            className="h-10 px-4 bg-brand hover:bg-brand/90 text-brand-fg font-semibold rounded-xl flex items-center gap-2"
                        >
                            <LucidePlus className="w-4 h-4" />
                            {t("crewTournament.open")}
                        </Button>
                    )}
                </div>
            </div>

            <div className="px-6 space-y-3">
                {isLoading && (
                    <div className="flex justify-center py-14">
                        <LucideLoader2 className="w-5 h-5 animate-spin text-ink-4" />
                    </div>
                )}

                {!isLoading && (list?.length ?? 0) === 0 && (
                    <div className="rk-card px-6 py-12 text-center">
                        <LucideTrophy className="w-9 h-9 mx-auto text-ink-4 mb-3" />
                        <p className="text-sm font-semibold text-ink-2">{t("crewTournament.emptyTitle")}</p>
                        <p className="text-[13px] text-ink-4 mt-1.5 leading-relaxed">
                            {isAdmin ? t("crewTournament.emptyAdmin") : t("crewTournament.emptyMember")}
                        </p>
                    </div>
                )}

                {list?.map((row) => (
                    <button
                        key={row.id}
                        onClick={() => setOpenId(row.id)}
                        className="w-full flex items-stretch rounded-tile bg-white overflow-hidden text-left shadow-[0_1px_2px_rgba(0,0,0,0.05)] active:scale-[0.99] transition-transform"
                    >
                        {/* 왼쪽 띠가 종목 색 — 목록을 훑을 때 빨강·노랑만 보고 갈린다. */}
                        <span
                            className="w-1 shrink-0"
                            style={{ background: row.gameType === "3c" ? "var(--ball-red)" : "var(--ball-yellow)" }}
                        />
                        <span className="flex-1 min-w-0 px-4 py-3.5">
                            <span className="flex items-center gap-2">
                                <span className="flex-1 min-w-0 truncate text-[15px] font-semibold text-ink-1">{row.title}</span>
                                <StatusChip status={row.status} />
                            </span>
                            <span className="mt-1.5 flex items-center gap-2 text-[12.5px] text-ink-3">
                                {/* 끝난 대회는 우승자가 제일 중요한 정보다 */}
                                {row.status === "ended" && row.championName ? (
                                    <span className="flex items-center gap-1 font-semibold text-ink-2">
                                        <LucideTrophy className="w-3.5 h-3.5" style={{ color: "var(--gold-fill)" }} />
                                        {row.championName}
                                    </span>
                                ) : (
                                    <span className="flex items-center gap-1 rk-num">
                                        <LucideUsers className="w-3 h-3" />
                                        {row.participantCount}/{row.maxPlayers}
                                    </span>
                                )}
                                <span className="text-ink-4">·</span>
                                <span>{row.gameType === "3c" ? t("crewTournament.type3c") : t("crewTournament.type4c")}</span>
                                {row.prize && (
                                    <><span className="text-ink-4">·</span><span className="truncate">{row.prize}</span></>
                                )}
                            </span>
                        </span>
                    </button>
                ))}
            </div>

            <CreateCrewTournamentDialog crewId={crewId} open={isCreateOpen} onOpenChange={setIsCreateOpen} />
        </div>
    );
}

function StatusChip({ status }: { status: string }) {
    const { t } = useT();
    const map: Record<string, { label: string; cls: string }> = {
        recruiting: { label: t("crewTournament.status.recruiting"), cls: "bg-brand/10 text-brand" },
        drawn: { label: t("crewTournament.status.drawn"), cls: "bg-brand/10 text-brand" },
        ongoing: { label: t("crewTournament.status.ongoing"), cls: "bg-brand text-brand-fg" },
        ended: { label: t("crewTournament.status.ended"), cls: "bg-surface-3 text-ink-3" },
        canceled: { label: t("crewTournament.status.canceled"), cls: "bg-surface-3 text-ink-4" },
    };
    const s = map[status] ?? map.recruiting;
    return <span className={cn("rk-chip shrink-0 text-[11px]", s.cls)}>{s.label}</span>;
}

// ────────────────────────────── 상세 ──────────────────────────────

interface Detail {
    tournament: TournamentRow & { crewId: string };
    participants: Array<{
        id: string; memberId: string; seed: number | null; status: string;
        finalRank: number | null; wins: number; losses: number;
        nickname: string; rating3c: number; rating4c: number;
        avg3c: number | null; avg4c: number | null;
    }>;
    matches: BracketMatch[];
}

function TournamentDetail({ crewId, tournamentId, isAdmin, me, history, onBack }: {
    crewId: string; tournamentId: string; isAdmin: boolean;
    me: HiqMember | undefined; history: HiqGameHistory[] | undefined;
    onBack: () => void;
}) {
    const { t } = useT();
    const { toast } = useToast();
    const qc = useQueryClient();
    const [, setLocation] = useLocation();
    const [swapMode, setSwapMode] = useState(false);
    const [picked, setPicked] = useState<SlotRef | null>(null);
    const [playMatch, setPlayMatch] = useState<{ matchId: string; opponent: HiqMember } | null>(null);

    const key = `/api/hiq/crews/${crewId}/tournaments/${tournamentId}`;
    const listKey = `/api/hiq/crews/${crewId}/tournaments`;
    const { data, isLoading } = useQuery<Detail>({ queryKey: [key] });

    const refresh = () => {
        qc.invalidateQueries({ queryKey: [key] });
        qc.invalidateQueries({ queryKey: [listKey] });
    };
    const fail = (err: any) => toast({ title: t("crewTournament.actionFail"), description: err?.message, variant: "destructive" });

    const joinM = useMutation({
        mutationFn: () => apiRequest(`${key}/join`, { method: "POST" }),
        onSuccess: () => { toast({ title: t("crewTournament.joined") }); refresh(); },
        onError: fail,
    });
    const leaveM = useMutation({
        mutationFn: () => apiRequest(`${key}/join`, { method: "DELETE" }),
        onSuccess: refresh, onError: fail,
    });
    const drawM = useMutation({
        mutationFn: (shuffle: boolean) => apiRequest(`${key}/draw`, { method: "POST", body: JSON.stringify({ shuffle }) }),
        onSuccess: () => { toast({ title: t("crewTournament.drawDone") }); setSwapMode(false); setPicked(null); refresh(); },
        onError: fail,
    });
    const swapM = useMutation({
        mutationFn: (body: { a: SlotRef; b: SlotRef }) => apiRequest(`${key}/swap`, { method: "POST", body: JSON.stringify(body) }),
        onSuccess: () => { setPicked(null); refresh(); },
        onError: (e) => { setPicked(null); fail(e); },
    });
    const resetM = useMutation({
        mutationFn: (matchId: string) => apiRequest(`${key}/matches/${matchId}/reset`, { method: "POST" }),
        onSuccess: () => { toast({ title: t("crewTournament.resetDone") }); refresh(); },
        onError: fail,
    });
    const deleteM = useMutation({
        mutationFn: () => apiRequest(key, { method: "DELETE" }),
        onSuccess: () => { toast({ title: t("crewTournament.deleted") }); qc.invalidateQueries({ queryKey: [listKey] }); onBack(); },
        onError: fail,
    });

    const players = useMemo(() => {
        const map: Record<string, BracketPlayer> = {};
        for (const p of data?.participants ?? []) map[p.memberId] = { memberId: p.memberId, nickname: p.nickname };
        return map;
    }, [data]);

    if (isLoading || !data) {
        return (
            <div className="flex justify-center py-24">
                <LucideLoader2 className="w-5 h-5 animate-spin text-ink-4" />
            </div>
        );
    }

    const { tournament: tr, participants, matches } = data;
    const joined = participants.some((p) => p.memberId === me?.id);
    const isLeague = tr.format === "league";
    // 대회는 2명부터(오너 결정 2026-09-04) — 서버도 같은 기준으로 거절한다.
    const canDraw = isAdmin && tr.status !== "ended" && participants.length >= 2;
    const drawn = matches.length > 0;
    const willBeLeague = tr.format === "league";
    const bestOf = tr.bestOf ?? 1;

    // 자리 조정 — 두 자리를 차례로 누르면 맞바꾼다.
    const onSlotClick = (ref: SlotRef, memberId: string | null) => {
        if (!picked) { setPicked(ref); return; }
        if (picked.matchId === ref.matchId && picked.side === ref.side) { setPicked(null); return; }
        swapM.mutate({ a: picked, b: ref });
    };

    // 내가 지금 칠 수 있는 경기인지 — 두 자리가 다 찼고, 내가 그중 하나이고, 아직 안 끝났다.
    const myTurn = (m: BracketMatch) =>
        !!me && (m.status === "ready" || m.status === "playing") &&
        !!m.p1Id && !!m.p2Id && (m.p1Id === me.id || m.p2Id === me.id);

    const onMatchClick = (m: BracketMatch) => {
        if (!myTurn(m) || !me) return;

        // 이미 시작된 경기는 **새로 만들지 않고 그 경기로 들어간다**. 예전엔 '경기중' 카드를
        // 다시 눌러도 매칭 화면이 열려 같은 자리에서 랭킹 경기가 계속 만들어졌다
        // (대진에는 첫 경기만 물려 있어서 승자도 안 올라가고 RP 만 쌓였다).
        if (m.status === "playing") {
            if (m.gameId) setLocation(`/game/${m.gameId}`);
            else toast({ title: t("crewTournament.alreadyPlaying") });
            return;
        }

        const opponentId = m.p1Id === me.id ? m.p2Id : m.p1Id;
        const opp = participants.find((p) => p.memberId === opponentId);
        if (!opp) return;
        setPlayMatch({
            matchId: m.id,
            // 매칭 화면은 id·이름·종목별 에버리지로 상대 목표 점수를 뽑는다.
            // 에버리지를 안 넘기면 상대가 기본값 15점으로 앉는다.
            opponent: {
                id: opp.memberId, name: opp.nickname,
                avg3c: opp.avg3c, avg4c: opp.avg4c,
                // 상대 카드의 "AVG" 표시는 종목 구분 없는 average 컬럼을 읽는다.
                // 대회 종목에 맞는 값을 넣어야 3쿠션 대회에서 4구 평균이 뜨지 않는다.
                average: ((tr.gameType === "3c" ? opp.avg3c : opp.avg4c) ?? 0).toFixed(3),
            } as unknown as HiqMember,
        });
    };

    return (
        <div className="space-y-5 pt-3 pb-nav">
            <div className="px-6 pt-1 flex items-center gap-2">
                <button onClick={onBack} className="-ml-2 p-2 text-ink-3 active:opacity-60" aria-label={t("common.back")}>
                    <LucideChevronLeft className="w-5 h-5" />
                </button>
                <BallDot type={tr.gameType} size={13} />
                <span className="flex-1 min-w-0 truncate text-[16px] font-semibold text-ink-1">{tr.title}</span>
                <StatusChip status={tr.status} />
            </div>

            {/* 메타 한 줄 — 종목·인원·형식·상품을 흩어 놓지 않고 모아 둔다.
                예전엔 상품만 금색 알약으로 혼자 떠 있어 태그처럼 보였다. */}
            <div className="px-6 -mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-ink-3">
                <span>{tr.gameType === "3c" ? t("crewTournament.type3c") : t("crewTournament.type4c")}</span>
                <span className="text-ink-4">·</span>
                <span className="rk-num">{participants.length}/{tr.maxPlayers}</span>
                <span className="text-ink-4">·</span>
                {/* 2인 대회는 토너먼트라 부를 게 없다 — 판 수가 곧 형식이다. */}
                {participants.length > 2 && !isLeague && <span>{t("crewTournament.knockout")}</span>}
                {isLeague && <span>{t("crewTournament.league")}</span>}
                {bestOf > 1 && (
                    <>
                        <span className="text-ink-4">·</span>
                        <span className="rk-num">{bestOf === 1 ? t("crewTournament.bestOf1") : t("crewTournament.bestOfWin").replace("{n}", String(bestOf)).replace("{w}", String(Math.ceil(bestOf / 2)))}</span>
                    </>
                )}
                {tr.prize && (
                    <>
                        <span className="text-ink-4">·</span>
                        <span className="font-medium" style={{ color: "var(--gold)" }}>{tr.prize}</span>
                    </>
                )}
            </div>
            {tr.description && <p className="px-6 text-[13px] text-ink-3 leading-relaxed">{tr.description}</p>}

            {/* 대진표 (또는 리그 순위표) */}
            {drawn && (
                <div className="px-5">
                    {isLeague ? (
                        <LeagueTable participants={participants} matches={matches} players={players} onMatchClick={onMatchClick} canPlay={myTurn} bestOf={bestOf} />
                    ) : (
                        <TournamentBracket
                            matches={matches}
                            players={players}
                            playerCount={participants.length}
                            meId={me?.id}
                            bestOf={bestOf}
                            onMatchClick={onMatchClick}
                            swapMode={swapMode}
                            selectedSlot={picked}
                            onSlotClick={onSlotClick}
                        />
                    )}
                </div>
            )}

            {swapMode && (
                <p className="px-6 text-[12.5px] text-brand font-medium">
                    {picked ? t("crewTournament.swapPickSecond") : t("crewTournament.swapPickFirst")}
                </p>
            )}

            {/* 참가자 */}
            <div className="px-6 space-y-2">
                <div className="flex items-center justify-between">
                    <h3 className="text-[13px] font-semibold text-ink-3">
                        {t("crewTournament.roster")} <span className="rk-num text-ink-4">{participants.length}/{tr.maxPlayers}</span>
                    </h3>
                    {!drawn && participants.length < 2 && (
                        <span className="text-[11.5px] text-ink-4">{t("crewTournament.minPlayersHint")}</span>
                    )}
                </div>
                <div className="rk-card overflow-hidden">
                    {participants.length === 0 && (
                        <p className="px-4 py-6 text-center text-[13px] text-ink-4">{t("crewTournament.noPlayers")}</p>
                    )}
                    {participants.map((p, i) => (
                        <div key={p.id} className={cn("flex items-center gap-2.5 px-4 py-2.5", i > 0 && "border-t border-surface-line")}>
                            <span className="w-4 text-[11px] text-ink-4 rk-num">{p.seed ?? i + 1}</span>
                            <span className="w-6 h-6 rounded-full bg-brand/10 text-brand flex items-center justify-center text-[11px] font-semibold shrink-0">
                                {p.nickname?.[0] ?? "?"}
                            </span>
                            <span className="flex-1 min-w-0 truncate text-[13px] font-medium text-ink-2">{p.nickname}</span>
                            {p.finalRank === 1 && <LucideTrophy className="w-3.5 h-3.5 text-gold" />}
                            <span className="text-[11.5px] text-ink-3 rk-num">
                                {(tr.gameType === "3c" ? p.rating3c : p.rating4c) ?? 0} RP
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            {/* 조작 */}
            <div className="px-6 space-y-2.5">
                {tr.status === "recruiting" && !joined && (
                    <Button onClick={() => joinM.mutate()} disabled={joinM.isPending || participants.length >= tr.maxPlayers}
                        className="w-full h-12 bg-brand hover:bg-brand/90 text-brand-fg font-semibold rounded-xl">
                        {participants.length >= tr.maxPlayers ? t("crewTournament.full") : t("crewTournament.join")}
                    </Button>
                )}
                {tr.status === "recruiting" && joined && (
                    <Button variant="outline" onClick={() => leaveM.mutate()} disabled={leaveM.isPending}
                        className="w-full h-11 rounded-xl border-surface-line text-ink-2">
                        <LucideCheck className="w-4 h-4 mr-1.5 text-brand" />
                        {t("crewTournament.leave")}
                    </Button>
                )}

                {canDraw && (
                    <div className="flex gap-2">
                        <Button onClick={() => drawM.mutate(false)} disabled={drawM.isPending}
                            className="flex-1 h-11 bg-brand hover:bg-brand/90 text-brand-fg font-semibold rounded-xl">
                            {drawn ? t("crewTournament.redraw") : willBeLeague ? t("crewTournament.drawLeague") : t("crewTournament.draw")}
                        </Button>
                        {drawn && (
                            <Button variant="outline" onClick={() => drawM.mutate(true)} disabled={drawM.isPending}
                                className="h-11 px-3 rounded-xl border-surface-line" aria-label={t("crewTournament.shuffle")}>
                                <LucideRefreshCw className="w-4 h-4 text-ink-2" />
                            </Button>
                        )}
                    </div>
                )}

                {/* 시작만 하고 끝내지 않은 경기 되돌리기 — 안 그러면 그 칸이 영구히 "경기중"으로
                    굳고 재추첨도 막혀 대회를 통째로 지워야 한다. */}
                {isAdmin && matches.some((m) => m.status === "playing") && (
                    <div className="rk-card p-3.5 space-y-2">
                        <p className="text-[12.5px] text-ink-3">{t("crewTournament.resetHint")}</p>
                        {matches.filter((m) => m.status === "playing").map((m) => (
                            <button
                                key={m.id}
                                onClick={() => resetM.mutate(m.id)}
                                disabled={resetM.isPending}
                                className="w-full h-10 rounded-xl border border-surface-line text-[13px] text-ink-2 flex items-center justify-center gap-1.5 active:opacity-70"
                            >
                                <LucideRefreshCw className="w-3.5 h-3.5" />
                                {t("crewTournament.resetMatch")
                                    .replace("{a}", (m.p1Id && players[m.p1Id]?.nickname) || "-")
                                    .replace("{b}", (m.p2Id && players[m.p2Id]?.nickname) || "-")}
                            </button>
                        ))}
                    </div>
                )}

                {isAdmin && drawn && !isLeague && tr.status !== "ended" && (
                    <Button variant="outline" onClick={() => { setSwapMode(!swapMode); setPicked(null); }}
                        className={cn("w-full h-11 rounded-xl border-surface-line", swapMode && "border-brand text-brand")}>
                        <LucideArrowLeftRight className="w-4 h-4 mr-1.5" />
                        {swapMode ? t("crewTournament.swapDone") : t("crewTournament.swapStart")}
                    </Button>
                )}

                {isAdmin && (
                    <button onClick={() => { if (confirm(t("crewTournament.deleteConfirm"))) deleteM.mutate(); }}
                        className="w-full h-10 text-[13px] text-ink-4 flex items-center justify-center gap-1.5 active:opacity-60">
                        <LucideTrash2 className="w-3.5 h-3.5" />
                        {t("crewTournament.delete")}
                    </button>
                )}
            </div>

            {/* 대진에서 경기 시작 — 매칭 화면이 그대로 열려 핸디캡을 여기서 맞춘다 */}
            <GameCreationModal
                open={!!playMatch}
                onOpenChange={(o) => { if (!o) setPlayMatch(null); }}
                member={me}
                history={history}
                initialMode="match"
                initialType={tr.gameType}
                tournamentMatch={playMatch}
            />
        </div>
    );
}

/** 풀리그 — 대진표 대신 순위표 + 경기 목록. 3명 이하일 때 쓴다. */
function LeagueTable({ participants, matches, players, onMatchClick, canPlay, bestOf = 1 }: {
    participants: Detail["participants"];
    matches: BracketMatch[];
    players: Record<string, BracketPlayer>;
    onMatchClick: (m: BracketMatch) => void;
    canPlay: (m: BracketMatch) => boolean;
    bestOf?: number;
}) {
    const { t } = useT();
    const ranked = [...participants].sort((a, b) => (b.wins - a.wins) || (a.losses - b.losses));
    return (
        <div className="space-y-4">
            <div className="rk-card overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-2 border-b border-surface-line text-[11px] text-ink-4 rk-num">
                    <span className="w-4">#</span>
                    <span className="flex-1">{t("crewTournament.player")}</span>
                    <span className="w-12 text-right">{t("crewTournament.record")}</span>
                </div>
                {ranked.map((p, i) => (
                    <div key={p.id} className={cn("flex items-center gap-2 px-4 py-2.5", i > 0 && "border-t border-surface-line")}>
                        <span className="w-4 text-[12px] text-ink-3 rk-num">{p.finalRank ?? i + 1}</span>
                        <span className="flex-1 min-w-0 truncate text-[13px] font-medium text-ink-1">{p.nickname}</span>
                        {p.finalRank === 1 && <LucideTrophy className="w-3.5 h-3.5 text-gold" />}
                        <span className="w-12 text-right text-[12px] text-ink-2 rk-num">{t("crewTournament.winLoss").replace("{w}", String(p.wins)).replace("{l}", String(p.losses))}</span>
                    </div>
                ))}
            </div>

            <div className="space-y-1.5">
                {matches.map((m) => {
                    const done = m.status === "done";
                    const playable = canPlay(m);
                    const Row = (
                        <div className={cn(
                            "flex items-center gap-2 px-3.5 py-2.5 rounded-xl border text-[12.5px]",
                            done ? "bg-surface-1 border-surface-line" : playable ? "bg-brand/[0.06] border-brand/30" : "border-dashed border-[var(--surface-line-strong)]",
                        )}>
                            <span className={cn("flex-1 min-w-0 truncate", m.winnerId === m.p1Id ? "font-semibold text-ink-1" : "text-ink-3")}>
                                {m.p1Id ? players[m.p1Id]?.nickname : "-"}
                            </span>
                            <span className="rk-num text-ink-3 shrink-0">
                                {bestOf > 1 && (m.p1Wins || m.p2Wins || done) ? `${m.p1Wins}-${m.p2Wins}` : done ? `${m.p1Score ?? 0} : ${m.p2Score ?? 0}` : playable ? <LucidePlay className="w-3.5 h-3.5 text-brand" /> : "vs"}
                            </span>
                            <span className={cn("flex-1 min-w-0 truncate text-right", m.winnerId === m.p2Id ? "font-semibold text-ink-1" : "text-ink-3")}>
                                {m.p2Id ? players[m.p2Id]?.nickname : "-"}
                            </span>
                        </div>
                    );
                    return playable
                        ? <button key={m.id} onClick={() => onMatchClick(m)} className="w-full text-left active:scale-[0.99] transition-transform">{Row}</button>
                        : <div key={m.id}>{Row}</div>;
                })}
            </div>
        </div>
    );
}
