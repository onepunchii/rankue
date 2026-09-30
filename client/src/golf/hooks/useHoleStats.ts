/**
 * '이 홀 기록'(2026-10-01 오너 승인) — 경기 화면의 내 퍼팅·페어웨이·벌타 태그, 라운딩 리포트의 통계 재료.
 * 규칙은 shared/golfHoleStats.ts, 저장은 POST /api/hiq/golf/match/:id/hole-stats(참가자가 **자기 칸만**).
 *
 * 저장 방식 — 누를 때마다 바로 보낸다(타이머 없음):
 *  - 요청은 한 줄로만 간다. 보내는 중에 또 누르면 끝난 뒤 한 번 더 — 늦게 도착한 옛 값이 새 값을 덮지 않는다.
 *  - 보내는 건 **바뀐 홀만**, 그 홀을 통째로(교체라 두 번 가도 같다).
 *  - 실패하면 그 홀을 '안 보냄'으로 남겨 두고 다음 누름·홀 이동·다시 연결될 때 다시 보낸다. 화면을 떠날 때도 남은 걸 보낸다
 *    (서버가 끝난 경기도 30분은 받는다 — 18번 홀 퍼팅을 누르자마자 방장이 끝내기를 누른 경우).
 * 화면의 원본은 이 훅의 상태다(서버 값으로 한 번만 채운다). 내 기록은 나만 쓰니 폴링으로 덮을 일이 없다.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import {
    PENALTY_TAGS, applyHolePatches, blankHoleStats, holeEntry, isPenaltyTag,
    type HoleEntry, type HoleStats, type LastTime, type PenaltyTag, type RoundHoleData, type Fairway,
} from "@shared/golfHoleStats";

export const HOLE_STATS_KEY = "golf-hole-stats";
/**
 * 키 끝에 보는 사람 id 와 판(v1) — 응답이 사람마다 다르고(내 기록만), 캐시는 localStorage 에 7일 남아
 * 한 폰에서 계정을 바꾸면 앞사람 기록이 뜰 뻔했다(photoApi 와 같은 이유). URL 에 붙지 않게 queryFn 을 직접 준다.
 */
export const holeStatsKeys = {
    match: (sessionId: string, viewer: string, front: string, back: string) => [HOLE_STATS_KEY, "match", sessionId, viewer, front, back, "v1"] as const,
    mine: (viewer: string) => [HOLE_STATS_KEY, "mine", viewer, "v1"] as const,
};

export interface HoleStatsView { mine: HoleStats | null; lastTime: (LastTime | null)[] }

export function useHoleStats(sessionId: string, opts: { enabled: boolean; front: string | null; back: string | null; hole: number }) {
    const qc = useQueryClient();
    const { toast } = useToast();
    const viewer = useAuth().member?.id ?? "guest";
    const url = `/api/hiq/golf/match/${sessionId}/hole-stats`;
    const key = holeStatsKeys.match(sessionId, viewer, opts.front ?? "", opts.back ?? "");
    const q = useQuery<HoleStatsView>({
        queryKey: key,
        queryFn: () => apiRequest(url),
        enabled: opts.enabled && !!sessionId && viewer !== "guest",
        staleTime: 60_000,
        // 코스(전반·후반)를 바꾸면 키가 바뀐다 — 새 '지난번'을 받는 동안 옛 것을 비우지 않는다
        placeholderData: (prev) => prev,
        retry: (n, e: any) => (e?.status ?? 500) >= 500 && n < 1,
    });

    const [stats, setStats] = useState<HoleStats>(blankHoleStats);
    const statsRef = useRef(stats);
    const seeded = useRef(false);
    /** 아직 서버에 안 간 홀 → 판 번호(보내는 사이에 또 바뀌면 판이 올라가 한 번 더 보낸다) */
    const dirty = useRef(new Map<number, number>());
    const ver = useRef(0);
    const inflight = useRef(false);
    const warnedAt = useRef(0);
    const keyRef = useRef(key);
    keyRef.current = key;

    // 서버 값으로 한 번 채운다. 받기 전에 누른 홀은 누른 값을 둔다.
    useEffect(() => {
        const server = q.data?.mine;
        if (!server || seeded.current) return;
        seeded.current = true;
        const local = statsRef.current;
        const next: HoleStats = {
            putts: server.putts.map((v, h) => (dirty.current.has(h) ? local.putts[h] : v)),
            fairway: server.fairway.map((v, h) => (dirty.current.has(h) ? local.fairway[h] : v)),
            penaltyTags: server.penaltyTags.map((v, h) => (dirty.current.has(h) ? local.penaltyTags[h] : v)),
        };
        statsRef.current = next;
        setStats(next);
    }, [q.data]);

    const flush = useCallback(async () => {
        if (inflight.current || !sessionId || dirty.current.size === 0) return;
        inflight.current = true;
        try {
            while (dirty.current.size > 0) {
                const batch = [...dirty.current.entries()];
                const holes = batch.map(([h]) => ({ holeNo: h + 1, ...holeEntry(statsRef.current, h) }));
                const done = () => { for (const [h, v] of batch) if (dirty.current.get(h) === v) dirty.current.delete(h); };
                try {
                    const r: { mine: HoleStats } = await apiRequest(url, { method: "POST", body: { holes } });
                    done();
                    // 저장 캐시(7일)도 새 값으로 — 앱을 다시 열면 이 값이 먼저 그려진다
                    qc.setQueryData<HoleStatsView>(keyRef.current, (old) => (old ? { ...old, mine: r.mine } : old));
                } catch (e: any) {
                    const st = Number(e?.status ?? 0);
                    if (st >= 400 && st < 500 && st !== 408 && st !== 429) {
                        // 다시 보내도 같은 답(끝난 지 오래·형식·권한) — 붙들고 있지 않는다
                        done();
                        if (st === 409) toast({ title: e?.message || "이 홀 기록을 저장하지 못했어요" });
                    } else if (Date.now() - warnedAt.current > 20_000) {
                        warnedAt.current = Date.now();
                        toast({ variant: "destructive", title: "이 홀 기록을 저장하지 못했어요", description: "연결되면 다시 보낼게요" });
                    }
                    break;
                }
            }
        } finally {
            inflight.current = false;
        }
    }, [sessionId, url, qc, toast]);
    const flushRef = useRef(flush);
    flushRef.current = flush;

    // 못 보낸 게 남았으면: 홀을 옮길 때·다시 연결될 때 다시. 화면을 떠날 때도(요청은 화면이 없어도 끝까지 간다).
    useEffect(() => { void flushRef.current(); }, [opts.hole]);
    useEffect(() => {
        const onOnline = () => { void flushRef.current(); };
        window.addEventListener("online", onOnline);
        return () => {
            window.removeEventListener("online", onOnline);
            void flushRef.current();
        };
    }, []);

    const update = useCallback((h: number, patch: Partial<HoleEntry>) => {
        if (h < 0 || h > 17) return;
        const cur = holeEntry(statsRef.current, h);
        const next = applyHolePatches(statsRef.current, [{ holeNo: h + 1, ...cur, ...patch }]);
        statsRef.current = next;
        setStats(next);
        dirty.current.set(h, ++ver.current);
        void flushRef.current();
    }, []);

    // 비교는 렌더 값이 아니라 ref 로 — 한 박자 안의 두 번 탭이 옛 화면 값과 견줘 '지우기'를 두 번 하지 않게
    return {
        stats,
        entry: (h: number) => holeEntry(stats, h),
        lastTime: q.data?.lastTime ?? null,
        /** 같은 값을 다시 누르면 지운다 */
        setPutts: (h: number, v: number | null) => update(h, { putts: statsRef.current.putts[h] === v ? null : v }),
        setFairway: (h: number, v: Fairway | null) => update(h, { fairway: statsRef.current.fairway[h] === v ? null : v }),
        /** 켜고 끄기(여럿 가능). 순서는 서버와 같게(OB·해저드·벙커) */
        toggleTag: (h: number, tag: PenaltyTag) => {
            if (!isPenaltyTag(tag)) return;
            const cur = statsRef.current.penaltyTags[h] ?? [];
            const on = cur.includes(tag) ? cur.filter((t) => t !== tag) : [...cur, tag];
            update(h, { penaltyTags: PENALTY_TAGS.filter((t) => on.includes(t)) });
        },
    };
}

/** 라운딩 리포트·기록 상세 — 내 공식 라운드 중 이 홀 기록을 적은 것(없으면 빈 배열) */
export function useMyHoleStatsRounds(enabled = true) {
    const viewer = useAuth().member?.id ?? "guest";
    return useQuery<{ rounds: RoundHoleData[] }>({
        queryKey: holeStatsKeys.mine(viewer),
        queryFn: () => apiRequest("/api/hiq/golf/hole-stats/mine"),
        enabled: enabled && viewer !== "guest",
        staleTime: 60_000,
        retry: (n, e: any) => (e?.status ?? 500) >= 500 && n < 1,
    });
}
