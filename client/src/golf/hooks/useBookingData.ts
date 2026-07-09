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

    const bookingsQuery = useQuery<GolfBooking[]>({
        enabled: hasDates,
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

    return {
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
