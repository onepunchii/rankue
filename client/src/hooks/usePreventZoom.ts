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

        // 더블 탭 줌 방지 — CSS 로 한다. 예전엔 300ms 안의 모든 touchend 를
        // preventDefault 해서, 당구 연속 득점처럼 빠르게 연타하면 첫 탭만 살고
        // 나머지 클릭이 통째로 죽었다(점수판 연타 씹힘의 원인). touch-action:
        // manipulation 은 더블탭 줌만 막고 클릭은 지연 없이 그대로 살린다.
        const prevTouchAction = document.documentElement.style.touchAction;
        document.documentElement.style.touchAction = 'manipulation';

        window.addEventListener('resize', handleResize);
        window.addEventListener('visibilitychange', handleResize); // 화면 켜짐/꺼짐 감지
        document.addEventListener('touchmove', handleTouchMove, { passive: false });

        return () => {
            document.documentElement.style.touchAction = prevTouchAction;
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('visibilitychange', handleResize);
            document.removeEventListener('touchmove', handleTouchMove);
        };
    }, []);
}
