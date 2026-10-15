import { useState } from "react";
import { useLocation } from "wouter";
import { HiqNavigation } from "@/components/hiq/HiqNavigation";
import { AppInstallCard } from "@/components/hiq/AppInstallCard";
import { LucideSearch, LucidePlus, LucideX } from "@/lib/icons";
import { useSport } from "@/contexts/SportContext";
import { useT } from "@/lib/i18n";
import { CREW_TEXT, IconButton } from "@/components/hiq/crew-ui";
import { SportHeader } from "@/components/hiq/SportHeader";
import { CoachTour, tourToneOf } from "@/components/hiq/CoachTour";

// Sub-components
import { MyCrewList } from "@/components/hiq/club/MyCrewList";
import { AllCrewList } from "@/components/hiq/club/AllCrewList";
import { useAuth } from "@/hooks/useAuth";
import { goLogin } from "@/components/hiq/LoginGate";

export default function HiqClub() {
    const { t } = useT();
    const [, setLocation] = useLocation();
    const [searchQuery, setSearchQuery] = useState("");
    // sport — 등산일 때는 산악회만 보인다. currentSport 는 등산을 당구로 보고해서(SportContext) 그대로 쓰면 등산 탭에 당구 크루가 뜬다.
    const { sport } = useSport();
    // 크루 목록·검색은 공개다. 만들기(=계정 필요)만 로그인으로 보낸다 — 머리의 '만들기'와 빈 목록의 버튼이 같은 길을 쓴다.
    const { isGuest } = useAuth();
    const handleCreate = () => (isGuest ? goLogin(setLocation, "/club") : setLocation("/club/create"));

    return (
        <div className="min-h-screen bg-surface-0 text-ink-1 font-sans pb-nav">
            {/* 세 종목이 같이 쓰는 고정 머리줄(2026-10-13 오너: "헤더는 크루까지만 적용하자 — 당구 크루 · 골프 크루 · 등산 크루, 크루 텍스트는 제거").
                화면의 제목은 하단 탭이 말해 준다 — 글자는 화면 읽기 도구에만 남긴다 */}
            <SportHeader sport={sport} inner="mx-auto max-w-md" />
            <h1 className="sr-only">{t("club.title")}</h1>
            <div className="max-w-md mx-auto px-4 pt-5 flex flex-col gap-8">

                {/* 내 크루 */}
                <section className="flex flex-col gap-2.5">
                    <header className="flex items-center justify-between gap-3 min-h-11">
                        <h2 className={CREW_TEXT.section}>{t("club.myCrews")}</h2>
                        <button
                            type="button"
                            onClick={handleCreate}
                            data-tour="cl-create"
                            className="h-11 px-4 -mr-1 rounded-pill bg-brand/10 text-brand text-[13px] font-semibold inline-flex items-center gap-1 active:bg-brand/20"
                        >
                            <LucidePlus className="w-4 h-4" />
                            {t("club.create")}
                        </button>
                    </header>
                    <div data-tour="cl-mine"><MyCrewList currentSport={sport} onCreate={handleCreate} /></div>
                </section>

                {/* 둘러보기 — 검색 + 내 주변 */}
                <section className="flex flex-col gap-2.5">
                    <header className="flex items-center min-h-11">
                        <h2 className={CREW_TEXT.section}>{t("club.discover")}</h2>
                    </header>
                    <label data-tour="cl-search" className="flex items-center gap-2 h-11 pl-3.5 rounded-tile bg-surface-1 border border-surface-line focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20 transition-colors">
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
                    <AllCrewList searchQuery={searchQuery} currentSport={sport} />
                </section>

                <AppInstallCard />
            </div>

            {/* 크루 목록의 첫 안내(2026-10-15) — 고른 종목의 톤으로 */}
            <CoachTour id="crew-list" tone={tourToneOf(sport)} steps={[
                { target: "cl-mine", title: t("tour.cl.mineTitle"), body: t("tour.cl.mineBody") },
                { target: "cl-search", title: t("tour.cl.searchTitle"), body: t("tour.cl.searchBody") },
                { target: "cl-create", title: t("tour.cl.createTitle"), body: t("tour.cl.createBody") },
            ]} />
            <HiqNavigation />
        </div>
    );
}
