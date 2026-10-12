/**
 * 끝난 대전 화면의 **레이팅 한 칸**(2026-10-12 — 순서의 2번 "승급하는 순간").
 * 대전이 끝나면 그 판으로 레이팅이 얼마나 움직였는지, 등급이 올랐으면 **새 배지를 크게** 보여 준다 — 배지를 '얻는' 순간이 여기서 생긴다.
 *
 * 값은 서버가 그 판에 남긴 것이다(hiq_sim_matches.rating_result → GET /sim/matches/:id/rapport 의 rating, shared/sim/rating ratingChangeOf).
 * 지금 사다리 값으로 다시 계산하지 않는다 — 나중에 다시 열어 본 끝난 판에서도 그 판의 변화가 나와야 한다.
 * 반영하지 않은 판(친선전 · 너무 짧은 판)에는 값이 없고 이 칸도 없다.
 *
 * 그리는 것
 *  - 등급을 얻었다(promoted: 배치를 마쳐 첫 등급 · 등급이 오름): 빛살 위에 새 배지 · "등급이 올랐어요" · 등급 이름 · 어디서 올라왔는지 · 레이팅.
 *  - 그 밖: 지금 등급 배지(배치 전이면 실루엣) · 레이팅 · 변화(+는 연두, −는 흐리게) · 다음 등급까지 / 배치 중 n/3.
 *  - **내려간 것은 알리지 않는다** — 숫자만 바뀌어 보인다(잃는 순간을 연출하지 않는다).
 * 색 · 광택 · 움직임은 index.css 의 .rank-hall .hall-promo(움직임을 줄여 달라는 기기에서는 멈춘다).
 */
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { PLACEMENT_MATCHES, TIERS, nextTier, type TierId } from "@shared/sim/rank";
import type { RatingChange } from "@shared/sim/rating";
import { TIER_GLOW, TierEmblem } from "../rank/TierEmblem";

const nameKeyOf = (id: TierId) => TIERS.find((t) => t.id === id)!.nameKey;
const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "±0");

export function MatchRatingCard({ rating, placement = PLACEMENT_MATCHES }: { rating: RatingChange; placement?: number }) {
    const { t } = useT();
    const tier = rating.tierAfter;
    const delta = (
        <span className={cn("rk-num text-[13px] font-black", rating.delta > 0 ? "text-[color:var(--hall-lime)]" : "text-white/55")} data-testid="match-rating-delta">
            {signed(rating.delta)}
        </span>
    );

    if (rating.promoted && tier) {
        const glow = TIER_GLOW[tier];
        return (
            <div className="rank-hall" data-testid="match-promo">
                <div className="hall-promo relative overflow-hidden rounded-[22px] px-4 pt-4 pb-4 text-center" style={{ ["--promo" as string]: glow }}>
                    <span className="hall-rays" aria-hidden="true" />
                    <span className="hall-pop relative inline-block">
                        <TierEmblem tier={tier} size={128} glow label={t(nameKeyOf(tier))} />
                    </span>
                    <p className="relative text-[13px] font-black mt-1" style={{ color: glow }}>
                        {rating.tierBefore ? t("sim.rank.promoted") : t("sim.rank.firstTier")}
                    </p>
                    <p className="relative text-[26px] font-black text-white leading-tight">{t(nameKeyOf(tier))}</p>
                    <p className="relative rk-num text-[12.5px] font-bold text-white/75 mt-1">
                        {rating.tierBefore ? `${t("sim.rank.promotedFrom").replace("{tier}", t(nameKeyOf(rating.tierBefore)))} · ` : ""}
                        {t("sim.rank.ratingNow").replace("{n}", String(rating.after))} {delta}
                    </p>
                </div>
            </div>
        );
    }

    const next = tier ? nextTier(rating.after) : null;
    return (
        <div className="rank-hall" data-testid="match-rating">
            <div className="hall-me rounded-tile px-3 py-2.5 flex items-center gap-2.5">
                {tier ? <TierEmblem tier={tier} size={46} /> : <TierEmblem tier="iron" size={46} locked />}
                <span className="flex-1 min-w-0">
                    <span className="flex items-baseline gap-2">
                        <span className="rk-num text-[17px] font-black text-white leading-none">{t("sim.rank.ratingNow").replace("{n}", String(rating.after))}</span>
                        {delta}
                    </span>
                    <span className="block rk-num text-[12px] font-bold text-white/65 truncate mt-1">
                        {!tier
                            ? t("sim.rank.unranked").replace("{n}", String(Math.min(rating.matches, placement))).replace("{m}", String(placement))
                            : <>
                                <span style={{ color: TIER_GLOW[tier] }}>{t(nameKeyOf(tier))}</span>
                                {" · "}
                                {next ? t("sim.rank.nextTier").replace("{tier}", t(next.nameKey)).replace("{n}", String(next.min - rating.after)) : t("sim.rank.topTier")}
                            </>}
                    </span>
                </span>
            </div>
        </div>
    );
}

export default MatchRatingCard;
