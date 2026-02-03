import { ChevronsUp, ChevronUp, HelpCircle, LucideZap } from "lucide-react";
import { HiqMember } from "@shared/schema";
import { motion } from "framer-motion";

interface DashboardHeaderProps {
    member: HiqMember;
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

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative z-10 mb-8 pt-4"
        >
            <div className="flex items-center justify-between mb-8 px-2">
                <div className="space-y-2">
                    <div className="flex items-center gap-2">
                        <div className="h-1.5 w-1.5 rounded-full bg-[#10b981] shadow-[0_0_8px_#10b981]" />
                        <span className="text-[10px] font-black text-[#10b981]/60 tracking-[0.2em] uppercase">Player Active</span>
                    </div>
                    <div className="flex flex-col">
                        <h2 className="text-4xl font-black text-white tracking-tighter leading-tight">
                            {member.name}님
                        </h2>

                    </div>
                    <div className="flex items-center gap-2 mt-4">
                        <div className="px-3 py-1 rounded-full bg-white/5 border border-white/10 backdrop-blur-md flex items-center gap-2">
                            <span className="text-[9px] font-black text-white/40 uppercase">Lv.{Math.floor((member.visitCount || 0) / 5) + 1}</span>
                        </div>
                        <div className={`px-3 py-1 rounded-full border flex items-center gap-2 ${tier.class} bg-white/5 backdrop-blur-md`}>
                            <span className="text-[9px] font-black uppercase">{tier.label} TIER</span>
                        </div>

                    </div>
                </div>
                <div className="relative group">
                    <div className="absolute inset-0 bg-[#10b981]/20 blur-3xl rounded-full opacity-50" />
                    <div className="w-20 h-20 rounded-[2rem] bg-white/[0.03] border border-white/10 flex items-center justify-center text-4xl shadow-2xl backdrop-blur-xl relative z-10">
                        {tier.icon}
                    </div>
                </div>
            </div>

            {/* Score Grid */}
            <div className="grid grid-cols-2 gap-4">
                <motion.div
                    whileHover={{ y: -5 }}
                    className="bg-white/[0.03] p-6 rounded-[2.5rem] border border-white/5 relative overflow-hidden group backdrop-blur-sm"
                >
                    <div className="flex flex-col">
                        <span className="text-[10px] font-black text-[#10b981] tracking-[0.2em] uppercase mb-1">3-Cushion</span>
                        <span className="text-[8px] font-bold text-white/20 uppercase tracking-widest mb-4">MATCH RATING</span>
                    </div>
                    <div className="flex items-baseline gap-2">
                        <h3 className="text-5xl font-black text-white tracking-tighter">{member.rating3c || 0}</h3>
                        <span className="text-sm font-bold text-[#10b981] ml-1">RP</span>
                        <button onClick={onOpenRpGuide} className="ml-1 opacity-50 hover:opacity-100 transition-opacity">
                            <HelpCircle className="w-4 h-4 text-[#10b981]" />
                        </button>
                    </div>
                    <div className="absolute top-6 right-6 flex flex-col items-end">
                        <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">AVG</span>
                        <span className="text-xl font-black text-white tracking-tight">{liveAvg3c}</span>
                    </div>
                    <div className="mt-6 flex items-center gap-1.5 text-[10px] font-black text-[#10b981] bg-[#10b981]/10 w-fit px-3 py-1 rounded-full border border-[#10b981]/20">
                        {getPercentile('3c') ? (
                            <>
                                <ChevronsUp className="w-3 h-3" />
                                <span>TOP {getPercentile('3c')}%</span>
                            </>
                        ) : (
                            <span className="text-white/20 uppercase italic">ANALYZING...</span>
                        )}
                    </div>
                </motion.div>

                <motion.div
                    whileHover={{ y: -5 }}
                    className="bg-white/[0.03] p-6 rounded-[2.5rem] border border-white/5 relative overflow-hidden group backdrop-blur-sm"
                >
                    <div className="flex flex-col">
                        <span className="text-[10px] font-black text-white/40 tracking-[0.2em] uppercase mb-1">4-Ball</span>
                        <span className="text-[8px] font-bold text-white/20 uppercase tracking-widest mb-4">MATCH RATING</span>
                    </div>
                    <div className="flex items-baseline gap-2">
                        <h3 className="text-5xl font-black text-white tracking-tighter">{member.rating4c || 0}</h3>
                        <span className="text-sm font-bold text-white/40 ml-1">RP</span>
                        <button onClick={onOpenRpGuide} className="ml-1 opacity-30 hover:opacity-100 transition-opacity">
                            <HelpCircle className="w-4 h-4 text-white" />
                        </button>
                    </div>
                    <div className="absolute top-6 right-6 flex flex-col items-end">
                        <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">AVG</span>
                        <span className="text-xl font-black text-white tracking-tight">{liveAvg4c}</span>
                    </div>
                    <div className={`mt-6 flex items-center gap-1.5 text-[10px] font-black ${getTrend().color} bg-white/5 w-fit px-3 py-1 rounded-full border border-white/10`}>
                        {getTrend().icon}
                        <span className="uppercase">{getTrend().label}</span>
                    </div>
                </motion.div>
            </div>
        </motion.div>
    );
};
