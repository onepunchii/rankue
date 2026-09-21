import React, { createContext, useContext, useEffect, useLayoutEffect, useState } from "react";
import { useLocation } from "wouter";
import { useGolfAccess } from "@/hooks/useGolfAccess";
import { sportForPath } from "@shared/sportRoute";

export type SportType = "BILLIARDS" | "GOLF";

interface SportContextType {
    currentSport: SportType;
    setSport: (sport: SportType) => void;
}

const SportContext = createContext<SportContextType | undefined>(undefined);

const STORAGE_KEY = "rankue_current_sport";

function readSaved(): SportType {
    try { return localStorage.getItem(STORAGE_KEY) === "GOLF" ? "GOLF" : "BILLIARDS"; } catch { return "BILLIARDS"; }
}

export function SportProvider({ children }: { children: React.ReactNode }) {
    // 골프는 허용된 사람만. 판단은 shared/golfAccess.ts 하나이고 서버도 같은 걸 쓴다.
    const golfOk = useGolfAccess();
    const [location] = useLocation();
    const [saved, setSaved] = useState<SportType>(readSaved);

    /**
     * 종목은 **주소가 먼저** 정한다(2026-09-21 오너: "검색에서 골프 선수로 들어오면 당구 UI 색상과 섞여 꼬인다").
     * 예전엔 저장된 선호(기본 당구)만 봐서, 네이버·구글에서 골프 선수 페이지로 바로 들어온 사람은 골프 내용 위에
     * 당구 테마·당구 하단 탭이 씌워졌다. 로그인 전이라 골프 허용(golfOk)도 false 였으니 저장값이 골프여도 당구였다.
     * 골프 선수·골프 랭킹은 공개 페이지라 **테마는 허용과 무관하게** 골프여야 한다(들어갈 수 있는지는 GolfOnly 가 따로 막는다).
     * 두 종목이 함께 쓰는 화면(/dashboard·/menu…)에서는 저장된 선호를 쓰되, 허용되지 않으면 당구로 본다.
     */
    const routeSport = sportForPath(location);
    const currentSport: SportType = routeSport ?? (golfOk ? saved : "BILLIARDS");

    // 종목이 정해진 주소로 들어왔으면 그게 곧 선택이다 — 골프 선수 페이지에서 '홈'을 누르면 골프 홈으로 이어져야지,
    // 당구 홈으로 튀면 "골프 앱인 줄 알았는데" 가 된다. 반대(당구 전용 주소)도 같다.
    useEffect(() => {
        if (routeSport && routeSport !== saved) {
            setSaved(routeSport);
            try { localStorage.setItem(STORAGE_KEY, routeSport); } catch { /* 저장소를 못 쓰는 환경 */ }
        }
    }, [routeSport, saved]);

    // 토큰 층을 갈아 끼우는 스위치. index.css 의 [data-sport="GOLF"] 가 이 값을 본다.
    // 그리기 전에(useLayoutEffect) 붙여야 골프 주소로 들어온 첫 화면이 당구색으로 한 번 번쩍이지 않는다.
    useLayoutEffect(() => {
        document.documentElement.setAttribute("data-sport", currentSport);
        return () => document.documentElement.removeAttribute("data-sport");
    }, [currentSport]);

    const setSport = (sport: SportType) => {
        const next: SportType = sport === "GOLF" && !golfOk ? "BILLIARDS" : sport;
        setSaved(next);
        try { localStorage.setItem(STORAGE_KEY, next); } catch { /* 저장소를 못 쓰는 환경 */ }
    };

    return (
        <SportContext.Provider value={{ currentSport, setSport }}>
            {children}
        </SportContext.Provider>
    );
}

export function useSport() {
    const context = useContext(SportContext);
    if (context === undefined) {
        throw new Error("useSport must be used within a SportProvider");
    }
    return context;
}
