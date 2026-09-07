/**
 * 시뮬레이터 화면(DOM 셸). 물리·판정·재생·서버 동기화는 useSimulator 가 전부 맡고, 여기서는
 *  - 렌더러(Canvas2DRenderer)·오버레이(Overlay)를 테이블 래퍼에 얹고 rAF 루프에서 frameAt() 으로 그리며(React 상태 없음),
 *  - 테이블 포인터 제스처(조준 드래그 · 연습 모드 공 배치 · 재생 중 길게 눌러 4×)를 tableGestures 로 해석하고,
 *  - HUD · 조작 패널 · 결과 배너 · 이닝 시트 · 종료/나가기 다이얼로그를 그린다.
 * 설정은 `?cfg=<base64url JSON>`(pageConfig) 으로 받고, 없거나 깨졌으면 SimSetupDialog 를 위에 연다.
 * 세로 고정 레이아웃, env(safe-area-inset-*) 패딩, 태블릿에서는 렌더러가 letterbox 해서 테이블이 잘리지 않는다.
 * 레거시 Expo ReactNativeWebView 방향 브리지는 옮기지 않는다 — 이 화면은 세로 레이아웃 그 자체다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { TABLES, type TableSpec } from "@shared/sim/params";
import type { ShotOutcome } from "@shared/sim/rules";
import { useT } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { useGameAudio } from "@/hooks/useGameAudio";
import { useAuth } from "@/hooks/useAuth";
import { useSimulator, type OfflineReason } from "./useSimulator";
import { Canvas2DRenderer } from "./render/Canvas2DRenderer";
import { Overlay, type Project } from "./overlay/Overlay";
import { SimSetupDialog, type SimSetupConfig } from "./SimSetupDialog";
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

    // ── 설정 (URL → 없으면 설정 창) ───────────────────────────────────────
    const [initial] = useState(() => decodePageConfig(readCfgParam(search)));
    const [setupOpen, setSetupOpen] = useState(initial === null);

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

    // ── 렌더러·오버레이 ───────────────────────────────────────────────────
    const tableRef = useRef<HTMLDivElement>(null);
    const rendererRef = useRef<Canvas2DRenderer | null>(null);
    const overlayRef = useRef<Overlay | null>(null);
    const dirtyRef = useRef(true);
    const tableSpecRef = useRef(table);
    tableSpecRef.current = table;
    const fullLabel = t("sim.aim.fullBall");
    const projectRef = useRef<Project>((x, y) => rendererRef.current?.project(x, y) ?? [0, 0]);

    useEffect(() => {
        const el = tableRef.current;
        if (!el) return;
        const renderer = new Canvas2DRenderer();
        renderer.mount(el, tableSpecRef.current);
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
            overlay?.dispose();
            renderer.dispose();
            rendererRef.current = null;
            overlayRef.current = null;
        };
    }, [fullLabel]);

    useEffect(() => {
        rendererRef.current?.setTable(table);
        dirtyRef.current = true;
    }, [table]);

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
                highlightBallId: v.placing ?? v.cueBallId,
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
    const names = useMemo(() => {
        const n = sim.session?.players.length ?? 0;
        return Array.from({ length: n }, (_, i) => playerLabel(i, n, member?.nickname, t));
    }, [sim.session?.players.length, member?.nickname, t]);

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
            navigate(EXIT_PATH);
        }
    }, [actions, navigate]);

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
                    record={sim.record} offline={sim.offline} syncing={sim.syncing} queued={sim.queued}
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

            <SimSetupDialog open={setupOpen} onOpenChange={onSetupOpenChange} onStart={onSetupStart} />
            <InningSheet open={sheetOpen} onOpenChange={setSheetOpen} log={log} session={sim.session} names={names} phase={sim.phase} />
            <EndDialog
                open={endOpen} onOpenChange={(o) => { if (!o) setEndDismissed(true); }}
                session={sim.session} phase={sim.phase} names={names}
                record={sim.record} offline={sim.offline} mismatches={sim.mismatches} busy={exiting}
                onRestart={onRestart} onExit={() => { void exitNow(); }}
            />
            <ExitConfirm
                open={exitOpen} onOpenChange={setExitOpen}
                record={sim.record} offline={sim.offline} finished={!!finished} busy={exiting}
                onConfirm={() => { void exitNow(); }}
            />
        </div>
    );
}

export default SimulatorPage;
