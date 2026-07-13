import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { HiqGame, HiqMember } from "@shared/schema";
import { useGameHistory } from "@/hooks/useGameHistory";
import { useGameAudio } from "@/hooks/useGameAudio";
import { arrayMove } from '@dnd-kit/sortable';
import { GameState } from "@/types/game";

export function useGameScore(id: string) {
    const [, setLocation] = useLocation();
    const { speak, playEffect } = useGameAudio();

    // Game State with History
    const { state: gameState, set: setGameState, undo, redo, canUndo, canRedo, reset: resetGameState } = useGameHistory<GameState>({
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

    // Hydration guard: ensures we copy server state into gameState exactly once,
    // and prevents auto-save from firing (and clobbering saved scores) before that.
    const hydratedRef = useRef(false);

    // Queries
    const { data: game, isLoading } = useQuery<HiqGame>({
        queryKey: [`/api/hiq/game/${id}`],
    });

    const { data: player1 } = useQuery<HiqMember>({
        queryKey: [`/api/hiq/members/${game?.player1Id}`],
        enabled: !!game?.player1Id,
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

            if (typeof screen !== 'undefined' && screen.orientation && typeof screen.orientation.unlock === 'function') {
                try {
                    screen.orientation.unlock();
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
                    totalInnings: gameState.innings,
                    player1HighRun: gameState.p1HighRun,
                    player2HighRun: gameState.p2HighRun,
                    player3HighRun: gameState.p3HighRun,
                    player4HighRun: gameState.p4HighRun,
                    player1Innings: gameState.p1Innings,
                    player2Innings: gameState.p2Innings,
                    player3Innings: gameState.p3Innings,
                    player4Innings: gameState.p4Innings,
                    status: "playing_base"
                },
            });
        },
        onError: (e) => console.error(e)
    });

    // Hydrate gameState from the server row once, so a mid-game refresh
    // recovers scores/innings/high-runs instead of showing (and re-saving) zeros.
    useEffect(() => {
        if (hydratedRef.current || !game || game.status === "finished") return;

        const p1Innings = (game.player1Innings as number[]) ?? [];
        const p2Innings = (game.player2Innings as number[]) ?? [];
        const p3Innings = (game.player3Innings as number[]) ?? [];
        const p4Innings = (game.player4Innings as number[]) ?? [];

        // Derive whose turn it is: among active players, the one with the
        // shortest inning-history array is currently up (fallback: player 1).
        const activeCount = 1
            + ((game.player2Id || game.player2Name) ? 1 : 0)
            + ((game.player3Id || game.player3Name) ? 1 : 0)
            + ((game.player4Id || game.player4Name) ? 1 : 0);
        const inningArrays = [p1Innings, p2Innings, p3Innings, p4Innings];
        let derivedTurn = 1;
        let minLen = Infinity;
        for (let i = 0; i < activeCount; i++) {
            if (inningArrays[i].length < minLen) {
                minLen = inningArrays[i].length;
                derivedTurn = i + 1;
            }
        }

        resetGameState({
            p1Score: game.player1Score ?? 0,
            p2Score: game.player2Score ?? 0,
            p3Score: game.player3Score ?? 0,
            p4Score: game.player4Score ?? 0,
            p1FinishScore: 0,
            p2FinishScore: 0,
            p3FinishScore: 0,
            p4FinishScore: 0,
            innings: Math.max(1, game.totalInnings ?? 0),
            p1FinishInnings: 0,
            p2FinishInnings: 0,
            p3FinishInnings: 0,
            p4FinishInnings: 0,
            p1Run: 0,
            p2Run: 0,
            p3Run: 0,
            p4Run: 0,
            p1HighRun: game.player1HighRun ?? 0,
            p2HighRun: game.player2HighRun ?? 0,
            p3HighRun: game.player3HighRun ?? 0,
            p4HighRun: game.player4HighRun ?? 0,
            currentTurn: derivedTurn as 1 | 2 | 3 | 4,
            p1Innings,
            p2Innings,
            p3Innings,
            p4Innings
        });
        hydratedRef.current = true;
    }, [game]);

    // Auto-save logic — gated on hydration so we never PATCH zeros over saved scores.
    useEffect(() => {
        if (!hydratedRef.current) return;
        if (gameState.innings > 1 || gameState.p1Score > 0) {
            updateScoreMutation.mutate();
        }
    }, [gameState]);

    // Player Order Logic
    let totalPlayers = 1;
    if (game) {
        if (game.player2Id || game.player2Name) totalPlayers++;
        if (game.player3Id || game.player3Name) totalPlayers++;
        if (game.player4Id || game.player4Name) totalPlayers++;
    }

    const [playerOrder, setPlayerOrder] = useState<number[]>([]);

    useEffect(() => {
        if (totalPlayers >= 1) {
            if (playerOrder.length === 0 || playerOrder.length !== totalPlayers) {
                setPlayerOrder(Array.from({ length: totalPlayers }, (_, i) => i + 1));
            }
        }
    }, [totalPlayers]);

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

    const handleTurnChange = (targetPlayer?: number) => {
        setGameState(prev => {
            let nextTurn = prev.currentTurn;
            let nextInnings = prev.innings;

            if (targetPlayer) {
                nextTurn = targetPlayer as any;
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
    };

    const handleCardTap = (playerIndex: 1 | 2 | 3 | 4, zone: "top" | "bottom") => {
        if (!game) return;

        const key = `p${playerIndex}Score` as keyof GameState;
        const targetKey = `player${playerIndex}Target` as keyof HiqGame;
        const target = game[targetKey] as number || 0;
        const currentScore = gameState[key] as number;

        if (gameState.currentTurn !== playerIndex) {
            handleTurnChange(playerIndex);
            const p = playerIndex === 1 ? player1 : playerIndex === 2 ? player2 : playerIndex === 3 ? player3 : player4;
            const pName = p?.name || (game[`player${playerIndex}Name` as keyof HiqGame] as string);
            if (pName) speak(`${pName}, 공격`);
            return;
        }

        if (currentScore >= target) {
            playEffect('win');
            let winnerId: string | undefined | null = undefined;
            if (playerIndex === 1) winnerId = game.player1Id;
            else if (playerIndex === 2) winnerId = game.player2Id;
            else if (playerIndex === 3) winnerId = game.player3Id;
            else if (playerIndex === 4) winnerId = game.player4Id;

            finishMutation.mutate({ winnerId: winnerId || undefined, winnerIndex: playerIndex });
            return;
        }

        const change = zone === "top" ? 1 : -1;
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
                const remaining = target - newScore;

                if (change > 0) {
                    const currentRun = gameState[runKey] as number;
                    const newRun = currentRun + 1;

                    let prefix = "";
                    if (newRun > 0 && newRun % 5 === 0) {
                        const exclamations = ["와우!", "나이스!", "대박!", "브라보!", "언빌리버블!"];
                        prefix = exclamations[Math.min(Math.floor(newRun / 5) - 1, exclamations.length - 1)] + " ";
                    }

                    if (remaining > 0) {
                        speak(`${prefix}${newRun} 득점. ${remaining}점 남았습니다.`);
                    } else {
                        speak(`${prefix}${newRun} 득점.`);
                    }
                } else {
                    speak("마이너스 1점");
                }
            }
        }
    };

    return {
        game,
        isLoading,
        players: { 1: player1, 2: player2, 3: player3, 4: player4 }, // Map style for easy access
        totalPlayers,
        gameState,
        setGameState,
        canUndo,
        canRedo,
        undo,
        redo,
        playerOrder,
        handleDragEnd,
        handleTurnChange, // Need to export for manual calls
        handleCardTap,
        finishMutation,
        speak
    };
}
