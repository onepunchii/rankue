import { useState, useMemo } from 'react';
import { COURSES } from "@/golf/data/golfCourses";

// Mock stamps for demo
const MOCK_STAMPS = [
    { id: 1, name: "남서울 CC", date: "2026.01.27", score: 82, region: "경기", color: "#64DD17" },
    { id: 2, name: "스카이72(하늘)", date: "2026.01.15", score: 85, region: "인천", color: "#00E5FF" },
    { id: 3, name: "안양 CC", date: "2025.12.14", score: 79, region: "경기", color: "#FFD600" },
    { id: 4, name: "설해원", date: "2025.11.12", score: 88, region: "강원", color: "#AA00FF" },
    { id: 5, name: "나인브릿지", date: "2025.10.05", score: 81, region: "제주", color: "#FF4081" },
    { id: 6, name: "해슬리 나인브릿지", date: "2025.09.20", score: 83, region: "경기", color: "#FF6D00" }
];

export type MainTab = 'Membership' | 'Public';
export type SubFilter = 'All' | 'Conquered' | 'Locked' | 'Region';

export function useEliteCourses() {
    const [mainTab, setMainTab] = useState<MainTab>('Membership');
    const [subFilter, setSubFilter] = useState<SubFilter>('All');
    const [searchQuery, setSearchQuery] = useState("");

    const isConquered = (courseName: string) => MOCK_STAMPS.some(s => s.name === courseName);
    const getConqueredInfo = (courseName: string) => MOCK_STAMPS.find(s => s.name === courseName);

    const eliteCourses = useMemo(() => {
        return COURSES.filter(c => c.isRankue60 && c.type === mainTab)
            .filter(c => {
                const matchesSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase());
                if (subFilter === 'Conquered') return isConquered(c.name) && matchesSearch;
                if (subFilter === 'Locked') return !isConquered(c.name) && matchesSearch;
                return matchesSearch;
            })
            .sort((a, b) => {
                if (subFilter === 'Region') return a.region.localeCompare(b.region);
                return b.rating - a.rating;
            });
    }, [mainTab, subFilter, searchQuery]);

    const stats = useMemo(() => {
        const total = COURSES.filter(c => c.isRankue60).length;
        const conquered = COURSES.filter(c => c.isRankue60 && isConquered(c.name)).length;
        const progress = (conquered / total) * 100;
        return { total, conquered, progress };
    }, []);

    return {
        mainTab, setMainTab,
        subFilter, setSubFilter,
        searchQuery, setSearchQuery,
        eliteCourses,
        stats,
        getConqueredInfo
    };
}
