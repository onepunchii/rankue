
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { useState, useMemo, useCallback } from "react";
import { LucideChevronLeft, LucideSearch } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { HiqMember, HiqGame } from "@shared/schema";
import { HiqNavigation } from "@/components/hiq/HiqNavigation";
import { useStore } from "@/contexts/StoreContext";
import { useToast } from "@/hooks/use-toast";
import { useSport } from "@/contexts/SportContext";
import { cn } from "@/lib/utils";

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
                title: currentSport === "GOLF" ? "골프 친구 추가 완료" : "라이벌 추가 완료",
                description: currentSport === "GOLF" ? "이제 함께 라운딩을 즐길 수 있습니다." : "이제 대결 상대로 선택할 수 있습니다.",
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
        <div className="min-h-screen bg-[#0A0A0A] text-white pb-32 px-6 relative overflow-x-hidden font-sans">
            {/* Background Light Effect */}
            <div className={cn(
                "absolute top-0 right-0 w-[80dvw] h-[40dvh] blur-[120px] rounded-full -mr-[30dvw] -mt-[10dvh] pointer-events-none transition-colors duration-1000",
                config.bgLight, "opacity-20"
            )} />

            {/* Premium Header */}
            <div className="flex items-center justify-between py-10 relative z-10">
                <div className="flex items-center gap-5">
                    <motion.button
                        whileTap={{ scale: 0.9 }}
                        onClick={() => setLocation("/menu")}
                        className="w-12 h-12 rounded-full bg-white/[0.03] border border-white/10 flex items-center justify-center backdrop-blur-md active:scale-95 transition-all"
                    >
                        <LucideChevronLeft className="w-6 h-6 text-white/40" />
                    </motion.button>
                    <div>
                        <h1 className="text-3xl font-black tracking-tighter text-white">
                            {config.title}
                        </h1>
                        <p className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em] mt-0.5">
                            {config.subTitle}
                        </p>
                    </div>
                </div>
                <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setIsSearchOpen(true)}
                    className={cn(
                        "w-12 h-12 rounded-full border flex items-center justify-center backdrop-blur-md transition-all active:scale-95",
                        config.bgColor, "bg-opacity-10", config.borderColor
                    )}
                >
                    <LucideSearch className={cn("w-5 h-5", config.themeColor)} />
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
