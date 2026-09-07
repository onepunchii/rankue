import { memo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { drillApi, weekProgress, type DrillApi, type DrillWeek, type WeekDrill } from "./drillApi";

/**
 * 이번 주 드릴 5문제와 주간 래더. 문제당 채점 시도는 한 번(서버가 막는다), 그 뒤엔 연습으로 몇 번이든 다시 칠 수 있다.
 * 페이지는 onPlay(drill, week) 로 시뮬레이터를 드릴 모드로 연다.
 */
export const DRILL_WEEK_QUERY_KEY = ["sim-drills", "week"] as const;
export const DRILL_LADDER_QUERY_KEY = ["sim-drills", "ladder"] as const;

interface Props {
    onPlay: (drill: WeekDrill, week: DrillWeek) => void;
    api?: DrillApi;
    myMemberId?: string;
}

const Row = memo(function Row({ d, onPlay }: { d: WeekDrill; onPlay: () => void }) {
    const { t } = useT();
    const a = d.attempt;
    const status = !a ? t("sim.drill.notTried") : a.success
        ? t("sim.drill.success").replace("{n}", String(a.cushions))
        : t("sim.drill.fail");
    return (
        <button
            type="button" onClick={onPlay}
            className="w-full min-h-[64px] rounded-tile border border-surface-line bg-surface-1 px-4 py-3 flex items-center gap-3 text-left active:bg-surface-3"
        >
            <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                <span className="text-[14px] font-semibold text-ink-1 truncate">{t(d.nameKey)}</span>
                <span className="text-[12px] font-medium text-ink-4 truncate">{t(d.hintKey)}</span>
            </span>
            <span className={cn(
                "rk-chip shrink-0",
                !a ? "bg-surface-2 text-ink-3" : a.success ? "bg-brand text-brand-fg" : "bg-surface-2 text-ink-3",
            )}>
                {status}
            </span>
        </button>
    );
});

export function DrillPanel({ onPlay, api = drillApi, myMemberId }: Props) {
    const { t } = useT();
    const week = useQuery({ queryKey: DRILL_WEEK_QUERY_KEY, queryFn: () => api.getWeek(), staleTime: 30_000 });
    const ladder = useQuery({ queryKey: DRILL_LADDER_QUERY_KEY, queryFn: () => api.getLadder(), staleTime: 30_000 });
    const w = week.data;
    const progress = w ? weekProgress(w) : null;

    return (
        <section className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-[16px] font-semibold text-ink-1">{t("sim.drill.title")}</h2>
                {w && (
                    <span className="text-[12px] font-medium text-ink-4">
                        {t("sim.drill.week").replace("{week}", w.weekId)}
                    </span>
                )}
            </div>
            <p className="text-[12px] font-medium text-ink-4">{t("sim.drill.desc")}</p>
            {progress && (
                <div className="rounded-tile bg-surface-2 px-4 py-3 flex items-center gap-4">
                    <span className="text-[13px] font-semibold text-ink-1">
                        {t("sim.drill.progress").replace("{s}", String(progress.successes)).replace("{a}", String(progress.attempted)).replace("{n}", String(progress.total))}
                    </span>
                </div>
            )}
            {week.isLoading && <p className="text-[13px] font-medium text-ink-3">{t("sim.match.listLoading")}</p>}
            {week.isError && <p className="text-[13px] font-medium text-ink-3">{t("sim.match.listFailed")}</p>}
            {w && (
                <ul className="flex flex-col gap-2">
                    {w.drills.map((d) => (
                        <li key={d.id}><Row d={d} onPlay={() => onPlay(d, w)} /></li>
                    ))}
                </ul>
            )}

            <h3 className="text-[14px] font-semibold text-ink-2 mt-2">{t("sim.drill.ladder")}</h3>
            {ladder.data && ladder.data.rows.length === 0 && (
                <p className="text-[13px] font-medium text-ink-3">{t("sim.drill.ladderEmpty")}</p>
            )}
            {ladder.data && ladder.data.rows.length > 0 && (
                <ol className="rounded-tile border border-surface-line bg-surface-1 divide-y divide-surface-line">
                    {ladder.data.rows.slice(0, 10).map((r, i) => (
                        <li key={r.memberId} className={cn("flex items-center gap-3 px-4 py-2.5", r.memberId === myMemberId && "bg-brand/[0.06]")}>
                            <span className="rk-num w-6 text-[13px] font-semibold text-ink-3">{i + 1}</span>
                            <span className="flex-1 min-w-0 text-[14px] font-semibold text-ink-1 truncate">{r.name}</span>
                            <span className="rk-num text-[13px] font-semibold text-ink-1">
                                {t("sim.drill.ladderScore").replace("{s}", String(r.successes)).replace("{a}", String(r.attempts))}
                            </span>
                        </li>
                    ))}
                </ol>
            )}
        </section>
    );
}
