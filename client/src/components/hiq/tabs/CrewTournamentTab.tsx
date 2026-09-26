import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
    LucideTrophy, LucidePlus, LucideChevronLeft, LucideUsers, LucideRefreshCw,
    LucideArrowLeftRight, LucideTrash2, LucidePlay, LucideCheck, LucidePencil, LucideCalendar, LucideSwords,
} from "@/lib/icons";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/lib/i18n";
import { useLocation } from "wouter";
import { BallDot } from "@/components/hiq/BallDot";
import {
    CREW_BTN, CREW_CARD, CREW_TEXT, ConfirmDialog, CrewAvatar, CrewEmpty, CrewError, CrewSection, CrewSkeleton, IconButton, CrewTabHeader } from "@/components/hiq/crew-ui";
import { TournamentBracket, type BracketMatch, type BracketPlayer, type SlotRef } from "@/components/hiq/tournament/TournamentBracket";
import { CreateCrewTournamentDialog } from "@/components/hiq/tournament/CreateCrewTournamentDialog";
import { MatchResultSheet } from "@/components/hiq/tournament/MatchResultSheet";
import { formatKst } from "@/components/hiq/poll/crewTimeFormat";
import { GameCreationModal } from "@/components/hiq/dashboard/GameCreationModal";
import { findMyNextMatch } from "@shared/crewTournamentRules";
import { roundName, totalRounds, bracketSize } from "@shared/tournamentBracket";
import type { HiqMember, HiqGameHistory } from "@shared/schema";

// 크루 대회 탭. 목록 ↔ 상세를 한 컴포넌트에서 오간다(정모·투표 탭과 같은 결).
//
// 흐름: 개설(크루장) → 참가 신청(승인 없이 즉시 확정) → 대진 짜기(크루장, 자리 조정 가능)
//     → 대진에서 경기 시작(매칭 화면이 열려 핸디캡을 거기서 맞춘다) → 승자 자동 진출 → 우승.
//
// 2026-09-26 크루 정비:
//  - 상세는 대진이 나온 뒤(drawn·ongoing) 15초마다 다시 불러온다. 전역 기본값(5분 캐시, 포커스 새로고침 없음) 때문에
//    남의 경기가 끝나도 대진표가 그대로였다. 탭에 들어올 때마다(refetchOnMount always) 새로 받는다.
//  - 상세를 열면 주소에 ?open=<id> 를 남긴다 — 대진에서 경기를 치고 돌아오면(뒤로) 목록이 아니라 그 대진표로 돌아온다.
//  - 불러오기 실패(지워진 대회를 가리키는 옛 ?open= 링크 = 404)는 끝없이 도는 대신 '찾을 수 없어요' + 뒤로.
//  - 되돌릴 수 없는 조작(다시 뽑기·섞기·경기 되돌리기·참가 취소·삭제)은 모두 확인 창을 거친다.
//  - 풀리그 표(LeagueTable)는 지웠다 — 서버가 개설을 항상 토너먼트로 만든다(crew.ts, 2026-09-04 오너 결정).

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
    /** 머리의 '‹' — 크루 홈으로 */
    onBack?: () => void;
}

interface TournamentRow {
    id: string; title: string; description: string | null;
    gameType: "3c" | "4c"; format: "knockout" | "league";
    maxPlayers: number; status: string; championId: string | null; bestOf?: number;
    prize: string | null; startAt: string | null; recruitEnd: string | null;
    creatorId: string; participantCount: number; championName?: string | null;
}

export function CrewTournamentTab({ crewId, isAdmin, isMember, me, autoOpenCreate, onAutoOpenHandled, autoOpenTournamentId, onBack }: Props) {
    const { t, locale } = useT();
    const [, setLocation] = useLocation();
    // 매칭 화면이 목표 점수를 뽑을 때 쓴다. 대시보드와 같은 쿼리키라 캐시를 그대로 나눠 쓴다.
    const { data: history } = useQuery<HiqGameHistory[]>({ queryKey: ["/api/hiq/history"], enabled: !!me });
    const [openId, setOpenIdState] = useState<string | null>(null);
    const [isCreateOpen, setIsCreateOpen] = useState(false);

    // 상세를 열고 닫을 때 주소도 맞춘다(replace — 뒤로 가기 기록을 늘리지 않는다).
    const setOpenId = (id: string | null) => {
        setOpenIdState(id);
        setLocation(id ? `/crew/${crewId}/tournament?open=${id}` : `/crew/${crewId}/tournament`, { replace: true });
    };

    // 홈에서 "만들기"를 눌러 넘어온 경우 다이얼로그를 한 번만 자동으로 연다.
    useEffect(() => {
        if (autoOpenCreate && isAdmin) {
            setOpenIdState(null);
            setIsCreateOpen(true);
            onAutoOpenHandled?.();
        }
    }, [autoOpenCreate, isAdmin, onAutoOpenHandled]);

    // 명예의 전당·알림·경기 후 뒤로 가기(?open=)로 넘어온 경우 그 대진표를 연다.
    useEffect(() => {
        if (autoOpenTournamentId) {
            setOpenIdState(autoOpenTournamentId);
            onAutoOpenHandled?.();
        }
    }, [autoOpenTournamentId, onAutoOpenHandled]);

    const listKey = `/api/hiq/crews/${crewId}/tournaments`;
    const { data: list, isLoading, isError, refetch } = useQuery<TournamentRow[]>({
        queryKey: [listKey],
        enabled: !!crewId && isMember,
        refetchOnMount: "always",
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
        <div className="pb-nav flex flex-col">
            {/* 머리 한 줄: ‹ 대회 n …… [명예의 전당] [+ 대회 열기] (2026-09-26 크루 안쪽 정리 — 머리가 두 번 겹치지 않게) */}
            <CrewTabHeader title={t("crewTournament.title")} count={list?.length || undefined} onBack={onBack} backLabel={t("common.back")}>
                {/* 명예의 전당 — 대회를 보러 온 자리에서 바로 갈 수 있게 */}
                <IconButton label={t("hallOfFame.title")} onClick={() => setLocation(`/crew/${crewId}/hall-of-fame`)} className="text-gold">
                    <LucideTrophy />
                </IconButton>
                {isAdmin && (
                    <button type="button" onClick={() => setIsCreateOpen(true)} className={CREW_BTN.add}>
                        <LucidePlus />
                        {t("crewTournament.open")}
                    </button>
                )}
            </CrewTabHeader>
            <div className="px-4 pt-1 flex flex-col gap-4">

            {isLoading ? (
                <CrewSkeleton rows={3} height={84} />
            ) : isError ? (
                <CrewError onRetry={() => refetch()} />
            ) : (list?.length ?? 0) === 0 ? (
                <CrewEmpty
                    icon={<LucideTrophy />}
                    title={t("crewTournament.emptyTitle")}
                    desc={isAdmin ? t("crewTournament.emptyAdmin") : t("crewTournament.emptyMember")}
                    action={isAdmin ? { label: t("crewTournament.open"), onClick: () => setIsCreateOpen(true) } : undefined}
                />
            ) : (
                <div className="flex flex-col gap-2.5">
                    {list!.map((row) => (
                        <button
                            key={row.id}
                            type="button"
                            onClick={() => setOpenId(row.id)}
                            className={cn(CREW_CARD, "relative overflow-hidden w-full text-left pl-5 active:scale-[0.99] transition-transform")}
                        >
                            {/* 왼쪽 띠가 종목 색 — 목록을 훑을 때 빨강·노랑만 보고 갈린다. */}
                            <span aria-hidden="true" className="absolute left-0 inset-y-0 w-1"
                                style={{ background: row.gameType === "3c" ? "var(--ball-red)" : "var(--ball-yellow)" }} />
                            <span className="flex items-center gap-2">
                                <span className="flex-1 min-w-0 truncate text-[15px] font-semibold text-ink-1">{row.title}</span>
                                <StatusChip status={row.status} />
                            </span>
                            <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] font-medium text-ink-3">
                                {/* 끝난 대회는 우승자가 제일 중요한 정보다 */}
                                {row.status === "ended" && row.championName ? (
                                    <span className="flex items-center gap-1 font-semibold text-ink-2">
                                        <LucideTrophy className="w-3.5 h-3.5 text-gold" />
                                        {row.championName}
                                    </span>
                                ) : (
                                    <span className="flex items-center gap-1 rk-num">
                                        <LucideUsers className="w-3.5 h-3.5" />
                                        {row.participantCount}/{row.maxPlayers}
                                    </span>
                                )}
                                <span className="text-ink-4">·</span>
                                <span>{row.gameType === "3c" ? t("crewTournament.type3c") : t("crewTournament.type4c")}</span>
                                {row.prize && <><span className="text-ink-4">·</span><span className="truncate max-w-[40%]">{row.prize}</span></>}
                            </span>
                            <TournamentDates row={row} locale={locale} className="mt-1" />
                        </button>
                    ))}
                </div>
            )}
            </div>

            <CreateCrewTournamentDialog crewId={crewId} open={isCreateOpen} onOpenChange={setIsCreateOpen} />
        </div>
    );
}

/** 접수 마감·시작 일시 한 줄(한국 시각). 접수중이면 접수 마감을, 그 뒤엔 시작 일시를 앞세운다. */
function TournamentDates({ row, locale, className }: { row: Pick<TournamentRow, "status" | "recruitEnd" | "startAt">; locale: Parameters<typeof formatKst>[1]; className?: string }) {
    const { t } = useT();
    const parts: string[] = [];
    if (row.recruitEnd && row.status === "recruiting") parts.push(t("crewTourney.recruitEndAt").replace("{time}", formatKst(row.recruitEnd, locale)));
    if (row.startAt && row.status !== "ended" && row.status !== "canceled") parts.push(t("crewTourney.startAtAt").replace("{time}", formatKst(row.startAt, locale)));
    if (parts.length === 0) return null;
    return (
        <span className={cn("flex items-center gap-1.5 text-[13px] font-medium text-ink-3 rk-num", className)}>
            <LucideCalendar className="w-3.5 h-3.5 shrink-0" />
            <span className="min-w-0">{parts.join(" · ")}</span>
        </span>
    );
}

/** 상태 칩 — 접수중(옅은 초록)·대진 확정(초록 테두리)·진행중(꽉 찬 초록)이 한눈에 갈린다. 예전엔 앞의 둘이 같은 모양이었다. */
function StatusChip({ status }: { status: string }) {
    const { t } = useT();
    const map: Record<string, { label: string; cls: string }> = {
        recruiting: { label: t("crewTournament.status.recruiting"), cls: "bg-brand/10 text-brand" },
        drawn: { label: t("crewTournament.status.drawn"), cls: "border border-brand/50 text-brand" },
        ongoing: { label: t("crewTournament.status.ongoing"), cls: "bg-brand text-brand-fg" },
        ended: { label: t("crewTournament.status.ended"), cls: "bg-surface-3 text-ink-3" },
        canceled: { label: t("crewTournament.status.canceled"), cls: "bg-surface-3 text-ink-4" },
    };
    const s = map[status] ?? map.recruiting;
    return <span className={cn("rk-chip shrink-0 text-[12px]", s.cls)}>{s.label}</span>;
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

type ConfirmKind = "leave" | "redraw" | "shuffle" | "reset" | "delete";

function TournamentDetail({ crewId, tournamentId, isAdmin, me, history, onBack }: {
    crewId: string; tournamentId: string; isAdmin: boolean;
    me: HiqMember | undefined; history: HiqGameHistory[] | undefined;
    onBack: () => void;
}) {
    const { t, locale } = useT();
    const { toast } = useToast();
    const qc = useQueryClient();
    const [, setLocation] = useLocation();
    const [swapMode, setSwapMode] = useState(false);
    const [picked, setPicked] = useState<SlotRef | null>(null);
    const [playMatch, setPlayMatch] = useState<{ matchId: string; opponent: HiqMember } | null>(null);
    const [resultOf, setResultOf] = useState<BracketMatch | null>(null);
    const [confirm, setConfirm] = useState<{ kind: ConfirmKind; matchId?: string } | null>(null);
    const [editOpen, setEditOpen] = useState(false);

    const key = `/api/hiq/crews/${crewId}/tournaments/${tournamentId}`;
    const listKey = `/api/hiq/crews/${crewId}/tournaments`;
    const hallKey = `/api/hiq/crews/${crewId}/tournaments/hall-of-fame`;
    const { data, isLoading, isError, error, refetch } = useQuery<Detail>({
        queryKey: [key],
        refetchOnMount: "always",
        // 대진이 나온 뒤에는 남의 경기 결과가 계속 바뀐다. 화면이 숨겨지면(백그라운드) react-query 가 알아서 멈춘다.
        refetchInterval: (q) => {
            const st = (q.state.data as Detail | undefined)?.tournament.status;
            return st === "drawn" || st === "ongoing" ? 15_000 : false;
        },
        // 없는 대회(404)는 다시 물어봐도 없다.
        retry: (n, err: any) => err?.status !== 404 && n < 1,
    });

    // 경기 상태가 바뀌면(누가 이겼다 · 우승이 정해졌다) 목록·명예의 전당도 낡은 것으로 표시한다.
    const signature = data ? `${data.tournament.status}|${data.matches.map((m) => m.status + (m.winnerId ?? "")).join(",")}` : "";
    const lastSig = useRef<string>("");
    useEffect(() => {
        if (!signature) return;
        if (lastSig.current && lastSig.current !== signature) {
            qc.invalidateQueries({ queryKey: [listKey] });
            qc.invalidateQueries({ queryKey: [hallKey] });
        }
        lastSig.current = signature;
    }, [signature, qc, listKey, hallKey]);

    const refresh = () => {
        qc.invalidateQueries({ queryKey: [key] });
        qc.invalidateQueries({ queryKey: [listKey] });
        qc.invalidateQueries({ queryKey: [hallKey] });
    };
    const fail = (err: any) => toast({ title: t("crewTournament.actionFail"), description: err?.message, variant: "destructive" });
    const done = () => setConfirm(null);

    const joinM = useMutation({
        mutationFn: () => apiRequest(`${key}/join`, { method: "POST" }),
        onSuccess: () => { toast({ title: t("crewTournament.joined") }); refresh(); },
        onError: fail,
    });
    const leaveM = useMutation({
        mutationFn: () => apiRequest(`${key}/join`, { method: "DELETE" }),
        onSuccess: () => { toast({ title: t("crewTourney.left") }); done(); refresh(); },
        onError: fail,
    });
    const drawM = useMutation({
        mutationFn: (shuffle: boolean) => apiRequest(`${key}/draw`, { method: "POST", body: JSON.stringify({ shuffle }) }),
        onSuccess: () => { toast({ title: t("crewTournament.drawDone") }); done(); setSwapMode(false); setPicked(null); refresh(); },
        onError: fail,
    });
    const swapM = useMutation({
        mutationFn: (body: { a: SlotRef; b: SlotRef }) => apiRequest(`${key}/swap`, { method: "POST", body: JSON.stringify(body) }),
        onSuccess: () => { setPicked(null); toast({ title: t("crewTourney.swapped") }); refresh(); },
        onError: (e) => { setPicked(null); fail(e); },
    });
    const resetM = useMutation({
        mutationFn: (matchId: string) => apiRequest(`${key}/matches/${matchId}/reset`, { method: "POST" }),
        onSuccess: () => { toast({ title: t("crewTournament.resetDone") }); done(); refresh(); },
        onError: fail,
    });
    const deleteM = useMutation({
        mutationFn: () => apiRequest(key, { method: "DELETE" }),
        onSuccess: () => {
            toast({ title: t("crewTournament.deleted") });
            done();
            qc.invalidateQueries({ queryKey: [listKey] });
            qc.invalidateQueries({ queryKey: [hallKey] });
            onBack();
        },
        onError: fail,
    });

    const players = useMemo(() => {
        const map: Record<string, BracketPlayer> = {};
        for (const p of data?.participants ?? []) map[p.memberId] = { memberId: p.memberId, nickname: p.nickname };
        return map;
    }, [data]);

    const backBar = (title?: React.ReactNode) => (
        <div className="flex items-center gap-1 -ml-2">
            <IconButton label={t("common.back")} onClick={onBack}><LucideChevronLeft /></IconButton>
            {title}
        </div>
    );

    if (isLoading) {
        return <div className="px-4 pt-3 pb-nav flex flex-col gap-4">{backBar()}<CrewSkeleton rows={3} height={96} /></div>;
    }
    if (isError || !data) {
        const notFound = (error as any)?.status === 404 || (!isError && !data);
        return (
            <div className="px-4 pt-3 pb-nav flex flex-col gap-4">
                {backBar()}
                {notFound ? (
                    <CrewEmpty
                        icon={<LucideTrophy />}
                        title={t("crewTourney.notFoundTitle")}
                        desc={t("crewTourney.notFoundDesc")}
                        action={{ label: t("crewTourney.backToList"), onClick: onBack }}
                    />
                ) : (
                    <CrewError onRetry={() => refetch()} />
                )}
            </div>
        );
    }

    const { tournament: tr, participants, matches } = data;
    const joined = participants.some((p) => p.memberId === me?.id);
    // 대회는 2명부터(오너 결정 2026-09-04) — 서버도 같은 기준으로 거절한다.
    const canDraw = isAdmin && tr.status !== "ended" && tr.status !== "canceled" && participants.length >= 2;
    const drawn = matches.length > 0;
    const anyStarted = matches.some((m) => m.status === "playing" || m.status === "done");
    const bestOf = tr.bestOf ?? 1;
    const rounds = totalRounds(bracketSize(participants.length));
    const roundLabel = (round: number) => {
        const r = roundName(round, rounds);
        return r.kind === "final" ? t("tournament.round.final") : t("tournament.round.of").replace("{n}", String(r.remaining));
    };
    const nameOf = (id: string | null) => (id && players[id]?.nickname) || "-";

    // 자리 조정 — 두 자리를 차례로 누르면 맞바꾼다.
    const onSlotClick = (ref: SlotRef) => {
        if (swapM.isPending) return;
        if (!picked) { setPicked(ref); return; }
        if (picked.matchId === ref.matchId && picked.side === ref.side) { setPicked(null); return; }
        swapM.mutate({ a: picked, b: ref });
    };

    // 내가 지금 칠 수 있는 경기인지 — 두 자리가 다 찼고, 내가 그중 하나이고, 아직 안 끝났다.
    const myTurn = (m: BracketMatch) =>
        !!me && (m.status === "ready" || m.status === "playing") &&
        !!m.p1Id && !!m.p2Id && (m.p1Id === me.id || m.p2Id === me.id);
    // 누르면 뭔가 일어나는 카드만 버튼으로 — 내 경기(시작·이어하기), 끝났거나 치는 중인 경기(결과 보기).
    const canClick = (m: BracketMatch) => myTurn(m) || m.status === "done" || m.status === "playing";

    const startMatch = (m: BracketMatch) => {
        if (!me) return;
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

    const onMatchClick = (m: BracketMatch) => {
        if (myTurn(m)) return startMatch(m);
        if (m.status === "done" || m.status === "playing") setResultOf(m);
    };

    const next = tr.status === "ended" ? null : findMyNextMatch(matches, me?.id);
    const nextOpp = next ? (next.match.p1Id === me?.id ? next.match.p2Id : next.match.p1Id) : null;

    const confirmCopy: Record<ConfirmKind, { title: string; desc: string; label: string; danger: boolean }> = {
        leave: { title: t("crewTourney.leaveTitle"), desc: t("crewTourney.leaveDesc"), label: t("crewTournament.leave"), danger: true },
        redraw: { title: t("crewTourney.redrawTitle"), desc: t("crewTourney.redrawDesc"), label: t("crewTournament.redraw"), danger: true },
        shuffle: { title: t("crewTourney.shuffleTitle"), desc: t("crewTourney.redrawDesc"), label: t("crewTournament.shuffle"), danger: true },
        reset: { title: t("crewTourney.resetTitle"), desc: t("crewTourney.resetDesc"), label: t("crewTourney.resetConfirm"), danger: true },
        delete: { title: t("crewTourney.deleteTitle"), desc: t("crewTournament.deleteConfirm"), label: t("crewTournament.delete"), danger: true },
    };
    const busy = leaveM.isPending || drawM.isPending || resetM.isPending || deleteM.isPending;

    return (
        <div className="px-4 pt-3 pb-nav flex flex-col gap-5">
            {/* 머리 */}
            <div className="flex flex-col gap-1.5">
                {backBar(
                    <>
                        <BallDot type={tr.gameType} size={13} />
                        <h2 className={cn(CREW_TEXT.section, "flex-1 min-w-0 truncate ml-1")}>{tr.title}</h2>
                        <StatusChip status={tr.status} />
                        {isAdmin && tr.status !== "ended" && tr.status !== "canceled" && (
                            <IconButton label={t("crewTourney.editTitle")} onClick={() => setEditOpen(true)} className="-mr-2">
                                <LucidePencil />
                            </IconButton>
                        )}
                    </>,
                )}
                {/* 메타 한 줄 — 종목·인원·형식·상품을 흩어 놓지 않고 모아 둔다. */}
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] font-medium text-ink-3">
                    <span>{tr.gameType === "3c" ? t("crewTournament.type3c") : t("crewTournament.type4c")}</span>
                    <span className="text-ink-4">·</span>
                    <span className="rk-num">{participants.length}/{tr.maxPlayers}</span>
                    {/* 2인 대회는 토너먼트라 부를 게 없다 — 판 수가 곧 형식이다. */}
                    {participants.length > 2 && <><span className="text-ink-4">·</span><span>{t("crewTournament.knockout")}</span></>}
                    {bestOf > 1 && (
                        <>
                            <span className="text-ink-4">·</span>
                            <span className="rk-num">{t("crewTournament.bestOfWin").replace("{n}", String(bestOf)).replace("{w}", String(Math.ceil(bestOf / 2)))}</span>
                        </>
                    )}
                    {tr.prize && (
                        <>
                            <span className="text-ink-4">·</span>
                            <span className="font-semibold text-gold">{tr.prize}</span>
                        </>
                    )}
                </div>
                <TournamentDates row={tr} locale={locale} />
                {tr.description && <p className={cn(CREW_TEXT.sub, "leading-relaxed whitespace-pre-line break-words")}>{tr.description}</p>}
            </div>

            {/* 내 다음 경기 — 대진표에서 내 칸을 찾지 않아도 되게 맨 위에 */}
            {next && (
                <div className={cn(CREW_CARD, "flex items-center gap-3 ring-1 ring-brand/40")}>
                    <span className="w-10 h-10 rounded-full bg-brand/10 text-brand flex items-center justify-center shrink-0">
                        <LucideSwords className="w-5 h-5" />
                    </span>
                    <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-semibold text-brand">
                            {t("crewTourney.myNext")} · {roundLabel(next.match.round)}
                        </p>
                        <p className="text-[15px] font-semibold text-ink-1 truncate">
                            {next.waiting && !nextOpp ? t("crewTourney.waitingOpponent") : t("crewTourney.vsName").replace("{name}", nameOf(nextOpp))}
                        </p>
                        {bestOf > 1 && !next.waiting && (
                            <p className="text-[12px] font-medium text-ink-3 rk-num">
                                {t("crewTourney.seriesNow")
                                    .replace("{a}", String(next.match.p1Id === me?.id ? next.match.p1Wins ?? 0 : next.match.p2Wins ?? 0))
                                    .replace("{b}", String(next.match.p1Id === me?.id ? next.match.p2Wins ?? 0 : next.match.p1Wins ?? 0))}
                            </p>
                        )}
                    </div>
                    {!next.waiting && (
                        <button type="button" onClick={() => startMatch(next.match)} className={cn(CREW_BTN.primary, "shrink-0 px-3.5")}>
                            <LucidePlay className="w-4 h-4" />
                            {next.match.status === "playing" ? t("crewTourney.continueMatch") : t("crewTourney.startMatch")}
                        </button>
                    )}
                </div>
            )}

            {/* 대진표 */}
            {drawn && (
                <TournamentBracket
                    matches={matches}
                    players={players}
                    playerCount={participants.length}
                    meId={me?.id}
                    bestOf={bestOf}
                    onMatchClick={onMatchClick}
                    canClick={canClick}
                    swapMode={swapMode}
                    selectedSlot={picked}
                    onSlotClick={onSlotClick}
                />
            )}

            {swapMode && (
                <p className="text-[13px] text-brand font-medium" role="status">
                    {picked ? t("crewTournament.swapPickSecond") : t("crewTournament.swapPickFirst")}
                    <span className="block text-ink-3 font-medium mt-0.5">{t("crewTourney.swapByeHint")}</span>
                </p>
            )}

            {/* 참가자 */}
            <CrewSection title={t("crewTournament.roster")} count={participants.length}>
                {!drawn && participants.length < 2 && <p className={CREW_TEXT.caption}>{t("crewTournament.minPlayersHint")}</p>}
                {participants.length === 0 ? (
                    <CrewEmpty title={t("crewTournament.noPlayers")} />
                ) : (
                    <div className="rk-card overflow-hidden">
                        {participants.map((p, i) => (
                            <div key={p.id} className={cn("flex items-center gap-3 px-4 min-h-12 py-1.5", i > 0 && "border-t border-surface-line")}>
                                <span className="w-5 text-center text-[12px] font-medium text-ink-4 rk-num">{p.seed ?? i + 1}</span>
                                <CrewAvatar name={p.nickname} size={28} />
                                <span className={cn("flex-1 min-w-0 truncate text-[15px] font-medium", p.memberId === me?.id ? "text-brand" : "text-ink-1")}>{p.nickname}</span>
                                {p.finalRank === 1 && <LucideTrophy className="w-4 h-4 text-gold" />}
                                <span className="text-[13px] font-medium text-ink-3 rk-num">
                                    {t("crewTourney.rp").replace("{n}", String((tr.gameType === "3c" ? p.rating3c : p.rating4c) ?? 0))}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </CrewSection>

            {/* 조작 */}
            <div className="flex flex-col gap-2.5">
                {tr.status === "recruiting" && !joined && (
                    <button type="button" onClick={() => joinM.mutate()} disabled={joinM.isPending || participants.length >= tr.maxPlayers} className={cn(CREW_BTN.primary, "w-full h-12")}>
                        {participants.length >= tr.maxPlayers ? t("crewTournament.full") : t("crewTournament.join")}
                    </button>
                )}
                {tr.status === "recruiting" && joined && (
                    <button type="button" onClick={() => setConfirm({ kind: "leave" })} disabled={leaveM.isPending} className={cn(CREW_BTN.secondary, "w-full")}>
                        <LucideCheck className="w-4 h-4 text-brand" />
                        {t("crewTournament.leave")}
                    </button>
                )}

                {canDraw && !anyStarted && (
                    <div className="flex gap-2">
                        <button
                            type="button"
                            // 첫 대진 짜기는 바로, 이미 있는 대진을 다시 뽑는 건 확인 후(자리 조정한 게 날아간다).
                            onClick={() => (drawn ? setConfirm({ kind: "redraw" }) : drawM.mutate(false))}
                            disabled={drawM.isPending}
                            className={cn(CREW_BTN.primary, "flex-1")}
                        >
                            {drawn ? t("crewTournament.redraw") : t("crewTournament.draw")}
                        </button>
                        {drawn && (
                            <button type="button" onClick={() => setConfirm({ kind: "shuffle" })} disabled={drawM.isPending}
                                aria-label={t("crewTournament.shuffle")} title={t("crewTournament.shuffle")}
                                className={cn(CREW_BTN.secondary, "w-11 px-0")}>
                                <LucideRefreshCw className="w-5 h-5" />
                            </button>
                        )}
                    </div>
                )}

                {/* 시작만 하고 끝내지 않은 경기 되돌리기 — 안 그러면 그 칸이 영구히 "경기중"으로
                    굳고 재추첨도 막혀 대회를 통째로 지워야 한다. */}
                {isAdmin && matches.some((m) => m.status === "playing") && (
                    <div className={cn(CREW_CARD, "flex flex-col gap-2")}>
                        <p className={CREW_TEXT.sub}>{t("crewTournament.resetHint")}</p>
                        {matches.filter((m) => m.status === "playing").map((m) => (
                            <button
                                key={m.id} type="button"
                                onClick={() => setConfirm({ kind: "reset", matchId: m.id })}
                                disabled={resetM.isPending}
                                className={cn(CREW_BTN.secondary, "w-full text-[13px]")}
                            >
                                <LucideRefreshCw className="w-4 h-4" />
                                {t("crewTournament.resetMatch").replace("{a}", nameOf(m.p1Id)).replace("{b}", nameOf(m.p2Id))}
                            </button>
                        ))}
                    </div>
                )}

                {isAdmin && drawn && tr.status !== "ended" && matches.some((m) => m.round === 1 && m.status === "ready") && (
                    <button type="button" onClick={() => { setSwapMode(!swapMode); setPicked(null); }}
                        aria-pressed={swapMode}
                        className={cn(CREW_BTN.secondary, "w-full", swapMode && "border-brand text-brand")}>
                        <LucideArrowLeftRight className="w-4 h-4" />
                        {swapMode ? t("crewTournament.swapDone") : t("crewTournament.swapStart")}
                    </button>
                )}

                {isAdmin && (
                    <button type="button" onClick={() => setConfirm({ kind: "delete" })} className={cn(CREW_BTN.ghost, "w-full text-destructive")}>
                        <LucideTrash2 className="w-4 h-4" />
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

            <MatchResultSheet
                match={resultOf}
                players={players}
                bestOf={bestOf}
                roundLabel={resultOf ? roundLabel(resultOf.round) : ""}
                onOpenChange={(o) => { if (!o) setResultOf(null); }}
            />

            <CreateCrewTournamentDialog
                crewId={crewId}
                open={editOpen}
                onOpenChange={setEditOpen}
                tournament={{ id: tr.id, title: tr.title, description: tr.description, prize: tr.prize, recruitEnd: tr.recruitEnd, startAt: tr.startAt }}
            />

            <ConfirmDialog
                open={!!confirm}
                onOpenChange={(o) => { if (!o) setConfirm(null); }}
                title={confirm ? confirmCopy[confirm.kind].title : ""}
                desc={confirm ? confirmCopy[confirm.kind].desc : undefined}
                confirmLabel={confirm ? confirmCopy[confirm.kind].label : ""}
                danger={confirm ? confirmCopy[confirm.kind].danger : true}
                busy={busy}
                onConfirm={() => {
                    if (!confirm) return;
                    if (confirm.kind === "leave") leaveM.mutate();
                    else if (confirm.kind === "redraw") drawM.mutate(false);
                    else if (confirm.kind === "shuffle") drawM.mutate(true);
                    else if (confirm.kind === "reset" && confirm.matchId) resetM.mutate(confirm.matchId);
                    else if (confirm.kind === "delete") deleteM.mutate();
                }}
            />
        </div>
    );
}
