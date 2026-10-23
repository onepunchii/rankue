import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient, useIsMutating } from "@tanstack/react-query";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { HiqGame, HiqMember } from "@shared/schema";
import { useGameHistory } from "@/hooks/useGameHistory";
import { useGameAudio } from "@/hooks/useGameAudio";
import { useT } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { arrayMove } from '@dnd-kit/sortable';
import { GameState } from "@/types/game";
import { useAuth } from "@/hooks/useAuth";
import { gameSaveScope, gameFinishKey, gameDiscardKey, canQueueSave, isGameGone, isNoAnswer, SAVE_TIMEOUT_MS, DISCARD_TIMEOUT_MS } from "@shared/gameMutationQueue";
import { breakerOf, canChooseBreaker, inningOf, nextSlot, turnFromArrays, type Slot } from "@shared/scoreboardOrder";
import { clearStash, pickRestore, pruneStashes, readStash, rowFingerprint, stateFingerprint, withKnown, writeStash, type StorageLike } from "@shared/scoreboardStash";

/** 기기 저장소 — 막힌 환경(사파리 프라이빗 등)에선 null. 보관은 덤이라 없어도 점수판은 그대로 돈다 */
const boardStorage = (): StorageLike | null => {
    try { return typeof localStorage !== "undefined" ? localStorage : null; } catch { return null; }
};

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

/**
 * 서버 경기 행 → 점수판 상태. 호스트는 새로고침 때 한 번 되살리는 데, 참가자 관전 화면은 3초마다 새로 받은 행을
 * 그리는 데 같이 쓴다(2026-09-27 오너: 점수판은 호스트만, 참가자는 관전).
 */
export function gameStateFromRow(game: HiqGame): GameState {
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

    // 지금 차례 · 이닝은 이닝 배열에서 되살린다 — 초구(breakPlayer, 없으면 1)부터의 순서에서 배열이 가장 짧은 첫 사람의 차례,
    // 이닝은 초구가 친 이닝 수(shared/scoreboardOrder). 초구가 1이면 예전 규칙(가장 짧은 사람, 같으면 1번)과 같다.
    const activeCount = 1
        + ((game.player2Id || game.player2Name) ? 1 : 0)
        + ((game.player3Id || game.player3Name) ? 1 : 0)
        + ((game.player4Id || game.player4Name) ? 1 : 0);
    const inningArrays = [p1Innings, p2Innings, p3Innings, p4Innings];
    const breaker = breakerOf((game as any).breakPlayer, activeCount);
    const derivedTurn = turnFromArrays(inningArrays, breaker, activeCount);
    // 이닝 배열이 없던 아주 옛 행은 저장된 총이닝을 그대로 쓴다
    const hasArrays = inningArrays.slice(0, activeCount).some((a) => a.length > 0);
    const innings = hasArrays ? inningOf(inningArrays, breaker, derivedTurn) : Math.max(1, game.totalInnings ?? 0);

    return {
        p1Score: game.player1Score ?? 0,
        p2Score: game.player2Score ?? 0,
        p3Score: game.player3Score ?? 0,
        p4Score: game.player4Score ?? 0,
        innings,
        p1FinishScore: Number((game as any).finishProgress?.["1"] ?? 0),
        p2FinishScore: Number((game as any).finishProgress?.["2"] ?? 0),
        p3FinishScore: Number((game as any).finishProgress?.["3"] ?? 0),
        p4FinishScore: Number((game as any).finishProgress?.["4"] ?? 0),
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
        currentTurn: derivedTurn,
        breaker,
        p1Innings,
        p2Innings,
        p3Innings,
        p4Innings
    };
}

export function useGameScore(id: string) {
    const [, setLocation] = useLocation();
    const { speak, playEffect } = useGameAudio();
    const { t } = useT();
    const { toast } = useToast(); // TTS 경기 콜 다국어 (엔진 언어는 useGameAudio가 로케일 연동)

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
        breaker: 1,
        p1Innings: [],
        p2Innings: [],
        p3Innings: [],
        p4Innings: []
    });

    // Hydration guard: ensures we copy server state into gameState exactly once,
    // and prevents auto-save from firing (and clobbering saved scores) before that.
    const hydratedRef = useRef(false);

    // Queries
    // 점수판은 호스트(player1 — 서버가 경기를 만든 사람으로 고정)만 조작한다. 참가자(푸시·이어하기·대진으로 들어온 상대)는
    // 관전 — 저장하지 않고 3초마다 서버 행을 새로 받아 그린다. 서버도 점수·종료·버리기를 호스트만 받는다(routes/game.ts assertHost).
    // 골프는 이번 결정의 대상이 아니다(같은 행을 쓰지만 점수판이 따로다).
    const { member, isLoading: authLoading } = useAuth();
    const memberId = member?.id ?? null;
    const isSpectator = (g: HiqGame | undefined | null) => !!g && g.gameType !== "golf" && !!memberId && g.player1Id !== memberId;
    const { data: game, isLoading, error } = useQuery<HiqGame>({
        queryKey: [`/api/hiq/game/${id}`],
        // 점수판을 떠나면 행을 캐시에서 바로 뺀다(기본은 5분 남는다). 같은 세션에서 홈의 '이어서'로 돌아오면 남아 있던 옛 행(들어올 때 받은 것)으로
        // 점수판을 되살리고(되살리기는 한 번뿐이다) 400ms 뒤 그 낡은 점수를 다시 PATCH 해 서버의 진행을 덮었다(2026-10-06).
        // 기기 저장소에 남기지 않는 것(queryClient.ts)과 같은 이유다 — 다시 들어오면 늘 서버에서 새로 받는다.
        gcTime: 0,
        refetchInterval: (q) => (isSpectator(q.state.data) && q.state.data?.status !== "finished" ? 3000 : false),
        refetchIntervalInBackground: false,
        retry: (n, e: any) => !(e instanceof ApiError && e.status === 404) && n < 2,
    });
    const spectating = isSpectator(game);
    /** 저장해도 되는 사람 — 호스트로 확인된 뒤에만(회원 정보가 늦게 와도 참가자가 한 번 저장하는 일이 없게) */
    const canSaveRef = useRef(false);
    canSaveRef.current = !!game && !!memberId && (game.gameType === "golf" || game.player1Id === memberId);

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
    const queryClient = useQueryClient();

    /** 이 점수판이 화면에 떠 있는가 — 떠난 뒤에 끝난 요청의 뒷일(FINISH 실패를 어디에 알릴지 · 확인 저장)을 가른다 */
    const mountedRef = useRef(true);
    useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; };
    }, []);

    /** 이 경기의 FINISH·버리기가 가는 중인가 — 누르는 순간의 캐시를 읽는다. 앞 화면이 남긴 요청도 센다(shared/gameMutationQueue 의 gameFinishKey). */
    const endingNow = () =>
        queryClient.isMutating({ mutationKey: gameFinishKey(id) }) + queryClient.isMutating({ mutationKey: gameDiscardKey(id) }) > 0;

    /** FINISH 실패의 까닭 — 서버가 답한 것은 그 말을, 답을 못 받은 것(끊김 · 시간 초과 · 웹 서비스워커의 가짜 404)은 다시 누르라는 말을 */
    const finishFailText = (err: unknown): string =>
        err instanceof ApiError && !isNoAnswer(err) ? err.message : t("gameScoreboard.finishFailDesc");

    // Mutations
    const finishMutation = useMutation({
        mutationKey: gameFinishKey(id),
        // 같은 경기 행을 건드리는 저장끼리 순서가 역전되지 않도록 점수 저장과 스코프를 공유한다.
        scope: gameSaveScope(id),
        // 오프라인이어도 멈추지(paused) 않고 곧바로 시도한다 — 실패하면 아래 onError 가 알린다(2026-10-06).
        // 기본값("online")은 오프라인에서 아무 표시 없이 멈춰 있었다. 타임아웃은 기본 60초 그대로(서버가 RP 계산까지 한다).
        networkMode: "always",
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
            // 끝난 경기의 기기 보관은 더 쓸 일이 없다
            clearStash(boardStorage(), id);

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
        onError: (err: any) => {
            // 실패를 알리고 점수 저장 차단을 되돌린다 — 예전엔 아무 표시 없이 조용히 실패했고,
            // finishedRef 가 그대로 true 라 이후의 진행 점수 저장까지 전부 막혔다
            // (외국 유저 19경기 전원이 playing_base 에 고착된 원인 중 하나).
            finishedRef.current = false;
            // 알림은 점수판 안의 띠가 한다(아래 finishFailure 를 화면이 그린다). 세로로 든 폰에서 점수판은 화면 전체를 덮는 맨 위 상자라
            // (LandscapeGuard — zIndex 9999) 토스트가 그 밑에 깔렸다 — 곧바로 실패해도 화면에는 아무 표시가 없었다(2026-10-06).
            // 점수판을 이미 떠난 뒤에 끝난 실패는 띠를 그릴 곳이 없으니 토스트로 알린다.
            if (mountedRef.current) return;
            toast({
                title: t("gameScoreboard.finishFailTitle"),
                description: finishFailText(err),
                variant: "destructive",
            });
        },
    });

    // 점수 저장이 보내는 것은 '나가는 순간'의 점수판이다(화면에 반영된 최신 상태 — 아래 자동 저장 효과가 적는다).
    // 저장은 한 줄로 서는데(scope), 줄 설 때의 상태를 보내면 그 뒤의 변화마다 저장을 하나씩 더 세워야 한다.
    // 나가는 순간의 최신을 보내면 줄 선 저장은 하나로 충분하다(requestSave).
    const latestStateRef = useRef(gameState);
    /** 안 보낸 변경 있음 — 저장이 실패했고 그 뒤로 성공한 저장이 없다. 다음 변화·online·화면 복귀 때 다시 보낸다. */
    const unsentRef = useRef(false);
    /** 가는 중이거나 줄 선 저장의 수 */
    const savingRef = useRef(0);
    /**
     * 답 없이 끝난 저장이 있었다(시간 초과 · 끊김) — 놓았다고 서버에 안 닿는 것이 아니다. 뒤늦게 닿으면 그 뒤에 보낸 더 새로운 저장을 덮는다
     * (서버의 저장에는 순서 가드가 없다). 그 뒤의 첫 성공만으로는 서버가 최신이라 믿지 않고 한 번 더 보낸다.
     */
    const lateRef = useRef(false);

    /**
     * 기기 보관(2026-10-23 오너: "오프라인 보관" — shared/scoreboardStash). 호스트 기기는 바뀔 때마다 최신 상태를 localStorage 에 적어 둔다.
     * 저장이 실패한 동안 앱이 꺼져도(지하 당구장 · iOS 가 뒤에 둔 앱 정리) 다시 열면 그 점수로 되살리고 서버에 다시 보낸다.
     *  seq: 바뀔 때마다 1 씩 · ackedSeq: 서버가 받았다고 답한 마지막 seq · known: 서버가 지금 가질 수 있는 이 기기의 지문들
     */
    const stashRef = useRef<{ seq: number; ackedSeq: number; known: string[] }>({ seq: 0, ackedSeq: 0, known: [] });
    /** 보내지 못한 변경이 있다 — 하단 바에 '기기에 보관 중'을 띄운다 */
    const [unsaved, setUnsaved] = useState(false);
    /** 열 때 기기에 보관한 점수로 되살렸다 — 점수판이 잠깐 알린다 */
    const [restored, setRestored] = useState(false);
    const persistStash = () => {
        if (!hydratedRef.current || !canSaveRef.current || finishedRef.current) return;
        const r = stashRef.current;
        writeStash(boardStorage(), id, { v: 1, seq: r.seq, ackedSeq: r.ackedSeq, at: Date.now(), state: latestStateRef.current, known: r.known });
    };

    const updateScoreMutation = useMutation({
        // 연타로 여러 PATCH 가 겹치면 늦게 도착한 낮은 점수가 최신 점수를 덮어썼다.
        // 같은 스코프의 뮤테이션은 직렬로 실행되므로 보낸 순서가 그대로 유지된다.
        scope: gameSaveScope(id),
        // 오프라인이어도 멈추지(paused) 않는다 — 멈춘 저장은 같은 줄의 FINISH 를 아무 표시 없이 붙잡았다(2026-10-06 오너 제보).
        // 곧바로 시도해서 실패하면 '안 보낸 변경'으로 적어 두고 다음 기회에 다시 보낸다.
        networkMode: "always",
        mutationFn: async () => {
            const s = latestStateRef.current;
            // 보내기 **전에** 이 상태의 지문을 기억한다 — 답을 못 받아도 서버에 닿았을 수 있다(다시 열 때 '서버가 내 것인가'를 이걸로 본다)
            const seq = stashRef.current.seq;
            stashRef.current.known = withKnown(stashRef.current.known, stateFingerprint(s));
            persistStash();
            await apiRequest(`/api/hiq/game/${id}/score`, {
                method: "PATCH",
                // 응답 없이 매달린 저장이 뒤의 저장·FINISH 를 60초(기본)씩 붙잡지 않게 짧게 놓는다
                timeoutMs: SAVE_TIMEOUT_MS,
                body: {
                    player1Score: s.p1Score,
                    player2Score: s.p2Score,
                    player3Score: s.p3Score,
                    player4Score: s.p4Score,
                    totalInnings: s.innings,
                    player1HighRun: s.p1HighRun,
                    player2HighRun: s.p2HighRun,
                    player3HighRun: s.p3HighRun,
                    player4HighRun: s.p4HighRun,
                    player1Innings: s.p1Innings,
                    player2Innings: s.p2Innings,
                    player3Innings: s.p3Innings,
                    player4Innings: s.p4Innings,
                    // 마무리 진행 — 새로고침해도 "마무리 2/3" 이 남아야 한다
                    finishProgress: {
                        1: s.p1FinishScore, 2: s.p2FinishScore,
                        3: s.p3FinishScore, 4: s.p4FinishScore,
                    },
                    // 초구 — 새로고침해도 누가 먼저 쳤는지 남아야 차례 · 이닝 · 공 색을 되살린다
                    breakPlayer: s.breaker,
                    status: "playing_base"
                },
            });
            return { seq };
        },
        // 저장은 늘 전체 상태를 보낸다 — 가장 나중에 끝난 저장이 성공이면 서버는 최신이다.
        // 단, 답 없이 놓은 저장이 앞에 있었으면(lateRef) 확인 저장을 한 번 더 세우고 그 성공에서 '안 보낸 변경'을 지운다.
        // 점수판이 떠 있고 끝나는 중이 아닐 때만이다 — 떠난 화면의 옛 점수가 다시 들어온 화면의 저장 뒤에 서거나, 줄 선 FINISH 뒤에 진행 중 저장이 서면 안 된다.
        onSuccess: (data) => {
            const again = lateRef.current && mountedRef.current && !finishedRef.current && !endingNow();
            lateRef.current = false;
            if (again) { requestSave(); return; }
            unsentRef.current = false;
            setUnsaved(false);
            // 서버가 받았다 — 이 seq 까지는 기기에서 되살릴 필요가 없다(확인 저장을 다시 세운 경우는 그 저장의 성공에서)
            stashRef.current.ackedSeq = Math.max(stashRef.current.ackedSeq, data?.seq ?? 0);
            persistStash();
        },
        onError: (e) => { console.error(e); unsentRef.current = true; setUnsaved(true); if (isNoAnswer(e)) lateRef.current = true; },
        onSettled: () => { savingRef.current = Math.max(0, savingRef.current - 1); },
    });

    // 저장을 내보내는 길은 여기 하나다(자동 저장 · 언마운트 · 다시 보내기 · 확인 저장). 가는 중 하나 + 줄 선 것 하나면 더 세우지 않는다 —
    // 네트워크가 매달려 있을 때 누른 만큼 쌓이면 FINISH 가 그 수 × 10초를 기다린다. 줄 선 저장이 나갈 때의 최신을 보낸다.
    const requestSave = () => {
        if (!canQueueSave(savingRef.current)) return;
        savingRef.current += 1;
        updateScoreMutation.mutate();
    };

    // Hydrate gameState from the server row once, so a mid-game refresh
    // recovers scores/innings/high-runs instead of showing (and re-saving) zeros.
    useEffect(() => {
        if (hydratedRef.current || !game) return;
        if (game.status === "finished") { clearStash(boardStorage(), id); return; }
        // 회원 확인이 끝나야 호스트인지(기기 보관을 쓸지) 안다 — 늦게 와도 되살리기를 건너뛰지 않게 기다린다
        if (authLoading) return;

        const fromRow = gameStateFromRow(game);
        let base = fromRow;
        const storage = canSaveRef.current ? boardStorage() : null;
        if (storage) {
            const now = Date.now();
            pruneStashes(storage, now);
            const stash = readStash<GameState>(storage, id);
            const back = pickRestore(stash, game as any, now);
            if (back && stash) {
                // 보내지 못한 점수가 기기에 있고 서버는 이 기기가 보냈던 상태 그대로다 — 기기 것으로 되살린다(아래 자동 저장이 곧 서버에 보낸다)
                base = { ...fromRow, ...back };
                stashRef.current = { seq: stash.seq, ackedSeq: stash.ackedSeq, known: [...stash.known] };
                setRestored(true);
            } else {
                stashRef.current = { seq: 0, ackedSeq: 0, known: [rowFingerprint(game as any)] };
                if (stash) clearStash(storage, id);
            }
        }
        resetGameState(base);
        hydratedRef.current = true;
    }, [game, authLoading]);

    // 경기가 서버에서 사라졌으면(다른 기기에서 버림) 기기 보관도 지운다
    useEffect(() => {
        if (error && isGameGone(error)) clearStash(boardStorage(), id);
    }, [error, id]);

    // Auto-save logic — gated on hydration so we never PATCH zeros over saved scores.
    // 예전 조건(innings > 1 || p1Score > 0)은 1이닝 동안 P2~P4 점수를 아예 저장하지 않았고,
    // 되돌리기로 초기 상태가 되면 저장을 건너뛰어 지운 점수가 서버에 그대로 남았다.
    // 하이드레이션 이후에는 무조건 저장하되, 연타 시 요청 폭주를 막으려 디바운스를 건다.
    const pendingSaveRef = useRef(false);
    useEffect(() => {
        latestStateRef.current = gameState;
        if (!hydratedRef.current || !canSaveRef.current) return;
        // 기기 보관 — 바뀐 즉시(디바운스 전에) 적는다. 앱이 꺼지는 것은 400ms 를 기다려 주지 않는다
        if (!finishedRef.current) { stashRef.current.seq += 1; persistStash(); }
        pendingSaveRef.current = true;
        const timer = setTimeout(() => {
            pendingSaveRef.current = false;
            // 대기하는 사이에 경기가 끝났다면 보내지 않는다 — 종료 뒤 도착한 진행 중 저장은
            // 끝난 경기를 다시 playing_base 로 되돌린다.
            if (finishedRef.current || !canSaveRef.current) return;
            requestSave();
        }, 400);
        return () => clearTimeout(timer);
    }, [gameState]);

    // 디바운스 대기 중에 화면을 벗어나면(나가기 등) 마지막 탭이 저장되지 않은 채 사라진다.
    // 언마운트 시 남은 저장을 한 번 밀어 넣는다. 단 종료된 경기는 제외 — finish 뒤에
    // status: "playing_base" PATCH 가 나가면 끝난 경기가 다시 진행 중이 돼버린다.
    // 실패해서 아직 못 보낸 변경(unsentRef)도 남은 저장이다 — 그대로 나가면 다시 들어왔을 때 마지막 점수가 없다.
    useEffect(() => {
        return () => {
            if (!pendingSaveRef.current && !unsentRef.current) return;
            if (finishedRef.current || !canSaveRef.current) return;
            requestSave();
        };
    }, []);

    // 실패한 저장을 잃지 않는다(2026-10-06) — 네트워크가 돌아오거나(online) 화면이 다시 보일 때 최신 상태를 한 번 다시 보낸다.
    // 다음 점수 변화는 위의 자동 저장이 어차피 전체 상태를 보낸다. 타이머로 되풀이하지 않는다 — 다시 보내는 것은 이 두 신호와 변화뿐이다.
    useEffect(() => {
        const resend = () => {
            if (!unsentRef.current || finishedRef.current || !canSaveRef.current) return;
            requestSave();
        };
        const onVisible = () => {
            if (document.visibilityState !== "visible") return;
            // 같은 줄에서 기다리던 요청은 앞의 것이 끝날 때 화면이 가려져 있었으면 깨어나지 않는다(query-core retryer 의 canContinue 가
            // focusManager.isFocused() 를 본다). 라이브러리는 화면이 돌아올 때 깨우지만 온라인일 때만이다(QueryClient.resumePausedMutations) —
            // 오프라인으로 돌아오면 저장·FINISH 가 실패도 못 하고 멈춰 있다. 여기서 직접 깨운다(오프라인이라 멈춘 다른 화면의 요청은 깨어나지 않는다).
            void queryClient.getMutationCache().resumePausedMutations();
            resend();
        };
        window.addEventListener("online", resend);
        document.addEventListener("visibilitychange", onVisible);
        // 들어올 때도 한 번 깨운다 — 앞 화면이 떠나며 세운 저장이, 화면이 가려진 사이 앞의 것이 끝나 못 깨어난 채 이 경기 줄의 맨 앞에 남아 있을 수 있다.
        // 위의 리스너는 앞 화면이 떠날 때 떼어졌다. 남아 있으면 이 화면의 저장·FINISH 가 그 뒤에서 말없이 멈춘다(앞의 것이 아직 가는 중이면 아무 일도 없다).
        void queryClient.getMutationCache().resumePausedMutations();
        return () => {
            window.removeEventListener("online", resend);
            document.removeEventListener("visibilitychange", onVisible);
        };
    }, []);

    // 나가기 = 이 경기 버리기(오너 결정 2026-09-03). 기록·RP 없이 서버에서 행을 지운다.
    // 예전엔 나가도 경기가 "진행 중"으로 남아 배너가 계속 떴고, 없애려면 억지로 점수를 채워
    // FINISH 를 누르는 수밖에 없어 그게 랭킹 기록으로 남았다(유저 제보).
    //
    // 저장·FINISH 와 같은 줄(scope)에 세우지 않는다(2026-10-06 오너 제보: "종료하기 버튼이 안 눌러진다"). 같은 줄이면 앞의 저장이
    // 끝날 때까지 DELETE 가 나가지도 않는다 — 저장 하나가 응답 없이 매달리거나 오프라인으로 멈추면 종료를 눌러도 아무 일이 없었다.
    // 줄 밖이어도 서버에서 안전하다: 지워진 행에 닿은 저장은 404 이고(되살아나지 않는다 — UPDATE 일 뿐이다), 저장이 먼저 닿으면 그 행이 지워진다.
    // FINISH 와는 함께 나가면 안 된다(서버가 대진 칸을 먼저 떼고 지운다) — 그건 화면이 막는다: 둘 중 하나가 가는 동안 다른 쪽 단추는 눌리지 않는다
    // (아래 finishGame · discardGame — 가는 중인지는 캐시에서 읽는다).
    const discardMutation = useMutation({
        mutationKey: gameDiscardKey(id),
        // 오프라인이어도 멈추지 않고 곧바로 시도한다 — 못 지웠으면 못 지웠다고 알린다
        networkMode: "always",
        mutationFn: async () => {
            // 이후의 디바운스 저장·언마운트 플러시가 지운 경기를 되살리지 않게 막는다.
            finishedRef.current = true;
            try {
                return await apiRequest(`/api/hiq/game/${id}`, { method: "DELETE", timeoutMs: DISCARD_TIMEOUT_MS });
            } catch (e) {
                // 이미 없는 경기(앞선 요청이 지우고 답만 못 받았거나, 다른 기기에서 지웠다)는 지워진 것이다.
                // 서버가 그렇게 답한 404 만이다 — 웹의 서비스워커는 네트워크 실패를 본문 없는 404 로 돌려주는데, 그것까지 지워진 것으로 보면
                // 못 지운 경기를 알림도 없이 홈으로 보낸다(배너는 그대로다).
                if (isGameGone(e)) return { discarded: false };
                throw e;
            }
        },
        onSuccess: () => {
            clearStash(boardStorage(), id);
            queryClient.invalidateQueries({ queryKey: ["/api/hiq/game/ongoing/mine"] });
            setLocation("/dashboard");
        },
        onError: (err: any) => {
            // 못 지웠으면 저장 차단을 풀고 그대로 둔다 — 화면은 나가되 배너에서 다시 들어올 수 있다.
            finishedRef.current = false;
            // 서버가 이유를 들어 거절했는가(4xx — 이미 끝난 경기 등). 답을 못 받은 것(끊김 · 시간 초과 · 서비스워커의 가짜 404)과 서버 오류는 아니다.
            const refused = err instanceof ApiError && err.status < 500 && !isNoAnswer(err);
            // 아래 알림이 가리키는 '이어서 하기'가 홈에 있어야 한다 — 방금 만든 경기는 배너의 답이 '없음'이거나 아예 없고(경기 만들기는 그 답을 고치지 않는다),
            // 홈이 새로 받는 답은 같은 네트워크에서 한참 매달린다. 이 경기를 배너의 답으로 넣어 둔다 — 거절당한 경기(이미 끝남 등)는 넣지 않는다.
            // 넣는 일이 '낡음' 표시를 지우므로 표시(아래 줄)보다 먼저 한다.
            if (game && !refused) queryClient.setQueryData(["/api/hiq/game/ongoing/mine"], game);
            // 답을 못 받았을 뿐 서버는 지웠을 수도 있다 — 홈의 '이어서' 배너가 사실대로 보이게 새로 받는다
            queryClient.invalidateQueries({ queryKey: ["/api/hiq/game/ongoing/mine"] });
            // 예전엔 아무 말 없이 홈으로 보냈다 — 지운 줄 알았는데 배너가 그대로였다. 왜 남았는지 알린다.
            // 서버가 이유를 들어 거절한 것은 그 이유를, 그 밖(끊김·시간 초과·서버 오류)은 다시 하는 길을 보여 준다.
            toast({
                title: t("gameScoreboard.exitFailTitle"),
                description: refused ? err.message : t("gameScoreboard.exitFailDesc"),
                variant: "destructive",
            });
            setLocation("/dashboard");
        },
    });

    // 종료 단추·FINISH 를 막는 근거 — 이 화면의 요청만이 아니라 이 경기의 요청을 캐시에서 센다(앞 화면이 남긴 것도 잡힌다).
    const finishBusy = useIsMutating({ mutationKey: gameFinishKey(id) }) > 0;
    const discardBusy = useIsMutating({ mutationKey: gameDiscardKey(id) }) > 0;

    /** FINISH 를 보낸다 — 두 번 눌림과 버리는 중인 경기를 막는다(버리기가 줄 밖으로 나가면서 FINISH 와 겹칠 수 있게 됐다) */
    const finishGame = (variables: { winnerId?: string | null; winnerIndex?: number }) => {
        if (endingNow()) return;
        finishMutation.mutate(variables);
    };
    /** 이 경기를 버린다 — 두 번 눌림과 끝나는 중인 경기를 막는다 */
    const discardGame = () => {
        if (endingNow()) return;
        discardMutation.mutate();
    };
    /** FINISH 가 실패했다 — 점수판 안에 띄울 까닭(없으면 null). 다시 누르거나 닫으면(dismissFinishFailure) 사라진다. */
    const finishFailure = finishMutation.isError ? finishFailText(finishMutation.error) : null;
    const dismissFinishFailure = () => finishMutation.reset();

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
            if (!canSaveRef.current) return; // 관전자 폰은 조용히
            speak(t("tts.gameStart"));
        }, 1000);
        return () => clearTimeout(timer);
    }, []);

    const handleDragEnd = (event: any) => {
        const { active, over } = event;
        // 카드를 목록 밖에 놓으면 over 가 null 이다 — 예전엔 over.id 에서 터졌다(오류 수집 10건, 2026-10-01)
        if (!active || !over) return;
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
            // 상대 카드를 누르면 그 사람에게, '이닝 종료'면 다음 자리로(차례는 자리 번호 순서 — 초구는 시작점만 바꾼다)
            const nextTurn = (targetPlayer ?? nextSlot(prev.currentTurn, totalPlayers)) as Slot;

            const finishedPlayer = prev.currentTurn;
            const run = prev[`p${finishedPlayer}Run` as keyof GameState] as number;
            const inningHistoryKey = `p${finishedPlayer}Innings` as keyof GameState;
            const newHistory = [...(prev[inningHistoryKey] as number[]), run];
            const next = {
                ...prev,
                p1Run: 0,
                p2Run: 0,
                p3Run: 0,
                p4Run: 0,
                currentTurn: nextTurn,
                [inningHistoryKey]: newHistory
            } as GameState;
            // 이닝은 따로 세지 않고 이닝 배열에서 끌어낸다 — 초구가 친 이닝 수 + (초구 차례면 1)(2026-10-23 · shared/scoreboardOrder).
            // 예전 카운터는 '차례가 1번으로 돌아오면 +1' 이라 3 · 4인 경기에서 배열과 어긋날 수 있었다.
            // 상대 카드를 잘못 눌렀다 되돌리면 그 사이의 이닝이 기록되는 것은 같다(2인 경기의 2 → 1 은 정상 넘김과 구별할 수 없다) — 되돌리기(undo)로 고친다.
            next.innings = inningOf([next.p1Innings, next.p2Innings, next.p3Innings, next.p4Innings], prev.breaker ?? 1, nextTurn);
            // '이닝 종료' 단추로 넘길 때 새 이닝이면 부른다(상대 카드로 넘길 때는 handleCardTap 이 이름과 함께 부른다)
            if (!targetPlayer && nextTurn === (prev.breaker ?? 1)) {
                speak(`${t("tts.inningPrefix")}${next.innings}${t("tts.inningSuffix")}`);
            }
            return next;
        });

        playEffect('turn');
    };

    const nameOf = (slot: number): string => {
        const p = slot === 1 ? player1 : slot === 2 ? player2 : slot === 3 ? player3 : player4;
        return p?.name || ((game?.[`player${slot}Name` as keyof HiqGame] as string) ?? "");
    };

    /** 초구를 아직 바꿀 수 있는가 — 아무 일도 없던 판의 호스트만(shared/scoreboardOrder canChooseBreaker) */
    const canChooseBreak = !!game && !spectating && totalPlayers > 1 && canChooseBreaker(gameState, totalPlayers);
    /**
     * 초구 정하기(2026-10-23 오너). 뱅킹으로 정한 선공의 카드에서 '초구로'를 누른다 — 그 자리부터 차례가 돌고, 그 사람이 흰 공이다.
     * 되돌리기 한 번으로 취소된다. 치기 시작하면(점수 · 이닝 기록) 더는 바꾸지 않는다.
     */
    const chooseBreaker = (slot: Slot) => {
        if (!canChooseBreak || slot === gameState.breaker || slot > totalPlayers) return;
        setGameState(prev => ({ ...prev, breaker: slot, currentTurn: slot, innings: 1 }));
        playEffect('turn');
        const name = nameOf(slot);
        speak(name ? `${name}, ${t("tts.breakShot")}` : t("tts.breakShot"));
    };

    const handleCardTap = (playerIndex: 1 | 2 | 3 | 4, zone: "top" | "bottom") => {
        if (!game) return;

        const key = `p${playerIndex}Score` as keyof GameState;
        const targetKey = `player${playerIndex}Target` as keyof HiqGame;
        const target = game[targetKey] as number || 0;
        const currentScore = gameState[key] as number;

        if (gameState.currentTurn !== playerIndex) {
            // 차례가 초구에게 돌아가면 새 이닝이다
            const newInning = playerIndex === (gameState.breaker ?? 1);
            handleTurnChange(playerIndex);
            const pName = nameOf(playerIndex);
            const call = pName ? `${pName}, ${t("tts.yourTurn")}` : "";
            // 경기 모드는 '이닝 종료' 단추가 없어 차례가 여기서만 넘어간다 — 새 이닝이면 이닝 번호도 함께 부른다(2026-10-23).
            // 한 번에 부른다: speak 는 앞의 말을 끊는다.
            if (newInning) speak(`${t("tts.inningPrefix")}${gameState.innings + 1}${t("tts.inningSuffix")}${call ? `, ${call}` : ""}`);
            else if (call) speak(call);
            return;
        }

        // A slot with no target (player{N}Target defaults to 0 — e.g. an unfilled guest slot)
        // has NO win condition. Without the `target > 0` guard, `0 >= 0` was true on the very
        // first tap, instantly finishing the match and crowning that player.
        //
        // zone 가드: 목표에 도달한 뒤에도 하단(감점) 탭은 종료가 아니라 정정이다.
        // 실수로 목표 점수를 만들고 되돌리려 아래를 눌렀다가 경기가 끝나버리면(비가역)
        // 복구할 방법이 없으므로, 종료는 상단 탭일 때만 허용하고 하단은 감점 경로로 흘린다.
        // 마무리 룰 — 목표(알다마)를 채운 뒤 쿠션 N개를 더 성공해야 진짜 끝이다.
        // 설정값(finishTargetCount)은 저장만 되고 점수판이 읽지 않아, 3개로 맞춰 놔도
        // 목표 도달 즉시 FINISH 가 떴다(오너 확인 2026-08-19). 여기서 실제로 세어 준다.
        const finishNeed = game.ruleFinishType !== "none" ? (game.finishTargetCount || 0) : 0;
        const finishKey = `p${playerIndex}FinishScore` as keyof GameState;
        const finishDone = gameState[finishKey] as number;
        const inFinishPhase = target > 0 && currentScore >= target;

        if (inFinishPhase && finishNeed > 0) {
            // 상단 = 마무리 1개 성공. 알다마는 이미 끝났으므로 점수는 올리지 않는다
            // (올리면 분자만 커져 에버리지가 부풀고, 마무리는 종료 조건이지 득점이 아니다).
            if (zone === "top" && finishDone < finishNeed) {
                playEffect('finishing');
                setGameState(prev => ({ ...prev, [finishKey]: (prev[finishKey] as number) + 1 }));
                return;
            }
            // 하단 = 마무리 되돌리기. 되돌릴 마무리가 없을 때만 아래의 감점 경로로 흘려
            // "목표를 잘못 만들었을 때 점수를 내려 복구한다"는 기존 안전장치를 지킨다.
            if (zone === "bottom" && finishDone > 0) {
                setGameState(prev => ({ ...prev, [finishKey]: Math.max(0, (prev[finishKey] as number) - 1) }));
                return;
            }
        }

        // 종료 — 마무리 룰이 있으면 개수를 다 채웠을 때만 허용한다.
        if (zone === "top" && inFinishPhase && (finishNeed === 0 || finishDone >= finishNeed)) {
            playEffect('win');
            let winnerId: string | undefined | null = undefined;
            if (playerIndex === 1) winnerId = game.player1Id;
            else if (playerIndex === 2) winnerId = game.player2Id;
            else if (playerIndex === 3) winnerId = game.player3Id;
            else if (playerIndex === 4) winnerId = game.player4Id;

            // 두 번 눌림(guard against a double-tap firing two finishes)과 버리는 중인 경기는 finishGame 이 막는다
            finishGame({ winnerId: winnerId || undefined, winnerIndex: playerIndex });
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

    /**
     * PBA 뱅크샷 +2(2026-09-24 해외 사용자 문의: "during match scoring don't see an option to mark a point as bank shot").
     * 경기 만들기의 'PBA 룰(2점제/뱅크샷)' 은 저장만 되고 점수판이 읽지 않아, 뱅크샷을 적을 길이 없었다.
     * 뱅크샷 = 빈쿠션(수구가 첫 적구보다 쿠션을 먼저 맞힌 득점), 쿠션 개수 무관, 2점.
     *
     * 한 번의 setGameState 로 +2 — 되돌리기 한 번에 통째로 취소된다(+1 두 번이면 되돌리기도 두 번이다).
     * 목표 도달 이후(마무리·FINISH 단계)에는 쓰지 않는다 — 그때 다음 탭은 종료/마무리 판정이다.
     */
    const handleBankShot = (playerIndex: 1 | 2 | 3 | 4) => {
        if (!game || gameState.currentTurn !== playerIndex) return;
        const key = `p${playerIndex}Score` as keyof GameState;
        const target = (game[`player${playerIndex}Target` as keyof HiqGame] as number) || 0;
        const currentScore = gameState[key] as number;
        if (target > 0 && currentScore >= target) return;

        const runKey = `p${playerIndex}Run` as keyof GameState;
        const highRunKey = `p${playerIndex}HighRun` as keyof GameState;
        const newScore = currentScore + 2;
        const newRun = (gameState[runKey] as number) + 2;
        setGameState(prev => {
            const run = (prev[runKey] as number) + 2;
            return {
                ...prev,
                [key]: (prev[key] as number) + 2,
                [runKey]: run,
                [highRunKey]: Math.max(prev[highRunKey] as number, run),
            };
        });

        if (target > 0 && newScore >= target) {
            playEffect('finishing');
            speak(`${t("tts.bankShot")} ${t("tts.finishingChance")}`);
        } else {
            playEffect('click');
            const remaining = target - newScore;
            speak(target > 0
                ? `${t("tts.bankShot")} ${newRun}${t("tts.scoredSuffix")} ${remaining}${t("tts.remainingSuffix")}`
                : `${t("tts.bankShot")} ${newRun}${t("tts.scoredSuffix")}`);
        }
    };

    return {
        game,
        isLoading,
        error,
        spectating,
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
        handleBankShot,
        finishMutation,
        discardMutation,
        finishGame,
        discardGame,
        finishBusy,
        discardBusy,
        finishFailure,
        dismissFinishFailure,
        canChooseBreak,
        chooseBreaker,
        unsaved,
        restored,
        dismissRestored: () => setRestored(false),
        speak
    };
}
