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
import { HandicapCard } from "./HandicapCard";
import { BallMotif } from "./BallMotif";
import { CodeIcon, DrillIcon, InviteIcon, PathIcon, PracticeIcon, RankIcon, RoomsIcon } from "./entryIcons";
import { ENTRY_LAST_KEY, entryOrder, matchRecord, type EntryChoice, type EntryMatchRow } from "./entryStats";
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
    const matches = useQuery<EntryMatchRow[]>({
        queryKey: MATCH_LIST_QUERY_KEY,
        queryFn: async () => (await apiRequest("/api/hiq/sim/matches")) ?? [],
        enabled: !!member,
        staleTime: 10_000,
        refetchInterval: (q) => ((q.state.data ?? []).some((m) => m.status === "playing") ? MATCH_LIST_REFETCH_MS * 3 : false),
    });
    const week = useQuery({ queryKey: DRILL_WEEK_QUERY_KEY, queryFn: () => drillApi.getWeek(), enabled: !!member, staleTime: 30_000 });
    const rooms = useQuery({ queryKey: ROOMS_QUERY_KEY, queryFn: () => matchApi.listRooms(), enabled: !!member, staleTime: 10_000 });

    const listRecord = matchRecord(matches.data ?? []);
    const drill = week.data ? weekProgress(week.data) : null;
    const order = entryOrder(readLast());
    const top = order[0];
    const openRooms = rooms.data?.length ?? 0;
    const myRank = useQuery<{ placement: number; boards: { gameType: "3c" | "4c"; matches: number; wins?: number; rank: number | null; total: number }[] }>({
        queryKey: ["/api/hiq/sim/rank/me"],
        queryFn: async () => (await apiRequest("/api/hiq/sim/rank/me")) ?? { placement: 3, boards: [] },
        enabled: !!member,
        staleTime: 30_000,
    });

    // 전적은 서버 합계(랭킹 보드)로 본다 — 대전 목록은 최근 20개뿐이라 새 대전이 생길 때마다 승수가 흔들렸다
    // (2026-09-16 테스터 제보: "17승 2패 → 18승 2패 → 17승 1패"). 진행 중·내 차례 수는 지금 상태라 목록이 맞다.
    // 무승부는 서버 wins 에 이미 포함돼 있다(오너 규칙: 둘 다 승).
    const boardTotals = (myRank.data?.boards ?? []).reduce((a, b) => ({ w: a.w + (b.wins ?? 0), m: a.m + (b.matches ?? 0) }), { w: 0, m: 0 });
    const record = boardTotals.m > 0
        ? { ...listRecord, wins: boardTotals.w, losses: Math.max(0, boardTotals.m - boardTotals.w) }
        : listRecord;
    // 두 판(3쿠션·4구) 중 **가장 높은 순위**(숫자가 작은 쪽). 같으면 사람이 많은 판을 보여 준다.
    // 2026-09-12 부터 대대·중대는 합쳐져 판이 넷에서 둘로 줄었다.
    const bestBoard = (myRank.data?.boards ?? [])
        .filter((b) => b.rank !== null)
        .sort((a, b) => (a.rank! - b.rank!) || (b.total - a.total))[0];
    const placingMatches = Math.max(0, ...(myRank.data?.boards ?? []).map((b) => b.matches));
    const boardLabel = (b: { gameType: "3c" | "4c" }) =>
        t(b.gameType === "4c" ? "sim.setup.type4c" : "sim.setup.type3c");
    const rankValue: { text: string; muted: boolean } | null = bestBoard
        ? { text: `#${bestBoard.rank} · ${boardLabel(bestBoard)}`, muted: false }
        : placingMatches > 0
            ? { text: t("sim.rank.unranked").replace("{n}", String(placingMatches)).replace("{m}", String(myRank.data?.placement ?? 3)), muted: true }
            : null;

    const go = (group: EntryChoice, fn: () => void) => { writeLast(group); fn(); };
    // 펼친 그룹(드롭다운) — 처음엔 마지막에 쓴 그룹. 머리를 누르면 토글, 다른 그룹은 접힌다.
    const [open, setOpen] = useState<EntryChoice>(top);
    const toggle = (g: EntryChoice) => setOpen((cur) => (cur === g ? cur : g));

    /**
     * 옵션은 두 종류로 나눈다(2026-09-10 오너: "디자인이 살짝 아쉽다").
     *  - 행동(Action): 누르면 뭔가 시작한다 — 친구 초대·코드로 참가·연습 시작. 꽉 찬 색 버튼, 같이 그룹은 둘을 나란히.
     *  - 이동(LinkRow): 다른 화면으로 간다 — 멀티방·랭킹·드릴·길 찾기. 한 틀 안의 줄로 묶고, 오른쪽에 그 화면의 숫자를
     *    미리 보여 준다(열린 방 n · 내 최고 순위 · 이번 주 드릴). 예전엔 네 줄이 전부 같은 모양이라 둘이 안 갈렸고,
     *    초록·노랑 꽉 찬 버튼이 위아래로 붙어 서로 부딪쳤다.
     * 초록은 그룹의 첫 행동에만, 노랑은 '코드로 참가' 에만 둔다(entryTheme 규칙 그대로).
     */
    const Action = ({ icon, label, tone, onPress, testId }: {
        icon: ReactNode; label: string; tone: "primary" | "yellow"; onPress: () => void; testId?: string;
    }) => (
        <button
            type="button" data-entry={testId} onClick={onPress}
            className={cn(
                "h-12 px-3 rounded-tile flex items-center justify-center gap-2 text-[14px] font-semibold min-w-0",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60",
                tone === "primary" ? st.primary : "bg-ball-yellow text-ink-1 active:opacity-90",
            )}
        >
            {icon}
            <span className="truncate">{label}</span>
        </button>
    );
    const LinkRow = ({ icon, label, value, muted, onPress, testId }: {
        icon: ReactNode; label: string; value?: ReactNode; muted?: boolean; onPress: () => void; testId?: string;
    }) => (
        <button
            type="button" data-entry={testId} onClick={onPress}
            className="w-full h-12 pl-4 pr-3 flex items-center gap-3 text-left text-[14px] font-semibold text-white/90 active:bg-white/[0.06] focus:outline-none focus-visible:bg-white/[0.08]"
        >
            <span className="shrink-0 text-white/60">{icon}</span>
            <span className="flex-1 min-w-0 truncate">{label}</span>
            {value !== undefined && value !== null && (
                <span className={cn("rk-num shrink-0 text-[13px] font-semibold inline-flex items-center gap-1.5", muted ? "text-white/45" : "text-white")}>{value}</span>
            )}
            <span className="shrink-0 text-white/30"><ChevronRightIcon /></span>
        </button>
    );
    const Links = ({ children }: { children: ReactNode }) => (
        <div className="rounded-tile border border-white/10 divide-y divide-white/10 overflow-hidden">{children}</div>
    );
    /** 펼침/접힘 — grid-template-rows 0fr↔1fr 전환(높이 재지 않아도 부드럽게 내려온다) */
    const Drop = ({ show, children }: { show: boolean; children: ReactNode }) => (
        <div className="grid transition-[grid-template-rows] duration-200 ease-out" style={{ gridTemplateRows: show ? "1fr" : "0fr" }} aria-hidden={!show}>
            <div className="overflow-hidden">
                <div className="px-4 pb-4 flex flex-col gap-3">{children}</div>
            </div>
        </div>
    );

    const solo = (
        <section key="solo" className={st.card}>
            <button type="button" data-entry="solo" onClick={() => toggle("solo")} aria-expanded={open === "solo"} className="w-full text-left px-5 pt-5 pb-4 flex items-start gap-4 active:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/40 rounded-t-card">
                <BallMotif kind="single" />
                <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                        <span className={cn("text-[18px] font-bold leading-tight", st.cardTitle)}>{t("sim.entry.groupSolo")}</span>
                        <span className={cn("transition-transform duration-200", st.chevron, open === "solo" && "rotate-90")}><ChevronRightIcon /></span>
                    </span>
                    <span className={cn("block text-[12.5px] font-medium mt-0.5", st.cardSub)}>{t("sim.entry.groupSoloDesc")}</span>
                    {/* 2026-09-12 오너: "연습은 다 빼자, 공식 멀티경기만" — 연습 에버리지는 되돌리기로 부풀어 실력을 못 잰다.
                        대신 이번 주 드릴 성공률을 큰 숫자로 둔다. 드릴은 문제당 한 번만 채점해서 되돌리기가 안 통한다. */}
                    {drill ? (
                        <span className="flex items-baseline gap-2 mt-3">
                            <span className={cn("rk-num text-[30px] font-bold leading-none", st.cardBig)}>{drill.successes}/{drill.total}</span>
                            <span className={cn("text-[12px] font-medium", st.cardSub)}>{t("sim.entry.drillWeekLabel")}</span>
                        </span>
                    ) : (
                        <span className={cn("block text-[13px] font-medium mt-3", st.cardNote)}>{t("sim.entry.singleEmpty")}</span>
                    )}
                </span>
            </button>
            <Drop show={open === "solo"}>
                <Action icon={<PracticeIcon />} label={t("sim.entry.practice")} tone="primary" onPress={() => go("solo", onSingle)} testId="practice" />
                <Links>
                    <LinkRow
                        icon={<DrillIcon />} label={t("sim.drill.title")} onPress={() => go("solo", onDrills)} testId="drills"
                        value={drill ? (
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
                    <LinkRow icon={<PathIcon />} label={t("sim.path.title")} value={t("sim.path.threeOnly")} muted onPress={() => go("solo", onPath)} testId="path" />
                </Links>
            </Drop>
        </section>
    );

    const together = (
        <section key="together" className={st.card}>
            <button type="button" data-entry="together" onClick={() => toggle("together")} aria-expanded={open === "together"} className="w-full text-left px-5 pt-5 pb-4 flex items-start gap-4 active:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/40 rounded-t-card">
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
                        <span className={cn("transition-transform duration-200", st.chevron, open === "together" && "rotate-90")}><ChevronRightIcon /></span>
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
                <div className="grid grid-cols-2 gap-2">
                    <Action icon={<InviteIcon />} label={t("sim.entry.invite")} tone="primary" onPress={() => go("together", onMulti)} testId="invite" />
                    {/* 코드로 참가: 노란색(공 토큰) — 2026-09-08 오너 */}
                    <Action icon={<CodeIcon />} label={t("sim.entry.join")} tone="yellow" onPress={() => go("together", onJoin)} testId="join" />
                </div>
                <Links>
                    {/* 열린 방 수는 0 이어도 보여 준다 — 비어 있다는 것도 정보다(2026-09-10 오너) */}
                    <LinkRow
                        icon={<RoomsIcon />} label={t("sim.entry.rooms")} onPress={() => go("together", onRooms)} testId="rooms"
                        value={rooms.data ? `${t("sim.entry.roomsOpen")} ${openRooms}` : undefined} muted={openRooms === 0}
                    />
                    {/* 네 판 중 내 최고 순위(2026-09-10 오너). 배치 전이면 '배치 중 n/m' */}
                    <LinkRow
                        icon={<RankIcon />} label={t("sim.rank.title")} onPress={() => go("together", onRank)} testId="rank"
                        value={rankValue?.text} muted={rankValue?.muted}
                    />
                </Links>
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
                {/* 내 다마수(2026-09-12 오너) — 정보 카드라 늘 맨 위, 접히지 않는다 */}
                <HandicapCard enabled={!!member} />
                {order.map((k) => (k === "solo" ? solo : together))}
            </div>
        </div>
    );
}
