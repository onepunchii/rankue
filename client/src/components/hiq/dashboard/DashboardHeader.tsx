import { ChevronsUp, HelpCircle, Award } from "lucide-react";
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

// Flat, tasteful tier accents (no gloss, no emoji) — text + tint pair per tier.
const TIER_STYLE: Record<string, { text: string; bg: string }> = {
    "플래티넘": { text: "text-[#0f766e]", bg: "bg-[#0f766e]/10" },
    "골드": { text: "text-[#b8860b]", bg: "bg-[#cba258]/15" },
    "실버": { text: "text-[#64748b]", bg: "bg-[#64748b]/12" },
    "브론즈": { text: "text-[#a56a3a]", bg: "bg-[#a56a3a]/12" },
};

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
    const tierStyle = TIER_STYLE[tier.label] || TIER_STYLE["브론즈"];

    return (
        <header className="pt-7 pb-2">
            {/* Top bar: greeting + profile */}
            <div className="flex items-end justify-between mb-7">
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

                <div className="flex items-center gap-2.5 shrink-0">
                    <div className={cn(
                        "flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[12px] font-semibold",
                        tierStyle.bg, tierStyle.text
                    )}>
                        <Award className="w-3.5 h-3.5" strokeWidth={2.2} />
                        <span>{tier.label}</span>
                    </div>
                    <Avatar className="w-11 h-11 rounded-2xl">
                        <AvatarImage src={member?.profileImageUrl || undefined} className="object-cover" />
                        <AvatarFallback className="rounded-2xl bg-brand/10 text-brand font-bold text-lg">
                            {member?.name?.[0]}
                        </AvatarFallback>
                    </Avatar>
                </div>
            </div>

            {/* Rating cards — clean flat white, single green accent */}
            <div className="grid grid-cols-2 gap-3">
                {/* 3-Cushion */}
                <motion.div
                    whileTap={{ scale: 0.98 }}
                    className="rounded-2xl p-5 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
                >
                    <div className="flex items-center justify-between mb-4">
                        <span className="text-[14px] font-bold text-brand tracking-tight">3쿠션</span>
                        <div className="text-right">
                            <span className="block text-[11px] font-medium text-black/40 leading-none">평균</span>
                            <span className="block text-[16px] font-semibold text-ink-1 tabular-nums leading-tight mt-0.5">{liveAvg3c}</span>
                        </div>
                    </div>

                    <div className="flex items-baseline gap-1.5">
                        <span className="text-[42px] leading-[0.9] font-bold text-ink-1 tabular-nums tracking-tight">{member.rating3c || 0}</span>
                        <span className="text-[14px] font-bold text-brand">RP</span>
                        <button onClick={onOpenRpGuide} className="ml-0.5 text-brand/40 hover:text-brand transition-colors">
                            <HelpCircle className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="mt-4">
                        {pct3c ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-brand/10 text-[12px] font-semibold text-brand">
                                <ChevronsUp className="w-3.5 h-3.5" />
                                상위 {pct3c}%
                            </span>
                        ) : (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-brand/10 text-[12px] font-semibold text-brand">
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
                    <div className="flex items-center justify-between mb-4">
                        <span className="text-[14px] font-bold text-ink-1 tracking-tight">4구</span>
                        <div className="text-right">
                            <span className="block text-[11px] font-medium text-black/40 leading-none">평균</span>
                            <span className="block text-[16px] font-semibold text-ink-1 tabular-nums leading-tight mt-0.5">{liveAvg4c}</span>
                        </div>
                    </div>

                    <div className="flex items-baseline gap-1.5">
                        <span className="text-[42px] leading-[0.9] font-bold text-ink-1 tabular-nums tracking-tight">{member.rating4c || 0}</span>
                        <span className="text-[14px] font-bold text-brand">RP</span>
                        <button onClick={onOpenRpGuide} className="ml-0.5 text-brand/40 hover:text-brand transition-colors">
                            <HelpCircle className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="mt-4">
                        <span className={cn(
                            "inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-brand/[0.07] text-[12px] font-semibold",
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
