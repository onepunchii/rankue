
import { motion, AnimatePresence } from "framer-motion";
import { LucideUsers, LucideTarget } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { HiqMemberWithH2H, SportConfig } from "./types";
import { getTier } from "@/lib/hiqUtils";
import { Button } from "@/components/ui/button";
import { RadialGauge } from "@/components/hiq/ui/RadialGauge";
import { useT } from "@/lib/i18n";

interface FriendListProps {
    friends: HiqMemberWithH2H[];
    config: SportConfig;
    currentSport: string;
    onSelectFriend: (id: string) => void;
    onSearchOpen: () => void;
}

export const FriendList = ({ friends, config, currentSport, onSelectFriend, onSearchOpen }: FriendListProps) => {
    const { t } = useT();
    return (
        <div className="space-y-4 relative z-10">
            <div className="flex items-center justify-between px-1">
                <h2 className="text-[15px] font-semibold text-black/60">
                    {currentSport === "GOLF" ? t("friendList.titleGolf") : t("friendList.titleBilliards")}
                </h2>
                <div className="px-3 py-1 rounded-full bg-black/[0.04] text-[12px] font-medium text-black/55 tabular-nums">
                    {friends.length}{t("friendList.countSuffix")}
                </div>
            </div>

            {friends.length === 0 ? (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="py-20 flex flex-col items-center text-center rk-card"
                >
                    <div className="w-20 h-20 rounded-2xl bg-black/[0.04] flex items-center justify-center mb-6">
                        <LucideUsers className="w-9 h-9 text-black/40" />
                    </div>
                    <h3 className="text-[19px] font-bold mb-2 text-ink-1 tracking-tight">
                        {t(config.emptyTitle)}
                    </h3>
                    <p className="text-[13px] text-black/55 font-medium mb-8 leading-relaxed">
                        {t("friendList.emptyDescLine1")}<br />{t("friendList.emptyDescLine2")}
                    </p>
                    <Button
                        onClick={onSearchOpen}
                        className="px-10 h-14 rk-btn-primary rounded-tile text-[14px] active:scale-95 outline-none ring-0"
                    >
                        {currentSport === "GOLF" ? t("friendList.searchFriends") : t("friendList.searchRivals")}
                    </Button>
                </motion.div>
            ) : (
                <div className="grid grid-cols-1 gap-4">
                    <AnimatePresence>
                        {friends.map((friend, idx) => {
                            const golfScore = Number((friend.golfAvgScore || 0) > 0 ? friend.golfAvgScore : (friend.golfHandicap || 0) + 72);
                            const displayHandi = golfScore - 72;
                            const handi = currentSport === "GOLF" ? golfScore : friend.handi4c;
                            const tier = getTier(Number(handi || 0), false, currentSport);
                            const h2hTotal = friend.h2h ? friend.h2h.wins + friend.h2h.losses + friend.h2h.draws : 0;
                            const h2hRate = h2hTotal ? Math.round((friend.h2h!.wins / h2hTotal) * 100) : 0;
                            return (
                                <motion.div
                                    key={friend.id}
                                    initial={{ opacity: 0, scale: 0.98 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    transition={{ delay: idx * 0.05 }}
                                >
                                    <div className="rk-card p-4">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-4">
                                                <div className="relative">
                                                    <div className="w-14 h-14 rounded-tile bg-black/[0.04] flex items-center justify-center text-2xl overflow-hidden">
                                                        {(friend as any).profileImageUrl ? (
                                                            <img
                                                                src={(friend as any).profileImageUrl}
                                                                className="w-full h-full object-cover"
                                                                alt={friend.name}
                                                            />
                                                        ) : (
                                                            tier.icon
                                                        )}
                                                    </div>
                                                    <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-white flex items-center justify-center p-0.5 ">
                                                        <div className="w-full h-full rounded-full bg-brand" />
                                                    </div>
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-2 mb-1.5">
                                                        <h3 className="text-[17px] font-semibold text-ink-1 tracking-tight">{friend.name}</h3>
                                                        {currentSport !== "GOLF" && (
                                                            friend.h2h ? (
                                                                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-black/[0.04] ">
                                                                    <span className="text-[12px] font-semibold text-brand">{friend.h2h.wins}{t("friendList.winsSuffix")}</span>
                                                                    <div className="w-0.5 h-2 bg-black/10 rounded-full" />
                                                                    <span className="text-[12px] font-semibold text-red-500">{friend.h2h.losses}{t("friendList.lossesSuffix")}</span>
                                                                </div>
                                                            ) : (
                                                                <div className="px-2 py-0.5 rounded-lg bg-black/[0.04] ">
                                                                    <span className="text-[12px] font-medium text-black/55">{t("friendList.noRecord")}</span>
                                                                </div>
                                                            )
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-2.5">
                                                        <div className={cn("px-2.5 py-0.5 rounded-full border bg-black/[0.04] text-[12px] font-semibold", tier.class)}>
                                                            {t(tier.label)}
                                                        </div>
                                                        <div className="w-1 h-1 rounded-full bg-black/20" />
                                                        <span className="text-[12px] font-medium text-black/55 tabular-nums">
                                                            {currentSport === "GOLF"
                                                                ? `HDCP ${(displayHandi || 0).toFixed(1)}`
                                                                : `AVG ${((friend as any).avg3c || 0) > 0 ? (friend as any).avg3c?.toFixed(2) : ((friend as any).avg4c || 0)?.toFixed(2)}`}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                            {currentSport !== "GOLF" && (
                                                <div className="flex items-center gap-3 shrink-0">
                                                    {h2hTotal > 0 && (
                                                        <RadialGauge value={h2hRate} size={48} stroke={5}>
                                                            <span className="text-[13px] font-bold text-ink-1 tabular-nums leading-none">
                                                                {h2hRate}%
                                                            </span>
                                                        </RadialGauge>
                                                    )}
                                                    <motion.button
                                                        whileTap={{ scale: 0.92 }}
                                                        onClick={() => onSelectFriend(friend.id)}
                                                        className="w-12 h-12 rounded-tile bg-black/[0.04] flex items-center justify-center transition-all hover:bg-brand/10 hover:border-brand/30 group/btn"
                                                    >
                                                        <LucideTarget className="w-5 h-5 text-black/55 transition-colors group-hover/btn:text-brand" />
                                                    </motion.button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </AnimatePresence>
                </div>
            )}
        </div>
    );
};
