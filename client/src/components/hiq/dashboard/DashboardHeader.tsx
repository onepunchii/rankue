import { ChevronsUp, HelpCircle, Bell, MessageSquare } from "@/lib/icons";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { BallCluster } from "../ui/BilliardBall";
import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { NotificationInbox } from "@/components/hiq/menu/NotificationInbox";

interface DashboardHeaderProps {
    member: any;
    onOpenRpGuide: () => void;
    liveAvg3c: string;
    liveAvg4c: string;
    getPercentile: (type: '3c' | '4c') => number | null;
    getTrend: () => { label: string, color: string, icon: React.ReactNode };
    tier: { label: string, class: string, icon: string };
}

export const DashboardHeader = ({
    member,
    onOpenRpGuide,
    liveAvg3c,
    liveAvg4c,
    getPercentile,
    getTrend,
    tier
}: DashboardHeaderProps) => {
    const pct3c = getPercentile('3c');
    const trend = getTrend();
    const [, setLocation] = useLocation();
    const [notifOpen, setNotifOpen] = useState(false);
    const { data: notifs } = useQuery<any[]>({ queryKey: ["/api/hiq/notifications"] });
    const unread = notifs?.filter((n) => !n.isRead).length || 0;

    return (
        <header className="pt-7 pb-2">
            {/* Top bar: greeting + profile */}
            <div className="flex items-center justify-between mb-7 gap-3">
                <div className="min-w-0">
                    <div className="inline-flex items-center gap-1.5 mb-2.5 px-2.5 py-1 rounded-full bg-brand/10">
                        <span className="w-1.5 h-1.5 rounded-full bg-brand" />
                        <span className="text-[11px] font-bold text-brand tracking-tight">당구 모드</span>
                    </div>
                    <h1 className="text-[26px] leading-none font-bold text-ink-1 tracking-tight truncate">
                        {member?.nickname || member?.name}
                        <span className="text-[15px] font-medium text-black/40 ml-1">님</span>
                    </h1>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    <button
                        onClick={() => setNotifOpen(true)}
                        title="알림"
                        className="relative w-11 h-11 rounded-full bg-brand/10 flex items-center justify-center active:scale-95 transition-transform"
                    >
                        <Bell className="w-[21px] h-[21px] text-brand" />
                        {unread > 0 && (
                            <span className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-red-500 ring-2 ring-[#f2f0eb]" />
                        )}
                    </button>
                    <button
                        onClick={() => setLocation("/club")}
                        title="메세지"
                        className="w-11 h-11 rounded-full bg-brand/10 flex items-center justify-center active:scale-95 transition-transform"
                    >
                        <MessageSquare className="w-[21px] h-[21px] text-brand" />
                    </button>
                </div>
            </div>

            <NotificationInbox open={notifOpen} onClose={() => setNotifOpen(false)} />

            {/* Rating cards — clean flat white, single green accent */}
            <div className="grid grid-cols-2 gap-3">
                {/* 3-Cushion */}
                <motion.div
                    whileTap={{ scale: 0.98 }}
                    className="rounded-2xl p-5 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
                >
                    <div className="flex items-start justify-between mb-3">
                        <span className="text-[14px] font-bold text-brand tracking-tight">3쿠션</span>
                        <BallCluster colors={["white", "yellow", "red"]} size={22} />
                    </div>

                    <div className="flex items-baseline gap-1.5">
                        <span className="text-[42px] leading-[0.9] font-bold text-ink-1 tabular-nums tracking-tight">{member.rating3c || 0}</span>
                        <span className="text-[14px] font-bold text-brand">RP</span>
                        <button onClick={onOpenRpGuide} className="ml-0.5 text-brand/40 hover:text-brand transition-colors">
                            <HelpCircle className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-2">
                        <span className="text-[12px] font-medium text-black/45 tabular-nums shrink-0">평균 {liveAvg3c}</span>
                        {pct3c ? (
                            <span className="inline-flex items-center gap-0.5 px-2 py-1 rounded-full bg-brand/10 text-[12px] font-semibold text-brand">
                                <ChevronsUp className="w-3.5 h-3.5" />
                                상위 {pct3c}%
                            </span>
                        ) : (
                            <span className="inline-flex items-center px-2 py-1 rounded-full bg-brand/10 text-[12px] font-semibold text-brand">
                                분석 중
                            </span>
                        )}
                    </div>
                </motion.div>

                {/* 4-Ball */}
                <motion.div
                    whileTap={{ scale: 0.98 }}
                    className="rounded-2xl p-5 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
                >
                    <div className="flex items-start justify-between mb-3">
                        <span className="text-[14px] font-bold text-ink-1 tracking-tight">4구</span>
                        <BallCluster colors={["white", "yellow", "red", "red"]} size={22} />
                    </div>

                    <div className="flex items-baseline gap-1.5">
                        <span className="text-[42px] leading-[0.9] font-bold text-ink-1 tabular-nums tracking-tight">{member.rating4c || 0}</span>
                        <span className="text-[14px] font-bold text-brand">RP</span>
                        <button onClick={onOpenRpGuide} className="ml-0.5 text-brand/40 hover:text-brand transition-colors">
                            <HelpCircle className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-2">
                        <span className="text-[12px] font-medium text-black/45 tabular-nums shrink-0">평균 {liveAvg4c}</span>
                        <span className={cn(
                            "inline-flex items-center gap-0.5 px-2 py-1 rounded-full bg-brand/[0.07] text-[12px] font-semibold",
                            trend.color
                        )}>
                            {trend.icon}
                            {trend.label}
                        </span>
                    </div>
                </motion.div>
            </div>
        </header>
    );
};
