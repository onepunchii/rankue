import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { DotLottieReact } from '@lottiefiles/dotlottie-react';
import { ArrowRight, Users, TrendingUp, MapPin } from "lucide-react";
import PartyLogo from "@/components/PartyLogo";

interface BentoGridSectionProps {
    assemblyDashboard?: any;
    localCouncilStats?: any;
}

/**
 * 벤토 그리드 스타일의 메인 대시보드 섹션
 * 참조: 대형 폐기물 UI의 깔끔한 레이아웃
 */
export default function BentoGridSection({ assemblyDashboard, localCouncilStats }: BentoGridSectionProps) {
    const [, setLocation] = useLocation();

    return (
        <section className="px-4 mb-6">
            <div className="grid grid-cols-3 gap-3">

                {/* 1. 좌측 메인 카드 - 국정 여론조사 (2x2) */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="col-span-2 row-span-2 glass-card p-6 relative overflow-hidden border border-white/10 bg-gradient-to-br from-purple-900/30 via-black/40 to-black/40 backdrop-blur-xl rounded-3xl group hover:scale-[1.01] transition-transform duration-300 cursor-pointer"
                    onClick={() => setLocation('/category/politics')}
                >
                    <div className="absolute inset-0 opacity-20 pointer-events-none">
                        <DotLottieReact
                            src="https://lottie.host/456c6520-d460-4ae7-bf61-d44160c0da9e/4vOdjbbENt.lottie"
                            loop
                            autoplay
                            className="w-full h-full object-contain"
                            style={{ filter: 'sepia(1) hue-rotate(240deg) saturate(5) brightness(1.2)' }}
                        />
                    </div>
                    <div className="absolute -right-10 -top-10 w-40 h-40 bg-purple-500/20 rounded-full blur-3xl pointer-events-none" />
                    <div className="relative z-10 h-full flex flex-col justify-between">
                        <div>
                            <div className="mb-8" />
                            <h3 className="text-2xl font-black text-white mb-2 leading-tight">이번 주<br />국정 여론조사</h3>
                            <p className="text-sm text-white/60 font-medium">주간 정치 동향과 국정 평가</p>
                        </div>
                        <div className="flex items-center justify-end">
                            <div className="flex items-center gap-2 text-white/60 group-hover:text-white transition-colors">
                                <span className="text-sm font-medium">참여하기</span>
                                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                            </div>
                        </div>
                    </div>
                </motion.div>

                {/* 2. 우측 대통령 카드 - 세로로 길게 (1x2) */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="col-span-1 row-span-2 glass-card relative overflow-hidden border border-white/10 bg-gradient-to-b from-blue-900/20 to-black/40 backdrop-blur-xl rounded-3xl hover:scale-[1.02] transition-transform duration-300 cursor-pointer group"
                    onClick={() => setLocation("/category/politics")}
                >
                    <div className="absolute -right-6 -top-6 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

                    <div className="relative z-10 h-full p-5 flex flex-col">

                        <div className="text-xs text-white/60 font-medium mb-1 tracking-tight">대통령 지지율</div>
                        <div className="text-4xl font-black text-white mb-2">22%</div>
                        <div className="inline-flex flex-col bg-red-500/10 border border-red-500/20 px-3 py-1.5 rounded-xl self-start mb-4">
                            <span className="text-sm font-black text-red-400 leading-none">-3%</span>
                            <span className="text-[10px] text-red-400/70 font-bold leading-tight mt-0.5">지난주 대비</span>
                        </div>

                        {/* President Image Caricature */}
                        <div className="mt-auto relative flex justify-center -mb-2 overflow-visible">
                            <motion.img
                                initial={{ y: 50, opacity: 0 }}
                                animate={{ y: 0, opacity: 1 }}
                                transition={{ delay: 0.5 }}
                                src="/images/president.png"
                                alt="President"
                                className="w-[120%] max-w-none h-auto object-contain drop-shadow-[0_20px_50px_rgba(30,58,138,0.5)] group-hover:scale-105 transition-transform duration-500 origin-bottom"
                            />
                        </div>
                    </div>
                </motion.div>

                {/* Bottom Row - 2 Equal Square-ish Cards */}
                <div className="col-span-3 grid grid-cols-2 gap-3 mt-1">
                    {/* 3. 좌측 하단 카드 - 활동왕 */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        className="glass-card p-6 relative overflow-hidden border border-white/10 bg-black/40 backdrop-blur-xl rounded-3xl hover:scale-[1.02] transition-transform duration-300 cursor-pointer aspect-square flex flex-col justify-between"
                        onClick={() => setLocation("/assembly-rankings")}
                    >
                        <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />
                        <div className="relative z-10">
                            <div className="text-xs text-white/40 font-bold mb-2 uppercase tracking-wider">이달의 활동왕</div>
                            <div className="flex flex-col gap-1">
                                <div className="text-3xl font-black text-white leading-tight truncate">
                                    {assemblyDashboard?.monthlyChampion?.name || "집계중"}
                                </div>
                                {assemblyDashboard?.monthlyChampion?.party && (
                                    <div className="mt-1">
                                        <PartyLogo party={assemblyDashboard.monthlyChampion.party} size="md" />
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="relative z-10 flex items-center gap-2 text-white/40 font-bold text-sm">
                            <span>활동 지표 보기</span>
                            <ArrowRight className="w-4 h-4" />
                        </div>
                    </motion.div>

                    {/* 4. 우측 하단 카드 - 우리동네 정치인 */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.4 }}
                        className="glass-card p-6 relative overflow-hidden border border-white/10 bg-black/40 backdrop-blur-xl rounded-3xl hover:scale-[1.02] transition-transform duration-300 cursor-pointer aspect-square flex flex-col justify-between group"
                        onClick={() => setLocation('/my-district')}
                    >
                        <div className="absolute -right-8 -bottom-8 w-32 h-32 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

                        {/* Background Image: National Assembly */}
                        <div className="absolute -right-4 -bottom-4 opacity-10 pointer-events-none group-hover:scale-110 group-hover:opacity-15 transition-all duration-700">
                            <img
                                src="/national-assembly.webp"
                                alt="National Assembly"
                                className="w-60 h-auto"
                            />
                        </div>

                        <div className="relative z-10">

                            <h4 className="text-2xl font-black text-white leading-tight mb-1">우리동네<br />정치인 찾기</h4>
                        </div>

                        <div className="relative z-10 flex items-center justify-between">
                            <span className="text-xs text-white/40 font-medium">내 지역 의원 평가 확인</span>
                            <div className="w-8 h-8 bg-white/5 rounded-full flex items-center justify-center border border-white/10 group-hover:bg-white/10">
                                <ArrowRight className="w-4 h-4 text-white/60 group-hover:text-white" />
                            </div>
                        </div>
                    </motion.div>
                </div>
            </div>
        </section>
    );
}
