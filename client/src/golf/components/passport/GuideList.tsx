import { Link } from "wouter";
import { motion } from "framer-motion";
import {
    LucideSearch, LucideFilter, LucideRotateCcw, LucideStar, LucideZap, LucideSkull, LucideBadgeCheck, LucideCrown
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
    Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger
} from "@/components/ui/sheet";
import { FILTERS, CATEGORY_LABELS, FilterCategory, useCourseFilter } from "@/golf/hooks/useCourseFilter";
import { COURSES } from "@/golf/data/golfCourses";
import { Elite60Banner } from "./Elite60Banner";

const DEFAULT_PLACEHOLDER_IMG = "https://images.unsplash.com/photo-1587174486073-ae5e5cff23aa?auto=format&fit=crop&q=80&w=2070";

interface Props {
    savedImages: Record<number, string>;
    conqueredCourses: string[];
    filterHook: ReturnType<typeof useCourseFilter>;
}

export const GuideList = ({ savedImages, conqueredCourses, filterHook }: Props) => {
    const {
        searchQuery, setSearchQuery,
        selectedFilters,
        handleFilterToggle,
        resetFilters,
        guideCourses
    } = filterHook;

    const isConquered = (name: string) => conqueredCourses.includes(name);

    return (
        <motion.div
            key="guide"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
        >
            {/* Filter Chips */}
            <div className="flex items-center gap-3 mb-8 overflow-x-auto pb-4 scrollbar-hide no-scrollbar">
                {(Object.entries(FILTERS) as [FilterCategory, string[]][]).map(([category, values]) => (
                    <Sheet key={category}>
                        <SheetTrigger asChild>
                            <button className={cn(
                                "shrink-0 h-10 px-5 rounded-full border flex items-center gap-2 transition-all",
                                selectedFilters[category] !== '' && selectedFilters[category] !== '전체'
                                    ? "bg-[#64DD17]/10 border-[#64DD17]/30 text-[#64DD17]"
                                    : "bg-white/5 border-white/10 text-white/40 hover:bg-white/10"
                            )}>
                                <span className="text-xs font-black uppercase tracking-widest leading-none">
                                    {selectedFilters[category] === '' || selectedFilters[category] === '전체' ? CATEGORY_LABELS[category] : selectedFilters[category]}
                                </span>
                                <LucideFilter className="w-3 h-3" />
                            </button>
                        </SheetTrigger>
                        <SheetContent side="bottom" className="bg-[#111] border-white/5 rounded-t-[3rem] px-8 pb-10">
                            <div className="max-w-2xl mx-auto">
                                <SheetHeader className="mb-6">
                                    <SheetTitle className="text-xl font-black text-white text-left">{CATEGORY_LABELS[category]}</SheetTitle>
                                </SheetHeader>
                                <div className="grid grid-cols-2 gap-3">
                                    {values.map(val => (
                                        <button
                                            key={val}
                                            onClick={() => handleFilterToggle(category, val)}
                                            className={cn(
                                                "py-4 rounded-2xl text-xs font-black transition-all border",
                                                selectedFilters[category] === val ? "bg-[#64DD17] border-[#64DD17] text-[#051907]" : "bg-white/5 border-white/5 text-white/40"
                                            )}
                                        >
                                            {val}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </SheetContent>
                    </Sheet>
                ))}

                <button onClick={resetFilters} className="shrink-0 w-9 h-9 flex items-center justify-center rounded-full bg-white/5 border border-white/10 text-white/40 hover:text-white transition-colors">
                    <LucideRotateCcw className="w-4 h-4" />
                </button>
            </div>

            {/* Search */}
            <div className="relative mb-8">
                <LucideSearch className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                <input
                    type="text"
                    placeholder="구장 명칭으로 검색"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-sm font-semibold focus:outline-none focus:border-amber-500/50 transition-colors text-white"
                />
            </div>

            {/* List */}
            <div className="space-y-4">
                {guideCourses.length === 0 ? (
                    <div className="text-center py-24 bg-white/5 border border-dashed border-white/10 rounded-[2.5rem] flex flex-col items-center justify-center gap-4">
                        <LucideSearch className="w-8 h-8 text-white/10" />
                        <p className="text-sm font-black text-white/40">검색된 골프장이 없습니다</p>
                        <Button onClick={resetFilters} variant="outline" className="mt-4 rounded-xl border-white/10 text-white/40">필터 초기화</Button>
                    </div>
                ) : (
                    guideCourses.map((course) => {
                        const isC = isConquered(course.name);
                        const isMembership = course.type === 'Membership';
                        return (
                            <Link key={course.id} href={`/golf/course/${course.id}`} className="block relative group bg-white/[0.03] border border-white/5 rounded-[2rem] overflow-hidden hover:border-amber-500/30 transition-all active:scale-[0.98] shadow-2xl">
                                <div className="flex h-32">
                                    <div className="w-28 h-full relative overflow-hidden bg-[#0A0A0A]">
                                        <img
                                            src={savedImages[course.id] || course.imageUrl || DEFAULT_PLACEHOLDER_IMG}
                                            className={cn("w-full h-full object-cover transition-all duration-700", !isC && "grayscale")}
                                            alt={course.name}
                                        />
                                    </div>
                                    <div className="flex-1 p-4 flex flex-col justify-between">
                                        <div>
                                            <div className="text-[9px] font-bold text-white/30 uppercase tracking-[0.2em] mb-1.5">{course.region}</div>
                                            <div className="flex items-center justify-between mb-1.5">
                                                <span className={cn(
                                                    "text-[7px] font-black px-1.5 py-0.5 rounded border uppercase tracking-widest leading-none",
                                                    isMembership ? "border-amber-500/50 text-amber-500" : "border-[#64DD17]/50 text-[#64DD17]"
                                                )}>
                                                    {isMembership ? "[ M 회원제 ]" : "[ P 퍼블릭 ]"}
                                                </span>
                                                {isC && (
                                                    <div className="flex items-center gap-1 text-[#64DD17] bg-[#64DD17]/10 px-2 py-0.5 rounded-full border border-[#64DD17]/10">
                                                        <LucideBadgeCheck className="w-2.5 h-2.5" />
                                                        <span className="text-[7px] font-black uppercase">정복 완료</span>
                                                    </div>
                                                )}
                                            </div>
                                            <h3 className="text-lg font-black group-hover:text-amber-500 transition-colors tracking-tighter leading-none text-white">{course.name}</h3>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            {/* Rating, Speed, Difficulty pills */}
                                            <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/5 border border-white/5 shadow-inner">
                                                <LucideStar className="w-2.5 h-2.5 text-amber-500 fill-amber-500" />
                                                <span className="text-[10px] font-black text-white/90">{course.rating}</span>
                                            </div>
                                            <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/5 border border-white/5 shadow-inner">
                                                <LucideZap className="w-2.5 h-2.5 text-[#64DD17]" />
                                                <span className="text-[10px] font-black text-white/90">{course.speed}</span>
                                            </div>
                                            <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/5 border border-white/5 shadow-inner">
                                                <LucideSkull className="w-2.5 h-2.5 text-red-500" />
                                                <span className="text-[10px] font-black text-white/90">{course.difficulty}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </Link>
                        );
                    })
                )}
            </div>

            {/* Gamification Banner */}
            <Elite60Banner conqueredCount={COURSES.filter(c => c.isRankue60 && isConquered(c.name)).length} />
        </motion.div>
    );
};
