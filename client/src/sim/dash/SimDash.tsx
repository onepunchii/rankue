/**
 * 시뮬레이터 대시보드(2026-09-08 오너): 진입 화면 머리글의 "대시보드" 버튼(닫기 옆)으로 들어온다(`/online-game?dash=1`).
 * 위에서부터 — 종목·테이블 칩(하나면 숨김) → 큰 숫자(최근 10세션 에버리지 + 이전 10세션 대비) → 지표 여섯 칸 →
 * 에버리지 추이(선) → 세션별 하이런(막대) → 친구와 대전(전적·연승·최근 흐름 + 내 대전 목록: 열기·기권·취소) → 드릴(이번 주 + 주별 성공 막대) → 최근 세션 표(차트의 표 버전).
 * 칩을 고르면 연습 숫자·차트·대전 전적이 모두 그 조합 기준으로 바뀐다(드릴은 3쿠션 대대 고정). 값은 hiq_sim_* 만 — 실전 RP 와 무관.
 * 화면의 초록 버튼은 기록이 없을 때의 "연습 시작" 하나뿐이다.
 *
 * 2026-10-12 — 순서의 3번: 랭킹 · 멀티방과 같은 '진열장' 톤(.rank-hall)으로.
 *  - 머리에 당구장 불빛과 그림. 맨 위에 **내 등급 카드**(등급 배지 · 레이팅 · 순위 · 전적 · 다음 등급까지) — 누르면 랭킹.
 *    예전 지표 여섯 칸 가운데 대전 랭킹 · 온라인 레이팅 · 전적은 이 카드가 가져갔다(같은 숫자를 두 번 적지 않는다). 남은 칸은 대전 수 · 최고 에버 · 하이런.
 *  - 그 아래 그림 칸 셋(대전 · 드릴 · 연습) — 이 화면의 세 구역으로 가는 길이자 한눈에 보는 요약.
 *  - 장식장 띠는 아직 없다(장식장이 만들어진 뒤에 — 없는 것을 있는 것처럼 보이지 않는다).
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { drillsForWeek } from "@shared/sim/drills";
import { rankStatus, tierFor, tierProgress, PLACEMENT_MATCHES } from "@shared/sim/rank";
import { TIER_GLOW, TierEmblem } from "../rank/TierEmblem";
import { matchApi as defaultMatchApi, type MatchApi, type MatchPublic } from "../matchApi";
import { MATCH_LIST_QUERY_KEY, MATCH_LIST_REFETCH_MS } from "../match/queryKeys";
import { MatchList, hasLiveMatch } from "../match/MatchList";
import { gameLabel } from "../match/matchView";
import { formatAvg } from "../entry/entryStats";
import { fetchSimStats, SIM_STATS_QUERY_KEY, type StatsFetcher } from "./dashApi";
import {
    availableCombos, bestAvgOf, bestHighRunOf, comboKey, drillSeries, drillTotals, matchSummary, overallAvg, ratingFor, recentForm, recordFor, sameCombo,
    sessionSeries, shortDate, signedAvg, type Combo, matchSeries} from "./dashStats";
import { Columns, FormStrip, TrendLine } from "./charts";
import { ShelfLink } from "../rank/ShelfLink";

export interface SimDashProps {
    onClose: () => void;
    onOpenMatch: (m: MatchPublic) => void;
    onPractice: () => void;
    onDrills: () => void;
    onLobby: () => void;
    /** 온라인 레이팅 칸을 누르면 랭킹 화면 */
    onRank?: () => void;
    /** 내 장식장으로(2026-10-12) — 등급 카드 아래의 한 줄. 안 주면 그리지 않는다 */
    onShelf?: () => void;
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
/** 머리 그림 · 그림 칸 — 등급 배지와 같은 화풍(public/sim/rank) */
// 대전 그림은 멀티방 머리와 같은 것이다(match/RoomList 의 ROOMS_ART_SRC) — 그 파일을 끌어오면 방 목록 화면 전체가 딸려 와 주소만 적는다.
export const DASH_ART = { head: "/sim/rank/icon-stats.webp", match: "/sim/rank/rooms.webp", drill: "/sim/rank/icon-drill.webp", practice: "/sim/rank/icon-practice.webp" } as const;
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

/** 그림 칸 — 그림 · 이름 · 한 줄. 누르면 그 구역으로 간다 */
function ArtTile({ art, title, sub, onClick, testId }: { art: string; title: string; sub: string; onClick: () => void; testId: string }) {
    return (
        <button type="button" onClick={onClick} data-testid={testId} className="hall-row min-w-0 px-1.5 pt-2 pb-2.5 flex flex-col items-center text-center active:opacity-80">
            <img src={art} width={56} height={56} alt="" aria-hidden="true" decoding="async" draggable={false} className="w-14 h-14 object-contain" style={{ filter: "drop-shadow(0 3px 4px rgba(0,0,0,0.5))" }} />
            <span className="block w-full text-[13px] font-black text-ink-1 truncate mt-1">{title}</span>
            <span className="block w-full rk-num text-[11.5px] font-bold text-ink-3 truncate mt-0.5">{sub}</span>
        </button>
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

export function SimDash({ onClose, onOpenMatch, onPractice, onDrills, onLobby, onRank, onShelf, initialSection, statsApi = fetchSimStats, matchApi = defaultMatchApi, now }: SimDashProps) {
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
    // 온라인 대전 순위(myMatchRanks)는 종목별(대대·중대 통합)이다. 옛 연습 사다리 순위는 갱신이 멈춰 뺐다(2026-09-26).
    const rank = data && combo ? (data.matchRanks ?? []).find((r) => r.gameType === combo.gameType) : undefined;
    const ms = matchSummary(rows, combo, FORM_N);
    // 승패는 서버의 조합별 전체 집계로 본다. 대전 목록은 최근 20개뿐이라 새 대전이 생길 때마다 승수가 흔들렸다.
    const record = recordFor(data?.matchRecords, combo, ms);
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
        <div className="rank-hall w-full max-w-[420px] mx-auto pb-8">
            {/* 머리 — 랭킹 · 멀티방과 같은 당구장 불빛 아래 */}
            <header className="hall-top relative px-5 pt-4">
                <button type="button" onClick={onClose} className="absolute right-5 top-4 h-11 px-4 rounded-pill border border-white/25 bg-black/40 text-[13px] font-semibold text-white/90 active:bg-black/60">
                    {t("sim.common.close")}
                </button>
                <div className="flex items-end gap-2 pt-9">
                    <img src={DASH_ART.head} width={84} height={84} alt="" aria-hidden="true" decoding="async" draggable={false} className="hall-trophy shrink-0" style={{ width: 84, height: 84 }} />
                    <div className="min-w-0 pb-3">
                        <h1 className="text-[21px] font-black text-white leading-tight">{t("sim.dash.title")}</h1>
                    </div>
                </div>
            </header>
            <div className="px-5 pt-1">

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
                                        className={cn("h-10 px-3.5 shrink-0 rounded-pill border text-[13px] font-semibold", sel ? "border-transparent bg-[color:var(--hall-lime)] text-[#0B1A03]" : "border-white/15 bg-white/[0.08] text-white/85 active:bg-white/15")}
                                    >
                                        {gameLabel(c, t)}
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {/* 내 등급 카드 — 이 종목의 온라인 대전 레이팅. 배치 전에는 배지가 없다(실루엣). 누르면 랭킹 */}
                    {(() => {
                        const myRating = mr?.rating ?? 1000;
                        const st = rankStatus(myRating, mr?.matches ?? 0);
                        const glow = st.tier ? TIER_GLOW[st.tier.id] : "rgba(255,255,255,0.6)";
                        return (
                            <button type="button" onClick={onRank} disabled={!onRank} aria-label={t("sim.rank.title")} data-testid="dash-tier"
                                className="hall-me rounded-[22px] px-4 py-3.5 flex items-center gap-2 text-left active:opacity-90">
                                <span className={cn("shrink-0 -ml-2", st.tier && "hall-emblem")}>
                                    {st.tier ? <TierEmblem tier={st.tier.id} size={104} glow /> : <TierEmblem tier="iron" size={104} locked />}
                                </span>
                                <span className="flex-1 min-w-0">
                                    <span className="block text-[13px] font-black truncate" style={{ color: glow }}>
                                        {st.tier ? t(st.tier.nameKey) : t("sim.rank.unrankedShort")}
                                        <span className="font-bold text-white/60"> · {t("sim.dash.kRating")}</span>
                                    </span>
                                    <span className="block rk-num text-[38px] font-black text-white leading-none tracking-tight mt-1" data-rating>{myRating}</span>
                                    <span className="block rk-num text-[12.5px] font-bold text-white/80 mt-1.5 truncate">
                                        {st.placed && rank?.rank != null
                                            ? t("sim.rank.rankOf").replace("{r}", n(rank.rank)).replace("{n}", n(rank.total))
                                            : t("sim.rank.unranked").replace("{n}", n(mr?.matches ?? 0)).replace("{m}", n(PLACEMENT_MATCHES))}
                                        {" · "}{t("sim.entry.record").replace("{w}", n(record.wins)).replace("{l}", n(record.losses))}
                                    </span>
                                    {st.placed && st.tier && st.toNext !== null && (
                                        <span className="block h-1.5 rounded-pill bg-white/15 overflow-hidden mt-2" aria-hidden="true">
                                            <span className="block h-full rounded-pill" style={{ width: `${Math.max(4, Math.round(tierProgress(myRating) * 100))}%`, background: `linear-gradient(90deg, ${TIER_GLOW[st.tier.id]}, ${TIER_GLOW[tierFor(myRating + st.toNext).id]})` }} />
                                        </span>
                                    )}
                                    <span className="block rk-num text-[12px] font-bold text-white/70 mt-1.5 truncate">
                                        {!st.placed
                                            ? t("sim.rank.placementHint").replace("{n}", n(st.placementLeft))
                                            : st.toNext !== null
                                                ? t("sim.rank.nextTier").replace("{tier}", t(tierFor(myRating + st.toNext).nameKey)).replace("{n}", n(st.toNext))
                                                : t("sim.rank.topTier")}
                                    </span>
                                </span>
                            </button>
                        );
                    })()}

                    {/* 달마다 받은 메달 · 등급 배지 — 장식장으로 */}
                    {onShelf && <ShelfLink onClick={onShelf} sub={t("sim.shelf.linkSub")} testId="dash-shelf" />}

                    {/* 그림 칸 셋 — 이 화면의 세 구역으로 가는 길 */}
                    <div className="grid grid-cols-3 gap-2">
                        <ArtTile art={DASH_ART.match} title={t("sim.dash.navMatch")} sub={`${t("sim.dash.kMyTurn")} ${n(ms.myTurn)}`} testId="dash-nav-match"
                            onClick={() => { const el = matchesRef.current; if (el && typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "start", behavior: "smooth" }); }} />
                        <ArtTile art={DASH_ART.drill} title={t("sim.dash.drillTitle")} sub={t("sim.dash.drillWeek").replace("{s}", n(thisWeek?.successes ?? 0)).replace("{n}", n(weekTotal))} testId="dash-nav-drill" onClick={onDrills} />
                        <ArtTile art={DASH_ART.practice} title={t("sim.dash.navPractice")} sub={practice.length > 0 ? t("sim.dash.practiceN").replace("{n}", n(practice.length)) : t("sim.dash.startPractice")} testId="dash-nav-practice" onClick={onPractice} />
                    </div>

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
                                    {t("sim.dash.heroSubMatch").replace("{n}", n(record.total || series.length))}
                                </p>
                            </section>

                            <div className="grid grid-cols-3 gap-2">
                                {/* 대전 수는 이 칩(종목·테이블)의 수여야 한다 — 종목 합산(mr.matches)을 쓰면 "22판인데 1승 3패" 가 된다. */}
                                <Tile label={t("sim.dash.kMatches")} value={n(record.total || series.length)} />
                                <Tile label={t("sim.dash.kBestAvg")} value={formatAvg(Math.max(0, ...series.map((p) => p.avg)))} tone="best" />
                                <Tile label={t("sim.dash.kHighRun")} value={n(Math.max(0, ...series.map((p) => p.highRun)))} tone="best" />
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
                            <Tile label={t("sim.dash.kRecord")} value={t("sim.entry.record").replace("{w}", n(record.wins)).replace("{l}", n(record.losses))} />
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

                    {/* 혼자 친 기록 경기 — 목록만(집계·그래프 없음). 2026-09-12 오너 "숫자는 공식 대전만" 을 지키면서
                        혼자 연습한 흔적은 볼 수 있게 한다(2026-09-26 검토). */}
                    <section className={card}>
                        <CardHeader
                            title={t("sim.dash.practiceTitle")} sub={t("sim.dash.practiceSub")}
                            action={<button type="button" onClick={onPractice} className={pillSm}>{t("sim.dash.startPractice")}</button>}
                        />
                        {practice.length === 0 ? (
                            <p className="text-[13px] font-medium text-ink-4 mt-3">{t("sim.dash.practiceEmpty")}</p>
                        ) : (
                            <ul className="mt-2 rk-num text-[13px]">
                                {[...practice].reverse().map((p) => (
                                    <li key={p.id} className="flex items-center gap-3 py-2 border-t border-surface-line first:border-t-0">
                                        <span className="w-14 shrink-0 text-ink-3 font-medium">{shortDate(p.at)}</span>
                                        <span className="flex-1 text-ink-2 font-medium">{p.score}/{p.target} · {t("sim.dash.inningsN").replace("{n}", n(p.innings))}</span>
                                        <span className="text-ink-1 font-semibold">{formatAvg(p.avg)}</span>
                                        <span className="w-10 text-right text-ink-3 font-medium">{t("sim.dash.runN").replace("{n}", n(p.highRun))}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
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
        </div>
    );
}

export default SimDash;
