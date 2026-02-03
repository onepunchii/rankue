import { useEffect } from 'react';

export function usePreventZoom() {
    useEffect(() => {
        const handleResize = () => {
            // 화면이 깨어나거나 회전할 때 강제로 스크롤 원점 복귀
            window.scrollTo(0, 0);

            // 혹시 문서가 화면보다 커졌을 경우를 대비해 body 높이 재조정
            document.body.style.height = window.innerHeight + 'px';
        };

        // 핀치 줌 방지 (iOS Safari 등에서 효과적)
        const handleTouchMove = (e: TouchEvent) => {
            // @ts-ignore
            if (e.touches && e.touches.length > 1) {
                e.preventDefault(); // 두 손가락 터치 무시
            }
        };

        // 더블 탭 방지
        let lastTouchEnd = 0;
        const handleTouchEnd = (e: TouchEvent) => {
            const now = (new Date()).getTime();
            if (now - lastTouchEnd <= 300) {
                e.preventDefault();
            }
            lastTouchEnd = now;
        };

        window.addEventListener('resize', handleResize);
        window.addEventListener('visibilitychange', handleResize); // 화면 켜짐/꺼짐 감지
        document.addEventListener('touchmove', handleTouchMove, { passive: false });
        document.addEventListener('touchend', handleTouchEnd, { passive: false });

        return () => {
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('visibilitychange', handleResize);
            document.removeEventListener('touchmove', handleTouchMove);
            document.removeEventListener('touchend', handleTouchEnd);
        };
    }, []);
}
