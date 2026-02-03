import { LucideCamera } from 'lucide-react';
import { Button } from "@/components/ui/button";

interface Props {
    onScanClick?: () => void;
}

export const PassportHeader = ({ onScanClick }: Props) => {
    return (
        <header className="fixed top-0 left-0 right-0 z-50 bg-[#050505]/80 backdrop-blur-xl border-b border-white/5">
            <div className="max-w-2xl mx-auto px-6 h-16 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <h1 className="text-lg font-black tracking-tighter italic uppercase underline decoration-amber-500/50 decoration-2 underline-offset-4 text-white">GOLF PASSPORT</h1>
                </div>
                {/* Optional Scan Button in Header if needed in future, currently main button is in StatsCard */}
            </div>
        </header>
    );
};
