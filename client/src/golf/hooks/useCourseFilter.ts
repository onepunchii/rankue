import { useState, useMemo } from 'react';
import { COURSES } from "@/golf/data/golfCourses";

export type FilterCategory = 'Region' | 'Difficulty' | 'Speed' | 'Vibe' | 'Grass';

// 난이도·그린 스피드·분위기·잔디 칩은 눌러도 아무것도 걸러내지 않았고(값 자체가 합성값), 뺐다(2026-09-11).
// 칩 목록은 이 객체에서 나오므로 지역만 남긴다. 타입은 저장된 선택 상태와 맞추려고 그대로 둔다.
export const FILTERS: Partial<Record<FilterCategory, string[]>> = {
    Region: ['전체', '경기', '강원', '제주', '충청', '전라', '경상'],
};

export const CATEGORY_LABELS: Record<FilterCategory, string> = {
    Region: '지역',
    Difficulty: '난이도',
    Speed: '그린 스피드',
    Vibe: '분위기',
    Grass: '잔디 종류'
};

export function useCourseFilter() {
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedFilters, setSelectedFilters] = useState<Record<FilterCategory, string>>({
        Region: '전체',
        Difficulty: '',
        Speed: '',
        Vibe: '',
        Grass: ''
    });
    const [activeSheet, setActiveSheet] = useState<FilterCategory | null>(null);

    const resetFilters = () => {
        setSearchQuery("");
        setSelectedFilters({
            Region: '전체',
            Difficulty: '',
            Speed: '',
            Vibe: '',
            Grass: ''
        });
    };

    const handleFilterToggle = (category: FilterCategory, value: string) => {
        setSelectedFilters(prev => ({
            ...prev,
            [category]: prev[category] === value ? (category === 'Region' ? '전체' : '') : value
        }));
        setActiveSheet(null);
    };

    const guideCourses = useMemo(() => {
        return COURSES.filter(course => {
            const matchesRegion = selectedFilters.Region === '전체' || course.region === selectedFilters.Region;
            const matchesSearch = course.name.toLowerCase().includes(searchQuery.toLowerCase());
            return matchesRegion && matchesSearch;
        });
    }, [selectedFilters.Region, searchQuery]);

    return {
        searchQuery, setSearchQuery,
        selectedFilters, setSelectedFilters,
        activeSheet, setActiveSheet,
        resetFilters,
        handleFilterToggle,
        guideCourses
    };
}
