import { memo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { CrewDiscoveryCard } from "./CrewDiscoveryCard";
import { useDebounce } from "@/hooks/use-debounce";
import { LucideSearch, LucideUsers, LucideMapPin } from "@/lib/icons";
import { useNativeBridge } from "@/hooks/useNativeBridge";
import { useT } from "@/lib/i18n";

interface AllCrewListProps {
    searchQuery: string;
    currentSport: string;
}

export const AllCrewList = memo(({ searchQuery, currentSport }: AllCrewListProps) => {
    const { t } = useT();
    const [_, setLocation] = useLocation();
    const { location: userLocation, requestLocation, isApp } = useNativeBridge();
    const debouncedSearch = useDebounce(searchQuery, 400); // 400ms delay

    // 위치는 사용자가 '내 주변'을 눌렀을 때만 요청한다. 화면 진입만으로 권한 팝업을 띄우면
    // 브라우저가 자동 차단하기도 하고, 왜 묻는지 모른 채 거절당하면 다시 물어볼 수 없다.
    // (예전에는 앱에서만 자동 요청해서 웹은 거리순이 아예 동작하지 않았다.)
    const [nearbyOn, setNearbyOn] = useState(false);
    const gps = nearbyOn ? userLocation : null;

    const { data: allCrews, isLoading } = useQuery<any[]>({
        queryKey: ["/api/hiq/crews", debouncedSearch, currentSport, gps?.lat, gps?.lng],
        queryFn: async () => {
            let url = `/api/hiq/crews?q=${encodeURIComponent(debouncedSearch)}&sport=${encodeURIComponent(currentSport)}`;
            if (gps) {
                url += `&lat=${encodeURIComponent(gps.lat)}&lng=${encodeURIComponent(gps.lng)}`;
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
                <div className="w-14 h-14 rounded-full bg-black/[0.04] flex items-center justify-center mb-4">
                    {hasQuery ? (
                        <LucideSearch className="w-7 h-7 text-black/40" />
                    ) : (
                        <LucideUsers className="w-7 h-7 text-black/40" />
                    )}
                </div>
                {hasQuery ? (
                    <>
                        <p className="text-ink-1 font-semibold text-[16px] mb-1">{t("allCrewList.noResults")}</p>
                        <p className="text-ink-3 text-[13px] font-medium">{t("allCrewList.noResultsHint")}</p>
                    </>
                ) : (
                    <>
                        <p className="text-ink-1 font-semibold text-[16px] mb-1">{t("allCrewList.emptyTitle")}</p>
                        <p className="text-ink-3 text-[13px] font-medium">{t("allCrewList.emptyHint")}</p>
                    </>
                )}
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {/* 내 주변 — 크루의 베이스캠프 매장 좌표로 거리를 잰다.
                베이스캠프가 없는 크루는 거리 없이 뒤로 밀린다(서버 정렬 규칙). */}
            <button
                onClick={() => {
                    if (!nearbyOn) requestLocation();
                    setNearbyOn(!nearbyOn);
                }}
                className={cn(
                    "h-9 px-3.5 rounded-full text-[13px] font-bold inline-flex items-center gap-1.5 transition-colors",
                    nearbyOn && gps ? "bg-brand text-white" : "bg-black/[0.05] text-black/55",
                )}
            >
                <LucideMapPin className="w-3.5 h-3.5" />
                {nearbyOn && gps ? t("club.nearbyOn") : t("club.nearby")}
            </button>

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
