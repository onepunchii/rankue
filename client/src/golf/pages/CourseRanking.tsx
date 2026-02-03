import { useState, useMemo } from "react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
    LucideChevronLeft,
    LucideSearch,
    LucideStar,
    LucideZap,
    LucideSkull,
    LucideLeaf,
    LucideMapPin,
    LucideTrendingUp,
    LucideTrophy,
    LucideFilter,
    LucideChevronRight,
    LucideInfo
} from "lucide-react";
import { cn } from "@/lib/utils";
import { HiqNavigation } from "@/components/hiq/HiqNavigation";

// Types
type FilterCategory = 'Region' | 'Difficulty' | 'Speed' | 'Vibe' | 'Grass';

interface Course {
    id: number;
    name: string;
    type: 'Membership' | 'Public';
    region: string;
    rating: number;
    difficulty: 'Hard' | 'Normal' | 'Easy';
    greenSpeed: number; // m/s
    grass: string;
    vibe: string;
    imageUrl: string;
    isTrending: boolean;
    popularity: number;
    officialPoints: number;
}

const COURSES: Course[] = [
    {
        id: 1,
        name: "안양 CC",
        type: 'Membership',
        region: '경기',
        rating: 4.9,
        difficulty: 'Hard',
        greenSpeed: 3.2,
        grass: 'Bent',
        vibe: 'Business',
        imageUrl: "https://images.unsplash.com/photo-1587174486073-ae5e5cff23aa?auto=format&fit=crop&q=80&w=800",
        isTrending: true,
        popularity: 98,
        officialPoints: 1200
    },
    {
        id: 2,
        name: "트리니티 클럽",
        type: 'Membership',
        region: '경기',
        rating: 4.8,
        difficulty: 'Hard',
        greenSpeed: 3.0,
        grass: 'Zoysia',
        vibe: 'Business',
        imageUrl: "https://images.unsplash.com/photo-1535131749006-b7f58c99034b?auto=format&fit=crop&q=80&w=800",
        isTrending: false,
        popularity: 85,
        officialPoints: 1150
    },
    {
        id: 3,
        name: "나인브릿지 제주",
        type: 'Membership',
        region: '제주',
        rating: 4.9,
        difficulty: 'Hard',
        greenSpeed: 3.1,
        grass: 'Bent',
        vibe: 'Scenic',
        imageUrl: "https://images.unsplash.com/photo-1592919016327-5050fef8e734?auto=format&fit=crop&q=80&w=800",
        isTrending: true,
        popularity: 92,
        officialPoints: 1180
    },
    {
        id: 4,
        name: "해슬리 나인브릿지",
        type: 'Membership',
        region: '경기',
        rating: 4.7,
        difficulty: 'Hard',
        greenSpeed: 2.9,
        grass: 'Bent',
        vibe: 'Business',
        imageUrl: "https://images.unsplash.com/photo-1623594132180-600377402927?auto=format&fit=crop&q=80&w=800",
        isTrending: false,
        popularity: 88,
        officialPoints: 1100
    },
    {
        id: 5,
        name: "우정힐스 CC",
        type: 'Membership',
        region: '충청',
        rating: 4.6,
        difficulty: 'Hard',
        greenSpeed: 2.8,
        grass: 'Bluegrass',
        vibe: 'Cost-Effective',
        imageUrl: "https://images.unsplash.com/photo-1492305175278-3b3afaa2f31f?auto=format&fit=crop&q=80&w=800",
        isTrending: false,
        popularity: 75,
        officialPoints: 1050
    }
];

const FILTERS = {
    Region: ['전체', '경기', '강원', '제주', '충청', '전라', '경상'],
    Difficulty: ['Hard', 'Normal', 'Easy'],
    Speed: ['Fast', 'Normal', 'Slow'],
    Vibe: ['Business', 'Scenic', 'Cost-Effective', 'Couple-Friendly'],
    Grass: ['Bent', 'Zoysia', 'Bluegrass']
};

export default function CourseRanking() {
    const [selectedFilters, setSelectedFilters] = useState<Record<string, string>>({
        Region: '전체',
        Difficulty: '',
        Speed: '',
        Vibe: '',
        Grass: ''
    });

    const [searchQuery, setSearchQuery] = useState("");

    const handleFilterToggle = (category: string, value: string) => {
        setSelectedFilters(prev => ({
            ...prev,
            [category]: prev[category] === value ? '' : value
        }));
    };

    const sortedAndFilteredCourses = useMemo(() => {
        return COURSES.filter(course => {
            const matchesRegion = selectedFilters.Region === '전체' || course.region === selectedFilters.Region;
            const matchesDifficulty = !selectedFilters.Difficulty || course.difficulty === selectedFilters.Difficulty;
            const matchesVibe = !selectedFilters.Vibe || course.vibe === selectedFilters.Vibe;
            const matchesGrass = !selectedFilters.Grass || course.grass === selectedFilters.Grass;
            const matchesSearch = course.name.toLowerCase().includes(searchQuery.toLowerCase());

            // Speed filter logic (Custom)
            let matchesSpeed = true;
            if (selectedFilters.Speed === 'Fast') matchesSpeed = course.greenSpeed >= 2.8;
            else if (selectedFilters.Speed === 'Normal') matchesSpeed = course.greenSpeed >= 2.5 && course.greenSpeed < 2.8;
            else if (selectedFilters.Speed === 'Slow') matchesSpeed = course.greenSpeed < 2.5;

            return matchesRegion && matchesDifficulty && matchesVibe && matchesGrass && matchesSearch && matchesSpeed;
        }).sort((a, b) => {
            // Ranking formula: (Points * 0.4) + (Rating * 0.4) + (Popularity * 0.2)
            const scoreA = (a.officialPoints * 0.4) + (a.rating * 100 * 0.4) + (a.popularity * 0.2);
            const scoreB = (b.officialPoints * 0.4) + (b.rating * 100 * 0.4) + (b.popularity * 0.2);

            // Dynamic sort by Speed if requested
            if (selectedFilters.Speed === 'Fast') return b.greenSpeed - a.greenSpeed;

            return scoreB - scoreA;
        });
    }, [selectedFilters, searchQuery]);

    return (
        <div className="min-h-screen bg-[#0A0A0A] text-white pb-32 font-sans relative overflow-x-hidden">
            {/* Sticky Header */}
            <header className="sticky top-0 z-50 bg-[#0A0A0A]/80 backdrop-blur-xl border-b border-white/5 py-4 px-6 flex items-center justify-between">
                <Link href="/dashboard">
                    <button className="p-2 -ml-2 rounded-full hover:bg-white/5 transition-colors" title="뒤로 가기">
                        <LucideChevronLeft className="w-6 h-6" />
                    </button>
                </Link>
                <h1 className="text-sm font-extrabold tracking-[0.3em] uppercase opacity-40">Rankue Guide</h1>
                <LucideInfo className="w-5 h-5 text-white/20" />
            </header>

            <main className="p-6">
                <div className="mb-8">
                    <h2 className="text-2xl font-black mb-2">오늘의 명문 코스 리서치</h2>
                    <p className="text-xs font-semibold text-white/40 tracking-tight">취향과 필드 상태에 매칭되는 필터를 선택하세요.</p>
                </div>

                {/* Search Bar */}
                <div className="relative mb-8">
                    <LucideSearch className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="구장 명칭 혹은 지역을 검색하세요"
                        className="w-full bg-white/[0.03] border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-sm font-semibold focus:outline-none focus:border-[#64DD17]/50 transition-colors"
                    />
                </div>

                {/* Advanced Filtering System */}
                <div className="space-y-4 mb-8 overflow-hidden">
                    {(Object.entries(FILTERS) as [FilterCategory, string[]][]).map(([category, values]) => (
                        <div key={category} className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide no-scrollbar">
                            <div className="flex items-center min-w-[60px]">
                                <span className="text-[10px] font-black text-white/20 uppercase tracking-widest">{category}</span>
                            </div>
                            {values.map(val => (
                                <button
                                    key={val}
                                    onClick={() => handleFilterToggle(category, val)}
                                    className={cn(
                                        "px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all duration-300 border",
                                        selectedFilters[category] === val
                                            ? "bg-[#64DD17] border-[#64DD17] text-[#051907] shadow-[0_0_15px_rgba(100,221,23,0.3)]"
                                            : "bg-white/[0.03] border-white/5 text-white/40 hover:border-white/20"
                                    )}
                                >
                                    {val}
                                </button>
                            ))}
                        </div>
                    ))}
                </div>

                {/* Results Section */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-2">
                        <LucideTrendingUp className="w-4 h-4 text-[#64DD17]" />
                        <span className="text-xs font-black uppercase tracking-widest">Weighted Ranking</span>
                    </div>
                    <span className="text-[10px] font-bold text-white/20">{sortedAndFilteredCourses.length} Courses Found</span>
                </div>

                <div className="space-y-6">
                    <AnimatePresence>
                        {sortedAndFilteredCourses.map((course, idx) => (
                            <motion.div
                                key={course.id}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                transition={{ delay: idx * 0.05 }}
                                className="relative group cursor-pointer"
                            >
                                <div className="absolute inset-0 bg-white/[0.03] border border-white/5 rounded-[2.5rem] group-hover:border-[#64DD17]/30 transition-all duration-300 overflow-hidden shadow-2xl">
                                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
                                    <img
                                        src={course.imageUrl}
                                        className="w-full h-full object-cover opacity-40 group-hover:opacity-60 transition-opacity duration-700"
                                        alt={course.name}
                                    />
                                </div>

                                {/* Content Overlay */}
                                <div className="relative z-10 p-6 h-[220px] flex flex-col justify-between">
                                    <div className="flex justify-between items-start">
                                        <div className="flex gap-2 items-center">
                                            {idx < 3 ? (
                                                <div className={cn(
                                                    "w-10 h-10 rounded-2xl flex items-center justify-center shadow-lg",
                                                    idx === 0 ? "bg-amber-400" : idx === 1 ? "bg-slate-300" : "bg-amber-700"
                                                )}>
                                                    <LucideTrophy className="w-5 h-5 text-black" />
                                                </div>
                                            ) : (
                                                <div className="w-10 h-10 rounded-2xl bg-black/40 border border-white/10 flex items-center justify-center text-lg font-black text-[#64DD17] italic">
                                                    {idx + 1}
                                                </div>
                                            )}
                                            {course.isTrending && (
                                                <div className="px-3 py-1 bg-red-600 text-white text-[10px] font-black rounded-full flex items-center gap-1 animate-pulse">
                                                    🔥 HOT
                                                </div>
                                            )}
                                        </div>
                                        <div className="px-3 py-1 bg-white/10 backdrop-blur-md border border-white/10 rounded-full text-[10px] font-black text-white/60">
                                            {course.type.toUpperCase()}
                                        </div>
                                    </div>

                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <LucideMapPin className="w-3 h-3 text-white/40" />
                                            <span className="text-[10px] font-extrabold text-white/40 tracking-widest uppercase">{course.region}</span>
                                        </div>
                                        <h3 className="text-2xl font-black mb-3 group-hover:text-[#64DD17] transition-colors">{course.name}</h3>

                                        <div className="flex items-center gap-4 border-t border-white/10 pt-4">
                                            <div className="flex items-center gap-1.5">
                                                <LucideStar className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                                                <span className="text-sm font-black">{course.rating}</span>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                <LucideSkull className={cn(
                                                    "w-3.5 h-3.5",
                                                    course.difficulty === 'Hard' ? "text-red-500" : "text-amber-500"
                                                )} />
                                                <span className="text-sm font-black text-white/60">{course.difficulty}</span>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                <LucideZap className="w-3.5 h-3.5 text-[#64DD17]" />
                                                <span className="text-sm font-black text-[#64DD17]">{course.greenSpeed}m/s</span>
                                            </div>
                                            <div className="flex items-center gap-1.5 ml-auto">
                                                <LucideLeaf className="w-3.5 h-3.5 text-blue-400" />
                                                <span className="text-xs font-bold text-white/40">{course.grass}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>
            </main>

            <HiqNavigation />
        </div>
    );
}
