/**
 * 이달의 랭킹(2026-10-12 오너: "랭킹을 달로 해야겠지? 그래서 장식장에 보관이 되도록 매월초가 되면 리셋되고 그렇지?" → "추천대로").
 * 랭킹 화면의 [이달] 탭. 통산 등급(레이팅)은 그대로 두고, **그 달에 올린 점수**로 겨룬다 — 매월 1일(한국 시각) 0 에서 시작한다.
 *
 * 위: 달(지난 달로 넘겨 볼 수 있다) → 내 카드(이달 점수 · 순위 · 전적 · 마감까지) → 순위 목록.
 * 순위는 그 달에 minMatches(5)판을 친 사람만 — 그 전에는 "이달 3/5판 · 2판 더 치면 순위에 올라요".
 * 이름 옆 배지는 그 사람의 **통산 등급**이다(이달 점수로 등급이 바뀌지 않는다는 것이 보이게).
 * 색 · 광택은 랭킹과 같은 .rank-hall(index.css). 규칙은 shared/simMonthly, 값은 GET /sim/rank/monthly.
 */
import { memo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { daysLeftInMonth, kstMonthOf, shiftMonth } from "@shared/simMonthly";
import type { DashGameType } from "../dash/dashApi";
import { countryName } from "./country";
import { rankFlag } from "./flag";
import { RANK_QUERY_KEY, type MonthlyRankRow, type RankApi } from "./rankApi";
import { RankMedal, TierEmblem } from "./TierEmblem";

/** +36 · −12 · 0 — 이달 점수는 늘 부호를 붙여 적는다(통산 레이팅과 헷갈리지 않게) */
export const signedPoints = (n: number): string => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0");

/** "2026-10" → 그 언어의 "2026년 10월" */
export function monthLabel(month: string, locale: string): string {
    const [y, m] = month.split("-").map(Number);
    try { return new Intl.DateTimeFormat(locale, { year: "numeric", month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 15))); } catch { return month; }
}

const Row = memo(function Row({ r, mine, locale }: { r: MonthlyRankRow; mine: boolean; locale: string }) {
    const { t } = useT();
    const top3 = r.rank >= 1 && r.rank <= 3;
    return (
        <li className={cn("hall-row h-[62px] pl-2 pr-3 flex items-center gap-2", top3 && "hall-row-top", mine && "hall-row-mine")} aria-current={mine ? "true" : undefined}>
            <span className="w-11 shrink-0 flex items-center justify-center">
                {top3 ? <RankMedal rank={r.rank as 1 | 2 | 3} size={42} /> : <span className="rk-num text-[19px] font-black text-white/90">{r.rank}</span>}
            </span>
            {/* 통산 등급 — 배치 전이면 실루엣 */}
            {r.tier ? <TierEmblem tier={r.tier} size={40} /> : <TierEmblem tier="iron" size={40} locked />}
            <span className="flex-1 min-w-0 flex flex-col">
                <span className="text-[14.5px] font-black text-white truncate">{r.name}{mine ? ` · ${t("sim.rank.meMark")}` : ""}</span>
                <span className="text-[11.5px] font-bold text-white/60 truncate">
                    {r.country && <span title={countryName(r.country, locale)}>{rankFlag(r.country) || r.country} </span>}
                    {t("sim.entry.record").replace("{w}", String(r.wins)).replace("{l}", String(r.matches - r.wins))}
                </span>
            </span>
            <span className={cn("hall-rating rk-num shrink-0 h-8 px-3 inline-flex items-center rounded-pill text-[14px] font-black", r.points > 0 ? "text-[color:var(--hall-lime)]" : "text-white/80")}>{signedPoints(r.points)}</span>
        </li>
    );
});

export function MonthlyRank({ gameType, api, myMemberId, locale, now = Date.now }: {
    gameType: DashGameType;
    api: RankApi;
    myMemberId?: string;
    locale: string;
    now?: () => number;
}) {
    const { t } = useT();
    const thisMonth = kstMonthOf(now());
    const [month, setMonth] = useState(thisMonth);
    const q = useQuery({
        queryKey: [...RANK_QUERY_KEY, "monthly", gameType, month],
        queryFn: () => api.getMonthly!({ gameType, month }),
        staleTime: 15_000,
    });
    const d = q.data;
    // 넘겨 볼 수 있는 달 — 대전이 있었던 가장 옛 달부터 이번 달까지
    const oldest = d?.months.length ? d.months[d.months.length - 1] : month;
    const canPrev = month > oldest;
    const canNext = month < thisMonth;
    const closed = month < thisMonth;
    const left = daysLeftInMonth(month, now());
    const n = (v: number) => String(v);
    const arrow = "w-10 h-10 shrink-0 inline-flex items-center justify-center rounded-pill border border-white/15 bg-white/[0.06] text-white/85 text-[16px] font-black active:bg-white/15 disabled:opacity-30";

    return (
        <div className={cn("flex flex-col gap-4", q.isFetching && d && "opacity-80")} data-testid="rank-monthly">
            {/* 달 — 지난 달로 넘겨 볼 수 있다(마감된 달의 순위가 장식장의 근거다) */}
            <div className="flex items-center justify-between gap-2">
                <button type="button" onClick={() => setMonth(shiftMonth(month, -1))} disabled={!canPrev} aria-label={t("sim.rank.monthPrev")} className={arrow}>‹</button>
                <div className="min-w-0 text-center">
                    <p className="text-[16px] font-black text-white truncate" data-testid="rank-month-label">{monthLabel(month, locale)}</p>
                    <p className="rk-num text-[11.5px] font-bold text-white/60 truncate">
                        {closed ? t("sim.rank.monthClosed") : t("sim.rank.monthDaysLeft").replace("{n}", n(left))}
                    </p>
                </div>
                <button type="button" onClick={() => setMonth(shiftMonth(month, 1))} disabled={!canNext} aria-label={t("sim.rank.monthNext")} className={arrow}>›</button>
            </div>

            {q.isPending && <p className="text-[13px] font-medium text-ink-4 min-h-11 flex items-center">{t("sim.rank.loading")}</p>}
            {q.isError && (
                <div className="flex items-center justify-between gap-3 min-h-11">
                    <p className="text-[13px] font-medium text-ink-2">{t("sim.rank.failed")}</p>
                    <button type="button" onClick={() => { void q.refetch(); }} className="h-10 px-3.5 shrink-0 inline-flex items-center rounded-pill border border-white/15 bg-white/[0.08] text-[13px] font-bold text-white/85">{t("sim.match.retry")}</button>
                </div>
            )}

            {d && (
                <>
                    <section className="hall-me rounded-[22px] px-4 py-3.5" aria-label={t("sim.rank.monthMine")} data-testid="rank-monthly-me">
                        <div className="flex items-center gap-3">
                            <span className="shrink-0 w-[84px] flex items-center justify-center">
                                {d.me.rank !== null && d.me.rank <= 3
                                    ? <RankMedal rank={d.me.rank as 1 | 2 | 3} size={78} />
                                    : d.me.tier ? <TierEmblem tier={d.me.tier} size={78} /> : <TierEmblem tier="iron" size={78} locked />}
                            </span>
                            <div className="flex-1 min-w-0">
                                <p className="text-[12.5px] font-black text-white/65">{t(closed ? "sim.rank.monthPointsClosed" : "sim.rank.monthPoints")}</p>
                                <p className={cn("rk-num text-[40px] font-black leading-none tracking-tight mt-1", d.me.points > 0 ? "text-[color:var(--hall-lime)]" : "text-white")} data-points>{signedPoints(d.me.points)}</p>
                                <p className="rk-num text-[12.5px] font-bold text-white/80 mt-1.5 break-keep">
                                    {d.me.rank !== null
                                        ? t("sim.rank.rankOf").replace("{r}", n(d.me.rank)).replace("{n}", n(d.total))
                                        : t("sim.rank.monthNeed").replace("{n}", n(d.me.matches)).replace("{m}", n(d.minMatches)).replace("{left}", n(Math.max(0, d.minMatches - d.me.matches)))}
                                    {d.me.matches > 0 && <>{" · "}{t("sim.entry.record").replace("{w}", n(d.me.wins)).replace("{l}", n(d.me.matches - d.me.wins))}</>}
                                </p>
                            </div>
                        </div>
                        {/* 통산 등급은 그대로라는 것을 한 줄로 — '매달 지워진다'로 읽히지 않게 */}
                        {!closed && <p className="text-[11.5px] font-medium text-white/55 mt-3 leading-relaxed break-keep">{t("sim.rank.monthHint")}</p>}
                    </section>

                    {d.rows.length === 0 ? (
                        <section className="hall-row px-4 py-4">
                            <p className="text-[15px] font-black text-white">{t(closed ? "sim.rank.monthEmptyClosed" : "sim.rank.monthEmpty")}</p>
                            {!closed && <p className="text-[13px] font-medium text-white/65 mt-1">{t("sim.rank.monthEmptyDesc").replace("{n}", n(d.minMatches))}</p>}
                        </section>
                    ) : (
                        <div>
                            {/* 지난 달은 '이달의 순위'가 아니다 — 그 달의 이름으로 적는다 */}
                            <h2 className="px-1 mb-2 text-[12px] font-black tracking-wide text-white/55">{closed ? monthLabel(month, locale) : t("sim.rank.monthBoard")}</h2>
                            <ol className="space-y-2" aria-label={closed ? monthLabel(month, locale) : t("sim.rank.monthBoard")}>
                                {d.rows.map((r) => <Row key={r.memberId} r={r} mine={!!myMemberId && r.memberId === myMemberId} locale={locale} />)}
                            </ol>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

export default MonthlyRank;
