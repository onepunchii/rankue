/**
 * 관전 · 다시보기 화면(2026-09-12 오너 요청: "게임 시작하면 방이 사라지는데, 관전으로 들어가면 그 경기를 볼 수 있게").
 *
 * 읽기 전용이다 — 조준·샷·40초 시계·이모지가 없다. 그래서 대전 화면(SimulatorPage + simController)을 건드리지 않고
 * 따로 만든다. 선수용 코드에 '관전 모드'를 끼워 넣었다가는 실제 대전이 위험해진다.
 *
 * 어떻게 그리나: 서버가 샷마다 '샷 직전 배치(preState) + 입력(input)' 을 남긴다. 그걸 받아 **로컬에서 다시 시뮬레이션**해
 * 궤적을 얻고 재생한다(선수 화면이 상대 샷을 받아 보는 방식과 같다). 그래서 관전은 서버에 영상이나 좌표를 더 얹지 않는다.
 *
 * 진행 중(live): 4초마다 상태를 받아 새 샷이 있으면 이어서 재생한다. 화면이 가려지면 폴링을 쉰다.
 * 끝난 대전(다시보기): 샷을 한 번에 받아 두고 재생·다음 샷·처음부터·배속으로 본다.
 *
 * 렌더러는 Canvas2D 고정(위에서 보기)이다. 관전은 판을 읽는 화면이고, three.js 청크(~540 kB)를 관전자에게까지
 * 받게 할 이유가 없다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useT } from "@/lib/i18n";
import { simulateShot } from "@shared/sim/simulate";
import type { BallState, SimResult } from "@shared/sim/types";
import type { SessionState } from "@shared/sim/rules";
import { Canvas2DRenderer } from "../render/Canvas2DRenderer";
import type { Renderer, SafeInsets } from "../render/Renderer";
import { matchApi, matchConfig, type MatchPublic, type MatchShot } from "../matchApi";
import { paramsFromConfig } from "../simReducer";
import { effectiveBall, makePlayback, startClock, clockTime, type Playback, type PlaybackClock } from "../playback";
import { nextPollMs, normalizeShots, planWatch, shouldSkipAnimation } from "./watchPlan";

const INSETS: SafeInsets = { top: 8, right: 8, bottom: 8, left: 8 };
const SPEEDS = [1, 2, 4] as const;

type Speed = typeof SPEEDS[number];

function playerLine(m: MatchPublic, i: 0 | 1, fallback: string): { name: string; score: number; target: number; innings: number; highRun: number } {
    const st = m.state as SessionState | null;
    const p = st?.players[i];
    return {
        name: (i === 0 ? m.hostName : m.guestName) || fallback,
        score: p?.score ?? 0,
        target: (i === 0 ? m.hostTarget : m.guestTarget ?? m.hostTarget) ?? 0,
        innings: p?.innings ?? 0,
        highRun: p?.highRun ?? 0,
    };
}

export default function WatchPage({ matchId }: { matchId: string }) {
    const [, navigate] = useLocation();
    const { t } = useT();
    const [match, setMatch] = useState<MatchPublic | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [playedShots, setPlayedShots] = useState(0);
    const [animating, setAnimating] = useState(false);
    const [speed, setSpeed] = useState<Speed>(1);
    const [lastShot, setLastShot] = useState<{ playerIndex: number; points: number; code: string } | null>(null);
    const [replayShots, setReplayShots] = useState<readonly MatchShot[]>([]);
    const [autoPlay, setAutoPlay] = useState(false);

    const tableRef = useRef<HTMLDivElement | null>(null);
    const rendererRef = useRef<Renderer | null>(null);
    const ballsRef = useRef<readonly BallState[]>([]);
    const dirtyRef = useRef(true);
    const animRef = useRef<{ pb: Playback; clock: PlaybackClock; cueBallId: string; done: () => void } | null>(null);
    const aliveRef = useRef(true);
    const speedRef = useRef<Speed>(1);
    speedRef.current = speed;

    const finished = match?.status === "finished";
    const params = useMemo(() => (match ? paramsFromConfig(matchConfig(match)) : null), [match]);

    /* ── 렌더러: 마운트 한 번, rAF 는 필요할 때만 그린다 ── */
    useEffect(() => {
        const el = tableRef.current;
        if (!el || !params) return;
        const r = new Canvas2DRenderer({ insets: INSETS });
        r.mount(el, params.table);
        rendererRef.current = r;
        dirtyRef.current = true;
        let raf = 0;
        const loop = () => {
            raf = requestAnimationFrame(loop);
            const anim = animRef.current;
            if (anim) {
                const t = clockTime(anim.clock, performance.now());
                ballsRef.current = anim.pb.at(t);
                dirtyRef.current = true;
                if (t >= anim.pb.duration) { animRef.current = null; anim.done(); }
            }
            if (!dirtyRef.current) return;
            dirtyRef.current = false;
            r.draw({ balls: ballsRef.current, highlightBallId: anim?.cueBallId });
        };
        raf = requestAnimationFrame(loop);
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
            document.removeEventListener("visibilitychange", onVisibility);
            cancelAnimationFrame(raf);
            animRef.current?.done?.();   // 재생 중에 화면을 떠나면 기다리던 쪽을 풀어 준다(개발 중 HMR 로 모양이 바뀐 옛 값도 안전하게)
            animRef.current = null;
            r.dispose();
            rendererRef.current = null;
        };
    }, [params]);

    // StrictMode(개발)는 마운트 → 정리 → 다시 마운트를 한다. 정리에서 false 로만 두면 두 번째 마운트에서 영영 false 라
    // 재생 루프가 첫 샷 뒤에 멈춘다(2026-09-12 실측: 샷 번호가 0 에서 안 올라갔다). 마운트마다 다시 true 로 둔다.
    useEffect(() => {
        aliveRef.current = true;
        return () => { aliveRef.current = false; };
    }, []);

    /* ── 샷 하나를 재생한다(재시뮬 → 궤적). skip 이면 결과 배치로 바로 붙인다. ── */
    const playShot = useCallback(async (s: MatchShot, skip: boolean): Promise<void> => {
        if (!params) return;
        let result: SimResult;
        try {
            result = simulateShot(s.preState as BallState[], s.input, params);
        } catch {
            return; // 엔진 버전이 달라 재시뮬이 안 되는 옛 대전 — 그 샷은 건너뛴다
        }
        setLastShot({ playerIndex: s.playerIndex, points: s.points, code: s.outcomeCode });
        // 화면이 가려져 있으면(다른 앱·다른 탭) 브라우저가 requestAnimationFrame 을 멈춘다 — 궤적을 그려도 아무도 못 보고,
        // 재생이 끝나지 않아 다음 샷으로 넘어가지도 못한다. 그럴 땐 결과 배치로 바로 붙인다.
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
            animRef.current = { pb, clock: startClock(performance.now(), speedRef.current), cueBallId: s.input.cueBallId, done };
        });
        ballsRef.current = result.final;
        dirtyRef.current = true;
    }, [params]);

    const playList = useCallback(async (list: readonly MatchShot[]) => {
        if (list.length === 0) return;
        setAnimating(true);
        const skipUntil = shouldSkipAnimation(list.length) ? list.length - 1 : 0;
        for (let i = 0; i < list.length; i++) {
            if (!aliveRef.current) break;
            await playShot(list[i], i < skipUntil);
            setPlayedShots(list[i].idx + 1);
        }
        setAnimating(false);
    }, [playShot]);

    /* ── 처음 열 때: 대전 상태를 받아 현재 배치부터 보여준다(진행 중이면 지금까지 친 결과가 이미 반영된 배치다). ── */
    useEffect(() => {
        let alive = true;
        matchApi.getMatch(matchId).then((m) => {
            if (!alive) return;
            setMatch(m);
            if (m.balls) { ballsRef.current = m.balls; dirtyRef.current = true; }
            setPlayedShots(m.shots);
        }).catch(() => { if (alive) setError(t("sim.watch.gone")); });
        return () => { alive = false; };
    }, [matchId]);

    /* ── 진행 중: 4초 폴링 → 새 샷이 있으면 이어 재생 ── */
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
                    await playList(normalizeShots(shots, plan.from));
                } else if (!animating && m.balls && m.shots === playedShots) {
                    ballsRef.current = m.balls; dirtyRef.current = true;       // 시간 초과 등 샷 없는 변화
                }
            } catch { /* 일시적 오류 — 다음 주기에 다시 */ }
            if (alive) timer = setTimeout(tick, delay);
        };
        timer = setTimeout(tick, nextPollMs(match.status, true) ?? 4000);
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
            if (list.length > 0) { ballsRef.current = list[0].preState as BallState[]; dirtyRef.current = true; setPlayedShots(0); }
        }).catch(() => { /* 목록 없이도 결과 화면은 보인다 */ });
        return () => { alive = false; };
    }, [finished, matchId, replayShots.length]);

    /* ── 다시보기 자동 재생 ── */
    useEffect(() => {
        if (!autoPlay || animating || !finished) return;
        const next = replayShots[playedShots];
        if (!next) { setAutoPlay(false); return; }
        let alive = true;
        (async () => { if (alive) await playList([next]); })();
        return () => { alive = false; };
    }, [autoPlay, animating, finished, replayShots, playedShots, playList]);

    const restart = () => {
        if (replayShots.length === 0) return;
        setAutoPlay(false);
        animRef.current = null;
        ballsRef.current = replayShots[0].preState as BallState[];
        dirtyRef.current = true;
        setPlayedShots(0);
        setLastShot(null);
    };

    if (error) {
        return (
            <div className="min-h-dvh bg-surface-0 flex flex-col items-center justify-center gap-4 px-6 text-center">
                <p className="text-[15px] text-ink-2">{error}</p>
                <button onClick={() => navigate("/online-game?rooms=1")} className="h-11 px-5 rounded-tile bg-brand text-black text-[14px] font-bold">{t("sim.watch.toRooms")}</button>
            </div>
        );
    }
    if (!match) return <div className="min-h-dvh bg-surface-0 flex items-center justify-center text-ink-3 text-[14px]">{t("sim.watch.loading")}</div>;

    const p0 = playerLine(match, 0, t("sim.watch.host"));
    const p1 = playerLine(match, 1, t("sim.watch.guest"));
    const turn = match.turn;

    return (
        <div className="min-h-dvh bg-surface-0 flex flex-col">
            <header className="flex items-center gap-3 px-4 h-14 shrink-0">
                <button onClick={() => navigate("/online-game?rooms=1")} className="h-9 px-3 rounded-tile border border-surface-line text-[13px] font-semibold text-ink-2">{t("sim.watch.toRooms")}</button>
                <span className="text-[15px] font-bold text-ink-1">{finished ? t("sim.watch.replayTitle") : t("sim.watch.title")}</span>
                <span className="text-[12px] text-ink-3">{match.gameType === "3c" ? t("sim.setup.type3c") : t("sim.setup.type4c")}</span>
                {!finished && <span className="ml-auto text-[11px] text-ink-3">{t("sim.watch.refresh")}</span>}
            </header>

            <div className="px-4 pb-3 shrink-0">
                <div className="grid grid-cols-2 gap-2">
                    {[p0, p1].map((p, i) => {
                        const isTurn = !finished && turn === i;
                        const isWinner = finished && match.winnerIndex === i;
                        return (
                            <div key={i} className={`rounded-tile border p-3 ${isTurn ? "border-brand bg-brand/10" : isWinner ? "border-brand/60 bg-brand/5" : "border-surface-line bg-surface-1"}`}>
                                <div className="flex items-center gap-1.5">
                                    <span className="text-[13px] font-bold text-ink-1 truncate">{p.name}</span>
                                    {isTurn && <span className="text-[10px] font-bold text-brand shrink-0">● {t("sim.watch.turn")}</span>}
                                    {isWinner && <span className="text-[10px] font-bold text-brand shrink-0">{t("sim.watch.win")}</span>}
                                </div>
                                <div className="mt-1 flex items-baseline gap-1">
                                    <span className="text-[26px] font-black text-ink-1 tabular-nums leading-none">{p.score}</span>
                                    <span className="text-[13px] text-ink-3">/ {p.target}</span>
                                </div>
                                <p className="mt-1 text-[11px] text-ink-3">{t("sim.watch.inningsHigh").replace("{i}", String(p.innings)).replace("{h}", String(p.highRun))}</p>
                            </div>
                        );
                    })}
                </div>
            </div>

            <div ref={tableRef} className="flex-1 min-h-[55vh] relative" />

            <footer className="shrink-0 px-4 py-3 space-y-2">
                {lastShot && (
                    <p className="text-[12px] text-ink-2 text-center">
                        {(lastShot.playerIndex === 0 ? p0.name : p1.name)} · {lastShot.points > 0 ? t("sim.watch.point").replace("{n}", String(lastShot.points)) : t("sim.watch.miss")}
                    </p>
                )}
                {finished ? (
                    <div className="flex items-center gap-2">
                        <button onClick={restart} className="h-11 px-3 rounded-tile border border-surface-line text-[13px] font-semibold text-ink-2">{t("sim.watch.restart")}</button>
                        <button
                            onClick={() => setAutoPlay((v) => !v)}
                            disabled={replayShots.length === 0 || playedShots >= replayShots.length}
                            className="h-11 flex-1 rounded-tile bg-brand text-black text-[14px] font-bold disabled:opacity-40"
                        >{autoPlay ? t("sim.watch.pause") : t("sim.watch.play")}</button>
                        <button
                            onClick={() => { setAutoPlay(false); const n = replayShots[playedShots]; if (n) void playList([n]); }}
                            disabled={animating || playedShots >= replayShots.length}
                            className="h-11 px-3 rounded-tile border border-surface-line text-[13px] font-semibold text-ink-2 disabled:opacity-40"
                        >{t("sim.watch.nextShot")}</button>
                        <button
                            onClick={() => setSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length])}
                            className="h-11 px-3 rounded-tile border border-surface-line text-[13px] font-semibold text-ink-2"
                        >{t("sim.watch.speed").replace("{n}", String(speed))}</button>
                    </div>
                ) : (
                    <p className="text-[11px] text-ink-3 text-center">
                        {animating ? t("sim.watch.playing") : t("sim.watch.seen").replace("{n}", String(match.shots))}
                    </p>
                )}
                {finished && replayShots.length > 0 && (
                    <p className="text-[11px] text-ink-3 text-center">{t("sim.watch.shotProgress").replace("{a}", String(playedShots)).replace("{b}", String(replayShots.length))}</p>
                )}
            </footer>
        </div>
    );
}
