import { useMemo, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { HiqGameHistory } from "../../../../shared/schema";
import { COURSES } from "@/golf/data/golfCourses";

export interface Course {
    id: number;
    name: string;
    type: 'Membership' | 'Public';
    region: string;
    originalRegion: string;
    address: string;
    area: string;
    holes: string;
    subType: string;
    isRankue60: boolean;
    rating: number;
    difficulty: string;
    speed: string;
    vibe: string;
    grass: string;
    imageUrl: string;
}

export interface PassportStats {
    totalCourses: number;
    conquered: number;
    starsCollected: number;
    rankPercent: number;
    level: string;
    levelNum: number;
}

export interface Stamp {
    id: number;
    dbId: number | string;
    name: string;
    date: string;
    score: number | null;
    region: string;
    color: string;
}

// 1. 골프장 이름으로 코스 정보를 빠르게 찾기 위한 Map 생성 (Static Data)
const COURSE_MAP = (COURSES as unknown as Course[]).reduce((acc, course) => {
    acc[course.name] = course;
    return acc;
}, {} as Record<string, Course>);

export function usePassportData() {
    const queryClient = useQueryClient();
    const [savedImages, setSavedImages] = useState<Record<number, string>>({});

    // Load saved images from localStorage
    useEffect(() => {
        const images: Record<number, string> = {};
        COURSES.forEach(c => {
            const saved = localStorage.getItem(`course-${c.id}-image`);
            if (saved) images[c.id] = saved;
        });
        setSavedImages(images);
    }, []);

    // Fetch Real Data
    const { data: serverStats, isLoading: isStatsLoading } = useQuery<PassportStats>({
        queryKey: ["/api/hiq/golf/passport-stats"],
    });

    const { data: serverHistory, isLoading: isHistoryLoading } = useQuery<HiqGameHistory[]>({
        queryKey: ["/api/hiq/history", { sport: "GOLF" }],
        queryFn: async () => {
            return await apiRequest("/api/hiq/history?sport=GOLF");
        }
    });

    const isLoading = isStatsLoading || isHistoryLoading;

    const stats = useMemo<PassportStats>(() => {
        if (!serverStats) return {
            totalCourses: 520,
            conquered: 0,
            starsCollected: 0,
            rankPercent: 15,
            level: "골프 입문자",
            levelNum: 1
        };
        return serverStats;
    }, [serverStats]);

    const stamps: Stamp[] = useMemo(() => {
        // --- MOCK DATA FOR VISUALIZATION (88CC) ---
        const mockStamp: Stamp = {
            id: 9999,
            dbId: 9999,
            name: "88 CC",
            date: "2024.05.20",
            score: 82,
            region: "경기",
            color: "#64DD17" // Brand Green
        };
        // ------------------------------------------

        if (!serverHistory || serverHistory.length === 0) return [mockStamp]; // Return mock if empty

        const realStamps = serverHistory.map((h, i) => {
            const matchedCourse = COURSE_MAP[h.locationName || ""];
            const region = matchedCourse ? matchedCourse.region : (h.opponentName || "경기");

            return {
                id: i + 1,
                dbId: h.id,
                name: h.locationName || "알 수 없는 구장",
                date: new Date(h.createdAt).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\. /g, '.'),
                score: h.score,
                region: region,
                color: ["#64DD17", "#00E5FF", "#FFD600", "#AA00FF", "#FF4081", "#FF6D00"][i % 6]
            };
        });

        return [mockStamp, ...realStamps]; // Append mock to real data
    }, [serverHistory]);

    const handleScanComplete = () => {
        queryClient.invalidateQueries({ queryKey: ["/api/hiq/golf/passport-stats"] });
        queryClient.invalidateQueries({ queryKey: ["/api/hiq/history", { sport: "GOLF" }] });
    };

    return {
        stats,
        stamps,
        savedImages,
        isLoading,
        handleScanComplete
    };
}
