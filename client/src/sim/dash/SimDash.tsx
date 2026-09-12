/**
 * 시뮬레이터 대시보드(2026-09-08 오너): 진입 화면 머리글의 "대시보드" 버튼(닫기 옆)으로 들어온다(`/online-game?dash=1`).
 * 위에서부터 — 종목·테이블 칩(하나면 숨김) → 큰 숫자(최근 10세션 에버리지 + 이전 10세션 대비) → 지표 여섯 칸 →
 * 에버리지 추이(선) → 세션별 하이런(막대) → 친구와 대전(전적·연승·최근 흐름 + 내 대전 목록: 열기·기권·취소) → 드릴(이번 주 + 주별 성공 막대) → 최근 세션 표(차트의 표 버전).
 * 칩을 고르면 연습 숫자·차트·대전 전적이 모두 그 조합 기준으로 바뀐다(드릴은 3쿠션 대대 고정). 값은 hiq_sim_* 만 — 실전 RP 와 무관.
 * 화면의 초록 버튼은 기록이 없을 때의 "연습 시작" 하나뿐이다.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { drillsForWeek } from "@shared/sim/drills";
import { rankStatus, PLACEMENT_MATCHES } from "@shared/sim/rank";
import { matchApi as defaultMatchApi, type MatchApi, type MatchPublic } from "../matchApi";
import { MATCH_LIST_QUERY_KEY, MATCH_LIST_REFETCH_MS } from "../match/queryKeys";
import { MatchList, hasLiveMatch } from "../match/MatchList";
import { gameLabel } from "../match/matchView";
import { formatAvg } from "../entry/entryStats";
import { fetchSimStats, SIM_STATS_QUERY_KEY, type StatsFetcher } from "./dashApi";
import {
    availableCombos, bestAvgOf, bestHighRunOf, comboKey, drillSeries, drillTotals, matchSummary, overallAvg, ratingFor, recentForm, sameCombo,
    sessionSeries, shortDate, signedAvg, type Combo, matchSeries} from "./dashStats";
import { Columns, FormStrip, TrendLine } from "./charts";

export interface SimDashProps {
    onClose: () => void;
    onOpenMatch: (m: MatchPublic) => void;
    onPractice: () => void;
    onDrills: () => void;
    onLobby: () => void;
    /** 온라인 레이팅 칸을 누르면 랭킹 화면 */
    onRank?: () => void;
    /** "matches" 면 마운트 때 대전 섹션으로 스크롤(진입 화면의 "내 대전") */
    initialSection?: "matches";
    /** 테스트 주입 */
    statsApi?: StatsFetcher;
    matchApi?: MatchApi;
    now?: number;
}

const pill = "h-11 px-4 inline-flex items-center rounded-pill border border-surface-line bg-surface-1 text-[13px] font-semibold text-ink-2 active:bg-surface-3 shrink-0";
const pillSm = "h-10 px-3.5 inline-flex items-center rounded-pill border border-surface-line bg-surface-1 text-[13px] font-semibold text-ink-2 active:bg-surface-3 shrink-0";
const primary = "h-11 px-5 inline-flex items-center rounded-pill bg-brand text-brand-fg text-[14px] font-semibold active:bg-brand-strong";
const card = "rounded-card bg-surface-1 border border-surface-line rk-shadow p-4";
const TREND_N = 30;
const FORM_N = 10;

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "best" | "warn" }) {
    return (
        <div className="rounded-tile bg-surface-3 px-3 py-2.5 min-h-[64px] flex flex-col justify-center">
            <span className="text-[11px] font-semibold text-ink-3 truncate">{label}</span>
            {/* 개인 최고 기록은 금색(의례 색), 연패는 흐리게 — 숫자만 늘어놓으면 무엇이 중요한지 안 보인다 */}
            <span className={cn("rk-num text-[18px] font-bold leading-tight mt-0.5 truncate", tone === "best" ? "text-gold" : tone === "warn" ? "text-ink-3" : "text-ink-1")}>{value}</span>
            {sub && <span className="rk-num text-[11px] font-medium text-ink-4 truncate">{sub}</span>}
        </div>
    );
}

function CardHeader({ title, sub, action }: { title: string; sub?: string; action?: ReactNode }) {
    return (
        <header className="flex items-start justify-between gap-3">
            <div className="min-w-0">
                <h2 className="text-[15px] font-bold text-ink-1 leading-tight">{title}</h2>
                {sub && <p className="text-[12px] font-medium text-ink-3 mt-0.5">{sub}</p>}
            </div>
            {action}
        </header>
    );
}

export function SimDash({ onClose, onOpenMatch, onPractice, onDrills, onLobby, onRank, initialSection, statsApi = fetchSimStats, matchApi = defaultMatchApi, now }: SimDashProps) {
    const { t } = useT();
    const stats = useQuery({ queryKey: SIM_STATS_QUERY_KEY, queryFn: statsApi, staleTime: 15_000 });
    const matches = useQuery({
        queryKey: MATCH_LIST_QUERY_KEY,
        queryFn: () => matchApi.listMatches(),
        staleTime: 0,
        refetchInterval: (q) => (hasLiveMatch(q.state.data) ? MATCH_LIST_REFETCH_MS : false),
    });
    const data = stats.data;
    const rows = useMemo(() => matches.data ?? [], [matches.data]);
    const combos = useMemo(() => (data ? availableCombos(data.ratings, data.sessions, rows) : []), [data, rows]);
    const [pick, setPick] = useState<string | null>(null);
    const combo: Combo | null = combos.find((c) => comboKey(c) === pick) ?? combos[0] ?? null;
    // 2026-09-12 오너: "연습은 다 빼자, 공식 멀티경기만" — 숫자(에버리지·하이런·추이)는 끝난 대전에서만 뽑는다.
    const series = useMemo(() => (combo ? matchSeries(rows, combo) : []), [rows, combo]);
    /** 연습 세션은 목록으로만 남긴다(집계에 안 들어간다). */
    const practice = useMemo(() => (data && combo ? sessionSeries(data.sessions, combo, 10) : []), [data, combo]);
    const recent = series.slice(-TREND_N);
    const form = recentForm(series, FORM_N);
    const rating = data && combo ? ratingFor(data.ratings, combo) : undefined;
    const mr = data && combo ? (data.matchRatings ?? []).find((r) => r.gameType === combo.gameType) : undefined;
    const rank = data && combo ? data.ranks.find((r) => sameCombo(r, combo)) : undefined;
    const ms = matchSummary(rows, combo, FORM_N);
    const nowMs = now ?? Date.now();
    const drills = useMemo(() => (data ? drillSeries(data.drillWeeks, nowMs, 8) : []), [data, nowMs]);
    const totals = data ? drillTotals(data.drillWeeks) : { attempts: 0, successes: 0, cushions: 0 };
    const weekTotal = data?.currentWeekId ? drillsForWeek(data.currentWeekId).length : 5;
    const thisWeek = drills[drills.length - 1];
    const [showAll, setShowAll] = useState(false);
    const tableRows = useMemo(() => [...recent].reverse(), [recent]);
    const shown = showAll ? tableRows : tableRows.slice(0, 10);

    const matchesRef = useRef<HTMLElement>(null);
    useEffect(() => {
        const el = matchesRef.current;
        if (initialSection === "matches" && el && typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "start" });
    }, [initialSection, data]);

    const n = (v: number) => String(v);
    const tip = (score: number, innings: number) => t("sim.dash.tipScore").replace("{s}", n(score)).replace("{i}", n(innings));

    return (
        <div className="w-full max-w-[420px] mx-auto px-5 pt-4 pb-8">
            <div className="flex items-center justify-between gap-3 mb-3">
                <h1 className="text-[20px] font-bold text-ink-1 leading-tight">{t("sim.dash.title")}</h1>
                <button type="button" onClick={onClose} className={pill}>{t("sim.common.close")}</button>
            </div>

            {stats.isPending && <p className="text-[13px] font-medium text-ink-4 min-h-11 flex items-center">{t("sim.dash.loading")}</p>}
            {stats.isError && (
                <div className="flex items-center justify-between gap-3 min-h-11">
                    <p className="text-[13px] font-medium text-ink-2">{t("sim.dash.failed")}</p>
                    <button type="button" onClick={() => { void stats.refetch(); }} className={pill}>{t("sim.match.retry")}</button>
                </div>
            )}

            {data && (
                <div className={cn("flex flex-col gap-3", stats.isFetching && "opacity-80")}>
                    {combos.length > 1 && (
                        <div role="group" aria-label={t("sim.dash.filterAria")} className="flex gap-2 overflow-x-auto -mx-5 px-5 pb-1">
                            {combos.map((c) => {
                                const sel = combo !== null && sameCombo(c, combo);
                                return (
                                    <button
                                        key={comboKey(c)} type="button" aria-pressed={sel} onClick={() => setPick(comboKey(c))}
                                        className={cn("h-10 px-3.5 shrink-0 rounded-pill border text-[13px] font-semibold", sel ? "border-ink-1 bg-ink-1 text-surface-1" : "border-surface-line bg-surface-1 text-ink-2 active:bg-surface-3")}
                                    >
                                        {gameLabel(c, t)}
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {series.length > 0 ? (
                        <>
                            <section className={card} aria-label={t("sim.dash.heroAria")}>
                                <p className="text-[12px] font-semibold text-ink-3">{t("sim.dash.heroLabelMatch").replace("{n}", n(form.sessions))}</p>
                                <div className="flex items-baseline gap-3 mt-1 flex-wrap">
                                    <span data-hero className="text-[48px] font-black text-ink-1 leading-none tracking-tight">{formatAvg(form.avg)}</span>
                                    {form.delta !== null ? (
                                        <span className={cn("rk-num text-[13px] font-semibold", form.delta >= 0 ? "text-brand" : "text-ink-3")}>
                                            {t("sim.dash.delta").replace("{d}", signedAvg(form.delta))}
                                        </span>
                                    ) : (
                                        <span className="text-[12px] font-medium text-ink-4">{t("sim.dash.deltaNone")}</span>
                                    )}
                                </div>
                                <p className="rk-num text-[12.5px] font-medium text-ink-3 mt-2">
                                    {t("sim.dash.heroSubMatch").replace("{n}", n(mr?.matches ?? series.length))}
                                </p>
                            </section>

                            <div className="grid grid-cols-3 gap-2">
                                <Tile label={t("sim.dash.kMatches")} value={n(mr?.matches ?? series.length)} />
                                <Tile label={t("sim.dash.kBestAvg")} value={formatAvg(Math.max(0, ...series.map((p) => p.avg)))} tone="best" />
                                <Tile label={t("sim.dash.kHighRun")} value={n(Math.max(0, ...series.map((p) => p.highRun)))} tone="best" />
                                <Tile label={t("sim.dash.kRank")} value={rank ? t("sim.dash.rankValue").replace("{r}", n(rank.rank)) : "–"} sub={rank ? t("sim.dash.rankOf").replace("{n}", n(rank.total)) : undefined} />
                                <button type="button" onClick={onRank} aria-label={t("sim.rank.title")} className="text-left rounded-tile active:opacity-80" disabled={!onRank}>
                                    <Tile
                                        label={t("sim.dash.kRating")} value={n(mr?.rating ?? 1000)}
                                        sub={(() => { const st = rankStatus(mr?.rating ?? 1000, mr?.matches ?? 0); return st.tier ? t(st.tier.nameKey) : t("sim.rank.unranked").replace("{n}", n(mr?.matches ?? 0)).replace("{m}", n(PLACEMENT_MATCHES)); })()}
                                    />
                                </button>
                                <Tile label={t("sim.dash.kRecord")} value={t("sim.entry.record").replace("{w}", n(ms.wins)).replace("{l}", n(ms.losses))} />
                            </div>

                            <section className={card}>
                                <CardHeader title={t("sim.dash.trendTitle")} sub={t("sim.dash.trendSub").replace("{n}", n(recent.length))} />
                                <div className="mt-2">
                                    <TrendLine
                                        points={recent.map((p) => ({ label: shortDate(p.at), value: p.avg, detail: tip(p.score, p.innings) }))}
                                        format={formatAvg} ariaLabel={t("sim.dash.chartTrendAria")} emptyText={t("sim.dash.noPractice")}
                                    />
                                </div>
                            </section>

                            <section className={card}>
                                <CardHeader title={t("sim.dash.highRunTitle")} sub={t("sim.dash.trendSub").replace("{n}", n(recent.length))} />
                                <div className="mt-2">
                                    <Columns
                                        points={recent.map((p) => ({ label: shortDate(p.at), value: p.highRun, detail: t("sim.dash.tipAvg").replace("{avg}", formatAvg(p.avg)) }))}
                                        format={(v) => n(Math.round(v))} ariaLabel={t("sim.dash.chartRunAria")} emptyText={t("sim.dash.noPractice")}
                                    />
                                </div>
                            </section>
                        </>
                    ) : (
                        <section className={card}>
                            {/* 2026-09-12: 숫자는 공식 대전만 본다 — 빈 상태도 "대전을 한 판 하라"로 이끈다 */}
                            <p className="text-[16px] font-bold text-ink-1">{t(combo ? "sim.dash.noMatchYet" : "sim.dash.empty")}</p>
                            <p className="text-[13px] font-medium text-ink-3 mt-1">{t("sim.dash.emptyDescMatch")}</p>
                            <button type="button" onClick={onLobby} className={cn(primary, "mt-4")}>{t("sim.dash.startMatch")}</button>
                        </section>
                    )}

                    <section ref={matchesRef} id="sim-dash-matches" className={card} style={{ scrollMarginTop: 12 }}>
                        <CardHeader
                            title={t("sim.dash.matchesTitle")} sub={combo ? gameLabel(combo, t) : undefined}
                            action={<button type="button" onClick={onLobby} className={pillSm}>{t("sim.entry.create")}</button>}
                        />
                        <div className="grid grid-cols-3 gap-2 mt-3">
                            <Tile label={t("sim.dash.kRecord")} value={t("sim.entry.record").replace("{w}", n(ms.wins)).replace("{l}", n(ms.losses))} />
                            <Tile
                                label={t("sim.dash.kStreak")}
                                value={ms.streak ? t(ms.streak.kind === "W" ? "sim.dash.streakWin" : "sim.dash.streakLoss").replace("{n}", n(ms.streak.n)) : "–"}
                                tone={ms.streak?.kind === "L" ? "warn" : undefined}
                            />
                            <Tile label={t("sim.dash.kMyTurn")} value={n(ms.myTurn)} sub={t("sim.dash.activeSub").replace("{n}", n(ms.active))} />
                        </div>
                        {ms.results.length > 0 && (
                            <div className="mt-3">
                                <p className="text-[11px] font-semibold text-ink-3 mb-1.5">{t("sim.dash.formTitle").replace("{n}", n(ms.results.length))}</p>
                                <FormStrip results={ms.results} winText={t("sim.dash.win")} lossText={t("sim.dash.loss")} label={t("sim.dash.formTitle").replace("{n}", n(ms.results.length))} />
                            </div>
                        )}
                        <div className="mt-3 border-t border-surface-line pt-1">
                            <MatchList onOpen={onOpenMatch} api={matchApi} />
                        </div>
                    </section>

                    <section className={card}>
                        <CardHeader
                            title={t("sim.dash.drillTitle")} sub={t("sim.dash.drillSub")}
                            action={<button type="button" onClick={onDrills} className={pillSm}>{t("sim.dash.drillOpen")}</button>}
                        />
                        <div className="flex items-center gap-2.5 mt-3 flex-wrap">
                            <span className="inline-flex gap-1" aria-hidden="true">
                                {Array.from({ length: weekTotal }, (_, i) => (
                                    <span key={i} className={cn("w-2 h-2 rounded-full", i < (thisWeek?.successes ?? 0) ? "bg-ink-1" : i < (thisWeek?.attempts ?? 0) ? "bg-ink-4" : "bg-surface-line")} />
                                ))}
                            </span>
                            <span className="rk-num text-[13px] font-semibold text-ink-1">
                                {t("sim.dash.drillWeek").replace("{s}", n(thisWeek?.successes ?? 0)).replace("{n}", n(weekTotal))}
                            </span>
                            <span className="rk-num text-[12px] font-medium text-ink-3 ml-auto">
                                {t("sim.dash.drillTotal").replace("{s}", n(totals.successes)).replace("{a}", n(totals.attempts))}
                            </span>
                        </div>
                        <div className="mt-2">
                            <Columns
                                points={totals.attempts > 0 ? drills.map((w) => ({
                                    label: t("sim.dash.weekShort").replace("{week}", n(w.weekNo)),
                                    value: w.successes,
                                    detail: t("sim.dash.drillTip").replace("{a}", n(w.attempts)).replace("{c}", n(w.cushions)),
                                })) : []}
                                ticks={[0, weekTotal]} format={(v) => n(Math.round(v))} ariaLabel={t("sim.dash.chartDrillAria")}
                                emptyText={t("sim.dash.drillEmpty")} height={130} labelEvery={1} tableCaption={t("sim.dash.chartDrillAria")}
                            />
                        </div>
                    </section>

                    {recent.length > 0 && (
                        <section className={card}>
                            <CardHeader title={t("sim.dash.sessionsTitle")} sub={t("sim.dash.sessionsSub").replace("{n}", n(recent.length))} />
                            <table className="w-full mt-2 text-[13px]">
                                <thead>
                                    <tr className="text-[11px] font-semibold text-ink-3">
                                        <th scope="col" className="text-left font-semibold py-1">{t("sim.dash.colDate")}</th>
                                        <th scope="col" className="text-right font-semibold py-1">{t("sim.dash.colScore")}</th>
                                        <th scope="col" className="text-right font-semibold py-1">{t("sim.dash.colAvg")}</th>
                                        <th scope="col" className="text-right font-semibold py-1">{t("sim.dash.colHighRun")}</th>
                                    </tr>
                                </thead>
                                <tbody className="rk-num">
                                    {shown.map((p) => (
                                        <tr key={p.id} className="border-t border-surface-line">
                                            <td className="py-2 text-ink-2 font-medium">{shortDate(p.at)}</td>
                                            <td className="py-2 text-right text-ink-2 font-medium">{p.score}/{p.innings}</td>
                                            <td className="py-2 text-right text-ink-1 font-semibold">{formatAvg(p.avg)}</td>
                                            <td className="py-2 text-right text-ink-2 font-medium">{p.highRun}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {tableRows.length > shown.length && (
                                <button type="button" onClick={() => setShowAll(true)} className="mt-2 h-11 w-full rounded-tile bg-surface-3 text-[13px] font-semibold text-ink-2 active:bg-surface-line">
                                    {t("sim.dash.showAll").replace("{n}", n(tableRows.length))}
                                </button>
                            )}
                        </section>
                    )}
                </div>
            )}
        </div>
    );
}

export default SimDash;
