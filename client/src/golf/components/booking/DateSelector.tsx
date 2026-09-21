import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface DateSelectorProps {
    weekDates: any[];
    selectedDate: number;
    setSelectedDate: (idx: number) => void;
    bookingCounts: any[];
    viewType: 'ALL' | 'BOOKING' | 'JOIN';
}

/**
 * 날짜 띠(2026-09-21 오너: "날짜 버튼이 쓸모없이 세로로 길다, 숫자만 넣고 '개'는 빼자").
 * 칸 높이 56px — 요일·날짜·건수 세 줄을 촘촘히. 고른 칸은 커지지 않는다(scale 은 옆 칸을 밀어 띠가 흔들렸다).
 * 건수는 숫자만, 0 이면 안 그린다.
 */
export const DateSelector = ({ weekDates, selectedDate, setSelectedDate, bookingCounts, viewType }: DateSelectorProps) => {
    const stripRef = useRef<HTMLDivElement>(null);
    const join = viewType === 'JOIN';

    // 공유 링크로 20일 뒤가 골라진 채 열리면, 띠는 오늘에 머물러 있어 고른 칩이 화면 밖이었다
    // — 사용자 눈에는 아무 날짜도 안 골라진 것처럼 보인다(2026-09-10 검토).
    useEffect(() => {
        const el = stripRef.current?.children[selectedDate] as HTMLElement | undefined;
        el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }, [selectedDate]);

    return (
        <div ref={stripRef} className="flex gap-1.5 overflow-x-auto px-5 pb-2.5 pt-1 scrollbar-hide">
            {weekDates.map((date, idx) => {
                const isSelected = selectedDate === idx;
                const count = Number((Array.isArray(bookingCounts) ? bookingCounts : []).find((c: any) => c.date === date.fullDate)?.count ?? 0);
                const weekend = date.dayName === '토' || date.dayName === '일';
                return (
                    <button
                        key={idx}
                        onClick={() => setSelectedDate(idx)}
                        aria-pressed={isSelected}
                        className={cn(
                            "shrink-0 w-[46px] h-14 rounded-xl border flex flex-col items-center justify-center gap-0.5 transition-colors",
                            isSelected
                                ? (join ? "bg-[#FF6B00] border-[#FF6B00] text-white" : "bg-[#64DD17] border-[#64DD17] text-[#051907]")
                                : "bg-white/[0.04] border-white/[0.06] text-white/70",
                        )}
                    >
                        <span className={cn("text-[10px] font-medium leading-none", !isSelected && (weekend ? (date.dayName === '일' ? "text-red-400/80" : "text-[#7CBBFF]/80") : "text-white/45"))}>{date.dayName}</span>
                        <span className="rk-num text-[16px] font-semibold leading-none">{date.dateNum}</span>
                        <span className={cn("rk-num text-[10px] font-semibold leading-none h-[10px]", isSelected ? "text-black/60" : (join ? "text-[#FF8A33]" : "text-[#8BE84A]"))}>
                            {count > 0 ? count : ""}
                        </span>
                    </button>
                );
            })}
        </div>
    );
};
