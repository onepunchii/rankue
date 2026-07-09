import { LucideFlagTriangleRight, LucideUsers, LucidePlus, LucideChevronRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";

export function MyCrewCard() {
    const { data: myCrews = [], isLoading } = useQuery<any[]>({
        queryKey: ["/api/hiq/crews/mine", { sport: "GOLF" }],
    });

    const primaryCrew = myCrews[0];

    if (isLoading) {
        return (
            <div className="mb-4 h-32 animate-pulse bg-white/5 rounded-[1.5rem]" />
        );
    }

    return (
        <div className="mb-4 relative z-10">
            <div className="bg-white/[0.03] border border-white/5 rounded-[1.5rem] p-5 backdrop-blur-sm">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <LucideFlagTriangleRight className="w-5 h-5 text-[#64DD17]" />
                        <span className="text-lg font-extrabold text-white">MY CREW</span>
                    </div>
                    <Link href="/club">
                        <button className="text-[10px] font-semibold text-white/40 flex items-center gap-1 hover:text-white transition-colors">
                            더보기 <LucideChevronRight className="w-3 h-3" />
                        </button>
                    </Link>
                </div>

                {primaryCrew ? (
                    <Link href={`/club/${primaryCrew.crew.id}`}>
                        <div className="flex items-center gap-4 cursor-pointer group overflow-hidden">
                            <div className="flex-1 min-w-0">
                                <div className="text-sm font-semibold text-white group-hover:text-[#64DD17] transition-colors truncate">
                                    {primaryCrew.crew.name}
                                </div>
                                <div className="text-xs text-white/40 mt-0.5 truncate">
                                    멤버 {primaryCrew.memberCount}명 • {primaryCrew.crew.region || "지역 미설정"}
                                </div>
                            </div>
                            <div className="text-right shrink-0">
                                <div className="text-[10px] font-semibold text-[#64DD17] uppercase tracking-widest">RANKING</div>
                                <div className="text-xl font-extrabold text-white">#--</div>
                            </div>
                        </div>
                    </Link>
                ) : (
                    <Link href="/club">
                        <div className="flex flex-col items-center justify-center py-4 border-2 border-dashed border-white/5 rounded-2xl hover:bg-white/5 transition-all group cursor-pointer">
                            <p className="text-xs font-bold text-white/20">가입된 골프 크루가 없습니다</p>
                            <p className="text-[10px] text-white/10 mt-1">새로운 크루를 찾아보세요</p>
                        </div>
                    </Link>
                )}
            </div>
        </div>
    );
}
