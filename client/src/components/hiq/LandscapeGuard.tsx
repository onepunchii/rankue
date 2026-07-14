import { useState, useEffect } from "react";
import { LucideSmartphone } from "@/lib/icons";

export function LandscapeGuard({ children }: { children: React.ReactNode }) {
    const [isPortrait, setIsPortrait] = useState(false);

    useEffect(() => {
        const checkOrientation = () => {
            const isP = window.innerHeight > window.innerWidth;
            setIsPortrait(isP);
        };

        checkOrientation();
        window.addEventListener("resize", checkOrientation);
        return () => window.removeEventListener("resize", checkOrientation);
    }, []);

    if (isPortrait) {
        return (
            <div
                className="fixed top-1/2 left-1/2 bg-[#f2f0eb] overflow-hidden origin-center"
                style={{
                    width: '100vh',
                    height: '100vw',
                    transform: 'translate(-50%, -50%) rotate(90deg)',
                    zIndex: 9999
                }}
            >
                {children}
            </div>
        );
    }

    return (
        <div className="w-full h-[100dvh] overflow-hidden">
            {children}
        </div>
    );
}
