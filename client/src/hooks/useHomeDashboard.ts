
import { useState, useEffect } from 'react';

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

                // Fetch data from API endpoints instead of RPC to avoid "relation does not exist" errors
                const [participantsRes, surveysRes, lotteryRes, topPoliticianRes] = await Promise.allSettled([
                    fetch('/api/stats/today-participants').then(res => res.json()),
                    fetch('/api/surveys/paginated?page=1&limit=3&sortBy=recent').then(res => res.json()),
                    fetch('/api/lottery/today-draw').then(res => res.json()),
                    fetch('/api/assembly/top-member-info').then(res => res.json())
                ]);

                const todayParticipants = participantsRes.status === 'fulfilled' ? (participantsRes.value.count || 0) : 0;
                const latestSurveys = surveysRes.status === 'fulfilled' ? (surveysRes.value.surveys || []) : [];
                const nextLotteryDraw = lotteryRes.status === 'fulfilled' ? lotteryRes.value : null;
                const topPolitician = topPoliticianRes.status === 'fulfilled' ? topPoliticianRes.value : null;

                if (isMounted) {
                    setData({
                        today_participants: todayParticipants,
                        latest_surveys: latestSurveys,
                        top_politician: topPolitician,
                        next_lottery_draw: nextLotteryDraw
                    });
                }
            } catch (err: any) {
                console.error('Error fetching home dashboard:', err);
                if (isMounted) {
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
