import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { HiqMember, HiqGameHistory } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/lib/i18n";

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

// hiq_games 스키마의 슬롯은 player1~4가 전부다. 그 이상으로 늘려봐야 저장될 자리가 없어
// 5번째 참가자는 조용히 사라진다.
const MAX_PLAYERS = 4;

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
    const { t } = useT();

    // Game Config State
    const [gameMode, setGameMode] = useState<"practice" | "match">(initialMode);
    const [gameType, setGameType] = useState<"3c" | "4c">(initialType);
    const [numberOfPlayers, setNumberOfPlayersInternal] = useState(2);
    const numberOfPlayersRef = useRef(numberOfPlayers);
    numberOfPlayersRef.current = numberOfPlayers;

    // 호스트가 인원 수를 직접 고르면 그 선택이 폴링보다 우선한다. 이 플래그가 없으면 "2인"을
    // 눌러도 3초 뒤 폴링이 참가자 수만큼 슬롯을 도로 늘려 선택이 취소된 것처럼 보인다.
    const playerCountTouchedRef = useRef(false);
    const setNumberOfPlayers = useCallback((count: number) => {
        playerCountTouchedRef.current = true;
        setNumberOfPlayersInternal(Math.min(MAX_PLAYERS, Math.max(1, count)));
    }, []);

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
            // 새 세션이므로 인원 수 수동 선택 기록도 초기화한다.
            playerCountTouchedRef.current = false;
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

            // 호스트는 1번 슬롯 고정. 서버는 슬롯2~4에 "내 초대에 동의한 게스트"만 허용하고
            // 호스트 본인은 자기 초대에 참여할 수 없어 그 목록에 절대 없다 — 호스트가 내려가면
            // player2Id로 본인 id가 실려 400이 떨어지고 경기가 영영 시작되지 않는다.
            if (newPlayers[index].isHost || newPlayers[targetIndex].isHost) return prev;

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
                    const guests: any[] = res.guests || [];
                    if (guests.length === 0) return;

                    // 참가자가 몰려도 슬롯 상한(4)을 넘기지 않는다.
                    const requiredSlots = Math.min(MAX_PLAYERS, 1 + guests.length);
                    // 호스트가 인원을 직접 고른 뒤에는 폴링이 그 선택을 되돌리지 않는다.
                    const mayExpand = !playerCountTouchedRef.current;

                    setPlayers(prev => {
                        const currentPlayers = [...prev];

                        // Auto-expand
                        if (mayExpand) {
                            while (currentPlayers.length < requiredSlots) {
                                currentPlayers.push({ type: 'guest', target: 0, name: '' });
                            }
                        }

                        const existingIds = new Set(currentPlayers.filter(p => p.member).map(p => p.member!.id));

                        guests.forEach((guest: any) => {
                            if (existingIds.has(guest.id) || dismissedIds.includes(guest.id)) return;

                            // 앉힐 수 있는 자리는 '비어 있는' 슬롯뿐이다. 예전 폴백은 빈 슬롯이 없으면
                            // 이름이 이미 적힌 게스트 슬롯까지 덮어써서, 호스트가 적어둔 상대 이름이
                            // 핀에 아무나 들어오는 순간 조용히 바뀌었다. 자리가 없으면 그냥 둔다.
                            const emptySlotIdx = currentPlayers.findIndex(p => !p.isHost && !p.member && !p.name?.trim());
                            if (emptySlotIdx === -1) return;

                            currentPlayers[emptySlotIdx] = {
                                ...currentPlayers[emptySlotIdx],
                                type: 'member',
                                member: guest,
                                target: calculateTargetScore(memberAvgForType(guest, gameType), gameType),
                                name: guest.name
                            };
                            existingIds.add(guest.id);
                        });
                        return currentPlayers;
                    });

                    // 인원 셀렉터와 슬롯 수가 어긋나지 않게 맞춘다. setPlayers 업데이터 안에서
                    // 호출하면 렌더 도중 다른 state를 건드리는 부수효과가 되므로 밖에서 처리.
                    if (mayExpand && requiredSlots > numberOfPlayersRef.current) {
                        setNumberOfPlayersInternal(requiredSlots);
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

        // NOTE: 예전엔 여기서 requestFullscreen() + orientation.lock('landscape')를 호출했으나 제거함.
        // - 네이티브 쉘(Capacitor)은 브라우저 크롬이 없어 전체화면이 불필요.
        // - iOS 전체화면(Fullscreen API)은 env(safe-area-inset-*)를 0으로 만들어 스코어보드가
        //   노치/다이나믹 아일랜드를 침범하게 하는 원인이었음(전체화면 아니면 62px 정상).
        // - 가로 전환은 LandscapeGuard의 CSS rotate(90deg)가 처리하므로 orientation.lock도 불필요
        //   (iOS WebKit은 screen.orientation.lock 미지원 → throw만 함).

        const ruleFinishType = !useFinishRule ? "none" : (gameType === "4c" ? "3c" : "bank");

        // 게스트 이름이 비면 서버에 ""가 저장되는데, 스코어보드는 (playerNId || playerNName)으로
        // 참가 인원을 세기 때문에 빈 문자열이 falsy가 되어 상대 카드가 아예 렌더링되지 않는다
        // (턴을 넘겨도 이닝만 올라간다). 막는 대신 자동으로 채운다 — 마찰이 적다.
        // 단, 연습 모드는 1번 슬롯만 쓰므로 채우면 혼자 연습이 2인 경기로 둔갑한다.
        const guestSlotName = (p: PlayerInfo | undefined, idx: number): string | undefined => {
            const typed = p?.name?.trim();
            if (typed) return typed;
            return gameMode === "match" ? `${t("gameCreationModal.guest")} ${idx + 1}` : p?.name;
        };

        try {
            const body = {
                gameMode,
                gameType,
                status: "playing_base",
                player1Id: players[0].type === 'member' ? players[0].member?.id : null,
                player1Name: players[0].name,
                player1Target: players[0].target,
                player2Id: players[1]?.type === 'member' ? players[1].member?.id : null,
                player2Name: players[1]?.type === 'guest' ? guestSlotName(players[1], 1) : undefined,
                player2Target: players[1]?.target || 0,
                player3Id: players[2]?.type === 'member' ? players[2].member?.id : null,
                player3Name: players[2]?.type === 'guest' ? guestSlotName(players[2], 2) : undefined,
                player3Target: players[2]?.target || 0,
                player4Id: players[3]?.type === 'member' ? players[3].member?.id : null,
                player4Name: players[3]?.type === 'guest' ? guestSlotName(players[3], 3) : undefined,
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
            // 서버가 준 사유("상대의 참가 확인이 만료되었습니다. 새 핀으로..." 등)를 그대로 보여준다.
            // 고정 문구만 띄우면 호스트는 몇 번을 다시 눌러도 원인을 알 수 없었다.
            // 네트워크 오류(TypeError: Failed to fetch)는 사용자에게 의미가 없어 기본 문구로 간다.
            const serverMessage = error instanceof ApiError ? error.message : "";
            toast({
                title: "게임 시작 실패",
                description: serverMessage || "잠시 후 다시 시도해주세요.",
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
