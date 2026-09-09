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
import { scoringInnings } from "@shared/averageRule";

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
        finishMutation, discardMutation, speak
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

    // 에버리지 분모는 저장 규칙(shared/averageRule)과 같아야 한다 — 화면에선 떨어지는데
    // 전적엔 안 떨어지면(또는 반대면) 유저가 둘 중 뭘 믿어야 할지 알 수 없다.
    // 목표(알다마) 도달 이후의 마무리 이닝은 세지 않는다.
    const getAvg = (score: number, playerId: number, target: number) => {
        const inningData = gameState[`p${playerId}Innings` as keyof typeof gameState] as number[] | undefined;
        // 진행 중인 이닝의 현재 런은 아직 배열에 없다 — 표시용으로만 덧붙여 실시간성을 맞춘다.
        const run = gameState[`p${playerId}Run` as keyof typeof gameState] as number;
        const live = Array.isArray(inningData) ? [...inningData, run] : undefined;
        const innings = scoringInnings(live, target, gameState.innings);
        return (score / Math.max(1, innings)).toFixed(2);
    };

    if (isLoading || !game) {
        return <div className="min-h-screen bg-surface-0 flex items-center justify-center text-[rgba(0,0,0,0.87)]">{t("gameScoreboard.loading")}</div>;
    }

    return (
        <LandscapeGuard>
            <div className="h-full bg-surface-0 text-[rgba(0,0,0,0.87)] font-sans overflow-hidden flex flex-col touch-none select-none relative">
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
                                            avg={getAvg(score, playerId, target)}
                                            isTurn={gameState.currentTurn === playerId}
                                            isFinishMode={target > 0 && score >= target}
                                            finishRemaining={
                                                game.ruleFinishType !== "none" && (game.finishTargetCount || 0) > 0
                                                    ? Math.max(0, (game.finishTargetCount || 0) - (gameState[`p${playerId}FinishScore` as keyof typeof gameState] as number))
                                                    : undefined
                                            }
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
                    onExit={() => { if (discardMutation.isPending) return; if (confirm(t("gameScoreboard.exitConfirm"))) discardMutation.mutate(); }}
                    canUndo={canUndo}
                    canRedo={canRedo}
                    onUndo={() => { undo(); speak(t("gameScoreboard.undo")); }}
                    onRedo={() => { redo(); speak(t("gameScoreboard.redo")); }}
                />
            </div>
        </LandscapeGuard>
    );
}
