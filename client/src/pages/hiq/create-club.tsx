import { useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
    LucideChevronLeft,
    LucideCheck,
    LucideSearch,
    LucideMapPin,
    LucideTrophy,
    LucideStar,
    LucideZap,
    LucideCrown,
    LucideTarget,
    LucideSwords,
    LucideFlag,
    LucideUsers,
    LucideGhost,
    LucideSmile,
    LucideTent,
    LucideCamera,
    LucideImagePlus
} from "lucide-react";
import { InsertHiqCrew, HiqMember } from "@shared/schema";
import { useSport } from "@/contexts/SportContext";
import { cn } from "@/lib/utils";

const EMBLEMS = [
    { id: "trophy", icon: LucideTrophy, color: "text-yellow-400" },
    { id: "crown", icon: LucideCrown, color: "text-orange-400" },
    { id: "star", icon: LucideStar, color: "text-purple-400" },
    { id: "zap", icon: LucideZap, color: "text-blue-400" },
    { id: "target", icon: LucideTarget, color: "text-red-400" },
    { id: "swords", icon: LucideSwords, color: "text-slate-400" },
    { id: "flag", icon: LucideFlag, color: "text-green-400" },
    { id: "tent", icon: LucideTent, color: "text-emerald-400" },
    { id: "users", icon: LucideUsers, color: "text-pink-400" },
    { id: "ghost", icon: LucideGhost, color: "text-indigo-400" },
    { id: "smile", icon: LucideSmile, color: "text-cyan-400" },
];

const STEPS = [
    { id: 1, title: "크루 정체성", subtitle: "우리 크루의 이름과 얼굴을 정해주세요" },
    { id: 2, title: "베이스 캠프", subtitle: "주로 모이는 단골 구장이 있나요?" },
    { id: 3, title: "활동 성향", subtitle: "어떤 분들과 함께하고 싶으신가요?" },
];

export default function CreateClub() {
    const [_, setLocation] = useLocation();
    const { data: member } = useQuery<HiqMember>({ queryKey: ["/api/hiq/me"] });
    const { toast } = useToast();
    const [step, setStep] = useState(1);
    const [searchQuery, setSearchQuery] = useState("");
    const { currentSport } = useSport();

    const [formData, setFormData] = useState<Partial<InsertHiqCrew>>({
        name: "",
        shortIntro: "",
        description: "",
        meetingDay: "매주 토요일",
        meetingTime: "오후 2시",
        emblem: "",
        coverImage: "",
        gameType: "any",
        region: "",
        joinType: "auto",
        maxMembers: 20,
        tags: [],
    });

    // Store Selection State
    const [selectedStore, setSelectedStore] = useState<any>(null);

    // Mutation
    const createCrewMutation = useMutation({
        mutationFn: async (data: InsertHiqCrew) => {
            return await apiRequest("/api/hiq/crews", {
                method: "POST",
                body: data
            });
        },
        onSuccess: () => {
            toast({
                title: "크루 생성 완료! 🎉",
                description: "새로운 크루가 시작되었습니다.",
            });
            queryClient.invalidateQueries({ queryKey: ["/api/hiq/crews"] });
            setLocation("/club");
        },
        onError: (error: Error) => {
            toast({
                title: "생성 실패",
                description: error.message,
                variant: "destructive",
            });
        }
    });

    // Validations
    const isStep1Valid = formData.name?.trim().length! > 0;
    const isStep2Valid = true; // Optional
    const isStep3Valid = formData.region?.trim().length! > 0; // Simple check

    // Handlers
    const handleNext = () => {
        if (step === 1 && !isStep1Valid) {
            toast({ title: "크루 이름을 입력해주세요", variant: "destructive" });
            return;
        }
        if (step < 3) setStep(step + 1);
        else handleSubmit();
    };

    const handleSubmit = () => {
        if (!member) return;

        createCrewMutation.mutate({
            ...formData as InsertHiqCrew,
            leaderId: member.id,
            baseStoreId: selectedStore?.id || null, // Optional
            tags: formData.tags || [],
            sportCategory: currentSport,
        });
    };

    // Store Search Query
    const { data: storeResults } = useQuery({
        queryKey: ["/api/hiq/stores/search", searchQuery],
        queryFn: async () => {
            if (searchQuery.length < 2) return [];
            return await apiRequest(`/api/hiq/stores/search?q=${searchQuery}`);
        },
        enabled: searchQuery.length >= 2,
    });

    const toggleTag = (tag: string) => {
        const currentTags = (formData.tags as string[]) || [];
        if (currentTags.includes(tag)) {
            setFormData({ ...formData, tags: currentTags.filter(t => t !== tag) });
        } else {
            if (currentTags.length >= 3) return; // Max 3 tags
            setFormData({ ...formData, tags: [...currentTags, tag] });
        }
    };

    return (
        <div className="min-h-screen bg-[#0f0f0f] text-white font-sans pb-10">
            {/* Header */}
            <div className="sticky top-0 z-10 bg-[#0f0f0f]/80 backdrop-blur-xl border-b border-white/5 px-6 py-4 flex items-center justify-between">
                <Button variant="ghost" className="p-0 h-auto text-white/60 hover:text-white" onClick={() => step > 1 ? setStep(step - 1) : setLocation("/club")}>
                    <LucideChevronLeft className="w-6 h-6" />
                </Button>
                <div className="text-sm font-bold text-white/80">
                    Step {step} / 3
                </div>
                <div className="w-6" /> {/* Spacer */}
            </div>

            <div className="max-w-md mx-auto px-6 py-8">
                {/* Progress Bar */}
                <div className="h-1 bg-white/10 rounded-full mb-8">
                    <motion.div
                        className={cn("h-full rounded-full", currentSport === "GOLF" ? "bg-[#84cc16]" : "bg-[#10b981]")}
                        initial={{ width: "33%" }}
                        animate={{ width: `${(step / 3) * 100}%` }}
                    />
                </div>

                <div className="mb-8">
                    <h1 className="text-2xl font-bold mb-2">{STEPS[step - 1].title}</h1>
                    <p className="text-white/40 text-sm">{STEPS[step - 1].subtitle}</p>
                </div>

                <AnimatePresence mode="wait">
                    {step === 1 && (
                        <motion.div
                            key="step1"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="space-y-6"
                        >
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <Label className="text-xs font-black text-white/40 uppercase tracking-widest">크루 이름 <span className={currentSport === "GOLF" ? "text-[#84cc16]" : "text-[#10b981]"}>*</span></Label>
                                    <Input
                                        placeholder={currentSport === "GOLF" ? "예: 버디찬스, 72홀 골프회" : "예: 죽방전설, 서초당구클럽"}
                                        className="bg-[#1a1a1a] border-white/10 h-14 text-xl font-black placeholder:text-white/10 rounded-2xl"
                                        value={formData.name || ""}
                                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-xs font-black text-white/40 uppercase tracking-widest">간판 문구 (Slogan)</Label>
                                    <Input
                                        placeholder={currentSport === "GOLF" ? "예: 매주 라운딩 나가는 직장인 크루 ⛳️" : "예: 광진구 2030 즐겜 크루! 🎱"}
                                        className="bg-[#1a1a1a] border-white/10 h-14 text-sm font-bold placeholder:text-white/10 rounded-2xl"
                                        value={formData.shortIntro || ""}
                                        onChange={e => setFormData({ ...formData, shortIntro: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-xs font-black text-white/40 uppercase tracking-widest">상세 소개 (Rules, Fees, etc.)</Label>
                                    <Textarea
                                        placeholder={currentSport === "GOLF" ? "회비, 라운딩 주기, 실력 제한 등 상세 정보를 입력해주세요." : "회비, 규칙, 정모 시간 등 상세한 정보를 마음껏 입력해주세요."}
                                        className="bg-[#1a1a1a] border-white/10 min-h-[160px] text-sm font-medium placeholder:text-white/10 resize-none rounded-2xl p-4 leading-relaxed"
                                        value={formData.description || ""}
                                        onChange={e => setFormData({ ...formData, description: e.target.value })}
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-3">
                                        <Label className="text-xs font-black text-white/40 uppercase tracking-widest">크루 로고</Label>
                                        <input
                                            type="file"
                                            id="logo-upload"
                                            className="hidden"
                                            accept="image/*"
                                            onChange={(e) => {
                                                const file = e.target.files?.[0];
                                                if (file) {
                                                    const url = URL.createObjectURL(file);
                                                    setFormData({ ...formData, emblem: url });
                                                }
                                            }}
                                        />
                                        <div
                                            onClick={() => document.getElementById('logo-upload')?.click()}
                                            className={cn(
                                                "aspect-square rounded-3xl bg-[#1a1a1a] border border-white/5 flex flex-col items-center justify-center cursor-pointer transition-all group overflow-hidden relative",
                                                currentSport === "GOLF" ? "hover:border-[#84cc16]/50" : "hover:border-[#10b981]/50"
                                            )}
                                        >
                                            {formData.emblem ? (
                                                <img src={formData.emblem} className="w-full h-full object-cover" alt="Logo Preview" />
                                            ) : (
                                                <>
                                                    <LucideCamera className={cn("w-6 h-6 text-white/20 transition-colors mb-2", currentSport === "GOLF" ? "group-hover:text-[#84cc16]" : "group-hover:text-[#10b981]")} />
                                                    <span className="text-[10px] font-bold text-white/20">사진 업로드</span>
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    <div className="space-y-3">
                                        <Label className="text-xs font-black text-white/40 uppercase tracking-widest">메인 커버</Label>
                                        <input
                                            type="file"
                                            id="cover-upload"
                                            className="hidden"
                                            accept="image/*"
                                            onChange={(e) => {
                                                const file = e.target.files?.[0];
                                                if (file) {
                                                    const url = URL.createObjectURL(file);
                                                    setFormData({ ...formData, coverImage: url });
                                                }
                                            }}
                                        />
                                        <div
                                            onClick={() => document.getElementById('cover-upload')?.click()}
                                            className={cn(
                                                "aspect-square rounded-3xl bg-[#1a1a1a] border border-white/5 flex flex-col items-center justify-center cursor-pointer transition-all group overflow-hidden relative",
                                                currentSport === "GOLF" ? "hover:border-[#84cc16]/50" : "hover:border-[#10b981]/50"
                                            )}
                                        >
                                            {formData.coverImage ? (
                                                <img src={formData.coverImage} className="w-full h-full object-cover" alt="Cover Preview" />
                                            ) : (
                                                <>
                                                    <LucideImagePlus className={cn("w-6 h-6 text-white/20 transition-colors mb-2", currentSport === "GOLF" ? "group-hover:text-[#84cc16]" : "group-hover:text-[#10b981]")} />
                                                    <span className="text-[10px] font-bold text-white/20">사진 업로드</span>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {step === 2 && (
                        <motion.div
                            key="step2"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="space-y-6"
                        >
                            <div className="space-y-4">
                                <div className="relative">
                                    <LucideSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                                    <Input
                                        placeholder="매장 이름 또는 주소 검색"
                                        className="bg-[#1a1a1a] border-white/10 h-12 pl-10 text-base placeholder:text-white/20"
                                        value={searchQuery}
                                        onChange={e => setSearchQuery(e.target.value)}
                                    />
                                </div>

                                {selectedStore ? (
                                    <Card className={cn(
                                        "border-0.5 shadow-lg",
                                        currentSport === "GOLF" ? "bg-[#84cc16]/10 border-[#84cc16]/50" : "bg-[#10b981]/10 border-[#10b981]/50"
                                    )}>
                                        <CardContent className="p-4 flex items-center justify-between">
                                            <div>
                                                <div className={cn("font-bold", currentSport === "GOLF" ? "text-[#84cc16]" : "text-[#10b981]")}>{selectedStore.name}</div>
                                                <div className="text-xs text-white/60">{selectedStore.address}</div>
                                            </div>
                                            <Button variant="ghost" size="sm" onClick={() => setSelectedStore(null)}>
                                                취소
                                            </Button>
                                        </CardContent>
                                    </Card>
                                ) : (
                                    <div className="bg-[#1a1a1a] rounded-xl border border-white/5 overflow-hidden min-h-[200px]">
                                        {storeResults?.length > 0 ? (
                                            storeResults.map((store: any) => (
                                                <div
                                                    key={store.id}
                                                    onClick={() => {
                                                        setSelectedStore(store);
                                                        // Auto-fill region hint if likely match from address
                                                        // "서울 서초구 ..." -> "서울 서초"
                                                        const regionMatch = store.address?.match(/^(\S+)\s+(\S+)/);
                                                        if (regionMatch && !formData.region) {
                                                            setFormData(prev => ({ ...prev, region: `${regionMatch[1]} ${regionMatch[2]}` }));
                                                        }
                                                    }}
                                                    className="p-4 border-b border-white/5 last:border-0 hover:bg-white/5 active:bg-white/10 cursor-pointer flex items-center justify-between group"
                                                >
                                                    <div>
                                                        <div className={cn("font-bold text-sm transition-colors", currentSport === "GOLF" ? "group-hover:text-[#84cc16]" : "group-hover:text-[#10b981]")}>{store.name}</div>
                                                        <div className="text-xs text-white/40">{store.address}</div>
                                                    </div>
                                                    <LucideCheck className={cn("w-4 h-4 text-white/20 opacity-0 group-hover:opacity-100 transition-all", currentSport === "GOLF" ? "group-hover:text-[#84cc16]" : "group-hover:text-[#10b981]")} />
                                                </div>
                                            ))
                                        ) : (
                                            <div className="flex flex-col items-center justify-center h-[200px] text-white/20 gap-2">
                                                <LucideMapPin className="w-8 h-8 opacity-40" />
                                                <span className="text-xs">
                                                    {searchQuery ? "검색 결과가 없습니다" : "자주 가는 매장을 등록해보세요"}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                )}

                                <div className="p-4 bg-white/5 rounded-xl border border-white/5">
                                    <h4 className="font-bold flex items-center gap-2 mb-2 text-sm">
                                        <LucideTent className={cn("w-4 h-4", currentSport === "GOLF" ? "text-[#84cc16]" : "text-[#10b981]")} />
                                        베이스 캠프란?
                                    </h4>
                                    <p className="text-xs text-white/40 leading-relaxed">
                                        크루의 주 활동 {currentSport === "GOLF" ? "매장" : "구장"}입니다. 베이스 캠프를 등록하면
                                        <span className="text-white/80 font-bold"> 해당 {currentSport === "GOLF" ? "곳의 운영자" : "구장 사장님"}에게 알림</span>이 가며,
                                        크루원을 위한 <span className="text-white/80 font-bold">전용 혜택</span>을 받을 수도 있습니다!
                                    </p>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {step === 3 && (
                        <motion.div
                            key="step3"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="space-y-8"
                        >
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label className="text-xs font-black text-white/40 uppercase tracking-widest">정모 요일</Label>
                                        <Input
                                            placeholder="예: 매주 토요일"
                                            className="bg-[#1a1a1a] border-white/10 h-12 rounded-xl text-sm"
                                            value={formData.meetingDay || ""}
                                            onChange={e => setFormData({ ...formData, meetingDay: e.target.value })}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-xs font-black text-white/40 uppercase tracking-widest">정모 시간</Label>
                                        <Input
                                            placeholder="예: 오후 2시"
                                            className="bg-[#1a1a1a] border-white/10 h-12 rounded-xl text-sm"
                                            value={formData.meetingTime || ""}
                                            onChange={e => setFormData({ ...formData, meetingTime: e.target.value })}
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label>주 종목</Label>
                                    <div className="flex gap-2">
                                        {(currentSport === "GOLF" ? [
                                            { id: "any", label: "상관없음" },
                                            { id: "field", label: "필드 라운드" },
                                            { id: "screen", label: "스크린 골프" },
                                            { id: "range", label: "연습장" }
                                        ] : [
                                            { id: "any", label: "상관없음" },
                                            { id: "3c", label: "3쿠션" },
                                            { id: "4c", label: "4구" },
                                            { id: "pocket", label: "포켓볼" }
                                        ]).map(type => (
                                            <button
                                                key={type.id}
                                                onClick={() => setFormData({ ...formData, gameType: type.id as any })}
                                                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${formData.gameType === type.id
                                                    ? (currentSport === "GOLF" ? "bg-[#84cc16] text-black" : "bg-[#10b981] text-black")
                                                    : "bg-[#1a1a1a] text-white/40 hover:text-white"
                                                    }`}
                                            >
                                                {type.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label>분위기 (최대 3개)</Label>
                                    <div className="flex flex-wrap gap-2">
                                        {(currentSport === "GOLF"
                                            ? ["#매너골프", "#싱글목표", "#명랑골프", "#라운딩", "#스크린", "#초보환영", "#고수환영", "#2030", "#4050", "#주말골퍼"]
                                            : ["#빡겜", "#즐겜", "#내기환영", "#매너필수", "#음주가무", "#금연", "#초보환영", "#고수환영", "#2030", "#4050"]
                                        ).map(tag => (
                                            <button
                                                key={tag}
                                                onClick={() => toggleTag(tag)}
                                                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${(formData.tags as string[])?.includes(tag)
                                                    ? "bg-white text-black"
                                                    : "bg-[#1a1a1a] text-white/40 border border-white/5"
                                                    }`}
                                            >
                                                {tag}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label>가입 방식</Label>
                                    <div className="grid grid-cols-2 gap-3">
                                        <button
                                            onClick={() => setFormData({ ...formData, joinType: "auto" })}
                                            className={`p-3 rounded-xl border text-left space-y-1 ${formData.joinType === "auto"
                                                ? (currentSport === "GOLF" ? "border-[#84cc16] bg-[#84cc16]/5" : "border-[#10b981] bg-[#10b981]/5")
                                                : "border-white/5 bg-[#1a1a1a]"
                                                }`}
                                        >
                                            <div className={`font-bold text-sm ${formData.joinType === "auto" ? (currentSport === "GOLF" ? "text-[#84cc16]" : "text-[#10b981]") : "text-white"}`}>바로 가입</div>
                                            <div className="text-[10px] text-white/40">누구나 즉시 가입 가능</div>
                                        </button>
                                        <button
                                            onClick={() => setFormData({ ...formData, joinType: "approval" })}
                                            className={`p-3 rounded-xl border text-left space-y-1 ${formData.joinType === "approval"
                                                ? (currentSport === "GOLF" ? "border-[#84cc16] bg-[#84cc16]/5" : "border-[#10b981] bg-[#10b981]/5")
                                                : "border-white/5 bg-[#1a1a1a]"
                                                }`}
                                        >
                                            <div className={`font-bold text-sm ${formData.joinType === "approval" ? (currentSport === "GOLF" ? "text-[#84cc16]" : "text-[#10b981]") : "text-white"}`}>승인 후 가입</div>
                                            <div className="text-[10px] text-white/40">크루장 승인 필요</div>
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <Label className="text-xs font-black text-white/40 uppercase tracking-widest flex items-center gap-2">
                                        <LucideUsers className="w-3 h-3" /> 정원 설정
                                    </Label>
                                    <div className="flex flex-wrap gap-2">
                                        {[10, 20, 30, 50, 100].map(num => (
                                            <button
                                                key={num}
                                                onClick={() => setFormData({ ...formData, maxMembers: num })}
                                                className={`px-4 py-2 rounded-xl text-sm font-bold border transition-all ${formData.maxMembers === num
                                                    ? (currentSport === "GOLF" ? "bg-[#84cc16] text-black border-[#84cc16]" : "bg-[#10b981] text-black border-[#10b981]")
                                                    : "bg-[#1a1a1a] text-white/40 border-white/5"
                                                    }`}
                                            >
                                                {num}명
                                            </button>
                                        ))}
                                    </div>
                                    <p className="text-[10px] text-white/20 mt-1">* 나중에 클럽 설정에서 변경할 수 있습니다.</p>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Bottom Button */}
            <div className="fixed bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-[#0f0f0f] via-[#0f0f0f] to-transparent z-20">
                <Button
                    className={cn(
                        "w-full h-14 text-lg font-bold rounded-2xl text-black transition-all",
                        currentSport === "GOLF"
                            ? "bg-[#84cc16] hover:bg-[#a3e635] shadow-[0_0_20px_rgba(132,204,22,0.3)]"
                            : "bg-[#10b981] hover:bg-[#10b981]/90 shadow-[0_0_20px_rgba(16,185,129,0.3)]"
                    )}
                    onClick={handleNext}
                    disabled={createCrewMutation.isPending}
                >
                    {createCrewMutation.isPending ? "생성 중..." : (step === 3 ? "크루 만들기 완료" : "다음")}
                </Button>
            </div>
        </div>
    );
}
