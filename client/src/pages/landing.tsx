import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import { ThumbsUp, CheckCircle, ChevronRight, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import LightPillar from "@/components/ui/light-pillar";

const onboardingData = [
    {
        title: "내 최애가 주인공이 되는\n가장 확실한 방법 👑",
        subtitle: "매일 무료 투표로 응원하고\n전광판 광고 선물까지!",
        icon: <Crown className="w-20 h-20 text-yellow-400" />,
        color: "from-amber-400/20 to-yellow-600/20",
        iconColor: "text-yellow-400",
        label: "실시간 인기 랭킹",
        value: "1위 달성",
        pillarColor: "#FFD700"
    },
    {
        title: "찍먹 vs 부먹?\n당신의 취향을 골라봐 ⚖️",
        subtitle: "가벼운 심리 테스트부터\n흥미진진한 밸런스 게임까지",
        icon: <ThumbsUp className="w-20 h-20 text-pink-400" />,
        color: "from-pink-500/20 to-rose-600/20",
        iconColor: "text-pink-400",
        label: "지금 참여중인 유저",
        value: "52,103명",
        pillarColor: "#FF1493"
    },
    {
        title: "복잡한 정책도 게임처럼\n딱 3줄이면 OK 👌",
        subtitle: "어려운 뉴스는 그만.\n핵심만 보고 찬반 투표 끝!",
        icon: <CheckCircle className="w-20 h-20 text-blue-400" />,
        color: "from-blue-500/20 to-indigo-600/20",
        iconColor: "text-blue-400",
        label: "오늘의 쉬운 정책",
        value: "3줄 요약",
        pillarColor: "#2575FC"
    },
];

export default function Landing() {
    const [index, setIndex] = useState(0);
    const [, setLocation] = useLocation();

    const isLastPage = index === onboardingData.length - 1;

    const handleNext = () => {
        if (isLastPage) {
            localStorage.setItem("onboardingCompleted", "true");
            setLocation("/");
        } else {
            setIndex((prev) => prev + 1);
        }
    };

    return (
        <div className="min-h-screen bg-black text-white relative flex flex-col overflow-hidden">
            {/* Background Gradient & Light Pillar */}
            <div className="fixed inset-0 z-0 pointer-events-none">
                <motion.div
                    animate={{
                        background: index === 0
                            ? "radial-gradient(circle at top left, rgba(255, 215, 0, 0.15), transparent 70%)"
                            : index === 1
                                ? "radial-gradient(circle at top left, rgba(255, 20, 147, 0.15), transparent 70%)"
                                : "radial-gradient(circle at top left, rgba(37, 117, 252, 0.15), transparent 70%)"
                    }}
                    className="absolute inset-0 transition-colors duration-1000"
                />
                <LightPillar
                    topColor={onboardingData[index].pillarColor}
                    bottomColor="#000000"
                    intensity={0.4}
                    pillarWidth={4.0}
                />
            </div>

            <div className="relative z-10 flex-1 flex flex-col justify-between p-6 max-w-md mx-auto w-full">
                {/* Skip Button */}
                <div className="flex justify-end pt-4 h-12">
                    {!isLastPage && (
                        <button
                            onClick={() => {
                                localStorage.setItem("onboardingCompleted", "true");
                                setLocation("/");
                            }}
                            className="text-white/40 font-bold hover:text-white transition-colors text-sm uppercase tracking-widest"
                        >
                            Skip
                        </button>
                    )}
                </div>

                {/* Content Area */}
                <div className="flex-1 flex flex-col items-center justify-center -mt-10">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={index}
                            initial={{ x: 100, opacity: 0, scale: 0.9 }}
                            animate={{ x: 0, opacity: 1, scale: 1 }}
                            exit={{ x: -100, opacity: 0, scale: 0.9 }}
                            transition={{ duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
                            className="w-full flex flex-col items-center text-center space-y-12"
                        >
                            {/* Title & Subtitle */}
                            <div className="space-y-4 px-2">
                                <motion.h1
                                    initial={{ y: 20, opacity: 0 }}
                                    animate={{ y: 0, opacity: 1 }}
                                    transition={{ delay: 0.2 }}
                                    className="text-3xl font-black leading-tight whitespace-pre-line tracking-tight"
                                >
                                    {onboardingData[index].title}
                                </motion.h1>
                                <motion.p
                                    initial={{ y: 20, opacity: 0 }}
                                    animate={{ y: 0, opacity: 1 }}
                                    transition={{ delay: 0.3 }}
                                    className="text-base text-white/50 leading-relaxed"
                                >
                                    {onboardingData[index].subtitle}
                                </motion.p>
                            </div>

                            {/* Central Card */}
                            <motion.div
                                initial={{ rotateY: -20, opacity: 0 }}
                                animate={{ rotateY: 0, opacity: 1 }}
                                transition={{ delay: 0.4, duration: 0.8 }}
                                className="w-72 aspect-[3/4] glass-card flex flex-col items-center justify-center relative overflow-hidden rounded-[2.5rem] border-white/10 shadow-2xl"
                            >
                                {/* Glow Background */}
                                <div className={`absolute inset-0 bg-gradient-to-br ${onboardingData[index].color} blur-3xl opacity-40`} />

                                {/* Icon Container with Floating Animation */}
                                <motion.div
                                    animate={{
                                        y: [0, -15, 0],
                                        rotate: [0, 5, -5, 0]
                                    }}
                                    transition={{
                                        duration: 4,
                                        repeat: Infinity,
                                        ease: "easeInOut"
                                    }}
                                    className="relative z-10 w-36 h-36 rounded-2xl bg-white/5 backdrop-blur-md border border-white/20 flex items-center justify-center shadow-[0_0_50px_rgba(255,255,255,0.1)]"
                                >
                                    <div className="absolute inset-0 bg-gradient-to-tr from-white/10 to-transparent rounded-2xl" />
                                    {onboardingData[index].icon}
                                </motion.div>

                                {/* Card Text */}
                                <div className="relative z-10 mt-12 text-center space-y-1">
                                    <span className="text-[10px] font-black text-white/30 uppercase tracking-[0.3em] mb-2 block">
                                        {onboardingData[index].label}
                                    </span>
                                    <p className="text-4xl font-black tracking-tighter italic bg-clip-text text-transparent bg-gradient-to-b from-white to-white/50 px-4">
                                        {onboardingData[index].value}
                                    </p>
                                </div>
                            </motion.div>
                        </motion.div>
                    </AnimatePresence>
                </div>

                {/* Footer Area */}
                <div className="space-y-10 pb-8">
                    {/* Indicators */}
                    <div className="flex justify-center gap-3">
                        {onboardingData.map((_, i) => (
                            <motion.div
                                key={i}
                                animate={{
                                    width: i === index ? 32 : 8,
                                    backgroundColor: i === index ? "#00F260" : "rgba(255,255,255,0.1)"
                                }}
                                className="h-2 rounded-full transition-all duration-300 shadow-sm"
                            />
                        ))}
                    </div>

                    {/* Action Button */}
                    <Button
                        onClick={handleNext}
                        className="w-full h-16 bg-white text-black hover:bg-white/90 rounded-2xl text-lg font-black transition-all active:scale-[0.97] shadow-xl flex items-center justify-center gap-2"
                    >
                        <span>{isLastPage ? "폴리 시작하기" : "NEXT"}</span>
                        {!isLastPage && <ChevronRight className="w-5 h-5 stroke-[3px]" />}
                    </Button>
                </div>
            </div>
        </div>
    );
}
