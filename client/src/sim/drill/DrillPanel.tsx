import { memo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { drillApi, weekProgress, DRILL_WEEK_QUERY_KEY, type DrillApi, type DrillWeek, type WeekDrill } from "./drillApi";
import { RankMedal } from "../rank/TierEmblem";

/** 머리 그림 — 등급 배지와 같은 화풍(public/sim/rank). 대시보드의 드릴 칸과 같은 그림이다 */
export const DRILL_ART_SRC = "/sim/rank/icon-drill.webp";

/**
 * 이번 주 드릴 5문제와 주간 래더. 문제당 채점 시도는 한 번(서버가 막는다), 그 뒤엔 연습으로 몇 번이든 다시 칠 수 있다.
 * 페이지는 onPlay(drill, week) 로 시뮬레이터를 드릴 모드로 연다. 머리글은 로비(MatchLobby)와 같은 꼴 — 제목·설명 왼쪽, 닫기 알약 오른쪽.
 * 흰 바탕 위의 안쪽 상자·칩은 surface-3(5% 먹) — surface-2 는 흰색이라 바탕과 구분이 안 됐다(실측 2026-09-07).
 *
 * 2026-10-12 — 랭킹 · 멀티방 · 대시보드와 같은 '진열장' 톤(.rank-hall)으로. 보라 판 · 리본 · 노란 알약(.rank-arcade, 2026-09-09)을 뺐다 —
 * 이 화면이 그 배색을 쓰던 마지막 화면이었다. 머리에 그림(과녁), 문제는 어두운 줄(성공한 문제는 금빛 줄), 주간 순위의 1~3등은 메달.
 */
// 키는 drillApi(작은 모듈)로 옮겼다 — 홈 '혼자 치기' 카드가 이 패널(엔진)을 끌어오지 않고 같은 캐시를 쓰게(2026-10-04)
export { DRILL_WEEK_QUERY_KEY };
export const DRILL_LADDER_QUERY_KEY = ["sim-drills", "ladder"] as const;
const LADDER_TOP = 10;

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
    const fill = state === "done" ? "var(--hall-gold)" : "none";
    const stroke = state === "todo" ? "rgba(255,255,255,0.35)" : "var(--hall-gold)";
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
    // 성공했으면 힌트 대신 '어떻게 넣었는지' 를 보여 준다 — 빈쿠션으로 때웠는지가 여기서 드러난다.
    const r = a?.success ? a.route : null;
    // 이름표대로 갔으면 그 한 줄이면 된다 — 빈쿠션 드릴에선 "빈쿠션 성공 · 빈쿠션으로" 처럼 같은 말이 겹쳤다.
    const sub = !r
        ? t(d.hintKey)
        : r.named === true
            ? t("sim.drill.routeNamed").replace("{name}", t(d.nameKey))
            : r.bankFirst > 0 ? t("sim.drill.routeBank") : t("sim.drill.routeBall");
    return (
        <button
            type="button" onClick={onPlay}
            className={cn(
                "hall-row w-full min-h-[58px] px-3.5 py-2 flex items-center gap-3 text-left active:opacity-85",
                state === "done" && "hall-row-top",
            )}
        >
            <Star state={state} size={22} />
            <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                <span className="text-[14px] font-black truncate text-white">{t(d.nameKey)}</span>
                {/* 힌트는 자르지 않고 두 줄까지 — 한국어 밖에선 한 줄에 안 들어가고, 잘린 힌트는 쓸모가 없다(2026-09-09) */}
                <span className="text-[11.5px] font-bold leading-snug line-clamp-2 text-white/65">{sub}</span>
            </span>
            <span className={cn("rk-num shrink-0 text-[11.5px] font-black", state === "done" ? "text-[color:var(--hall-gold)]" : "text-white/70")}>{status}</span>
        </button>
    );
});

export function DrillPanel({ onPlay, api = drillApi, myMemberId, onClose }: Props) {
    const { t } = useT();
    const week = useQuery({ queryKey: DRILL_WEEK_QUERY_KEY, queryFn: () => api.getWeek(), staleTime: 30_000 });
    const ladder = useQuery({ queryKey: DRILL_LADDER_QUERY_KEY, queryFn: () => api.getLadder(), staleTime: 30_000 });
    const w = week.data;
    const progress = w ? weekProgress(w) : null;
    // 상위 10명 + 내가 그 밖이면 내 줄을 한 칸 띄워 덧붙인다(2026-09-26 검토 — 11위부터는 내 순위를 볼 길이 없었다).
    const ladderRows = ladder.data?.rows ?? [];
    const myIdx = myMemberId ? ladderRows.findIndex((r) => r.memberId === myMemberId) : -1;
    const ladderShown = ladderRows.slice(0, LADDER_TOP).map((r, i) => ({ r, i }));
    if (myIdx >= LADDER_TOP) ladderShown.push({ r: ladderRows[myIdx], i: myIdx });

    return (
        <section className="rank-hall flex flex-col gap-4">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex items-center gap-2.5">
                    <img src={DRILL_ART_SRC} width={60} height={60} alt="" aria-hidden="true" decoding="async" draggable={false} className="w-[60px] h-[60px] shrink-0 object-contain -ml-1" style={{ filter: "drop-shadow(0 4px 6px rgba(0,0,0,0.55))" }} />
                    <div className="min-w-0">
                        <h2 className="text-[21px] font-black text-white leading-tight">{t("sim.drill.title")}</h2>
                        <p className="text-[12.5px] font-medium text-white/65 mt-0.5 leading-relaxed">{t("sim.drill.desc")}</p>
                    </div>
                </div>
                {onClose && (
                    <button
                        type="button" onClick={onClose}
                        className="shrink-0 h-11 px-4 rounded-pill border border-white/25 bg-black/40 text-[13px] font-semibold text-white/90 active:bg-black/60"
                    >
                        {t("sim.common.close")}
                    </button>
                )}
            </div>

            {week.isLoading && <p className="text-[13px] font-medium text-white/60 min-h-11 flex items-center">{t("sim.match.listLoading")}</p>}
            {week.isError && (
                <div className="flex items-center justify-between gap-3 min-h-11">
                    <p className="text-[13px] font-medium text-white/80">{t("sim.match.listFailed")}</p>
                    <button
                        type="button" onClick={() => { void week.refetch(); void ladder.refetch(); }}
                        className="shrink-0 h-11 px-4 rounded-pill border border-white/25 text-[13px] font-bold text-white/85"
                    >
                        {t("sim.match.retry")}
                    </button>
                </div>
            )}

            {w && progress && (
                <div>
                    {/* 이번 주 판 — 제목 · 별 진행 · 주차. 금빛 테두리 카드(랭킹의 내 카드와 같은 판) 안에 문제 줄 */}
                    <div className="hall-me rounded-[22px] px-3 pt-3.5 pb-3" data-testid="drill-board">
                        <div className="flex items-center justify-between gap-2 px-1 pb-3">
                            <span className="text-[14.5px] font-black text-white">{t("sim.drill.boardTitle")}</span>
                            <span className="flex items-center gap-1" aria-label={t("sim.drill.stars").replace("{s}", String(progress.successes)).replace("{n}", String(progress.total))}>
                                {Array.from({ length: progress.total }, (_, i) => (
                                    <Star key={i} state={i < progress.successes ? "done" : "todo"} />
                                ))}
                            </span>
                            <span className="rk-num text-[12px] font-bold text-white/65 shrink-0 ml-auto">{weekLabel(w.weekId, t)}</span>
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
                    <h3 className="px-1 mb-2 text-[12px] font-black tracking-wide text-white/55">{t("sim.drill.ladder")}</h3>
                    <ol className="space-y-2" data-testid="drill-ladder">
                        {ladderShown.map(({ r, i }) => {
                            const mine = r.memberId === myMemberId;
                            const top3 = i < 3;
                            return (
                                <li
                                    key={r.memberId}
                                    className={cn(
                                        "hall-row h-[54px] pl-2 pr-3.5 flex items-center gap-2",
                                        i >= LADDER_TOP && "mt-3",
                                        top3 && "hall-row-top",
                                        mine && "hall-row-mine",
                                    )}
                                    aria-current={mine ? "true" : undefined}
                                >
                                    <span className="w-10 shrink-0 flex items-center justify-center">
                                        {top3 ? <RankMedal rank={(i + 1) as 1 | 2 | 3} size={38} /> : <span className="rk-num text-[17px] font-black text-white/90">{i + 1}</span>}
                                    </span>
                                    <span className="flex-1 min-w-0 text-[13.5px] font-black truncate text-white">{r.name}</span>
                                    <span className="hall-rating rk-num shrink-0 h-8 px-3 inline-flex items-center rounded-pill text-[13px] font-black text-white">
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
