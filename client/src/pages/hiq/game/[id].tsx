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
import { useT } from "@/lib/i18n";

export default function HiqScoreboard() {
    usePreventZoom();
    const { t } = useT();
    const [, params] = useRoute("/game/:id");
    const id = params?.id;
    const [, setLocation] = useLocation();

    // NOTE: do NOT early-return before the hooks below — a conditional return here changes
    // the hook count between renders (React "rendered fewer hooks" crash) when the route param
    // is briefly undefined during navigation. The `if (!id)` guard lives after all hooks.
    const {
        game, isLoading, players, totalPlayers,
        gameState, canUndo, canRedo, undo, redo,
        playerOrder, handleDragEnd, handleCardTap, handleTurnChange,
        finishMutation, speak
    } = useGameScore(id || "");

    const [inningModalPlayer, setInningModalPlayer] = useState<number | null>(null);

    // Orientation & Fullscreen Control
    useEffect(() => {
        const sendOrientation = (mode: 'LANDSCAPE' | 'PORTRAIT') => {
            const rnWebView = (window as any).ReactNativeWebView;
            if (rnWebView) {
                rnWebView.postMessage(JSON.stringify({
                    type: 'CHANGE_ORIENTATION',
                    payload: { mode }
                }));
            }
        };

        // 점수판 진입 시 가로 모드 전환
        sendOrientation('LANDSCAPE');

        return () => {
            // 점수판 종료 시 세로 모드로 복구
            sendOrientation('PORTRAIT');
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

    if (!id) return null;

    const getAvg = (score: number) => (score / Math.max(1, gameState.innings)).toFixed(2);

    if (isLoading || !game) {
        return <div className="min-h-screen bg-[#f2f0eb] flex items-center justify-center text-[rgba(0,0,0,0.87)]">{t("gameScoreboard.loading")}</div>;
    }

    return (
        <LandscapeGuard>
            <div className="h-full bg-[#f2f0eb] text-[rgba(0,0,0,0.87)] font-sans overflow-hidden flex flex-col touch-none select-none relative">
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
                                            isFinishMode={target > 0 && score >= target}
                                            theme={theme}
                                            onTap={(zone) => handleCardTap(playerId as 1 | 2 | 3 | 4, zone)}
                                            onTurnClick={() => {
                                                // A slot with no target (0 — e.g. a guest whose target was never
                                                // raised) has NO win condition. Without `target > 0`, `0 >= 0`
                                                // was true and the very first tap ended the match 0-0.
                                                if (target > 0 && score >= target) {
                                                    if (finishMutation.isPending) return;
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
                    onExit={() => { if (confirm(t("gameScoreboard.exitConfirm"))) setLocation("/dashboard"); }}
                    canUndo={canUndo}
                    canRedo={canRedo}
                    onUndo={() => { undo(); speak(t("gameScoreboard.undo")); }}
                    onRedo={() => { redo(); speak(t("gameScoreboard.redo")); }}
                />
            </div>
        </LandscapeGuard>
    );
}
