/**
 * /admin — 알맞은 관리 화면으로 보내는 입구(2026-09-26).
 *
 * 예전 이 주소에는 '랭큐 관리자 콘솔'이라는 이름의 **매장 단위** 화면이 따로 있었다. 파트너 API 로 자기 매장
 * 회원만 보여 주면서 관리자 콘솔처럼 보였고(/admin/dashboard 와 헷갈림), 마케팅 센터의 '최근 발송 내역'은
 * 지어낸 예시 3줄이었다. 같은 일을 하는 화면이 이제 둘 다 있다 — 운영자는 /admin/dashboard,
 * 사장님은 /partner/dashboard. 여기서는 로그인 상태를 보고 그리로 보낸다.
 */
import { useEffect } from "react";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";

export default function HiqAdmin() {
    const [, setLocation] = useLocation();

    useEffect(() => {
        let alive = true;
        (async () => {
            let to = "/partner/login";
            try {
                await apiRequest("/api/hiq/admin/stats");
                to = "/admin/dashboard";
            } catch {
                try {
                    await apiRequest("/api/hiq/partner/store");
                    to = "/partner/dashboard";
                } catch {
                    /* 로그인 필요 */
                }
            }
            if (alive) setLocation(to, { replace: true });
        })();
        return () => { alive = false; };
    }, [setLocation]);

    return <div className="min-h-screen bg-surface-0 flex items-center justify-center text-black/55 text-sm">관리 화면으로 이동 중…</div>;
}
