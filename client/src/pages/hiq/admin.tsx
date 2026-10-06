/**
 * /admin — 관리 화면의 입구.
 *
 * 2026-10-07 오너: "어드민에 휴대폰 번호로 진입하는 거 제거해주고 내 계정이면 들어가지게 해줘".
 * 예전에는 여기서 파트너 로그인(번호 + PIN 폼)으로 보냈다. 이제는 **랭큐에 로그인한 내 계정**으로 바로 연다:
 *   1) 이미 관리 화면 쿠키가 있으면 그대로(운영자는 /admin/dashboard)
 *   2) 없으면 내 계정으로 바로(POST /partner/sso) — 운영자는 /admin/dashboard, 사장님은 /partner/dashboard
 *   3) 번호 폼으로 들어와 있던 사장님(앱 계정 없이 파트너 쿠키만)은 /partner/dashboard
 *   4) 로그인이 안 돼 있으면 이 자리에서 가입·로그인 팝업을 연다(카카오·구글). 로그인이 끝나면 1)부터 다시 본다.
 * 번호 폼(/partner/login)은 사장님용으로만 남는다 — 서버가 관리자 계정을 그 폼으로 들이지 않는다(hiqService.partnerLogin).
 *
 * (2026-09-26) 예전 이 주소에는 '랭큐 관리자 콘솔'이라는 이름의 매장 단위 화면이 따로 있었다 — 지금은 입구일 뿐이다.
 */
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { ApiError, apiRequest } from "@/lib/queryClient";
import { loginPagePath, openLoginSheet } from "@/components/hiq/LoginSheet";

type Gate = "checking" | "guest" | "denied" | "unverified";

export default function HiqAdmin() {
    const [, setLocation] = useLocation();
    const { member, isLoading } = useAuth();
    const [gate, setGate] = useState<Gate>("checking");
    const memberId = member?.id ?? null;

    useEffect(() => {
        // '나'를 아직 받는 중이면 기다린다 — 로그인된 사람에게 로그인 단추를 먼저 보여 주지 않는다
        if (isLoading) return;
        let alive = true;
        setGate("checking");
        (async () => {
            const go = (to: string) => { if (alive) setLocation(to, { replace: true }); };
            // 1) 관리 화면 쿠키가 이미 있다
            try { await apiRequest("/api/hiq/admin/stats"); go("/admin/dashboard"); return; } catch { /* 다음 길로 */ }
            // 2) 내 계정으로 바로
            let why: Gate = "guest";
            try {
                const r = await apiRequest("/api/hiq/partner/sso", { method: "POST" });
                if (r?.success) { go(r.role === "super_admin" || r.role === "admin" ? "/admin/dashboard" : "/partner/dashboard"); return; }
            } catch (e) {
                const status = e instanceof ApiError ? e.status : 0;
                why = status === 401 ? "guest" : e instanceof ApiError && e.data?.code === "SSO_UNVERIFIED" ? "unverified" : "denied";
            }
            // 3) 번호 폼으로 들어와 있던 사장님
            try { await apiRequest("/api/hiq/partner/store"); go("/partner/dashboard"); return; } catch { /* 권한 없음 */ }
            if (alive) setGate(why);
        })();
        return () => { alive = false; };
        // 로그인 상태가 바뀌면(팝업에서 로그인 · 다른 계정으로 바꿈) 다시 본다
    }, [setLocation, isLoading, memberId]);

    const login = () => {
        // 이 자리에서 팝업으로 — 끝나면 그대로 남고, 위 확인이 다시 돈다. 팝업을 못 열면 로그인 화면으로(끝나면 여기로 돌아온다)
        if (!openLoginSheet({ from: "/admin", title: "관리 화면 로그인", desc: "랭큐 계정으로 로그인하면 바로 열려요." })) setLocation(loginPagePath("/admin"));
    };

    if (gate === "checking") {
        return <div className="min-h-screen bg-surface-0 flex items-center justify-center text-black/55 text-sm">관리 화면으로 이동 중…</div>;
    }

    const copy = gate === "guest"
        ? { title: "관리 화면", desc: "랭큐 계정으로 로그인하면 바로 열려요. 번호를 따로 넣지 않아도 됩니다." }
        : gate === "unverified"
            ? { title: "본인 확인이 필요해요", desc: "이 계정은 번호만으로 로그인돼 있어요. 설정에서 로그인 PIN 을 만들거나 카카오·구글을 연결한 뒤 다시 열어 주세요." }
            : { title: "관리 권한이 없는 계정이에요", desc: "지금 로그인한 계정으로는 관리 화면을 열 수 없어요. 매장 사장님은 아래에서 들어와 주세요." };

    return (
        <div className="min-h-screen bg-surface-0 text-ink-1 flex items-center justify-center px-6">
            <div className="w-full max-w-[360px] rk-card p-6 text-center">
                <p className="text-[11px] font-bold tracking-[0.22em] text-brand">RANKUE</p>
                <h1 className="mt-2 text-[20px] font-bold break-keep">{copy.title}</h1>
                <p className="mt-2 text-[13.5px] leading-relaxed text-black/55 break-keep">{copy.desc}</p>
                {gate === "guest" && (
                    <button
                        type="button"
                        onClick={login}
                        className="mt-5 h-12 w-full rounded-[12px] bg-brand text-brand-fg text-[15px] font-bold active:scale-[0.98] transition-transform"
                    >
                        로그인
                    </button>
                )}
                {gate === "unverified" && (
                    <button
                        type="button"
                        onClick={() => setLocation("/settings")}
                        className="mt-5 h-12 w-full rounded-[12px] bg-brand text-brand-fg text-[15px] font-bold active:scale-[0.98] transition-transform"
                    >
                        설정으로 가기
                    </button>
                )}
                <div className="mt-3 flex items-center justify-center gap-x-2">
                    <button
                        type="button"
                        onClick={() => setLocation("/partner/login")}
                        className="h-11 px-2 text-[13px] font-semibold text-black/55 underline underline-offset-4 active:opacity-70"
                    >
                        매장 사장님 로그인
                    </button>
                    <span aria-hidden className="text-[12px] text-black/30">·</span>
                    <button
                        type="button"
                        onClick={() => setLocation("/dashboard")}
                        className="h-11 px-2 text-[13px] font-semibold text-black/55 underline underline-offset-4 active:opacity-70"
                    >
                        홈으로
                    </button>
                </div>
            </div>
        </div>
    );
}
