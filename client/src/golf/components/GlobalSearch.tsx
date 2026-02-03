import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    LucideSearch,
    LucideX,
    LucideClock,
    LucideChevronRight,
    LucideCalendar,
    LucideHistory,
    LucideTrendingUp
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { GolfBooking } from "../../../../shared/schema";
import { Dialog, DialogContent } from "@/components/ui/dialog";

interface GlobalSearchProps {
    isOpen: boolean;
    onClose: () => void;
    onSelectBooking: (booking: GolfBooking) => void;
    viewType: 'ALL' | 'BOOKING' | 'JOIN';
}

export function GlobalSearch({ isOpen, onClose, onSelectBooking, viewType }: GlobalSearchProps) {
    const [searchQuery, setSearchQuery] = useState("");
    const [recentSearches, setRecentSearches] = useState<string[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [results, setResults] = useState<GolfBooking[]>([]);

    // Load recent searches
    useEffect(() => {
        const saved = localStorage.getItem('golf_recent_searches');
        if (saved) setRecentSearches(JSON.parse(saved));
    }, []);

    const saveSearch = (query: string) => {
        if (!query.trim()) return;
        const updated = [query, ...recentSearches.filter(s => s !== query)].slice(0, 5);
        setRecentSearches(updated);
        localStorage.setItem('golf_recent_searches', JSON.stringify(updated));
    };

    const handleSearch = async (query: string) => {
        if (!query.trim()) return;
        setSearchQuery(query);
        setIsSearching(true);
        saveSearch(query);

        try {
            const startDate = new Date().toISOString().split('T')[0];
            const endDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

            const params = new URLSearchParams({
                courseName: query,
                startDate,
                endDate,
                listingType: viewType
            });

            const data = await apiRequest(`/api/hiq/golf/bookings?${params.toString()}`);
            setResults(data);
        } catch (error) {
            console.error("Search failed:", error);
        } finally {
            setIsSearching(false);
        }
    };

    // Group results by date
    const groupedResults = useMemo(() => {
        const groups: Record<string, GolfBooking[]> = {};
        results.forEach(booking => {
            const dt = typeof booking.datetime === 'string' ? new Date(booking.datetime) : booking.datetime;
            const dateKey = dt.toISOString().split('T')[0];
            if (!groups[dateKey]) groups[dateKey] = [];
            groups[dateKey].push(booking);
        });
        return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
    }, [results]);

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        const dayNames = ["일", "월", "화", "수", "목", "금", "토"];
        return `${date.getMonth() + 1}.${date.getDate()} (${dayNames[date.getDay()]})`;
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-md w-full h-[90vh] bg-[#0A0A0A] border-white/10 p-0 overflow-hidden flex flex-col [&>button]:hidden">
                {/* Search Header */}
                <div className="p-6 pb-4 border-b border-white/5 space-y-4">
                    <div className="flex items-center justify-between mb-2">
                        <h2 className="text-xl font-black text-white tracking-tighter">골프장 통합 검색</h2>
                        <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full text-white/40" title="닫기">
                            <LucideX className="w-5 h-5" />
                        </button>
                    </div>
                    <div className="relative">
                        <LucideSearch className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                        <input
                            type="text"
                            autoFocus
                            placeholder="골프장 명칭으로 검색 (예: 88CC, 세이지우드)"
                            className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-sm font-bold text-white focus:outline-none focus:border-[#64DD17]/50 transition-all placeholder:text-white/10"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSearch(searchQuery)}
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery("")}
                                className="absolute right-4 top-1/2 -translate-y-1/2 text-white/20 hover:text-white"
                                title="검색어 지우기"
                            >
                                <LucideX className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6 no-scrollbar">
                    {/* Recent Searches */}
                    {!searchQuery && results.length === 0 && !isSearching && (
                        <div className="space-y-8">
                            {recentSearches.length > 0 && (
                                <section>
                                    <div className="flex items-center gap-2 mb-4 text-white/20">
                                        <LucideHistory className="w-3.5 h-3.5" />
                                        <h3 className="text-[10px] font-black uppercase tracking-[0.2em]">최근 검색어</h3>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {recentSearches.map((s, i) => (
                                            <button
                                                key={i}
                                                onClick={() => handleSearch(s)}
                                                className="px-4 py-2 bg-white/5 border border-white/5 rounded-full text-xs font-bold text-white/60 hover:border-[#64DD17]/30 hover:text-white transition-all"
                                                title={`'${s}' 검색`}
                                            >
                                                {s}
                                            </button>
                                        ))}
                                    </div>
                                </section>
                            )}

                            <section>
                                <div className="flex items-center gap-2 mb-4 text-white/20">
                                    <LucideTrendingUp className="w-3.5 h-3.5" />
                                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em]">추천 골프장</h3>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    {["88CC", "세이지우드", "라비에벨", "안양CC"].map((s, i) => (
                                        <button
                                            key={i}
                                            onClick={() => handleSearch(s)}
                                            className="flex items-center justify-between p-4 bg-white/[0.03] border border-white/5 rounded-2xl text-left hover:border-[#64DD17]/30 transition-all group"
                                        >
                                            <span className="text-xs font-bold text-white/80">{s}</span>
                                            <LucideChevronRight className="w-4 h-4 text-white/10 group-hover:text-[#64DD17] group-hover:translate-x-1 transition-all" />
                                        </button>
                                    ))}
                                </div>
                            </section>
                        </div>
                    )}

                    {/* Searching State */}
                    {isSearching && (
                        <div className="h-full flex flex-col items-center justify-center space-y-4 opacity-40">
                            <div className="w-10 h-10 border-2 border-[#64DD17]/20 border-t-[#64DD17] rounded-full animate-spin" />
                            <p className="text-sm font-bold">전체 일정을 검색 중입니다...</p>
                        </div>
                    )}

                    {/* No Results */}
                    {!isSearching && searchQuery && results.length === 0 && (
                        <div className="h-40 flex flex-col items-center justify-center text-white/20 space-y-2">
                            <LucideSearch className="w-8 h-8 opacity-10" />
                            <span className="text-sm font-bold">검색 결과가 없습니다.</span>
                        </div>
                    )}

                    {/* Results Grouped by Date */}
                    {!isSearching && groupedResults.length > 0 && (
                        <div className="space-y-10">
                            {groupedResults.map(([date, bookings]) => (
                                <div key={date} className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <div className="w-1.5 h-1.5 rounded-full bg-[#64DD17]" />
                                            <h4 className="text-sm font-black text-white">{formatDate(date)}</h4>
                                        </div>
                                        <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest">{bookings.length}개 타임</span>
                                    </div>

                                    <div className="space-y-3">
                                        {bookings.map((item) => (
                                            <button
                                                key={item.id}
                                                onClick={() => onSelectBooking(item)}
                                                className="w-full bg-[#1A1A1A] border border-white/5 rounded-3xl p-5 flex items-center justify-between group active:scale-[0.98] transition-all text-left relative overflow-hidden"
                                            >
                                                {item.isHotDeal && (
                                                    <div className="absolute top-0 right-10 px-3 py-1 bg-[#FF6B00] text-[#FFFFFF] text-[8px] font-black uppercase tracking-tighter rounded-b-lg">
                                                        급구 핫딜
                                                    </div>
                                                )}
                                                <div className="flex items-center gap-4">
                                                    <div className="flex flex-col items-center justify-center w-12 h-12 rounded-2xl bg-white/5 border border-white/5 group-hover:border-[#64DD17]/30 transition-colors">
                                                        <div className="text-sm font-black text-white leading-none">
                                                            {new Date(item.datetime).getHours().toString().padStart(2, '0')}
                                                        </div>
                                                        <div className="text-[9px] font-bold text-[#64DD17] tracking-tighter">
                                                            {new Date(item.datetime).getMinutes().toString().padStart(2, '0')}
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <div className="text-sm font-black text-white group-hover:text-[#64DD17] transition-colors flex items-center gap-1.5">
                                                            {item.courseName || item.blindName}
                                                            {item.isBlind && <span className="text-[8px] px-1 bg-white/10 text-white/40 rounded italic font-bold">BLIND</span>}
                                                        </div>
                                                        <div className="flex items-center gap-2 mt-0.5">
                                                            <span className="text-[10px] font-bold text-white/30 uppercase tracking-tighter">
                                                                {item.region}
                                                            </span>
                                                            <div className="w-0.5 h-0.5 rounded-full bg-white/10" />
                                                            <span className="text-[10px] font-bold text-white/30 uppercase tracking-tighter">
                                                                {(item.options || []).includes('no_caddie') ? '노캐디' : '캐디'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <div className="text-right">
                                                        <div className="text-sm font-black text-white group-hover:text-[#64DD17] transition-colors">
                                                            {item.greenFee?.toLocaleString()}
                                                            <span className="text-[10px] ml-0.5 text-white/20 font-bold uppercase">원</span>
                                                        </div>
                                                    </div>
                                                    <div className="w-8 h-8 rounded-full bg-white/5 border border-white/5 flex items-center justify-center group-hover:bg-[#64DD17]/10 group-hover:border-[#64DD17]/20 transition-all">
                                                        <LucideChevronRight className="w-4 h-4 text-white/20 group-hover:text-[#64DD17]" />
                                                    </div>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="p-6 bg-gradient-to-t from-[#0A0A0A] to-transparent pointer-events-none">
                    <div className="bg-white/5 backdrop-blur-md rounded-2xl p-4 border border-white/5 pointer-events-auto">
                        <p className="text-[10px] font-bold text-white/40 leading-relaxed">
                            💡 검색 명칭을 정확하게 입력하시면 더 나은 결과를 얻을 수 있습니다. <br />
                            전체 예약 시스템의 데이터를 실시간으로 조회합니다.
                        </p>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
