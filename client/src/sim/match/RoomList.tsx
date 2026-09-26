/**
 * 멀티방 목록(2026-09-08 오너: "멀티방은 다른 카드로"). GET /sim/rooms — 공개·대기 중·내 방 아님·24시간 이내, 10 s 폴링.
 * 행: 방장 · 종목/테이블 · 다마수 · 리얼리티 칩 · 비밀번호 칩 · 만든 지 n분 · "참가". 참가 → 다이얼로그(내 다마수 · 비밀번호) → POST /sim/matches/:id/join → onOpen(playing).
 * 화면의 초록은 다이얼로그의 "참가" 하나. 목록의 참가 버튼은 테두리 알약.
 */
import { memo, useEffect, useMemo, useState, useRef} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { matchApi as defaultApi, matchErrorCode, type MatchApi, type MatchPublic, type WatchCard } from "../matchApi";
import { gameLabel, rulesLabel, inningCapLabel } from "./matchView";
import { roomSetKey, shouldRefreshWatch, WATCH_LIST_REFETCH_MS, WATCH_QUERY_KEY } from "../watch/watchPlan";
import { isValidTarget } from "../setupPresets";
import { TargetPicker } from "./MatchLobby";
import { MyRoomRow, useMyOpenRoom } from "./MyRoomRow";

export const ROOMS_QUERY_KEY = ["sim-rooms"] as const;
export const ROOMS_REFETCH_MS = 10_000;

export interface RoomListProps {
    /** 게임 중인 방을 골랐을 때(관전으로 간다). 없으면 게임 중인 방 줄을 그리지 않는다. */
    onWatch?: (id: string) => void;
    /** 참가가 끝나 playing 이 된 대전 — 페이지가 actions.startMatch 로 연다 */
    onOpen: (m: MatchPublic) => void;
    onCreate: () => void;
    /** 내가 열어 둔 방으로 돌아가기(대기 화면). 없으면 내 방 줄을 그리지 않는다. */
    onEnterMine?: () => void;
    onClose: () => void;
    api?: MatchApi;
    /** 내 실전 핸디(있으면 다마수 기본값) */
    myHandi?: { handi3c: number | null; handi4c: number | null };
    /**
     * 이 방의 참가 창을 바로 연다(홈 카드에서 방을 눌러 들어온 경우 ?rooms=1&room=<id>).
     * 목록이 도착한 뒤 한 번만 연다 — 닫으면 다시 열리지 않는다. 그사이 방이 차서 없어졌으면 목록만 보인다.
     */
    autoJoinId?: string;
    now?: () => number;
}

/** 만든 지 얼마나: 1분 미만 "방금", 60분 미만 "n분 전", 그 뒤 "n시간 전". */
export function roomAge(createdAt: string, nowMs: number, t: (k: string) => string): string {
    const ms = nowMs - Date.parse(createdAt);
    if (!Number.isFinite(ms) || ms < 60_000) return t("sim.rooms.agoNow");
    const min = Math.floor(ms / 60_000);
    if (min < 60) return t("sim.rooms.agoMin").replace("{n}", String(min));
    return t("sim.rooms.agoHour").replace("{n}", String(Math.floor(min / 60)));
}

/** 참가 다마수 기본값: 내 실전 핸디(종목별) → 없으면 방장 다마수. */
/**
 * 빠른 대전(2026-09-26 검토) — 목록에서 바로 칠 수 있는 방 하나. 방장이 보고 있고 비밀번호가 없는 핸디전 방이 먼저,
 * 없으면 방장이 보고 있는 비밀번호 없는 방. 그래도 없으면 null(새 방을 연다). 목록은 서버가 방장 접속 순 → 최신순으로 준다.
 */
export function pickQuickRoom(rows: readonly MatchPublic[]): MatchPublic | null {
    const open = rows.filter((m) => m.hostOnline && !m.hasPassword);
    return open.find((m) => m.handicap) ?? open[0] ?? null;
}

export function defaultJoinTarget(m: Pick<MatchPublic, "gameType" | "hostTarget">, handi?: { handi3c: number | null; handi4c: number | null }): number {
    const h = handi ? (m.gameType === "3c" ? handi.handi3c : handi.handi4c) : null;
    return h !== null && h !== undefined && isValidTarget(h) ? h : m.hostTarget;
}

const pill = "h-10 px-3.5 inline-flex items-center rounded-pill border border-surface-line bg-surface-1 text-[13px] font-semibold text-ink-2 active:bg-surface-3 shrink-0";

const Row = memo(function Row({ m, age, onJoin }: { m: MatchPublic; age: string; onJoin: (m: MatchPublic) => void }) {
    const { t } = useT();
    return (
        <li className="rounded-tile border border-surface-line bg-surface-1 px-4 py-3 flex items-center gap-3">
            <span className="flex-1 min-w-0 flex flex-col gap-1">
                <span className="flex items-center gap-2 min-w-0">
                    <span className="text-[14px] font-semibold text-ink-1 truncate">{m.hostName}</span>
                    <span className="text-[11px] font-medium text-ink-3 shrink-0">{age}</span>
                    {/* 방장 접속(2026-09-26): 초록 점 = 들어가면 바로 친다. 없으면 방장이 알림을 받고 와야 시작 */}
                    {m.hostOnline
                        ? <span className="shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold text-brand"><span className="w-1.5 h-1.5 rounded-full bg-brand" />{t("sim.rooms.hostOnline")}</span>
                        : <span className="shrink-0 text-[11px] font-medium text-ink-4">{t("sim.rooms.hostAway")}</span>}
                </span>
                <span className="text-[12px] font-medium text-ink-3 truncate">
                    {gameLabel(m, t)}
                    {m.handicap === true ? <> · <span className="text-brand font-bold">{t("sim.match.handicapRoom")}</span></> : <> · {t("sim.rooms.target").replace("{n}", String(m.hostTarget))} · {t("sim.match.friendly")}</>}
                </span>
                {(m.aimAssist === false || m.hasPassword) && (
                    <span className="flex flex-wrap gap-1">
                        {m.aimAssist === false && <span className="rk-chip bg-surface-3 text-ink-2">{t("sim.setup.modeReality")}</span>}
                        {m.hasPassword && <span className="rk-chip bg-surface-3 text-ink-2">{t("sim.rooms.locked")}</span>}
                    </span>
                )}
            </span>
            <button type="button" onClick={() => onJoin(m)} className="h-10 px-4 shrink-0 rounded-pill bg-[color:var(--arc-frame)] text-[color:var(--arc-ink)] text-[13px] font-black" aria-label={`${t("sim.rooms.join")} · ${m.hostName}`}>
                {t("sim.rooms.join")}
            </button>
        </li>
    );
});

/**
 * 게임 중인 방 줄(2026-09-12 오너: "게임중이라도 방이 보이고 게임중이라고 표시되고, 선택되면 관전으로").
 * 시작한 방은 참가할 수 없으니 버튼이 '관전'이다. 대기 중인 방과 같은 목록에 둔다 — 방이 사라진 것처럼 보이지 않게.
 */
const LiveRow = memo(function LiveRow({ c, onWatch }: { c: WatchCard; onWatch: (id: string) => void }) {
    const { t } = useT();
    const guest = c.guestName ?? "-";
    return (
        <li className="rounded-tile border border-surface-line bg-surface-1 px-4 py-3 flex items-center gap-3">
            <span className="flex-1 min-w-0 flex flex-col gap-1">
                <span className="flex items-center gap-2 min-w-0">
                    <span className="text-[14px] font-semibold text-ink-1 truncate">{c.hostName} <span className="text-ink-3">vs</span> {guest}</span>
                    <span className="rk-chip bg-brand/15 text-brand font-bold shrink-0">{t("sim.watch.badge")}</span>
                </span>
                <span className="text-[12px] font-medium text-ink-3 truncate">
                    {gameLabel(c, t)} · <span className="tabular-nums">{c.scores[0] ?? 0} : {c.scores[1] ?? 0}</span>
                    {(c.watchers ?? 0) > 0 && <span className="text-brand font-bold"> · {t("sim.watch.viewers").replace("{n}", String(c.watchers))}</span>}
                </span>
            </span>
            <button
                type="button" onClick={() => onWatch(c.id)}
                className="h-10 px-4 shrink-0 rounded-pill border border-surface-line-strong text-[13px] font-black text-ink-1"
                aria-label={`${t("sim.watch.watch")} · ${c.hostName}`}
            >{t("sim.watch.watch")}</button>
        </li>
    );
});

function joinErrorKey(e: unknown): string {
    const code = matchErrorCode(e);
    if (code === "BAD_PASSWORD") return "sim.match.badPassword";
    const status = e && typeof e === "object" && "status" in e ? (e as { status?: number }).status : undefined;
    if (status === 404 || status === 409) return "sim.rooms.gone";
    return "sim.match.joinFailed";
}

function JoinDialog({ room, api, myHandi, onClose, onOpen }: { room: MatchPublic | null; api: MatchApi; myHandi?: RoomListProps["myHandi"]; onClose: () => void; onOpen: (m: MatchPublic) => void }) {
    const { t } = useT();
    const qc = useQueryClient();
    const [targetText, setTargetText] = useState("");
    const [password, setPassword] = useState("");
    const [joining, setJoining] = useState(false);
    const [error, setError] = useState<string | null>(null);
    useEffect(() => {
        if (room) { setTargetText(String(defaultJoinTarget(room, myHandi))); setPassword(""); setError(null); }
    }, [room, myHandi]);
    const targetNum = targetText.trim() === "" ? NaN : Number(targetText);
    // 핸디전 방(2026-09-12): 다마수를 게스트가 정하지 않는다 — 참가하는 순간 서버가 두 사람 기록으로 정한다(짠다마 방지).
    const isHandicap = room?.handicap === true;
    const ok = !!room && (isHandicap || isValidTarget(targetNum)) && (!room.hasPassword || password !== "");
    const join = async () => {
        if (!room || !ok || joining) return;
        setJoining(true);
        setError(null);
        try {
            const m = await api.joinRoom(room.id, isHandicap ? undefined : targetNum, room.hasPassword ? password : undefined);
            void qc.invalidateQueries({ queryKey: ROOMS_QUERY_KEY });
            onOpen(m);
        } catch (e) {
            const key = joinErrorKey(e);
            setError(t(key));
            if (key === "sim.rooms.gone") void qc.invalidateQueries({ queryKey: ROOMS_QUERY_KEY });
        } finally {
            setJoining(false);
        }
    };
    return (
        <Dialog open={room !== null} onOpenChange={(o) => { if (!o) onClose(); }}>
            <DialogContent className="bg-surface-1 text-ink-1 max-w-md w-[92%] rounded-card p-5">
                <DialogHeader className="text-left">
                    <DialogTitle className="text-[18px] font-bold text-ink-1">{t("sim.rooms.joinTitle")}</DialogTitle>
                    <DialogDescription className="text-[13px] font-medium text-ink-3">{room ? `${room.hostName} · ${gameLabel(room, t)}` : ""}</DialogDescription>
                </DialogHeader>
                {room && (
                    <div className="space-y-4" data-testid="room-join">
                        <div className="rounded-tile border border-surface-line bg-surface-2 px-4 py-3 space-y-1">
                            <div className="flex items-baseline justify-between gap-2">
                                <span className="text-[12px] font-medium text-ink-4">{t("sim.setup.rules")}</span>
                                <span className="text-[13px] font-semibold text-ink-2">{rulesLabel(room, t)} · {inningCapLabel(room.inningCap, t)}</span>
                            </div>
                            {!isHandicap && (
                                <div className="flex items-baseline justify-between gap-2">
                                    <span className="text-[12px] font-medium text-ink-4">{t("sim.match.hostTarget")}</span>
                                    <span className="rk-num text-[14px] font-semibold text-ink-1">{room.hostTarget}</span>
                                </div>
                            )}
                            <div className="flex items-baseline justify-between gap-2">
                                <span className="text-[12px] font-medium text-ink-4">{t("sim.setup.mode")}</span>
                                <span className="text-[13px] font-semibold text-ink-2">{room.aimAssist === false ? t("sim.setup.modeReality") : t("sim.setup.modeNormal")}</span>
                            </div>
                        </div>
                        {isHandicap ? (
                            <div className="rounded-tile border border-brand/30 bg-brand/[0.06] px-4 py-3">
                                <p className="text-[13px] font-bold text-ink-1">{t("sim.match.handicapRoom")}</p>
                                <p className="text-[12px] font-medium text-ink-3 mt-0.5">{t("sim.match.handicapJoin")}</p>
                            </div>
                        ) : (
                            <>
                                <TargetPicker id="sim-room-target" gameType={room.gameType} text={targetText} onText={setTargetText} label={t("sim.match.myTarget")} />
                                <p className="text-[12px] font-medium text-ink-3">{t("sim.match.friendlyDesc")}</p>
                            </>
                        )}
                        {room.hasPassword && (
                            <div className="space-y-1.5">
                                <Label htmlFor="sim-room-password">{t("sim.rooms.password")}</Label>
                                <Input
                                    id="sim-room-password" type="password" autoComplete="off" value={password}
                                    onChange={(e) => setPassword(e.target.value)} placeholder={t("sim.rooms.passwordHint")}
                                    className="h-12 rounded-xl"
                                />
                            </div>
                        )}
                        {error && <p className="text-[12px] font-medium text-ink-2" role="alert">{error}</p>}
                        <button
                            type="button" onClick={() => { void join(); }} disabled={!ok || joining}
                            className="w-full h-12 rounded-xl bg-brand text-brand-fg text-[14px] font-semibold active:bg-brand-strong disabled:opacity-40"
                        >
                            {joining ? t("sim.match.joining") : t("sim.rooms.join")}
                        </button>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}

export function RoomList({ onOpen, onWatch, onCreate, onEnterMine, onClose, api = defaultApi, myHandi, autoJoinId, now = Date.now }: RoomListProps) {
    const { t } = useT();
    const q = useQuery({ queryKey: ROOMS_QUERY_KEY, queryFn: () => api.listRooms(), staleTime: 0, refetchInterval: ROOMS_REFETCH_MS });
    // 게임 중인 공개 방 — 참가 목록에서는 빠지지만 관전으로 들어갈 수 있어 같은 목록에 이어 붙인다.
    const watch = useQuery({ queryKey: WATCH_QUERY_KEY, queryFn: () => api.getWatchable(), refetchInterval: WATCH_LIST_REFETCH_MS, enabled: !!onWatch });
    const [target, setTarget] = useState<MatchPublic | null>(null);
    const { room: mine } = useMyOpenRoom(api, !!onEnterMine);
    const qc = useQueryClient();
    const nowMs = now();
    const rows = useMemo(() => q.data ?? [], [q.data]);
    const live = useMemo(() => (onWatch ? watch.data?.live ?? [] : []), [watch.data, onWatch]);

    /**
     * 대기 방 목록이 바뀌면 관전 목록도 바로 다시 받는다(2026-09-13 오너 제보).
     * 두 목록은 주기가 달라서(방 10초 · 관전 15초), 누가 참가하면 그 방은 대기 목록에서 곧바로 빠지지만
     * 관전 목록에는 최대 15초 뒤에야 나타났다 — 그 사이 화면이 "열린 방이 없어요" 로 비었다.
     * 방 하나가 사라지는 사건 = 누가 참가했거나 방을 닫은 것이라, 그때만 한 번 더 받으면 된다(주기를 당기지 않는다).
     */
    const roomIdsRef = useRef<string | null>(null);
    useEffect(() => {
        if (!onWatch || !q.isSuccess) return;
        const ids = roomSetKey(rows.map((m) => m.id));
        const prev = roomIdsRef.current;
        roomIdsRef.current = ids;
        if (shouldRefreshWatch(prev, ids)) void qc.invalidateQueries({ queryKey: WATCH_QUERY_KEY });
    }, [rows, q.isSuccess, onWatch, qc]);

    // 홈 카드에서 고른 방 — 목록이 오면 그 방의 참가 창을 한 번 연다.
    const autoOpenedRef = useRef<string | null>(null);
    useEffect(() => {
        if (!autoJoinId || autoOpenedRef.current === autoJoinId || !q.isSuccess) return;
        const room = rows.find((m) => m.id === autoJoinId);
        if (!room) return;
        autoOpenedRef.current = autoJoinId;
        setTarget(room);
    }, [autoJoinId, rows, q.isSuccess]);
    return (
        <div className="rank-arcade w-full max-w-[420px] mx-auto px-5 pt-4 pb-8">
            <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0">
                    <h1 className="text-[20px] font-black text-white leading-tight">{t("sim.rooms.title")}</h1>
                    <p className="text-[12.5px] font-medium text-white/60 mt-0.5">{t("sim.rooms.sub")}</p>
                </div>
                <button type="button" onClick={onClose} className="h-11 px-4 shrink-0 rounded-pill border border-white/25 text-[13px] font-bold text-white/85">
                    {t("sim.common.close")}
                </button>
            </div>
            <div className="flex items-center justify-between gap-2 mb-3">
                <span className="rk-num text-[13px] font-bold text-white/85">
                    {t("sim.entry.roomsOpen")} {rows.length}
                    {live.length > 0 && <span className="text-brand"> · {t("sim.watch.badge")} {live.length}</span>}
                </span>
                <span className="flex gap-2 shrink-0">
                    {/* 빠른 대전: 바로 칠 수 있는 방의 참가 창을 연다(확인 한 번). 없으면 방 만들기로 */}
                    <button
                        type="button" disabled={!q.isSuccess}
                        onClick={() => { const r = pickQuickRoom(rows); if (r) setTarget(r); else onCreate(); }}
                        className="h-10 px-4 shrink-0 rounded-pill border border-white/30 text-white text-[13px] font-black disabled:opacity-50"
                    >
                        {t("sim.rooms.quick")}
                    </button>
                    <button type="button" onClick={onCreate} className="h-10 px-4 shrink-0 rounded-pill bg-[color:var(--arc-frame)] text-[color:var(--arc-ink)] text-[13px] font-black">{t("sim.entry.roomCreate")}</button>
                </span>
            </div>
            {/* 내가 연 방 — 참가 목록에는 안 들어간다(내 방엔 내가 못 들어간다). 들어가기·닫기만 준다. */}
            {mine && onEnterMine && (
                <div className="mb-3 rounded-tile border border-surface-line bg-surface-1">
                    <MyRoomRow room={mine} onEnter={onEnterMine} api={api} />
                </div>
            )}
            {q.isPending && <p className="text-[13px] font-medium text-white/60 min-h-11 flex items-center">{t("sim.rooms.loading")}</p>}
            {q.isError && (
                <div className="flex items-center justify-between gap-3 min-h-11">
                    <p className="text-[13px] font-medium text-ink-2">{t("sim.rooms.failed")}</p>
                    <button type="button" onClick={() => { void q.refetch(); }} className={pill}>{t("sim.match.retry")}</button>
                </div>
            )}
            {q.isSuccess && rows.length === 0 && live.length === 0 && (
                <div className="arc-board rounded-[22px] p-5">
                    <p className="text-[16px] font-black text-white">{t("sim.rooms.empty")}</p>
                    <p className="text-[13px] font-medium text-white/70 mt-1">{t("sim.rooms.emptyDesc")}</p>
                </div>
            )}
            {(rows.length > 0 || live.length > 0) && (
                <div>
                    {/* 판과 리본만 아케이드로 — 방 줄은 정보가 많아 담백하게 둔다(2026-09-09 오너: "멀티방은 절반만") */}
                    <div className="relative flex justify-center">
                        <span className="arc-ribbon relative z-[1] inline-flex items-center h-9 px-5 rounded-lg text-white text-[14px] font-black">
                            {t("sim.rooms.title")}
                        </span>
                    </div>
                    <ul
                        className={cn("arc-board rounded-[26px] -mt-4 pt-7 px-3 pb-3 space-y-2", q.isFetching && !q.isPending && "opacity-80")}
                        aria-label={t("sim.rooms.title")}
                    >
                        {rows.map((m) => <Row key={m.id} m={m} age={roomAge(m.createdAt, nowMs, t)} onJoin={setTarget} />)}
                        {onWatch && live.map((c) => <LiveRow key={c.id} c={c} onWatch={onWatch} />)}
                    </ul>
                </div>
            )}
            <JoinDialog room={target} api={api} myHandi={myHandi} onClose={() => setTarget(null)} onOpen={(m) => { setTarget(null); onOpen(m); }} />
        </div>
    );
}

export default RoomList;
