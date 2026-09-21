/**
 * 관전 · 다시보기 화면(2026-09-12 오너 요청 → 2026-09-13 "호스트나 참여자처럼 보이는데 보기만 가능한 권한").
 *
 * **선수 화면과 같은 부품**으로 짓는다 — 머리줄(TopBar: 규칙 칩·점수·차례·40초 시계·관전자 수), 이닝 시트,
 * 같은 렌더러(Canvas2D → 가능하면 3D). 다른 점은 **조작**이 없다는 것뿐이다: 세기 레일·샷 버튼·기권이 없고 나가기만 있다.
 * 보는 것은 선수와 같아야 한다(2026-09-16 오너) — 치는 사람이 겨누는 큐대도 그대로 그린다. 조준선·예상 경로는 없다.
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
import { SHOT_CLOCK_S, type SessionState } from "@shared/sim/rules";
import { Canvas2DRenderer } from "../render/Canvas2DRenderer";
import type { Renderer, RendererView, SafeInsets } from "../render/Renderer";
import { readZoomPref, safeLocalStorage, selectRendererKind, type RendererKind } from "../render/rendererChoice";
import { matchApi, matchConfig, type ChatLine, type MatchPublic, type MatchShot } from "../matchApi";
import { cueBallIdOf, paramsFromConfig } from "../simReducer";
import { easeOppAim, OPP_AIM_PULLBACK } from "../match/oppAim";
import { effectiveBall, makePlayback, startClock, clockTime, type Playback, type PlaybackClock } from "../playback";
import { TopBar, type MatchHeaderPlayer } from "../components/TopBar";
import { ShotClock } from "../components/ShotClock";
import { InningSheet } from "../components/InningSheet";
import { QuickChips, CHAT_GLYPH, WATCHER_BUBBLE, WATCHER_CHIP, WATCHER_TAG } from "../match/MatchChat";
import { CHAT_FROM_WATCHER, CHAT_WATCH_CODES } from "@shared/sim/chat";
import { rebuildInningLog } from "../inningLog";
import { matchParamsKey, nextPollMs, normalizeShots, planWatch, shouldSkipAnimation } from "./watchPlan";

const INSETS: SafeInsets = { top: 8, right: 8, bottom: 8, left: 8 };
const SPEEDS = [1, 2, 4] as const;
type Speed = typeof SPEEDS[number];

/** 폴링으로 받은 샷을 지금까지 아는 샷에 합친다(같은 idx 는 새 값, idx 순). */
function mergeShots(cur: readonly MatchShot[], add: readonly MatchShot[]): readonly MatchShot[] {
    if (add.length === 0) return cur;
    const byIdx = new Map<number, MatchShot>();
    for (const s of cur) byIdx.set(s.idx, s);
    for (const s of add) byIdx.set(s.idx, s);
    return [...byIdx.values()].sort((a, b) => a.idx - b.idx);
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
    /**
     * 지금까지 받은 샷 전부(idx 순). 이닝 기록은 여기서 **이미 재생한 샷만** 골라 그때그때 다시 만든다(rebuildInningLog).
     * 예전엔 재생할 때마다 한 줄씩 쌓았는데 세 가지가 틀렸다(2026-09-18): 중간에 들어온 관전자는 앞 이닝이 비어 있었고,
     * 이닝 번호를 **지금** 세션에서 세서 다시보기에선 모든 샷이 마지막 이닝 한 줄에 몰렸고, 공이 구르기 전에 줄이 먼저 떴다.
     */
    const [knownShots, setKnownShots] = useState<readonly MatchShot[]>([]);
    /**
     * 오간 한마디(2026-09-21 오너: "관전 시에도 채팅을 하게 해 달라는 요청"). 관전자는 **읽기 + 고정 응원 문구**만 된다 —
     * 자유 입력은 서버가 선수에게만 연다. 폴링은 따로 돌리지 않고 대전 행의 chatSeq 가 늘었을 때만 받는다(샷과 같은 규약).
     */
    const [chat, setChat] = useState<readonly ChatLine[]>([]);
    const chatSeqRef = useRef(-1);
    const [cheering, setCheering] = useState(false);
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
    /** 지금 치는 사람이 겨누는 각도(서버가 관전자에게도 보낸다) 와 그 사람의 큐볼. 없으면 큐대를 안 그린다. */
    const liveAimRef = useRef<number | null>(null);
    const liveCueRef = useRef<"white" | "yellow">("white");
    /** 직전 프레임에 그린 큐 각도 — 받은 값으로 순간이동하지 않고 조금씩 따라간다(선수 화면과 같은 규칙). */
    const oppAimRef = useRef<number | null>(null);
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
    const live = match?.status === "playing";
    /** 이닝 기록 — 이미 재생한 샷까지만(다시보기는 넘긴 데까지). 끝난 대전은 다시보기 목록이 곧 전체 기록이다. */
    const allShots = finished && replayShots.length > 0 ? replayShots : knownShots;
    const log = useMemo(() => rebuildInningLog(allShots.filter((s) => s.idx < playedShots), session), [allShots, playedShots, session]);
    /**
     * 샷 없이 끝난 이닝(시간 초과)을 0 으로 채울 끝낸 이닝 수. 세션이 **재생한 데까지와 같은 시점**일 때만 준다 —
     * 공이 구르는 동안이나 다시보기 중간엔 세션이 앞서 있어 아직 안 친 이닝까지 0 으로 채워 버린다.
     */
    const caughtUp = !!match && !animating && playedShots >= match.shots;
    const completedKey = caughtUp && session ? session.players.map((p) => p.innings).join(",") : "";
    const completed = useMemo(() => (completedKey ? completedKey.split(",").map(Number) : undefined), [completedKey]);
    liveAimRef.current = live && match?.opponentAim ? match.opponentAim.phi : null;
    liveCueRef.current = cueBallIdOf(session);
    const names = useMemo(() => [match?.hostName || t("sim.watch.host"), match?.guestName || t("sim.watch.guest")], [match, t]);
    /** 관전 헤더도 선수와 같은 모양으로 — 왼쪽이 호스트, 오른쪽이 게스트(관전자에겐 "나"가 없다). */
    const headerPlayers = useMemo((): readonly [MatchHeaderPlayer, MatchHeaderPlayer] | null => {
        if (!match || !session) return null;
        const timeouts = match.timeouts ?? [0, 0];
        const mk = (i: 0 | 1): MatchHeaderPlayer => ({
            name: names[i],
            country: (i === 0 ? match.hostCountry : match.guestCountry) ?? null,
            cueBallId: session.players[i]?.cueBallId ?? (i === 0 ? "white" : "yellow"),
            score: session.players[i]?.score ?? 0,
            target: session.players[i]?.target ?? 0,
            timeouts: timeouts[i] ?? 0,
            turn: session.status === "playing" && session.turn === i,
            winner: session.status === "finished" && session.winnerIndex === i,
        });
        return [mk(0), mk(1)] as const;
    }, [match, session, names]);

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
            // 치는 사람의 큐대 — 재생 중엔 그리지 않는다(공이 굴러가는데 큐대가 남아 있으면 이상하다).
            const opp = animRef.current ? null : easeOppAim(oppAimRef.current, liveAimRef.current);
            oppAimRef.current = opp?.phi ?? null;
            if (!dirtyRef.current && !(r.needsFrame?.() ?? false) && !opp?.moving) return;
            dirtyRef.current = false;
            const aim = animRef.current ?? aimRef.current;
            // 조준 중엔 카메라도 치는 사람 쪽을 본다 — 직전 샷의 각도에 머물면 "끝난 판"처럼 보인다.
            const camBall = opp ? liveCueRef.current : aim.cueBallId;
            r.draw({
                balls: ballsRef.current,
                cue: opp ? { phi: opp.phi, pullback: OPP_AIM_PULLBACK, visible: true, ballId: liveCueRef.current } : undefined,
                highlightBallId: aim.cueBallId,
                view: { cueBallId: camBall, phi: opp ? opp.phi : aim.phi, mode: animRef.current ? "overview" : "follow" },
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
    const playShot = useCallback(async (s: MatchShot, skip: boolean): Promise<void> => {
        if (!params) return;
        let result: SimResult;
        try {
            result = simulateShot(s.preState as BallState[], s.input, params);
        } catch {
            return;   // 엔진 버전이 달라 재시뮬이 안 되는 옛 대전 — 그 샷은 건너뛴다
        }
        aimRef.current = { cueBallId: s.input.cueBallId, phi: s.input.phi };
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
    }, [params]);

    const playList = useCallback(async (list: readonly MatchShot[]) => {
        if (list.length === 0) return;
        setAnimating(true);
        const skipUntil = shouldSkipAnimation(list.length) ? list.length - 1 : 0;
        for (let i = 0; i < list.length; i++) {
            if (!aliveRef.current) break;
            const s = list[i];
            await playShot(s, i < skipUntil);
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
            // 중간에 들어온 관전자도 앞 이닝이 다 보이게 — 여태 친 샷을 한 번에 받아 둔다(재생은 안 한다).
            // 끝난 대전은 아래 다시보기 effect 가 같은 목록을 받는다.
            if (m.status === "playing" && m.shots > 0) {
                const load = (attempt: number) => {
                    matchApi.getShots(matchId, 0).then((shots) => {
                        if (alive) setKnownShots((cur) => mergeShots(cur, shots));
                    }, () => { if (alive && attempt < 2) setTimeout(() => load(attempt + 1), 3000); });
                };
                load(1);
            }
        }).catch(() => { if (alive) setError(t("sim.watch.gone")); });
        return () => { alive = false; };
    }, [matchId, t]);

    /**
     * 진행 중: 폴링 → 새 샷이 있으면 이어 재생.
     *
     * **의존성은 matchId 와 "진행 중인가" 둘뿐이어야 한다.** 예전엔 [match, playedShots, animating, playList] 였는데,
     * tick 안의 `setMatch(m)` 가 곧바로 이 effect 를 다시 만들어 `alive` 를 false 로 바꿨다. 그 다음 줄의
     * `await getShots(...)` 가 돌아왔을 땐 이미 `if (!alive) return` 에 걸려 샷이 버려졌고, 다음 폴링도 똑같이
     * 버려서 **새 샷이 영영 재생되지 않았다** — 상대가 쳐도 관전 화면이 그대로 멈춰 있던 진짜 원인
     * (2026-09-16 오너 제보). 샷이 없는 변화(시간 초과)는 await 가 없어 우연히 살아 있었다.
     * 그래서 자주 바뀌는 값은 전부 ref 로 읽는다. 위 params 주석과 같은 함정이다.
     */
    const playedRef = useRef(0);
    playedRef.current = playedShots;
    const animatingRef = useRef(false);
    animatingRef.current = animating;
    const playListRef = useRef(playList);
    playListRef.current = playList;

    useEffect(() => {
        if (!live) return;
        let alive = true;
        let timer: ReturnType<typeof setTimeout> | null = null;
        const tick = async () => {
            if (!alive) return;
            const delay = nextPollMs(matchRef.current?.status ?? "playing", document.visibilityState === "visible");
            if (delay === null) { timer = setTimeout(tick, 2000); return; }   // 가려진 동안은 가볍게 되돌아온다
            try {
                const m = await matchApi.getMatch(matchId);
                if (!alive) return;
                setMatch(m);
                if (m.chatSeq !== chatSeqRef.current) {
                    chatSeqRef.current = m.chatSeq;
                    matchApi.getChats?.(matchId, 0).then((lines) => { if (alive) setChat(lines); }, () => { /* 다음 주기에 다시 */ });
                }
                const plan = planWatch({ serverShots: m.shots, playedShots: playedRef.current, animating: animatingRef.current });
                if (plan.kind === "fetch") {
                    const shots = await matchApi.getShots(matchId, plan.from);
                    if (!alive) return;
                    const list = normalizeShots(shots, plan.from);
                    setKnownShots((cur) => mergeShots(cur, list));
                    await playListRef.current(list);
                } else if (!animatingRef.current && m.balls && m.shots === playedRef.current) {
                    ballsRef.current = m.balls; dirtyRef.current = true;      // 시간 초과 등 샷 없는 변화
                }
            } catch { /* 일시적 오류 — 다음 주기에 다시 */ }
            if (alive) timer = setTimeout(tick, delay);
        };
        timer = setTimeout(tick, nextPollMs("playing", true) ?? 2000);
        return () => { alive = false; if (timer) clearTimeout(timer); };
    }, [matchId, live]);

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
        void (async () => { if (alive) await playList([next]); })();
        return () => { alive = false; };
    }, [autoPlay, animating, finished, replayShots, playedShots, playList]);

    const restart = () => {
        if (replayShots.length === 0) return;
        setAutoPlay(false);
        animRef.current = null;
        ballsRef.current = replayShots[0].preState as BallState[];
        dirtyRef.current = true;
        setPlayedShots(0);
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
            {/* 선수 화면과 **같은** 머리줄(2026-09-16 오너: "관전자는 보는 게 플레이어랑 동일해야지"). 조작만 없다. */}
            <TopBar
                session={session} config={config} phase={finished ? "finished" : "waiting"} names={names}
                record={false} offline={false} syncing={false} queued={0}
                onSummary={() => setSheetOpen(true)}
                clock={clockSeconds !== null ? { seconds: clockSeconds, mine: false } : null}
                matchHeader={headerPlayers ? { players: headerPlayers, onExit: () => navigate("/online-game?rooms=1") } : null}
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

            {/* 관전 한마디: 오간 말 몇 줄 + 응원 문구(고정). 끝난 대전에서도 잠깐은 인사할 수 있다(서버가 30분까지 받는다). */}
            {chat.length > 0 && (
                <ul className="shrink-0 px-4 pt-2 space-y-1">
                    {chat.slice(-3).map((l) => (
                        <li key={l.id} className="flex">
                            <span className={cn(
                                "max-w-[90%] truncate rounded-pill px-2.5 py-1 text-[12.5px] font-medium",
                                l.from === CHAT_FROM_WATCHER ? WATCHER_BUBBLE : "bg-surface-3 text-ink-1",
                            )}>
                                <span className={l.from === CHAT_FROM_WATCHER ? WATCHER_TAG : "text-[11px] font-bold text-ink-3 mr-1"}>
                                    {l.from === CHAT_FROM_WATCHER ? t("sim.chat.watcherTag") : names[l.from] ?? ""}
                                </span>
                                {l.kind === "code" ? `${CHAT_GLYPH[l.text] ? CHAT_GLYPH[l.text] + " " : ""}${t(`sim.emoji.${l.text}`)}` : l.text}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
            <div className="shrink-0 px-4 pt-2 flex items-center gap-2">
                {/* 나도 관전자다 — 내가 보낼 응원이 어떤 색으로 뜨는지, 지금 몇 명이 보는지 같은 보라로 */}
                {(match?.watchers ?? 0) > 0 && <span className={cn("shrink-0", WATCHER_CHIP)}>👀 {match!.watchers}</span>}
                <div className="min-w-0 flex-1">
                <QuickChips
                    codes={CHAT_WATCH_CODES}
                    disabled={cheering}
                    onPick={(code) => {
                        setCheering(true);
                        void matchApi.sendChat?.(matchId, { code, clientKey: `w-${code}-${Date.now()}` })
                            .then((r) => { if (aliveRef.current) { setChat((c) => (c.some((x) => x.id === r.line.id) ? c : [...c, r.line])); chatSeqRef.current = r.chatSeq; } })
                            .catch(() => { /* 쿨다운·끝난 대전 — 다음에 */ })
                            .finally(() => { if (aliveRef.current) setCheering(false); });
                    }}
                />
                </div>
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
                            onClick={() => { setAutoPlay(false); const nx = replayShots[playedShots]; if (nx) void playList([nx]); }}
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

            <InningSheet open={sheetOpen} onOpenChange={setSheetOpen} log={log} completed={completed} session={session} names={names} phase={finished ? "finished" : "waiting"} />
        </div>
    );
}
