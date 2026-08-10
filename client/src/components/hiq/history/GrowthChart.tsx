import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
    Area,
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    ComposedChart,
    Line,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";
import { format, isSameMonth, subMonths } from "date-fns";
import { LucideTrendingUp, LucideTrendingDown } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { ExtendedGameHistory, FilterType } from "./types";

/** 디자인 토큰과 같은 값. recharts는 CSS 변수를 못 받아서 리터럴로 둔다. */
const BRAND = "#006241";
const BRAND_SOFT = "rgba(0,98,65,0.32)";
const BRAND_DOT = "rgba(0,98,65,0.45)";
const BRAND_BAR = "rgba(0,98,65,0.22)";
const GRID = "rgba(0,0,0,0.06)";
const AXIS = "rgba(0,0,0,0.35)";

/** 모바일 카드 폭(≈300px)에서 점이 뭉개지지 않는 한계 */
const WINDOW = 10; // 최근 10경기 — 그 이상은 선이 빽빽해져 추이가 안 읽힌다 (오너 결정 2026-08-09)
/** 두 점짜리 선은 '추이'로 읽히지 않는다 */
const MIN_GAMES = 3;

type Metric = "avg" | "highRun";

interface GrowthPoint {
    /** 카테고리 축 키 — 같은 날 두 경기가 있어도 겹치지 않도록 인덱스를 붙인다 */
    key: string;
    label: string;
    fullDate: string;
    /** 월 비교용 원본 시각 — 문자열을 되파싱하면 타임존 경계에서 달이 밀린다 */
    ts: number;
    avg: number;
    /** 첫 경기부터 이 경기까지의 누적 평균(윈도우가 아니라 전체 기준) */
    cum: number;
    score: number;
    innings: number;
    highRun: number;
    /** 그 시점까지의 최고 하이런을 갱신한 경기인가 */
    isRecord: boolean;
    isWinner: boolean;
}

interface GrowthChartProps {
    /** stats.officialHistory — 최신순 */
    history: ExtendedGameHistory[];
    filter: FilterType;
    /** stats.mainMode — "3-Cushion" | "4-Ball" */
    mainMode: string;
}

const fmtAvg = (v: number) => v.toFixed(3);

const ChartTooltip = ({ active, payload, metric }: any) => {
    if (!active || !payload?.length) return null;
    const p: GrowthPoint | undefined = payload[0]?.payload;
    if (!p) return null;

    return (
        <div className="rounded-xl bg-white px-3.5 py-3 shadow-[0_6px_20px_rgba(0,0,0,0.14)] min-w-[132px]">
            <div className="flex items-center justify-between gap-3 mb-2">
                <span className="text-[12px] font-medium text-black/45 tabular-nums">{p.fullDate}</span>
                <span className={cn("text-[11px] font-bold", p.isWinner ? "text-brand" : "text-red-500")}>
                    {p.isWinner ? "승" : "패"}
                </span>
            </div>
            <div className="flex items-baseline gap-1.5 mb-2">
                <span className="text-[15px] font-bold text-ink-1 tabular-nums leading-none">{p.score}</span>
                <span className="text-[12px] font-medium text-black/45">득점</span>
                <span className="w-px h-3 bg-black/10 mx-0.5" />
                <span className="text-[15px] font-bold text-ink-1 tabular-nums leading-none">{p.innings}</span>
                <span className="text-[12px] font-medium text-black/45">이닝</span>
            </div>

            {metric === "highRun" ? (
                <div className="flex items-center justify-between gap-3">
                    <span className="text-[12px] font-medium text-black/45">하이런</span>
                    <span className="text-[14px] font-bold text-brand tabular-nums leading-none">
                        {p.highRun}
                        {p.isRecord && <span className="ml-1 text-[11px] font-semibold">최고 갱신</span>}
                    </span>
                </div>
            ) : (
                <div className="space-y-1">
                    <div className="flex items-center justify-between gap-3">
                        <span className="text-[12px] font-medium text-black/45">평균</span>
                        <span className="text-[14px] font-bold text-brand tabular-nums leading-none">{fmtAvg(p.avg)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                        <span className="text-[12px] font-medium text-black/45">누적</span>
                        <span className="text-[13px] font-semibold text-ink-1 tabular-nums leading-none">{fmtAvg(p.cum)}</span>
                    </div>
                </div>
            )}
        </div>
    );
};

export const GrowthChart = ({ history, filter, mainMode }: GrowthChartProps) => {
    const [metric, setMetric] = useState<Metric>("avg");

    // 전체 탭은 3구·4구가 섞여 들어온다. 스케일이 10배 가까이 달라 한 선에 그리면
    // 톱니만 남고 성장이 안 보이므로, useGameStats가 정한 주 종목(mainMode)만 그린다.
    const modeType: "3c" | "4c" = filter === "all" ? (mainMode === "3-Cushion" ? "3c" : "4c") : filter;
    const modeLabel = modeType === "3c" ? "3쿠션" : "4구";

    const { points, best } = useMemo(() => {
        const src = (history || []).filter((g) => (filter === "all" ? g.gameType === modeType : true));

        // 서버는 최신순으로 주지만, 그래프는 시간순이어야 한다.
        const chrono = [...src].sort(
            (a, b) => new Date(a.createdAt as any).getTime() - new Date(b.createdAt as any).getTime()
        );

        let sumScore = 0;
        let sumInnings = 0;
        let runningBest = 0;

        const list: GrowthPoint[] = chrono.map((g, i) => {
            const innings = g.innings || 0;
            const stored = parseFloat(g.average);
            const avg = !isNaN(stored) ? stored : innings > 0 ? g.score / innings : 0;

            sumScore += g.score;
            sumInnings += innings;

            const hr = g.highRun || 0;
            const isRecord = hr > 0 && hr > runningBest;
            if (hr > runningBest) runningBest = hr;

            const d = new Date(g.createdAt as any);
            return {
                key: `${i}|${format(d, "M.d")}`,
                label: format(d, "M.d"),
                fullDate: format(d, "yyyy.MM.dd"),
                ts: d.getTime(),
                avg,
                cum: sumInnings > 0 ? sumScore / sumInnings : 0,
                score: g.score,
                innings,
                highRun: hr,
                isRecord,
                isWinner: g.isWinner === true,
            };
        });

        return { points: list, best: runningBest };
    }, [history, filter, modeType]);

    // 이번 달 vs 지난달 — 이닝 합으로 나눠야 종목 평균과 같은 정의가 된다.
    const monthly = useMemo(() => {
        if (points.length < MIN_GAMES) return null;
        const now = new Date();
        const prev = subMonths(now, 1);

        const bucket = (target: Date) => {
            const rows = points.filter((p) => isSameMonth(new Date(p.ts), target));
            const s = rows.reduce((a, p) => a + p.score, 0);
            const inn = rows.reduce((a, p) => a + p.innings, 0);
            return { count: rows.length, avg: inn > 0 ? s / inn : 0 };
        };

        const cur = bucket(now);
        const last = bucket(prev);
        if (cur.count === 0 || last.count === 0) return null;

        return { cur, last, delta: cur.avg - last.avg };
    }, [points]);

    const view = useMemo(() => points.slice(-WINDOW), [points]);
    const hasHighRun = best > 0;
    const shown: Metric = hasHighRun ? metric : "avg";

    // Y축 여백 — dataMin/dataMax에 딱 붙으면 선이 카드 모서리에 닿아 답답하다.
    const avgDomain = useMemo(() => {
        const vals = view.flatMap((p) => [p.avg, p.cum]).filter((v) => isFinite(v));
        if (!vals.length) return [0, 1] as [number, number];
        const lo = Math.min(...vals);
        const hi = Math.max(...vals);
        const pad = Math.max((hi - lo) * 0.25, hi * 0.08, 0.02);
        return [Math.max(0, lo - pad), hi + pad] as [number, number];
    }, [view]);

    // 라벨이 20개면 겹친다. 5개 안팎만 남긴다.
    const tickInterval = Math.max(0, Math.ceil(view.length / 5) - 1);

    if (points.length === 0) return null;

    if (points.length < MIN_GAMES) {
        return (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
                <div className="rk-card p-5 flex items-center gap-4">
                    <div className="w-11 h-11 rounded-full bg-brand/10 flex items-center justify-center shrink-0">
                        <LucideTrendingUp className="w-5 h-5 text-brand" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-[15px] font-semibold text-ink-1 leading-tight">
                            경기를 더 하면 성장 그래프가 나타나요
                        </p>
                        <p className="text-[13px] font-medium text-black/45 mt-1 leading-relaxed">
                            공식 경기 {MIN_GAMES}판부터 평균·하이런 추이를 그려드려요. 지금까지 {points.length}판.
                        </p>
                    </div>
                </div>
            </motion.div>
        );
    }

    return (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
            <div className="rk-card p-5">
                {/* Header */}
                <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <LucideTrendingUp className="w-4 h-4 text-brand shrink-0" />
                            <h3 className="text-[15px] font-bold text-ink-1 leading-none">성장 그래프</h3>
                        </div>
                        <p className="text-[12px] font-medium text-black/45 mt-1.5 tabular-nums">
                            {modeLabel} · 최근 {view.length}경기
                        </p>
                    </div>

                    {hasHighRun && (
                        <div className="flex gap-1 shrink-0">
                            {([
                                { id: "avg" as Metric, label: "평균" },
                                { id: "highRun" as Metric, label: "하이런" },
                            ]).map((tab) => (
                                <button
                                    key={tab.id}
                                    onClick={() => setMetric(tab.id)}
                                    className={cn(
                                        "px-3 py-1.5 rounded-full text-[12px] font-semibold transition-all active:scale-[0.97]",
                                        shown === tab.id
                                            ? "bg-brand text-brand-fg"
                                            : "bg-black/[0.04] text-black/55"
                                    )}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Chart */}
                <div className="h-[176px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        {shown === "avg" ? (
                            <ComposedChart data={view} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="rkGrowthFill" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor={BRAND} stopOpacity={0.13} />
                                        <stop offset="100%" stopColor={BRAND} stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid stroke={GRID} vertical={false} />
                                <XAxis
                                    dataKey="key"
                                    tickFormatter={(v: string) => String(v).split("|")[1] ?? ""}
                                    interval={tickInterval}
                                    axisLine={false}
                                    tickLine={false}
                                    tickMargin={8}
                                    tick={{ fontSize: 10, fill: AXIS }}
                                />
                                <YAxis
                                    domain={avgDomain}
                                    width={40}
                                    tickCount={4}
                                    tickFormatter={(v: number) => Number(v).toFixed(2)}
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fontSize: 10, fill: AXIS }}
                                />
                                <Tooltip
                                    content={<ChartTooltip metric="avg" />}
                                    cursor={{ stroke: "rgba(0,0,0,0.14)", strokeWidth: 1 }}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="cum"
                                    stroke="none"
                                    fill="url(#rkGrowthFill)"
                                    animationDuration={600}
                                />
                                <Line
                                    type="monotone"
                                    dataKey="avg"
                                    stroke={BRAND_SOFT}
                                    strokeWidth={1.5}
                                    dot={{ r: 2, fill: BRAND_DOT, strokeWidth: 0 }}
                                    activeDot={{ r: 3.5, fill: BRAND, strokeWidth: 0 }}
                                    animationDuration={600}
                                />
                                <Line
                                    type="monotone"
                                    dataKey="cum"
                                    stroke={BRAND}
                                    strokeWidth={2.5}
                                    dot={false}
                                    activeDot={{ r: 4, fill: BRAND, stroke: "#ffffff", strokeWidth: 2 }}
                                    animationDuration={600}
                                />
                            </ComposedChart>
                        ) : (
                            <BarChart data={view} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                                <CartesianGrid stroke={GRID} vertical={false} />
                                <XAxis
                                    dataKey="key"
                                    tickFormatter={(v: string) => String(v).split("|")[1] ?? ""}
                                    interval={tickInterval}
                                    axisLine={false}
                                    tickLine={false}
                                    tickMargin={8}
                                    tick={{ fontSize: 10, fill: AXIS }}
                                />
                                <YAxis
                                    width={40}
                                    allowDecimals={false}
                                    tickCount={4}
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fontSize: 10, fill: AXIS }}
                                />
                                <Tooltip
                                    content={<ChartTooltip metric="highRun" />}
                                    cursor={{ fill: "rgba(0,0,0,0.04)" }}
                                />
                                <Bar dataKey="highRun" radius={[4, 4, 0, 0]} maxBarSize={18} animationDuration={600}>
                                    {view.map((p) => (
                                        <Cell key={p.key} fill={p.isRecord ? BRAND : BRAND_BAR} />
                                    ))}
                                </Bar>
                            </BarChart>
                        )}
                    </ResponsiveContainer>
                </div>

                {/* Caption / legend */}
                {shown === "avg" ? (
                    <div className="flex items-center gap-4 mt-3">
                        <span className="flex items-center gap-1.5 text-[12px] font-medium text-black/45">
                            <span className="w-3 h-[3px] rounded-full" style={{ background: BRAND }} />
                            누적 평균
                        </span>
                        <span className="flex items-center gap-1.5 text-[12px] font-medium text-black/45">
                            <span className="w-3 h-[3px] rounded-full" style={{ background: BRAND_SOFT }} />
                            경기별 평균
                        </span>
                    </div>
                ) : (
                    <p className="text-[12px] font-medium text-black/45 mt-3 leading-relaxed">
                        진한 막대는 그때까지의 최고 기록을 갱신한 경기예요 · 최고 하이런{" "}
                        <span className="text-brand font-bold tabular-nums">{best}</span>
                    </p>
                )}

                {/* 이번 달 vs 지난달 */}
                {monthly && (
                    <div className="mt-4 rounded-xl bg-black/[0.04] px-4 py-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                            <p className="text-[12px] font-medium text-black/45 mb-1 leading-none">
                                이번 달 평균 · {monthly.cur.count}경기
                            </p>
                            <p className="text-[20px] font-bold text-ink-1 tabular-nums leading-none tracking-tight">
                                {fmtAvg(monthly.cur.avg)}
                            </p>
                        </div>
                        <div className="text-right shrink-0">
                            <p className="text-[12px] font-medium text-black/45 mb-1 leading-none tabular-nums">
                                지난달 {fmtAvg(monthly.last.avg)}
                            </p>
                            {Math.abs(monthly.delta) < 0.0005 ? (
                                <p className="text-[14px] font-bold text-black/45 leading-none">변화 없음</p>
                            ) : (
                                <p
                                    className={cn(
                                        "text-[14px] font-bold tabular-nums leading-none flex items-center justify-end gap-1",
                                        monthly.delta > 0 ? "text-brand" : "text-red-500"
                                    )}
                                >
                                    {monthly.delta > 0 ? (
                                        <LucideTrendingUp className="w-3.5 h-3.5" />
                                    ) : (
                                        <LucideTrendingDown className="w-3.5 h-3.5" />
                                    )}
                                    {monthly.delta > 0 ? "+" : "−"}
                                    {fmtAvg(Math.abs(monthly.delta))}
                                </p>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </motion.div>
    );
};
