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
                        // 흰색은 어두운 화면 위의 '의도한' 강조라 종목 배선이 덮지 않게 명시한다.
                        // 비활성은 white/40(대비 2.9:1)이라 안 보였다 — white/70 으로 올렸다(2026-09-09 오너 지적).
                        current === mode ? "bg-[#ffffff] text-[#050505] shadow-lg" : "text-white/70 hover:text-white"
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
