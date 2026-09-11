import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
    DEFAULT_PAR, MAX_STROKES, isDoubleHole, holeTransactions, settleMatch, rulesFor,
    type CoursePars, type Settlement,
} from "@shared/golfMatch";

export type { Transaction } from "@shared/golfMatch";

/** 파를 모를 때 화면에 채워 두는 배치. 계산 근거로는 쓰지 않는다(parKnown=false). */
export const COURSE_PAR: number[] = [...DEFAULT_PAR];

/**
 * 랭큐매치 한 경기의 상태와 동작.
 *
 * 2026-09-11 정리:
 *  - 정산 식은 shared/golfMatch.ts 로 옮겼다. 서버가 종료 순간 같은 식으로 계산해 못박는다.
 *  - 합계는 '지금 보고 있는 홀까지' 가 아니라 적힌 홀 전부로 센다(이전 홀로 가면 뒤 홀 금액이 사라졌다).
 *  - 경기가 끝나면 방장뿐 아니라 **동반자 화면도** 결과로 넘어간다(예전엔 '방장 대기 중' 에 멈췄다).
 *  - 없는 경기·권한 없음이면 'LOADING MATCH…' 를 영원히 돌리지 않고 error 로 돌려준다.
 */
export function useRankueMatch(matchId: string, me?: any, opts?: { redirectOnFinish?: boolean }) {
    const [, setLocation] = useLocation();
    const { toast } = useToast();

    const [currentHole, setHoleState] = useState(0);
    const [localPlayers, setPlayersState] = useState<any[]>([]);

    // 최신 홀·점수를 ref 로도 들고 다닌다 — 렌더되기 전에 바로 바뀐다.
    // 왜: '다음 홀' 을 빠르게 두 번 누르면 두 번째 탭이 **옛 화면의 홀 번호**로 돌아서, 홀 하나가 빈 채(0타)
    // 넘어갔고 그 라운드는 18홀 미완성이라 기록되지 않았다(2026-09-11 실측).
    const holeRef = useRef(0);
    const playersRef = useRef<any[]>([]);
    // 방장이 처음 들어왔을 때 한 번만 서버의 진행 홀로 맞춘다(1번 홀로 고치러 가 있으면 끌려가지 않게).
    const seededRef = useRef(false);
    const setCurrentHole = useCallback((v: number | ((prev: number) => number)) => {
        const next = typeof v === "function" ? v(holeRef.current) : v;
        holeRef.current = next;
        setHoleState(next);
    }, []);
    const setLocalPlayers = useCallback((v: any[] | ((prev: any[]) => any[])) => {
        const next = typeof v === "function" ? v(playersRef.current) : v;
        playersRef.current = next;
        setPlayersState(next);
    }, []);

    const queryKey = [`/api/hiq/golf/match/${matchId}`];

    const { data: session, isLoading, error } = useQuery<any>({
        queryKey,
        enabled: !!matchId,
        // 404·403 은 다시 물어도 같다.
        retry: (count, err: any) => (err?.status ?? 500) >= 500 && count < 2,
        refetchInterval: (query) => {
            // 없는 경기·권한 없음(4xx)만 멈춘다. 네트워크가 잠깐 끊긴 건 계속 물어야 동반자 화면이 다시 따라온다
            // (예전엔 한 번 실패하면 폴링이 영영 멈췄다).
            const st = (query.state.error as any)?.status;
            if (st >= 400 && st < 500) return false;
            const data = query.state.data;
            if (!data) return 3000;
            if (data.status === "finished" || data.status === "abandoned") return false;
            if (data.status === "waiting") return 2000; // 누가 들어오는지, 방장이 시작했는지
            if (!me) return 3000;
            // 진행 중엔 방장이 쓰는 사람이라 물을 게 없다. 동반자는 방장의 저장을 따라간다.
            return data.hostId === me.id ? false : 2000;
        },
        refetchOnWindowFocus: true,
    });

    const isHost = !!session && !!me && session.hostId === me.id;

    const coursePar: number[] = useMemo(
        () => (Array.isArray(session?.pars) && session.pars.length === 18 ? session.pars : COURSE_PAR),
        [session?.pars],
    );
    const parKnown: boolean[] = useMemo(
        () => (Array.isArray(session?.parKnown) && session.parKnown.length === 18 ? session.parKnown : new Array(18).fill(false)),
        [session?.parKnown],
    );
    const cp: CoursePars = useMemo(() => ({ pars: coursePar, known: parKnown }), [coursePar, parKnown]);
    const rules = useMemo(() => rulesFor(session?.gameMode, session ?? {}), [session?.gameMode, session?.stake, session?.useDouble, session?.doublingMode, session?.birdieAmount, session?.eagleAmount]);
    const hasStakes = rules.stake > 0 || rules.birdieAmount > 0 || rules.eagleAmount > 0;

    // 동반자가 방장을 따라간 마지막 홀. 폴링마다 방장 홀로 끌려가지 않게(이전 홀을 볼 수 있게) 기억한다.
    const lastFollowedHoleRef = useRef<number | null>(null);

    useEffect(() => {
        if (!session) return;
        if (!isHost) {
            setLocalPlayers(session.players || []);
            if (session.currentHole && lastFollowedHoleRef.current !== session.currentHole) {
                lastFollowedHoleRef.current = session.currentHole;
                setCurrentHole(Math.min(17, Math.max(0, session.currentHole - 1)));
            }
            return;
        }
        // 방장은 localPlayers 가 편집 원본이다. 처음 한 번 채우고, 그 뒤엔 새로 들어온 사람만 붙인다
        // (늦게 온 동반자). 폴링 값으로 덮으면 아직 저장 안 한 입력이 날아간다.
        setLocalPlayers((prev) => {
            const server: any[] = session.players || [];
            if (prev.length === 0) return server;
            const known = new Set(prev.map((p) => p.memberId));
            const added = server.filter((p) => !known.has(p.memberId));
            return added.length ? [...prev, ...added] : prev;
        });
        if (!seededRef.current) {
            seededRef.current = true;
            if (session.currentHole > 1) setCurrentHole(Math.min(17, session.currentHole - 1));
        }
    }, [session?.currentHole, session?.id, session?.players, isHost]);

    // 끝난 경기는 누구의 화면이든 결과로 보낸다.
    useEffect(() => {
        if (opts?.redirectOnFinish && session?.status === "finished") {
            // replace: 결과에서 뒤로 가면 끝난 점수판으로 돌아와 다시 결과로 튕기는 고리가 생겼다.
            setLocation(`/golf/game/${matchId}/result`, { replace: true });
        }
    }, [opts?.redirectOnFinish, session?.status, matchId, setLocation]);

    const updateScoreMutation = useMutation({
        mutationFn: async ({ holeNo, players }: { holeNo: number; players: any[] }) => {
            return await apiRequest(`/api/hiq/golf/match/${matchId}/score`, {
                method: "POST",
                // 서버는 방에 이미 있는 사람의 점수·벌타 칸만 받는다. 이름 같은 건 보내지 않는다.
                body: { holeNo, players: players.map((p) => ({ memberId: p.memberId, scores: p.scores, penalties: p.penalties })) },
            });
        },
        onMutate: async (vars) => {
            await queryClient.cancelQueries({ queryKey });
            const previousSession = queryClient.getQueryData(queryKey);
            queryClient.setQueryData(queryKey, (old: any) => (old ? { ...old, players: vars.players, currentHole: vars.holeNo } : old));
            return { previousSession };
        },
        onError: (err: any, _vars, context: any) => {
            if (context?.previousSession) queryClient.setQueryData(queryKey, context.previousSession);
            toast({ variant: "destructive", title: "점수를 저장하지 못했어요", description: err?.message || "연결을 확인하고 다시 눌러 주세요." });
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey }),
    });

    // isPending 은 한 박자 늦게 바뀐다 — 같은 틱의 두 번 탭은 ref 로 막는다.
    const finishingRef = useRef(false);
    const finishMatchMutation = useMutation({
        mutationFn: async () => apiRequest(`/api/hiq/golf/match/${matchId}/finish`, { method: "POST" }),
        onSuccess: (data: any) => {
            queryClient.setQueryData(queryKey, data);
            queryClient.invalidateQueries({ queryKey: ["/api/hiq/history", { sport: "GOLF" }] });
            queryClient.invalidateQueries({ queryKey: ["/api/hiq/golf/passport-stats"] });
            queryClient.invalidateQueries({ queryKey: ["/api/hiq/golf/match/active"] });
            queryClient.invalidateQueries({ queryKey: ["/api/hiq/me"] });
            setLocation(`/golf/game/${matchId}/result`, { replace: true });
        },
        onError: (err: any) => {
            finishingRef.current = false;
            toast({ variant: "destructive", title: "라운드를 끝내지 못했어요", description: err?.message || "다시 눌러 주세요." });
        },
    });

    const abandonMutation = useMutation({
        mutationFn: async () => apiRequest(`/api/hiq/golf/match/${matchId}/abandon`, { method: "POST" }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/hiq/golf/match/active"] });
            toast({ title: "경기를 접었어요", description: "기록은 남지 않아요." });
            setLocation("/dashboard");
        },
        onError: (err: any) => toast({ variant: "destructive", title: "경기를 접지 못했어요", description: err?.message }),
    });

    const updateCourseMutation = useMutation({
        mutationFn: async (data: { frontCourseName?: string; backCourseName?: string }) =>
            apiRequest(`/api/hiq/golf/match/${matchId}/course`, { method: "POST", body: data }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey });
            toast({ title: "코스를 바꿨어요" });
        },
        onError: (err: any) => toast({ variant: "destructive", title: "코스를 바꾸지 못했어요", description: err?.message }),
    });

    const handleScoreChange = (memberId: string, diff: number) => {
        if (!session) return;
        const h = holeRef.current;
        setLocalPlayers((prev) => prev.map((p: any) => {
            if (p.memberId !== memberId) return p;
            const scores = p.scores || Array(18).fill(0);
            const cur = scores[h] || coursePar[h];
            const next = [...scores];
            next[h] = Math.min(MAX_STROKES, Math.max(1, cur + diff));
            return { ...p, scores: next };
        }));
    };

    const saveCurrentHoleScores = async (holeIndex?: number, playersOverride?: any[]) => {
        const targetHole = (holeIndex !== undefined ? holeIndex : holeRef.current) + 1;
        return updateScoreMutation.mutateAsync({ holeNo: targetHole, players: playersOverride || playersRef.current });
    };

    const handlePenaltyChange = (memberId: string, type: "ob" | "hazard" | "bunk" | "putt3") => {
        if (!session) return;
        const h = holeRef.current;
        setLocalPlayers((prev) => prev.map((p: any) => {
            if (p.memberId !== memberId) return p;
            const pens = p.penalties || Array(18).fill({});
            const cur = pens[h] || { ob: false, hazard: false, bunk: false, putt3: false };
            const next = [...pens];
            next[h] = { ...cur, [type]: !cur[type] };
            return { ...p, penalties: next };
        }));
    };

    /** 안 건드린 선수의 이번 홀을 파로 채운다 — 화면이 이미 파를 보여 주고 있던 값이다. */
    const autoFillCurrentHole = (): any[] => {
        if (!session) return playersRef.current;
        const h = holeRef.current;
        const filled = playersRef.current.map((p: any) => {
            const scores = p.scores || Array(18).fill(0);
            if (scores[h]) return p;
            const next = [...scores];
            next[h] = coursePar[h];
            return { ...p, scores: next };
        });
        setLocalPlayers(filled);
        return filled;
    };

    const money: Settlement = useMemo(
        () => (session ? settleMatch(localPlayers, cp, rules) : { totals: {}, transactions: [] }),
        [session, localPlayers, cp, rules],
    );

    return {
        session,
        isLoading,
        error: error as any,
        currentHole,
        /** 렌더를 기다리지 않은 지금 홀(연타·비동기 처리 안에서 쓴다) */
        currentHoleNow: () => holeRef.current,
        setCurrentHole,
        localPlayers,
        coursePar,
        parKnown,
        rules,
        hasStakes,
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
        abandonMatch: () => abandonMutation.mutate(),
        isAbandoning: abandonMutation.isPending,
        moneyResults: money.totals,
        moneyTransactions: money.transactions,
        isCurrentHoleDouble: session ? isDoubleHole(currentHole, localPlayers, cp, rules) : false,
        isHost,
        updateCourse: (data: { frontCourseName?: string; backCourseName?: string }) => updateCourseMutation.mutate(data),
        getHoleSettlement: (holeIdx: number, playersOverride?: any[]) =>
            session ? holeTransactions(holeIdx, playersOverride || localPlayers, cp, rules) : [],
    };
}
