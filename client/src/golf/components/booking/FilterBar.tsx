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
        <div className="flex gap-1.5 overflow-x-auto px-5 pb-2.5 scrollbar-hide">
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
                        "h-9 flex items-center gap-1.5 px-3 rounded-full border text-[12.5px] font-medium whitespace-nowrap transition-colors shrink-0",
                        active
                            ? `${activeBgColor}/10 ${activeBorderColor} ${activeTextColor}`
                            : "bg-white/[0.04] border-white/[0.08] text-white/65"
                    )}
                    title={title}
                >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{label}</span>
                    {selectedIds.length > 0 && (
                        <span className={cn("min-w-[16px] h-4 px-1 rounded-full text-[10px] font-semibold flex items-center justify-center",
                            activeBgColor,
                            viewType === 'JOIN' ? 'text-white' : 'text-[#051907]'
                        )}>
                            {selectedIds.length}
                        </span>
                    )}
                </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="z-[70] bg-[#1A1A1A] border-t border-white/5 rounded-t-2xl max-h-[70vh] flex flex-col focus:outline-none [&>button]:hidden">
                <div className="absolute right-4 top-4 z-50">
                    <SheetClose asChild>
                        <button className="p-2 rounded-full bg-white/5 text-white/50 active:bg-white/10" title="닫기">
                            <LucideX className="w-5 h-5" />
                        </button>
                    </SheetClose>
                </div>
                <SheetHeader className="mb-3 px-5 pt-5 pr-14 shrink-0">
                    <SheetTitle className="text-[17px] font-semibold text-white flex items-center gap-2">
                        <Icon className={cn("w-4 h-4", activeTextColor)} />
                        {label}
                    </SheetTitle>
                </SheetHeader>
                <div className="flex-1 overflow-y-auto px-5">
                    <div className="grid grid-cols-2 gap-2 pb-4">
                        {options.map(option => {
                            const isSelected = selectedIds.includes(option.id);
                            return (
                                <button
                                    key={option.id}
                                    onClick={() => onToggle(option.id)}
                                    className={cn(
                                        "h-12 px-3 border rounded-xl text-[14px] font-medium transition-colors flex items-center justify-center text-center",
                                        isSelected
                                            ? `${activeBgColor} ${activeBorderColor} ${viewType === 'JOIN' ? 'text-white' : 'text-[#051907]'}`
                                            : "bg-white/[0.04] border-white/[0.08] text-white/70"
                                    )}
                                >
                                    {option.label}
                                </button>
                            );
                        })}
                    </div>
                </div>
                <div className="px-5 pb-5 flex gap-2 shrink-0 border-t border-white/5 pt-4">
                    <button onClick={onReset} className="h-12 px-5 rounded-xl bg-white/[0.06] text-[14px] font-medium text-white/70 active:bg-white/10">초기화</button>
                    <SheetClose asChild>
                        <button className={cn("flex-1 h-12 rounded-xl text-[15px] font-semibold", activeBgColor, viewType === 'JOIN' ? 'text-white' : 'text-[#051907]')}>적용</button>
                    </SheetClose>
                </div>
            </SheetContent>
        </Sheet>
    );
}
