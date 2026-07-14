import { cn } from "@/lib/utils";
import { Flag, Zap, Plane, Monitor, MonitorPlay, Beer } from "lucide-react";



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
        { id: "REGULAR_ROUNDING", label: "정규 라운딩", desc: "월례회", icon: Flag },
        { id: "BLITZ_ROUNDING", label: "번개 라운딩", desc: "조인/급구", icon: Zap },
        { id: "GOLF_TOUR", label: "골프 투어", desc: "여행", icon: Plane },

        // Row 2: Screen / Social
        { id: "REGULAR_SCREEN", label: "정규 스크린", desc: "대회", icon: Monitor },
        { id: "BLITZ_SCREEN", label: "번개 스크린", desc: "한게임", icon: MonitorPlay },
        { id: "AFTER_PARTY", label: "뒷풀이", desc: "회식", icon: Beer },
    ] as const;

    return (
        <div className="grid grid-cols-3 gap-2 mb-6">
            {categories.map((cat) => {
                const isSelected = selected === cat.id;
                const Icon = cat.icon;
                return (
                    <button
                        key={cat.id}
                        type="button"
                        onClick={() => onSelect(cat.id)}
                        className={cn(
                            "flex flex-col items-center justify-center gap-1 p-3 rounded-tile border transition-colors h-[70px]",
                            isSelected
                                ? "border-brand bg-brand/10"
                                : "bg-surface-2 border-surface-line hover:bg-surface-3 hover:border-black/10"
                        )}
                    >
                        <Icon className={cn(
                            "w-4 h-4 transition-colors",
                            isSelected ? "text-brand" : "text-ink-4"
                        )} />
                        <span className={cn(
                            "text-xs font-semibold text-center leading-tight transition-colors",
                            isSelected ? "text-ink-1" : "text-ink-3"
                        )}>
                            {cat.label}
                        </span>
                        <span className={cn(
                            "text-xs font-medium transition-colors",
                            isSelected ? "text-brand" : "text-ink-3"
                        )}>
                            {cat.desc}
                        </span>
                    </button>
                );
            })}
        </div>
    );
};
