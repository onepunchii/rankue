import { useState } from "react";
import { useLocation } from "wouter";
import { HiqNavigation } from "@/components/hiq/HiqNavigation";
import { AppInstallCard } from "@/components/hiq/AppInstallCard";
import { LucideSearch, LucidePlus, LucideX } from "@/lib/icons";
import { useSport } from "@/contexts/SportContext";
import { useT } from "@/lib/i18n";
import { CREW_TEXT, IconButton } from "@/components/hiq/crew-ui";

// Sub-components
import { MyCrewList } from "@/components/hiq/club/MyCrewList";
import { AllCrewList } from "@/components/hiq/club/AllCrewList";
import { useAuth } from "@/hooks/useAuth";
import { goLogin } from "@/components/hiq/LoginGate";

export default function HiqClub() {
    const { t } = useT();
    const [, setLocation] = useLocation();
    const [searchQuery, setSearchQuery] = useState("");
    const { currentSport } = useSport();
    // 크루 목록·검색은 공개다. 만들기(=계정 필요)만 로그인으로 보낸다 — 머리의 '만들기'와 빈 목록의 버튼이 같은 길을 쓴다.
    const { isGuest } = useAuth();
    const handleCreate = () => (isGuest ? goLogin(setLocation, "/club") : setLocation("/club/create"));

    return (
        <div className="min-h-screen bg-surface-0 text-ink-1 font-sans pb-nav">
            <div className="max-w-md mx-auto px-4 pt-6 flex flex-col gap-8">
                <h1 className={CREW_TEXT.title}>{t("club.title")}</h1>

                {/* 내 크루 */}
                <section className="flex flex-col gap-2.5">
                    <header className="flex items-center justify-between gap-3 min-h-11">
                        <h2 className={CREW_TEXT.section}>{t("club.myCrews")}</h2>
                        <button
                            type="button"
                            onClick={handleCreate}
                            className="h-11 px-4 -mr-1 rounded-pill bg-brand/10 text-brand text-[13px] font-semibold inline-flex items-center gap-1 active:bg-brand/20"
                        >
                            <LucidePlus className="w-4 h-4" />
                            {t("club.create")}
                        </button>
                    </header>
                    <MyCrewList currentSport={currentSport} onCreate={handleCreate} />
                </section>

                {/* 둘러보기 — 검색 + 내 주변 */}
                <section className="flex flex-col gap-2.5">
                    <header className="flex items-center min-h-11">
                        <h2 className={CREW_TEXT.section}>{t("club.discover")}</h2>
                    </header>
                    <label className="flex items-center gap-2 h-11 pl-3.5 rounded-tile bg-surface-1 border border-surface-line focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20 transition-colors">
                        <LucideSearch className="w-4 h-4 shrink-0 text-ink-3" aria-hidden="true" />
                        <input
                            type="search"
                            enterKeyHint="search"
                            aria-label={t("club.searchPlaceholder")}
                            placeholder={t("club.searchPlaceholder")}
                            className="flex-1 min-w-0 h-full bg-transparent text-[15px] font-medium text-ink-1 placeholder:text-ink-4 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                        {searchQuery && (
                            <IconButton label={t("crewMgmt.clearSearch")} onClick={() => setSearchQuery("")} className="[&_svg]:w-4 [&_svg]:h-4">
                                <LucideX />
                            </IconButton>
                        )}
                    </label>
                    <AllCrewList searchQuery={searchQuery} currentSport={currentSport} />
                </section>

                <AppInstallCard />
            </div>

            <HiqNavigation />
        </div>
    );
}
