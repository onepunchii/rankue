/**
 * SimController — useSimulator 의 React 바깥 부분. 상태 기계(simReducer)에 부수효과를 붙인다:
 * 물리(simulateShot)·판정(evaluateShot/applyShot)·재생 루프(rAF)·오디오/햅틱 예약·미리보기 디바운스·서버 동기화.
 * 시계·rAF·타이머·API 를 주입받아 헤드리스로 테스트한다(simController.test.ts). 훅은 이것을 useSyncExternalStore 로 잇기만 한다.
 *
 * 서버 동기화 규칙(솔로 세션)
 *  - 모든 서버 호출은 하나의 직렬 체인(serial)으로 순서를 보장한다. 샷 idx 는 서버 shots 와 같아야 하므로
 *    shoot() 은 먼저 재전송 큐를 비운 뒤(flushLoop) 시뮬레이션한다 — 이전 샷의 미스매치 스냅이 먼저 반영된다.
 *  - 로컬 결과의 입력 객체(shot)와 hash(result.hash)를 그대로 보낸다(결정론 비교 전제).
 *  - 미스매치 응답: 재생 중이면 재생이 끝난 뒤 서버 final/state 로 스냅(pendingSnap) + onMismatch 1회.
 *  - 네트워크 실패: 큐에 넣고 다음 샷 전에 재전송, MAX_RETRIES 뒤 포기 → offline(로컬 플레이 계속, 기록 중단) + onOffline.
 *  - 응답만 유실된 재전송(IDX_MISMATCH 인데 서버 shots === idx+1)은 이미 기록된 것으로 본다(serverLanded).
 *  - 세션 개설 응답 전에 친 샷은 tries 0 으로 큐에 넣고 개설 직후 비운다.
 *  - 세대(gen) 번호로 restart/exit 이후 도착한 옛 응답을 버린다.
 *
 * 네트워크 대전(startMatch, README "네트워크 대전 A")
 *  - 폴링: 상대 차례(waiting)이거나 확인 안 된 내 샷이 큐에 있는 동안 GET /sim/matches/:id — 처음 1분은 2 s, 그 뒤 5 s.
 *    화면이 다시 보이거나(visibilitychange) 창이 포커스를 얻으면 즉시 한 번 + 2 s 주기로 되돌린다.
 *  - 따라잡기: 서버 shots > 로컬 shotIdx 면 GET /shots?from= 으로 놓친 샷을 받아 preState+input 으로 로컬 재시뮬,
 *    해시가 서버와 다르면 센다. 로컬 샷과 똑같이 재생(오디오·햅틱)한 뒤 마지막에 서버 정본으로 스냅(값이 같으면 참조만 바뀐다).
 *  - 내 샷: 로컬 시뮬·재생 → POST. 409 NOT_YOUR_TURN / IDX_MISMATCH / 끝난 대전 / 400 은 재시도 큐 대신 서버 정본으로 다시 맞춘다(resync).
 *    네트워크 실패는 백오프(1·2·4 s)로 MAX_RETRIES 까지 재시도, 그래도 안 되면 offline(항목은 큐에 남는다) — 폴링이 성공하는 순간 다시 보낸다.
 *    duplicate 응답(응답만 유실)은 닿은 것으로 보고 GET 으로 배치를 맞춘다.
 *  - 기권(resign)·승리 주장(claim)은 서버 응답으로 finished. 대전은 나가도(exit) 서버에 그대로 남는다(close 없음).
 *  - 모든 대전 서버 호출도 같은 직렬 체인을 탄다 → 폴링·따라잡기·POST 가 서로 끼어들지 않는다. 재생 중이면 끝나길 기다린다(playbackDone).
 *
 * 재생: playbackT = 시계(PlaybackClock)로 계산, rAF 는 끝 감지용. 화면은 frameAt(now) 로 공을 읽어 직접 그린다.
 * 4× 빨리감기는 시계 기울기만 바꾸고 예약된 오디오·햅틱은 그대로 둔다(README). 재생이 끝나면 1× 로 돌아온다.
 */
import type { BallState, ShotInput, SimResult } from "@shared/sim/types";
import type { SimParams } from "@shared/sim/params";
import { simulateShot } from "@shared/sim/simulate";
import { openingLayout, isValidLayout } from "@shared/sim/layouts";
import { cuePhiForAim } from "./aimAssist";
import { aimAssistFor } from "./setupPresets";
import { AIM_EPS_RAD, AIM_REPORT_MS, applyShot, createSession, evaluateShot, isOpeningShot, type SessionState, type ShotOutcome } from "@shared/sim/rules";
import type { SimSetupConfig } from "./setupPresets";
import { SHORT_PREVIEW_TAIL_M, MATCH_PREVIEW_CUSHIONS, buildPreviewPaths, type PreviewPaths } from "./overlay/paths";
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
    classifyMatchError, matchApi as defaultMatchApi, matchConfig,
    type MatchApi, type MatchEndReason, type MatchPublic, type MatchShot, type PostShotResponse,
} from "./matchApi";
import {
    createSimStore, cueBallIdOf, matchStateFrom, paramsFromConfig, sameBalls, thicknessPhi,
    type CueInput, type MatchState, type PendingShot, type Phase, type SimCoreState, type SimStore,
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
    /** 개시 배치 대신 쓸 공 배치(드릴). 유효하지 않으면 개시 배치. restart() 도 이 배치로 돌아간다. */
    readonly balls?: readonly BallState[];
}

export type OfflineReason = "session-create" | "shot-retries" | "shot-rejected";

/**
 * 네트워크 대전 이벤트(화면이 토스트·다이얼로그를 고른다).
 *  offline         내 샷 전송이 MAX_RETRIES 번 실패했다(폴링은 계속, 연결이 돌아오면 다시 보낸다)
 *  online          그 뒤 서버 응답을 다시 받았다
 *  opponent-shot   상대 샷의 따라잡기 재생이 시작됐다(끝나면 onOutcome)
 *  finished        서버가 대전을 끝냈다(상대 결승 샷·기권·무응답 승리). 내가 부른 resign/claim 은 여기 안 온다
 *  resynced        결과가 어긋나 서버 정본으로 갈아탔다(해시 미스매치는 onMismatch 로 간다)
 *  claim-too-early 승리 주장이 아직 이르다(서버 TOO_EARLY)
 */
export type MatchEvent = "offline" | "online" | "opponent-shot" | "finished" | "resynced" | "claim-too-early" | "timeout-me" | "timeout-opponent";

export interface SimCallbacks {
    /** 서버 결과로 스냅한 직후(샷당 최대 1회). 인자는 이 세션의 누적 미스매치 수. */
    readonly onMismatch?: (mismatches: number) => void;
    /** 서버 기록을 포기한 순간 1회(솔로 세션). 이후 샷은 로컬에만 남는다. */
    readonly onOffline?: (reason: OfflineReason) => void;
    /** 재생이 끝나 공이 멈춘 뒤(스냅 반영 후). 토스트·이닝 시트 갱신용. 따라잡기 재생도 온다. */
    readonly onOutcome?: (outcome: ShotOutcome, session: SessionState, shooter: number) => void;
    /** 당점이 미스큐 범위라 샷이 거부됐다(setSpin 이 클램프하므로 정상 경로에선 나오지 않는다). */
    readonly onMiscue?: () => void;
    /** 네트워크 대전 이벤트. */
    readonly onMatch?: (event: MatchEvent) => void;
}

export interface SimSetup {
    readonly config: SimSetupConfig;
    readonly params: SimParams;
    readonly players?: readonly SessionPlayer[];
    /** 드릴 등 사용자 지정 시작 배치 */
    readonly balls?: readonly BallState[];
}

/** 스토어 밖의 화면 상태(드물게 바뀌는 것만). 프레임 값은 frameAt 으로. */
export interface SimAux {
    readonly setup: SimSetup | null;
    readonly preview: SimPreview | null;
    readonly speed: PlaybackSpeed;
    /** 서버 호출이 진행 중(세션 개설·샷 전송·재전송·기권·승리 주장). 대전 폴링은 여기 안 잡힌다. */
    readonly syncing: boolean;
    /** 마지막 재생의 길이 (s) */
    readonly duration: number;
    /**
     * 마지막으로 시뮬레이션한 샷의 원본 결과(내 샷·따라잡기 재생 모두, 재생 시작 시점에 갱신). 화면의 샷 분석
     * (다이아몬드 시스템 "시스템 vs 실제")용 읽기 전용 값. 세션 시작·다시하기·되돌리기·나가기에 지운다.
     * 서버 스냅이 와도 이 값은 로컬 물리 결과 그대로다(이벤트는 서버 것으로 바꾸지 않는다).
     */
    readonly lastResult: SimResult | null;
    /** 서버 시각 − 이 기기 시각(ms). 대전 폴링마다 갱신 — 40초 시계는 서버 시각 기준으로 센다. */
    readonly serverOffsetMs: number;
}

export interface SimSnapshot {
    readonly core: SimCoreState;
    readonly aux: SimAux;
}

export interface ControllerDeps {
    readonly api: SimApi;
    /** 네트워크 대전 API. 기본 matchApi */
    readonly matchApi?: MatchApi;
    /** ms. 기본 performance.now */
    readonly now?: () => number;
    /** epoch ms(승리 주장 가능 시각 비교용). 기본 Date.now */
    readonly wallClock?: () => number;
    readonly raf?: (cb: () => void) => number;
    readonly caf?: (handle: number) => void;
    readonly setTimer?: (cb: () => void, ms: number) => unknown;
    readonly clearTimer?: (handle: unknown) => void;
    /** 화면이 다시 보이거나 창이 포커스를 얻을 때 cb. 해제 함수를 돌려준다. 기본: document visibilitychange + window focus */
    readonly onWake?: (cb: () => void) => () => void;
    /** useGameAudio().getCtx — 제스처로 잠금 해제된 공유 AudioContext. 없으면 무음. */
    readonly getAudioContext?: () => AudioContext | null;
    /** 기본 true */
    readonly haptics?: boolean;
    /** 미리보기 디바운스 (ms). 기본 30 */
    readonly previewDelayMs?: number;
}

const INITIAL_AUX: SimAux = { setup: null, preview: null, speed: 1, syncing: false, duration: 0, lastResult: null, serverOffsetMs: 0 };
/** exit 가 진행 중인 서버 호출을 기다리는 상한 (ms). */
export const EXIT_SYNC_WAIT_MS = 3000;
/** 대전 폴링 주기: 상대 차례가 된 뒤 처음 1분은 빠르게, 그 뒤 느리게. */
export const POLL_FAST_MS = 2000;
export const POLL_SLOW_MS = 5000;
export const POLL_FAST_WINDOW_MS = 60_000;
/** 대전 샷 전송 재시도 백오프(k번째 실패 뒤 대기). */
export const RETRY_BACKOFF_MS: readonly number[] = [1000, 2000, 4000];

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

function defaultOnWake(cb: () => void): () => void {
    if (typeof document === "undefined" || typeof window === "undefined") return noop;
    const onVisible = (): void => { if (document.visibilityState === "visible") cb(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", cb);
    return () => {
        document.removeEventListener("visibilitychange", onVisible);
        window.removeEventListener("focus", cb);
    };
}

/** 세션을 닫을 때의 상태. 로컬이 끝났어도 기록이 빠졌으면(offline·큐 잔여) 성적에 반영하지 않는다. */
export function closeStatusFor(s: Pick<SimCoreState, "session" | "offline" | "queue">): CloseStatus {
    return s.session?.status === "finished" && !s.offline && s.queue.length === 0 ? "finished" : "abandoned";
}

function toShotInput(cueBallId: string, i: CueInput): ShotInput {
    return { cueBallId, phi: i.phi, V0: i.V0, a: i.a, b: i.b, theta: i.theta };
}

/** 내 샷으로 끝난 대전의 사유(서버 simMatch 와 같은 식: 승자가 목표에 닿았으면 target, 아니면 inningCap). */
export function endReasonFor(res: Pick<PostShotResponse, "winnerIndex" | "state">): MatchEndReason {
    const w = res.winnerIndex;
    if (w === null) return "inningCap";
    const p = res.state.players[w];
    return p && p.score >= p.target ? "target" : "inningCap";
}

/** 세션의 핵심(차례·상태·샷 수·선수 점수/이닝)이 같은가 — 샷 없이 차례가 넘어간 것(시간 초과)을 알아채는 용도. */
function sameSessionCore(a: SessionState, b: SessionState): boolean {
    if (a.turn !== b.turn || a.status !== b.status || a.shotCount !== b.shotCount || a.winnerIndex !== b.winnerIndex) return false;
    if (a.players.length !== b.players.length) return false;
    for (let i = 0; i < a.players.length; i++) {
        const p = a.players[i], q = b.players[i];
        if (p.score !== q.score || p.innings !== q.innings || p.highRun !== q.highRun || p.currentRun !== q.currentRun) return false;
    }
    return true;
}

export class SimController {
    readonly store: SimStore;
    private readonly deps: ControllerDeps;
    private readonly now: () => number;
    private readonly matchApi: MatchApi;
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
    private loud = 0;
    private gen = 0;
    private shooting = false;
    private muted = false;
    private audio: SimAudio | null = null;
    private haptics: SimHaptics | null = null;
    private disposed = false;
    private readonly unsubStore: () => void;
    /* 네트워크 대전 */
    private pollTimer: unknown = null;
    private pollInFlight = false;
    /** 40초 시계 시작(ack)을 이미 시도한 대전 버전 — 서버가 거부해도 같은 버전엔 다시 안 보낸다. */
    private ackedVersion = -1;
    private waitingSince = 0;
    private lastPhase: Phase = "setup";
    private retryTimer: unknown = null;
    private unwake: (() => void) | null = null;
    private playbackWaiters: (() => void)[] = [];
    private matchOfflineNotified = false;

    constructor(deps: ControllerDeps) {
        this.deps = deps;
        this.now = deps.now ?? defaultNow;
        this.matchApi = deps.matchApi ?? defaultMatchApi;
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
        const s = this.store.get();
        if (s.phase === "waiting" && this.lastPhase !== "waiting") this.waitingSince = this.now();
        this.lastPhase = s.phase;
        this.schedulePreview();
        this.schedulePoll();
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
        this.matchCleanup();
        this.pb = null;
        if (prev.phase !== "setup" && prev.mode === "solo" && prev.record && prev.serverSessionId) {
            this.closeQuietly(prev.serverSessionId, closeStatusFor(prev));
        }
        const record = opts.record ?? true;
        const params = paramsFromConfig(config);
        const players = opts.players && opts.players.length > 0 ? opts.players : undefined;
        const session = createSession({
            rules: config.rules, finishType: config.finishType, inningCap: config.inningCap,
            players: players ?? [{ id: "p1", target: config.target }],
        });
        const custom = opts.balls && isValidLayout(opts.balls, params.table) ? opts.balls : undefined;
        const balls = custom ?? openingLayout(config.gameType, params.table, "white");
        this.setAux({ setup: { config, params, players, balls: custom }, preview: null, duration: 0, speed: 1, lastResult: null });
        this.store.dispatch({ type: "start", session, balls, record, aimAssist: aimAssistFor(config.mode) });
        if (record) this.openServerSession(config, balls, players);
    }

    /**
     * 네트워크 대전 시작(참가자로 열린 대전 행). 내 차례면 aim, 아니면 waiting(폴링). 끝난 대전은 finished 로 열린다.
     * 행에 state/balls 가 없거나(참가 전) 내가 참가자가 아니면 false.
     */
    startMatch(m: MatchPublic): boolean {
        if (this.disposed) return false;
        if (m.myIndex !== 0 && m.myIndex !== 1) return false;
        if (!m.state || !m.balls) return false;
        if (m.status !== "playing" && m.status !== "finished") return false;
        const prev = this.store.get();
        this.gen++;
        this.stopLoop();
        this.cancelFeedback();
        this.matchCleanup();
        this.pb = null;
        if (prev.phase !== "setup" && prev.mode === "solo" && prev.record && prev.serverSessionId) {
            this.closeQuietly(prev.serverSessionId, closeStatusFor(prev));
        }
        const config = matchConfig(m);
        const params = paramsFromConfig(config);
        const match = matchStateFrom(m, m.myIndex);
        this.waitingSince = this.now();
        this.setAux({ setup: { config, params }, preview: null, duration: 0, speed: 1, lastResult: null });
        this.store.dispatch({ type: "startMatch", match, session: m.state, balls: m.balls, shots: m.shots, aimAssist: m.aimAssist ?? true });
        this.unwake = (this.deps.onWake ?? defaultOnWake)(() => this.wake());
        this.schedulePoll();
        return true;
    }

    restart(): void {
        const s = this.store.get();
        const setup = this.aux.setup;
        if (this.disposed || s.phase === "setup" || s.mode === "match" || !setup) return;
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
        const balls = setup.balls ?? openingLayout(config.gameType, params.table, "white");
        this.setAux({ preview: null, duration: 0, speed: 1, lastResult: null });
        this.store.dispatch({ type: "restart", session, balls, aimAssist: aimAssistFor(config.mode) });
        if (s.record) this.openServerSession(config, balls, players);
    }

    /**
     * 세션 종료. 솔로: 서버 세션을 finished(정상 종료·기록 완전) 또는 abandoned 로 닫고 닫기 호출까지 기다린다.
     * 대전: 서버에 그대로 남는다(목록에서 다시 이어간다). 진행 중인 샷 전송은 뒤에서 마저 끝난다.
     */
    async exit(): Promise<void> {
        let s = this.store.get();
        if (s.phase === "setup") return;
        this.stopLoop();
        this.cancelFeedback();
        if (s.mode === "match") {
            this.gen++;
            this.matchCleanup();
            this.pb = null;
            this.clearPreviewTimer();
            this.previewKey = null;
            this.setAux({ ...INITIAL_AUX });
            this.store.dispatch({ type: "exit" });
            return;
        }
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

    /** 언마운트. 열려 있는 솔로 서버 세션은 조용히 닫는다. 대전은 남긴다. */
    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.gen++;
        this.stopLoop();
        this.clearPreviewTimer();
        if (this.aimTimer !== null) { this.clearTimer(this.aimTimer); this.aimTimer = null; }
        this.cancelFeedback();
        this.matchCleanup();
        this.audio?.dispose();
        this.audio = null;
        this.unsubStore();
        const s = this.store.get();
        if (s.phase !== "setup" && s.mode === "solo" && s.record && s.serverSessionId) this.closeQuietly(s.serverSessionId, closeStatusFor(s));
        this.subs.clear();
    }

    /* ------------------------------------------------------------ 입력 */

    setInput(patch: Partial<CueInput>): void {
        this.store.dispatch({ type: "setInput", patch });
        this.reportAim();
    }

    /* ── 상대에게 내 조준 보여 주기(2026-09-16 오너: "멀티가 너무 정적이다") ──
     * 기다리는 쪽 화면에 내 큐대가 그려진다. 모든 입력이 setInput 을 지나므로 여기 한 곳에서만 재면 된다.
     * 아끼는 규칙 둘: 마지막 전송에서 AIM_REPORT_MS 가 지나야 하고, 각도가 AIM_EPS_RAD 이상 달라져야 한다.
     * 가만히 겨누고 있으면 요청이 아예 없다. 간격에 걸린 변화는 버리지 않고 남은 시간 뒤에 한 번 보낸다(trailing)
     * — 안 그러면 손을 멈춘 마지막 각도가 상대에게 영영 안 간다.
     */
    private aimSent: { phi: number; at: number; turn: number; matchId: string } | null = null;
    private aimTimer: unknown = null;

    private reportAim(): void {
        if (this.disposed || !this.matchApi.sendAim) return;
        const s = this.store.get();
        if (s.mode !== "match" || !s.match || s.match.status !== "playing" || s.phase !== "aim") return;
        if (s.match.turn !== s.match.myIndex) return;
        const last = this.aimSent;
        const fresh = !last || last.matchId !== s.match.matchId || last.turn !== s.match.turn;
        if (fresh) { this.sendAimNow(); return; }
        if (Math.abs(s.input.phi - last.phi) < AIM_EPS_RAD) return;
        const wait = Math.max(0, AIM_REPORT_MS - (this.now() - last.at));
        if (wait === 0) { this.sendAimNow(); return; }
        if (this.aimTimer === null) {
            this.aimTimer = this.setTimer(() => { this.aimTimer = null; this.sendAimNow(); }, wait);
        }
    }

    /** 지금 상태를 다시 읽고 보낸다(예약된 전송이 도착했을 때 옛 각도를 보내지 않으려고). 실패는 조용히 — 표시용 값이다. */
    private sendAimNow(): void {
        if (this.disposed || !this.matchApi.sendAim) return;
        const s = this.store.get();
        if (s.mode !== "match" || !s.match || s.match.status !== "playing" || s.phase !== "aim") return;
        if (s.match.turn !== s.match.myIndex) return;
        this.aimSent = { phi: s.input.phi, at: this.now(), turn: s.match.turn, matchId: s.match.matchId };
        void this.matchApi.sendAim(s.match.matchId, s.input.phi).catch(() => undefined);
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
        const aim = thicknessPhi(s.balls, cueBallIdOf(s.session), s.session.rules.gameType, step, side, setup.params.table.ball.R, isOpeningShot(s.session, s.balls));
        // 두께는 공이 가는 방향으로 정해지므로, 보정 켜짐이면 큐 방향으로 바꿔 저장한다(옆당점이 있으면 스쿼트만큼 반대로)
        if (aim !== null) this.setInput({ phi: cuePhiForAim(aim, s.input.a, s.aimAssist) });
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
        // 되돌린 샷의 결과는 더 이상 "마지막 샷"이 아니다
        if (this.aux.lastResult !== null) this.setAux({ lastResult: null });
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
            // 대전은 항상 체인을 기다린다(진행 중인 폴링·따라잡기·재전송이 끝나야 내 차례가 확실하다).
            if (s.mode === "match") await this.serial(() => this.flushMatch(gen));
            else if (s.record && !s.offline && s.serverSessionId) await this.serial(() => this.flushLoop(gen));
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
            const outcome = evaluateShot(result.events, cueBallId, s.session.rules, result.truncated, { opening: isOpeningShot(s.session, s.balls) });
            const applied = applyShot(s.session, outcome);
            const idx = s.shotIdx;

            this.store.dispatch({
                type: "shoot", input: shot, final: result.final, clientHash: result.hash,
                session: applied.session, outcome: applied.outcome,
            });
            this.scheduleFeedback(result);
            this.startPlayback(makePlayback(result, effectiveBall(setup.params)), result);

            if (s.mode === "match") {
                const cur = this.store.get();
                const pending: PendingShot = { idx, input: shot, clientHash: result.hash, tries: 0 };
                if (cur.match && cur.queue.length === 0 && !cur.offline) {
                    const matchId = cur.match.matchId;
                    void this.serial(async () => { if (gen === this.gen) await this.postMatchShot(gen, matchId, pending); });
                } else {
                    // 앞 샷이 아직 확인되지 않았거나 연결이 끊겨 있다 → 순서대로 뒤에 붙인다(폴링 성공 때 나간다).
                    this.store.dispatch({ type: "queueShot", idx, input: shot, clientHash: result.hash });
                }
            } else if (s.record && !s.offline) {
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

    /** 재생 시작. result 는 그 재생의 원본 결과(aux.lastResult 로 화면에 노출). */
    private startPlayback(pb: Playback, result: SimResult): void {
        this.pb = pb;
        this.clock = startClock(this.now(), this.aux.speed);
        this.setAux({ duration: pb.duration, lastResult: result });
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
        if (after.outcomeLast && after.session) this.callbacks.onOutcome?.(after.outcomeLast, after.session, after.shooterLast);
        this.afterMeta(before, after);
        this.resolvePlaybackWaiters();
    }

    /** 재생이 끝날 때까지(또는 세대가 바뀔 때까지). 재생 중이 아니면 바로. */
    private playbackDone(): Promise<void> {
        if (this.store.get().phase !== "shooting") return Promise.resolve();
        return new Promise<void>((resolve) => { this.playbackWaiters.push(resolve); });
    }

    private resolvePlaybackWaiters(): void {
        const waiters = this.playbackWaiters;
        this.playbackWaiters = [];
        for (const w of waiters) w();
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
            // 대전은 기본으로 짧은 미리보기(첫 접촉 + 꼬리, 쿠션 번호 없음) — 방장이 '미리보기 전체' 를 켜면 연습처럼
            const short = s.mode === "match" && setup.config.matchPreview !== "full";
            const paths = buildPreviewPaths(result, {
                cueBallId, gameType: s.session.rules.gameType,
                // 쿠션 제한(2026-09-16): 가락이 전 구간 보여 화면만 보고 각을 맞추던 것을 막는다.
                ...(short ? { cutoff: { kind: "first-contact" as const, tailM: SHORT_PREVIEW_TAIL_M, maxCushions: MATCH_PREVIEW_CUSHIONS } } : {}),
            });
            this.setAux({ preview: { result, paths, input: shot } });
        } catch {
            if (this.aux.preview !== null) this.setAux({ preview: null });
        }
    }

    /* ------------------------------------------------------------ 서버 동기화(공통) */

    /** 서버 호출을 직렬화한다. 작업 안의 예외는 작업이 스스로 처리한다. quiet 면 syncing 표시에 잡히지 않는다(폴링). */
    private serial(task: () => Promise<void>, quiet = false): Promise<void> {
        this.pending++;
        if (!quiet) {
            this.loud++;
            if (!this.aux.syncing) this.setAux({ syncing: true });
        }
        const run = async (): Promise<void> => {
            try { await task(); } catch { /* 작업 내부에서 처리 */ } finally {
                this.pending--;
                if (!quiet) {
                    this.loud--;
                    if (this.loud === 0 && this.aux.syncing) this.setAux({ syncing: false });
                }
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

    private setTimer(cb: () => void, ms: number): unknown {
        return (this.deps.setTimer ?? ((c, m) => setTimeout(c, m)))(cb, ms);
    }

    private clearTimer(handle: unknown): void {
        (this.deps.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>)))(handle);
    }

    /* ------------------------------------------------------------ 서버 동기화(솔로 세션) */

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

    /* ------------------------------------------------------------ 네트워크 대전 */

    /** 지금 승리를 주장할 수 있는가(상대 차례 + claimableAt 지남). 화면은 폴링마다 다시 계산한다. */
    canClaim(): boolean {
        const s = this.store.get();
        if (s.mode !== "match" || !s.match || s.match.status !== "playing" || s.phase !== "waiting" || s.match.claimableAt === null) return false;
        const at = Date.parse(s.match.claimableAt);
        return Number.isFinite(at) && at <= (this.deps.wallClock ?? Date.now)();
    }

    /**
     * 40초 룰 시간 초과 처리. 내 차례면 40초, 상대 차례면 50초(유예 10초) 뒤에 화면이 부른다 — 판정은 서버 시계.
     * 성공하면 응답의 대전 행으로 맞춘다(샷 없이 차례가 바뀌므로 세션 스냅). 아직 이르면(409 TOO_EARLY) 조용히 false.
     */
    /** 이모지 인사 보내기. 서버가 거부하면(너무 자주·횟수 소진) 이유를 돌려준다. */
    async sendEmoji(code: string): Promise<"ok" | "too-fast" | "limit" | "failed"> {
        const s = this.store.get();
        if (this.disposed || s.mode !== "match" || !s.match || s.match.status !== "playing" || !this.matchApi.sendEmoji) return "failed";
        const gen = this.gen;
        const id = s.match.matchId;
        let out: "ok" | "too-fast" | "limit" | "failed" = "failed";
        await this.serial(async () => {
            try {
                const m = await this.matchApi.sendEmoji!(id, code);
                if (gen !== this.gen) return;
                await this.applyMatchUpdate(gen, m);
                out = "ok";
            } catch (e) {
                const code2 = (e as { data?: { code?: string } })?.data?.code;
                out = code2 === "TOO_FAST" ? "too-fast" : code2 === "LIMIT" ? "limit" : "failed";
            }
        });
        return out;
    }

    async timeout(): Promise<boolean> {
        const s = this.store.get();
        if (this.disposed || s.mode !== "match" || !s.match || s.match.status !== "playing" || !this.matchApi.timeout) return false;
        const gen = this.gen;
        const id = s.match.matchId;
        let ok = false;
        await this.serial(async () => {
            try {
                const m = await this.matchApi.timeout!(id);
                if (gen !== this.gen) return;
                await this.applyMatchUpdate(gen, m);
                ok = true;
            } catch (e) {
                if (gen !== this.gen) return;
                if (classifyMatchError(e) !== "too-early") await this.resync(gen);
            }
        });
        return ok;
    }

    /** 40초 시계를 시작해야 하는가: 내 차례 조준 화면인데 서버에 아직 시각이 없다. 버전당 한 번만 시도한다(서버가 거부해도 루프 없음). */
    private needsAck(s: SimCoreState): boolean {
        return s.mode === "match" && !!s.match && s.match.status === "playing" && s.phase === "aim"
            && s.match.turn === s.match.myIndex && s.match.turnSeenAt === null && this.ackedVersion !== s.match.version;
    }

    /** 지금 서버 상태를 한 번 읽는다(당겨서 새로고침). 상대 차례가 아니어도 된다. */
    sync(): void {
        this.pollNow();
    }

    /** 기권. 서버가 상대 승으로 끝내면 finished. 이미 끝났거나 실패하면 서버 정본으로 다시 맞추고 false. */
    async resign(): Promise<boolean> {
        const s = this.store.get();
        if (this.disposed || s.mode !== "match" || !s.match || s.match.status !== "playing") return false;
        const gen = this.gen;
        const id = s.match.matchId;
        let ok = false;
        await this.serial(async () => {
            try {
                const r = await this.matchApi.resign(id);
                if (gen !== this.gen || r.status !== "finished") return;
                const cur = this.store.get();
                if (cur.mode !== "match" || !cur.match) return;
                this.store.dispatch({
                    type: "matchSync",
                    match: { ...cur.match, status: "finished", winnerIndex: r.winnerIndex, endReason: "resign", claimableAt: null, version: cur.match.version + 1 },
                });
                ok = true;
            } catch {
                if (gen === this.gen) await this.resync(gen);
            }
        });
        return ok;
    }

    /** 승리 주장(상대가 48시간 넘게 안 쳤을 때). 아직 이르면 onMatch("claim-too-early") + 서버 값으로 갱신하고 false. */
    async claim(): Promise<boolean> {
        const s = this.store.get();
        if (this.disposed || s.mode !== "match" || !s.match || s.match.status !== "playing") return false;
        const gen = this.gen;
        const id = s.match.matchId;
        let ok = false;
        await this.serial(async () => {
            try {
                const r = await this.matchApi.claim(id);
                if (gen !== this.gen) return;
                const cur = this.store.get();
                if (cur.mode !== "match" || !cur.match) return;
                this.store.dispatch({
                    type: "matchSync",
                    match: { ...cur.match, status: "finished", winnerIndex: r.winnerIndex, endReason: "claim", claimableAt: null, version: cur.match.version + 1 },
                });
                ok = true;
            } catch (e) {
                if (gen !== this.gen) return;
                if (classifyMatchError(e) === "too-early") this.callbacks.onMatch?.("claim-too-early");
                await this.resync(gen);
            }
        });
        return ok;
    }

    private matchCleanup(): void {
        this.clearPollTimer();
        if (this.retryTimer !== null) { this.clearTimer(this.retryTimer); this.retryTimer = null; }
        if (this.unwake) { this.unwake(); this.unwake = null; }
        this.matchOfflineNotified = false;
        this.resolvePlaybackWaiters();
    }

    /**
     * 대전 폴링: 상대 차례(waiting)와 보낼 샷이 남았을 때, 그리고 **내 차례 조준 중에도** 느린 주기로.
     * 조준 중 폴링은 40초 룰의 자리 표시(host/guest_seen_at)를 살려 둔다 — 이게 없으면 서버가 나를 "자리 비움"으로 보고
     * 상대가 건 시간 초과를 무르며 시계를 지운다(2026-09-08 리뷰).
     */
    private shouldPoll(s: SimCoreState): boolean {
        return s.mode === "match" && s.match !== null && s.match.status === "playing"
            && (s.phase === "waiting" || s.phase === "aim" || (s.queue.length > 0 && s.phase !== "shooting" && s.phase !== "setup"));
    }

    private clearPollTimer(): void {
        if (this.pollTimer !== null) { this.clearTimer(this.pollTimer); this.pollTimer = null; }
    }

    private schedulePoll(): void {
        if (this.disposed) return;
        const s = this.store.get();
        if (!this.shouldPoll(s)) { this.clearPollTimer(); return; }
        if (this.pollTimer !== null || this.pollInFlight) return;
        // 40초 시계를 시작해야 하면 바로(ack 폴링). 내 차례 조준 중에는 자리 표시만 살리면 되므로 언제나 느린 주기(5 s).
        // 상대 차례(waiting)는 결과를 빨리 받아야 하니 처음 1분은 2 s.
        const delay = this.needsAck(s) ? 0
            : s.phase === "aim" ? POLL_SLOW_MS
                : this.now() - this.waitingSince < POLL_FAST_WINDOW_MS ? POLL_FAST_MS : POLL_SLOW_MS;
        this.pollTimer = this.setTimer(() => { this.pollTimer = null; this.pollNow(); }, delay);
    }

    private wake(): void {
        const s = this.store.get();
        if (s.mode !== "match" || !s.match || s.match.status !== "playing" || s.phase === "shooting" || s.phase === "setup") return;
        this.waitingSince = this.now();
        this.clearPollTimer();
        this.pollNow();
    }

    private pollNow(): void {
        const s = this.store.get();
        if (this.disposed || this.pollInFlight || s.mode !== "match" || !s.match || s.match.status !== "playing") return;
        this.pollInFlight = true;
        const gen = this.gen;
        const id = s.match.matchId;
        const version = s.match.version;
        const ack = this.needsAck(s);
        if (ack) this.ackedVersion = version;
        void this.serial(async () => {
            try {
                let m: MatchPublic;
                try { m = await this.matchApi.getMatch(id, ack ? { ack: true } : undefined); } catch { return; }   // 다음 주기에 다시
                if (gen !== this.gen) return;
                await this.applyMatchUpdate(gen, m);
            } finally {
                this.pollInFlight = false;
                if (gen === this.gen) this.schedulePoll();
            }
        }, true);
    }

    /** 폴링·확인 응답 뒤: 오프라인 해제·서버 종료 알림. */
    private afterMeta(before: SimCoreState, after: SimCoreState): void {
        if (after.mode !== "match") return;
        if (this.matchOfflineNotified && before.offline && !after.offline) {
            this.matchOfflineNotified = false;
            this.callbacks.onMatch?.("online");
        }
        if (before.match && after.match && before.match.status !== "finished" && after.match.status === "finished") {
            this.callbacks.onMatch?.("finished");
        }
    }

    private dispatchMeta(meta: MatchState): void {
        const before = this.store.get();
        this.store.dispatch({ type: "matchSync", match: meta });
        this.afterMeta(before, this.store.get());
    }

    private snapToServer(m: MatchPublic, meta: MatchState, opts: { count: boolean; notify: "mismatch" | "resynced" | null }): void {
        if (!m.state || !m.balls) return;
        const before = this.store.get();
        this.store.dispatch({ type: "matchSnap", match: meta, session: m.state, balls: m.balls, shots: m.shots, mismatch: opts.count });
        const after = this.store.get();
        if (opts.notify === "mismatch") this.callbacks.onMismatch?.(after.mismatches);
        else if (opts.notify === "resynced") this.callbacks.onMatch?.("resynced");
        this.afterMeta(before, after);
    }

    /**
     * 서버 대전 행을 로컬에 맞춘다(직렬 체인 안에서만). 재생 중이면 끝나길 기다린다.
     *  1. 서버가 이미 가진 내 샷은 큐에서 뺀다. 남은 큐가 있으면(연결이 돌아왔다) 다시 보낸다.
     *  2. 서버 shots > 로컬이면 놓친 샷을 재생으로 따라잡는다. 그 밖의 어긋남은 서버 정본으로 스냅.
     *  3. 메타(차례·상태·claimableAt) 갱신.
     */
    private async applyMatchUpdate(gen: number, m: MatchPublic): Promise<void> {
        let s = this.store.get();
        if (gen !== this.gen || s.mode !== "match" || !s.match || s.match.matchId !== m.id) return;
        // 서버 시각 보정(40초 시계) — 응답마다 갱신. 이 기기 시계가 몇 초 틀려도 두 사람이 같은 시계를 본다.
        if (m.serverNow) {
            const st = Date.parse(m.serverNow);
            if (Number.isFinite(st)) {
                const off = st - (this.deps.wallClock ?? Date.now)();
                if (Math.abs(off - this.aux.serverOffsetMs) > 500) this.setAux({ serverOffsetMs: off });
            }
        }
        if (s.phase === "shooting") {
            await this.playbackDone();
            if (gen !== this.gen) return;
            s = this.store.get();
            if (s.mode !== "match" || !s.match) return;
        }
        const meta = matchStateFrom(m, s.match.myIndex);
        if (!m.state || !m.balls) { this.dispatchMeta(meta); return; }

        for (const q of s.queue) if (q.idx < m.shots) this.store.dispatch({ type: "serverLanded", idx: q.idx });
        s = this.store.get();
        if (s.queue.length > 0) {
            if (s.queue[0].idx !== m.shots) { this.snapToServer(m, meta, { count: false, notify: "resynced" }); return; }
            this.dispatchMeta(meta);            // offline 해제 + tries 0
            await this.flushMatch(gen);
            return;
        }
        if (m.shots > s.shotIdx) { await this.replayMissed(gen, m, meta); return; }
        if (m.shots < s.shotIdx) { this.snapToServer(m, meta, { count: false, notify: "resynced" }); return; }
        if (!sameBalls(m.balls, s.balls)) { this.snapToServer(m, meta, { count: true, notify: "mismatch" }); return; }
        // 샷 수·공은 같은데 세션이 다르다 = 샷 없이 차례가 넘어갔다(40초 시간 초과). 서버 정본으로 스냅하고 누가 넘겼는지 알린다.
        if (s.session && !sameSessionCore(m.state, s.session)) {
            const iTimedOut = s.session.turn === meta.myIndex && m.state.turn !== s.session.turn;
            const theyTimedOut = s.session.turn !== meta.myIndex && m.state.turn !== s.session.turn;
            this.snapToServer(m, meta, { count: false, notify: null });
            if (iTimedOut) this.callbacks.onMatch?.("timeout-me");
            else if (theyTimedOut) this.callbacks.onMatch?.("timeout-opponent");
            return;
        }
        this.dispatchMeta(meta);
    }

    /** 놓친 샷(idx ≥ 로컬 shotIdx, < 서버 shots)을 받아 하나씩 재시뮬·재생한 뒤 서버 정본으로 마무리한다. */
    private async replayMissed(gen: number, m: MatchPublic, meta: MatchState): Promise<void> {
        const from = this.store.get().shotIdx;
        let shots: readonly MatchShot[];
        try { shots = await this.matchApi.getShots(m.id, from); } catch { return; }   // 다음 폴링이 다시
        if (gen !== this.gen) return;
        const setup = this.aux.setup;
        if (!setup) return;
        let anyMismatch = false;
        let complete = true;
        for (const shot of shots) {
            if (shot.idx >= m.shots) break;      // GET 사이에 더 들어온 샷은 다음 폴링에서(m.balls 와 맞추기 위해)
            const s = this.store.get();
            if (gen !== this.gen) return;
            if (s.mode !== "match" || !s.match || !s.session) return;
            if (shot.idx !== s.shotIdx || s.session.status !== "playing" || (s.phase !== "waiting" && s.phase !== "aim")) { complete = false; break; }
            let result: SimResult;
            try { result = simulateShot(shot.preState, shot.input, setup.params); } catch { complete = false; break; }
            const outcome = evaluateShot(result.events, shot.input.cueBallId, s.session.rules, result.truncated, { opening: isOpeningShot(s.session, shot.preState) });
            let applied: ReturnType<typeof applyShot>;
            try { applied = applyShot(s.session, outcome); } catch { complete = false; break; }
            const mismatch = result.hash !== shot.hash || !sameBalls(shot.preState, s.balls);
            if (mismatch) anyMismatch = true;
            if (shot.playerIndex !== s.match.myIndex) this.callbacks.onMatch?.("opponent-shot");
            this.store.dispatch({
                type: "replayShot", input: shot.input, final: result.final, session: applied.session, outcome: applied.outcome,
                playerIndex: shot.playerIndex, mismatch,
            });
            if (this.store.get().phase !== "shooting") { complete = false; break; }
            this.scheduleFeedback(result);
            this.startPlayback(makePlayback(result, effectiveBall(setup.params)), result);
            await this.playbackDone();
        }
        if (gen !== this.gen) return;
        const after = this.store.get();
        if (after.mode !== "match") return;
        const consistent = complete && after.shotIdx === m.shots && sameBalls(m.balls!, after.balls);
        // 재생마다 미스매치는 이미 셌다(count:false). 값이 같으면 참조만 바뀐다.
        this.snapToServer(m, meta, { count: false, notify: anyMismatch ? "mismatch" : consistent ? null : "resynced" });
    }

    /** 서버가 내 샷을 거부했거나 응답을 해석할 수 없을 때: 로컬 샷을 버리고 서버 행으로 갈아탄다. */
    private async resync(gen: number): Promise<void> {
        const s = this.store.get();
        if (s.mode !== "match" || !s.match) return;
        let m: MatchPublic;
        try { m = await this.matchApi.getMatch(s.match.matchId); } catch { return; }   // 다음 폴링이 다시
        if (gen !== this.gen) return;
        let cur = this.store.get();
        if (cur.mode !== "match" || !cur.match || cur.match.matchId !== m.id) return;
        if (cur.phase === "shooting") {
            await this.playbackDone();
            if (gen !== this.gen) return;
            cur = this.store.get();
            if (cur.mode !== "match" || !cur.match) return;
        }
        const meta = matchStateFrom(m, cur.match.myIndex);
        if (!m.state || !m.balls) { this.dispatchMeta(meta); return; }
        const same = cur.queue.length === 0 && cur.shotIdx === m.shots && sameBalls(m.balls, cur.balls);
        this.snapToServer(m, meta, { count: false, notify: same ? null : "resynced" });
    }

    /** 대전 큐를 idx 순으로 보낸다. 실패(백오프 대기·offline·거부→resync)하면 멈춘다. */
    private async flushMatch(gen: number): Promise<void> {
        for (;;) {
            if (gen !== this.gen) return;
            const s = this.store.get();
            if (s.mode !== "match" || !s.match || s.match.status !== "playing" || s.offline || s.queue.length === 0) return;
            const head = s.queue[0];
            const ok = await this.postMatchShot(gen, s.match.matchId, head);
            if (!ok) return;
            if (this.store.get().queue.some((q) => q.idx === head.idx)) return;
        }
    }

    private scheduleRetry(gen: number, ms: number): void {
        if (this.retryTimer !== null) this.clearTimer(this.retryTimer);
        this.retryTimer = this.setTimer(() => {
            this.retryTimer = null;
            if (gen !== this.gen || this.disposed) return;
            void this.serial(() => this.flushMatch(gen));
        }, ms);
    }

    private async postMatchShot(gen: number, matchId: string, p: PendingShot): Promise<boolean> {
        let res: PostShotResponse;
        try {
            res = await this.matchApi.postShot(matchId, { idx: p.idx, input: p.input, clientHash: p.clientHash });
        } catch (e) {
            if (gen !== this.gen) return false;
            if (classifyMatchError(e) === "network") {
                this.store.dispatch({ type: "matchShotFail", idx: p.idx, input: p.input, clientHash: p.clientHash });
                const after = this.store.get();
                const entry = after.queue.find((q) => q.idx === p.idx);
                if (after.offline) {
                    if (!this.matchOfflineNotified) {
                        this.matchOfflineNotified = true;
                        this.callbacks.onMatch?.("offline");
                    }
                } else if (entry) {
                    this.scheduleRetry(gen, RETRY_BACKOFF_MS[Math.min(entry.tries, RETRY_BACKOFF_MS.length) - 1]);
                }
                return false;
            }
            // 차례 아님·순서 어긋남·끝난 대전·입력 거부·인증: 이 샷은 버리고 서버 정본으로 다시 맞춘다.
            this.store.dispatch({ type: "serverLanded", idx: p.idx });
            await this.resync(gen);
            return false;
        }
        if (gen !== this.gen) return false;
        const s = this.store.get();
        if (s.mode !== "match" || !s.match) return false;
        const meta: MatchState = {
            ...s.match,
            turn: res.turn,
            version: res.version,
            status: res.status,
            winnerIndex: res.winnerIndex,
            endReason: res.status === "finished" ? (s.match.endReason ?? endReasonFor(res)) : s.match.endReason,
            // 마지막 샷 시각이 바뀌었다 — 다음 폴링이 새 값을 준다(낡은 값으로 승리 주장 버튼이 번쩍이지 않게).
            claimableAt: null,
        };
        this.store.dispatch({
            type: "matchShotAck", idx: p.idx, match: meta, mismatch: res.mismatch,
            final: res.final, session: res.mismatch ? res.state : null, outcome: res.outcome ?? undefined,
        });
        const after = this.store.get();
        if (res.mismatch && s.phase !== "shooting") this.callbacks.onMismatch?.(after.mismatches);
        this.afterMeta(s, after);
        if (res.duplicate) {
            // 재전송의 멱등 응답엔 결과가 없다 — 행을 읽어 배치를 맞춘다(그 사이 상대 샷이 있었으면 따라잡는다).
            try {
                const m = await this.matchApi.getMatch(matchId);
                if (gen === this.gen) await this.applyMatchUpdate(gen, m);
            } catch { noop(); }
        }
        return true;
    }
}
