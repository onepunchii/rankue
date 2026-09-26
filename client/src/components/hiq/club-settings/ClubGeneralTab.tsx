import { useRef, useState } from 'react';
import { LucideCamera, LucideImagePlus, LucideLoader2, LucideSearch } from '@/lib/icons';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { uploadImage } from '@/lib/imageUtils';
import { CrewData } from '@/types/crew';
import { useT } from '@/lib/i18n';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { CREW_BTN, CREW_TEXT } from '@/components/hiq/crew-ui';
import { crewImageSrc, crewSettingsPatch, crewToSettingsForm, type CrewSettingsForm } from '@shared/crewManage';
import { FIELD_INPUT, FIELD_TEXTAREA, Field } from './formKit';
import { RegionField } from './RegionField';
import { MeetingPicker } from './MeetingPicker';
import { CapacityPicker } from './CapacityPicker';
import { GameTypePicker, JoinTypePicker, TagPicker } from './CrewOptionFields';
import { DeleteCrewDialog } from './DeleteCrewDialog';

interface ClubGeneralTabProps {
    crew: CrewData;
    /** 지금 베이스캠프 이름 — GET /crews/:id 응답에서 crew 와 나란히 오는 baseListing·baseStore 의 이름.
     *  예전엔 crew.baseListing 을 읽어서(그런 칸은 없다) 설정을 열 때마다 베이스캠프가 비어 보였다. */
    baseName?: string | null;
    /** 활동 인원(승인 대기 제외) — 정원을 이보다 작게 고를 수 없게 한다(서버 maxBelowCurrent). */
    activeCount: number;
    isLeader: boolean; // 크루 폐쇄 등 리더 전용 동작
    canEdit: boolean; // 리더+매니저 — 정보 수정 (서버 PATCH 정책과 일치)
    /** 바뀐 칸만 담은 PATCH 몸통 */
    onUpdate: (patch: Record<string, unknown>) => void;
    onDelete: () => void;
    isUpdating: boolean;
    isDeleting: boolean;
}

export function ClubGeneralTab({ crew, baseName: initialBaseName, activeCount, isLeader, canEdit, onUpdate, onDelete, isUpdating, isDeleting }: ClubGeneralTabProps) {
    const { t } = useT();
    const { toast } = useToast();
    const [form, setForm] = useState<CrewSettingsForm>(() => crewToSettingsForm(crew as any));
    const [uploading, setUploading] = useState<null | 'emblem' | 'coverImage'>(null);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const logoInput = useRef<HTMLInputElement>(null);
    const coverInput = useRef<HTMLInputElement>(null);
    const set = <K extends keyof CrewSettingsForm>(key: K, value: CrewSettingsForm[K]) => setForm((prev) => ({ ...prev, [key]: value }));

    // 베이스캠프 검색 — 크루 생성 화면과 같은 API(/crews/store-search)를 쓴다.
    const [baseQuery, setBaseQuery] = useState("");
    const [baseName, setBaseName] = useState<string | null>(initialBaseName ?? null);
    const { data: baseResults, isFetching: baseSearching } = useQuery<any[]>({
        queryKey: ["/api/hiq/crews/store-search", baseQuery],
        enabled: baseQuery.trim().length >= 2,
        queryFn: async () => apiRequest(`/api/hiq/crews/store-search?q=${encodeURIComponent(baseQuery.trim())}`),
    });

    // 크루 전환 시 폼 재시드 — useState 1회 초기화만으로는 다른 크루의 값이 남는다(ClubIntroTemplateTab과 동일 패턴).
    const [seededCrewId, setSeededCrewId] = useState(crew?.id);
    if (seededCrewId !== crew?.id) {
        setSeededCrewId(crew?.id);
        setForm(crewToSettingsForm(crew as any));
        setBaseName(initialBaseName ?? null);
    }

    // 바뀐 칸만 — ''↔null, 무제한(0/null), 내기 태그 거른 값은 같은 값으로 본다(shared/crewManage).
    // 예전엔 폼 전체를 원본과 !== 로 비교해서 설정을 열기만 해도 '저장'이 켜졌다.
    const patch = crewSettingsPatch(form, crew as any);
    const isDirty = Object.keys(patch).length > 0;
    const nameInvalid = !form.name.trim();

    const handleFile = async (type: 'emblem' | 'coverImage', input: HTMLInputElement) => {
        const file = input.files?.[0];
        // 같은 파일을 다시 골라도 onChange 가 오도록 비운다 — 안 비우면 업로드 실패 뒤 같은 사진으로 재시도가 안 됐다.
        input.value = "";
        if (!file) return;
        try {
            setUploading(type);
            const url = await uploadImage(file, type === 'coverImage' ? 'crew-cover' : 'crew-logo', { maxSize: type === 'coverImage' ? 1200 : 400 });
            set(type, url);
        } catch {
            toast({ title: t("clubGeneralTab.imageUploadFailed"), variant: "destructive" });
        } finally {
            setUploading(null);
        }
    };

    const cover = crewImageSrc(form.coverImage);
    const emblem = crewImageSrc(form.emblem);

    return (
        <div className="flex flex-col gap-6 pt-4">
            {/* 커버 + 엠블럼 — 커버는 흐리게(opacity) 하지 않는다: 실제 크루 홈에 보이는 그대로 미리 본다. */}
            <div>
                <button
                    type="button"
                    disabled={!canEdit || uploading !== null}
                    onClick={() => coverInput.current?.click()}
                    aria-label={t("clubGeneralTab.changeCover")}
                    className="relative block w-full h-[140px] rounded-card bg-surface-3 overflow-hidden disabled:cursor-default"
                >
                    {cover ? (
                        <img src={cover} className="w-full h-full object-cover" alt="" />
                    ) : (
                        <span className="w-full h-full flex flex-col items-center justify-center gap-2 text-ink-3">
                            <LucideImagePlus className="w-7 h-7" />
                            <span className="text-[13px] font-semibold">{t("clubGeneralTab.coverImage")}</span>
                        </span>
                    )}
                    {canEdit && (
                        <span className="absolute bottom-2 right-2 h-9 px-3 rounded-pill bg-surface-1 text-ink-1 shadow-[var(--shadow-card)] inline-flex items-center gap-1.5 text-[12px] font-semibold">
                            {uploading === 'coverImage' ? <LucideLoader2 className="w-4 h-4 animate-spin" /> : <LucideImagePlus className="w-4 h-4" />}
                            {t("clubGeneralTab.changeCover")}
                        </span>
                    )}
                </button>

                <div className="flex items-end gap-3 -mt-8 px-4 relative">
                    <button
                        type="button"
                        disabled={!canEdit || uploading !== null}
                        onClick={() => logoInput.current?.click()}
                        aria-label={t("clubGeneralTab.editLogo")}
                        className="relative w-20 h-20 shrink-0 rounded-card bg-surface-1 border-4 border-surface-0 overflow-hidden disabled:cursor-default"
                    >
                        {emblem ? (
                            <img src={emblem} className="w-full h-full object-cover" alt="" />
                        ) : (
                            <span className="w-full h-full flex items-center justify-center bg-surface-3 text-ink-3">
                                <LucideCamera className="w-6 h-6" />
                            </span>
                        )}
                        {uploading === 'emblem' && (
                            <span className="absolute inset-0 flex items-center justify-center bg-surface-1 text-brand">
                                <LucideLoader2 className="w-5 h-5 animate-spin" />
                            </span>
                        )}
                    </button>
                    <div className="pb-1 min-w-0">
                        <p className="text-[15px] font-semibold text-ink-1">{t("clubGeneralTab.emblem")}</p>
                        {canEdit && <p className={CREW_TEXT.caption}>{t("crewMgmt.emblemHint")}</p>}
                    </div>
                </div>
                <input ref={logoInput} type="file" className="hidden" accept="image/*" onChange={(e) => handleFile('emblem', e.currentTarget)} />
                <input ref={coverInput} type="file" className="hidden" accept="image/*" onChange={(e) => handleFile('coverImage', e.currentTarget)} />
            </div>

            <Field label={t("clubGeneralTab.crewName")} htmlFor="crew-set-name" required aside={`${form.name.length}/30`} error={nameInvalid ? t("createClub.nameRequired") : undefined}>
                <Input
                    id="crew-set-name"
                    value={form.name}
                    maxLength={30}
                    onChange={(e) => set("name", e.target.value)}
                    disabled={!canEdit}
                    placeholder={t("clubGeneralTab.crewNamePlaceholder")}
                    className={cn(FIELD_INPUT, "font-semibold")}
                />
            </Field>

            <Field label={t("clubGeneralTab.slogan")} htmlFor="crew-set-intro" aside={`${form.shortIntro.length}/60`}>
                <Input
                    id="crew-set-intro"
                    value={form.shortIntro}
                    maxLength={60}
                    onChange={(e) => set("shortIntro", e.target.value)}
                    disabled={!canEdit}
                    placeholder={crew?.sportCategory === "GOLF" ? t("crewMgmt.sloganPlaceholderGolf") : t("crewMgmt.sloganPlaceholderBilliards")}
                    className={FIELD_INPUT}
                />
            </Field>

            <Field label={t("clubGeneralTab.description")} htmlFor="crew-set-desc">
                <Textarea
                    id="crew-set-desc"
                    value={form.description}
                    onChange={(e) => set("description", e.target.value)}
                    disabled={!canEdit}
                    placeholder={t("clubGeneralTab.descriptionPlaceholder")}
                    className={FIELD_TEXTAREA}
                />
            </Field>

            {/* 주 활동 지역 — 만든 뒤에도 바꿀 수 있다(서버 PATCH 가 새 지역으로 좌표도 다시 잡는다). */}
            <Field label={t("createClub.regionLabel")} htmlFor="crew-set-region" hint={t("crewMgmt.regionHint")}>
                <RegionField id="crew-set-region" value={form.region} onChange={(v) => set("region", v)} disabled={!canEdit} />
            </Field>

            {/* 베이스캠프는 당구 크루만 — 골프 크루는 한 골프장에 매이지 않고, 이 검색은 당구 매장을 뒤진다
                (골프장 목록은 비어 있다). 골프는 위의 '주 활동 지역'이 그 역할을 한다(2026-09-09).
                2026-08-05 에는 수정 제외였는데, 그 결과 생성 때 안 고른 크루는 영영 베이스가 비고 '내 주변 크루'가 죽었다
                (오너 확인 2026-08-24). 크루장·운영진만 변경 가능. */}
            {crew?.sportCategory !== "GOLF" && (
                <Field label={t("clubSettings.baseCampLabel")} htmlFor="crew-set-base" hint={baseName ? t("clubSettings.baseCampHint") : undefined}>
                    {baseName ? (
                        <div className="flex items-center justify-between gap-2 pl-3.5 pr-1 min-h-11 rounded-tile bg-brand/10">
                            <span className="text-[15px] font-semibold text-brand truncate">{baseName}</span>
                            {canEdit && (
                                <button
                                    type="button"
                                    className={CREW_BTN.ghost}
                                    onClick={() => { set("baseListingCode", null); set("baseStoreId", null); setBaseName(null); setBaseQuery(""); }}
                                >
                                    {t("clubSettings.baseCampClear")}
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="flex flex-col gap-2">
                            <div className="relative">
                                <LucideSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-3" aria-hidden="true" />
                                <Input
                                    id="crew-set-base"
                                    value={baseQuery}
                                    disabled={!canEdit}
                                    onChange={(e) => setBaseQuery(e.target.value)}
                                    placeholder={t("clubSettings.baseCampPlaceholder")}
                                    className={cn(FIELD_INPUT, "pl-10")}
                                />
                            </div>
                            {baseQuery.trim().length >= 2 && (
                                <div className="rk-card overflow-hidden max-h-[220px] overflow-y-auto">
                                    {baseSearching && !baseResults ? (
                                        <p className="p-3.5 text-[13px] font-medium text-ink-3">{t("common.loading")}</p>
                                    ) : (baseResults ?? []).length === 0 ? (
                                        <p className="p-3.5 text-[13px] font-medium text-ink-3">{t("clubSettings.baseCampEmpty")}</p>
                                    ) : (baseResults ?? []).map((s: any) => (
                                        <button
                                            key={s.code || s.id}
                                            type="button"
                                            onClick={() => {
                                                // 파트너 매장(코드 없음)은 baseStoreId, 디렉토리는 baseListingCode.
                                                // 예전엔 s.code ?? null 만 저장해 파트너를 고르면 null 이 저장됐다.
                                                if (s.type === "partner") {
                                                    set("baseStoreId", s.id ?? null);
                                                    set("baseListingCode", null);
                                                } else {
                                                    set("baseListingCode", s.code ?? null);
                                                    set("baseStoreId", null);
                                                }
                                                setBaseName(s.name);
                                                setBaseQuery("");
                                            }}
                                            className="w-full min-h-11 text-left px-3.5 py-2.5 border-b border-surface-line last:border-0 active:bg-surface-3"
                                        >
                                            <span className="block text-[15px] font-semibold text-ink-1 truncate">{s.name}</span>
                                            <span className="block text-[12px] font-medium text-ink-3 truncate">{s.address}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </Field>
            )}

            <MeetingPicker
                day={form.meetingDay}
                time={form.meetingTime}
                onDayChange={(v) => set("meetingDay", v)}
                onTimeChange={(v) => set("meetingTime", v)}
                disabled={!canEdit}
            />

            {/* 활동 종목 — 생성 위저드(활동 성향)와 같은 선택지. */}
            <Field label={t("createClub.gameTypeLabel")}>
                <GameTypePicker sport={crew?.sportCategory} value={form.gameType} onChange={(v) => set("gameType", v)} disabled={!canEdit} />
            </Field>

            {/* 분위기 태그 — 최대 3개 */}
            <Field label={t("createClub.vibeLabel")}>
                <TagPicker sport={crew?.sportCategory} value={form.tags} onChange={(v) => set("tags", v)} disabled={!canEdit} />
            </Field>

            {/* 가입 방식 — 승인제→자동 전환 시 서버가 대기자를 신청 순서대로 정원 내에서 자동 승격한다 (PATCH 응답 promotedCount). */}
            <Field label={t("createClub.joinTypeLabel")}>
                <JoinTypePicker value={form.joinType} onChange={(v) => set("joinType", v)} disabled={!canEdit} />
            </Field>

            <Field label={t("clubGeneralTab.maxMembers")}>
                <CapacityPicker value={form.maxMembers} onChange={(v) => set("maxMembers", v)} activeCount={activeCount} disabled={!canEdit} />
            </Field>

            {/* 저장 — 시트 아래에 붙어 있어 긴 폼 어디서든 누를 수 있다. 바뀐 칸이 있을 때만 켜진다. */}
            <div className="sticky bottom-0 -mx-4 px-4 pt-3 pb-4 bg-surface-0 border-t border-surface-line">
                {canEdit ? (
                    <button
                        type="button"
                        onClick={() => onUpdate(patch)}
                        disabled={!isDirty || nameInvalid || isUpdating || uploading !== null}
                        className={cn(CREW_BTN.primary, "w-full")}
                    >
                        {isUpdating || uploading ? <LucideLoader2 className="w-5 h-5 animate-spin" /> : t("clubGeneralTab.saveChanges")}
                    </button>
                ) : (
                    <p className="text-center text-[13px] font-medium text-ink-3">{t("clubGeneralTab.leaderOnlyNotice")}</p>
                )}
            </div>

            {isLeader && (
                <section className="flex flex-col gap-2 pb-6">
                    <h3 className="text-[15px] font-semibold text-ink-1">{t("crewMgmt.dangerZone")}</h3>
                    <p className={CREW_TEXT.sub}>{t("crewMgmt.closeCrewDesc")}</p>
                    <button
                        type="button"
                        disabled={isDeleting}
                        onClick={() => setDeleteOpen(true)}
                        className="h-11 w-full rounded-pill border border-destructive text-destructive text-[15px] font-semibold active:bg-surface-3 disabled:opacity-50"
                    >
                        {isDeleting ? t("clubGeneralTab.deleting") : t("clubGeneralTab.closeCrew")}
                    </button>
                    <DeleteCrewDialog
                        open={deleteOpen}
                        onOpenChange={setDeleteOpen}
                        crewName={crew?.name ?? ""}
                        onConfirm={onDelete}
                        busy={isDeleting}
                    />
                </section>
            )}
        </div>
    );
}
