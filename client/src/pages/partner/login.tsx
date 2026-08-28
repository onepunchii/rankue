import { useEffect, useState } from "react";
import { useNativeBridge } from "@/hooks/useNativeBridge";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { LucideBriefcase, LucideArrowLeft, LucideCheckCircle2 } from "@/lib/icons";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

// Schema for login
const loginSchema = z.object({
    phone: z.string().min(10, "휴대폰 번호를 입력해주세요."),
    password: z.string().min(4, "비밀번호는 4자리 이상이어야 합니다."), // Changed to required
});

type LoginForm = z.infer<typeof loginSchema>;

export default function PartnerLogin() {
    const [, setLocation] = useLocation();
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    // 앱에 이미 로그인된 계정이 파트너(매장 소유·관리자)면 폼 없이 자동 진입
    const [ssoChecking, setSsoChecking] = useState(true);

    const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>({
        resolver: zodResolver(loginSchema)
    });
    const { sendMessage } = useNativeBridge();

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const r = await apiRequest("/api/hiq/partner/sso", { method: "POST" });
                if (!alive) return;
                if (r?.success) {
                    toast({ title: "자동 로그인", description: `${r.storeName} 계정으로 접속합니다.` });
                    setLocation(r.role === "super_admin" || r.role === "admin" ? "/admin/dashboard" : "/partner/dashboard");
                    return;
                }
            } catch { /* 파트너 아님·비로그인 — 폼으로 */ }
            if (alive) setSsoChecking(false);
        })();
        return () => { alive = false; };
    }, [setLocation, toast]);

    const onSubmit = async (data: LoginForm) => {
        setIsSubmitting(true);
        try {
            // Phase 1: Simple check. In real app, verify password or SMS code.
            // Here we just check if this user is an owner of any store.
            const result = await apiRequest("/api/hiq/partner/login", {
                method: "POST",
                body: data
            });

            if (result.success) {
                toast({
                    title: "로그인 성공",
                    description: `${result.storeName} 사장님, 환영합니다!`,
                    variant: "success"
                });

                if (result.role === 'super_admin' || result.role === 'admin') {
                    // 통합 관리자 콘솔 (매장 클레임·입점 문의·회원·신고 전부 여기)
                    setLocation("/admin/dashboard");
                } else {
                    setLocation("/partner/dashboard");
                }

                // Notify Native App
                sendMessage({
                    type: 'LOGIN_SUCCESS',
                    payload: {
                        token: 'cookie-session',
                        user: result
                    }
                });
            }
        } catch (error: any) {
            toast({
                variant: "destructive",
                title: "로그인 실패",
                description: error.message || "등록된 매장의 관리자가 아닙니다.",
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    // SSO 확인 중엔 폼을 깜빡이지 않는다 — 파트너면 이 화면을 스치듯 지나간다
    if (ssoChecking) {
        return (
            <div className="min-h-screen bg-[#f2f0eb] flex items-center justify-center text-black/45 text-[14px] font-medium">
                계정 확인 중...
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#f2f0eb] text-[rgba(0,0,0,0.87)] flex flex-col p-6 font-sans">
            <div className="flex items-center mb-10">
                <button onClick={() => setLocation("/menu")} className="p-2 -ml-2 text-black/40 hover:text-[rgba(0,0,0,0.87)]" aria-label="뒤로 가기">
                    <LucideArrowLeft className="w-6 h-6" />
                </button>
            </div>

            <div className="flex-1 flex flex-col justify-center max-w-md mx-auto w-full">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-12 text-center"
                >
                    <div className="w-20 h-20 bg-brand/10 rounded-3xl flex items-center justify-center mx-auto mb-6 border border-brand/20 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
                        <LucideBriefcase className="w-10 h-10 text-brand" />
                    </div>
                    <h1 className="text-3xl font-bold mb-2 tracking-tight text-brand">파트너 로그인</h1>
                    <p className="text-black/55">매장 관리자 계정으로 접속하세요.</p>
                </motion.div>

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                    <div className="space-y-2">
                        <label className="text-[12px] font-bold text-black/55 pl-1">휴대폰 번호</label>
                        <Input
                            {...register("phone")}
                            type="tel"
                            inputMode="tel"
                            autoComplete="tel"
                            enterKeyHint="next"
                            placeholder="01012345678"
                            className="h-14 bg-white border-black/[0.08] rounded-2xl text-[17px] font-semibold px-5 tabular-nums placeholder:text-black/40 focus:border-brand transition-all"
                        />
                        {errors.phone && <p className="text-red-500 text-xs pl-1">{errors.phone.message}</p>}
                    </div>

                    <div className="space-y-2">
                        <label className="text-[12px] font-bold text-black/55 pl-1">비밀번호</label>
                        <Input
                            {...register("password")}
                            type="password"
                            inputMode="numeric"
                            autoComplete="current-password"
                            enterKeyHint="done"
                            placeholder="비밀번호 (승인 시 받은 4자리)"
                            className="h-14 bg-white border-black/[0.08] rounded-2xl text-[17px] font-semibold px-5 placeholder:text-black/40 focus:border-brand transition-all"
                        />
                        {errors.password && <p className="text-red-500 text-xs pl-1">{errors.password.message}</p>}
                    </div>

                    <Button
                        type="submit"
                        disabled={isSubmitting}
                        className="w-full h-16 bg-brand hover:bg-brand-strong text-white text-lg font-bold rounded-full transition-all shadow-[0_1px_2px_rgba(0,0,0,0.06)] active:scale-[0.98]"
                    >
                        {isSubmitting ? "확인 중..." : "매장 관리 접속"}
                    </Button>
                </form>


                <div className="mt-8 text-center space-y-4">
                    <p className="text-xs text-black/40">
                        아직 파트너가 아니신가요?
                    </p>
                    {/* 주 동선: 디렉토리에서 내 매장을 찾아 클레임 → 승인되면 이 화면으로 로그인 */}
                    <a
                        href="/stores"
                        className="block w-full py-3 rounded-2xl bg-brand/[0.08] text-brand text-sm font-bold"
                    >
                        내 매장 찾아 관리 신청하기 →
                    </a>
                    {/* 목록에 없는 매장 — 신규 등록 신청 폼으로 (연락처만 남던 리드 다이얼로그 대체.
                        승인 시 매장 페이지+사장님 권한이 자동 발급된다) */}
                    <a
                        href="/stores/register"
                        className="block w-full py-2 text-[12.5px] font-medium text-black/45 underline underline-offset-4 hover:text-brand transition-colors"
                    >
                        목록에 내 매장이 없나요? 새로 등록하기
                    </a>
                </div>
            </div>
        </div>
    );
}
