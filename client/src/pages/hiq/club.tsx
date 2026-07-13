import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { HiqNavigation } from "@/components/hiq/HiqNavigation";
import { LucideSearch, LucidePlus } from "lucide-react";
import { useSport } from "@/contexts/SportContext";

// Sub-components
import { MyCrewList } from "@/components/hiq/club/MyCrewList";
import { AllCrewList } from "@/components/hiq/club/AllCrewList";

export default function HiqClub() {
    const [_, setLocation] = useLocation();
    const [searchQuery, setSearchQuery] = useState("");
    const { currentSport } = useSport();

    return (
        <div className="min-h-screen bg-[#0A0A0A] text-ink-1 font-sans pb-28 relative overflow-hidden">
            <div className="relative z-10 max-w-md mx-auto px-5 pt-6">
                <h1 className="text-[26px] font-bold tracking-tight text-white mb-7">크루</h1>
                <div className="space-y-8">
                    {/* My Crews Section */}
                    <section>
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-[15px] font-semibold text-white/55">내 크루</h2>
                            <Button
                                variant="ghost"
                                className="h-9 px-3.5 text-[13px] font-semibold rounded-full transition-all bg-brand/10 text-brand hover:bg-brand/20"
                                onClick={() => setLocation("/club/create")}
                            >
                                <LucidePlus className="w-3.5 h-3.5 mr-1" />
                                만들기
                            </Button>
                        </div>
                        <MyCrewList currentSport={currentSport} />
                    </section>

                    {/* Search & Discovery Section */}
                    <section>
                        <div className="mb-3">
                            <h2 className="text-[15px] font-semibold text-white/55 mb-3">둘러보기</h2>
                            <div className="relative group flex items-center px-4 h-11 rounded-tile bg-surface-2 border border-surface-line transition-all duration-300 focus-within:border-brand/30">
                                <LucideSearch className="w-4 h-4 text-ink-3 mr-2.5 transition-colors duration-300 group-focus-within:text-brand" />
                                <input
                                    type="text"
                                    placeholder="크루 이름 또는 지역 검색..."
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

            <HiqNavigation />
        </div>
    );
}
