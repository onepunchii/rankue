import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ChevronDown, Target, Swords, LogIn, Cpu } from "@/lib/icons";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import { useState } from "react";
import { BallCluster } from "../ui/BilliardBall";

interface QuickActionsProps {
    onStartGame: (mode: "practice" | "match") => void;
    onJoinGame: () => void;
}

export const QuickActions = ({ onStartGame, onJoinGame }: QuickActionsProps) => {
    const [, setLocation] = useLocation();

    const [isOnlineGameModalOpen, setIsOnlineGameModalOpen] = useState(false);
    const [threeBallSelectionMode, setThreeBallSelectionMode] = useState(false);

    const handleOnlineGameClick = () => setIsOnlineGameModalOpen(true);

    return (
        <div className="mb-12 relative z-10">
            <header className="mb-4">
                <h2 className="text-[19px] font-bold text-ink-1 tracking-tight">빠른 실행</h2>
                <p className="text-[13px] font-medium text-black/55 mt-1">게임을 시작하거나 참여하세요</p>
            </header>

            <div className="grid grid-cols-2 gap-3 auto-rows-min">
                {/* 혼자 연습 (1x1) */}
                <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={() => onStartGame("practice")}
                    className="h-[132px] rounded-3xl bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)] flex flex-col justify-between p-5 text-left transition-colors hover:bg-black/[0.015]"
                >
                    <div className="w-11 h-11 rounded-2xl bg-brand/10 flex items-center justify-center">
                        <Target className="w-[22px] h-[22px] text-brand" strokeWidth={2} />
                    </div>
                    <div>
                        <span className="block text-[15px] font-semibold text-ink-1 leading-tight">혼자 연습</span>
                        <span className="block text-[12.5px] font-medium text-black/50 mt-0.5">기록 없이 연습</span>
                    </div>
                </motion.button>

                {/* 매칭 대결 (hero, spans full column) */}
                <motion.button
                    whileTap={{ scale: 0.98 }}
                    onClick={() => onStartGame("match")}
                    className="row-span-3 h-[420px] rounded-3xl bg-brand flex flex-col justify-between p-6 text-left shadow-[0_8px_24px_rgba(0,98,65,0.20)]"
                >
                    <div className="w-16 h-16 rounded-3xl bg-white/15 flex items-center justify-center">
                        <Swords className="w-8 h-8 text-white" strokeWidth={2} />
                    </div>
                    <div>
                        <span className="block text-[22px] font-bold text-white leading-tight">매칭 대결</span>
                        <span className="block text-[13px] font-medium text-white/80 mt-2 leading-snug">실력이 맞는 상대와<br />1:1 랭킹 경기</span>
                    </div>
                </motion.button>

                {/* 핀 코드 참여 (1x1) */}
                <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={onJoinGame}
                    className="h-[132px] rounded-3xl bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)] flex flex-col justify-between p-5 text-left transition-colors hover:bg-black/[0.015]"
                >
                    <div className="w-11 h-11 rounded-2xl bg-brand/10 flex items-center justify-center">
                        <LogIn className="w-[22px] h-[22px] text-brand" strokeWidth={2} />
                    </div>
                    <div>
                        <span className="block text-[15px] font-semibold text-ink-1 leading-tight">핀 참여</span>
                        <span className="block text-[12.5px] font-medium text-black/50 mt-0.5">코드로 입장</span>
                    </div>
                </motion.button>

                {/* 온라인 대전 (1x1) */}
                <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={handleOnlineGameClick}
                    className="h-[132px] rounded-3xl bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)] flex flex-col justify-between p-5 text-left transition-colors hover:bg-black/[0.015]"
                >
                    <div className="w-11 h-11 rounded-2xl bg-brand/10 flex items-center justify-center">
                        <Cpu className="w-[22px] h-[22px] text-brand" strokeWidth={2} />
                    </div>
                    <div>
                        <span className="block text-[15px] font-semibold text-ink-1 leading-tight">온라인 대전</span>
                        <span className="block text-[12.5px] font-medium text-black/50 mt-0.5">시뮬레이터 대결</span>
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
                <DialogContent hideClose className="bg-white text-ink-1 max-w-md w-[92%] rounded-[32px] p-0 overflow-hidden shadow-[0_24px_80px_rgba(0,0,0,0.18)] focus:outline-none">
                    <div className="p-7">
                        <DialogHeader className="mb-7">
                            <div className="flex flex-col items-center text-center">
                                <DialogTitle className="text-[24px] font-bold tracking-tight text-ink-1 mb-1.5">게임 모드 선택</DialogTitle>
                                <DialogDescription className="text-[13px] font-medium text-black/55">
                                    온라인으로 상대와 겨뤄보세요
                                </DialogDescription>
                            </div>
                        </DialogHeader>

                        <button
                            onClick={() => setIsOnlineGameModalOpen(false)}
                            title="닫기"
                            className="absolute top-6 right-6 w-9 h-9 rounded-full bg-black/[0.04] flex items-center justify-center hover:bg-black/[0.08] transition-all"
                        >
                            <span className="text-xl text-black/40 leading-none">&times;</span>
                        </button>

                        <div className={`grid ${threeBallSelectionMode ? 'grid-cols-1' : 'grid-cols-2'} gap-3.5 min-h-[200px]`}>
                            {/* 3-BALL */}
                            <motion.div
                                layout
                                className={`relative flex flex-col items-center justify-center p-6 rounded-3xl transition-all duration-400 overflow-hidden cursor-pointer ${threeBallSelectionMode
                                    ? "bg-brand/[0.06] col-span-1 h-[260px]"
                                    : "bg-black/[0.04] hover:bg-black/[0.06] active:scale-[0.98]"
                                    }`}
                                onClick={() => !threeBallSelectionMode && setThreeBallSelectionMode(true)}
                            >
                                {!threeBallSelectionMode ? (
                                    <div className="flex flex-col items-center gap-4">
                                        <BallCluster colors={["white", "yellow", "red"]} size={30} />
                                        <span className="text-[18px] font-bold text-ink-1">3구</span>
                                    </div>
                                ) : (
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.96 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        className="w-full h-full flex flex-col justify-between"
                                    >
                                        <div className="flex items-center justify-between mb-6">
                                            <span className="text-[16px] font-bold text-ink-1">테이블 규격</span>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); setThreeBallSelectionMode(false); }}
                                                className="w-8 h-8 rounded-full bg-black/[0.04] flex items-center justify-center hover:bg-black/[0.08] transition-all"
                                            >
                                                <ChevronDown className="w-4 h-4 text-black/40 rotate-90" />
                                            </button>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <motion.button
                                                whileTap={{ scale: 0.96 }}
                                                onClick={(e) => { e.stopPropagation(); setLocation("/online-game?mode=3ball&table=medium"); }}
                                                className="flex flex-col items-center p-5 rounded-2xl bg-white hover:bg-black/[0.02] shadow-[0_1px_2px_rgba(0,0,0,0.06)] transition-all"
                                            >
                                                <span className="text-[17px] font-bold text-ink-1 mb-0.5">중대</span>
                                                <span className="text-[12px] font-medium text-black/55">국내식</span>
                                            </motion.button>
                                            <motion.button
                                                whileTap={{ scale: 0.96 }}
                                                onClick={(e) => { e.stopPropagation(); setLocation("/online-game?mode=3ball&table=large"); }}
                                                className="flex flex-col items-center p-5 rounded-2xl bg-brand hover:bg-brand/90 border border-brand transition-all"
                                            >
                                                <span className="text-[17px] font-bold text-white mb-0.5">대대</span>
                                                <span className="text-[12px] font-medium text-white/80">국제식</span>
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
                                        className="relative flex flex-col items-center justify-center p-6 rounded-3xl bg-black/[0.04] hover:bg-black/[0.06] transition-all active:scale-[0.98] h-full"
                                    >
                                        <div className="flex flex-col items-center gap-4">
                                            <BallCluster colors={["white", "yellow", "red", "red"]} size={30} />
                                            <span className="text-[18px] font-bold text-ink-1">4구</span>
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
