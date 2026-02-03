import { motion } from "framer-motion";
import { useLocation } from "wouter";
import { DotLottieReact } from '@lottiefiles/dotlottie-react';
import {
    LucideHash,
    LucideCalendarDays,
    LucideChevronRight,
} from "lucide-react";

interface QuickActionsProps {
    onOpenGameMode: () => void;
    onOpenJoin: () => void;
}

export function QuickActions({ onOpenGameMode, onOpenJoin }: QuickActionsProps) {
    const [, setLocation] = useLocation();

    return (
        <>
            {/* Hero Actions (Top Row) */}
            <div className="grid grid-cols-2 gap-4 mb-4 relative z-10">
                {/* 1. Rankue Match */}
                <motion.button
                    whileTap={{ scale: 0.98 }}
                    onClick={onOpenGameMode}
                    className="aspect-[4/5] rounded-[2rem] bg-gradient-to-br from-[#64DD17] to-[#388E3C] p-6 flex flex-col justify-between items-start text-left shadow-2xl shadow-[#64DD17]/20 group relative overflow-hidden"
                >
                    <div className="w-full h-32 flex items-center justify-center -mt-2">
                        <DotLottieReact
                            src="https://lottie.host/bdd7e9d6-727e-47b6-91a7-f1480696aa8f/k5YppJ00Hq.lottie"
                            loop
                            autoplay
                            className="w-full h-full"
                        />
                    </div>
                    <div>
                        <h3 className="text-2xl font-extrabold text-[#051907] leading-none mb-1">RANKUE<br />MATCH</h3>
                        <p className="text-xs font-semibold text-[#051907]/60">스코어 & 내기 자동 정산</p>
                    </div>
                </motion.button>

                {/* 2. Enter Code (Big) */}
                <motion.button
                    whileTap={{ scale: 0.98 }}
                    onClick={onOpenJoin}
                    className="aspect-[4/5] rounded-[2rem] bg-[#1a1a1a] border border-[#64DD17]/30 p-6 flex flex-col justify-between items-start text-left shadow-2xl shadow-[#64DD17]/10 group relative overflow-hidden"
                >
                    <div className="absolute inset-0 bg-gradient-to-br from-[#64DD17]/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                    {/* Pulsing Background Glow */}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 bg-[#64DD17]/10 rounded-full blur-3xl animate-pulse" />

                    <div className="w-full h-32 flex items-center justify-center -mt-2 relative z-10">
                        <LucideHash className="w-20 h-20 text-[#64DD17] group-hover:scale-110 transition-transform duration-500 drop-shadow-[0_0_15px_rgba(100,221,23,0.4)]" />
                    </div>
                    <div className="relative z-10">
                        <h3 className="text-2xl font-extrabold text-white leading-none mb-1">ENTER<br />CODE</h3>
                        <p className="text-xs font-semibold text-[#64DD17]/80">매치 핀 번호 입력</p>
                    </div>
                </motion.button>
            </div>

            {/* Booking Banner (Horizontal) */}
            <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={() => setLocation('/golf/booking-list')}
                className="w-full mb-4 relative z-10 bg-white/[0.03] border border-white/5 rounded-2xl py-8 px-6 flex items-center justify-between shadow-lg backdrop-blur-sm group hover:border-[#64DD17]/30 transition-colors"
                title="실시간 골프 부킹 및 조인 찾기"
            >
                <div className="flex items-center gap-5">
                    <div className="w-14 h-14 rounded-2xl bg-[#64DD17]/10 flex items-center justify-center group-hover:bg-[#64DD17] transition-colors">
                        <LucideCalendarDays className="w-7 h-7 text-[#64DD17] group-hover:text-[#051907] transition-colors" />
                    </div>
                    <div className="text-left">
                        <h3 className="text-xl font-extrabold text-white">GOLF BOOKING</h3>
                        <p className="text-sm font-semibold text-white/40 group-hover:text-[#64DD17] transition-colors mt-0.5">실시간 부킹 & 조인 찾기</p>
                    </div>
                </div>
                <LucideChevronRight className="w-6 h-6 text-white/20 group-hover:text-white transition-colors" />
            </motion.button>

            {/* Secondary Actions (Bottom Row) */}
            <div className="grid grid-cols-2 gap-4 mb-4 relative z-10">
                {/* 3. Golf Passport */}
                <motion.button
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setLocation('/golf/passport')}
                    className="aspect-[4/5] rounded-[2rem] bg-white/[0.03] border border-white/10 p-6 flex flex-col justify-between items-start text-left hover:bg-white/[0.05] transition-colors group relative overflow-hidden backdrop-blur-sm shadow-xl"
                >
                    <div className="w-full h-32 flex items-center justify-center -mt-2">
                        <DotLottieReact
                            src="https://lottie.host/87b0804a-dfd0-402b-b2ec-185d8bb6f380/f0WSfFYjeY.lottie"
                            loop
                            autoplay
                            className="w-full h-full opacity-80 group-hover:opacity-100 transition-opacity"
                        />
                    </div>
                    <div className="relative z-10 w-full">
                        <h3 className="text-2xl font-extrabold text-white leading-none mb-1">GOLF<br />PASSPORT</h3>
                        <p className="text-[10px] font-bold text-white/40 group-hover:text-[#64DD17] transition-colors">도장깨기 & 가이드</p>
                    </div>
                </motion.button>

                {/* 4. Member Market */}
                <motion.button
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setLocation('/golf/membership')}
                    className="aspect-[4/5] rounded-[2rem] bg-white/[0.03] border border-white/10 p-6 flex flex-col justify-between items-start text-left hover:bg-white/[0.05] transition-colors group relative overflow-hidden backdrop-blur-sm shadow-xl"
                >
                    <div className="absolute inset-0 bg-gradient-to-br from-[#64DD17]/10 to-transparent opacity-0 group-hover:opacity-30 transition-opacity" />

                    <div className="w-full h-32 flex items-center justify-center -mt-2 relative z-10 px-2">
                        <svg viewBox="0 0 100 50" className="w-full h-full overflow-visible opacity-90 group-hover:scale-110 transition-transform duration-500">
                            <defs>
                                <linearGradient id="marketGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#64DD17" stopOpacity="0.4" />
                                    <stop offset="100%" stopColor="#64DD17" stopOpacity="0" />
                                </linearGradient>
                            </defs>

                            <motion.path
                                d="M0 50 L0 30 Q25 40 50 20 T100 10 L100 50 Z"
                                fill="url(#marketGradient)"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ duration: 1.5 }}
                            />

                            <motion.path
                                d="M0 30 Q25 40 50 20 T100 10"
                                fill="none"
                                stroke="#64DD17"
                                strokeWidth="3"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                initial={{ pathLength: 0 }}
                                animate={{ pathLength: 1 }}
                                transition={{ duration: 2, ease: "easeInOut", repeat: Infinity, repeatType: "reverse", repeatDelay: 3 }}
                            />
                        </svg>
                    </div>

                    <div className="relative z-10 w-full">
                        <h3 className="text-2xl font-extrabold text-white leading-none mb-1">MEMBER<br />MARKET</h3>
                        <p className="text-[10px] font-bold text-[#64DD17] opacity-80">회원권 거래소</p>
                    </div>
                </motion.button>
            </div>
        </>
    );
}
