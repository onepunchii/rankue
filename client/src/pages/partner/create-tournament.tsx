
import { useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { cn } from "@/lib/utils";
import {
    Form, FormControl, FormField, FormItem, FormLabel, FormMessage
} from "@/components/ui/form";
import {
    LucideArrowLeft, LucideCalendar, LucideTrophy, LucideUsers,
    LucideDollarSign, LucideCheckCircle, LucideSparkles, LucideClock
} from "@/lib/icons";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// Validation Schema
const formSchema = z.object({
    title: z.string().min(1, "대회명은 필수입니다"),
    startDate: z.date({ required_error: "시작 날짜를 선택해주세요" }),
    startTime: z.string().min(1, "시작 시간을 선택해주세요"),
    gameType: z.enum(["3c", "4c"]),
    maxPlayers: z.string(), // Input is text/number, convert later
    entryFee: z.string(),
    prize1: z.string(),
    prize2: z.string(),
    prize3: z.string().optional(),
    matchMethod: z.enum(["handicap", "fixed"]),
    handicapRate: z.string(),
    targetScore: z.string().optional(),
    bankShotPoint: z.string(),
    timeLimit: z.string(),
});

type FormValues = z.infer<typeof formSchema>;

export default function CreateTournament() {
    const [, setLocation] = useLocation();
    const { toast } = useToast();
    const [step, setStep] = useState(1);

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            title: "",
            startDate: new Date(),
            startTime: "13:00",
            gameType: "3c",
            maxPlayers: "32",
            entryFee: "30000",
            prize1: "300000",
            prize2: "100000",
            prize3: "",
            matchMethod: "handicap",
            handicapRate: "100",
            targetScore: "20",
            bankShotPoint: "2",
            timeLimit: "40"
        }
    });

    const onSubmit = async (values: FormValues) => {
        try {
            // Transform data for backend
            const combinedDate = new Date(values.startDate);
            const [hours, minutes] = values.startTime.split(':').map(Number);
            combinedDate.setHours(hours, minutes);

            const payload = {
                title: values.title,
                startDate: combinedDate.toISOString(),
                endDate: combinedDate.toISOString(), // Same day default
                recruitEnd: new Date(combinedDate.getTime() - 86400000).toISOString(), // 1 day before default
                gameType: values.gameType,
                maxPlayers: parseInt(values.maxPlayers),
                entryFee: parseInt(values.entryFee),
                prizes: {
                    first: values.prize1,
                    second: values.prize2,
                    third: values.prize3
                },
                matchMethod: values.matchMethod,
                handicapRate: values.matchMethod === "handicap" ? parseInt(values.handicapRate) : 100,
                targetScore: values.matchMethod === "fixed" ? parseInt(values.targetScore || "0") : null,
                bankShotPoint: parseInt(values.bankShotPoint),
                timeLimit: parseInt(values.timeLimit),
                content: `제1회 ${values.title}에 여러분을 초대합니다!`,
                posterUrl: "https://example.com/poster_placeholder.png"
            };

            await apiRequest("/api/hiq/partner/tournaments", { method: "POST", body: payload });

            toast({
                title: "대회 생성 완료!",
                description: "멋진 대회가 만들어졌습니다.",
            });
            setLocation("/partner/dashboard");
        } catch (e) {
            toast({
                title: "오류 발생",
                description: "대회를 생성하지 못했습니다.",
                variant: "destructive"
            });
        }
    };

    // Step Rendering
    const renderStep = () => {
        switch (step) {
            case 1:
                return (
                    <motion.div
                        key="step1"
                        initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                        className="space-y-6"
                    >
                        <div className="text-center mb-8">
                            <div className="w-16 h-16 bg-[#006241]/10 rounded-full flex items-center justify-center mx-auto mb-4">
                                <LucideCalendar className="w-8 h-8 text-[#006241]" />
                            </div>
                            <h2 className="text-xl font-bold text-[rgba(0,0,0,0.87)]">언제 하시나요?</h2>
                            <p className="text-black/55 text-sm">대회 일정과 이름을 정해주세요.</p>
                        </div>

                        <FormField
                            control={form.control}
                            name="title"
                            render={({ field }) => (
                                <FormItem className="space-y-1">
                                    <FormLabel className="text-[10px] text-black/55 font-bold ml-1 uppercase">Tournament Title</FormLabel>
                                    <FormControl>
                                        <Input
                                            placeholder="대회명을 입력하세요"
                                            {...field}
                                            className="bg-transparent border-t-0 border-x-0 border-b border-black/[0.12] rounded-none px-1 h-12 text-lg font-black focus-visible:ring-0 focus-visible:border-[#006241] transition-colors placeholder:text-black/30"
                                        />
                                    </FormControl>
                                    <FormMessage className="text-[#006241] text-[10px]" />
                                </FormItem>
                            )}
                        />

                        <div className="grid grid-cols-[1.5fr_1fr] gap-4">
                            <FormField
                                control={form.control}
                                name="startDate"
                                render={({ field }) => (
                                    <FormItem className="space-y-1 flex flex-col">
                                        <FormLabel className="text-[10px] text-black/55 font-bold ml-1 uppercase flex items-center gap-1">
                                            <LucideCalendar className="w-3 h-3" /> Date
                                        </FormLabel>
                                        <Popover>
                                            <PopoverTrigger asChild>
                                                <FormControl>
                                                    <Button
                                                        variant={"ghost"}
                                                        className={cn(
                                                            "w-full pl-1 text-left font-black border-b border-black/[0.12] rounded-none h-12 hover:bg-transparent hover:text-[rgba(0,0,0,0.87)] px-1 justify-start text-base",
                                                            !field.value && "text-black/40"
                                                        )}
                                                    >
                                                        {field.value ? (
                                                            format(field.value, "PPP", { locale: ko })
                                                        ) : (
                                                            <span>날짜 선택</span>
                                                        )}
                                                    </Button>
                                                </FormControl>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-auto p-0 bg-white border-black/[0.08]" align="start">
                                                <Calendar
                                                    mode="single"
                                                    selected={field.value}
                                                    onSelect={field.onChange}
                                                    disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                                                    initialFocus
                                                    className="p-3 pointer-events-auto text-[rgba(0,0,0,0.87)]"
                                                />
                                            </PopoverContent>
                                        </Popover>
                                        <FormMessage className="text-[#006241] text-[10px]" />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="startTime"
                                render={({ field }) => (
                                    <FormItem className="space-y-1">
                                        <FormLabel className="text-[10px] text-black/55 font-bold ml-1 uppercase flex items-center gap-1">
                                            <LucideClock className="w-3 h-3" /> Time
                                        </FormLabel>
                                        <FormControl>
                                            <Input
                                                type="time"
                                                {...field}
                                                style={{ colorScheme: "light" }}
                                                className="bg-transparent border-t-0 border-x-0 border-b border-black/[0.12] rounded-none px-1 h-14 text-2xl font-black focus-visible:ring-0 focus-visible:border-[#006241] transition-colors"
                                            />
                                        </FormControl>
                                        <FormMessage className="text-[#006241] text-[10px]" />
                                    </FormItem>
                                )}
                            />
                        </div>

                        <Button type="button" onClick={() => setStep(2)} className="w-full h-16 bg-[#006241] hover:bg-[#00553a] text-white text-lg font-black rounded-full mt-8 shadow-[0_1px_2px_rgba(0,0,0,0.06)] transition-all transform active:scale-95">
                            다음으로
                        </Button>
                    </motion.div>
                );
            case 2:
                const matchMethod = form.watch("matchMethod");
                return (
                    <motion.div
                        key="step2"
                        initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                        className="space-y-6"
                    >
                        <div className="text-center mb-6">
                            <div className="w-16 h-16 bg-[#006241]/10 rounded-full flex items-center justify-center mx-auto mb-4">
                                <LucideTrophy className="w-8 h-8 text-[#006241]" />
                            </div>
                            <h2 className="text-xl font-bold text-[rgba(0,0,0,0.87)]">규칙을 설정해주세요</h2>
                            <p className="text-black/55 text-sm">종목과 진행 방식을 상세하게 정해주세요.</p>
                        </div>

                        {/* 1. Game Type */}
                        <FormField
                            control={form.control}
                            name="gameType"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>종목</FormLabel>
                                    <div className="grid grid-cols-2 gap-3">
                                        <button type="button" onClick={() => field.onChange("3c")} className={`p-3 rounded-xl border-2 text-center transition-all ${field.value === "3c" ? "border-[#006241] bg-[#006241]/10 text-[#006241]" : "border-black/[0.08] bg-black/[0.04] text-black/55"}`}>
                                            <span className="font-bold">3쿠션</span>
                                        </button>
                                        <button type="button" onClick={() => field.onChange("4c")} className={`p-3 rounded-xl border-2 text-center transition-all ${field.value === "4c" ? "border-[#006241] bg-[#006241]/10 text-[#006241]" : "border-black/[0.08] bg-black/[0.04] text-black/55"}`}>
                                            <span className="font-bold">4구</span>
                                        </button>
                                    </div>
                                </FormItem>
                            )}
                        />

                        {/* 2. Match Method */}
                        <FormField
                            control={form.control}
                            name="matchMethod"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>진행 방식</FormLabel>
                                    <div className="grid grid-cols-2 gap-3">
                                        <button type="button" onClick={() => field.onChange("handicap")} className={`p-4 rounded-xl border-2 text-center cursor-pointer transition-all ${field.value === "handicap" ? "border-[#006241] bg-[#006241]/10 text-[#006241]" : "border-black/[0.08] bg-black/[0.04] text-black/55"}`}>
                                            <span className="font-black text-lg block">핸디캡 적용</span>
                                            <span className="text-xs">점수차등</span>
                                        </button>
                                        <button type="button" onClick={() => field.onChange("fixed")} className={`p-4 rounded-xl border-2 text-center cursor-pointer transition-all ${field.value === "fixed" ? "border-[#006241] bg-[#006241]/10 text-[#006241]" : "border-black/[0.08] bg-black/[0.04] text-black/55"}`}>
                                            <span className="font-black text-lg block">점수제</span>
                                            <span className="text-xs">고정점수</span>
                                        </button>
                                    </div>
                                </FormItem>
                            )}
                        />

                        {/* 3. Detailed Logic (Mapped to Method) */}
                        {matchMethod === "handicap" ? (
                            <FormField
                                control={form.control}
                                name="handicapRate"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-[#006241]">핸디캡 적용 비율 (%)</FormLabel>
                                        <FormControl>
                                            <Input type="number" {...field} className="bg-black/[0.04] border-[#006241]/30 ring-[#006241]/20 h-12 text-lg font-bold text-center" />
                                        </FormControl>
                                        <p className="text-xs text-black/55 text-center">예: 70% 설정 시 20점 → 14점 경기</p>
                                    </FormItem>
                                )}
                            />
                        ) : (
                            <FormField
                                control={form.control}
                                name="targetScore"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-[#006241]">목표 점수 (점)</FormLabel>
                                        <FormControl>
                                            <Input type="number" {...field} placeholder="20" className="bg-black/[0.04] border-[#006241]/30 ring-[#006241]/20 h-12 text-lg font-bold text-center" />
                                        </FormControl>
                                        <p className="text-xs text-black/55 text-center">모든 참가자가 동일한 점수로 경기합니다.</p>
                                    </FormItem>
                                )}
                            />
                        )}

                        {/* 4. Common Rules */}
                        <div className="grid grid-cols-2 gap-3">
                            <FormField
                                control={form.control}
                                name="bankShotPoint"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>뱅크샷 점수</FormLabel>
                                        <div className="flex bg-black/[0.04] rounded-lg p-1 ">
                                            {["1", "2"].map(pt => (
                                                <button key={pt} type="button" onClick={() => field.onChange(pt)} className={`flex-1 py-2 rounded-md text-sm font-bold ${field.value === pt ? "bg-black/[0.06] text-[rgba(0,0,0,0.87)]" : "text-black/40"}`}>
                                                    {pt}점
                                                </button>
                                            ))}
                                        </div>
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="timeLimit"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>제한 시간 (분)</FormLabel>
                                        <FormControl>
                                            <Input type="number" {...field} className="bg-black/[0.04] border-black/[0.08] h-11 text-center" />
                                        </FormControl>
                                    </FormItem>
                                )}
                            />
                        </div>

                        {/* 5. Capacity */}
                        <FormField
                            control={form.control}
                            name="maxPlayers"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>모집 인원 (강)</FormLabel>
                                    <div className="grid grid-cols-3 gap-2">
                                        {["16", "32", "64"].map(num => (
                                            <button
                                                key={num}
                                                type="button"
                                                onClick={() => field.onChange(num)}
                                                className={`p-3 rounded-xl border text-center cursor-pointer ${field.value === num ? "border-[#006241] bg-[#006241]/10 text-[#006241] font-bold" : "border-black/[0.08] bg-black/[0.04] text-black/55 border-dashed"}`}
                                            >
                                                {num}강
                                            </button>
                                        ))}
                                    </div>
                                </FormItem>
                            )}
                        />
                        <div className="flex gap-3 mt-4">
                            <Button type="button" variant="outline" onClick={() => setStep(1)} className="flex-1 h-14 border-black/10 text-[rgba(0,0,0,0.87)] hover:bg-black/[0.04]">이전</Button>
                            <Button type="button" onClick={() => setStep(3)} className="flex-[2] h-14 bg-[#006241] hover:bg-[#00553a] text-white font-bold">다음으로</Button>
                        </div>
                    </motion.div>
                );
            case 3:
                return (
                    <motion.div
                        key="step3"
                        initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                        className="space-y-6"
                    >
                        <div className="text-center mb-8">
                            <div className="w-16 h-16 bg-[#cba258]/[0.12] rounded-full flex items-center justify-center mx-auto mb-4">
                                <LucideDollarSign className="w-8 h-8 text-[#cba258]" />
                            </div>
                            <h2 className="text-xl font-bold text-[rgba(0,0,0,0.87)]">상금은 얼마인가요?</h2>
                            <p className="text-black/55 text-sm">가장 중요한 참가비와 상금을 정해주세요.</p>
                        </div>

                        <FormField
                            control={form.control}
                            name="entryFee"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>참가비 (원)</FormLabel>
                                    <FormControl>
                                        <Input type="number" {...field} className="bg-black/[0.04] border-black/[0.08] h-12" />
                                    </FormControl>
                                </FormItem>
                            )}
                        />
                        <div className="space-y-3">
                            <FormField
                                control={form.control}
                                name="prize1"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-[#cba258]">🥇 1등 상금/상품</FormLabel>
                                        <FormControl>
                                            <Input {...field} className="bg-black/[0.04] border-black/[0.08]" />
                                        </FormControl>
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="prize2"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-black/55">🥈 2등 상금/상품</FormLabel>
                                        <FormControl>
                                            <Input {...field} className="bg-black/[0.04] border-black/[0.08]" />
                                        </FormControl>
                                    </FormItem>
                                )}
                            />
                        </div>

                        <div className="flex gap-3 mt-4">
                            <Button type="button" variant="outline" onClick={() => setStep(2)} className="flex-1 h-14 border-black/10 text-[rgba(0,0,0,0.87)] hover:bg-black/[0.04]">이전</Button>
                            <Button type="button" onClick={() => setStep(4)} className="flex-[2] h-14 bg-[#006241] hover:bg-[#00553a] text-white font-bold">다음으로</Button>
                        </div>
                    </motion.div>
                );
            case 4:
                return (
                    <motion.div
                        key="step4"
                        initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                        className="text-center space-y-6"
                    >
                        <div className="w-20 h-20 bg-[#006241] rounded-full flex items-center justify-center mx-auto mb-6 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
                            <LucideSparkles className="w-10 h-10 text-white" />
                        </div>
                        <h2 className="text-2xl font-black text-[rgba(0,0,0,0.87)]">대회 포스터 완성!</h2>
                        <p className="text-black/60 text-sm mb-6">아래 내용으로 대회를 생성할까요?</p>

                        {/* Mock Poster Card */}
                        <div className="bg-gradient-to-b from-[#1a1a1a] to-black rounded-2xl p-6 relative overflow-hidden group">
                            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-teal-500/10 opacity-50 group-hover:opacity-100 transition-opacity" />
                            <div className="relative z-10 space-y-4">
                                <div className="flex flex-wrap gap-2">
                                    <span className="inline-block px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-500 text-xs font-bold">
                                        {form.getValues("gameType") === "3c" ? "3쿠션" : "4구"}
                                    </span>
                                    <span className="inline-block px-3 py-1 rounded-full bg-white/10 text-white/70 text-xs font-bold ">
                                        {form.getValues("matchMethod") === "handicap" ? `핸디캡 ${form.getValues("handicapRate")}%` : `${form.getValues("targetScore")}점 고정`}
                                    </span>
                                    <span className="inline-block px-3 py-1 rounded-full bg-white/10 text-white/70 text-xs font-bold ">
                                        {form.getValues("timeLimit")}분 / 뱅크{form.getValues("bankShotPoint")}
                                    </span>
                                </div>
                                <h3 className="text-2xl font-black text-white leading-tight break-keep">{form.getValues("title")}</h3>
                                <div className="text-sm text-white/60 space-y-1">
                                    <p>{format(new Date(form.getValues("startDate")), "PPP", { locale: ko })} {form.getValues("startTime")}</p>
                                    <p>총 {form.getValues("maxPlayers")}강 / 참가비 {parseInt(form.getValues("entryFee")).toLocaleString()}원</p>
                                </div>
                                <div className="pt-4 border-t border-white/10">
                                    <p className="text-yellow-500 font-bold">🥇 우승: {form.getValues("prize1")}</p>
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-3 mt-8">
                            <Button type="button" variant="outline" onClick={() => setStep(3)} className="flex-1 h-14 border-black/10 text-[rgba(0,0,0,0.87)] hover:bg-black/[0.04]">수정하기</Button>
                            <Button type="submit" className="flex-[2] h-14 bg-[#006241] hover:bg-[#00553a] text-white font-bold rounded-full shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
                                <LucideCheckCircle className="w-5 h-5 mr-2" />
                                대회 생성하기
                            </Button>
                        </div>
                    </motion.div>
                );
        }
    };

    return (
        <div className="min-h-screen bg-[#f2f0eb] text-[rgba(0,0,0,0.87)] font-sans pb-10">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-black/10 sticky top-0 bg-[#f2f0eb] z-10">
                <Button variant="ghost" className="text-[rgba(0,0,0,0.87)] p-0 hover:bg-transparent" onClick={() => setLocation("/partner/dashboard")}>
                    <LucideArrowLeft className="w-6 h-6" />
                </Button>
                <div className="flex gap-1.5 align-center">
                    {[1, 2, 3, 4].map(s => (
                        <div key={s} className={`h-1.5 rounded-full transition-all duration-300 ${s <= step ? "w-8 bg-[#006241]" : "w-2 bg-black/10"}`} />
                    ))}
                </div>
                <div className="w-6" />
            </div>

            <div className="p-6 max-w-md mx-auto">
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="h-full">
                        <AnimatePresence mode="wait">
                            {renderStep()}
                        </AnimatePresence>
                    </form>
                </Form>
            </div>
        </div>
    );
}
