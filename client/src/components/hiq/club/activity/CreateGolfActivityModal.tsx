import { useForm } from "react-hook-form";
import { useEffect, useMemo, useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format, isSameDay, startOfDay } from "date-fns";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { LucideCalendar, LucideMapPin, LucideCoins, LucideUsers, LucideClock, LucideX } from "@/lib/icons";
import { IconButton } from "@/components/hiq/crew-ui";
import { splitTourTrailer, tourEndDate, withTourTrailer } from "@shared/crewActivity";
import { useDateLocale } from "@/components/hiq/crew-board/dateLocale";
import { CategorySelector, ActivityCategory } from "./CategorySelector";
import { LocationSearch } from "./LocationSearch";
import { useT } from "@/lib/i18n";

interface CreateGolfActivityModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    crewId: string;
    initialData?: any; // For Edit Mode
}

// 종류는 새로 만들 때만 필수 — 종류 칸이 생기기 전의 옛 정모(category=null)도 고칠 수 있어야 한다.
// 예전엔 필수라서 옛 정모를 열면 입력칸이 통째로 숨고 저장 버튼이 잠겼다.
const buildFormSchema = (t: (key: string) => string) => z.object({
    category: z.string().optional(),
    title: z.string().trim().min(1, t("createGolfActivityModal.errTitle")),
    description: z.string().optional(),
    startDate: z.date({ required_error: t("createGolfActivityModal.errDate"), invalid_type_error: t("createGolfActivityModal.errDate") }),
    endDate: z.date().optional(), // For Tour
    time: z.string().min(1, t("createGolfActivityModal.errTime")),
    locationName: z.string().optional(),
    cost: z.string().optional(),
    maxParticipants: z.coerce.number({ invalid_type_error: t("createGolfActivityModal.errMaxParticipants") })
        .int().min(2, t("createGolfActivityModal.errMaxParticipants")).max(999),
}).refine((v) => !v.endDate || startOfDay(v.endDate) >= startOfDay(v.startDate), {
    path: ["endDate"], message: t("crewMeet.errEndBeforeStart"),
});

type FormValues = z.infer<ReturnType<typeof buildFormSchema>>;

const DEFAULT_MAX: Partial<Record<ActivityCategory, number>> = { GOLF_TOUR: 8, AFTER_PARTY: 10 };

export function CreateGolfActivityModal({ open, onOpenChange, crewId, initialData }: CreateGolfActivityModalProps) {
    const { t } = useT();
    const dateLocale = useDateLocale();
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [selectedCategory, setSelectedCategory] = useState<ActivityCategory | null>(null);
    // 마지막으로 자동으로 채운 제목 — 사용자가 고친 제목은 종류·날짜를 바꿔도 덮어쓰지 않는다.
    const autoTitle = useRef<string | null>(null);
    const isEditMode = !!initialData;

    const formSchema = useMemo(() => buildFormSchema(t), [t]);

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            title: "",
            description: "",
            locationName: "",
            cost: "",
            maxParticipants: 4,
            time: "19:00",
            startDate: new Date(),
        },
    });

    // 여는 순간 채운다 — 고치기면 정모 내용으로(투어 종료일은 설명 끝 꼬리에서 되살린다), 만들기면 빈 칸으로.
    useEffect(() => {
        if (!open) return;
        autoTitle.current = null;
        if (initialData) {
            const dt = new Date(initialData.activityDate);
            const { body, endMonth, endDay } = splitTourTrailer(initialData.description);
            setSelectedCategory((initialData.category as ActivityCategory) || null);
            form.reset({
                category: initialData.category || undefined,
                title: initialData.title || "",
                description: body,
                locationName: initialData.locationName || "",
                cost: initialData.cost || "",
                maxParticipants: initialData.maxParticipants || 4,
                startDate: dt,
                endDate: initialData.category === "GOLF_TOUR" ? tourEndDate(dt, endMonth, endDay) : undefined,
                time: format(dt, "HH:mm"),
            });
        } else {
            setSelectedCategory(null);
            form.reset({
                category: undefined,
                title: "", description: "", locationName: "", cost: "",
                maxParticipants: 4, time: "19:00", startDate: new Date(), endDate: undefined,
            });
        }
    }, [open, initialData, form]);

    // 종류별 제목 틀 — 고른 날짜 기준(예전엔 오늘 날짜로 박혀 다음 달 정모에 이번 달이 찍혔다).
    const templateFor = (category: ActivityCategory, date: Date): string => {
        const m = String(date.getMonth() + 1);
        const md = `${date.getMonth() + 1}/${date.getDate()}`;
        switch (category) {
            case "REGULAR_ROUNDING": return t("crewMeet.tplRegularRounding").replace("{m}", m);
            case "BLITZ_ROUNDING": return t("crewMeet.tplBlitzRounding").replace("{date}", md);
            case "GOLF_TOUR": return t("crewMeet.tplGolfTour");
            case "REGULAR_SCREEN": return t("crewMeet.tplRegularScreen").replace("{m}", m);
            case "BLITZ_SCREEN": return t("crewMeet.tplBlitzScreen");
            case "AFTER_PARTY": return t("crewMeet.tplAfterParty");
        }
    };

    const applyTemplate = (category: ActivityCategory, date: Date) => {
        const current = form.getValues("title");
        // 비었거나 방금 자동으로 넣은 제목일 때만 바꾼다. 고치기 모드에서 종류를 바꿔도 사용자가 쓴 제목·정원은 지킨다.
        if (current && current !== autoTitle.current) return false;
        const next = templateFor(category, date);
        autoTitle.current = next;
        form.setValue("title", next, { shouldValidate: form.formState.isSubmitted });
        return true;
    };

    const handleCategorySelect = (category: ActivityCategory) => {
        setSelectedCategory(category);
        form.setValue("category", category, { shouldValidate: form.formState.isSubmitted });
        const replaced = applyTemplate(category, form.getValues("startDate") ?? new Date());
        if (replaced && !isEditMode) form.setValue("maxParticipants", DEFAULT_MAX[category] ?? 4);
        if (category !== "GOLF_TOUR") form.setValue("endDate", undefined);
    };

    // 날짜를 바꾸면 자동 제목의 월·날짜도 따라간다(사용자가 고친 제목은 그대로).
    const watchedStart = form.watch("startDate");
    useEffect(() => {
        if (selectedCategory && watchedStart && autoTitle.current) applyTemplate(selectedCategory, watchedStart);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [watchedStart?.getTime()]);

    const createMutation = useMutation({
        mutationFn: async (data: FormValues) => {
            // Combine Date and Time
            const dateTime = new Date(data.startDate);
            const [hours, minutes] = data.time.split(':').map(Number);
            dateTime.setHours(hours, minutes, 0, 0);

            // 투어 종료일은 칸이 없어 설명 끝에 한 줄로 붙인다 — 붙어 있던 꼬리는 떼고 한 번만(예전엔 저장마다 쌓였다).
            const description = withTourTrailer(
                data.description || "",
                t("crewMeet.tourSchedule"),
                data.startDate,
                data.category === "GOLF_TOUR" ? data.endDate : undefined,
            );

            const payload = {
                crewId,
                title: data.title.trim(),
                description,
                locationName: data.locationName,
                cost: data.cost,
                maxParticipants: Number(data.maxParticipants),
                activityDate: dateTime.toISOString(),
                category: data.category || undefined, // 활동 유형 (REGULAR_ROUNDING, BLITZ_SCREEN, AFTER_PARTY 등). 옛 정모는 그대로 둔다
                sportCategory: "GOLF" // Always GOLF for this modal
            };

            if (isEditMode) {
                return await apiRequest(`/api/hiq/crews/${crewId}/activities/${initialData.id}`, {
                    method: "PATCH",
                    body: payload,
                });
            }
            return await apiRequest(`/api/hiq/crews/${crewId}/activities`, {
                method: "POST",
                body: payload,
            });
        },
        onSuccess: () => {
            toast({
                title: isEditMode ? t("createGolfActivityModal.toastEditSuccessTitle") : t("createGolfActivityModal.toastCreateSuccessTitle"),
                description: isEditMode ? t("createGolfActivityModal.toastEditSuccessDesc") : t("createGolfActivityModal.toastCreateSuccessDesc"),
            });
            queryClient.invalidateQueries({ queryKey: [`/api/hiq/crews/${crewId}/activities`] });
            onOpenChange(false);
            if (!isEditMode) {
                form.reset();
                setSelectedCategory(null);
            }
        },
        onError: (err: Error) => {
            toast({ title: isEditMode ? t("createGolfActivityModal.toastEditFailTitle") : t("createGolfActivityModal.toastCreateFailTitle"), description: err.message, variant: "destructive" });
        },
    });

    const onSubmit = (data: FormValues) => {
        if (!isEditMode && !data.category) {
            form.setError("category", { message: t("createGolfActivityModal.errCategory") });
            return;
        }
        createMutation.mutate(data);
    };

    const isTour = selectedCategory === "GOLF_TOUR";
    const isField = selectedCategory === "REGULAR_ROUNDING" || selectedCategory === "BLITZ_ROUNDING";
    // 만들기에서는 종류를 먼저 고르게 하고, 고치기에서는(종류 없는 옛 정모 포함) 바로 보여 준다.
    const showDetails = !!selectedCategory || isEditMode;
    const originalDay = initialData?.activityDate ? new Date(initialData.activityDate) : null;
    const today = startOfDay(new Date());
    // 지난 날짜는 고를 수 없다(당구 정모 창과 같은 규칙). 지난 정모를 고칠 때 원래 날짜만은 그대로 둘 수 있다.
    const isPastDay = (date: Date) => date < today && !(originalDay && isSameDay(date, originalDay));

    const labelClass = "text-[13px] text-ink-3 font-semibold ml-1 flex items-center gap-1";
    const fieldClass = "bg-surface-2 h-12 rounded-tile px-4 text-[15px] text-ink-1 placeholder:text-ink-4 border-transparent focus-visible:ring-1 focus-visible:ring-brand/30";
    const pickerClass = "w-full text-left font-medium bg-surface-2 rounded-tile h-12 px-4 justify-start hover:bg-surface-3 hover:text-ink-1 text-ink-1 truncate";
    const errClass = "text-destructive text-[12px]";

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            {/* 본문만 스크롤하고 제출 줄은 아래에 고정 — 휴대폰에서 버튼이 화면 밖으로 밀리지 않게 */}
            <DialogContent hideClose className="bg-surface-1 text-ink-1 w-[calc(100%-32px)] max-w-[420px] max-h-[90dvh] rounded-card sm:rounded-card border-0 p-0 gap-0 flex flex-col overflow-hidden">
                <DialogHeader className="px-5 pt-5 pb-3 pr-14 text-left">
                    <DialogTitle className="text-[22px] font-semibold text-ink-1">
                        <span className="text-brand">{t("createGolfActivityModal.golf")}</span> {isEditMode ? t("createGolfActivityModal.titleEdit") : t("createGolfActivityModal.titleCreate")}
                    </DialogTitle>
                </DialogHeader>

                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="flex-1 min-h-0 flex flex-col">
                        <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-4 space-y-5 custom-scrollbar">
                            {/* 1. Category Selector */}
                            <FormField
                                control={form.control}
                                name="category"
                                render={() => (
                                    <FormItem className="space-y-2">
                                        <FormLabel className="text-[13px] text-ink-3 font-semibold ml-1">{t("createGolfActivityModal.labelCategory")}</FormLabel>
                                        <CategorySelector selected={selectedCategory} onSelect={handleCategorySelect} />
                                        <FormMessage className={cn(errClass, "-mt-4")} />
                                    </FormItem>
                                )}
                            />

                            {showDetails && (
                                <div className="space-y-4 animate-in slide-in-from-bottom-2 fade-in duration-300">
                                    {/* Title */}
                                    <FormField
                                        control={form.control}
                                        name="title"
                                        render={({ field }) => (
                                            <FormItem className="space-y-1">
                                                <FormLabel className={labelClass}>{t("createActivity.nameLabel")}</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        placeholder={t("createGolfActivityModal.phTitle")}
                                                        {...field}
                                                        maxLength={100}
                                                        className={cn(fieldClass, "font-semibold")}
                                                    />
                                                </FormControl>
                                                <FormMessage className={errClass} />
                                            </FormItem>
                                        )}
                                    />

                                    {/* Date & Time */}
                                    <div className="grid grid-cols-2 gap-3">
                                        <FormField
                                            control={form.control}
                                            name="startDate"
                                            render={({ field }) => (
                                                <FormItem className="space-y-1 flex flex-col min-w-0">
                                                    <FormLabel className={labelClass}>
                                                        <LucideCalendar className="w-3.5 h-3.5" /> {isTour ? t("createGolfActivityModal.labelStartDateTour") : t("createGolfActivityModal.labelDate")}
                                                    </FormLabel>
                                                    <Popover>
                                                        <PopoverTrigger asChild>
                                                            <FormControl>
                                                                <Button variant={"ghost"} className={cn(pickerClass, !field.value && "text-ink-4")}>
                                                                    {field.value ? format(field.value, "M/d (EEE)", { locale: dateLocale }) : <span>{t("createGolfActivityModal.pickDate")}</span>}
                                                                </Button>
                                                            </FormControl>
                                                        </PopoverTrigger>
                                                        <PopoverContent className="w-auto p-0 bg-surface-1 border-surface-line" align="start">
                                                            <Calendar
                                                                mode="single"
                                                                selected={field.value}
                                                                onSelect={field.onChange}
                                                                disabled={isPastDay}
                                                                initialFocus
                                                                className="p-3 pointer-events-auto text-ink-1"
                                                            />
                                                        </PopoverContent>
                                                    </Popover>
                                                    <FormMessage className={errClass} />
                                                </FormItem>
                                            )}
                                        />

                                        <FormField
                                            control={form.control}
                                            name="time"
                                            render={({ field }) => (
                                                <FormItem className="space-y-1 min-w-0">
                                                    <FormLabel className={labelClass}>
                                                        <LucideClock className="w-3.5 h-3.5" /> {t("createGolfActivityModal.labelTime")}
                                                    </FormLabel>
                                                    <FormControl>
                                                        <Input type="time" {...field} className={fieldClass} />
                                                    </FormControl>
                                                    <FormMessage className={errClass} />
                                                </FormItem>
                                            )}
                                        />
                                    </div>

                                    {/* Tour: End Date */}
                                    {isTour && (
                                        <FormField
                                            control={form.control}
                                            name="endDate"
                                            render={({ field }) => (
                                                <FormItem className="space-y-1 flex flex-col">
                                                    <FormLabel className={labelClass}>
                                                        <LucideCalendar className="w-3.5 h-3.5" /> {t("createGolfActivityModal.labelEndDate")}
                                                    </FormLabel>
                                                    <Popover>
                                                        <PopoverTrigger asChild>
                                                            <FormControl>
                                                                <Button variant={"ghost"} className={cn(pickerClass, !field.value && "text-ink-4")}>
                                                                    {field.value ? format(field.value, "M/d (EEE)", { locale: dateLocale }) : <span>{t("createGolfActivityModal.pickEndDate")}</span>}
                                                                </Button>
                                                            </FormControl>
                                                        </PopoverTrigger>
                                                        <PopoverContent className="w-auto p-0 bg-surface-1 border-surface-line" align="start">
                                                            <Calendar
                                                                mode="single"
                                                                selected={field.value}
                                                                onSelect={field.onChange}
                                                                disabled={(date) => date < startOfDay(form.getValues('startDate') ?? today)}
                                                                initialFocus
                                                                className="p-3 pointer-events-auto text-ink-1"
                                                            />
                                                        </PopoverContent>
                                                    </Popover>
                                                    <FormMessage className={errClass} />
                                                </FormItem>
                                            )}
                                        />
                                    )}

                                    {/* Location · Max */}
                                    <div className="grid grid-cols-[1.5fr_1fr] gap-3">
                                        <FormField
                                            control={form.control}
                                            name="locationName"
                                            render={({ field }) => (
                                                <FormItem className="space-y-1 min-w-0">
                                                    <FormLabel className={labelClass}>
                                                        <LucideMapPin className="w-3.5 h-3.5" /> {t("createGolfActivityModal.labelLocation")}
                                                    </FormLabel>
                                                    <FormControl>
                                                        {/* 필드·투어는 골프장 찾기(목록에 없으면 적은 그대로 쓸 수 있다), 나머지는 자유 입력 */}
                                                        {isField || isTour ? (
                                                            <LocationSearch
                                                                value={field.value || ""}
                                                                onChange={field.onChange}
                                                                className={fieldClass}
                                                            />
                                                        ) : (
                                                            <Input
                                                                placeholder={t("createGolfActivityModal.phLocation")}
                                                                {...field}
                                                                value={field.value || ""}
                                                                className={fieldClass}
                                                            />
                                                        )}
                                                    </FormControl>
                                                    <FormMessage className={errClass} />
                                                </FormItem>
                                            )}
                                        />

                                        <FormField
                                            control={form.control}
                                            name="maxParticipants"
                                            render={({ field }) => (
                                                <FormItem className="space-y-1 min-w-0">
                                                    <FormLabel className={labelClass}>
                                                        <LucideUsers className="w-3.5 h-3.5" /> {t("createGolfActivityModal.labelMaxParticipants")}
                                                    </FormLabel>
                                                    <FormControl>
                                                        <Input type="number" inputMode="numeric" min={2} max={999} {...field} className={fieldClass} />
                                                    </FormControl>
                                                    {/* 정원 1명 이하는 예전엔 아무 말 없이 저장이 안 됐다 */}
                                                    <FormMessage className={errClass} />
                                                </FormItem>
                                            )}
                                        />
                                    </div>

                                    {/* Cost */}
                                    <FormField
                                        control={form.control}
                                        name="cost"
                                        render={({ field }) => (
                                            <FormItem className="space-y-1">
                                                <FormLabel className={labelClass}>
                                                    <LucideCoins className="w-3.5 h-3.5" /> {t("createGolfActivityModal.labelCost")}
                                                </FormLabel>
                                                <FormControl>
                                                    <Input
                                                        type="text"
                                                        autoComplete="off"
                                                        placeholder={t("createGolfActivityModal.phCost")}
                                                        {...field}
                                                        value={field.value || ""}
                                                        className={fieldClass}
                                                    />
                                                </FormControl>
                                                <FormMessage className={errClass} />
                                            </FormItem>
                                        )}
                                    />

                                    {/* Details */}
                                    <FormField
                                        control={form.control}
                                        name="description"
                                        render={({ field }) => (
                                            <FormItem className="space-y-1">
                                                <FormLabel className={labelClass}>{t("createActivity.descLabel")}</FormLabel>
                                                <FormControl>
                                                    <Textarea
                                                        placeholder={t("createGolfActivityModal.phDescription")}
                                                        {...field}
                                                        value={field.value || ""}
                                                        className="bg-surface-2 border-transparent rounded-tile p-3 resize-none h-24 focus-visible:ring-1 focus-visible:ring-brand/30 text-ink-1 placeholder:text-ink-4 text-[15px] leading-relaxed"
                                                    />
                                                </FormControl>
                                                <FormMessage className={errClass} />
                                            </FormItem>
                                        )}
                                    />
                                </div>
                            )}
                        </div>

                        <DialogFooter className="px-5 pt-3 pb-[max(20px,env(safe-area-inset-bottom))] border-t border-surface-line">
                            <Button
                                type="submit"
                                className="w-full h-12 rk-btn-primary rounded-pill font-semibold text-[15px]"
                                disabled={createMutation.isPending}
                            >
                                {createMutation.isPending
                                    ? (isEditMode ? t("createGolfActivityModal.submitEditing") : t("createGolfActivityModal.submitCreating"))
                                    : (isEditMode ? t("createGolfActivityModal.submitEdit") : t("createGolfActivityModal.submitCreate"))}
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
                <IconButton label={t("crewPost.close")} onClick={() => onOpenChange(false)} className="absolute right-2 top-2"><LucideX /></IconButton>
            </DialogContent>
        </Dialog>
    );
}
