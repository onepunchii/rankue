import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ChevronDown, LucideGamepad2, LucideHash, LucideMapPin, LucideTrophy, LucideUsers } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

interface QuickActionsProps {
    onStartGame: (mode: "practice" | "match") => void;
    onJoinGame: () => void;
}

export const QuickActions = ({ onStartGame, onJoinGame }: QuickActionsProps) => {
    const [, setLocation] = useLocation();
    const { toast } = useToast();

    const [isOnlineGameModalOpen, setIsOnlineGameModalOpen] = useState(false);
    const [threeBallSelectionMode, setThreeBallSelectionMode] = useState(false);

    const handleOnlineGameClick = () => setIsOnlineGameModalOpen(true);

    return (
        <div className="mb-12 relative z-10">
            <header className="mb-4">
                <h2 className="text-[19px] font-bold text-white tracking-tight">빠른 실행</h2>
                <p className="text-[13px] font-medium text-white/45 mt-1">게임을 시작하거나 참여하세요</p>
            </header>

            <div className="grid grid-cols-2 gap-3 auto-rows-min">
                {/* 혼자 연습 (1x1) */}
                <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={() => onStartGame("practice")}
                    className="h-[132px] rounded-3xl bg-white/[0.04] border border-white/[0.08] flex flex-col justify-between p-5 text-left transition-colors hover:bg-white/[0.06]"
                >
                    <div className="w-11 h-11 rounded-2xl bg-white/[0.06] flex items-center justify-center">
                        <LucideTrophy className="w-5 h-5 text-white/70" />
                    </div>
                    <div>
                        <span className="block text-[15px] font-semibold text-white leading-tight">혼자 연습</span>
                        <span className="block text-[12.5px] font-medium text-white/45 mt-0.5">기록 없이 연습</span>
                    </div>
                </motion.button>

                {/* 매칭 대결 (1x2, primary) */}
                <motion.button
                    whileTap={{ scale: 0.98 }}
                    onClick={() => onStartGame("match")}
                    className="row-span-2 h-[276px] rounded-3xl bg-gradient-to-b from-brand/[0.14] to-brand/[0.02] border border-brand/25 flex flex-col justify-between p-6 text-left relative overflow-hidden"
                >
                    <div className="absolute -top-16 -right-12 w-40 h-40 rounded-full bg-brand/10 blur-3xl pointer-events-none" />
                    <div className="w-16 h-16 rounded-3xl bg-brand/15 border border-brand/20 flex items-center justify-center relative">
                        <LucideUsers className="w-8 h-8 text-brand" />
                    </div>
                    <div className="relative">
                        <span className="block text-[20px] font-bold text-white leading-tight">매칭 대결</span>
                        <span className="block text-[13px] font-medium text-white/60 mt-1.5 leading-snug">실력이 맞는 상대와<br />1:1 랭킹 경기</span>
                    </div>
                </motion.button>

                {/* 핀 코드 참여 (1x1) */}
                <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={onJoinGame}
                    className="h-[132px] rounded-3xl bg-white/[0.04] border border-white/[0.08] flex flex-col justify-between p-5 text-left transition-colors hover:bg-white/[0.06]"
                >
                    <div className="w-11 h-11 rounded-2xl bg-brand/12 flex items-center justify-center">
                        <LucideHash className="w-5 h-5 text-brand" />
                    </div>
                    <div>
                        <span className="block text-[15px] font-semibold text-white leading-tight">핀 참여</span>
                        <span className="block text-[12.5px] font-medium text-white/45 mt-0.5">코드로 입장</span>
                    </div>
                </motion.button>

                {/* 온라인 대전 (1x1) */}
                <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={handleOnlineGameClick}
                    className="h-[132px] rounded-3xl bg-white/[0.04] border border-white/[0.08] flex flex-col justify-between p-5 text-left transition-colors hover:bg-white/[0.06]"
                >
                    <div className="w-11 h-11 rounded-2xl bg-white/[0.06] flex items-center justify-center">
                        <LucideGamepad2 className="w-5 h-5 text-white/70" />
                    </div>
                    <div>
                        <span className="block text-[15px] font-semibold text-white leading-tight">온라인 대전</span>
                        <span className="block text-[12.5px] font-medium text-white/45 mt-0.5">시뮬레이터 대결</span>
                    </div>
                </motion.button>

                {/* 가까운 매장 (1x1, 준비중) */}
                <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={() => toast({ title: "서비스 준비 중", description: "가까운 매장 찾기 기능이 곧 추가됩니다." })}
                    className="h-[132px] rounded-3xl bg-white/[0.02] border border-white/[0.05] flex flex-col justify-between p-5 text-left"
                >
                    <div className="w-11 h-11 rounded-2xl bg-white/[0.04] flex items-center justify-center">
                        <LucideMapPin className="w-5 h-5 text-white/55" />
                    </div>
                    <div>
                        <span className="block text-[15px] font-medium text-white/50 leading-tight">매장 찾기</span>
                        <span className="block text-[12.5px] font-medium text-white/55 mt-0.5">준비 중</span>
                    </div>
                </motion.button>
            </div>

            {/* Online Game Mode Selection Modal */}
            <Dialog
                open={isOnlineGameModalOpen}
                onOpenChange={(open) => {
                    setIsOnlineGameModalOpen(open);
                    if (!open) setThreeBallSelectionMode(false);
                }}
            >
                <DialogContent hideClose className="bg-[#0F0F0F] border border-white/10 text-white max-w-md w-[92%] rounded-[32px] p-0 overflow-hidden shadow-[0_24px_80px_rgba(0,0,0,0.7)] focus:outline-none">
                    <div className="p-7">
                        <DialogHeader className="mb-7">
                            <div className="flex flex-col items-center text-center">
                                <DialogTitle className="text-[24px] font-bold tracking-tight text-white mb-1.5">게임 모드 선택</DialogTitle>
                                <DialogDescription className="text-[13px] font-medium text-white/50">
                                    온라인으로 상대와 겨뤄보세요
                                </DialogDescription>
                            </div>
                        </DialogHeader>

                        <button
                            onClick={() => setIsOnlineGameModalOpen(false)}
                            title="닫기"
                            className="absolute top-6 right-6 w-9 h-9 rounded-full bg-white/[0.05] border border-white/10 flex items-center justify-center hover:bg-white/10 transition-all"
                        >
                            <span className="text-xl text-white/40 leading-none">&times;</span>
                        </button>

                        <div className={`grid ${threeBallSelectionMode ? 'grid-cols-1' : 'grid-cols-2'} gap-3.5 min-h-[200px]`}>
                            {/* 3-BALL */}
                            <motion.div
                                layout
                                className={`relative flex flex-col items-center justify-center p-6 rounded-3xl transition-all duration-400 border overflow-hidden cursor-pointer ${threeBallSelectionMode
                                    ? "bg-brand/[0.08] border-brand/30 col-span-1 h-[260px]"
                                    : "bg-white/[0.04] hover:bg-white/[0.07] border-white/[0.08] active:scale-[0.98]"
                                    }`}
                                onClick={() => !threeBallSelectionMode && setThreeBallSelectionMode(true)}
                            >
                                {!threeBallSelectionMode ? (
                                    <div className="flex flex-col items-center gap-4">
                                        <div className="w-16 h-16 rounded-3xl bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center text-3xl">🎱</div>
                                        <span className="text-[18px] font-bold text-white">3구</span>
                                    </div>
                                ) : (
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.96 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        className="w-full h-full flex flex-col justify-between"
                                    >
                                        <div className="flex items-center justify-between mb-6">
                                            <span className="text-[16px] font-bold text-white">테이블 규격</span>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); setThreeBallSelectionMode(false); }}
                                                className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-all"
                                            >
                                                <ChevronDown className="w-4 h-4 text-white/40 rotate-90" />
                                            </button>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <motion.button
                                                whileTap={{ scale: 0.96 }}
                                                onClick={(e) => { e.stopPropagation(); setLocation("/online-game?mode=3ball&table=medium"); }}
                                                className="flex flex-col items-center p-5 rounded-2xl bg-white/[0.05] hover:bg-white/[0.09] border border-white/10 transition-all"
                                            >
                                                <span className="text-[17px] font-bold text-white/85 mb-0.5">중대</span>
                                                <span className="text-[12px] font-medium text-white/40">국내식</span>
                                            </motion.button>
                                            <motion.button
                                                whileTap={{ scale: 0.96 }}
                                                onClick={(e) => { e.stopPropagation(); setLocation("/online-game?mode=3ball&table=large"); }}
                                                className="flex flex-col items-center p-5 rounded-2xl bg-brand/15 hover:bg-brand/25 border border-brand/30 transition-all"
                                            >
                                                <span className="text-[17px] font-bold text-white mb-0.5">대대</span>
                                                <span className="text-[12px] font-medium text-white/60">국제식</span>
                                            </motion.button>
                                        </div>
                                    </motion.div>
                                )}
                            </motion.div>

                            {/* 4-BALL */}
                            <AnimatePresence>
                                {!threeBallSelectionMode && (
                                    <motion.button
                                        initial={{ opacity: 0, scale: 0.9, x: 20 }}
                                        animate={{ opacity: 1, scale: 1, x: 0 }}
                                        exit={{ opacity: 0, scale: 0.9, x: 20 }}
                                        onClick={() => setLocation("/online-game?mode=4ball&table=medium")}
                                        title="4구 게임 시작"
                                        className="relative flex flex-col items-center justify-center p-6 rounded-3xl bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.08] transition-all active:scale-[0.98] h-full"
                                    >
                                        <div className="flex flex-col items-center gap-4">
                                            <div className="w-16 h-16 rounded-3xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-3xl">🔴</div>
                                            <span className="text-[18px] font-bold text-white">4구</span>
                                        </div>
                                    </motion.button>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
};
