import { useState, useMemo } from 'react';
import { COURSES } from "@/golf/data/golfCourses";
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { PASSPORT_STATS_KEY, fetchPassportStats, type PassportStatsResponse } from "./usePassportData";
import { cleanCourseName, countEliteConquered, findEliteStamp } from "../lib/elite60";

export type MainTab = 'Membership' | 'Public';
export type SubFilter = 'All' | 'Conquered' | 'Locked' | 'Region';

export function useEliteCourses() {
    const [mainTab, setMainTab] = useState<MainTab>('Membership');
    const [subFilter, setSubFilter] = useState<SubFilter>('All');
    const [searchQuery, setSearchQuery] = useState("");

    // 정복은 여권의 **인증 도장**(현장 인증 + 이 규칙 전 옛 기록)만 — 서버 golfStamps.collectStamps 하나로 센다(2026-09-30).
    // 예전엔 기록(/history)을 여기서 따로 묶어 현장 인증 없이 적은 라운드(기록 도장)까지 Elite 60 정복으로 셌다.
    const { data: passport } = useQuery<PassportStatsResponse>({
        queryKey: PASSPORT_STATS_KEY,
        queryFn: fetchPassportStats,
    });

    const realStamps = useMemo(() => {
        const courseMap: Record<string, any> = {};

        (passport?.stamps ?? []).forEach((st) => {
            const name = st.name;
            if (!name) return;

            const score = st.bestScore > 0 ? st.bestScore : 0;
            const parsedDate = st.firstDate ? new Date(st.firstDate) : null;
            const date = parsedDate && !isNaN(parsedDate.getTime()) ? format(parsedDate, "yyyy.MM.dd") : "";
            const cleanName = cleanCourseName(name);

            // Track the best score for each course
            if (!courseMap[cleanName] || score < courseMap[cleanName].score) {
                courseMap[cleanName] = {
                    name,
                    cleanName,
                    date,
                    score,
                    region: st.region || "경기",
                    color: score < 85 ? "#64DD17" : score < 95 ? "#00E5FF" : "#FFD600"
                };
            }
        });

        return Object.values(courseMap);
    }, [passport]);

    const findMatch = (courseName: string) => findEliteStamp(courseName, realStamps as { name: string }[]) as any;

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
        const conquered = countEliteConquered(COURSES, realStamps as { name: string }[]);
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
