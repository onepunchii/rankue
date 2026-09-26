import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LucideX } from "@/lib/icons";
import { IconButton } from "@/components/hiq/crew-ui";
import { useT } from "@/lib/i18n";

// 한국 시각으로 받는 선택 날짜·시각 칸(접수 마감·시작 일시). 값은 'YYYY-MM-DD' + 'HH:mm' 두 문자열이고,
// 보낼 때 shared/crewTime.kstInputToDate 로 UTC 절대 시각이 된다. 날짜를 비우면 "정하지 않음".

export function KstDateTimeField({ id, label, date, time, onDate, onTime, min }: {
    id: string;
    label: string;
    date: string;
    time: string;
    onDate: (v: string) => void;
    onTime: (v: string) => void;
    min?: string;
}) {
    const { t } = useT();
    return (
        <div className="flex flex-col gap-1.5">
            <Label htmlFor={id} className="text-[13px] font-semibold text-ink-2">{label}</Label>
            <div className="flex items-center gap-2">
                <Input
                    id={id} type="date" value={date} min={min}
                    onChange={(e) => onDate(e.target.value)}
                    className="flex-1 min-w-0 h-11 text-[15px] bg-surface-2 border-surface-line rounded-tile"
                />
                <Input
                    type="time" value={time} disabled={!date} aria-label={t("crewPoll.pickTime")}
                    onChange={(e) => onTime(e.target.value)}
                    className="w-[112px] h-11 text-[15px] bg-surface-2 border-surface-line rounded-tile"
                />
                {date && (
                    <IconButton label={t("crewTourney.clearDate")} onClick={() => onDate("")}>
                        <LucideX />
                    </IconButton>
                )}
            </div>
        </div>
    );
}
