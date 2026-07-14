import { useState, useEffect, useCallback, useRef } from "react";
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
    /** Whether the lobby is on screen. The modal is never unmounted, so without this the
     *  PIN poll would keep hitting the server every 3s forever after the user closes it. */
    open?: boolean;
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

// 3쿠션과 4구의 평균은 완전히 다른 스케일이다. 범용 `average` 컬럼은 "마지막으로 끝낸 종목"의
// 평균이 덮어써지므로, 종목별 핸디를 뽑을 때 절대 폴백으로 쓰면 안 된다 (4구 평균 1.2가
// 3쿠션 목표 42점으로 둔갑한다). 해당 종목 기록이 없으면 undefined → 기본 목표(15)로 간다.
const memberAvgForType = (m: any, type: '3c' | '4c'): number | undefined => {
    const typed = type === '3c' ? m?.avg3c : m?.avg4c;
    return typeof typed === 'number' && typed > 0 ? typed : undefined;
};

// Helper to calculate Record Average from history
const calculateRecordAverage = (history: HiqGameHistory[] | undefined, type: '3c' | '4c', defaultAvg: string | number | undefined | null) => {
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

export const useGameCreation = ({ member, history, initialMode = "practice", initialType = "4c", open = true }: GameCreationProps) => {
    const [, setLocation] = useLocation();
    const { toast } = useToast();

    // Game Config State
    const [gameMode, setGameMode] = useState<"practice" | "match">(initialMode);
    const [gameType, setGameType] = useState<"3c" | "4c">(initialType);
    const [numberOfPlayers, setNumberOfPlayers] = useState(2);

    // Players State
    const [players, setPlayers] = useState<PlayerInfo[]>([]);

    // Members the host deliberately cleared out of a slot (회원/게스트 토글). The 3s invite poll
    // must not resurrect them — otherwise a joined opponent can never be demoted and the guest
    // name the host types gets overwritten every tick.
    const [dismissedIds, setDismissedIds] = useState<string[]>([]);

    // Invite State
    const [inviteCode, setInviteCode] = useState<string | null>(null);
    const [inviteError, setInviteError] = useState<string | null>(null);

    // Additional Rules
    const [useFinishRule, setUseFinishRule] = useState(false);
    const [finishTargetCount, setFinishTargetCount] = useState(1);
    const [usePbaRule, setUsePbaRule] = useState(false);

    // Initialize logic
    const initializeGame = useCallback(() => {
        if (member) {
            const recordAvg = calculateRecordAverage(history, gameType, memberAvgForType(member, gameType));
            const initialTarget = calculateTargetScore(recordAvg, gameType);

            setPlayers([
                { type: 'member', member, name: member.name, target: initialTarget, isHost: true },
                ...Array(numberOfPlayers - 1).fill({ type: 'guest', target: 0, name: '' })
            ]);

            // Drop any previous PIN so each new session mints a fresh one.
            // NOTE: the invite code is NOT created here — the caller (GameCreationModal) invokes
            // this in the same tick as setGameMode(initialMode), so `gameMode` in this closure is
            // still the PREVIOUS value. Reading it here silently skipped PIN creation for match
            // games. The effect below owns creation and reacts to the settled gameMode instead.
            setInviteCode(null);
            setDismissedIds([]);
        }
    }, [member, history, gameType, numberOfPlayers]);

    // Mint the match PIN whenever we're in match mode without one.
    // Keyed on the settled gameMode, so it works even when the mode is set in the same tick
    // the modal initializes. A ref guards against duplicate in-flight requests.
    const invitePendingRef = useRef(false);
    useEffect(() => {
        if (!open || !member) return;

        if (gameMode !== "match") {
            setInviteCode(null);
            setInviteError(null);
            invitePendingRef.current = false;
            return;
        }

        // While an error is showing, wait for an explicit 다시 시도 (retryInvite) instead of
        // silently re-minting in a loop.
        if (inviteCode || inviteError || invitePendingRef.current) return;

        invitePendingRef.current = true;
        apiRequest("/api/hiq/invite", { method: "POST" })
            .then(res => setInviteCode(res.code))
            .catch(e => {
                console.error("Failed to create invite code", e);
                // Surface it — the host used to sit on "핀 생성 중..." forever with no way out.
                setInviteError("핀 코드를 만들지 못했습니다. 다시 시도해주세요.");
            })
            .finally(() => { invitePendingRef.current = false; });
    }, [open, gameMode, member, inviteCode, inviteError]);

    // Clearing the code + error re-triggers the mint effect above.
    const retryInvite = useCallback(() => {
        setInviteError(null);
        setInviteCode(null);
    }, []);

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
                    const recordAvg = calculateRecordAverage(history, newType, memberAvgForType(member, newType));
                    return { ...p, target: calculateTargetScore(recordAvg, newType) };
                }
                // For other members (polling guests) use their average
                return { ...p, target: calculateTargetScore(memberAvgForType(p.member, newType), newType) };
            }
            return p;
        }));
    };

    // Player Management Actions
    const updatePlayer = (index: number, updates: Partial<PlayerInfo>) => {
        const clearedMemberId = ('member' in updates && !updates.member) ? players[index]?.member?.id : undefined;
        if (clearedMemberId) {
            setDismissedIds(prev => prev.includes(clearedMemberId) ? prev : [...prev, clearedMemberId]);
        }

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

    // Polling Logic — only while the lobby is actually on screen.
    useEffect(() => {
        if (open && inviteCode && gameMode === "match") {
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
                                if (existingIds.has(guest.id) || dismissedIds.includes(guest.id)) return;

                                const emptySlotIdx = currentPlayers.findIndex(p => !p.isHost && !p.member && (!p.name || p.name === ''));
                                if (emptySlotIdx !== -1) {
                                    currentPlayers[emptySlotIdx] = {
                                        ...currentPlayers[emptySlotIdx],
                                        type: 'member',
                                        member: guest,
                                        target: calculateTargetScore(memberAvgForType(guest, gameType), gameType),
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
                                            target: calculateTargetScore(memberAvgForType(guest, gameType), gameType),
                                            name: guest.name
                                        };
                                    }
                                }
                            });
                            return currentPlayers;
                        });
                    }
                } catch (e: any) {
                    // The server 404s a code that no longer exists / has expired. Keep showing a
                    // dead PIN as if it were live and the host waits forever for a guest who can
                    // never join — surface it and let them mint a fresh one.
                    const msg = String(e?.message || "");
                    if (msg.includes("존재하지") || msg.includes("404")) {
                        setInviteError("핀이 만료되었습니다. 새 핀을 발급해주세요.");
                        setInviteCode(null);
                        return;
                    }
                    console.warn("Polling warning", e);
                }
            }, 3000);
            return () => clearInterval(interval);
        }
    }, [open, inviteCode, gameMode, gameType, dismissedIds]);

    // Confirm Start
    const startingRef = useRef(false);
    const [isStarting, setIsStarting] = useState(false);
    const confirmStart = async () => {
        if (!member) return;
        // Double-tap guard: without this, two rapid taps create two separate games.
        if (startingRef.current) return;
        startingRef.current = true;
        setIsStarting(true);

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
            // Only release the guard on failure — on success we navigate away.
            startingRef.current = false;
            setIsStarting(false);
        }
    };

    return {
        gameMode, setGameMode,
        gameType, changeGameType,
        numberOfPlayers, setNumberOfPlayers,
        players, updatePlayer, movePlayer,
        inviteCode, inviteError, retryInvite,
        useFinishRule, setUseFinishRule,
        finishTargetCount, setFinishTargetCount,
        usePbaRule, setUsePbaRule,
        initializeGame,
        confirmStart, isStarting
    };
};
