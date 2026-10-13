/**
 * '스코어카드 스캔'의 입구(2026-10-13) — 홈 · 여권의 단추가 실제로 읽는 길로 이어지게.
 *
 * 스캔은 **방 안에서** 한다(점수판을 채우는 일이라 골프장 · 파 · 참가자가 정해져 있어야 한다). 그래서 입구는:
 *  - 내가 방장으로 치는 중인 방이 있으면 → 그 방으로 가서 스캔 창을 연다.
 *  - 없으면 → 라운드 만들기로 보낸다. 골프장을 고르고 시작하면 방에서 스캔 창이 저절로 열린다.
 * '열어 달라'는 표시는 탭 안에만 둔다(sessionStorage) — 대기실을 거쳐도 남고, 한 번 쓰면 지운다.
 * 쓸 수 없는 사람(공개 전 · 운영자가 아님)에게는 available=false — 부르는 쪽이 예전 '준비 중' 안내를 그대로 보여 준다.
 * (오너가 10/13 밤 홈 → RANKUE → 스코어카드 스캔을 네 번 눌렀는데 그 창은 '준비 중'만 말하는 옛 창이었다.)
 */
import { useCallback } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";

const KEY = "rankue-golf-scan-next";

export function markScanNext(): void {
    try { sessionStorage.setItem(KEY, "1"); } catch { /* 막힌 환경 — 단추를 직접 누르면 된다 */ }
}
/** 표시가 있었으면 지우고 true */
export function takeScanNext(): boolean {
    try {
        if (sessionStorage.getItem(KEY) !== "1") return false;
        sessionStorage.removeItem(KEY);
        return true;
    } catch {
        return false;
    }
}
export function clearScanNext(): void {
    try { sessionStorage.removeItem(KEY); } catch { /* */ }
}

export function useScanEntry(enabled = true): { available: boolean; go: () => void } {
    const [, setLocation] = useLocation();
    const { data: me } = useQuery<any>({ queryKey: ["/api/hiq/me"], enabled });
    const { data: scan } = useQuery<{ available: boolean }>({ queryKey: ["/api/hiq/golf/scan/status"], enabled: enabled && !!me?.id, staleTime: 60_000 });
    const { data: active } = useQuery<any>({ queryKey: ["/api/hiq/golf/match/active"], enabled: enabled && !!me?.id && !!scan?.available });
    const go = useCallback(() => {
        markScanNext();
        if (active?.id && active.status === "playing" && active.hostId === me?.id) setLocation(`/golf/game/${active.id}`);
        else setLocation("/golf/game/new?scan=1");
    }, [active?.id, active?.status, active?.hostId, me?.id, setLocation]);
    return { available: !!scan?.available, go };
}
