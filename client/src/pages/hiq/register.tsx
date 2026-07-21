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
import { LucideChevronRight, LucideCheckCircle2, LucideSparkles } from "@/lib/icons";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

const STEPS = [
    { id: "personal", title: "register.stepPersonalTitle", desc: "register.stepPersonalDesc" },
    { id: "password", title: "register.stepPasswordTitle", desc: "register.stepPasswordDesc" },
    { id: "security", title: "register.stepSecurityTitle", desc: "register.stepSecurityDesc" },
    { id: "terms", title: "register.stepTermsTitle", desc: "register.stepTermsDesc" }
];

// 보안 질문 — value는 서버 저장값(원문 유지), key는 화면 표시용 번역 키
const SECURITY_QUESTIONS = [
    { value: "내가 태어난 도시는 어디인가요?", key: "register.secQ1" },
    { value: "가장 기억에 남는 반려동물의 이름은?", key: "register.secQ2" },
    { value: "나의 보물 1호는 무엇인가요?", key: "register.secQ3" },
    { value: "가장 좋아하는 스포츠 팀은?", key: "register.secQ4" },
    { value: "부모님 함자 성함은?", key: "register.secQ5" }
];

export default function HiqRegister() {
    const { t } = useT();
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
        themeColor: "#006241",
        neonColor: "#006241"
    };

    const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<InsertHiqMember>({
        resolver: zodResolver(insertHiqMemberSchema),
        defaultValues: {
            phone: phoneFromQuery,
            storeId: storeIdFromQuery,
            name: "",
            password: "", // Default
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
                title: t("register.errorTitle"),
                description: t("register.errorDesc"),
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isCompleted) {
        return (
            <div className="min-h-screen bg-[#f2f0eb] text-[rgba(0,0,0,0.87)] flex flex-col items-center justify-center px-5 text-center">
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
                    {t("register.welcome")}
                </motion.h1>
                <p className="text-[15px] font-medium text-black/55">{t("register.membershipActivated")}</p>
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
            className="min-h-screen bg-[#f2f0eb] text-[rgba(0,0,0,0.87)] flex flex-col font-sans overflow-hidden"
            style={{
                ['--hiq-brand-color' as any]: brand.themeColor,
                ['--hiq-brand-neon' as any]: brand.neonColor || brand.themeColor
            }}
        >
            {/* ProgressBar */}
            <div className="flex w-full h-1 bg-black/[0.06]">
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
                        <span className="font-semibold text-[13px] mb-2 block text-brand tabular-nums">{currentStep + 1} / {STEPS.length} {t("register.stepSuffix")}</span>
                        <h1 className="text-[26px] font-bold tracking-tight mb-3 text-[rgba(0,0,0,0.87)] leading-tight">
                            {t(STEPS[currentStep].title)}
                        </h1>
                        <p className="text-[15px] text-black/55 font-medium">
                            {t(STEPS[currentStep].desc)}
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
                                    <Label className="text-sm font-medium text-black/55">{t("register.nameLabel")}</Label>
                                    <input
                                        {...register("name")}
                                        placeholder={t("register.namePlaceholder")}
                                        autoFocus
                                        className="w-full bg-transparent border-b-2 border-black/10 focus:border-brand text-center text-3xl font-bold text-[rgba(0,0,0,0.87)] placeholder:text-black/40 py-4 transition-all outline-none"
                                    />
                                    {errors.name && <p className="text-red-500 text-sm font-bold text-center">{errors.name.message}</p>}
                                </div>
                                <div className="space-y-4">
                                    <Label className="text-sm font-medium text-black/55">{t("register.phoneLabel")}</Label>
                                    <div className="w-full border-b-2 border-black/10 py-4 flex items-center justify-center text-black/55 text-3xl font-bold tabular-nums">
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
                                    <Label className="text-sm font-medium text-black/55">{t("register.passwordLabel")}</Label>
                                    <input
                                        type="password"
                                        {...register("password")}
                                        placeholder={t("register.passwordPlaceholder")}
                                        autoFocus
                                        className="w-full bg-transparent border-b-2 border-black/10 focus:border-brand text-center text-3xl font-bold text-[rgba(0,0,0,0.87)] placeholder:text-black/40 py-4 transition-all outline-none"
                                    />
                                    {/* Warn if pwd is too short, but usually we just disable 'Next' */}
                                    {formData.password && formData.password.length < 4 && (
                                        <p className="text-red-500 text-sm font-bold text-center">{t("register.passwordTooShort")}</p>
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
                                    <Label className="text-sm font-medium text-black/55 text-center block">{t("register.securityQuestionLabel")}</Label>
                                    <div className="space-y-2 max-h-[240px] overflow-y-auto pr-2 custom-scrollbar">
                                        {SECURITY_QUESTIONS.map((q) => (
                                            <Button
                                                key={q.key}
                                                type="button"
                                                variant="outline"
                                                onClick={() => {
                                                    setValue("securityQuestion", q.value);
                                                }}
                                                className="w-full justify-start text-left py-6 rounded-tile border-black/[0.08] bg-black/[0.04] hover:bg-black/[0.06]"
                                                style={{
                                                    borderColor: formData.securityQuestion === q.value ? "rgb(var(--brand))" : "rgba(0,0,0,0.10)",
                                                    color: formData.securityQuestion === q.value ? "rgb(var(--brand))" : "rgba(0,0,0,0.6)"
                                                }}
                                            >
                                                {t(q.key)}
                                            </Button>
                                        ))}
                                    </div>
                                </div>
                                <div className="space-y-4">
                                    <Label className="text-sm font-medium text-black/55 text-center block">{t("register.securityAnswerLabel")}</Label>
                                    <Input
                                        {...register("securityAnswer")}
                                        placeholder={t("register.securityAnswerPlaceholder")}
                                        className="w-full bg-transparent border-b-2 border-black/10 focus:border-brand text-center text-2xl font-bold text-[rgba(0,0,0,0.87)] placeholder:text-black/40 py-4 transition-all outline-none h-auto rounded-none border-t-0 border-x-0"
                                    />
                                </div>
                            </motion.div>
                        )}

                        {currentStep === 3 && (
                            <motion.div
                                key="step_terms"
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -20 }}
                                className="space-y-10"
                            >
                                <div className="bg-white p-8 rounded-card shadow-[0_1px_2px_rgba(0,0,0,0.06)] space-y-8">
                                    <div className="flex items-start gap-4">
                                        <Checkbox
                                            id="essential"
                                            className="w-7 h-7 rounded-lg mt-0.5 border-black/20 data-[state=checked]:bg-brand data-[state=checked]:border-brand"
                                            checked={true}
                                            disabled={true}
                                        />
                                        <Label htmlFor="essential" className="text-[15px] text-black/60 leading-tight">
                                            <span className="text-[rgba(0,0,0,0.87)] font-bold block mb-1">{t("register.termsRequiredTitle")}</span>
                                            {t("register.termsRequiredDesc")}
                                        </Label>
                                    </div>
                                    <div className="flex items-start gap-4">
                                        <Checkbox
                                            id="marketing"
                                            className="w-7 h-7 rounded-lg mt-0.5 border-black/20 data-[state=checked]:bg-brand data-[state=checked]:border-brand"
                                            onCheckedChange={(checked) => setValue("marketingAgree", !!checked)}
                                        />
                                        <Label htmlFor="marketing" className="text-[15px] text-black/60 leading-tight">
                                            <span className="text-black/70 font-bold block mb-1">{t("register.termsMarketingTitle")}</span>
                                            {t("register.termsMarketingDesc")}
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
                        className="flex-1 h-16 text-lg font-bold bg-black/[0.04] text-black/55 hover:text-[rgba(0,0,0,0.87)] rounded-2xl active:scale-95 transition-all"
                    >
                        {t("register.prev")}
                    </Button>

                    {currentStep === STEPS.length - 1 ? (
                        <Button
                            onClick={handleSubmit(onSubmit)}
                            disabled={isSubmitting}
                            title={t("register.submit")}
                            className="flex-[2] h-16 text-xl font-semibold rk-btn-primary rounded-2xl active:scale-95 transition-all"
                        >
                            {isSubmitting ? t("register.submitting") : t("register.submit")}
                        </Button>
                    ) : (

                        <Button
                            onClick={nextStep}
                            disabled={!stepValid}
                            title={t("register.nextStepTitle")}
                            className={cn(
                                "flex-[2] h-16 text-xl font-semibold rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition-all outline-none",
                                stepValid ? "rk-btn-primary" : "bg-black/[0.06] text-black/40"
                            )}
                        >
                            {t("register.next")} <LucideChevronRight className="w-6 h-6" />
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}
