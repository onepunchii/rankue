import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

import { HiqNavigation } from "@/components/hiq/HiqNavigation";
import { ScorecardScanner } from "../components/ScorecardScanner";

// Components
import { PassportHeader } from "../components/passport/PassportHeader";
import { PassportStatsCard } from "../components/passport/PassportStatsCard";
import { RegionMap } from "../components/passport/RegionMap";
import { StampList } from "../components/passport/StampList";
import { GuideList } from "../components/passport/GuideList";
import { RegionSheet } from "../components/passport/RegionSheet";
import { ViewSwitcher } from "../components/passport/ViewSwitcher";
import { Elite60Banner } from "../components/passport/Elite60Banner";
import { COURSES } from "@/golf/data/golfCourses";

// Hooks
import { usePassportData } from "../hooks/usePassportData";
import { useCourseFilter } from "../hooks/useCourseFilter";

type ViewMode = 'map' | 'stamp' | 'guide';

export default function Passport() {
    const [viewMode, setViewMode] = useState<ViewMode>('map');
    const [scannerOpen, setScannerOpen] = useState(false);

    // For Region Sheet interactions
    const [regionalSheetRegion, setRegionalSheetRegion] = useState<string | null>(null);
    const [isRegionalPopupOpen, setIsRegionalPopupOpen] = useState(false);

    // Hooks
    const { stats, stamps, savedImages, isLoading, handleScanComplete } = usePassportData();
    const courseFilter = useCourseFilter(); // Lifted state for filtering

    // View mode change effect: scroll to top
    useEffect(() => {
        window.scrollTo(0, 0);
    }, [viewMode]);

    // Derived state for props
    const conqueredCourses = stamps.map(s => s.name);
    const rankue60ConqueredCount = COURSES.filter(c => c.isRankue60 && conqueredCourses.includes(c.name)).length;

    const handleRegionSheetGoToGuide = (regionName: string) => {
        // Automatically switch filter to the selected region and move to guide view
        courseFilter.handleFilterToggle('Region', regionName);
        setViewMode('guide');
        setIsRegionalPopupOpen(false);
    };

    if (isLoading) {
        return <LoadingSkeleton />;
    }

    return (
        <div className="min-h-screen bg-[#050505] text-white pb-24 font-['Inter', 'Outfit', sans-serif] overflow-x-hidden">
            <PassportHeader onScanClick={() => setScannerOpen(true)} />

            <main className="max-w-2xl mx-auto px-6 pt-24">
                <ViewSwitcher current={viewMode} onChange={setViewMode} />

                <AnimatePresence mode="wait">
                    {viewMode === 'map' && (
                        <motion.div
                            key="map"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                        >
                            <PassportStatsCard
                                stats={stats}
                                onScanClick={() => setScannerOpen(true)}
                            />
                            <RegionMap
                                stamps={stamps}
                                onRegionClick={(id) => {
                                    setRegionalSheetRegion(id);
                                    setIsRegionalPopupOpen(true);
                                }}
                            />
                            <Elite60Banner conqueredCount={rankue60ConqueredCount} />
                        </motion.div>
                    )}

                    {viewMode === 'stamp' && (
                        <motion.div
                            key="stamp"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                        >
                            <StampList stamps={stamps} />
                            <Elite60Banner conqueredCount={rankue60ConqueredCount} />
                        </motion.div>
                    )}

                    {viewMode === 'guide' && (
                        <GuideList
                            savedImages={savedImages}
                            conqueredCourses={conqueredCourses}
                            filterHook={courseFilter}
                        />
                    )}
                </AnimatePresence>
            </main>

            <RegionSheet
                isOpen={isRegionalPopupOpen}
                onClose={() => setIsRegionalPopupOpen(false)}
                regionId={regionalSheetRegion}
                conqueredCourses={conqueredCourses}
                onGoToGuide={handleRegionSheetGoToGuide}
            />

            <HiqNavigation />

            {scannerOpen && (
                <ScorecardScanner
                    onClose={() => setScannerOpen(false)}
                    onComplete={() => {
                        setScannerOpen(false);
                        handleScanComplete();
                    }}
                />
            )}
        </div>
    );
}

function LoadingSkeleton() {
    return (
        <div className="min-h-screen bg-[#050505] pt-24 px-6">
            <div className="space-y-8 animate-in fade-in duration-500 max-w-2xl mx-auto">
                <div className="h-64 bg-white/5 rounded-[2.5rem] p-8 border border-white/5">
                    <div className="flex gap-4 mb-8">
                        <div className="w-12 h-12 rounded-full bg-white/5 animate-pulse" />
                        <div className="space-y-2 flex-1 pt-2">
                            <div className="h-4 w-24 bg-white/5 rounded animate-pulse" />
                            <div className="h-4 w-32 bg-white/5 rounded animate-pulse" />
                        </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                        <div className="h-16 bg-white/5 rounded-2xl animate-pulse" />
                        <div className="h-16 bg-white/5 rounded-2xl animate-pulse" />
                        <div className="h-16 bg-white/5 rounded-2xl animate-pulse" />
                    </div>
                </div>
                <div className="aspect-[3/4] bg-white/5 rounded-[3rem] animate-pulse border border-white/5" />
            </div>
        </div>
    );
}
