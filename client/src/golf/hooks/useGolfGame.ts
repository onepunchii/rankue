
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { HiqGame } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

// PAR data for a standard course (example)
export const COURSE_PAR = [4, 4, 3, 4, 5, 4, 3, 4, 4, 4, 4, 3, 4, 5, 4, 3, 4, 4];

export function useGolfGame(gameId: string) {
    const [, setLocation] = useLocation();
    const { toast } = useToast();
    const [currentHole, setCurrentHole] = useState(0); // 0-17
    const [playerScores, setPlayerScores] = useState<Record<string, number[]>>({});

    const { data: game, isLoading } = useQuery<HiqGame>({
        queryKey: [`/api/hiq/game/${gameId}`],
        enabled: !!gameId,
    });

    useEffect(() => {
        if (game) {
            const scores: Record<string, number[]> = {};
            [1, 2, 3, 4].forEach(idx => {
                const pId = game[`player${idx}Id` as keyof HiqGame];
                if (pId) {
                    const existing = (game[`player${idx}Innings` as keyof HiqGame] as number[]) || Array(18).fill(0);
                    scores[pId as string] = existing.length === 18 ? existing : Array(18).fill(0);
                }
            });
            setPlayerScores(scores);
        }
    }, [game]);

    const updateScoreMutation = useMutation({
        mutationFn: async (updates: any) => {
            return await apiRequest(`/api/hiq/game/${gameId}/score`, {
                method: "PATCH",
                body: updates
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: [`/api/hiq/game/${gameId}`] });
        }
    });

    const finishGameMutation = useMutation({
        mutationFn: async (data: any) => {
            return await apiRequest(`/api/hiq/game/${gameId}/finish`, {
                method: "POST",
                body: data
            });
        },
        onSuccess: () => {
            toast({ title: "라운딩 완료!", description: "기록이 저장되었습니다." });
            setLocation("/dashboard");
        }
    });

    const handleScoreChange = (playerId: string, diff: number) => {
        const currentScore = playerScores[playerId][currentHole] || COURSE_PAR[currentHole];
        const newScore = Math.max(1, currentScore + diff);

        const newHoleScores = [...playerScores[playerId]];
        newHoleScores[currentHole] = newScore;

        const newTotalScores = {
            ...playerScores,
            [playerId]: newHoleScores
        };

        setPlayerScores(newTotalScores);

        // Prep API update
        const updates: any = {};
        [1, 2, 3, 4].forEach(idx => {
            const pId = game?.[`player${idx}Id` as keyof HiqGame];
            if (pId === playerId) {
                updates[`player${idx}Innings`] = newHoleScores;
                updates[`player${idx}Score`] = newHoleScores.reduce((a, b) => a + (b || 0), 0);
            }
        });

        updateScoreMutation.mutate(updates);
    };

    const finishGame = () => {
        const players = [1, 2, 3, 4].map(idx => {
            const pId = game?.[`player${idx}Id` as keyof HiqGame] as string;
            return pId ? { id: pId } : null;
        }).filter(Boolean);

        if (!players.length) return;

        // Calculate metrics
        const winnerId = players.reduce((prev: any, curr: any) => {
            const s1 = playerScores[prev.id]?.reduce((a, b) => a + (b || 0), 0) || 999;
            const s2 = playerScores[curr.id]?.reduce((a, b) => a + (b || 0), 0) || 999;
            return s1 < s2 ? prev : curr;
        }, players[0]).id;

        finishGameMutation.mutate({
            status: "finished",
            winnerId,
            result: "completed_round"
        });
    };

    return {
        game,
        isLoading,
        currentHole,
        setCurrentHole,
        playerScores,
        handleScoreChange,
        finishGame,
        isFinishing: finishGameMutation.isPending,
        coursePar: COURSE_PAR
    };
}
