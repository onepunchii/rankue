import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import { listPath } from "@shared/golfCourse";

import { HiqNavigation } from "@/components/hiq/HiqNavigation";
import { ScorecardScanner } from "../components/ScorecardScanner";

// Components
import { PassportHeader } from "../components/passport/PassportHeader";
import { PassportStatsCard } from "../components/passport/PassportStatsCard";
import { StampList } from "../components/passport/StampList";
import { RegionSheet } from "../components/passport/RegionSheet";
import { ViewSwitcher } from "../components/passport/ViewSwitcher";
import { Elite60Banner } from "../components/passport/Elite60Banner";
import { PassportMapTabs, usePassportMapMode } from "../components/passport/PassportMapTabs";
import { FootprintsPanel } from "../components/passport/FootprintsPanel";
import { PassportAlbum } from "../components/passport/PassportAlbum";
import { useMyPhotos } from "../lib/photoApi";
import { COURSES } from "@/golf/data/golfCourses";
import { countEliteConquered } from "../lib/elite60";

// Hooks
import { usePassportData } from "../hooks/usePassportData";

/**
 * 'guide' 탭은 뺐다(2026-09-24 오너: "가이드 부분은 중복이라 빼도 되지 않을까") — 정적 목록 + 사진은 스톡 이미지였고,
 * 같은 일을 전국 골프장(/golf/courses, 실제 그린피·시세·티타임)이 더 잘한다. 지역 시트의 '보기'도 그 지역 목록으로 보낸다.
 */
type ViewMode = 'map' | 'stamp';

export default function Passport() {
    const [viewMode, setViewMode] = useState<ViewMode>('map');
    // 지도 보기: 발자국(지역 정복이 그 지도에 칠해진다 — 2026-10-05 한 장으로 합침) ↔ 앨범
    const [mapMode, setMapMode] = usePassportMapMode();
    // 앨범 탭의 사진 수(라운드 시트 탭과 같은 작은 알약) — 앨범 탭과 같은 캐시라 탭을 열 때 다시 받지 않는다
    const myPhotos = useMyPhotos();
    const [scannerOpen, setScannerOpen] = useState(false);

    // For Region Sheet interactions
    const [regionalSheetRegion, setRegionalSheetRegion] = useState<string | null>(null);
    const [isRegionalPopupOpen, setIsRegionalPopupOpen] = useState(false);

    // Hooks
    const { stats, stamps, recordStamps, savedImages, isLoading, handleScanComplete } = usePassportData();
    const [, setLocation] = useLocation();

    // View mode change effect: scroll to top
    useEffect(() => {
        window.scrollTo(0, 0);
    }, [viewMode]);

    // Derived state for props — 인증 도장만(현장 인증 + 옛 기록). 기록 도장은 정복·Elite 60 에 안 센다(2026-09-30)
    const conqueredCourses = stamps.map(s => s.name);
    // Elite 60 화면과 같은 판정(lib/elite60) — 예전엔 여기만 이름이 글자 그대로 같을 때 세서 두 숫자가 달랐다
    const rankue60ConqueredCount = countEliteConquered(COURSES, stamps);

    const handleRegionSheetGoToGuide = (regionName: string) => {
        setIsRegionalPopupOpen(false);
        setLocation(listPath({ region: regionName }));
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
                            <PassportStatsCard stats={stats} recordCount={recordStamps.length} />
                            <PassportMapTabs value={mapMode} onChange={setMapMode} albumCount={myPhotos.data?.length ?? 0} />
                            {mapMode === 'album' ? (
                                <PassportAlbum />
                            ) : (
                                <FootprintsPanel
                                    regionTotals={stats.regionTotals}
                                    regionConquered={stats.regionConquered}
                                    onRegion={(region) => {
                                        setRegionalSheetRegion(region);
                                        setIsRegionalPopupOpen(true);
                                    }}
                                />
                            )}
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
                            <StampList stamps={stamps} records={recordStamps} />
                            <Elite60Banner conqueredCount={rankue60ConqueredCount} />
                        </motion.div>
                    )}

                </AnimatePresence>
            </main>

            <RegionSheet
                isOpen={isRegionalPopupOpen}
                onClose={() => setIsRegionalPopupOpen(false)}
                region={regionalSheetRegion}
                conqueredCourses={conqueredCourses}
                stampClubIds={stamps.map((s) => s.clubId).filter(Boolean) as string[]}
                recordClubIds={recordStamps.map((s) => s.clubId).filter(Boolean) as string[]}
                onGoToGuide={handleRegionSheetGoToGuide}
                regionTotals={stats.regionTotals}
                regionConquered={stats.regionConquered}
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
