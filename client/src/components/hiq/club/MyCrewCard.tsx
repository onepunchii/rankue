import { memo } from "react";
import { LucideCrown, LucideUsers, LucideChevronRight } from "@/lib/icons";
import { HiqCrew } from "@shared/schema";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

interface MyCrewCardProps {
    crew: HiqCrew & { memberCount?: number };
    role: string;
    onClick: () => void;
}

export const MyCrewCard = memo(({ crew, role, onClick }: MyCrewCardProps) => {
    const { t } = useT();
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
                        isLeader ? "bg-[#cba258]/12 text-[#cba258]" : "bg-black/[0.06] text-black/55"
                    )}>
                        {isLeader ? t("myCrewCard.leader") : t("myCrewCard.member")}
                    </span>
                    {isLeader && <LucideCrown className="w-3.5 h-3.5 text-[#cba258] fill-[#cba258]" />}
                </div>

                <h3 className="font-semibold text-[17px] text-ink-1 tracking-tight truncate mb-1.5">
                    {crew.name}
                </h3>

                <div className="flex items-center gap-2 text-ink-3 text-[12px] font-medium">
                    <div className="flex items-center gap-1">
                        <LucideUsers className="w-3 h-3" />
                        <span className="tabular-nums">{crew.memberCount || 1} / {crew.maxMembers || 50}</span>
                    </div>
                    <span className="w-0.5 h-0.5 rounded-full bg-black/25" />
                    <span className={cn(!crew.region && "text-ink-4")}>{crew.region || t("myCrewCard.noRegion")}</span>
                </div>
            </div>

            <div className="w-8 h-8 rounded-full bg-black/[0.04] flex items-center justify-center shrink-0 group-hover:bg-black/[0.06] transition-colors">
                <LucideChevronRight className="w-4 h-4 text-black/40" />
            </div>
        </div>
    );
});

MyCrewCard.displayName = "MyCrewCard";
