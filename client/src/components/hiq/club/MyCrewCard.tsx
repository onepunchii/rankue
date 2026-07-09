import { memo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { LucideCrown, LucideUsers, LucideChevronRight } from "lucide-react";
import { HiqCrew } from "@shared/schema";
import { cn } from "@/lib/utils";

interface MyCrewCardProps {
    crew: HiqCrew & { memberCount?: number };
    role: string;
    onClick: () => void;
}

export const MyCrewCard = memo(({ crew, role, onClick }: MyCrewCardProps) => {
    // 이미지가 없으면 스포츠별 기본 감성 이미지 사용
    const defaultImg = crew.sportCategory === 'GOLF'
        ? "https://images.unsplash.com/photo-1587174486073-ae5e5cff23aa?q=80&w=800&auto=format&fit=crop"
        : "https://images.unsplash.com/photo-1544178178-5034a9269043?q=80&w=800&auto=format&fit=crop";

    const bgImage = crew.coverImage || defaultImg;

    return (
        <Card
            className="rounded-card border-none cursor-pointer group overflow-hidden relative h-28 transition-all duration-300 active:scale-95"
            onClick={onClick}
        >
            {/* 배경 이미지 및 오버레이 */}
            {/* eslint-disable-next-line react-dom/no-unsafe-styles */}
            <div
                className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-105"
                style={{ backgroundImage: `url(${bgImage})` }}
            />
            <div className="absolute inset-0 bg-gradient-to-r from-black/95 via-black/70 to-transparent" />

            {/* 하단 포인트 라인 */}
            <div className={cn(
                "absolute bottom-0 left-0 right-0 h-[3px] opacity-70",
                crew.sportCategory === 'GOLF' ? "bg-brand" : "bg-brand"
            )} />

            <CardContent className="relative z-10 h-full p-5 flex items-center justify-between">
                <div className="flex flex-col justify-center gap-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className={cn(
                            "px-1.5 py-0.5 rounded text-[12px] font-semibold",
                            role === 'leader' ? "bg-yellow-500/20 text-yellow-500 border border-yellow-500/30" : "bg-white/10 text-white/55"
                        )}>
                            {role === 'leader' ? '리더' : '멤버'}
                        </span>
                    </div>

                    <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-lg text-white tracking-tight truncate">
                            {crew.name}
                        </h3>
                        {role === 'leader' && <LucideCrown className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500" />}
                    </div>

                    <div className="flex items-center gap-2 text-white/65 text-[12px] font-medium">
                        <div className="flex items-center gap-1">
                            <LucideUsers className="w-3 h-3" />
                            <span className="tabular-nums">{crew.memberCount || 1} / {crew.maxMembers || 50}</span>
                        </div>
                        <span className="w-0.5 h-0.5 rounded-full bg-white/40" />
                        <span>{crew.region || "서울"}</span>
                    </div>
                </div>

                <div className="w-8 h-8 rounded-full bg-white/5 border border-white/5 flex items-center justify-center group-hover:bg-white/10 transition-colors">
                    <LucideChevronRight className="w-4 h-4 text-white/45 group-hover:text-white/60" />
                </div>
            </CardContent>
        </Card>
    );
});

MyCrewCard.displayName = "MyCrewCard";
