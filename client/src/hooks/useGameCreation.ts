import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { HiqMember, HiqGameHistory } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

export type PlayerType = 'member' | 'guest';

export interface PlayerInfo {
    type: PlayerType;
    member?: HiqMember;
    name?: string;
    target: number;
    isHost?: boolean;
}

interface GameCreationProps {
    member: HiqMember | undefined;
    history: HiqGameHistory[] | undefined;
    initialMode?: "practice" | "match";
    initialType?: "3c" | "4c";
}

// Helper to calculate target score based on average and game type
const calculateTargetScore = (avg: string | number | null | undefined, type: '3c' | '4c'): number => {
    const average = typeof avg === 'string' ? parseFloat(avg) : (avg || 0);
    if (isNaN(average) || average === 0) return type === '3c' ? 15 : 15; // Minimum defaults

    if (type === '3c') {
        const calculated = Math.round(average * 35);
        return Math.max(1, calculated);
    } else {
        const calculated = Math.round(average * 20);
        return Math.max(1, calculated);
    }
};

// Helper to calculate Record Average from history
const calculateRecordAverage = (history: HiqGameHistory[] | undefined, type: '3c' | '4c', defaultAvg: string | undefined | null) => {
    if (!history) return defaultAvg || "0.000";

    const validGames = history.filter(g =>
        g.gameType === type &&
        g.gameMode === "match" &&
        (g as any).isRanked
    );

    if (validGames.length === 0) return defaultAvg || "0.000";

    const totalScore = validGames.reduce((acc, g) => acc + g.score, 0);
    const totalInnings = validGames.reduce((acc, g) => acc + g.innings, 0);

    return totalInnings > 0 ? (totalScore / totalInnings).toFixed(3) : (defaultAvg || "0.000");
};

export const useGameCreation = ({ member, history, initialMode = "practice", initialType = "4c" }: GameCreationProps) => {
    const [, setLocation] = useLocation();
    const { toast } = useToast();

    // Game Config State
    const [gameMode, setGameMode] = useState<"practice" | "match">(initialMode);
    const [gameType, setGameType] = useState<"3c" | "4c">(initialType);
    const [numberOfPlayers, setNumberOfPlayers] = useState(2);

    // Players State
    const [players, setPlayers] = useState<PlayerInfo[]>([]);

    // Invite State
    const [inviteCode, setInviteCode] = useState<string | null>(null);

    // Additional Rules
    const [useFinishRule, setUseFinishRule] = useState(false);
    const [finishTargetCount, setFinishTargetCount] = useState(1);
    const [usePbaRule, setUsePbaRule] = useState(false);

    // Initialize logic
    const initializeGame = useCallback(() => {
        if (member) {
            const recordAvg = calculateRecordAverage(history, gameType, member.average);
            const initialTarget = calculateTargetScore(recordAvg, gameType);

            setPlayers([
                { type: 'member', member, name: member.name, target: initialTarget, isHost: true },
                ...Array(numberOfPlayers - 1).fill({ type: 'guest', target: 0, name: '' })
            ]);

            // Generate Invite Code if match mode
            if (gameMode === "match") {
                apiRequest("/api/hiq/invite", { method: "POST" })
                    .then(res => setInviteCode(res.code))
                    .catch(e => console.error("Failed to create invite code", e));
            } else {
                setInviteCode(null);
            }
        }
    }, [member, history, gameMode, gameType, numberOfPlayers]);

    // Update Player Count
    useEffect(() => {
        setPlayers(prev => {
            if (prev.length === numberOfPlayers) return prev;
            if (prev.length > numberOfPlayers) return prev.slice(0, numberOfPlayers);

            const newPlayers = [...prev];
            while (newPlayers.length < numberOfPlayers) {
                newPlayers.push({ type: 'guest', target: 0, name: '' });
            }
            return newPlayers;
        });
    }, [numberOfPlayers]);

    // Change Game Type (Recalculate Targets)
    const changeGameType = (newType: "3c" | "4c") => {
        setGameType(newType);

        // Recalculate targets for member players
        setPlayers(prev => prev.map(p => {
            if (p.type === 'member' && p.member) {
                // For Host (Me)
                if (p.isHost && member) {
                    const recordAvg = calculateRecordAverage(history, newType, member.average);
                    return { ...p, target: calculateTargetScore(recordAvg, newType) };
                }
                // For other members (polling guests) use their average
                return { ...p, target: calculateTargetScore(p.member.average, newType) };
            }
            return p;
        }));
    };

    // Player Management Actions
    const updatePlayer = (index: number, updates: Partial<PlayerInfo>) => {
        setPlayers(prev => {
            const newPlayers = [...prev];
            newPlayers[index] = { ...newPlayers[index], ...updates };
            return newPlayers;
        });
    };

    const movePlayer = (index: number, direction: -1 | 1) => {
        setPlayers(prev => {
            const newPlayers = [...prev];
            const targetIndex = index + direction;
            if (targetIndex < 0 || targetIndex >= newPlayers.length) return prev;

            [newPlayers[index], newPlayers[targetIndex]] = [newPlayers[targetIndex], newPlayers[index]];
            return newPlayers;
        });
    };

    // Polling Logic
    useEffect(() => {
        if (inviteCode && gameMode === "match") {
            const interval = setInterval(async () => {
                try {
                    const res = await apiRequest(`/api/hiq/invite/${inviteCode}`);
                    if (res.guests && res.guests.length > 0) {
                        setPlayers(prev => {
                            let currentPlayers = [...prev];
                            const requiredSlots = 1 + res.guests.length;

                            // Auto-expand
                            if (requiredSlots > currentPlayers.length) {
                                const additional = requiredSlots - currentPlayers.length;
                                for (let i = 0; i < additional; i++) {
                                    currentPlayers.push({ type: 'guest', target: 0, name: '' });
                                }
                                setNumberOfPlayers(requiredSlots);
                            }

                            const existingIds = new Set(currentPlayers.filter(p => p.member).map(p => p.member!.id));

                            res.guests.forEach((guest: any) => {
                                if (existingIds.has(guest.id)) return;

                                const emptySlotIdx = currentPlayers.findIndex(p => !p.isHost && !p.member && (!p.name || p.name === ''));
                                if (emptySlotIdx !== -1) {
                                    currentPlayers[emptySlotIdx] = {
                                        ...currentPlayers[emptySlotIdx],
                                        type: 'member',
                                        member: guest,
                                        target: calculateTargetScore(guest.average, gameType),
                                        name: guest.name
                                    };
                                } else {
                                    // Fallback
                                    const guestSlotIdx = currentPlayers.findIndex(p => !p.isHost && !p.member);
                                    if (guestSlotIdx !== -1) {
                                        currentPlayers[guestSlotIdx] = {
                                            ...currentPlayers[guestSlotIdx],
                                            type: 'member',
                                            member: guest,
                                            target: calculateTargetScore(guest.average, gameType),
                                            name: guest.name
                                        };
                                    }
                                }
                            });
                            return currentPlayers;
                        });
                    }
                } catch (e) {
                    console.warn("Polling warning", e);
                }
            }, 3000);
            return () => clearInterval(interval);
        }
    }, [inviteCode, gameMode, gameType]);

    // Confirm Start
    const confirmStart = async () => {
        if (!member) return;

        // Try Landscape Lock
        try {
            if (document.documentElement.requestFullscreen) {
                await document.documentElement.requestFullscreen();
            }
            if (screen.orientation && 'lock' in screen.orientation) {
                // @ts-ignore
                await screen.orientation.lock('landscape');
            }
        } catch (e) {
            console.warn("Screen lock failed", e);
        }

        const ruleFinishType = !useFinishRule ? "none" : (gameType === "4c" ? "3c" : "bank");

        try {
            const body = {
                gameMode,
                gameType,
                status: "playing_base",
                player1Id: players[0].type === 'member' ? players[0].member?.id : null,
                player1Name: players[0].name,
                player1Target: players[0].target,
                player2Id: players[1]?.type === 'member' ? players[1].member?.id : null,
                player2Name: players[1]?.type === 'guest' ? players[1].name : undefined,
                player2Target: players[1]?.target || 0,
                player3Id: players[2]?.type === 'member' ? players[2].member?.id : null,
                player3Name: players[2]?.type === 'guest' ? players[2].name : undefined,
                player3Target: players[2]?.target || 0,
                player4Id: players[3]?.type === 'member' ? players[3].member?.id : null,
                player4Name: players[3]?.type === 'guest' ? players[3].name : undefined,
                player4Target: players[3]?.target || 0,
                ruleFinishType,
                finishTargetCount: useFinishRule ? finishTargetCount : 0,
                usePbaRule: gameType === "3c" ? usePbaRule : false,
                targetScore: players[0].target,
            };

            const game = await apiRequest("/api/hiq/game/start", {
                method: "POST",
                body
            });
            setLocation(`/game/${game.id}`);
        } catch (error) {
            console.error("Failed to start game:", error);
            toast({
                title: "게임 시작 실패",
                description: "잠시 후 다시 시도해주세요.",
                variant: "destructive"
            });
        }
    };

    return {
        gameMode, setGameMode,
        gameType, changeGameType,
        numberOfPlayers, setNumberOfPlayers,
        players, updatePlayer, movePlayer,
        inviteCode,
        useFinishRule, setUseFinishRule,
        finishTargetCount, setFinishTargetCount,
        usePbaRule, setUsePbaRule,
        initializeGame,
        confirmStart
    };
};
