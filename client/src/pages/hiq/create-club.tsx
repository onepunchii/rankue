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
import { useT } from "@/lib/i18n";
import { useNativeBridge } from "@/hooks/useNativeBridge";
import { useEffect } from "react";

// 라벨은 i18n 키 — 렌더 시 t()로 감싼다.
const STEPS = [
    { id: 1, title: "createClub.step1Title", subtitle: "createClub.step1Subtitle" },
    { id: 2, title: "createClub.step2Title", subtitle: "createClub.step2Subtitle" },
    { id: 3, title: "createClub.step3Title", subtitle: "createClub.step3Subtitle" },
];

export default function CreateClub() {
    const [_, setLocation] = useLocation();
    const { t, locale } = useT();
    const { data: member } = useQuery<HiqMember>({ queryKey: ["/api/hiq/me"] });
    const { toast } = useToast();
    const [uploadingField, setUploadingField] = useState<null | 'emblem' | 'coverImage'>(null);

    // Compress to webp + upload to Blob, then store only the returned URL.
    const handleImageSelect = async (field: 'emblem' | 'coverImage', file: File, category: string) => {
        try {
            setUploadingField(field);
            // 수정 화면(ClubGeneralTab)과 동일 크기로 통일 — 로고 400px, 커버 1200px
            const url = await uploadImage(file, category, { maxSize: field === 'coverImage' ? 1200 : 400 });
            setFormData(prev => ({ ...prev, [field]: url }));
        } catch (err: any) {
            toast({ title: t("createClub.imageUploadFailed"), description: err?.message || t("createClub.tryAgain"), variant: "destructive" });
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
        meetingDay: "",
        meetingTime: "",
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
                title: t("createClub.createdTitle"),
                description: t("createClub.createdDesc"),
            });
            queryClient.invalidateQueries({ queryKey: ["/api/hiq/crews"] });
            queryClient.invalidateQueries({ queryKey: ["/api/hiq/crews/mine"] });
            setLocation("/club");
        },
        onError: (error: Error) => {
            toast({
                title: t("createClub.createFailed"),
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
            toast({ title: t("createClub.nameRequired"), variant: "destructive" });
            return;
        }
        // Validate the required region on the screen that actually contains the field (step 2).
        if (step === 2 && !isStep2Valid) {
            toast({ title: t("createClub.regionRequired"), variant: "destructive" });
            return;
        }
        if (step < 3) {
            setStep(step + 1);
        } else {
            // Backstop: enforce required region before submitting.
            if (!isStep3Valid) {
                toast({ title: t("createClub.regionRequired"), variant: "destructive" });
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
            // 파트너 매장이면 baseStoreId, 디렉토리(1,195곳)면 baseListingCode — 서버가 실존 검증
            baseStoreId: selectedStore?.type === "partner" ? selectedStore.id : null,
            baseListingCode: selectedStore?.type === "listing" ? selectedStore.code : null,
            tags: formData.tags || [],
            sportCategory: currentSport,
        } as any);
    };

    // Store Search Query — 당구는 파트너+디렉토리 통합 검색, 골프는 기존 파트너 검색 유지
    const { data: storeResults } = useQuery({
        queryKey: ["/api/hiq/crews/store-search", currentSport, searchQuery],
        queryFn: async () => {
            if (searchQuery.length < 2) return [];
            if (currentSport === "GOLF") {
                const rows = await apiRequest(`/api/hiq/stores/search?q=${encodeURIComponent(searchQuery)}`);
                return (rows as any[]).map((s) => ({ type: "partner", id: s.id, name: s.name, address: s.address }));
            }
            return await apiRequest(`/api/hiq/crews/store-search?q=${encodeURIComponent(searchQuery)}`);
        },
        enabled: searchQuery.length >= 2,
    });

    // 크루 좌표 — "현재 위치 사용" 버튼으로 취득(앱=GPS 브릿지, 웹=브라우저 폴백).
    // 미사용 시 서버가 지역 텍스트를 도시 수준 지오코딩으로 폴백.
    const { location: gpsLocation, requestLocation } = useNativeBridge();
    useEffect(() => {
        if (gpsLocation) {
            setFormData(prev => ({ ...prev, latitude: gpsLocation.lat, longitude: gpsLocation.lng }));
        }
    }, [gpsLocation]);

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
            {/* Header — 전역 .sticky.top-0 세이프에어리어 규칙(index.css)이 py-4의 상단
                패딩을 env()로 덮어써 헤더가 위에 딱 붙었다. rk-no-safe로 제외하고
                env+16px을 직접 준다 (웹=16px, 앱=상태바+16px). */}
            <div className="rk-no-safe sticky top-0 z-10 bg-[#f2f0eb] border-b border-surface-line px-5 pb-4 pt-[calc(env(safe-area-inset-top)+1rem)] mt-[calc(-1*env(safe-area-inset-top))] flex items-center justify-between">
                <Button variant="ghost" className="p-0 h-auto text-black/60 hover:text-[rgba(0,0,0,0.87)]" onClick={() => step > 1 ? setStep(step - 1) : setLocation("/club")}>
                    <LucideChevronLeft className="w-6 h-6" />
                </Button>
                <div className="text-sm font-semibold text-black/70 tabular-nums">
                    {step}{t("createClub.stepSuffix")}
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
                    <h1 className="text-2xl font-bold mb-2 tracking-tight">{t(STEPS[step - 1].title)}</h1>
                    <p className="text-black/55 text-sm">{t(STEPS[step - 1].subtitle)}</p>
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
                                    <Label className="text-xs font-semibold text-black/55">{t("createClub.nameLabel")} <span className="text-brand">*</span></Label>
                                    <Input
                                        placeholder={currentSport === "GOLF" ? t("createClub.namePlaceholderGolf") : t("createClub.namePlaceholderBilliards")}
                                        className="bg-surface-2 border-black/10 h-14 text-xl font-semibold placeholder:text-black/40 rounded-tile"
                                        value={formData.name || ""}
                                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-xs font-semibold text-black/55">{t("createClub.introLabel")}</Label>
                                    <Input
                                        placeholder={currentSport === "GOLF" ? t("createClub.introPlaceholderGolf") : t("createClub.introPlaceholderBilliards")}
                                        className="bg-surface-2 border-black/10 h-12 text-[15px] font-medium placeholder:text-black/40 rounded-tile"
                                        value={formData.shortIntro || ""}
                                        onChange={e => setFormData({ ...formData, shortIntro: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-xs font-semibold text-black/55">{t("createClub.descLabel")}</Label>
                                    <Textarea
                                        placeholder={currentSport === "GOLF" ? t("createClub.descPlaceholderGolf") : t("createClub.descPlaceholderBilliards")}
                                        className="bg-surface-2 border-black/10 min-h-[160px] text-[15px] font-medium placeholder:text-black/40 resize-none rounded-tile p-4 leading-relaxed"
                                        value={formData.description || ""}
                                        onChange={e => setFormData({ ...formData, description: e.target.value })}
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-3">
                                        <Label className="text-xs font-semibold text-black/55">{t("createClub.logoLabel")}</Label>
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
                                                    <span className="text-[12px] font-medium text-black/55">{t("createClub.uploading")}</span>
                                                </>
                                            ) : formData.emblem ? (
                                                <img src={formData.emblem} className="w-full h-full object-cover" alt="Logo Preview" />
                                            ) : (
                                                <>
                                                    <LucideCamera className="w-6 h-6 text-black/55 transition-colors mb-2 group-hover:text-brand" />
                                                    <span className="text-[12px] font-medium text-black/55">{t("createClub.uploadPhoto")}</span>
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    <div className="space-y-3">
                                        <Label className="text-xs font-semibold text-black/55">{t("createClub.coverLabel")}</Label>
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
                                                    <span className="text-[12px] font-medium text-black/55">{t("createClub.uploading")}</span>
                                                </>
                                            ) : formData.coverImage ? (
                                                <img src={formData.coverImage} className="w-full h-full object-cover" alt="Cover Preview" />
                                            ) : (
                                                <>
                                                    <LucideImagePlus className="w-6 h-6 text-black/55 transition-colors mb-2 group-hover:text-brand" />
                                                    <span className="text-[12px] font-medium text-black/55">{t("createClub.uploadPhoto")}</span>
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
                                    <Label className="text-xs font-semibold text-black/55">{t("createClub.regionLabel")} <span className="text-brand">*</span></Label>
                                    {/* 지역 입력 분기 — ko: 한국 행정동 검색 / 그 외: 도시명 자유 입력
                                        (지역 DB가 한국 전용이라 글로벌 유저는 검색 결과가 항상 비어 못 만들게 됨) */}
                                    {locale !== "ko" ? (
                                        <Input
                                            value={formData.region || ""}
                                            onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                                            placeholder={t("createClub.regionFreeformPlaceholder")}
                                            className="h-12 bg-surface-2 border-black/10 rounded-tile text-[15px]"
                                        />
                                    ) : (
                                    // 인라인 검색 패널 — Popover(포털+fixed 좌표)는 모바일에서
                                    // 키보드가 뷰포트를 줄이는 순간 앵커 계산이 깨져 (0,0)으로 튄다.
                                    // 문서 흐름 안에 그리면 구조적으로 어긋날 수 없다.
                                    <div>
                                        <Button
                                            variant="outline"
                                            role="combobox"
                                            aria-expanded={isRegionOpen}
                                            onClick={() => setIsRegionOpen(v => !v)}
                                            className={cn(
                                                "w-full justify-between bg-surface-2 border-black/10 h-12 rounded-tile text-[15px] font-medium hover:bg-surface-2 hover:text-[rgba(0,0,0,0.87)]",
                                                formData.region ? "text-[rgba(0,0,0,0.87)]" : "text-black/40"
                                            )}
                                        >
                                            {formData.region
                                                ? formData.region
                                                : t("createClub.regionPlaceholder")}
                                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                        </Button>
                                        {isRegionOpen && (
                                            <div className="mt-2 bg-white text-[rgba(0,0,0,0.87)] rounded-tile shadow-[0_8px_24px_rgba(0,0,0,0.12)] overflow-hidden border border-black/[0.06]">
                                                <Command shouldFilter={false} className="bg-transparent text-[rgba(0,0,0,0.87)] rounded-tile [&_[cmdk-input-wrapper]]:border-black/10">
                                                    <CommandInput
                                                        autoFocus
                                                        placeholder={t("createClub.regionSearchPlaceholder")}
                                                        className="h-11 border-none focus:ring-0 text-[15px] text-[rgba(0,0,0,0.87)] placeholder:text-black/40"
                                                        value={regionSearchQuery}
                                                        onValueChange={setRegionSearchQuery}
                                                    />
                                                    <CommandList className="max-h-[240px] overflow-y-auto overscroll-contain">
                                                        <CommandEmpty className="py-8 text-center text-[13px] text-black/40">
                                                            {regionSearchQuery ? t("createClub.noResults") : t("createClub.regionSearchPrompt")}
                                                        </CommandEmpty>
                                                        <CommandGroup>
                                                            {regionResults?.map((region: any) => (
                                                                <CommandItem
                                                                    key={region.code}
                                                                    value={region.fullName}
                                                                    onSelect={() => {
                                                                        setFormData({ ...formData, region: region.fullName });
                                                                        setRegionSearchQuery(region.fullName);
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
                                            </div>
                                        )}
                                    </div>
                                    )}
                                    {/* 좌표 취득 — 거리순 크루 발견용(선택). 안 누르면 서버가 도시 지오코딩 폴백 */}
                                    <button
                                        type="button"
                                        onClick={requestLocation}
                                        className={cn(
                                            "mt-1.5 text-[12px] font-medium transition-colors",
                                            formData.latitude ? "text-brand" : "text-black/45 underline underline-offset-2"
                                        )}
                                    >
                                        {formData.latitude ? `📍 ${t("createClub.locationSaved")}` : `📍 ${t("createClub.useMyLocation")}`}
                                    </button>
                                </div>
                                <div className="relative">
                                    <LucideSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-black/55" />
                                    <Input
                                        placeholder={t("createClub.storeSearchPlaceholder")}
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
                                                {t("createClub.cancel")}
                                            </Button>
                                        </CardContent>
                                    </Card>
                                ) : (
                                    <div className="bg-surface-2 rounded-tile overflow-hidden min-h-[200px]">
                                        {storeResults?.length > 0 ? (
                                            storeResults.map((store: any) => (
                                                <div
                                                    key={store.id || store.code}
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
                                                    <div className="min-w-0">
                                                        <div className="font-bold text-sm transition-colors group-hover:text-brand flex items-center gap-1.5">
                                                            <span className="truncate">{store.name}</span>
                                                            {store.type === "partner" && (
                                                                <span className="shrink-0 px-1.5 py-0.5 rounded-full bg-brand/10 text-[10px] font-bold text-brand leading-none">{t("createClub.partnerBadge")}</span>
                                                            )}
                                                        </div>
                                                        <div className="text-xs text-black/55 truncate">{store.address}</div>
                                                    </div>
                                                    <LucideCheck className="w-4 h-4 shrink-0 ml-2 text-black/55 opacity-0 group-hover:opacity-100 transition-all group-hover:text-brand" />
                                                </div>
                                            ))
                                        ) : (
                                            <div className="flex flex-col items-center justify-center h-[200px] text-black/55 gap-2">
                                                <LucideMapPin className="w-8 h-8 opacity-40" />
                                                <span className="text-xs">
                                                    {searchQuery ? t("createClub.noResults") : t("createClub.storeSearchPrompt")}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                )}

                                <div className="p-4 bg-black/[0.04] rounded-tile ">
                                    <h4 className="font-bold flex items-center gap-2 mb-2 text-sm">
                                        <LucideTent className="w-4 h-4 text-brand" />
                                        {t("createClub.baseCampTitle")}
                                    </h4>
                                    <p className="text-xs text-black/55 leading-relaxed">
                                        {currentSport === "GOLF" ? t("createClub.baseCampIntroGolf") : t("createClub.baseCampIntroBilliards")}
                                        <span className="text-black/70 font-bold">{currentSport === "GOLF" ? t("createClub.baseCampNotifyGolf") : t("createClub.baseCampNotifyBilliards")}</span>
                                        {t("createClub.baseCampMid")}<span className="text-black/70 font-bold">{t("createClub.baseCampPerk")}</span>{t("createClub.baseCampEnd")}
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
                                        <Label className="text-xs font-semibold text-black/55">{t("createClub.meetingDayLabel")}</Label>
                                        <Input
                                            placeholder={t("createClub.meetingDayPlaceholder")}
                                            className="bg-surface-2 border-black/10 h-12 rounded-tile text-[15px] font-medium"
                                            value={formData.meetingDay || ""}
                                            onChange={e => setFormData({ ...formData, meetingDay: e.target.value })}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-xs font-semibold text-black/55">{t("createClub.meetingTimeLabel")}</Label>
                                        <Input
                                            placeholder={t("createClub.meetingTimePlaceholder")}
                                            className="bg-surface-2 border-black/10 h-12 rounded-tile text-[15px] font-medium"
                                            value={formData.meetingTime || ""}
                                            onChange={e => setFormData({ ...formData, meetingTime: e.target.value })}
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label className="text-xs font-semibold text-black/55">{t("createClub.gameTypeLabel")}</Label>
                                    <div className="flex gap-2">
                                        {(currentSport === "GOLF" ? [
                                            { id: "any", label: "createClub.gameAny" },
                                            { id: "field", label: "createClub.gameField" },
                                            { id: "screen", label: "createClub.gameScreen" },
                                            { id: "range", label: "createClub.gameRange" }
                                        ] : [
                                            { id: "any", label: "createClub.gameAny" },
                                            { id: "3c", label: "createClub.game3c" },
                                            { id: "4c", label: "createClub.game4c" },
                                            { id: "pocket", label: "createClub.gamePocket" }
                                        ]).map(type => (
                                            <button
                                                key={type.id}
                                                onClick={() => setFormData({ ...formData, gameType: type.id as any })}
                                                className={`flex-1 py-2 rounded-tile text-sm font-medium transition-colors ${formData.gameType === type.id
                                                    ? "bg-brand text-brand-fg"
                                                    : "bg-black/[0.04] text-black/55 hover:text-[rgba(0,0,0,0.87)]"
                                                    }`}
                                            >
                                                {t(type.label)}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label className="text-xs font-semibold text-black/55">{t("createClub.vibeLabel")}</Label>
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
                                    <Label className="text-xs font-semibold text-black/55">{t("createClub.joinTypeLabel")}</Label>
                                    <div className="grid grid-cols-2 gap-3">
                                        <button
                                            onClick={() => setFormData({ ...formData, joinType: "auto" })}
                                            className={`p-3 rounded-tile border text-left space-y-1 ${formData.joinType === "auto"
                                                ? "border-brand bg-brand/5"
                                                : "border-black/[0.08] bg-surface-2"
                                                }`}
                                        >
                                            <div className={`font-bold text-sm ${formData.joinType === "auto" ? "text-brand" : "text-[rgba(0,0,0,0.87)]"}`}>{t("createClub.joinAutoTitle")}</div>
                                            <div className="text-[12px] text-black/55">{t("createClub.joinAutoDesc")}</div>
                                        </button>
                                        <button
                                            onClick={() => setFormData({ ...formData, joinType: "approval" })}
                                            className={`p-3 rounded-tile border text-left space-y-1 ${formData.joinType === "approval"
                                                ? "border-brand bg-brand/5"
                                                : "border-black/[0.08] bg-surface-2"
                                                }`}
                                        >
                                            <div className={`font-bold text-sm ${formData.joinType === "approval" ? "text-brand" : "text-[rgba(0,0,0,0.87)]"}`}>{t("createClub.joinApprovalTitle")}</div>
                                            <div className="text-[12px] text-black/55">{t("createClub.joinApprovalDesc")}</div>
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <Label className="text-xs font-semibold text-black/55 flex items-center gap-2">
                                        <LucideUsers className="w-3 h-3" /> {t("createClub.capacityLabel")}
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
                                                {num}{t("createClub.memberUnit")}
                                            </button>
                                        ))}
                                    </div>
                                    <p className="text-[12px] text-black/55 mt-1">{t("createClub.capacityHint")}</p>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Bottom Button */}
            <div
                className="fixed bottom-0 left-0 right-0 px-5 py-6 bg-[#f2f0eb] border-t border-surface-line z-20"
                // 전역 `.fixed.bottom-0 { padding-bottom: env(...) }`가 py-6의 하단 1.5rem을 덮어써
                // 웹에선 하단 여백이 사라지고 시뮬에선 인셋이 py-6 안으로 파고든다. 인라인으로 전역 규칙을
                // 이겨, base(1.5rem)는 유지하고 홈인디케이터 인셋을 그 아래에 얹는다.
                style={{ paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom))" }}
            >
                <Button
                    className={cn(
                        "w-full h-14 text-lg font-bold rounded-tile bg-brand text-brand-fg hover:bg-brand/90 transition-all"
                    )}
                    onClick={handleNext}
                    disabled={createCrewMutation.isPending || uploadingField !== null}
                >
                    {uploadingField !== null
                        ? t("createClub.uploading")
                        : createCrewMutation.isPending ? t("createClub.creating") : (step === 3 ? t("createClub.submitDone") : t("createClub.next"))}
                </Button>
            </div>
        </div>
    );
}
