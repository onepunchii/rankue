import { memo } from "react";
import { HiqCrew } from "@shared/schema";
import { LucideMapPin, LucideUsers } from "@/lib/icons";
import { useT } from "@/lib/i18n";

interface CrewDiscoveryCardProps {
    crew: HiqCrew & { memberCount?: number, distance?: number };
    currentSport: string;
    onClick: () => void;
}

export const CrewDiscoveryCard = memo(({ crew, currentSport, onClick }: CrewDiscoveryCardProps) => {
    const { t } = useT();
    // 커버 이미지가 없으면 외부 스톡 사진 대신 크루 이니셜 + 종목 아이콘 타일로 대체
    const initial = crew.name?.trim().charAt(0).toUpperCase() || "?";

    return (
        <div
            className="group flex items-center gap-4 p-3 rounded-tile bg-surface-2 cursor-pointer hover:bg-surface-3 transition-all active:scale-[0.98]"
            onClick={onClick}
        >
            {/* 왼쪽 썸네일 */}
            <div className="relative w-16 h-16 shrink-0 rounded-xl overflow-hidden ">
                {crew.coverImage ? (
                    <>
                        <img src={crew.coverImage} className="w-full h-full object-cover transition-transform group-hover:scale-110" alt={crew.name} />
                        <div className="absolute inset-0 bg-black/10 group-hover:bg-transparent" />
                    </>
                ) : (
                    <div className="w-full h-full bg-brand/10 flex items-center justify-center">
                        <span className="text-[26px] font-bold text-brand leading-none">{initial}</span>
                    </div>
                )}
            </div>

            {/* 오른쪽 정보 */}
            <div className="flex-1 min-w-0 py-0.5">
                <div className="flex items-center justify-between gap-2 mb-1">
                    <h3 className="font-semibold text-[15px] text-ink-1 truncate">
                        {crew.name}
                    </h3>
                    <span className="shrink-0 text-[12px] font-semibold px-2 py-0.5 rounded-full border border-brand/25 text-brand bg-brand/12">
                        {crew.gameType === 'any' ? t("crewDiscoveryCard.all") : crew.gameType.toUpperCase()}
                    </span>
                </div>

                <p className="text-[13px] text-ink-3 line-clamp-1 mb-2 font-medium">
                    {crew.shortIntro || crew.description || t("crewDiscoveryCard.defaultIntro")}
                </p>

                <div className="flex items-center gap-3 text-[12px] text-ink-3 font-medium tabular-nums">
                    <div className="flex items-center gap-1">
                        <LucideMapPin className="w-3 h-3" />
                        <span className={crew.region ? undefined : "text-ink-4"}>{crew.region || t("crewDiscoveryCard.noRegion")}</span>
                    </div>
                    {crew.distance !== undefined ? (
                        <div className="flex items-center gap-1 text-brand">
                            <span>{crew.distance.toFixed(1)}km</span>
                        </div>
                    ) : (
                        <div className="flex items-center gap-1">
                            <LucideUsers className="w-3 h-3" />
                            <span>{crew.memberCount || 1}{t("crewDiscoveryCard.membersSuffix")}</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
});

CrewDiscoveryCard.displayName = "CrewDiscoveryCard";
