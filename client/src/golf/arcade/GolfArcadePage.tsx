/**
 * 골프 온라인게임(미니골프 대전) 페이지 — /golf/arcade (2026-09-14 오너: "A 먼저, 골프 홈에 온라인게임").
 * 화면: 로비(혼자 · 방 만들기 · 코드 참가) → 대기실(코드·참가자·방장 시작) → 라운드(보드 + 미니 리더보드) → 결과.
 * 서버는 홀별 타수만 받는다(공은 서로 안 부딪힌다). 방 상태는 2초 폴링.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LucideChevronLeft, LucideCopy, LucideUsers } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { RANKUE_PARK, coursePar } from "@shared/golf/courses";
import { toParLabel } from "@shared/golf/course";
import { useMiniGolf } from "./useMiniGolf";
import { MiniGolfBoard } from "./MiniGolfBoard";

const API = "/api/hiq/golf/arcade";
interface RoomPlayer { memberId: string; name: string; strokes: number[]; finishedAt: string | null; joinedAt: string }
interface RoomView { room: { id: string; code: string; hostId: string; courseId: string; status: "waiting" | "playing" | "finished" }; players: RoomPlayer[] }

type Screen = { kind: "lobby" } | { kind: "solo" } | { kind: "room"; id: string };

export default function GolfArcadePage() {
    const [, setLocation] = useLocation();
    const { member } = useAuth();
    const { toast } = useToast();
    const qc = useQueryClient();
    const [screen, setScreen] = useState<Screen>({ kind: "lobby" });
    const [code, setCode] = useState("");

    // 새로고침·재진입: 내가 들어가 있던 방이 있으면 이어서
    const { data: mine, isFetched } = useQuery<RoomView | null>({ queryKey: [`${API}/rooms/mine`], queryFn: async () => apiRequest(`${API}/rooms/mine`), enabled: !!member, staleTime: 0 });
    useEffect(() => { if (screen.kind === "lobby" && mine?.room) setScreen({ kind: "room", id: mine.room.id }); }, [mine, screen.kind]);

    const create = useMutation({
        mutationFn: async () => apiRequest(`${API}/rooms`, { method: "POST", body: { courseId: "rankue-park" } }) as Promise<RoomView>,
        onSuccess: (v) => { qc.setQueryData([`${API}/rooms/${v.room.id}`], v); setScreen({ kind: "room", id: v.room.id }); },
        onError: (e: any) => toast({ title: e?.message || "방을 만들지 못했어요", variant: "destructive" }),
    });
    const join = useMutation({
        mutationFn: async () => apiRequest(`${API}/rooms/join`, { method: "POST", body: { code } }) as Promise<RoomView>,
        onSuccess: (v) => { qc.setQueryData([`${API}/rooms/${v.room.id}`], v); setScreen({ kind: "room", id: v.room.id }); },
        onError: (e: any) => toast({ title: e?.message || "참가하지 못했어요", variant: "destructive" }),
    });

    if (screen.kind === "solo") return <Round mode="solo" onExit={() => setScreen({ kind: "lobby" })} />;
    if (screen.kind === "room") return <RoomScreen id={screen.id} onExit={() => { qc.removeQueries({ queryKey: [`${API}/rooms/mine`] }); setScreen({ kind: "lobby" }); }} />;

    return (
        <div className="min-h-screen bg-[#0A0A0A] text-white p-6 pb-16 font-sans">
            <Header title="온라인 골프" onBack={() => setLocation("/dashboard")} />
            <div className="rounded-[2rem] bg-gradient-to-br from-[#64DD17] to-[#388E3C] p-6 mb-4 text-[#051907]">
                <div className="text-[11px] font-extrabold tracking-[0.2em] opacity-70">MINI GOLF · 9 HOLES</div>
                <h2 className="text-[28px] font-extrabold leading-tight mt-1">랭큐 파크</h2>
                <p className="text-[13px] font-semibold opacity-75 mt-1">파 {coursePar(RANKUE_PARK)} · 당기고 놓으면 샷 · 벽·범퍼 반사</p>
            </div>
            <button onClick={() => setScreen({ kind: "solo" })} className="w-full h-14 rounded-2xl bg-white/[0.06] border border-white/10 text-[15px] font-bold mb-3 active:scale-[0.99]">🏌️ 혼자 연습</button>
            <button onClick={() => create.mutate()} disabled={!member || create.isPending} className="w-full h-14 rounded-2xl bg-[#64DD17] text-[#051907] text-[15px] font-extrabold mb-3 disabled:opacity-50 active:scale-[0.99]">
                {create.isPending ? "만드는 중…" : "⛳ 방 만들기 (최대 6명)"}
            </button>
            <div className="flex gap-2">
                <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" placeholder="6자리 코드" className="flex-1 h-14 rounded-2xl bg-white/[0.06] border border-white/10 px-4 text-[18px] font-bold tracking-[0.3em] text-center placeholder:tracking-normal placeholder:text-white/30 outline-none" />
                <button onClick={() => join.mutate()} disabled={!member || code.length !== 6 || join.isPending} className="h-14 px-5 rounded-2xl bg-white/[0.1] text-[14px] font-bold disabled:opacity-40">참가</button>
            </div>
            {!member && <p className="text-[12px] text-white/50 mt-3">로그인하면 방을 만들고 참가할 수 있어요. 혼자 연습은 바로 됩니다.</p>}
            {member && isFetched && !mine && <p className="text-[12px] text-white/40 mt-3">친구에게 코드를 보내면 같은 코스를 동시에 칩니다. 공은 서로 안 부딪혀요.</p>}
        </div>
    );
}

function Header({ title, onBack, right }: { title: string; onBack: () => void; right?: React.ReactNode }) {
    return (
        <div className="flex items-center gap-3 mb-5">
            <button onClick={onBack} className="w-10 h-10 rounded-full bg-white/[0.06] flex items-center justify-center" aria-label="뒤로"><LucideChevronLeft className="w-5 h-5" /></button>
            <h1 className="text-[20px] font-extrabold flex-1">{title}</h1>
            {right}
        </div>
    );
}

/* ── 대기실 + 방 라운드 ── */
function RoomScreen({ id, onExit }: { id: string; onExit: () => void }) {
    const { member } = useAuth();
    const { toast } = useToast();
    const qc = useQueryClient();
    const { data, error } = useQuery<RoomView>({
        queryKey: [`${API}/rooms/${id}`],
        queryFn: async () => apiRequest(`${API}/rooms/${id}`),
        refetchInterval: (q) => (q.state.data?.room.status === "finished" ? false : 2000),
        retry: false,
    });
    useEffect(() => { if (error) { toast({ title: (error as any)?.message || "방을 불러오지 못했어요", variant: "destructive" }); onExit(); } }, [error, onExit, toast]);

    const start = useMutation({ mutationFn: async () => apiRequest(`${API}/rooms/${id}/start`, { method: "POST" }), onSuccess: (v) => qc.setQueryData([`${API}/rooms/${id}`], v), onError: (e: any) => toast({ title: e?.message, variant: "destructive" }) });
    const leave = useMutation({ mutationFn: async () => apiRequest(`${API}/rooms/${id}/leave`, { method: "POST" }), onSettled: onExit });

    if (!data) return <div className="min-h-screen bg-[#0A0A0A] text-white/60 flex items-center justify-center">불러오는 중…</div>;
    const isHost = data.room.hostId === member?.id;
    const me = data.players.find((p) => p.memberId === member?.id);

    if (data.room.status === "waiting") {
        return (
            <div className="min-h-screen bg-[#0A0A0A] text-white p-6 pb-16 font-sans">
                <Header title="대기실" onBack={() => leave.mutate()} />
                <div className="rounded-[2rem] bg-white/[0.04] border border-white/10 p-6 text-center mb-4">
                    <div className="text-[11px] font-extrabold tracking-[0.2em] text-white/50">ROOM CODE</div>
                    <div className="text-[44px] font-extrabold tracking-[0.25em] text-[#64DD17] mt-1 tabular-nums">{data.room.code}</div>
                    <button onClick={() => { navigator.clipboard?.writeText(data.room.code).then(() => toast({ title: "코드를 복사했어요" })); }} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-white/[0.08] text-[12.5px] font-bold mt-2"><LucideCopy className="w-3.5 h-3.5" /> 복사</button>
                    <p className="text-[12px] text-white/45 mt-3">친구가 골프 홈 → 온라인게임 → 코드 참가로 들어옵니다</p>
                </div>
                <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-4 mb-4">
                    <div className="flex items-center gap-2 text-[12px] font-bold text-white/60 mb-2"><LucideUsers className="w-4 h-4" /> 참가자 {data.players.length}/6</div>
                    {data.players.map((p) => (
                        <div key={p.memberId} className="flex items-center gap-2 py-1.5 text-[14px] font-semibold">
                            <span className="w-7 h-7 rounded-full bg-[#64DD17]/20 text-[#64DD17] text-[12px] font-bold flex items-center justify-center">{p.name.charAt(0)}</span>
                            {p.name}{p.memberId === data.room.hostId && <span className="text-[10px] font-bold text-white/40">방장</span>}
                        </div>
                    ))}
                </div>
                {isHost
                    ? <button onClick={() => start.mutate()} disabled={start.isPending} className="w-full h-14 rounded-2xl bg-[#64DD17] text-[#051907] text-[15px] font-extrabold disabled:opacity-50">시작하기</button>
                    : <p className="text-center text-[13px] text-white/50">방장이 시작하길 기다리는 중…</p>}
            </div>
        );
    }

    return <Round mode="room" room={data} me={me} onExit={onExit} onHoleDone={async (hole, strokes) => {
        try { const v = await apiRequest(`${API}/rooms/${id}/hole`, { method: "POST", body: { hole, strokes } }); qc.setQueryData([`${API}/rooms/${id}`], v); } catch { /* 폴링이 다음에 맞춘다 */ }
    }} />;
}

/* ── 라운드(혼자·방 공용) ── */
function Round({ mode, room, me, onExit, onHoleDone }: { mode: "solo" | "room"; room?: RoomView; me?: RoomPlayer; onExit: () => void; onHoleDone?: (hole: number, strokes: number) => void }) {
    const course = RANKUE_PARK;
    const game = useMiniGolf(course, onHoleDone);
    const { state } = game;
    const holeDone = state.results.length;
    const vibrate = useRef(0);
    useEffect(() => {
        const ev = state.lastEvents;
        if (!ev.length || !("vibrate" in navigator)) return;
        const now = Date.now();
        if (now - vibrate.current < 80) return;
        if (ev.some((e) => e.kind === "cup")) { navigator.vibrate?.([30, 40, 60]); vibrate.current = now; }
        else if (ev.some((e) => e.kind === "wall" || e.kind === "bumper")) { navigator.vibrate?.(12); vibrate.current = now; }
    }, [state.lastEvents]);

    const board = useMemo(() => (
        <MiniGolfBoard hole={state.hole} ballRef={game.ballRef} phase={state.phase} tickCount={game.tickCount} onShoot={game.shoot} onFrame={game.tick} />
    ), [state.hole, state.phase, game.tickCount, game.shoot, game.tick, game.ballRef]);

    // 방 모드: 이미 서버에 기록된 홀이 있으면(새로고침) 그 자리까지 건너뛴다 — 단순화를 위해 1차는 처음부터
    const others = (room?.players ?? []).filter((p) => p.memberId !== me?.memberId);
    const standing = (room?.players ?? []).map((p) => ({ ...p, total: p.strokes.reduce((s, v) => s + v, 0), par: course.holes.slice(0, p.strokes.length).reduce((s, h) => s + h.par, 0) }))
        .sort((a, b) => (a.total - a.par) - (b.total - b.par) || b.strokes.length - a.strokes.length);

    if (state.phase === "done" || (mode === "room" && room?.room.status === "finished" && me?.finishedAt)) {
        const total = game.total, par = coursePar(course);
        return (
            <div className="min-h-screen bg-[#0A0A0A] text-white p-6 pb-16 font-sans">
                <Header title="라운드 결과" onBack={onExit} />
                <div className="rounded-[2rem] bg-gradient-to-br from-[#64DD17] to-[#388E3C] p-6 text-[#051907] mb-4">
                    <div className="text-[11px] font-extrabold tracking-[0.2em] opacity-70">TOTAL</div>
                    <div className="flex items-end gap-3 mt-1"><span className="text-[48px] font-extrabold leading-none tabular-nums">{total}</span><span className="text-[20px] font-extrabold mb-1">{toParLabel(total, par)}</span></div>
                    <div className="flex flex-wrap gap-1.5 mt-3">
                        {state.results.map((r, i) => <span key={i} className={cn("h-7 min-w-7 px-2 rounded-full text-[12px] font-extrabold flex items-center justify-center", r < course.holes[i].par ? "bg-[#051907] text-[#64DD17]" : r === course.holes[i].par ? "bg-black/15" : "bg-white/40")}>{r}</span>)}
                    </div>
                </div>
                {mode === "room" && room && (
                    <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-4 mb-4">
                        <div className="text-[12px] font-bold text-white/60 mb-2">리더보드 {room.room.status !== "finished" && <span className="text-white/35">· 아직 치는 중인 사람이 있어요</span>}</div>
                        {standing.map((p, i) => (
                            <div key={p.memberId} className={cn("flex items-center gap-3 py-2 text-[14px] font-semibold", p.memberId === me?.memberId && "text-[#64DD17]")}>
                                <span className="w-6 text-center text-[15px]">{["🥇", "🥈", "🥉"][i] ?? i + 1}</span>
                                <span className="flex-1 truncate">{p.name}</span>
                                <span className="text-[12px] text-white/50">{p.strokes.length}/{course.holes.length}홀</span>
                                <span className="tabular-nums font-extrabold">{p.total} <span className="text-white/60">{toParLabel(p.total, p.par)}</span></span>
                            </div>
                        ))}
                    </div>
                )}
                <button onClick={mode === "solo" ? game.restart : onExit} className="w-full h-14 rounded-2xl bg-[#64DD17] text-[#051907] text-[15px] font-extrabold">{mode === "solo" ? "다시 한 판" : "나가기"}</button>
            </div>
        );
    }

    return (
        <div className="h-[100dvh] bg-[#0A0A0A] text-white flex flex-col font-sans overflow-hidden">
            {/* HUD */}
            <div className="flex items-center gap-2 px-4 pt-3 pb-2">
                <button onClick={onExit} className="w-9 h-9 rounded-full bg-white/[0.06] flex items-center justify-center shrink-0" aria-label="나가기"><LucideChevronLeft className="w-5 h-5" /></button>
                <div className="flex-1 min-w-0">
                    <div className="text-[15px] font-extrabold leading-tight">{state.holeIndex + 1}번 홀 <span className="text-white/50 font-bold">· 파 {state.hole.par} · {state.hole.name}</span></div>
                    <div className="text-[11.5px] text-white/45 truncate">{state.hole.hint}</div>
                </div>
                <div className="text-right shrink-0">
                    <div className="text-[22px] font-extrabold leading-none tabular-nums">{state.strokes}<span className="text-[12px] text-white/50 ml-0.5">타</span></div>
                    <div className="text-[11px] font-bold text-[#64DD17] tabular-nums">{holeDone ? `${game.total} (${toParLabel(game.total, game.parSoFar)})` : `${holeDone}/${course.holes.length}`}</div>
                </div>
            </div>
            <div className="flex-1 min-h-0 px-3 pb-2 relative">
                {board}
                {state.badge && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className={cn("px-6 py-3 rounded-full text-[26px] font-extrabold shadow-2xl", state.phase === "holed" ? "bg-[#64DD17] text-[#051907]" : "bg-black/70 text-white")}>{state.badge}</div>
                    </div>
                )}
            </div>
            {mode === "room" && others.length > 0 && (
                <div className="px-4 pb-3 flex gap-2 overflow-x-auto scrollbar-hide">
                    {standing.map((p) => (
                        <div key={p.memberId} className={cn("shrink-0 flex items-center gap-1.5 h-8 px-3 rounded-full text-[12px] font-bold", p.memberId === me?.memberId ? "bg-[#64DD17]/20 text-[#64DD17]" : "bg-white/[0.06] text-white/80")}>
                            <span className="truncate max-w-[72px]">{p.name}</span>
                            <span className="text-white/45">{p.strokes.length}H</span>
                            <span className="tabular-nums">{p.strokes.length ? toParLabel(p.total, p.par) : "–"}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
