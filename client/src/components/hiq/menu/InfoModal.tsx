import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LucideInfo, LucideBriefcase, LucideTrophy, LucideTrendingUp, LucideInfo as LucideInfoSmall } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

export type InfoModalType = "announcement" | "guide" | "ranking";

interface InfoModalProps {
    type: InfoModalType | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    sport?: "BILLIARDS" | "GOLF";
}

export function InfoModal({ type, open, onOpenChange, sport = "BILLIARDS" }: InfoModalProps) {
    const { t } = useT();
    if (!type) return null;

    const isGolf = sport === "GOLF";
    const themeColor = "text-brand";
    const themeBg = "bg-brand";
    const themeBorder = "border-brand";

    // 공통 공지사항
    const announcementContent = (
        <div className="space-y-3">
            <div className="rk-card p-4 rounded-tile">
                <div className="flex items-center gap-2 mb-2">
                    <span className={cn("px-2 py-0.5 rounded text-[12px] font-semibold text-brand-fg", themeBg)}>{t("infoModal.noticeBadge")}</span>
                    <span className="text-[12px] text-black/55 font-mono">2026.02.01</span>
                </div>
                <h3 className="font-semibold text-sm text-ink-1 mb-1">{t("infoModal.launchTitle")}</h3>
                <p className="text-xs text-black/55 leading-relaxed">
                    {t("infoModal.launchDesc")}
                </p>
            </div>
            <div className="rk-card p-4 rounded-tile">
                <div className="flex items-center gap-2 mb-2">
                    <span className="px-2 py-0.5 rounded text-[12px] font-semibold bg-blue-500 text-white">{t("infoModal.updateBadge")}</span>
                    <span className="text-[12px] text-black/55 font-mono">2026.01.25</span>
                </div>
                <h3 className="font-semibold text-sm text-ink-1 mb-1">{t("infoModal.updateTitle")}</h3>
                <p className="text-xs text-black/55 leading-relaxed">
                    {t("infoModal.updateDesc")}
                </p>
            </div>
        </div>
    );

    // 이용안내 (분기)
    const guideContent = isGolf ? (
        <div className="space-y-4">
            <div className="flex gap-4">
                <div className="flex flex-col items-center gap-1">
                    <div className={cn("w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm", themeBg + "/10", themeColor)}>1</div>
                    <div className={cn("w-0.5 h-full", themeBg + "/10")} />
                </div>
                <div className="pb-6">
                    <h3 className="font-bold text-ink-1 text-sm">{t("infoModal.golfStep1Title")}</h3>
                    <p className="text-xs text-black/55 mt-1 leading-relaxed">
                        {t("infoModal.golfStep1Desc")}
                    </p>
                </div>
            </div>
            <div className="flex gap-4">
                <div className="flex flex-col items-center gap-1">
                    <div className={cn("w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm", themeBg + "/10", themeColor)}>2</div>
                    <div className={cn("w-0.5 h-full", themeBg + "/10")} />
                </div>
                <div className="pb-6">
                    <h3 className="font-bold text-ink-1 text-sm">{t("infoModal.golfStep2Title")}</h3>
                    <p className="text-xs text-black/55 mt-1 leading-relaxed">
                        {t("infoModal.golfStep2Desc")}
                    </p>
                </div>
            </div>
            <div className="flex gap-4">
                <div className="flex flex-col items-center gap-1">
                    <div className={cn("w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm", themeBg + "/10", themeColor)}>3</div>
                </div>
                <div>
                    <h3 className="font-bold text-ink-1 text-sm">{t("infoModal.golfStep3Title")}</h3>
                    <p className="text-xs text-black/55 mt-1 leading-relaxed">
                        {t("infoModal.golfStep3Desc")}
                    </p>
                </div>
            </div>
        </div>
    ) : (
        <div className="space-y-4">
            <div className="flex gap-4">
                <div className="flex flex-col items-center gap-1">
                    <div className={cn("w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm", themeBg + "/10", themeColor)}>1</div>
                    <div className={cn("w-0.5 h-full", themeBg + "/10")} />
                </div>
                <div className="pb-6">
                    <h3 className="font-bold text-ink-1 text-sm">{t("infoModal.billiardsStep1Title")}</h3>
                    <p className="text-xs text-black/55 mt-1 leading-relaxed">
                        {t("infoModal.billiardsStep1Desc")}
                    </p>
                </div>
            </div>
            <div className="flex gap-4">
                <div className="flex flex-col items-center gap-1">
                    <div className={cn("w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm", themeBg + "/10", themeColor)}>2</div>
                </div>
                <div>
                    <h3 className="font-bold text-ink-1 text-sm">{t("infoModal.billiardsStep2Title")}</h3>
                    <p className="text-xs text-black/55 mt-1 leading-relaxed">
                        {t("infoModal.billiardsStep2Desc")}
                    </p>
                </div>
            </div>
        </div>
    );

    // 랭킹 시스템 (분기)
    const rankingContent = isGolf ? (
        <div className="space-y-4">
            <div className="rk-card p-4 rounded-tile">
                <h3 className="font-bold text-ink-1 text-sm mb-3">{t("infoModal.tierSystemTitle")}</h3>
                <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                        <span className="text-[#5b6b78] font-bold flex items-center gap-1">💎 PLATINUM</span>
                        <span className="text-black/55">{t("infoModal.golfTierPlatinum")}</span>
                    </div>
                    <div className="w-full h-1 bg-black/[0.06] rounded-full overflow-hidden">
                        <div className="w-full h-full bg-[#5b6b78]" />
                    </div>

                    <div className="flex items-center justify-between text-xs mt-2">
                        <span className="text-[#cba258] font-bold flex items-center gap-1">🥇 GOLD</span>
                        <span className="text-black/55">{t("infoModal.golfTierGold")}</span>
                    </div>
                    <div className="w-full h-1 bg-black/[0.06] rounded-full overflow-hidden">
                        <div className="w-[70%] h-full bg-[#cba258]" />
                    </div>

                    <div className="flex items-center justify-between text-xs mt-2">
                        <span className="text-[#8a9299] font-bold flex items-center gap-1">🥈 SILVER</span>
                        <span className="text-black/55">{t("infoModal.golfTierSilver")}</span>
                    </div>
                    <div className="w-full h-1 bg-black/[0.06] rounded-full overflow-hidden">
                        <div className="w-[50%] h-full bg-[#8a9299]" />
                    </div>
                </div>
            </div>

            <div className="rk-card p-4 rounded-tile">
                <h3 className="font-bold text-ink-1 text-sm mb-2">RANKUE ELITE 60</h3>
                <ul className="text-xs text-black/55 space-y-1.5 list-disc pl-4">
                    <li>{t("infoModal.elite60Line1")}</li>
                    <li>{t("infoModal.elite60Line2")}</li>
                </ul>
            </div>
        </div>
    ) : (
        <div className="space-y-4">
            <div className="rk-card p-4 rounded-tile">
                <h3 className="font-bold text-ink-1 text-sm mb-3">{t("infoModal.tierSystemTitle")}</h3>
                <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                        <span className="text-[#5b6b78] font-bold flex items-center gap-1">💎 PLATINUM</span>
                        <span className="text-black/55">{t("infoModal.topPercent10")}</span>
                    </div>
                    <div className="w-full h-1 bg-black/[0.06] rounded-full overflow-hidden">
                        <div className="w-[15%] h-full bg-[#5b6b78]" />
                    </div>

                    <div className="flex items-center justify-between text-xs mt-2">
                        <span className="text-[#cba258] font-bold flex items-center gap-1">🥇 GOLD</span>
                        <span className="text-black/55">{t("infoModal.topPercent30")}</span>
                    </div>
                    <div className="w-full h-1 bg-black/[0.06] rounded-full overflow-hidden">
                        <div className="w-[30%] h-full bg-[#cba258]" />
                    </div>

                    <div className="flex items-center justify-between text-xs mt-2">
                        <span className="text-[#8a9299] font-bold flex items-center gap-1">🥈 SILVER</span>
                        <span className="text-black/55">{t("infoModal.topPercent60")}</span>
                    </div>
                    <div className="w-full h-1 bg-black/[0.06] rounded-full overflow-hidden">
                        <div className="w-[60%] h-full bg-[#8a9299]" />
                    </div>
                </div>
            </div>

            <div className="rk-card p-4 rounded-tile">
                <h3 className="font-bold text-ink-1 text-sm mb-2">RP (Rank Point)</h3>
                <ul className="text-xs text-black/55 space-y-1.5 list-disc pl-4">
                    <li>{t("infoModal.rpLine1")}</li>
                    <li>{t("infoModal.rpLine2")}</li>
                </ul>
            </div>
        </div>
    );

    const data = {
        announcement: { title: t("infoModal.announcementTitle"), icon: LucideInfo, content: announcementContent },
        guide: { title: t("infoModal.guideTitle"), icon: LucideBriefcase, content: guideContent },
        ranking: { title: t("infoModal.rankingTitle"), icon: LucideTrophy, content: rankingContent }
    };

    const currentData = data[type];
    const Icon = currentData.icon;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-white border-black/10 text-ink-1 rounded-card w-[90%] max-w-sm p-6 gap-0">
                <DialogHeader className="mb-6">
                    <DialogTitle className="flex items-center gap-3 text-lg font-bold tracking-tight">
                        <div className="w-10 h-10 rounded-tile flex items-center justify-center transition-colors text-brand bg-brand/12">
                            <Icon className="w-5 h-5" />
                        </div>
                        {currentData.title}
                    </DialogTitle>
                </DialogHeader>

                {currentData.content}

                <div className="mt-6 pt-6 border-t border-black/10">
                    <button
                        onClick={() => onOpenChange(false)}
                        className="rk-btn-primary w-full h-12 text-sm"
                    >
                        {t("infoModal.confirm")}
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
