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
import { LucideMail, LucideSend } from "@/lib/icons";
import { useT } from "@/lib/i18n";

interface SuggestionModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

const makeFormSchema = (t: (key: string) => string) => z.object({
    type: z.enum(["BUG", "PARTNERSHIP", "FEATURE", "ETC"], {
        required_error: t("suggestion.categoryRequired"),
    }),
    content: z.string().min(1, t("suggestion.contentRequired")).max(500, t("suggestion.contentMaxLength")),
    contact: z.string().optional(),
});

type FormValues = z.infer<ReturnType<typeof makeFormSchema>>;

export function SuggestionModal({ open, onOpenChange }: SuggestionModalProps) {
    const { toast } = useToast();
    const { t } = useT();
    const form = useForm<FormValues>({
        resolver: zodResolver(makeFormSchema(t)),
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
                title: t("suggestion.thanksTitle"),
                description: t("suggestion.thanksDesc"),
            });
            form.reset();
            onOpenChange(false);
        },
        onError: (error: Error) => {
            toast({
                title: t("suggestion.sendFailed"),
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
                        {t("suggestion.title")}
                    </DialogTitle>
                    <DialogDescription className="text-black/55">
                        {t("suggestion.description")}
                    </DialogDescription>
                </DialogHeader>

                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-4">
                        <FormField
                            control={form.control}
                            name="type"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-xs font-semibold text-black/55">{t("suggestion.categoryLabel")}</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <FormControl>
                                            <SelectTrigger className="bg-black/[0.04] border-black/10 text-ink-1 rounded-tile">
                                                <SelectValue placeholder={t("suggestion.categoryPlaceholder")} />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent className="bg-white border-black/10 text-ink-1 rounded-tile">
                                            <SelectItem value="BUG">{t("suggestion.typeBug")}</SelectItem>
                                            <SelectItem value="PARTNERSHIP">{t("suggestion.typePartnership")}</SelectItem>
                                            <SelectItem value="FEATURE">{t("suggestion.typeFeature")}</SelectItem>
                                            <SelectItem value="ETC">{t("suggestion.typeEtc")}</SelectItem>
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
                                    <FormLabel className="text-xs font-semibold text-black/55">{t("suggestion.contentLabel")}</FormLabel>
                                    <FormControl>
                                        <Textarea
                                            placeholder={t("suggestion.contentPlaceholder")}
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
                                    <FormLabel className="text-xs font-semibold text-black/55">{t("suggestion.contactLabel")}</FormLabel>
                                    <FormControl>
                                        <Input
                                            placeholder={t("suggestion.contactPlaceholder")}
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
                            {mutation.isPending ? t("suggestion.sending") : t("suggestion.send")}
                            <LucideSend className="w-4 h-4 ml-2" />
                        </Button>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
