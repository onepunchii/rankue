import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { HiqGame, HiqMember } from "@shared/schema";
import { useGameHistory } from "@/hooks/useGameHistory";
import { useGameAudio } from "@/hooks/useGameAudio";
import { useT } from "@/lib/i18n";
import { arrayMove } from '@dnd-kit/sortable';
import { GameState } from "@/types/game";

// 경기 종료는 handleTurnChange 를 거치지 않고 곧장 finish 로 가기 때문에,
// 진행 중이던 턴의 run 이 어떤 이닝 배열에도 들어가지 않아 '이닝 합계 ≠ 총점'이 됐다.
// (승자의 마지막 이닝이 통째로 사라진다) 종료 직전에 현재 턴 플레이어의 run 을
// 해당 배열에 확정해 넣은 사본을 만들어 저장/결과 화면에 함께 쓴다.
function finalizeInnings(state: GameState) {
    const arrays: number[][] = [
        [...(state.p1Innings ?? [])],
        [...(state.p2Innings ?? [])],
        [...(state.p3Innings ?? [])],
        [...(state.p4Innings ?? [])],
    ];
    const turn = state.currentTurn;
    const run = state[`p${turn}Run` as keyof GameState] as number;
    arrays[turn - 1].push(run);

    return { p1: arrays[0], p2: arrays[1], p3: arrays[2], p4: arrays[3] };
}

export function useGameScore(id: string) {
    const [, setLocation] = useLocation();
    const { speak, playEffect } = useGameAudio();
    const { t } = useT(); // TTS 경기 콜 다국어 (엔진 언어는 useGameAudio가 로케일 연동)

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

    // finish 요청에 실제로 담은 이닝 배열 — onSuccess 의 결과 저장과 값이 갈리지 않도록 공유한다.
    const finalizedInningsRef = useRef<ReturnType<typeof finalizeInnings> | null>(null);
    // 종료 요청을 보낸 뒤로는 진행 중 점수 저장을 내보내면 안 된다.
    const finishedRef = useRef(false);

    // Mutations
    const finishMutation = useMutation({
        // 같은 경기 행을 건드리는 저장끼리 순서가 역전되지 않도록 점수 저장과 스코프를 공유한다.
        scope: { id: `hiq-game-${id}` },
        mutationFn: async (variables?: { winnerId?: string | null; winnerIndex?: number }) => {
            const finalized = finalizeInnings(gameState);
            finalizedInningsRef.current = finalized;
            finishedRef.current = true;

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
                    player1Innings: finalized.p1,
                    player2Innings: finalized.p2,
                    player3Innings: finalized.p3,
                    player4Innings: finalized.p4
                },
            });
        },
        onSuccess: (data, variables) => {
            speak(t("tts.gameOver"));

            if (typeof screen !== 'undefined' && screen.orientation && typeof screen.orientation.unlock === 'function') {
                try {
                    screen.orientation.unlock();
                } catch (e) { console.warn(e); }
            }

            const finalized = finalizedInningsRef.current ?? finalizeInnings(gameState);

            localStorage.setItem(`game_result_${id}`, JSON.stringify({
                ...data,
                winnerIndex: variables?.winnerIndex,
                p1Innings: finalized.p1,
                p2Innings: finalized.p2,
                p3Innings: finalized.p3,
                p4Innings: finalized.p4,
                p1HighRun: gameState.p1HighRun,
                p2HighRun: gameState.p2HighRun,
                p3HighRun: gameState.p3HighRun,
                p4HighRun: gameState.p4HighRun
            }));
            setLocation(`/game/result?id=${id}`);
        },
    });

    const updateScoreMutation = useMutation({
        // 연타로 여러 PATCH 가 겹치면 늦게 도착한 낮은 점수가 최신 점수를 덮어썼다.
        // 같은 스코프의 뮤테이션은 직렬로 실행되므로 보낸 순서가 그대로 유지된다.
        scope: { id: `hiq-game-${id}` },
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

        const rawP1Innings = game.player1Innings as number[] | null | undefined;
        const rawP2Innings = game.player2Innings as number[] | null | undefined;
        const rawP3Innings = game.player3Innings as number[] | null | undefined;
        const rawP4Innings = game.player4Innings as number[] | null | undefined;

        const p1Innings = rawP1Innings ?? [];
        const p2Innings = rawP2Innings ?? [];
        const p3Innings = rawP3Innings ?? [];
        const p4Innings = rawP4Innings ?? [];

        // 진행 중이던 이닝 점수(run)까지 되살린다. run 을 0으로 두면 다음 턴 전환에서
        // 0이 기록돼 '이닝 합계 ≠ 총점'이 되고 하이런도 어긋난다.
        // 아직 배열에 확정되지 않은 몫 = 총점 - 확정된 이닝 합계.
        const deriveRun = (score: number, innings: number[] | null | undefined) => {
            if (!innings) return 0; // 이닝 기록 자체가 없으면 역산할 근거가 없다
            const confirmed = innings.reduce((sum, v) => sum + v, 0);
            return Math.max(0, score - confirmed);
        };

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
            p1Run: deriveRun(game.player1Score ?? 0, rawP1Innings),
            p2Run: deriveRun(game.player2Score ?? 0, rawP2Innings),
            p3Run: deriveRun(game.player3Score ?? 0, rawP3Innings),
            p4Run: deriveRun(game.player4Score ?? 0, rawP4Innings),
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
    // 예전 조건(innings > 1 || p1Score > 0)은 1이닝 동안 P2~P4 점수를 아예 저장하지 않았고,
    // 되돌리기로 초기 상태가 되면 저장을 건너뛰어 지운 점수가 서버에 그대로 남았다.
    // 하이드레이션 이후에는 무조건 저장하되, 연타 시 요청 폭주를 막으려 디바운스를 건다.
    const pendingSaveRef = useRef(false);
    useEffect(() => {
        if (!hydratedRef.current) return;
        pendingSaveRef.current = true;
        const timer = setTimeout(() => {
            pendingSaveRef.current = false;
            // 대기하는 사이에 경기가 끝났다면 보내지 않는다 — 종료 뒤 도착한 진행 중 저장은
            // 끝난 경기를 다시 playing_base 로 되돌린다.
            if (finishedRef.current) return;
            updateScoreMutation.mutate();
        }, 400);
        return () => clearTimeout(timer);
    }, [gameState]);

    // 디바운스 대기 중에 화면을 벗어나면(나가기 등) 마지막 탭이 저장되지 않은 채 사라진다.
    // 언마운트 시 남은 저장을 한 번 밀어 넣는다. 단 종료된 경기는 제외 — finish 뒤에
    // status: "playing_base" PATCH 가 나가면 끝난 경기가 다시 진행 중이 돼버린다.
    useEffect(() => {
        return () => {
            if (!pendingSaveRef.current || finishedRef.current) return;
            updateScoreMutation.mutate();
        };
    }, []);

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
            speak(t("tts.gameStart"));
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
                // ⚠ 알려진 위험(미수정): 상대 카드를 잘못 눌러 턴을 옮겼다가 되돌리면
                // 이닝이 한 번 더 올라가 경기 내내 1 어긋난다. (예: 1번 턴 → 3번 오탭 →
                // 다시 1번 → nextTurn === 1 조건에 걸려 이닝 +1)
                // 순환 순서라 '되돌리는 방향'을 번호 크기로 판별할 수 없다. 특히 2인 경기의
                // 2 → 1 은 정상적인 이닝 넘김이라, 어설픈 방어를 넣으면 가장 흔한 경기의
                // 이닝이 오히려 안 올라간다. 근본적으로는 이닝 수를 별도 카운터로 들지 말고
                // 이닝 배열 길이에서 파생시켜야 한다. 그전까지 오탭 복구는 되돌리기(undo)로 한다.
                nextTurn = targetPlayer as any;
                if (nextTurn === 1 && prev.currentTurn !== 1) {
                    nextInnings = prev.innings + 1;
                }
            } else {
                nextTurn = (prev.currentTurn % totalPlayers + 1) as any;
                if (nextTurn === 1) {
                    nextInnings = prev.innings + 1;
                    speak(`${t("tts.inningPrefix")}${nextInnings}${t("tts.inningSuffix")}`);
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
            if (pName) speak(`${pName}, ${t("tts.yourTurn")}`);
            return;
        }

        // A slot with no target (player{N}Target defaults to 0 — e.g. an unfilled guest slot)
        // has NO win condition. Without the `target > 0` guard, `0 >= 0` was true on the very
        // first tap, instantly finishing the match and crowning that player.
        //
        // zone 가드: 목표에 도달한 뒤에도 하단(감점) 탭은 종료가 아니라 정정이다.
        // 실수로 목표 점수를 만들고 되돌리려 아래를 눌렀다가 경기가 끝나버리면(비가역)
        // 복구할 방법이 없으므로, 종료는 상단 탭일 때만 허용하고 하단은 감점 경로로 흘린다.
        if (zone === "top" && target > 0 && currentScore >= target) {
            playEffect('win');
            let winnerId: string | undefined | null = undefined;
            if (playerIndex === 1) winnerId = game.player1Id;
            else if (playerIndex === 2) winnerId = game.player2Id;
            else if (playerIndex === 3) winnerId = game.player3Id;
            else if (playerIndex === 4) winnerId = game.player4Id;

            if (finishMutation.isPending) return; // guard against a double-tap firing two finishes
            finishMutation.mutate({ winnerId: winnerId || undefined, winnerIndex: playerIndex });
            return;
        }

        const change = zone === "top" ? 1 : -1;
        const newScore = currentScore + change;

        if (newScore !== currentScore) {
            const runKey = `p${playerIndex}Run` as keyof GameState;
            const highRunKey = `p${playerIndex}HighRun` as keyof GameState;
            const inningHistoryKey = `p${playerIndex}Innings` as keyof GameState;
            setGameState(prev => {
                const newRun = (prev[runKey] as number) + change;

                // 감점은 정정이므로 하이런도 같이 내려가야 한다. Math.max 로만 올리면
                // 잘못 올린 run 이 하이런에 박제돼 그대로 서버에 저장됐다.
                // 확정된 이닝 기록 최댓값과 정정된 현재 run 중 큰 값으로 다시 계산한다.
                // (초기값과 동일하게 0을 하한으로 둔다 — 하이런은 0부터 시작하는 기록이다)
                const history = (prev[inningHistoryKey] as number[]) ?? [];
                const newHighRun = change < 0
                    ? Math.max(0, newRun, ...history)
                    : Math.max(prev[highRunKey] as number, newRun);

                return {
                    ...prev,
                    [key]: newScore,
                    [runKey]: newRun,
                    [highRunKey]: newHighRun
                };
            });

            if (newScore >= target) {
                playEffect('finishing');
                speak(t("tts.finishingChance"));
            } else {
                playEffect('click');
                const remaining = target - newScore;

                if (change > 0) {
                    const currentRun = gameState[runKey] as number;
                    const newRun = currentRun + 1;

                    let prefix = "";
                    if (newRun > 0 && newRun % 5 === 0) {
                        const exclamations = [t("tts.wow1"), t("tts.wow2"), t("tts.wow3"), t("tts.wow4"), t("tts.wow5")];
                        prefix = exclamations[Math.min(Math.floor(newRun / 5) - 1, exclamations.length - 1)] + " ";
                    }

                    if (remaining > 0) {
                        speak(`${prefix}${newRun}${t("tts.scoredSuffix")} ${remaining}${t("tts.remainingSuffix")}`);
                    } else {
                        speak(`${prefix}${newRun}${t("tts.scoredSuffix")}`);
                    }
                } else {
                    speak(t("tts.minusOne"));
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
