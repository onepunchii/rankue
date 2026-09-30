/**
 * 현장 인증 도장 — 경기 화면·결과 화면의 위치 확인(2026-09-30 오너 결정). 규칙은 shared/golfOnSite.ts.
 *
 * 라운드 중 몇 번만 확인한다: 시작(여기서만 권한을 묻는다 — 이 경기에 한 번) · 9번 홀 · 18번 홀 · 끝내기 직전.
 *  - 이미 인증됐으면(내 폰이든 동반자 폰이든 — 동반자 규칙) 더 확인하지 않는다.
 *  - 권한을 거부했으면 다시 묻지 않는다. 칩이 한 줄로 이유를 말하고, 칩을 누를 때만 다시 확인한다.
 *  - 좌표는 서버로 보내 거리만 재고 버린다(본문으로만 — 주소에 실으면 요청 로그에 남는다).
 *  - 끝낸 뒤 30분 안(결과 화면)에는 한 번 더 조용히 확인한다 — 방장이 끝낸 직후의 동반자 폰, 느린 GPS.
 * 위치를 얻는 길은 하나(hooks/useNativeBridge getDevicePosition — 새 앱은 네이티브 플러그인, 옛 앱·웹은 브라우저).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { getDevicePosition, type PositionResult } from "@/hooks/useNativeBridge";
import type { CheckinReason, OnSiteBucket, OnSiteSource, OnSiteSummary } from "@shared/golfOnSite";
import { FOOTPRINTS_KEY } from "../components/passport/useFootprints";

/** v1 — 응답 모양이 바뀌면 올린다(저장 캐시가 옛 모양을 먼저 그리지 않게). URL 에 붙지 않도록 queryFn 을 직접 준다. */
export const onSiteKey = (matchId: string) => [`/api/hiq/golf/match/${matchId}/checkin`, "v1"] as const;

type Why = "far" | "coarse" | "denied" | "unavailable" | "prompt" | "error";
export type OnSiteView =
    | { kind: "checking" }
    | { kind: "verified"; byCompanion: boolean }
    | { kind: "unverified"; why: Why }
    | { kind: "no-course" };

type PostResult = OnSiteSummary & { last?: { verified: boolean; bucket: OnSiteBucket; reason: CheckinReason } | null; upgraded?: boolean };

/** 도장 수가 바뀌었을 수 있는 화면들 — 여권·발자국·라운딩 리포트 */
export function invalidateStampViews(qc: QueryClient) {
    qc.invalidateQueries({ queryKey: ["/api/hiq/golf/passport-stats"] });
    qc.invalidateQueries({ queryKey: [FOOTPRINTS_KEY] });
    qc.invalidateQueries({ queryKey: ["/api/hiq/history", { sport: "GOLF" }] });
}

const askedKey = (matchId: string) => `rankue_onsite_asked_${matchId}`;
const wasAsked = (matchId: string) => { try { return sessionStorage.getItem(askedKey(matchId)) === "1"; } catch { return false; } };
const markAsked = (matchId: string) => { try { sessionStorage.setItem(askedKey(matchId), "1"); } catch { /* 저장소를 못 쓰는 환경 */ } };

export function useOnSiteCheckin(matchId: string | undefined, opts: { enabled: boolean; hole?: number | null }) {
    const qc = useQueryClient();
    const id = matchId ?? "";
    const url = `/api/hiq/golf/match/${id}/checkin`;
    const summaryQ = useQuery<OnSiteSummary>({
        queryKey: onSiteKey(id),
        queryFn: () => apiRequest(url),
        enabled: !!matchId && opts.enabled,
        staleTime: 30_000,
        // 동반자 폰의 인증이 내 칩에도 늦게라도 보이게 — 인증되면 멈춘다(진행 중일 때만)
        refetchInterval: (q) => (q.state.data && !q.state.data.verified && q.state.data.status === "playing" ? 60_000 : false),
        retry: (n, e: any) => (e?.status ?? 500) >= 500 && n < 1,
    });
    const summary = summaryQ.data;

    const [local, setLocal] = useState<{ busy: boolean; why?: Why; manual?: number }>({ busy: false });
    const running = useRef<Promise<PostResult | null> | null>(null);
    const sent = useRef(new Set<string>());
    /** 이 화면에서 위치를 한 번 받았다 — 그 뒤로는 권한 창이 안 뜨니 조용한 확인도 그대로 부른다(옛 사파리는 권한 상태를 안 알려 준다) */
    const granted = useRef(false);

    const run = useCallback(async (source: OnSiteSource, how: "ask" | "silent", quick = false): Promise<PostResult | null> => {
        if (!id) return null;
        if (running.current) return running.current;
        const p = (async (): Promise<PostResult | null> => {
            setLocal((l) => ({ ...l, busy: true }));
            if (how === "ask") markAsked(id);
            try {
                const prompt = how === "ask" || granted.current;
                // 끝내기 직전은 기다리지 않는다 — 방금 받은 위치(10분 안)면 된다. 그 밖엔 GPS 로 또렷하게(야외라 금방 잡힌다).
                let r: PositionResult = quick
                    ? await getDevicePosition({ prompt, highAccuracy: false, timeoutMs: 4000, maximumAgeMs: 600_000 })
                    : await getDevicePosition({ prompt, highAccuracy: true, timeoutMs: 10_000, maximumAgeMs: 60_000 });
                // GPS 가 제시간에 못 잡으면(클럽하우스 안 등) 대략 위치로 한 번 더
                if (r.status === "unavailable" && !quick) r = await getDevicePosition({ prompt, highAccuracy: false, timeoutMs: 8000, maximumAgeMs: 600_000 });
                if (r.status === "prompt") { setLocal((l) => ({ ...l, busy: false, why: "prompt" })); return null; }
                if (r.status === "granted") granted.current = true;
                const body = r.status === "granted"
                    ? { lat: r.fix.lat, lng: r.fix.lng, accuracy: r.fix.accuracy, source }
                    : { fix: r.status, source };
                const res: PostResult = await apiRequest(url, { method: "POST", body });
                qc.setQueryData(onSiteKey(id), res);
                if (res.upgraded) invalidateStampViews(qc);
                const why: Why | undefined = r.status !== "granted" ? r.status
                    : res.last?.reason === "coarse" ? "coarse" : res.last?.reason === "far" ? "far" : undefined;
                setLocal((l) => ({ ...l, busy: false, why }));
                return res;
            } catch {
                setLocal((l) => ({ ...l, busy: false, why: "error" }));
                return null;
            } finally {
                running.current = null;
            }
        })();
        running.current = p;
        return p;
    }, [id, url, qc]);

    const live = !!summary && summary.status === "playing" && !summary.verified && summary.courseKnown;

    // 시작 — 경기 화면이 열리면 한 번. 권한은 이 경기에 한 번만 묻는다(다시 들어오면 조용히).
    useEffect(() => {
        if (!opts.enabled || !live || sent.current.has("start")) return;
        sent.current.add("start");
        void run("start", wasAsked(id) ? "silent" : "ask");
    }, [opts.enabled, live, id, run]);

    // 9번·18번 홀 — 조용히(권한을 이미 받았을 때만 실제로 위치를 잡는다)
    useEffect(() => {
        if (!opts.enabled || !live) return;
        const src: OnSiteSource | null = opts.hole === 8 ? "hole9" : opts.hole === 17 ? "hole18" : null;
        if (!src || sent.current.has(src)) return;
        sent.current.add(src);
        void run(src, "silent");
    }, [opts.enabled, live, opts.hole, run]);

    // 끝난 뒤(결과 화면) — 기록 도장이고 아직 다시 확인할 수 있으면 조용히 한 번
    useEffect(() => {
        if (!opts.enabled || !summary || summary.status !== "finished" || summary.stamp !== "record" || !summary.retryUntil) return;
        if (sent.current.has("result")) return;
        sent.current.add("result");
        void run("result", "silent", true);
    }, [opts.enabled, summary, run]);

    /** 칩·결과 화면의 '다시 확인' — 권한 창을 다시 띄울 수 있는 유일한 길 */
    const retry = useCallback(() => {
        setLocal((l) => ({ ...l, manual: Date.now() }));
        const s = qc.getQueryData<OnSiteSummary>(onSiteKey(id));
        return run(s?.status === "finished" ? "result" : "retry", "ask");
    }, [id, qc, run]);

    /** 끝내기 직전 한 번 — 이미 인증됐거나 좌표 없는 골프장이면 건너뛴다. 끝내기를 5초 넘게 붙잡지 않는다(늦은 확인은 서버가 30분 유예로 받는다). */
    const beforeFinish = useCallback(async () => {
        const s = qc.getQueryData<OnSiteSummary>(onSiteKey(id));
        if (!s || s.verified || !s.courseKnown) return;
        await Promise.race([run("finish", "silent", true), new Promise((r) => setTimeout(r, 5000))]);
    }, [id, qc, run]);

    const view = useMemo<OnSiteView>(() => {
        if (!summary) return { kind: "checking" };
        if (summary.verified) return { kind: "verified", byCompanion: summary.byCompanion };
        if (!summary.courseKnown) return { kind: "no-course" };
        if (local.busy) return { kind: "checking" };
        if (local.why) return { kind: "unverified", why: local.why };
        // 이 화면에서 아직 확인 전 — 전에 남긴 내 확인이 있으면 그걸로, 없으면 확인 중(시작 확인이 곧 돈다)
        if (!summary.mine) return summaryQ.isError ? { kind: "unverified", why: "error" } : { kind: "checking" };
        return { kind: "unverified", why: summary.mine.bucket === "no-fix" ? "unavailable" : "far" };
    }, [summary, local.busy, local.why, summaryQ.isError]);

    return { summary, view, retry, beforeFinish, manualAt: local.manual ?? 0, busy: local.busy };
}
