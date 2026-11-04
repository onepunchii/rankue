import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { GolfBooking } from '../../../../shared/schema';

export const useBookingData = (weekDates: any[], selectedDate: number, viewType: 'ALL' | 'BOOKING' | 'JOIN', selectedFilters: Record<string, string[]>) => {
    // Guard against an out-of-range/empty weekDates (e.g. a deep-linked selectedDate set before
    // weekDates is populated) — indexing it unguarded crashed the whole page render.
    const hasDates = weekDates.length > 0 && !!weekDates[selectedDate];
    const selectedFullDate = weekDates[selectedDate]?.fullDate;
    const rangeStart = weekDates[0]?.fullDate;
    const rangeEnd = weekDates[weekDates.length - 1]?.fullDate;

    const bookingCountsQuery = useQuery({
        enabled: hasDates,
        queryKey: ['/api/hiq/golf/bookings/counts', rangeStart, rangeEnd, viewType, JSON.stringify(selectedFilters)],
        queryFn: async () => {
            const params = new URLSearchParams({
                startDate: rangeStart,
                endDate: rangeEnd,
                viewType: viewType,
            });
            if (selectedFilters.region.length > 0) params.append('region', selectedFilters.region.join(','));
            if (selectedFilters.time.length > 0 && !selectedFilters.time.includes('all')) params.append('time', selectedFilters.time.join(','));
            if (selectedFilters.price.length > 0) params.append('price', selectedFilters.price.join(','));
            if (selectedFilters.special.length > 0) params.append('special', selectedFilters.special.join(','));

            return apiRequest(`/api/hiq/golf/bookings/counts?${params.toString()}`);
        }
    });

    // 신청·승인·취소가 남의 화면에도 곧 보여야 한다(2026-09-21 오너: "실시간 전송이 안 돼요") — 소켓이 없어 15초 폴링 + 돌아올 때 새로.
    const bookingsQuery = useQuery<GolfBooking[]>({
        enabled: hasDates,
        staleTime: 10_000,
        refetchInterval: 15_000,
        refetchOnWindowFocus: true,
        queryKey: [viewType === 'JOIN' ? '/api/hiq/golf/joins' : '/api/hiq/golf/bookings', {
            date: selectedFullDate,
            filters: JSON.stringify(selectedFilters),
        }],
        queryFn: async () => {
            const endpoint = viewType === 'JOIN' ? '/api/hiq/golf/joins' : '/api/hiq/golf/bookings';
            const params = new URLSearchParams({
                date: selectedFullDate,
            });
            if (selectedFilters.region.length > 0) params.append('region', selectedFilters.region.join(','));
            if (selectedFilters.time.length > 0 && !selectedFilters.time.includes('all')) params.append('time', selectedFilters.time.join(','));
            if (selectedFilters.price.length > 0) params.append('price', selectedFilters.price.join(','));
            if (selectedFilters.special.length > 0) params.append('special', selectedFilters.special.join(','));

            return apiRequest(`${endpoint}?${params.toString()}`);
        }
    });

    // 조인 보기에서 그 날 조인이 없을 때 — 같은 날의 부킹(공식 사이트 남은 티 포함) 수를 같은 필터로(2026-11-04). 빈 조인 화면이 부킹으로 잇는다.
    // 부킹 보기의 날짜 띠와 같은 열쇠라, 부킹에서 건너왔으면 다시 묻지 않는다
    const bookingSideQuery = useQuery({
        enabled: hasDates && viewType === 'JOIN',
        queryKey: ['/api/hiq/golf/bookings/counts', rangeStart, rangeEnd, 'BOOKING', JSON.stringify(selectedFilters)],
        queryFn: async () => {
            const params = new URLSearchParams({ startDate: rangeStart, endDate: rangeEnd, viewType: 'BOOKING' });
            if (selectedFilters.region.length > 0) params.append('region', selectedFilters.region.join(','));
            if (selectedFilters.time.length > 0 && !selectedFilters.time.includes('all')) params.append('time', selectedFilters.time.join(','));
            if (selectedFilters.price.length > 0) params.append('price', selectedFilters.price.join(','));
            if (selectedFilters.special.length > 0) params.append('special', selectedFilters.special.join(','));
            return apiRequest(`/api/hiq/golf/bookings/counts?${params.toString()}`);
        }
    });
    const bookingSide = viewType === 'JOIN' && Array.isArray(bookingSideQuery.data)
        ? Number((bookingSideQuery.data as { date: string; count: number }[]).find((c) => c.date === selectedFullDate)?.count ?? 0)
        : 0;

    return {
        bookingSide,
        bookingCounts: bookingCountsQuery.data || [],
        bookings: bookingsQuery.data || [],
        isLoading: bookingsQuery.isLoading || bookingCountsQuery.isLoading,
        isError: bookingsQuery.isError || bookingCountsQuery.isError,
        refetch: () => {
            bookingsQuery.refetch();
            bookingCountsQuery.refetch();
        }
    };
};
