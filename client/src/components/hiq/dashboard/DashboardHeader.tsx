import { ChevronsUp, HelpCircle } from "lucide-react";
import { motion } from "framer-motion";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

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

    return (
        <header className="pt-7 pb-2">
            {/* Top bar: greeting + profile */}
            <div className="flex items-end justify-between mb-7">
                <div className="min-w-0">
                    <div className="flex items-center gap-1.5 mb-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-brand" />
                        <span className="text-[12px] font-medium text-white/45 tracking-wide">당구 모드</span>
                    </div>
                    <h1 className="text-[26px] leading-none font-bold text-white tracking-tight truncate">
                        {member?.nickname || member?.name}
                        <span className="text-[15px] font-medium text-white/35 ml-1">님</span>
                    </h1>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                    <div className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[13px] font-semibold",
                        tier.class
                    )}>
                        <span className="text-[13px]">{tier.icon}</span>
                        <span>{tier.label}</span>
                    </div>
                    <Avatar className="w-12 h-12 rounded-2xl border border-white/10 ring-2 ring-white/[0.04]">
                        <AvatarImage src={member?.profileImageUrl || undefined} className="object-cover" />
                        <AvatarFallback className="rounded-2xl bg-[#1a1a1a] text-white/70 font-bold text-lg">
                            {member?.name?.[0]}
                        </AvatarFallback>
                    </Avatar>
                </div>
            </div>

            {/* Rating cards */}
            <div className="grid grid-cols-2 gap-3">
                {/* 3-Cushion — primary */}
                <motion.div
                    whileTap={{ scale: 0.98 }}
                    className="relative overflow-hidden rounded-[28px] p-5 border border-brand/20 bg-gradient-to-b from-brand/[0.08] to-white/[0.015]"
                >
                    <div className="absolute -top-14 -right-10 w-32 h-32 rounded-full bg-brand/10 blur-2xl pointer-events-none" />
                    <div className="relative">
                        <div className="flex items-center justify-between mb-4">
                            <span className="text-[14px] font-bold text-brand">3쿠션</span>
                            <div className="text-right">
                                <span className="block text-[12px] font-semibold text-white/35 leading-none">평균</span>
                                <span className="block text-[17px] font-bold text-white/90 tabular-nums leading-tight mt-0.5">{liveAvg3c}</span>
                            </div>
                        </div>

                        <div className="flex items-baseline gap-1.5">
                            <span className="text-[44px] leading-[0.9] font-bold text-white tabular-nums tracking-tight">{member.rating3c || 0}</span>
                            <span className="text-[15px] font-bold text-brand">RP</span>
                            <button onClick={onOpenRpGuide} className="ml-0.5 text-white/25 hover:text-brand transition-colors">
                                <HelpCircle className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="mt-4">
                            {pct3c ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-brand/12 border border-brand/20 text-[12px] font-bold text-brand">
                                    <ChevronsUp className="w-3.5 h-3.5" />
                                    상위 {pct3c}%
                                </span>
                            ) : (
                                <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-white/[0.04] text-[12px] font-medium text-white/40">
                                    분석 중
                                </span>
                            )}
                        </div>
                    </div>
                </motion.div>

                {/* 4-Ball — secondary */}
                <motion.div
                    whileTap={{ scale: 0.98 }}
                    className="relative overflow-hidden rounded-[28px] p-5 border border-white/[0.08] bg-white/[0.025]"
                >
                    <div className="flex items-center justify-between mb-4">
                        <span className="text-[14px] font-bold text-white/70">4구</span>
                        <div className="text-right">
                            <span className="block text-[12px] font-semibold text-white/35 leading-none">평균</span>
                            <span className="block text-[17px] font-bold text-white/90 tabular-nums leading-tight mt-0.5">{liveAvg4c}</span>
                        </div>
                    </div>

                    <div className="flex items-baseline gap-1.5">
                        <span className="text-[44px] leading-[0.9] font-bold text-white tabular-nums tracking-tight">{member.rating4c || 0}</span>
                        <span className="text-[15px] font-medium text-white/40">RP</span>
                        <button onClick={onOpenRpGuide} className="ml-0.5 text-white/45 hover:text-white/60 transition-colors">
                            <HelpCircle className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="mt-4">
                        <span className={cn(
                            "inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/[0.05] border border-white/[0.06] text-[12px] font-bold",
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
