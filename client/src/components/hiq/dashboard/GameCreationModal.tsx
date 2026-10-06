import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, LucideUsers, LucideZap } from "@/lib/icons";
import { HiqMember, HiqGameHistory } from "@shared/schema";
import { useGameCreation, PlayerType } from "@/hooks/useGameCreation";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, FocusEvent, KeyboardEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BilliardBall, BallCluster, BallColor } from "../ui/BilliardBall";
import { useT } from "@/lib/i18n";
import { TARGET_INPUT_MAX, TARGET_INPUT_MIN, commitTargetText, sanitizeTargetText, stepTarget } from "@shared/targetInput";

// Player slot → billiard ball color (white 수구, yellow, red, red — the 4구 set).
const SLOT_BALL: BallColor[] = ["white", "yellow", "red", "red"];

interface GameCreationModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    member: HiqMember | undefined;
    history: HiqGameHistory[] | undefined;
    initialMode?: "practice" | "match";
    initialType?: "3c" | "4c";
    /** 크루 토너먼트 대진에서 열었을 때. 상대가 이미 정해져 있어 PIN 단계를 건너뛴다. */
    tournamentMatch?: { matchId: string; opponent: HiqMember } | null;
    /** 채팅의 매칭 대결 카드를 방장이 눌러 들어왔을 때. 카드가 들고 있던 핀을 그대로 이어받고
     *  (새 핀을 만들지 않는다), 카드가 정한 종목·자리 수·목표를 세션의 첫 상태로 쓴다. */
    initialCode?: string;
    initialGameType?: "3c" | "4c";
    initialSeats?: number;
    initialTarget?: number;
}

// Sub-component for individual Player Card (Internal to this file for now to keep context easy)
const PlayerCard = ({
    idx,
    player,
    totalPlayers,
    onMove,
    onUpdate,
    gameType,
    history
}: {
    idx: number;
    player: any;
    totalPlayers: number;
    onMove: (idx: number, dir: -1 | 1) => void;
    onUpdate: (idx: number, data: any) => void;
    gameType: '3c' | '4c';
    history?: HiqGameHistory[];
}) => {
    const { t } = useT();
    const isSelf = player.isHost;
    const isGuest = player.type === 'guest';
    const textColor = "text-brand";

    // 호스트는 1번 슬롯에 고정한다. 서버(POST /game/start)는 슬롯1을 로그인 세션으로 강제하고
    // 슬롯2~4는 "내 초대에 동의한 게스트"만 허용하는데, 호스트 본인은 자기 초대에 참여할 수
    // 없어 그 동의 목록에 절대 들어가지 않는다. 호스트를 아래로 내리면 player2Id에 본인 id가
    // 실려 서버가 400("참가 확인이 만료되었습니다")을 던지고, 새 핀을 받아도 영구 실패한다.
    const canMoveUp = !isSelf && idx > 1; // idx 1이 위로 가면 호스트와 자리가 바뀐다
    const canMoveDown = !isSelf && idx < totalPlayers - 1;

    // Calculate Win Rate if history is available (only for self/host usually)
    const winRate = history ? (() => {
        const myGames = history.filter(g => g.gameMode === 'match' && g.sportCategory === 'BILLIARDS'); // Only count billiards match games
        if (myGames.length === 0) return null;
        const wins = myGames.filter(g => g.isWinner).length;
        return Math.round((wins / myGames.length) * 100);
    })() : null;

    // ── 목표 점수를 숫자로 직접 치기(2026-10-06 오너: "화살표로만 내리고 올리고 하는데 숫자로 입력 가능하게") ──
    // edit 는 치는 동안의 글자(빈 칸 허용)와 치기 시작할 때의 값·자리 주인이다. null 이면 입력 중이 아니다.
    // 글자 → 값 규칙은 shared/targetInput 한 곳에 있다(빈 칸·0 은 치기 전 값, 범위는 1~999 — 서버 /game/start 와 같다).
    const [edit, setEdit] = useState<{ text: string; base: number; seat: string } | null>(null);
    const targetRef = useRef<HTMLInputElement>(null);
    const scrollTimer = useRef<number | undefined>(undefined);
    const seat = `${player.type}:${player.member?.id ?? ""}`;

    // 치던 글자가 뜻하는 값. 칠 때마다 이 값을 players[i].target 에 바로 넣어 둔다 — blur 를 기다리지 않는다.
    // iOS 는 단추를 눌러도 입력 칸의 포커스가 안 풀리는 일이 있어, blur 에서만 확정하면 숫자를 치고 곧장
    // '게임 시작'을 누른 판이 치기 전 목표로 시작된다. blur·Enter 는 '입력을 닫는 것'만 한다(빈 칸은 그때 치기 전 값으로 보인다).
    const typed = edit ? commitTargetText(edit.text, edit.base, TARGET_INPUT_MIN, TARGET_INPUT_MAX) : player.target;

    // 치는 중에 밖에서 이 자리가 바뀌었다(종목 전환 재계산, 핀으로 회원이 앉음, 자리 바꾸기) → 치던 글자를 버리고 새 값을 보여 준다.
    // 내가 친 값은 위에서 곧바로 target 이 되므로 여기 걸리지 않는다. 3초 폴링은 손대지 않은 자리의 player 를 그대로 넘겨 역시 걸리지 않는다.
    if (edit && (player.target !== typed || seat !== edit.seat)) setEdit(null);

    // 포커스가 남은 채 밖에서 값이 바뀌었으면 다시 전체 선택 — 다음에 치는 숫자가 새 값 뒤에 붙지 않고 덮어쓰게.
    // 화살표도 이 길로 온다(포커스를 칸에 둔 채 값만 바꾼다).
    // 치는 중(edit 있음)에는 건드리지 않는다. 여기서 선택하면 두 번째 숫자가 첫 숫자를 지운다.
    useEffect(() => {
        const el = targetRef.current;
        if (!edit && el && document.activeElement === el) el.select();
    }, [player.target, seat]);

    useEffect(() => () => window.clearTimeout(scrollTimer.current), []);

    const onTargetFocus = (e: FocusEvent<HTMLInputElement>) => {
        const el = e.currentTarget;
        // 누르면 전체 선택 — 바로 덮어쓴다. iOS 는 포커스 순간의 선택을 탭이 다시 풀어서 한 박자 뒤에 한 번 더 건다.
        el.select();
        window.setTimeout(() => {
            if (document.activeElement === el) el.setSelectionRange(0, el.value.length);
        }, 0);
        // 키보드가 올라온 뒤 이 칸을 보이는 영역 가운데로. 전역 keyboardAvoid 의 nearest 스크롤(350ms) 다음에 돈다.
        window.clearTimeout(scrollTimer.current);
        scrollTimer.current = window.setTimeout(() => {
            if (document.activeElement === el) el.scrollIntoView({ block: "center", behavior: "smooth" });
        }, 400);
    };

    const onTargetChange = (e: ChangeEvent<HTMLInputElement>) => {
        // 숫자 아닌 글자는 버린다(붙여넣기도 이 길로 온다).
        const text = sanitizeTargetText(e.target.value, TARGET_INPUT_MAX);
        const base = edit ? edit.base : player.target;
        setEdit({ text, base, seat });
        const next = commitTargetText(text, base, TARGET_INPUT_MIN, TARGET_INPUT_MAX);
        if (next !== player.target) onUpdate(idx, { target: next });
    };

    const onTargetKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
        // Enter 는 이 칸의 확정일 뿐이다 — 기본 동작으로 번져 '게임 시작'이 눌리지 않게 막고, 키보드를 내린다.
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.blur(); // onBlur 가 입력을 닫는다
    };

    // 화살표: 치던 글자가 있으면 먼저 확정(typed)한 뒤 ±1. 입력은 닫지 않고 포커스를 칸에 둔다 — 키보드가 떠 있었다면 그대로 떠 있다.
    // 여기서 blur 로 키보드를 내리면 창 높이가 한 번에 돌아와(index.css 의 body.keyboard-open 규칙) 이 줄이 손가락 밑에서 내려가고,
    // 이어 누른 탭이 화살표가 아닌 곳(회원/게스트 토글)에 떨어진다. 값이 바뀌면 위 효과가 새 값을 다시 전체 선택한다.
    const bumpTarget = (dir: -1 | 1) => {
        setEdit(null);
        onUpdate(idx, { target: stepTarget(typed, dir, TARGET_INPUT_MIN, TARGET_INPUT_MAX) });
    };

    // 칸에 포커스가 있을 때만, 화살표 단추가 그 포커스를 가져가지 못하게 막는다(가져가면 키보드가 닫힌다). 클릭은 그대로 간다.
    const keepTargetFocus = (e: ReactMouseEvent<HTMLButtonElement>) => {
        if (document.activeElement === targetRef.current) e.preventDefault();
    };

    const seatLabel = isSelf ? t("gameCreationModal.me") : `${t("gameCreationModal.opponent")} ${idx + 1}`;

    return (
        <div className={`bg-white rounded-2xl p-4 flex flex-col gap-4 shadow-[0_1px_2px_rgba(0,0,0,0.06)] relative transition-all duration-300 ${isSelf ? 'border-brand/30 bg-brand/[0.04]' : ''}`}>
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="shrink-0 flex items-center justify-center">
                        <BilliardBall color={SLOT_BALL[idx] || "red"} size={46} />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            {isSelf && <span className="text-sm font-bold text-brand">{t("gameCreationModal.me")}</span>}
                            {!isSelf && <span className="text-sm font-bold text-black/55">{t("gameCreationModal.opponent")} {idx + 1}</span>}
                            {isSelf && <div className="text-[12px] font-bold text-white bg-brand px-2 py-0.5 rounded-full">{t("gameCreationModal.host")}</div>}
                        </div>

                        {/* Reorder Buttons */}
                        <div className="flex items-center gap-1 mt-1">
                            <button
                                onClick={() => onMove(idx, -1)}
                                disabled={!canMoveUp}
                                title={t("gameCreationModal.moveUp")}
                                className={`p-1 rounded hover:bg-black/[0.04] ${!canMoveUp ? 'opacity-20 cursor-not-allowed' : 'text-black/55 hover:text-ink-1'}`}
                            >
                                <ChevronUp className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => onMove(idx, 1)}
                                disabled={!canMoveDown}
                                title={t("gameCreationModal.moveDown")}
                                className={`p-1 rounded hover:bg-black/[0.04] ${!canMoveDown ? 'opacity-20 cursor-not-allowed' : 'text-black/55 hover:text-ink-1'}`}
                            >
                                <ChevronDown className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Player Type Toggle (If not self) */}
                {!isSelf && (
                    <div className="flex items-center bg-black/[0.04] rounded-lg p-1 ">
                        <button
                            onClick={() => onUpdate(idx, { type: 'member', member: undefined, target: 0, name: '' })}
                            title={t("gameCreationModal.switchToMember")}
                            className={`px-3 py-1.5 rounded-md text-[12px] font-bold transition-all ${!isGuest ? 'bg-white text-ink-1 shadow-sm' : 'text-black/50 hover:text-black/70'}`}
                        >
                            {t("gameCreationModal.member")}
                        </button>
                        <button
                            onClick={() => onUpdate(idx, { type: 'guest', member: undefined, target: 15, name: '' })}
                            title={t("gameCreationModal.switchToGuest")}
                            className={`px-3 py-1.5 rounded-md text-[12px] font-bold transition-all ${isGuest ? 'bg-white text-ink-1 shadow-sm' : 'text-black/50 hover:text-black/70'}`}
                        >
                            {t("gameCreationModal.guest")}
                        </button>
                    </div>
                )}
            </div>

            {/* Input Area */}
            {isGuest ? (
                <div className="h-12 w-full flex items-center bg-black/[0.04] rounded-xl px-2 focus-within:border-brand/40 transition-colors">
                    <input
                        type="text"
                        value={player.name || ""}
                        onChange={(e) => onUpdate(idx, { name: e.target.value })}
                        placeholder={t("gameCreationModal.namePlaceholder")}
                        className="bg-transparent w-full font-bold text-ink-1 text-lg px-2 placeholder:text-black/40 focus:outline-none"
                    />
                </div>
            ) : (
                <div className="h-12 w-full flex items-center bg-black/[0.04] rounded-xl px-4 justify-between">
                    {player.member ? (
                        <>
                            <span className="font-semibold text-ink-1 text-lg truncate">
                                {player.member.name}
                            </span>
                            <span className="text-xs font-bold text-black/60 bg-black/[0.06] px-2 py-1 rounded-lg">
                                AVG {player.member.average}
                            </span>
                        </>
                    ) : (
                        <span className="font-medium text-black/40 text-sm animate-pulse">
                            {isSelf ? t("gameCreationModal.meShort") : t("gameCreationModal.waitingPin")}
                        </span>
                    )}
                </div>
            )}

            {/* Score Control */}
            <div className="flex items-center gap-2">
                <button
                    type="button"
                    onMouseDown={keepTargetFocus}
                    onClick={() => bumpTarget(-1)}
                    aria-label={`${seatLabel} · ${t("chat.attach.matchInviteMinus")}`}
                    className="flex-1 h-14 rounded-xl bg-black/[0.04] hover:bg-black/[0.08] active:scale-95 transition-all flex items-center justify-center "
                >
                    <ChevronDown className="w-6 h-6 text-ink-1" />
                </button>
                {/* 가운데 숫자 칸 — 누르면 그 자리에서 친다. 칸 크기·글자·색은 예전 그대로, 입력 중일 때만 링.
                    type="number" 는 쓰지 않는다(휠·e·- 입력, iOS 동작 차이). 글자 30px 이라 iOS 확대도 없다. */}
                <input
                    ref={targetRef}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    enterKeyHint="done"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    aria-label={`${seatLabel} · ${t("sim.setup.target")}`}
                    value={edit ? edit.text : String(player.target)}
                    onFocus={onTargetFocus}
                    onChange={onTargetChange}
                    onKeyDown={onTargetKeyDown}
                    onBlur={() => setEdit(null)}
                    className={`h-14 w-[90px] shrink-0 p-0 appearance-none text-center bg-black/[0.04] rounded-xl font-semibold text-3xl ${textColor} tracking-tight shadow-inner outline-none focus:ring-2 focus:ring-brand/40`}
                />
                <button
                    type="button"
                    onMouseDown={keepTargetFocus}
                    onClick={() => bumpTarget(1)}
                    aria-label={`${seatLabel} · ${t("chat.attach.matchInvitePlus")}`}
                    className="flex-1 h-14 rounded-xl bg-black/[0.04] hover:bg-black/[0.08] active:scale-95 transition-all flex items-center justify-center "
                >
                    <ChevronUp className="w-6 h-6 text-ink-1" />
                </button>
            </div>

            {/* Simple Stats Display (Optional, kept minimal) */}
            {player.member && winRate !== null && (
                <div className="mt-2 border-t border-black/10 pt-2 flex justify-between items-center px-1">
                    <span className="text-[12px] font-bold text-black/50">{t("gameCreationModal.winRate")}</span>
                    <span className="text-xs font-semibold text-brand">
                        {winRate}%
                    </span>
                </div>
            )}
        </div>
    );
};

// 빈 곳을 누르면 키보드를 내린다(값은 건드리지 않는다 — 치는 순간 이미 목표에 들어가 있다).
// 아이폰 앱의 숫자 패드에는 완료 키가 없고 키보드 위 '완료' 줄도 @capacitor/keyboard 가 지워서 Enter 길이 닿지 않는다.
// 화살표도 이제 키보드를 닫지 않으므로, 값을 바꾸지 않고 키보드를 내리는 길이 이것이다.
//  - pointerup 에 건다: 터치로 목록을 밀면 pointercancel 로 끝나 여기 오지 않는다(키보드를 띄운 채 다른 자리로 갈 수 있다).
//  - onClick 으로 달지 않는다: 영역 전체가 '누를 수 있는 것'이 되어 작은 단추 근처의 탭 보정이 흐려진다.
//  - 마우스는 건너뛴다: 빈 곳을 누르면 브라우저가 이미 포커스를 풀고, 이름을 끌어서 고르다 칸 밖에서 놓은 것을 닫으면 안 된다.
//  - 입력 칸·단추를 누른 것은 건너뛴다(그쪽이 제 일을 한다).
const dismissKeyboardOnEmptyTap = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse") return;
    const active = document.activeElement;
    if (active instanceof HTMLInputElement && !(e.target as Element).closest("input,button")) active.blur();
};

export const GameCreationModal = ({ open, onOpenChange, member, history, initialMode, initialType, tournamentMatch = null, initialCode, initialGameType, initialSeats, initialTarget }: GameCreationModalProps) => {
    const { t } = useT();

    // Connect logic hook
    const {
        gameMode, setGameMode,
        gameType, changeGameType,
        numberOfPlayers, setNumberOfPlayers,
        players, updatePlayer, movePlayer,
        inviteCode, inviteError, retryInvite,
        useFinishRule, setUseFinishRule,
        finishTargetCount, setFinishTargetCount,
        usePbaRule, setUsePbaRule,
        initializeGame,
        confirmStart, isStarting
    } = useGameCreation({ member, history, initialMode, initialType, open, tournamentMatch, initialCode, initialGameType, initialSeats, initialTarget });

    // Keep a live ref to initializeGame so the open-effect can invoke the latest version
    // WITHOUT depending on it (initializeGame is recreated whenever gameType / numberOfPlayers
    // change, and re-running it mid-session would wipe joined opponents and regenerate the PIN).
    const initializeGameRef = useRef(initializeGame);
    initializeGameRef.current = initializeGame;

    // Initialize exactly once per open transition, and only after the member query resolves
    // (initializeGame no-ops while member is undefined, so we must wait for it).
    const initRef = useRef(false);
    useEffect(() => {
        if (!open) {
            initRef.current = false;
            return;
        }
        if (!initRef.current && member) {
            initRef.current = true;
            if (initialMode) setGameMode(initialMode);
            initializeGameRef.current();
        }
    }, [open, member]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent hideClose className="w-screen h-screen max-w-none rounded-none border-none bg-surface-0 text-ink-1 p-0 flex flex-col focus:outline-none data-[state=open]:!zoom-in-100 data-[state=closed]:!zoom-out-100 data-[state=closed]:slide-out-to-bottom-100 data-[state=open]:slide-in-from-bottom-100 duration-200">
                {/* Custom Header */}
                <DialogTitle className="sr-only">
                    {gameMode === "practice" ? t("gameCreationModal.practiceTitle") : t("gameCreationModal.matchTitle")}
                </DialogTitle>
                <DialogDescription className="sr-only">
                    {gameMode === "practice" ? t("gameCreationModal.practiceDesc") : t("gameCreationModal.matchDesc")}
                </DialogDescription>

                <div
                    className="flex items-center justify-between px-4 py-2 border-b border-black/10 bg-surface-0 shrink-0"
                    style={{ paddingTop: "calc(0.5rem + env(safe-area-inset-top))" }}
                >
                    <button
                        onClick={() => onOpenChange(false)}
                        title={t("gameCreationModal.back")}
                        className="p-2 -ml-2 text-black/70 hover:text-ink-1"
                    >
                        <ChevronDown className="w-6 h-6 rotate-90" />
                    </button>
                    <span className="font-semibold text-lg">{gameMode === "practice" ? t("gameCreationModal.practiceTitle") : t("gameCreationModal.matchTitle")}</span>
                    <div className="w-10">
                        {/* Placeholder for symmetry or save button */}
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto min-h-0 scrollbar-hide p-6 pb-32" onPointerUp={dismissKeyboardOnEmptyTap}>
                    <div className="max-w-md md:max-w-4xl mx-auto transition-all duration-300">
                        <div className="flex flex-col gap-1 mb-6">
                            {/* 대진 경기는 상대가 이미 확정돼 PIN 이 없다. 그대로 두면 핀 카드가
                                영원히 "핀 생성 중..."으로 남는다. */}
                            {gameMode === "match" && tournamentMatch && (
                                <div className="p-5 rounded-3xl bg-brand flex flex-col items-center gap-1.5 mb-2 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
                                    <span className="text-[12px] font-semibold text-white/70 tracking-[0.15em]">
                                        {t("gameCreationModal.bracketLabel")}
                                    </span>
                                    <span className="text-xl font-semibold text-white">
                                        {tournamentMatch.opponent?.name}
                                    </span>
                                    <span className="text-[12px] text-white/70 text-center leading-relaxed mt-1">
                                        {t("gameCreationModal.bracketHint")}
                                    </span>
                                </div>
                            )}

                            {gameMode === "match" && !tournamentMatch && (
                                <>
                                    <div className="p-4 rounded-2xl bg-white mb-2">
                                        <p className="text-black/60 text-xs leading-relaxed text-center">
                                            {t("gameCreationModal.pinShareHint")}<br />
                                            <span className="text-brand font-bold">{t("gameCreationModal.pinAutoRecord")}</span>
                                        </p>
                                    </div>
                                    <div className="p-8 rounded-3xl bg-brand flex flex-col items-center justify-center shadow-[0_1px_2px_rgba(0,0,0,0.06)] border-4 border-black/5">
                                        {inviteCode ? (
                                            <span className="text-5xl font-semibold text-white tracking-[0.2em] font-mono drop-shadow-sm">{inviteCode}</span>
                                        ) : inviteError ? (
                                            <div className="flex flex-col items-center gap-3">
                                                <span className="text-[13px] font-semibold text-white/80 text-center">{inviteError}</span>
                                                <button
                                                    onClick={retryInvite}
                                                    className="px-4 h-9 rounded-full bg-white text-brand text-[13px] font-semibold active:scale-95 transition-transform"
                                                >
                                                    {t("gameCreationModal.retry")}
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="flex flex-col items-center gap-3">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-3 h-3 bg-white/30 rounded-full animate-bounce [animation-duration:1s]" />
                                                    <div className="w-3 h-3 bg-white/30 rounded-full animate-bounce [animation-duration:1s] [animation-delay:0.2s]" />
                                                    <div className="w-3 h-3 bg-white/30 rounded-full animate-bounce [animation-duration:1s] [animation-delay:0.4s]" />
                                                </div>
                                                <span className="text-[12px] font-semibold text-white/70 tracking-[0.2em]">{t("gameCreationModal.generatingPin")}</span>
                                            </div>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Game Type Selection — 대진 경기는 대회가 정한 종목으로 고정한다.
                            여기서 바꾸면 3쿠션 대회 경기가 4구로 기록돼 RP 도 엉뚱한 쪽에 붙는다. */}
                        <div className={`grid grid-cols-2 gap-3 mb-4 ${tournamentMatch ? "hidden" : ""}`}>
                            <Button
                                onClick={() => changeGameType("4c")}
                                className={`h-14 text-xl font-semibold rounded-2xl gap-2.5 ${gameType === "4c" ? "bg-brand text-white" : "bg-white text-black/60"}`}
                            >
                                <BallCluster colors={["white", "yellow", "red", "red"]} size={18} />
                                {t("gameCreationModal.fourBall")}
                            </Button>
                            <Button
                                onClick={() => changeGameType("3c")}
                                className={`h-14 text-xl font-semibold rounded-2xl gap-2.5 ${gameType === "3c" ? "bg-brand text-white" : "bg-white text-black/60"}`}
                            >
                                <BallCluster colors={["white", "yellow", "red"]} size={18} />
                                {t("gameCreationModal.threeBall")}
                            </Button>
                        </div>

                        {/* Player Count Selector (Match Only) — 대진 경기는 1대1 고정 */}
                        {gameMode === "match" && !tournamentMatch && (
                            <div className="bg-black/[0.04] p-1 rounded-xl flex gap-1 mb-4">
                                {[2, 3, 4].map((count) => (
                                    <button
                                        key={count}
                                        onClick={() => setNumberOfPlayers(count)}
                                        className={`flex-1 py-3 rounded-lg font-semibold text-sm transition-all ${numberOfPlayers === count ? 'bg-brand text-white shadow-sm' : 'text-black/50 hover:text-black/70'}`}
                                    >
                                        {count}{t("gameCreationModal.playersSuffix")}
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Player Grid */}
                        <div className="grid grid-cols-1 gap-4 pb-6">
                            {(gameMode === "practice" ? players.slice(0, 1) : players).map((player, idx) => (
                                <PlayerCard
                                    key={idx}
                                    idx={idx}
                                    player={player}
                                    totalPlayers={players.length}
                                    onMove={movePlayer}
                                    onUpdate={updatePlayer}
                                    gameType={gameType}
                                    history={member && player.member?.id === member.id ? history : undefined}
                                />
                            ))}
                        </div>

                        {/* Additional Rules Section */}
                        <div className="space-y-4 mb-2 px-1">
                            {/* Finish Rule (Custom Endpoint) */}
                            <div className="flex flex-col gap-2 p-3 bg-white rounded-xl ">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <LucideZap className={`w-4 h-4 ${useFinishRule ? 'text-brand' : 'text-black/40'}`} />
                                        <span className={`text-sm font-bold ${useFinishRule ? 'text-ink-1' : 'text-black/55'}`}>
                                            {t("gameCreationModal.finishRule")}
                                        </span>
                                    </div>
                                    <div
                                        className={`w-10 h-6 rounded-full p-1 cursor-pointer transition-colors ${useFinishRule ? 'bg-brand' : 'bg-black/15'}`}
                                        onClick={() => setUseFinishRule(!useFinishRule)}
                                    >
                                        <div className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${useFinishRule ? 'translate-x-4' : 'translate-x-0'}`} />
                                    </div>
                                </div>
                                {useFinishRule && (
                                    <div className="flex items-center justify-between mt-2 pl-6">
                                        <span className="text-xs text-black/60">
                                            {gameType === "4c" ? t("gameCreationModal.finishCount3c") : t("gameCreationModal.finishCountBank")}
                                        </span>
                                        <div className="flex items-center gap-2">
                                            <button onClick={() => setFinishTargetCount(Math.max(1, finishTargetCount - 1))} className="w-6 h-6 rounded bg-black/[0.06] hover:bg-black/[0.1] flex items-center justify-center">-</button>
                                            <span className="font-bold w-4 text-center">{finishTargetCount}</span>
                                            <button onClick={() => setFinishTargetCount(finishTargetCount + 1)} className="w-6 h-6 rounded bg-black/[0.06] hover:bg-black/[0.1] flex items-center justify-center">+</button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* PBA Rule (3C only) */}
                            {gameType === "3c" && (
                                <div className="flex items-center justify-between p-3 bg-white rounded-xl ">
                                    <div className="flex items-center gap-2">
                                        <span className={`text-sm font-bold ${usePbaRule ? 'text-brand' : 'text-black/55'}`}>
                                            {t("gameCreationModal.pbaRule")}
                                        </span>
                                    </div>
                                    <div
                                        className={`w-10 h-6 rounded-full p-1 cursor-pointer transition-colors ${usePbaRule ? 'bg-brand' : 'bg-black/15'}`}
                                        onClick={() => setUsePbaRule(!usePbaRule)}
                                    >
                                        <div className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${usePbaRule ? 'translate-x-4' : 'translate-x-0'}`} />
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer Config Buttons */}
                <div
                    className="p-4 border-t border-black/10 bg-surface-0 shrink-0"
                    style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
                >
                    <Button
                        onClick={confirmStart}
                        disabled={isStarting}
                        className="w-full h-14 bg-brand hover:bg-[#00543a] text-white rounded-full text-lg font-semibold shadow-[0_1px_2px_rgba(0,0,0,0.06)] active:scale-[0.98] transition-all disabled:opacity-60"
                    >
                        {isStarting ? t("gameCreationModal.preparing") : t("gameCreationModal.startGame")}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
};
