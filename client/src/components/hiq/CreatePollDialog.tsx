import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { LucidePlus, LucideX, LucideClock } from "@/lib/icons";
import { CREW_BTN, CREW_TEXT, CrewChip, CrewChipRow, IconButton } from "@/components/hiq/crew-ui";
import { formatKst } from "@/components/hiq/poll/crewTimeFormat";
import { POLL_LIMITS, checkPollEndTime, normalizePollOptions } from "@shared/crewPoll";
import { dateToKstInput, kstEndOfDay, kstInputToDate } from "@shared/crewTime";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

// 투표 만들기(2026-09-26 크루 정비).
//  - 마감 기본값은 "n일 뒤 23:59(한국 시각)". 예전 addDays(now, n) 은 "사흘 뒤 지금 이 분"이라 밤 11시 7분 같은
//    어정쩡한 마감이 됐고, 목록의 미리보기 시각도 기기 시간대로 찍혀 해외 회원에게 9시간씩 달랐다.
//  - '직접 고르기'로 날짜·시각을 KST 로 받는다.
//  - 검증은 서버와 같은 함수(shared/crewPoll) — 빈 칸·중복·60자 초과·지난 마감을 보내기 전에 막는다.
//  - 틀은 대회 개설 창과 같다: 제목·만들기 버튼은 고정, 본문만 스크롤(폰에서 버튼이 화면 밖으로 밀리지 않게).

interface CreatePollDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    crewId: string;
    /** 새로 만든 투표(서버 행) — 채팅 + 에서 열었으면 그 투표를 카드로 붙인다. */
    onCreated?: (poll: any) => void;
}

const PRESETS = [0, 1, 3, 7] as const;
type Preset = (typeof PRESETS)[number] | "custom";

export function CreatePollDialog({ open, onOpenChange, crewId, onCreated }: CreatePollDialogProps) {
    const { t, locale } = useT();
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [options, setOptions] = useState<string[]>(["", ""]);
    const [isAnonymous, setIsAnonymous] = useState(false);
    const [allowMultiple, setAllowMultiple] = useState(false);
    const [preset, setPreset] = useState<Preset>(3);
    const [customDate, setCustomDate] = useState("");
    const [customTime, setCustomTime] = useState("23:59");
    // 창을 여는 순간의 '지금' — 미리보기 마감 시각과 '오늘' 기준이 된다.
    const [openedAt, setOpenedAt] = useState(() => Date.now());

    const resetForm = () => {
        setTitle("");
        setDescription("");
        setOptions(["", ""]);
        setIsAnonymous(false);
        setAllowMultiple(false);
        setPreset(3);
        setCustomDate("");
        setCustomTime("23:59");
    };

    useEffect(() => {
        if (!open) return;
        const n = Date.now();
        setOpenedAt(n);
        // 직접 고르기의 기본 날짜는 사흘 뒤(프리셋 기본과 같게).
        setCustomDate((d) => d || dateToKstInput(kstEndOfDay(n, 3)).date);
    }, [open]);

    const endTime: Date | null = useMemo(() => {
        if (preset === "custom") return kstInputToDate(customDate, customTime);
        return kstEndOfDay(openedAt, preset);
    }, [preset, customDate, customTime, openedAt]);

    const createPollMutation = useMutation({
        mutationFn: (data: any) => apiRequest(`/api/hiq/crews/${crewId}/polls`, { method: "POST", body: JSON.stringify(data) }),
        onSuccess: (row: any) => {
            if (row?.id) onCreated?.(row);
            toast({ title: t("createPoll.created") });
            queryClient.invalidateQueries({ queryKey: [`/api/hiq/crews/${crewId}/polls`] });
            onOpenChange(false);
            resetForm();
        },
        onError: (error: any) => {
            toast({ title: t("createPoll.createFailed"), description: error?.message || t("createPoll.genericError"), variant: "destructive" });
        },
    });

    const addOption = () => {
        if (options.length >= POLL_LIMITS.maxOptions) {
            toast({ title: t("createPoll.maxOptions") });
            return;
        }
        setOptions([...options, ""]);
    };
    const removeOption = (index: number) => {
        if (options.length <= POLL_LIMITS.minOptions) return;
        setOptions(options.filter((_, i) => i !== index));
    };
    const changeOption = (index: number, value: string) => setOptions(options.map((o, i) => (i === index ? value : o)));

    const handleSubmit = () => {
        const q = title.trim();
        if (!q) {
            toast({ title: t("createPoll.titleRequired"), variant: "destructive" });
            return;
        }
        const norm = normalizePollOptions(options);
        if (!norm.ok) {
            const msg = norm.reason === "duplicate" ? t("crewPoll.optionDuplicate")
                : norm.reason === "tooLong" ? t("crewPoll.optionTooLong").replace("{n}", String(POLL_LIMITS.optionMax))
                    : t("createPoll.minOptions");
            toast({ title: msg, variant: "destructive" });
            return;
        }
        const end = checkPollEndTime(endTime ? endTime.toISOString() : "invalid");
        if (!end.ok) {
            const msg = end.reason === "past" ? t("crewPoll.endPast")
                : end.reason === "tooFar" ? t("crewPoll.endTooFar").replace("{n}", String(POLL_LIMITS.maxDays))
                    : t("crewPoll.endInvalid");
            toast({ title: msg, variant: "destructive" });
            return;
        }
        createPollMutation.mutate({
            title: q,
            description: description.trim(),
            options: norm.options,
            isAnonymous,
            allowMultiple,
            endTime: end.endTime?.toISOString(),
        });
    };

    const presetLabel = (p: Preset) =>
        p === "custom" ? t("crewPoll.presetCustom")
            : p === 0 ? t("crewPoll.presetToday")
                : p === 1 ? t("crewPoll.presetTomorrow")
                    : p === 7 ? t("crewPoll.presetWeek")
                        : t("crewPoll.presetDays").replace("{n}", String(p));

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-surface-1 text-ink-1 max-w-[420px] max-h-[88dvh] rounded-card flex flex-col gap-0 p-0">
                <DialogHeader className="shrink-0 px-4 pt-5 pb-3 pr-14 text-left">
                    <DialogTitle className={CREW_TEXT.section}>{t("createPoll.title")}</DialogTitle>
                    <DialogDescription className={CREW_TEXT.sub}>{t("createPoll.description")}</DialogDescription>
                </DialogHeader>

                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-4 pb-2 flex flex-col gap-5">
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="poll-title" className="text-[13px] font-semibold text-ink-2">{t("createPoll.questionLabel")}</Label>
                        <Input
                            id="poll-title" value={title} maxLength={POLL_LIMITS.titleMax}
                            placeholder={t("createPoll.questionPlaceholder")}
                            onChange={(e) => setTitle(e.target.value)}
                            className="h-12 text-[15px] bg-surface-2 border-surface-line rounded-tile"
                        />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="poll-desc" className="text-[13px] font-semibold text-ink-2">{t("createPoll.descLabel")}</Label>
                        <Textarea
                            id="poll-desc" value={description} maxLength={POLL_LIMITS.descMax} rows={2}
                            placeholder={t("createPoll.descPlaceholder")}
                            onChange={(e) => setDescription(e.target.value)}
                            className="text-[15px] bg-surface-2 border-surface-line rounded-tile resize-none"
                        />
                    </div>

                    {/* 선택지 */}
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                            <Label className="text-[13px] font-semibold text-ink-2">{t("createPoll.optionsLabel")}</Label>
                            <span className="text-[12px] font-medium text-ink-3 rk-num">{options.length} / {POLL_LIMITS.maxOptions}</span>
                        </div>
                        {options.map((option, idx) => (
                            <div key={idx} className="flex items-center gap-1">
                                <Input
                                    value={option} maxLength={POLL_LIMITS.optionMax}
                                    aria-label={t("crewPoll.optionN").replace("{n}", String(idx + 1))}
                                    placeholder={t("crewPoll.optionN").replace("{n}", String(idx + 1))}
                                    onChange={(e) => changeOption(idx, e.target.value)}
                                    className="flex-1 min-w-0 h-11 text-[15px] bg-surface-2 border-surface-line rounded-tile"
                                />
                                {options.length > POLL_LIMITS.minOptions && (
                                    <IconButton label={t("crewPoll.removeOption")} onClick={() => removeOption(idx)}>
                                        <LucideX />
                                    </IconButton>
                                )}
                            </div>
                        ))}
                        {options.length < POLL_LIMITS.maxOptions && (
                            <button type="button" onClick={addOption} className={cn(CREW_BTN.secondary, "w-full border-dashed")}>
                                <LucidePlus className="w-4 h-4" />
                                {t("createPoll.addOption")}
                            </button>
                        )}
                    </div>

                    {/* 방식 */}
                    <div className="rk-card-2 px-4 divide-y divide-surface-line">
                        <label className="flex items-center justify-between gap-3 min-h-12 cursor-pointer">
                            <span className="flex flex-col">
                                <span className="text-[15px] font-medium text-ink-1">{t("createPoll.anonymous")}</span>
                                <span className={CREW_TEXT.caption}>{t("crewPoll.anonymousHint")}</span>
                            </span>
                            <Switch checked={isAnonymous} onCheckedChange={setIsAnonymous} className="data-[state=checked]:bg-brand" />
                        </label>
                        <label className="flex items-center justify-between gap-3 min-h-12 cursor-pointer">
                            <span className="flex flex-col">
                                <span className="text-[15px] font-medium text-ink-1">{t("createPoll.multiple")}</span>
                                <span className={CREW_TEXT.caption}>{t("crewPoll.multipleHint")}</span>
                            </span>
                            <Switch checked={allowMultiple} onCheckedChange={setAllowMultiple} className="data-[state=checked]:bg-brand" />
                        </label>
                    </div>

                    {/* 마감 */}
                    <div className="flex flex-col gap-2 pb-2">
                        <Label className="text-[13px] font-semibold text-ink-2">{t("createPoll.deadlineLabel")}</Label>
                        <CrewChipRow label={t("createPoll.deadlineLabel")} className="-mx-4 px-4">
                            {[...PRESETS, "custom" as const].map((p) => (
                                <CrewChip key={String(p)} selected={preset === p} onClick={() => setPreset(p)}>
                                    {presetLabel(p)}
                                </CrewChip>
                            ))}
                        </CrewChipRow>
                        {preset === "custom" && (
                            <div className="grid grid-cols-[1fr_auto] gap-2">
                                <Input
                                    type="date" value={customDate} aria-label={t("crewPoll.pickDate")}
                                    min={dateToKstInput(openedAt).date}
                                    onChange={(e) => setCustomDate(e.target.value)}
                                    className="h-11 text-[15px] bg-surface-2 border-surface-line rounded-tile"
                                />
                                <Input
                                    type="time" value={customTime} aria-label={t("crewPoll.pickTime")}
                                    onChange={(e) => setCustomTime(e.target.value)}
                                    className="h-11 w-[120px] text-[15px] bg-surface-2 border-surface-line rounded-tile"
                                />
                            </div>
                        )}
                        <p className="flex items-center gap-1.5 text-[13px] font-medium text-ink-2 rk-num">
                            <LucideClock className="w-3.5 h-3.5 text-ink-3 shrink-0" />
                            {endTime
                                ? t("crewPoll.deadlineAt").replace("{time}", formatKst(endTime, locale, { weekday: true }))
                                : t("crewPoll.endInvalid")}
                        </p>
                        <p className={CREW_TEXT.caption}>{t("crewPoll.kstNote")}</p>
                    </div>
                </div>

                <DialogFooter className="shrink-0 px-4 pb-4 pt-3 border-t border-surface-line">
                    <button type="button" onClick={handleSubmit} disabled={createPollMutation.isPending} className={cn(CREW_BTN.primary, "w-full")}>
                        {createPollMutation.isPending ? t("createPoll.creating") : t("createPoll.submit")}
                    </button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
