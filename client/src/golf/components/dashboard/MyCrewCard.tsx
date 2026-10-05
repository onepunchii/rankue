import { LucideFlagTriangleRight, LucideUsers, LucidePlus, LucideChevronRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";

export function MyCrewCard() {
    // 비로그인(2026-10-05 오너 결정: "홈을 비로그인에 다 열고, 가입 안 한 사람에겐 예시로 보여 준다") —
    // 내 크루는 회원의 것이라 부르지 않는다. 그리고 "가입된 골프 크루가 없습니다"라고 하지 않는다:
    // 방문자에게 그 말은 거짓 빈 값이다(없는 게 아니라 아직 회원이 아니다). 가입 안내 한 줄로 바꾸고 크루 둘러보기(/club) 길은 그대로 둔다.
    const { member, isGuest } = useAuth();
    const { data: myCrews = [], isLoading } = useQuery<any[]>({
        queryKey: ["/api/hiq/crews/mine", { sport: "GOLF" }],
        enabled: !!member,
    });

    // 비로그인이면 예전 답(로그아웃 전 캐시)이 남아 있어도 내 크루로 그리지 않는다
    const primaryCrew = isGuest ? undefined : myCrews[0];

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
                ) : isGuest ? (
                    <Link href="/club">
                        <div className="flex flex-col items-center justify-center py-4 border-2 border-dashed border-[#FFFFFF1F] rounded-2xl hover:bg-[#FFFFFF0D] transition-all group cursor-pointer">
                            <p className="text-[13px] font-bold text-[#FFFFFFCC] break-keep text-center">가입하면 골프 크루에 들어갈 수 있어요</p>
                            <p className="text-[12px] font-medium text-[#FFFFFF8C] mt-1">골프 크루 둘러보기</p>
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
