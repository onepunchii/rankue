/**
 * 산행 중 '길 띠'의 위치 받기(2026-10-13) — 켜 둔 동안 몇 초마다 지금 위치를 한 번씩 받아 길 위의 자리를 잰다(shared/hikingTrail).
 *
 * 지금 앱은 화면이 켜져 있을 때만 위치를 본다(백그라운드 위치를 요청하지 않는다 — hooks/useNativeBridge.getDevicePosition 한 길로만).
 * 화면이 가려져 있으면 받지 않는다. **위치는 여기서만 쓰고 어디에도 보내지 않는다** — 서버에 가는 것은 마친 뒤의 요약(시간 · 거리 · 오른 높이)뿐.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { getDevicePosition } from "@/hooks/useNativeBridge";
import type { LinePoint } from "@shared/hikingGeo";
import { emptyTally, tallyStep, trailState, type TrailPoi, type TrailState, type TripTally } from "@shared/hikingTrail";

/** 내 산행 목록(GET /api/hiq/hiking/me/trips) */
export const MY_TRIPS_KEY = ["/api/hiq/hiking/me/trips"] as const;
export interface MyTrip { id: string; mountainId: string; courseId: string | null; startedAt: string; endedAt: string; km: number; gainM: number; reachedSummit: boolean }
/** 산행 화면의 주소 — 코스를 골라 들어오면 ?c=<코스 id> */
export const trailPath = (slug: string, courseId?: string | null) => `/hiking/trail/${encodeURIComponent(slug)}${courseId ? `?c=${encodeURIComponent(courseId)}` : ""}`;

/** 위치를 받는 간격(ms) */
const POLL_MS = 6000;
/** locating = 첫 위치를 기다리는 중 · on = 받고 있다 · denied = 위치 권한이 꺼져 있다 · lost = 받다가 끊겼다 */
export type TrailPhase = "idle" | "locating" | "on" | "denied" | "lost";

/**
 * 산행 중인 것을 기기에 적어 둔다 — 잘못 눌러 화면을 떠나거나 앱이 다시 떠도 이어서 걷게. 좌표는 적지 않는다(길 위의 거리 · 높이 · 쌓은 값뿐).
 * 하루가 지난 것은 버린다.
 */
const KEEP_MS = 24 * 3_600_000;
const storeKey = (mountainId: string) => `rankue_hk_trail:${mountainId}`;
interface Kept { startedAt: number; courseId: string | null; tally?: TripTally; prev?: { km: number; dir: 1 | -1 } | null; reached?: boolean }
export function readKeptTrail(mountainId: string): Kept | null {
    try {
        const v = JSON.parse(localStorage.getItem(storeKey(mountainId)) ?? "null") as Kept | null;
        return v && Number.isFinite(v.startedAt) && Date.now() - v.startedAt < KEEP_MS ? v : null;
    } catch { return null; }
}
export function keepTrail(mountainId: string, patch: Partial<Kept> & { startedAt?: number }): void {
    try {
        const cur = readKeptTrail(mountainId);
        const next = { ...(cur ?? {}), ...patch };
        if (Number.isFinite(next.startedAt)) localStorage.setItem(storeKey(mountainId), JSON.stringify(next));
    } catch { /* 저장소를 못 쓰는 환경 — 이어 걷기만 안 된다 */ }
}
export function dropKeptTrail(mountainId: string): void {
    try { localStorage.removeItem(storeKey(mountainId)); } catch { /* */ }
}

export function useTrail({ active, line, pois, summitKm, summit, kinds, keepId }: {
    /** 이 산의 id — 주면 쌓은 값을 기기에 적어 두고 이어서 쌓는다 */
    keepId?: string | null;
    active: boolean;
    line: readonly LinePoint[];
    pois: readonly TrailPoi[];
    summitKm: number | null;
    summit: { lat: number; lng: number } | null;
    kinds?: readonly string[];
}) {
    const [state, setState] = useState<TrailState | null>(null);
    const [phase, setPhase] = useState<TrailPhase>("idle");
    const [accuracy, setAccuracy] = useState<number | null>(null);
    const prev = useRef<{ km: number; dir: 1 | -1 } | null>(null);
    const tally = useRef<TripTally>(emptyTally());
    const reached = useRef(false);
    // 바뀌는 값은 ref 로 — 받는 고리를 다시 걸지 않는다
    const input = useRef({ line, pois, summitKm, summit, kinds });
    input.current = { line, pois, summitKm, summit, kinds };

    useEffect(() => {
        if (!active) { setPhase("idle"); return; }
        let stop = false, first = true;
        let timer: ReturnType<typeof setTimeout> | undefined;
        // 이어 걷는 산행이면 쌓아 둔 값에서 시작한다
        const kept = keepId ? readKeptTrail(keepId) : null;
        prev.current = kept?.prev ?? null; tally.current = kept?.tally ?? emptyTally(); reached.current = !!kept?.reached;
        setState(null); setPhase("locating");
        const tick = async () => {
            if (stop) return;
            if (document.visibilityState === "visible") {
                const r = await getDevicePosition({ prompt: first, highAccuracy: true, timeoutMs: 12000, maximumAgeMs: 4000 });
                first = false;
                if (stop) return;
                if (r.status === "granted") {
                    const s = trailState({ ...input.current, fix: r.fix, prev: prev.current });
                    if (s) {
                        prev.current = { km: s.km, dir: s.dir };
                        tally.current = tallyStep(tally.current, s);
                        if (s.nearSummit) reached.current = true;
                        if (keepId) keepTrail(keepId, { tally: tally.current, prev: prev.current, reached: reached.current });
                        setState(s);
                    }
                    setAccuracy(r.fix.accuracy);
                    setPhase("on");
                } else if (r.status === "denied") {
                    // 권한이 꺼져 있다 — 더 묻지 않는다(설정에서 켜고 다시 시작한다)
                    setPhase("denied");
                    return;
                } else {
                    setPhase((p) => (p === "on" || p === "lost" ? "lost" : "locating"));
                }
            }
            timer = setTimeout(tick, POLL_MS);
        };
        void tick();
        return () => { stop = true; if (timer) clearTimeout(timer); };
    }, [active, keepId]);

    /** 지금까지 쌓은 것 — 마칠 때 읽는다 */
    const summary = useCallback(() => ({ walkedKm: tally.current.walkedKm, gainM: tally.current.gainM, reachedSummit: reached.current, samples: tally.current.samples }), []);
    return { state, phase, accuracy, summary };
}
