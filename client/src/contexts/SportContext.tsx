import React, { createContext, useContext, useState } from "react";

export type SportType = "BILLIARDS" | "GOLF";

interface SportContextType {
    currentSport: SportType;
    setSport: (sport: SportType) => void;
}

const SportContext = createContext<SportContextType | undefined>(undefined);

export function SportProvider({ children }: { children: React.ReactNode }) {
    const [currentSport, setCurrentSport] = useState<SportType>(() => {
        const saved = localStorage.getItem("rankue_current_sport");
        return (saved as SportType) || "BILLIARDS";
    });

    const setSport = (sport: SportType) => {
        setCurrentSport(sport);
        localStorage.setItem("rankue_current_sport", sport);
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
