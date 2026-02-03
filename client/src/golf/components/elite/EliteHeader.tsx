import { LucideChevronLeft, LucideCrown } from "lucide-react";

export const EliteHeader = () => {
    return (
        <div className="bg-gradient-to-b from-[#1a1a1a] to-[#0A0A0A] px-6 pt-12 pb-12 rounded-b-[2.5rem] border-b border-white/5 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-10">
                <LucideCrown className="w-48 h-48 rotate-12 text-amber-500" />
            </div>

            <div className="flex items-center justify-between mb-4 relative z-10">
                <button
                    onClick={() => window.history.back()}
                    className="p-2 -ml-2 rounded-full hover:bg-white/5 transition-colors"
                    title="뒤로 가기"
                >
                    <LucideChevronLeft className="w-6 h-6" />
                </button>
            </div>

            <div className="flex flex-col items-center justify-center pt-4 pb-4 relative z-10">
                <h1 className="text-4xl font-black italic tracking-tighter uppercase bg-gradient-to-r from-amber-200 via-amber-500 to-amber-200 bg-clip-text text-transparent drop-shadow-[0_0_15px_rgba(251,191,36,0.5)]">
                    RANKUE ELITE 60
                </h1>
            </div>
        </div>
    );
};
