/**
 * useSimulator — 시뮬레이터 상태 기계 훅(README "useSimulator API"). 실제 일은 SimController 가 하고,
 * 이 훅은 컨트롤러를 React 에 잇는다: useSyncExternalStore 로 스냅샷(core + aux)을 구독하고, 안정적인 actions 와
 * frameAt 을 돌려준다. 렌더링은 화면(SimulatorPage)이 맡는다 — 훅은 그릴 공(frameAt)과 상태만 준다.
 *
 * 재렌더 규칙: phase·session·balls·input·preview·outcome·speed·syncing 같은 드문 변화만 React 상태.
 * 재생 프레임 값(t, 그 시각의 공)은 frameAt(now) 로 읽는다 — rAF 마다 React 를 깨우지 않는다.
 * 토스트는 훅이 띄우지 않는다. onMismatch/onOffline/onOutcome/onMiscue/onMatch 콜백으로 화면이 i18n 문구를 고른다.
 *
 * 네트워크 대전(README "네트워크 대전 A"): actions.startMatch(match) 로 열면 mode="match", match 에 대전 뷰가 실린다.
 * 상대 차례는 phase="waiting"(입력 잠금, 폴링), 상대 샷은 phase="shooting" + replaying 으로 재생된다.
 */
import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { BallState, SimResult } from "@shared/sim/types";
import type { SimParams } from "@shared/sim/params";
import type { SessionState, ShotOutcome } from "@shared/sim/rules";
import type { SimSetupConfig } from "./setupPresets";
import { simApi, type SimApi } from "./simApi";
import type { ChatLine, MatchApi, MatchEndReason, MatchPublic, MatchStatus, PlayerIndex } from "./matchApi";
import { cueBallIdOf, type CueInput, type Phase, type SimMode } from "./simReducer";
import {
    SimController,
    type ChatSendResult, type PlaybackSpeed, type SimCallbacks, type SimFrame, type SimPreview, type StartOptions,
} from "./simController";

export type { SimFrame, SimPreview, StartOptions, PlaybackSpeed, OfflineReason, MatchEvent, ChatSendResult } from "./simController";
export type { CueInput, Phase, SimMode } from "./simReducer";
export type { ChatLine, MatchPublic, MatchStatus, MatchEndReason, PlayerIndex } from "./matchApi";

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
    /** 테스트·주입용. 기본 matchApi */
    readonly matchApi?: MatchApi;
}

export interface SimulatorActions {
    /** setup → aim. 서버 세션 개설은 record 일 때 백그라운드로. */
    start(config: SimSetupConfig, opts?: StartOptions): void;
    /**
     * 네트워크 대전 열기(GET /sim/matches/:id 의 행). 내 차례면 aim, 상대 차례면 waiting, 끝났으면 finished.
     * 행에 state/balls 가 없거나(참가 전) 내가 참가자가 아니면 false.
     */
    startMatch(match: MatchPublic): boolean;
    setInput(patch: Partial<CueInput>): void;
    setPhi(phi: number): void;
    nudgePhi(deltaRad: number): void;
    /** 두께 단계(aim.THICKNESS_STEPS)와 방향으로 가장 가까운 적구를 겨눈다(4구는 상대 큐볼 제외). */
    /** 두께 맞추기. side 를 안 주면 지금 겨누는 쪽으로 맞춘다. */
    setThickness(step: number, side?: "left" | "right"): void;
    /** 당점 (a, b) R 비율. 0.5R 밖은 미스큐 링으로 클램프. */
    setSpin(a: number, b: number): void;
    /** 당점 프리셋: 세로만 정확히 맞추고 옆당점은 링 안으로 줄인다. */
    setSpinVertical(b: number): void;
    /** m/s, [0.2, 9] */
    setPower(V0: number): void;
    /** rad, [0, 20°] */
    setElevation(theta: number): void;
    /** aim 에서만. 로컬 시뮬 → 판정 → 재생 시작 → (record) 서버 전송. 대전이면 POST /sim/matches/:id/shots. */
    shoot(): Promise<void>;
    /** 재생 배속. 재생이 끝나면 1 로 돌아온다. */
    setSpeed(speed: PlaybackSpeed): void;
    /** 연습 모드 + aim 에서만. 배치가 유효하지 않으면 false. */
    placeBall(id: string, x: number, y: number): boolean;
    /** 연습 모드에서만. */
    undo(): void;
    /** 같은 설정으로 새 세션(솔로만). */
    restart(): void;
    /** 세션 닫기(솔로: finished 또는 abandoned) → setup. 대전은 서버에 그대로 남는다. */
    exit(): Promise<void>;
    /** 대전: 기권 → finished(상대 승). 성공하면 true. */
    resign(): Promise<boolean>;
    /** 대전: 승리 주장(match.canClaim 일 때만 뜻이 있다). 성공하면 true, 아직 이르면 false + onMatch("claim-too-early"). */
    claim(): Promise<boolean>;
    /** 대전: 지금 서버 상태를 한 번 읽는다(당겨서 새로고침). */
    sync(): void;
    /** 대전: 40초 룰 시간 초과 처리(화면의 시계가 0 이 되면 부른다 — 내 차례 40초 / 상대 차례 50초). 성공하면 true. */
    timeout(): Promise<boolean>;
    /** 이모지 인사(대전). 거부 사유를 돌려준다. */
    /** 한마디 보내기. 자유 입력은 { text }, 고정 인사는 { code }. */
    sendChat(body: { text?: string; code?: string; clientKey?: string }): Promise<ChatSendResult>;
}

/** 네트워크 대전 뷰(mode="match" 에서만). 이름은 players 순서(0 호스트·흰 공, 1 게스트·노란 공). */
export interface MatchView {
    readonly id: string;
    readonly myIndex: PlayerIndex;
    readonly myCueBallId: "white" | "yellow";
    readonly names: readonly [string, string];
    readonly myName: string;
    readonly opponentName: string;
    /** 서버가 아는 차례 */
    readonly turn: number;
    readonly isMyTurn: boolean;
    readonly status: MatchStatus;
    readonly version: number;
    readonly winnerIndex: PlayerIndex | null;
    /** finished 사유. target·inningCap(샷으로 끝남) / resign / claim */
    readonly endReason: MatchEndReason | null;
    /** ISO. 이 시각부터 상대가 안 치면 승리 주장 가능 */
    readonly claimableAt: string | null;
    /** 상대 차례 + claimableAt 지남(폴링마다 다시 계산) */
    readonly canClaim: boolean;
    /** playing 이면 기권 가능 */
    readonly canResign: boolean;
    /** 지금 재생 중인 샷이 상대 샷(따라잡기) */
    readonly opponentShot: boolean;
    /** 40초 룰: 시계 기준 시각(ISO, 서버 시계). 없으면 시계가 안 돈다. */
    readonly turnSeenAt: string | null;
    /** 서버 시각 − 이 기기 시각(ms). 남은 초 = 40 − (Date.now() + offset − turnSeenAt)/1000 */
    readonly serverOffsetMs: number;
    /** 쓰리아웃: [호스트, 게스트] 시간 초과 횟수(SHOT_CLOCK_STRIKES 가 되면 실격패). */
    readonly timeouts: readonly [number, number];
    /** 지금 이 대전을 보고 있는 관전자 수(2026-09-12). 표시용 — 판정에는 쓰지 않는다. */
    readonly watchers: number;
    /** 상대가 자리를 비웠다(2026-09-15). 시계 시작이 늦어지는 이유를 화면이 알려 줄 때 쓴다. */
    readonly opponentAway: boolean;
    /** 핸디전(참가할 때 서버가 두 사람 에버리지로 다마수를 정한 방) */
    readonly handicap: boolean;
    /** 상대가 지금 겨누는 방향(rad). 상대 차례에만 온다 — 큐대를 그려 "지켜보는" 느낌을 만든다. */
    readonly opponentAim: { readonly phi: number; readonly at: string } | null;
    /** 두 선수의 국가(ISO alpha-2, [호스트, 게스트]). 헤더 국기용 — 없는 사람은 null. */
    readonly countries: readonly [string | null, string | null];
    /** 이 대전에서 오간 한마디(오래된 것부터). 내가 보낸 것도 들어 있다. */
    readonly chat: readonly ChatLine[];
    /**
     * 지금 글을 쓸 수 있나 — **서버가 보는 차례**로 판단한다(로컬 세션 턴이 아니라).
     * 내가 친 직후엔 로컬 턴이 먼저 넘어가지만 서버의 turn 은 샷이 실제로 기록될 때까지 아직 나다.
     * 그 창에서 쓴 글은 409 로 거부되므로, 애초에 입력칸을 내주지 않는다.
     */
    readonly canChat: boolean;
}

export interface Simulator {
    readonly phase: Phase;
    /** solo(연습·기록 세션) | match(네트워크 대전) */
    readonly mode: SimMode;
    /** 대전 뷰. 솔로면 null */
    readonly match: MatchView | null;
    /** 따라잡기 재생 중(이 기기에서 친 샷이 아니다). 화면은 "상대 샷" 칩을 띄운다 */
    readonly replaying: boolean;
    readonly config: SimSetupConfig | null;
    readonly params: SimParams | null;
    readonly session: SessionState | null;
    /** 정지 상태의 공(마지막 샷의 final 또는 서버 스냅). 재생 중 그릴 공은 frameAt(). */
    readonly balls: readonly BallState[];
    readonly input: CueInput;
    /** 현재 차례의 큐볼(대전에서 상대 차례면 상대 큐볼) */
    readonly cueBallId: "white" | "yellow";
    /** aim 에서만 non-null. 입력이 바뀌면 30 ms 뒤 갱신. */
    readonly preview: SimPreview | null;
    readonly playback: { readonly duration: number; readonly playing: boolean; readonly speed: PlaybackSpeed };
    readonly outcomeLast: ShotOutcome | null;
    /** 마지막으로 시뮬레이션한 샷의 원본 결과(재생 시작 시점 갱신, 되돌리기·새 세션에 null). 읽기 전용 — 샷 분석 표시용. */
    readonly lastResult: SimResult | null;
    readonly mismatches: number;
    /** 솔로: 서버 기록 포기됨(로컬 플레이는 계속). 대전: 내 샷 전송이 끊김(폴링 계속, 연결이 돌아오면 다시 보낸다) */
    readonly offline: boolean;
    readonly record: boolean;
    /** 서버 호출 진행 중(대전 폴링 제외) */
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
            matchApi: options.matchApi,
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
        onMatch: options.onMatch,
        onMatchBase: options.onMatchBase,
    });

    useEffect(() => { ctrl.setMuted(options.muted === true); }, [ctrl, options.muted]);
    useEffect(() => () => { ctrl.dispose(); }, [ctrl]);

    const snap = useSyncExternalStore(ctrl.subscribe, ctrl.getSnapshot, ctrl.getSnapshot);

    const actions = useMemo<SimulatorActions>(() => ({
        start: (config, opts) => ctrl.start(config, opts),
        startMatch: (match) => ctrl.startMatch(match),
        setInput: (patch) => ctrl.setInput(patch),
        setPhi: (phi) => ctrl.setPhi(phi),
        nudgePhi: (d) => ctrl.nudgePhi(d),
        setThickness: (step, side) => ctrl.setThickness(step, side),
        setSpin: (a, b) => ctrl.setSpin(a, b),
        setSpinVertical: (b) => ctrl.setSpinVertical(b),
        setPower: (V0) => ctrl.setPower(V0),
        setElevation: (theta) => ctrl.setElevation(theta),
        shoot: () => ctrl.shoot(),
        setSpeed: (speed) => ctrl.setSpeed(speed),
        placeBall: (id, x, y) => ctrl.placeBall(id, x, y),
        undo: () => ctrl.undo(),
        restart: () => ctrl.restart(),
        exit: () => ctrl.exit(),
        resign: () => ctrl.resign(),
        claim: () => ctrl.claim(),
        sync: () => ctrl.sync(),
        timeout: () => ctrl.timeout(),
        sendChat: (body) => ctrl.sendChat(body),
    }), [ctrl]);

    return useMemo<Simulator>(() => {
        const { core, aux } = snap;
        const m = core.mode === "match" && core.match && core.session ? core.match : null;
        const match: MatchView | null = m && core.session ? {
            id: m.matchId,
            myIndex: m.myIndex,
            myCueBallId: core.session.players[m.myIndex]?.cueBallId ?? (m.myIndex === 0 ? "white" : "yellow"),
            names: m.myIndex === 0 ? [m.myName, m.opponentName] : [m.opponentName, m.myName],
            myName: m.myName,
            opponentName: m.opponentName,
            turn: m.turn,
            isMyTurn: m.status === "playing" && core.session.turn === m.myIndex,
            status: m.status,
            version: m.version,
            winnerIndex: m.winnerIndex,
            endReason: m.endReason,
            claimableAt: m.claimableAt,
            canClaim: ctrl.canClaim(),
            canResign: m.status === "playing",
            opponentShot: core.replayOf !== null && core.replayOf !== m.myIndex,
            turnSeenAt: m.turnSeenAt,
            serverOffsetMs: aux.serverOffsetMs,
            timeouts: m.timeouts ?? [0, 0],
            watchers: m.watchers ?? 0,
            opponentAway: m.opponentAway === true,
            handicap: m.handicap === true,
            opponentAim: m.opponentAim ?? null,
            countries: m.countries ?? [null, null],
            chat: aux.chat,
            // 차례는 안 본다(2026-09-18) — 내 차례 대화창은 말풍선을 눌러 직접 연다. 보낼 샷이 남은 동안만 막는다
            // (그 창에선 서버 상태가 아직 내 샷을 모른다).
            canChat: m.status === "playing" && core.queue.length === 0,
        } : null;
        return {
            phase: core.phase,
            mode: core.mode,
            match,
            replaying: core.replayOf !== null,
            config: aux.setup?.config ?? null,
            params: aux.setup?.params ?? null,
            session: core.session,
            balls: core.balls,
            input: core.input,
            cueBallId: cueBallIdOf(core.session),
            preview: aux.preview,
            playback: { duration: aux.duration, playing: core.phase === "shooting", speed: aux.speed },
            outcomeLast: core.outcomeLast,
            lastResult: aux.lastResult,
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
