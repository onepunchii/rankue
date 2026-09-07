import { useQuery } from "@tanstack/react-query";
import { useT } from "@/lib/i18n";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { MATCH_LIST_QUERY_KEY, MATCH_LIST_REFETCH_MS } from "../match/queryKeys";
import { drillApi, weekProgress } from "../drill/drillApi";
import { DRILL_WEEK_QUERY_KEY } from "../drill/DrillPanel";
import { ENTRY_LAST_KEY, entryOrder, formatAvg, matchRecord, practiceSummary, type EntryChoice, type EntryMatchRow, type EntryRating } from "./entryStats";

/**
 * 시뮬레이터 진입 화면(2026-09-07 오너): `/online-game` 에 파라미터 없이 들어오면 먼저 **싱글 / 친구와 대전** 카드 둘을 고른다.
 * 두 화면의 첫 질문이 다르기 때문이다 — 싱글은 "어떤 종목으로 연습할까", 대전은 "누구와 붙을까".
 *  - 싱글: 카드를 누르면 설정 창(SimSetupDialog). 아래 알약: 연습 시작 · 이번 주 드릴 s/n.
 *  - 친구와 대전: 카드를 누르면 로비(초대 만들기). 아래 알약: 코드로 참가 · 내 대전 n. 내 차례가 있으면 brand 배지.
 *  - 카드마다 내 시뮬 기록 한 줄(연습 에버·세션 / 승·패). 마지막에 고른 쪽이 위(기기 저장 "rankue.sim.entry").
 * 데이터는 대시보드 배너·기록 카드와 같은 쿼리 키를 써서 캐시를 공유한다. 이 화면의 초록은 "내 차례" 배지 하나뿐이다.
 */
export interface SimEntryProps {
    onSingle: () => void;
    onDrills: () => void;
    onMulti: () => void;
    onJoin: () => void;
    onClose: () => void;
}

function readLast(): string | null {
    try { return typeof localStorage !== "undefined" ? localStorage.getItem(ENTRY_LAST_KEY) : null; } catch { return null; }
}
function writeLast(v: EntryChoice): void {
    try { if (typeof localStorage !== "undefined") localStorage.setItem(ENTRY_LAST_KEY, v); } catch { /* 저장 불가 */ }
}

const SVG = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;
/** 싱글: 공 하나와 조준 십자. */
function SingleIcon() {
    return <svg {...SVG}><circle cx="12" cy="12" r="7" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" /></svg>;
}
/** 친구와 대전: 공 둘. */
function MultiIcon() {
    return <svg {...SVG}><circle cx="9" cy="13" r="6" /><circle cx="16.5" cy="9.5" r="4.5" /></svg>;
}

const pill = "h-10 px-3.5 inline-flex items-center rounded-pill border border-surface-line bg-surface-1 text-[13px] font-semibold text-ink-2 active:bg-surface-3";

export function SimEntry({ onSingle, onDrills, onMulti, onJoin, onClose }: SimEntryProps) {
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

    const pick = (which: EntryChoice) => {
        writeLast(which);
        if (which === "single") onSingle(); else onMulti();
    };

    const single = (
        <section key="single" className="rounded-card bg-surface-1 border border-surface-line rk-shadow overflow-hidden">
            <button type="button" data-entry="single" onClick={() => pick("single")} className="w-full text-left p-5 flex items-start gap-3.5 active:bg-surface-3">
                <span className="w-11 h-11 rounded-2xl bg-surface-3 text-ink-1 flex items-center justify-center shrink-0"><SingleIcon /></span>
                <span className="min-w-0 flex-1">
                    <span className="block text-[17px] font-bold text-ink-1 leading-tight">{t("sim.entry.single")}</span>
                    <span className="block text-[12.5px] font-medium text-ink-3 mt-1">{t("sim.entry.singleDesc")}</span>
                    <span className="block rk-num text-[13px] font-medium text-ink-2 mt-2">
                        {practice
                            ? t("sim.entry.avg").replace("{avg}", formatAvg(practice.bestAvg)).replace("{n}", String(practice.sessions))
                            : t("sim.entry.empty")}
                    </span>
                </span>
            </button>
            <div className="px-5 pb-4 flex flex-wrap gap-2">
                <button type="button" onClick={() => pick("single")} className={pill}>{t("sim.entry.practice")}</button>
                <button type="button" onClick={() => { writeLast("single"); onDrills(); }} className={cn(pill, "rk-num")}>
                    {drill ? t("sim.entry.drills").replace("{s}", String(drill.successes)).replace("{n}", String(drill.total)) : t("sim.drill.title")}
                </button>
            </div>
        </section>
    );

    const multi = (
        <section key="multi" className="rounded-card bg-surface-1 border border-surface-line rk-shadow overflow-hidden">
            <button type="button" data-entry="multi" onClick={() => pick("multi")} className="w-full text-left p-5 flex items-start gap-3.5 active:bg-surface-3">
                <span className="w-11 h-11 rounded-2xl bg-surface-3 text-ink-1 flex items-center justify-center shrink-0"><MultiIcon /></span>
                <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                        <span className="text-[17px] font-bold text-ink-1 leading-tight">{t("sim.entry.multi")}</span>
                        {record.myTurn > 0 && (
                            <span className="rk-num text-[12px] font-semibold bg-brand text-brand-fg rounded-pill px-2.5 py-0.5">
                                {t("sim.entry.yourTurn").replace("{n}", String(record.myTurn))}
                            </span>
                        )}
                    </span>
                    <span className="block text-[12.5px] font-medium text-ink-3 mt-1">{t("sim.entry.multiDesc")}</span>
                    <span className="block rk-num text-[13px] font-medium text-ink-2 mt-2">
                        {record.wins + record.losses > 0
                            ? t("sim.entry.record").replace("{w}", String(record.wins)).replace("{l}", String(record.losses))
                            : t("sim.entry.empty")}
                    </span>
                </span>
            </button>
            <div className="px-5 pb-4 flex flex-wrap gap-2">
                <button type="button" onClick={() => { writeLast("multi"); onJoin(); }} className={pill}>{t("sim.entry.join")}</button>
                <button type="button" onClick={() => pick("multi")} className={cn(pill, "rk-num")}>
                    {record.active > 0 ? t("sim.entry.myMatches").replace("{n}", String(record.active)) : t("sim.entry.myMatches").replace(/\s*\{n\}/, "")}
                </button>
            </div>
        </section>
    );

    return (
        <div className="w-full max-w-[420px] mx-auto px-5 pt-4 pb-8">
            <div className="flex items-center justify-between mb-4">
                <h1 className="text-[20px] font-bold text-ink-1">{t("sim.entry.title")}</h1>
                <button type="button" onClick={onClose} className="h-11 px-4 rounded-pill border border-surface-line text-[13px] font-semibold text-ink-2 active:bg-surface-3">
                    {t("sim.entry.close")}
                </button>
            </div>
            <div className="flex flex-col gap-3">
                {order.map((k) => (k === "single" ? single : multi))}
            </div>
        </div>
    );
}
