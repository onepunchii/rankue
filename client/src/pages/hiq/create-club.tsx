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
import { uploadImage } from "@/lib/imageUtils";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import {
    LucideChevronLeft,
    LucideCheck,
    LucideSearch,
    LucideMapPin,
    LucideUsers,
    LucideTent,
    LucideCamera,
    LucideImagePlus,
    LucideLoader2,
    ChevronsUpDown
} from "@/lib/icons";
import { InsertHiqCrew, HiqMember } from "@shared/schema";
import { useSport } from "@/contexts/SportContext";
import { cn } from "@/lib/utils";

const STEPS = [
    { id: 1, title: "크루 정체성", subtitle: "우리 크루의 이름과 얼굴을 정해주세요" },
    { id: 2, title: "베이스 캠프", subtitle: "주로 모이는 단골 구장이 있나요?" },
    { id: 3, title: "활동 성향", subtitle: "어떤 분들과 함께하고 싶으신가요?" },
];

export default function CreateClub() {
    const [_, setLocation] = useLocation();
    const { data: member } = useQuery<HiqMember>({ queryKey: ["/api/hiq/me"] });
    const { toast } = useToast();
    const [uploadingField, setUploadingField] = useState<null | 'emblem' | 'coverImage'>(null);

    // Compress to webp + upload to Blob, then store only the returned URL.
    const handleImageSelect = async (field: 'emblem' | 'coverImage', file: File, category: string) => {
        try {
            setUploadingField(field);
            const url = await uploadImage(file, category);
            setFormData(prev => ({ ...prev, [field]: url }));
        } catch (err: any) {
            toast({ title: "이미지 업로드 실패", description: err?.message || "다시 시도해주세요", variant: "destructive" });
        } finally {
            setUploadingField(null);
        }
    };
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
            queryClient.invalidateQueries({ queryKey: ["/api/hiq/crews/mine"] });
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
    const isStep1Valid = (formData.name?.trim().length ?? 0) > 0;
    const isRegionValid = (formData.region?.trim().length ?? 0) > 0;
    const isStep2Valid = isRegionValid; // 주 활동 지역 is required (field lives on step 2)
    const isStep3Valid = isRegionValid; // Backstop before submit

    // Handlers
    const handleNext = () => {
        if (step === 1 && !isStep1Valid) {
            toast({ title: "크루 이름을 입력해주세요", variant: "destructive" });
            return;
        }
        // Validate the required region on the screen that actually contains the field (step 2).
        if (step === 2 && !isStep2Valid) {
            toast({ title: "활동 지역을 입력해주세요", variant: "destructive" });
            return;
        }
        if (step < 3) {
            setStep(step + 1);
        } else {
            // Backstop: enforce required region before submitting.
            if (!isStep3Valid) {
                toast({ title: "활동 지역을 입력해주세요", variant: "destructive" });
                return;
            }
            handleSubmit();
        }
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

    // Region Search Query
    const [regionSearchQuery, setRegionSearchQuery] = useState("");
    const [isRegionOpen, setIsRegionOpen] = useState(false);

    const { data: regionResults } = useQuery({
        queryKey: ["/api/hiq/regions/search", regionSearchQuery],
        queryFn: async () => {
            // Fetch only if user typed something
            if (regionSearchQuery.length < 1) return [];
            return await apiRequest(`/api/hiq/regions/search?q=${regionSearchQuery}`);
        },
        enabled: isRegionOpen && regionSearchQuery.length > 0,
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
        <div className="min-h-screen bg-[#f2f0eb] text-[rgba(0,0,0,0.87)] font-sans pb-36">
            {/* Header */}
            <div className="sticky top-0 z-10 bg-[#f2f0eb] border-b border-surface-line px-5 py-4 flex items-center justify-between">
                <Button variant="ghost" className="p-0 h-auto text-black/60 hover:text-[rgba(0,0,0,0.87)]" onClick={() => step > 1 ? setStep(step - 1) : setLocation("/club")}>
                    <LucideChevronLeft className="w-6 h-6" />
                </Button>
                <div className="text-sm font-semibold text-black/70 tabular-nums">
                    {step} / 3 단계
                </div>
                <div className="w-6" /> {/* Spacer */}
            </div>

            <div className="max-w-md mx-auto px-5 py-8">
                {/* Progress Bar */}
                <div className="h-1 bg-black/[0.06] rounded-full mb-8">
                    <motion.div
                        className="h-full rounded-full bg-brand"
                        initial={{ width: "33%" }}
                        animate={{ width: `${(step / 3) * 100}%` }}
                    />
                </div>

                <div className="mb-8">
                    <h1 className="text-2xl font-bold mb-2 tracking-tight">{STEPS[step - 1].title}</h1>
                    <p className="text-black/55 text-sm">{STEPS[step - 1].subtitle}</p>
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
                                    <Label className="text-xs font-semibold text-black/55">크루 이름 <span className="text-brand">*</span></Label>
                                    <Input
                                        placeholder={currentSport === "GOLF" ? "예: 버디찬스, 72홀 골프회" : "예: 죽방전설, 서초당구클럽"}
                                        className="bg-surface-2 border-black/10 h-14 text-xl font-semibold placeholder:text-black/40 rounded-tile"
                                        value={formData.name || ""}
                                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-xs font-semibold text-black/55">간판 문구</Label>
                                    <Input
                                        placeholder={currentSport === "GOLF" ? "예: 매주 라운딩 나가는 직장인 크루 ⛳️" : "예: 광진구 2030 즐겜 크루! 🎱"}
                                        className="bg-surface-2 border-black/10 h-12 text-[15px] font-medium placeholder:text-black/40 rounded-tile"
                                        value={formData.shortIntro || ""}
                                        onChange={e => setFormData({ ...formData, shortIntro: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-xs font-semibold text-black/55">상세 소개</Label>
                                    <Textarea
                                        placeholder={currentSport === "GOLF" ? "회비, 라운딩 주기, 실력 제한 등 상세 정보를 입력해주세요." : "회비, 규칙, 정모 시간 등 상세한 정보를 마음껏 입력해주세요."}
                                        className="bg-surface-2 border-black/10 min-h-[160px] text-[15px] font-medium placeholder:text-black/40 resize-none rounded-tile p-4 leading-relaxed"
                                        value={formData.description || ""}
                                        onChange={e => setFormData({ ...formData, description: e.target.value })}
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-3">
                                        <Label className="text-xs font-semibold text-black/55">크루 로고</Label>
                                        <input
                                            type="file"
                                            id="logo-upload"
                                            className="hidden"
                                            accept="image/*"
                                            onChange={(e) => {
                                                const file = e.target.files?.[0];
                                                if (file) handleImageSelect('emblem', file, 'crew-logo');
                                            }}
                                        />
                                        <div
                                            onClick={() => { if (uploadingField !== 'emblem') document.getElementById('logo-upload')?.click(); }}
                                            className={cn(
                                                "aspect-square rounded-tile bg-surface-2 flex flex-col items-center justify-center transition-all group overflow-hidden relative",
                                                uploadingField === 'emblem' ? "cursor-wait" : "cursor-pointer hover:border-brand/50"
                                            )}
                                        >
                                            {uploadingField === 'emblem' ? (
                                                <>
                                                    <LucideLoader2 className="w-6 h-6 text-brand animate-spin mb-2" />
                                                    <span className="text-[12px] font-medium text-black/55">업로드 중...</span>
                                                </>
                                            ) : formData.emblem ? (
                                                <img src={formData.emblem} className="w-full h-full object-cover" alt="Logo Preview" />
                                            ) : (
                                                <>
                                                    <LucideCamera className="w-6 h-6 text-black/55 transition-colors mb-2 group-hover:text-brand" />
                                                    <span className="text-[12px] font-medium text-black/55">사진 업로드</span>
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    <div className="space-y-3">
                                        <Label className="text-xs font-semibold text-black/55">메인 커버</Label>
                                        <input
                                            type="file"
                                            id="cover-upload"
                                            className="hidden"
                                            accept="image/*"
                                            onChange={(e) => {
                                                const file = e.target.files?.[0];
                                                if (file) handleImageSelect('coverImage', file, 'crew-cover');
                                            }}
                                        />
                                        <div
                                            onClick={() => { if (uploadingField !== 'coverImage') document.getElementById('cover-upload')?.click(); }}
                                            className={cn(
                                                "aspect-square rounded-tile bg-surface-2 flex flex-col items-center justify-center transition-all group overflow-hidden relative",
                                                uploadingField === 'coverImage' ? "cursor-wait" : "cursor-pointer hover:border-brand/50"
                                            )}
                                        >
                                            {uploadingField === 'coverImage' ? (
                                                <>
                                                    <LucideLoader2 className="w-6 h-6 text-brand animate-spin mb-2" />
                                                    <span className="text-[12px] font-medium text-black/55">업로드 중...</span>
                                                </>
                                            ) : formData.coverImage ? (
                                                <img src={formData.coverImage} className="w-full h-full object-cover" alt="Cover Preview" />
                                            ) : (
                                                <>
                                                    <LucideImagePlus className="w-6 h-6 text-black/55 transition-colors mb-2 group-hover:text-brand" />
                                                    <span className="text-[12px] font-medium text-black/55">사진 업로드</span>
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
                                <div className="space-y-2">
                                    <Label className="text-xs font-semibold text-black/55">주 활동 지역 <span className="text-brand">*</span></Label>
                                    <Popover open={isRegionOpen} onOpenChange={setIsRegionOpen}>
                                        <PopoverTrigger asChild>
                                            <Button
                                                variant="outline"
                                                role="combobox"
                                                aria-expanded={isRegionOpen}
                                                className={cn(
                                                    "w-full justify-between bg-surface-2 border-black/10 h-12 rounded-tile text-[15px] font-medium hover:bg-surface-2 hover:text-[rgba(0,0,0,0.87)]",
                                                    formData.region ? "text-[rgba(0,0,0,0.87)]" : "text-black/40"
                                                )}
                                            >
                                                {formData.region
                                                    ? formData.region
                                                    : "지역 검색 (예: 강남구, 역삼동)"}
                                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent align="start" sideOffset={6} className="w-[var(--radix-popover-trigger-width)] p-0 bg-white text-[rgba(0,0,0,0.87)] rounded-tile shadow-[0_8px_24px_rgba(0,0,0,0.12)] overflow-hidden z-[60]">
                                            <Command shouldFilter={false} className="bg-transparent text-[rgba(0,0,0,0.87)] rounded-tile [&_[cmdk-input-wrapper]]:border-black/10">
                                                <CommandInput
                                                    placeholder="지역 검색 (예: 강남구)"
                                                    className="h-11 border-none focus:ring-0 text-[15px] text-[rgba(0,0,0,0.87)] placeholder:text-black/40"
                                                    value={regionSearchQuery}
                                                    onValueChange={setRegionSearchQuery}
                                                />
                                                <CommandList className="max-h-[240px] overflow-y-auto overscroll-contain">
                                                    <CommandEmpty className="py-8 text-center text-[13px] text-black/40">
                                                        {regionSearchQuery ? "검색 결과가 없습니다" : "지역을 검색해주세요"}
                                                    </CommandEmpty>
                                                    <CommandGroup>
                                                        {regionResults?.map((region: any) => (
                                                            <CommandItem
                                                                key={region.code}
                                                                value={region.fullName}
                                                                onSelect={(currentValue) => {
                                                                    setFormData({ ...formData, region: region.fullName });
                                                                    setRegionSearchQuery(region.fullName); // Update input to show selection if needed, but display handles it
                                                                    setIsRegionOpen(false);
                                                                }}
                                                                className="text-[15px] text-black/70 rounded-xl aria-selected:bg-brand/15 aria-selected:text-[rgba(0,0,0,0.87)] data-[selected=true]:bg-brand/15 cursor-pointer py-2.5"
                                                            >
                                                                <LucideCheck
                                                                    className={cn(
                                                                        "mr-2 h-4 w-4",
                                                                        formData.region === region.fullName ? "opacity-100" : "opacity-0"
                                                                    )}
                                                                />
                                                                {region.fullName}
                                                            </CommandItem>
                                                        ))}
                                                    </CommandGroup>
                                                </CommandList>
                                            </Command>
                                        </PopoverContent>
                                    </Popover>
                                </div>
                                <div className="relative">
                                    <LucideSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-black/55" />
                                    <Input
                                        placeholder="매장 이름 또는 주소 검색"
                                        className="bg-surface-2 border-black/10 h-12 rounded-tile pl-10 text-[15px] font-medium placeholder:text-black/40"
                                        value={searchQuery}
                                        onChange={e => setSearchQuery(e.target.value)}
                                    />
                                </div>

                                {selectedStore ? (
                                    <Card className="bg-brand/10 border-brand/50">
                                        <CardContent className="p-4 flex items-center justify-between">
                                            <div>
                                                <div className="font-bold text-brand">{selectedStore.name}</div>
                                                <div className="text-xs text-black/60">{selectedStore.address}</div>
                                            </div>
                                            <Button variant="ghost" size="sm" onClick={() => setSelectedStore(null)}>
                                                취소
                                            </Button>
                                        </CardContent>
                                    </Card>
                                ) : (
                                    <div className="bg-surface-2 rounded-tile overflow-hidden min-h-[200px]">
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
                                                    className="p-4 border-b border-black/[0.08] last:border-0 hover:bg-black/[0.04] active:bg-black/[0.06] cursor-pointer flex items-center justify-between group"
                                                >
                                                    <div>
                                                        <div className="font-bold text-sm transition-colors group-hover:text-brand">{store.name}</div>
                                                        <div className="text-xs text-black/55">{store.address}</div>
                                                    </div>
                                                    <LucideCheck className="w-4 h-4 text-black/55 opacity-0 group-hover:opacity-100 transition-all group-hover:text-brand" />
                                                </div>
                                            ))
                                        ) : (
                                            <div className="flex flex-col items-center justify-center h-[200px] text-black/55 gap-2">
                                                <LucideMapPin className="w-8 h-8 opacity-40" />
                                                <span className="text-xs">
                                                    {searchQuery ? "검색 결과가 없습니다" : "자주 가는 매장을 등록해보세요"}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                )}

                                <div className="p-4 bg-black/[0.04] rounded-tile ">
                                    <h4 className="font-bold flex items-center gap-2 mb-2 text-sm">
                                        <LucideTent className="w-4 h-4 text-brand" />
                                        베이스 캠프란?
                                    </h4>
                                    <p className="text-xs text-black/55 leading-relaxed">
                                        크루의 주 활동 {currentSport === "GOLF" ? "매장" : "구장"}입니다. 베이스 캠프를 등록하면
                                        <span className="text-black/70 font-bold"> 해당 {currentSport === "GOLF" ? "곳의 운영자" : "구장 사장님"}에게 알림</span>이 가며,
                                        크루원을 위한 <span className="text-black/70 font-bold">전용 혜택</span>을 받을 수도 있습니다!
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
                                        <Label className="text-xs font-semibold text-black/55">정모 요일</Label>
                                        <Input
                                            placeholder="예: 매주 토요일"
                                            className="bg-surface-2 border-black/10 h-12 rounded-tile text-[15px] font-medium"
                                            value={formData.meetingDay || ""}
                                            onChange={e => setFormData({ ...formData, meetingDay: e.target.value })}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-xs font-semibold text-black/55">정모 시간</Label>
                                        <Input
                                            placeholder="예: 오후 2시"
                                            className="bg-surface-2 border-black/10 h-12 rounded-tile text-[15px] font-medium"
                                            value={formData.meetingTime || ""}
                                            onChange={e => setFormData({ ...formData, meetingTime: e.target.value })}
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label className="text-xs font-semibold text-black/55">주 종목</Label>
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
                                                className={`flex-1 py-2 rounded-tile text-sm font-medium transition-colors ${formData.gameType === type.id
                                                    ? "bg-brand text-brand-fg"
                                                    : "bg-black/[0.04] text-black/55 hover:text-[rgba(0,0,0,0.87)]"
                                                    }`}
                                            >
                                                {type.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label className="text-xs font-semibold text-black/55">분위기 (최대 3개)</Label>
                                    <div className="flex flex-wrap gap-2">
                                        {(currentSport === "GOLF"
                                            ? ["#매너골프", "#싱글목표", "#명랑골프", "#라운딩", "#스크린", "#초보환영", "#고수환영", "#2030", "#4050", "#주말골퍼"]
                                            : ["#빡겜", "#즐겜", "#내기환영", "#매너필수", "#음주가무", "#금연", "#초보환영", "#고수환영", "#2030", "#4050"]
                                        ).map(tag => (
                                            <button
                                                key={tag}
                                                onClick={() => toggleTag(tag)}
                                                className={`px-3 py-1.5 rounded-pill text-xs font-medium transition-all ${(formData.tags as string[])?.includes(tag)
                                                    ? "bg-brand text-brand-fg"
                                                    : "bg-black/[0.04] text-black/55 "
                                                    }`}
                                            >
                                                {tag}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label className="text-xs font-semibold text-black/55">가입 방식</Label>
                                    <div className="grid grid-cols-2 gap-3">
                                        <button
                                            onClick={() => setFormData({ ...formData, joinType: "auto" })}
                                            className={`p-3 rounded-tile border text-left space-y-1 ${formData.joinType === "auto"
                                                ? "border-brand bg-brand/5"
                                                : "border-black/[0.08] bg-surface-2"
                                                }`}
                                        >
                                            <div className={`font-bold text-sm ${formData.joinType === "auto" ? "text-brand" : "text-[rgba(0,0,0,0.87)]"}`}>바로 가입</div>
                                            <div className="text-[12px] text-black/55">누구나 즉시 가입 가능</div>
                                        </button>
                                        <button
                                            onClick={() => setFormData({ ...formData, joinType: "approval" })}
                                            className={`p-3 rounded-tile border text-left space-y-1 ${formData.joinType === "approval"
                                                ? "border-brand bg-brand/5"
                                                : "border-black/[0.08] bg-surface-2"
                                                }`}
                                        >
                                            <div className={`font-bold text-sm ${formData.joinType === "approval" ? "text-brand" : "text-[rgba(0,0,0,0.87)]"}`}>승인 후 가입</div>
                                            <div className="text-[12px] text-black/55">크루장 승인 필요</div>
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <Label className="text-xs font-semibold text-black/55 flex items-center gap-2">
                                        <LucideUsers className="w-3 h-3" /> 정원 설정
                                    </Label>
                                    <div className="flex flex-wrap gap-2">
                                        {[10, 20, 30, 50, 100].map(num => (
                                            <button
                                                key={num}
                                                onClick={() => setFormData({ ...formData, maxMembers: num })}
                                                className={`px-4 py-2 rounded-tile text-sm font-bold border transition-all tabular-nums ${formData.maxMembers === num
                                                    ? "bg-brand text-brand-fg border-brand"
                                                    : "bg-black/[0.04] text-black/55 border-black/[0.08]"
                                                    }`}
                                            >
                                                {num}명
                                            </button>
                                        ))}
                                    </div>
                                    <p className="text-[12px] text-black/55 mt-1">* 나중에 클럽 설정에서 변경할 수 있습니다.</p>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Bottom Button */}
            <div className="fixed bottom-0 left-0 right-0 px-5 py-6 bg-[#f2f0eb] border-t border-surface-line safe-area-bottom z-20">
                <Button
                    className={cn(
                        "w-full h-14 text-lg font-bold rounded-tile bg-brand text-brand-fg hover:bg-brand/90 transition-all"
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
