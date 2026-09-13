/** 로그인한 회원의 앱 접속 세션을 기록한다(2026-09-13). 화면은 없다. 회원이 바뀌면(로그아웃·전환) 세션을 닫고 다시 연다. */
import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { startAppSessionTracking } from "@/lib/appSession";

export function AppSessionTracker() {
    const { member } = useAuth();
    const memberId = member?.id ?? null;
    useEffect(() => {
        if (!memberId) return;
        return startAppSessionTracking();
    }, [memberId]);
    return null;
}
