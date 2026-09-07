/**
 * SimController — useSimulator 의 React 바깥 부분. 상태 기계(simReducer)에 부수효과를 붙인다:
 * 물리(simulateShot)·판정(evaluateShot/applyShot)·재생 루프(rAF)·오디오/햅틱 예약·미리보기 디바운스·서버 동기화.
 * 시계·rAF·타이머·API 를 주입받아 헤드리스로 테스트한다(simController.test.ts). 훅은 이것을 useSyncExternalStore 로 잇기만 한다.
 *
 * 서버 동기화 규칙
 *  - 모든 서버 호출은 하나의 직렬 체인(serial)으로 순서를 보장한다. 샷 idx 는 서버 shots 와 같아야 하므로
 *    shoot() 은 먼저 재전송 큐를 비운 뒤(flushLoop) 시뮬레이션한다 — 이전 샷의 미스매치 스냅이 먼저 반영된다.
 *  - 로컬 결과의 입력 객체(shot)와 hash(result.hash)를 그대로 보낸다(결정론 비교 전제).
 *  - 미스매치 응답: 재생 중이면 재생이 끝난 뒤 서버 final/state 로 스냅(pendingSnap) + onMismatch 1회.
 *  - 네트워크 실패: 큐에 넣고 다음 샷 전에 재전송, MAX_RETRIES 뒤 포기 → offline(로컬 플레이 계속, 기록 중단) + onOffline.
 *  - 응답만 유실된 재전송(IDX_MISMATCH 인데 서버 shots === idx+1)은 이미 기록된 것으로 본다(serverLanded).
 *  - 세션 개설 응답 전에 친 샷은 tries 0 으로 큐에 넣고 개설 직후 비운다.
 *  - 세대(gen) 번호로 restart/exit 이후 도착한 옛 응답을 버린다.
 *
 * 재생: playbackT = 시계(PlaybackClock)로 계산, rAF 는 끝 감지용. 화면은 frameAt(now) 로 공을 읽어 직접 그린다.
 * 4× 빨리감기는 시계 기울기만 바꾸고 예약된 오디오·햅틱은 그대로 둔다(README). 재생이 끝나면 1× 로 돌아온다.
 */
import type { BallState, ShotInput, SimResult } from "@shared/sim/types";
import type { SimParams } from "@shared/sim/params";
import { simulateShot } from "@shared/sim/simulate";
import { openingLayout } from "@shared/sim/layouts";
import { applyShot, createSession, evaluateShot, type SessionState, type ShotOutcome } from "@shared/sim/rules";
import type { SimSetupConfig } from "./setupPresets";
import { buildPreviewPaths, type PreviewPaths } from "./overlay/paths";
import { SimAudio } from "./audio";
import { SimHaptics } from "./haptics";
import {
    clockTime, effectiveBall, eventsForFeedback, makePlayback, startClock, withSpeed,
    type Playback, type PlaybackClock,
} from "./playback";
import {
    classifyApiError, isRetryable, serverShotsFromError,
    type CloseStatus, type SessionPlayer, type ShotResponse, type SimApi,
} from "./simApi";
import {
    createSimStore, cueBallIdOf, paramsFromConfig, thicknessPhi,
    type CueInput, type PendingShot, type SimCoreState, type SimStore,
} from "./simReducer";

export type PlaybackSpeed = 1 | 4;

/** 화면이 매 프레임 그릴 것. */
export interface SimFrame {
    readonly balls: readonly BallState[];
    /** 재생 시각 (s). 재생 중이 아니면 마지막 재생의 끝(없으면 0). */
    readonly t: number;
    readonly duration: number;
    readonly playing: boolean;
    readonly speed: PlaybackSpeed;
}

export interface SimPreview {
    readonly result: SimResult;
    /** Overlay 의 preview 로 그대로 넘긴다. */
    readonly paths: PreviewPaths;
    /** 이 미리보기를 만든 입력 */
    readonly input: ShotInput;
}

export interface StartOptions {
    /** 서버 기록 여부. 기본 true. false = 연습(되돌리기·자유 배치 허용, 서버 호출 없음). */
    readonly record?: boolean;
    /** 2인 로컬 대전. 생략하면 1인(서버가 요청자 회원으로 기록). */
    readonly players?: readonly SessionPlayer[];
}

export type OfflineReason = "session-create" | "shot-retries" | "shot-rejected";

export interface SimCallbacks {
    /** 서버 결과로 스냅한 직후(샷당 최대 1회). 인자는 이 세션의 누적 미스매치 수. */
    readonly onMismatch?: (mismatches: number) => void;
    /** 서버 기록을 포기한 순간 1회. 이후 샷은 로컬에만 남는다. */
    readonly onOffline?: (reason: OfflineReason) => void;
    /** 재생이 끝나 공이 멈춘 뒤(스냅 반영 후). 토스트·이닝 시트 갱신용. */
    readonly onOutcome?: (outcome: ShotOutcome, session: SessionState) => void;
    /** 당점이 미스큐 범위라 샷이 거부됐다(setSpin 이 클램프하므로 정상 경로에선 나오지 않는다). */
    readonly onMiscue?: () => void;
}

export interface SimSetup {
    readonly config: SimSetupConfig;
    readonly params: SimParams;
    readonly players?: readonly SessionPlayer[];
}

/** 스토어 밖의 화면 상태(드물게 바뀌는 것만). 프레임 값은 frameAt 으로. */
export interface SimAux {
    readonly setup: SimSetup | null;
    readonly preview: SimPreview | null;
    readonly speed: PlaybackSpeed;
    /** 서버 호출이 진행 중(세션 개설·샷 전송·재전송) */
    readonly syncing: boolean;
    /** 마지막 재생의 길이 (s) */
    readonly duration: number;
}

export interface SimSnapshot {
    readonly core: SimCoreState;
    readonly aux: SimAux;
}

export interface ControllerDeps {
    readonly api: SimApi;
    /** ms. 기본 performance.now */
    readonly now?: () => number;
    readonly raf?: (cb: () => void) => number;
    readonly caf?: (handle: number) => void;
    readonly setTimer?: (cb: () => void, ms: number) => unknown;
    readonly clearTimer?: (handle: unknown) => void;
    /** useGameAudio().getCtx — 제스처로 잠금 해제된 공유 AudioContext. 없으면 무음. */
    readonly getAudioContext?: () => AudioContext | null;
    /** 기본 true */
    readonly haptics?: boolean;
    /** 미리보기 디바운스 (ms). 기본 30 */
    readonly previewDelayMs?: number;
}

const INITIAL_AUX: SimAux = { setup: null, preview: null, speed: 1, syncing: false, duration: 0 };
/** exit 가 진행 중인 서버 호출을 기다리는 상한 (ms). */
export const EXIT_SYNC_WAIT_MS = 3000;

function defaultNow(): number {
    return typeof performance !== "undefined" ? performance.now() : Date.now();
}
function defaultRaf(cb: () => void): number {
    if (typeof requestAnimationFrame === "function") return requestAnimationFrame(() => cb());
    return setTimeout(cb, 16) as unknown as number;
}
function defaultCaf(h: number): void {
    if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(h);
    else clearTimeout(h as unknown as ReturnType<typeof setTimeout>);
}
const noop = (): void => { /* noop */ };

/** 세션을 닫을 때의 상태. 로컬이 끝났어도 기록이 빠졌으면(offline·큐 잔여) 성적에 반영하지 않는다. */
export function closeStatusFor(s: Pick<SimCoreState, "session" | "offline" | "queue">): CloseStatus {
    return s.session?.status === "finished" && !s.offline && s.queue.length === 0 ? "finished" : "abandoned";
}

function toShotInput(cueBallId: string, i: CueInput): ShotInput {
    return { cueBallId, phi: i.phi, V0: i.V0, a: i.a, b: i.b, theta: i.theta };
}

export class SimController {
    readonly store: SimStore;
    private readonly deps: ControllerDeps;
    private readonly now: () => number;
    private aux: SimAux = INITIAL_AUX;
    private snapshot: SimSnapshot | null = null;
    private readonly subs = new Set<() => void>();
    private callbacks: SimCallbacks = {};
    private pb: Playback | null = null;
    private clock: PlaybackClock;
    private rafHandle: number | null = null;
    private previewTimer: unknown = null;
    private previewKey: { balls: readonly BallState[]; input: CueInput; session: SessionState } | null = null;
    private chain: Promise<void> = Promise.resolve();
    private pending = 0;
    private gen = 0;
    private shooting = false;
    private muted = false;
    private audio: SimAudio | null = null;
    private haptics: SimHaptics | null = null;
    private disposed = false;
    private readonly unsubStore: () => void;

    constructor(deps: ControllerDeps) {
        this.deps = deps;
        this.now = deps.now ?? defaultNow;
        this.store = createSimStore();
        this.clock = startClock(this.now(), 1);
        this.unsubStore = this.store.subscribe(() => this.onStoreChange());
    }

    /* ------------------------------------------------------------ 구독 (useSyncExternalStore) */

    readonly subscribe = (cb: () => void): (() => void) => {
        this.subs.add(cb);
        return () => { this.subs.delete(cb); };
    };

    readonly getSnapshot = (): SimSnapshot => {
        if (this.snapshot === null) this.snapshot = { core: this.store.get(), aux: this.aux };
        return this.snapshot;
    };

    getAux(): SimAux {
        return this.aux;
    }

    setCallbacks(cb: SimCallbacks): void {
        this.callbacks = cb;
    }

    setMuted(muted: boolean): void {
        this.muted = muted;
        this.audio?.setMuted(muted);
    }

    private notify(): void {
        this.snapshot = null;
        for (const cb of Array.from(this.subs)) cb();
    }

    private setAux(patch: Partial<SimAux>): void {
        this.aux = { ...this.aux, ...patch };
        this.notify();
    }

    private onStoreChange(): void {
        this.snapshot = null;
        this.schedulePreview();
        this.notify();
    }

    /* ------------------------------------------------------------ 프레임 */

    readonly frameAt = (now: number = this.now()): SimFrame => {
        const s = this.store.get();
        const pb = this.pb;
        if (s.phase === "shooting" && pb) {
            const t = Math.min(pb.duration, clockTime(this.clock, now));
            return { balls: pb.at(t), t, duration: pb.duration, playing: true, speed: this.aux.speed };
        }
        const duration = pb ? pb.duration : 0;
        return { balls: s.balls, t: duration, duration, playing: false, speed: this.aux.speed };
    };

    /* ------------------------------------------------------------ 세션 수명 */

    start(config: SimSetupConfig, opts: StartOptions = {}): void {
        if (this.disposed) return;
        const prev = this.store.get();
        this.gen++;
        this.stopLoop();
        this.cancelFeedback();
        this.pb = null;
        if (prev.phase !== "setup" && prev.record && prev.serverSessionId) {
            this.closeQuietly(prev.serverSessionId, closeStatusFor(prev));
        }
        const record = opts.record ?? true;
        const params = paramsFromConfig(config);
        const players = opts.players && opts.players.length > 0 ? opts.players : undefined;
        const session = createSession({
            rules: config.rules, finishType: config.finishType, inningCap: config.inningCap,
            players: players ?? [{ id: "p1", target: config.target }],
        });
        const balls = openingLayout(config.gameType, params.table, "white");
        this.setAux({ setup: { config, params, players }, preview: null, duration: 0, speed: 1 });
        this.store.dispatch({ type: "start", session, balls, record });
        if (record) this.openServerSession(config, balls, players);
    }

    restart(): void {
        const s = this.store.get();
        const setup = this.aux.setup;
        if (this.disposed || s.phase === "setup" || !setup) return;
        this.gen++;
        this.stopLoop();
        this.cancelFeedback();
        this.pb = null;
        if (s.record && s.serverSessionId) this.closeQuietly(s.serverSessionId, closeStatusFor(s));
        const { config, params, players } = setup;
        const session = createSession({
            rules: config.rules, finishType: config.finishType, inningCap: config.inningCap,
            players: players ?? [{ id: "p1", target: config.target }],
        });
        const balls = openingLayout(config.gameType, params.table, "white");
        this.setAux({ preview: null, duration: 0, speed: 1 });
        this.store.dispatch({ type: "restart", session, balls });
        if (s.record) this.openServerSession(config, balls, players);
    }

    /** 세션 종료. 서버 세션은 finished(정상 종료·기록 완전) 또는 abandoned 로 닫는다. 닫기 호출까지 기다린다. */
    async exit(): Promise<void> {
        let s = this.store.get();
        if (s.phase === "setup") return;
        this.stopLoop();
        this.cancelFeedback();
        // 마지막 샷 전송이 아직 진행 중이면 잠깐 기다린다 — 그 결과(성공/오프라인)가 닫기 상태를 정한다.
        if (s.record && s.serverSessionId && this.pending > 0) {
            await this.waitChain(EXIT_SYNC_WAIT_MS);
            s = this.store.get();
            if (s.phase === "setup") return;
        }
        const id = s.serverSessionId;
        const status = closeStatusFor(s);
        const record = s.record;
        this.gen++;
        this.pb = null;
        this.clearPreviewTimer();
        this.previewKey = null;
        this.setAux({ ...INITIAL_AUX });
        this.store.dispatch({ type: "exit" });
        if (record && id) {
            try { await this.deps.api.closeSession(id, status); } catch { /* 이미 닫혔거나 오프라인 */ }
        }
    }

    /** 언마운트. 열려 있는 서버 세션은 조용히 닫는다. */
    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.gen++;
        this.stopLoop();
        this.clearPreviewTimer();
        this.cancelFeedback();
        this.audio?.dispose();
        this.audio = null;
        this.unsubStore();
        const s = this.store.get();
        if (s.phase !== "setup" && s.record && s.serverSessionId) this.closeQuietly(s.serverSessionId, closeStatusFor(s));
        this.subs.clear();
    }

    /* ------------------------------------------------------------ 입력 */

    setInput(patch: Partial<CueInput>): void {
        this.store.dispatch({ type: "setInput", patch });
    }
    setPhi(phi: number): void {
        this.setInput({ phi });
    }
    nudgePhi(deltaRad: number): void {
        this.setInput({ phi: this.store.get().input.phi + deltaRad });
    }
    /** 두께 단계(1·¾·½·⅓·¼·⅛)와 방향으로 가장 가까운 적구(4구는 상대 큐볼 제외)를 겨눈다. */
    setThickness(step: number, side: "left" | "right"): void {
        const s = this.store.get();
        const setup = this.aux.setup;
        if (s.phase !== "aim" || !s.session || !setup) return;
        const phi = thicknessPhi(s.balls, cueBallIdOf(s.session), s.session.rules.gameType, step, side, setup.params.table.ball.R);
        if (phi !== null) this.setInput({ phi });
    }
    /** 당점 (a, b) — R 비율. 반지름 0.5R 밖은 미스큐 링으로 클램프된다. */
    setSpin(a: number, b: number): void {
        this.setInput({ a, b });
    }
    setPower(V0: number): void {
        this.setInput({ V0 });
    }
    setElevation(theta: number): void {
        this.setInput({ theta });
    }

    /** 연습 모드 + aim 에서만. 배치가 유효하지 않으면 false. */
    placeBall(id: string, x: number, y: number): boolean {
        const setup = this.aux.setup;
        if (!setup) return false;
        const before = this.store.get();
        this.store.dispatch({ type: "placeBall", id, x, y, table: setup.params.table });
        return this.store.get() !== before;
    }

    undo(): void {
        this.store.dispatch({ type: "undo" });
    }

    /* ------------------------------------------------------------ 샷 */

    async shoot(): Promise<void> {
        if (this.shooting || this.disposed) return;
        let s = this.store.get();
        const setup = this.aux.setup;
        if (s.phase !== "aim" || !s.session || !setup) return;
        this.shooting = true;
        const gen = this.gen;
        try {
            // 순서 보장: 이전 샷의 전송·재전송이 끝난 뒤(그 미스매치 스냅이 반영된 뒤) 시뮬레이션한다.
            // 서버 세션이 아직 없으면(개설 응답 대기) 기다리지 않는다 — 샷은 큐에 들어가 개설 직후 순서대로 나간다.
            if (s.record && !s.offline && s.serverSessionId) await this.serial(() => this.flushLoop(gen));
            if (gen !== this.gen) return;
            s = this.store.get();
            if (s.phase !== "aim" || !s.session) return;

            const cueBallId = cueBallIdOf(s.session);
            const shot = toShotInput(cueBallId, s.input);
            let result: SimResult;
            try {
                result = simulateShot(s.balls, shot, setup.params);
            } catch {
                this.callbacks.onMiscue?.();
                return;
            }
            const outcome = evaluateShot(result.events, cueBallId, s.session.rules, result.truncated);
            const applied = applyShot(s.session, outcome);
            const idx = s.shotIdx;

            this.store.dispatch({
                type: "shoot", input: shot, final: result.final, clientHash: result.hash,
                session: applied.session, outcome: applied.outcome,
            });
            this.scheduleFeedback(result);
            this.startPlayback(makePlayback(result, effectiveBall(setup.params)));

            if (s.record && !s.offline) {
                const cur = this.store.get();
                const pending: PendingShot = { idx, input: shot, clientHash: result.hash, tries: 0 };
                if (cur.serverSessionId && cur.queue.length === 0) {
                    const sessionId = cur.serverSessionId;
                    void this.serial(async () => { if (gen === this.gen) await this.postOne(gen, sessionId, pending); });
                } else {
                    // 세션 개설 응답 대기 중이거나 앞선 샷이 큐에 있다 → 순서대로 뒤에 붙인다.
                    this.store.dispatch({ type: "queueShot", idx, input: shot, clientHash: result.hash });
                }
            }
        } finally {
            this.shooting = false;
        }
    }

    /* ------------------------------------------------------------ 재생 */

    setSpeed(speed: PlaybackSpeed): void {
        if (this.aux.speed === speed) return;
        this.clock = withSpeed(this.clock, this.now(), speed);
        this.setAux({ speed });
    }

    private startPlayback(pb: Playback): void {
        this.pb = pb;
        this.clock = startClock(this.now(), this.aux.speed);
        this.setAux({ duration: pb.duration });
        if (pb.duration <= 0) { this.endPlayback(); return; }
        this.loop();
    }

    private loop(): void {
        const raf = this.deps.raf ?? defaultRaf;
        this.rafHandle = raf(() => {
            this.rafHandle = null;
            if (this.disposed) return;
            const pb = this.pb;
            if (this.store.get().phase !== "shooting" || !pb) return;
            if (clockTime(this.clock, this.now()) >= pb.duration) { this.endPlayback(); return; }
            this.loop();
        });
    }

    private stopLoop(): void {
        if (this.rafHandle !== null) {
            (this.deps.caf ?? defaultCaf)(this.rafHandle);
            this.rafHandle = null;
        }
    }

    private endPlayback(): void {
        this.stopLoop();
        const before = this.store.get();
        const snapped = before.pendingSnap !== null;
        this.store.dispatch({ type: "playbackEnd" });
        if (this.aux.speed !== 1) this.setSpeed(1);
        const after = this.store.get();
        if (snapped) this.callbacks.onMismatch?.(after.mismatches);
        if (after.outcomeLast && after.session) this.callbacks.onOutcome?.(after.outcomeLast, after.session);
    }

    /* ------------------------------------------------------------ 오디오·햅틱 */

    private scheduleFeedback(result: SimResult): void {
        const events = eventsForFeedback(result);
        const getCtx = this.deps.getAudioContext;
        if (getCtx) {
            if (!this.audio) {
                this.audio = new SimAudio(getCtx);
                this.audio.setMuted(this.muted);
            }
            let ctx: AudioContext | null = null;
            try { ctx = getCtx(); } catch { ctx = null; }
            this.audio.cancel();
            this.audio.schedule(events, ctx ? ctx.currentTime : 0);
        }
        if (this.deps.haptics !== false) {
            if (!this.haptics) this.haptics = new SimHaptics();
            this.haptics.cancel();
            this.haptics.schedule(events, this.now());
        }
    }

    private cancelFeedback(): void {
        this.audio?.cancel();
        this.haptics?.cancel();
    }

    /* ------------------------------------------------------------ 미리보기 */

    private schedulePreview(): void {
        const s = this.store.get();
        const setup = this.aux.setup;
        if (s.phase !== "aim" || !s.session || !setup) {
            this.clearPreviewTimer();
            this.previewKey = null;
            if (this.aux.preview !== null) this.setAux({ preview: null });
            return;
        }
        const k = this.previewKey;
        if (k && k.balls === s.balls && k.input === s.input && k.session === s.session) return;
        this.previewKey = { balls: s.balls, input: s.input, session: s.session };
        this.clearPreviewTimer();
        const setTimer = this.deps.setTimer ?? ((cb, ms) => setTimeout(cb, ms));
        this.previewTimer = setTimer(() => { this.previewTimer = null; this.computePreview(); }, this.deps.previewDelayMs ?? 30);
    }

    private clearPreviewTimer(): void {
        if (this.previewTimer !== null) {
            (this.deps.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>)))(this.previewTimer);
            this.previewTimer = null;
        }
    }

    private computePreview(): void {
        const s = this.store.get();
        const setup = this.aux.setup;
        if (this.disposed || s.phase !== "aim" || !s.session || !setup) return;
        const cueBallId = cueBallIdOf(s.session);
        const shot = toShotInput(cueBallId, s.input);
        try {
            const result = simulateShot(s.balls, shot, setup.params);
            const paths = buildPreviewPaths(result, { cueBallId, gameType: s.session.rules.gameType });
            this.setAux({ preview: { result, paths, input: shot } });
        } catch {
            if (this.aux.preview !== null) this.setAux({ preview: null });
        }
    }

    /* ------------------------------------------------------------ 서버 동기화 */

    /** 서버 호출을 직렬화한다. 작업 안의 예외는 작업이 스스로 처리한다. */
    private serial(task: () => Promise<void>): Promise<void> {
        this.pending++;
        if (!this.aux.syncing) this.setAux({ syncing: true });
        const run = async (): Promise<void> => {
            try { await task(); } catch { /* 작업 내부에서 처리 */ } finally {
                this.pending--;
                if (this.pending === 0 && this.aux.syncing) this.setAux({ syncing: false });
            }
        };
        const p = this.chain.then(run, run);
        this.chain = p;
        return p;
    }

    private waitChain(maxMs: number): Promise<void> {
        const setTimer = this.deps.setTimer ?? ((cb, ms) => setTimeout(cb, ms));
        return new Promise<void>((resolve) => {
            let done = false;
            const finish = (): void => { if (!done) { done = true; resolve(); } };
            this.chain.then(finish, finish);
            setTimer(finish, maxMs);
        });
    }

    private openServerSession(config: SimSetupConfig, balls: readonly BallState[], players?: readonly SessionPlayer[]): void {
        const gen = this.gen;
        void this.serial(async () => {
            try {
                const r = await this.deps.api.createSession(config, balls, players);
                if (gen !== this.gen) {
                    // 응답이 오기 전에 나갔거나 다시 시작했다 — 서버에 열린 채로 남기지 않는다.
                    try { await this.deps.api.closeSession(r.session.id, "abandoned"); } catch { noop(); }
                    return;
                }
                this.store.dispatch({ type: "serverSession", id: r.session.id, session: r.state });
            } catch {
                if (gen !== this.gen) return;
                const was = this.store.get().offline;
                this.store.dispatch({ type: "serverUnavailable" });
                if (!was) this.callbacks.onOffline?.("session-create");
                return;
            }
            await this.flushLoop(gen);
        });
    }

    /** 큐를 idx 순으로 비운다. 실패하면(재시도 대기·포기) 멈춘다 — 뒤 샷을 먼저 보내면 서버가 거부한다. */
    private async flushLoop(gen: number): Promise<void> {
        for (;;) {
            if (gen !== this.gen) return;
            const s = this.store.get();
            if (!s.record || s.offline || !s.serverSessionId || s.queue.length === 0) return;
            const head = s.queue[0];
            const ok = await this.postOne(gen, s.serverSessionId, head);
            if (!ok) return;
            if (this.store.get().queue.some((q) => q.idx === head.idx)) return;
        }
    }

    private async postOne(gen: number, sessionId: string, p: PendingShot): Promise<boolean> {
        let res: ShotResponse;
        try {
            res = await this.deps.api.postShot(sessionId, { idx: p.idx, input: p.input, clientHash: p.clientHash });
        } catch (e) {
            if (gen !== this.gen) return false;
            const kind = classifyApiError(e);
            if (kind === "idx-mismatch" && serverShotsFromError(e) === p.idx + 1) {
                // 응답만 유실됐던 재전송: 서버는 이미 이 샷을 갖고 있다.
                this.store.dispatch({ type: "serverLanded", idx: p.idx });
                return true;
            }
            const retryable = isRetryable(kind);
            const was = this.store.get().offline;
            this.store.dispatch({ type: "serverFail", idx: p.idx, input: p.input, clientHash: p.clientHash, retryable });
            if (!was && this.store.get().offline) this.callbacks.onOffline?.(retryable ? "shot-retries" : "shot-rejected");
            return false;
        }
        if (gen !== this.gen) return false;
        const before = this.store.get();
        this.store.dispatch({
            type: "serverAck", idx: p.idx, mismatch: res.mismatch, final: res.final, session: res.state, outcome: res.outcome,
        });
        // 재생 중이면 playbackEnd 가 스냅과 알림을 맡는다. 아니면 즉시 스냅했으니 지금 알린다.
        if (res.mismatch && before.phase !== "shooting") this.callbacks.onMismatch?.(this.store.get().mismatches);
        return true;
    }

    private closeQuietly(id: string, status: CloseStatus): void {
        void this.serial(async () => {
            try { await this.deps.api.closeSession(id, status); } catch { noop(); }
        });
    }
}
