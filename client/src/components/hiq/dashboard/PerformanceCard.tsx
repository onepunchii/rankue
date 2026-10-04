import { RadialGauge } from "../ui/RadialGauge";
import { FormBadges, MatchResult } from "../ui/FormBadges";
import { useT } from "@/lib/i18n";
import { LucideChevronRight } from "@/lib/icons";

/**
 * Win-rate radial gauge + W/L split + recent-form badges.
 * The new "pro sports app" performance summary (flat card, no gradient/glow).
 *
 * 첫 경기 안내(2026-10-04): 당구 경기가 하나도 없는 회원에겐 빈 승률 원(0%) 대신
 * "점수판으로 한 판 치면 여기에 쌓인다" + [점수판 미리 보기][경기 시작]. 첫 경기 뒤에는 저절로 원래 카드.
 * 기록을 불러오는 중(history 없음)에는 안내를 띄우지 않는다 — 기록 있는 회원에게 잠깐 번쩍이면 안 된다.
 */
export function PerformanceCard({ history, onPreview, onStart }: { history?: any[]; onPreview?: () => void; onStart?: () => void }) {
    const { t } = useT();
    const matches = (history || []).filter((g: any) => g.gameMode === "match" && g.isRanked && g.sportCategory === "BILLIARDS");
    const total = matches.length;
    const wins = matches.filter((g: any) => g.isWinner).length;
    const losses = total - wins;
    const winRate = total ? Math.round((wins / total) * 100) : 0;
    // history is newest-first
    const form: MatchResult[] = matches.slice(0, 5).map((g: any) => (g.isWinner ? "W" : "L"));
    const noGames = Array.isArray(history) && !history.some((g: any) => g.sportCategory === "BILLIARDS");

    if (noGames && onStart) {
        return (
            <div className="rk-card p-5">
                <h3 className="text-[15px] font-bold text-ink-1 tracking-tight">{t("home.firstGameTitle")}</h3>
                <p className="text-[13px] font-medium text-black/55 mt-1 leading-relaxed break-keep">{t("home.firstGameDesc")}</p>
                <div className="mt-4 grid grid-cols-2 gap-2">
                    {onPreview && (
                        <button
                            type="button"
                            onClick={onPreview}
                            className="h-11 rounded-full bg-black/[0.05] text-[13.5px] font-semibold text-ink-1 active:scale-[0.98] transition-transform"
                        >
                            {t("home.firstGamePreview")}
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={onStart}
                        className={`h-11 rounded-full bg-brand text-white text-[13.5px] font-bold flex items-center justify-center gap-0.5 active:scale-[0.98] transition-transform ${onPreview ? "" : "col-span-2"}`}
                    >
                        {t("quickActions.matchCta")}
                        <LucideChevronRight className="w-4 h-4" />
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="rk-card p-5">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-[15px] font-bold text-ink-1 tracking-tight">{t("performanceCard.title")}</h3>
                <span className="text-[12px] font-semibold text-black/40 tabular-nums">{total}{t("performanceCard.gamesSuffix")}</span>
            </div>

            <div className="flex items-center gap-5">
                <RadialGauge value={winRate} size={82} stroke={8}>
                    <div className="text-center leading-none">
                        <div className="text-[21px] font-bold text-ink-1 tabular-nums">
                            {winRate}<span className="text-[12px] font-semibold text-black/50">%</span>
                        </div>
                        <div className="text-[11px] font-medium text-black/45 mt-1">{t("performanceCard.winRate")}</div>
                    </div>
                </RadialGauge>

                <div className="w-px h-16 bg-black/[0.07] shrink-0" />

                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-5 mb-4">
                        <div>
                            <div className="text-[22px] font-bold text-brand tabular-nums leading-none">{wins}</div>
                            <div className="text-[12px] text-black/50 font-medium mt-1">{t("performanceCard.wins")}</div>
                        </div>
                        <div>
                            <div className="text-[22px] font-bold text-red-500 tabular-nums leading-none">{losses}</div>
                            <div className="text-[12px] text-black/50 font-medium mt-1">{t("performanceCard.losses")}</div>
                        </div>
                    </div>
                    <div>
                        <div className="text-[11px] font-medium text-black/40 mb-2">{t("performanceCard.recentFive")}</div>
                        <FormBadges results={form} size={22} />
                    </div>
                </div>
            </div>
        </div>
    );
}
