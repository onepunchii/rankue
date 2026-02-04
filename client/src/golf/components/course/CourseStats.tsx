import { LucideMapPin, LucideFlag, LucideLeaf, LucideInfo } from "lucide-react";

interface CourseStatsProps {
    course: any;
}

export function CourseStats({ course }: CourseStatsProps) {
    return (
        <div className="space-y-12">
            {/* Spec Bar */}
            <section className="flex justify-between items-center py-4 relative">
                {/* Vertical Divider 1 */}
                <div className="absolute left-1/3 top-1/2 -translate-y-1/2 w-px h-8 bg-white/10" />
                {/* Vertical Divider 2 */}
                <div className="absolute right-1/3 top-1/2 -translate-y-1/2 w-px h-8 bg-white/10" />

                <div className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-xs text-[#AAAAAA] font-medium flex items-center gap-1.5">
                        <LucideMapPin className="w-3.5 h-3.5 text-[#64DD17]" />
                        위치
                    </span>
                    <span className="text-base font-bold text-white tracking-tight">{course.originalRegion} • 용인시</span>
                </div>

                <div className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-xs text-[#AAAAAA] font-medium flex items-center gap-1.5">
                        <LucideFlag className="w-3.5 h-3.5 text-[#64DD17]" />
                        코스
                    </span>
                    <span className="text-base font-bold text-white tracking-tight">{course.holes}홀 (Par 144)</span>
                </div>

                <div className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-xs text-[#AAAAAA] font-medium flex items-center gap-1.5">
                        <LucideLeaf className="w-3.5 h-3.5 text-[#64DD17]" />
                        잔디
                    </span>
                    <span className="text-base font-bold text-white tracking-tight">{course.grass}</span>
                </div>
            </section>

            {/* Analysis Chart */}
            <section>
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-black italic tracking-widest uppercase flex items-center gap-2">
                        <div className="w-1 h-4 bg-amber-400" />
                        랭큐 코스 분석
                    </h3>
                    <LucideInfo className="w-4 h-4 text-white/20" />
                </div>

                <div className="space-y-8 px-2">
                    {/* Difficulty Bar */}
                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-xs font-black uppercase text-white/40">난이도</span>
                            <span className="text-xs font-black text-[#64DD17]">{course.difficulty}</span>
                        </div>
                        <div className="h-1.5 bg-white/10 rounded-full relative flex items-center">
                            <div className="absolute left-[85%] -translate-x-1/2 w-4 h-4 rounded-full bg-[#0A0A0A] border-2 border-[#64DD17] shadow-[0_0_10px_rgba(100,221,23,0.4)] z-10" />
                            <div className="h-full w-[85%] bg-gradient-to-r from-emerald-500/50 via-amber-500/50 to-[#64DD17] rounded-full opacity-50" />
                        </div>
                        <p className="text-[10px] font-bold text-white/30 mt-3 text-right italic">"평균 핸디캡 +12 이상 싱글러들에게 도전적인 코스입니다."</p>
                    </div>

                    {/* Course Style Tags */}
                    <div className="flex flex-wrap gap-2">
                        {["#넓은페어웨이", "#전장김", "#여성우대", "#벙커지옥", "#명문프리미엄", "#양탄자잔디"].map(tag => (
                            <span key={tag} className="px-3 py-1.5 rounded-full border border-white/20 text-[10px] font-bold text-white/50 bg-transparent">
                                {tag}
                            </span>
                        ))}
                    </div>
                </div>
            </section>
        </div>
    );
}
