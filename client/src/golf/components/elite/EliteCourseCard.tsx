import { forwardRef } from 'react';
import { Link } from "wouter";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { LucideLock, LucideCrown, LucideTrophy, LucideFlag } from "lucide-react";

interface Props {
    course: any;
    conqueredInfo: any;
    savedImage: string | undefined;
}

export const EliteCourseCard = forwardRef<HTMLDivElement, Props>(({ course, conqueredInfo, savedImage }, ref) => {
    const isC = !!conqueredInfo;

    // Badge Configuration
    let badgeConfig = { color: "#555555", icon: LucideLock, label: "미정복" };
    if (isC) {
        const s = conqueredInfo.score;
        if (s < 80) badgeConfig = { color: "#FFD700", icon: LucideCrown, label: "레전드" };
        else if (s < 90) badgeConfig = { color: "#64DD17", icon: LucideTrophy, label: "마스터" };
        else if (s < 100) badgeConfig = { color: "#00E5FF", icon: LucideFlag, label: "챔피언" };
        else badgeConfig = { color: "#D500F9", icon: LucideFlag, label: "챌린저" };
    }

    const Icon = badgeConfig.icon;

    // Dynamic styles via CSS variables to avoid inline style lint errors
    const dynamicStyles = {
        '--badge-color': badgeConfig.color,
        '--badge-color-muted': `${badgeConfig.color}40`,
        '--course-image': savedImage ? `url(${savedImage})` : 'none',
    } as React.CSSProperties;

    return (
        <motion.div
            ref={ref}
            layout
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="relative group"
            style={dynamicStyles}
        >
            <Link href={`/golf/course/${course.id}`} className="block h-full">
                <div className={cn(
                    "flex flex-col items-center justify-center p-6 rounded-[2rem] border transition-all duration-300 h-full relative overflow-hidden",
                    isC ? "border-white/10" : "bg-[#0A0A0A] border-white/5 opacity-60"
                )}
                    style={{
                        backgroundImage: isC && savedImage ? 'var(--course-image)' : 'none',
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        backgroundColor: isC && savedImage ? 'transparent' : '#141414'
                    }}
                >
                    {/* Dark Overlay for Image */}
                    {isC && savedImage && (
                        <div className="absolute inset-0 bg-black/60 backdrop-blur-[1px]" />
                    )}
                    {/* Badge Circle */}
                    <div className="relative w-28 h-28 mb-4 shrink-0">
                        {/* Rotating Ring & Date Text */}
                        <svg viewBox="0 0 120 120" className="absolute inset-0 w-full h-full opacity-80">
                            <defs>
                                <path id={`curve-${course.id}`} d="M 28,95 A 50,50 0 0 1 28,25" />
                            </defs>
                            {/* Outer Dashed Ring */}
                            <circle
                                cx="60"
                                cy="60"
                                r="57"
                                fill="none"
                                stroke={isC ? 'var(--badge-color)' : "#333"}
                                strokeWidth="1.5"
                                strokeDasharray="4 3"
                                className="transition-all duration-500"
                                opacity="0.5"
                            />
                            {/* Inner Solid Ring */}
                            <circle
                                cx="60"
                                cy="60"
                                r="42"
                                fill="none"
                                stroke={isC ? 'var(--badge-color)' : "#333"}
                                strokeWidth="1"
                                opacity="0.2"
                            />
                            {/* Date Text on Curve */}
                            {isC && (
                                <text fontSize="7.5" fontWeight="900" fill="var(--badge-color)" letterSpacing="1px" opacity="0.6">
                                    <textPath href={`#curve-${course.id}`} startOffset="50%" textAnchor="middle">
                                        {conqueredInfo.date}
                                    </textPath>
                                </text>
                            )}
                        </svg>

                        {/* Center Icon Circle */}
                        <div className="absolute inset-0 flex items-center justify-center">
                            <div className={cn(
                                "w-14 h-14 rounded-full flex items-center justify-center border transition-all duration-500",
                                isC ? "bg-black/50 backdrop-blur-sm" : "bg-white/5 border-white/10"
                            )} style={{ borderColor: isC ? 'var(--badge-color-muted)' : '' }}>
                                <Icon
                                    className={cn("w-7 h-7 transition-all duration-500", isC ? "drop-shadow-[0_0_10px_rgba(0,0,0,0.5)]" : "text-white/20")}
                                    style={{ color: isC ? 'var(--badge-color)' : '' }}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Text Info */}
                    <div className="text-center w-full z-10">
                        <h3 className="text-sm font-black text-white mb-1.5 truncate w-full tracking-tight">
                            {course.name}
                        </h3>
                        {isC ? (
                            <div className="text-xs font-black tracking-wider uppercase" style={{ color: 'var(--badge-color)' }}>
                                베스트 {conqueredInfo.score}타
                            </div>
                        ) : (
                            <div className="text-[10px] font-bold text-white/20 uppercase tracking-widest">
                                {badgeConfig.label}
                            </div>
                        )}
                    </div>

                    {/* Glow Effect for Conquered */}
                    {isC && (
                        <div
                            className="absolute inset-0 opacity-10 blur-2xl pointer-events-none"
                            style={{ background: `radial-gradient(circle at 50% 40%, var(--badge-color), transparent 70%)` }}
                        />
                    )}
                </div>
            </Link>
        </motion.div>
    );
});

EliteCourseCard.displayName = "EliteCourseCard";
