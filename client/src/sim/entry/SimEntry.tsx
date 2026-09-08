import { useState, type ReactNode } from "react";
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
import { CodeIcon, DrillIcon, InviteIcon, PathIcon, PracticeIcon, RankIcon, RoomsIcon } from "./entryIcons";
import { ENTRY_LAST_KEY, entryOrder, formatAvg, matchRecord, practiceSummary, type EntryChoice, type EntryMatchRow, type EntryRating } from "./entryStats";
import { ENTRY_STYLE as st } from "./entryTheme";

/**
 * 온라인게임 진입 화면(2026-09-08 오너: 카드 넷이 산만해 **혼자 / 같이** 두 그룹으로, 그룹을 누르면 드롭다운처럼 옵션 버튼이 내려온다).
 *  - 위: 살아 있는 3D 테이블(EntryShowcase).
 *  - 그룹 머리: 모티프 · 이름 · 한 줄 설명 · 큰 숫자(혼자 = 연습 에버, 같이 = 전적 + 내 차례 배지). 누르면 펼치고, 다른 그룹은 접힌다.
 *  - 옵션: 아이콘이 붙은 가로 버튼 한 줄씩. 혼자 = 연습 시작 · 드릴 s/n · 길 찾기 / 같이 = 친구 초대 · 코드로 참가(노란색) · 멀티방 n · 랭킹.
 *    펼친 그룹의 첫 옵션만 초록(화면의 초록 하나).
 *  - 마지막에 쓴 그룹이 위이고 처음부터 펼쳐져 있다(기기 저장 "rankue.sim.entry", 예전 값도 그룹으로 읽는다).
 * 데이터는 대시보드 배너·기록 카드와 같은 쿼리 키를 써서 캐시를 공유한다. 배색은 entryTheme(검정).
 */
export interface SimEntryProps {
    onSingle: () => void;
    onDrills: () => void;
    onMulti: () => void;
    onJoin: () => void;
    /** 멀티방 목록(방 만들기는 그 화면 안에) */
    onRooms: () => void;
    /** 온라인 대전 랭킹(국가별·티어) */
    onRank: () => void;
    /** 길 찾기: 공을 놓고 3쿠션 해법을 찾는 화면 */
    onPath: () => void;
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

const PILL = "h-11 px-2 inline-flex items-center justify-center gap-1.5 rounded-pill text-[13px] font-semibold whitespace-nowrap w-full";
const PRIMARY = "h-11 px-2 inline-flex items-center justify-center rounded-pill text-[14px] font-semibold whitespace-nowrap w-full";

export function SimEntry({ onSingle, onDrills, onMulti, onJoin, onRooms, onRank, onPath, onDash, onClose }: SimEntryProps) {
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
    const openRooms = rooms.data?.length ?? 0;

    const go = (group: EntryChoice, fn: () => void) => { writeLast(group); fn(); };
    // 펼친 그룹(드롭다운) — 처음엔 마지막에 쓴 그룹. 머리를 누르면 토글, 다른 그룹은 접힌다.
    const [open, setOpen] = useState<EntryChoice>(top);
    const toggle = (g: EntryChoice) => setOpen((cur) => (cur === g ? cur : g));

    /** 옵션 한 줄: 아이콘 · 이름 · (오른쪽 캡션). tone: primary(초록) · yellow · plain */
    const Option = ({ icon, label, caption, tone = "plain", onPress, testId }: {
        icon: ReactNode; label: string; caption?: ReactNode; tone?: "primary" | "yellow" | "plain"; onPress: () => void; testId?: string;
    }) => (
        <button
            type="button" data-entry={testId} onClick={onPress}
            className={cn(
                "w-full h-12 px-4 rounded-tile flex items-center gap-3 text-[14px] font-semibold text-left",
                tone === "primary" ? st.primary : tone === "yellow" ? "bg-ball-yellow text-ink-1 active:opacity-90" : st.pill,
            )}
        >
            {icon}
            <span className="flex-1 min-w-0 truncate">{label}</span>
            {caption && <span className="rk-num shrink-0 text-[12px] font-medium opacity-80 inline-flex items-center gap-1.5">{caption}</span>}
        </button>
    );
    /** 펼침/접힘 — grid-template-rows 0fr↔1fr 전환(높이 재지 않아도 부드럽게 내려온다) */
    const Drop = ({ show, children }: { show: boolean; children: ReactNode }) => (
        <div className="grid transition-[grid-template-rows] duration-200 ease-out" style={{ gridTemplateRows: show ? "1fr" : "0fr" }} aria-hidden={!show}>
            <div className="overflow-hidden">
                <div className="px-4 pb-4 flex flex-col gap-2">{children}</div>
            </div>
        </div>
    );

    const solo = (
        <section key="solo" className={st.card}>
            <button type="button" data-entry="solo" onClick={() => toggle("solo")} aria-expanded={open === "solo"} className="w-full text-left px-5 pt-5 pb-4 flex items-start gap-4 active:opacity-90">
                <BallMotif kind="single" />
                <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                        <span className={cn("text-[18px] font-bold leading-tight", st.cardTitle)}>{t("sim.entry.groupSolo")}</span>
                        <span className={cn("transition-transform duration-200", open === "solo" && "rotate-90")}><ChevronRightIcon /></span>
                    </span>
                    <span className={cn("block text-[12.5px] font-medium mt-0.5", st.cardSub)}>{t("sim.entry.groupSoloDesc")}</span>
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
            <Drop show={open === "solo"}>
                <Option icon={<PracticeIcon />} label={t("sim.entry.practice")} tone="primary" onPress={() => go("solo", onSingle)} testId="practice" />
                <Option
                    icon={<DrillIcon />} label={t("sim.drill.title")} onPress={() => go("solo", onDrills)} testId="drills"
                    caption={drill ? (
                        <>
                            <span className="inline-flex gap-1" aria-hidden="true">
                                {Array.from({ length: drill.total }, (_, i) => (
                                    <span key={i} className={cn("w-1.5 h-1.5 rounded-full", i < drill.successes ? "bg-current" : "bg-current opacity-25")} />
                                ))}
                            </span>
                            {`${drill.successes}/${drill.total}`}
                        </>
                    ) : undefined}
                />
                <Option icon={<PathIcon />} label={t("sim.path.title")} caption={t("sim.path.threeOnly")} onPress={() => go("solo", onPath)} testId="path" />
            </Drop>
        </section>
    );

    const together = (
        <section key="together" className={st.card}>
            <button type="button" data-entry="together" onClick={() => toggle("together")} aria-expanded={open === "together"} className="w-full text-left px-5 pt-5 pb-4 flex items-start gap-4 active:opacity-90">
                <BallMotif kind="rooms" />
                <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2 min-w-0">
                            <span className={cn("text-[18px] font-bold leading-tight", st.cardTitle)}>{t("sim.entry.groupTogether")}</span>
                            {record.myTurn > 0 && (
                                <span className={cn("rk-num shrink-0 text-[12px] font-semibold rounded-pill px-2 py-0.5", st.badge)}>
                                    {t("sim.entry.yourTurn").replace("{n}", String(record.myTurn))}
                                </span>
                            )}
                        </span>
                        <span className={cn("transition-transform duration-200", open === "together" && "rotate-90")}><ChevronRightIcon /></span>
                    </span>
                    <span className={cn("block text-[12.5px] font-medium mt-0.5", st.cardSub)}>{t("sim.entry.groupTogetherDesc")}</span>
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
            <Drop show={open === "together"}>
                <Option icon={<InviteIcon />} label={t("sim.entry.invite")} tone="primary" onPress={() => go("together", onMulti)} testId="invite" />
                {/* 코드로 참가: 노란색(공 토큰) — 2026-09-08 오너 */}
                <Option icon={<CodeIcon />} label={t("sim.entry.join")} tone="yellow" onPress={() => go("together", onJoin)} testId="join" />
                <Option icon={<RoomsIcon />} label={t("sim.entry.rooms")} caption={openRooms > 0 ? t("sim.entry.roomsOpen") + " " + openRooms : undefined} onPress={() => go("together", onRooms)} testId="rooms" />
                <Option icon={<RankIcon />} label={t("sim.rank.title")} onPress={() => go("together", onRank)} testId="rank" />
            </Drop>
        </section>
    );

    return (
        <div className={cn("w-full max-w-[420px] mx-auto px-5 pt-4 pb-8", st.page)}>
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
            <EntryShowcase className={st.showcase} />
            <div className={cn("flex flex-col", st.gap)}>
                {order.map((k) => (k === "solo" ? solo : together))}
            </div>
        </div>
    );
}
