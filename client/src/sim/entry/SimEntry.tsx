import { useQuery } from "@tanstack/react-query";
import { useT } from "@/lib/i18n";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { MATCH_LIST_QUERY_KEY, MATCH_LIST_REFETCH_MS } from "../match/queryKeys";
import { matchApi } from "../matchApi";
import { ROOMS_QUERY_KEY } from "../match/RoomList";
import { drillApi, weekProgress } from "../drill/drillApi";
import { DRILL_WEEK_QUERY_KEY } from "../drill/DrillPanel";
import { ChartIcon, ChevronRightIcon } from "../components/railIcons";
import { EntryShowcase } from "./EntryShowcase";
import { BallMotif } from "./BallMotif";
import { ENTRY_LAST_KEY, entryOrder, formatAvg, matchRecord, practiceSummary, type EntryChoice, type EntryMatchRow, type EntryRating } from "./entryStats";
import { ENTRY_STYLE as st } from "./entryTheme";

/**
 * 시뮬레이터 진입 화면(2026-09-07 오너): `/online-game` 에 파라미터 없이 들어오면 먼저 **싱글 / 친구와 대전 / 멀티방** 카드를 고른다.
 * 세 화면의 첫 질문이 다르기 때문이다 — 싱글은 "어떤 종목으로 연습할까", 친구와 대전은 "누구를 부를까", 멀티방은 "열린 방에 들어갈까".
 *  - 위: 살아 있는 3D 테이블(EntryShowcase) — 그림 파일 없이 렌더러가 그린다.
 *  - 싱글: 카드를 누르면 설정 창(SimSetupDialog). 큰 숫자는 연습 에버, 알약: 연습 시작 · 이번 주 드릴 s/n(점 다섯 개).
 *  - 친구와 대전: 카드를 누르면 로비(초대 만들기). 큰 숫자는 승·패, 내 차례가 있으면 brand 테두리 배지. 알약: 코드로 참가(노란색). 내 대전 목록은 대시보드(2026-09-08 오너: "내 대전은 빼고").
 *  - 멀티방(2026-09-08 오너, 별도 카드): 공개 방 목록 — 큰 숫자는 지금 열린 방 수. 알약: 방 목록 · 방 만들기 · 랭킹.
 *  - 마지막에 고른 쪽이 위(기기 저장 "rankue.sim.entry")이고, 위 카드의 주 동작만 초록 버튼이다(화면의 초록 하나).
 * 데이터는 대시보드 배너·기록 카드와 같은 쿼리 키를 써서 캐시를 공유한다.
 */
export interface SimEntryProps {
    onSingle: () => void;
    onDrills: () => void;
    onMulti: () => void;
    onJoin: () => void;
    /** 멀티방 목록 / 멀티방으로 열기(로비의 공개 토글 켜진 채) */
    onRooms: () => void;
    onCreateRoom: () => void;
    /** 온라인 대전 랭킹(국가별·티어) */
    onRank: () => void;
    /** 머리글 닫기 옆 "대시보드" — 기록·그래프·내 대전 */
    onDash: () => void;
    onClose: () => void;
}

function readLast(): string | null {
    try { return typeof localStorage !== "undefined" ? localStorage.getItem(ENTRY_LAST_KEY) : null; } catch { return null; }
}
function writeLast(v: EntryChoice): void {
    try { if (typeof localStorage !== "undefined") localStorage.setItem(ENTRY_LAST_KEY, v); } catch { /* 저장 불가 */ }
}

const PILL = "h-10 px-3.5 inline-flex items-center gap-1.5 rounded-pill text-[13px] font-semibold";
const PRIMARY = "h-11 px-5 inline-flex items-center rounded-pill text-[14px] font-semibold";

export function SimEntry({ onSingle, onDrills, onMulti, onJoin, onRooms, onCreateRoom, onRank, onDash, onClose }: SimEntryProps) {
    const { t } = useT();
    const pill = cn(PILL, st.pill);
    const primary = cn(PRIMARY, st.primary);
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
    const rooms = useQuery({ queryKey: ROOMS_QUERY_KEY, queryFn: () => matchApi.listRooms(), enabled: !!member, staleTime: 10_000 });

    const practice = practiceSummary(ratings.data ?? []);
    const record = matchRecord(matches.data ?? []);
    const drill = week.data ? weekProgress(week.data) : null;
    const order = entryOrder(readLast());
    const top = order[0];

    const pick = (which: EntryChoice) => {
        writeLast(which);
        if (which === "single") onSingle(); else if (which === "multi") onMulti(); else onRooms();
    };
    const openRooms = rooms.data?.length ?? 0;

    const single = (
        <section key="single" className={st.card}>
            <button type="button" data-entry="single" onClick={() => pick("single")} className="w-full text-left px-5 pt-5 pb-3 flex items-start gap-4 active:opacity-90">
                <BallMotif kind="single" />
                <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                        <span className={cn("text-[18px] font-bold leading-tight", st.cardTitle)}>{t("sim.entry.single")}</span>
                        <ChevronRightIcon />
                    </span>
                    <span className={cn("block text-[12.5px] font-medium mt-0.5", st.cardSub)}>{t("sim.entry.singleDesc")}</span>
                    {practice ? (
                        <span className="flex items-baseline gap-2 mt-3">
                            <span className={cn("rk-num text-[30px] font-bold leading-none", st.cardBig)}>{formatAvg(practice.bestAvg)}</span>
                            <span className={cn("text-[12px] font-medium", st.cardSub)}>{t("sim.entry.avgLabel").replace("{n}", String(practice.sessions))}</span>
                        </span>
                    ) : (
                        <span className={cn("block text-[13px] font-medium mt-3", st.cardNote)}>{t("sim.entry.singleEmpty")}</span>
                    )}
                </span>
            </button>
            <div className="px-5 pb-4 flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => pick("single")} className={top === "single" ? primary : pill}>{t("sim.entry.practice")}</button>
                <button type="button" onClick={() => { writeLast("single"); onDrills(); }} className={cn(pill, "rk-num")}>
                    {drill && (
                        <span className="inline-flex gap-1" aria-hidden="true">
                            {Array.from({ length: drill.total }, (_, i) => (
                                <span key={i} className={cn("w-1.5 h-1.5 rounded-full", i < drill.successes ? "bg-current" : "bg-current opacity-25")} />
                            ))}
                        </span>
                    )}
                    {drill ? t("sim.entry.drills").replace("{s}", String(drill.successes)).replace("{n}", String(drill.total)) : t("sim.drill.title")}
                </button>
            </div>
        </section>
    );

    const multi = (
        <section key="multi" className={st.card}>
            <button type="button" data-entry="multi" onClick={() => pick("multi")} className="w-full text-left px-5 pt-5 pb-3 flex items-start gap-4 active:opacity-90">
                <BallMotif kind="multi" />
                <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2 min-w-0">
                            <span className={cn("text-[18px] font-bold leading-tight", st.cardTitle)}>{t("sim.entry.multi")}</span>
                            {record.myTurn > 0 && (
                                <span className={cn("rk-num shrink-0 text-[12px] font-semibold rounded-pill px-2 py-0.5", st.badge)}>
                                    {t("sim.entry.yourTurn").replace("{n}", String(record.myTurn))}
                                </span>
                            )}
                        </span>
                        <ChevronRightIcon />
                    </span>
                    <span className={cn("block text-[12.5px] font-medium mt-0.5", st.cardSub)}>{t("sim.entry.multiDesc")}</span>
                    {record.wins + record.losses > 0 ? (
                        <span className="flex items-baseline gap-2 mt-3">
                            <span className={cn("rk-num text-[24px] font-bold leading-none", st.cardBig)}>
                                {t("sim.entry.record").replace("{w}", String(record.wins)).replace("{l}", String(record.losses))}
                            </span>
                            <span className={cn("text-[12px] font-medium", st.cardSub)}>{t("sim.entry.recordLabel")}</span>
                        </span>
                    ) : (
                        <span className={cn("block text-[13px] font-medium mt-3", st.cardNote)}>{t("sim.entry.multiEmpty")}</span>
                    )}
                </span>
            </button>
            <div className="px-5 pb-4 flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => pick("multi")} className={top === "multi" ? primary : pill}>{t("sim.entry.create")}</button>
                {/* 코드로 참가: 초대 만들기와 같은 크기, 노란색(공 토큰) — 2026-09-08 오너 */}
                <button type="button" onClick={() => { writeLast("multi"); onJoin(); }} className={cn(PRIMARY, "bg-ball-yellow text-ink-1 active:opacity-90")}>{t("sim.entry.join")}</button>
            </div>
        </section>
    );

    const roomsCard = (
        <section key="rooms" className={st.card}>
            <button type="button" data-entry="rooms" onClick={() => pick("rooms")} className="w-full text-left px-5 pt-5 pb-3 flex items-start gap-4 active:opacity-90">
                <BallMotif kind="rooms" />
                <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                        <span className={cn("text-[18px] font-bold leading-tight", st.cardTitle)}>{t("sim.entry.rooms")}</span>
                        <ChevronRightIcon />
                    </span>
                    <span className={cn("block text-[12.5px] font-medium mt-0.5", st.cardSub)}>{t("sim.entry.roomsDesc")}</span>
                    {openRooms > 0 ? (
                        <span className="flex items-baseline gap-2 mt-3">
                            <span className={cn("rk-num text-[30px] font-bold leading-none", st.cardBig)}>{openRooms}</span>
                            <span className={cn("text-[12px] font-medium", st.cardSub)}>{t("sim.entry.roomsOpen")}</span>
                        </span>
                    ) : (
                        <span className={cn("block text-[13px] font-medium mt-3", st.cardNote)}>{t("sim.entry.roomsEmpty")}</span>
                    )}
                </span>
            </button>
            <div className="px-5 pb-4 flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => pick("rooms")} className={top === "rooms" ? primary : pill}>{t("sim.entry.roomList")}</button>
                <button type="button" onClick={() => { writeLast("rooms"); onCreateRoom(); }} className={pill}>{t("sim.entry.roomCreate")}</button>
                <button type="button" onClick={() => { writeLast("rooms"); onRank(); }} className={pill}>{t("sim.rank.title")}</button>
            </div>
        </section>
    );

    const header = (
        <div className="flex items-center justify-between mb-4">
            <h1 className={cn("text-[20px] font-bold", st.title)}>{t("sim.entry.title")}</h1>
            <div className="flex items-center gap-2">
                {/* 대시보드(닫기 옆, 2026-09-08 오너): 기록·그래프·내 대전 */}
                <button type="button" data-entry="dash" onClick={onDash} className={cn("h-11 px-3.5 inline-flex items-center gap-1.5 rounded-pill text-[13px] font-semibold", st.close)}>
                    <ChartIcon />
                    {t("sim.dash.open")}
                </button>
                <button type="button" onClick={onClose} className={cn("h-11 px-4 rounded-pill text-[13px] font-semibold", st.close)}>
                    {t("sim.entry.close")}
                </button>
            </div>
        </div>
    );
    return (
        <div className={cn("w-full max-w-[420px] mx-auto px-5 pt-4 pb-8", st.page)}>
            {header}
            <EntryShowcase className={st.showcase} />
            <div className={cn("flex flex-col", st.gap)}>
                {order.map((k) => (k === "single" ? single : k === "multi" ? multi : roomsCard))}
            </div>
        </div>
    );
}
