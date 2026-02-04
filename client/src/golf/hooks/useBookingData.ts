import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { GolfBooking } from '../../../../shared/schema';

export const useBookingData = (weekDates: any[], selectedDate: number, viewType: 'ALL' | 'BOOKING' | 'JOIN', selectedFilters: Record<string, string[]>) => {
    const selectedFullDate = weekDates[selectedDate].fullDate;

    const bookingCountsQuery = useQuery({
        queryKey: ['/api/hiq/golf/bookings/counts', weekDates[0].fullDate, weekDates[weekDates.length - 1].fullDate, viewType],
        queryFn: async () => {
            const start = weekDates[0].fullDate;
            const end = weekDates[weekDates.length - 1].fullDate;
            return apiRequest(`/api/hiq/golf/bookings/counts?startDate=${start}&endDate=${end}&viewType=${viewType}`);
        }
    });

    const bookingsQuery = useQuery<GolfBooking[]>({
        queryKey: [viewType === 'JOIN' ? '/api/hiq/golf/joins' : '/api/hiq/golf/bookings', {
            date: selectedFullDate,
            region: selectedFilters.region.join(','),
        }],
        queryFn: async () => {
            const endpoint = viewType === 'JOIN' ? '/api/hiq/golf/joins' : '/api/hiq/golf/bookings';
            const params = new URLSearchParams({
                date: selectedFullDate,
            });
            if (selectedFilters.region.length > 0) {
                params.append('region', selectedFilters.region.join(','));
            }
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
