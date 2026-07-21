import { useForm } from "react-hook-form";
import { useEffect, useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { LucideCalendar, LucideMapPin, LucideCoins, LucideUsers, LucideClock, LucideCar } from "@/lib/icons";
import { CategorySelector, ActivityCategory } from "./CategorySelector";
import { LocationSearch } from "./LocationSearch";
import { useT } from "@/lib/i18n";

interface CreateGolfActivityModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    crewId: string;
    initialData?: any; // For Edit Mode
}

const buildFormSchema = (t: (key: string) => string) => z.object({
    category: z.string().min(1, t("createGolfActivityModal.errCategory")),
    title: z.string().min(1, t("createGolfActivityModal.errTitle")),
    description: z.string().optional(),
    startDate: z.date({ required_error: t("createGolfActivityModal.errDate") }),
    endDate: z.date().optional(), // For Tour
    time: z.string().min(1, t("createGolfActivityModal.errTime")),
    locationName: z.string().optional(),
    cost: z.string().optional(),
    maxParticipants: z.coerce.number().min(2, t("createGolfActivityModal.errMaxParticipants")).optional().default(4),

    // Golf Special Fields
});

type FormValues = z.infer<ReturnType<typeof buildFormSchema>>;

export function CreateGolfActivityModal({ open, onOpenChange, crewId, initialData }: CreateGolfActivityModalProps) {
    const { t } = useT();
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [selectedCategory, setSelectedCategory] = useState<ActivityCategory | null>(null);
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

    // Pre-fill the form when opening in edit mode; reset to blank for create.
    useEffect(() => {
        if (!open) return;
        if (initialData) {
            const dt = new Date(initialData.activityDate);
            setSelectedCategory((initialData.category as ActivityCategory) || null);
            form.reset({
                category: initialData.category || "",
                title: initialData.title || "",
                description: initialData.description || "",
                locationName: initialData.locationName || "",
                cost: initialData.cost || "",
                maxParticipants: initialData.maxParticipants || 4,
                startDate: dt,
                time: format(dt, "HH:mm"),
            });
        } else {
            setSelectedCategory(null);
            form.reset({
                title: "", description: "", locationName: "", cost: "",
                maxParticipants: 4, time: "19:00", startDate: new Date(),
            });
        }
    }, [open, initialData, form]);

    // Smart Auto-Fill Logic
    const handleCategorySelect = (category: ActivityCategory) => {
        setSelectedCategory(category);
        form.setValue("category", category);

        // Auto-Fill Title Template
        const today = new Date();
        const dateStr = format(today, "M/d");

        let templateTitle = "";
        let defaultMax = 4;

        switch (category) {
            case "REGULAR_ROUNDING":
                templateTitle = `${t("createGolfActivityModal.tplRegularRoundingPrefix")}${format(today, "M")}${t("createGolfActivityModal.tplRegularRoundingSuffix")}`;
                break;
            case "BLITZ_ROUNDING":
                templateTitle = `${t("createGolfActivityModal.tplBlitzRoundingPrefix")}${dateStr}${t("createGolfActivityModal.tplBlitzRoundingSuffix")}`;
                break;
            case "GOLF_TOUR":
                templateTitle = t("createGolfActivityModal.tplGolfTour");
                defaultMax = 8;
                break;
            case "REGULAR_SCREEN":
                templateTitle = `${t("createGolfActivityModal.tplRegularScreenPrefix")}${format(today, "M")}${t("createGolfActivityModal.tplRegularScreenSuffix")}`;
                break;
            case "BLITZ_SCREEN":
                templateTitle = t("createGolfActivityModal.tplBlitzScreen");
                break;
            case "AFTER_PARTY":
                templateTitle = t("createGolfActivityModal.tplAfterParty");
                defaultMax = 10;
                break;
        }

        form.setValue("title", templateTitle);
        form.setValue("maxParticipants", defaultMax);
    };

    const createMutation = useMutation({
        mutationFn: async (data: FormValues) => {
            // Combine Date and Time
            const dateTime = new Date(data.startDate);
            const [hours, minutes] = data.time.split(':').map(Number);
            dateTime.setHours(hours, minutes);

            // Construct Rich Description
            let richDescription = data.description || "";

            // Append Special Fields to Description
            const extras: string[] = [];
            if (data.endDate) extras.push(`${t("createGolfActivityModal.tourScheduleLabel")} ${format(data.startDate, "M/d")} ~ ${format(data.endDate, "M/d")}`);

            if (extras.length > 0) {
                richDescription = `${richDescription}\n\n---\n${extras.join('\n')}`;
            }

            const payload = {
                crewId,
                title: data.title,
                description: richDescription,
                locationName: data.locationName,
                cost: data.cost,
                maxParticipants: Number(data.maxParticipants),
                activityDate: dateTime.toISOString(),
                category: data.category, // 활동 유형 (REGULAR_ROUNDING, BLITZ_SCREEN, AFTER_PARTY 등)
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
        createMutation.mutate(data);
    };

    const isTour = selectedCategory === "GOLF_TOUR";
    const isField = selectedCategory === "REGULAR_ROUNDING" || selectedCategory === "BLITZ_ROUNDING";

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-white text-ink-1 w-[95%] max-w-[420px] rounded-card p-6 max-h-[90vh] overflow-y-auto custom-scrollbar">
                <DialogHeader className="mb-4">
                    <DialogTitle className="text-xl font-semibold text-center">
                        <span className="text-brand">{t("createGolfActivityModal.golf")}</span> {isEditMode ? t("createGolfActivityModal.titleEdit") : t("createGolfActivityModal.titleCreate")}
                    </DialogTitle>
                </DialogHeader>

                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

                        {/* 1. Category Selector */}
                        <div className="space-y-2">
                            <FormLabel className="text-xs text-ink-3 font-medium ml-1">{t("createGolfActivityModal.labelCategory")}</FormLabel>
                            <CategorySelector selected={selectedCategory} onSelect={handleCategorySelect} />
                        </div>

                        {selectedCategory && (
                            <div className="space-y-4 animate-in slide-in-from-bottom-2 fade-in duration-300">

                                <div className="space-y-4 p-4 bg-black/[0.03] rounded-tile ">
                                    <div className="text-xs text-ink-3 font-medium mb-2">{t("createGolfActivityModal.labelDetails")}</div>

                                    {/* Title */}
                                    <FormField
                                        control={form.control}
                                        name="title"
                                        render={({ field }) => (
                                            <FormItem className="space-y-1">
                                                <FormControl>
                                                    <Input
                                                        placeholder={t("createGolfActivityModal.phTitle")}
                                                        {...field}
                                                        className="bg-surface-2 h-12 rounded-tile px-4 text-base font-bold text-ink-1 placeholder:text-black/40 placeholder:font-normal focus-visible:ring-1 focus-visible:ring-brand/30"
                                                    />
                                                </FormControl>
                                                <FormMessage className="text-brand text-[12px]" />
                                            </FormItem>
                                        )}
                                    />

                                    {/* Date & Time */}
                                    <div className="grid grid-cols-2 gap-4">
                                        <FormField
                                            control={form.control}
                                            name="startDate"
                                            render={({ field }) => (
                                                <FormItem className="space-y-1 flex flex-col">
                                                    <FormLabel className="text-xs text-ink-3 font-medium ml-1 flex items-center gap-1">
                                                        <LucideCalendar className="w-3 h-3" /> {isTour ? t("createGolfActivityModal.labelStartDateTour") : t("createGolfActivityModal.labelDate")}
                                                    </FormLabel>
                                                    <Popover>
                                                        <PopoverTrigger asChild>
                                                            <FormControl>
                                                                <Button
                                                                    variant={"ghost"}
                                                                    className={cn(
                                                                        "w-full text-left font-normal bg-surface-2 rounded-tile h-12 px-4 justify-start hover:bg-surface-3 hover:text-ink-1",
                                                                        !field.value && "text-black/40"
                                                                    )}
                                                                >
                                                                    {field.value ? (
                                                                        format(field.value, "MM/dd (E)", { locale: ko })
                                                                    ) : (
                                                                        <span>{t("createGolfActivityModal.pickDate")}</span>
                                                                    )}
                                                                </Button>
                                                            </FormControl>
                                                        </PopoverTrigger>
                                                        <PopoverContent className="w-auto p-0 bg-white border-black/10" align="start">
                                                            <Calendar
                                                                mode="single"
                                                                selected={field.value}
                                                                onSelect={field.onChange}
                                                                disabled={(date) => date < new Date("1900-01-01")}
                                                                initialFocus
                                                                className="p-3 pointer-events-auto text-ink-1"
                                                            />
                                                        </PopoverContent>
                                                    </Popover>
                                                </FormItem>
                                            )}
                                        />

                                        <FormField
                                            control={form.control}
                                            name="time"
                                            render={({ field }) => (
                                                <FormItem className="space-y-1">
                                                    <FormLabel className="text-xs text-ink-3 font-medium ml-1 flex items-center gap-1">
                                                        <LucideClock className="w-3 h-3" /> {t("createGolfActivityModal.labelTime")}
                                                    </FormLabel>
                                                    <FormControl>
                                                        <Input
                                                            type="time"
                                                            {...field}
                                                            style={{ colorScheme: "light" }}
                                                            className="bg-surface-2 h-12 rounded-tile px-4 text-sm text-ink-1 focus-visible:ring-1 focus-visible:ring-brand/30"
                                                        />
                                                    </FormControl>
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
                                                    <FormLabel className="text-xs text-ink-3 font-medium ml-1 flex items-center gap-1">
                                                        <LucideCalendar className="w-3 h-3" /> {t("createGolfActivityModal.labelEndDate")}
                                                    </FormLabel>
                                                    <Popover>
                                                        <PopoverTrigger asChild>
                                                            <FormControl>
                                                                <Button
                                                                    variant={"ghost"}
                                                                    className={cn(
                                                                        "w-full text-left font-normal bg-surface-2 rounded-tile h-12 px-4 justify-start hover:bg-surface-3 hover:text-ink-1",
                                                                        !field.value && "text-black/40"
                                                                    )}
                                                                >
                                                                    {field.value ? (
                                                                        format(field.value, "MM/dd (E)", { locale: ko })
                                                                    ) : (
                                                                        <span>{t("createGolfActivityModal.pickEndDate")}</span>
                                                                    )}
                                                                </Button>
                                                            </FormControl>
                                                        </PopoverTrigger>
                                                        <PopoverContent className="w-auto p-0 bg-white border-black/10" align="start">
                                                            <Calendar
                                                                mode="single"
                                                                selected={field.value}
                                                                onSelect={field.onChange}
                                                                disabled={(date) => date < form.getValues('startDate')}
                                                                initialFocus
                                                                className="p-3 pointer-events-auto text-ink-1"
                                                            />
                                                        </PopoverContent>
                                                    </Popover>
                                                </FormItem>
                                            )}
                                        />
                                    )}

                                    {/* Location */}
                                    <div className="grid grid-cols-[1.5fr_1fr] gap-4">
                                        <FormField
                                            control={form.control}
                                            name="locationName"
                                            render={({ field }) => (
                                                <FormItem className="space-y-1">
                                                    <FormLabel className="text-xs text-ink-3 font-medium ml-1 flex items-center gap-1">
                                                        <LucideMapPin className="w-3 h-3" /> {t("createGolfActivityModal.labelLocation")}
                                                    </FormLabel>
                                                    <FormControl>
                                                        {/* Use Mock Search for Field/Tour, Simple Input for Others */}
                                                        {isField || isTour ? (
                                                            <LocationSearch
                                                                value={field.value || ""}
                                                                onChange={field.onChange}
                                                            />
                                                        ) : (
                                                            <Input
                                                                placeholder={t("createGolfActivityModal.phLocation")}
                                                                {...field}
                                                                value={field.value || ""}
                                                                className="bg-surface-2 h-12 rounded-tile px-4 text-sm text-ink-1 placeholder:text-black/40 focus-visible:ring-1 focus-visible:ring-brand/30"
                                                            />
                                                        )}
                                                    </FormControl>
                                                </FormItem>
                                            )}
                                        />

                                        <FormField
                                            control={form.control}
                                            name="maxParticipants"
                                            render={({ field }) => (
                                                <FormItem className="space-y-1">
                                                    <FormLabel className="text-xs text-ink-3 font-medium ml-1 flex items-center gap-1">
                                                        <LucideUsers className="w-3 h-3" /> {t("createGolfActivityModal.labelMaxParticipants")}
                                                    </FormLabel>
                                                    <FormControl>
                                                        <Input
                                                            type="number"
                                                            min={2}
                                                            {...field}
                                                            className="bg-surface-2 h-12 rounded-tile px-4 text-sm focus-visible:ring-1 focus-visible:ring-brand/30"
                                                        />
                                                    </FormControl>
                                                </FormItem>
                                            )}
                                        />
                                    </div>

                                    {/* Dynamic Fields based on Category */}

                                    {/* Cost */}
                                    <FormField
                                        control={form.control}
                                        name="cost"
                                        render={({ field }) => (
                                            <FormItem className="space-y-1">
                                                <FormLabel className="text-xs text-ink-3 font-medium ml-1 flex items-center gap-1">
                                                    <LucideCoins className="w-3 h-3" /> {t("createGolfActivityModal.labelCost")}
                                                </FormLabel>
                                                <FormControl>
                                                    <Input
                                                        type="text"
                                                        autoComplete="off"
                                                        placeholder={t("createGolfActivityModal.phCost")}
                                                        {...field}
                                                        value={field.value || ""}
                                                        className="bg-surface-2 h-12 rounded-tile px-4 text-sm text-ink-1 placeholder:text-black/40 focus-visible:ring-1 focus-visible:ring-brand/30"
                                                    />
                                                </FormControl>
                                            </FormItem>
                                        )}
                                    />

                                    {/* Details */}
                                    <FormField
                                        control={form.control}
                                        name="description"
                                        render={({ field }) => (
                                            <FormItem className="space-y-1 pt-2">
                                                <FormControl>
                                                    <Textarea
                                                        placeholder={t("createGolfActivityModal.phDescription")}
                                                        {...field}
                                                        value={field.value || ""}
                                                        className="bg-surface-2 rounded-tile p-3 resize-none h-24 focus-visible:ring-1 focus-visible:ring-brand/30 transition-all text-ink-1 placeholder:text-black/40 text-sm leading-relaxed"
                                                    />
                                                </FormControl>
                                            </FormItem>
                                        )}
                                    />
                                </div>
                            </div>
                        )}

                        <DialogFooter className="pt-2">
                            <Button
                                type="submit"
                                className="w-full h-12 rk-btn-primary rounded-tile font-semibold text-[15px]"
                                disabled={createMutation.isPending || !selectedCategory}
                            >
                                {createMutation.isPending
                                    ? (isEditMode ? t("createGolfActivityModal.submitEditing") : t("createGolfActivityModal.submitCreating"))
                                    : (isEditMode ? t("createGolfActivityModal.submitEdit") : t("createGolfActivityModal.submitCreate"))}
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
