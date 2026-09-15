/**
 * 관전 · 다시보기 화면(2026-09-12 오너 요청 → 2026-09-13 "호스트나 참여자처럼 보이는데 보기만 가능한 권한").
 *
 * **선수 화면과 같은 부품**으로 짓는다 — 머리줄(TopBar: 규칙 칩·점수·차례·40초 시계·관전자 수), 이닝 시트,
 * 같은 렌더러(Canvas2D → 가능하면 3D). 다른 점은 조작이 없다는 것뿐이다: 조준선·큐대·세기 레일·샷 버튼·기권이 없고
 * 나가기만 있다.
 *
 * 선수용 코드(SimulatorPage·simController)는 건드리지 않는다. 그쪽은 "나는 선수다" 를 전제로 돌아가서
 * 관전 모드를 끼워 넣으면 실제 대전이 위험하다 — 부품을 같이 쓰되 화면은 따로 둔다(2026-09-13 오너와 합의).
 *
 * 어떻게 그리나: 서버가 샷마다 '샷 직전 배치(preState) + 입력(input)' 을 남긴다. 그걸 받아 **로컬에서 다시 시뮬레이션**해
 * 궤적을 얻고 재생한다(선수 화면이 상대 샷을 받아 보는 방식과 같다). 서버에 영상이나 좌표를 더 얹지 않는다.
 *
 * 진행 중(live): WATCH_POLL_MS 마다 상태를 받아 새 샷이 있으면 이어서 재생한다. 상대가 조준하는 동안에는
 * 화면이 멈춰 있는 게 아니라 "○○님 차례 · 40초" 가 돈다 — 그게 없으면 끝난 판을 보는 것처럼 느껴진다(오너 제보).
 * 끝난 대전(다시보기): 샷을 한 번에 받아 두고 재생·다음 샷·처음부터·배속으로 본다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { simulateShot } from "@shared/sim/simulate";
import type { BallState, SimResult } from "@shared/sim/types";
import { SHOT_CLOCK_S, type SessionState, type ShotOutcome } from "@shared/sim/rules";
import { Canvas2DRenderer } from "../render/Canvas2DRenderer";
import type { Renderer, RendererView, SafeInsets } from "../render/Renderer";
import { readZoomPref, safeLocalStorage, selectRendererKind, type RendererKind } from "../render/rendererChoice";
import { matchApi, matchConfig, type MatchPublic, type MatchShot } from "../matchApi";
import { paramsFromConfig } from "../simReducer";
import { effectiveBall, makePlayback, startClock, clockTime, type Playback, type PlaybackClock } from "../playback";
import { TopBar } from "../components/TopBar";
import { ShotClock } from "../components/ShotClock";
import { InningSheet } from "../components/InningSheet";
import { appendShot, EMPTY_LOG, type InningLog } from "../inningLog";
import { matchParamsKey, nextPollMs, normalizeShots, planWatch, shouldSkipAnimation } from "./watchPlan";

const INSETS: SafeInsets = { top: 8, right: 8, bottom: 8, left: 8 };
const SPEEDS = [1, 2, 4] as const;
type Speed = typeof SPEEDS[number];

/** 저장된 샷 한 줄 → 이닝 표가 아는 모양. 이닝을 소모했는지는 다음 샷이 누구 차례였는지로 안다(서버가 따로 안 적는다). */
function outcomeOf(s: MatchShot, next: MatchShot | undefined, sessionTurn: number): ShotOutcome {
    const consumesInning = next ? next.playerIndex !== s.playerIndex : sessionTurn !== s.playerIndex;
    return {
        code: s.outcomeCode as ShotOutcome["code"],
        points: s.points,
        scored: s.points > 0,
        consumesInning,
        cushionsBeforeSecond: s.cushions ?? 0,
        cushionsBeforeFirst: 0,
        contacts: [],
        kisses: 0,
    } as ShotOutcome;
}

export default function WatchPage({ matchId }: { matchId: string }) {
    const [, navigate] = useLocation();
    const { t } = useT();
    const [match, setMatch] = useState<MatchPublic | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [playedShots, setPlayedShots] = useState(0);
    const [animating, setAnimating] = useState(false);
    const [speed, setSpeed] = useState<Speed>(1);
    const [replayShots, setReplayShots] = useState<readonly MatchShot[]>([]);
    const [autoPlay, setAutoPlay] = useState(false);
    const [log, setLog] = useState<InningLog>(EMPTY_LOG);
    const [sheetOpen, setSheetOpen] = useState(false);
    const [view, setView] = useState<RendererView>("top");
    const [viewSupported, setViewSupported] = useState(false);

    const tableRef = useRef<HTMLDivElement | null>(null);
    const rendererRef = useRef<Renderer | null>(null);
    const ballsRef = useRef<readonly BallState[]>([]);
    const dirtyRef = useRef(true);
    const animRef = useRef<{ pb: Playback; clock: PlaybackClock; cueBallId: string; phi: number; done: () => void } | null>(null);
    const aliveRef = useRef(true);
    const speedRef = useRef<Speed>(1);
    speedRef.current = speed;
    const viewRef = useRef<RendererView>("top");
    viewRef.current = view;
    const aimRef = useRef<{ cueBallId: string; phi: number }>({ cueBallId: "white", phi: Math.PI / 2 });
    const rendererKindRef = useRef<RendererKind | null>(null);
    if (rendererKindRef.current === null) rendererKindRef.current = selectRendererKind();

    const finished = match?.status === "finished";
    // ⚠️ [match] 를 의존성으로 두면 안 된다 — 폴링이 2초마다 새 객체를 주어 params 가 바뀌고, 렌더러 effect([params])가
    // 재마운트되며 재생 중인 샷을 끊었다(공 순간이동). 설정값 키가 같으면 같은 객체를 유지한다.
    const paramsKey = matchParamsKey(match);
    const matchRef = useRef(match);
    matchRef.current = match;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const config = useMemo(() => (matchRef.current ? matchConfig(matchRef.current) : null), [paramsKey]);
    const params = useMemo(() => (config ? paramsFromConfig(config) : null), [config]);
    const session = (match?.state as SessionState | null) ?? null;
    const names = useMemo(() => [match?.hostName || t("sim.watch.host"), match?.guestName || t("sim.watch.guest")], [match, t]);

    /* ── 렌더러: 선수 화면과 같은 것을 쓴다. Canvas2D 를 먼저 올리고, 3D 가 되는 기기면 바꿔 끼운다. ── */
    useEffect(() => {
        const el = tableRef.current;
        if (!el || !params) return;
        let alive = true;
        const mount2d = (): Renderer => {
            const r = new Canvas2DRenderer({ insets: INSETS });
            r.mount(el, params.table);
            return r;
        };
        let renderer: Renderer = mount2d();
        rendererRef.current = renderer;
        dirtyRef.current = true;
        if (rendererKindRef.current === "three") {
            void import("../render/ThreeRenderer").then(({ ThreeRenderer }) => {
                if (!alive) return;
                let three: InstanceType<typeof ThreeRenderer> | null = null;
                try {
                    three = new ThreeRenderer({ insets: INSETS });
                    three.mount(el, params.table);
                } catch {
                    try { three?.dispose(); } catch { /* 이미 망가진 상태 */ }
                    return;   // WebGL2 를 못 열었다 — canvas 로 계속한다
                }
                rendererRef.current?.dispose();
                rendererRef.current = three;
                three.setView(viewRef.current);
                three.setZoom?.(readZoomPref(safeLocalStorage()));
                setViewSupported(true);
                dirtyRef.current = true;
            }).catch(() => { /* 청크 로드 실패 — canvas 유지 */ });
        }
        let raf = requestAnimationFrame(function loop() {
            raf = requestAnimationFrame(loop);
            const r = rendererRef.current;
            if (!r) return;
            const anim = animRef.current;
            if (anim) {
                const tt = clockTime(anim.clock, performance.now());
                ballsRef.current = anim.pb.at(tt);
                dirtyRef.current = true;
                if (tt >= anim.pb.duration) { animRef.current = null; anim.done(); }
            }
            if (!dirtyRef.current && !(r.needsFrame?.() ?? false)) return;
            dirtyRef.current = false;
            const aim = animRef.current ?? aimRef.current;
            r.draw({
                balls: ballsRef.current,
                highlightBallId: aim.cueBallId,
                view: { cueBallId: aim.cueBallId, phi: aim.phi, mode: animRef.current ? "overview" : "follow" },
            });
        });
        // 재생 중에 화면이 가려지면 프레임이 멈춰 영영 안 끝난다 — 마지막 상태로 붙이고 끝낸 것으로 친다.
        const onVisibility = () => {
            const a = animRef.current;
            if (!document.hidden || !a) return;
            ballsRef.current = a.pb.at(a.pb.duration);
            dirtyRef.current = true;
            animRef.current = null;
            a.done();
        };
        document.addEventListener("visibilitychange", onVisibility);
        return () => {
            alive = false;
            document.removeEventListener("visibilitychange", onVisibility);
            cancelAnimationFrame(raf);
            animRef.current?.done?.();
            animRef.current = null;
            rendererRef.current?.dispose();
            rendererRef.current = null;
        };
    }, [params]);

    useEffect(() => {
        aliveRef.current = true;
        return () => { aliveRef.current = false; };
    }, []);

    const toggleView = () => {
        const next: RendererView = view === "top" ? "player" : "top";
        setView(next);
        rendererRef.current?.setView?.(next);
        dirtyRef.current = true;
    };

    /* ── 샷 하나를 재생한다(재시뮬 → 궤적). 가려져 있거나 밀렸으면 결과 배치로 바로 붙인다. ── */
    const playShot = useCallback(async (s: MatchShot, next: MatchShot | undefined, sessionTurn: number, skip: boolean): Promise<void> => {
        if (!params) return;
        let result: SimResult;
        try {
            result = simulateShot(s.preState as BallState[], s.input, params);
        } catch {
            return;   // 엔진 버전이 달라 재시뮬이 안 되는 옛 대전 — 그 샷은 건너뛴다
        }
        aimRef.current = { cueBallId: s.input.cueBallId, phi: s.input.phi };
        setLog((l) => appendShot(l, outcomeOf(s, next, sessionTurn), { ...(session ?? {} as SessionState), turn: sessionTurn } as SessionState, s.playerIndex));
        const hidden = typeof document !== "undefined" && document.hidden;
        if (skip || hidden) {
            ballsRef.current = result.final;
            dirtyRef.current = true;
            return;
        }
        const pb = makePlayback(result, effectiveBall(params));
        await new Promise<void>((resolve) => {
            let settled = false;
            const done = () => { if (!settled) { settled = true; resolve(); } };
            animRef.current = { pb, clock: startClock(performance.now(), speedRef.current), cueBallId: s.input.cueBallId, phi: s.input.phi, done };
        });
        ballsRef.current = result.final;
        dirtyRef.current = true;
    }, [params, session]);

    const playList = useCallback(async (list: readonly MatchShot[], all: readonly MatchShot[], sessionTurn: number) => {
        if (list.length === 0) return;
        setAnimating(true);
        const skipUntil = shouldSkipAnimation(list.length) ? list.length - 1 : 0;
        for (let i = 0; i < list.length; i++) {
            if (!aliveRef.current) break;
            const s = list[i];
            await playShot(s, all[s.idx + 1] ?? list[i + 1], sessionTurn, i < skipUntil);
            setPlayedShots(s.idx + 1);
        }
        setAnimating(false);
    }, [playShot]);

    /* ── 처음 열 때: 지금 배치부터 보여 준다(진행 중이면 여태 친 결과가 이미 반영된 배치다). ── */
    useEffect(() => {
        let alive = true;
        matchApi.getMatch(matchId).then((m) => {
            if (!alive) return;
            setMatch(m);
            if (m.balls) { ballsRef.current = m.balls; dirtyRef.current = true; }
            setPlayedShots(m.shots);
        }).catch(() => { if (alive) setError(t("sim.watch.gone")); });
        return () => { alive = false; };
    }, [matchId, t]);

    /* ── 진행 중: 폴링 → 새 샷이 있으면 이어 재생 ── */
    useEffect(() => {
        if (!match || match.status !== "playing") return;
        let alive = true;
        let timer: ReturnType<typeof setTimeout> | null = null;
        const tick = async () => {
            if (!alive) return;
            const delay = nextPollMs(match.status, document.visibilityState === "visible");
            if (delay === null) { timer = setTimeout(tick, 2000); return; }   // 가려진 동안은 가볍게 되돌아온다
            try {
                const m = await matchApi.getMatch(matchId);
                if (!alive) return;
                setMatch(m);
                const plan = planWatch({ serverShots: m.shots, playedShots, animating });
                if (plan.kind === "fetch") {
                    const shots = await matchApi.getShots(matchId, plan.from);
                    if (!alive) return;
                    const list = normalizeShots(shots, plan.from);
                    await playList(list, list, (m.state as SessionState | null)?.turn ?? 0);
                } else if (!animating && m.balls && m.shots === playedShots) {
                    ballsRef.current = m.balls; dirtyRef.current = true;      // 시간 초과 등 샷 없는 변화
                }
            } catch { /* 일시적 오류 — 다음 주기에 다시 */ }
            if (alive) timer = setTimeout(tick, delay);
        };
        timer = setTimeout(tick, nextPollMs(match.status, true) ?? 2000);
        return () => { alive = false; if (timer) clearTimeout(timer); };
    }, [match, matchId, playedShots, animating, playList]);

    /* ── 끝난 대전: 샷을 통째로 받아 두고 직접 넘겨 본다 ── */
    useEffect(() => {
        if (!finished || replayShots.length > 0) return;
        let alive = true;
        matchApi.getShots(matchId, 0).then((shots) => {
            if (!alive) return;
            const list = normalizeShots(shots, 0);
            setReplayShots(list);
            if (list.length > 0) {
                ballsRef.current = list[0].preState as BallState[];
                aimRef.current = { cueBallId: list[0].input.cueBallId, phi: list[0].input.phi };
                dirtyRef.current = true;
                setPlayedShots(0);
                setLog(EMPTY_LOG);
            }
        }).catch(() => { /* 목록 없이도 결과 화면은 보인다 */ });
        return () => { alive = false; };
    }, [finished, matchId, replayShots.length]);

    /* ── 다시보기 자동 재생 ── */
    useEffect(() => {
        if (!autoPlay || animating || !finished) return;
        const next = replayShots[playedShots];
        if (!next) { setAutoPlay(false); return; }
        let alive = true;
        void (async () => { if (alive) await playList([next], replayShots, session?.turn ?? 0); })();
        return () => { alive = false; };
    }, [autoPlay, animating, finished, replayShots, playedShots, playList, session]);

    const restart = () => {
        if (replayShots.length === 0) return;
        setAutoPlay(false);
        animRef.current = null;
        ballsRef.current = replayShots[0].preState as BallState[];
        dirtyRef.current = true;
        setPlayedShots(0);
        setLog(EMPTY_LOG);
    };

    /* ── 40초 시계: 선수 화면과 같은 계산(서버가 적은 turnSeenAt 부터, 서버 시각 보정) ── */
    const seenAt = match?.status === "playing" && match.turnSeenAt ? Date.parse(match.turnSeenAt) : 0;
    const clockOn = seenAt > 0 && Number.isFinite(seenAt) && !animating;
    const [clockNow, setClockNow] = useState(() => Date.now());
    useEffect(() => {
        if (!clockOn) return;
        setClockNow(Date.now());
        const id = setInterval(() => setClockNow(Date.now()), 250);
        return () => clearInterval(id);
    }, [clockOn, seenAt]);
    const serverOffset = match?.serverNow ? Date.parse(match.serverNow) - clockNow : 0;
    const remaining = clockOn ? SHOT_CLOCK_S - (clockNow + (Number.isFinite(serverOffset) ? 0 : 0) - seenAt) / 1000 : null;
    const clockSeconds = remaining !== null && remaining <= SHOT_CLOCK_S ? Math.max(0, Math.ceil(remaining)) : null;

    if (error) {
        return (
            <div className="min-h-dvh bg-surface-0 flex flex-col items-center justify-center gap-4 px-6 text-center">
                <p className="text-[15px] text-ink-2">{error}</p>
                <button onClick={() => navigate("/online-game?rooms=1")} className="h-11 px-5 rounded-tile bg-brand text-black text-[14px] font-bold">{t("sim.watch.toRooms")}</button>
            </div>
        );
    }
    if (!match) return <div className="min-h-dvh bg-surface-0 flex items-center justify-center text-ink-3 text-[14px]">{t("sim.watch.loading")}</div>;

    const turnName = names[match.turn] ?? "";

    return (
        <div className="h-dvh flex flex-col bg-surface-0">
            {/* 선수 화면과 같은 머리줄 — 규칙 칩·점수·차례·관전자 수. 조작 버튼만 없다. */}
            <TopBar
                session={session} config={config} phase={finished ? "finished" : "waiting"} names={names}
                record={false} offline={false} syncing={false} queued={0}
                onSummary={() => setSheetOpen(true)}
                onBack={() => navigate("/online-game?rooms=1")}
                clock={clockSeconds !== null ? { seconds: clockSeconds, mine: false } : null}
                watchers={match.watchers ?? 0}
                finalInning={(session?.pendingWinner ?? null) !== null}
                hideStatus
            />

            <div ref={tableRef} className="flex-1 min-h-[45vh] relative">
                {/* 3D 보기 토글 — 선수 화면과 같은 시점으로 볼 수 있다(되는 기기에서만) */}
                {viewSupported && (
                    <button
                        type="button" onClick={toggleView}
                        className="absolute top-2 right-2 z-[3] h-9 px-3 rounded-pill bg-surface-1/90 border border-surface-line text-[12px] font-bold text-ink-2"
                    >{view === "top" ? t("sim.watch.view3d") : t("sim.watch.viewTop")}</button>
                )}
                {/* 상대가 조준하는 동안 화면이 멈춘 게 아니라는 표시(2026-09-13 오너: "리플레이처럼 보인다") */}
                {!finished && !animating && (
                    <div className="absolute inset-x-0 bottom-3 z-[3] flex flex-col items-center gap-1.5 px-4 pointer-events-none">
                        <div className="rounded-card bg-surface-1/95 border border-surface-line px-4 py-2.5 text-center">
                            <p className="text-[13px] font-semibold text-ink-1">{t("sim.watch.turnOf").replace("{name}", turnName)}</p>
                            {clockSeconds !== null && <ShotClock seconds={clockSeconds} mine={false} size={44} className="mt-1" />}
                        </div>
                    </div>
                )}
            </div>

            <footer className="shrink-0 px-4 py-3 space-y-2">
                {finished ? (
                    <div className="flex items-center gap-2">
                        <button onClick={restart} className="h-11 px-3 rounded-tile border border-surface-line text-[13px] font-semibold text-ink-2">{t("sim.watch.restart")}</button>
                        <button
                            onClick={() => setAutoPlay((v) => !v)}
                            disabled={replayShots.length === 0 || playedShots >= replayShots.length}
                            className="h-11 flex-1 rounded-tile bg-brand text-brand-fg text-[14px] font-bold disabled:opacity-40"
                        >{autoPlay ? t("sim.watch.pause") : t("sim.watch.play")}</button>
                        <button
                            onClick={() => { setAutoPlay(false); const nx = replayShots[playedShots]; if (nx) void playList([nx], replayShots, session?.turn ?? 0); }}
                            disabled={animating || playedShots >= replayShots.length}
                            className="h-11 px-3 rounded-tile border border-surface-line text-[13px] font-semibold text-ink-2 disabled:opacity-40"
                        >{t("sim.watch.nextShot")}</button>
                        <button
                            onClick={() => setSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length])}
                            className="h-11 px-3 rounded-tile border border-surface-line text-[13px] font-semibold text-ink-2"
                        >{t("sim.watch.speed").replace("{n}", String(speed))}</button>
                    </div>
                ) : (
                    <p className={cn("text-[11px] text-ink-3 text-center")}>
                        {animating ? t("sim.watch.playing") : t("sim.watch.seen").replace("{n}", String(match.shots))}
                    </p>
                )}
                {finished && replayShots.length > 0 && (
                    <p className="text-[11px] text-ink-3 text-center">{t("sim.watch.shotProgress").replace("{a}", String(playedShots)).replace("{b}", String(replayShots.length))}</p>
                )}
            </footer>

            <InningSheet open={sheetOpen} onOpenChange={setSheetOpen} log={log} session={session} names={names} phase={finished ? "finished" : "waiting"} />
        </div>
    );
}
