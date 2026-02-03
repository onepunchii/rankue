import { motion } from "framer-motion";
import { Stamp } from "@/golf/hooks/usePassportData";
import { cn } from "@/lib/utils";

export const StampList = ({ stamps }: { stamps: Stamp[] }) => {
    return (
        <motion.div
            key="stamp"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="grid grid-cols-3 gap-3 p-2"
        >
            {stamps.map((stamp, i) => {
                // 회전 각도 (약간의 랜덤성)
                const rotation = ((i * 13) % 12) - 6;

                return (
                    <div
                        key={stamp.id}
                        className="relative aspect-[4/5] bg-white/[0.02] border border-white/5 rounded-xl flex items-center justify-center overflow-hidden group hover:bg-white/[0.04] transition-colors"
                    >
                        {/* 여권 페이지의 은은한 가이드라인 (선택사항) */}
                        <div className="absolute inset-2 border border-dashed border-white/5 rounded-lg opacity-50" />

                        <motion.div
                            initial={{ opacity: 0, scale: 1.5, rotate: rotation, filter: "blur(5px)" }}
                            animate={{ opacity: 1, scale: 0.9, rotate: rotation, filter: "blur(0px)" }}
                            transition={{
                                default: { type: "spring", stiffness: 200, damping: 18, delay: i * 0.05 },
                                filter: { duration: 0.5, ease: "easeOut", delay: i * 0.05 }
                            }}
                            className="relative w-[90%] aspect-square flex items-center justify-center"
                        >
                            {/* 스탬프 본체 (원형) */}
                            <div
                                className={cn(
                                    "w-full h-full rounded-full border-[2px] border-double flex flex-col items-center justify-center text-center p-1 backdrop-blur-[1px] transition-transform duration-300 hover:scale-105",
                                )}
                                style={{
                                    borderColor: stamp.color,
                                    backgroundColor: `${stamp.color}05`,
                                    boxShadow: `0 0 10px ${stamp.color}10, inset 0 0 10px ${stamp.color}05`
                                }}
                            >
                                {/* 날짜 */}
                                <span className="text-[7px] font-bold tracking-tight opacity-70 font-mono mb-0.5" style={{ color: stamp.color }}>
                                    {stamp.date}
                                </span>

                                {/* 구장명 (줄바꿈 허용, 글자 크기 조정) */}
                                <h4
                                    className="text-[10px] font-black leading-tight mb-1 break-keep w-full px-1 drop-shadow-md line-clamp-2"
                                    style={{ color: stamp.color, textShadow: `0 0 5px ${stamp.color}30` }}
                                >
                                    {stamp.name}
                                </h4>

                                {/* 구분선 */}
                                <div className="w-1/2 h-[0.5px] mb-1 opacity-40 mx-auto" style={{ backgroundColor: stamp.color }} />

                                {/* 점수 */}
                                <div className="flex items-baseline gap-0.5 mb-1">
                                    <span
                                        className="text-2xl font-black italic tracking-tighter leading-none"
                                        style={{ color: stamp.color, textShadow: `0 0 8px ${stamp.color}40` }}
                                    >
                                        {stamp.score}
                                    </span>
                                    <span
                                        className="text-[6px] font-bold uppercase tracking-wide opacity-70"
                                        style={{ color: stamp.color }}
                                    >
                                        TASU
                                    </span>
                                </div>

                                {/* 지역 */}
                                <span
                                    className="text-[6px] font-bold uppercase tracking-[0.15em] opacity-50"
                                    style={{ color: stamp.color }}
                                >
                                    {stamp.region}
                                </span>
                            </div>
                        </motion.div>
                    </div>
                );
            })}
        </motion.div>
    );
};
