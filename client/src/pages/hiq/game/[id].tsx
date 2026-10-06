import React, { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { usePreventZoom } from "@/hooks/usePreventZoom";
import { useKeepAwake } from "@/hooks/useKeepAwake";
import { useGameScore, gameStateFromRow } from "@/hooks/useGameScore";
import { LandscapeGuard } from "@/components/hiq/LandscapeGuard";
import { PlayerCard, playerThemeColor } from "@/components/hiq/game/PlayerCard";
import { ScoreboardBottomBar } from "@/components/hiq/game/ScoreboardBottomBar";
import { InningHistoryModal } from "@/components/hiq/game/InningHistoryModal";
import { SortablePlayerWrapper } from "@/components/hiq/game/SortablePlayerWrapper";
import { DndContext, closestCenter, PointerSensor, TouchSensor, MouseSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { HiqMember } from "@shared/schema";
import { useT } from "@/lib/i18n";
import { scoringInnings } from "@shared/averageRule";
import { Eye, LucideX } from "@/lib/icons";

/** 선수 번호 → 공 색 이름. 카드와 하단 바(뱅크 버튼)가 같은 표를 본다. */
const THEMES = ["white", "yellow", "red", "blue"] as const;

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
        game, isLoading, error, spectating, players, totalPlayers,
        gameState, canUndo, canRedo, undo, redo,
        playerOrder, handleDragEnd, handleCardTap, handleBankShot, handleTurnChange,
        finishGame, discardGame, finishBusy, discardBusy, finishFailure, dismissFinishFailure, speak
    } = useGameScore(id || "");

    // 경기 중엔 화면이 꺼지지 않게 — 폰을 테이블에 두고 쓰는 점수판이다.
    useKeepAwake(!!id && game?.status !== "finished");

    const [inningModalPlayer, setInningModalPlayer] = useState<number | null>(null);
    // 종료하기의 확인창 — 점수판 안에 그린다(아래 exitAsking 자리 참고)
    const [exitAsking, setExitAsking] = useState(false);

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

    // 참가자(호스트가 아닌 사람)는 관전 — 경기가 끝나면 결과 화면으로 넘긴다(2026-09-27 오너).
    useEffect(() => {
        if (spectating && game?.status === "finished") setLocation(`/r/${game.id}`, { replace: true });
    }, [spectating, game?.status, game?.id, setLocation]);

    if (!id) return null;

    // 관전자는 자기 화면 상태가 아니라 3초마다 새로 받은 서버 행을 그린다
    const view = spectating && game ? gameStateFromRow(game) : gameState;

    // 종료하기(버리기)는 저장 뒤에 줄 서지 않고 바로 나간다(2026-10-06 — 예전엔 매달린 저장 뒤에서 기다려 눌러도 아무 일이 없었다).
    // 대신 FINISH 와 겹치지 않게 여기서 막는다 — 서버의 버리기는 대진 칸을 먼저 떼고 지우므로 끝나는 중인 경기와 함께 닿으면 안 된다.
    // 예전에는 같은 줄(scope)이 이 순서를 지켰다. 가는 동안 단추는 흐려져 '눌렸다'는 표시가 난다(ScoreboardBottomBar exiting).
    // 가는 중인지는 이 화면의 요청이 아니라 이 경기의 요청으로 센다(useGameScore 의 finishBusy · discardBusy) — 뒤로 나갔다가
    // 홈의 '이어서'로 다시 들어온 화면도 앞 화면이 남긴 FINISH·버리기를 본다. 보내는 순간에도 한 번 더 본다(finishGame · discardGame).
    const exitBusy = discardBusy || finishBusy;

    // 에버리지 분모는 저장 규칙(shared/averageRule)과 같아야 한다 — 화면에선 떨어지는데
    // 전적엔 안 떨어지면(또는 반대면) 유저가 둘 중 뭘 믿어야 할지 알 수 없다.
    // 목표(알다마) 도달 이후의 마무리 이닝은 세지 않는다.
    const getAvg = (score: number, playerId: number, target: number) => {
        const inningData = view[`p${playerId}Innings` as keyof typeof view] as number[] | undefined;
        // 진행 중인 이닝의 현재 런은 아직 배열에 없다 — 표시용으로만 덧붙여 실시간성을 맞춘다.
        const run = view[`p${playerId}Run` as keyof typeof view] as number;
        const live = Array.isArray(inningData) ? [...inningData, run] : undefined;
        const innings = scoringInnings(live, target, view.innings);
        return (score / Math.max(1, innings)).toFixed(2);
    };

    if (!game && error) {
        return (
            <div className="min-h-screen bg-surface-0 flex flex-col items-center justify-center gap-4 px-6 text-center">
                <p className="text-[15px] font-semibold text-ink-1">{t("gameScoreboard.spectateGone")}</p>
                <button type="button" onClick={() => setLocation("/dashboard")} className="h-11 px-6 rounded-full bg-brand text-brand-fg text-[14px] font-semibold">
                    {t("gameScoreboard.spectateHome")}
                </button>
            </div>
        );
    }

    if (isLoading || !game) {
        return <div className="min-h-screen bg-surface-0 flex items-center justify-center text-[rgba(0,0,0,0.87)]">{t("gameScoreboard.loading")}</div>;
    }

    return (
        <LandscapeGuard>
            <div className="h-full bg-surface-0 text-[rgba(0,0,0,0.87)] font-sans overflow-hidden flex flex-col touch-none select-none relative">
                {/* 관전자는 카드를 누를 수 없다(점수·턴·순서 바꾸기 모두) */}
                <div className={`flex-1 flex w-full relative z-0 ${spectating ? "pointer-events-none" : ""}`}>
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                        <SortableContext items={playerOrder} strategy={horizontalListSortingStrategy}>
                            {playerOrder.map((playerId) => {
                                const player = players[playerId as keyof typeof players];
                                const scoreKey = `p${playerId}Score` as const;
                                const score = view[scoreKey as keyof typeof view] as number;
                                const targetKey = `player${playerId}Target` as keyof typeof game;
                                const target = (game[targetKey] as number) || 0;
                                const run = view[`p${playerId}Run` as keyof typeof view] as number;
                                const highRun = view[`p${playerId}HighRun` as keyof typeof view] as number;

                                const theme = THEMES[playerId - 1];

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
                                            isTurn={view.currentTurn === playerId}
                                            isFinishMode={target > 0 && score >= target}
                                            finishRemaining={
                                                game.ruleFinishType !== "none" && (game.finishTargetCount || 0) > 0
                                                    ? Math.max(0, (game.finishTargetCount || 0) - (view[`p${playerId}FinishScore` as keyof typeof view] as number))
                                                    : undefined
                                            }
                                            theme={theme}
                                            onTap={(zone) => handleCardTap(playerId as 1 | 2 | 3 | 4, zone)}
                                            compact={totalPlayers >= 3}
                                            onTurnClick={() => {
                                                // A slot with no target (0 — e.g. a guest whose target was never
                                                // raised) has NO win condition. Without `target > 0`, `0 >= 0`
                                                // was true and the very first tap ended the match 0-0.
                                                if (target > 0 && score >= target) {
                                                    // 두 번 눌림과 버리는 중인 경기는 finishGame 이 막는다(위 exitBusy 참고)
                                                    finishGame({
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
                    innings={view.innings}
                    onClose={() => setInningModalPlayer(null)}
                />

                {spectating ? (
                    <div className="h-16 bg-white border-t border-black/10 flex items-center justify-between gap-4 px-6 shrink-0 z-50">
                        {/* 관전 표시는 아래 줄에 — 위에 띄우면 이름·목표를 가린다 */}
                        <span className="flex items-center gap-2 min-w-0 flex-1">
                            <span className="inline-flex items-center gap-1 px-2 h-6 rounded-full bg-[#DC2626] text-white text-[11px] font-bold shrink-0">
                                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />{t("gameScoreboard.spectateLive")}
                            </span>
                            <Eye className="w-4 h-4 text-black/40 shrink-0" />
                            <span className="text-[13px] font-semibold text-black/55 truncate">{t("gameScoreboard.spectating").replace("{host}", game.player1Name || "")}</span>
                        </span>
                        <span className="text-xl font-bold tabular-nums text-[rgba(0,0,0,0.87)] shrink-0 px-2">{view.innings} {t("scoreboardBottomBar.inning")}</span>
                        <span className="flex justify-end shrink-0">
                        <button type="button" onClick={() => setLocation("/dashboard")} className="h-10 px-5 rounded-full border border-black/15 text-[14px] font-semibold text-[rgba(0,0,0,0.87)]">
                            {t("gameScoreboard.spectateExit")}
                        </button>
                        </span>
                    </div>
                ) : (
                    <ScoreboardBottomBar
                        innings={view.innings}
                        onExit={() => { if (exitBusy) return; setExitAsking(true); }}
                        exiting={exitBusy}
                        canUndo={canUndo}
                        canRedo={canRedo}
                        onUndo={() => { undo(); speak(t("gameScoreboard.undo")); }}
                        onRedo={() => { redo(); speak(t("gameScoreboard.redo")); }}
                        // PBA 룰(3구) 경기에서만 — 저장만 되고 점수판이 안 읽던 설정이다(2026-09-24).
                        onBankShot={game.usePbaRule && game.gameType === "3c" ? () => handleBankShot(view.currentTurn as 1 | 2 | 3 | 4) : undefined}
                        bankColor={playerThemeColor(THEMES[view.currentTurn - 1])}
                        bankDisabled={(() => {
                            const turn = view.currentTurn;
                            const target = (game[`player${turn}Target` as keyof typeof game] as number) || 0;
                            const score = gameState[`p${turn}Score` as keyof typeof gameState] as number;
                            return target > 0 && score >= target;
                        })()}
                    />
                )}

                {/* FINISH 실패 알림 — 점수판 안에 그린다(2026-10-06). 세로로 든 폰에서 점수판은 화면 전체를 덮는 맨 위 상자라
                    (LandscapeGuard — zIndex 9999) 앱 뿌리의 토스트가 그 밑에 깔려, 실패해도 아무 표시가 없었다.
                    누르면 닫히고 FINISH 를 다시 누르면 사라진다. 점수판을 떠난 뒤의 실패는 훅이 토스트로 알린다. */}
                {finishFailure !== null && (
                    <div role="alert" className="absolute top-3 inset-x-0 z-[55] flex justify-center px-4 pointer-events-none">
                        <button
                            type="button"
                            onClick={dismissFinishFailure}
                            className="pointer-events-auto flex items-start gap-3 max-w-[560px] rounded-2xl bg-[#E5484D] text-[#ffffff] pl-4 pr-3 py-2.5 text-left shadow-[0_8px_24px_rgba(0,0,0,0.25)] active:opacity-90"
                        >
                            <span className="min-w-0">
                                <span className="block text-[14px] font-bold break-keep">{t("gameScoreboard.finishFailTitle")}</span>
                                <span className="block text-[13px] leading-snug text-white/90 break-keep">{finishFailure}</span>
                            </span>
                            <LucideX className="w-4 h-4 mt-0.5 shrink-0 opacity-80" aria-hidden />
                        </button>
                    </div>
                )}

                {/* 종료하기 확인창 — 점수판 안에 그린다(2026-10-06 오너 제보: "종료하기 버튼이 안 눌러진다").
                    앱 공용 안내창(AppDialog)은 body 에 z-1000 으로 뜨는데, 세로로 든 폰에서 점수판은 화면 전체를 덮는 맨 위 상자다
                    (LandscapeGuard — fixed · zIndex 9999 · 불투명). 확인창이 그 밑에 깔려 눌러도 화면에 아무 변화가 없었고,
                    보이지 않는 취소·확인 단추만 화면 가운데에서 탭을 받았다. 상자 안에 그리면 늘 점수판 위에 뜨고 점수판과 같은 방향으로 돈다.
                    바깥을 눌러도 닫히지 않는다(지우는 일이라 공용 안내창과 같다). */}
                {exitAsking && !spectating && (
                    <div
                        role="alertdialog"
                        aria-modal="true"
                        aria-describedby="scoreboard-exit-ask"
                        onKeyDown={(e) => { if (e.key === "Escape") setExitAsking(false); }}
                        className="absolute inset-0 z-[60] flex items-center justify-center bg-black/55 px-5"
                    >
                        <div className="w-full max-w-[340px] rounded-[22px] bg-surface-1 border border-surface-line shadow-[0_18px_60px_rgba(0,0,0,0.35)]">
                            <p id="scoreboard-exit-ask" className="px-5 pt-6 pb-4 text-center text-[15px] leading-[1.55] font-medium text-ink-1 break-keep">
                                {t("gameScoreboard.exitConfirm")}
                            </p>
                            <div className="px-4 pb-4 flex gap-2">
                                <button
                                    type="button"
                                    autoFocus
                                    onClick={() => setExitAsking(false)}
                                    className="flex-1 h-12 rounded-2xl bg-surface-3 text-[15px] font-semibold text-ink-1 active:opacity-80"
                                >
                                    {t("common.cancel")}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { setExitAsking(false); discardGame(); }}
                                    className="flex-1 h-12 rounded-2xl bg-[#E5484D] text-[#ffffff] text-[15px] font-bold active:opacity-85"
                                >
                                    {t("common.ok")}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </LandscapeGuard>
    );
}
