
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// Standard Par Data (Fallback)
export const COURSE_PAR = [4, 4, 3, 4, 5, 4, 3, 4, 4, 4, 4, 3, 4, 5, 4, 3, 4, 4];

export function useRankueMatch(matchId: string) {
    const [, setLocation] = useLocation();
    const { toast } = useToast();

    // We rely on server for source of truth, but keep local state for optimistic updates
    const [currentHole, setCurrentHole] = useState(0);

    const { data: session, isLoading, refetch } = useQuery<any>({
        queryKey: [`/api/hiq/golf/match/${matchId}`],
        enabled: !!matchId,
        refetchInterval: 3000, // Poll for multi-player updates
    });

    useEffect(() => {
        if (session) {
            // Sync current hole from server if needed, or keep local if just navigating
            // For now, let's respect server's current hole as the "active" one, 
            // but user might want to browse previous holes.
            // Let's initialize once.
            if (session.currentHole && currentHole === 0 && session.currentHole > 1) {
                setCurrentHole(session.currentHole - 1);
            }
        }
    }, [session?.id]);

    const updateScoreMutation = useMutation({
        mutationFn: async ({ holeNo, players }: { holeNo: number, players: any[] }) => {
            return await apiRequest(`/api/hiq/golf/match/${matchId}/score`, {
                method: "POST",
                body: {
                    holeNo,
                    players
                }
            });
        },
        onSuccess: (data) => {
            // Optimistic update or just invalidate
            queryClient.invalidateQueries({ queryKey: [`/api/hiq/golf/match/${matchId}`] });
        }
    });

    const finishMatchMutation = useMutation({
        mutationFn: async () => {
            return await apiRequest(`/api/hiq/golf/match/${matchId}/finish`, { method: "POST" });
        },
        onSuccess: () => {
            toast({ title: "경기 종료", description: "결과가 저장되었습니다." });
            setLocation(`/golf/game/${matchId}/result`);
        }
    });

    const handleScoreChange = (memberId: string, diff: number) => {
        if (!session) return;

        const updatedPlayers = session.players.map((p: any) => {
            if (p.memberId === memberId) {
                const currentScore = p.scores[currentHole] || COURSE_PAR[currentHole];
                const newScore = Math.max(1, currentScore + diff);
                const newScores = [...p.scores];
                newScores[currentHole] = newScore;
                return { ...p, scores: newScores };
            }
            return p;
        });

        updateScoreMutation.mutate({
            holeNo: currentHole + 1,
            players: updatedPlayers
        });
    };

    const handlePenaltyChange = (memberId: string, type: 'ob' | 'hazard') => {
        if (!session) return;

        const updatedPlayers = session.players.map((p: any) => {
            if (p.memberId === memberId) {
                // Initialize penalties array if missing
                const userPenalties = p.penalties || Array(18).fill({});
                const currentHolePenalty = userPenalties[currentHole] || { ob: false, hazard: false };

                // Toggle specific penalty
                const newHolePenalty = {
                    ...currentHolePenalty,
                    [type]: !currentHolePenalty[type]
                };

                const newPenalties = [...userPenalties];
                newPenalties[currentHole] = newHolePenalty;

                return { ...p, penalties: newPenalties };
            }
            return p;
        });

        updateScoreMutation.mutate({
            holeNo: currentHole + 1,
            players: updatedPlayers
        });
    };

    // Calculate Betting / Money
    // This is client-side calculation based on current scores
    const calculateMoney = () => {
        if (!session) return {};

        // Simple Logic: 
        // Stroke: Difference in total stroke * stake
        // Skins: Who won the hole * stake

        const results: Record<string, number> = {};
        session.players.forEach((p: any) => results[p.memberId] = 0);

        // Iterate holes up to current
        for (let h = 0; h <= currentHole; h++) {
            // Basic Skins Logic Example
            if (session.gameMode === 'skins') {
                const scores = session.players.map((p: any) => ({ id: p.memberId, score: p.scores[h] || 99 }));
                const minScore = Math.min(...scores.map((s: any) => s.score));
                const winners = scores.filter((s: any) => s.score === minScore);

                if (winners.length === 1) {
                    // Winner takes all from losers
                    const winnerId = winners[0].id;
                    const pot = session.stake * (session.players.length - 1);
                    results[winnerId] += pot;
                    session.players.forEach((p: any) => {
                        if (p.memberId !== winnerId) results[p.memberId] -= session.stake;
                    });
                } else {
                    // Carry over (not implemented purely, just no exchange)
                }
            } else {
                // Stroke Logic (Dot / Las Vegas etc is complex, let's do simple Stroke difference per hole)
                // Everyone compares card
                // For simplified "Rankue Match":
                // You pay difference to everyone who beat you.
                // Or simplified: Winner of hole gets stake from everyone. 
            }
        }

        return results;
    };

    return {
        session,
        isLoading,
        currentHole,
        setCurrentHole,
        coursePar: COURSE_PAR, // Ideally fetch from DB
        handleScoreChange,
        handlePenaltyChange,
        finishMatch: () => finishMatchMutation.mutate(),
        isFinishing: finishMatchMutation.isPending,
        moneyResults: calculateMoney()
    };
}
