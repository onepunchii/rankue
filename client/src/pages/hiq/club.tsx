import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { HiqNavigation } from "@/components/hiq/HiqNavigation";
import { AppInstallCard } from "@/components/hiq/AppInstallCard";
import { LucideSearch, LucidePlus } from "@/lib/icons";
import { useSport } from "@/contexts/SportContext";
import { useT } from "@/lib/i18n";

// Sub-components
import { MyCrewList } from "@/components/hiq/club/MyCrewList";
import { AllCrewList } from "@/components/hiq/club/AllCrewList";
import { useAuth } from "@/hooks/useAuth";
import { goLogin } from "@/components/hiq/LoginGate";

export default function HiqClub() {
    const { t } = useT();
    const [_, setLocation] = useLocation();
    const [searchQuery, setSearchQuery] = useState("");
    const { currentSport } = useSport();
    // 크루 목록·검색은 공개다. 만들기(=계정 필요)만 로그인으로 보낸다.
    const { isGuest } = useAuth();

    return (
        <div className="min-h-screen bg-surface-0 text-ink-1 font-sans pb-nav relative overflow-hidden">
            <div className="relative z-10 max-w-md mx-auto px-5 pt-6">
                <h1 className="text-[26px] font-bold tracking-tight text-ink-1 mb-7">{t("club.title")}</h1>
                <div className="space-y-8">
                    {/* My Crews Section */}
                    <section>
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-[15px] font-semibold text-ink-3">{t("club.myCrews")}</h2>
                            <Button
                                variant="ghost"
                                className="h-9 px-3.5 text-[13px] font-semibold rounded-full transition-all bg-brand/10 text-brand hover:bg-brand/20"
                                onClick={() => (isGuest ? goLogin(setLocation, "/club") : setLocation("/club/create"))}
                            >
                                <LucidePlus className="w-3.5 h-3.5 mr-1" />
                                {t("club.create")}
                            </Button>
                        </div>
                        <MyCrewList currentSport={currentSport} />
                    </section>

                    {/* Search & Discovery Section */}
                    <section>
                        <div className="mb-3">
                            <h2 className="text-[15px] font-semibold text-ink-3 mb-3">{t("club.discover")}</h2>
                            <div className="relative group flex items-center px-4 h-11 rounded-tile bg-surface-2 transition-all duration-300 focus-within:border-brand/30">
                                <LucideSearch className="w-4 h-4 text-ink-3 mr-2.5 transition-colors duration-300 group-focus-within:text-brand" />
                                <input
                                    type="text"
                                    placeholder={t("club.searchPlaceholder")}
                                    className="w-full bg-transparent text-sm text-ink-1 focus:outline-none placeholder:text-ink-4"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                            </div>
                        </div>

                        <AllCrewList
                            searchQuery={searchQuery}
                            currentSport={currentSport}
                        />
                    </section>
                </div>
            </div>

            <div className="max-w-md mx-auto px-5"><AppInstallCard className="mt-6" /></div>

            <HiqNavigation />
        </div>
    );
}
