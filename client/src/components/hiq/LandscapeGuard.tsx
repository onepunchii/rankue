import { useState, useEffect } from "react";

export function LandscapeGuard({ children }: { children: React.ReactNode }) {
    const [isPortrait, setIsPortrait] = useState(false);

    useEffect(() => {
        const checkOrientation = () => {
            setIsPortrait(window.innerHeight > window.innerWidth);
        };
        checkOrientation();
        window.addEventListener("resize", checkOrientation);
        window.addEventListener("orientationchange", checkOrientation);
        return () => {
            window.removeEventListener("resize", checkOrientation);
            window.removeEventListener("orientationchange", checkOrientation);
        };
    }, []);

    if (isPortrait) {
        // 세로 폰을 rotate(90deg)로 가로화. 회전 후 좌표 매핑:
        //   콘텐츠 '왼쪽 변'  → 화면 위(노치)          ⇒ paddingLeft  = inset-top
        //   콘텐츠 '오른쪽 변' → 화면 아래(홈 인디케이터) ⇒ paddingRight = inset-bottom
        // env()는 회전(transform)된 컨테이너 안에서도 물리 기기값으로 정상 해석된다(실측 확인: 62px).
        return (
            <div
                className="fixed top-1/2 left-1/2 bg-[#f2f0eb] overflow-hidden origin-center"
                style={{
                    width: "100vh",
                    height: "100vw",
                    transform: "translate(-50%, -50%) rotate(90deg)",
                    zIndex: 9999,
                    boxSizing: "border-box",
                    paddingLeft: "env(safe-area-inset-top)",
                    paddingRight: "env(safe-area-inset-bottom)",
                }}
            >
                {children}
            </div>
        );
    }

    // 실기기를 실제 가로로 든 경우: 노치가 좌/우 변에 오므로 left/right 인셋으로 회피
    return (
        <div
            className="w-full h-[100dvh] overflow-hidden"
            style={{
                boxSizing: "border-box",
                paddingLeft: "env(safe-area-inset-left)",
                paddingRight: "env(safe-area-inset-right)",
            }}
        >
            {children}
        </div>
    );
}
