import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Cpu } from "@/lib/icons";
import { apiRequest } from "@/lib/queryClient";
import { useT } from "@/lib/i18n";
import { BallDot } from "@/components/hiq/BallDot";
import { cn } from "@/lib/utils";
import type { FilterType } from "./types";
import { drillApi, weekProgress } from "@/sim/drill/drillApi";

/**
 * 기록 페이지의 시뮬레이터 섹션. 실전 전적(RP·에버리지)과는 다른 테이블(hiq_sim_*)에서 읽고,
 * 화면에서도 "별개로 집계" 라고 못 박는다 — 실전 기록과 섞이면 안 된다(RP 오염 사고 이후 원칙).
 */
interface SimRating {
    gameType: "3c" | "4c";
    tableId: "DAEDAE" | "JUNGDAE_KR";
    sessions: number;
    totalScore: number;
    totalInnings: number;
    bestAvg: number;
    bestHighRun: number;
}

interface SimSession {
    id: string;
    gameType: "3c" | "4c";
    tableId: "DAEDAE" | "JUNGDAE_KR";
    targetScore: number;
    score: number;
    innings: number;
    highRun: number;
    shots: number;
    status: "playing" | "finished" | "abandoned";
    startedAt: string;
    rules: { gameType: "3c"; ruleSet: "umb" | "pba" } | { gameType: "4c" };
}

interface Props {
    filter: FilterType;
}

function formatDate(iso: string): string {
    const d = new Date(iso);
    return `${d.getMonth() + 1}.${d.getDate()}`;
}

export function SimHistoryCard({ filter }: Props) {
    const { t } = useT();
    const [, setLocation] = useLocation();

    const { data: ratings = [] } = useQuery<SimRating[]>({
        queryKey: ["/api/hiq/sim/ratings/me"],
        queryFn: async () => (await apiRequest("/api/hiq/sim/ratings/me")) ?? [],
    });
    const { data: sessions = [] } = useQuery<SimSession[]>({
        queryKey: ["/api/hiq/sim/sessions"],
        queryFn: async () => (await apiRequest("/api/hiq/sim/sessions")) ?? [],
    });

    const { data: week } = useQuery({
        queryKey: ["sim-drills", "week"],
        queryFn: () => drillApi.getWeek(),
        staleTime: 30_000,
    });
    const drillProgress = week ? weekProgress(week) : null;

    const wanted = (g: "3c" | "4c") => filter === "all" || filter === g;
    const shownRatings = ratings.filter((r) => wanted(r.gameType));
    const shownSessions = sessions.filter((s) => wanted(s.gameType) && s.shots > 0).slice(0, 5);

    const totals = shownRatings.reduce(
        (acc, r) => ({
            sessions: acc.sessions + r.sessions,
            bestAvg: Math.max(acc.bestAvg, r.bestAvg),
            bestHighRun: Math.max(acc.bestHighRun, r.bestHighRun),
        }),
        { sessions: 0, bestAvg: 0, bestHighRun: 0 },
    );

    const tableName = (id: SimSession["tableId"]) => (id === "DAEDAE" ? t("sim.setup.tableDaedae") : t("sim.setup.tableJungdae"));
    const statusLabel = (s: SimSession["status"]) =>
        s === "finished" ? t("sim.history.finished") : s === "playing" ? t("sim.history.playing") : t("sim.history.abandoned");

    return (
        <section className="mb-6">
            <h3 className="text-[15px] font-semibold mb-3 flex items-center gap-2 text-black/55">
                <Cpu className="w-4 h-4" />
                {t("sim.history.title")}
                <span className="text-[12px] font-medium text-ink-4 ml-auto">{t("sim.history.subtitle")}</span>
            </h3>

            <div className="bg-surface-1 rounded-card p-4">
                {drillProgress && filter !== "4c" && (
                    <button
                        type="button"
                        onClick={() => setLocation("/online-game?drills=1")}
                        className="w-full mb-3 rounded-tile bg-surface-2 px-3 py-2.5 flex items-center justify-between gap-2 text-left"
                    >
                        <span className="text-[13px] font-semibold text-ink-1">{t("sim.drill.title")}</span>
                        <span className="rk-num text-[13px] font-medium text-ink-3">
                            {t("sim.drill.progress").replace("{s}", String(drillProgress.successes)).replace("{a}", String(drillProgress.attempted)).replace("{n}", String(drillProgress.total))}
                        </span>
                    </button>
                )}
                {totals.sessions === 0 && shownSessions.length === 0 ? (
                    <div className="text-center py-4">
                        <p className="text-[13px] font-medium text-ink-3 mb-3">{t("sim.history.empty")}</p>
                        <button
                            type="button"
                            onClick={() => setLocation("/online-game")}
                            className="h-10 px-4 rounded-pill bg-brand text-brand-fg text-[13px] font-semibold"
                        >
                            {t("sim.history.open")}
                        </button>
                    </div>
                ) : (
                    <>
                        <div className="grid grid-cols-3 gap-2 mb-3">
                            {[
                                { label: t("sim.history.sessions"), value: String(totals.sessions) },
                                { label: t("sim.history.bestAvg"), value: totals.bestAvg.toFixed(3) },
                                { label: t("sim.history.bestHighRun"), value: String(totals.bestHighRun) },
                            ].map((c) => (
                                <div key={c.label} className="rounded-tile bg-surface-2 px-3 py-2.5">
                                    <div className="text-[12px] font-medium text-ink-4">{c.label}</div>
                                    <div className="rk-num text-[18px] font-semibold text-ink-1 leading-tight mt-0.5">{c.value}</div>
                                </div>
                            ))}
                        </div>

                        <ul className="divide-y divide-surface-line">
                            {shownSessions.map((s) => {
                                const avg = s.innings > 0 ? s.score / s.innings : 0;
                                const badge = s.rules.gameType === "3c" ? s.rules.ruleSet.toUpperCase() : t("sim.setup.type4c");
                                return (
                                    <li key={s.id} className="flex items-center gap-3 py-2.5">
                                        <BallDot type={s.gameType} size={12} />
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-1">
                                                <span className="rk-num">{s.score}</span>
                                                <span className="text-ink-4 font-medium">/ {s.targetScore}</span>
                                                <span className="text-[12px] font-medium text-ink-4">· {t("sim.history.inningsN").replace("{n}", String(s.innings))}</span>
                                                <span className="text-[12px] font-medium text-ink-4">· {t("sim.history.avg")} {avg.toFixed(3)}</span>
                                            </div>
                                            <div className="text-[12px] font-medium text-ink-4 mt-0.5">
                                                {formatDate(s.startedAt)} · {tableName(s.tableId)} · {badge}
                                            </div>
                                        </div>
                                        <span
                                            className={cn(
                                                "px-2 py-0.5 rounded-lg text-[12px] font-semibold",
                                                s.status === "finished" ? "bg-brand/[0.08] text-brand" : "bg-surface-2 text-ink-3",
                                            )}
                                        >
                                            {statusLabel(s.status)}
                                        </span>
                                    </li>
                                );
                            })}
                        </ul>
                    </>
                )}
            </div>
        </section>
    );
}
