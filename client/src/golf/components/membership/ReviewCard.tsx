import { LucideCheckCircle2, LucideStar } from "lucide-react";

interface ReviewCardProps {
    review: {
        id: number;
        user: string;
        tier: string;
        date: string;
        score: number;
        verified: boolean;
        content: string;
        ratings: { course: number; green: number; service: number };
        specs: { speed: number; fee: number; difficulty: string };
        tags: string[];
    };
}

export function ReviewCard({ review }: ReviewCardProps) {
    return (
        <div className="bg-[#1E1E1E] rounded-[2rem] p-6 relative overflow-hidden border border-white/5 shadow-lg">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center font-black text-xs text-white/40 shrink-0 border border-white/5">
                        {review.user[0]}
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-black text-white">{review.user}</span>
                            {review.verified && <LucideCheckCircle2 className="w-3.5 h-3.5 text-[#64DD17]" />}
                            <div className="px-1.5 py-0.5 rounded bg-white/10 border border-white/5 text-[9px] font-bold text-[#FFD700]">
                                {review.tier}
                            </div>
                        </div>
                        <div className="text-[10px] text-white/30 font-bold mt-0.5">{review.date} • 30대 남성</div>
                    </div>
                </div>
                <div className="text-2xl font-black text-[#64DD17] tracking-tighter leading-none flex items-center gap-1">
                    🏆 {review.score}타
                </div>
            </div>

            <div className="grid grid-cols-2 gap-6 relative mb-6">
                <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/10 -translate-x-1/2" />
                <div className="space-y-3 pr-2">
                    <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold text-white/40">코스</span>
                        <div className="flex items-center gap-1">
                            <LucideStar className="w-3 h-3 text-amber-400 fill-amber-400" />
                            <span className="text-xs font-black text-white">{review.ratings.course}.0</span>
                        </div>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold text-white/40">그린</span>
                        <div className="flex items-center gap-1">
                            <LucideStar className="w-3 h-3 text-amber-400 fill-amber-400" />
                            <span className="text-xs font-black text-white">{review.ratings.green}.0</span>
                        </div>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold text-white/40">서비스</span>
                        <div className="flex items-center gap-1">
                            <LucideStar className="w-3 h-3 text-amber-400 fill-amber-400" />
                            <span className="text-xs font-black text-white">{review.ratings.service}.0</span>
                        </div>
                    </div>
                </div>
                <div className="space-y-3 pl-2">
                    <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold text-white/40">스피드</span>
                        <span className="text-xs font-black text-white">{review.specs.speed}m</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold text-white/40">그린피</span>
                        <span className="text-xs font-black text-white">{review.specs.fee / 10000}만</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold text-white/40">난이도</span>
                        <span className="text-xs font-black text-white">{review.specs.difficulty}</span>
                    </div>
                </div>
            </div>

            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                {review.tags.map(tag => (
                    <span key={tag} className="px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-[10px] font-bold text-white/60 shrink-0">
                        {tag}
                    </span>
                ))}
            </div>
        </div>
    );
}
