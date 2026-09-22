import { motion } from "framer-motion";

interface HandicapCardProps {
    member: any;
    avgScore?: string | number;
}

export function HandicapCard({ member, avgScore }: HandicapCardProps) {
    // Priority: DB Average Score (Master) -> '-'
    const displayScore = (avgScore && avgScore !== "0" && avgScore !== 0 && avgScore !== "-")
        ? (typeof avgScore === 'number' ? avgScore.toFixed(1) : avgScore)
        : (member?.golfAvgScore ? Number(member.golfAvgScore).toFixed(1) : '0.0');

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8 relative z-10"
        >
            {/* 윗줄 "GOLF HANDICAP" 은 뺐다(2026-09-23 오너) — 바로 아래 큰 숫자 옆 HDCP 가 같은 말을 한다. */}
            <div className="flex flex-col items-center justify-center py-6">
                <div className="flex items-baseline gap-2">
                    <span className="text-8xl font-black text-white tracking-tighter drop-shadow-2xl">
                        {displayScore}
                    </span>
                    <span className="text-xl font-black text-[#64DD17] italic tracking-tighter">HDCP</span>
                </div>


            </div>
        </motion.div>
    );
}
