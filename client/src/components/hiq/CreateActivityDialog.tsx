import { useForm } from "react-hook-form";
import { useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { BilliardsCategorySelector, type BilliardsCategory } from "@/components/hiq/club/activity/BilliardsCategorySelector";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
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
import { LucideCalendar, LucideMapPin, LucideCoins, LucideUsers, LucideClock } from "lucide-react";

interface CreateActivityDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    crewId: string;
    sportCategory?: 'BILLIARDS' | 'GOLF';
    initialData?: any; // For Edit Mode
}

const CATEGORY_TITLES: Record<string, string> = {
    REGULAR_BILLIARDS: "정기 당구 모임",
    BLITZ_BILLIARDS: "번개 당구",
    BILLIARDS_TOURNAMENT: "당구 대회",
    AFTER_PARTY: "뒷풀이",
};

const formSchema = z.object({
    category: z.string().min(1, "카테고리를 선택해주세요"),
    title: z.string().min(1, "모임명을 입력해주세요"),
    description: z.string().optional(),
    activityDate: z.date({ required_error: "일시를 선택해주세요" }),
    time: z.string().min(1, "시간을 선택해주세요"),
    locationName: z.string().optional(),
    cost: z.string().optional(),
    maxParticipants: z.coerce.number().min(2, "최소 2명 이상이어야 합니다").optional().default(8),
    sportCategory: z.enum(['BILLIARDS', 'GOLF']).default('BILLIARDS'),
});

type FormValues = z.infer<typeof formSchema>;

export function CreateActivityDialog({ open, onOpenChange, crewId, sportCategory, initialData }: CreateActivityDialogProps) {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const isEditMode = !!initialData;

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            category: "",
            title: "",
            description: "",
            locationName: "",
            cost: "",
            maxParticipants: 8,
            time: "19:00",
            sportCategory: sportCategory || 'BILLIARDS',
        },
    });

    // Reset form when initialData changes or dialog opens
    useEffect(() => {
        if (open) {
            if (initialData) {
                // Edit Mode: Populate form
                const dt = new Date(initialData.activityDate);
                const timeStr = `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;

                form.reset({
                    category: initialData.category || "",
                    title: initialData.title || "",
                    description: initialData.description || "",
                    locationName: initialData.locationName || "",
                    cost: initialData.cost || "",
                    maxParticipants: initialData.maxParticipants || 8,
                    sportCategory: sportCategory || 'BILLIARDS', // Keep current sport context
                    activityDate: dt,
                    time: timeStr,
                });
            } else {
                // Create Mode: Reset to defaults
                form.reset({
                    category: "",
                    title: "",
                    description: "",
                    locationName: "",
                    cost: "",
                    maxParticipants: 8,
                    time: "19:00",
                    sportCategory: sportCategory || 'BILLIARDS',
                });
            }
        }
    }, [open, initialData, sportCategory, form]);


    // 카테고리 변경 시 자동 제목 생성 (생성 모드일 때만, 또는 제목이 비어있을 때)
    const watchCategory = form.watch("category");
    useEffect(() => {
        if (!isEditMode && watchCategory && CATEGORY_TITLES[watchCategory]) {
            const currentTitle = form.getValues("title");
            const isSuggestedTitle = Object.values(CATEGORY_TITLES).includes(currentTitle) || !currentTitle;
            if (isSuggestedTitle) {
                form.setValue("title", CATEGORY_TITLES[watchCategory]);
            }
        }
    }, [watchCategory, form, isEditMode]);

    const mutationFn = async (data: FormValues) => {
        // Combine Date and Time
        const dateTime = new Date(data.activityDate);
        const [hours, minutes] = data.time.split(':').map(Number);
        dateTime.setHours(hours, minutes);

        const payload = {
            crewId,
            title: data.title,
            description: data.description,
            locationName: data.locationName,
            cost: data.cost,
            maxParticipants: Number(data.maxParticipants),
            activityDate: dateTime.toISOString(),
            category: data.category,
            sportCategory: data.sportCategory
        };

        if (isEditMode) {
            return await apiRequest(`/api/hiq/crews/${crewId}/activities/${initialData.id}`, {
                method: "PATCH",
                body: payload,
            });
        } else {
            return await apiRequest(`/api/hiq/crews/${crewId}/activities`, {
                method: "POST",
                body: payload,
            });
        }
    };

    const mutation = useMutation({
        mutationFn,
        onSuccess: () => {
            toast({
                title: isEditMode ? "모임 수정 완료" : "모임 생성 완료",
                description: isEditMode ? "정모 정보가 수정되었습니다." : "새로운 정모가 등록되었습니다."
            });
            queryClient.invalidateQueries({ queryKey: [`/api/hiq/crews/${crewId}/activities`] });
            onOpenChange(false);
            if (!isEditMode) form.reset();
        },
        onError: (err: Error) => {
            toast({ title: isEditMode ? "수정 실패" : "생성 실패", description: err.message, variant: "destructive" });
        },
    });

    const onSubmit = (data: FormValues) => {
        mutation.mutate(data);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-white text-ink-1 w-[90%] max-w-[400px] rounded-card p-6">
                <DialogHeader className="mb-2">
                    <DialogTitle className="text-xl font-semibold text-brand">
                        {isEditMode ? "정모 정보 수정" : "새 정모 만들기"}
                    </DialogTitle>
                    <DialogDescription className="text-black/55">
                        {isEditMode ? "정모 정보를 수정해주세요." : "크루원들과 함께할 정모를 만들어보세요."}
                    </DialogDescription>
                </DialogHeader>

                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        {/* 카테고리 선택 */}
                        <FormField
                            control={form.control}
                            name="category"
                            render={({ field }) => (
                                <FormItem>
                                    <BilliardsCategorySelector
                                        selected={field.value as BilliardsCategory}
                                        onSelect={(cat) => field.onChange(cat)}
                                    />
                                    <FormMessage className="text-brand text-[12px] -mt-4" />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="title"
                            render={({ field }) => (
                                <FormItem className="space-y-1">
                                    <FormLabel className="text-[12px] text-black/55 font-semibold ml-1">모임명</FormLabel>
                                    <FormControl>
                                        <Input
                                            placeholder="모임명을 입력하세요"
                                            {...field}
                                            className="bg-surface-3 h-12 rounded-tile px-4 text-sm placeholder:text-black/40 focus-visible:ring-1 focus-visible:ring-brand/30"
                                        />
                                    </FormControl>
                                    <FormMessage className="text-brand text-[12px]" />
                                </FormItem>
                            )}
                        />

                        <div className="grid grid-cols-2 gap-4">
                            <FormField
                                control={form.control}
                                name="activityDate"
                                render={({ field }) => (
                                    <FormItem className="space-y-1 flex flex-col">
                                        <FormLabel className="text-[12px] text-black/55 font-semibold ml-1 flex items-center gap-1">
                                            <LucideCalendar className="w-3 h-3" /> 모임 날짜
                                        </FormLabel>
                                        <Popover>
                                            <PopoverTrigger asChild>
                                                <FormControl>
                                                    <Button
                                                        variant={"ghost"}
                                                        className={cn(
                                                            "w-full text-left font-normal bg-surface-3 rounded-tile h-12 px-4 justify-start hover:bg-black/[0.06] hover:text-ink-1",
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
                                                    disabled={(date) => {
                                                        const today = new Date();
                                                        today.setHours(0, 0, 0, 0);
                                                        return date < today || date < new Date("1900-01-01");
                                                    }}
                                                    initialFocus
                                                    className="p-3 pointer-events-auto text-ink-1"
                                                />
                                            </PopoverContent>
                                        </Popover>
                                        <FormMessage className="text-brand text-[12px]" />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="time"
                                render={({ field }) => (
                                    <FormItem className="space-y-1">
                                        <FormLabel className="text-[12px] text-black/55 font-semibold ml-1 flex items-center gap-1">
                                            <LucideClock className="w-3 h-3" /> 시간
                                        </FormLabel>
                                        <FormControl>
                                            <Input
                                                type="time"
                                                {...field}
                                                style={{ colorScheme: "light" }}
                                                className="bg-surface-3 h-12 rounded-tile px-4 text-sm focus-visible:ring-1 focus-visible:ring-brand/30"
                                            />
                                        </FormControl>
                                        <FormMessage className="text-brand text-[12px]" />
                                    </FormItem>
                                )}
                            />
                        </div>

                        <div className="grid grid-cols-[1.5fr_1fr] gap-4">
                            <FormField
                                control={form.control}
                                name="locationName"
                                render={({ field }) => (
                                    <FormItem className="space-y-1">
                                        <FormLabel className="text-[12px] text-black/55 font-semibold ml-1 flex items-center gap-1">
                                            <LucideMapPin className="w-3 h-3" /> 장소 (당구장)
                                        </FormLabel>
                                        <FormControl>
                                            <Input
                                                placeholder="모임 장소"
                                                {...field}
                                                value={field.value || ""}
                                                className="bg-surface-3 h-12 rounded-tile px-4 text-sm placeholder:text-black/40 focus-visible:ring-1 focus-visible:ring-brand/30"
                                            />
                                        </FormControl>
                                        <FormMessage className="text-brand text-[12px]" />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="maxParticipants"
                                render={({ field }) => (
                                    <FormItem className="space-y-1">
                                        <FormLabel className="text-[12px] text-black/55 font-semibold ml-1 flex items-center gap-1">
                                            <LucideUsers className="w-3 h-3" /> 정원 (최대 인원)
                                        </FormLabel>
                                        <FormControl>
                                            <Input
                                                type="number"
                                                min={2}
                                                {...field}
                                                className="bg-surface-3 h-12 rounded-tile px-4 text-sm focus-visible:ring-1 focus-visible:ring-brand/30"
                                            />
                                        </FormControl>
                                        <FormMessage className="text-brand text-[12px]" />
                                    </FormItem>
                                )}
                            />
                        </div>

                        <FormField
                            control={form.control}
                            name="cost"
                            render={({ field }) => (
                                <FormItem className="space-y-1">
                                    <FormLabel className="text-[12px] text-black/55 font-semibold ml-1 flex items-center gap-1">
                                        <LucideCoins className="w-3 h-3" /> 비용 (참가비)
                                    </FormLabel>
                                    <FormControl>
                                        <Input
                                            type="text"
                                            autoComplete="off"
                                            placeholder="예: 게임비 1/N"
                                            {...field}
                                            value={field.value || ""}
                                            className="bg-surface-3 h-12 rounded-tile px-4 text-sm placeholder:text-black/40 focus-visible:ring-1 focus-visible:ring-brand/30"
                                        />
                                    </FormControl>
                                    <FormMessage className="text-brand text-[12px]" />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="description"
                            render={({ field }) => (
                                <FormItem className="space-y-1">
                                    <FormLabel className="text-[12px] text-black/55 font-semibold ml-1">상세 내용</FormLabel>
                                    <FormControl>
                                        <Textarea
                                            placeholder="모임 상세 내용"
                                            {...field}
                                            value={field.value || ""}
                                            className="bg-surface-3 rounded-tile p-3 resize-none h-20 focus-visible:ring-1 focus-visible:ring-brand transition-all placeholder:text-black/40 text-sm leading-relaxed"
                                        />
                                    </FormControl>
                                    <FormMessage className="text-brand text-[12px]" />
                                </FormItem>
                            )}
                        />

                        <DialogFooter className="pt-2">
                            <Button
                                type="submit"
                                className="w-full h-12 rk-btn-primary rounded-tile font-semibold text-[15px]"
                                disabled={mutation.isPending}
                            >
                                {mutation.isPending ? (isEditMode ? "수정 중..." : "생성 중...") : (isEditMode ? "정모 정보 수정" : "정모 만들기")}
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
