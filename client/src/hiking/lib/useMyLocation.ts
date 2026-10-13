/**
 * 내 위치 — 산 화면의 "내 위치에서 N km"(2026-10-13). 골프장 상세의 규칙을 등산에 옮긴 것이다(GolfCoursePage useMyLocation).
 *
 *   · 이미 위치를 허락한 사람(앱 · 웹)은 **조용히** 한 번 받는다 — 권한 창이 뜨지 않는다.
 *   · 아직 정하지 않은 사람에게는 **들어오자마자 묻지 않는다**(검색으로 막 들어온 방문자에게 권한 창이 뜨면 그대로 나간다).
 *     대신 화면이 "내 위치에서 거리" 한 줄을 두고, 눌렀을 때 한 번 묻는다(ask). 거절했으면 그 줄을 거둔다.
 *     골프는 앱에서는 들어오자마자 권한 창을 띄우지만, 등산은 앱에서도 먼저 묻지 않는다 — 홈의 '내 근처의 산'(NearMe)과 같은 약속이다.
 *   · **내 위치는 이 기기 밖으로 나가지 않는다.** 받은 자리는 이 화면의 메모리(state)에만 있고, 서버로 보내지도 기기에 적어 두지도 않는다 —
 *     거리와 방향은 화면이 센다(shared/hikingAround fromMeText). 백그라운드 위치는 쓰지 않는다.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { getDevicePosition } from "@/hooks/useNativeBridge";

/** 대략 위치면 충분하다(몇 km 인지를 적는다) — 5분 안에 받아 둔 자리도 쓴다 */
const READ = { highAccuracy: false, timeoutMs: 8000, maximumAgeMs: 5 * 60_000 } as const;
type Phase = "checking" | "askable" | "asking" | "done";

export interface MyLocation {
    /** 받은 자리 — 이 화면의 메모리에만 있다 */
    here: { lat: number; lng: number } | null;
    /** 눌러서 물어볼 수 있을 때만 있다(아직 권한을 정하지 않았다). 한 번 물으면 사라진다 */
    ask: (() => void) | null;
    /** 물어보고 답을 기다리는 중 */
    asking: boolean;
}

export function useMyLocation(): MyLocation {
    const [here, setHere] = useState<{ lat: number; lng: number } | null>(null);
    const [phase, setPhase] = useState<Phase>("checking");
    const alive = useRef(true);
    useEffect(() => {
        alive.current = true;
        // 묻지 않고 받는다 — 권한이 이미 있을 때만 받아진다. 아직 안 정했으면('prompt') 누를 수 있는 줄을, 막아 두었으면 아무것도 두지 않는다
        void getDevicePosition({ prompt: false, ...READ }).then((r) => {
            if (!alive.current) return;
            if (r.status === "granted") { setHere({ lat: r.fix.lat, lng: r.fix.lng }); setPhase("done"); }
            else setPhase(r.status === "denied" ? "done" : "askable");
        });
        return () => { alive.current = false; };
    }, []);
    const ask = useCallback(() => {
        setPhase("asking");
        void getDevicePosition({ prompt: true, ...READ }).then((r) => {
            if (!alive.current) return;
            if (r.status === "granted") setHere({ lat: r.fix.lat, lng: r.fix.lng });
            // 한 번만 묻는다 — 거절했거나 못 받았으면 줄을 거둔다(거리를 안 적을 뿐이다)
            setPhase("done");
        });
    }, []);
    return { here, ask: phase === "askable" ? ask : null, asking: phase === "asking" };
}
