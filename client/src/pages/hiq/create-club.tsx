import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient, ApiError } from "@/lib/queryClient";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { uploadImage } from "@/lib/imageUtils";
import {
    LucideChevronLeft,
    LucideCheck,
    LucideSearch,
    LucideMapPin,
    LucideTent,
    LucideCamera,
    LucideImagePlus,
    LucideLoader2,
    LucideX,
} from "@/lib/icons";
import { InsertHiqCrew } from "@shared/schema";
import { useSport } from "@/contexts/SportContext";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { useNativeBridge } from "@/hooks/useNativeBridge";
import { useTermsGate } from "@/components/hiq/TermsConsent";
import { useAuth } from "@/hooks/useAuth";
import { goLogin } from "@/components/hiq/LoginGate";
import { CREW_BTN, CREW_CARD, CREW_TEXT, IconButton } from "@/components/hiq/crew-ui";
import { FIELD_INPUT, FIELD_TEXTAREA, Field } from "@/components/hiq/club-settings/formKit";
import { RegionField } from "@/components/hiq/club-settings/RegionField";
import { MeetingPicker } from "@/components/hiq/club-settings/MeetingPicker";
import { CapacityPicker } from "@/components/hiq/club-settings/CapacityPicker";
import { GameTypePicker, JoinTypePicker, TagPicker } from "@/components/hiq/club-settings/CrewOptionFields";

// 라벨은 i18n 키 — 렌더 시 t()로 감싼다.
const STEPS = [
    { id: 1, title: "createClub.step1Title", subtitle: "createClub.step1Subtitle" },
    { id: 2, title: "createClub.step2Title", subtitle: "createClub.step2Subtitle" },
    { id: 3, title: "createClub.step3Title", subtitle: "createClub.step3Subtitle" },
];

const NAME_MAX = 30; // 서버 err.crew.nameLength 와 같다
const INTRO_MAX = 60;

export default function CreateClub() {
    const [, setLocation] = useLocation();
    const { t } = useT();
    const { gate } = useTermsGate();
    const { member, isGuest } = useAuth();
    const { toast } = useToast();
    const [uploadingField, setUploadingField] = useState<null | 'emblem' | 'coverImage'>(null);
    const [step, setStep] = useState(1);
    const [searchQuery, setSearchQuery] = useState("");
    const { currentSport } = useSport();
    const [nameError, setNameError] = useState<string | null>(null);
    const [checkingName, setCheckingName] = useState(false);
    const logoInput = useRef<HTMLInputElement>(null);
    const coverInput = useRef<HTMLInputElement>(null);

    // 만들기는 계정이 필요하다 — 게스트가 주소로 바로 들어오면 로그인으로 보내고 여기로 되돌아온다.
    useEffect(() => {
        if (isGuest) goLogin(setLocation, "/club/create");
    }, [isGuest]);

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
    const set = (patch: Partial<InsertHiqCrew>) => setFormData((prev) => ({ ...prev, ...patch }));

    // Compress to webp + upload to Blob, then store only the returned URL.
    const handleImageSelect = async (field: 'emblem' | 'coverImage', input: HTMLInputElement) => {
        const file = input.files?.[0];
        // 같은 파일을 다시 골라도 onChange 가 오게 비운다 — 업로드 실패 뒤 같은 사진으로 다시 시도할 수 있어야 한다.
        input.value = "";
        if (!file) return;
        try {
            setUploadingField(field);
            // 수정 화면(ClubGeneralTab)과 동일 크기로 통일 — 로고 400px, 커버 1200px
            const url = await uploadImage(file, field === 'coverImage' ? 'crew-cover' : 'crew-logo', { maxSize: field === 'coverImage' ? 1200 : 400 });
            set({ [field]: url });
        } catch (err: any) {
            toast({ title: t("createClub.imageUploadFailed"), description: err?.message || t("createClub.tryAgain"), variant: "destructive" });
        } finally {
            setUploadingField(null);
        }
    };

    // Store Selection State
    const [selectedStore, setSelectedStore] = useState<any>(null);

    const createCrewMutation = useMutation({
        mutationFn: async (data: InsertHiqCrew) => {
            return await apiRequest("/api/hiq/crews", {
                method: "POST",
                body: data
            });
        },
        onSuccess: (crew: any) => {
            toast({ title: t("crewMgmt.createdToast"), description: t("createClub.createdDesc") });
            queryClient.invalidateQueries({ queryKey: ["/api/hiq/crews"] });
            queryClient.invalidateQueries({ queryKey: ["/api/hiq/crews/mine"] });
            // 만든 크루로 바로 들어간다 — 예전엔 목록(/club)으로 돌아가 방금 만든 크루를 다시 찾아 눌러야 했다.
            // 뒤로가기가 만들기 화면으로 돌아오지 않게 replace.
            setLocation(crew?.id ? `/club/${crew.id}` : "/club", { replace: true });
        },
        onError: (error: Error) => {
            // 이름 중복(409)은 3단계에서 알게 되더라도 이름 칸이 있는 1단계로 데려가 바로 고치게 한다.
            if (error instanceof ApiError && error.status === 409) {
                setNameError(error.message || t("crewMgmt.nameTaken"));
                setStep(1);
                return;
            }
            toast({ title: t("createClub.createFailed"), description: error.message, variant: "destructive" });
        }
    });

    // Validations
    const trimmedName = formData.name?.trim() ?? "";
    const isStep1Valid = trimmedName.length > 0 && trimmedName.length <= NAME_MAX;
    const isRegionValid = (formData.region?.trim().length ?? 0) > 0;

    // 1단계 '다음' — 이름을 바로 확인한다(/crews/name-check). 확인 요청이 실패하면 막지 않고 넘어간다 —
    // 마지막 만들기 요청이 어차피 같은 검사를 한다(위 onError 가 1단계로 되돌린다).
    const checkName = async (): Promise<boolean> => {
        setCheckingName(true);
        try {
            const res = await apiRequest(`/api/hiq/crews/name-check?name=${encodeURIComponent(trimmedName)}`);
            if (res?.available === false) {
                setNameError(t("crewMgmt.nameTaken"));
                return false;
            }
            return true;
        } catch {
            return true;
        } finally {
            setCheckingName(false);
        }
    };

    const handleNext = async () => {
        if (step === 1) {
            if (!isStep1Valid) {
                setNameError(t("createClub.nameRequired"));
                return;
            }
            if (!(await checkName())) return;
        }
        // Validate the required region on the screen that actually contains the field (step 2).
        if (step >= 2 && !isRegionValid) {
            toast({ title: t("createClub.regionRequired"), variant: "destructive" });
            if (step === 3) setStep(2);
            return;
        }
        if (step < 3) setStep(step + 1);
        else handleSubmit();
    };

    const handleSubmit = () => {
        // 회원 정보가 아직 없으면 조용히 멈추지 않는다 — 예전엔 버튼이 아무 반응도 없었다.
        if (!member) {
            if (isGuest) goLogin(setLocation, "/club/create");
            else toast({ title: t("crewMgmt.meLoading"), variant: "destructive" });
            return;
        }

        // 크루 이름·소개·태그도 공개 UGC 라 첫 생성 전에 약관 동의부터(감사 S4)
        gate(() => createCrewMutation.mutate({
            ...formData as InsertHiqCrew,
            name: trimmedName,
            // 서버는 세션으로 크루장을 정한다(이 값은 믿지 않는다) — 스키마 검증에 필요한 자리만 채운다.
            leaderId: member.id,
            // 무제한(0)은 null — 서버·joinCrew 가 null/0 을 제한 없음으로 본다.
            maxMembers: formData.maxMembers ? formData.maxMembers : null,
            // 파트너 매장이면 baseStoreId, 디렉토리(1,195곳)면 baseListingCode — 서버가 실존 검증
            baseStoreId: selectedStore?.type === "partner" ? selectedStore.id : null,
            baseListingCode: selectedStore?.type === "listing" ? selectedStore.code : null,
            tags: formData.tags || [],
            sportCategory: currentSport,
        } as any));
    };

    // Store Search Query — 당구는 파트너+디렉토리 통합 검색, 골프는 기존 파트너 검색 유지
    const { data: storeResults, isFetching: storeSearching } = useQuery({
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
    const [locating, setLocating] = useState(false);
    useEffect(() => {
        if (gpsLocation) set({ latitude: gpsLocation.lat, longitude: gpsLocation.lng });
    }, [gpsLocation]);
    const pickMyLocation = async () => {
        setLocating(true);
        try {
            const result = await requestLocation();
            if (result !== "granted") {
                toast({ title: result === "denied" ? t("crewMgmt.locationDenied") : t("crewMgmt.locationUnavailable"), variant: "destructive" });
            }
        } finally {
            setLocating(false);
        }
    };

    const stepTitle = t(step === 2 && currentSport === "GOLF" ? "createClub.step2TitleGolf" : STEPS[step - 1].title);
    const stepSubtitle = t(step === 2 && currentSport === "GOLF" ? "createClub.step2SubtitleGolf" : STEPS[step - 1].subtitle);
    const busy = createCrewMutation.isPending || uploadingField !== null || checkingName;

    return (
        <div className="min-h-screen bg-surface-0 text-ink-1 font-sans pb-36">
            {/* Header — 전역 .sticky.top-0 세이프에어리어 규칙(index.css)이 상단 패딩을 env()로 덮어써
                헤더가 위에 딱 붙었다. rk-no-safe로 제외하고 env+8px을 직접 준다 (웹=8px, 앱=상태바+8px). */}
            <div className="rk-no-safe sticky top-0 z-10 bg-surface-0 border-b border-surface-line px-2 pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] mt-[calc(-1*env(safe-area-inset-top))] flex items-center justify-between">
                <IconButton label={t("common.back")} onClick={() => (step > 1 ? setStep(step - 1) : setLocation("/club"))}>
                    <LucideChevronLeft />
                </IconButton>
                <div className="text-[13px] font-semibold text-ink-2 rk-num" aria-live="polite">
                    {step}{t("createClub.stepSuffix")}
                </div>
                <div className="w-11" aria-hidden="true" />
            </div>

            <div className="max-w-md mx-auto px-4 pt-6">
                {/* Progress Bar */}
                <div className="h-1 bg-surface-3 rounded-full mb-6" role="progressbar" aria-valuemin={1} aria-valuemax={3} aria-valuenow={step}>
                    <motion.div className="h-full rounded-full bg-brand" initial={{ width: "33%" }} animate={{ width: `${(step / 3) * 100}%` }} />
                </div>

                <div className="mb-6">
                    {/* 2단계는 골프에서 베이스캠프가 아니라 활동 지역만 받는다 — 제목도 그에 맞춘다 */}
                    <h1 className={CREW_TEXT.title}>{stepTitle}</h1>
                    <p className={cn(CREW_TEXT.sub, "mt-1")}>{stepSubtitle}</p>
                </div>

                <AnimatePresence mode="wait">
                    {step === 1 && (
                        <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex flex-col gap-6">
                            <Field
                                label={t("createClub.nameLabel")}
                                htmlFor="crew-name"
                                required
                                aside={`${formData.name?.length ?? 0}/${NAME_MAX}`}
                                error={nameError}
                            >
                                <Input
                                    id="crew-name"
                                    autoFocus
                                    maxLength={NAME_MAX}
                                    aria-invalid={!!nameError}
                                    placeholder={currentSport === "GOLF" ? t("createClub.namePlaceholderGolf") : t("createClub.namePlaceholderBilliards")}
                                    className={cn(FIELD_INPUT, "h-14 text-[17px] font-semibold", nameError && "border-destructive focus-visible:border-destructive")}
                                    value={formData.name || ""}
                                    onChange={(e) => { set({ name: e.target.value }); setNameError(null); }}
                                />
                            </Field>
                            <Field label={t("createClub.introLabel")} htmlFor="crew-intro" aside={`${formData.shortIntro?.length ?? 0}/${INTRO_MAX}`}>
                                <Input
                                    id="crew-intro"
                                    maxLength={INTRO_MAX}
                                    placeholder={currentSport === "GOLF" ? t("crewMgmt.sloganPlaceholderGolf") : t("crewMgmt.sloganPlaceholderBilliards")}
                                    className={FIELD_INPUT}
                                    value={formData.shortIntro || ""}
                                    onChange={(e) => set({ shortIntro: e.target.value })}
                                />
                            </Field>
                            <Field label={t("createClub.descLabel")} htmlFor="crew-desc">
                                <Textarea
                                    id="crew-desc"
                                    placeholder={currentSport === "GOLF" ? t("createClub.descPlaceholderGolf") : t("createClub.descPlaceholderBilliards")}
                                    className={cn(FIELD_TEXTAREA, "min-h-[160px]")}
                                    value={formData.description || ""}
                                    onChange={(e) => set({ description: e.target.value })}
                                />
                            </Field>

                            <div className="grid grid-cols-2 gap-3">
                                {([
                                    { field: 'emblem' as const, label: "createClub.logoLabel", icon: <LucideCamera />, ref: logoInput },
                                    { field: 'coverImage' as const, label: "createClub.coverLabel", icon: <LucideImagePlus />, ref: coverInput },
                                ]).map(({ field, label, icon, ref }) => {
                                    const value = formData[field] as string | undefined;
                                    const uploading = uploadingField === field;
                                    return (
                                        <Field key={field} label={t(label)}>
                                            <input ref={ref} type="file" className="hidden" accept="image/*" onChange={(e) => handleImageSelect(field, e.currentTarget)} />
                                            <div className="relative">
                                                <button
                                                    type="button"
                                                    disabled={uploading}
                                                    onClick={() => ref.current?.click()}
                                                    aria-label={`${t(label)} ${t("createClub.uploadPhoto")}`}
                                                    className="w-full aspect-square rounded-card bg-surface-1 border border-dashed border-surface-line flex flex-col items-center justify-center gap-2 overflow-hidden text-ink-3 active:bg-surface-3 disabled:cursor-wait"
                                                >
                                                    {uploading ? (
                                                        <>
                                                            <LucideLoader2 className="w-6 h-6 text-brand animate-spin" />
                                                            <span className="text-[12px] font-medium">{t("createClub.uploading")}</span>
                                                        </>
                                                    ) : value ? (
                                                        <img src={value} className="w-full h-full object-cover" alt="" />
                                                    ) : (
                                                        <>
                                                            <span className="[&_svg]:w-6 [&_svg]:h-6">{icon}</span>
                                                            <span className="text-[12px] font-medium">{t("createClub.uploadPhoto")}</span>
                                                        </>
                                                    )}
                                                </button>
                                                {value && !uploading && (
                                                    <IconButton label={t("crewMgmt.removePhoto")} onClick={() => set({ [field]: "" })} className="absolute top-1 right-1 bg-surface-1 shadow-[var(--shadow-card)] [&_svg]:w-4 [&_svg]:h-4">
                                                        <LucideX />
                                                    </IconButton>
                                                )}
                                            </div>
                                        </Field>
                                    );
                                })}
                            </div>
                        </motion.div>
                    )}

                    {step === 2 && (
                        <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex flex-col gap-6">
                            <Field label={t("createClub.regionLabel")} htmlFor="crew-region" required>
                                <RegionField id="crew-region" value={formData.region || ""} onChange={(region) => set({ region })} />
                                {/* 좌표 취득 — 거리순 크루 발견용(선택). 안 누르면 서버가 도시 지오코딩 폴백 */}
                                <button
                                    type="button"
                                    onClick={pickMyLocation}
                                    disabled={locating}
                                    className={cn("self-start min-h-11 -ml-1 px-1 inline-flex items-center gap-1.5 text-[13px] font-semibold", formData.latitude ? "text-brand" : "text-ink-3")}
                                >
                                    {locating ? <LucideLoader2 className="w-4 h-4 animate-spin" /> : formData.latitude ? <LucideCheck className="w-4 h-4" /> : <LucideMapPin className="w-4 h-4" />}
                                    {formData.latitude ? t("createClub.locationSaved") : t("createClub.useMyLocation")}
                                </button>
                            </Field>

                            {/* 베이스캠프는 당구 크루만 — 당구 크루엔 단골 당구장이 있지만 골프 크루는 한 골프장에
                                매이지 않는다. 게다가 여기 검색은 당구 파트너 매장을 뒤진다(골프장 목록은 비어 있다).
                                골프는 위의 '주 활동 지역'이 그 역할을 한다(2026-09-09 오너: 골프 크루는 골프에 맞게). */}
                            {currentSport !== "GOLF" && (
                                <Field label={t("createClub.step2Title")} htmlFor="crew-store">
                                    {selectedStore ? (
                                        <div className="flex items-center justify-between gap-2 pl-3.5 pr-1 py-2 min-h-14 rounded-tile bg-brand/10">
                                            <div className="min-w-0">
                                                <div className="text-[15px] font-semibold text-brand truncate">{selectedStore.name}</div>
                                                <div className="text-[12px] font-medium text-ink-3 truncate">{selectedStore.address}</div>
                                            </div>
                                            <button type="button" className={CREW_BTN.ghost} onClick={() => setSelectedStore(null)}>
                                                {t("clubSettings.baseCampClear")}
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col gap-2">
                                            <div className="relative">
                                                <LucideSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-3" aria-hidden="true" />
                                                <Input
                                                    id="crew-store"
                                                    placeholder={t("createClub.storeSearchPlaceholder")}
                                                    className={cn(FIELD_INPUT, "pl-10")}
                                                    value={searchQuery}
                                                    onChange={(e) => setSearchQuery(e.target.value)}
                                                />
                                            </div>
                                            <div className={cn(CREW_CARD, "p-0 overflow-hidden min-h-[168px]")}>
                                                {storeResults?.length > 0 ? (
                                                    storeResults.map((store: any) => (
                                                        <button
                                                            type="button"
                                                            key={store.id || store.code}
                                                            onClick={() => {
                                                                setSelectedStore(store);
                                                                // Auto-fill region hint if likely match from address
                                                                // "서울 서초구 ..." -> "서울 서초구"
                                                                const regionMatch = store.address?.match(/^(\S+)\s+(\S+)/);
                                                                if (regionMatch && !formData.region) set({ region: `${regionMatch[1]} ${regionMatch[2]}` });
                                                            }}
                                                            className="w-full min-h-14 px-4 py-2.5 border-b border-surface-line last:border-0 active:bg-surface-3 flex items-center justify-between gap-2 text-left"
                                                        >
                                                            <span className="min-w-0">
                                                                <span className="flex items-center gap-1.5 text-[15px] font-semibold text-ink-1">
                                                                    <span className="truncate">{store.name}</span>
                                                                    {store.type === "partner" && <span className="rk-chip shrink-0 bg-brand/10 text-brand">{t("createClub.partnerBadge")}</span>}
                                                                </span>
                                                                <span className="block text-[12px] font-medium text-ink-3 truncate">{store.address}</span>
                                                            </span>
                                                        </button>
                                                    ))
                                                ) : (
                                                    <div className="flex flex-col items-center justify-center h-[168px] gap-2 text-ink-3">
                                                        {storeSearching ? <LucideLoader2 className="w-6 h-6 animate-spin" /> : <LucideMapPin className="w-7 h-7" />}
                                                        <span className="text-[13px] font-medium">
                                                            {searchQuery ? t("createClub.noResults") : t("createClub.storeSearchPrompt")}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                    <div className="mt-1 p-4 rounded-tile bg-surface-3">
                                        <h4 className="text-[13px] font-semibold text-ink-1 flex items-center gap-1.5 mb-1">
                                            <LucideTent className="w-4 h-4 text-brand" />
                                            {t("createClub.baseCampTitle")}
                                        </h4>
                                        <p className="text-[12px] font-medium text-ink-3 leading-relaxed">
                                            {/* 이 카드는 당구 크루에서만 그려지므로 골프 분기는 없앴다 */}
                                            {t("createClub.baseCampIntroBilliards")}
                                            <span className="text-ink-2 font-semibold">{t("createClub.baseCampNotifyBilliards")}</span>
                                            {t("createClub.baseCampMid")}<span className="text-ink-2 font-semibold">{t("createClub.baseCampPerk")}</span>{t("createClub.baseCampEnd")}
                                        </p>
                                    </div>
                                </Field>
                            )}
                        </motion.div>
                    )}

                    {step === 3 && (
                        <motion.div key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex flex-col gap-6">
                            <MeetingPicker
                                day={formData.meetingDay || ""}
                                time={formData.meetingTime || ""}
                                onDayChange={(meetingDay) => set({ meetingDay })}
                                onTimeChange={(meetingTime) => set({ meetingTime })}
                            />
                            <Field label={t("createClub.gameTypeLabel")}>
                                <GameTypePicker sport={currentSport} value={formData.gameType || "any"} onChange={(gameType) => set({ gameType: gameType as any })} />
                            </Field>
                            <Field label={t("createClub.vibeLabel")}>
                                <TagPicker sport={currentSport} value={(formData.tags as string[]) || []} onChange={(tags) => set({ tags })} />
                            </Field>
                            <Field label={t("createClub.joinTypeLabel")}>
                                <JoinTypePicker value={formData.joinType === "approval" ? "approval" : "auto"} onChange={(joinType) => set({ joinType })} />
                            </Field>
                            <Field label={t("createClub.capacityLabel")}>
                                <CapacityPicker value={Number(formData.maxMembers) || 0} onChange={(maxMembers) => set({ maxMembers })} activeCount={1} />
                            </Field>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Bottom Button */}
            <div
                className="fixed bottom-0 left-0 right-0 px-4 pt-3 bg-surface-0 border-t border-surface-line z-20"
                // 전역 `.fixed.bottom-0 { padding-bottom: env(...) }`가 pb 클래스를 덮어써
                // 웹에선 하단 여백이 사라지고 시뮬에선 인셋이 안으로 파고든다. 인라인으로 전역 규칙을
                // 이겨, base(1rem)는 유지하고 홈인디케이터 인셋을 그 아래에 얹는다.
                style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
            >
                <button type="button" className={cn(CREW_BTN.primary, "w-full max-w-md mx-auto flex h-12 text-[17px]")} onClick={handleNext} disabled={busy}>
                    {uploadingField !== null
                        ? t("createClub.uploading")
                        : createCrewMutation.isPending ? t("createClub.creating")
                        : checkingName ? <LucideLoader2 className="w-5 h-5 animate-spin" />
                        : (step === 3 ? t("createClub.submitDone") : t("createClub.next"))}
                </button>
            </div>
        </div>
    );
}
