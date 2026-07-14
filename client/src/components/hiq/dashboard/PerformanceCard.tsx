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
                <h3 className="text-[15px] font-bold text-ink-1 tracking-tight">전적</h3>
                <span className="text-[12px] font-semibold text-black/40 tabular-nums">{total}전</span>
            </div>

            <div className="flex items-center gap-5">
                <RadialGauge value={winRate} size={82} stroke={8}>
                    <div className="text-center leading-none">
                        <div className="text-[21px] font-bold text-ink-1 tabular-nums">
                            {winRate}<span className="text-[12px] font-semibold text-black/50">%</span>
                        </div>
                        <div className="text-[11px] font-medium text-black/45 mt-1">승률</div>
                    </div>
                </RadialGauge>

                <div className="w-px h-16 bg-black/[0.07] shrink-0" />

                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-5 mb-4">
                        <div>
                            <div className="text-[22px] font-bold text-brand tabular-nums leading-none">{wins}</div>
                            <div className="text-[12px] text-black/50 font-medium mt-1">승</div>
                        </div>
                        <div>
                            <div className="text-[22px] font-bold text-red-500 tabular-nums leading-none">{losses}</div>
                            <div className="text-[12px] text-black/50 font-medium mt-1">패</div>
                        </div>
                    </div>
                    <div>
                        <div className="text-[11px] font-medium text-black/40 mb-2">최근 5경기</div>
                        <FormBadges results={form} size={22} />
                    </div>
                </div>
            </div>
        </div>
    );
}
