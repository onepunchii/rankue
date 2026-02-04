import { cn } from '@/lib/utils';
import { THEME_COLORS } from '../../constants/booking';

interface DateSelectorProps {
    weekDates: any[];
    selectedDate: number;
    setSelectedDate: (idx: number) => void;
    bookingCounts: any[];
    viewType: 'ALL' | 'BOOKING' | 'JOIN';
}

export const DateSelector = ({ weekDates, selectedDate, setSelectedDate, bookingCounts, viewType }: DateSelectorProps) => {
    const theme = viewType === 'JOIN' ? THEME_COLORS.JOIN : THEME_COLORS.BOOKING;

    return (
        <div className="flex gap-3 overflow-x-auto px-6 pb-6 pt-2 scrollbar-hide">
            {weekDates.map((date, idx) => {
                const isSelected = selectedDate === idx;
                const count = (Array.isArray(bookingCounts) ? bookingCounts : []).find((c: any) => c.date === date.fullDate)?.count;

                return (
                    <button
                        key={idx}
                        onClick={() => setSelectedDate(idx)}
                        className={cn(
                            "flex flex-col items-center min-w-[64px] py-4 rounded-2xl border transition-all duration-300",
                            isSelected
                                ? `${theme.bg} ${theme.border} text-[#051907] scale-105 shadow-[0_0_20px_rgba(255,255,255,0.1)]`
                                : "bg-[#1E1E1E] border-white/5 text-white/20 hover:border-white/20"
                        )}
                    >
                        <span className="text-[10px] font-bold uppercase tracking-widest mb-1">{date.dayName}</span>
                        <span className="text-xl font-black">{date.dateNum}</span>

                        {count !== undefined && (
                            <div className={cn(
                                "px-1.5 py-0.5 rounded-full text-[9px] font-bold mt-1.5",
                                isSelected ? "bg-black/20 text-black" : (viewType === 'JOIN' ? 'bg-[#FF6B00]/20 text-[#FF6B00]' : 'bg-[#64DD17]/20 text-[#64DD17]')
                            )}>
                                {count.toLocaleString()}개
                            </div>
                        )}
                    </button>
                );
            })}
        </div>
    );
};
