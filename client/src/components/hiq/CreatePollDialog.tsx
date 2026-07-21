import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { LucidePlus, LucideX, LucideClock } from "@/lib/icons";
import { addDays, format } from "date-fns";
import { ko } from "date-fns/locale";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

interface CreatePollDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    crewId: string;
}

export function CreatePollDialog({ open, onOpenChange, crewId }: CreatePollDialogProps) {
    const { t } = useT();
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [options, setOptions] = useState<string[]>(["", ""]);
    const [isAnonymous, setIsAnonymous] = useState(false);
    const [allowMultiple, setAllowMultiple] = useState(false);
    const [duration, setDuration] = useState("3"); // days

    const createPollMutation = useMutation({
        mutationFn: async (data: any) => {
            return await apiRequest(`/api/hiq/crews/${crewId}/polls`, {
                method: "POST",
                body: JSON.stringify(data)
            });
        },
        onSuccess: () => {
            toast({ title: t("createPoll.created") });
            queryClient.invalidateQueries({ queryKey: [`/api/hiq/crews/${crewId}/polls`] });
            onOpenChange(false);
            resetForm();
        },
        onError: (error: any) => {
            toast({
                title: t("createPoll.createFailed"),
                description: error.message || t("createPoll.genericError"),
                variant: "destructive"
            });
        }
    });

    const resetForm = () => {
        setTitle("");
        setDescription("");
        setOptions(["", ""]);
        setIsAnonymous(false);
        setAllowMultiple(false);
        setDuration("3");
    };

    const addOption = () => {
        if (options.length >= 10) {
            toast({ title: t("createPoll.maxOptions") });
            return;
        }
        setOptions([...options, ""]);
    };

    const removeOption = (index: number) => {
        if (options.length <= 2) return;
        setOptions(options.filter((_, i) => i !== index));
    };

    const handleOptionChange = (index: number, value: string) => {
        const newOptions = [...options];
        newOptions[index] = value;
        setOptions(newOptions);
    };

    const handleSubmit = () => {
        if (!title.trim()) {
            toast({ title: t("createPoll.titleRequired"), variant: "destructive" });
            return;
        }

        const filteredOptions = options.map(o => o.trim()).filter(o => o !== "");
        if (filteredOptions.length < 2) {
            toast({ title: t("createPoll.minOptions"), variant: "destructive" });
            return;
        }

        createPollMutation.mutate({
            title,
            description,
            options: filteredOptions,
            isAnonymous,
            allowMultiple,
            endTime: addDays(new Date(), parseInt(duration, 10))
        });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-white border-black/[0.08] text-ink-1 max-w-md p-0 overflow-hidden rounded-card">
                <div className="py-6 space-y-6">
                    <DialogHeader className="px-6">
                        <DialogTitle className="text-xl font-semibold text-brand">{t("createPoll.title")}</DialogTitle>
                        <DialogDescription className="text-black/55">
                            {t("createPoll.description")}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-5 overflow-y-auto max-h-[60vh] px-6 custom-scrollbar">
                        {/* Title & Description */}
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label className="text-xs font-semibold text-black/55">{t("createPoll.questionLabel")}</Label>
                                <Input
                                    placeholder={t("createPoll.questionPlaceholder")}
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    className="bg-surface-3 border-black/10 h-12 rounded-tile focus:ring-brand/30 placeholder:text-black/40"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs font-semibold text-black/55">{t("createPoll.descLabel")}</Label>
                                <Textarea
                                    placeholder={t("createPoll.descPlaceholder")}
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    className="bg-surface-3 border-black/10 rounded-tile resize-none min-h-[80px] placeholder:text-black/40"
                                />
                            </div>
                        </div>

                        {/* Options */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <Label className="text-xs font-semibold text-black/55">{t("createPoll.optionsLabel")}</Label>
                                <span className="text-[12px] font-medium tabular-nums text-black/55">{options.length} / 10</span>
                            </div>
                            <div className="space-y-2">
                                {options.map((option, idx) => (
                                    <div key={idx} className="flex gap-2">
                                        <div className="relative flex-1 group">
                                            <Input
                                                placeholder={`${t("createPoll.optionPrefix")} ${idx + 1}`}
                                                value={option}
                                                onChange={(e) => handleOptionChange(idx, e.target.value)}
                                                className="bg-surface-3 border-black/10 h-11 rounded-tile pl-10 placeholder:text-black/40"
                                            />
                                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-medium tabular-nums text-black/55 group-focus-within:text-brand">
                                                {String(idx + 1).padStart(2, '0')}
                                            </span>
                                        </div>
                                        {options.length > 2 && (
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => removeOption(idx)}
                                                className="h-11 w-11 rounded-tile hover:bg-red-500/10 text-black/40 hover:text-red-500"
                                            >
                                                <LucideX className="w-4 h-4" />
                                            </Button>
                                        )}
                                    </div>
                                ))}
                                <Button
                                    variant="outline"
                                    onClick={addOption}
                                    className="w-full h-11 border-dashed border-black/10 bg-surface-3 rounded-tile text-black/55 hover:text-ink-1 hover:bg-black/[0.06]"
                                >
                                    <LucidePlus className="w-4 h-4 mr-2" />
                                    {t("createPoll.addOption")}
                                </Button>
                            </div>
                        </div>

                        {/* Settings */}
                        <div className="space-y-4 pt-2">
                            <div className="grid grid-cols-2 gap-4">
                                <div
                                    className={cn(
                                        "flex items-center justify-between p-4 rounded-tile border transition-all cursor-pointer",
                                        isAnonymous ? "bg-brand/10 border-brand/40" : "bg-surface-3 border-black/10 hover:bg-black/[0.06]"
                                    )}
                                    onClick={() => setIsAnonymous(!isAnonymous)}
                                >
                                    <Label className="text-sm font-semibold text-ink-1 cursor-pointer select-none">{t("createPoll.anonymous")}</Label>
                                    <Switch checked={isAnonymous} onCheckedChange={setIsAnonymous} className="data-[state=checked]:bg-brand" />
                                </div>

                                <div
                                    className={cn(
                                        "flex items-center justify-between p-4 rounded-tile border transition-all cursor-pointer",
                                        allowMultiple ? "bg-brand/10 border-brand/40" : "bg-surface-3 border-black/10 hover:bg-black/[0.06]"
                                    )}
                                    onClick={() => setAllowMultiple(!allowMultiple)}
                                >
                                    <Label className="text-sm font-semibold text-ink-1 cursor-pointer select-none">{t("createPoll.multiple")}</Label>
                                    <Switch checked={allowMultiple} onCheckedChange={setAllowMultiple} className="data-[state=checked]:bg-brand" />
                                </div>
                            </div>

                            <div className="space-y-2 pb-4">
                                <Label className="text-xs font-semibold text-black/55 pl-1">{t("createPoll.deadlineLabel")}</Label>
                                <Select value={duration} onValueChange={setDuration}>
                                    <SelectTrigger className="w-full h-12 bg-surface-3 border-black/10 rounded-tile text-sm px-4 focus:ring-1 focus:ring-brand/40">
                                        <div className="flex items-center gap-2">
                                            <LucideClock className="w-4 h-4 text-black/40" />
                                            <SelectValue />
                                        </div>
                                    </SelectTrigger>
                                    <SelectContent className="bg-white border-black/[0.08] text-ink-1 rounded-tile">
                                        <SelectItem value="1" className="focus:bg-brand/10 focus:text-brand py-3">{t("createPoll.after1Day")} ({format(addDays(new Date(), 1), "M/d HH:mm", { locale: ko })})</SelectItem>
                                        <SelectItem value="2" className="focus:bg-brand/10 focus:text-brand py-3">{t("createPoll.after2Days")} ({format(addDays(new Date(), 2), "M/d HH:mm", { locale: ko })})</SelectItem>
                                        <SelectItem value="3" className="focus:bg-brand/10 focus:text-brand py-3">{t("createPoll.after3Days")} ({format(addDays(new Date(), 3), "M/d HH:mm", { locale: ko })})</SelectItem>
                                        <SelectItem value="5" className="focus:bg-brand/10 focus:text-brand py-3">{t("createPoll.after5Days")} ({format(addDays(new Date(), 5), "M/d HH:mm", { locale: ko })})</SelectItem>
                                        <SelectItem value="7" className="focus:bg-brand/10 focus:text-brand py-3">{t("createPoll.after1Week")} ({format(addDays(new Date(), 7), "M/d HH:mm", { locale: ko })})</SelectItem>
                                        <SelectItem value="14" className="focus:bg-brand/10 focus:text-brand py-3">{t("createPoll.after2Weeks")} ({format(addDays(new Date(), 14), "M/d HH:mm", { locale: ko })})</SelectItem>
                                        <SelectItem value="30" className="focus:bg-brand/10 focus:text-brand py-3">{t("createPoll.after1Month")} ({format(addDays(new Date(), 30), "M/d HH:mm", { locale: ko })})</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="p-6 border-t border-black/10">
                    <Button
                        onClick={handleSubmit}
                        disabled={createPollMutation.isPending}
                        className="w-full h-12 rk-btn-primary rounded-tile font-semibold text-[15px]"
                    >
                        {createPollMutation.isPending ? t("createPoll.creating") : t("createPoll.submit")}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
