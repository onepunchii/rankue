import { useQuery } from "@tanstack/react-query";
import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { LucideTrophy, ChevronRight, LucideCalendar, LucideUsers, LucideCoins, MapPin, Search, LucideFlag } from "lucide-react";
import { HiqTournament } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useSport } from "@/contexts/SportContext";

// Extended interface
interface TournamentWithStore extends HiqTournament {
    storeName: string;
    storeRegion: string;
}

export function TournamentBanner() {
    const { data: rawTournaments, isLoading } = useQuery<TournamentWithStore[]>({
        queryKey: ["/api/hiq/tournaments/active"]
    });
    const { currentSport } = useSport();

    // Sort & Filter State
    const [sort, setSort] = useState<'imminent' | 'prize' | 'newest'>('imminent');
    const [filterGame, setFilterGame] = useState<'all' | '3c' | '4c'>('all');
    const [filterRegion, setFilterRegion] = useState('all');
    const [searchQuery, setSearchQuery] = useState("");

    const [index, setIndex] = useState(0);
    const [isAllOpen, setIsAllOpen] = useState(false);
    const [selectedTournament, setSelectedTournament] = useState<TournamentWithStore | null>(null);

    // Auto cycle banner
    useEffect(() => {
        if (!rawTournaments || rawTournaments.length <= 1) return;
        const timer = setInterval(() => {
            setIndex(prev => (prev + 1) % rawTournaments.length);
        }, 5000);
        return () => clearInterval(timer);
    }, [rawTournaments]);

    // Derived Logic
    const regions = useMemo(() => {
        if (!rawTournaments) return [];
        const unique = new Set(rawTournaments.map(t => t.storeRegion));
        return Array.from(unique).filter(Boolean).sort();
    }, [rawTournaments]);

    const filteredTournaments = useMemo(() => {
        if (!rawTournaments) return [];

        let result = rawTournaments.filter(t => {
            // Sport Category
            if (t.sportCategory !== (currentSport as any)) return false;

            // Game Type
            if (filterGame !== 'all' && t.gameType !== filterGame) return false;
            // Region
            if (filterRegion !== 'all' && t.storeRegion !== filterRegion) return false;
            // Search
            if (searchQuery && !t.title.includes(searchQuery) && !t.storeName.includes(searchQuery)) return false;

            return true;
        });

        // Sorting
        result.sort((a, b) => {
            if (sort === 'imminent') {
                // Deadline asc
                const endA = new Date(a.recruitEnd || a.startDate).getTime();
                const endB = new Date(b.recruitEnd || b.startDate).getTime();
                return endA - endB;
            }
            if (sort === 'prize') {
                const getPrize = (obj: any) => parseInt((obj?.first || "0").replace(/[^0-9]/g, '')) || 0;
                return getPrize(b.prizes) - getPrize(a.prizes);
            }
            if (sort === 'newest') {
                return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
            }
            return 0;
        });

        return result;
    }, [rawTournaments, filterGame, filterRegion, sort, searchQuery, currentSport]);

    if (isLoading || !filteredTournaments || filteredTournaments.length === 0) return null;
    const current = filteredTournaments[index % filteredTournaments.length];

    return (
        <div className="mb-8 relative z-10">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-black text-white/30 tracking-[0.3em] uppercase">Active Tournaments</h3>
                <button onClick={() => setIsAllOpen(true)} className="text-[10px] bg-white/5 px-3 py-1.5 rounded-full text-white/50 hover:text-white hover:bg-white/10 transition-colors font-bold flex items-center gap-1">
                    전체보기 <ChevronRight className="w-3 h-3" />
                </button>
            </div>

            <div className="relative h-[88px] px-0.5">
                <AnimatePresence mode="popLayout">
                    <motion.div
                        key={current.id}
                        initial={{ opacity: 0, x: 50 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -50 }}
                        transition={{ duration: 0.4, ease: "easeInOut" }}
                        className={cn(
                            "rounded-2xl p-4 absolute inset-x-0.5 inset-y-0 cursor-pointer overflow-hidden group transition-all border",
                            (currentSport as string) === "GOLF"
                                ? "bg-gradient-to-r from-[#064e3b]/80 to-black border-[#84cc16]/30 hover:border-[#84cc16]/50 shadow-[0_10px_30px_rgba(0,0,0,0.3)]"
                                : "bg-gradient-to-r from-yellow-900/40 to-black border-yellow-500/30 hover:border-yellow-500/50"
                        )}
                        onClick={() => setSelectedTournament(current)}
                    >
                        {/* Glow Effect */}
                        <div className={cn(
                            "absolute -right-10 -top-10 w-32 h-32 rounded-full blur-3xl transition-all",
                            (currentSport as string) === "GOLF" ? "bg-[#84cc16]/10 group-hover:bg-[#84cc16]/20" : "bg-yellow-500/10 group-hover:bg-yellow-500/20"
                        )} />

                        <div className="flex items-center gap-4 relative z-10 h-full">
                            {/* Icon Box */}
                            <div className={cn(
                                "w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border transition-all",
                                (currentSport as string) === "GOLF"
                                    ? "bg-[#84cc16]/10 border-[#84cc16]/20 group-hover:scale-110"
                                    : "bg-yellow-500/10 border-yellow-500/20"
                            )}>
                                {(currentSport as string) === "GOLF" ? (
                                    <LucideFlag className="w-5 h-5 text-[#84cc16]" />
                                ) : (
                                    <LucideTrophy className="w-5 h-5 text-yellow-500" />
                                )}
                            </div>

                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className={cn(
                                        "text-[10px] font-bold px-1.5 py-0.5 rounded",
                                        (currentSport as string) === "GOLF"
                                            ? "bg-[#84cc16]/10 text-[#84cc16]"
                                            : current.gameType === '3c' ? 'bg-orange-500/10 text-orange-400' : 'bg-blue-500/10 text-blue-400'
                                    )}>
                                        {(currentSport as string) === "GOLF" ? "G-Classic" : (current.gameType === '3c' ? "3-Cushion" : "4-Ball")}
                                    </span>
                                    <span className={cn(
                                        "text-[10px] font-bold flex items-center gap-1",
                                        (currentSport as string) === "GOLF" ? "text-white" : "text-yellow-500"
                                    )}>
                                        <span className={cn(
                                            "w-1.5 h-1.5 rounded-full animate-pulse",
                                            (currentSport as string) === "GOLF" ? "bg-[#84cc16] shadow-[0_0_8px_#84cc16]" : "bg-yellow-500"
                                        )} />
                                        {current.status === 'recruiting' ? '접수중' : '진행중'}
                                    </span>
                                </div>
                                <h4 className="text-base font-bold text-white truncate leading-tight group-hover:text-[#84cc16] transition-colors">{current.title}</h4>
                                <p className="text-xs text-white/50 truncate mt-0.5 flex items-center gap-2">
                                    <span>{new Date(current.startDate).toLocaleDateString()}</span>
                                    <span className="w-0.5 h-2 bg-white/20" />
                                    <span>{current.storeRegion}</span>
                                </p>
                            </div>
                            <ChevronRight className="w-5 h-5 text-white/20 group-hover:text-white/60 transition-colors" />
                        </div>
                    </motion.div>
                </AnimatePresence>
            </div>

            {/* View All Dialog with Filters */}
            <Dialog open={isAllOpen} onOpenChange={setIsAllOpen}>
                <DialogContent className="bg-[#0A0A0A] border-white/10 text-white max-w-sm h-[85vh] w-[95%] rounded-3xl p-0 flex flex-col overflow-hidden">
                    <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
                        <DialogTitle className="text-lg font-bold">전체 대회 ({filteredTournaments.length})</DialogTitle>
                        {/* Search Bar */}
                        <div className="relative mt-2">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                            <Input
                                className="bg-white/5 border-white/10 pl-9 rounded-xl h-9 text-xs"
                                placeholder="대회명 또는 매장명 검색..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                    </DialogHeader>

                    {/* Filters & Sort Section */}
                    <div className="px-6 py-4 space-y-5 shrink-0 border-b border-white/5 bg-black/40">
                        {/* 1. Sort Tabs - Premium Style */}
                        <div className="flex items-center gap-6 px-1">
                            {[
                                { id: 'imminent', label: '마감임박' },
                                { id: 'prize', label: '상금순' },
                                { id: 'newest', label: '최신순' }
                            ].map((item) => (
                                <button
                                    key={item.id}
                                    onClick={() => setSort(item.id as any)}
                                    className="group relative pb-1"
                                >
                                    <span className={cn(
                                        "text-xs font-black tracking-tight transition-all",
                                        sort === item.id ? "text-white" : "text-white/20 group-hover:text-white/50"
                                    )}>
                                        {item.label}
                                    </span>
                                    {sort === item.id && (
                                        <motion.div
                                            layoutId="sort-active-bar"
                                            className="absolute -bottom-0.5 left-0 right-0 h-[3px] bg-emerald-500 rounded-full shadow-[0_0_10px_rgba(16,185,129,0.5)]"
                                        />
                                    )}
                                </button>
                            ))}
                        </div>

                        {/* 2. Filter Chips (Horizontal Scroll) - Hide Game Type Filter for Golf */}
                        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide -mx-6 px-6">
                            {currentSport !== "GOLF" && (
                                <>
                                    <Badge
                                        variant="outline"
                                        className={`cursor-pointer whitespace-nowrap ${filterGame === 'all' ? 'bg-white text-black border-white' : 'text-white/60 border-white/10'}`}
                                        onClick={() => setFilterGame('all')}
                                    >
                                        전체
                                    </Badge>
                                    <Badge
                                        variant="outline"
                                        className={`cursor-pointer whitespace-nowrap ${filterGame === '3c' ? 'bg-orange-500 text-black border-orange-500' : 'text-white/60 border-white/10'}`}
                                        onClick={() => setFilterGame('3c')}
                                    >
                                        3쿠션
                                    </Badge>
                                    <Badge
                                        variant="outline"
                                        className={`cursor-pointer whitespace-nowrap ${filterGame === '4c' ? 'bg-blue-500 text-white border-blue-500' : 'text-white/60 border-white/10'}`}
                                        onClick={() => setFilterGame('4c')}
                                    >
                                        4구
                                    </Badge>
                                    <div className="w-px h-6 bg-white/10 shrink-0" />
                                </>
                            )}

                            <Badge
                                variant="outline"
                                className={`cursor-pointer whitespace-nowrap ${filterRegion === 'all' ? 'bg-white text-black border-white' : 'text-white/60 border-white/10'}`}
                                onClick={() => setFilterRegion('all')}
                            >
                                전국
                            </Badge>
                            {regions.map(region => (
                                <Badge
                                    key={region}
                                    variant="outline"
                                    className={`cursor-pointer whitespace-nowrap ${filterRegion === region ? 'bg-emerald-500 text-black border-emerald-500' : 'text-white/60 border-white/10'}`}
                                    onClick={() => setFilterRegion(region)}
                                >
                                    {region}
                                </Badge>
                            ))}
                        </div>
                    </div>

                    {/* Result List */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-3">
                        {filteredTournaments.length === 0 ? (
                            <div className="h-40 flex items-center justify-center text-white/30 text-xs">
                                조건에 맞는 대회가 없습니다.
                            </div>
                        ) : (
                            filteredTournaments.map(t => (
                                <div key={t.id} onClick={() => { setSelectedTournament(t); }} className="p-4 bg-white/5 rounded-2xl border border-white/5 hover:bg-white/10 cursor-pointer transition-colors space-y-3 relative group">
                                    <div className="flex justify-between items-start">
                                        <div className="flex items-center gap-2">
                                            <Badge className={t.gameType === '3c' ? 'bg-orange-500/20 text-orange-400 hover:bg-orange-500/20' : 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/20'}>
                                                {t.gameType === '3c' ? '3C' : '4B'}
                                            </Badge>
                                            <span className="text-[10px] text-white/50 flex items-center gap-1">
                                                <MapPin className="w-3 h-3" /> {t.storeRegion}
                                            </span>
                                        </div>
                                        <span className={`text-[10px] font-bold ${t.status === 'recruiting' ? 'text-emerald-500' : 'text-white/40'}`}>
                                            {t.status === 'recruiting' ? 'D-Day Calculating...' : t.status === 'ongoing' ? '진행중' : '준비중'}
                                        </span>
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-white text-base leading-tight">{t.title}</h4>
                                        <p className="text-xs text-white/50 mt-1">{t.storeName}</p>
                                    </div>
                                    <div className="flex items-center gap-4 text-xs pt-2 border-t border-white/5 text-white/70">
                                        <span className="font-bold text-[#ffd700]">1등 {(t.prizes as any)?.first}</span>
                                        <span>마감 {new Date(t.recruitEnd || t.startDate).toLocaleDateString()}</span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            {/* Detail Dialog */}
            <Dialog open={!!selectedTournament} onOpenChange={(open) => {
                if (!open) {
                    setSelectedTournament(null);
                    // Keep parent open if it was opening from list? No, keep logic simple first.
                }
            }}>
                <DialogContent className="bg-[#0A0A0A] border-white/10 text-white max-w-sm max-h-[90vh] overflow-y-auto w-[90%] rounded-3xl p-0 overflow-hidden">
                    {selectedTournament && (
                        <div>
                            {/* Header Image / Pattern */}
                            <div className="h-32 bg-gradient-to-br from-emerald-900 to-black relative">
                                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-emerald-500/20 via-transparent to-transparent" />
                                <div className="absolute bottom-4 left-6">
                                    <div className="flex gap-2 mb-2">
                                        <Badge className="bg-black/40 backdrop-blur border-emerald-500/30 text-emerald-400 hover:bg-black/40">
                                            {selectedTournament.gameType === '3c' ? '3-Cushion' : '4-Ball'}
                                        </Badge>
                                        <Badge className="bg-black/40 backdrop-blur border-white/10 text-white/60 hover:bg-black/40">
                                            {selectedTournament.storeRegion}
                                        </Badge>
                                    </div>
                                    <h2 className="text-xl font-black text-white leading-tight">{selectedTournament.title}</h2>
                                    <p className="text-xs text-white/50 mt-1 flex items-center gap-1">
                                        <MapPin className="w-3 h-3" /> {selectedTournament.storeName}
                                    </p>
                                </div>
                            </div>

                            <div className="p-6 space-y-6">
                                {/* Rule Grid */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                                        <span className="text-[10px] text-white/40 block mb-1">진행 방식</span>
                                        <span className="font-bold text-sm">
                                            {selectedTournament.matchMethod === 'handicap'
                                                ? `핸디캡 ${selectedTournament.handicapRate}%`
                                                : `점수제 ${selectedTournament.targetScore}점`}
                                        </span>
                                    </div>
                                    <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                                        <span className="text-[10px] text-white/40 block mb-1">뱅크샷 / 시간</span>
                                        <span className="font-bold text-sm">{selectedTournament.bankShotPoint}점 / {selectedTournament.timeLimit}분</span>
                                    </div>
                                </div>

                                {/* Info List */}
                                <div className="space-y-4 text-sm">
                                    <div className="flex items-center justify-between py-2 border-b border-white/5">
                                        <span className="text-white/40">일시</span>
                                        <span className="font-bold">{new Date(selectedTournament.startDate).toLocaleString()}</span>
                                    </div>
                                    <div className="flex items-center justify-between py-2 border-b border-white/5">
                                        <span className="text-white/40">참가 마감</span>
                                        <span className="font-bold text-red-400">{new Date(selectedTournament.recruitEnd || "").toLocaleString()}</span>
                                    </div>
                                    <div className="flex items-center justify-between py-2 border-b border-white/5">
                                        <span className="text-white/40">모집 인원</span>
                                        <span className="font-bold">{selectedTournament.maxPlayers}강</span>
                                    </div>
                                    <div className="flex items-center justify-between py-2 border-b border-white/5">
                                        <span className="text-white/40">참가비</span>
                                        <span className="font-bold text-[#ffd700]">{selectedTournament.entryFee?.toLocaleString()}원</span>
                                    </div>
                                    <div className="py-2">
                                        <span className="text-white/40 block mb-2">상금</span>
                                        <div className="bg-white/5 rounded-xl p-3 space-y-2">
                                            <div className="flex justify-between">
                                                <span className="text-gray-400">1등</span>
                                                <span className="font-bold text-[#ffd700]">{(selectedTournament.prizes as any)?.first}</span>
                                            </div>
                                            {(selectedTournament.prizes as any)?.second && (
                                                <div className="flex justify-between text-xs">
                                                    <span className="text-gray-500">2등</span>
                                                    <span className="text-gray-300">{(selectedTournament.prizes as any)?.second}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Action */}
                                <div className="pt-2">
                                    <Button className="w-full h-12 bg-emerald-500 hover:bg-emerald-600 text-black font-bold text-lg rounded-xl shadow-[0_0_20px_rgba(16,185,129,0.3)]">
                                        참가 신청하기
                                    </Button>
                                    <button onClick={() => setSelectedTournament(null)} className="w-full h-10 mt-2 text-xs text-white/40 font-bold hover:text-white">
                                        닫기
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
