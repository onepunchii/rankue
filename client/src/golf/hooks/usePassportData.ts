import { useMemo, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { COURSES } from "@/golf/data/golfCourses";
import { kstDateLabel } from "@/lib/kst";

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
    rounds: number;
    level: string;
    levelNum: number;
    nextLevelAt: number | null;
    /** 지도 묶음(경기·강원·충청·전라·경상·제주)별 골프장 수 / 정복한 수 */
    regionTotals: Record<string, number>;
    regionConquered: Record<string, number>;
}

export interface Stamp {
    id: string;
    clubId: string | null;
    name: string;
    date: string;
    /** 그 골프장 베스트 스코어 */
    score: number | null;
    rounds: number;
    region: string;
    color: string;
}

interface ServerStamp {
    clubId: string | null;
    name: string;
    region: string | null;
    firstDate: string;
    lastDate: string;
    bestScore: number;
    rounds: number;
}

const COLORS = ["#64DD17", "#00E5FF", "#FFD600", "#AA00FF", "#FF4081", "#FF6D00"];

/**
 * 골프 여권 데이터. 도장·지역 집계는 **서버가** 골프장 원장 기준으로 만든다(2026-09-11).
 * 예전엔 여기서 모든 사용자에게 안 친 '88 CC 82타' 가짜 도장을 붙였고, 도장을 라운드마다 하나씩 만들었다.
 */
export function usePassportData() {
    const queryClient = useQueryClient();
    const [savedImages, setSavedImages] = useState<Record<number, string>>({});

    useEffect(() => {
        const images: Record<number, string> = {};
        COURSES.forEach(c => {
            try {
                const saved = localStorage.getItem(`course-${c.id}-image`);
                if (saved) images[c.id] = saved;
            } catch { /* 저장소를 못 쓰는 환경 */ }
        });
        setSavedImages(images);
    }, []);

    const { data, isLoading } = useQuery<Omit<PassportStats, never> & { stamps: ServerStamp[] }>({
        queryKey: ["/api/hiq/golf/passport-stats"],
    });

    const stats = useMemo<PassportStats>(() => ({
        totalCourses: data?.totalCourses ?? 0,
        conquered: data?.conquered ?? 0,
        starsCollected: data?.starsCollected ?? 0,
        rounds: data?.rounds ?? 0,
        level: data?.level ?? "골프 입문자",
        levelNum: data?.levelNum ?? 1,
        nextLevelAt: data?.nextLevelAt ?? 3,
        regionTotals: data?.regionTotals ?? {},
        regionConquered: data?.regionConquered ?? {},
    }), [data]);

    const stamps = useMemo<Stamp[]>(() => (data?.stamps ?? []).map((s, i) => ({
        id: s.clubId ?? `name-${i}`,
        clubId: s.clubId,
        name: s.name,
        date: kstDateLabel(s.firstDate, { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\. /g, '.'),
        score: s.bestScore > 0 ? s.bestScore : null,
        rounds: s.rounds,
        region: s.region ?? "기타",
        color: COLORS[i % COLORS.length],
    })), [data]);

    const handleScanComplete = () => {
        queryClient.invalidateQueries({ queryKey: ["/api/hiq/golf/passport-stats"] });
        queryClient.invalidateQueries({ queryKey: ["/api/hiq/history", { sport: "GOLF" }] });
    };

    return { stats, stamps, savedImages, isLoading, handleScanComplete };
}
