import { motion } from "framer-motion";
import { LucideChevronLeft, LucideCamera, LucideCrown, LucideLock } from "lucide-react";
import { cn } from "@/lib/utils";

interface CourseHeroProps {
    course: any;
    courseImage: string;
    isConquered: boolean;
    conqueredInfo?: any;
    onBack: () => void;
    onCameraClick: () => void;
    placeholderImg: string;
}

export function CourseHero({
    course,
    courseImage,
    isConquered,
    conqueredInfo,
    onBack,
    onCameraClick,
    placeholderImg
}: CourseHeroProps) {
    return (
        <header className="relative h-[45vh] overflow-hidden">
            <div className="w-full h-full relative">
                <motion.img
                    initial={{ scale: 1.1 }}
                    animate={{ scale: 1 }}
                    transition={{ duration: 1.5 }}
                    src={courseImage}
                    className={cn("w-full h-full object-cover", !isConquered && "grayscale")}
                    alt={course.name}
                    onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        if (target.src.includes(placeholderImg)) return;
                        target.src = placeholderImg;
                    }}
                />
            </div>
            <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-[#0A0A0A]" />

            {/* Navigation */}
            <div className="absolute top-0 left-0 right-0 p-6 flex items-center justify-between z-30">
                <button
                    onClick={onBack}
                    className="p-2 -ml-2 rounded-full bg-black/20 backdrop-blur-md border border-white/10 text-white transition-all active:scale-90 shadow-2xl"
                    title="뒤로 가기"
                >
                    <LucideChevronLeft className="w-6 h-6" />
                </button>
                <div className="flex gap-2">
                    <button
                        onClick={onCameraClick}
                        className="p-2 rounded-full bg-black/20 backdrop-blur-md border border-white/10 text-white shadow-2xl transition-all active:scale-90"
                        title="사진 업로드"
                    >
                        <LucideCamera className="w-6 h-6" />
                    </button>
                </div>
            </div>

            {/* Hero Info */}
            <div className="absolute bottom-8 left-0 right-0 px-8 z-30">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="flex flex-col items-start gap-3"
                >
                    <div className="text-[9px] font-bold text-white/50 uppercase tracking-[0.2em]">{course.originalRegion}</div>
                    <div className="flex items-center gap-2">
                        {course.isRankue60 && (
                            <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-gradient-to-r from-amber-400 to-amber-600 shadow-[0_0_15px_rgba(251,191,36,0.3)]">
                                <LucideCrown className="w-2.5 h-2.5 text-amber-950 fill-amber-950" />
                                <span className="text-[8px] font-black text-amber-950 uppercase tracking-widest">RANKUE 60</span>
                            </div>
                        )}
                        <div className={cn(
                            "px-2 py-0.5 rounded bg-white/10 backdrop-blur-md border text-[8px] font-black uppercase tracking-widest",
                            course.type === 'Membership' ? "border-amber-500/50 text-amber-400" : "border-[#64DD17]/50 text-[#64DD17]"
                        )}>
                            {course.type === 'Membership' ? "[ M 회원제 ]" : "[ P 퍼블릭 ]"}
                        </div>
                    </div>
                    <h1 className="text-4xl font-black tracking-tighter drop-shadow-[0_4px_10px_rgba(0,0,0,0.5)]">
                        {course.name}
                    </h1>
                </motion.div>
            </div>

            {/* Conquest Status Badge */}
            <div className="absolute bottom-8 right-8 z-30">
                {isConquered ? (
                    <motion.div
                        initial={{ scale: 0, rotate: -30 }}
                        animate={{ scale: 1, rotate: -15 }}
                        className="bg-amber-400 text-amber-950 px-4 py-2 rounded-xl shadow-[0_0_20px_rgba(251,191,36,0.3)] flex flex-col items-center"
                    >
                        <span className="text-[7px] font-black uppercase tracking-[0.1em] mb-0.5 opacity-60">정복 완료</span>
                        <div className="flex items-baseline gap-0.5">
                            <span className="text-[8px] font-bold">BEST</span>
                            <span className="text-xl font-black">{conqueredInfo?.score}</span>
                        </div>
                    </motion.div>
                ) : (
                    <div className="bg-white/5 backdrop-blur-md border border-white/10 p-3 rounded-xl flex flex-col items-center opacity-40">
                        <LucideLock className="w-6 h-6 mb-1" />
                        <span className="text-[8px] font-black uppercase tracking-widest">Locked</span>
                    </div>
                )}
            </div>
        </header>
    );
}
