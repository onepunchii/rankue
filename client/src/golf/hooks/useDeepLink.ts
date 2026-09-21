import { useEffect, useRef, useState } from 'react';

/**
 * 주소에 실린 부킹 id(/golf/booking-list/<id>)를 한 번 펼쳐 준다.
 *
 * **한 번만** 이라는 게 중요하다. 예전엔 목록이 바뀔 때마다(날짜를 옮기거나 필터를 걸 때마다)
 * 다시 주소의 id 를 펼쳐 놓아서, 공유 링크로 들어온 사람이 검색 결과나 다른 카드를 눌러도
 * 곧바로 원래 카드로 되돌아갔다(2026-09-10 검토).
 *
 * "한 번"은 **주소 하나당** 한 번이다(2026-09-22 리뷰): 이 화면을 보던 중 푸시를 누르면 컴포넌트는 그대로고
 * 주소의 id 만 바뀐다 — path 가 바뀌면 다시 한 번 펼친다.
 */
export const useDeepLink = (bookings: any[], path?: string) => {
    const [expandedBookingId, setExpandedBookingId] = useState<string | null>(null);
    const appliedFor = useRef<string | null>(null);

    useEffect(() => {
        const pathParts = (path ?? window.location.pathname).split('/');
        const lastPart = pathParts[pathParts.length - 1];
        if (!lastPart || lastPart.length <= 20) return;
        if (appliedFor.current === lastPart || bookings.length === 0) return;
        // 그 글이 지금 목록에 있을 때만 '썼다'고 친다 — 날짜 되짚기가 끝나 목록이 바뀐 뒤에 펼쳐야 한다.
        if (!bookings.some((b) => b?.id === lastPart)) return;

        appliedFor.current = lastPart;
        setExpandedBookingId(lastPart);
        requestAnimationFrame(() => {
            document.getElementById(`booking-${lastPart}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
    }, [bookings, path]);

    return { expandedBookingId, setExpandedBookingId };
};
