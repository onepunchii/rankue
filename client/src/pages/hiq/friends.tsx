
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { useState, useMemo, useCallback } from "react";
import { LucideChevronLeft, LucideSearch, LucideUsers } from "@/lib/icons";
import { apiRequest } from "@/lib/queryClient";
import { HiqGame } from "@shared/schema";
import { HiqNavigation } from "@/components/hiq/HiqNavigation";
import { AppInstallCard } from "@/components/hiq/AppInstallCard";
import { useAuth } from "@/hooks/useAuth";
import { LoginGate } from "@/components/hiq/LoginGate";
import { useStore } from "@/contexts/StoreContext";
import { useToast } from "@/hooks/use-toast";
import { useSport } from "@/contexts/SportContext";
import { useT } from "@/lib/i18n";

// Sub-components
import { RecentOpponentsSlider } from "@/components/hiq/rivals/RecentOpponents";
import { FriendList } from "@/components/hiq/rivals/FriendList";
import { SearchUserDialog } from "@/components/hiq/rivals/SearchUserDialog";
import { VsHistoryDialog } from "@/components/hiq/rivals/VsHistoryDialog";

// Types & Config
import {
    HiqMemberWithH2H,
    RecentOpponent,
    SearchResult,
    SPORT_CONFIGS
} from "@/components/hiq/rivals/types";

export default function HiqRivals() {
    const { t } = useT();
    const [, setLocation] = useLocation();
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [selectedFriendId, setSelectedFriendId] = useState<string | null>(null);

    const queryClient = useQueryClient();
    const { toast } = useToast();
    const { currentSport } = useSport();
    const sportKey = currentSport as keyof typeof SPORT_CONFIGS;
    const config = useMemo(() => SPORT_CONFIGS[sportKey] || SPORT_CONFIGS.BILLIARDS, [sportKey]);

    // Data Fetching — 비로그인이면 401 이 확정이라 요청 자체를 걸지 않는다.
    const { member: me, isGuest, isLoading: isAuthLoading } = useAuth();

    const { data: friends = [] } = useQuery<HiqMemberWithH2H[]>({
        queryKey: ["/api/hiq/friends", currentSport],
        enabled: !!me,
        queryFn: async () => await apiRequest(`/api/hiq/friends?sport=${currentSport}`)
    });

    const { data: recentOpponents = [] } = useQuery<RecentOpponent[]>({
        queryKey: ["/api/hiq/friends/recent-opponents", currentSport],
        enabled: !!me,
        queryFn: async () => await apiRequest(`/api/hiq/friends/recent-opponents?sport=${currentSport}`)
    });

    // Mutations
    const addFriendMutation = useMutation({
        mutationFn: async (receiverId: string) => {
            return await apiRequest("/api/hiq/friends", {
                method: "POST",
                body: { receiverId, sport: currentSport }
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/hiq/friends"] });
            queryClient.invalidateQueries({ queryKey: ["/api/hiq/friends/recent-opponents"] });
            toast({
                title: currentSport === "GOLF" ? t("friends.golfFriendAdded") : t("friends.rivalAdded"),
                description: currentSport === "GOLF" ? t("friends.golfFriendAddedDesc") : t("friends.rivalAddedDesc"),
            });
        }
    });

    const [searchKeyword, setSearchKeyword] = useState("");
    const { data: searchResults = [], refetch: performSearch, isLoading: isSearching } = useQuery<SearchResult[]>({
        queryKey: [`/api/hiq/friends/search`, searchKeyword, currentSport],
        queryFn: async () => await apiRequest(`/api/hiq/friends/search?keyword=${encodeURIComponent(searchKeyword)}&sport=${currentSport}`),
        enabled: false,
    });

    const handleSearch = useCallback((keyword: string) => {
        setSearchKeyword(keyword);
        setTimeout(() => performSearch(), 0);
    }, [performSearch]);

    const { data: vsGames, isLoading: isLoadingVsGames } = useQuery<HiqGame[]>({
        queryKey: [`/api/hiq/games/vs/${selectedFriendId}`, currentSport],
        queryFn: async () => await apiRequest(`/api/hiq/games/vs/${selectedFriendId}?sport=${currentSport}`),
        enabled: !!selectedFriendId
    });

    const selectedFriend = useMemo(() =>
        friends.find(f => f.id === selectedFriendId),
        [friends, selectedFriendId]);

    // 로그인 확인 중 — 빈 목록을 먼저 그리면 "라이벌 0명"이 깜빡였다가 안내로 바뀐다.
    if (isAuthLoading) {
        return (
            <div className="min-h-screen bg-surface-0 flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-black/10 border-t-brand rounded-full animate-spin" />
            </div>
        );
    }

    // 비로그인 — 예전에는 "라이벌 0명 · 아직 라이벌이 없네요" 를 그려서, 라이벌이 없는
    // 로그인 유저와 구분이 안 됐다. 로그인하면 열린다는 사실을 화면에 둔다.
    if (isGuest) {
        return (
            <LoginGate
                icon={LucideUsers}
                title="라이벌"
                desc="로그인하면 함께 친 상대가 라이벌로 쌓이고, 상대별 상대전적을 볼 수 있습니다."
                links={[
                    { label: "크루 둘러보기 — 당구 동호회", to: "/club" },
                    { label: "커뮤니티 둘러보기", to: "/community" },
                ]}
            />
        );
    }

    return (
        <div className="min-h-screen bg-surface-0 text-ink-1 px-5 pt-6 pb-nav relative overflow-x-hidden font-sans">
            {/* Header */}
            <div className="flex items-center justify-between mb-8 relative z-10">
                <div className="flex items-center gap-3">
                    <motion.button
                        whileTap={{ scale: 0.9 }}
                        onClick={() => setLocation("/menu")}
                        className="w-11 h-11 rounded-full bg-white flex items-center justify-center transition-transform text-black/60 shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                    >
                        <LucideChevronLeft className="w-5 h-5" />
                    </motion.button>
                    <div>
                        <h1 className="text-[26px] font-bold tracking-tight text-ink-1 leading-none">
                            {t(config.title)}
                        </h1>
                        <p className="text-[13px] font-medium text-black/55 mt-1">
                            {t("friends.subtitle")}
                        </p>
                    </div>
                </div>
                <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setIsSearchOpen(true)}
                    className="w-11 h-11 rounded-full bg-brand/12 border border-brand/20 flex items-center justify-center transition-transform"
                >
                    <LucideSearch className="w-5 h-5 text-brand" />
                </motion.button>
            </div>

            {/* Main Content Sections */}
            <RecentOpponentsSlider
                opponents={recentOpponents}
                config={config}
                currentSport={currentSport}
                onAddFriend={(id) => addFriendMutation.mutate(id)}
            />

            <FriendList
                friends={friends}
                config={config}
                currentSport={currentSport}
                onSelectFriend={(id) => setSelectedFriendId(id)}
                onSearchOpen={() => setIsSearchOpen(true)}
            />

            {/* Dialogs */}
            <SearchUserDialog
                open={isSearchOpen}
                onOpenChange={setIsSearchOpen}
                config={config}
                currentSport={currentSport}
                onSearch={handleSearch}
                searchResults={searchResults}
                isSearching={isSearching}
                onAddFriend={(id) => addFriendMutation.mutate(id)}
            />

            <VsHistoryDialog
                friendId={selectedFriendId}
                friend={selectedFriend}
                onClose={() => setSelectedFriendId(null)}
                currentSport={currentSport}
                vsGames={vsGames}
                isLoading={isLoadingVsGames}
                me={me}
            />

            <AppInstallCard className="mt-6" />

            <HiqNavigation />
        </div>
    );
}
