import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { roundName, totalRounds, bracketSize } from "@shared/tournamentBracket";

// 크루 토너먼트 대진표 — **아래에서 위로** 올라가는 세로 피라미드.
//
// 왜 이 방향인가(오너 결정 2026-08-30): "어떻게 올라가고 결승 가고 우승하는지"를 보여주는 게
// 목적이다. 첫 경기가 맨 아래, 우승이 맨 위에 있으면 올라간다는 감각이 그대로 읽히고,
// 세로 화면에 8명까지 가로 스크롤 없이 들어간다(왼→오른 대진표는 4열이라 폰에서 잘린다).
//
// 색 규칙: 승패는 brand(초록)와 흐림으로만 말하고, 우승만 gold 다.
// 공 색(노랑=4구, 빨강=3쿠션)은 종목 코드라 승패에 절대 쓰지 않는다 — BallDot.tsx 참고.
//
// 연결선: 선수가 실제로 지나간 길만 초록으로 켠다. 아직 안 치른 길은 회색으로 남겨
// "여기로 올라온다"는 경로 자체는 보이게 한다.

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
    /** 경기 카드를 눌렀을 때 — 경기 시작·상세로 보낸다. 조정 모드에서는 무시된다. */
    onMatchClick?: (match: BracketMatch) => void;
    /** 크루장 자리 조정 모드. 첫 라운드의 확정 안 된 자리끼리만 맞바꿀 수 있다. */
    swapMode?: boolean;
    selectedSlot?: SlotRef | null;
    onSlotClick?: (ref: SlotRef, memberId: string | null) => void;
    className?: string;
}

export function TournamentBracket({
    matches, players, playerCount,
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

    // 아직 안 채워진 자리에 "4강 1경기 승자"라고 적어준다 — 누가 올라올 자리인지 보이게.
    const feederLabel = (round: number, slot: number, side: "p1" | "p2") => {
        if (round <= 1) return t("tournament.slot.waiting");
        return t("tournament.slot.tbd")
            .replace("{round}", label(round - 1))
            .replace("{n}", String(slot * 2 + (side === "p1" ? 1 : 2)));
    };

    // 1라운드 칸이 4개를 넘으면(16명) 폰 폭에서 칸당 40px 밑으로 떨어져 닉네임이 잘린다.
    // 저장소 관례대로 가로 스크롤을 열고 최소 폭을 준다.
    const firstRoundSlots = byRound.get(1)?.length ?? 0;
    const needsScroll = firstRoundSlots > 4;

    const bracket = (
        <div
            className={cn("flex flex-col", !needsScroll && className)}
            style={needsScroll ? { minWidth: firstRoundSlots * 84 } : undefined}
        >
            {/* 우승 */}
            <RoundLabel>{t("tournament.round.champion")}</RoundLabel>
            {champion ? <ChampionCard nickname={champion.nickname} /> : <ChampionPlaceholder />}
            <Connector rounds={1} lit={[!!champion]} stemLit={[!!champion]} single />

            {Array.from({ length: rounds }, (_, i) => rounds - i).map((round) => {
                const list = byRound.get(round) ?? [];
                const below = byRound.get(round - 1);
                return (
                    <div key={round} className="flex flex-col">
                        <RoundLabel>{label(round)}</RoundLabel>
                        <div className="flex items-stretch gap-1.5">
                            {list.map((m) => (
                                <MatchCard
                                    key={m.id}
                                    match={m}
                                    players={players}
                                    onClick={onMatchClick}
                                    swapMode={swapMode}
                                    selectedSlot={selectedSlot}
                                    onSlotClick={onSlotClick}
                                    feederLabel={feederLabel}
                                />
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

    if (!needsScroll) return bracket;
    return (
        <div className={cn("-mx-5 px-5 overflow-x-auto scrollbar-hide", className)}>
            {bracket}
        </div>
    );
}

function RoundLabel({ children }: { children: React.ReactNode }) {
    return (
        <div className="text-center text-[10px] font-medium tracking-wider text-ink-4 mb-1.5 mt-0.5 rk-num">
            {children}
        </div>
    );
}

/** 라운드 사이 연결선. 아래 두 칸이 위 한 칸으로 합쳐지는 모양을 칸 수만큼 반복한다. */
function Connector({ rounds, lit, stemLit, single = false }: {
    rounds: number;
    lit: boolean[];
    stemLit: boolean[];
    single?: boolean;
}) {
    const OFF = "bg-[var(--surface-line-strong)]";
    if (single) {
        return (
            <div className="flex h-5" aria-hidden="true">
                <div className="relative flex-1">
                    <span className={cn("absolute left-1/2 -translate-x-1/2 top-0 bottom-0 w-0.5", stemLit[0] ? "bg-brand" : OFF)} />
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
                        {/* 위로 올라가는 줄기 */}
                        <span className={cn("absolute left-1/2 -translate-x-1/2 top-0 h-1/2 w-0.5", stemLit[i] ? "bg-brand" : OFF)} />
                        {/* 두 칸을 잇는 가로대 — 켜진 쪽 절반만 초록 */}
                        <span className={cn("absolute top-1/2 -translate-y-1/2 left-1/4 w-1/4 h-0.5", leftOn ? "bg-brand" : OFF)} />
                        <span className={cn("absolute top-1/2 -translate-y-1/2 left-1/2 w-1/4 h-0.5", rightOn ? "bg-brand" : OFF)} />
                        {/* 아래 두 칸에서 올라오는 세로선 */}
                        <span className={cn("absolute left-1/4 -translate-x-1/2 top-1/2 bottom-0 w-0.5", leftOn ? "bg-brand" : OFF)} />
                        <span className={cn("absolute left-3/4 -translate-x-1/2 top-1/2 bottom-0 w-0.5", rightOn ? "bg-brand" : OFF)} />
                    </div>
                );
            })}
        </div>
    );
}

function MatchCard({ match, players, onClick, swapMode, selectedSlot, onSlotClick, feederLabel }: {
    match: BracketMatch;
    players: Record<string, BracketPlayer>;
    onClick?: (m: BracketMatch) => void;
    swapMode: boolean;
    selectedSlot: SlotRef | null;
    onSlotClick?: (ref: SlotRef, memberId: string | null) => void;
    feederLabel: (round: number, slot: number, side: "p1" | "p2") => string;
}) {
    const { t } = useT();
    const live = match.status === "playing";
    const done = match.status === "done";
    const bye = match.status === "bye";
    // 자리 조정은 **첫 라운드의 아직 시작 안 한 경기**에서만. 윗 라운드는 승자가 자동으로
    // 올라오는 자리라 손으로 바꾸면 기록과 어긋나고, 서버도 400 으로 거절한다 —
    // 여기서 안 막으면 눌리기만 하고 실패 토스트만 뜬다.
    const swappable = swapMode && match.round === 1 && (match.status === "ready" || match.status === "pending");

    const body = (
        <>
            <Slot
                side="p1" match={match} players={players} feederLabel={feederLabel}
                swappable={swappable} selectedSlot={selectedSlot} onSlotClick={onSlotClick}
            />
            {!bye && (
                <Slot
                    side="p2" match={match} players={players} feederLabel={feederLabel}
                    swappable={swappable} selectedSlot={selectedSlot} onSlotClick={onSlotClick}
                />
            )}
            {(live || done || bye) && (
                <div className={cn(
                    "text-center text-[9.5px] py-0.5 border-t rk-num",
                    live ? "text-brand font-semibold bg-brand/10 border-brand/30" : "text-ink-4 border-surface-line",
                )}>
                    {live && <span className="inline-block w-1 h-1 rounded-full bg-brand mr-1 align-middle motion-safe:animate-pulse" />}
                    {live ? t("tournament.match.playing")
                        : bye ? t("tournament.match.bye")
                            : t("tournament.match.done")}
                </div>
            )}
        </>
    );

    const cls = cn(
        "flex-1 min-w-0 overflow-hidden rounded-[9px] border",
        match.status === "pending"
            ? "border-dashed border-[var(--surface-line-strong)] bg-transparent"
            : "bg-surface-1 border-surface-line",
        live && "border-brand ring-2 ring-brand/10",
    );

    // 조정 모드에서는 카드 자체를 누를 수 없게 한다 — 자리 탭과 충돌한다.
    if (!swapMode && onClick && (match.status === "ready" || live || done)) {
        return (
            <button type="button" onClick={() => onClick(match)} className={cn(cls, "text-left active:scale-[0.98] transition-transform")}>
                {body}
            </button>
        );
    }
    return <div className={cls}>{body}</div>;
}

function Slot({ side, match, players, swappable, selectedSlot, onSlotClick, feederLabel }: {
    side: "p1" | "p2";
    match: BracketMatch;
    players: Record<string, BracketPlayer>;
    swappable: boolean;
    selectedSlot: SlotRef | null;
    onSlotClick?: (ref: SlotRef, memberId: string | null) => void;
    feederLabel: (round: number, slot: number, side: "p1" | "p2") => string;
}) {
    const memberId = side === "p1" ? match.p1Id : match.p2Id;
    const score = side === "p1" ? match.p1Score : match.p2Score;
    const player = memberId ? players[memberId] : undefined;
    const isWinner = !!match.winnerId && match.winnerId === memberId;
    const isLoser = !!match.winnerId && !!memberId && match.winnerId !== memberId;
    const selected = selectedSlot?.matchId === match.id && selectedSlot?.side === side;

    const content = (
        <>
            <span className={cn(
                "flex-1 min-w-0 truncate text-[11.5px]",
                isWinner ? "font-semibold text-ink-1" : isLoser ? "text-ink-4" : player ? "font-medium text-ink-2" : "text-ink-4 text-[10.5px]",
            )}>
                {/* 빈 자리는 "4강 1경기 승자"처럼 어디서 올라오는 자리인지 적는다. */}
                {player ? player.nickname : feederLabel(match.round, match.slot, side)}
            </span>
            {score != null && (
                <span className={cn("rk-num text-[11.5px]", isWinner ? "font-semibold text-brand" : isLoser ? "text-ink-4" : "text-ink-3")}>
                    {score}
                </span>
            )}
        </>
    );

    const base = cn(
        "flex items-center gap-1.5 px-[7px] py-1.5 min-h-[29px] w-full",
        side === "p2" && "border-t border-surface-line",
        isWinner && "bg-brand/10 shadow-[inset_3px_0_0_rgb(var(--brand))]",
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

function ChampionCard({ nickname }: { nickname: string }) {
    const { t } = useT();
    return (
        <div className="mx-auto flex max-w-[200px] items-center justify-center gap-2.5 rounded-[11px] border border-gold bg-[var(--gold-soft)] px-3.5 py-2.5">
            <TrophyIcon />
            <span>
                <span className="block text-[9.5px] font-medium tracking-[0.14em] text-gold leading-normal rk-num">
                    {t("tournament.round.champion")}
                </span>
                <span className="text-sm font-semibold text-ink-1">{nickname}</span>
            </span>
        </div>
    );
}

function ChampionPlaceholder() {
    const { t } = useT();
    return (
        <div className="mx-auto max-w-[200px] rounded-[11px] border border-dashed border-[var(--surface-line-strong)] px-3 py-3 text-center text-[10px] tracking-wider text-ink-4 rk-num">
            {t("tournament.champion.pending")}
        </div>
    );
}

function TrophyIcon() {
    return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"
            className="shrink-0 text-gold" aria-hidden="true">
            <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" />
            <path d="M17 5h2.5a2.5 2.5 0 0 1 0 5H17" />
            <path d="M7 5H4.5a2.5 2.5 0 0 0 0 5H7" />
            <path d="M12 14v4" />
            <path d="M8.5 20h7" />
            <path d="M10 18h4l1 2H9l1-2Z" />
        </svg>
    );
}
