import React, { useState } from 'react';
import { useLocation } from 'wouter';
import {
    LucideSearch,
    LucideFilter,
    LucideTrendingUp,
    LucideGift,
    LucideArrowLeft
} from 'lucide-react';
import { cn } from "@/lib/utils";
import MembershipFilter from '../components/MembershipFilter';

// Data & Hooks (Refactored)
import { CRAWLED_MEMBERSHIPS, PRESALE_LIST, MembershipItem } from '../data/membershipData';
import { useMembershipFilter } from '../hooks/useMembershipFilter';

// Components (Refactored)
import { FilterChips } from '../components/membership/FilterChips';
import { ResaleListItem } from '../components/membership/ResaleListItem';
import { PresaleListItem } from '../components/membership/PresaleListItem';

export default function MembershipExchange() {
    const [, setLocation] = useLocation();
    const [viewMode, setViewMode] = useState<'RESALE' | 'PRESALE'>('RESALE');
    const [isFilterOpen, setIsFilterOpen] = useState(false);

    // Use Custom Hook for Logic
    const {
        activeCategory, setActiveCategory,
        searchTerm, setSearchTerm,
        detailedFilters, setDetailedFilters,
        filteredResaleList
    } = useMembershipFilter(CRAWLED_MEMBERSHIPS);

    return (
        <div className="min-h-screen bg-[#09090b] text-white pb-24">

            {/* 1. Header Area */}
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
                        onClick={() => setIsFilterOpen(true)}
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
                <div className="relative">
                    <LucideSearch className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" />
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder={viewMode === 'RESALE' ? "골프장 이름, 지역 검색" : "분양 혜택, 골프장 검색"}
                        className="w-full h-12 bg-[#18181b] border border-white/10 rounded-2xl pl-12 pr-4 text-sm focus:border-[#64DD17] outline-none transition-colors placeholder:text-white/20"
                    />
                </div>
            </header>

            {/* 2. Content Lists */}
            <div className="px-4 mt-6">

                {/* --- A. Resale List --- */}
                {viewMode === 'RESALE' && (
                    <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2">
                        <FilterChips
                            chips={['전체', '골프', '콘도', '휘트니스', '🔥 급상승', '최고가', '최저가', '수도권', '1억~3억', '법인']}
                            activeCategory={activeCategory}
                            onSelect={setActiveCategory}
                        />

                        {filteredResaleList.length === 0 ? (
                            <div className="text-center py-20 text-white/30">
                                검색 결과가 없습니다.
                            </div>
                        ) : filteredResaleList.map((item) => (
                            <ResaleListItem key={item.id} item={item} />
                        ))}
                    </div>
                )}

                {/* --- B. Presale List --- */}
                {viewMode === 'PRESALE' && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 pb-20">
                        {PRESALE_LIST.map((item) => (
                            <PresaleListItem key={item.id} item={item} />
                        ))}
                    </div>
                )}
            </div>

            {/* 3. Filter Modal */}
            <MembershipFilter
                isOpen={isFilterOpen}
                onClose={() => setIsFilterOpen(false)}
                onApply={setDetailedFilters}
            />
        </div>
    );
}
