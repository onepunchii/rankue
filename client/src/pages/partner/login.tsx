/**
 * /partner/login — 파트너(사장님) 입구.
 *
 * 2026-10-07 오너: "지금 사장님이 없잖아 — 앞으로 사장님들이 신청·승인했을 때를 생각해서 진행하자".
 * 예전 이 화면은 번호 + 4자리 PIN 폼이었다(승인 때 운영자가 전화로 불러 준 PIN). 이제 사장님 신청은 **랭큐 계정으로** 받고
 * 승인하면 그 계정이 사장님이 되므로(server/lib/partnerApply), 이 화면은 그 흐름의 안내판이다:
 *   1) 이미 사장님이면(또는 운영자면) 폼 없이 바로 들어간다 — POST /partner/sso
 *   2) 내 신청이 있으면 그 상태를 보여 준다(확인 중 · 승인 · 승인되지 않음 + 사유) — GET /partner/applications
 *   3) 아직이면 '내 매장 찾아 관리 신청' · '새 매장 등록'으로 보낸다. 로그인하지 않았으면 로그인(팝업)부터.
 *   4) 예전에 번호·PIN 을 받은 사장님을 위한 폼은 접어 둔다(맨 아래 작은 글씨). 서버는 관리자 계정을 이 폼으로 들이지 않는다.
 * 메뉴의 '파트너 프로그램' 카드가 여기로 온다.
 */
import { useEffect, useState } from "react";
import { useNativeBridge } from "@/hooks/useNativeBridge";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { goLogin } from "@/components/hiq/LoginGate";
import { LucideArrowLeft, LucideChevronRight, LucideStore } from "@/lib/icons";

const loginSchema = z.object({
    phone: z.string().min(10, "휴대폰 번호를 입력해주세요."),
    password: z.string().min(4, "비밀번호는 4자리 이상이어야 합니다."),
});
type LoginForm = z.infer<typeof loginSchema>;

type MyApplication = { kind: "claim" | "register"; id: string; name: string; listingCode: string | null; status: "pending" | "approved" | "rejected"; rejectReason: string | null; createdAt: string };
type MyApplications = { applications: MyApplication[]; ownsStore: boolean };

const STATUS: Record<MyApplication["status"], { label: string; chip: string }> = {
    pending: { label: "확인 중", chip: "bg-amber-500/[0.14] text-amber-700" },
    approved: { label: "승인됨", chip: "bg-brand/[0.12] text-brand" },
    rejected: { label: "승인되지 않음", chip: "bg-black/[0.06] text-black/55" },
};

const day = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? "" : `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
};

export default function PartnerLogin() {
    const [, setLocation] = useLocation();
    const { toast } = useToast();
    const { member, isGuest, isLoading: authLoading } = useAuth();
    const [isSubmitting, setIsSubmitting] = useState(false);
    // 앱에 이미 로그인된 계정이 파트너(매장 소유·관리자)면 폼 없이 자동 진입
    const [ssoChecking, setSsoChecking] = useState(true);
    // 예전 방식(번호 + PIN) 폼은 접어 둔다
    const [legacyOpen, setLegacyOpen] = useState(false);

    const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });
    const { sendMessage } = useNativeBridge();
    const memberId = member?.id ?? null;

    useEffect(() => {
        // '나'를 받는 중에는 기다린다 — 받기 전에 한 번, 받은 뒤에 또 한 번 물어 화면이 깜빡이지 않게
        if (authLoading) return;
        let alive = true;
        setSsoChecking(true);
        (async () => {
            try {
                const r = await apiRequest("/api/hiq/partner/sso", { method: "POST" });
                if (!alive) return;
                if (r?.success) {
                    toast({ title: "바로 들어갑니다", description: `${r.storeName} 계정으로 접속합니다.` });
                    setLocation(r.role === "super_admin" || r.role === "admin" ? "/admin/dashboard" : "/partner/dashboard");
                    return;
                }
            } catch { /* 파트너 아님·비로그인 — 안내로 */ }
            if (alive) setSsoChecking(false);
        })();
        return () => { alive = false; };
        // 로그인 상태가 바뀌면(팝업에서 로그인) 다시 본다 — 방금 승인된 사장님이 여기서 로그인하면 바로 들어간다
    }, [setLocation, toast, authLoading, memberId]);

    // 내 신청 — 로그인했을 때만 묻는다
    const { data: mine } = useQuery<MyApplications>({
        queryKey: ["/api/hiq/partner/applications"],
        queryFn: async () => apiRequest("/api/hiq/partner/applications"),
        enabled: !!member,
        staleTime: 30 * 1000,
        retry: false,
    });
    // 답의 모양이 어긋나도(목록이 아닌 값) 화면이 죽지 않게
    const apps = Array.isArray(mine?.applications) ? mine.applications : [];
    const waiting = apps.some((a) => a.status === "pending");

    const onSubmit = async (data: LoginForm) => {
        setIsSubmitting(true);
        try {
            const result = await apiRequest("/api/hiq/partner/login", { method: "POST", body: data });
            if (result.success) {
                toast({ title: "로그인 성공", description: `${result.storeName} 사장님, 환영합니다!`, variant: "success" });
                setLocation(result.role === "super_admin" || result.role === "admin" ? "/admin/dashboard" : "/partner/dashboard");
                // Notify Native App
                sendMessage({ type: "LOGIN_SUCCESS", payload: { token: "cookie-session", user: result } });
            }
        } catch (error: any) {
            toast({ variant: "destructive", title: "로그인 실패", description: error.message || "등록된 매장의 관리자가 아닙니다." });
        } finally {
            setIsSubmitting(false);
        }
    };

    // SSO 확인 중엔 화면을 깜빡이지 않는다 — 파트너면 이 화면을 스치듯 지나간다
    if (ssoChecking) {
        return (
            <div className="min-h-screen bg-surface-0 flex items-center justify-center text-black/45 text-[14px] font-medium">
                계정 확인 중...
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-surface-0 text-ink-1 flex flex-col px-5 pt-6 pb-16 font-sans">
            <div className="flex items-center mb-6">
                <button onClick={() => setLocation("/menu")} className="p-2 -ml-2 text-black/40 hover:text-ink-1" aria-label="뒤로 가기">
                    <LucideArrowLeft className="w-6 h-6" />
                </button>
            </div>

            <div className="max-w-md mx-auto w-full">
                {/* 머리 — 메뉴의 파트너 카드와 같은 초록 */}
                <div className="rounded-card bg-brand text-brand-fg px-5 py-6 mb-4">
                    <span className="w-12 h-12 rounded-tile bg-[#FFFFFF24] flex items-center justify-center mb-3">
                        <LucideStore className="w-6 h-6" />
                    </span>
                    <h1 className="text-[22px] font-bold leading-tight break-keep">사장님이신가요?</h1>
                    <p className="text-[13.5px] font-medium text-[#FFFFFFCC] mt-1.5 leading-relaxed break-keep">
                        내 매장 페이지를 직접 관리하고 회원을 한눈에 볼 수 있어요. 신청은 랭큐 계정으로 하고, 승인되면 그 계정의 메뉴에 '내 매장 관리'가 열립니다.
                    </p>
                </div>

                {/* 내 신청 — 상태와(거절이면) 사유 */}
                {apps.length > 0 && (
                    <section className="mb-4">
                        <h2 className="text-[13px] font-semibold text-black/55 px-1 mb-2">내 신청</h2>
                        <div className="rk-card overflow-hidden divide-y divide-surface-line">
                            {apps.map((a) => (
                                <div key={`${a.kind}-${a.id}`} className="px-4 py-3.5">
                                    <div className="flex items-center gap-2">
                                        <p className="min-w-0 flex-1 text-[15px] font-semibold truncate">{a.name}</p>
                                        <span className={`shrink-0 px-2.5 py-1 rounded-full text-[12px] font-bold leading-none ${STATUS[a.status].chip}`}>{STATUS[a.status].label}</span>
                                    </div>
                                    <p className="text-[12.5px] text-black/45 font-medium mt-0.5">
                                        {a.kind === "claim" ? "매장 관리 신청" : "새 매장 등록"} · {day(a.createdAt)}
                                    </p>
                                    {a.status === "pending" && <p className="text-[12.5px] text-black/55 mt-1.5 break-keep">확인이 끝나면 알림으로 알려 드릴게요.</p>}
                                    {a.status === "rejected" && (
                                        <p className="text-[12.5px] text-black/55 mt-1.5 break-keep">
                                            {a.rejectReason ? `사유: ${a.rejectReason}` : "내용을 확인한 뒤 다시 신청하실 수 있어요."}
                                        </p>
                                    )}
                                    {a.status === "approved" && (
                                        <button
                                            type="button"
                                            onClick={() => setLocation("/partner/dashboard")}
                                            className="mt-2 h-9 px-3.5 rounded-full bg-brand text-brand-fg text-[12.5px] font-bold active:scale-[0.98] transition-transform"
                                        >
                                            내 매장 관리 열기
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {/* 할 일 — 로그인 전이면 로그인부터. 신청 결과를 기다리는 동안에는 새로 신청하는 길을 앞세우지 않는다 */}
                {isGuest && (
                    <button
                        type="button"
                        // 그 자리에서 가입·로그인 팝업 — 끝나면 이 화면에 남고 위 확인이 다시 돈다
                        onClick={() => goLogin(setLocation)}
                        className="w-full h-[52px] rounded-tile bg-brand text-brand-fg text-[15.5px] font-bold active:scale-[0.98] transition-transform mb-3"
                    >
                        랭큐 계정으로 로그인
                    </button>
                )}
                {!waiting && (
                    <div className="rk-card overflow-hidden divide-y divide-surface-line">
                        {/* 주 동선: 매장 찾기에서 내 매장을 찾아 '사장님이신가요?' 로 신청 → 승인되면 내 계정에 권한이 열린다 */}
                        <button type="button" onClick={() => setLocation("/stores")} className="w-full px-4 py-4 flex items-center gap-3 text-left active:bg-surface-2 transition-colors">
                            <span className="min-w-0 flex-1">
                                <span className="block text-[15px] font-semibold">내 매장 찾아 관리 신청하기</span>
                                <span className="block text-[12.5px] text-black/45 font-medium mt-0.5 break-keep">매장 찾기에서 내 매장을 열고 '사장님이신가요?'를 눌러 주세요</span>
                            </span>
                            <LucideChevronRight className="w-4 h-4 shrink-0 text-black/30" />
                        </button>
                        {/* 목록에 없는 매장 — 등록 신청. 승인되면 매장 페이지와 권한이 같이 열린다 */}
                        <button type="button" onClick={() => setLocation("/stores/register")} className="w-full px-4 py-4 flex items-center gap-3 text-left active:bg-surface-2 transition-colors">
                            <span className="min-w-0 flex-1">
                                <span className="block text-[15px] font-semibold">목록에 없는 매장 새로 등록하기</span>
                                <span className="block text-[12.5px] text-black/45 font-medium mt-0.5 break-keep">확인 후 매장 페이지를 만들어 드려요</span>
                            </span>
                            <LucideChevronRight className="w-4 h-4 shrink-0 text-black/30" />
                        </button>
                    </div>
                )}

                {/* 운영자(관리자) 계정은 이 화면이 아니다 — 랭큐에 로그인한 내 계정으로 /admin 에서 바로 열린다 */}
                <p className="mt-5 text-center text-[12px] text-black/45 break-keep">
                    운영자는{" "}
                    <a href="/admin" onClick={(e) => { e.preventDefault(); setLocation("/admin"); }} className="font-semibold underline underline-offset-4">관리 화면</a>
                    으로 들어와 주세요.
                </p>

                {/* 예전 방식 — 승인 때 번호와 4자리 PIN 을 받은 사장님. 접어 둔다 */}
                <div className="mt-2 text-center">
                    <button
                        type="button"
                        onClick={() => setLegacyOpen((v) => !v)}
                        aria-expanded={legacyOpen}
                        className="h-11 px-2 text-[12.5px] font-medium text-black/45 underline underline-offset-4 active:opacity-70"
                    >
                        예전에 받은 번호·PIN 으로 로그인
                    </button>
                </div>
                {legacyOpen && (
                    <form onSubmit={handleSubmit(onSubmit)} className="mt-2 rk-card p-4 space-y-3">
                        <div className="space-y-1.5">
                            <label className="text-[12px] font-bold text-black/55 pl-1">휴대폰 번호</label>
                            <Input
                                {...register("phone")}
                                type="tel"
                                inputMode="tel"
                                autoComplete="tel"
                                enterKeyHint="next"
                                placeholder="01012345678"
                                className="h-12 bg-white border-black/[0.08] rounded-tile text-[16px] font-semibold px-4 tabular-nums placeholder:text-black/40 focus:border-brand transition-all"
                            />
                            {errors.phone && <p className="text-red-500 text-xs pl-1">{errors.phone.message}</p>}
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[12px] font-bold text-black/55 pl-1">비밀번호</label>
                            <Input
                                {...register("password")}
                                type="password"
                                inputMode="numeric"
                                autoComplete="current-password"
                                enterKeyHint="done"
                                placeholder="승인 때 받은 4자리"
                                className="h-12 bg-white border-black/[0.08] rounded-tile text-[16px] font-semibold px-4 placeholder:text-black/40 focus:border-brand transition-all"
                            />
                            {errors.password && <p className="text-red-500 text-xs pl-1">{errors.password.message}</p>}
                        </div>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="w-full h-12 rounded-tile bg-black/[0.08] text-ink-1 text-[14.5px] font-bold disabled:opacity-50 active:scale-[0.98] transition-transform"
                        >
                            {isSubmitting ? "확인 중..." : "매장 관리 접속"}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
}
