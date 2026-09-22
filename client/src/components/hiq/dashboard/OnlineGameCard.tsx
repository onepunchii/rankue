/**
 * 홈의 온라인게임 카드 — 가로로 펼친 타일 + **지금 열린 멀티방 줄**(2026-09-21 오너: "온라인게임을 활성화하고 싶다.
 * 홈 카드를 가로로 확장해서 현재 멀티방 내역이 나오고 바로 들어갈 수 있게").
 *
 * 왜 홈에 방 목록인가: 대전은 상대가 있어야 시작되는데, 방은 홈 → 온라인게임 → 멀티방까지 두 번 더 들어가야 보였다.
 * 열린 방이 하나라도 있는 순간을 홈에서 바로 보여 주는 것이 "사람이 있다"는 유일한 신호다.
 *
 * 방을 누르면 멀티방 화면으로 가면서 그 방의 참가 창이 바로 열린다(?rooms=1&room=<id>) — 비밀번호·다마수 확인은
 * ⚠️ 이름이 room 인 이유: ?join= 은 6자리 초대 코드용이라 uuid 를 넣으면 숫자 6개만 뽑혀 엉뚱한 코드로 조회되고
 * "초대가 만료됐거나…" 로 튕겨 나갔다(2026-09-22 오너).
 * 이미 있는 참가 창이 그대로 한다. 홈에서 참가 규칙을 두 번 구현하지 않는다.
 * 열린 방이 없으면(보통의 경우다) 줄 대신 "방 만들기"를 크게 둔다 — 빈 목록을 보여 주는 것보다 방을 하나 여는 게 낫다.
 */
import { lazy, Suspense, useEffect, useRef, useState } from "react";
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

const EntryShowcase = lazy(() => import("@/sim/entry/EntryShowcase").then((m) => ({ default: m.EntryShowcase })));

/** 홈에서는 대기 화면보다 느리게 본다 — 방이 생기는 일은 드물고, 홈은 배터리를 오래 쓴다. */
const HOME_ROOMS_REFETCH_MS = 20_000;
/** 줄에 그리는 방 수. 더 있으면 "전체 보기"가 받는다. */
const MAX_ROWS = 3;

/** 화면이 뜨고 한숨 돌린 뒤(idle) + 타일이 보일 때 장면을 붙인다. 보이지 않으면 paused. */
function useLiveScene(ref: React.RefObject<HTMLElement>): { mount: boolean; paused: boolean } {
    const [idle, setIdle] = useState(false);
    const [visible, setVisible] = useState(false);
    useEffect(() => {
        const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
        if (typeof w.requestIdleCallback === "function") {
            const id = w.requestIdleCallback(() => setIdle(true), { timeout: 1500 });
            return () => w.cancelIdleCallback?.(id);
        }
        const t = setTimeout(() => setIdle(true), 700);
        return () => clearTimeout(t);
    }, []);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        if (typeof IntersectionObserver === "undefined") { setVisible(true); return; }
        const io = new IntersectionObserver((entries) => setVisible(entries.some((e) => e.isIntersecting)), { threshold: 0.15 });
        io.observe(el);
        return () => io.disconnect();
    }, [ref]);
    return { mount: idle && visible, paused: !visible };
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
    const sceneRef = useRef<HTMLDivElement>(null);
    const scene = useLiveScene(sceneRef);
    const [sceneMounted, setSceneMounted] = useState(false);
    useEffect(() => { if (scene.mount) setSceneMounted(true); }, [scene.mount]);

    // 멀티방 화면과 같은 캐시 키 — 홈에서 본 목록이 그대로 이어진다. 화면 밖이면 쉰다.
    const rooms = useQuery({
        queryKey: ROOMS_QUERY_KEY,
        queryFn: () => matchApi.listRooms(),
        enabled: !!member,
        staleTime: 10_000,
        refetchInterval: scene.paused ? false : HOME_ROOMS_REFETCH_MS,
    });
    const list = rooms.data ?? [];
    const shown = list.slice(0, MAX_ROWS);
    // 내가 연 방은 위 목록에서 빠진다(내 방엔 내가 참가할 수 없다) — 따로 한 줄로 보여 준다.
    const { room: myRoom } = useMyOpenRoom(matchApi, !!member);

    return (
        <div className="col-span-2 rounded-3xl overflow-hidden bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
            {/* 타일: 살아 있는 3D 테이블 위에 제목(누르면 온라인게임 진입 화면) */}
            <motion.button
                whileTap={{ scale: 0.99 }}
                onClick={() => setLocation("/online-game")}
                className="relative block w-full h-[168px] overflow-hidden bg-[#174479] text-left"
            >
                <div ref={sceneRef} className="absolute inset-0">
                    {sceneMounted && (
                        <Suspense fallback={null}>
                            <EntryShowcase className="absolute inset-0 bg-[#174479]" paused={scene.paused} />
                        </Suspense>
                    )}
                </div>
                <div className="relative h-full flex flex-col justify-end p-5 bg-gradient-to-t from-black/55 via-black/10 to-transparent">
                    <span className="block text-[21px] font-bold text-white leading-tight">{t("quickActions.simTitle")}</span>
                    <span className="block text-[13px] font-medium text-white/85 mt-1 leading-snug">{t("quickActions.simDesc")}</span>
                </div>
                {list.length > 0 && (
                    <span className="absolute top-4 right-4 h-7 px-3 rounded-pill bg-brand text-brand-fg text-[12px] font-bold inline-flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-white" aria-hidden="true" />
                        {t("sim.entry.roomsOpen")} {list.length}
                    </span>
                )}
            </motion.button>

            {/* 방 줄: 있으면 바로 참가, 없으면 방을 여는 쪽으로 민다 */}
            <div className={cn("divide-y divide-black/[0.06]", (shown.length > 0 || myRoom) && "border-t border-black/[0.06]")}>
                {myRoom && <MyRoomRow room={myRoom} onEnter={() => setLocation("/online-game?lobby=1")} className="bg-brand/[0.04]" />}
                {shown.map((m) => (
                    <RoomRow key={m.id} m={m} onJoin={() => setLocation(`/online-game?rooms=1&room=${m.id}`)} />
                ))}
            </div>
            <div className="px-4 py-3 flex items-center gap-2 border-t border-black/[0.06]">
                {shown.length === 0 && !myRoom && (
                    <span className="flex-1 min-w-0 text-[12.5px] font-medium text-black/45 truncate">
                        {rooms.isPending && member ? t("sim.rooms.loading") : t("sim.rooms.empty")}
                    </span>
                )}
                {list.length > MAX_ROWS && (
                    <button
                        type="button" onClick={() => setLocation("/online-game?rooms=1")}
                        className="flex-1 h-10 rounded-pill border border-black/10 text-[13px] font-bold text-black/60 hover:bg-black/[0.03]"
                    >
                        {t("sim.entry.rooms")} {list.length}
                    </button>
                )}
                <button
                    type="button" onClick={() => setLocation("/online-game?lobby=1&public=1")}
                    className={cn(
                        "h-10 px-4 rounded-pill bg-brand text-brand-fg text-[13px] font-bold active:scale-[0.98] transition-transform",
                        shown.length === 0 && !myRoom && list.length <= MAX_ROWS ? "shrink-0" : "flex-1",
                    )}
                >
                    {t("sim.entry.roomCreate")}
                </button>
            </div>
        </div>
    );
}
