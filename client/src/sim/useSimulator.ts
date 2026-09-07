/**
 * useSimulator — 시뮬레이터 상태 기계 훅(README "useSimulator API"). 실제 일은 SimController 가 하고,
 * 이 훅은 컨트롤러를 React 에 잇는다: useSyncExternalStore 로 스냅샷(core + aux)을 구독하고, 안정적인 actions 와
 * frameAt 을 돌려준다. 렌더링은 화면(SimulatorPage)이 맡는다 — 훅은 그릴 공(frameAt)과 상태만 준다.
 *
 * 재렌더 규칙: phase·session·balls·input·preview·outcome·speed·syncing 같은 드문 변화만 React 상태.
 * 재생 프레임 값(t, 그 시각의 공)은 frameAt(now) 로 읽는다 — rAF 마다 React 를 깨우지 않는다.
 * 토스트는 훅이 띄우지 않는다. onMismatch/onOffline/onOutcome/onMiscue 콜백으로 화면이 i18n 문구를 고른다.
 */
import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { BallState } from "@shared/sim/types";
import type { SimParams } from "@shared/sim/params";
import type { SessionState, ShotOutcome } from "@shared/sim/rules";
import type { SimSetupConfig } from "./setupPresets";
import { simApi, type SimApi } from "./simApi";
import { cueBallIdOf, type CueInput, type Phase } from "./simReducer";
import {
    SimController,
    type PlaybackSpeed, type SimCallbacks, type SimFrame, type SimPreview, type StartOptions,
} from "./simController";

export type { SimFrame, SimPreview, StartOptions, PlaybackSpeed, OfflineReason } from "./simController";
export type { CueInput, Phase } from "./simReducer";

export interface UseSimulatorOptions extends SimCallbacks {
    /** useGameAudio().getCtx — 제스처로 잠금 해제된 공유 AudioContext. 없으면 무음. */
    readonly getAudioContext?: () => AudioContext | null;
    readonly muted?: boolean;
    /** 기본 true */
    readonly haptics?: boolean;
    /** 미리보기 디바운스 (ms). 기본 30 */
    readonly previewDelayMs?: number;
    /** 테스트·주입용. 기본 simApi */
    readonly api?: SimApi;
}

export interface SimulatorActions {
    /** setup → aim. 서버 세션 개설은 record 일 때 백그라운드로. */
    start(config: SimSetupConfig, opts?: StartOptions): void;
    setInput(patch: Partial<CueInput>): void;
    setPhi(phi: number): void;
    nudgePhi(deltaRad: number): void;
    /** 두께 단계(aim.THICKNESS_STEPS)와 방향으로 가장 가까운 적구를 겨눈다(4구는 상대 큐볼 제외). */
    setThickness(step: number, side: "left" | "right"): void;
    /** 당점 (a, b) R 비율. 0.5R 밖은 미스큐 링으로 클램프. */
    setSpin(a: number, b: number): void;
    /** m/s, [0.2, 9] */
    setPower(V0: number): void;
    /** rad, [0, 20°] */
    setElevation(theta: number): void;
    /** aim 에서만. 로컬 시뮬 → 판정 → 재생 시작 → (record) 서버 전송. */
    shoot(): Promise<void>;
    /** 재생 배속. 재생이 끝나면 1 로 돌아온다. */
    setSpeed(speed: PlaybackSpeed): void;
    /** 연습 모드 + aim 에서만. 배치가 유효하지 않으면 false. */
    placeBall(id: string, x: number, y: number): boolean;
    /** 연습 모드에서만. */
    undo(): void;
    /** 같은 설정으로 새 세션. */
    restart(): void;
    /** 세션 닫기(finished 또는 abandoned) → setup. */
    exit(): Promise<void>;
}

export interface Simulator {
    readonly phase: Phase;
    readonly config: SimSetupConfig | null;
    readonly params: SimParams | null;
    readonly session: SessionState | null;
    /** 정지 상태의 공(마지막 샷의 final 또는 서버 스냅). 재생 중 그릴 공은 frameAt(). */
    readonly balls: readonly BallState[];
    readonly input: CueInput;
    /** 현재 차례의 큐볼 */
    readonly cueBallId: "white" | "yellow";
    /** aim 에서만 non-null. 입력이 바뀌면 30 ms 뒤 갱신. */
    readonly preview: SimPreview | null;
    readonly playback: { readonly duration: number; readonly playing: boolean; readonly speed: PlaybackSpeed };
    readonly outcomeLast: ShotOutcome | null;
    readonly mismatches: number;
    /** 서버 기록 포기됨(로컬 플레이는 계속) */
    readonly offline: boolean;
    readonly record: boolean;
    /** 서버 호출 진행 중 */
    readonly syncing: boolean;
    /** 재전송 대기 샷 수 */
    readonly queued: number;
    readonly serverSessionId: string | null;
    readonly canUndo: boolean;
    readonly canPlace: boolean;
    readonly actions: SimulatorActions;
    /** rAF 루프에서 부른다. now 는 performance.now() 기준 ms(생략 시 지금). */
    frameAt(now?: number): SimFrame;
}

export function useSimulator(options: UseSimulatorOptions = {}): Simulator {
    const optRef = useRef(options);
    optRef.current = options;

    const ctrlRef = useRef<SimController | null>(null);
    if (ctrlRef.current === null) {
        ctrlRef.current = new SimController({
            api: options.api ?? simApi,
            // 최신 옵션을 읽는 안정적인 게터 — 컨텍스트 공급자가 바뀌어도 컨트롤러를 다시 만들지 않는다.
            getAudioContext: () => optRef.current.getAudioContext?.() ?? null,
            haptics: options.haptics,
            previewDelayMs: options.previewDelayMs,
        });
    }
    const ctrl = ctrlRef.current;

    // 콜백은 렌더마다 최신으로 갈아 끼운다(클로저 stale 방지). 값 비교가 싸서 매번 해도 된다.
    ctrl.setCallbacks({
        onMismatch: options.onMismatch,
        onOffline: options.onOffline,
        onOutcome: options.onOutcome,
        onMiscue: options.onMiscue,
    });

    useEffect(() => { ctrl.setMuted(options.muted === true); }, [ctrl, options.muted]);
    useEffect(() => () => { ctrl.dispose(); }, [ctrl]);

    const snap = useSyncExternalStore(ctrl.subscribe, ctrl.getSnapshot, ctrl.getSnapshot);

    const actions = useMemo<SimulatorActions>(() => ({
        start: (config, opts) => ctrl.start(config, opts),
        setInput: (patch) => ctrl.setInput(patch),
        setPhi: (phi) => ctrl.setPhi(phi),
        nudgePhi: (d) => ctrl.nudgePhi(d),
        setThickness: (step, side) => ctrl.setThickness(step, side),
        setSpin: (a, b) => ctrl.setSpin(a, b),
        setPower: (V0) => ctrl.setPower(V0),
        setElevation: (theta) => ctrl.setElevation(theta),
        shoot: () => ctrl.shoot(),
        setSpeed: (speed) => ctrl.setSpeed(speed),
        placeBall: (id, x, y) => ctrl.placeBall(id, x, y),
        undo: () => ctrl.undo(),
        restart: () => ctrl.restart(),
        exit: () => ctrl.exit(),
    }), [ctrl]);

    return useMemo<Simulator>(() => {
        const { core, aux } = snap;
        return {
            phase: core.phase,
            config: aux.setup?.config ?? null,
            params: aux.setup?.params ?? null,
            session: core.session,
            balls: core.balls,
            input: core.input,
            cueBallId: cueBallIdOf(core.session),
            preview: aux.preview,
            playback: { duration: aux.duration, playing: core.phase === "shooting", speed: aux.speed },
            outcomeLast: core.outcomeLast,
            mismatches: core.mismatches,
            offline: core.offline,
            record: core.record,
            syncing: aux.syncing,
            queued: core.queue.length,
            serverSessionId: core.serverSessionId,
            canUndo: !core.record && core.undo.length > 0 && (core.phase === "aim" || core.phase === "finished"),
            canPlace: !core.record && core.phase === "aim",
            actions,
            frameAt: ctrl.frameAt,
        };
    }, [snap, actions, ctrl]);
}
