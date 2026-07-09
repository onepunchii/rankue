import { cn } from "@/lib/utils";

export type BilliardsCategory =
    | "REGULAR_BILLIARDS"
    | "BLITZ_BILLIARDS"
    | "BILLIARDS_TOURNAMENT"
    | "AFTER_PARTY";

interface BilliardsCategorySelectorProps {
    selected: BilliardsCategory | null;
    onSelect: (category: BilliardsCategory) => void;
}

export const BilliardsCategorySelector = ({ selected, onSelect }: BilliardsCategorySelectorProps) => {

    const categories = [
        {
            id: "REGULAR_BILLIARDS", label: "정기 모임", desc: "월례회",
            classes: { border: "border-brand", text: "text-brand", bg: "bg-brand" }
        },
        {
            id: "BLITZ_BILLIARDS", label: "번개 모임", desc: "즉석 조인",
            classes: { border: "border-[#EAB308]", text: "text-[#EAB308]", bg: "bg-[#EAB308]" }
        },
        {
            id: "BILLIARDS_TOURNAMENT", label: "당구 대회", desc: "리그/토너먼트",
            classes: { border: "border-[#F97316]", text: "text-[#F97316]", bg: "bg-[#F97316]" }
        },
        {
            id: "AFTER_PARTY", label: "뒷풀이", desc: "회식",
            classes: { border: "border-[#EC4899]", text: "text-[#EC4899]", bg: "bg-[#EC4899]" }
        }
    ] as const;

    return (
        <div className="grid grid-cols-2 gap-2 mb-6">
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
