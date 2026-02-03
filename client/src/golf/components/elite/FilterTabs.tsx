import { LucideSearch } from "lucide-react";
import { cn } from "@/lib/utils";
import { MainTab, SubFilter } from "@/golf/hooks/useEliteCourses";

interface Props {
    mainTab: MainTab;
    setMainTab: (tab: MainTab) => void;
    subFilter: SubFilter;
    setSubFilter: (filter: SubFilter) => void;
    searchQuery: string;
    setSearchQuery: (query: string) => void;
}

export const FilterTabs = ({ mainTab, setMainTab, subFilter, setSubFilter, searchQuery, setSearchQuery }: Props) => {
    return (
        <>
            {/* Main Filter System (Tab View) */}
            <div className="bg-[#1a1a1a] p-1.5 rounded-[2rem] border border-white/5 mb-8 flex shadow-2xl">
                <button
                    onClick={() => setMainTab('Membership')}
                    className={cn(
                        "flex-1 py-3.5 rounded-[1.5rem] text-xs font-black transition-all flex items-center justify-center",
                        mainTab === 'Membership' ? "bg-gradient-to-r from-amber-400 to-amber-600 text-amber-950 shadow-lg" : "text-white/40"
                    )}
                >
                    회원제 (30)
                </button>
                <button
                    onClick={() => setMainTab('Public')}
                    className={cn(
                        "flex-1 py-3.5 rounded-[1.5rem] text-xs font-black transition-all flex items-center justify-center",
                        mainTab === 'Public' ? "bg-[#64DD17] text-[#051907] shadow-lg" : "text-white/40"
                    )}
                >
                    대중제 (30)
                </button>
            </div>

            {/* Sub Filters & Search */}
            <div className="space-y-6 mb-8">
                <div className="flex gap-2 items-center overflow-x-auto no-scrollbar pb-2">
                    {(['All', 'Conquered', 'Locked', 'Region'] as SubFilter[]).map(val => (
                        <button
                            key={val}
                            onClick={() => setSubFilter(val)}
                            className={cn(
                                "shrink-0 px-6 py-2.5 rounded-full text-xs font-black transition-all border",
                                subFilter === val ? "bg-white text-black border-white" : "bg-white/5 border-white/10 text-white/40"
                            )}
                        >
                            {val === 'All' ? '전체' : val === 'Conquered' ? '정복함' : val === 'Locked' ? '미정복' : '지역순'}
                        </button>
                    ))}
                </div>

                <div className="relative">
                    <LucideSearch className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                    <input
                        type="text"
                        placeholder="구장 명칭으로 검색"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-sm font-semibold focus:outline-none focus:border-amber-500/50 transition-colors"
                    />
                </div>
            </div>
        </>
    );
};
