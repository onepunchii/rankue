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
            document.documentElement.style.setProperty('--hiq-brand-color', store.themeColor || '#006241');
            document.documentElement.style.setProperty('--hiq-neon-color', store.neonColor || '#006241');
            // Only a genuine white-label tenant (its own slug/subdomain) overrides the browser
            // title, so SEO/tab never shows a seeded store name like "하이큐 당구장".
            //
            // 기본 테넌트에서는 title 을 **건드리지 않는다**. 예전에는 여기서 브랜드 제목을
            // 다시 써 넣었는데, 이 effect 가 매장 데이터가 도착한 뒤(=비동기) 실행되기 때문에
            // useSeo 로 설정한 페이지별 제목(/about, /stores, /store/:slug)을 덮어써 버렸다.
            // 그러면 크롤러가 JS 를 실행했을 때의 제목과 서버 프리렌더 제목이 서로 어긋난다.
            // 기본값은 client/index.html 의 <title> 이 이미 갖고 있으므로 덮어쓸 필요가 없다.
            const isDefaultTenant = !store.slug || store.slug === 'hiq' || store.slug === 'default';
            if (!isDefaultTenant) {
                document.title = `${store.name} · 랭큐`;
            }
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
