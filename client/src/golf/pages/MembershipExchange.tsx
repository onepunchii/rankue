import React, { useState } from 'react';
import MembershipFilter from '../components/MembershipFilter';

// Data & Hooks (Refactored)
import { CRAWLED_MEMBERSHIPS, PRESALE_LIST, membershipAsOfLabel } from '../data/membershipData';
import { useMembershipFilter } from '../hooks/useMembershipFilter';

// Components (Refactored)
import { FilterChips } from '../components/membership/FilterChips';
import { ResaleListItem } from '../components/membership/ResaleListItem';
import { PresaleListItem } from '../components/membership/PresaleListItem';
import { ExchangeHeader } from '../components/membership/ExchangeHeader';

// "2026.02.15 자료 기준" — 자료 날짜를 모르면 null 이고, 그때는 줄을 그리지 않는다
const PRICE_AS_OF_LABEL = membershipAsOfLabel();

export default function MembershipExchange() {
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
            <ExchangeHeader
                viewMode={viewMode}
                setViewMode={setViewMode}
                searchTerm={searchTerm}
                setSearchTerm={setSearchTerm}
                onOpenFilter={() => setIsFilterOpen(true)}
            />

            {/* 2. Content Lists */}
            <div className="px-4 mt-6">
                {/* --- A. Resale List --- */}
                {viewMode === 'RESALE' && (
                    <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2">
                        <FilterChips
                            chips={['전체', '골프', '콘도', '휘트니스', '최고가', '최저가', '수도권', '1억~3억', '법인']}
                            activeCategory={activeCategory}
                            onSelect={setActiveCategory}
                        />

                        {PRICE_AS_OF_LABEL && filteredResaleList.length > 0 && (
                            <p className="-mt-2 text-right text-[12px] text-[#FFFFFF66]">{PRICE_AS_OF_LABEL}</p>
                        )}

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
