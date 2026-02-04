import { LucideMapPin, LucideClock, LucideArrowUpDown, LucideUsers, LucideX } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetClose } from '@/components/ui/sheet';
import { REGION_OPTIONS, TIME_OPTIONS, PRICE_OPTIONS, SPECIAL_OPTIONS } from '../../constants/booking';

interface FilterBarProps {
    selectedFilters: Record<string, string[]>;
    toggleFilter: (category: string, id: string) => void;
    clearFilter: (category: string) => void;
    viewType: 'ALL' | 'BOOKING' | 'JOIN';
}

export const FilterBar = ({ selectedFilters, toggleFilter, clearFilter, viewType }: FilterBarProps) => {
    return (
        <div className="flex gap-2 overflow-x-auto px-6 pb-6 scrollbar-hide">
            <FilterChip
                icon={LucideMapPin}
                label="골프장"
                title="골프장 선택"
                options={REGION_OPTIONS}
                selectedIds={selectedFilters.region}
                onToggle={(id) => toggleFilter('region', id)}
                onReset={() => clearFilter('region')}
                active={selectedFilters.region.length > 0}
                viewType={viewType}
            />
            <FilterChip
                icon={LucideClock}
                label="시간"
                title="시간대 선택"
                options={TIME_OPTIONS}
                selectedIds={selectedFilters.time}
                onToggle={(id) => toggleFilter('time', id)}
                onReset={() => clearFilter('time')}
                active={selectedFilters.time.length > 0 && !selectedFilters.time.includes('all')}
                viewType={viewType}
            />
            <FilterChip
                icon={LucideArrowUpDown}
                label="가격"
                title="가격 및 정렬"
                options={PRICE_OPTIONS}
                selectedIds={selectedFilters.price}
                onToggle={(id) => toggleFilter('price', id)}
                onReset={() => clearFilter('price')}
                active={selectedFilters.price.length > 0}
                viewType={viewType}
            />
            <FilterChip
                icon={LucideUsers}
                label="인원/옵션"
                title="인원 및 옵션 선택"
                options={SPECIAL_OPTIONS}
                selectedIds={selectedFilters.special}
                onToggle={(id) => toggleFilter('special', id)}
                onReset={() => clearFilter('special')}
                active={selectedFilters.special.length > 0}
                viewType={viewType}
            />
        </div>
    );
};

function FilterChip({
    icon: Icon,
    label,
    active = false,
    title,
    options,
    selectedIds,
    onToggle,
    onReset,
    viewType
}: {
    icon: any,
    label: string,
    active?: boolean,
    title: string,
    options: { id: string, label: string }[],
    selectedIds: string[],
    onToggle: (id: string) => void,
    onReset: () => void,
    viewType?: 'ALL' | 'BOOKING' | 'JOIN'
}) {
    const activeBgColor = viewType === 'JOIN' ? 'bg-[#FF6B00]' : 'bg-[#64DD17]';
    const activeBorderColor = viewType === 'JOIN' ? 'border-[#FF6B00]' : 'border-[#64DD17]';
    const activeTextColor = viewType === 'JOIN' ? 'text-[#FF6B00]' : 'text-[#64DD17]';

    return (
        <Sheet>
            <SheetTrigger asChild>
                <button
                    className={cn(
                        "flex items-center gap-2 px-4 py-2.5 rounded-2xl border text-xs font-bold whitespace-nowrap transition-all active:scale-95 shrink-0",
                        active
                            ? `${activeBgColor}/10 ${activeBorderColor} ${activeTextColor}`
                            : "bg-[#1A1A1A] border-white/5 text-white/40"
                    )}
                    title={title}
                >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{label}</span>
                    {selectedIds.length > 0 && (
                        <span className={cn("w-4 h-4 rounded-full text-[8px] flex items-center justify-center",
                            activeBgColor,
                            viewType === 'JOIN' ? 'text-white' : 'text-[#051907]'
                        )}>
                            {selectedIds.length}
                        </span>
                    )}
                </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="z-[70] bg-[#1A1A1A] border-t border-white/5 rounded-t-[2.5rem] h-[70vh] flex flex-col focus:outline-none [&>button]:hidden">
                <div className="absolute right-8 top-8 z-50">
                    <SheetClose asChild>
                        <button
                            className="p-3 rounded-full bg-white/5 hover:bg-white/10 border border-white/5 text-white/40 hover:text-white transition-all active:scale-95"
                            title="닫기"
                        >
                            <LucideX className="w-6 h-6" />
                        </button>
                    </SheetClose>
                </div>
                <SheetHeader className="mb-6 px-8 pt-8 pr-20 shrink-0">
                    <SheetTitle className="text-2xl font-black text-white flex items-center gap-4">
                        <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center", `${activeBgColor}/10`)}>
                            <Icon className={cn("w-6 h-6", activeTextColor)} />
                        </div>
                        {label} 필터
                    </SheetTitle>
                </SheetHeader>
                <div className="flex-1 overflow-y-auto px-8">
                    <div className="grid grid-cols-2 gap-4 pb-6">
                        {options.map(option => {
                            const isSelected = selectedIds.includes(option.id);
                            return (
                                <button
                                    key={option.id}
                                    onClick={() => onToggle(option.id)}
                                    className={cn(
                                        "p-5 border rounded-2xl text-base font-bold transition-all h-20 flex items-center justify-center text-center",
                                        isSelected
                                            ? `${activeBgColor} ${activeBorderColor} ${viewType === 'JOIN' ? 'text-white' : 'text-[#051907]'}`
                                            : "bg-white/5 border-white/5 text-white/60 hover:border-white/20"
                                    )}
                                >
                                    {option.label}
                                </button>
                            );
                        })}
                    </div>
                </div>
                <div className="px-8 pb-8 flex gap-4 shrink-0 border-t border-white/5 pt-6">
                    <button
                        onClick={onReset}
                        className="flex-1 py-5 rounded-2xl bg-white/5 font-black uppercase tracking-widest text-[#AAAAAA] hover:bg-white/10 transition-all active:scale-95"
                    >
                        초기화
                    </button>
                    <SheetClose asChild>
                        <button className={cn(
                            "flex-1 py-5 rounded-2xl font-black uppercase tracking-widest hover:scale-[1.02] active:scale-[0.98] transition-all",
                            activeBgColor,
                            viewType === 'JOIN' ? 'text-white shadow-[0_0_20px_rgba(255,107,0,0.3)]' : 'text-[#051907] shadow-[0_0_20px_rgba(100,221,23,0.3)]'
                        )}>적용하기</button>
                    </SheetClose>
                </div>
            </SheetContent>
        </Sheet>
    );
}
