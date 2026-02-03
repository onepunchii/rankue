import { Link } from "wouter";
import { motion } from "framer-motion";
import { LucideCrown } from "lucide-react";
import { COURSES } from "@/golf/data/golfCourses";

interface Props {
    conqueredCount: number;
}

export const Elite60Banner = ({ conqueredCount }: Props) => {
    return (
        <section className="mt-12 mb-8">
            <Link href="/golf/elite60">
                <div className="bg-gradient-to-br from-amber-500/20 to-transparent rounded-[2rem] p-6 border border-amber-500/20 relative overflow-hidden group cursor-pointer active:scale-95 transition-all">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-125 transition-transform duration-700">
                        <LucideCrown className="w-24 h-24 text-amber-400 rotate-12" />
                    </div>
                    {/* Elite 60 Content */}
                    <div className="flex items-center justify-between mb-4 relative z-10">
                        <div>
                            <h3 className="text-base font-black italic tracking-tight uppercase text-amber-400">RANKUE ELITE 60</h3>
                            <p className="text-[10px] font-bold text-amber-400/60">대한민국 골프 대동여지도 리스트</p>
                        </div>
                        <div className="text-right">
                            <div className="text-xl font-black text-amber-400 leading-none">
                                {conqueredCount}
                                <span className="text-xs text-amber-400/40 ml-1">/ 60</span>
                            </div>
                            <div className="text-[8px] font-black text-amber-400/40 uppercase mt-1">Conquered</div>
                        </div>
                    </div>
                    {/* Progress Bar */}
                    <div className="h-2 bg-amber-400/10 rounded-full overflow-hidden mb-2 relative z-10">
                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${(conqueredCount / 60) * 100}%` }}
                            transition={{ duration: 1, ease: "easeOut" }}
                            className="h-full bg-amber-400 shadow-[0_0_15px_rgba(251,191,36,0.6)]"
                        />
                    </div>
                    <p className="text-[9px] font-bold text-amber-400/50 relative z-10 italic">"상위 1%의 증명: 명문 구장 정복으로 랭큐의 전설이 되세요."</p>
                </div>
            </Link>
        </section>
    );
};
