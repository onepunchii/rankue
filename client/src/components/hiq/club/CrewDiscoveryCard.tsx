import { memo } from "react";
import { HiqCrew } from "@shared/schema";
import { cn } from "@/lib/utils";
import { LucideMapPin, LucideUsers } from "lucide-react";

interface CrewDiscoveryCardProps {
    crew: HiqCrew & { memberCount?: number, distance?: number };
    currentSport: string;
    onClick: () => void;
}

export const CrewDiscoveryCard = memo(({ crew, currentSport, onClick }: CrewDiscoveryCardProps) => {
    // 썸네일 이미지 (엠블럼이 있으면 엠블럼, 없으면 커버이미지, 둘다 없으면 기본)
    const thumbnail = crew.coverImage || (crew.sportCategory === 'GOLF'
        ? "https://images.unsplash.com/photo-1535131749006-b7f58c9903fe?q=80&w=200&auto=format&fit=crop"
        : "https://images.unsplash.com/photo-1628771065518-0d82f1938462?q=80&w=200&auto=format&fit=crop");

    return (
        <div
            className="group flex items-center gap-4 p-3 rounded-tile bg-surface-2 border border-surface-line cursor-pointer hover:bg-surface-3 transition-all active:scale-[0.98]"
            onClick={onClick}
        >
            {/* 왼쪽 썸네일 */}
            <div className="relative w-16 h-16 shrink-0 rounded-xl overflow-hidden border border-surface-line">
                <img src={thumbnail} className="w-full h-full object-cover transition-transform group-hover:scale-110" alt={crew.name} />
                <div className="absolute inset-0 bg-black/10 group-hover:bg-transparent" />
            </div>

            {/* 오른쪽 정보 */}
            <div className="flex-1 min-w-0 py-0.5">
                <div className="flex items-center justify-between mb-1">
                    <h3 className="font-bold text-sm text-white truncate">
                        {crew.name}
                    </h3>
                    <span className="text-[12px] font-semibold px-2 py-0.5 rounded-full border border-brand/25 text-brand bg-brand/12">
                        {crew.gameType === 'any' ? '전체' : crew.gameType.toUpperCase()}
                    </span>
                </div>

                <p className="text-[13px] text-ink-3 line-clamp-1 mb-2 font-medium">
                    {crew.shortIntro || crew.description || "새로 만들어진 크루입니다."}
                </p>

                <div className="flex items-center gap-3 text-[12px] text-ink-2 font-semibold tabular-nums">
                    <div className="flex items-center gap-1">
                        <LucideMapPin className="w-3 h-3" />
                        <span>{crew.region || "서울"}</span>
                    </div>
                    {crew.distance !== undefined ? (
                        <div className="flex items-center gap-1 text-brand">
                            <span>{crew.distance.toFixed(1)}km</span>
                        </div>
                    ) : (
                        <div className="flex items-center gap-1">
                            <LucideUsers className="w-3 h-3" />
                            <span>{crew.memberCount || 1}명</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
});

CrewDiscoveryCard.displayName = "CrewDiscoveryCard";
