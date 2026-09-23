
import { motion, AnimatePresence } from "framer-motion";
import { LucideUsers, LucideTarget } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { HiqMemberWithH2H, SportConfig } from "./types";
import { getTier } from "@/lib/hiqUtils";
import { Button } from "@/components/ui/button";
import { RadialGauge } from "@/components/hiq/ui/RadialGauge";
import { getRivalryLabel } from "./HeadToHeadCard";
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
                <h2 className="text-[15px] font-semibold text-ink-2">
                    {currentSport === "GOLF" ? t("friendList.titleGolf") : t("friendList.titleBilliards")}
                </h2>
                <div className="px-3 py-1 rounded-full bg-surface-2 text-[12px] font-medium text-ink-3 rk-num">
                    {friends.length}{t("friendList.countSuffix")}
                </div>
            </div>

            {friends.length === 0 ? (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="py-20 flex flex-col items-center text-center rk-card"
                >
                    <div className="w-20 h-20 rounded-2xl bg-surface-2 flex items-center justify-center mb-6">
                        <LucideUsers className="w-9 h-9 text-ink-4" />
                    </div>
                    <h3 className="text-[19px] font-bold mb-2 text-ink-1 tracking-tight">
                        {t(config.emptyTitle)}
                    </h3>
                    <p className="text-[13px] text-ink-3 font-medium mb-8 leading-relaxed">
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
                            // 천적/우세/박빙 — 목록에서부터 "다시 붙어야 할 이유"가 보이게 한다
                            const rivalry = friend.h2h && currentSport !== "GOLF"
                                ? getRivalryLabel(friend.h2h.wins, friend.h2h.losses)
                                : null;
                            const tappable = currentSport !== "GOLF";
                            return (
                                <motion.div
                                    key={friend.id}
                                    initial={{ opacity: 0, scale: 0.98 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    transition={{ delay: idx * 0.05 }}
                                >
                                    {/* 카드 전체가 탭 대상 — 상대전적을 보러 가는 데 작은 아이콘을 정확히
                                        눌러야 했던 게 이 화면에서 전적이 안 읽히던 이유였다 */}
                                    <div
                                        className={cn("rk-card p-4", tappable && "cursor-pointer active:scale-[0.99] transition-transform")}
                                        onClick={tappable ? () => onSelectFriend(friend.id) : undefined}
                                        role={tappable ? "button" : undefined}
                                        tabIndex={tappable ? 0 : undefined}
                                        onKeyDown={tappable ? (e) => {
                                            if (e.key === "Enter" || e.key === " ") {
                                                e.preventDefault();
                                                onSelectFriend(friend.id);
                                            }
                                        } : undefined}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-4">
                                                <div className="relative">
                                                    <div className="w-14 h-14 rounded-tile bg-surface-2 flex items-center justify-center text-2xl overflow-hidden">
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
                                                    <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-surface-0 flex items-center justify-center p-0.5">
                                                        <div className="w-full h-full rounded-full bg-brand" />
                                                    </div>
                                                </div>
                                                <div>
                                                    <div className="flex items-center flex-wrap gap-x-2 gap-y-1 mb-1.5">
                                                        <h3 className="text-[17px] font-semibold text-ink-1 tracking-tight">{friend.name}</h3>
                                                        {currentSport !== "GOLF" && (
                                                            // 서버는 맞대결이 없어도 h2h 객체를 내려준다 — 개수로 판단하지
                                                            // 않으면 처음 만난 상대에게도 "0승 0패"가 붙는다
                                                            h2hTotal > 0 ? (
                                                                <>
                                                                    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-surface-2">
                                                                        <span className="text-[12px] font-semibold text-brand tabular-nums">{friend.h2h!.wins}{t("friendList.winsSuffix")}</span>
                                                                        <div className="w-0.5 h-2 bg-surface-line rounded-full" />
                                                                        <span className="text-[12px] font-semibold text-red-500 tabular-nums">{friend.h2h!.losses}{t("friendList.lossesSuffix")}</span>
                                                                    </div>
                                                                    {rivalry && (
                                                                        <span className={cn("px-2 py-0.5 rounded-lg text-[12px] font-semibold leading-tight", rivalry.className)}>
                                                                            {t(rivalry.textKey)}
                                                                        </span>
                                                                    )}
                                                                </>
                                                            ) : (
                                                                <div className="px-2 py-0.5 rounded-lg bg-surface-2">
                                                                    <span className="text-[12px] font-medium text-ink-3">{t("friendList.noRecord")}</span>
                                                                </div>
                                                            )
                                                        )}
                                                    </div>
                                                    {/* 등급과 값(2026-09-23 오너: "등급·AVG 부분 디자인이 마음에 안 듬").
                                                        예전엔 등급 칩에 테두리 + bg-black/[0.04] 를 덧칠해 tier 클래스의 바탕색이 매번 덮였고,
                                                        값은 12px 회색이라 이름 아래 회색 줄 하나로 뭉개졌다.
                                                        이제 칩은 등급색 하나로, 값은 **숫자를 크게** 하고 단위를 작게 앞에 둔다. */}
                                                    <div className="flex items-center gap-2.5">
                                                        <span className={cn("px-2 py-0.5 rounded-md text-[11px] font-bold tracking-wide", tier.class)}>
                                                            {t(tier.label)}
                                                        </span>
                                                        <span className="flex items-baseline gap-1">
                                                            <span className="text-[10.5px] font-semibold text-ink-4">{currentSport === "GOLF" ? "HDCP" : "AVG"}</span>
                                                            <span className="rk-num text-[14px] font-bold text-ink-1 leading-none">
                                                                {currentSport === "GOLF"
                                                                    ? (displayHandi || 0).toFixed(1)
                                                                    : (((friend as any).avg3c || 0) > 0 ? (friend as any).avg3c : ((friend as any).avg4c || 0))?.toFixed(2)}
                                                            </span>
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
                                                    {/* 카드가 이미 같은 동작을 하므로 버블링을 끊어 두 번 호출되지 않게 한다 */}
                                                    <motion.button
                                                        whileTap={{ scale: 0.92 }}
                                                        onClick={(e) => { e.stopPropagation(); onSelectFriend(friend.id); }}
                                                        title={t("h2h.viewTitle")}
                                                        className="w-12 h-12 rounded-tile bg-surface-2 flex items-center justify-center transition-all hover:bg-brand/10 group/btn"
                                                    >
                                                        <LucideTarget className="w-5 h-5 text-ink-3 transition-colors group-hover/btn:text-brand" />
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
