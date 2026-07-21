
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { useState, useMemo, useCallback } from "react";
import { LucideChevronLeft, LucideSearch } from "@/lib/icons";
import { apiRequest } from "@/lib/queryClient";
import { HiqMember, HiqGame } from "@shared/schema";
import { HiqNavigation } from "@/components/hiq/HiqNavigation";
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

    // Data Fetching
    const { data: friends = [] } = useQuery<HiqMemberWithH2H[]>({
        queryKey: ["/api/hiq/friends", currentSport],
        queryFn: async () => await apiRequest(`/api/hiq/friends?sport=${currentSport}`)
    });

    const { data: recentOpponents = [] } = useQuery<RecentOpponent[]>({
        queryKey: ["/api/hiq/friends/recent-opponents", currentSport],
        queryFn: async () => await apiRequest(`/api/hiq/friends/recent-opponents?sport=${currentSport}`)
    });

    const { data: me } = useQuery<HiqMember>({
        queryKey: ["/api/hiq/me"],
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

    return (
        <div className="min-h-screen bg-[#f2f0eb] text-ink-1 px-5 pt-6 pb-28 relative overflow-x-hidden font-sans">
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
                            {config.title}
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

            <HiqNavigation />
        </div>
    );
}
