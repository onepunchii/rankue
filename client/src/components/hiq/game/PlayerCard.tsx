import { motion, AnimatePresence } from "framer-motion";
import { HiqMember } from "@shared/schema";
import { ArrowRight, Flame } from "lucide-react";

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

    const bgTone = isTurn ? "bg-[#141416]" : "bg-[#000000]";
    const turnBorderStyle = isTurn
        ? { border: `6px solid ${themeColor}`, borderTopColor: themeColor }
        : { border: "6px solid transparent" };

    return (
        <div
            className={`relative flex-1 flex flex-col h-full border-x transition-all duration-500 overflow-hidden ${bgTone} ${isTurn ? 'z-10 scale-[1.02] border-t-8' : 'z-0 grayscale'}`}
            style={isTurn ? turnBorderStyle : {}}
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
                    <h2 className={`text-3xl lg:text-4xl font-bold ${isTurn ? 'text-white' : 'text-white/60'}`}>
                        {player?.name || "선수"}
                    </h2>
                    {isSolo && (
                        <span className="text-[12px] px-2 py-0.5 rounded-tile border border-white/10 text-white/55 font-medium">
                            솔로
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-3 pointer-events-auto">
                    <div className="flex flex-col items-end">
                        <span className="text-[12px] font-medium text-white/45">목표</span>
                        <span className={`text-xl font-semibold tabular-nums ${isTurn ? 'text-white/60' : 'text-white/40'}`}>{target}</span>
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
                <div className="absolute top-1/2 left-0 right-0 h-[2px] bg-white/20 pointer-events-none" />
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
                                className="text-[12vw] lg:text-[190px] leading-none font-bold tabular-nums"
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
                                        className="mt-[-20px] inline-flex items-center gap-1.5 px-4 py-1.5 rounded-pill bg-brand/15 border border-brand/25"
                                    >
                                        <Flame className="w-3.5 h-3.5 text-brand" />
                                        <span className="text-[13px] font-semibold text-brand">+{displayRun} 연속</span>
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
                                    <div className="bg-red-500/20 px-8 py-4 rounded-card border border-red-500/50 animate-pulse">
                                        <span className="text-[8vw] font-bold text-red-500">
                                            피니시
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
                className="flex-[0_0_15%] flex items-center justify-between px-5 relative z-50 border-t transition-all duration-300 pointer-events-none"
                style={{
                    backgroundColor: 'rgba(0, 0, 0, 0.3)',
                    borderColor: isTurn ? themeColor : 'rgba(255, 255, 255, 0.1)'
                }}
            >
                {/* Left Section: Average (Top) & High Run (Bottom) */}
                <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-3">
                        <span className="text-[12px] font-medium text-white/55 w-12 text-right">평균</span>
                        <span className={`text-2xl font-bold tabular-nums ${isTurn ? 'text-white' : 'text-white/55'}`}>{avg}</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="text-[12px] font-medium text-white/55 w-12 text-right">하이런</span>
                        <span className={`text-2xl font-bold tabular-nums ${isTurn ? 'text-white' : 'text-white/55'}`}>{displayHighRun}</span>
                    </div>
                </div>

                {/* Right Section: To Go & Button */}
                <div className="flex items-center gap-10">
                    <div className="flex flex-col items-end">
                        <span className={`text-6xl lg:text-7xl font-bold tabular-nums leading-none ${isTurn ? 'text-brand' : 'text-white/45'}`}>
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
                                className="rk-btn-primary h-16 px-8 rounded-2xl flex items-center justify-center gap-3 transition-all pointer-events-auto relative z-50"
                            >
                                <span className="text-sm font-semibold">
                                    이닝 종료
                                </span>
                                <ArrowRight className="w-4 h-4 text-brand-fg/50" />
                            </motion.button>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* Visual Indicators for Finish Mode */}
            {isFinishMode && isTurn && (
                <div className="absolute inset-0 pointer-events-none z-0">
                    <div className="absolute inset-0 border-[12px] border-red-500/20 animate-pulse" />
                </div>
            )}
        </div>
    );
}
