import { LucideMap, LucideStamp, LucideBookOpen } from "lucide-react";
import { cn } from "@/lib/utils";

type ViewMode = 'map' | 'stamp' | 'guide';

interface Props {
    current: ViewMode;
    onChange: (mode: ViewMode) => void;
}

export const ViewSwitcher = ({ current, onChange }: Props) => {
    return (
        <div className="flex p-1.5 bg-white/5 rounded-2xl mb-8 border border-white/10 shadow-2xl">
            {(['map', 'stamp', 'guide'] as ViewMode[]).map((mode) => (
                <button
                    key={mode}
                    onClick={() => onChange(mode)}
                    className={cn(
                        "flex-1 flex items-center justify-center gap-2 py-3 rounded-[1rem] text-xs font-black transition-all uppercase tracking-widest",
                        current === mode ? "bg-white text-[#050505] shadow-lg" : "text-white/40 hover:text-white/60"
                    )}
                >
                    {mode === 'map' && <LucideMap className="w-3.5 h-3.5" />}
                    {mode === 'stamp' && <LucideStamp className="w-3.5 h-3.5" />}
                    {mode === 'guide' && <LucideBookOpen className="w-3.5 h-3.5" />}
                    {mode.toUpperCase()}
                </button>
            ))}
        </div>
    );
};
