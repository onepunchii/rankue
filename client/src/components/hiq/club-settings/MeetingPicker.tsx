import { useMemo } from "react";
import { LucideX } from "@/lib/icons";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { IconButton } from "@/components/hiq/crew-ui";
import { WEEK_DAYS, formatMeetingDays, isClockTime, parseMeetingDays, type DayLabels, type WeekDay } from "@shared/crewManage";
import { FIELD_INPUT, Field, optionClass } from "./formKit";

/** 현재 언어의 요일 이름(짧은·긴). */
export function useDayLabels(): DayLabels {
    const { t } = useT();
    return useMemo(
        () => Object.fromEntries(WEEK_DAYS.map((d) => [d, { short: t(`crewMgmt.dayShort.${d}`), long: t(`crewMgmt.dayLong.${d}`) }])) as DayLabels,
        [t],
    );
}

/**
 * 정모 요일·시간 — 요일은 칩(여러 개), 시간은 <input type="time">(2026-09-26).
 *
 * 저장 형식은 그대로 사람이 읽는 글이다(크루 홈이 meeting_day·meeting_time 을 그대로 찍는다): 요일 하나면 "토요일",
 * 여럿이면 "토·일", 시간은 "14:00". 예전에 자유 글로 적은 값("매주 토요일", "오후 2시")은 칩으로 풀 수 없으니
 * 지우지 않고 '지금 저장된 값'으로 보여 준다 — 칩이나 시간을 새로 고르면 그 값으로 바뀐다.
 */
export function MeetingPicker({ day, time, onDayChange, onTimeChange, disabled }: {
    day: string;
    time: string;
    onDayChange: (v: string) => void;
    onTimeChange: (v: string) => void;
    disabled?: boolean;
}) {
    const { t } = useT();
    const labels = useDayLabels();
    const parsed = parseMeetingDays(day, labels);
    const selected: WeekDay[] = parsed ?? [];
    const legacyDay = parsed === null ? day : "";
    const legacyTime = time && !isClockTime(time) ? time : "";

    const toggle = (d: WeekDay) => {
        const next = selected.includes(d) ? selected.filter((x) => x !== d) : [...selected, d];
        onDayChange(formatMeetingDays(next, labels));
    };

    return (
        <div className="flex flex-col gap-5">
            <Field
                label={t("clubGeneralTab.meetingDay")}
                hint={legacyDay ? t("crewMgmt.meetingLegacy").replace("{v}", legacyDay) : t("crewMgmt.meetingDayHint")}
            >
                <div className="grid grid-cols-7 gap-1" role="group" aria-label={t("clubGeneralTab.meetingDay")}>
                    {WEEK_DAYS.map((d) => {
                        const on = selected.includes(d);
                        return (
                            <button
                                key={d}
                                type="button"
                                disabled={disabled}
                                aria-pressed={on}
                                aria-label={labels[d].long}
                                onClick={() => toggle(d)}
                                className={optionClass(on, "px-0 w-full")}
                            >
                                {labels[d].short}
                            </button>
                        );
                    })}
                </div>
            </Field>

            <Field
                label={t("crewMgmt.meetingTime")}
                htmlFor="crew-meeting-time"
                hint={legacyTime ? t("crewMgmt.meetingLegacy").replace("{v}", legacyTime) : undefined}
            >
                <div className="flex items-center gap-1">
                    <input
                        id="crew-meeting-time"
                        type="time"
                        step={600}
                        disabled={disabled}
                        value={isClockTime(time) ? time : ""}
                        onChange={(e) => onTimeChange(e.target.value)}
                        className={cn(FIELD_INPUT, "rk-num")}
                    />
                    {time && !disabled && (
                        <IconButton label={t("crewMgmt.clearTime")} onClick={() => onTimeChange("")}>
                            <LucideX />
                        </IconButton>
                    )}
                </div>
            </Field>
        </div>
    );
}
