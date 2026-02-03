import { useState, useMemo } from 'react';
import { MembershipItem, calculateTrend, getRepresentativeMemberships } from '../data/membershipData';

export function useMembershipFilter(resaleList: MembershipItem[], useGrouping: boolean = true) {
    const [activeCategory, setActiveCategory] = useState("전체");
    const [searchTerm, setSearchTerm] = useState("");
    const [detailedFilters, setDetailedFilters] = useState<Record<string, string[]>>({
        regions: [],
        prices: [],
        types: [],
        benefits: [],
        categories: [] // 추가: Golf, Condo, Fitness
    });

    const filteredResaleList = useMemo(() => {
        let result = resaleList;

        // 1. Search Filter
        if (searchTerm.trim()) {
            const lowerQuery = searchTerm.toLowerCase();
            result = result.filter(item =>
                item.name.toLowerCase().includes(lowerQuery) ||
                item.clubInfo.address.toLowerCase().includes(lowerQuery) ||
                item.type.toLowerCase().includes(lowerQuery)
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
                result = result.filter(item =>
                    item.clubInfo.address.includes('경기') ||
                    item.clubInfo.address.includes('서울') ||
                    item.clubInfo.address.includes('인천')
                );
                break;
            case '1억~3억':
                result = result.filter(item => {
                    const priceVal = item.priceValue / 10000; // 만원 단위
                    return priceVal >= 10000 && priceVal <= 30000;
                });
                break;
            case '주말부킹':
                result = result.filter(item =>
                    item.type.includes('VIP') ||
                    item.type.includes('우대') ||
                    item.priceValue >= 500000000
                );
                break;
            case '무기명':
                result = result.filter(item => item.type.includes('무기명'));
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
                    selectedRegions.some(region => item.clubInfo.address.includes(region))
                );
            }
        }

        // Prices (in 만원 units)
        if (detailedFilters.prices.length > 0) {
            result = result.filter(item => {
                const priceVal = item.priceValue / 10000; // 만원 단위
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
                detailedFilters.types.some(t => item.type.includes(t))
            );
        }

        // Benefits (실제 혜택 정보로 필터링)
        if (detailedFilters.benefits.length > 0) {
            result = result.filter(item => {
                // usageLimit이나 summary에 키워드가 있는지 확인
                const benefitText = (item.benefits.summary + item.benefits.usageLimit).toLowerCase();
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
            list.sort((a, b) => b.priceValue - a.priceValue);
        } else if (activeCategory === '최저가') {
            list.sort((a, b) => a.priceValue - b.priceValue);
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
