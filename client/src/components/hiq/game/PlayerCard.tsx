import { motion, AnimatePresence } from "framer-motion";
import { HiqMember } from "@shared/schema";
import { ArrowRight } from "lucide-react";

interface Props {
    player?: HiqMember | { name: string };
    score: number;
    target: number;
    run: number;
    highRun: number;
    avg: string;
    isTurn: boolean;
    isFinishMode: boolean;
    theme: string;
    onTap: (zone: "top" | "bottom") => void;
    onTurnClick?: () => void;
    showVs?: boolean;
    isSolo: boolean;
    hideEndInning: boolean;
    is4c: boolean;
    dragAttributes?: any;
    dragListeners?: any;
    isDragging?: boolean;
    onInningClick?: () => void;
}

export function PlayerCard({
    player,
    score,
    target,
    run,
    highRun,
    avg,
    isTurn,
    isFinishMode,
    theme,
    onTap,
    onTurnClick,
    showVs,
    isSolo,
    hideEndInning,
    is4c,
    dragAttributes,
    dragListeners,
    isDragging,
    onInningClick
}: Props) {
    const themeColor = theme === 'white' ? '#FFFFFF' :
        theme === 'yellow' ? '#fde047' :
            theme === 'red' ? '#ef4444' : '#3b82f6';

    const displayScore = score;
    const displayRun = run;
    const displayHighRun = highRun;
    const displayRemaining = Math.max(0, target - score);

    const bgTone = isTurn ? "bg-[#1c1c2e]" : "bg-[#000000]";
    const glowStyle = isTurn
        ? {
            boxShadow: `inset 0 0 100px ${themeColor}10, 0 0 60px ${themeColor}30`,
            border: `6px solid ${themeColor}`,
        }
        : { border: "6px solid transparent" };

    return (
        <div
            className={`relative flex-1 flex flex-col h-full border-x transition-all duration-500 overflow-hidden ${bgTone} ${isTurn ? 'z-10 scale-[1.02] border-t-8 shadow-2xl' : 'z-0 grayscale'}`}
            style={isTurn ? { ...glowStyle, borderTopColor: themeColor } : {}}
        >
            {/* Header (15%) - Symmetric & Clean - DRAG HANDLE */}
            <div
                {...dragAttributes}
                {...dragListeners}
                className="flex-[0_0_15%] flex items-center justify-between px-8 relative z-50 border-b transition-all duration-300 pointer-events-none touch-none"
                style={{
                    backgroundColor: 'rgba(0, 0, 0, 0.3)',
                    borderColor: isTurn ? themeColor : 'rgba(255, 255, 255, 0.1)'
                }}
            >
                {/* Content Container - Capture Drag Here */}
                <div className="flex items-center gap-3 pointer-events-auto cursor-grab active:cursor-grabbing">
                    <h2 className={`text-3xl lg:text-4xl font-extrabold tracking-tighter ${isTurn ? 'text-white' : 'text-white/60'}`}>
                        {player?.name || "Player"}
                    </h2>
                    {isSolo && (
                        <span className="text-[10px] px-2 py-0.5 rounded-md border border-white/10 text-white/20 font-black uppercase tracking-widest">
                            SOLO
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-3 pointer-events-auto">
                    <div className="flex flex-col items-end">
                        <span className="text-[9px] font-black text-white/20 uppercase tracking-[0.2em]">Target</span>
                        <span className={`text-xl font-black italic ${isTurn ? 'text-white/60' : 'text-white/40'}`}>{target}</span>
                    </div>
                </div>
            </div>

            {/* Global Touch Zones (Expanded to Cover Full Card) */}
            <div className="absolute inset-0 z-[45] flex flex-col cursor-pointer touch-manipulation">
                {/* Top Zone (Increase) - Covers Top 50% */}
                <div
                    className="absolute inset-x-0 top-0 h-[50%] active:bg-green-500/5 transition-colors"
                    onClick={() => onTap("top")}
                />

                {/* Bottom Zone (Decrease) - Covers Bottom 50% */}
                <div
                    className="absolute inset-x-0 bottom-0 h-[50%] active:bg-red-500/5 transition-colors"
                    onClick={() => onTap("bottom")}
                />

                {/* Visual Divider - Enhanced Visibility */}
                <div className="absolute top-1/2 left-0 right-0 h-[2px] bg-white/20 pointer-events-none shadow-[0_0_10px_rgba(255,255,255,0.2)]" />
            </div>

            {/* Score Body (Flex-1) */}
            <div className="flex-1 relative flex flex-col z-10 pointer-events-none">

                {/* Centered Score Display */}
                <div className="absolute inset-0 flex items-center justify-center">
                    <AnimatePresence mode="popLayout" initial={false}>
                        <motion.div
                            key={score}
                            initial={{ y: 20, opacity: 0, scale: 1.1 }}
                            animate={{ y: 0, opacity: 1, scale: 1 }}
                            exit={{ y: -20, opacity: 0, scale: 0.9 }}
                            transition={{ type: "spring", stiffness: 400, damping: 25 }}
                            className="flex flex-col items-center"
                        >
                            <h1
                                className="text-[12vw] lg:text-[190px] leading-none font-black tabular-nums tracking-tighter italic filter drop-shadow-[0_15px_40px_rgba(0,0,0,0.6)]"
                                style={{ color: isTurn ? themeColor : '#e5e7eb' }}
                            >
                                {displayScore}
                            </h1>

                            {/* Current Run Badge */}
                            <AnimatePresence>
                                {isTurn && run > 0 && (
                                    <motion.div
                                        initial={{ opacity: 0, y: -20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -10 }}
                                        className="mt-[-20px] px-4 py-1.5 rounded-2xl bg-gradient-to-r from-orange-500 to-yellow-500 shadow-[0_10px_30px_rgba(255,165,0,0.5)] border border-white/20 flex items-center gap-2"
                                    >
                                        <span className="text-xs font-black text-white tracking-tight">🔥 +{displayRun} RUN</span>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* Centered FINISH Text - Interactive */}
                            {displayRemaining === 0 && (
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.5 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    className="absolute inset-0 flex items-center justify-center z-50 pointer-events-auto cursor-pointer"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onTurnClick && onTurnClick();
                                    }}
                                >
                                    <div className="bg-red-500/20 backdrop-blur-sm px-8 py-4 rounded-3xl border border-red-500/50 animate-pulse">
                                        <span className="text-[8vw] font-black italic text-red-500 tracking-tighter drop-shadow-[0_10px_20px_rgba(0,0,0,0.8)]">
                                            FINISH
                                        </span>
                                    </div>
                                </motion.div>
                            )}
                        </motion.div>
                    </AnimatePresence>
                </div>
            </div>

            {/* Info Footer (15%) - Symmetric & Clean */}
            <div
                className="flex-[0_0_15%] flex items-center justify-between px-5 relative z-50 border-t transition-all duration-300 pointer-events-none bg-black/30 backdrop-blur-md"
                style={{
                    backgroundColor: 'rgba(0, 0, 0, 0.3)',
                    borderColor: isTurn ? themeColor : 'rgba(255, 255, 255, 0.1)'
                }}
            >
                {/* Left Section: Average (Top) & High Run (Bottom) */}
                <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-3">
                        <span className="text-[9px] font-black text-white/50 uppercase tracking-widest w-10 text-right">AVG</span>
                        <span className={`text-2xl font-black font-mono tracking-tighter ${isTurn ? 'text-white' : 'text-white/50'}`}>{avg}</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="text-[9px] font-black text-white/50 uppercase tracking-widest w-10 text-right">H.R</span>
                        <span className={`text-2xl font-black font-mono tracking-tighter ${isTurn ? 'text-white' : 'text-white/50'}`}>{displayHighRun}</span>
                    </div>
                </div>

                {/* Right Section: To Go & Button */}
                <div className="flex items-center gap-10">
                    <div className="flex flex-col items-end">
                        <span className={`text-6xl lg:text-7xl font-black italic tabular-nums leading-none ${isTurn ? 'text-[#ffff00]' : 'text-white/20'}`}>
                            {displayRemaining === 0 ? (
                                <span className="text-transparent">0</span>
                            ) : displayRemaining}
                        </span>
                    </div>

                    <AnimatePresence>
                        {isTurn && !isFinishMode && !hideEndInning && (
                            <motion.button
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 20 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onTurnClick && onTurnClick();
                                }}
                                className="h-16 px-8 rounded-2xl flex items-center justify-center gap-3 shadow-[0_15px_30px_rgba(0,0,0,0.4)] border border-white/10 transition-all pointer-events-auto relative z-50 bg-white text-black"
                            >
                                <span className="text-sm font-black tracking-widest">
                                    END INNING
                                </span>
                                <ArrowRight className="w-4 h-4 text-black/40" />
                            </motion.button>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* Visual Indicators for Finish Mode */}
            {isFinishMode && isTurn && (
                <div className="absolute inset-0 pointer-events-none z-0">
                    <div className="absolute inset-0 border-[12px] border-red-500/20 animate-pulse" />
                    <div className="absolute inset-0 bg-red-500/5 mix-blend-overlay" />
                </div>
            )}
        </div>
    );
}
