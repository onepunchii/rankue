import { useQuery } from "@tanstack/react-query";
import { HiqMember, HiqGameHistory } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "./useAuth";

export const useDashboardStats = (rankingType: '3c' | '4c' = '4c') => {
    // 1. Current Member — 게스트 판정을 한 번의 401 로 끝내려고 useAuth 를 공유한다
    //    (같은 queryKey 에 서로 다른 retry 옵션을 주면 게스트 화면이 늦게 뜬다).
    const { member, isLoading: isMemberLoading } = useAuth();

    // 2. History for charts & stats — 비로그인이면 401 이 확정이라 아예 요청하지 않는다.
    const { data: history, isLoading: isHistoryLoading } = useQuery<HiqGameHistory[]>({
        queryKey: ["/api/hiq/history"],
        enabled: !!member,
    });

    // 3. Rankings — 인증 필요(401). 게스트에서 호출하면 콘솔만 더럽히고 얻는 게 없다.
    const { data: rankings } = useQuery<HiqMember[]>({
        queryKey: [`/api/hiq/rankings`, rankingType],
        enabled: !!member,
        queryFn: async () => {
            const res = await apiRequest(`/api/hiq/rankings?type=${rankingType}`);
            return res;
        }
    });

    // 4. Analysis for stats radar chart & cards
    const { data: analysis } = useQuery<any>({
        queryKey: [`/api/hiq/stats/analysis`, { type: '4c' }], // Default to 4c context initially
        enabled: !!member,
    });

    const isLoading = isMemberLoading || isHistoryLoading;

    return {
        member,
        history,
        rankings,
        analysis,
        isLoading
    };
};
