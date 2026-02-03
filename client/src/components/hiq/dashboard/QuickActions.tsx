import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ChevronDown, ChevronRight, LucideGamepad2, LucideHash, LucideMapPin, LucideMonitorPlay, LucideSmartphone, LucideTrophy, LucideUsers } from "lucide-react";
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

    // Online Game Mode State
    const [isOnlineGameModalOpen, setIsOnlineGameModalOpen] = useState(false);
    const [threeBallSelectionMode, setThreeBallSelectionMode] = useState(false);

    const handleOnlineGameClick = () => {
        // We handle the modal internal state here for the online game selection
        // But the parent might want to know. 
        // For now, let's keep the OnlineGameModal logic here or separate it further.
        // Actually, the previous Dashboard had "isOnlineGameModalOpen".
        // Let's implement the modal inside this component or as a sibling.
        // For cleaner separation, let's just use the prop to notify parent or open a local modal.
        // The prompt asked to separate components. Let's keep the buttons here.
        setIsOnlineGameModalOpen(true);
    };

    return (
        <div className="space-y-4 mb-12 relative z-10 px-2 sm:px-0">
            <header className="mb-2 px-2">
                <h1 className="text-xl font-black italic tracking-tighter text-white">QUICK COMMAND</h1>
                <p className="text-white/50 text-xs mt-1 flex items-center gap-1 font-bold">
                    <LucideSmartphone className="w-3 h-3 text-[#ffd700]" /> 빠른 게임 실행 및 참여
                </p>
            </header>

            <div className="grid grid-cols-2 gap-4 auto-rows-min">
                {/* [1] 혼자 연습하기 (1x1) */}
                <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => onStartGame("practice")}
                    className="row-span-1 h-34 rounded-[2.5rem] bg-white/[0.08] border border-white/10 flex flex-col items-center justify-center gap-3 group relative overflow-hidden shadow-[0_0_20px_rgba(255,255,255,0.02)]"
                >
                    <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center transition-all">
                        <LucideTrophy className="w-7 h-7 text-white/40 group-hover:text-white" />
                    </div>
                    <div className="text-center px-4">
                        <span className="block font-black text-sm text-white/60 group-hover:text-white transition-colors">혼자 연습하기</span>
                        <span className="text-[9px] font-black text-white/20 uppercase tracking-widest mt-0.5 block">PRACTICE MODE</span>
                    </div>
                </motion.button>

                {/* [2] 매칭 대결 (1x2 Tall) */}
                <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => onStartGame("match")}
                    className="row-span-2 h-72 rounded-[2.5rem] bg-white/[0.08] border border-[#10b981]/30 flex flex-col items-center justify-center gap-6 group relative overflow-hidden shadow-[0_0_20px_rgba(16,185,129,0.05)]"
                >
                    <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="w-20 h-20 rounded-[2rem] bg-[#10b981]/10 flex items-center justify-center group-hover:neon-glow transition-all" style={{ ['--hiq-brand-color' as any]: '#10b981' }}>
                        <LucideUsers className="w-10 h-10 text-[#10b981]" />
                    </div>
                    <div className="text-center px-4">
                        <span className="block font-black text-base text-white">매칭 대결</span>
                        <span className="text-[10px] font-black text-white/20 uppercase tracking-widest mt-1 block">MATCH MODE</span>
                    </div>
                </motion.button>

                {/* [3] PIN 참여 (1x1) - Practice 아래 배치 */}
                <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={onJoinGame}
                    className="h-34 rounded-[2.5rem] bg-white/[0.05] border border-[#10b981]/30 flex flex-col items-center justify-center gap-3 group relative overflow-hidden shadow-[0_0_20px_rgba(16,185,129,0.05)]"
                >
                    <div className="absolute inset-0 bg-[#10b981]/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="w-14 h-14 rounded-2xl bg-[#10b981]/10 flex items-center justify-center group-hover:neon-glow transition-all" style={{ ['--hiq-brand-color' as any]: '#10b981' }}>
                        <LucideHash className="w-6 h-6 text-[#10b981]" />
                    </div>
                    <div className="text-center">
                        <span className="block font-black text-sm text-white">PIN 참여</span>
                        <span className="text-[9px] font-black text-[#10b981]/40 uppercase tracking-widest mt-0.5 block">JOIN GAME</span>
                    </div>
                </motion.button>

                {/* [4] 온라인 게임 (Wide) */}
                <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={handleOnlineGameClick}
                    className="col-span-2 h-32 rounded-[2.5rem] bg-[#10b981]/10 border border-[#10b981]/20 flex items-center justify-start px-10 gap-6 group relative overflow-hidden shadow-[0_0_30px_rgba(16,185,129,0.05)]"
                >
                    <div className="absolute inset-0 bg-[#10b981]/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="w-16 h-16 rounded-[2rem] bg-[#10b981]/20 flex items-center justify-center shadow-[0_0_20px_rgba(16,185,129,0.1)] group-hover:shadow-[0_0_30px_rgba(16,185,129,0.2)] transition-all">
                        <LucideGamepad2 className="w-8 h-8 text-[#10b981]" />
                    </div>
                    <div className="text-left">
                        <span className="block font-black text-xl text-[#10b981]">e-빌리어드</span>
                        <span className="text-[10px] font-black text-[#10b981]/40 uppercase tracking-widest">Digital Sports Experience</span>
                    </div>
                </motion.button>

                {/* [5] 시뮬레이션 (1x1) */}
                <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setLocation("/simulation")}
                    className="h-32 rounded-[2.5rem] bg-white/[0.05] border border-white/10 flex flex-col items-center justify-center gap-3 group relative overflow-hidden"
                >
                    <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center group-hover:neon-glow transition-all">
                        <LucideMonitorPlay className="w-6 h-6 text-white/40 group-hover:text-white" />
                    </div>
                    <div className="text-center">
                        <span className="block font-black text-sm text-white/70 group-hover:text-white transition-colors">시뮬레이션</span>
                        <span className="text-[9px] font-black text-white/20 uppercase tracking-widest mt-0.5 block">VIRTUAL SIM</span>
                    </div>
                </motion.button>

                {/* [6] 매장 찾기 (1x1) */}
                <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => {
                        toast({
                            title: "서비스 준비 중",
                            description: "가까운 매장 찾기 기능이 곧 추가됩니다.",
                        });
                    }}
                    className="h-32 rounded-[2.5rem] bg-white/[0.03] border border-white/5 flex flex-col items-center justify-center gap-3 group relative overflow-hidden opacity-50 hover:opacity-100 transition-opacity"
                >
                    <LucideMapPin className="w-6 h-6 text-white/20 group-hover:text-white/60" />
                    <div className="text-center">
                        <span className="block font-bold text-sm text-white/30 group-hover:text-white/60 transition-colors">매장 찾기</span>
                        <span className="text-[9px] font-black text-white/10 uppercase tracking-widest mt-0.5 block">FIND CLUB</span>
                    </div>
                </motion.button>
            </div>

            {/* Online Game Mode Selection Modal (Local to QuickActions or hoisted?) */}
            {/* The prompt suggested keeping things separated. Let's include the modal here for "Online Game" since it's specific to that action. */}
            <Dialog
                open={isOnlineGameModalOpen}
                onOpenChange={(open) => {
                    setIsOnlineGameModalOpen(open);
                    if (!open) setThreeBallSelectionMode(false);
                }}
            >
                <DialogContent hideClose className="bg-[#0A0A0A]/95 backdrop-blur-xl border border-white/10 text-white max-w-lg w-[95%] rounded-[3rem] p-0 overflow-hidden shadow-[0_0_100px_rgba(0,0,0,0.8)] focus:outline-none">
                    <div className="p-10 bg-gradient-to-br from-white/[0.02] to-transparent relative">
                        <DialogHeader className="mb-10">
                            <div className="flex flex-col items-center text-center">
                                <DialogTitle className="text-4xl font-black tracking-tighter text-white mb-2">게임 모드 선택</DialogTitle>
                                <DialogDescription className="text-[11px] font-black text-[#10b981]/60 uppercase tracking-[0.2em]">
                                    Pick your billiards arena
                                </DialogDescription>
                            </div>
                        </DialogHeader>

                        {/* Custom Close Button */}
                        <button
                            onClick={() => setIsOnlineGameModalOpen(false)}
                            title="닫기"
                            className="absolute top-8 right-8 w-10 h-10 rounded-full bg-white/[0.03] border border-white/10 flex items-center justify-center hover:bg-white/10 transition-all group"
                        >
                            <span className="text-2xl text-white/20 group-hover:text-white">&times;</span>
                        </button>

                        <div className={`grid ${threeBallSelectionMode ? 'grid-cols-1' : 'grid-cols-2'} gap-6 py-2 min-h-[220px]`}>
                            {/* 3-BALL CARD */}
                            <motion.div
                                layout
                                className={`relative flex flex-col items-center justify-center p-8 rounded-[2.5rem] transition-all duration-500 border overflow-hidden cursor-pointer group/card ${threeBallSelectionMode
                                    ? "bg-[#10b981]/10 border-[#10b981]/30 col-span-1 shadow-[0_0_40px_rgba(16,185,129,0.15)] h-[280px]"
                                    : "bg-white/[0.03] hover:bg-white/[0.08] border-white/5 hover:border-[#10b981]/30 active:scale-[0.98]"
                                    }`}
                                onClick={() => !threeBallSelectionMode && setThreeBallSelectionMode(true)}
                            >
                                <div className="absolute top-0 right-0 w-32 h-32 bg-[#10b981]/5 blur-[60px] rounded-full -mr-16 -mt-16 group-hover/card:bg-[#10b981]/15 transition-colors" />

                                {!threeBallSelectionMode ? (
                                    <motion.div
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="flex flex-col items-center gap-5 relative z-10"
                                    >
                                        <div className="w-20 h-20 rounded-3xl bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center text-4xl shadow-2xl group-hover/card:scale-110 transition-transform">
                                            🎱
                                        </div>
                                        <div className="text-center">
                                            <span className="font-black text-2xl block tracking-tighter text-white mb-1">3구</span>
                                            <span className="text-[10px] font-black text-white/20 uppercase tracking-widest group-hover/card:text-[#10b981]/60 transition-colors">3-Ball Game</span>
                                        </div>
                                    </motion.div>
                                ) : (
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.95 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        className="w-full h-full flex flex-col justify-between relative z-10"
                                    >
                                        <div className="flex items-center justify-between mb-8">
                                            <div className="flex flex-col">
                                                <span className="text-lg font-black text-white tracking-tighter">테이블 규격 선택</span>
                                                <span className="text-[9px] font-black text-[#10b981] uppercase tracking-widest">Select Arena Size</span>
                                            </div>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); setThreeBallSelectionMode(false); }}
                                                className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-[10px] font-black hover:bg-white/10 transition-all"
                                            >
                                                <ChevronDown className="w-4 h-4 text-white/40 rotate-90" />
                                            </button>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <motion.button
                                                whileHover={{ y: -4 }}
                                                whileTap={{ scale: 0.96 }}
                                                onClick={(e) => { e.stopPropagation(); setLocation("/online-game?mode=3ball&table=medium"); }}
                                                className="flex flex-col items-center p-6 rounded-[1.8rem] bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 transition-all group/btn shadow-xl"
                                            >
                                                <span className="font-black text-xl text-white/80 group-hover/btn:text-white mb-1">중대</span>
                                                <span className="text-[9px] font-black text-white/20 uppercase tracking-widest group-hover/btn:text-white/40">Domestic</span>
                                            </motion.button>
                                            <motion.button
                                                whileHover={{ y: -4 }}
                                                whileTap={{ scale: 0.96 }}
                                                onClick={(e) => { e.stopPropagation(); setLocation("/online-game?mode=3ball&table=large"); }}
                                                className="flex flex-col items-center p-6 rounded-[1.8rem] bg-[#10b981]/20 hover:bg-[#10b981]/30 border border-[#10b981]/30 transition-all group/btn shadow-[0_10px_30px_rgba(16,185,129,0.2)]"
                                            >
                                                <span className="font-black text-xl text-white group-hover/btn:scale-105 transition-transform mb-1">대대</span>
                                                <span className="text-[9px] font-black text-white/60 uppercase tracking-widest group-hover/btn:text-white/80">International</span>
                                            </motion.button>
                                        </div>
                                    </motion.div>
                                )}
                            </motion.div>

                            {/* 4-BALL CARD */}
                            <AnimatePresence>
                                {!threeBallSelectionMode && (
                                    <motion.button
                                        initial={{ opacity: 0, scale: 0.9, x: 20 }}
                                        animate={{ opacity: 1, scale: 1, x: 0 }}
                                        exit={{ opacity: 0, scale: 0.9, x: 20 }}
                                        onClick={() => setLocation("/online-game?mode=4ball&table=medium")}
                                        title="4구 게임 시작"
                                        className="relative flex flex-col items-center justify-center p-8 rounded-[2.5rem] bg-white/[0.03] hover:bg-white/[0.08] border border-white/5 hover:border-[#10b981]/30 transition-all active:scale-[0.98] group/card overflow-hidden h-full"
                                    >
                                        <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/5 blur-[60px] rounded-full -mr-16 -mt-16 group-hover/card:bg-red-500/15 transition-colors" />

                                        <div className="flex flex-col items-center gap-5 relative z-10">
                                            <div className="w-20 h-20 rounded-3xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-4xl shadow-2xl group-hover/card:scale-110 transition-transform">
                                                🔴
                                            </div>
                                            <div className="text-center">
                                                <span className="font-black text-2xl block tracking-tighter text-white mb-1">4구</span>
                                                <span className="text-[10px] font-black text-white/20 uppercase tracking-widest group-hover/card:text-[#10b981]/60 transition-colors">4-Ball Game</span>
                                            </div>
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
