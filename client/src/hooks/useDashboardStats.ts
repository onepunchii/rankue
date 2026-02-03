import { useQuery } from "@tanstack/react-query";
import { HiqMember, HiqGameHistory } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";

export const useDashboardStats = (rankingType: '3c' | '4c' = '4c') => {
    // 1. Current Member
    const { data: member, isLoading: isMemberLoading } = useQuery<HiqMember>({
        queryKey: ["/api/hiq/me"],
    });

    // 2. History for charts & stats
    const { data: history, isLoading: isHistoryLoading } = useQuery<HiqGameHistory[]>({
        queryKey: ["/api/hiq/history"],
    });

    // 3. Rankings
    const { data: rankings } = useQuery<HiqMember[]>({
        queryKey: [`/api/hiq/rankings`, rankingType],
        queryFn: async () => {
            const res = await apiRequest(`/api/hiq/rankings?type=${rankingType}`);
            return res;
        }
    });

    // 4. Analysis for stats radar chart & cards
    const { data: analysis } = useQuery<any>({
        queryKey: [`/api/hiq/stats/analysis`, { type: '4c' }], // Default to 4c context initially
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
