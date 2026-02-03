import { cn } from "@/lib/utils";

interface FilterChipsProps {
    chips: string[];
    activeCategory: string;
    onSelect: (category: string) => void;
}

export const FilterChips = ({ chips, activeCategory, onSelect }: FilterChipsProps) => {
    return (
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide -mx-4 px-4 sticky top-[152px] z-30 bg-[#09090b]/95 backdrop-blur-xl py-2">
            {chips.map(chip => (
                <button
                    key={chip}
                    onClick={() => onSelect(chip)}
                    className={cn(
                        "px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all border",
                        activeCategory === chip
                            ? "bg-[#64DD17] border-[#64DD17] text-[#09090b]"
                            : "bg-[#18181b] border-white/10 text-white/60 hover:text-white hover:border-[#64DD17]"
                    )}
                >
                    {chip}
                </button>
            ))}
        </div>
    );
};
