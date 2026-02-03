import { AnimatePresence } from "framer-motion";
import { useEliteCourses } from "../hooks/useEliteCourses";
import { useSavedImages } from "../hooks/useSavedImages";
import { EliteHeader } from "../components/elite/EliteHeader";
import { FilterTabs } from "../components/elite/FilterTabs";
import { EliteCourseCard } from "../components/elite/EliteCourseCard";
import { InsightBanner } from "../components/elite/InsightBanner";

export default function GolfElite60() {
    const {
        mainTab, setMainTab,
        subFilter, setSubFilter,
        searchQuery, setSearchQuery,
        eliteCourses,
        stats,
        getConqueredInfo
    } = useEliteCourses();

    const savedImages = useSavedImages();

    return (
        <div className="min-h-screen bg-[#0A0A0A] text-white pb-32 font-sans relative overflow-x-hidden">
            <EliteHeader />

            <main className="px-6 -mt-6 relative z-20">
                <FilterTabs
                    mainTab={mainTab} setMainTab={setMainTab}
                    subFilter={subFilter} setSubFilter={setSubFilter}
                    searchQuery={searchQuery} setSearchQuery={setSearchQuery}
                />

                <div className="grid grid-cols-2 gap-4">
                    <AnimatePresence mode="popLayout">
                        {eliteCourses.map((course) => (
                            <EliteCourseCard
                                key={course.id}
                                course={course}
                                conqueredInfo={getConqueredInfo(course.name)}
                                savedImage={savedImages[course.id]}
                            />
                        ))}
                    </AnimatePresence>
                </div>
            </main>

            <InsightBanner stats={stats} />
        </div>
    );
}
