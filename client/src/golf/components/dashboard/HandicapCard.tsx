import { motion } from "framer-motion";

interface HandicapCardProps {
    member: any;
}

export function HandicapCard({ member }: HandicapCardProps) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8 relative z-10"
        >
            <div className="flex flex-col items-center justify-center py-6">
                <span className="text-[10px] font-extrabold text-white/40 uppercase tracking-[0.3em] mb-2">CURRENT HANDICAP</span>
                <div className="flex items-baseline gap-1">
                    <span className="text-6xl font-extrabold text-white tracking-tighter drop-shadow-2xl">
                        {member?.golfHandicap ? `${member.golfHandicap > 0 ? '+' : ''}${member.golfHandicap}` : '+18'}
                    </span>
                    <span className="text-lg font-semibold text-[#64DD17]">HDCP</span>
                </div>

                <div className="flex items-center gap-2 mt-4">
                    <div className="px-4 py-1.5 rounded-full bg-[#64DD17] text-[#051907] font-extrabold text-xs uppercase tracking-widest shadow-lg shadow-[#64DD17]/20">
                        SEMIPRO
                    </div>
                </div>
            </div>
        </motion.div>
    );
}
