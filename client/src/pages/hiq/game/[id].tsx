import React, { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { usePreventZoom } from "@/hooks/usePreventZoom";
import { useGameScore } from "@/hooks/useGameScore";
import { LandscapeGuard } from "@/components/hiq/LandscapeGuard";
import { PlayerCard } from "@/components/hiq/game/PlayerCard";
import { ScoreboardBottomBar } from "@/components/hiq/game/ScoreboardBottomBar";
import { InningHistoryModal } from "@/components/hiq/game/InningHistoryModal";
import { SortablePlayerWrapper } from "@/components/hiq/game/SortablePlayerWrapper";
import { DndContext, closestCenter, PointerSensor, TouchSensor, MouseSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { HiqMember } from "@shared/schema";

export default function HiqScoreboard() {
    usePreventZoom();
    const [, params] = useRoute("/game/:id");
    const id = params?.id;
    const [, setLocation] = useLocation();

    if (!id) return null;

    const {
        game, isLoading, players, totalPlayers,
        gameState, canUndo, canRedo, undo, redo,
        playerOrder, handleDragEnd, handleCardTap, handleTurnChange,
        finishMutation, speak
    } = useGameScore(id);

    const [inningModalPlayer, setInningModalPlayer] = useState<number | null>(null);

    // Orientation Cleanup
    useEffect(() => {
        return () => {
            if (typeof screen !== 'undefined' && screen.orientation && typeof screen.orientation.unlock === 'function') {
                try { screen.orientation.unlock(); } catch (e) { console.warn(e); }
            }
        };
    }, []);

    // Dnd Sensors
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
        useSensor(MouseSensor, {})
    );

    const getAvg = (score: number) => (score / Math.max(1, gameState.innings)).toFixed(2);

    if (isLoading || !game) {
        return <div className="min-h-screen bg-black flex items-center justify-center text-white">LOADING...</div>;
    }

    return (
        <LandscapeGuard>
            <div className="h-[100dvh] bg-[#050505] text-white font-sans overflow-hidden flex flex-col touch-none select-none relative">
                {/* Background */}
                <div className="absolute inset-0 pointer-events-none z-0">
                    <div className="absolute inset-0 bg-premium-billiards opacity-10 grayscale brightness-50" />
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,transparent_0%,rgba(0,0,0,0.6)_100%)]" />
                </div>

                <div className="flex-1 flex w-full relative z-0">
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                        <SortableContext items={playerOrder} strategy={horizontalListSortingStrategy}>
                            {playerOrder.map((playerId) => {
                                const player = players[playerId as keyof typeof players];
                                const scoreKey = `p${playerId}Score` as const;
                                const score = gameState[scoreKey as keyof typeof gameState] as number;
                                const targetKey = `player${playerId}Target` as keyof typeof game;
                                const target = (game[targetKey] as number) || 0;
                                const run = gameState[`p${playerId}Run` as keyof typeof gameState] as number;
                                const highRun = gameState[`p${playerId}HighRun` as keyof typeof gameState] as number;

                                const theme = playerId === 1 ? 'white' : playerId === 2 ? 'yellow' : playerId === 3 ? 'red' : 'blue';

                                if (playerId > totalPlayers) return null;

                                const playerNameKey = `player${playerId}Name` as keyof typeof game;
                                const guestPlayerName = game[playerNameKey] as string;

                                return (
                                    <SortablePlayerWrapper key={playerId} id={playerId}>
                                        <PlayerCard
                                            player={player || (guestPlayerName ? { name: guestPlayerName } : undefined)}
                                            score={score}
                                            target={target}
                                            run={run}
                                            highRun={highRun}
                                            avg={getAvg(score)}
                                            isTurn={gameState.currentTurn === playerId}
                                            isFinishMode={score >= target}
                                            theme={theme}
                                            onTap={(zone) => handleCardTap(playerId as 1 | 2 | 3 | 4, zone)}
                                            onTurnClick={() => {
                                                if (score >= target) {
                                                    finishMutation.mutate({
                                                        winnerId: (player as HiqMember)?.id || undefined,
                                                        winnerIndex: playerId
                                                    });
                                                } else {
                                                    handleTurnChange();
                                                }
                                            }}
                                            isSolo={totalPlayers === 1}
                                            hideEndInning={game.gameMode === "match"}
                                            is4c={game.gameType === "4c"}
                                            onInningClick={() => setInningModalPlayer(playerId)}
                                        />
                                    </SortablePlayerWrapper>
                                );
                            })}
                        </SortableContext>
                    </DndContext>
                </div>

                <InningHistoryModal
                    player={inningModalPlayer}
                    innings={gameState.innings}
                    onClose={() => setInningModalPlayer(null)}
                />

                <ScoreboardBottomBar
                    innings={gameState.innings}
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
