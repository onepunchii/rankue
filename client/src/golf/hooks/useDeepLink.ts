import { useEffect, useState } from 'react';

export const useDeepLink = (bookings: any[]) => {
    const [expandedBookingId, setExpandedBookingId] = useState<string | null>(null);

    useEffect(() => {
        const pathParts = window.location.pathname.split('/');
        const lastPart = pathParts[pathParts.length - 1];

        if (lastPart && lastPart.length > 20 && bookings.length > 0) {
            setExpandedBookingId(lastPart);
            requestAnimationFrame(() => {
                const element = document.getElementById(`booking-${lastPart}`);
                if (element) {
                    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            });
        }
    }, [bookings]);

    return { expandedBookingId, setExpandedBookingId };
};
