import { useQuery } from "@tanstack/react-query";
import { useT } from "@/lib/i18n";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { MATCH_LIST_QUERY_KEY, MATCH_LIST_REFETCH_MS } from "../match/queryKeys";
import { drillApi, weekProgress } from "../drill/drillApi";
import { DRILL_WEEK_QUERY_KEY } from "../drill/DrillPanel";
import { ChevronRightIcon } from "../components/railIcons";
import { EntryShowcase } from "./EntryShowcase";
import { BallMotif } from "./BallMotif";
import { ENTRY_LAST_KEY, entryOrder, formatAvg, matchRecord, practiceSummary, type EntryChoice, type EntryMatchRow, type EntryRating } from "./entryStats";

/**
 * 시뮬레이터 진입 화면(2026-09-07 오너): `/online-game` 에 파라미터 없이 들어오면 먼저 **싱글 / 친구와 대전** 카드 둘을 고른다.
 * 두 화면의 첫 질문이 다르기 때문이다 — 싱글은 "어떤 종목으로 연습할까", 대전은 "누구와 붙을까".
 *  - 위: 살아 있는 3D 테이블(EntryShowcase) — 그림 파일 없이 렌더러가 그린다.
 *  - 싱글: 카드를 누르면 설정 창(SimSetupDialog). 큰 숫자는 연습 에버, 알약: 연습 시작 · 이번 주 드릴 s/n(점 다섯 개).
 *  - 친구와 대전: 카드를 누르면 로비(초대 만들기). 큰 숫자는 승·패, 내 차례가 있으면 brand 테두리 배지. 알약: 코드로 참가 · 내 대전 n.
 *  - 마지막에 고른 쪽이 위(기기 저장 "rankue.sim.entry")이고, 위 카드의 주 동작만 초록 버튼이다(화면의 초록 하나).
 * 데이터는 대시보드 배너·기록 카드와 같은 쿼리 키를 써서 캐시를 공유한다.
 */
export interface SimEntryProps {
    onSingle: () => void;
    onDrills: () => void;
    onMulti: () => void;
    onJoin: () => void;
    /** 내 대전 목록만(진행 중·끝난 대전 정리). */
    onMyMatches: () => void;
    onClose: () => void;
}

function readLast(): string | null {
    try { return typeof localStorage !== "undefined" ? localStorage.getItem(ENTRY_LAST_KEY) : null; } catch { return null; }
}
function writeLast(v: EntryChoice): void {
    try { if (typeof localStorage !== "undefined") localStorage.setItem(ENTRY_LAST_KEY, v); } catch { /* 저장 불가 */ }
}

const pill = "h-10 px-3.5 inline-flex items-center gap-1.5 rounded-pill border border-surface-line bg-surface-1 text-[13px] font-semibold text-ink-2 active:bg-surface-3";
const primary = "h-11 px-5 inline-flex items-center rounded-pill bg-brand text-brand-fg text-[14px] font-semibold active:bg-brand-strong";

export function SimEntry({ onSingle, onDrills, onMulti, onJoin, onMyMatches, onClose }: SimEntryProps) {
    const { t } = useT();
    const { member } = useAuth();
    const ratings = useQuery<EntryRating[]>({
        queryKey: ["/api/hiq/sim/ratings/me"],
        queryFn: async () => (await apiRequest("/api/hiq/sim/ratings/me")) ?? [],
        enabled: !!member,
        staleTime: 30_000,
    });
    const matches = useQuery<EntryMatchRow[]>({
        queryKey: MATCH_LIST_QUERY_KEY,
        queryFn: async () => (await apiRequest("/api/hiq/sim/matches")) ?? [],
        enabled: !!member,
        staleTime: 10_000,
        refetchInterval: (q) => ((q.state.data ?? []).some((m) => m.status === "playing") ? MATCH_LIST_REFETCH_MS * 3 : false),
    });
    const week = useQuery({ queryKey: DRILL_WEEK_QUERY_KEY, queryFn: () => drillApi.getWeek(), enabled: !!member, staleTime: 30_000 });

    const practice = practiceSummary(ratings.data ?? []);
    const record = matchRecord(matches.data ?? []);
    const drill = week.data ? weekProgress(week.data) : null;
    const order = entryOrder(readLast());
    const top = order[0];

    const pick = (which: EntryChoice) => {
        writeLast(which);
        if (which === "single") onSingle(); else onMulti();
    };

    const single = (
        <section key="single" className="rounded-card bg-surface-1 border border-surface-line rk-shadow overflow-hidden">
            <button type="button" data-entry="single" onClick={() => pick("single")} className="w-full text-left px-5 pt-5 pb-3 flex items-start gap-4 active:bg-surface-3">
                <BallMotif kind="single" />
                <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                        <span className="text-[18px] font-bold text-ink-1 leading-tight">{t("sim.entry.single")}</span>
                        <ChevronRightIcon />
                    </span>
                    <span className="block text-[12.5px] font-medium text-ink-3 mt-0.5">{t("sim.entry.singleDesc")}</span>
                    {practice ? (
                        <span className="flex items-baseline gap-2 mt-3">
                            <span className="rk-num text-[30px] font-bold text-ink-1 leading-none">{formatAvg(practice.bestAvg)}</span>
                            <span className="text-[12px] font-medium text-ink-3">{t("sim.entry.avgLabel").replace("{n}", String(practice.sessions))}</span>
                        </span>
                    ) : (
                        <span className="block text-[13px] font-medium text-ink-2 mt-3">{t("sim.entry.singleEmpty")}</span>
                    )}
                </span>
            </button>
            <div className="px-5 pb-4 flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => pick("single")} className={top === "single" ? primary : pill}>{t("sim.entry.practice")}</button>
                <button type="button" onClick={() => { writeLast("single"); onDrills(); }} className={cn(pill, "rk-num")}>
                    {drill && (
                        <span className="inline-flex gap-1" aria-hidden="true">
                            {Array.from({ length: drill.total }, (_, i) => (
                                <span key={i} className={cn("w-1.5 h-1.5 rounded-full", i < drill.successes ? "bg-ink-1" : "bg-surface-line")} />
                            ))}
                        </span>
                    )}
                    {drill ? t("sim.entry.drills").replace("{s}", String(drill.successes)).replace("{n}", String(drill.total)) : t("sim.drill.title")}
                </button>
            </div>
        </section>
    );

    const multi = (
        <section key="multi" className="rounded-card bg-surface-1 border border-surface-line rk-shadow overflow-hidden">
            <button type="button" data-entry="multi" onClick={() => pick("multi")} className="w-full text-left px-5 pt-5 pb-3 flex items-start gap-4 active:bg-surface-3">
                <BallMotif kind="multi" />
                <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2 min-w-0">
                            <span className="text-[18px] font-bold text-ink-1 leading-tight">{t("sim.entry.multi")}</span>
                            {record.myTurn > 0 && (
                                <span className="rk-num shrink-0 text-[12px] font-semibold border border-brand text-brand rounded-pill px-2 py-0.5">
                                    {t("sim.entry.yourTurn").replace("{n}", String(record.myTurn))}
                                </span>
                            )}
                        </span>
                        <ChevronRightIcon />
                    </span>
                    <span className="block text-[12.5px] font-medium text-ink-3 mt-0.5">{t("sim.entry.multiDesc")}</span>
                    {record.wins + record.losses > 0 ? (
                        <span className="flex items-baseline gap-2 mt-3">
                            <span className="rk-num text-[24px] font-bold text-ink-1 leading-none">
                                {t("sim.entry.record").replace("{w}", String(record.wins)).replace("{l}", String(record.losses))}
                            </span>
                            <span className="text-[12px] font-medium text-ink-3">{t("sim.entry.recordLabel")}</span>
                        </span>
                    ) : (
                        <span className="block text-[13px] font-medium text-ink-2 mt-3">{t("sim.entry.multiEmpty")}</span>
                    )}
                </span>
            </button>
            <div className="px-5 pb-4 flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => pick("multi")} className={top === "multi" ? primary : pill}>{t("sim.entry.create")}</button>
                <button type="button" onClick={() => { writeLast("multi"); onJoin(); }} className={pill}>{t("sim.entry.join")}</button>
                <button type="button" onClick={() => { writeLast("multi"); onMyMatches(); }} className={cn(pill, "rk-num")}>
                    {record.active > 0 ? t("sim.entry.myMatches").replace("{n}", String(record.active)) : t("sim.entry.myMatches").replace(/\s*\{n\}/, "")}
                </button>
            </div>
        </section>
    );

    return (
        <div className="w-full max-w-[420px] mx-auto px-5 pt-4 pb-8">
            <div className="flex items-center justify-between mb-3">
                <h1 className="text-[20px] font-bold text-ink-1">{t("sim.entry.title")}</h1>
                <button type="button" onClick={onClose} className="h-11 px-4 rounded-pill border border-surface-line text-[13px] font-semibold text-ink-2 active:bg-surface-3">
                    {t("sim.entry.close")}
                </button>
            </div>
            <EntryShowcase className="relative w-full h-[228px] rounded-card overflow-hidden bg-surface-3 mb-4" />
            <div className="flex flex-col gap-3">
                {order.map((k) => (k === "single" ? single : multi))}
            </div>
        </div>
    );
}
