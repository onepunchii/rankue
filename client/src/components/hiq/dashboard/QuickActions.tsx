import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ChevronDown, Target, Swords, LogIn, Cpu, HelpCircle, LucideMessageCircle, LucideStore } from "@/lib/icons";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import { useState } from "react";
import { BallCluster } from "../ui/BilliardBall";
import { useT } from "@/lib/i18n";

interface QuickActionsProps {
    onStartGame: (mode: "practice" | "match") => void;
    onJoinGame: () => void;
}

export const QuickActions = ({ onStartGame, onJoinGame }: QuickActionsProps) => {
    const [, setLocation] = useLocation();
    const { t } = useT();

    const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
    const [isOnlineGameModalOpen, setIsOnlineGameModalOpen] = useState(false);
    const [threeBallSelectionMode, setThreeBallSelectionMode] = useState(false);
    const handleOnlineGameClick = () => setIsOnlineGameModalOpen(true);

    // 처음 오는 사람을 위한 각 메뉴 안내 — 매칭 대결이 핵심이라 강조 표기
    const guideItems = [
        {
            icon: Swords,
            titleKey: "quickActions.matchTitle",
            descKey: "quickActions.guideMatchDesc",
            highlight: true,
        },
        {
            icon: Target,
            titleKey: "quickActions.practiceTitle",
            descKey: "quickActions.guidePracticeDesc",
            highlight: false,
        },
        {
            icon: LogIn,
            titleKey: "quickActions.pinTitle",
            descKey: "quickActions.guidePinDesc",
            highlight: false,
        },
        {
            icon: LucideStore,
            titleKey: "quickActions.storeTitle",
            descKey: "quickActions.guideStoreDesc",
            highlight: false,
        },
        {
            icon: Cpu,
            titleKey: "quickActions.simTitle",
            descKey: "quickActions.guideSimDesc",
            highlight: false,
        },
        {
            icon: LucideMessageCircle,
            titleKey: "quickActions.communityTitle",
            descKey: "quickActions.guideCommunityDesc",
            highlight: false,
        },
    ];

    return (
        <div className="mb-12 relative z-10">
            <header className="mb-4 flex items-start justify-between gap-3">
                <div>
                    <h2 className="text-[19px] font-bold text-ink-1 tracking-tight">{t("quickActions.title")}</h2>
                    <p className="text-[13px] font-medium text-black/55 mt-1">{t("quickActions.subtitle")}</p>
                </div>
                <button
                    onClick={() => setIsHelpModalOpen(true)}
                    aria-label={t("quickActions.guideTitle")}
                    className="shrink-0 mt-0.5 w-8 h-8 rounded-full bg-black/[0.04] flex items-center justify-center hover:bg-black/[0.08] active:scale-95 transition-all"
                >
                    <HelpCircle className="w-[19px] h-[19px] text-black/45" />
                </button>
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
                        <span className="block text-[15px] font-semibold text-ink-1 leading-tight">{t("quickActions.practiceTitle")}</span>
                        <span className="block text-[12.5px] font-medium text-black/50 mt-0.5">{t("quickActions.practiceDesc")}</span>
                    </div>
                </motion.button>

                {/* 매칭 대결 (hero, 세로 2칸) */}
                <motion.button
                    whileTap={{ scale: 0.98 }}
                    onClick={() => onStartGame("match")}
                    className="row-span-2 h-[276px] rounded-3xl bg-brand flex flex-col justify-between p-6 text-left shadow-[0_8px_24px_rgba(0,98,65,0.20)]"
                >
                    <div className="w-14 h-14 rounded-3xl bg-white/15 flex items-center justify-center">
                        <Swords className="w-7 h-7 text-white" strokeWidth={2} />
                    </div>
                    <div>
                        <span className="block text-[21px] font-bold text-white leading-tight">{t("quickActions.matchTitle")}</span>
                        <span className="block text-[13px] font-medium text-white/80 mt-2 leading-snug">{t("quickActions.matchDescLine1")}<br />{t("quickActions.matchDescLine2")}</span>
                    </div>
                </motion.button>

                {/* 핀 코드 참여 (1x1) — 당구공 빨간색 */}
                <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={onJoinGame}
                    className="h-[132px] rounded-3xl bg-[#E02D2D] flex flex-col justify-between p-5 text-left shadow-[0_4px_14px_rgba(224,45,45,0.35)] transition-colors hover:bg-[#D42828]"
                >
                    <div className="w-11 h-11 rounded-2xl bg-white/15 flex items-center justify-center">
                        <LogIn className="w-[22px] h-[22px] text-white" strokeWidth={2} />
                    </div>
                    <div>
                        <span className="block text-[15px] font-semibold text-white leading-tight">{t("quickActions.pinTitle")}</span>
                        <span className="block text-[12.5px] font-medium text-white/80 mt-0.5">{t("quickActions.pinDesc")}</span>
                    </div>
                </motion.button>

                {/* 커뮤니티 (세로 2칸, 좌측 히어로) — 매칭(우측 히어로)과 지그재그. 우측엔 매장 찾기+시뮬레이터 */}
                <motion.button
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setLocation("/community")}
                    className="row-span-2 h-[276px] rounded-3xl bg-[#F5B721] flex flex-col justify-between p-6 text-left shadow-[0_8px_24px_rgba(245,183,33,0.35)] transition-colors hover:bg-[#F0B01A]"
                >
                    <div className="w-14 h-14 rounded-3xl bg-white/20 flex items-center justify-center">
                        <LucideMessageCircle className="w-7 h-7 text-white" strokeWidth={2} />
                    </div>
                    <div>
                        <span className="block text-[21px] font-bold text-white leading-tight">{t("quickActions.communityTitle")}</span>
                        <span className="block text-[13px] font-medium text-white/85 mt-2 leading-snug">{t("quickActions.communityDesc")}</span>
                    </div>
                </motion.button>

                {/* 매장 찾기 (1x1) */}
                <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={() => setLocation("/stores")}
                    className="h-[132px] rounded-3xl bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)] flex flex-col justify-between p-5 text-left transition-colors hover:bg-black/[0.015]"
                >
                    <div className="w-11 h-11 rounded-2xl bg-brand/10 flex items-center justify-center">
                        <LucideStore className="w-[22px] h-[22px] text-brand" strokeWidth={2} />
                    </div>
                    <div>
                        <span className="block text-[15px] font-semibold text-ink-1 leading-tight">{t("quickActions.storeTitle")}</span>
                        <span className="block text-[12.5px] font-medium text-black/50 mt-0.5">{t("quickActions.storeDesc")}</span>
                    </div>
                </motion.button>

                {/* 시뮬레이터 (1x1) — 온라인 가상 당구대 (/online-game 모드 선택 모달) */}
                <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={handleOnlineGameClick}
                    className="h-[132px] rounded-3xl bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)] flex flex-col justify-between p-5 text-left transition-colors hover:bg-black/[0.015]"
                >
                    <div className="w-11 h-11 rounded-2xl bg-brand/10 flex items-center justify-center">
                        <Cpu className="w-[22px] h-[22px] text-brand" strokeWidth={2} />
                    </div>
                    <div>
                        <span className="block text-[15px] font-semibold text-ink-1 leading-tight">{t("quickActions.simTitle")}</span>
                        <span className="block text-[12.5px] font-medium text-black/50 mt-0.5">{t("quickActions.simDesc")}</span>
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
                                <DialogTitle className="text-[24px] font-bold tracking-tight text-ink-1 mb-1.5">{t("quickActions.modeSelectTitle")}</DialogTitle>
                                <DialogDescription className="text-[13px] font-medium text-black/55">
                                    {t("quickActions.modeSelectDesc")}
                                </DialogDescription>
                            </div>
                        </DialogHeader>

                        <button
                            onClick={() => setIsOnlineGameModalOpen(false)}
                            title={t("quickActions.close")}
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
                                        <span className="text-[18px] font-bold text-ink-1">{t("quickActions.threeBall")}</span>
                                    </div>
                                ) : (
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.96 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        className="w-full h-full flex flex-col justify-between"
                                    >
                                        <div className="flex items-center justify-between mb-6">
                                            <span className="text-[16px] font-bold text-ink-1">{t("quickActions.tableSize")}</span>
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
                                                <span className="text-[17px] font-bold text-ink-1 mb-0.5">{t("quickActions.tableMedium")}</span>
                                                <span className="text-[12px] font-medium text-black/55">{t("quickActions.tableMediumDesc")}</span>
                                            </motion.button>
                                            <motion.button
                                                whileTap={{ scale: 0.96 }}
                                                onClick={(e) => { e.stopPropagation(); setLocation("/online-game?mode=3ball&table=large"); }}
                                                className="flex flex-col items-center p-5 rounded-2xl bg-brand hover:bg-brand/90 border border-brand transition-all"
                                            >
                                                <span className="text-[17px] font-bold text-white mb-0.5">{t("quickActions.tableLarge")}</span>
                                                <span className="text-[12px] font-medium text-white/80">{t("quickActions.tableLargeDesc")}</span>
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
                                        title={t("quickActions.fourBallStart")}
                                        className="relative flex flex-col items-center justify-center p-6 rounded-3xl bg-black/[0.04] hover:bg-black/[0.06] transition-all active:scale-[0.98] h-full"
                                    >
                                        <div className="flex flex-col items-center gap-4">
                                            <BallCluster colors={["white", "yellow", "red", "red"]} size={30} />
                                            <span className="text-[18px] font-bold text-ink-1">{t("quickActions.fourBall")}</span>
                                        </div>
                                    </motion.button>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>


            {/* 처음 오는 사람을 위한 메뉴 안내 모달 */}
            <Dialog open={isHelpModalOpen} onOpenChange={setIsHelpModalOpen}>
                <DialogContent hideClose className="bg-white text-ink-1 max-w-md w-[92%] rounded-[32px] p-0 overflow-hidden shadow-[0_24px_80px_rgba(0,0,0,0.18)] focus:outline-none">
                    <div className="p-7">
                        <DialogHeader className="mb-6 text-left">
                            <DialogTitle className="text-[22px] font-bold tracking-tight text-ink-1">{t("quickActions.guideTitle")}</DialogTitle>
                            <DialogDescription className="text-[13px] font-medium text-black/55 mt-1">
                                {t("quickActions.guideDesc")}
                            </DialogDescription>
                        </DialogHeader>

                        <button
                            onClick={() => setIsHelpModalOpen(false)}
                            title={t("quickActions.close")}
                            className="absolute top-6 right-6 w-9 h-9 rounded-full bg-black/[0.04] flex items-center justify-center hover:bg-black/[0.08] transition-all"
                        >
                            <span className="text-xl text-black/40 leading-none">&times;</span>
                        </button>

                        <div className="flex flex-col gap-2.5">
                            {guideItems.map(({ icon: Icon, titleKey, descKey, highlight }) => (
                                <div
                                    key={titleKey}
                                    className={`flex gap-3.5 p-3.5 rounded-3xl ${highlight ? "bg-brand/[0.06]" : "bg-black/[0.03]"}`}
                                >
                                    <div className={`w-11 h-11 shrink-0 rounded-2xl flex items-center justify-center ${highlight ? "bg-brand" : "bg-brand/10"}`}>
                                        <Icon className={`w-[22px] h-[22px] ${highlight ? "text-white" : "text-brand"}`} strokeWidth={2} />
                                    </div>
                                    <div className="flex-1 min-w-0 pt-0.5">
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-[15px] font-bold text-ink-1">{t(titleKey)}</span>
                                            {highlight && (
                                                <span className="text-[10.5px] font-bold text-brand bg-brand/10 px-1.5 py-0.5 rounded-full leading-none">{t("quickActions.coreBadge")}</span>
                                            )}
                                        </div>
                                        <p className="text-[12.5px] font-medium text-black/55 mt-1 leading-relaxed">{t(descKey)}</p>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <button
                            onClick={() => setIsHelpModalOpen(false)}
                            className="mt-5 w-full h-12 rounded-full bg-brand text-white text-[15px] font-bold active:scale-[0.98] transition-transform"
                        >
                            {t("quickActions.gotIt")}
                        </button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
};
