import { motion } from "framer-motion";
import { useLocation } from "wouter";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import {
    LucideTrophy,
    LucideFlag,
    LucideCamera,
} from "lucide-react";

interface GameModeSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onOpenScanner: () => void;
}

export function GameModeSheet({ open, onOpenChange, onOpenScanner }: GameModeSheetProps) {
    const [, setLocation] = useLocation();

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="bottom" className="rounded-t-[2rem] bg-[#0A0A0A] border-t border-white/10 p-6 pb-12 ring-0 outline-none">
                <SheetHeader className="mb-8">
                    <SheetTitle className="text-center text-xl font-extrabold text-white tracking-tight">어떤 라운드를 시작할까요?</SheetTitle>
                </SheetHeader>

                <div className="flex gap-4 overflow-x-auto pb-8 -mx-6 px-6 snap-x scrollbar-hide">
                    {/* 1. Rankue Match (Primary - Neon Green) */}
                    <motion.button
                        whileTap={{ scale: 0.95 }}
                        onClick={() => {
                            onOpenChange(false);
                            setLocation('/golf/game/new?mode=match');
                        }}
                        className="snap-center min-w-[170px] relative flex flex-col justify-between p-5 h-60 rounded-[1.8rem] bg-[#1a1a1a] border border-[#64DD17] shadow-[0_0_20px_rgba(100,221,23,0.2)] hover:shadow-[0_0_40px_rgba(100,221,23,0.4)] transition-all group overflow-hidden"
                    >
                        <div className="absolute inset-0 bg-gradient-to-b from-[#64DD17]/10 to-transparent opacity-50" />

                        <div className="relative z-10 w-full flex-1 flex flex-col items-center justify-center">
                            <div className="w-20 h-20 rounded-full bg-[#64DD17]/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300 shadow-[0_0_30px_rgba(100,221,23,0.2)]">
                                <LucideTrophy className="w-10 h-10 text-[#64DD17]" />
                            </div>
                        </div>

                        <div className="relative z-10 text-center">
                            <h3 className="text-base font-extrabold text-[#64DD17] mb-1">랭큐 매치</h3>
                            <p className="text-xs font-semibold text-white/60 leading-tight">내기 &<br />정산 자동화</p>
                        </div>
                    </motion.button>

                    {/* 2. Solo Mode (Secondary - Neon Blue) */}
                    <motion.button
                        whileTap={{ scale: 0.95 }}
                        onClick={() => {
                            onOpenChange(false);
                            setLocation('/golf/game/new?mode=solo');
                        }}
                        className="snap-center min-w-[170px] relative flex flex-col justify-between p-5 h-60 rounded-[1.8rem] bg-[#1a1a1a] border border-[#29B6F6]/50 shadow-[0_0_15px_rgba(41,182,246,0.1)] hover:border-[#29B6F6] hover:shadow-[0_0_30px_rgba(41,182,246,0.3)] transition-all group overflow-hidden"
                    >
                        <div className="absolute inset-0 bg-gradient-to-b from-[#29B6F6]/5 to-transparent opacity-30" />

                        <div className="relative z-10 w-full flex-1 flex flex-col items-center justify-center">
                            <div className="w-20 h-20 rounded-full bg-[#29B6F6]/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300 shadow-[0_0_20px_rgba(41,182,246,0.1)]">
                                <LucideFlag className="w-10 h-10 text-[#29B6F6]" />
                            </div>
                        </div>

                        <div className="relative z-10 text-center">
                            <h3 className="text-base font-extrabold text-white group-hover:text-[#29B6F6] transition-colors mb-1">혼자 기록</h3>
                            <p className="text-xs font-semibold text-white/50 leading-tight">연습 &<br />순수 기록</p>
                        </div>
                    </motion.button>

                    {/* 4. Import Scan (OCR) */}
                    <motion.button
                        whileTap={{ scale: 0.95 }}
                        onClick={() => {
                            onOpenChange(false);
                            onOpenScanner();
                        }}
                        className="snap-center min-w-[170px] relative flex flex-col justify-between p-5 h-60 rounded-[1.8rem] bg-[#1a1a1a] border border-[#FF4081]/50 shadow-[0_0_15px_rgba(255,64,129,0.1)] hover:border-[#FF4081] hover:shadow-[0_0_30px_rgba(255,64,129,0.3)] transition-all group overflow-hidden"
                    >
                        <div className="absolute inset-0 bg-gradient-to-b from-[#FF4081]/5 to-transparent opacity-30" />

                        <div className="relative z-10 w-full flex-1 flex flex-col items-center justify-center">
                            <div className="w-20 h-20 rounded-full bg-[#FF4081]/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300 shadow-[0_0_20px_rgba(255,64,129,0.1)]">
                                <LucideCamera className="w-10 h-10 text-[#FF4081]" />
                            </div>
                        </div>

                        <div className="relative z-10 text-center">
                            <h3 className="text-base font-extrabold text-white group-hover:text-[#FF4081] transition-colors mb-1">기록 가져오기</h3>
                            <p className="text-xs font-semibold text-white/50 leading-tight">스코어카드<br />AI 스캔</p>
                        </div>
                    </motion.button>
                </div>
            </SheetContent>
        </Sheet>
    );
}
