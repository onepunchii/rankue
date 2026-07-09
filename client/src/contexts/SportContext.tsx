import React, { createContext, useContext, useState } from "react";
import { GOLF_ENABLED } from "@/lib/features";

export type SportType = "BILLIARDS" | "GOLF";

interface SportContextType {
    currentSport: SportType;
    setSport: (sport: SportType) => void;
}

const SportContext = createContext<SportContextType | undefined>(undefined);

export function SportProvider({ children }: { children: React.ReactNode }) {
    const [currentSport, setCurrentSport] = useState<SportType>(() => {
        // While golf is disabled, always start in billiards — ignore any stale "GOLF"
        // left in localStorage so first entry never falls into the golf dashboard.
        if (!GOLF_ENABLED) return "BILLIARDS";
        const saved = localStorage.getItem("rankue_current_sport");
        return (saved as SportType) || "BILLIARDS";
    });

    const setSport = (sport: SportType) => {
        // Coerce to billiards while golf is disabled so no entry point can switch modes.
        const next: SportType = GOLF_ENABLED ? sport : "BILLIARDS";
        setCurrentSport(next);
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
