import { LucideArrowLeft, LucideFilter, LucideTrendingUp, LucideGift } from "lucide-react";
import { cn } from "@/lib/utils";
import { SearchBar } from "./SearchBar";

interface ExchangeHeaderProps {
    viewMode: 'RESALE' | 'PRESALE';
    setViewMode: (mode: 'RESALE' | 'PRESALE') => void;
    searchTerm: string;
    setSearchTerm: (term: string) => void;
    onOpenFilter: () => void;
}

export function ExchangeHeader({
    viewMode,
    setViewMode,
    searchTerm,
    setSearchTerm,
    onOpenFilter
}: ExchangeHeaderProps) {
    return (
        <header className="sticky top-0 z-40 bg-[#09090b]/95 backdrop-blur-xl px-4 pt-6 pb-2 border-b border-white/5">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => window.history.back()}
                        title="뒤로가기"
                        className="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center hover:bg-white/10 active:scale-95 transition-all"
                    >
                        <LucideArrowLeft className="w-5 h-5 text-white" />
                    </button>
                    <h1 className="text-2xl font-black tracking-tight">회원권 거래소</h1>
                </div>
                <button
                    onClick={onOpenFilter}
                    className="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center hover:bg-white/10 active:scale-95 transition-all"
                >
                    <LucideFilter className="w-5 h-5 text-[#64DD17]" />
                </button>
            </div>

            {/* Sliding Toggle */}
            <div className="bg-[#18181b] p-1 rounded-2xl flex mb-4 border border-white/10 relative h-12">
                <div className={cn(
                    "absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-xl bg-[#64DD17] transition-all duration-300 ease-out shadow-[0_0_15px_rgba(100,221,23,0.3)]",
                    viewMode === 'RESALE' ? "left-1" : "left-[calc(50%+2px)]"
                )} />

                <button
                    onClick={() => setViewMode('RESALE')}
                    className={cn(
                        "flex-1 rounded-xl text-sm font-bold relative z-10 transition-colors flex items-center justify-center gap-2",
                        viewMode === 'RESALE' ? "text-[#09090b]" : "text-white/40 hover:text-white"
                    )}
                >
                    <LucideTrendingUp className="w-4 h-4" />
                    회원권 시세
                </button>
                <button
                    onClick={() => setViewMode('PRESALE')}
                    className={cn(
                        "flex-1 rounded-xl text-sm font-bold relative z-10 transition-colors flex items-center justify-center gap-2",
                        viewMode === 'PRESALE' ? "text-[#09090b]" : "text-white/40 hover:text-white"
                    )}
                >
                    <LucideGift className="w-4 h-4" />
                    신규 분양
                </button>
            </div>

            {/* Search Bar */}
            <SearchBar
                value={searchTerm}
                onChange={setSearchTerm}
                placeholder={viewMode === 'RESALE' ? "골프장 이름, 지역 검색" : "분양 혜택, 골프장 검색"}
            />
        </header>
    );
}
