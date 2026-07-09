
import { useState, useEffect, useMemo, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// Standard Par Data (Fallback)
export const COURSE_PAR = [4, 4, 3, 4, 5, 4, 3, 4, 4, 4, 4, 3, 4, 5, 4, 3, 4, 4];

export interface Transaction {
    holeIndex: number;
    fromId: string;
    fromName: string;
    toId: string;
    toName: string;
    amount: number;
    details: string[];
}

export function useRankueMatch(matchId: string, me?: any) {
    const [, setLocation] = useLocation();
    const { toast } = useToast();

    // We rely on server for source of truth, but keep local state for optimistic updates
    const [currentHole, setCurrentHole] = useState(0);
    const [localPlayers, setLocalPlayers] = useState<any[]>([]);

    const queryKey = [`/api/hiq/golf/match/${matchId}`];

    const { data: session, isLoading, refetch } = useQuery<any>({
        queryKey,
        enabled: !!matchId,
        refetchInterval: (query) => {
            const data = query.state.data;
            if (!data) return 3000;
            // Finished match (e.g. the result screen) is immutable — stop polling entirely.
            if (data.status === 'finished') return false;
            if (!me) return 3000;
            const isHost = data.hostId === me.id || (data.players && data.players[0]?.memberId === me.id);
            // Host is the writer, no need to poll. Guest follows host's updates.
            return isHost ? 0 : 2000;
        },
    });

    const isHost = useMemo(() => {
        if (!session || !me) return false;
        return session.hostId === me.id || (session.players && session.players[0]?.memberId === me.id);
    }, [session, me]);

    // Use server provided pars if available, otherwise fallback to standard par 72
    const coursePar = useMemo(() => {
        if (session?.pars && Array.isArray(session.pars) && session.pars.length === 18) {
            return session.pars;
        }
        return COURSE_PAR;
    }, [session]);

    // Tracks the last host hole a guest auto-followed, so we don't snap the guest back to the
    // host's hole on every poll (which made reviewing previous holes impossible).
    const lastFollowedHoleRef = useRef<number | null>(null);

    useEffect(() => {
        if (!session) return;

        if (!isHost) {
            // Guests are read-only viewers: always mirror the host's player data live, so a
            // host editing the CURRENT hole (currentHole unchanged) is still reflected — the
            // previous deps omitted session.players and missed those updates.
            setLocalPlayers(session.players || []);

            if (session.currentHole) {
                // Follow the host only when the host actually advances to a *new* hole. Between
                // advances the guest can freely tap "이전 홀" to review without being snapped back.
                if (lastFollowedHoleRef.current !== session.currentHole) {
                    lastFollowedHoleRef.current = session.currentHole;
                    setCurrentHole(session.currentHole - 1);
                }
            }
        } else {
            // Host owns localPlayers as the editable source of truth. Seed it once on initial
            // load only — re-syncing from session on every refetch would clobber unsaved edits.
            if (localPlayers.length === 0 && session.players?.length) {
                setLocalPlayers(session.players);
            }
            if (currentHole === 0 && session.currentHole > 1) {
                setCurrentHole(session.currentHole - 1);
            }
        }
    }, [session?.currentHole, session?.id, session?.players, isHost]);

    const updateScoreMutation = useMutation({
        mutationFn: async ({ holeNo, players, nearHistory }: { holeNo: number, players: any[], nearHistory?: any }) => {
            return await apiRequest(`/api/hiq/golf/match/${matchId}/score`, {
                method: "POST",
                body: {
                    holeNo,
                    players,
                    nearHistory
                }
            });
        },
        onMutate: async (newVariables) => {
            await queryClient.cancelQueries({ queryKey });
            const previousSession = queryClient.getQueryData(queryKey);
            queryClient.setQueryData(queryKey, (old: any) => {
                if (!old) return old;
                return {
                    ...old,
                    players: newVariables.players,
                    currentHole: newVariables.holeNo,
                    nearHistory: newVariables.nearHistory || old.nearHistory
                };
            });
            return { previousSession };
        },
        onError: (err, newVariables, context: any) => {
            if (context?.previousSession) {
                queryClient.setQueryData(queryKey, context.previousSession);
            }
            toast({
                variant: "destructive",
                title: "업데이트 실패",
                description: "점수 저장 중 오류가 발생했습니다."
            });
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey });
        }
    });

    // Synchronous guard: isPending flips asynchronously, so two taps within the same tick
    // (e.g. a double-tap during the `await saveCurrentHoleScores()` before finishMatch) would
    // both pass the disabled={isFinishing} check. The ref blocks the duplicate immediately.
    const finishingRef = useRef(false);
    const finishMatchMutation = useMutation({
        mutationFn: async () => {
            return await apiRequest(`/api/hiq/golf/match/${matchId}/finish`, { method: "POST" });
        },
        onSuccess: () => {
            toast({ title: "경기 종료", description: "결과가 저장되었습니다." });
            setLocation(`/golf/game/${matchId}/result`);
        },
        onError: () => {
            finishingRef.current = false;
        }
    });

    const updateCourseMutation = useMutation({
        mutationFn: async (data: { frontCourseName?: string, backCourseName?: string }) => {
            return await apiRequest(`/api/hiq/golf/match/${matchId}/course`, {
                method: "POST",
                body: data
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey });
            toast({ title: "코스 변경됨", description: "코스 정보가 업데이트되었습니다." });
        }
    });

    const handleScoreChange = (memberId: string, diff: number) => {
        if (!session) return;

        setLocalPlayers(prev => prev.map((p: any) => {
            if (p.memberId === memberId) {
                const scores = p.scores || Array(18).fill(0);
                const currentScore = scores[currentHole] || coursePar[currentHole];
                const newScore = Math.max(1, currentScore + diff);
                const newScores = [...scores];
                newScores[currentHole] = newScore;
                return { ...p, scores: newScores };
            }
            return p;
        }));
    };

    const saveCurrentHoleScores = async (holeIndex?: number, playersOverride?: any[]) => {
        const targetHole = (holeIndex !== undefined ? holeIndex : currentHole) + 1;
        const playersToSave = playersOverride || localPlayers;
        console.log('Saving hole scores:', { targetHole, players: playersToSave });

        return updateScoreMutation.mutateAsync({
            holeNo: targetHole,
            players: playersToSave
        });
    };

    const handlePenaltyChange = (memberId: string, type: 'ob' | 'hazard' | 'bunk' | 'putt3') => {
        if (!session) return;

        setLocalPlayers(prev => prev.map((p: any) => {
            if (p.memberId === memberId) {
                const userPenalties = p.penalties || Array(18).fill({});
                const currentHolePenalty = userPenalties[currentHole] || { ob: false, hazard: false, bunk: false, putt3: false };
                const newHolePenalty = {
                    ...currentHolePenalty,
                    [type]: !currentHolePenalty[type]
                };
                const newPenalties = [...userPenalties];
                newPenalties[currentHole] = newHolePenalty;
                return { ...p, penalties: newPenalties };
            }
            return p;
        }));
    };

    const handleNearChange = (memberId: string | null) => {
        // Near removed
    };

    // Determine if a specific hole is a 'Double' hole based on rules
    const checkIsDouble = (h: number): boolean => {
        if (!session) return false;

        // Settings for doubling
        const useDouble = session.useDouble;
        const doublingMode = session.doublingMode || 'next';

        if (!useDouble) return false;

        // Condition for doubling: Birdie or Blowup (Par3: Double+, Others: Triple+)
        const isDoubleConditionMet = (holeIdx: number) => {
            const par = coursePar[holeIdx];
            const playersToCalculate = holeIdx === currentHole ? localPlayers : (session.players || []);
            return playersToCalculate.some((p: any) => {
                const s = p.scores[holeIdx] || 0;
                if (s === 0) return false;

                // 1. 버디(-1) 이하
                const isBirdieOrBetter = s <= par - 1;

                // 2. 양파(Blowup): 파3홀은 더블보기(+2) 이상, 그 외는 트리플보기(+3) 이상
                const isBlowup = par === 3 ? s >= par + 2 : s >= par + 3;

                return isBirdieOrBetter || isBlowup;
            });
        };

        if (doublingMode === 'current') {
            // Current hole is double if its own condition is met
            return isDoubleConditionMet(h);
        } else {
            // Current hole is double if PREVIOUS hole condition was met
            if (h === 0) return false;
            return isDoubleConditionMet(h - 1);
        }
    };

    const isCurrentHoleDouble = useMemo(() => checkIsDouble(currentHole), [session, currentHole]);

    // Calculate Betting / Money
    // This is client-side calculation based on current scores
    const calculateMoney = () => {
        if (!session) return { total: {}, transactions: [] };

        const results: Record<string, number> = {};
        const allTransactions: Transaction[] = [];
        session.players.forEach((p: any) => results[p.memberId] = 0);

        for (let h = 0; h <= currentHole; h++) {
            if (session.gameMode === 'skins' || session.gameMode === 'stroke') {
                const playersToCalculate = h === currentHole ? localPlayers : (session.players || []);
                const holeTransactions = calculateHoleTransactions(h, playersToCalculate, {
                    stake: session.stake,
                    isDouble: checkIsDouble(h),
                    birdieAmount: session.birdieAmount ?? 10000,
                    eagleAmount: session.eagleAmount ?? 20000,
                });

                holeTransactions.forEach(t => {
                    results[t.fromId] -= t.amount;
                    results[t.toId] += t.amount;
                    allTransactions.push(t);
                });
            }
        }

        return { total: results, transactions: allTransactions };
    };

    const calculateHoleTransactions = (
        holeIndex: number,
        players: any[],
        rules: {
            stake: number;
            isDouble: boolean;
            birdieAmount: number;
            eagleAmount: number;
        }
    ): Transaction[] => {
        const results: Transaction[] = [];
        const par = coursePar[holeIndex];

        // 배판이면 타수 판돈 2배
        const currentStake = rules.isDouble ? rules.stake * 2 : rules.stake;

        // 고정 상금 계산 헬퍼 (버디/이글만)
        const getBonusAmount = (score: number, name: string, logDetails: string[]) => {
            let bonus = 0;
            const diff = score - par;

            if (diff <= -2) { // 이글 이하
                bonus += rules.eagleAmount;
                if (rules.eagleAmount > 0) logDetails.push(`🦅 ${name} 이글: +${rules.eagleAmount.toLocaleString()}`);
            } else if (diff === -1) { // 버디
                bonus += rules.birdieAmount;
                if (rules.birdieAmount > 0) logDetails.push(`🐦 ${name} 버디: +${rules.birdieAmount.toLocaleString()}`);
            }
            return bonus;
        };

        // 1:1 모든 조합 비교
        for (let i = 0; i < players.length; i++) {
            for (let j = i + 1; j < players.length; j++) {
                const p1 = players[i];
                const p2 = players[j];
                const s1 = p1.scores[holeIndex] || 0;
                const s2 = p2.scores[holeIndex] || 0;

                if (s1 === 0 || s2 === 0) continue;

                const logDetails: string[] = [];

                // [A] 타수 차이 금액 (Stroke Money)
                let strokeMoneyForP1 = 0;
                const strokeDiff = Math.abs(s1 - s2);
                if (s1 < s2) {
                    strokeMoneyForP1 = strokeDiff * currentStake;
                    logDetails.push(`${p1.name} ${strokeDiff}타차 승: +${strokeMoneyForP1.toLocaleString()}`);
                } else if (s1 > s2) {
                    strokeMoneyForP1 = -(strokeDiff * currentStake);
                    logDetails.push(`${p2.name} ${strokeDiff}타차 승: +${Math.abs(strokeMoneyForP1).toLocaleString()}`);
                }

                // [B] 별도 고정 상금 (Bonus Amount - 버디/이글)
                const p1BonusAmount = getBonusAmount(s1, p1.name, logDetails);
                const p2BonusAmount = getBonusAmount(s2, p2.name, logDetails);

                // [C] 최종 금액 합산 (Netting)
                const netMoneyForP1 = strokeMoneyForP1 + p1BonusAmount - p2BonusAmount;

                if (netMoneyForP1 !== 0) {
                    const isP1Receiver = netMoneyForP1 > 0;
                    const sender = isP1Receiver ? p2 : p1;
                    const receiver = isP1Receiver ? p1 : p2;
                    const finalAmount = Math.abs(netMoneyForP1);

                    if (rules.isDouble) logDetails.push("🔥 배판 적용");

                    results.push({
                        holeIndex,
                        fromId: sender.memberId,
                        fromName: sender.name,
                        toId: receiver.memberId,
                        toName: receiver.name,
                        amount: finalAmount,
                        details: logDetails
                    });
                }
            }
        }

        return results;
    };

    const autoFillCurrentHole = (): any[] => {
        if (!session) return localPlayers;

        const filledPlayers = localPlayers.map((p: any) => {
            const scores = p.scores || Array(18).fill(0);
            if (!scores[currentHole] || scores[currentHole] === 0) {
                const newScores = [...scores];
                newScores[currentHole] = coursePar[currentHole];
                return { ...p, scores: newScores };
            }
            return p;
        });
        setLocalPlayers(filledPlayers);
        return filledPlayers;
    };

    return {
        session,
        isLoading,
        currentHole,
        setCurrentHole,
        localPlayers,
        coursePar,
        handleScoreChange,
        handlePenaltyChange,
        saveCurrentHoleScores,
        autoFillCurrentHole,
        finishMatch: () => {
            if (finishingRef.current || finishMatchMutation.isPending) return;
            finishingRef.current = true;
            finishMatchMutation.mutate();
        },
        isFinishing: finishMatchMutation.isPending,
        ...(() => {
            const money = calculateMoney();
            return { moneyResults: money.total, moneyTransactions: money.transactions };
        })(),
        handleNearChange,
        isCurrentHoleDouble,
        isHost,
        updateCourse: (data: { frontCourseName?: string, backCourseName?: string }) => updateCourseMutation.mutate(data),
        getHoleSettlement: (holeIdx: number, playersOverride?: any[]) => {
            const playersToUse = playersOverride || localPlayers;
            if (!session || playersToUse.length === 0) return [];
            return calculateHoleTransactions(holeIdx, playersToUse, {
                stake: session.stake,
                isDouble: checkIsDouble(holeIdx),
                birdieAmount: session.birdieAmount ?? 10000,
                eagleAmount: session.eagleAmount ?? 20000,
            });
        }
    };
}
