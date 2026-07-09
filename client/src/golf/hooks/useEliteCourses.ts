import { useState, useMemo } from 'react';
import { COURSES } from "@/golf/data/golfCourses";
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { format } from 'date-fns';

export type MainTab = 'Membership' | 'Public';
export type SubFilter = 'All' | 'Conquered' | 'Locked' | 'Region';

export function useEliteCourses() {
    const [mainTab, setMainTab] = useState<MainTab>('Membership');
    const [subFilter, setSubFilter] = useState<SubFilter>('All');
    const [searchQuery, setSearchQuery] = useState("");

    // Fetch real golf game history instead of using MOCK_STAMPS
    const { data: historyData = [] } = useQuery<any[]>({
        queryKey: ['/api/hiq/history', { sport: 'GOLF' }],
        // apiRequest already returns parsed+unwrapped JSON (the array), NOT a Response.
        // Calling .json() on it threw and left realStamps empty, silently breaking the
        // entire "conquered courses" / passport-stamp feature.
        queryFn: async () => await apiRequest('/api/hiq/history?sport=GOLF')
    });

    const realStamps = useMemo(() => {
        const courseMap: Record<string, any> = {};

        historyData.forEach(game => {
            const name = game.locationName;
            if (!name) return;

            const score = game.score || 0;
            const parsedDate = game.createdAt ? new Date(game.createdAt) : null;
            const date = parsedDate && !isNaN(parsedDate.getTime()) ? format(parsedDate, "yyyy.MM.dd") : "";

            // Clean name for better matching (remove spaces, CC, etc.)
            const cleanName = name.replace(/\s/g, '').replace(/CC|컨트리클럽|골프클럽|GC/g, '');

            // Track the best score for each course
            if (!courseMap[cleanName] || score < courseMap[cleanName].score) {
                courseMap[cleanName] = {
                    name,
                    cleanName,
                    date,
                    score,
                    region: game.region || "경기",
                    color: score < 85 ? "#64DD17" : score < 95 ? "#00E5FF" : "#FFD600"
                };
            }
        });

        return Object.values(courseMap);
    }, [historyData]);

    const findMatch = (courseName: string) => {
        const cleanTarget = courseName.replace(/\s/g, '').replace(/CC|컨트리클럽|골프클럽|GC/g, '');
        return realStamps.find(s => s.cleanName === cleanTarget || cleanTarget.includes(s.cleanName) || s.cleanName.includes(cleanTarget));
    };

    const isConquered = (courseName: string) => !!findMatch(courseName);
    const getConqueredInfo = (courseName: string) => findMatch(courseName);

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
    }, [mainTab, subFilter, searchQuery, realStamps]);

    const stats = useMemo(() => {
        const total = COURSES.filter(c => c.isRankue60).length;
        const conquered = COURSES.filter(c => c.isRankue60 && isConquered(c.name)).length;
        const progress = (conquered / total) * 100;
        return { total, conquered, progress };
    }, [realStamps]);

    return {
        mainTab, setMainTab,
        subFilter, setSubFilter,
        searchQuery, setSearchQuery,
        eliteCourses,
        stats,
        getConqueredInfo
    };
}
