/**
 * 시뮬레이터 화면(DOM 셸). 물리·판정·재생·서버 동기화는 useSimulator 가 전부 맡고, 여기서는
 *  - 렌더러·오버레이(Overlay)를 테이블 래퍼에 얹고 rAF 루프에서 frameAt() 으로 그리며(React 상태 없음),
 *    렌더러는 기기 저장값(rendererChoice: "rankue.sim.renderer")과 WebGL2 탐색으로 ThreeRenderer 를 고르고, 생성 실패나
 *    컨텍스트 손실 2회면 Canvas2DRenderer 로 내려간다(같은 Renderer 계약이라 루프·오버레이·제스처는 모른다),
 *  - 테이블 포인터 제스처(조준 드래그 · 연습 모드 공 배치 · 재생 중 길게 눌러 4×)를 tableGestures 로 해석하고,
 *  - HUD · 조작 패널 · 결과 배너 · 이닝 시트 · 종료/나가기 다이얼로그를 그린다.
 * 설정은 `?cfg=<base64url JSON>`(pageConfig) 으로 받고, 없거나 깨졌으면 SimSetupDialog 를 위에 연다.
 * 세로 고정 레이아웃, env(safe-area-inset-*) 패딩, 태블릿에서는 렌더러가 letterbox 해서 테이블이 잘리지 않는다.
 * 레거시 Expo ReactNativeWebView 방향 브리지는 옮기지 않는다 — 이 화면은 세로 레이아웃 그 자체다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { TABLES, type TableSpec } from "@shared/sim/params";
import type { ShotOutcome } from "@shared/sim/rules";
import { useT } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { useGameAudio } from "@/hooks/useGameAudio";
import { useAuth } from "@/hooks/useAuth";
import { useSimulator, type OfflineReason } from "./useSimulator";
import type { Renderer } from "./render/Renderer";
import { Canvas2DRenderer } from "./render/Canvas2DRenderer";
import { CONTEXT_LOSS_LIMIT, safeLocalStorage, selectRendererKind, writeRendererPref, type RendererKind } from "./render/rendererChoice";
import { Overlay, type Project } from "./overlay/Overlay";
import { SimSetupDialog, type SimSetupConfig } from "./SimSetupDialog";
import { matchApi, type MatchPublic } from "./matchApi";
import { MatchLobby } from "./match/MatchLobby";
import { MatchList, MATCH_LIST_QUERY_KEY } from "./match/MatchList";
import { endReasonText } from "./match/matchView";
import { ResignConfirm } from "./components/ResignConfirm";
import { decodePageConfig, readCfgParam } from "./pageConfig";
import { activeThickness, FINE_STEP_RAD, pullbackFor, type ThicknessStep } from "./controlsMath";
import { appendShot, EMPTY_LOG, popShot, type InningLog } from "./inningLog";
import { beginGesture, moveGesture, type Gesture } from "./tableGestures";
import { playerLabel } from "./hudMath";
import type { CueInput, Phase } from "./simReducer";
import type { SimPreview } from "./simController";
import { HUD } from "./components/HUD";
import { Controls } from "./components/Controls";
import { OutcomeBanner } from "./components/OutcomeBanner";
import { InningSheet } from "./components/InningSheet";
import { EndDialog } from "./components/EndDialog";
import { ExitConfirm } from "./components/ExitConfirm";

const OFFLINE_KEYS: Record<OfflineReason, string> = {
    "session-create": "sim.sync.offlineCreate",
    "shot-retries": "sim.sync.offlineShots",
    "shot-rejected": "sim.sync.rejected",
};

/** 재생 중 테이블을 이만큼 누르고 있으면 4× */
const HOLD_FF_MS = 200;
/** 결과 배너 표시 시간 */
const BANNER_MS = 2400;
const EXIT_PATH = "/dashboard";

/** rAF 루프가 읽는 화면 상태. React 상태를 ref 로 비춰 두어 프레임마다 재렌더하지 않는다. */
interface View {
    phase: Phase;
    input: CueInput;
    cueBallId: "white" | "yellow";
    balls: ReturnType<typeof useSimulator>["balls"];
    preview: SimPreview | null;
    table: TableSpec;
    canPlace: boolean;
    dragging: boolean;
    placing: string | null;
}

export function SimulatorPage() {
    const { t } = useT();
    const { toast } = useToast();
    const { getCtx } = useGameAudio();
    const { member } = useAuth();
    const [, navigate] = useLocation();
    const search = useSearch();

    // ── 설정 (URL → 없으면 설정 창). 대전(?match=)·로비(?lobby=1)는 설정 창을 열지 않는다 ──
    const params = useMemo(() => new URLSearchParams(search.startsWith("?") ? search.slice(1) : search), [search]);
    const matchId = params.get("match");
    const lobby = params.get("lobby") === "1";
    const [initial] = useState(() => (matchId || lobby ? null : decodePageConfig(readCfgParam(search))));
    const [setupOpen, setSetupOpen] = useState(initial === null && !matchId && !lobby);
    const [matchLoad, setMatchLoad] = useState<"idle" | "loading" | "error" | "notMine">("idle");
    const [resignOpen, setResignOpen] = useState(false);
    const [turnChip, setTurnChip] = useState(false);
    const queryClient = useQueryClient();

    // ── 화면 상태 ─────────────────────────────────────────────────────────
    const [muted, setMuted] = useState(false);
    const [side, setSide] = useState<"left" | "right">("right");
    const [log, setLog] = useState<InningLog>(EMPTY_LOG);
    const [banner, setBanner] = useState<{ outcome: ShotOutcome; id: number } | null>(null);
    const [bannerVisible, setBannerVisible] = useState(false);
    const [sheetOpen, setSheetOpen] = useState(false);
    const [exitOpen, setExitOpen] = useState(false);
    const [exiting, setExiting] = useState(false);
    const [endDismissed, setEndDismissed] = useState(false);
    const [dragging, setDragging] = useState(false);
    const [placing, setPlacing] = useState<string | null>(null);

    const sim = useSimulator({
        getAudioContext: getCtx,
        muted,
        onMismatch: () => toast({ title: t("sim.sync.mismatch") }),
        onOffline: (reason) => toast({ title: t(OFFLINE_KEYS[reason]) }),
        onMiscue: () => toast({ title: t("sim.shot.miscue") }),
        onOutcome: (outcome, session) => {
            setLog((l) => appendShot(l, outcome, session));
            setBanner({ outcome, id: session.shotCount });
            void queryClient.invalidateQueries({ queryKey: MATCH_LIST_QUERY_KEY });
        },
        matchApi,
        onMatch: (e) => {
            if (e === "offline") toast({ title: t("sim.match.offline") });
            else if (e === "online") toast({ title: t("sim.match.online") });
            else if (e === "resynced") toast({ title: t("sim.match.resynced") });
            else if (e === "finished") { toast({ title: t("sim.match.finishedByServer") }); void queryClient.invalidateQueries({ queryKey: MATCH_LIST_QUERY_KEY }); }
            else if (e === "claim-too-early") toast({ title: t("sim.match.claimTooEarly") });
        },
    });
    const { actions } = sim;
    const table = sim.params?.table ?? TABLES.DAEDAE;

    // 처음 한 번: URL 설정이 있으면 바로 시작
    const startedRef = useRef(false);
    useEffect(() => {
        if (startedRef.current || !initial) return;
        startedRef.current = true;
        actions.start(initial.config, { record: initial.record });
    }, [actions, initial]);

    // ?match=<id> (푸시 딥링크·목록에서 열기): 서버에서 받아 대전 모드로 연다
    useEffect(() => {
        if (!matchId || startedRef.current) return;
        startedRef.current = true;
        setMatchLoad("loading");
        matchApi.getMatch(matchId).then((m) => {
            if (m.myIndex < 0) { setMatchLoad("notMine"); return; }
            if (m.status === "waiting") { setMatchLoad("idle"); navigate("/online-game?lobby=1", { replace: true }); return; }
            setMatchLoad(actions.startMatch(m) ? "idle" : "error");
        }, () => setMatchLoad("error"));
    }, [matchId, actions, navigate]);

    // 대전에서 내 차례가 돌아오면 짧게 알린다
    const prevPhaseRef = useRef<Phase>(sim.phase);
    useEffect(() => {
        const prev = prevPhaseRef.current;
        prevPhaseRef.current = sim.phase;
        if (sim.mode === "match" && sim.phase === "aim" && prev === "waiting") {
            setTurnChip(true);
            const h = setTimeout(() => setTurnChip(false), BANNER_MS);
            return () => clearTimeout(h);
        }
    }, [sim.phase, sim.mode]);

    // ── 렌더러·오버레이 ───────────────────────────────────────────────────
    const tableRef = useRef<HTMLDivElement>(null);
    const rendererRef = useRef<Renderer | null>(null);
    const overlayRef = useRef<Overlay | null>(null);
    const dirtyRef = useRef(true);
    const tableSpecRef = useRef(table);
    tableSpecRef.current = table;
    const fullLabel = t("sim.aim.fullBall");
    const projectRef = useRef<Project>((x, y) => rendererRef.current?.project(x, y) ?? [0, 0]);
    // 렌더러 종류는 화면 인스턴스마다 한 번 고른다(저장값 → WebGL2 탐색). 컨텍스트 손실이 쌓이면 세션 동안 canvas 로 고정.
    const rendererKindRef = useRef<RendererKind | null>(null);
    if (rendererKindRef.current === null) rendererKindRef.current = selectRendererKind();
    const contextLossesRef = useRef(0);

    useEffect(() => {
        const el = tableRef.current;
        if (!el) return;
        let alive = true;
        let swapTimer: ReturnType<typeof setTimeout> | null = null;

        const mountCanvas2d = (): Renderer => {
            const r = new Canvas2DRenderer();
            r.mount(el, tableSpecRef.current);
            return r;
        };
        // WebGL 컨텍스트를 CONTEXT_LOSS_LIMIT 회 잃으면 기기 설정을 canvas 로 저장하고, 이벤트 핸들러 밖에서 렌더러를 교체한다.
        // rAF 루프·오버레이·제스처는 rendererRef 만 보므로 교체를 모른다(오버레이 캔버스는 z-index 로 위에 남는다).
        const onContextLost = () => {
            contextLossesRef.current += 1;
            if (contextLossesRef.current < CONTEXT_LOSS_LIMIT || rendererKindRef.current === "canvas") return;
            rendererKindRef.current = "canvas";
            writeRendererPref(safeLocalStorage(), "canvas");
            swapTimer = setTimeout(() => {
                swapTimer = null;
                if (!alive) return;
                rendererRef.current?.dispose();
                rendererRef.current = mountCanvas2d();
                dirtyRef.current = true;
            }, 0);
        };

        // 먼저 Canvas2D 를 올려 테이블이 즉시 보이게 하고, three.js 는 필요한 기기에서만 동적으로 내려받아
        // 준비되면 바꿔 끼운다(three 청크 ~540 kB 를 canvas 사용자는 받지 않는다).
        let renderer: Renderer = mountCanvas2d();
        if (rendererKindRef.current === "three") {
            import("./render/ThreeRenderer").then(({ ThreeRenderer }) => {
                if (!alive || rendererKindRef.current !== "three") return;
                let three: InstanceType<typeof ThreeRenderer> | null = null;
                try {
                    three = new ThreeRenderer({ onContextLost });
                    three.mount(el, tableSpecRef.current);
                } catch {
                    // WebGL2 를 못 열었다(드라이버 차단·컨텍스트 상한) — 이 화면에선 canvas 유지
                    try { three?.dispose(); } catch { /* 이미 망가진 상태 */ }
                    rendererKindRef.current = "canvas";
                    return;
                }
                rendererRef.current?.dispose();
                rendererRef.current = three;
                dirtyRef.current = true;
            }).catch(() => {
                // 청크 로드 실패(오프라인 등) — canvas 유지
                rendererKindRef.current = "canvas";
            });
        }

        let overlay: Overlay | null = null;
        try {
            overlay = new Overlay(el, { labels: { fullBall: fullLabel } });
        } catch {
            overlay = null; // 2D 컨텍스트가 없는 환경 — 조준선 없이 진행
        }
        rendererRef.current = renderer;
        overlayRef.current = overlay;
        dirtyRef.current = true;
        return () => {
            alive = false;
            if (swapTimer) clearTimeout(swapTimer);
            overlay?.dispose();
            rendererRef.current?.dispose();
            rendererRef.current = null;
            overlayRef.current = null;
        };
    }, [fullLabel]);

    useEffect(() => {
        rendererRef.current?.setTable(table);
        dirtyRef.current = true;
    }, [table]);

    // 테이블 영역 크기가 바뀌면(두 선수 HUD 로 커짐·회전·키보드) 다음 프레임에 오버레이를 새 투영으로 다시 그린다.
    // 렌더러·오버레이의 ResizeObserver 순서는 보장되지 않아, 오버레이가 옛 레이아웃으로 먼저 그려질 수 있었다(실측 2026-09-07).
    useEffect(() => {
        const el = tableRef.current;
        if (!el || typeof ResizeObserver === "undefined") return;
        const ro = new ResizeObserver(() => { dirtyRef.current = true; });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    // rAF 루프가 읽는 뷰 — 렌더마다 갱신(할당만, 재렌더 없음)
    const viewRef = useRef<View>({
        phase: sim.phase, input: sim.input, cueBallId: sim.cueBallId, balls: sim.balls, preview: sim.preview,
        table, canPlace: sim.canPlace, dragging, placing,
    });
    viewRef.current = {
        phase: sim.phase, input: sim.input, cueBallId: sim.cueBallId, balls: sim.balls, preview: sim.preview,
        table, canPlace: sim.canPlace, dragging, placing,
    };
    useEffect(() => {
        dirtyRef.current = true;
    }, [sim.phase, sim.input, sim.cueBallId, sim.balls, sim.preview, table, dragging, placing]);

    const { frameAt } = sim;
    useEffect(() => {
        let handle = 0;
        let overlayCleared = false;
        const loop = () => {
            handle = requestAnimationFrame(loop);
            const renderer = rendererRef.current;
            if (!renderer) return;
            const frame = frameAt(performance.now());
            if (!frame.playing && !dirtyRef.current) return;
            dirtyRef.current = false;
            const v = viewRef.current;
            renderer.draw({
                balls: frame.balls,
                cue: { phi: v.input.phi, pullback: pullbackFor(v.input.V0), visible: v.phase === "aim", ballId: v.cueBallId },
                // 큐볼은 큐 스틱이 가리키므로 링을 두르지 않는다 — 8px 남짓한 공에 링이 겹치면 속이 빈 공처럼 보였다(실측).
                highlightBallId: v.placing ?? undefined,
            });
            const overlay = overlayRef.current;
            if (!overlay) return;
            if (v.phase === "aim") {
                // 드래그 중엔 직선 안내(미리보기는 30 ms 뒤에 오므로), 손을 떼면 예측 경로
                overlay.draw({
                    balls: v.balls, phi: v.input.phi, cueBallId: v.cueBallId, table: v.table,
                    guide: v.dragging || !v.preview ? "straight" : "preview",
                    preview: v.preview?.paths ?? null,
                    project: projectRef.current,
                });
                overlayCleared = false;
            } else if (!overlayCleared) {
                overlay.clear();
                overlayCleared = true;
            }
        };
        handle = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(handle);
    }, [frameAt]);

    // ── 테이블 포인터 제스처 ──────────────────────────────────────────────
    const gestureRef = useRef<Gesture | null>(null);
    const pointerIdRef = useRef<number | null>(null);
    const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const unprojectEvent = (e: React.PointerEvent<HTMLDivElement>): [number, number] | null => {
        const renderer = rendererRef.current;
        if (!renderer) return null;
        const r = e.currentTarget.getBoundingClientRect();
        return renderer.unproject(e.clientX - r.left, e.clientY - r.top);
    };

    const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        if (pointerIdRef.current !== null) return; // 두 번째 손가락은 무시
        if (e.pointerType === "mouse" && e.button !== 0) return;
        const p = unprojectEvent(e);
        if (!p) return;
        const v = viewRef.current;
        const g = beginGesture({ phase: v.phase, canPlace: v.canPlace, balls: v.balls, cueBallId: v.cueBallId, R: v.table.ball.R }, p);
        if (!g) return;
        gestureRef.current = g;
        pointerIdRef.current = e.pointerId;
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* noop */ }
        if (g.kind === "hold") {
            holdTimerRef.current = setTimeout(() => { holdTimerRef.current = null; actions.setSpeed(4); }, HOLD_FF_MS);
        } else if (g.kind === "aim") {
            setDragging(true);
        } else {
            setPlacing(g.id);
        }
    };

    const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        if (e.pointerId !== pointerIdRef.current) return;
        const g = gestureRef.current;
        if (!g || g.kind === "hold") return;
        const p = unprojectEvent(e);
        if (!p) return;
        const r = moveGesture(g, p, viewRef.current.input.phi);
        gestureRef.current = r.gesture;
        if (r.phi !== undefined) actions.setPhi(r.phi);
        if (r.place) actions.placeBall(r.place.id, r.place.x, r.place.y);
    };

    const onPointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
        if (e.pointerId !== pointerIdRef.current) return;
        const g = gestureRef.current;
        gestureRef.current = null;
        pointerIdRef.current = null;
        try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* noop */ }
        if (g?.kind === "hold") {
            if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null; }
            actions.setSpeed(1);
        }
        setDragging(false);
        setPlacing(null);
    };

    useEffect(() => () => { if (holdTimerRef.current) clearTimeout(holdTimerRef.current); }, []);

    // ── 결과 배너 ─────────────────────────────────────────────────────────
    useEffect(() => {
        if (!banner) return;
        setBannerVisible(true);
        const h = setTimeout(() => setBannerVisible(false), BANNER_MS);
        return () => clearTimeout(h);
    }, [banner]);

    // 종료 다이얼로그: finished 로 들어갈 때마다 다시 연다
    useEffect(() => {
        if (sim.phase !== "finished") setEndDismissed(false);
    }, [sim.phase]);

    // ── 파생값 ───────────────────────────────────────────────────────────
    const matchNames = sim.match?.names;
    const names = useMemo(() => {
        if (matchNames) return matchNames;
        const n = sim.session?.players.length ?? 0;
        return Array.from({ length: n }, (_, i) => playerLabel(i, n, member?.nickname, t));
    }, [matchNames, sim.session?.players.length, member?.nickname, t]);
    const isMatch = sim.mode === "match";

    const active = useMemo(() => {
        if (!sim.session || !sim.params) return null;
        return activeThickness(sim.balls, sim.cueBallId, sim.session.rules.gameType, sim.input.phi, sim.params.table.ball.R);
    }, [sim.balls, sim.cueBallId, sim.session, sim.params, sim.input.phi]);

    // ── 조작 콜백(참조 안정 — Controls 는 memo) ──────────────────────────
    const onThickness = useCallback((step: ThicknessStep) => actions.setThickness(step, side), [actions, side]);
    const onSide = useCallback((s: "left" | "right") => {
        setSide(s);
        const step = active?.step;
        if (step && step !== 1) actions.setThickness(step, s);
    }, [actions, active?.step]);
    const onNudge = useCallback((dir: -1 | 1) => actions.nudgePhi(dir * FINE_STEP_RAD), [actions]);
    const onSpin = useCallback((a: number, b: number) => actions.setSpin(a, b), [actions]);
    const onPower = useCallback((V0: number) => actions.setPower(V0), [actions]);
    const onShoot = useCallback(() => { void actions.shoot(); }, [actions]);
    const onUndo = useCallback(() => { actions.undo(); setLog(popShot); setBanner(null); }, [actions]);
    const onRestart = useCallback(() => {
        actions.restart();
        setLog(EMPTY_LOG);
        setBanner(null);
        setEndDismissed(false);
    }, [actions]);
    const onInnings = useCallback(() => setSheetOpen(true), []);
    const onExitRequest = useCallback(() => setExitOpen(true), []);
    const onToggleMute = useCallback(() => setMuted((m) => !m), []);

    const exitNow = useCallback(async () => {
        setExiting(true);
        try {
            await actions.exit();
        } finally {
            // 대전은 서버에 남으므로 목록(로비)으로 돌아간다
            navigate(isMatch ? "/online-game?lobby=1" : EXIT_PATH);
            setExiting(false);
        }
    }, [actions, navigate, isMatch]);

    const openMatch = useCallback((m: MatchPublic) => {
        if (m.status === "waiting") return;
        if (actions.startMatch(m)) navigate(`/online-game?match=${m.id}`, { replace: true });
    }, [actions, navigate]);

    const onResign = useCallback(async () => {
        setExiting(true);
        try {
            await actions.resign();
        } finally {
            setExiting(false);
            setResignOpen(false);
            void queryClient.invalidateQueries({ queryKey: MATCH_LIST_QUERY_KEY });
        }
    }, [actions, queryClient]);

    const onClaim = useCallback(async () => {
        const ok = await actions.claim();
        if (!ok) toast({ title: t("sim.match.claimTooEarly") });
        else void queryClient.invalidateQueries({ queryKey: MATCH_LIST_QUERY_KEY });
    }, [actions, toast, t, queryClient]);

    const onSetupStart = useCallback((config: SimSetupConfig, opts: { record: boolean }) => {
        setSetupOpen(false);
        setLog(EMPTY_LOG);
        setBanner(null);
        actions.start(config, { record: opts.record });
    }, [actions]);

    const onSetupOpenChange = useCallback((open: boolean) => {
        setSetupOpen(open);
        // 세션 없이 설정을 닫으면 돌아간다
        if (!open && sim.phase === "setup") navigate(EXIT_PATH);
    }, [navigate, sim.phase]);

    const finished = sim.session?.status === "finished";
    const endOpen = sim.phase === "finished" && !endDismissed && !exitOpen;
    const showLobby = lobby && sim.phase === "setup";
    const endSubtitle = sim.match
        ? endReasonText({ status: sim.match.status, endReason: sim.match.endReason, winnerIndex: sim.match.winnerIndex, hostName: sim.match.names[0], guestName: sim.match.names[1] }, t)
        : null;

    return (
        <div
            className="fixed inset-0 flex flex-col bg-surface-1 text-ink-1 select-none overflow-hidden"
            style={{
                paddingTop: "env(safe-area-inset-top)",
                paddingBottom: "env(safe-area-inset-bottom)",
                paddingLeft: "env(safe-area-inset-left)",
                paddingRight: "env(safe-area-inset-right)",
            }}
        >
            <div className="flex-1 min-h-0 w-full max-w-[640px] mx-auto flex flex-col">
                <HUD
                    session={sim.session} config={sim.config} phase={sim.phase} names={names}
                    record={sim.record} offline={isMatch ? false : sim.offline} syncing={sim.syncing} queued={sim.queued}
                    muted={muted} onToggleMute={onToggleMute}
                />

                {/* 테이블: 남은 높이를 전부 차지. 렌더러·오버레이가 absolute 캔버스로 얹힌다. */}
                <div
                    ref={tableRef}
                    className="relative flex-1 min-h-0 touch-none overflow-hidden bg-surface-3"
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerEnd}
                    onPointerCancel={onPointerEnd}
                    onContextMenu={(e) => e.preventDefault()}
                >
                    {sim.phase === "shooting" && (
                        <span className="absolute top-3 right-3 z-[3] rk-chip bg-surface-1 border border-surface-line text-ink-3 pointer-events-none">
                            {sim.playback.speed === 4 ? t("sim.hud.fastForward") : t("sim.hud.holdToFastForward")}
                        </span>
                    )}
                    {sim.canPlace && sim.session && sim.session.shotCount === 0 && (
                        <span className="absolute top-3 left-3 z-[3] rk-chip bg-surface-1 border border-surface-line text-ink-3 pointer-events-none">
                            {t("sim.hud.placeHint")}
                        </span>
                    )}
                    {finished && !endOpen && (
                        <span className="absolute top-3 left-3 z-[3] rk-chip bg-surface-1 border border-surface-line text-ink-3 pointer-events-none">
                            {t("sim.hud.finished")}
                        </span>
                    )}
                    {/* ── 대전 전용 표시 ── */}
                    {matchLoad === "loading" && (
                        <span className="absolute top-3 left-3 z-[3] rk-chip bg-surface-1 border border-surface-line text-ink-3 pointer-events-none">{t("sim.match.loading")}</span>
                    )}
                    {(matchLoad === "error" || matchLoad === "notMine") && (
                        <div className="absolute inset-0 z-[4] flex items-center justify-center p-6">
                            <div className="rounded-card bg-surface-1 border border-surface-line px-5 py-4 text-center max-w-[300px]">
                                <p className="text-[14px] font-semibold text-ink-1">{t(matchLoad === "notMine" ? "sim.match.notMine" : "sim.match.loadFailed")}</p>
                                <button type="button" onClick={() => navigate("/online-game?lobby=1", { replace: true })} className="mt-3 h-11 px-5 rounded-xl bg-brand text-brand-fg text-[14px] font-semibold">
                                    {t("sim.match.listTitle")}
                                </button>
                            </div>
                        </div>
                    )}
                    {isMatch && sim.offline && (
                        <span className="absolute top-3 left-3 z-[3] rk-chip bg-surface-1 border border-surface-line text-ink-3 pointer-events-none">{t("sim.match.offline")}</span>
                    )}
                    {isMatch && sim.replaying && sim.match?.opponentShot && (
                        <span className="absolute top-3 left-3 z-[3] rk-chip bg-brand text-brand-fg pointer-events-none">{t("sim.match.opponentShot")}</span>
                    )}
                    {isMatch && turnChip && sim.phase === "aim" && (
                        <span className="absolute top-3 left-3 z-[3] rk-chip bg-brand text-brand-fg pointer-events-none">{t("sim.match.yourTurn")}</span>
                    )}
                    {isMatch && sim.phase === "waiting" && sim.match && !bannerVisible && (
                        <div className="absolute inset-x-0 bottom-3 z-[3] flex flex-col items-center gap-2 px-4">
                            <div className="rounded-card bg-surface-1 border border-surface-line px-4 py-3 text-center max-w-[320px] w-full">
                                <p className="text-[12px] font-medium text-ink-4">{sim.match.opponentName}</p>
                                <p className="text-[14px] font-semibold text-ink-1">{t("sim.match.waitingTurn")}</p>
                                <p className="text-[12px] font-medium text-ink-4 mt-0.5">{t("sim.match.waitingHint")}</p>
                                {sim.match.canClaim ? (
                                    <button type="button" onClick={() => { void onClaim(); }} className="mt-2 h-11 w-full rounded-xl bg-brand text-brand-fg text-[13px] font-semibold">
                                        {t("sim.match.claim")}
                                    </button>
                                ) : (
                                    <p className="text-[12px] font-medium text-ink-4 mt-1">{t("sim.match.claimWait")}</p>
                                )}
                            </div>
                        </div>
                    )}
                    {isMatch && sim.match?.canResign && sim.phase !== "finished" && (
                        <button
                            type="button" onClick={() => setResignOpen(true)}
                            className="absolute top-3 right-3 z-[3] h-9 px-3 rounded-pill bg-surface-1 border border-surface-line text-[12px] font-semibold text-ink-3"
                        >
                            {t("sim.match.resign")}
                        </button>
                    )}
                    <div className="absolute inset-0 z-[3] pointer-events-none">
                        <OutcomeBanner outcome={banner?.outcome ?? null} visible={bannerVisible} />
                    </div>
                </div>

                <Controls
                    phase={sim.phase} canUndo={sim.canUndo} input={sim.input} cueBallId={sim.cueBallId}
                    active={active} side={side}
                    onThickness={onThickness} onSide={onSide} onNudge={onNudge}
                    onSpin={onSpin} onPower={onPower} onShoot={onShoot} onRestart={onRestart}
                    onUndo={onUndo} onInnings={onInnings} onExit={onExitRequest}
                />
            </div>

            {showLobby && (
                <div className="fixed inset-0 z-[5] overflow-y-auto bg-surface-1" style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
                    <MatchLobby onStarted={openMatch} onCreated={() => { void queryClient.invalidateQueries({ queryKey: MATCH_LIST_QUERY_KEY }); }} onClose={() => navigate(EXIT_PATH)} />
                    <div className="w-full max-w-[420px] mx-auto px-5 pb-8">
                        <MatchList onOpen={openMatch} />
                    </div>
                </div>
            )}
            <SimSetupDialog open={setupOpen} onOpenChange={onSetupOpenChange} onStart={onSetupStart} onMatch={() => navigate("/online-game?lobby=1", { replace: true })} />
            <ResignConfirm open={resignOpen} onOpenChange={setResignOpen} busy={exiting} onConfirm={() => { void onResign(); }} />
            <InningSheet open={sheetOpen} onOpenChange={setSheetOpen} log={log} session={sim.session} names={names} phase={sim.phase} />
            <EndDialog
                open={endOpen} onOpenChange={(o) => { if (!o) setEndDismissed(true); }}
                session={sim.session} phase={sim.phase} names={names}
                record={sim.record} offline={isMatch ? false : sim.offline} mismatches={sim.mismatches} busy={exiting}
                onRestart={onRestart} onExit={() => { void exitNow(); }}
                subtitle={endSubtitle} hideRestart={isMatch}
            />
            <ExitConfirm
                open={exitOpen} onOpenChange={setExitOpen}
                record={sim.record} offline={isMatch ? false : sim.offline} finished={!!finished} busy={exiting}
                desc={isMatch ? t("sim.match.leaveDesc") : undefined}
                onConfirm={() => { void exitNow(); }}
            />
        </div>
    );
}

export default SimulatorPage;
