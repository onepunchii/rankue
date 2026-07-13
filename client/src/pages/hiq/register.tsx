import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { insertHiqMemberSchema, type InsertHiqMember } from "../../../../shared/schema";
import { LucideChevronRight, LucideCheckCircle2, LucideSparkles } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

const STEPS = [
    { id: "personal", title: "본인 확인", desc: "당구장에서 사용할 이름을 알려주세요." },
    { id: "password", title: "비밀번호 설정", desc: "내 점수를 보호하기 위해 비밀번호를 설정합니다." },
    { id: "security", title: "보안 질문", desc: "비밀번호를 잊었을 때 찾기 위한 질문입니다." },
    { id: "gender", title: "성별 선택", desc: "성별에 맞는 랭킹 시스템이 적용됩니다." },
    { id: "birth", title: "출생년도", desc: "연령별 랭킹 산정에 활용됩니다." },
    { id: "terms", title: "약관 동의", desc: "마지막 단계입니다!" }
];

export default function HiqRegister() {
    const [, setLocation] = useLocation();
    const { toast } = useToast();
    const [currentStep, setCurrentStep] = useState(0);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isCompleted, setIsCompleted] = useState(false);

    // Get phone and store from query param
    const queryParams = new URLSearchParams(window.location.search);
    const phoneFromQuery = queryParams.get("phone") || "";
    const storeIdFromQuery = queryParams.get("store") || "";

    // Fetch Branding
    const { data: brandResponse, isLoading: isBrandLoading } = useQuery({
        queryKey: ["/api/hiq/branding", storeIdFromQuery],
        queryFn: async () => {
            const res = await fetch(`/api/hiq/branding/${storeIdFromQuery}`);
            if (!res.ok) throw new Error("Branding fetch failed");
            const data = await res.json();
            return data;
        },
        enabled: !!storeIdFromQuery
    });

    const brand = brandResponse?.data || {
        themeColor: "#10b981",
        neonColor: "#10b981"
    };

    const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<InsertHiqMember>({
        resolver: zodResolver(insertHiqMemberSchema),
        defaultValues: {
            phone: phoneFromQuery,
            storeId: storeIdFromQuery,
            name: "",
            password: "", // Default
            birthYear: 1980,
            gender: "male",
            handi3c: 0,
            handi4c: 0,
            average: "0.000",
            marketingAgree: false
        },
        mode: "onChange"
    });

    const formData = watch();

    // Single source of truth for whether the current step may advance — drives
    // both the disabled prop and the button styling so they can never disagree.
    const stepValid = !(
        (currentStep === 0 && !(formData as any).name) ||
        (currentStep === 1 && (!(formData as any).password || (formData as any).password.length < 4)) ||
        (currentStep === 2 && (!(formData as any).securityQuestion || !(formData as any).securityAnswer))
    );

    useEffect(() => {
        if (!phoneFromQuery || !storeIdFromQuery) {
            setLocation("/");
        }
    }, [phoneFromQuery, storeIdFromQuery, setLocation]);

    const nextStep = () => {
        if (currentStep < STEPS.length - 1) {
            setCurrentStep(prev => prev + 1);
            window.scrollTo(0, 0);
        }
    };

    const prevStep = () => {
        if (currentStep > 0) {
            setCurrentStep(prev => prev - 1);
        } else {
            setLocation("/");
        }
    };

    const onSubmit = async (data: InsertHiqMember) => {
        setIsSubmitting(true);
        try {
            await apiRequest("/api/hiq/register", {
                method: "POST",
                body: data,
            });
            setIsCompleted(true);
            setTimeout(() => setLocation("/dashboard", { replace: true }), 2500);
        } catch (error) {
            toast({
                variant: "destructive",
                title: "오류",
                description: "회원가입 중 오류가 발생했습니다.",
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isCompleted) {
        return (
            <div className="min-h-screen bg-[#0A0A0A] text-white flex flex-col items-center justify-center px-5 text-center">
                <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="w-24 h-24 rounded-full flex items-center justify-center mb-6 bg-brand/20 border border-brand/50"
                >
                    <LucideCheckCircle2 className="w-16 h-16 text-brand" />
                </motion.div>
                <motion.h1
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-[26px] font-bold tracking-tight mb-4"
                >
                    환영합니다!
                </motion.h1>
                <p className="text-[15px] font-medium text-white/55">당구장 멤버십이 활성화되었습니다.</p>
                <div className="mt-12 flex gap-2">
                    {[1, 2, 3, 4, 5].map(i => (
                        <motion.div
                            key={i}
                            animate={{ y: [0, -20, 0], opacity: [0, 1, 0] }}
                            transition={{ repeat: Infinity, duration: 2, delay: i * 0.3 }}
                            className="text-brand"
                        >
                            <LucideSparkles className="w-6 h-6" />
                        </motion.div>
                    ))}
                </div>
            </div>
        );
    }

    if (isBrandLoading) return null;

    return (
        <div
            className="min-h-screen bg-[#0A0A0A] text-white flex flex-col font-sans overflow-hidden"
            style={{
                ['--hiq-brand-color' as any]: brand.themeColor,
                ['--hiq-brand-neon' as any]: brand.neonColor || brand.themeColor
            }}
        >
            {/* ProgressBar */}
            <div className="flex w-full h-1 bg-white/5">
                {STEPS.map((_, idx) => (
                    <div
                        key={idx}
                        className="flex-1 transition-all duration-700 ease-out"
                        style={{ backgroundColor: idx <= currentStep ? 'rgb(var(--brand))' : "transparent" }}
                    />
                ))}
            </div>

            <div className="p-6 pt-10 flex-1 flex flex-col max-w-md mx-auto w-full relative z-10">
                {/* Header */}
                <div className="mb-12">
                    <motion.div
                        key={currentStep}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                    >
                        <span className="font-semibold text-[13px] mb-2 block text-brand tabular-nums">{currentStep + 1} / {STEPS.length} 단계</span>
                        <h1 className="text-[26px] font-bold tracking-tight mb-3 text-white leading-tight">
                            {STEPS[currentStep].title}
                        </h1>
                        <p className="text-[15px] text-white/55 font-medium">
                            {STEPS[currentStep].desc}
                        </p>
                    </motion.div>
                </div>

                {/* Step Content */}
                <div className="flex-1">
                    <AnimatePresence mode="wait">
                        {currentStep === 0 && (
                            <motion.div
                                key="step0"
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -20 }}
                                className="space-y-8"
                            >
                                <div className="space-y-4">
                                    <Label className="text-sm font-medium text-white/55">성함</Label>
                                    <input
                                        {...register("name")}
                                        placeholder="이름을 입력하세요"
                                        autoFocus
                                        className="w-full bg-transparent border-b-2 border-white/10 focus:border-brand text-center text-3xl font-bold text-white placeholder:text-white/45 py-4 transition-all outline-none"
                                    />
                                    {errors.name && <p className="text-red-400 text-sm font-bold text-center">{errors.name.message}</p>}
                                </div>
                                <div className="space-y-4">
                                    <Label className="text-sm font-medium text-white/55">휴대폰 번호</Label>
                                    <div className="w-full border-b-2 border-white/5 py-4 flex items-center justify-center text-white/55 text-3xl font-bold tabular-nums">
                                        {phoneFromQuery}
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {currentStep === 1 && (
                            <motion.div
                                key="step1" // Password Step
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -20 }}
                                className="space-y-4"
                            >
                                <div className="space-y-4">
                                    <Label className="text-sm font-medium text-white/55">비밀번호 (4자리 이상)</Label>
                                    <input
                                        type="password"
                                        {...register("password")}
                                        placeholder="비밀번호 입력"
                                        autoFocus
                                        className="w-full bg-transparent border-b-2 border-white/10 focus:border-brand text-center text-3xl font-bold text-white placeholder:text-white/45 py-4 transition-all outline-none"
                                    />
                                    {/* Warn if pwd is too short, but usually we just disable 'Next' */}
                                    {formData.password && formData.password.length < 4 && (
                                        <p className="text-red-400 text-sm font-bold text-center">4자리 이상 입력해주세요.</p>
                                    )}
                                </div>
                            </motion.div>
                        )}

                        {currentStep === 2 && (
                            <motion.div
                                key="step_security"
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -20 }}
                                className="space-y-8"
                            >
                                <div className="space-y-4">
                                    <Label className="text-sm font-medium text-white/55 text-center block">질문 선택</Label>
                                    <div className="space-y-2 max-h-[240px] overflow-y-auto pr-2 custom-scrollbar">
                                        {[
                                            "내가 태어난 도시는 어디인가요?",
                                            "가장 기억에 남는 반려동물의 이름은?",
                                            "나의 보물 1호는 무엇인가요?",
                                            "가장 좋아하는 스포츠 팀은?",
                                            "부모님 함자 성함은?"
                                        ].map((q) => (
                                            <Button
                                                key={q}
                                                type="button"
                                                variant="outline"
                                                onClick={() => {
                                                    setValue("securityQuestion", q);
                                                }}
                                                className="w-full justify-start text-left py-6 rounded-tile border-white/5 bg-white/[0.02] hover:bg-white/[0.05]"
                                                style={{
                                                    borderColor: formData.securityQuestion === q ? "rgb(var(--brand))" : "rgba(255,255,255,0.05)",
                                                    color: formData.securityQuestion === q ? "rgb(var(--brand))" : "rgba(255,255,255,0.6)"
                                                }}
                                            >
                                                {q}
                                            </Button>
                                        ))}
                                    </div>
                                </div>
                                <div className="space-y-4">
                                    <Label className="text-sm font-medium text-white/55 text-center block">정답 입력</Label>
                                    <Input
                                        {...register("securityAnswer")}
                                        placeholder="정답을 입력하세요"
                                        className="w-full bg-transparent border-b-2 border-white/10 focus:border-brand text-center text-2xl font-bold text-white placeholder:text-white/45 py-4 transition-all outline-none h-auto rounded-none border-t-0 border-x-0"
                                    />
                                </div>
                            </motion.div>
                        )}

                        {currentStep === 3 && (
                            <motion.div
                                key="step_gender"
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -20 }}
                                className="flex gap-4"
                            >
                                <Button
                                    onClick={() => setValue("gender", "male")}
                                    variant={formData.gender === "male" ? "default" : "outline"}
                                    className="flex-1 h-20 rounded-2xl flex flex-row items-center justify-center gap-3 transition-all"
                                    style={{
                                        backgroundColor: formData.gender === "male" ? "rgb(var(--brand))" : "rgba(255,255,255,0.05)",
                                        color: formData.gender === "male" ? "rgb(var(--brand-fg))" : "rgba(255,255,255,0.55)",
                                        border: formData.gender === "male" ? "none" : "1px solid rgba(255,255,255,0.1)"
                                    }}
                                >
                                    <span className="text-2xl">♂️</span>
                                    <span className="font-bold text-lg">남성</span>
                                </Button>
                                <Button
                                    onClick={() => setValue("gender", "female")}
                                    variant={formData.gender === "female" ? "default" : "outline"}
                                    className="flex-1 h-20 rounded-2xl flex flex-row items-center justify-center gap-3 transition-all"
                                    style={{
                                        backgroundColor: formData.gender === "female" ? "rgb(var(--brand))" : "rgba(255,255,255,0.05)",
                                        color: formData.gender === "female" ? "rgb(var(--brand-fg))" : "rgba(255,255,255,0.55)",
                                        border: formData.gender === "female" ? "none" : "1px solid rgba(255,255,255,0.1)"
                                    }}
                                >
                                    <span className="text-2xl">♀️</span>
                                    <span className="font-bold text-lg">여성</span>
                                </Button>
                            </motion.div>
                        )}

                        {currentStep === 4 && (
                            <motion.div
                                key="step_birth"
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -20 }}
                                className="space-y-6 text-center"
                            >
                                <div className="grid grid-cols-4 gap-3 max-h-[440px] overflow-y-auto p-4 bg-white/5 rounded-2xl border border-white/10 scrollbar-hide">
                                    {Array.from({ length: new Date().getFullYear() - 1950 + 1 }, (_, i) => 1950 + i).reverse().map(year => (
                                        <Button
                                            key={year}
                                            variant={formData.birthYear === year ? "default" : "outline"}
                                            onClick={() => setValue("birthYear", year)}
                                            title={`${year}년생`}
                                            className="h-14 text-lg rounded-tile transition-all tabular-nums"
                                            style={{
                                                backgroundColor: formData.birthYear === year ? "rgb(var(--brand))" : "transparent",
                                                color: formData.birthYear === year ? "rgb(var(--brand-fg))" : "rgba(255,255,255,0.55)",
                                                border: formData.birthYear === year ? "none" : "1px solid rgba(255,255,255,0.1)"
                                            }}
                                        >
                                            {year}
                                        </Button>
                                    ))}
                                </div>
                            </motion.div>
                        )}



                        {currentStep === 5 && (
                            <motion.div
                                key="step_terms"
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -20 }}
                                className="space-y-10"
                            >
                                <div className="bg-white/5 p-8 rounded-card border border-white/10 space-y-8">
                                    <div className="flex items-start gap-4">
                                        <Checkbox
                                            id="essential"
                                            className="w-7 h-7 rounded-lg mt-0.5 border-white/20 data-[state=checked]:bg-brand data-[state=checked]:border-brand"
                                            checked={true}
                                            disabled={true}
                                        />
                                        <Label htmlFor="essential" className="text-[15px] text-white/60 leading-tight">
                                            <span className="text-white font-bold block mb-1">[필수] 개인정보 수집 동의</span>
                                            서비스 이용을 위해 최소한의 정보를 수집합니다.
                                        </Label>
                                    </div>
                                    <div className="flex items-start gap-4">
                                        <Checkbox
                                            id="marketing"
                                            className="w-7 h-7 rounded-lg mt-0.5 border-white/20 data-[state=checked]:bg-brand data-[state=checked]:border-brand"
                                            onCheckedChange={(checked) => setValue("marketingAgree", !!checked)}
                                        />
                                        <Label htmlFor="marketing" className="text-[15px] text-white/60 leading-tight">
                                            <span className="text-white/80 font-bold block mb-1">[선택] 마케팅 정보 수신</span>
                                            매장 이벤트 및 혜택 정보를 보내드려요.
                                        </Label>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Buttons */}
                <div className="flex gap-4 mt-8 pb-10">
                    <Button
                        variant="ghost"
                        onClick={prevStep}
                        className="flex-1 h-16 text-lg font-bold bg-white/5 text-white/55 hover:text-white rounded-2xl border border-white/10 active:scale-95 transition-all"
                    >
                        이전
                    </Button>

                    {currentStep === STEPS.length - 1 ? (
                        <Button
                            onClick={handleSubmit(onSubmit)}
                            disabled={isSubmitting}
                            title="가입 완료"
                            className="flex-[2] h-16 text-xl font-semibold rk-btn-primary rounded-2xl active:scale-95 transition-all"
                        >
                            {isSubmitting ? "처리 중..." : "가입 완료"}
                        </Button>
                    ) : (

                        <Button
                            onClick={nextStep}
                            disabled={!stepValid}
                            title="다음 단계"
                            className={cn(
                                "flex-[2] h-16 text-xl font-semibold rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition-all outline-none",
                                stepValid ? "rk-btn-primary" : "bg-white/5 text-white/45"
                            )}
                        >
                            다음 <LucideChevronRight className="w-6 h-6" />
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}
