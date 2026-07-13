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
import { LucidePlus, LucideX, LucideClock } from "lucide-react";
import { addDays, format } from "date-fns";
import { ko } from "date-fns/locale";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface CreatePollDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    crewId: string;
}

export function CreatePollDialog({ open, onOpenChange, crewId }: CreatePollDialogProps) {
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
            toast({ title: "투표가 등록되었습니다." });
            queryClient.invalidateQueries({ queryKey: [`/api/hiq/crews/${crewId}/polls`] });
            onOpenChange(false);
            resetForm();
        },
        onError: (error: any) => {
            toast({
                title: "투표 등록 실패",
                description: error.message || "오류가 발생했습니다.",
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
            toast({ title: "선택지는 최대 10개까지 가능합니다." });
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
            toast({ title: "질문을 입력해주세요.", variant: "destructive" });
            return;
        }

        const filteredOptions = options.map(o => o.trim()).filter(o => o !== "");
        if (filteredOptions.length < 2) {
            toast({ title: "최소 2개 이상의 선택지를 입력해주세요.", variant: "destructive" });
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
            <DialogContent className="bg-[#141416] border-white/10 text-white max-w-md p-0 overflow-hidden rounded-card">
                <div className="py-6 space-y-6">
                    <DialogHeader className="px-6">
                        <DialogTitle className="text-xl font-semibold">새 투표 만들기</DialogTitle>
                        <DialogDescription className="text-white/55">
                            크루 멤버들의 의견을 모아보세요.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-5 overflow-y-auto max-h-[60vh] px-6 custom-scrollbar">
                        {/* Title & Description */}
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label className="text-xs font-semibold text-white/55">질문</Label>
                                <Input
                                    placeholder="무엇을 정할까요?"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    className="bg-surface-2 border-surface-line h-12 rounded-tile focus:ring-brand/30"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs font-semibold text-white/55">설명</Label>
                                <Textarea
                                    placeholder="상세 내용을 입력하세요 (선택)"
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    className="bg-surface-2 border-surface-line rounded-tile resize-none min-h-[80px]"
                                />
                            </div>
                        </div>

                        {/* Options */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <Label className="text-xs font-semibold text-white/55">선택지</Label>
                                <span className="text-[12px] font-medium tabular-nums text-white/55">{options.length} / 10</span>
                            </div>
                            <div className="space-y-2">
                                {options.map((option, idx) => (
                                    <div key={idx} className="flex gap-2">
                                        <div className="relative flex-1 group">
                                            <Input
                                                placeholder={`항목 ${idx + 1}`}
                                                value={option}
                                                onChange={(e) => handleOptionChange(idx, e.target.value)}
                                                className="bg-surface-2 border-surface-line h-11 rounded-tile pl-10"
                                            />
                                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-medium tabular-nums text-white/55 group-focus-within:text-brand">
                                                {String(idx + 1).padStart(2, '0')}
                                            </span>
                                        </div>
                                        {options.length > 2 && (
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => removeOption(idx)}
                                                className="h-11 w-11 rounded-tile hover:bg-red-500/10 text-white/45 hover:text-red-400"
                                            >
                                                <LucideX className="w-4 h-4" />
                                            </Button>
                                        )}
                                    </div>
                                ))}
                                <Button
                                    variant="outline"
                                    onClick={addOption}
                                    className="w-full h-11 border-dashed border-white/10 bg-surface-2 rounded-tile text-white/55 hover:text-white hover:bg-surface-3"
                                >
                                    <LucidePlus className="w-4 h-4 mr-2" />
                                    항목 추가
                                </Button>
                            </div>
                        </div>

                        {/* Settings */}
                        <div className="space-y-4 pt-2">
                            <div className="grid grid-cols-2 gap-4">
                                <div
                                    className={cn(
                                        "flex items-center justify-between p-4 rounded-tile border transition-all cursor-pointer",
                                        isAnonymous ? "bg-brand/10 border-brand/50" : "bg-surface-2 border-surface-line hover:bg-surface-3"
                                    )}
                                    onClick={() => setIsAnonymous(!isAnonymous)}
                                >
                                    <Label className="text-sm font-semibold text-white cursor-pointer select-none">익명 투표</Label>
                                    <Switch checked={isAnonymous} onCheckedChange={setIsAnonymous} className="data-[state=checked]:bg-brand" />
                                </div>

                                <div
                                    className={cn(
                                        "flex items-center justify-between p-4 rounded-tile border transition-all cursor-pointer",
                                        allowMultiple ? "bg-brand/10 border-brand/50" : "bg-surface-2 border-surface-line hover:bg-surface-3"
                                    )}
                                    onClick={() => setAllowMultiple(!allowMultiple)}
                                >
                                    <Label className="text-sm font-semibold text-white cursor-pointer select-none">복수 선택</Label>
                                    <Switch checked={allowMultiple} onCheckedChange={setAllowMultiple} className="data-[state=checked]:bg-brand" />
                                </div>
                            </div>

                            <div className="space-y-2 pb-4">
                                <Label className="text-xs font-semibold text-white/55 pl-1">마감 기한 설정</Label>
                                <Select value={duration} onValueChange={setDuration}>
                                    <SelectTrigger className="w-full h-12 bg-surface-2 border-surface-line rounded-tile text-sm px-4 focus:ring-1 focus:ring-brand/50">
                                        <div className="flex items-center gap-2">
                                            <LucideClock className="w-4 h-4 text-white/40" />
                                            <SelectValue />
                                        </div>
                                    </SelectTrigger>
                                    <SelectContent className="bg-[#141416] border-white/10 text-white rounded-tile">
                                        <SelectItem value="1" className="focus:bg-brand/20 focus:text-white py-3">1일 후 ({format(addDays(new Date(), 1), "M/d HH:mm", { locale: ko })})</SelectItem>
                                        <SelectItem value="2" className="focus:bg-brand/20 focus:text-white py-3">2일 후 ({format(addDays(new Date(), 2), "M/d HH:mm", { locale: ko })})</SelectItem>
                                        <SelectItem value="3" className="focus:bg-brand/20 focus:text-white py-3">3일 후 ({format(addDays(new Date(), 3), "M/d HH:mm", { locale: ko })})</SelectItem>
                                        <SelectItem value="5" className="focus:bg-brand/20 focus:text-white py-3">5일 후 ({format(addDays(new Date(), 5), "M/d HH:mm", { locale: ko })})</SelectItem>
                                        <SelectItem value="7" className="focus:bg-brand/20 focus:text-white py-3">1주일 후 ({format(addDays(new Date(), 7), "M/d HH:mm", { locale: ko })})</SelectItem>
                                        <SelectItem value="14" className="focus:bg-brand/20 focus:text-white py-3">2주일 후 ({format(addDays(new Date(), 14), "M/d HH:mm", { locale: ko })})</SelectItem>
                                        <SelectItem value="30" className="focus:bg-brand/20 focus:text-white py-3">1개월 후 ({format(addDays(new Date(), 30), "M/d HH:mm", { locale: ko })})</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="p-6 border-t border-white/10">
                    <Button
                        onClick={handleSubmit}
                        disabled={createPollMutation.isPending}
                        className="w-full h-12 rk-btn-primary rounded-tile font-semibold text-[15px]"
                    >
                        {createPollMutation.isPending ? "생성 중..." : "투표 생성하기"}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
