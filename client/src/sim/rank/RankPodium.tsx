import { memo } from "react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { tierFor } from "@shared/sim/rank";
import type { RankRow } from "./rankApi";
import { countryName } from "./country";

/**
 * 랭킹 시상대(2026-09-09 오너: "순위에 대한 명예로움 + 재미"). 1위를 가운데 높이 두고 2·3위가 양옆에 선다.
 * 게임 리더보드의 느낌은 **자리 높이와 금·은·동**으로만 낸다 — 그라데이션·발광·이모지는 우리 규칙에서 쓰지 않는다.
 * 1위에만 왕관(인라인 SVG). 색은 토큰(gold·silver·bronze)이라 밝은 화면·검은 화면 모두에서 같은 뜻으로 읽힌다.
 */
const PLACE = [
    { i: 1, color: "text-gold", ring: "border-gold", h: "h-[92px]" },     // 가운데(1위)
    { i: 2, color: "text-silver", ring: "border-silver", h: "h-[64px]" },
    { i: 3, color: "text-bronze", ring: "border-bronze", h: "h-[52px]" },
] as const;

function Crown() {
    return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 17h16M4 17l-1-8 5 3 4-6 4 6 5-3-1 8" />
        </svg>
    );
}

function Seat({ row, place, locale, mine }: { row: RankRow | undefined; place: (typeof PLACE)[number]; locale: string; mine: boolean }) {
    const { t } = useT();
    if (!row) return <div className="flex-1" aria-hidden="true" />;
    const tier = tierFor(row.rating);
    return (
        <div className="flex-1 min-w-0 flex flex-col items-center gap-1.5">
            {place.i === 1 && <span className={place.color} aria-label={t("sim.rank.crown")}><Crown /></span>}
            <span className={cn("text-[13px] font-bold truncate max-w-full", mine ? "text-brand" : "text-ink-1")}>{row.name}</span>
            <span className="rk-num text-[11px] font-medium text-ink-3">{t(tier.nameKey)}</span>
            {/* 자리: 높이가 곧 순위다 */}
            <div className={cn("w-full rounded-t-tile border-t-2 border-x bg-surface-3 flex flex-col items-center justify-start pt-2", place.h, place.ring)}>
                <span className={cn("rk-num text-[20px] font-bold leading-none", place.color)}>{place.i}</span>
                <span className="rk-num text-[13px] font-bold text-ink-1 mt-1">{row.rating}</span>
                {row.country && (
                    <span className="text-[10px] font-medium text-ink-4 mt-0.5" title={countryName(row.country, locale)}>{row.country}</span>
                )}
            </div>
        </div>
    );
}

export interface RankPodiumProps {
    rows: readonly RankRow[];
    myMemberId?: string;
    locale: string;
    className?: string;
}

export const RankPodium = memo(function RankPodium({ rows, myMemberId, locale, className }: RankPodiumProps) {
    const { t } = useT();
    if (rows.length === 0) return null;
    const [first, second, third] = rows;
    return (
        <section className={cn("rounded-card border border-surface-line bg-surface-1 px-4 pt-4 pb-0 overflow-hidden", className)} aria-label={t("sim.rank.podium")}>
            <p className="text-[11px] font-semibold text-ink-3 mb-3">{t("sim.rank.podium")}</p>
            {/* 2위 · 1위 · 3위 — 가운데가 가장 높다 */}
            <div className="flex items-end gap-2 border-b border-surface-line-strong">
                <Seat row={second} place={PLACE[1]} locale={locale} mine={!!myMemberId && second?.memberId === myMemberId} />
                <Seat row={first} place={PLACE[0]} locale={locale} mine={!!myMemberId && first?.memberId === myMemberId} />
                <Seat row={third} place={PLACE[2]} locale={locale} mine={!!myMemberId && third?.memberId === myMemberId} />
            </div>
        </section>
    );
});

export default RankPodium;
