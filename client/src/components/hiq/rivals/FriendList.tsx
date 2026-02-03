
import { motion, AnimatePresence } from "framer-motion";
import { LucideUsers, LucideTarget } from "lucide-react";
import { cn } from "@/lib/utils";
import { HiqMemberWithH2H, SportConfig } from "./types";
import { getTier } from "@/lib/hiqUtils";
import { Button } from "@/components/ui/button";

interface FriendListProps {
    friends: HiqMemberWithH2H[];
    config: SportConfig;
    currentSport: string;
    onSelectFriend: (id: string) => void;
    onSearchOpen: () => void;
}

export const FriendList = ({ friends, config, currentSport, onSelectFriend, onSearchOpen }: FriendListProps) => {
    return (
        <div className="space-y-8 relative z-10">
            <div className="flex items-center justify-between px-2">
                <div className="flex items-center gap-3">
                    <LucideUsers className={cn("w-5 h-5", config.themeColor)} />
                    <h2 className="text-[10px] font-black text-white/30 tracking-[0.3em] uppercase">
                        {config.label} 리스트
                    </h2>
                </div>
                <div className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[9px] font-black text-white/40 uppercase tracking-widest">
                    {friends.length} Members
                </div>
            </div>

            {friends.length === 0 ? (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="py-24 flex flex-col items-center text-center bg-white/[0.03] border border-white/5 rounded-[3rem] backdrop-blur-sm"
                >
                    <div className="w-24 h-24 rounded-[2rem] bg-white/[0.03] border border-white/10 flex items-center justify-center mb-8 relative">
                        <LucideUsers className="w-10 h-10 text-white/10" />
                        <div className={cn("absolute inset-0 blur-2xl rounded-full", config.bgLight)} />
                    </div>
                    <h3 className="text-2xl font-black mb-3 text-white tracking-tighter">
                        {config.emptyTitle}
                    </h3>
                    <p className="text-xs text-white/30 font-bold mb-10 leading-relaxed uppercase tracking-widest">
                        Find your {config.emptyDesc} and<br />Play together
                    </p>
                    <Button
                        onClick={onSearchOpen}
                        className={cn(
                            "px-12 h-16 text-black font-black rounded-2xl text-sm shadow-2xl active:scale-95 transition-all outline-none ring-0",
                            config.bgColor,
                            "hover:opacity-90"
                        )}
                    >
                        {currentSport === "GOLF" ? "친구 검색하기" : "라이벌 검색하기"}
                    </Button>
                </motion.div>
            ) : (
                <div className="grid grid-cols-1 gap-4">
                    <AnimatePresence>
                        {friends.map((friend, idx) => {
                            const handi = currentSport === "GOLF" ? friend.golfHandicap : friend.handi4c;
                            const tier = getTier(handi || 0, false, currentSport);
                            return (
                                <motion.div
                                    key={friend.id}
                                    initial={{ opacity: 0, scale: 0.98 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    transition={{ delay: idx * 0.05 }}
                                >
                                    <div className="bg-white/[0.03] p-7 rounded-[2.5rem] border border-white/5 hover:border-white/10 transition-all group relative overflow-hidden">
                                        <div className={cn("absolute top-0 right-0 w-32 h-32 blur-[60px] rounded-full opacity-0 group-hover:opacity-100 transition-opacity", config.bgLight)} />

                                        <div className="flex items-center justify-between relative z-10">
                                            <div className="flex items-center gap-6">
                                                <div className="relative">
                                                    <div className="w-16 h-16 rounded-[1.5rem] bg-black/20 border border-white/10 flex items-center justify-center text-3xl group-hover:scale-105 transition-transform shadow-inner">
                                                        {tier.icon}
                                                    </div>
                                                    <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-[#0A0A0A] flex items-center justify-center p-0.5 border border-white/5">
                                                        <div className={cn("w-full h-full rounded-full animate-pulse", config.bgColor)} />
                                                    </div>
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-3 mb-1.5">
                                                        <h3 className="text-xl font-black text-white tracking-tighter">{friend.name}</h3>
                                                        {currentSport !== "GOLF" && (
                                                            friend.h2h ? (
                                                                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/40 border border-white/10 shadow-sm">
                                                                    <span className="text-[11px] font-black text-[#10b981]">{friend.h2h.wins}승</span>
                                                                    <div className="w-0.5 h-2 bg-white/10 rounded-full" />
                                                                    <span className="text-[11px] font-black text-[#ef4444]">{friend.h2h.losses}패</span>
                                                                </div>
                                                            ) : (
                                                                <div className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/5">
                                                                    <span className="text-[10px] font-black text-white/20">전적 없음</span>
                                                                </div>
                                                            )
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <div className={cn("px-3 py-1 rounded-full border bg-white/5 text-[9px] font-black uppercase tracking-widest", tier.class)}>
                                                            {tier.label}
                                                        </div>
                                                        <div className="w-1 h-1 rounded-full bg-white/10" />
                                                        <span className="text-[10px] font-black text-white/30 uppercase tracking-widest">
                                                            {currentSport === "GOLF"
                                                                ? `HDCP ${friend.golfHandicap || 0}`
                                                                : `AVG ${((friend.avg3c || 0) > 0 ? friend.avg3c : (friend.avg4c || 0))?.toFixed(2)}`}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                            {currentSport !== "GOLF" && (
                                                <motion.button
                                                    whileTap={{ scale: 0.92 }}
                                                    onClick={() => onSelectFriend(friend.id)}
                                                    className={cn(
                                                        "w-14 h-14 rounded-2xl bg-white/[0.03] border flex items-center justify-center transition-all group/btn",
                                                        "hover:bg-[#10b981]/10 border-white/10 hover:border-[#10b981]/30"
                                                    )}
                                                >
                                                    <LucideTarget className="w-6 h-6 text-white/20 group-hover:scale-110 transition-all group-hover/btn:text-[#10b981]" />
                                                </motion.button>
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
