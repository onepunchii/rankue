import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, LucideUsers, LucideZap } from "lucide-react";
import { HiqMember, HiqGameHistory } from "@shared/schema";
import { useGameCreation, PlayerType } from "@/hooks/useGameCreation";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";

interface GameCreationModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    member: HiqMember | undefined;
    history: HiqGameHistory[] | undefined;
    initialMode?: "practice" | "match";
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
    const isSelf = player.isHost;
    const isGuest = player.type === 'guest';
    const textColor = "text-[#ffd700]";

    // Calculate Win Rate if history is available (only for self/host usually)
    const winRate = history ? (() => {
        const myGames = history.filter(g => g.gameMode === 'match'); // Only count match games
        if (myGames.length === 0) return null;
        const wins = myGames.filter(g => g.isWinner).length;
        return Math.round((wins / myGames.length) * 100);
    })() : null;

    return (
        <div className={`bg-white/5 rounded-2xl border border-white/5 p-4 flex flex-col gap-4 shadow-lg relative transition-all duration-300 ${isSelf ? 'border-[#ffd700]/30 bg-[#ffd700]/5' : ''}`}>
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center font-semibold text-base shrink-0 transition-colors ${isSelf ? 'bg-[#ffd700] text-black' : 'bg-white text-black'}`}>
                        P{idx + 1}
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            {isSelf && <span className="text-sm font-bold text-[#ffd700]">나 (Me)</span>}
                            {!isSelf && <span className="text-sm font-bold text-gray-400">상대방 {idx + 1}</span>}
                            {isSelf && <div className="text-[12px] font-bold text-black bg-[#ffd700] px-2 py-0.5 rounded-full">방장</div>}
                        </div>

                        {/* Reorder Buttons */}
                        <div className="flex items-center gap-1 mt-1">
                            <button
                                onClick={() => onMove(idx, -1)}
                                disabled={idx === 0}
                                title="위로 이동"
                                className={`p-1 rounded hover:bg-white/10 ${idx === 0 ? 'opacity-20 cursor-not-allowed' : 'text-gray-400 hover:text-white'}`}
                            >
                                <ChevronUp className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => onMove(idx, 1)}
                                disabled={idx === totalPlayers - 1}
                                title="아래로 이동"
                                className={`p-1 rounded hover:bg-white/10 ${idx === totalPlayers - 1 ? 'opacity-20 cursor-not-allowed' : 'text-gray-400 hover:text-white'}`}
                            >
                                <ChevronDown className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Player Type Toggle (If not self) */}
                {!isSelf && (
                    <div className="flex items-center bg-black/40 rounded-lg p-1 border border-white/5">
                        <button
                            onClick={() => onUpdate(idx, { type: 'member', target: 0, name: '' })}
                            title="회원으로 전환"
                            className={`px-3 py-1.5 rounded-md text-[12px] font-bold transition-all ${!isGuest ? 'bg-white text-black shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}
                        >
                            회원
                        </button>
                        <button
                            onClick={() => onUpdate(idx, { type: 'guest', target: 0, name: '' })}
                            title="게스트로 전환"
                            className={`px-3 py-1.5 rounded-md text-[12px] font-bold transition-all ${isGuest ? 'bg-white text-black shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}
                        >
                            게스트
                        </button>
                    </div>
                )}
            </div>

            {/* Input Area */}
            {isGuest ? (
                <div className="h-12 w-full flex items-center bg-black/20 rounded-xl px-2 border border-white/5 focus-within:border-white/20 transition-colors">
                    <input
                        type="text"
                        value={player.name || ""}
                        onChange={(e) => onUpdate(idx, { name: e.target.value })}
                        placeholder="이름 입력"
                        className="bg-transparent w-full font-bold text-white text-lg px-2 placeholder:text-gray-600 focus:outline-none"
                    />
                </div>
            ) : (
                <div className="h-12 w-full flex items-center bg-black/20 rounded-xl px-4 border border-white/5 justify-between">
                    {player.member ? (
                        <>
                            <span className="font-semibold text-white text-lg truncate">
                                {player.member.name}
                            </span>
                            <span className="text-xs font-bold text-gray-400 bg-black/30 px-2 py-1 rounded-lg">
                                AVG {player.member.average}
                            </span>
                        </>
                    ) : (
                        <span className="font-medium text-white/45 text-sm animate-pulse">
                            {isSelf ? "나" : "PIN입력 대기 중..."}
                        </span>
                    )}
                </div>
            )}

            {/* Score Control */}
            <div className="flex items-center gap-2">
                <button
                    onClick={() => onUpdate(idx, { target: Math.max(0, player.target - 1) })}
                    className="flex-1 h-14 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 transition-all flex items-center justify-center border border-white/5"
                >
                    <ChevronDown className="w-6 h-6 text-white" />
                </button>
                <div className={`h-14 min-w-[90px] flex items-center justify-center bg-black/40 rounded-xl border border-white/5 font-semibold text-3xl ${textColor} tracking-tight shadow-inner`}>
                    {player.target}
                </div>
                <button
                    onClick={() => onUpdate(idx, { target: player.target + 1 })}
                    className="flex-1 h-14 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 transition-all flex items-center justify-center border border-white/5"
                >
                    <ChevronUp className="w-6 h-6 text-white" />
                </button>
            </div>

            {/* Simple Stats Display (Optional, kept minimal) */}
            {player.member && winRate !== null && (
                <div className="mt-2 border-t border-white/5 pt-2 flex justify-between items-center px-1">
                    <span className="text-[12px] font-bold text-gray-500 uppercase">승률</span>
                    <span className="text-xs font-semibold text-[#6366f1]">
                        {winRate}%
                    </span>
                </div>
            )}
        </div>
    );
};

export const GameCreationModal = ({ open, onOpenChange, member, history, initialMode }: GameCreationModalProps) => {

    // Connect logic hook
    const {
        gameMode, setGameMode,
        gameType, changeGameType,
        numberOfPlayers, setNumberOfPlayers,
        players, updatePlayer, movePlayer,
        inviteCode,
        useFinishRule, setUseFinishRule,
        finishTargetCount, setFinishTargetCount,
        usePbaRule, setUsePbaRule,
        initializeGame,
        confirmStart
    } = useGameCreation({ member, history, initialMode });

    // Initialize when modal opens
    useEffect(() => {
        if (open) {
            if (initialMode) setGameMode(initialMode);
            initializeGame();
        }
    }, [open, initialMode, initializeGame, setGameMode]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent hideClose className="w-screen h-screen max-w-none rounded-none border-none bg-[#0a0a0a] text-white p-0 flex flex-col focus:outline-none data-[state=open]:!zoom-in-100 data-[state=closed]:!zoom-out-100 data-[state=closed]:slide-out-to-bottom-100 data-[state=open]:slide-in-from-bottom-100 duration-200">
                {/* Custom Header */}
                <DialogTitle className="sr-only">
                    {gameMode === "practice" ? "혼자 연습하기" : "매칭대결하기"}
                </DialogTitle>
                <DialogDescription className="sr-only">
                    {gameMode === "practice" ? "연습 세션을 시작합니다." : "매칭 대결을 시작합니다."}
                </DialogDescription>

                <div className="h-14 flex items-center justify-between px-4 border-b border-white/10 bg-[#0a0a0a] shrink-0">
                    <button
                        onClick={() => onOpenChange(false)}
                        title="뒤로 가기"
                        className="p-2 -ml-2 text-white/80 hover:text-white"
                    >
                        <ChevronDown className="w-6 h-6 rotate-90" />
                    </button>
                    <span className="font-semibold text-lg">{gameMode === "practice" ? "혼자 연습하기" : "매칭대결하기"}</span>
                    <div className="w-10">
                        {/* Placeholder for symmetry or save button */}
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto min-h-0 scrollbar-hide p-6 pb-32">
                    <div className="max-w-md md:max-w-4xl mx-auto transition-all duration-300">
                        <div className="flex flex-col gap-1 mb-6">
                            {gameMode === "match" && (
                                <>
                                    <div className="p-4 rounded-2xl bg-white/5 border border-white/10 mb-2">
                                        <p className="text-gray-400 text-xs leading-relaxed text-center">
                                            이 핀번호를 상대방에게 알려주세요.<br />
                                            <span className="text-[#ffd700] font-bold">회원이 참가하면 게임 전적이 자동으로 기록됩니다.</span>
                                        </p>
                                    </div>
                                    <div className="p-8 rounded-3xl bg-[#ffd700] flex flex-col items-center justify-center shadow-[0_20px_40px_rgba(255,215,0,0.1)] border-4 border-black/5">
                                        {inviteCode ? (
                                            <span className="text-5xl font-semibold text-black tracking-[0.2em] font-mono drop-shadow-sm">{inviteCode}</span>
                                        ) : (
                                            <div className="flex flex-col items-center gap-3">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-3 h-3 bg-black/20 rounded-full animate-bounce [animation-duration:1s]" />
                                                    <div className="w-3 h-3 bg-black/20 rounded-full animate-bounce [animation-duration:1s] [animation-delay:0.2s]" />
                                                    <div className="w-3 h-3 bg-black/20 rounded-full animate-bounce [animation-duration:1s] [animation-delay:0.4s]" />
                                                </div>
                                                <span className="text-[12px] font-semibold text-black/40 uppercase tracking-[0.3em]">핀 생성 중...</span>
                                            </div>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Game Type Selection */}
                        <div className="grid grid-cols-2 gap-3 mb-4">
                            <Button
                                onClick={() => changeGameType("4c")}
                                className={`h-14 text-xl font-semibold rounded-2xl ${gameType === "4c" ? "bg-[#0e4d2a] text-white" : "bg-white/5 text-gray-400"}`}
                            >
                                4구
                            </Button>
                            <Button
                                onClick={() => changeGameType("3c")}
                                className={`h-14 text-xl font-semibold rounded-2xl ${gameType === "3c" ? "bg-[#0e4d2a] text-white" : "bg-white/5 text-gray-400"}`}
                            >
                                3구
                            </Button>
                        </div>

                        {/* Player Count Selector (Match Only) */}
                        {gameMode === "match" && (
                            <div className="bg-white/5 p-1 rounded-xl flex gap-1 mb-4">
                                {[2, 3, 4].map((count) => (
                                    <button
                                        key={count}
                                        onClick={() => setNumberOfPlayers(count)}
                                        className={`flex-1 py-3 rounded-lg font-semibold text-sm transition-all ${numberOfPlayers === count ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}
                                    >
                                        {count}인
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
                            <div className="flex flex-col gap-2 p-3 bg-white/5 rounded-xl border border-white/5">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <LucideZap className={`w-4 h-4 ${useFinishRule ? 'text-[#ffd700]' : 'text-gray-500'}`} />
                                        <span className={`text-sm font-bold ${useFinishRule ? 'text-white' : 'text-gray-400'}`}>
                                            마무리 룰 적용
                                        </span>
                                    </div>
                                    <div
                                        className={`w-10 h-6 rounded-full p-1 cursor-pointer transition-colors ${useFinishRule ? 'bg-[#ffd700]' : 'bg-white/20'}`}
                                        onClick={() => setUseFinishRule(!useFinishRule)}
                                    >
                                        <div className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${useFinishRule ? 'translate-x-4' : 'translate-x-0'}`} />
                                    </div>
                                </div>
                                {useFinishRule && (
                                    <div className="flex items-center justify-between mt-2 pl-6">
                                        <span className="text-xs text-gray-400">
                                            {gameType === "4c" ? "3쿠션 마무리 갯수" : "뱅크샷 마무리 갯수"}
                                        </span>
                                        <div className="flex items-center gap-2">
                                            <button onClick={() => setFinishTargetCount(Math.max(1, finishTargetCount - 1))} className="w-6 h-6 rounded bg-white/10 flex items-center justify-center">-</button>
                                            <span className="font-bold w-4 text-center">{finishTargetCount}</span>
                                            <button onClick={() => setFinishTargetCount(finishTargetCount + 1)} className="w-6 h-6 rounded bg-white/10 flex items-center justify-center">+</button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* PBA Rule (3C only) */}
                            {gameType === "3c" && (
                                <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5">
                                    <div className="flex items-center gap-2">
                                        <span className={`text-sm font-bold ${usePbaRule ? 'text-[#ffd700]' : 'text-gray-400'}`}>
                                            PBA 룰 (2점제/뱅크샷)
                                        </span>
                                    </div>
                                    <div
                                        className={`w-10 h-6 rounded-full p-1 cursor-pointer transition-colors ${usePbaRule ? 'bg-[#ffd700]' : 'bg-white/20'}`}
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
                <div className="p-4 border-t border-white/10 bg-[#0a0a0a] shrink-0 safe-area-pb">
                    <Button
                        onClick={confirmStart}
                        className="w-full h-14 bg-[#0e4d2a] hover:bg-[#156f3d] text-white rounded-2xl text-lg font-semibold shadow-lg shadow-[#0e4d2a]/20"
                    >
                        START GAME
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
};
