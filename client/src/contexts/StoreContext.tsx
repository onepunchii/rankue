import { createContext, useContext, ReactNode, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { HiqStore } from "@shared/schema";

interface StoreContextType {
    store: HiqStore | null;
    isLoading: boolean;
    error: Error | null;
}

const StoreContext = createContext<StoreContextType | undefined>(undefined);

export function StoreProvider({ children }: { children: ReactNode }) {
    const [slug, setSlug] = useState<string>("hiq");

    useEffect(() => {
        const searchParams = new URLSearchParams(window.location.search);
        const storeParam = searchParams.get("store");

        // If /hiq path is used
        if (window.location.pathname.startsWith('/hiq')) {
            setSlug("hiq");
        } else if (storeParam) {
            setSlug(storeParam);
        } else {
            // Default slug logic for SaaS (could be from subdomain)
            const host = window.location.hostname;
            if (host.includes('.') && !host.startsWith('www') && host.split('.').length > 2) {
                setSlug(host.split('.')[0]);
            }
        }
    }, []);

    const { data: store, isLoading, error } = useQuery<HiqStore>({
        queryKey: ["/api/hiq/branding", slug],
        queryFn: async () => {
            const res = await fetch(`/api/hiq/branding/${slug}`);
            if (!res.ok) throw new Error("Store not found");
            const json = await res.json();
            return json.data;
        },
        enabled: !!slug
    });

    // Apply Global Theme
    useEffect(() => {
        if (store) {
            document.documentElement.style.setProperty('--hiq-brand-color', store.themeColor || '#6366f1');
            document.documentElement.style.setProperty('--hiq-neon-color', store.neonColor || '#818cf8');
            document.title = store.name || "RANKUE";
        }
    }, [store]);

    return (
        <StoreContext.Provider value={{ store: store || null, isLoading, error: error as Error }}>
            {children}
        </StoreContext.Provider>
    );
}

export function useStore() {
    const context = useContext(StoreContext);
    if (context === undefined) {
        throw new Error("useStore must be used within a StoreProvider");
    }
    return context;
}
