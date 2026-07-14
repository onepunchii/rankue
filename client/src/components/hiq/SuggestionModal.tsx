import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { LucideMail, LucideSend } from "lucide-react";

interface SuggestionModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

const formSchema = z.object({
    type: z.enum(["BUG", "PARTNERSHIP", "FEATURE", "ETC"], {
        required_error: "카테고리를 선택해주세요",
    }),
    content: z.string().min(1, "내용을 입력해주세요").max(500, "500자 이내로 입력해주세요"),
    contact: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export function SuggestionModal({ open, onOpenChange }: SuggestionModalProps) {
    const { toast } = useToast();
    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            content: "",
            contact: "",
            type: "FEATURE"
        },
    });

    const mutation = useMutation({
        mutationFn: async (data: FormValues) => {
            return await apiRequest("/api/hiq/suggestions", {
                method: "POST",
                body: data,
            });
        },
        onSuccess: () => {
            toast({
                title: "소중한 의견 감사합니다!",
                description: "보내주신 의견은 꼼꼼히 검토하겠습니다.",
            });
            form.reset();
            onOpenChange(false);
        },
        onError: (error: Error) => {
            toast({
                title: "전송 실패",
                description: error.message,
                variant: "destructive",
            });
        },
    });

    const onSubmit = (data: FormValues) => {
        mutation.mutate(data);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md rounded-card bg-white border-black/10 text-ink-1">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-xl font-semibold">
                        <LucideMail className="w-5 h-5 text-brand" />
                        건의함 / 제휴 문의
                    </DialogTitle>
                    <DialogDescription className="text-black/55">
                        Rankue 팀에게 바라는 점이나 궁금한 점을 남겨주세요.
                    </DialogDescription>
                </DialogHeader>

                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-4">
                        <FormField
                            control={form.control}
                            name="type"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-xs font-semibold text-black/55">분류</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <FormControl>
                                            <SelectTrigger className="bg-black/[0.04] border-black/10 text-ink-1 rounded-tile">
                                                <SelectValue placeholder="카테고리 선택" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent className="bg-white border-black/10 text-ink-1 rounded-tile">
                                            <SelectItem value="BUG">🚫 버그 신고</SelectItem>
                                            <SelectItem value="PARTNERSHIP">🤝 제휴 문의</SelectItem>
                                            <SelectItem value="FEATURE">💡 기능 제안</SelectItem>
                                            <SelectItem value="ETC">💬 기타</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="content"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-xs font-semibold text-black/55">내용</FormLabel>
                                    <FormControl>
                                        <Textarea
                                            placeholder="내용을 입력해주세요 (500자 이내)"
                                            className="resize-none h-32 bg-black/[0.04] border-black/10 text-ink-1 placeholder:text-black/40 rounded-tile"
                                            {...field}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="contact"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-xs font-semibold text-black/55">연락처 (선택)</FormLabel>
                                    <FormControl>
                                        <Input
                                            placeholder="답변 받을 이메일 또는 전화번호"
                                            className="bg-black/[0.04] border-black/10 text-ink-1 placeholder:text-black/40 rounded-tile"
                                            {...field}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <Button
                            type="submit"
                            className="w-full bg-brand text-brand-fg hover:bg-brand-strong font-semibold rounded-tile"
                            disabled={mutation.isPending}
                        >
                            {mutation.isPending ? "전송 중..." : "보내기"}
                            <LucideSend className="w-4 h-4 ml-2" />
                        </Button>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
