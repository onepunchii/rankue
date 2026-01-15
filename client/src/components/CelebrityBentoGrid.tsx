import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import { DotLottieReact } from '@lottiefiles/dotlottie-react';
import { ArrowRight, Star, PlusCircle } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

interface Category {
    id: number;
    name: string;
}

interface Artist {
    id: number;
    name: string;
    categoryId: number;
    currentMonthVotes: number;
}

/**
 * 인물배틀을 위한 벤토 그리드 스타일 섹션
 */
export default function CelebrityBentoGrid() {
    const [, setLocation] = useLocation();
    const [currentWinnerIndex, setCurrentWinnerIndex] = useState(0);

    // 실제 데이터 페칭
    const { data: categories = [] } = useQuery<Category[]>({
        queryKey: ["/api/celebrities/categories"],
        queryFn: async () => {
            const res = await fetch("/api/celebrities/categories");
            if (!res.ok) throw new Error("Failed to fetch categories");
            const json = await res.json();
            // Server returns { success: true, data: { categories: string[], ... } }
            // Assuming the component expects [{ id: 1, name: 'cat' }] but server returns strings.
            // Let's adapt it to match the interface or change interface if needed.
            // Based on server code: res.json({ categories: string[], ... });
            // Wait, server code was: return sendSuccess(res, { categories, genders, types });
            // So json.data.categories is string[].
            // We need to map string[] to Category[] interface { id: number, name: string }
            const categoryNames: string[] = json.data?.categories || [];
            return categoryNames.map((name, idx) => ({ id: idx, name }));
        }
    });

    const { data: allArtists = [], isLoading } = useQuery<Artist[]>({
        queryKey: ["/api/celebrities/by-category"],
        queryFn: async () => {
            const res = await fetch("/api/celebrities/by-category"); // No category param = get all
            if (!res.ok) throw new Error("Failed to fetch artists");
            const json = await res.json();
            return Array.isArray(json.data) ? json.data : [];
        }
    });

    // 각 카테고리별 1위 추출
    const winners = useMemo(() => {
        if (!categories.length || !allArtists.length) return [];

        return categories.map(cat => {
            // Server returns string categories like 'actor_male', frontend maps them to { id, name }
            // Artist object from server has 'category' string field.
            const topArtist = allArtists
                .filter(a => (a as any).category === cat.name) // Type assertion until interface is updated
                .sort((a, b) => (b.currentMonthVotes || 0) - (a.currentMonthVotes || 0))[0];

            return {
                categoryId: cat.id,
                categoryName: cat.name,
                winner: topArtist ? topArtist.name : "투표 대기중",
                votes: topArtist ? topArtist.currentMonthVotes : 0
            };
        }).filter(w => w.winner !== "투표 대기중"); // 데이터 있는 것만 표시
    }, [categories, allArtists]);

    // 전체 참여자 수 계산
    const totalParticipation = useMemo(() => {
        return allArtists.reduce((sum, artist) => sum + (artist.currentMonthVotes || 0), 0);
    }, [allArtists]);

    useEffect(() => {
        if (winners.length <= 1) return;

        const timer = setInterval(() => {
            setCurrentWinnerIndex((prev) => (prev + 1) % winners.length);
        }, 3000);
    }, [winners]);

    const currentWinner = winners[currentWinnerIndex] || { categoryName: "인기투표", winner: "로딩중..." };

    if (isLoading && !winners.length) {
        return (
            <section className="px-4 mb-6">
                <div className="col-span-2 glass-card p-12 flex items-center justify-center border border-white/5 bg-white/5 rounded-3xl">
                    <div className="w-6 h-6 border-2 border-white/20 border-t-white/80 rounded-full animate-spin"></div>
                </div>
            </section>
        );
    }

    return (
        <section className="px-4 mb-6">
            <div className="grid grid-cols-2 gap-3">

                {/* 1. 상단 통합 메인 카드 - 랭킹 + NO.1 (전체 너비 차지) */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="col-span-2 glass-card p-6 relative overflow-hidden border border-white/10 bg-gradient-to-br from-indigo-900/10 via-black/40 to-black/40 backdrop-blur-xl rounded-[2rem] group cursor-pointer transition-all duration-500"
                    onClick={() => setLocation('/celebrity-ranking')}
                >
                    <div className="relative z-10 flex items-center justify-between gap-4 h-full">
                        {/* 좌측: 타이틀 및 랭킹 정보 */}
                        <div className="flex-1 flex flex-col justify-between h-full">
                            <div>
                                <div className="flex items-center gap-2 mb-4">
                                    <div className="bg-white/5 px-3 py-1 rounded-full border border-white/10 backdrop-blur-md">
                                        <span className="text-[10px] font-black text-white/40 uppercase tracking-widest leading-none">
                                            {totalParticipation.toLocaleString()}명 참여중
                                        </span>
                                    </div>
                                </div>

                                <h3 className="text-xl font-black text-white mb-2 leading-tight tracking-tight">
                                    {new Date().getMonth() + 1}월 실시간 인기 투표
                                </h3>
                                <p className="text-sm text-white/20 font-medium max-w-[200px]">
                                    당신의 최애에게 투표하고<br />랭킹을 확인하세요!
                                </p>
                            </div>

                            <div className="mt-6 flex items-center gap-2 text-white/40 font-bold group-hover:translate-x-1 transition-transform">
                                <span className="text-xs uppercase tracking-widest font-black">투표 랭킹 보기</span>
                                <ArrowRight className="w-4 h-4" />
                            </div>
                        </div>

                        {/* 우측: 현재 1위 스택 */}
                        <div className="w-[140px] flex flex-col items-center justify-center">
                            {/* 고정된 트로피 애니메이션 */}
                            <div className="w-32 h-32 -mt-8 mb-2 opacity-60 pointer-events-none group-hover:scale-110 transition-transform duration-700">
                                <DotLottieReact
                                    src="https://lottie.host/24b5fce5-0fbe-468c-b810-9c09bc0c0cb8/McmjGZ3gRd.lottie"
                                    loop
                                    autoplay
                                    className="w-full h-full"
                                />
                            </div>

                            <AnimatePresence mode="wait">
                                <motion.div
                                    key={currentWinnerIndex}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    transition={{ duration: 0.4 }}
                                    className="flex flex-col items-center text-center w-full"
                                >
                                    <div className="text-lg font-black text-white truncate leading-none mb-2 w-full">
                                        {currentWinner.winner}
                                    </div>

                                    <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-500/10 border border-amber-500/20 rounded-full">
                                        <motion.div
                                            animate={{ rotate: 360 }}
                                            transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                                        >
                                            <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                                        </motion.div>
                                        <span className="text-[10px] text-amber-500 font-black uppercase tracking-tighter italic">
                                            NO.1 {currentWinner.categoryName.replace('아이돌', 'IDOL')}
                                        </span>
                                    </div>

                                    {/* Progress Bar */}
                                    <div className="w-12 h-[2px] bg-white/5 rounded-full mt-3 overflow-hidden">
                                        <motion.div
                                            key={currentWinnerIndex}
                                            initial={{ width: "0%" }}
                                            animate={{ width: "100%" }}
                                            transition={{ duration: 3, ease: "linear" }}
                                            className="h-full bg-amber-500"
                                        />
                                    </div>
                                </motion.div>
                            </AnimatePresence>
                        </div>
                    </div>
                </motion.div>


            </div>
        </section>
    );
}
