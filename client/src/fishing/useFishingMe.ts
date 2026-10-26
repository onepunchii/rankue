/**
 * 낚시의 내 위치(2026-10-26 낚시 탭 리뷰 — 오너 "응"). 홈의 '오늘 내 앞바다' 카드 · 지도('가까운 좋은 곳'),
 * 전국 낚시터의 '가까운 순', 바다 · 항구 물때의 '가까운 항구'가 같은 약속을 쓴다.
 * 처음엔 누를 때만 묻고, 한 번 켠 사람은 다음부터 묻지 않고 받는다(권한이 살아 있을 때만). 기기에 남기는 것은 '켰다'는 표시 하나 —
 * 좌표는 그 화면의 메모리에만 있고 저장 · 전송하지 않는다(조과 적기의 '지금 자리'만 사람이 켤 때 조과와 함께 저장된다).
 * 공개 화면(SpotsPages · SeaPages)도 부르므로 FishingPage 를 끌어오지 않게 따로 둔다.
 */
import { useCallback, useEffect, useState } from "react";
import { getDevicePosition } from "@/hooks/useNativeBridge";
import { cleanCoord } from "@shared/fishingSpot";
import { FISHING_PORTS } from "@shared/fishingStations";

export const FISHING_ME_KEY = "rankue-fishing-me-on";
export type FishingMe = { me: { lat: number; lng: number } | null; state: "idle" | "busy" | "denied" | "far"; locate: () => void; off: () => void };

const keep = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* 저장을 못 해도 화면은 바뀐다 */ } };

export function useFishingMe(): FishingMe {
    const [me, setMe] = useState<{ lat: number; lng: number } | null>(null);
    const [state, setState] = useState<FishingMe["state"]>("idle");
    const get = useCallback(async (prompt: boolean) => {
        setState("busy");
        const r = await getDevicePosition({ prompt, highAccuracy: false, timeoutMs: 10000, maximumAgeMs: 5 * 60_000 }).catch(() => null);
        const fix = r?.status === "granted" ? r.fix : null;
        const c = fix ? cleanCoord(fix.lat, fix.lng) : null;
        if (c) { setMe(c); setState("idle"); keep(FISHING_ME_KEY, "1"); return; }
        // 묻지 않고 받으려다 못 받았으면 조용히 처음 모습으로
        setState(prompt ? (fix ? "far" : "denied") : "idle");
    }, []);
    useEffect(() => { try { if (localStorage.getItem(FISHING_ME_KEY) === "1") void get(false); } catch { /* 이번엔 묻지 않는다 */ } }, [get]);
    const off = useCallback(() => { setMe(null); setState("idle"); try { localStorage.removeItem(FISHING_ME_KEY); } catch { /* 이번만 */ } }, []);
    return { me, state, locate: () => { void get(true); }, off };
}

/** 두 지점 사이 어림 거리(km) — 낚시 화면의 다른 곳과 같은 셈(경도 1도 88.8km · 위도 1도 111km) */
export const kmFrom = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => Math.hypot((a.lng - b.lng) * 88.8, (a.lat - b.lat) * 111);

/** 그 지점에서 가장 가까운 항구(조석을 보여 줄 곳) — 80km 밖이면 없다 */
export function nearestPort(lat: number, lng: number): { code: string; name: string; km: number } | null {
    let best: { code: string; name: string; km: number } | null = null;
    for (const p of FISHING_PORTS) {
        const km = Math.round(kmFrom(p, { lat, lng }));
        if (!best || km < best.km) best = { code: p.code, name: p.name, km };
    }
    return best && best.km <= 80 ? best : null;
}
