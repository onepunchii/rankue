import React, { useState, useEffect } from 'react';
import {
    LucideX,
    LucideMapPin,
    LucideCoins,
    LucideUsers,
    LucideCheckCircle2,
    LucideRotateCcw,
    LucideLocateFixed
} from 'lucide-react';
import { cn } from "@/lib/utils";

// 필터 옵션 데이터
const FILTER_OPTIONS = {
    regions: ["수도권", "강원", "충청", "경상", "전라", "제주"],
    prices: ["1억 미만", "1억~3억", "3억~5억", "5억~10억", "10억 이상"],
    types: ["주주회원", "정회원", "주중회원", "법인(무기명)"],
    benefits: ["가족/지정인 등재", "그린피 면제(세금만)", "주말 부킹 보장", "계열사 리조트 혜택"]
};

export interface MembershipFilterProps {
    isOpen: boolean;
    onClose: () => void;
    onApply: (filters: Record<string, string[]>) => void;
}

export default function MembershipFilter({ isOpen, onClose, onApply }: MembershipFilterProps) {
    // 상태 관리
    const [selectedFilters, setSelectedFilters] = useState<Record<string, string[]>>({
        regions: [],
        prices: [],
        types: [],
        benefits: []
    });

    // Animation mount state
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setIsVisible(true);
            document.body.style.overflow = 'hidden';
        } else {
            const timer = setTimeout(() => setIsVisible(false), 300);
            document.body.style.overflow = 'unset';
            return () => clearTimeout(timer);
        }
    }, [isOpen]);

    if (!isVisible && !isOpen) return null;

    const toggleFilter = (category: string, value: string) => {
        setSelectedFilters(prev => {
            const list = prev[category];
            if (list.includes(value)) {
                return { ...prev, [category]: list.filter(item => item !== value) };
            } else {
                return { ...prev, [category]: [...list, value] };
            }
        });
    };

    const resetFilters = () => {
        setSelectedFilters({ regions: [], prices: [], types: [], benefits: [] });
    };

    // 선택된 필터 개수 계산 (하단 버튼용)
    const totalSelected = Object.values(selectedFilters).flat().length;

    return (
        <div className={cn(
            "fixed inset-0 z-50 flex items-end justify-center transition-all duration-300",
            isOpen ? "bg-black/80 backdrop-blur-sm" : "bg-black/0 pointer-events-none"
        )}>

            {/* Bottom Sheet Container */}
            <div className={cn(
                "w-full max-w-md bg-[#121212] rounded-t-3xl border-t border-white/10 max-h-[90vh] overflow-hidden flex flex-col transition-transform duration-300 ease-out",
                isOpen ? "translate-y-0" : "translate-y-full"
            )}>

                {/* 1. Header */}
                <div className="flex items-center justify-between p-5 border-b border-white/5">
                    <h2 className="text-lg font-black text-white">맞춤 회원권 찾기</h2>
                    <button
                        onClick={onClose}
                        className="p-2 -mr-2 text-white/40 hover:text-white transition-colors"
                    >
                        <LucideX className="w-6 h-6" />
                    </button>
                </div>

                {/* 2. Scrollable Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-8 pb-32">

                    {/* Section: 지역 */}
                    <section>
                        <div className="flex items-center gap-2 mb-3 text-[#64DD17]">
                            <LucideMapPin className="w-4 h-4" />
                            <span className="text-sm font-bold uppercase tracking-wider">지역 선택</span>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                            {/* GPS Button (Rankue Special) */}
                            <button
                                onClick={() => toggleFilter('regions', 'GPS')}
                                className={cn(
                                    "h-12 rounded-xl text-sm font-bold transition-all border flex items-center justify-center gap-1",
                                    selectedFilters.regions.includes('GPS')
                                        ? "bg-[#64DD17] text-[#050505] border-[#64DD17] shadow-[0_0_15px_rgba(100,221,23,0.4)]"
                                        : "bg-[#1E1E1E] border-transparent text-white hover:bg-[#2A2A2A]"
                                )}
                            >
                                <LucideLocateFixed className="w-4 h-4" />
                                1h 이내
                            </button>

                            {FILTER_OPTIONS.regions.map(option => (
                                <button
                                    key={option}
                                    onClick={() => toggleFilter('regions', option)}
                                    className={cn(
                                        "h-12 rounded-xl text-sm font-bold transition-all border",
                                        selectedFilters.regions.includes(option)
                                            ? "bg-[#64DD17]/10 border-[#64DD17] text-[#64DD17]"
                                            : "bg-[#1E1E1E] border-transparent text-zinc-400 hover:bg-[#2A2A2A]"
                                    )}
                                >
                                    {option}
                                </button>
                            ))}
                        </div>
                    </section>

                    {/* Section: 예산 */}
                    <section>
                        <div className="flex items-center gap-2 mb-3 text-[#64DD17]">
                            <LucideCoins className="w-4 h-4" />
                            <span className="text-sm font-bold uppercase tracking-wider">예산</span>
                        </div>

                        {/* Manual Input Logic can be added here */}

                        <div className="flex flex-wrap gap-2">
                            {FILTER_OPTIONS.prices.map(option => (
                                <button
                                    key={option}
                                    onClick={() => toggleFilter('prices', option)}
                                    className={cn(
                                        "px-4 py-3 rounded-xl text-sm font-bold transition-all border",
                                        selectedFilters.prices.includes(option)
                                            ? "bg-[#64DD17]/10 border-[#64DD17] text-[#64DD17]"
                                            : "bg-[#1E1E1E] border-transparent text-zinc-400 hover:bg-[#2A2A2A]"
                                    )}
                                >
                                    {option}
                                </button>
                            ))}
                        </div>
                    </section>

                    {/* Section: 회원권 종류 */}
                    <section>
                        <div className="flex items-center gap-2 mb-3 text-[#64DD17]">
                            <LucideUsers className="w-4 h-4" />
                            <span className="text-sm font-bold uppercase tracking-wider">회원권 종류</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            {FILTER_OPTIONS.types.map(option => (
                                <button
                                    key={option}
                                    onClick={() => toggleFilter('types', option)}
                                    className={cn(
                                        "h-12 rounded-xl text-sm font-bold transition-all border",
                                        selectedFilters.types.includes(option)
                                            ? "bg-[#64DD17]/10 border-[#64DD17] text-[#64DD17]"
                                            : "bg-[#1E1E1E] border-transparent text-zinc-400 hover:bg-[#2A2A2A]"
                                    )}
                                >
                                    {option}
                                </button>
                            ))}
                        </div>
                    </section>

                    {/* Section: 핵심 혜택 (Killer Feature) */}
                    <section>
                        <div className="flex items-center gap-2 mb-3 text-[#64DD17]">
                            <LucideCheckCircle2 className="w-4 h-4" />
                            <span className="text-sm font-bold uppercase tracking-wider">핵심 혜택 (중복 선택)</span>
                        </div>
                        <div className="flex flex-col gap-2">
                            {FILTER_OPTIONS.benefits.map(option => (
                                <button
                                    key={option}
                                    onClick={() => toggleFilter('benefits', option)}
                                    className={cn(
                                        "w-full h-12 px-4 rounded-xl text-sm font-bold transition-all border flex items-center justify-between",
                                        selectedFilters.benefits.includes(option)
                                            ? "bg-[#64DD17]/10 border-[#64DD17] text-[#64DD17]"
                                            : "bg-[#1E1E1E] border-transparent text-zinc-400 hover:bg-[#2A2A2A]"
                                    )}
                                >
                                    <span>{option}</span>
                                    {selectedFilters.benefits.includes(option) && <LucideCheckCircle2 className="w-4 h-4" />}
                                </button>
                            ))}
                        </div>
                    </section>
                </div>

                {/* 3. Footer Action */}
                <div className="p-5 border-t border-white/5 bg-[#121212] flex gap-3 absolute bottom-0 left-0 right-0 z-10 pb-10">
                    <button
                        onClick={resetFilters}
                        className="w-14 h-14 rounded-2xl bg-[#1E1E1E] flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
                    >
                        <LucideRotateCcw className="w-5 h-5" />
                    </button>
                    <button
                        onClick={() => {
                            onApply(selectedFilters);
                            onClose();
                        }}
                        className="flex-1 h-14 rounded-2xl bg-[#64DD17] text-[#09090b] font-black text-lg shadow-[0_0_20px_rgba(100,221,23,0.3)] hover:bg-[#52c41a] transition-all"
                    >
                        {totalSelected > 0 ? `${totalSelected}개 조건 검색하기` : "전체 매물 보기"}
                    </button>
                </div>
            </div>
        </div>
    );
}
