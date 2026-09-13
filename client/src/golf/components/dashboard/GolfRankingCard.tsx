import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { LucideChevronRight, LucideTrophy } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { flagEmoji } from "@/lib/flag";

interface Summary { edition: string; total: number; top: { rank: number; playerName: string; nameKo: string | null; country: string } | null; fedCount: number; fedTop: { rank: number; playerName: string; nameKo: string | null } | null }

const IOC2: Record<string, string> = { KOR: "KR", USA: "US", JPN: "JP", THA: "TH", ENG: "GB", NIR: "GB", AUS: "AU" };

/**
 * 골프 홈의 랭킹 카드(2026-09-13 오너: 골프 탭에 당구와 비슷한 랭킹). 세계 1위·한국 선수 수 한 줄 + 투어 4개 바로가기.
 * 골프 홈은 검정 바탕·라임 강조의 별도 모듈이라 다른 대시보드 카드(MyCrewCard)와 같은 문법으로 그린다.
 */
export function GolfRankingCard() {
    const { data: owgr } = useQuery<Summary | null>({
        queryKey: ["/api/hiq/golf-rank/summary", "owgr"],
        queryFn: async () => apiRequest("/api/hiq/golf-rank/summary?tour=owgr"),
        staleTime: 30 * 60 * 1000,
    });
    const { data: rolex } = useQuery<Summary | null>({
        queryKey: ["/api/hiq/golf-rank/summary", "rolex"],
        queryFn: async () => apiRequest("/api/hiq/golf-rank/summary?tour=rolex"),
        staleTime: 30 * 60 * 1000,
    });
    const line = (s: Summary | null | undefined, who: string) => s?.top
        ? `${who} 1위 ${flagEmoji(IOC2[s.top.country] ?? s.top.country.slice(0, 2))} ${s.top.nameKo || s.top.playerName}${s.fedTop ? ` · 한국 최고 ${s.fedTop.rank}위 ${s.fedTop.nameKo || s.fedTop.playerName}` : ""}`
        : null;

    return (
        <div className="mb-4 relative z-10">
            <div className="bg-white/[0.03] border border-white/5 rounded-[1.5rem] p-5 backdrop-blur-sm">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <LucideTrophy className="w-5 h-5 text-[#64DD17]" />
                        <span className="text-lg font-extrabold text-white">골프 랭킹</span>
                    </div>
                    <Link href="/golf-ranking">
                        <button className="text-[10px] font-semibold text-white/40 flex items-center gap-1 hover:text-white transition-colors">
                            전체 보기 <LucideChevronRight className="w-3 h-3" />
                        </button>
                    </Link>
                </div>
                <div className="flex flex-col gap-1 mb-4">
                    {line(owgr, "🌍 남자") && <p className="text-[12.5px] font-medium text-white/70 truncate">{line(owgr, "🌍 남자")}</p>}
                    {line(rolex, "🌍 여자") && <p className="text-[12.5px] font-medium text-white/70 truncate">{line(rolex, "🌍 여자")}</p>}
                    {!owgr && !rolex && <p className="text-[12.5px] font-medium text-white/40">세계·KPGA·KLPGA 순위와 비거리·페어웨이·그린 적중률 기록</p>}
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                    {([["owgr", "♂ 세계"], ["rolex", "♀ 세계"], ["kpga", "KPGA"], ["klpga", "KLPGA"]] as const).map(([tour, label]) => (
                        <Link key={tour} href={`/golf-ranking?tour=${tour}`}>
                            <button className="w-full h-9 rounded-xl bg-white/[0.06] text-[12px] font-bold text-white/85 hover:bg-[#64DD17] hover:text-black transition-colors">{label}</button>
                        </Link>
                    ))}
                </div>
            </div>
        </div>
    );
}
