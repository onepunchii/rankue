import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import type { HiqCrew } from "@shared/schema";

export interface MyCrewEntry {
    crew: HiqCrew;
    /** leader · manage · member · pending(가입 신청 중) */
    role: string;
    joinedAt: string;
    /** 활동 인원(승인 대기 제외 — 서버 getUserCrews) */
    memberCount: number;
}

/**
 * 내 크루 목록(/crews/mine). '내 크루' 구역과 둘러보기의 '가입됨' 배지가 같은 캐시를 쓴다.
 * 게스트는 부르지 않는다 — 예전엔 비로그인에도 요청해서 401 이 나고 빈 목록("크루가 없으신가요?")으로 보였다.
 */
export function useMyCrews(currentSport: string) {
    const { isLoggedIn, isGuest, isLoading: authLoading } = useAuth();
    const query = useQuery<MyCrewEntry[]>({
        queryKey: ["/api/hiq/crews/mine", currentSport],
        queryFn: async () => await apiRequest(`/api/hiq/crews/mine?sport=${encodeURIComponent(currentSport)}`),
        enabled: isLoggedIn,
        staleTime: 1000 * 60 * 5,
    });
    return { ...query, isGuest, authLoading };
}
