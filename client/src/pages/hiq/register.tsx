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

const STEPS = [
    { id: "personal", title: "본인 확인", desc: "당구장에서 사용할 이름을 알려주세요." },
    { id: "gender", title: "성별 선택", desc: "성별에 맞는 랭킹 시스템이 적용됩니다." },
    { id: "birth", title: "출생년도", desc: "연령별 랭킹 산정에 활용됩니다." },
    { id: "score", title: "실력 입력", desc: "평소 치시는 점수(수지)를 입력해주세요." },
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
        themeColor: "#6366f1",
        neonColor: "#818cf8"
    };

    const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<InsertHiqMember>({
        resolver: zodResolver(insertHiqMemberSchema),
        defaultValues: {
            phone: phoneFromQuery,
            storeId: storeIdFromQuery,
            name: "",
            birthYear: 1980,
            gender: "male",
            handi3c: 15,
            handi4c: 150,
            average: "0.5",
            marketingAgree: false
        },
        mode: "onChange"
    });

    const formData = watch();

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
            <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col items-center justify-center p-6 text-center">
                <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="w-24 h-24 rounded-full flex items-center justify-center mb-6 shadow-[0_0_40px_rgba(99,102,241,0.2)]"
                    style={{ backgroundColor: `${brand.themeColor}33`, borderColor: `${brand.themeColor}80`, borderWidth: 1 }}
                >
                    <LucideCheckCircle2 className="w-16 h-16" style={{ color: brand.neonColor || brand.themeColor }} />
                </motion.div>
                <motion.h1
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-4xl font-black mb-4 tracking-tighter"
                >
                    환영합니다!
                </motion.h1>
                <p className="text-xl text-gray-400">당구장 멤버십이 활성화되었습니다.</p>
                <div className="mt-12 flex gap-2">
                    {[1, 2, 3, 4, 5].map(i => (
                        <motion.div
                            key={i}
                            animate={{ y: [0, -20, 0], opacity: [0, 1, 0] }}
                            transition={{ repeat: Infinity, duration: 2, delay: i * 0.3 }}
                            style={{ color: brand.neonColor || brand.themeColor }}
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
            className="min-h-screen bg-[#050505] text-white flex flex-col font-sans overflow-hidden"
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
                        style={{ backgroundColor: idx <= currentStep ? 'var(--hiq-brand-neon)' : "transparent" }}
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
                        <span className="font-bold text-xs uppercase tracking-widest mb-2 block hiq-brand-accent">Step {currentStep + 1} of {STEPS.length}</span>
                        <h1 className="text-4xl font-black mb-3 text-white leading-tight tracking-tighter">
                            {STEPS[currentStep].title}
                        </h1>
                        <p className="text-xl text-white/40 font-medium">
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
                                    <Label className="text-sm font-bold text-white/40 uppercase tracking-wider">성함</Label>
                                    <Input
                                        {...register("name")}
                                        placeholder="이름을 입력하세요"
                                        autoFocus
                                        className="h-16 text-2xl bg-white/5 border-white/10 rounded-2xl focus:border-opacity-50 transition-all placeholder:text-white/10"
                                        style={{ borderColor: `${brand.themeColor}33` }}
                                    />
                                    {errors.name && <p className="text-red-400 text-sm font-bold">{errors.name.message}</p>}
                                </div>
                                <div className="space-y-4">
                                    <Label className="text-sm font-bold text-white/40 uppercase tracking-wider">휴대폰 번호</Label>
                                    <div className="h-16 flex items-center px-4 rounded-2xl bg-white/5 border border-white/10 text-white/30 text-2xl font-mono italic">
                                        {phoneFromQuery}
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {currentStep === 1 && (
                            <motion.div
                                key="step1"
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -20 }}
                                className="flex gap-4"
                            >
                                <Button
                                    onClick={() => setValue("gender", "male")}
                                    variant={formData.gender === "male" ? "default" : "outline"}
                                    className="flex-1 h-32 rounded-[2rem] flex flex-col gap-3 transition-all"
                                    style={{
                                        backgroundColor: formData.gender === "male" ? (brand.neonColor || brand.themeColor) : "rgba(255,255,255,0.05)",
                                        color: formData.gender === "male" ? "#000" : "rgba(255,255,255,0.4)",
                                        border: formData.gender === "male" ? "none" : "1px solid rgba(255,255,255,0.1)",
                                        boxShadow: formData.gender === "male" ? `0 10px 30px ${brand.themeColor}66` : "none"
                                    }}
                                >
                                    <span className="text-4xl">♂️</span>
                                    <span className="font-black text-xl">남성</span>
                                </Button>
                                <Button
                                    onClick={() => setValue("gender", "female")}
                                    variant={formData.gender === "female" ? "default" : "outline"}
                                    className="flex-1 h-32 rounded-[2rem] flex flex-col gap-3 transition-all"
                                    style={{
                                        backgroundColor: formData.gender === "female" ? (brand.neonColor || brand.themeColor) : "rgba(255,255,255,0.05)",
                                        color: formData.gender === "female" ? "#000" : "rgba(255,255,255,0.4)",
                                        border: formData.gender === "female" ? "none" : "1px solid rgba(255,255,255,0.1)",
                                        boxShadow: formData.gender === "female" ? `0 10px 30px ${brand.themeColor}66` : "none"
                                    }}
                                >
                                    <span className="text-4xl">♀️</span>
                                    <span className="font-black text-xl">여성</span>
                                </Button>
                            </motion.div>
                        )}

                        {currentStep === 2 && (
                            <motion.div
                                key="step2"
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -20 }}
                                className="space-y-6 text-center"
                            >
                                <div className="grid grid-cols-4 gap-3 max-h-[440px] overflow-y-auto p-4 bg-white/5 rounded-[2rem] border border-white/10 scrollbar-hide">
                                    {Array.from({ length: 71 }, (_, i) => 1950 + i).reverse().map(year => (
                                        <Button
                                            key={year}
                                            variant={formData.birthYear === year ? "default" : "outline"}
                                            onClick={() => setValue("birthYear", year)}
                                            title={`${year}년생`}
                                            className="h-14 text-lg rounded-xl transition-all"
                                            style={{
                                                backgroundColor: formData.birthYear === year ? (brand.neonColor || brand.themeColor) : "transparent",
                                                color: formData.birthYear === year ? "#000" : "rgba(255,255,255,0.4)",
                                                border: formData.birthYear === year ? "none" : "1px solid rgba(255,255,255,0.1)",
                                                boxShadow: formData.birthYear === year ? `0 0 20px ${brand.themeColor}66` : "none"
                                            }}
                                        >
                                            {year}
                                        </Button>
                                    ))}
                                </div>
                            </motion.div>
                        )}

                        {currentStep === 3 && (
                            <motion.div
                                key="step3"
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -20 }}
                                className="space-y-10"
                            >
                                <div className="space-y-4">
                                    <Label className="text-sm font-bold text-white/40 tracking-wider uppercase flex justify-between">
                                        <span>3구 수지</span>
                                        <span style={{ color: brand.neonColor || brand.themeColor }}>{formData.handi3c} 점</span>
                                    </Label>
                                    <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                                        {[10, 15, 20, 25, 30, 35, 40].map(val => (
                                            <Button
                                                key={val}
                                                onClick={() => setValue("handi3c", val)}
                                                variant={formData.handi3c === val ? "default" : "outline"}
                                                className="flex-none w-16 h-14 text-lg rounded-xl transition-all"
                                                style={{
                                                    backgroundColor: formData.handi3c === val ? (brand.neonColor || brand.themeColor) : "rgba(255,255,255,0.05)",
                                                    color: formData.handi3c === val ? "#000" : "rgba(255,255,255,0.4)",
                                                    border: formData.handi3c === val ? "none" : "1px solid rgba(255,255,255,0.1)",
                                                    boxShadow: formData.handi3c === val ? `0 0 20px ${brand.themeColor}4D` : "none"
                                                }}
                                            >
                                                {val}
                                            </Button>
                                        ))}
                                    </div>
                                    <Input
                                        type="number"
                                        title="3구 핸디캡 직접 입력"
                                        value={formData.handi3c ?? 0}
                                        onChange={(e) => setValue("handi3c", parseInt(e.target.value) || 0)}
                                        className="h-14 text-xl bg-white/5 border-white/10 text-right pr-6"
                                    />
                                </div>

                                <div className="space-y-4">
                                    <Label className="text-sm font-bold text-white/40 tracking-wider uppercase flex justify-between">
                                        <span>4구 수지</span>
                                        <span style={{ color: brand.neonColor || brand.themeColor }}>{formData.handi4c} 점</span>
                                    </Label>
                                    <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                                        {[80, 100, 120, 150, 200, 250, 300, 400, 500].map(val => (
                                            <Button
                                                key={val}
                                                onClick={() => setValue("handi4c", val)}
                                                variant={formData.handi4c === val ? "default" : "outline"}
                                                className="flex-none w-16 h-14 text-lg rounded-xl transition-all"
                                                style={{
                                                    backgroundColor: formData.handi4c === val ? (brand.neonColor || brand.themeColor) : "rgba(255,255,255,0.05)",
                                                    color: formData.handi4c === val ? "#000" : "rgba(255,255,255,0.4)",
                                                    border: formData.handi4c === val ? "none" : "1px solid rgba(255,255,255,0.1)",
                                                    boxShadow: formData.handi4c === val ? `0 0 20px ${brand.themeColor}4D` : "none"
                                                }}
                                            >
                                                {val}
                                            </Button>
                                        ))}
                                    </div>
                                    <Input
                                        type="number"
                                        title="4구 핸디캡 직접 입력"
                                        value={formData.handi4c ?? 0}
                                        onChange={(e) => setValue("handi4c", parseInt(e.target.value) || 0)}
                                        className="h-14 text-xl bg-white/5 border-white/10 text-right pr-6"
                                    />
                                </div>
                            </motion.div>
                        )}

                        {currentStep === 4 && (
                            <motion.div
                                key="step4"
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -20 }}
                                className="space-y-10"
                            >
                                <div className="bg-white/5 p-8 rounded-[2.5rem] border border-white/10 space-y-8">
                                    <div className="flex items-start gap-4">
                                        <Checkbox
                                            id="essential"
                                            className="w-7 h-7 rounded-lg mt-0.5 border-white/20 data-[state=checked]:border-none"
                                            style={{ backgroundColor: brand.themeColor }}
                                            checked={true}
                                            disabled={true}
                                        />
                                        <Label htmlFor="essential" className="text-lg text-white/60 leading-tight">
                                            <span className="text-white font-black block mb-1">[필수] 개인정보 수집 동의</span>
                                            서비스 이용을 위해 최소한의 정보를 수집합니다.
                                        </Label>
                                    </div>
                                    <div className="flex items-start gap-4">
                                        <Checkbox
                                            id="marketing"
                                            className="w-7 h-7 rounded-lg mt-0.5 border-white/20 data-[state=checked]:border-none"
                                            style={{ backgroundColor: brand.themeColor }}
                                            onCheckedChange={(checked) => setValue("marketingAgree", !!checked)}
                                        />
                                        <Label htmlFor="marketing" className="text-lg text-white/60 leading-tight">
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
                        className="flex-1 h-16 text-lg font-bold bg-white/5 text-white/40 hover:text-white rounded-2xl border border-white/5 active:scale-95 transition-all"
                    >
                        이전
                    </Button>

                    {currentStep === STEPS.length - 1 ? (
                        <Button
                            onClick={handleSubmit(onSubmit)}
                            disabled={isSubmitting}
                            title="가입 완료"
                            className="flex-[2] h-16 text-xl font-black text-white rounded-2xl active:scale-95 transition-all"
                            style={{
                                backgroundColor: 'var(--hiq-brand-color)',
                                boxShadow: `0 10px 30px var(--hiq-brand-color)33`
                            }}
                        >
                            {isSubmitting ? "처리 중..." : "가입 완료"}
                        </Button>
                    ) : (
                        <Button
                            onClick={nextStep}
                            disabled={currentStep === 0 && !formData.name}
                            title="다음 단계"
                            className="flex-[2] h-16 text-xl font-black bg-white text-black hover:bg-white/90 rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition-all"
                        >
                            다음 <LucideChevronRight className="w-6 h-6" />
                        </Button>
                    )}
                </div>
            </div>

            {/* Ambient Background Glow */}
            <div
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[100vw] h-[100vw] rounded-full blur-[120px] pointer-events-none z-0 opacity-[0.05]"
                style={{ backgroundColor: 'var(--hiq-brand-color)' }}
            />
        </div>
    );
}
