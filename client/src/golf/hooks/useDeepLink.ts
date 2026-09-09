import { useEffect, useRef, useState } from 'react';

/**
 * 주소에 실린 부킹 id(/golf/booking-list/<id>)를 한 번 펼쳐 준다.
 *
 * **한 번만** 이라는 게 중요하다. 예전엔 목록이 바뀔 때마다(날짜를 옮기거나 필터를 걸 때마다)
 * 다시 주소의 id 를 펼쳐 놓아서, 공유 링크로 들어온 사람이 검색 결과나 다른 카드를 눌러도
 * 곧바로 원래 카드로 되돌아갔다(2026-09-10 검토).
 */
export const useDeepLink = (bookings: any[]) => {
    const [expandedBookingId, setExpandedBookingId] = useState<string | null>(null);
    const applied = useRef(false);

    useEffect(() => {
        if (applied.current || bookings.length === 0) return;

        const pathParts = window.location.pathname.split('/');
        const lastPart = pathParts[pathParts.length - 1];
        if (!lastPart || lastPart.length <= 20) return;

        applied.current = true;
        setExpandedBookingId(lastPart);
        requestAnimationFrame(() => {
            document.getElementById(`booking-${lastPart}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
    }, [bookings]);

    return { expandedBookingId, setExpandedBookingId };
};
