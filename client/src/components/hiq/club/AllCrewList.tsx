import { memo, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { CrewDiscoveryCard } from "./CrewDiscoveryCard";
import { PopularCrews } from "./PopularCrews";
import { crewPopularity } from "@shared/crewBrand";
import { crewRowStatus } from "@shared/crewManage";
import { useMyCrews } from "./useMyCrews";
import { useDebounce } from "@/hooks/use-debounce";
import { useToast } from "@/hooks/use-toast";
import { LucideSearch, LucideUsers, LucideMapPin, LucideLoader2 } from "@/lib/icons";
import { useNativeBridge } from "@/hooks/useNativeBridge";
import { CrewChip, CrewChipRow, CrewEmpty, CrewError, CrewSkeleton } from "@/components/hiq/crew-ui";
import { GAME_TYPE_LABEL } from "./CrewRow";
import { useT } from "@/lib/i18n";

interface AllCrewListProps {
    searchQuery: string;
    currentSport: string;
}

export const AllCrewList = memo(({ searchQuery, currentSport }: AllCrewListProps) => {
    const { t } = useT();
    const { toast } = useToast();
    const [, setLocation] = useLocation();
    const { location: userLocation, requestLocation } = useNativeBridge();
    const debouncedSearch = useDebounce(searchQuery, 400); // 400ms delay

    // 위치는 사용자가 '내 주변'을 눌렀을 때만 요청한다. 화면 진입만으로 권한 팝업을 띄우면
    // 브라우저가 자동 차단하기도 하고, 왜 묻는지 모른 채 거절당하면 다시 물어볼 수 없다.
    // (예전에는 앱에서만 자동 요청해서 웹은 거리순이 아예 동작하지 않았다.)
    const [nearbyOn, setNearbyOn] = useState(false);
    const [locating, setLocating] = useState(false);
    const gps = nearbyOn ? userLocation : null;

    const toggleNearby = async () => {
        if (nearbyOn) { setNearbyOn(false); return; }
        setNearbyOn(true);
        if (userLocation) return;
        setLocating(true);
        try {
            const result = await requestLocation();
            // 거부·실패면 켜진 척하지 않는다 — 예전엔 칩은 '내 주변'인데 목록은 최신순이라 켜진 건지 알 수 없었다.
            if (result !== "granted") {
                setNearbyOn(false);
                toast({
                    title: result === "denied" ? t("crewMgmt.locationDenied") : t("crewMgmt.locationUnavailable"),
                    variant: "destructive",
                });
            }
        } finally {
            setLocating(false);
        }
    };

    const { data: allCrews, isLoading, isError, refetch } = useQuery<any[]>({
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

    // 내가 가입(신청)한 크루 — '가입됨'·'승인 대기'를 줄에 표시한다. 내 크루 구역과 같은 캐시라 요청이 늘지 않는다.
    const { data: mine } = useMyCrews(currentSport);
    const myRoles = useMemo(() => new Map((mine ?? []).map((m) => [m.crew.id, m.role])), [mine]);

    const hasQuery = debouncedSearch.trim().length > 0;
    const nearbyActive = nearbyOn && !!gps;

    // 거르기 칩(2026-09-26 A안): 전체 · 모집 중 · 종목(당구 3쿠션·4구 / 골프 필드·스크린). 받은 목록 안에서 거른다.
    const [filter, setFilter] = useState<"all" | "open" | string>("all");
    const gameChips = currentSport === "GOLF" ? (["field", "screen"] as const) : (["3c", "4c"] as const);
    const isOpen = (c: any) => {
        const st = crewRowStatus(c);
        return !st.full && !myRoles.has(c.id);
    };
    const rows = useMemo(() => (allCrews ?? []).filter((c) =>
        filter === "all" ? true : filter === "open" ? isOpen(c) : c.gameType === filter,
    ), [allCrews, filter, myRoles]); // eslint-disable-line react-hooks/exhaustive-deps

    // 인기 크루 — 검색하지 않을 때만. 내가 가입한 크루와 정원이 찬 크루는 빼고(들어갈 수 없다) 인기 점수 순 상위 6.
    const popular = useMemo(() => {
        if (hasQuery || !allCrews) return [];
        return allCrews
            .filter((c) => !myRoles.has(c.id) && !crewRowStatus(c).full)
            .map((c) => ({ c, score: crewPopularity(c) }))
            .filter((x) => x.score > 1)
            .sort((a, b) => b.score - a.score)
            .slice(0, 6)
            .map((x) => x.c);
    }, [allCrews, myRoles, hasQuery]);

    return (
        <div className="flex flex-col gap-3">
            {/* 내 주변 — 크루 좌표(없으면 베이스캠프 매장 좌표)로 거리를 잰다. 좌표 없는 크루는 뒤로 밀린다(서버 정렬).
                결과가 비어도 이 칩은 늘 보인다 — 예전엔 빈 목록 화면이 칩보다 먼저 반환돼 켠 걸 끌 수 없었다. */}
            {popular.length > 0 && (
                <PopularCrews crews={popular} nearby={nearbyActive} onOpen={(id) => setLocation(`/club/${id}`)} />
            )}

            <CrewChipRow label={t("crewMgmt.sortLabel")}>
                <CrewChip selected={nearbyActive} onClick={toggleNearby}>
                    {locating ? <LucideLoader2 className="w-3.5 h-3.5 animate-spin" /> : <LucideMapPin className="w-3.5 h-3.5" />}
                    {nearbyActive ? t("club.nearbyOn") : t("club.nearby")}
                </CrewChip>
                <CrewChip selected={filter === "all"} onClick={() => setFilter("all")}>{t("crewList.filterAll")}</CrewChip>
                <CrewChip selected={filter === "open"} onClick={() => setFilter("open")}>{t("crewList.filterOpen")}</CrewChip>
                {gameChips.map((g) => (
                    <CrewChip key={g} selected={filter === g} onClick={() => setFilter(g)}>{t(GAME_TYPE_LABEL[g])}</CrewChip>
                ))}
            </CrewChipRow>

            {isLoading && !allCrews ? (
                <CrewSkeleton rows={3} height={96} />
            ) : isError && !allCrews ? (
                <CrewError onRetry={() => refetch()} />
            ) : !allCrews || rows.length === 0 ? (
                <CrewEmpty
                    icon={hasQuery ? <LucideSearch /> : <LucideUsers />}
                    title={hasQuery ? t("allCrewList.noResults") : t("allCrewList.emptyTitle")}
                    desc={hasQuery ? t("allCrewList.noResultsHint") : t("allCrewList.emptyHint")}
                />
            ) : (
                <div className="flex flex-col gap-2">
                    {rows.map((crew) => (
                        <CrewDiscoveryCard
                            key={crew.id}
                            crew={crew}
                            myRole={myRoles.get(crew.id)}
                            onClick={() => setLocation(`/club/${crew.id}`)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
});

AllCrewList.displayName = "AllCrewList";
