import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { HiqNavigation } from "@/components/hiq/HiqNavigation";
import { apiRequest } from "@/lib/queryClient";
import {
    LucideTent,
    LucidePlus,
    LucideSearch,
    LucideTrophy,
    LucideCrown,
    LucideStar,
    LucideZap,
    LucideTarget,
    LucideSwords,
    LucideFlag,
    LucideUsers,
    LucideGhost,
    LucideSmile,
    LucideChevronRight,
    LucideMapPin
} from "lucide-react";
import { HiqCrew } from "@shared/schema";
import { useSport } from "@/contexts/SportContext";
import { cn } from "@/lib/utils";

const EMBLEM_MAP: Record<string, any> = {
    trophy: { icon: LucideTrophy, color: "text-yellow-400" },
    crown: { icon: LucideCrown, color: "text-orange-400" },
    star: { icon: LucideStar, color: "text-purple-400" },
    zap: { icon: LucideZap, color: "text-blue-400" },
    target: { icon: LucideTarget, color: "text-red-400" },
    swords: { icon: LucideSwords, color: "text-slate-400" },
    flag: { icon: LucideFlag, color: "text-green-400" },
    tent: { icon: LucideTent, color: "text-emerald-400" },
    users: { icon: LucideUsers, color: "text-pink-400" },
    ghost: { icon: LucideGhost, color: "text-indigo-400" },
    smile: { icon: LucideSmile, color: "text-cyan-400" },
};

interface HiqCrewWithCount extends HiqCrew {
    memberCount?: number;
}

export default function HiqClub() {
    const [_, setLocation] = useLocation();
    const [searchQuery, setSearchQuery] = useState("");
    const { currentSport } = useSport();

    const { data: myCrews, isLoading: myCrewsLoading } = useQuery<any[]>({
        queryKey: ["/api/hiq/crews/mine", currentSport],
        queryFn: async () => await apiRequest(`/api/hiq/crews/mine?sport=${currentSport}`)
    });

    const { data: allCrews, isLoading: allCrewsLoading } = useQuery<HiqCrewWithCount[]>({
        queryKey: ["/api/hiq/crews", searchQuery, currentSport],
        queryFn: async () => await apiRequest(`/api/hiq/crews?q=${searchQuery}&sport=${currentSport}`),
    });

    return (
        <div className="min-h-screen bg-[#0A0A0A] text-white font-sans pb-24 relative overflow-hidden">
            {/* Background Gradients */}
            <div className="fixed inset-0 pointer-events-none">
                <div className={cn(
                    "absolute top-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full blur-[120px]",
                    currentSport === "GOLF" ? "bg-[#84cc16]/5" : "bg-emerald-500/5"
                )} />
                <div className={cn(
                    "absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] rounded-full blur-[120px]",
                    currentSport === "GOLF" ? "bg-[#84cc16]/5" : "bg-emerald-500/5"
                )} />
            </div>

            <div className="relative z-10 max-w-md mx-auto px-6 pt-12">
                {/* Header (Design Guide 4.1: Pairings) */}
                <header className="mb-10 flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold text-white tracking-tight">크루</h1>
                        <p className={cn(
                            "font-medium text-xs tracking-widest mt-0.5 opacity-80 uppercase",
                            currentSport === "GOLF" ? "text-[#84cc16]" : "text-[#10B981]"
                        )}>
                            CLUB & COMMUNITY
                        </p>
                    </div>
                </header>

                <div className="space-y-10">
                    {/* My Crews (Bento / Design Guide 3.2, 5.1) */}
                    <section>
                        <div className="flex items-end justify-between mb-5">
                            <h2 className="text-xl font-bold text-white">내 크루</h2>
                            <Button
                                variant="ghost"
                                className={cn(
                                    "h-auto p-0 text-xs font-medium hover:bg-transparent",
                                    currentSport === "GOLF" ? "text-[#84cc16] hover:text-[#84cc16]/80" : "text-[#10B981] hover:text-[#10B981]/80"
                                )}
                                onClick={() => setLocation("/club/create")}
                            >
                                + 만들기
                            </Button>
                        </div>

                        {myCrewsLoading ? (
                            <div className="h-48 bg-white/5 rounded-[2.5rem] animate-pulse" />
                        ) : myCrews && myCrews.length > 0 ? (
                            <div className="grid grid-cols-1 gap-4">
                                {myCrews.map(({ crew, role }) => {
                                    const EmblemIcon = EMBLEM_MAP[crew.emblem || "trophy"]?.icon || LucideTrophy;
                                    const emblemColor = EMBLEM_MAP[crew.emblem || "trophy"]?.color || "text-yellow-400";

                                    return (
                                        <Card
                                            key={crew.id}
                                            className="rounded-[2.5rem] bg-[#141414] border-white/5 cursor-pointer hover:bg-white/5 transition-all duration-300 group overflow-hidden relative"
                                            onClick={() => setLocation(`/club/${crew.id}`)}
                                        >
                                            <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                            <CardContent className="p-6 flex items-center gap-5 relative z-10">
                                                <div className="w-16 h-16 rounded-full bg-black/40 border border-white/5 flex items-center justify-center shrink-0 shadow-inner">
                                                    <EmblemIcon className={`w-8 h-8 ${emblemColor}`} />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <h3 className="font-bold text-lg text-white truncate">{crew.name}</h3>
                                                        {role === 'leader' && <LucideCrown className="w-4 h-4 text-orange-400" />}
                                                    </div>
                                                    <div className="flex items-center gap-2 text-white/40 text-sm">
                                                        <span className="bg-white/5 px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wide">
                                                            {role === 'leader' ? 'LEADER' : 'MEMBER'}
                                                        </span>
                                                        <span className="w-1 h-1 rounded-full bg-white/20" />
                                                        <div className="flex items-center gap-1 text-xs text-white/40">
                                                            <LucideUsers className="w-3 h-3" />
                                                            <span>{crew.memberCount || 1} / {crew.maxMembers || 50}명</span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <LucideChevronRight className="w-6 h-6 text-white/10 group-hover:text-white/40 transition-colors" />
                                            </CardContent>
                                        </Card>
                                    );
                                })}
                            </div>
                        ) : (
                            <Card className="rounded-[2.5rem] bg-[#141414] border-white/5 overflow-hidden">
                                <CardContent className="flex flex-col items-center justify-center py-12 text-center space-y-4 relative">
                                    <div className={cn(
                                        "absolute inset-0 bg-gradient-to-t to-transparent pointer-events-none",
                                        currentSport === "GOLF" ? "from-[#84cc16]/5" : "from-[#10B981]/5"
                                    )} />
                                    <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-2 animate-bounce-slow">
                                        <LucideTent className={cn("w-8 h-8 text-white/20", currentSport === "GOLF" && "text-[#84cc16]/40")} />
                                    </div>
                                    <div className="relative z-10">
                                        <p className="text-white font-bold text-lg mb-1">크루가 없으신가요?</p>
                                        <p className="text-white/40 text-sm">새로운 크루를 만들어 시작해보세요</p>
                                    </div>
                                    <Button
                                        className={cn(
                                            "mt-4 text-black font-bold rounded-full px-8 py-6 h-auto text-base transition-all",
                                            currentSport === "GOLF"
                                                ? "bg-[#84cc16] hover:bg-[#a3e635] shadow-[0_0_20px_rgba(132,204,22,0.3)] hover:shadow-[0_0_30px_rgba(132,204,22,0.5)]"
                                                : "bg-[#10B981] hover:bg-[#059669] shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:shadow-[0_0_30px_rgba(16,185,129,0.5)]"
                                        )}
                                        onClick={() => setLocation("/club/create")}
                                    >
                                        <LucidePlus className="w-5 h-5 mr-2" />
                                        크루 개설하기
                                    </Button>
                                </CardContent>
                            </Card>
                        )}
                    </section>

                    {/* Search & Find (Design Guide 4.3: Input Fields) */}
                    <section>
                        <div className="mb-6">
                            <h2 className="text-xl font-bold text-white mb-6">둘러보기</h2>
                            <div className="relative group">
                                <LucideSearch className={cn(
                                    "absolute left-0 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40 transition-colors duration-300",
                                    currentSport === "GOLF" ? "group-focus-within:text-[#84cc16]" : "group-focus-within:text-[#10B981]"
                                )} />
                                <input
                                    type="text"
                                    placeholder="크루 이름 또는 지역 검색..."
                                    className={cn(
                                        "w-full bg-transparent border-b-2 border-white/10 rounded-none py-3 pl-8 pr-4 text-base text-white focus:outline-none transition-all duration-300 placeholder:text-white/20",
                                        currentSport === "GOLF" ? "focus:border-[#84cc16]" : "focus:border-[#10B981]"
                                    )}
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="space-y-4">
                            {allCrewsLoading ? (
                                [1, 2].map(i => (
                                    <div key={i} className="h-24 bg-white/5 rounded-[2rem] animate-pulse" />
                                ))
                            ) : allCrews && allCrews.length > 0 ? (
                                allCrews.map(crew => {
                                    const EmblemIcon = EMBLEM_MAP[crew.emblem || "trophy"]?.icon || LucideTrophy;
                                    const emblemColor = EMBLEM_MAP[crew.emblem || "trophy"]?.color || "text-yellow-400";

                                    return (
                                        <div
                                            key={crew.id}
                                            className="group relative overflow-hidden rounded-[2rem] bg-[#141414] border border-white/5 cursor-pointer hover:border-white/10 transition-all duration-300"
                                            onClick={() => setLocation(`/club/${crew.id}`)}
                                        >
                                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-white/5 opacity-0 group-hover:opacity-100 transition-opacity transform skew-x-12" />

                                            <div className="p-5 flex items-center gap-5 relative z-10">
                                                <div className="w-14 h-14 rounded-2xl bg-black/40 flex items-center justify-center shrink-0 border border-white/5">
                                                    <EmblemIcon className={`w-7 h-7 ${emblemColor}`} />
                                                </div>

                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center justify-between mb-1.5">
                                                        <h3 className={cn(
                                                            "font-bold text-base text-white truncate transition-colors",
                                                            currentSport === "GOLF" ? "group-hover:text-[#84cc16]" : "group-hover:text-[#10B981]"
                                                        )}>
                                                            {crew.name}
                                                        </h3>
                                                        <span className={cn(
                                                            "text-[10px] font-bold px-2.5 py-1 rounded-full border",
                                                            currentSport === "GOLF"
                                                                ? "border-emerald-500/20 text-[#84cc16] bg-emerald-500/10"
                                                                : (crew.gameType === '3c'
                                                                    ? 'border-yellow-500/20 text-yellow-500 bg-yellow-500/10'
                                                                    : 'border-blue-500/20 text-blue-500 bg-blue-500/10')
                                                        )}>
                                                            {currentSport === "GOLF"
                                                                ? (crew.gameType === 'field' ? 'FIELD' : crew.gameType === 'screen' ? 'SCREEN' : crew.gameType === 'range' ? 'RANGE' : 'ALL')
                                                                : (crew.gameType === '3c' ? '3-CUSHION' : crew.gameType === '4c' ? '4-BALL' : 'ALL')}
                                                        </span>
                                                    </div>

                                                    <p className="text-sm text-white/80 line-clamp-1 mb-2 font-medium">
                                                        {crew.shortIntro || crew.description || "당점 하이큐 크루입니다."}
                                                    </p>

                                                    <div className="flex items-center gap-3 text-xs text-white/30">
                                                        {crew.region && (
                                                            <div className="flex items-center gap-1">
                                                                <LucideMapPin className="w-3 h-3" />
                                                                <span>{crew.region}</span>
                                                            </div>
                                                        )}
                                                        <div className="flex items-center gap-1">
                                                            <LucideUsers className="w-3 h-3" />
                                                            <span>{crew.memberCount || 1} / {crew.maxMembers || 50}명 정원</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            ) : (
                                <div className="py-20 flex flex-col items-center justify-center text-center opacity-40">
                                    <LucideSearch className="w-12 h-12 mb-4 text-white/20" />
                                    <p className="text-white/60">검색 결과가 없습니다</p>
                                </div>
                            )}
                        </div>
                    </section>
                </div>
            </div>

            <HiqNavigation />
        </div>
    );
}
