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
    /** 크루 토너먼트 대진에서 시작한 경기. 상대가 이미 정해져 있어 PIN 단계를 건너뛰고
     *  2번 슬롯에 바로 앉힌다(오너 결정 2026-08-30: 8명 대회면 PIN 을 7번 주고받아야 한다).
     *  목표 점수는 여기서 강제하지 않는다 — 매칭 화면에서 그때그때 맞춘다. */
    tournamentMatch?: { matchId: string; opponent: HiqMember } | null;
    /** 채팅의 매칭 대결 카드에서 이어받은 핀. 카드가 이미 그 코드를 들고 방에 떠 있으므로
     *  여기서 새 핀을 만들면 카드에 적힌 코드와 화면의 코드가 갈린다 — 그대로 이어서 쓴다. */
    initialCode?: string | null;
    /** 카드가 정한 종목·자리 수·방장 목표. 세션이 열릴 때 한 번만 반영하고, 그 뒤 호스트가
     *  고친 값은 절대 덮어쓰지 않는다. */
    initialGameType?: "3c" | "4c";
    initialSeats?: number;
    initialTarget?: number;
}

// hiq_games 스키마의 슬롯은 player1~4가 전부다. 그 이상으로 늘려봐야 저장될 자리가 없어
// 5번째 참가자는 조용히 사라진다.
const MAX_PLAYERS = 4;

// 게스트 슬롯의 기본 목표 점수. 예전엔 0이었는데, target=0 슬롯은 승리 조건이 없어서
// (클라 가드 target>0) 게스트는 몇 점을 내도 이길 수 없고 화면엔 시작부터 가짜 FINISH 가
// 떠 있었다. 실측(2026-08-31): 게스트 상대 경기 종료율 14% vs 회원 상대 80%,
// 외국 유저 19경기 전원 미종료. 한국 유저는 게스트에게도 다마수를 손으로 넣는 문화라
// 살아남았을 뿐이다.
const DEFAULT_GUEST_TARGET = 15;

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

export const useGameCreation = ({
    member,
    history,
    initialMode = "practice",
    initialType = "4c",
    open = true,
    tournamentMatch = null,
    initialCode = null,
    initialGameType,
    initialSeats,
    initialTarget,
}: GameCreationProps) => {
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

    // 이어받은 핀이 실제로 state 에 들어갔는지. 아래 민팅 효과는 이 커밋에서 initializeGame 보다
    // 먼저 돌기 때문에, 이 표시가 없으면 카드의 핀이 앉기 전에 새 핀을 하나 더 만들어버린다.
    const inheritedCommittedRef = useRef(false);

    // Initialize logic
    const initializeGame = useCallback(() => {
        if (member) {
            // 채팅 카드에서 이어받았다면 카드가 정한 종목·자리 수가 이 세션의 출발점이다.
            // 세션이 열릴 때 딱 한 번 — 그 뒤 호스트가 고른 값은 건드리지 않는다.
            const type = initialGameType ?? gameType;
            if (type !== gameType) setGameType(type);

            const seats = initialSeats ? Math.min(MAX_PLAYERS, Math.max(1, initialSeats)) : numberOfPlayers;
            if (seats !== numberOfPlayers) setNumberOfPlayersInternal(seats);

            const recordAvg = calculateRecordAverage(history, type, memberAvgForType(member, type));
            // 카드에 적어 보낸 목표가 있으면 그것이 방장의 목표다(핸디를 카드에서 이미 맞췄다).
            const hostTarget = initialTarget && initialTarget > 0 ? initialTarget : calculateTargetScore(recordAvg, type);

            // 대진 경기는 상대가 정해져 있다 — 2인 고정으로 앉히고 상대 목표는 그 사람 기록으로.
            setPlayers(tournamentMatch
                ? [
                    { type: 'member', member, name: member.name, target: hostTarget, isHost: true },
                    {
                        type: 'member',
                        member: tournamentMatch.opponent,
                        name: tournamentMatch.opponent.name,
                        target: calculateTargetScore(memberAvgForType(tournamentMatch.opponent, type), type),
                    },
                ]
                : [
                    { type: 'member', member, name: member.name, target: hostTarget, isHost: true },
                    ...Array(seats - 1).fill({ type: 'guest', target: DEFAULT_GUEST_TARGET, name: '' })
                ]);

            // Drop any previous PIN so each new session mints a fresh one.
            // NOTE: the invite code is NOT created here — the caller (GameCreationModal) invokes
            // this in the same tick as setGameMode(initialMode), so `gameMode` in this closure is
            // still the PREVIOUS value. Reading it here silently skipped PIN creation for match
            // games. The effect below owns creation and reacts to the settled gameMode instead.
            // 예외는 채팅 카드에서 이어받은 핀뿐이다 — 그건 이미 살아 있으니 그대로 쓴다.
            setInviteCode(initialCode ?? null);
            inheritedCommittedRef.current = !!initialCode;
            // 이어받은 핀은 지난 세션이 남긴 오류 문구를 덮어쓴다(코드가 멀쩡한데 '실패'가 남아 있으면 안 된다).
            if (initialCode) setInviteError(null);
            setDismissedIds([]);
            // 새 세션이므로 인원 수 수동 선택 기록도 초기화한다.
            // 단, 카드가 자리 수를 정해 왔다면 그건 방장이 이미 고른 값이다 — 폴링이 늘리지 못하게 둔다.
            playerCountTouchedRef.current = !!initialSeats;
        }
    }, [member, history, gameType, numberOfPlayers, tournamentMatch, initialCode, initialGameType, initialSeats, initialTarget]);

    // Mint the match PIN whenever we're in match mode without one.
    // Keyed on the settled gameMode, so it works even when the mode is set in the same tick
    // the modal initializes. A ref guards against duplicate in-flight requests.
    const invitePendingRef = useRef(false);
    useEffect(() => {
        if (!open || !member) return;

        // 대진 경기는 상대가 이미 확정돼 PIN 이 필요 없다(서버가 대진으로 동의를 검증한다).
        if (tournamentMatch) {
            setInviteCode(null);
            setInviteError(null);
            invitePendingRef.current = false;
            return;
        }

        if (gameMode !== "match") {
            setInviteCode(null);
            setInviteError(null);
            invitePendingRef.current = false;
            return;
        }

        // While an error is showing, wait for an explicit 다시 시도 (retryInvite) instead of
        // silently re-minting in a loop.
        if (inviteCode || inviteError || invitePendingRef.current) return;

        // 채팅 카드에서 이어받은 핀은 initializeGame 이 넣는다. 이 효과가 같은 커밋에서 먼저 돌기
        // 때문에 여기서 막지 않으면 카드의 코드가 앉기 전에 새 핀이 하나 더 생긴다.
        // (만료 404 뒤 '다시 시도'는 이 표시가 이미 서 있어 정상적으로 새 핀을 만든다.)
        if (initialCode && !inheritedCommittedRef.current) return;

        invitePendingRef.current = true;
        apiRequest("/api/hiq/invite", { method: "POST" })
            .then(res => setInviteCode(res.code))
            .catch(e => {
                console.error("Failed to create invite code", e);
                // Surface it — the host used to sit on "핀 생성 중..." forever with no way out.
                setInviteError(t("gameCreation.pinCreateFail"));
            })
            .finally(() => { invitePendingRef.current = false; });
    }, [open, gameMode, member, inviteCode, inviteError, tournamentMatch, initialCode]);

    // Clearing the code + error re-triggers the mint effect above.
    const retryInvite = useCallback(() => {
        setInviteError(null);
        setInviteCode(null);
        // 이어받은 핀이 만료돼 다시 시도를 누른 것이므로, 이제부터는 새 핀을 만들어야 한다.
        inheritedCommittedRef.current = true;
    }, []);

    // Update Player Count
    useEffect(() => {
        setPlayers(prev => {
            if (prev.length === numberOfPlayers) return prev;
            if (prev.length > numberOfPlayers) return prev.slice(0, numberOfPlayers);

            const newPlayers = [...prev];
            while (newPlayers.length < numberOfPlayers) {
                newPlayers.push({ type: 'guest', target: DEFAULT_GUEST_TARGET, name: '' });
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
                                currentPlayers.push({ type: 'guest', target: DEFAULT_GUEST_TARGET, name: '' });
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
                    // 문구가 아니라 상태로 본다 — 서버 오류 문구는 이제 사용자 언어로 나가서 한국어 비교가 안 맞는다(2026-09-22).
                    const msg = String(e?.message || "");
                    if (e?.status === 404 || msg.includes("404")) {
                        setInviteError(t("gameCreation.pinExpired"));
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
                // 서버가 이 id 로 대진을 확인하고 상대를 직접 앉힌다(클라 값은 믿지 않는다).
                ...(tournamentMatch ? { tournamentMatchId: tournamentMatch.matchId } : {}),
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
                title: t("gameCreation.startFailTitle"),
                description: serverMessage || t("gameCreation.startFailDesc"),
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
