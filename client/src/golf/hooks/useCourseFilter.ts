import { useState, useMemo } from 'react';
import { COURSES } from "@/golf/data/golfCourses";

export type FilterCategory = 'Region' | 'Difficulty' | 'Speed' | 'Vibe' | 'Grass';

export const FILTERS = {
    Region: ['전체', '경기', '강원', '제주', '충청', '전라', '경상'],
    Difficulty: ['상', '중', '하'],
    Speed: ['빠름', '보통', '느림'],
    Vibe: ['비즈니스', '풍경', '가성비', '데이트'],
    Grass: ['벤트', '중지', '블루글라스']
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
