import { memo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { CrewDiscoveryCard } from "./CrewDiscoveryCard";
import { useDebounce } from "@/hooks/use-debounce";
import { LucideSearch, LucideUsers } from "lucide-react";
import { useNativeBridge } from "@/hooks/useNativeBridge";

interface AllCrewListProps {
    searchQuery: string;
    currentSport: string;
}

export const AllCrewList = memo(({ searchQuery, currentSport }: AllCrewListProps) => {
    const [_, setLocation] = useLocation();
    const { location: userLocation, requestLocation, isApp } = useNativeBridge();
    const debouncedSearch = useDebounce(searchQuery, 400); // 400ms delay

    useEffect(() => {
        if (isApp) {
            requestLocation();
        }
    }, [isApp, requestLocation]);

    const { data: allCrews, isLoading } = useQuery<any[]>({
        queryKey: ["/api/hiq/crews", debouncedSearch, currentSport, userLocation?.lat, userLocation?.lng],
        queryFn: async () => {
            let url = `/api/hiq/crews?q=${encodeURIComponent(debouncedSearch)}&sport=${encodeURIComponent(currentSport)}`;
            if (userLocation) {
                url += `&lat=${encodeURIComponent(userLocation.lat)}&lng=${encodeURIComponent(userLocation.lng)}`;
            }
            return await apiRequest(url);
        },
        // 로딩 중에도 이전 데이터를 보여주어 UX 개선 (v5 style placeholderData)
        placeholderData: (previousData) => previousData,
    });

    if (isLoading && !allCrews) {
        return (
            <div className="space-y-3">
                {[1, 2, 3].map(i => (
                    <div key={i} className="h-24 bg-surface-2 rounded-tile animate-pulse" />
                ))}
            </div>
        );
    }

    if (!allCrews || allCrews.length === 0) {
        const hasQuery = debouncedSearch.trim().length > 0;
        return (
            <div className="rk-card flex flex-col items-center justify-center py-12 px-6 text-center">
                <div className="w-14 h-14 rounded-full bg-white/5 flex items-center justify-center mb-4">
                    {hasQuery ? (
                        <LucideSearch className="w-7 h-7 text-white/40" />
                    ) : (
                        <LucideUsers className="w-7 h-7 text-white/40" />
                    )}
                </div>
                {hasQuery ? (
                    <>
                        <p className="text-white font-semibold text-[16px] mb-1">검색 결과가 없습니다</p>
                        <p className="text-white/45 text-[13px] font-medium">다른 이름이나 지역으로 검색해보세요</p>
                    </>
                ) : (
                    <>
                        <p className="text-white font-semibold text-[16px] mb-1">아직 등록된 크루가 없어요</p>
                        <p className="text-white/45 text-[13px] font-medium">첫 크루를 만들어보세요</p>
                    </>
                )}
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {allCrews.map(crew => (
                <CrewDiscoveryCard
                    key={crew.id}
                    crew={crew}
                    currentSport={currentSport}
                    onClick={() => setLocation(`/club/${crew.id}`)}
                />
            ))}
        </div>
    );
});

AllCrewList.displayName = "AllCrewList";
