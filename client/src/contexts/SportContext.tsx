import React, { createContext, useContext, useState } from "react";
import { useGolfAccess } from "@/hooks/useGolfAccess";

export type SportType = "BILLIARDS" | "GOLF";

interface SportContextType {
    currentSport: SportType;
    setSport: (sport: SportType) => void;
}

const SportContext = createContext<SportContextType | undefined>(undefined);

export function SportProvider({ children }: { children: React.ReactNode }) {
    // 골프는 허용된 사람만. 판단은 shared/golfAccess.ts 하나이고 서버도 같은 걸 쓴다.
    const golfOk = useGolfAccess();
    const [saved, setSaved] = useState<SportType>(() => {
        const v = localStorage.getItem("rankue_current_sport");
        return v === "GOLF" ? "GOLF" : "BILLIARDS";
    });

    // 허용되지 않으면 저장값이 GOLF 여도 당구로 본다 — 로그인 확인이 끝나기 전에도 당구로 시작한다.
    const currentSport: SportType = golfOk ? saved : "BILLIARDS";

    const setSport = (sport: SportType) => {
        const next: SportType = sport === "GOLF" && !golfOk ? "BILLIARDS" : sport;
        setSaved(next);
        localStorage.setItem("rankue_current_sport", next);
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
