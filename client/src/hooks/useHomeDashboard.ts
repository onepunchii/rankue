
import { useState, useEffect } from 'react';
import { apiRequest } from '@/lib/queryClient';
import { queryKeys } from '@/lib/queryKeys';

export interface HomeDashboardData {
    today_participants: number;
    latest_surveys: any[];
    top_politician: any;
    next_lottery_draw: any;
}

export function useHomeDashboard() {
    const [data, setData] = useState<HomeDashboardData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<any>(null);

    useEffect(() => {
        let isMounted = true;

        const fetchData = async () => {
            try {
                if (isMounted) setLoading(true);

                // Fetch data from API endpoints using apiRequest for standard auth/response handling
                const [participantsData, paginatedSurveys, lotteryData, topPoliticianData] = await Promise.all([
                    apiRequest('/api/stats/today-participants'),
                    apiRequest(`${queryKeys.SURVEYS_PAGINATED}?page=1&limit=3&sortBy=recent`),
                    apiRequest(queryKeys.LOTTERY_TODAY_DRAW),
                    apiRequest('/api/assembly/top-member-info')
                ]);

                if (isMounted) {
                    setData({
                        today_participants: participantsData?.count || 0,
                        latest_surveys: paginatedSurveys?.surveys || [],
                        top_politician: topPoliticianData,
                        next_lottery_draw: lotteryData
                    });
                }
            } catch (err: any) {
                console.error('Error fetching home dashboard:', err);
                if (isMounted) {
                    setError(err);
                    // Fallback to empty data to prevent UI from crashing
                    setData({
                        today_participants: 0,
                        latest_surveys: [],
                        top_politician: null,
                        next_lottery_draw: null
                    });
                }
            } finally {
                if (isMounted) {
                    setLoading(false);
                }
            }
        };

        fetchData();

        return () => {
            isMounted = false;
        };
    }, []);

    return { data, loading, error };
}
