import { useState, useMemo } from 'react';
import { MembershipItem, calculateTrend, getRepresentativeMemberships, GolfMembership, CondoMembership, FitnessMembership } from '../data/membershipData';

// Helper to safely get the 'type' or equivalent
const getMembershipType = (item: MembershipItem): string => {
    if (item.category === 'Golf') return (item as GolfMembership).golfSpec?.type || '';
    if (item.category === 'Condo') return (item as CondoMembership).condoSpec?.roomType || '';
    if (item.category === 'Fitness') return 'Fitness'; // Or specific field if added
    return '';
};

const getMembershipAddress = (item: MembershipItem): string => {
    return item.info.Address || '';
};

const getBenefitText = (item: MembershipItem): string => {
    if (item.category === 'Golf') {
        const spec = (item as GolfMembership).golfSpec?.privilege;
        return (spec?.summary || '') + (spec?.usageLimit || '');
    }
    if (item.category === 'Condo') {
        const spec = (item as CondoMembership).condoSpec?.benefits;
        return (spec?.summary || '') + (spec?.waterParkDiscount ? '워터파크' : '');
    }
    return '';
};

export function useMembershipFilter(resaleList: MembershipItem[], useGrouping: boolean = true) {
    const [activeCategory, setActiveCategory] = useState("전체");
    const [searchTerm, setSearchTerm] = useState("");
    const [detailedFilters, setDetailedFilters] = useState<Record<string, string[]>>({
        regions: [],
        prices: [],
        types: [],
        benefits: [],
        categories: []
    });

    const filteredResaleList = useMemo(() => {
        let result = resaleList;

        // 1. Search Filter
        if (searchTerm.trim()) {
            const lowerQuery = searchTerm.toLowerCase();
            result = result.filter(item =>
                item.name.toLowerCase().includes(lowerQuery) ||
                getMembershipAddress(item).toLowerCase().includes(lowerQuery) ||
                getMembershipType(item).toLowerCase().includes(lowerQuery)
            );
        }

        // 2. Chip Logic Filter (Quick Filters)
        switch (activeCategory) {
            case '🔥 급상승':
                result = result.filter(item => {
                    const trend = calculateTrend(item.id);
                    return trend.status === 'UP';
                });
                break;
            case '수도권':
                result = result.filter(item => {
                    const addr = getMembershipAddress(item);
                    return addr.includes('경기') || addr.includes('서울') || addr.includes('인천');
                });
                break;
            case '1억~3억':
                result = result.filter(item => {
                    const priceVal = item.price.current / 10000; // 만원 단위
                    return priceVal >= 10000 && priceVal <= 30000;
                });
                break;
            case '주말부킹':
                result = result.filter(item => {
                    const type = getMembershipType(item);
                    return type.includes('VIP') || type.includes('우대') || item.price.current >= 500000000;
                });
                break;
            case '무기명':
                result = result.filter(item => getMembershipType(item).includes('무기명'));
                break;
            case '법인':
                result = result.filter(item => item.tags.includes('법인'));
                break;
            case '골프':
                result = result.filter(item => item.category === 'Golf');
                break;
            case '콘도':
                result = result.filter(item => item.category === 'Condo');
                break;
            case '휘트니스':
                result = result.filter(item => item.category === 'Fitness');
                break;
            case '전체':
            default:
                break;
        }

        // 3. Detailed Filters (Modal)
        // Categories
        if (detailedFilters.categories.length > 0) {
            result = result.filter(item =>
                detailedFilters.categories.includes(item.category)
            );
        }

        // Regions
        if (detailedFilters.regions.length > 0) {
            const selectedRegions = detailedFilters.regions.filter(r => r !== 'GPS');
            if (selectedRegions.length > 0) {
                result = result.filter(item =>
                    selectedRegions.some(region => getMembershipAddress(item).includes(region))
                );
            }
        }

        // Prices (in 만원 units)
        if (detailedFilters.prices.length > 0) {
            result = result.filter(item => {
                const priceVal = item.price.current / 10000; // 만원 단위
                return detailedFilters.prices.some(range => {
                    if (range === '1억 미만') return priceVal < 10000;
                    if (range === '1억~3억') return priceVal >= 10000 && priceVal <= 30000;
                    if (range === '3억~5억') return priceVal >= 30000 && priceVal <= 50000;
                    if (range === '5억~10억') return priceVal >= 50000 && priceVal <= 100000;
                    if (range === '10억 이상') return priceVal >= 100000;
                    return false;
                });
            });
        }

        // Types
        if (detailedFilters.types.length > 0) {
            result = result.filter(item =>
                detailedFilters.types.some(t => getMembershipType(item).includes(t))
            );
        }

        // Benefits (실제 혜택 정보로 필터링)
        if (detailedFilters.benefits.length > 0) {
            result = result.filter(item => {
                const benefitText = getBenefitText(item).toLowerCase();
                return detailedFilters.benefits.some(benefit =>
                    benefitText.includes(benefit.toLowerCase())
                );
            });
        }

        return result;
    }, [resaleList, searchTerm, activeCategory, detailedFilters]);

    // 그룹화 적용 (골프장별로 대표 회원권만 표시)
    const displayList = useMemo(() => {
        let list = useGrouping
            ? getRepresentativeMemberships(filteredResaleList)
            : [...filteredResaleList];

        // 정렬 적용
        if (activeCategory === '최고가') {
            list.sort((a, b) => b.price.current - a.price.current);
        } else if (activeCategory === '최저가') {
            list.sort((a, b) => a.price.current - b.price.current);
        }

        return list;
    }, [filteredResaleList, useGrouping, activeCategory]);

    return {
        activeCategory, setActiveCategory,
        searchTerm, setSearchTerm,
        detailedFilters, setDetailedFilters,
        filteredResaleList: displayList,
        allFilteredList: filteredResaleList // 그룹화 이전 전체 리스트
    };
}
