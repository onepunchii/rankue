import { motion } from "framer-motion";
import { LucideTrophy } from "lucide-react";

interface Props {
    stats: {
        total: number;
        conquered: number;
        progress: number;
    };
}

export const InsightBanner = ({ stats }: Props) => {
    return (
        <div className="px-6 mt-8">
            <div className="bg-gradient-to-br from-amber-500/10 to-transparent border border-amber-500/20 p-8 rounded-[2.5rem] relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-110 transition-transform duration-700">
                    <LucideTrophy className="w-24 h-24 text-amber-400 rotate-12" />
                </div>
                <h4 className="text-amber-400 text-xs font-black uppercase tracking-widest mb-2">명예의 전당 미션</h4>
                <p className="text-xl font-bold leading-tight mb-6">"대한민국 상위 1% 명문 60곳을<br />모두 정복하고 전설이 되세요."</p>
                <div className="flex items-center gap-4">
                    <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${stats.progress}%` }}
                            className="h-full bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]"
                        />
                    </div>
                    <span className="text-xs font-black text-amber-500">{Math.round(stats.progress)}%</span>
                </div>
            </div>
        </div>
    );
};
