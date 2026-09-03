import { useEffect, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { roundName, totalRounds, bracketSize } from "@shared/tournamentBracket";

// 크루 토너먼트 대진표 — **라사(당구대 천) 위에 올린** 아래→위 세로 피라미드.
//
// 왜 이 방향인가(오너 결정 2026-08-30): "어떻게 올라가고 결승 가고 우승하는지"를 보여주는 게
// 목적이다. 첫 경기가 맨 아래, 우승이 맨 위에 있으면 올라간다는 감각이 그대로 읽힌다.
//
// 배경은 앱 기본 크림 그대로 둔다(오너 지적 2026-08-30, 3차: 라사 초록 밴드는 너무 무겁다).
// 색은 배경이 아니라 **카드가** 가진다:
//   금색 = 우승(유일) · 초록 = 이긴 쪽 · 빨강 = 지금 경기중 · 흰색 = 나머지 전부
// 이러면 훑을 때 금색 하나, 초록 몇 개, 빨강 하나만 눈에 걸린다.
//
// 정보 위계(1차 시안의 가장 큰 결함): 우승 카드가 일반 경기 칸과 같은 크기였고, 아직 안 치른
// 빈 자리가 "8강 1경기 승자"라는 긴 글자를 여덟 번 반복하며 화면 절반을 먹었다. 지금은
//   우승 = 제일 크고 금색 · 끝난 경기 = 흰 카드 · 경기중 = 흰 카드 + 맥박
//   빈 자리 = 낮고 조용한 반투명 블록(글자 없이 형태로만 "아직")
// 순으로 눈에 들어온다.
//
// 색 규칙: 승패는 초록·흐림으로만, 우승만 금색. 공 색(노랑=4구, 빨강=3쿠션)은 종목 코드라
// 승패에 절대 쓰지 않는다 — BallDot.tsx 참고.

export interface BracketPlayer {
    memberId: string;
    nickname: string;
}

export interface BracketMatch {
    id: string;
    round: number;
    slot: number;
    p1Id: string | null;
    p2Id: string | null;
    p1Score: number | null;
    p2Score: number | null;
    winnerId: string | null;
    status: "pending" | "ready" | "playing" | "done" | "bye";
    /** 시작된 경기. "경기중" 칸을 누르면 새로 만들지 않고 이 경기로 들어간다. */
    gameId: string | null;
    /** N판 승부의 누적 승수. 1판 대회면 화면에 안 보인다. */
    p1Wins?: number;
    p2Wins?: number;
}

/** 자리 조정 모드에서 고른 한 칸. */
export interface SlotRef {
    matchId: string;
    side: "p1" | "p2";
}

interface Props {
    matches: BracketMatch[];
    players: Record<string, BracketPlayer>;
    playerCount: number;
    /** 지금 보고 있는 사람 — 내 경기를 눈에 띄게 표시한다. */
    meId?: string;
    /** 한 대진의 판 수. 1 이면 승수 표시를 숨긴다. */
    bestOf?: number;
    /** 경기 카드를 눌렀을 때 — 경기 시작·상세로 보낸다. 조정 모드에서는 무시된다. */
    onMatchClick?: (match: BracketMatch) => void;
    /** 크루장 자리 조정 모드. 첫 라운드의 확정 안 된 자리끼리만 맞바꿀 수 있다. */
    swapMode?: boolean;
    selectedSlot?: SlotRef | null;
    onSlotClick?: (ref: SlotRef, memberId: string | null) => void;
    className?: string;
}

export function TournamentBracket({
    matches, players, playerCount, meId, bestOf = 1,
    onMatchClick, swapMode = false, selectedSlot = null, onSlotClick, className,
}: Props) {
    const { t } = useT();
    const rounds = totalRounds(bracketSize(playerCount));

    // 위(결승)부터 아래(첫 경기)로 그린다. round 는 아래일수록 작으므로 내림차순.
    const byRound = useMemo(() => {
        const map = new Map<number, BracketMatch[]>();
        for (const m of matches) {
            const list = map.get(m.round) ?? [];
            list.push(m);
            map.set(m.round, list);
        }
        for (const list of map.values()) list.sort((a, b) => a.slot - b.slot);
        return map;
    }, [matches]);

    const finalMatch = byRound.get(rounds)?.[0];
    const champion = finalMatch?.winnerId ? players[finalMatch.winnerId] : undefined;

    const label = (round: number) => {
        const r = roundName(round, rounds);
        return r.kind === "final"
            ? t("tournament.round.final")
            : t("tournament.round.of").replace("{n}", String(r.remaining));
    };

    // 1라운드 칸이 4개를 넘으면(16명) 폰 폭에서 칸당 40px 밑으로 떨어져 닉네임이 잘린다.
    const firstRoundSlots = byRound.get(1)?.length ?? 0;
    const needsScroll = firstRoundSlots > 4;

    const bracket = (
        <div
            className="flex flex-col px-1 pt-1 pb-2"
            style={needsScroll ? { minWidth: firstRoundSlots * 86 } : undefined}
        >
            {/* ── 우승: 대진표의 클라이맥스. 제일 크고 유일한 금색. ── */}
            {champion
                ? <ChampionCard nickname={champion.nickname} isMe={!!meId && finalMatch?.winnerId === meId} />
                : <ChampionPending />}
            <Connector rounds={1} lit={[!!champion]} stemLit={[!!champion]} single />

            {Array.from({ length: rounds }, (_, i) => rounds - i).map((round) => {
                const list = byRound.get(round) ?? [];
                const below = byRound.get(round - 1);
                return (
                    <div key={round} className="flex flex-col">
                        <RoundLabel>{label(round)}</RoundLabel>
                        {/* 각 경기는 자기 자리(flex-1) 안에서 가운데 정렬하고 폭을 제한한다.
                            안 그러면 16강에서 결승 카드가 화면 폭 전체(656px)로 늘어나
                            이름은 왼쪽 끝에 붙고 가운데가 텅 빈 흰 띠가 된다.
                            자리의 '중심'은 그대로라 연결선(25%/75%)과 계속 맞는다. */}
                        <div className="flex items-stretch gap-1.5">
                            {list.map((m) => (
                                <div key={m.id} className="flex-1 min-w-0 flex justify-center">
                                    <MatchCard
                                        match={m}
                                        players={players}
                                        meId={meId}
                                        bestOf={bestOf}
                                        onClick={onMatchClick}
                                        swapMode={swapMode}
                                        selectedSlot={selectedSlot}
                                        onSlotClick={onSlotClick}
                                    />
                                </div>
                            ))}
                        </div>
                        {below && (
                            <Connector
                                rounds={list.length}
                                // 아랫 라운드의 두 칸 각각이 "승자를 이미 올려보냈는지"
                                lit={below.map((m) => !!m.winnerId)}
                                // 윗칸에 한 명이라도 도착했으면 줄기를 켠다
                                stemLit={list.map((m) => !!m.p1Id || !!m.p2Id)}
                            />
                        )}
                    </div>
                );
            })}
        </div>
    );

    return (
        <div className={cn("-mx-1", className)}>
            {needsScroll ? <ScrollableBracket>{bracket}</ScrollableBracket> : bracket}
        </div>
    );
}

/** 16강처럼 넓은 대진표는 열자마자 가운데(결승·우승)가 보이게 맞춘다.
 *  왼쪽 끝에서 시작하면 제일 중요한 우승 카드가 화면 밖에 있다. */
function ScrollableBracket({ children }: { children: React.ReactNode }) {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        el.scrollLeft = Math.max(0, (el.scrollWidth - el.clientWidth) / 2);
    }, []);
    return <div ref={ref} className="overflow-x-auto scrollbar-hide">{children}</div>;
}

/** 라운드 이름 — 라사 위에 뜬 작은 알약. 층을 나누는 구분선 역할도 한다. */
function RoundLabel({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex items-center gap-2 my-2">
            <span className="h-px flex-1 bg-surface-line" />
            <span className="rounded-pill bg-surface-3 px-2.5 py-0.5 text-[10.5px] font-semibold tracking-wider text-ink-3 rk-num">
                {children}
            </span>
            <span className="h-px flex-1 bg-surface-line" />
        </div>
    );
}

/** 라운드 사이 연결선. 선수가 실제로 지나간 길만 밝게 켠다. */
function Connector({ rounds, lit, stemLit, single = false }: {
    rounds: number;
    lit: boolean[];
    stemLit: boolean[];
    single?: boolean;
}) {
    // 지나간 길은 브랜드 초록, 아직 안 지난 길은 옅은 회색.
    const ON = "bg-brand";
    const OFF = "bg-[var(--surface-line-strong)]";
    if (single) {
        return (
            <div className="flex h-5" aria-hidden="true">
                <div className="relative flex-1">
                    <span className={cn("absolute left-1/2 -translate-x-1/2 top-0 bottom-0 w-0.5", stemLit[0] ? ON : OFF)} />
                </div>
            </div>
        );
    }
    return (
        <div className="flex h-5" aria-hidden="true">
            {Array.from({ length: rounds }, (_, i) => {
                const leftOn = lit[i * 2] ?? false;
                const rightOn = lit[i * 2 + 1] ?? false;
                return (
                    <div key={i} className="relative flex-1">
                        <span className={cn("absolute left-1/2 -translate-x-1/2 top-0 h-1/2 w-0.5", stemLit[i] ? ON : OFF)} />
                        <span className={cn("absolute top-1/2 -translate-y-1/2 left-1/4 w-1/4 h-0.5", leftOn ? ON : OFF)} />
                        <span className={cn("absolute top-1/2 -translate-y-1/2 left-1/2 w-1/4 h-0.5", rightOn ? ON : OFF)} />
                        <span className={cn("absolute left-1/4 -translate-x-1/2 top-1/2 bottom-0 w-0.5", leftOn ? ON : OFF)} />
                        <span className={cn("absolute left-3/4 -translate-x-1/2 top-1/2 bottom-0 w-0.5", rightOn ? ON : OFF)} />
                    </div>
                );
            })}
        </div>
    );
}

function MatchCard({ match, players, meId, bestOf = 1, onClick, swapMode, selectedSlot, onSlotClick }: {
    match: BracketMatch;
    players: Record<string, BracketPlayer>;
    meId?: string;
    bestOf?: number;
    onClick?: (m: BracketMatch) => void;
    swapMode: boolean;
    selectedSlot: SlotRef | null;
    onSlotClick?: (ref: SlotRef, memberId: string | null) => void;
}) {
    const { t } = useT();
    const live = match.status === "playing";
    const bye = match.status === "bye";
    const pending = match.status === "pending";
    const mine = !!meId && (match.p1Id === meId || match.p2Id === meId);
    // 자리 조정은 첫 라운드의 아직 시작 안 한 경기에서만. 윗 라운드는 승자가 자동으로
    // 올라오는 자리라 손으로 바꾸면 기록과 어긋나고, 서버도 400 으로 거절한다.
    const swappable = swapMode && match.round === 1 && (match.status === "ready" || pending);

    // ── 아직 두 자리가 안 찬 칸: 낮고 조용하게. 글자 없이 형태로만 "아직"을 말한다.
    //    예전엔 "8강 1경기 승자"를 여덟 번 반복해서 화면 절반이 글자로 찼다.
    if (pending && !swappable) {
        return (
            <div className="w-full max-w-[168px] rounded-[9px] bg-surface-3 h-[38px] flex items-center justify-center">
                <span className="h-px w-5 bg-[var(--surface-line-strong)]" />
            </div>
        );
    }

    const body = (
        <>
            <Slot side="p1" match={match} players={players} meId={meId}
                swappable={swappable} selectedSlot={selectedSlot} onSlotClick={onSlotClick} />
            {!bye && (
                <Slot side="p2" match={match} players={players} meId={meId}
                    swappable={swappable} selectedSlot={selectedSlot} onSlotClick={onSlotClick} />
            )}
            {/* N판 승부 — 누적 승수. 1판 대회면 숨긴다. */}
            {bestOf > 1 && ((match.p1Wins ?? 0) + (match.p2Wins ?? 0) > 0 || match.status === "done") && (
                <div className="text-center text-[9.5px] py-0.5 border-t border-surface-line text-ink-3 rk-num font-semibold">
                    {match.p1Wins ?? 0} - {match.p2Wins ?? 0}
                </div>
            )}
            {(live || bye) && (
                <div className={cn(
                    "text-center text-[9.5px] py-0.5 rk-num font-semibold",
                    live ? "text-white" : "text-ink-4 border-t border-surface-line",
                )} style={live ? { background: "var(--ball-red)" } : undefined}>
                    {live && <span className="inline-block w-1 h-1 rounded-full bg-white mr-1 align-middle motion-safe:animate-pulse" />}
                    {live ? t("tournament.match.playing") : t("tournament.match.bye")}
                </div>
            )}
        </>
    );

    const cls = cn(
        "w-full max-w-[168px] min-w-0 overflow-hidden rounded-[9px] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)]",
        // 내 경기 표시 — 16강이면 카드가 8개라 내 것을 찾기 어렵다. 다만 굵은 초록 테두리는
        // 카드를 통째로 초록으로 만들어 승자 표시(초록 띠)와 뒤섞인다. 얇고 옅게.
        mine ? "ring-[1.5px] ring-brand/45" : "ring-1 ring-surface-line",
    );

    // 경기중은 빨강이 가장 강한 신호라 내 경기 초록 테두리보다 우선한다.
    const liveStyle = live ? { boxShadow: `0 0 0 2px var(--ball-red)` } : undefined;
    if (!swapMode && onClick && (match.status === "ready" || live || match.status === "done")) {
        return (
            <button type="button" onClick={() => onClick(match)} style={liveStyle}
                className={cn(cls, live && "ring-0", "text-left active:scale-[0.98] transition-transform")}>
                {body}
            </button>
        );
    }
    return <div className={cn(cls, live && "ring-0")} style={liveStyle}>{body}</div>;
}

function Slot({ side, match, players, meId, swappable, selectedSlot, onSlotClick }: {
    side: "p1" | "p2";
    match: BracketMatch;
    players: Record<string, BracketPlayer>;
    meId?: string;
    swappable: boolean;
    selectedSlot: SlotRef | null;
    onSlotClick?: (ref: SlotRef, memberId: string | null) => void;
}) {
    const memberId = side === "p1" ? match.p1Id : match.p2Id;
    const score = side === "p1" ? match.p1Score : match.p2Score;
    const player = memberId ? players[memberId] : undefined;
    const isWinner = !!match.winnerId && match.winnerId === memberId;
    const isLoser = !!match.winnerId && !!memberId && match.winnerId !== memberId;
    const selected = selectedSlot?.matchId === match.id && selectedSlot?.side === side;
    const isMe = !!meId && memberId === meId;

    const content = (
        <>
            <span className={cn(
                "flex-1 min-w-0 truncate text-[11.5px]",
                isWinner ? "font-bold text-ink-1" : isLoser ? "text-ink-4" : player ? "font-medium text-ink-2" : "text-ink-4",
                isMe && !isLoser && "text-brand",
            )}>
                {player ? player.nickname : "—"}
            </span>
            {score != null && (
                <span className={cn("rk-num text-[11.5px]", isWinner ? "font-bold text-brand" : isLoser ? "text-ink-4" : "text-ink-3")}>
                    {score}
                </span>
            )}
        </>
    );

    const base = cn(
        "flex items-center gap-1.5 px-[7px] py-1.5 min-h-[29px] w-full",
        side === "p2" && "border-t border-surface-line",
        // 이긴 쪽은 왼쪽 초록 띠로만 말한다. 바탕까지 초록으로 깔면 카드가 흰색이 아니게 되고
        // 8강·16강처럼 카드가 여러 개일 때 화면이 통째로 초록이 된다.
        isWinner && "bg-brand/[0.05] shadow-[inset_3px_0_0_rgb(var(--brand))]",
        selected && "ring-2 ring-inset ring-brand bg-brand/5",
    );

    if (swappable && onSlotClick) {
        return (
            <button type="button" className={cn(base, "text-left active:opacity-70")} onClick={() => onSlotClick({ matchId: match.id, side }, memberId)}>
                {content}
            </button>
        );
    }
    return <div className={base}>{content}</div>;
}

/** 우승 — 대진표에서 유일하게 금색을 꽉 채운 카드이고 제일 크다. 여기가 클라이맥스다.
 *  오너 결정(2026-08-30): 노란 금색 바탕에 흰 글씨. */
function ChampionCard({ nickname, isMe }: { nickname: string; isMe: boolean }) {
    const { t } = useT();
    return (
        <div
            className="mx-auto w-full max-w-[236px] rounded-card px-5 py-4 text-center shadow-[0_4px_16px_rgba(190,138,12,0.35)]"
            style={{ background: "var(--gold-fill)" }}
        >
            <Trophy />
            <span className="mt-1.5 block text-[10px] font-bold tracking-[0.22em] text-white/85 rk-num">
                {t("tournament.round.champion")}
            </span>
            <span className="mt-1 block text-[23px] leading-tight font-bold text-white truncate">
                {nickname}
            </span>
            {isMe && (
                <span className="mt-2 inline-block rounded-pill bg-white/25 px-2.5 py-0.5 text-[10.5px] font-bold text-white">
                    {t("tournament.champion.me")}
                </span>
            )}
        </div>
    );
}

/** 아직 안 정해진 우승 자리 — 비어 있지만 자리는 크게 남겨 둔다(여기가 목표다). */
function ChampionPending() {
    const { t } = useT();
    return (
        <div className="mx-auto w-full max-w-[230px] rounded-card border border-dashed border-[var(--surface-line-strong)] px-5 py-5 text-center">
            <span className="mx-auto block w-6 h-6 opacity-40"><Trophy dim /></span>
            <span className="mt-1.5 block text-[10.5px] font-semibold tracking-[0.18em] text-ink-4 rk-num">
                {t("tournament.round.champion")}
            </span>
        </div>
    );
}

function Trophy({ dim = false }: { dim?: boolean }) {
    return (
        <svg width={dim ? 24 : 30} height={dim ? 24 : 30} viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
            className={cn("mx-auto", dim ? "text-ink-4" : "text-white")} aria-hidden="true">
            <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" />
            <path d="M17 5h2.5a2.5 2.5 0 0 1 0 5H17" />
            <path d="M7 5H4.5a2.5 2.5 0 0 0 0 5H7" />
            <path d="M12 14v4" />
            <path d="M8.5 20h7" />
            <path d="M10 18h4l1 2H9l1-2Z" />
        </svg>
    );
}
