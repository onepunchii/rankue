import React, { useState, useEffect, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { HiqGame, HiqMember } from "@shared/schema";
import { LandscapeGuard } from "@/components/hiq/LandscapeGuard";
import { useGameHistory } from "@/hooks/useGameHistory";
import { useGameAudio } from "@/hooks/useGameAudio";
import { LucideSettings, LucideLogOut, LucideChevronLeft, LucideUser, LucideUndo2, LucideRedo2, LucideVolume2, LucideVolumeX, LucidePlus, LucideMinus, ArrowRight, GripHorizontal, LucideLayoutGrid } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragOverlay, defaultDropAnimationSideEffects, TouchSensor, MouseSensor } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

function SortablePlayerWrapper({ id, children }: any) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 50 : 1,
        opacity: isDragging ? 0.8 : 1,
        scale: isDragging ? 1.05 : 1,
        boxShadow: isDragging ? '0 20px 50px rgba(0,0,0,0.5)' : 'none',
        position: 'relative' as const,
        height: '100%',
        flex: 1,
        display: 'flex',
        flexDirection: 'column' as const,
        touchAction: 'none'
    };

    return (
        <div ref={setNodeRef} style={style}>
            {React.Children.map(children, child => {
                if (React.isValidElement(child)) {
                    return React.cloneElement(child, {
                        dragAttributes: attributes,
                        dragListeners: listeners,
                        isDragging
                    } as any);
                }
                return child;
            })}
        </div>
    );
}

type GameState = {
    p1Score: number;
    p2Score: number;
    p3Score: number;
    p4Score: number;
    p1FinishScore: number;
    p2FinishScore: number;
    p3FinishScore: number;
    p4FinishScore: number;
    innings: number;
    p1FinishInnings: number;
    p2FinishInnings: number;
    p3FinishInnings: number;
    p4FinishInnings: number;
    p1Run: number;
    p2Run: number;
    p3Run: number;
    p4Run: number;
    p1HighRun: number;
    p2HighRun: number;
    p3HighRun: number;
    p4HighRun: number;
    currentTurn: 1 | 2 | 3 | 4;
    p1Innings: number[];
    p2Innings: number[];
    p3Innings: number[];
    p4Innings: number[];
};

function PlayerCard({
    player,
    score,
    target,
    run,
    highRun,
    avg,
    isTurn,
    isFinishMode,
    theme,
    onTap,
    onTurnClick,
    showVs,
    isSolo,
    hideEndInning,
    is4c,
    dragAttributes,
    dragListeners,
    isDragging,
    onInningClick
}: {
    player?: HiqMember;
    score: number;
    target: number;
    run: number;
    highRun: number;
    avg: string;
    isTurn: boolean;
    isFinishMode: boolean;
    theme: string;
    onTap: (zone: "top" | "bottom") => void;
    onTurnClick?: () => void;
    showVs?: boolean;
    isSolo: boolean;
    hideEndInning: boolean;
    is4c: boolean;
    dragAttributes?: any;
    dragListeners?: any;
    isDragging?: boolean;
    onInningClick?: () => void;
}) {
    const themeColor = theme === 'white' ? '#FFFFFF' :
        theme === 'yellow' ? '#fde047' :
            theme === 'red' ? '#ef4444' : '#3b82f6';

    const displayScore = score;
    const displayRun = run;
    const displayHighRun = highRun;
    const displayRemaining = Math.max(0, target - score);

    const bgTone = isTurn ? "bg-[#1c1c2e]" : "bg-[#000000]";
    const glowStyle = isTurn
        ? {
            boxShadow: `inset 0 0 100px ${themeColor}10, 0 0 60px ${themeColor}30`,
            border: `6px solid ${themeColor}`,
        }
        : { border: "6px solid transparent" };

    const remaining = Math.max(0, target - score);

    return (
        <div
            className={`relative flex-1 flex flex-col h-full border-x transition-all duration-500 overflow-hidden ${bgTone} ${isTurn ? 'z-10 scale-[1.02] border-t-8 shadow-2xl' : 'z-0 opacity-50 grayscale'}`}
            style={isTurn ? { ...glowStyle, borderTopColor: themeColor } : {}}
        >
            {/* Header (15%) - Symmetric & Clean - DRAG HANDLE */}
            <div
                {...dragAttributes}
                {...dragListeners}
                className="flex-[0_0_15%] flex items-center justify-between px-8 relative z-50 border-b transition-all duration-300 pointer-events-none touch-none"
                style={{
                    backgroundColor: 'rgba(0, 0, 0, 0.3)',
                    borderColor: isTurn ? themeColor : 'rgba(255, 255, 255, 0.1)'
                }}
            >
                {/* Content Container - Capture Drag Here */}
                <div className="flex items-center gap-3 pointer-events-auto cursor-grab active:cursor-grabbing">
                    <h2 className={`text-3xl lg:text-4xl font-extrabold tracking-tighter ${isTurn ? 'text-white' : 'text-white/30'}`}>
                        {player?.name || "Player"}
                    </h2>
                    {isSolo && (
                        <span className="text-[10px] px-2 py-0.5 rounded-md border border-white/10 text-white/20 font-black uppercase tracking-widest">
                            SOLO
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-3 pointer-events-auto">
                    <div className="flex flex-col items-end">
                        <span className="text-[9px] font-black text-white/20 uppercase tracking-[0.2em]">Target</span>
                        <span className={`text-xl font-black italic ${isTurn ? 'text-white/60' : 'text-white/10'}`}>{target}</span>
                    </div>
                </div>
            </div>

            {/* Global Touch Zones (Expanded to Cover Full Card) */}
            <div className="absolute inset-0 z-[45] flex flex-col cursor-pointer touch-manipulation">
                {/* Top Zone (Increase) - Covers Top 50% */}
                <div
                    className="absolute inset-x-0 top-0 h-[50%] active:bg-green-500/5 transition-colors"
                    onClick={() => onTap("top")}
                />

                {/* Bottom Zone (Decrease) - Covers Bottom 50% */}
                <div
                    className="absolute inset-x-0 bottom-0 h-[50%] active:bg-red-500/5 transition-colors"
                    onClick={() => onTap("bottom")}
                />

                {/* Visual Divider - Enhanced Visibility */}
                <div className="absolute top-1/2 left-0 right-0 h-[2px] bg-white/20 pointer-events-none shadow-[0_0_10px_rgba(255,255,255,0.2)]" />
            </div>

            {/* Score Body (Flex-1) */}
            <div className="flex-1 relative flex flex-col z-10 pointer-events-none">

                {/* Centered Score Display */}
                <div className="absolute inset-0 flex items-center justify-center">
                    <AnimatePresence mode="popLayout" initial={false}>
                        <motion.div
                            key={score}
                            initial={{ y: 20, opacity: 0, scale: 1.1 }}
                            animate={{ y: 0, opacity: 1, scale: 1 }}
                            exit={{ y: -20, opacity: 0, scale: 0.9 }}
                            transition={{ type: "spring", stiffness: 400, damping: 25 }}
                            className="flex flex-col items-center"
                        >
                            <h1
                                className="text-[12vw] lg:text-[190px] leading-none font-black tabular-nums tracking-tighter italic filter drop-shadow-[0_15px_40px_rgba(0,0,0,0.6)]"
                                style={{ color: isTurn ? themeColor : '#4b5563' }}
                            >
                                {displayScore}
                            </h1>

                            {/* Current Run Badge */}
                            <AnimatePresence>
                                {isTurn && run > 0 && (
                                    <motion.div
                                        initial={{ opacity: 0, y: -20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -10 }}
                                        className="mt-[-20px] px-4 py-1.5 rounded-2xl bg-gradient-to-r from-orange-500 to-yellow-500 shadow-[0_10px_30px_rgba(255,165,0,0.5)] border border-white/20 flex items-center gap-2"
                                    >
                                        <span className="text-xs font-black text-white tracking-tight">🔥 +{displayRun} RUN</span>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* Centered FINISH Text - Interactive */}
                            {displayRemaining === 0 && (
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.5 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    className="absolute inset-0 flex items-center justify-center z-50 pointer-events-auto cursor-pointer"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onTurnClick && onTurnClick();
                                    }}
                                >
                                    <div className="bg-red-500/20 backdrop-blur-sm px-8 py-4 rounded-3xl border border-red-500/50 animate-pulse">
                                        <span className="text-[8vw] font-black italic text-red-500 tracking-tighter drop-shadow-[0_10px_20px_rgba(0,0,0,0.8)]">
                                            FINISH
                                        </span>
                                    </div>
                                </motion.div>
                            )}
                        </motion.div>
                    </AnimatePresence>
                </div>
            </div>

            {/* Info Footer (15%) - Symmetric & Clean */}
            <div
                className="flex-[0_0_15%] flex items-center justify-between px-5 relative z-50 border-t transition-all duration-300 pointer-events-none bg-black/30 backdrop-blur-md"
                style={{
                    backgroundColor: 'rgba(0, 0, 0, 0.3)',
                    borderColor: isTurn ? themeColor : 'rgba(255, 255, 255, 0.1)'
                }}
            >
                {/* Left Section: Average (Top) & High Run (Bottom) */}
                <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-3">
                        <span className="text-[9px] font-black text-white/50 uppercase tracking-widest w-10 text-right">AVG</span>
                        <span className={`text-2xl font-black font-mono tracking-tighter ${isTurn ? 'text-white' : 'text-white/50'}`}>{avg}</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="text-[9px] font-black text-white/50 uppercase tracking-widest w-10 text-right">H.R</span>
                        <span className={`text-2xl font-black font-mono tracking-tighter ${isTurn ? 'text-white' : 'text-white/50'}`}>{displayHighRun}</span>
                    </div>
                </div>

                {/* Right Section: To Go & Button */}
                <div className="flex items-center gap-10">
                    <div className="flex flex-col items-end">
                        <span className={`text-6xl lg:text-7xl font-black italic tabular-nums leading-none ${isTurn ? 'text-[#ffff00]' : 'text-white/20'}`}>
                            {displayRemaining === 0 ? (
                                <span className="text-transparent">0</span>
                            ) : displayRemaining}
                        </span>
                    </div>

                    <AnimatePresence>
                        {isTurn && !isFinishMode && !hideEndInning && (
                            <motion.button
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 20 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onTurnClick && onTurnClick();
                                }}
                                className="h-16 px-8 rounded-2xl flex items-center justify-center gap-3 shadow-[0_15px_30px_rgba(0,0,0,0.4)] border border-white/10 transition-all pointer-events-auto relative z-50 bg-white text-black"
                            >
                                <span className="text-sm font-black tracking-widest">
                                    END INNING
                                </span>
                                <ArrowRight className="w-4 h-4 text-black/40" />
                            </motion.button>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* Visual Indicators for Finish Mode */}
            {isFinishMode && isTurn && (
                <div className="absolute inset-0 pointer-events-none z-0">
                    <div className="absolute inset-0 border-[12px] border-red-500/20 animate-pulse" />
                    <div className="absolute inset-0 bg-red-500/5 mix-blend-overlay" />
                </div>
            )}
        </div>
    );
}


function BottomBar({ innings, timer, onExit, canUndo, canRedo, onUndo, onRedo }: { innings: number, timer: string, onExit: () => void, canUndo: boolean, canRedo: boolean, onUndo: () => void, onRedo: () => void }) {
    return (
        <div className="h-16 bg-[#0a0a0a] border-t border-white/5 flex items-center justify-between px-8 shrink-0 z-50">
            {/* Left Section: Time */}
            <div className="flex items-center gap-6 w-1/4">
                <div className="flex flex-col">
                    <span className="text-[8px] font-black text-white/20 uppercase tracking-[0.3em]">Session Time</span>
                    <span className="text-xl font-black text-white font-mono tracking-tighter">{timer}</span>
                </div>
            </div>

            {/* Center Section: Inning + Undo/Redo */}
            <div className="flex items-center justify-center gap-12 flex-1">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={onUndo}
                    disabled={!canUndo}
                    className={`w-14 h-14 rounded-2xl bg-white/5 border border-white/5 ${canUndo ? 'text-white hover:bg-white/10' : 'text-white/5'}`}
                >
                    <LucideUndo2 className="w-6 h-6" />
                </Button>

                {/* Billiard Ball Style Inning Display */}
                <div className="relative group">
                    <div className="w-24 h-24 rounded-full bg-gradient-to-br from-[#1a1a1a] to-[#000000] border-4 border-[#ffd700] flex flex-col items-center justify-center shadow-[0_0_40px_rgba(255,215,0,0.2)] -mt-16 bg-black z-50">
                        <span className="text-[9px] font-black text-white/40 uppercase tracking-[0.2em] leading-none mb-1">Inning</span>
                        <span className="text-4xl font-black text-[#ffd700] tabular-nums leading-none drop-shadow-[0_0_10px_rgba(255,215,0,0.5)]">{innings}</span>
                    </div>
                    {/* Glow effect back shadow */}
                    <div className="absolute inset-0 rounded-full blur-2xl bg-[#ffd700]/10 -mt-16 -z-10" />
                </div>

                <Button
                    variant="ghost"
                    size="icon"
                    onClick={onRedo}
                    disabled={!canRedo}
                    className={`w-14 h-14 rounded-2xl bg-white/5 border border-white/5 ${canRedo ? 'text-white hover:bg-white/10' : 'text-white/5'}`}
                >
                    <LucideRedo2 className="w-6 h-6" />
                </Button>
            </div>

            {/* Right Section: Controls */}
            <div className="flex items-center justify-end gap-3 w-1/4">
                <Button
                    onClick={onExit}
                    className="h-10 px-6 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 hover:bg-red-500 hover:text-white transition-all text-xs font-black tracking-widest"
                >
                    종료하기
                </Button>
            </div>
        </div>
    );
}

export default function HiqScoreboard() {
    const [, params] = useRoute("/game/:id");
    const id = params?.id;
    const [, setLocation] = useLocation();

    // Hooks
    const { speak, playEffect, isMuted, setIsMuted } = useGameAudio();

    // Game State with History
    const { state: gameState, set: setGameState, undo, redo, canUndo, canRedo } = useGameHistory<GameState>({
        p1Score: 0,
        p2Score: 0,
        p3Score: 0,
        p4Score: 0,
        p1FinishScore: 0,
        p2FinishScore: 0,
        p3FinishScore: 0,
        p4FinishScore: 0,
        innings: 1,
        p1FinishInnings: 0,
        p2FinishInnings: 0,
        p3FinishInnings: 0,
        p4FinishInnings: 0,
        p1Run: 0,
        p2Run: 0,
        p3Run: 0,
        p4Run: 0,
        p1HighRun: 0,
        p2HighRun: 0,
        p3HighRun: 0,
        p4HighRun: 0,
        currentTurn: 1,
        p1Innings: [],
        p2Innings: [],
        p3Innings: [],
        p4Innings: []
    });

    const [inningModalPlayer, setInningModalPlayer] = useState<number | null>(null);

    // Timer State
    const [elapsedTime, setElapsedTime] = useState(0);

    // Timer
    useEffect(() => {
        const timer = setInterval(() => {
            setElapsedTime(prev => prev + 1);
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    // Orientation Cleanup on Unmount
    useEffect(() => {
        return () => {
            if (typeof screen !== 'undefined' && screen.orientation && typeof screen.orientation.unlock === 'function') {
                try { screen.orientation.unlock(); } catch (e) { console.warn(e); }
            }
        };
    }, []);

    const formatTime = (seconds: number) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    // Queries
    const { data: game, isLoading } = useQuery<HiqGame>({
        queryKey: [`/api/hiq/game/${id}`],
    });

    const { data: player1 } = useQuery<HiqMember>({
        queryKey: [`/api/hiq/me`],
        enabled: !!game,
    });

    const { data: player2 } = useQuery<HiqMember>({
        queryKey: [`/api/hiq/members/${game?.player2Id}`],
        enabled: !!game?.player2Id,
    });

    const { data: player3 } = useQuery<HiqMember>({
        queryKey: [`/api/hiq/members/${game?.player3Id}`],
        enabled: !!game?.player3Id,
    });

    const { data: player4 } = useQuery<HiqMember>({
        queryKey: [`/api/hiq/members/${game?.player4Id}`],
        enabled: !!game?.player4Id,
    });

    // Mutations
    const finishMutation = useMutation({
        mutationFn: async (variables?: { winnerId?: string | null; winnerIndex?: number }) => {
            return await apiRequest(`/api/hiq/game/${id}/finish`, {
                method: "POST",
                body: {
                    player1Score: gameState.p1Score,
                    player2Score: gameState.p2Score,
                    player3Score: gameState.p3Score,
                    player4Score: gameState.p4Score,
                    totalInnings: gameState.innings,
                    winnerId: variables?.winnerId,
                    player1HighRun: gameState.p1HighRun,
                    player2HighRun: gameState.p2HighRun,
                    player3HighRun: gameState.p3HighRun,
                    player4HighRun: gameState.p4HighRun,
                    player1Innings: gameState.p1Innings,
                    player2Innings: gameState.p2Innings,
                    player3Innings: gameState.p3Innings,
                    player4Innings: gameState.p4Innings
                },
            });
        },
        onSuccess: (data, variables) => {
            speak("경기 종료");

            // Unlock orientation on finish
            if (typeof screen !== 'undefined' && screen.orientation && typeof screen.orientation.unlock === 'function') {
                try {
                    screen.orientation.unlock();
                    // Attempt to lock to portrait if supported, though unlock usually suffices to respect device orientation
                    // (screen.orientation as any).lock('portrait').catch(() => {});
                } catch (e) { console.warn(e); }
            }

            localStorage.setItem(`game_result_${id}`, JSON.stringify({
                ...data,
                winnerIndex: variables?.winnerIndex,
                p1Innings: gameState.p1Innings,
                p2Innings: gameState.p2Innings,
                p3Innings: gameState.p3Innings,
                p4Innings: gameState.p4Innings,
                p1HighRun: gameState.p1HighRun,
                p2HighRun: gameState.p2HighRun,
                p3HighRun: gameState.p3HighRun,
                p4HighRun: gameState.p4HighRun
            }));
            setLocation(`/game/result?id=${id}`);
        },
    });

    const updateScoreMutation = useMutation({
        mutationFn: async () => {
            return await apiRequest(`/api/hiq/game/${id}/score`, {
                method: "PATCH",
                body: {
                    player1Score: gameState.p1Score,
                    player2Score: gameState.p2Score,
                    player3Score: gameState.p3Score,
                    player4Score: gameState.p4Score,
                    innings: gameState.innings,
                    status: "playing_base"
                },
            });
        },
        onError: (e) => console.error(e)
    });

    // Auto-save
    useEffect(() => {
        if (gameState.innings > 1 || gameState.p1Score > 0) {
            updateScoreMutation.mutate();
        }
    }, [gameState]);

    // Auto-finish Check removed here to handle it in handleCardTap
    // But we might still need a safety check? No, manual finish via interaction is better.

    // Determine Total Players (Safe calculation for hooks)
    let totalPlayers = 1;
    if (game) {
        if (game.player2Id || game.player2Name) totalPlayers++;
        if (game.player3Id || game.player3Name) totalPlayers++;
        if (game.player4Id || game.player4Name) totalPlayers++;
    }

    // Dnd State
    const [playerOrder, setPlayerOrder] = useState<number[]>([]);

    useEffect(() => {
        if (totalPlayers >= 1) {
            // Only update if length differs to avoid reset
            if (playerOrder.length === 0 || playerOrder.length !== totalPlayers) {
                setPlayerOrder(Array.from({ length: totalPlayers }, (_, i) => i + 1));
            }
        }
    }, [totalPlayers]);

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8,
            },
        }),
        useSensor(TouchSensor, {
            activationConstraint: {
                delay: 250,
                tolerance: 5,
            },
        }),
        useSensor(MouseSensor, {})
    );

    // Game Start Voice
    useEffect(() => {
        const timer = setTimeout(() => {
            speak("경기 시작. 1이닝입니다.");
        }, 1000);
        return () => clearTimeout(timer);
    }, []);

    const handleDragEnd = (event: any) => {
        const { active, over } = event;

        if (active.id !== over.id) {
            setPlayerOrder((items) => {
                const oldIndex = items.indexOf(active.id);
                const newIndex = items.indexOf(over.id);
                return arrayMove(items, oldIndex, newIndex);
            });
        }
    };

    if (isLoading || !game) {
        return <div className="min-h-screen bg-black flex items-center justify-center text-white">LOADING...</div>;
    }



    // Handlers
    const handleTurnChange = (targetPlayer?: number) => {
        setGameState(prev => {
            let nextTurn = prev.currentTurn;
            let nextInnings = prev.innings;

            if (targetPlayer) {
                // If explicitly selecting a player, do NOT auto increment inning?
                nextTurn = targetPlayer as any;
                // If switching back to Player 1 from another player, increment inning
                if (nextTurn === 1 && prev.currentTurn !== 1) {
                    nextInnings = prev.innings + 1;
                }
            } else {
                nextTurn = (prev.currentTurn % totalPlayers + 1) as any;
                if (nextTurn === 1) {
                    nextInnings = prev.innings + 1;
                    speak(`${nextInnings}이닝`);
                }
            }

            // Record Inning Score for the finished player
            const finishedPlayer = prev.currentTurn;
            const run = prev[`p${finishedPlayer}Run` as keyof GameState] as number;
            const inningHistoryKey = `p${finishedPlayer}Innings` as keyof GameState;
            const newHistory = [...(prev[inningHistoryKey] as number[]), run];

            return {
                ...prev,
                p1Run: 0,
                p2Run: 0,
                p3Run: 0,
                p4Run: 0,
                currentTurn: nextTurn,
                innings: nextInnings,
                [inningHistoryKey]: newHistory
            };
        });

        playEffect('turn');

        // Announce Name logic delayed slightly or just done here
        setTimeout(() => {
            const nextIdx = targetPlayer || ((gameState.currentTurn % totalPlayers) + 1);
            // ...
        }, 100);
    };

    const handleCardTap = (playerIndex: 1 | 2 | 3 | 4, zone: "top" | "bottom") => {
        const key = `p${playerIndex}Score` as keyof GameState;
        const targetKey = `player${playerIndex}Target` as keyof HiqGame;
        const target = game[targetKey] as number || 0;
        const currentScore = gameState[key] as number;

        // 1. If not my turn, pass turn to me? 
        // Or if it IS my turn, and I tap, score/finish logic.
        // User request: "1->2->3->4... ensure sequential". 
        // But tapping another player usually means "Oops, forgot to switch, switch now".
        if (gameState.currentTurn !== playerIndex) {
            handleTurnChange(playerIndex);

            // Speak Name
            const p = playerIndex === 1 ? player1 : playerIndex === 2 ? player2 : playerIndex === 3 ? player3 : player4;
            const pName = p?.name || (game[`player${playerIndex}Name` as keyof HiqGame] as string);
            if (pName) speak(`${pName}, 공격`);
            return;
        }

        // 2. Score Logic
        if (currentScore >= target) {
            // Any tap in finish mode triggers win (user request: "1 more click to finish")
            playEffect('win');

            let winnerId: string | undefined | null = undefined;
            if (playerIndex === 1) winnerId = game.player1Id;
            else if (playerIndex === 2) winnerId = game.player2Id;
            else if (playerIndex === 3) winnerId = game.player3Id;
            else if (playerIndex === 4) winnerId = game.player4Id;

            finishMutation.mutate({ winnerId: winnerId || undefined, winnerIndex: playerIndex });
            return;
        }

        // Normal Mode
        const change = zone === "top" ? 1 : -1;
        // Allow negative scores (removed Math.max(0, ...))
        const newScore = currentScore + change;

        if (newScore !== currentScore) {
            const runKey = `p${playerIndex}Run` as keyof GameState;
            const highRunKey = `p${playerIndex}HighRun` as keyof GameState;
            setGameState(prev => {
                const newRun = (prev[runKey] as number) + change;
                return {
                    ...prev,
                    [key]: newScore,
                    [runKey]: newRun,
                    [highRunKey]: Math.max(prev[highRunKey] as number, newRun)
                };
            });

            if (newScore >= target) {
                playEffect('finishing');
                speak("마무리 기회");
            } else {
                playEffect('click');
                // 남은 점수 계산
                const remaining = target - newScore;

                // 점수가 증가했을 때만 남은 점수를 알려주는 것이 자연스러움 (감소 시에는 굳이?)
                // 사용자가 "1개를 득점하면" 이라고 했으므로 top tap(증가) 기준
                if (change > 0 && remaining > 0) {
                    speak(`${newScore}점. ${remaining}점 남았습니다.`);
                } else {
                    // 감소하거나 남은 점수가 0 이하(위에서 처리되겠지만)인 경우 그냥 점수만
                    speak(`${newScore}점`);
                }
            }
        }
    };

    // Calculate Averages Helper
    const getAvg = (score: number) => (score / Math.max(1, gameState.innings)).toFixed(2);

    return (
        <LandscapeGuard>
            <div className="h-[100dvh] bg-[#050505] text-white font-sans overflow-hidden flex flex-col touch-none select-none relative">
                {/* Background Vignette */}
                <div className="absolute inset-0 pointer-events-none z-0">
                    <div className="absolute inset-0 bg-premium-billiards opacity-10 grayscale brightness-50" />
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,transparent_0%,rgba(0,0,0,0.6)_100%)]" />
                </div>
                {/* Main Game Grid */}
                <div className="flex-1 flex w-full relative z-0">
                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                    >
                        <SortableContext
                            items={playerOrder}
                            strategy={horizontalListSortingStrategy}
                        >
                            {playerOrder.map((playerId) => {
                                // Logic to render specific player card based on ID
                                if (playerId === 1) {
                                    return (
                                        <SortablePlayerWrapper key={playerId} id={playerId}>
                                            <PlayerCard
                                                player={player1}
                                                score={gameState.p1Score}
                                                target={game.player1Target}
                                                run={gameState.p1Run}
                                                highRun={gameState.p1HighRun}
                                                avg={getAvg(gameState.p1Score)}
                                                isTurn={gameState.currentTurn === 1}
                                                isFinishMode={gameState.p1Score >= game.player1Target}
                                                theme="white"
                                                onTap={(zone) => handleCardTap(1, zone)}
                                                onTurnClick={() => {
                                                    if (gameState.p1Score >= game.player1Target) {
                                                        finishMutation.mutate({ winnerId: game.player1Id, winnerIndex: 1 });
                                                    } else {
                                                        handleTurnChange();
                                                    }
                                                }}
                                                isSolo={totalPlayers === 1}
                                                hideEndInning={game.gameMode === "match"}
                                                is4c={game.gameType === "4c"}
                                                onInningClick={() => setInningModalPlayer(1)}
                                            />
                                        </SortablePlayerWrapper>
                                    );
                                }
                                if (playerId === 2 && totalPlayers >= 2) {
                                    return (
                                        <SortablePlayerWrapper key={playerId} id={playerId}>
                                            <PlayerCard
                                                player={player2 || (game.player2Name ? { name: game.player2Name } as any : undefined)}
                                                score={gameState.p2Score}
                                                target={game.player2Target}
                                                run={gameState.p2Run}
                                                highRun={gameState.p2HighRun}
                                                avg={getAvg(gameState.p2Score)}
                                                isTurn={gameState.currentTurn === 2}
                                                isFinishMode={gameState.p2Score >= (game.player2Target || 0)}
                                                theme="yellow"
                                                onTap={(zone) => handleCardTap(2, zone)}
                                                onTurnClick={() => {
                                                    if (gameState.p2Score >= (game.player2Target || 0)) {
                                                        finishMutation.mutate({ winnerId: game.player2Id || undefined, winnerIndex: 2 });
                                                    } else {
                                                        handleTurnChange();
                                                    }
                                                }}
                                                showVs={totalPlayers === 2}
                                                isSolo={false}
                                                hideEndInning={game.gameMode === "match"}
                                                is4c={game.gameType === "4c"}
                                                onInningClick={() => setInningModalPlayer(2)}
                                            />
                                        </SortablePlayerWrapper>
                                    );
                                }
                                if (playerId === 3 && totalPlayers >= 3) {
                                    return (
                                        <SortablePlayerWrapper key={playerId} id={playerId}>
                                            <PlayerCard
                                                player={player3 || (game.player3Name ? { name: game.player3Name } as any : undefined)}
                                                score={gameState.p3Score}
                                                target={game.player3Target}
                                                run={gameState.p3Run}
                                                highRun={gameState.p3HighRun}
                                                avg={getAvg(gameState.p3Score)}
                                                isTurn={gameState.currentTurn === 3}
                                                isFinishMode={gameState.p3Score >= (game.player3Target || 0)}
                                                theme="red"
                                                onTap={(zone) => handleCardTap(3, zone)}
                                                onTurnClick={() => {
                                                    if (gameState.p3Score >= (game.player3Target || 0)) {
                                                        finishMutation.mutate({ winnerId: game.player3Id || undefined, winnerIndex: 3 });
                                                    } else {
                                                        handleTurnChange();
                                                    }
                                                }}
                                                isSolo={false}
                                                hideEndInning={game.gameMode === "match"}
                                                is4c={game.gameType === "4c"}
                                                onInningClick={() => setInningModalPlayer(3)}
                                            />
                                        </SortablePlayerWrapper>
                                    );
                                }
                                if (playerId === 4 && totalPlayers >= 4) {
                                    return (
                                        <SortablePlayerWrapper key={playerId} id={playerId}>
                                            <PlayerCard
                                                player={player4 || (game.player4Name ? { name: game.player4Name } as any : undefined)}
                                                score={gameState.p4Score}
                                                target={game.player4Target}
                                                run={gameState.p4Run}
                                                highRun={gameState.p4HighRun}
                                                avg={getAvg(gameState.p4Score)}
                                                isTurn={gameState.currentTurn === 4}
                                                isFinishMode={gameState.p4Score >= (game.player4Target || 0)}
                                                theme="blue"
                                                onTap={(zone) => handleCardTap(4, zone)}
                                                onTurnClick={() => {
                                                    if (gameState.p4Score >= (game.player4Target || 0)) {
                                                        finishMutation.mutate({ winnerId: game.player4Id || undefined, winnerIndex: 4 });
                                                    } else {
                                                        handleTurnChange();
                                                    }
                                                }}
                                                isSolo={false}
                                                hideEndInning={game.gameMode === "match"}
                                                is4c={game.gameType === "4c"}
                                            />
                                        </SortablePlayerWrapper>
                                    );
                                }
                                return null;
                            })}
                        </SortableContext>
                    </DndContext>
                </div>

                {/* Inning Records Modal */}
                <Dialog open={!!inningModalPlayer} onOpenChange={(open) => !open && setInningModalPlayer(null)}>
                    <DialogContent className="bg-[#111] border-[#222] text-white rounded-3xl max-w-sm">
                        <DialogHeader>
                            <DialogTitle className="text-xl font-black flex items-center gap-2">
                                <LucideLayoutGrid className="w-5 h-5 text-[#ffd700]" />
                                이닝별 기록
                            </DialogTitle>
                            <DialogDescription className="text-gray-400">
                                이번 경기의 이닝당 득점 분포입니다.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="py-4 space-y-4">
                            <div className="bg-black/40 rounded-2xl p-4 border border-white/5 max-h-[40vh] overflow-y-auto">
                                <div className="space-y-3">
                                    <div className="space-y-1">
                                        <div className="flex justify-between text-[10px] font-bold text-gray-500 uppercase">
                                            <span>Inning Score Flow</span>
                                        </div>
                                        <div className="grid grid-cols-5 gap-2">
                                            {Array.from({ length: gameState.innings }).map((_, i) => (
                                                <div
                                                    key={i}
                                                    className="flex flex-col items-center gap-1"
                                                >
                                                    <span className="text-[8px] text-white/20">{i + 1}</span>
                                                    <div
                                                        className="w-full h-10 flex items-center justify-center rounded-lg text-xs font-black bg-white/5 text-gray-400"
                                                    >
                                                        -
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button
                                onClick={() => setInningModalPlayer(null)}
                                className="w-full h-12 bg-white/10 hover:bg-white/20 rounded-xl font-bold"
                            >
                                닫기
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {/* Bottom Stats Bar */}
                <BottomBar
                    innings={gameState.innings}
                    timer={formatTime(elapsedTime)}
                    onExit={() => { if (confirm("게임을 종료하시겠습니까?")) setLocation("/dashboard"); }}
                    canUndo={canUndo}
                    canRedo={canRedo}
                    onUndo={() => { undo(); speak("취소"); }}
                    onRedo={() => { redo(); speak("복구"); }}
                />
            </div>
        </LandscapeGuard>
    );
}
