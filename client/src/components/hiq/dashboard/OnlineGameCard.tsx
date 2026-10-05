/**
 * 홈 당구 게임 구역의 두 카드(2026-10-04 — 홈이 온라인게임 입구다): **혼자 치기**(초록 다이 그림 · 이어서 치기 · 이번 주 드릴 · 길 찾기)와
 * **같이 치기**(블루 다이 그림 · 친구 초대 · 코드로 참가 · 지금 열린 멀티방 줄 · 방 만들기).
 * 멀티방 줄은 2026-09-21 오너: "온라인게임을 활성화하고 싶다. 홈 카드를 가로로 확장해서 현재 멀티방 내역이 나오고 바로 들어갈 수 있게".
 *
 * 왜 홈에 방 목록인가: 대전은 상대가 있어야 시작되는데, 방은 홈 → 온라인게임 → 멀티방까지 두 번 더 들어가야 보였다.
 * 열린 방이 하나라도 있는 순간을 홈에서 바로 보여 주는 것이 "사람이 있다"는 유일한 신호다.
 *
 * 방을 누르면 멀티방 화면으로 가면서 그 방의 참가 창이 바로 열린다(?rooms=1&room=<id>) — 비밀번호·다마수 확인은
 * ⚠️ 이름이 room 인 이유: ?join= 은 6자리 초대 코드용이라 uuid 를 넣으면 숫자 6개만 뽑혀 엉뚱한 코드로 조회되고
 * "초대가 만료됐거나…" 로 튕겨 나갔다(2026-09-22 오너).
 * 이미 있는 참가 창이 그대로 한다. 홈에서 참가 규칙을 두 번 구현하지 않는다.
 * 열린 방이 없으면(보통의 경우다) 줄 대신 "방 만들기"를 크게 둔다 — 빈 목록을 보여 주는 것보다 방을 하나 여는 게 낫다.
 *
 * 비로그인(2026-10-05 오너 결정: "홈을 비로그인에 다 열고, 가입 안 한 사람에겐 예시로 보여 준다") —
 *  · 혼자 치기(바로 치기 · 길 찾기)는 비로그인도 되는 화면이라 그대로 연다.
 *  · 이번 주 드릴은 회원의 것이다 — 문제 목록·주간 순위·채점이 전부 로그인 필수(server/routes/modules/simDrill.ts)라 그냥 보내면
 *    "목록을 불러오지 못했어요"에서 끝난다. 입구에서 가입 안내로 잇고, 값 자리도 "시작 전"(회원의 주간 기록이 비었다는 말) 대신 가입 안내를 적는다.
 *  · 같이 치기는 회원끼리의 대전이라 입구 전부(멀티방 · 친구 초대 · 코드로 참가 · 방 만들기)를 가입 안내로 잇는다(together).
 *    가입 뒤에는 가려던 곳으로 돌아온다.
 *  · 방 목록은 회원만 받는다. 비로그인에게 "열린 방이 없어요"라고 하면 받아 보지도 않고 없다고 하는 거짓 빈 값이라,
 *    그 자리에는 "가입하면 같이 칠 수 있어요" 한 줄을 둔다.
 * 회원에게는 달라지는 게 없다 — guard 는 회원이면 동작을 그대로 실행한다.
 */
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useLocation } from "wouter";
import { useT } from "@/lib/i18n";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { matchApi, type MatchPublic } from "@/sim/matchApi";
import { ROOMS_QUERY_KEY, roomAge } from "@/sim/match/RoomList";
import { MyRoomRow, useMyOpenRoom } from "@/sim/match/MyRoomRow";
import { gameLabel } from "@/sim/match/matchView";
import { Crosshair, LucideChevronRight, LucideHash, LucidePath, LucideUserPlus } from "@/lib/icons";
import { drillApi, weekProgress, DRILL_WEEK_QUERY_KEY } from "@/sim/drill/drillApi";
import { loadResume, fetchResumable, clearResume, type Resumable } from "@/sim/simResume";
import { apiRequest } from "@/lib/queryClient";
import { useGuestGate } from "@/components/hiq/GuestGate";

/**
 * 카드 그림(2026-10-04 오너: "혼자 치기는 그린 다이, 다이 밖 색도 신경 쓰고, 큰 원점(다이아몬드)이 많다 — 깔끔하게 나무 다이로.
 * 같이 치기는 블루 다이로"). 게임 렌더러(ThreeRenderer)로 개시 배치를 선수 시점에서 한 번 그려 webp 로 둔다 — 다이아몬드·스폿을 끄고,
 * 바닥 평면을 숨겨 테이블 둘레가 천 색을 아주 어둡게 한 색(초록 #142219 · 남색 #0F1A2E)이 되게. 혼자 = 중대(초록)·흰 공,
 * 같이 = 대대(파랑)·노란 공(상대 차례 느낌). 예전엔 살아 있는 3D 장면이었는데 카드가 둘이 되며 WebGL 을 둘 띄우지 않으려고 그림으로 —
 * 홈이 three.js 를 받지 않는다. 게임 속 테이블(다이아몬드로 겨냥)은 그대로다.
 */
const SOLO_IMG = "/img/home/solo-table.webp";
const TOGETHER_IMG = "/img/home/together-table.webp";

/** 홈에서는 대기 화면보다 느리게 본다 — 방이 생기는 일은 드물고, 홈은 배터리를 오래 쓴다. */
const HOME_ROOMS_REFETCH_MS = 20_000;
/** 줄에 그리는 방 수. 더 있으면 "전체 보기"가 받는다. */
const MAX_ROWS = 3;

/** 카드가 화면에 보이는지 — 안 보이면 열린 방 목록을 다시 묻지 않는다(홈은 배터리를 오래 쓴다). */
function useVisible(ref: React.RefObject<HTMLElement>): boolean {
    const [visible, setVisible] = useState(false);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        if (typeof IntersectionObserver === "undefined") { setVisible(true); return; }
        const io = new IntersectionObserver((entries) => setVisible(entries.some((e) => e.isIntersecting)), { threshold: 0.15 });
        io.observe(el);
        return () => io.disconnect();
    }, [ref]);
    return visible;
}

function RoomRow({ m, onJoin }: { m: MatchPublic; onJoin: () => void }) {
    const { t } = useT();
    return (
        <button
            type="button" onClick={onJoin}
            className="w-full px-4 py-2.5 flex items-center gap-3 text-left transition-colors hover:bg-black/[0.03] active:bg-black/[0.05]"
            aria-label={`${t("sim.rooms.join")} · ${m.hostName}`}
        >
            <span className="flex-1 min-w-0">
                <span className="flex items-center gap-2 min-w-0">
                    <span className="text-[14px] font-semibold text-ink-1 truncate">{m.hostName}</span>
                    <span className="text-[11px] font-medium text-black/40 shrink-0">{roomAge(m.createdAt, Date.now(), t)}</span>
                </span>
                <span className="block text-[12px] font-medium text-black/50 truncate mt-0.5">
                    {gameLabel(m, t)}
                    {m.handicap === true
                        ? <> · <span className="text-brand font-bold">{t("sim.match.handicapRoom")}</span></>
                        : <> · {t("sim.rooms.target").replace("{n}", String(m.hostTarget))}</>}
                    {m.hasPassword ? <> · {t("sim.rooms.locked")}</> : null}
                </span>
            </span>
            <span className="h-9 px-3.5 shrink-0 rounded-pill bg-brand/10 text-brand text-[13px] font-bold inline-flex items-center">
                {t("sim.rooms.join")}
            </span>
        </button>
    );
}

export function OnlineGameCard() {
    const [, setLocation] = useLocation();
    const { t } = useT();
    const { member } = useAuth();
    const gate = useGuestGate();
    // 같이 치기의 입구는 전부 이 함수로 — 비로그인은 가입 안내 시트, 가입 뒤 가려던 주소(to)로 돌아온다. 회원은 바로 간다.
    const together = (to: string) => gate.guard(() => setLocation(to), {
        title: t("guestHome.gateTogetherTitle"),
        desc: t("guestHome.gateTogetherDesc"),
        from: to,
    });
    // 이번 주 드릴의 입구 — 드릴은 대전이 아니라 주간 채점 기록이라 가입 안내 문구를 따로 둔다. 가입 뒤에는 드릴 화면으로 돌아온다.
    const openDrills = () => gate.guard(() => setLocation("/online-game?drills=1"), {
        title: t("guestHome.gateDrillTitle"),
        desc: t("guestHome.gateDrillDesc"),
        from: "/online-game?drills=1",
    });
    const roomsRef = useRef<HTMLDivElement>(null);
    const roomsVisible = useVisible(roomsRef);

    // 멀티방 화면과 같은 캐시 키 — 홈에서 본 목록이 그대로 이어진다. 화면 밖이면 쉰다.
    const rooms = useQuery({
        queryKey: ROOMS_QUERY_KEY,
        queryFn: () => matchApi.listRooms(),
        enabled: !!member,
        staleTime: 10_000,
        refetchInterval: roomsVisible ? HOME_ROOMS_REFETCH_MS : false,
    });
    // 이어서 치기(예전엔 온라인게임 입구의 띠) — 이 기기에 적힌 기록 경기가 서버에서 아직 진행 중이면 '혼자 치기' 카드에 띠로.
    // 홈이 입구가 됐으니(2026-10-04) 여기서 보여 준다. 누르면 ?resume=1 로 바로 그 판을 잇는다.
    const [resumable, setResumable] = useState<Resumable | null>(null);
    useEffect(() => {
        if (!member) return;
        const rec = loadResume();
        if (!rec) { setResumable(null); return; }
        let alive = true;
        void fetchResumable(rec).then((r) => { if (alive) setResumable(r); });
        return () => { alive = false; };
    }, [member?.id]); // eslint-disable-line react-hooks/exhaustive-deps
    const discardResume = () => {
        if (!resumable) return;
        const id = resumable.id;
        clearResume();
        setResumable(null);
        void apiRequest(`/api/hiq/sim/sessions/${encodeURIComponent(id)}/close`, { method: "POST", body: { status: "abandoned" } }).catch(() => undefined);
    };
    // 이번 주 드릴 — 진입 화면·드릴 화면과 같은 캐시
    const week = useQuery({ queryKey: DRILL_WEEK_QUERY_KEY, queryFn: () => drillApi.getWeek(), enabled: !!member, staleTime: 30_000 });
    // 비로그인은 쿼리가 꺼져 있다 — 캐시에 남은 옛 답(지난 계정의 드릴·방 목록·내 방)도 그리지 않는다
    const drill = !gate.isGuest && week.data ? weekProgress(week.data) : null;
    const list = gate.isGuest ? [] : rooms.data ?? [];
    const shown = list.slice(0, MAX_ROWS);
    // 내가 연 방은 위 목록에서 빠진다(내 방엔 내가 참가할 수 없다) — 따로 한 줄로 보여 준다.
    const { room: openRoom } = useMyOpenRoom(matchApi, !!member);
    const myRoom = gate.isGuest ? null : openRoom;

    // 2026-10-04 오너: "멀티랑 혼자하기 카드를 홈으로 따로 빼자 — 지금은 눌러서 들어가야 나온다.
    // '온라인게임'이라 하니 혼자 하고 싶은 사람이 머뭇거린다" → 이어서 "드릴·길 찾기까지 빼서 진입 화면을 거칠 필요 없게".
    // 홈이 곧 입구다. 진입 화면(SimEntry)의 혼자/같이 두 묶음을 그대로 카드 둘로 옮겼다.
    //  · 혼자 치기: 3D 테이블(누르면 바로 설정 창 ?solo=1, 닫으면 홈으로) + 아랫단 이번 주 드릴 · 길 찾기
    //  · 같이 치기: 머리(누르면 멀티방) + 친구 초대(초록) · 코드로 참가(노랑 — 진입 화면 규칙) + 열린 방 줄 + 방 만들기
    const cell = "min-w-0 px-4 py-3 flex items-center gap-3 text-left transition-colors hover:bg-black/[0.02] active:bg-black/[0.04]";
    return (
        <>
            <div className="rounded-3xl overflow-hidden bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                <motion.button
                    whileTap={{ scale: 0.99 }}
                    onClick={() => setLocation("/online-game?solo=1")}
                    className="relative block w-full h-[156px] overflow-hidden bg-[#142219] text-left"
                >
                    <img src={SOLO_IMG} alt="" width={1050} height={468} className="absolute inset-0 w-full h-full object-cover" />
                    <div className="relative h-full flex items-end justify-between gap-3 p-5 bg-gradient-to-t from-black/55 via-black/10 to-transparent">
                        <span className="min-w-0">
                            <span className="block text-[21px] font-bold text-white leading-tight">{t("home.soloTitle")}</span>
                            <span className="block text-[13px] font-medium text-white/85 mt-1 leading-snug truncate">{t("home.soloDesc")}</span>
                        </span>
                        <span className="shrink-0 h-10 pl-4 pr-3 rounded-full bg-[#ffffff] text-[14px] font-bold text-[#0B5D3B] flex items-center gap-0.5">
                            {t("home.soloCta")}
                            <LucideChevronRight className="w-4 h-4" />
                        </span>
                    </div>
                </motion.button>
                {resumable && (
                    <div className="flex items-center gap-3 px-4 py-3 bg-brand/[0.06] border-b border-black/[0.06]">
                        <span className="flex-1 min-w-0">
                            <span className="block text-[13px] font-bold text-brand">{t("sim.resume.title")}</span>
                            <span className="block text-[12px] font-medium text-black/55 truncate tabular-nums">
                                {t("sim.resume.label")
                                    .replace("{game}", t(resumable.session.rules.gameType === "4c" ? "sim.setup.type4c" : "sim.setup.type3c"))
                                    .replace("{score}", String(resumable.session.players[0]?.score ?? 0))
                                    .replace("{target}", String(resumable.session.players[0]?.target ?? 0))
                                    .replace("{innings}", String(resumable.session.players[0]?.innings ?? 0))}
                            </span>
                        </span>
                        <button type="button" onClick={discardResume} className="shrink-0 h-9 px-3 rounded-full text-[12.5px] font-semibold text-black/50 hover:bg-black/[0.04]">
                            {t("sim.resume.discard")}
                        </button>
                        <button type="button" onClick={() => setLocation("/online-game?resume=1")} className="shrink-0 h-9 px-4 rounded-full bg-brand text-brand-fg text-[13px] font-bold active:scale-[0.98] transition-transform">
                            {t("sim.resume.go")}
                        </button>
                    </div>
                )}
                <div className="grid grid-cols-2 divide-x divide-black/[0.06]">
                    <button type="button" onClick={openDrills} className={cell}>
                        <span className="w-9 h-9 shrink-0 rounded-xl bg-brand/10 flex items-center justify-center"><Crosshair className="w-[19px] h-[19px] text-brand" /></span>
                        <span className="min-w-0">
                            <span className="block text-[11.5px] font-semibold text-black/50 truncate">{t("sim.drill.title")}</span>
                            <span className="block text-[14px] font-bold text-ink-1 tabular-nums leading-tight truncate">
                                {/* 비로그인은 드릴을 받지 않았다 — '시작 전'(거짓 빈 값) 대신 가입하면 되는 일을 적는다 */}
                                {drill ? `${drill.successes}/${drill.total}` : gate.isGuest ? t("guestHome.drillJoin") : t("home.drillStart")}
                            </span>
                        </span>
                    </button>
                    <button type="button" onClick={() => setLocation("/online-game?path=1")} className={cell}>
                        <span className="w-9 h-9 shrink-0 rounded-xl bg-brand/10 flex items-center justify-center"><LucidePath className="w-[19px] h-[19px] text-brand" /></span>
                        <span className="min-w-0">
                            <span className="block text-[11.5px] font-semibold text-black/50 truncate">{t("sim.path.title")}</span>
                            <span className="block text-[14px] font-bold text-ink-1 leading-tight truncate">{t("sim.path.threeOnly")}</span>
                        </span>
                    </button>
                </div>
            </div>

            <div ref={roomsRef} className="rounded-3xl overflow-hidden bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                {/* 같이 치기 — 블루 다이 그림(대대·노란 공). 누르면 멀티방 목록 */}
                <motion.button
                    whileTap={{ scale: 0.99 }}
                    onClick={() => together("/online-game?rooms=1")}
                    className="relative block w-full h-[156px] overflow-hidden bg-[#0F1A2E] text-left"
                >
                    <img src={TOGETHER_IMG} alt="" width={1050} height={468} className="absolute inset-0 w-full h-full object-cover" />
                    {list.length > 0 && (
                        <span className="absolute top-4 right-4 h-7 px-3 rounded-pill bg-brand text-brand-fg text-[12px] font-bold inline-flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-white" aria-hidden="true" />
                            {t("sim.entry.roomsOpen")} {list.length}
                        </span>
                    )}
                    <div className="relative h-full flex items-end justify-between gap-3 p-5 bg-gradient-to-t from-black/55 via-black/10 to-transparent">
                        <span className="min-w-0">
                            <span className="block text-[21px] font-bold text-white leading-tight">{t("home.togetherTitle")}</span>
                            <span className="block text-[13px] font-medium text-white/85 mt-1 leading-snug truncate">{t("home.togetherDesc")}</span>
                        </span>
                        <span className="shrink-0 h-10 pl-4 pr-3 rounded-full bg-[#ffffff] text-[14px] font-bold text-[#174479] flex items-center gap-0.5">
                            {t("sim.entry.rooms")}
                            <LucideChevronRight className="w-4 h-4" />
                        </span>
                    </div>
                </motion.button>
                <div className="grid grid-cols-2 gap-2 p-4">
                    <button
                        type="button" onClick={() => together("/online-game?lobby=1")}
                        className="h-11 rounded-full bg-brand text-brand-fg text-[13.5px] font-bold inline-flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform"
                    >
                        <LucideUserPlus className="w-4 h-4" />{t("sim.entry.invite")}
                    </button>
                    <button
                        type="button" onClick={() => together("/online-game?lobby=1&tab=join")}
                        className="h-11 rounded-full bg-[#F5B721] text-[#3D2A00] text-[13.5px] font-bold inline-flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform"
                    >
                        <LucideHash className="w-4 h-4" />{t("sim.entry.join")}
                    </button>
                </div>

                {/* 방 줄: 있으면 바로 참가, 없으면 방을 여는 쪽으로 민다 */}
                {(shown.length > 0 || myRoom) && (
                    <div className="divide-y divide-black/[0.06] border-t border-black/[0.06]">
                        {myRoom && <MyRoomRow room={myRoom} onEnter={() => together("/online-game?lobby=1")} className="bg-brand/[0.04]" />}
                        {shown.map((m) => (
                            <RoomRow key={m.id} m={m} onJoin={() => together(`/online-game?rooms=1&room=${m.id}`)} />
                        ))}
                    </div>
                )}
                <div className="px-4 py-3 flex items-center gap-2 border-t border-black/[0.06]">
                    <span className="flex-1 min-w-0 text-[12.5px] font-medium text-black/45 truncate">
                        {/* 비로그인은 방 목록을 받지 않았다 — '열린 방이 없어요'(거짓 빈 값) 대신 가입하면 되는 일을 적는다 */}
                        {gate.isGuest
                            ? t("guestHome.togetherJoin")
                            : shown.length === 0 && !myRoom
                                ? (rooms.isPending && member ? t("sim.rooms.loading") : t("sim.rooms.empty"))
                                : list.length > MAX_ROWS
                                    ? <button type="button" onClick={() => together("/online-game?rooms=1")} className="font-semibold text-black/60">{t("sim.entry.rooms")} {list.length} →</button>
                                    : null}
                    </span>
                    <button
                        type="button" onClick={() => together("/online-game?lobby=1&public=1")}
                        className="shrink-0 h-9 px-4 rounded-pill border border-black/10 text-[13px] font-bold text-ink-1 hover:bg-black/[0.03] active:scale-[0.98] transition-transform"
                    >
                        {t("sim.entry.roomCreate")}
                    </button>
                </div>
            </div>
            {/* 가입 안내 시트 — guard 가 여는 것. 한 번만 그린다 */}
            {gate.sheet}
        </>
    );
}
