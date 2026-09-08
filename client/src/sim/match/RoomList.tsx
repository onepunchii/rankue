/**
 * 멀티방 목록(2026-09-08 오너: "멀티방은 다른 카드로"). GET /sim/rooms — 공개·대기 중·내 방 아님·24시간 이내, 10 s 폴링.
 * 행: 방장 · 종목/테이블 · 다마수 · 리얼리티 칩 · 비밀번호 칩 · 만든 지 n분 · "참가". 참가 → 다이얼로그(내 다마수 · 비밀번호) → POST /sim/matches/:id/join → onOpen(playing).
 * 화면의 초록은 다이얼로그의 "참가" 하나. 목록의 참가 버튼은 테두리 알약.
 */
import { memo, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { matchApi as defaultApi, matchErrorCode, type MatchApi, type MatchPublic } from "../matchApi";
import { gameLabel, rulesLabel, inningCapLabel } from "./matchView";
import { isValidTarget } from "../setupPresets";
import { TargetPicker } from "./MatchLobby";

export const ROOMS_QUERY_KEY = ["sim-rooms"] as const;
export const ROOMS_REFETCH_MS = 10_000;

export interface RoomListProps {
    /** 참가가 끝나 playing 이 된 대전 — 페이지가 actions.startMatch 로 연다 */
    onOpen: (m: MatchPublic) => void;
    onCreate: () => void;
    onClose: () => void;
    api?: MatchApi;
    /** 내 실전 핸디(있으면 다마수 기본값) */
    myHandi?: { handi3c: number | null; handi4c: number | null };
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
                    <span className="text-[11px] font-medium text-ink-4 shrink-0">{age}</span>
                </span>
                <span className="text-[12px] font-medium text-ink-3 truncate">
                    {gameLabel(m, t)} · {t("sim.rooms.target").replace("{n}", String(m.hostTarget))}
                </span>
                {(m.aimAssist === false || m.hasPassword) && (
                    <span className="flex flex-wrap gap-1">
                        {m.aimAssist === false && <span className="rk-chip bg-surface-3 text-ink-2">{t("sim.setup.modeReality")}</span>}
                        {m.hasPassword && <span className="rk-chip bg-surface-3 text-ink-2">{t("sim.rooms.locked")}</span>}
                    </span>
                )}
            </span>
            <button type="button" onClick={() => onJoin(m)} className={pill} aria-label={`${t("sim.rooms.join")} · ${m.hostName}`}>
                {t("sim.rooms.join")}
            </button>
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
    const ok = !!room && isValidTarget(targetNum) && (!room.hasPassword || password !== "");
    const join = async () => {
        if (!room || !ok || joining) return;
        setJoining(true);
        setError(null);
        try {
            const m = await api.joinRoom(room.id, targetNum, room.hasPassword ? password : undefined);
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
                            <div className="flex items-baseline justify-between gap-2">
                                <span className="text-[12px] font-medium text-ink-4">{t("sim.match.hostTarget")}</span>
                                <span className="rk-num text-[14px] font-semibold text-ink-1">{room.hostTarget}</span>
                            </div>
                            <div className="flex items-baseline justify-between gap-2">
                                <span className="text-[12px] font-medium text-ink-4">{t("sim.setup.mode")}</span>
                                <span className="text-[13px] font-semibold text-ink-2">{room.aimAssist === false ? t("sim.setup.modeReality") : t("sim.setup.modeNormal")}</span>
                            </div>
                        </div>
                        <TargetPicker id="sim-room-target" gameType={room.gameType} text={targetText} onText={setTargetText} label={t("sim.match.myTarget")} />
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

export function RoomList({ onOpen, onCreate, onClose, api = defaultApi, myHandi, now = Date.now }: RoomListProps) {
    const { t } = useT();
    const q = useQuery({ queryKey: ROOMS_QUERY_KEY, queryFn: () => api.listRooms(), staleTime: 0, refetchInterval: ROOMS_REFETCH_MS });
    const [target, setTarget] = useState<MatchPublic | null>(null);
    const nowMs = now();
    const rows = useMemo(() => q.data ?? [], [q.data]);
    return (
        <div className="w-full max-w-[420px] mx-auto px-5 pt-4 pb-8">
            <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0">
                    <h1 className="text-[20px] font-bold text-ink-1 leading-tight">{t("sim.rooms.title")}</h1>
                    <p className="text-[12.5px] font-medium text-ink-3 mt-0.5">{t("sim.rooms.sub")}</p>
                </div>
                <button type="button" onClick={onClose} className="h-11 px-4 shrink-0 rounded-pill border border-surface-line text-[13px] font-semibold text-ink-2 active:bg-surface-3">
                    {t("sim.common.close")}
                </button>
            </div>
            <div className="flex items-center justify-between gap-2 mb-3">
                <span className="rk-num text-[13px] font-semibold text-ink-2">{t("sim.entry.roomsOpen")} {rows.length}</span>
                <button type="button" onClick={onCreate} className={pill}>{t("sim.entry.roomCreate")}</button>
            </div>
            {q.isPending && <p className="text-[13px] font-medium text-ink-4 min-h-11 flex items-center">{t("sim.rooms.loading")}</p>}
            {q.isError && (
                <div className="flex items-center justify-between gap-3 min-h-11">
                    <p className="text-[13px] font-medium text-ink-2">{t("sim.rooms.failed")}</p>
                    <button type="button" onClick={() => { void q.refetch(); }} className={pill}>{t("sim.match.retry")}</button>
                </div>
            )}
            {q.isSuccess && rows.length === 0 && (
                <div className="rounded-card border border-surface-line bg-surface-1 rk-shadow p-5">
                    <p className="text-[16px] font-bold text-ink-1">{t("sim.rooms.empty")}</p>
                    <p className="text-[13px] font-medium text-ink-3 mt-1">{t("sim.rooms.emptyDesc")}</p>
                </div>
            )}
            <ul className={cn("space-y-2", q.isFetching && !q.isPending && "opacity-80")} aria-label={t("sim.rooms.title")}>
                {rows.map((m) => <Row key={m.id} m={m} age={roomAge(m.createdAt, nowMs, t)} onJoin={setTarget} />)}
            </ul>
            <JoinDialog room={target} api={api} myHandi={myHandi} onClose={() => setTarget(null)} onOpen={(m) => { setTarget(null); onOpen(m); }} />
        </div>
    );
}

export default RoomList;
