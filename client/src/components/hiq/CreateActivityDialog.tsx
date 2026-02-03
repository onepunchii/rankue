import { useForm } from "react-hook-form";
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
import { LucideCalendar, LucideMapPin, LucideDollarSign, LucideUsers, LucideClock } from "lucide-react";

interface CreateActivityDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    crewId: string;
}

const formSchema = z.object({
    title: z.string().min(1, "모임명을 입력해주세요"),
    description: z.string().optional(),
    activityDate: z.date({ required_error: "일시를 선택해주세요" }),
    time: z.string().min(1, "시간을 선택해주세요"),
    locationName: z.string().optional(),
    cost: z.string().optional(),
    maxParticipants: z.coerce.number().min(2, "최소 2명 이상이어야 합니다").optional().default(8),
});

type FormValues = z.infer<typeof formSchema>;

export function CreateActivityDialog({ open, onOpenChange, crewId }: CreateActivityDialogProps) {
    const { toast } = useToast();
    const queryClient = useQueryClient();

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            title: "",
            description: "",
            locationName: "",
            cost: "",
            maxParticipants: 8,
            time: "19:00",
        },
    });

    const createMutation = useMutation({
        mutationFn: async (data: FormValues) => {
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
            };

            return await apiRequest(`/api/hiq/crews/${crewId}/activities`, {
                method: "POST",
                body: payload,
            });
        },
        onSuccess: () => {
            toast({ title: "모임 생성 완료", description: "새로운 정모가 등록되었습니다." });
            queryClient.invalidateQueries({ queryKey: [`/api/hiq/crews/${crewId}/activities`] });
            onOpenChange(false);
            form.reset();
        },
        onError: (err: Error) => {
            toast({ title: "생성 실패", description: err.message, variant: "destructive" });
        },
    });

    const onSubmit = (data: FormValues) => {
        createMutation.mutate(data);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-[#0A0A0A] border border-white/10 text-white w-[90%] max-w-[400px] rounded-[2rem] shadow-2xl p-6">
                <DialogHeader className="mb-2">
                    <DialogTitle className="text-lg font-bold tracking-tight text-center">새 정모 만들기</DialogTitle>
                </DialogHeader>

                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <FormField
                            control={form.control}
                            name="title"
                            render={({ field }) => (
                                <FormItem className="space-y-1">
                                    <FormLabel className="text-[10px] text-white/40 font-bold ml-1 uppercase">Event Title</FormLabel>
                                    <FormControl>
                                        <Input
                                            placeholder="모임명을 입력하세요"
                                            {...field}
                                            className="bg-transparent border-t-0 border-x-0 border-b border-white/10 rounded-none px-1 h-10 text-sm focus-visible:ring-0 focus-visible:border-[#22c55e] transition-colors placeholder:text-white/20"
                                        />
                                    </FormControl>
                                    <FormMessage className="text-[#22c55e] text-[10px]" />
                                </FormItem>
                            )}
                        />

                        <div className="grid grid-cols-2 gap-4">
                            <FormField
                                control={form.control}
                                name="activityDate"
                                render={({ field }) => (
                                    <FormItem className="space-y-1 flex flex-col">
                                        <FormLabel className="text-[10px] text-white/40 font-bold ml-1 uppercase flex items-center gap-1">
                                            <LucideCalendar className="w-3 h-3" /> Date
                                        </FormLabel>
                                        <Popover>
                                            <PopoverTrigger asChild>
                                                <FormControl>
                                                    <Button
                                                        variant={"ghost"}
                                                        className={cn(
                                                            "w-full pl-1 text-left font-normal border-b border-white/10 rounded-none h-10 hover:bg-transparent hover:text-white px-1 justify-start",
                                                            !field.value && "text-white/20"
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
                                            <PopoverContent className="w-auto p-0 bg-[#141414] border-white/10" align="start">
                                                <Calendar
                                                    mode="single"
                                                    selected={field.value}
                                                    onSelect={field.onChange}
                                                    disabled={(date) => date < new Date() || date < new Date("1900-01-01")}
                                                    initialFocus
                                                    className="p-3 pointer-events-auto text-white dark:[color-scheme:dark]"
                                                />
                                            </PopoverContent>
                                        </Popover>
                                        <FormMessage className="text-[#22c55e] text-[10px]" />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="time"
                                render={({ field }) => (
                                    <FormItem className="space-y-1">
                                        <FormLabel className="text-[10px] text-white/40 font-bold ml-1 uppercase flex items-center gap-1">
                                            <LucideClock className="w-3 h-3" /> Time
                                        </FormLabel>
                                        <FormControl>
                                            <Input
                                                type="time"
                                                {...field}
                                                style={{ colorScheme: "dark" }}
                                                className="bg-transparent border-t-0 border-x-0 border-b border-white/10 rounded-none px-1 h-10 text-sm focus-visible:ring-0 focus-visible:border-[#22c55e] transition-colors [&::-webkit-calendar-picker-indicator]:invert"
                                            />
                                        </FormControl>
                                        <FormMessage className="text-[#22c55e] text-[10px]" />
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
                                        <FormLabel className="text-[10px] text-white/40 font-bold ml-1 uppercase flex items-center gap-1">
                                            <LucideMapPin className="w-3 h-3" /> Location
                                        </FormLabel>
                                        <FormControl>
                                            <Input
                                                placeholder="모임 장소"
                                                {...field}
                                                value={field.value || ""}
                                                className="bg-transparent border-t-0 border-x-0 border-b border-white/10 rounded-none px-1 h-10 text-sm focus-visible:ring-0 focus-visible:border-[#22c55e] transition-colors placeholder:text-white/20"
                                            />
                                        </FormControl>
                                        <FormMessage className="text-[#22c55e] text-[10px]" />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="maxParticipants"
                                render={({ field }) => (
                                    <FormItem className="space-y-1">
                                        <FormLabel className="text-[10px] text-white/40 font-bold ml-1 uppercase flex items-center gap-1">
                                            <LucideUsers className="w-3 h-3" /> Max
                                        </FormLabel>
                                        <FormControl>
                                            <Input
                                                type="number"
                                                {...field}
                                                className="bg-transparent border-t-0 border-x-0 border-b border-white/10 rounded-none px-1 h-10 text-sm focus-visible:ring-0 focus-visible:border-[#22c55e] transition-colors"
                                            />
                                        </FormControl>
                                        <FormMessage className="text-[#22c55e] text-[10px]" />
                                    </FormItem>
                                )}
                            />
                        </div>

                        <FormField
                            control={form.control}
                            name="cost"
                            render={({ field }) => (
                                <FormItem className="space-y-1">
                                    <FormLabel className="text-[10px] text-white/40 font-bold ml-1 uppercase flex items-center gap-1">
                                        <LucideDollarSign className="w-3 h-3" /> Cost
                                    </FormLabel>
                                    <FormControl>
                                        <Input
                                            placeholder="참가 비용 (선택)"
                                            {...field}
                                            value={field.value || ""}
                                            className="bg-transparent border-t-0 border-x-0 border-b border-white/10 rounded-none px-1 h-10 text-sm focus-visible:ring-0 focus-visible:border-[#22c55e] transition-colors placeholder:text-white/20"
                                        />
                                    </FormControl>
                                    <FormMessage className="text-[#22c55e] text-[10px]" />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="description"
                            render={({ field }) => (
                                <FormItem className="space-y-1">
                                    <FormLabel className="text-[10px] text-white/40 font-bold ml-1 uppercase">Details</FormLabel>
                                    <FormControl>
                                        <Textarea
                                            placeholder="모임 상세 내용"
                                            {...field}
                                            value={field.value || ""}
                                            className="bg-white/5 border-none rounded-xl p-3 resize-none h-20 focus-visible:ring-1 focus-visible:ring-[#22c55e] transition-all placeholder:text-white/20 text-xs leading-relaxed"
                                        />
                                    </FormControl>
                                    <FormMessage className="text-[#22c55e] text-[10px]" />
                                </FormItem>
                            )}
                        />

                        <DialogFooter className="pt-2">
                            <Button
                                type="submit"
                                className="w-full bg-[#22c55e] hover:bg-[#16a34a] text-black font-bold h-12 rounded-2xl text-base shadow-lg transition-all transform active:scale-95"
                                disabled={createMutation.isPending}
                            >
                                {createMutation.isPending ? "생성 중..." : "정모 만들기"}
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
