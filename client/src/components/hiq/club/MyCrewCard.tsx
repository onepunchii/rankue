import { memo } from "react";
import { LucideCrown, LucideUsers, LucideChevronRight } from "lucide-react";
import { HiqCrew } from "@shared/schema";
import { cn } from "@/lib/utils";

interface MyCrewCardProps {
    crew: HiqCrew & { memberCount?: number };
    role: string;
    onClick: () => void;
}

export const MyCrewCard = memo(({ crew, role, onClick }: MyCrewCardProps) => {
    const isLeader = role === 'leader';

    return (
        <div
            className="rk-card group cursor-pointer p-4 flex items-center justify-between gap-3 transition-transform active:scale-[0.98]"
            onClick={onClick}
        >
            <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1.5">
                    <span className={cn(
                        "px-1.5 py-0.5 rounded text-[12px] font-semibold",
                        isLeader ? "bg-yellow-500/15 text-yellow-400" : "bg-white/10 text-white/55"
                    )}>
                        {isLeader ? '리더' : '멤버'}
                    </span>
                    {isLeader && <LucideCrown className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />}
                </div>

                <h3 className="font-semibold text-[17px] text-white tracking-tight truncate mb-1.5">
                    {crew.name}
                </h3>

                <div className="flex items-center gap-2 text-white/45 text-[12px] font-medium">
                    <div className="flex items-center gap-1">
                        <LucideUsers className="w-3 h-3" />
                        <span className="tabular-nums">{crew.memberCount || 1} / {crew.maxMembers || 50}</span>
                    </div>
                    <span className="w-0.5 h-0.5 rounded-full bg-white/30" />
                    <span className={cn(!crew.region && "text-ink-4")}>{crew.region || "지역 미설정"}</span>
                </div>
            </div>

            <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center shrink-0 group-hover:bg-white/10 transition-colors">
                <LucideChevronRight className="w-4 h-4 text-white/45" />
            </div>
        </div>
    );
});

MyCrewCard.displayName = "MyCrewCard";
