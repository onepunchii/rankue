import { cn } from "@/lib/utils";



export type ActivityCategory =
    | "REGULAR_ROUNDING"
    | "BLITZ_ROUNDING"
    | "GOLF_TOUR"
    | "REGULAR_SCREEN"
    | "BLITZ_SCREEN"
    | "AFTER_PARTY";

interface CategorySelectorProps {
    selected: ActivityCategory | null;
    onSelect: (category: ActivityCategory) => void;
}

export const CategorySelector = ({ selected, onSelect }: CategorySelectorProps) => {

    const categories = [
        // Row 1: Field / Tour
        {
            id: "REGULAR_ROUNDING", label: "정규 라운딩", desc: "월례회",
            classes: { border: "border-[#2563EB]", text: "text-[#2563EB]", bg: "bg-[#2563EB]" }
        },
        {
            id: "BLITZ_ROUNDING", label: "번개 라운딩", desc: "조인/급구",
            classes: { border: "border-[#EAB308]", text: "text-[#EAB308]", bg: "bg-[#EAB308]" }
        },
        {
            id: "GOLF_TOUR", label: "골프 투어", desc: "여행",
            classes: { border: "border-[#F97316]", text: "text-[#F97316]", bg: "bg-[#F97316]" }
        },

        // Row 2: Screen / Social
        {
            id: "REGULAR_SCREEN", label: "정규 스크린", desc: "대회",
            classes: { border: "border-[#00E3CC]", text: "text-[#00E3CC]", bg: "bg-[#00E3CC]" }
        },
        {
            id: "BLITZ_SCREEN", label: "번개 스크린", desc: "한게임",
            classes: { border: "border-[#3B82F6]", text: "text-[#3B82F6]", bg: "bg-[#3B82F6]" }
        },
        {
            id: "AFTER_PARTY", label: "뒷풀이", desc: "회식",
            classes: { border: "border-[#EC4899]", text: "text-[#EC4899]", bg: "bg-[#EC4899]" }
        }
    ] as const;

    return (
        <div className="grid grid-cols-3 gap-2 mb-6">
            {categories.map((cat) => {
                const isSelected = selected === cat.id;
                return (
                    <button
                        key={cat.id}
                        type="button"
                        onClick={() => onSelect(cat.id)}
                        className={cn(
                            "flex flex-col items-center justify-center p-3 rounded-tile border transition-colors h-[70px]",
                            isSelected
                                ? cn("bg-white/[0.08]", cat.classes.border)
                                : "bg-surface-2 border-surface-line hover:bg-surface-3 hover:border-white/10"
                        )}
                    >
                        <span className={cn(
                            "text-xs font-semibold text-center leading-tight transition-colors",
                            isSelected ? "text-white" : "text-white/55"
                        )}>
                            {cat.label}
                        </span>
                        <span className={cn(
                            "text-xs font-medium mt-0.5",
                            isSelected ? cat.classes.text : "text-white/45"
                        )}>
                            {cat.desc}
                        </span>
                    </button>
                );
            })}
        </div>
    );
};
