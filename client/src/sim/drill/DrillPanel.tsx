import { memo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { drillApi, weekProgress, type DrillApi, type DrillWeek, type WeekDrill } from "./drillApi";

/**
 * 이번 주 드릴 5문제와 주간 래더. 문제당 채점 시도는 한 번(서버가 막는다), 그 뒤엔 연습으로 몇 번이든 다시 칠 수 있다.
 * 페이지는 onPlay(drill, week) 로 시뮬레이터를 드릴 모드로 연다. 머리글은 로비(MatchLobby)와 같은 꼴 — 제목·설명 왼쪽, 닫기 알약 오른쪽.
 * 흰 바탕 위의 안쪽 상자·칩은 surface-3(5% 먹) — surface-2 는 흰색이라 바탕과 구분이 안 됐다(실측 2026-09-07).
 */
export const DRILL_WEEK_QUERY_KEY = ["sim-drills", "week"] as const;
export const DRILL_LADDER_QUERY_KEY = ["sim-drills", "ladder"] as const;

interface Props {
    onPlay: (drill: WeekDrill, week: DrillWeek) => void;
    api?: DrillApi;
    myMemberId?: string;
    /** 닫기 알약(오른쪽 위). 없으면 그리지 않는다. */
    onClose?: () => void;
}

/** "2026-W37" → "2026년 37주차"(sim.drill.week). 형식이 다르면 id 그대로. */
export function weekLabel(weekId: string, t: (key: string) => string): string {
    const m = /^(\d{4})-W(\d{2})$/.exec(weekId);
    if (!m) return weekId;
    return t("sim.drill.week").replace("{year}", m[1]).replace("{week}", String(Number(m[2])));
}

/** 드릴 별: 성공이면 금색 채움, 시도했는데 실패면 빈 별, 아직 안 했으면 흐리게. */
function Star({ state, size = 18 }: { state: "done" | "fail" | "todo"; size?: number }) {
    const fill = state === "done" ? "var(--arc-frame)" : "none";
    const stroke = state === "todo" ? "rgba(255,255,255,0.35)" : "var(--arc-frame)";
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={stroke} strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
            <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z" />
        </svg>
    );
}

const Row = memo(function Row({ d, onPlay }: { d: WeekDrill; onPlay: () => void }) {
    const { t } = useT();
    const a = d.attempt;
    const state = !a ? "todo" : a.success ? "done" : "fail";
    const status = !a ? t("sim.drill.notTried") : a.success
        ? t("sim.drill.success").replace("{n}", String(a.cushions))
        : t("sim.drill.fail");
    return (
        <button
            type="button" onClick={onPlay}
            className={cn(
                "arc-row w-full min-h-[56px] rounded-pill px-3 py-2 flex items-center gap-3 text-left",
                state === "done" && "arc-row-1",
            )}
        >
            <Star state={state} size={22} />
            <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                <span className={cn("text-[14px] font-black truncate", state === "done" ? "text-[color:var(--arc-ink)]" : "text-white")}>{t(d.nameKey)}</span>
                <span className={cn("text-[11px] font-bold truncate", state === "done" ? "text-[color:var(--arc-ink)] opacity-75" : "text-white/70")}>{t(d.hintKey)}</span>
            </span>
            <span className={cn("rk-num shrink-0 text-[11px] font-bold", state === "done" ? "text-[color:var(--arc-ink)]" : "text-white/75")}>{status}</span>
        </button>
    );
});

export function DrillPanel({ onPlay, api = drillApi, myMemberId, onClose }: Props) {
    const { t } = useT();
    const week = useQuery({ queryKey: DRILL_WEEK_QUERY_KEY, queryFn: () => api.getWeek(), staleTime: 30_000 });
    const ladder = useQuery({ queryKey: DRILL_LADDER_QUERY_KEY, queryFn: () => api.getLadder(), staleTime: 30_000 });
    const w = week.data;
    const progress = w ? weekProgress(w) : null;

    return (
        <section className="rank-arcade flex flex-col gap-4">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <h2 className="text-[18px] font-black text-white leading-tight">{t("sim.drill.title")}</h2>
                    <p className="text-[13px] font-medium text-white/60 mt-1 leading-relaxed">{t("sim.drill.desc")}</p>
                </div>
                {onClose && (
                    <button
                        type="button" onClick={onClose}
                        className="shrink-0 h-11 px-3 rounded-pill border border-white/25 text-[13px] font-bold text-white/85"
                    >
                        {t("sim.common.close")}
                    </button>
                )}
            </div>

            {week.isLoading && <p className="text-[13px] font-medium text-white/60 min-h-11 flex items-center">{t("sim.match.listLoading")}</p>}
            {week.isError && <p className="text-[13px] font-medium text-white/80 min-h-11 flex items-center">{t("sim.match.listFailed")}</p>}

            {w && progress && (
                <div>
                    {/* 리본 제목 + 별 진행 — 랭킹 리더보드와 같은 언어(2026-09-09 오너) */}
                    <div className="relative flex justify-center">
                        <span className="arc-ribbon relative z-[1] inline-flex items-center h-10 px-6 rounded-lg text-white text-[15px] font-black tracking-wide">
                            {t("sim.drill.boardTitle")}
                        </span>
                    </div>
                    <div className="arc-board rounded-[26px] -mt-4 pt-7 px-3 pb-3">
                        <div className="flex items-center justify-between gap-2 px-1 pb-2.5">
                            <span className="flex items-center gap-1" aria-label={t("sim.drill.stars").replace("{s}", String(progress.successes)).replace("{n}", String(progress.total))}>
                                {Array.from({ length: progress.total }, (_, i) => (
                                    <Star key={i} state={i < progress.successes ? "done" : "todo"} />
                                ))}
                            </span>
                            <span className="rk-num text-[12px] font-bold text-white/75 shrink-0">{weekLabel(w.weekId, t)}</span>
                        </div>
                        <ul className="flex flex-col gap-2">
                            {w.drills.map((d) => (
                                <li key={d.id}><Row d={d} onPlay={() => onPlay(d, w)} /></li>
                            ))}
                        </ul>
                    </div>
                </div>
            )}

            {ladder.data && ladder.data.rows.length > 0 && (
                <div>
                    <div className="relative flex justify-center">
                        <span className="arc-ribbon relative z-[1] inline-flex items-center h-9 px-5 rounded-lg text-white text-[14px] font-black">
                            {t("sim.drill.ladder")}
                        </span>
                    </div>
                    <ol className="arc-board rounded-[26px] -mt-4 pt-7 px-3 pb-3 space-y-2">
                        {ladder.data.rows.slice(0, 10).map((r, i) => {
                            const mine = r.memberId === myMemberId;
                            const top3 = i < 3;
                            return (
                                <li
                                    key={r.memberId}
                                    className={cn(
                                        "arc-row rounded-pill h-12 px-3 flex items-center gap-3",
                                        i === 0 && "arc-row-1", i === 1 && "arc-row-2", i === 2 && "arc-row-3",
                                        mine && "ring-2 ring-white",
                                    )}
                                >
                                    <span className={cn("rk-num w-6 shrink-0 text-center text-[16px] font-black", top3 ? "text-[color:var(--arc-ink)]" : "text-white")}>{i + 1}</span>
                                    <span className={cn("flex-1 min-w-0 text-[13px] font-black truncate", top3 ? "text-[color:var(--arc-ink)]" : "text-white")}>{r.name}</span>
                                    <span className={cn("rk-num shrink-0 text-[13px] font-black", top3 ? "text-[color:var(--arc-ink)]" : "text-white")}>
                                        {t("sim.drill.ladderScore").replace("{s}", String(r.successes)).replace("{a}", String(r.attempts))}
                                    </span>
                                </li>
                            );
                        })}
                    </ol>
                </div>
            )}
            {ladder.data && ladder.data.rows.length === 0 && (
                <p className="text-[13px] font-medium text-white/60">{t("sim.drill.ladderEmpty")}</p>
            )}
        </section>
    );
}
