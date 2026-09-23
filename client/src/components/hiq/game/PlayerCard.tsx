import { motion, AnimatePresence } from "framer-motion";
import { HiqMember } from "@shared/schema";
import { ArrowRight, Flame } from "@/lib/icons";
import { useT } from "@/lib/i18n";

interface Props {
    player?: HiqMember | { name: string };
    score: number;
    target: number;
    run: number;
    highRun: number;
    avg: string;
    isTurn: boolean;
    isFinishMode: boolean;
    /** 마무리 룰: 남은 마무리 개수. 0이면 마무리 완료(진짜 FINISH), undefined면 마무리 룰 없음 */
    finishRemaining?: number;
    theme: string;
    onTap: (zone: "top" | "bottom") => void;
    /** PBA 룰 경기에서만 넘어온다 — 뱅크샷 +2. 없으면 버튼을 그리지 않는다. */
    onBankShot?: () => void;
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
    finishRemaining,
    theme,
    onTap,
    onBankShot,
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
    const { t } = useT();
    // Light-theme-safe ball identity colors — pure white / bright yellow are invisible on a
    // white card, so player identity shifts to readable equivalents (graphite / deep gold / red / blue).
    const themeColor = theme === 'white' ? '#374151' :
        theme === 'yellow' ? '#CA8A04' :
            theme === 'red' ? '#DC2626' : '#2563EB';

    const displayScore = score;
    const displayRun = run;
    const displayHighRun = highRun;
    const displayRemaining = Math.max(0, target - score);

    const bgTone = isTurn ? "bg-white" : "bg-black/[0.03]";
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
                    backgroundColor: 'rgba(0, 0, 0, 0.04)',
                    borderColor: isTurn ? themeColor : 'rgba(0, 0, 0, 0.1)'
                }}
            >
                {/* Content Container - Capture Drag Here */}
                <div className="flex items-center gap-3 pointer-events-auto cursor-grab active:cursor-grabbing">
                    <h2 className={`text-3xl lg:text-4xl font-bold ${isTurn ? 'text-[rgba(0,0,0,0.87)]' : 'text-black/50'}`}>
                        {player?.name || t("playerCard.defaultName")}
                    </h2>
                    {isSolo && (
                        <span className="text-[12px] px-2 py-0.5 rounded-tile text-black/55 font-medium">
                            {t("playerCard.solo")}
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-3 pointer-events-auto">
                    <div className="flex flex-col items-end">
                        <span className="text-[12px] font-medium text-black/40">{t("playerCard.target")}</span>
                        <span className={`text-xl font-semibold tabular-nums ${isTurn ? 'text-black/60' : 'text-black/40'}`}>{target}</span>
                    </div>
                </div>
            </div>

            {/* Global Touch Zones (Expanded to Cover Full Card) */}
            <div className="absolute inset-0 z-[45] flex flex-col cursor-pointer touch-manipulation">
                {/* Top Zone (Increase) - Covers Top 50% */}
                <div
                    className="absolute inset-x-0 top-0 h-[50%] active:bg-brand/[0.06] transition-colors"
                    onClick={() => onTap("top")}
                />

                {/* Bottom Zone (Decrease) - Covers Bottom 50% */}
                <div
                    className="absolute inset-x-0 bottom-0 h-[50%] active:bg-red-500/5 transition-colors"
                    onClick={() => onTap("bottom")}
                />

                {/* Visual Divider - Enhanced Visibility */}
                <div className="absolute top-1/2 left-0 right-0 h-[2px] bg-black/10 pointer-events-none" />
            </div>

            {/* FINISH / 마무리 오버레이 — 탭 존(z-[45])보다 위(z-[46])에 있어야 눌린다.
                target=0 슬롯(게스트 기본값)은 승리 조건이 없으므로 절대 띄우지 않는다. */}
            {target > 0 && displayRemaining === 0 && (
                <div className="absolute inset-0 z-[46] flex items-center justify-center pointer-events-none">
                    {(finishRemaining ?? 0) > 0 ? (
                        /* 마무리가 남았을 때는 표시만 — 마무리 성공/실패 입력은 상·하단 탭으로 받는다. */
                        <div className="bg-amber-500/15 px-7 py-3.5 rounded-card border border-amber-500/50">
                            <span className="text-[5.5vw] font-bold text-amber-600 tabular-nums">
                                {t("playerCard.finishRemaining")} {finishRemaining}
                            </span>
                        </div>
                    ) : (
                        <button
                            type="button"
                            className="pointer-events-auto cursor-pointer bg-red-500/90 px-8 py-4 rounded-card border border-red-500 shadow-[0_4px_16px_rgba(239,68,68,0.4)] animate-pulse active:scale-95 transition-transform"
                            onClick={(e) => {
                                e.stopPropagation();
                                onTurnClick && onTurnClick();
                            }}
                        >
                            <span className="text-[8vw] font-bold text-white">
                                {t("playerCard.finish")}
                            </span>
                        </button>
                    )}
                </div>
            )}

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
                                style={{ color: isTurn ? themeColor : 'rgba(0,0,0,0.18)' }}
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
                                        <span className="text-[13px] font-semibold text-brand">+{displayRun} {t("playerCard.streak")}</span>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* FINISH 배지는 여기서 렌더하지 않는다 — 이 서브트리는 z-10
                                스태킹 컨텍스트 안이라 탭 존(z-[45])이 항상 위에 깔려,
                                배지의 onClick 이 절대 실행되지 않았다(죽은 코드). 배지를 누르면
                                실제로는 상·하단 탭이 발동해 하단 절반은 감점이었다.
                                배지는 카드 루트 직속(z-[46], 탭 존 위)으로 옮겼다 — 아래 참조. */}
                        </motion.div>
                    </AnimatePresence>
                </div>
            </div>

            {/* Info Footer (15%) - Symmetric & Clean */}
            <div
                className="flex-[0_0_15%] flex items-center justify-between px-5 relative z-50 border-t transition-all duration-300 pointer-events-none"
                style={{
                    backgroundColor: 'rgba(0, 0, 0, 0.04)',
                    borderColor: isTurn ? themeColor : 'rgba(0, 0, 0, 0.1)'
                }}
            >
                {/* Left Section: Average (Top) & High Run (Bottom) */}
                <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-3">
                        <span className="text-[12px] font-medium text-black/55 w-12 text-right">{t("playerCard.average")}</span>
                        <span className={`text-2xl font-bold tabular-nums ${isTurn ? 'text-[rgba(0,0,0,0.87)]' : 'text-black/45'}`}>{avg}</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="text-[12px] font-medium text-black/55 w-12 text-right">{t("playerCard.highRun")}</span>
                        <span className={`text-2xl font-bold tabular-nums ${isTurn ? 'text-[rgba(0,0,0,0.87)]' : 'text-black/45'}`}>{displayHighRun}</span>
                    </div>
                </div>

                {/* Right Section: To Go & Button */}
                <div className="flex items-center gap-10">
                    <div className="flex flex-col items-end">
                        <span className={`text-6xl lg:text-7xl font-bold tabular-nums leading-none ${isTurn ? 'text-brand' : 'text-black/40'}`}>
                            {displayRemaining === 0 ? (
                                <span className="text-transparent">0</span>
                            ) : displayRemaining}
                        </span>
                    </div>

                    {/* 뱅크샷 +2 — 카드의 위·아래 탭(±1)과 따로, 한 번에 2점. 탭 존(z-[45]) 위에 있어야 눌린다.
                        목표 도달 뒤엔 숨긴다: 그때 다음 탭은 종료·마무리 판정이다. */}
                    {isTurn && onBankShot && !isFinishMode && (
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onBankShot(); }}
                            className="h-16 px-6 rounded-2xl border-2 border-brand text-brand bg-white flex items-center gap-2 pointer-events-auto relative z-50 active:scale-95 transition-transform"
                        >
                            <span className="text-sm font-semibold">{t("playerCard.bankShot")}</span>
                            <span className="text-2xl font-bold tabular-nums">+2</span>
                        </button>
                    )}

                    <AnimatePresence>
                        {isTurn && (!isFinishMode || (finishRemaining ?? 0) > 0) && !hideEndInning && (
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
                                    {t("playerCard.endInning")}
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
