import { useState, useMemo } from "react";
import { LucideSearch, LucideMap } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { COURSES } from "@/golf/data/golfCourses";

interface CourseSearchSectionProps {
    searchQuery: string;
    setSearchQuery: (q: string) => void;
    selectedCourse: any;
    setSelectedCourse: (c: any) => void;
    isManager: boolean;
    isBlind: boolean;
    setIsBlind: (b: boolean) => void;
    blindName: string;
    setBlindName: (n: string) => void;
    listingType: 'BOOKING' | 'JOIN';
}

export function CourseSearchSection({
    searchQuery,
    setSearchQuery,
    selectedCourse,
    setSelectedCourse,
    isManager,
    isBlind,
    setIsBlind,
    blindName,
    setBlindName,
    listingType
}: CourseSearchSectionProps) {

    // Filter logic moved here internally or passed? Passed logic was better but simple filter can be here.
    // The previous code had useMemo for filteredCourses. Let's keep it here.
    const filteredCourses = useMemo(() => {
        if (!searchQuery || searchQuery.length < 1 || selectedCourse) return [];
        return COURSES.filter(c =>
            c.name.toLowerCase().includes(searchQuery.toLowerCase())
        ).slice(0, 5);
    }, [searchQuery, selectedCourse]);

    const handleCourseSelect = (course: any) => {
        setSelectedCourse(course);
        setSearchQuery(course.name);
    };

    const activeColor = listingType === 'JOIN' ? 'text-[#FF6B00]' : 'text-[#64DD17]';
    const activeBg = listingType === 'JOIN' ? 'bg-[#FF6B00]/10' : 'bg-[#64DD17]/10';
    const activeBorder = listingType === 'JOIN' ? 'border-[#FF6B00]/30' : 'border-[#64DD17]/30';
    const activeBgLight = listingType === 'JOIN' ? 'bg-[#FF6B00]/20' : 'bg-[#64DD17]/20';
    const activeText = listingType === 'JOIN' ? 'text-[#FF6B00]' : 'text-[#64DD17]';

    return (
        <section className="space-y-6">
            <div className="flex items-center gap-2 mb-2">
                <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", activeBg)}>
                    <LucideMap className={cn("w-4 h-4", activeColor)} />
                </div>
                <h3 className="text-sm font-black text-white uppercase tracking-widest">1. 골프장 선택</h3>
            </div>

            <div className="space-y-4">
                <div className="relative">
                    <label className="text-[10px] font-black text-white/60 uppercase tracking-[0.2em] mb-2 block ml-1">골프장 검색</label>
                    <div className="relative">
                        <LucideSearch className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/60" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => {
                                setSearchQuery(e.target.value);
                                if (selectedCourse) setSelectedCourse(null);
                            }}
                            placeholder="골프장명 입력 (예: 88, 한양)"
                            title="골프장 검색"
                            className={cn(
                                "w-full bg-white/5 border border-white/5 rounded-2xl py-4 pl-12 pr-4 text-sm font-bold text-white focus:outline-none focus:bg-white/[0.08] transition-all",
                                listingType === 'JOIN' ? "focus:border-[#FF6B00]/50" : "focus:border-[#64DD17]/50"
                            )}
                        />
                        {selectedCourse && (
                            <div className={cn("absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2 px-2 py-1 rounded border", activeBgLight, activeBorder)}>
                                <span className={cn("text-[10px] font-black uppercase tracking-tighter", activeText)}>{selectedCourse.region}</span>
                            </div>
                        )}
                    </div>

                    {/* Autocomplete Results */}
                    <AnimatePresence>
                        {filteredCourses.length > 0 && (
                            <motion.div
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                className="absolute top-full left-0 right-0 mt-2 bg-[#1A1A1A] border border-white/10 rounded-2xl overflow-hidden z-50 shadow-2xl"
                            >
                                {filteredCourses.map(course => (
                                    <button
                                        key={course.id}
                                        onClick={() => handleCourseSelect(course)}
                                        className="w-full px-5 py-4 flex items-center justify-between hover:bg-white/5 transition-colors border-b border-white/5 last:border-0"
                                    >
                                        <div className="text-left">
                                            <div className="text-sm font-bold text-white">{course.name}</div>
                                            <div className="text-[10px] font-bold text-white/20 uppercase tracking-widest">{course.address}</div>
                                        </div>
                                        <span className={cn("text-[10px] font-black uppercase px-2 py-1 rounded", activeText, activeBg)}>{course.region}</span>
                                    </button>
                                ))}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Blind Booking Mode - Only for Managers */}
                {isManager && (
                    <div className="flex items-start justify-between p-5 rounded-2xl bg-white/5 border border-white/5">
                        <div>
                            <div className="text-sm font-bold text-white flex items-center gap-2">
                                🕶️ 익명(비공개)으로 등록
                            </div>
                            <div className="text-[10px] font-bold text-white/20 uppercase tracking-widest mt-1">
                                정확한 구장명 대신 권역으로 노출합니다
                            </div>
                        </div>
                        <Switch checked={isBlind} onCheckedChange={setIsBlind} />
                    </div>
                )}

                {/* Blind Name Selection */}
                <AnimatePresence>
                    {isBlind && selectedCourse && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden space-y-2"
                        >
                            <label className="text-[10px] font-black text-white/60 uppercase tracking-[0.2em] ml-1">노출할 가명 선택</label>
                            <div className="grid grid-cols-2 gap-2">
                                {[
                                    `${selectedCourse.region.substring(0, 2)}권 명문`,
                                    selectedCourse.subType === "회원제" ? `${selectedCourse.region.substring(0, 2)}권 회원제` : `${selectedCourse.region.substring(0, 2)}권 퍼블릭`,
                                    "IC 인근 골프장",
                                    "접근성 좋은 구장"
                                ].map((alias) => (
                                    <button
                                        key={alias}
                                        onClick={() => setBlindName(alias)}
                                        className={cn(
                                            "p-3 rounded-xl border text-xs font-bold transition-all",
                                            blindName === alias
                                                ? cn(activeBgLight, activeBorder, activeText)
                                                : "bg-white/5 border-white/5 text-white/40 hover:bg-white/10"
                                        )}
                                    >
                                        {alias}
                                    </button>
                                ))}
                            </div>
                            <div className="relative mt-2">
                                <input
                                    type="text"
                                    value={blindName}
                                    onChange={(e) => setBlindName(e.target.value)}
                                    placeholder="직접 입력"
                                    className={cn(
                                        "w-full bg-white/5 border border-white/5 rounded-xl py-3 px-4 text-xs font-bold text-white focus:outline-none transition-all",
                                        listingType === 'JOIN' ? "focus:border-[#FF6B00]/50" : "focus:border-[#64DD17]/50"
                                    )}
                                />
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </section>
    );
}
