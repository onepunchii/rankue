import { RadialGauge } from "../ui/RadialGauge";
import { FormBadges, MatchResult } from "../ui/FormBadges";

/**
 * Win-rate radial gauge + W/L split + recent-form badges.
 * The new "pro sports app" performance summary (flat card, no gradient/glow).
 */
export function PerformanceCard({ history }: { history?: any[] }) {
    const matches = (history || []).filter((g: any) => g.gameMode === "match" && g.isRanked && g.sportCategory === "BILLIARDS");
    const total = matches.length;
    const wins = matches.filter((g: any) => g.isWinner).length;
    const losses = total - wins;
    const winRate = total ? Math.round((wins / total) * 100) : 0;
    // history is newest-first
    const form: MatchResult[] = matches.slice(0, 5).map((g: any) => (g.isWinner ? "W" : "L"));

    return (
        <div className="rk-card p-5 mb-6">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-[15px] font-semibold text-white/55">전적</h3>
                <span className="text-[12px] font-medium text-white/40 tabular-nums">{total}전</span>
            </div>

            <div className="flex items-center gap-5">
                <RadialGauge value={winRate} size={92} stroke={8}>
                    <div className="text-center leading-none">
                        <div className="text-[22px] font-bold text-white tabular-nums">
                            {winRate}<span className="text-[13px] font-semibold text-white/60">%</span>
                        </div>
                        <div className="text-[12px] font-medium text-white/45 mt-1">승률</div>
                    </div>
                </RadialGauge>

                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-4 mb-3.5">
                        <div>
                            <div className="text-[20px] font-bold text-brand tabular-nums leading-none">{wins}</div>
                            <div className="text-[12px] text-white/45 font-medium mt-1">승</div>
                        </div>
                        <div className="w-px h-8 bg-white/10" />
                        <div>
                            <div className="text-[20px] font-bold text-red-400 tabular-nums leading-none">{losses}</div>
                            <div className="text-[12px] text-white/45 font-medium mt-1">패</div>
                        </div>
                    </div>
                    <div>
                        <div className="text-[12px] font-medium text-white/45 mb-1.5">최근 5경기</div>
                        <FormBadges results={form} size={24} />
                    </div>
                </div>
            </div>
        </div>
    );
}
