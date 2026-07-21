import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { motion } from 'framer-motion';
import {
    LucideFlagTriangleRight,
    LucideMonitor,
    LucideBeer,
    LucideTrophy,
    LucideSparkles,
    LucideSwords,
    LucideTarget,
} from 'lucide-react';

// Types of Activity Categories based on your DB schema
type ActivityCategory =
    | "REGULAR_ROUNDING"
    | "BLITZ_ROUNDING"
    | "GOLF_TOUR"
    | "REGULAR_SCREEN"
    | "BLITZ_SCREEN"
    | "REGULAR_BILLIARDS"
    | "BLITZ_BILLIARDS"
    | "BILLIARDS_TOURNAMENT"
    | "AFTER_PARTY"
    | "SOCIAL"; // Fallback/Generic

interface MemberActivityStatsProps {
    activities: { category: string }[];
    totalCount: number;
    sportCategory?: 'GOLF' | 'BILLIARDS';
}

// ------------------------------------------------------------------
// 1. Data Classification Logic
// ------------------------------------------------------------------
const GOLF_TYPES = {
    FIELD: ['REGULAR_ROUNDING', 'BLITZ_ROUNDING', 'GOLF_TOUR'],
    SCREEN: ['REGULAR_SCREEN', 'BLITZ_SCREEN'],
    SOCIAL: ['AFTER_PARTY', 'SOCIAL']
};

const BILLIARDS_TYPES = {
    MEETING: ['REGULAR_BILLIARDS', 'BLITZ_BILLIARDS'],
    TOURNAMENT: ['BILLIARDS_TOURNAMENT'],
    SOCIAL: ['AFTER_PARTY', 'SOCIAL']
};

export function MemberActivityStats({ activities = [], totalCount = 0, sportCategory = 'GOLF' }: MemberActivityStatsProps) {
    const { t } = useT();

    // ------------------------------------------------------------------
    // 2. Persona / Stats Calculation
    // ------------------------------------------------------------------
    const stats = useMemo(() => {
        const isBilliards = sportCategory === 'BILLIARDS';
        const types = isBilliards ? BILLIARDS_TYPES : GOLF_TYPES;
        const group1Key = isBilliards ? 'MEETING' : 'FIELD';
        const group2Key = isBilliards ? 'TOURNAMENT' : 'SCREEN';

        // Count frequencies
        let group1Count = 0;
        let group2Count = 0;
        let socialCount = 0;

        activities.forEach(act => {
            if ((types as any)[group1Key].includes(act.category)) group1Count++;
            else if ((types as any)[group2Key].includes(act.category)) group2Count++;
            else if (types.SOCIAL.includes(act.category)) socialCount++;
        });

        // Determine Persona
        let persona = isBilliards
            ? {
                title: t("memberActivity.rookieCueTitle"),
                desc: t("memberActivity.rookieCueDesc"),
                color: "text-black/40",
                bg: "bg-black/[0.04]",
                border: "border-black/10",
                icon: LucideSparkles
            }
            : {
                title: t("memberActivity.rookieGolferTitle"),
                desc: t("memberActivity.rookieGolferDesc"),
                color: "text-black/40",
                bg: "bg-black/[0.04]",
                border: "border-black/10",
                icon: LucideSparkles
            };

        if (totalCount > 0 && activities.length > 0) {
            const maxVal = Math.max(group1Count, group2Count, socialCount);

            const isBalanced = totalCount >= 5 &&
                (group1Count > 0 && group2Count > 0 && socialCount > 0) &&
                (maxVal - Math.min(group1Count, group2Count, socialCount) <= 2);

            if (isBilliards) {
                // 당구 페르소나
                if (isBalanced) {
                    persona = {
                        title: t("memberActivity.allRounderCueTitle"),
                        desc: t("memberActivity.allRounderCueDesc"),
                        color: "text-[#8B5CF6]",
                        bg: "bg-[#8B5CF6]/10",
                        border: "border-[#8B5CF6]/20",
                        icon: LucideTrophy
                    };
                } else if (maxVal === group1Count) {
                    persona = {
                        title: t("memberActivity.tableRulerTitle"),
                        desc: t("memberActivity.tableRulerDesc"),
                        color: "text-brand",
                        bg: "bg-brand/12",
                        border: "border-brand/20",
                        icon: LucideTarget
                    };
                } else if (maxVal === group2Count) {
                    persona = {
                        title: t("memberActivity.tournamentAceTitle"),
                        desc: t("memberActivity.tournamentAceDesc"),
                        color: "text-[#F97316]",
                        bg: "bg-[#F97316]/10",
                        border: "border-[#F97316]/20",
                        icon: LucideSwords
                    };
                } else {
                    persona = {
                        title: t("memberActivity.moodMakerTitle"),
                        desc: t("memberActivity.moodMakerDesc"),
                        color: "text-[#EC4899]",
                        bg: "bg-[#EC4899]/10",
                        border: "border-[#EC4899]/20",
                        icon: LucideBeer
                    };
                }
            } else {
                // 골프 페르소나 (기존)
                if (isBalanced) {
                    persona = {
                        title: t("memberActivity.hexagonAllRounderTitle"),
                        desc: t("memberActivity.hexagonAllRounderDesc"),
                        color: "text-[#8B5CF6]",
                        bg: "bg-[#8B5CF6]/10",
                        border: "border-[#8B5CF6]/20",
                        icon: LucideTrophy
                    };
                } else if (maxVal === group1Count) {
                    persona = {
                        title: t("memberActivity.fieldHorseTitle"),
                        desc: t("memberActivity.fieldHorseDesc"),
                        color: "text-brand",
                        bg: "bg-brand/12",
                        border: "border-brand/20",
                        icon: LucideFlagTriangleRight
                    };
                } else if (maxVal === group2Count) {
                    persona = {
                        title: t("memberActivity.screenRulerTitle"),
                        desc: t("memberActivity.screenRulerDesc"),
                        color: "text-brand",
                        bg: "bg-brand/12",
                        border: "border-brand/20",
                        icon: LucideMonitor
                    };
                } else {
                    persona = {
                        title: t("memberActivity.hole19KingTitle"),
                        desc: t("memberActivity.hole19KingDesc"),
                        color: "text-[#F59E0B]",
                        bg: "bg-[#F59E0B]/10",
                        border: "border-[#F59E0B]/20",
                        icon: LucideBeer
                    };
                }
            }
        }

        // Labels & Colors per sportCategory
        const labels = isBilliards
            ? { group1: t("memberActivity.labelMeeting"), group2: t("memberActivity.labelTournament"), social: t("memberActivity.labelSocial") }
            : { group1: t("memberActivity.labelField"), group2: t("memberActivity.labelScreen"), social: t("memberActivity.labelSocial") };

        const colors = isBilliards
            ? { group1: 'bg-brand', group2: 'bg-[#F97316]', social: 'bg-[#EC4899]' }
            : { group1: 'bg-brand', group2: 'bg-[#F97316]', social: 'bg-[#F59E0B]' };

        return {
            group1: group1Count,
            group2: group2Count,
            social: socialCount,
            group1Pct: totalCount > 0 ? (group1Count / totalCount) * 100 : 0,
            group2Pct: totalCount > 0 ? (group2Count / totalCount) * 100 : 0,
            socialPct: totalCount > 0 ? (socialCount / totalCount) * 100 : 0,
            persona,
            labels,
            colors
        };
    }, [activities, totalCount, sportCategory, t]);


    // ------------------------------------------------------------------
    // 3. UI Rendering
    // ------------------------------------------------------------------
    if (totalCount === 0) {
        return (
            <div className="p-5 rk-card flex items-center justify-center min-h-[120px]">
                <div className="text-center space-y-2">
                    <div className="inline-flex p-3 rounded-full bg-black/[0.04] mb-1">
                        <LucideSparkles className="w-5 h-5 text-black/40" />
                    </div>
                    <div>
                        <h3 className="text-[15px] font-semibold text-black/60">{stats.persona.title}</h3>
                        <p className="text-xs text-black/55 mt-1 max-w-[200px] mx-auto leading-relaxed">
                            {stats.persona.desc}
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* 1. Persona Card */}
            <div className={cn(
                "p-5 rounded-card border",
                stats.persona.bg,
                stats.persona.border
            )}>
                <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-tile flex items-center justify-center bg-black/[0.04]">
                        <stats.persona.icon className={cn("w-6 h-6", stats.persona.color)} />
                    </div>
                    <div className="pt-0.5">
                        <h3 className={cn("text-base font-semibold tracking-tight flex items-center gap-2", stats.persona.color)}>
                            {stats.persona.title}
                        </h3>
                        <p className="text-[13px] text-black/55 mt-1 font-medium leading-relaxed">
                            {stats.persona.desc}
                        </p>
                    </div>
                </div>
            </div>

            {/* 2. Visual Stat Bar */}
            <div className="space-y-2 px-1">
                <div className="h-3 w-full bg-black/[0.06] rounded-full overflow-hidden flex">
                    {/* Group 1 Segment */}
                    {stats.group1 > 0 && (
                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${stats.group1Pct}%` }}
                            transition={{ duration: 1, ease: "easeOut" }}
                            className={cn("h-full", stats.colors.group1)}
                        />
                    )}
                    {/* Group 2 Segment */}
                    {stats.group2 > 0 && (
                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${stats.group2Pct}%` }}
                            transition={{ duration: 1, ease: "easeOut", delay: 0.2 }}
                            className={cn("h-full", stats.colors.group2)}
                        />
                    )}
                    {/* Social Segment */}
                    {stats.social > 0 && (
                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${stats.socialPct}%` }}
                            transition={{ duration: 1, ease: "easeOut", delay: 0.4 }}
                            className={cn("h-full", stats.colors.social)}
                        />
                    )}
                </div>

                {/* Legend / Metrics */}
                <div className="flex items-center justify-between text-[12px] font-medium text-black/55 pt-1">
                    {stats.group1 > 0 && (
                        <div className="flex items-center gap-1.5">
                            <div className={cn("w-1.5 h-1.5 rounded-full", stats.colors.group1)} />
                            <span>{stats.labels.group1} {stats.group1}{t("memberActivity.countSuffix")} ({Math.round(stats.group1Pct)}%)</span>
                        </div>
                    )}
                    {stats.group2 > 0 && (
                        <div className="flex items-center gap-1.5">
                            <div className={cn("w-1.5 h-1.5 rounded-full", stats.colors.group2)} />
                            <span>{stats.labels.group2} {stats.group2}{t("memberActivity.countSuffix")} ({Math.round(stats.group2Pct)}%)</span>
                        </div>
                    )}
                    {stats.social > 0 && (
                        <div className="flex items-center gap-1.5">
                            <div className={cn("w-1.5 h-1.5 rounded-full", stats.colors.social)} />
                            <span>{stats.labels.social} {stats.social}{t("memberActivity.countSuffix")} ({Math.round(stats.socialPct)}%)</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
