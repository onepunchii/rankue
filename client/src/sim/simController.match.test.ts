/**
 * SimController 네트워크 대전(mode="match") 헤드리스 테스트. 시계·rAF·타이머·wake·wallClock·대전 API 를 가짜로 주입한다.
 * FakeMatchServer 는 server/routes/modules/simMatch.ts 의 규칙(차례·idx·멱등 duplicate·기권·승리 주장)을 실제 엔진으로 흉내 낸다
 * — 상대 샷을 서버에서 치면(shootAs) 클라이언트가 폴링으로 따라잡아 같은 해시로 재생해야 한다.
 */
import { describe, it, expect, vi } from "vitest";

// simApi/matchApi 가 앱의 HTTP 층(@/lib/queryClient)을 정적으로 import 한다. vitest 에 "@" 별칭이 없어 대체한다.
vi.mock("@/lib/queryClient", () => ({ apiRequest: vi.fn() }));

import { simulateShot } from "@shared/sim/simulate";
import { openingLayout } from "@shared/sim/layouts";
import { DEFAULT_CUE, TABLES } from "@shared/sim/params";
import { applyShot, createSession, evaluateShot, isOpeningShot, DEFAULT_3C_RULES, AIM_EPS_RAD, AIM_REPORT_MS, type SessionState } from "@shared/sim/rules";
import type { BallState, ShotInput } from "@shared/sim/types";
import { MAX_RETRIES } from "./simReducer";
import type { ShotRequest, SimApi } from "./simApi";
import type { MatchApi, MatchPublic, MatchShot, PostShotResponse, PlayerIndex } from "./matchApi";
import {
    SimController, POLL_FAST_MS, POLL_SLOW_MS, POLL_FAST_WINDOW_MS, RETRY_BACKOFF_MS, endReasonFor,
    type MatchEvent,
} from "./simController";

const HOST = "host-uuid";
/** 개시 배치(흰 공 선공)에서 3쿠션 득점이 나는 입력 — 실측(엔진 결정론이라 고정값). */
/** 개시 배치에서 빨간 공 먼저 → 3쿠션 → 노란 공 득점(엔진 결정론 — 격자 탐색으로 찾은 입력, 이벤트 17개). 개시 규칙(빨간 공 먼저)을 지킨다. */
const POINT_SHOT: Partial<ShotInput> = { phi: 1.65, V0: 3, a: -0.15, b: 0 };
const GUEST = "guest-uuid";
const CLAIM_AFTER_MS = 48 * 60 * 60 * 1000;

/* ------------------------------------------------------------ 가짜 환경(시계·rAF·타이머) */

function makeEnv() {
    let now = 0;
    const rafs = new Map<number, () => void>();
    let rafId = 0;
    const timers = new Map<number, { cb: () => void; at: number }>();
    let timerId = 0;
    let wake: (() => void) | null = null;
    let wall = Date.parse("2026-09-07T00:00:00.000Z");
    const deps = {
        now: () => now,
        wallClock: () => wall,
        raf: (cb: () => void) => { rafs.set(++rafId, cb); return rafId; },
        caf: (h: number) => { rafs.delete(h); },
        setTimer: (cb: () => void, ms: number) => { timers.set(++timerId, { cb, at: now + ms }); return timerId; },
        clearTimer: (h: unknown) => { timers.delete(h as number); },
        onWake: (cb: () => void) => { wake = cb; return () => { wake = null; }; },
    };
    /** 시간을 ms 만큼 전진: 만기 타이머 실행 → rAF 한 바퀴. wall 도 같이 간다. */
    const advance = (ms: number): void => {
        now += ms;
        wall += ms;
        const due = Array.from(timers.entries()).filter(([, t]) => t.at <= now).sort((a, b) => a[1].at - b[1].at);
        for (const [id, t] of due) { timers.delete(id); t.cb(); }
        const pending = Array.from(rafs.entries());
        rafs.clear();
        for (const [, cb] of pending) cb();
    };
    return {
        deps, advance,
        hasRaf: () => rafs.size > 0,
        timerCount: () => timers.size,
        /** 남은 타이머 만기 시각(정렬) */
        timerDues: () => Array.from(timers.values()).map((t) => t.at - now).sort((a, b) => a - b),
        wakeAttached: () => wake !== null,
        wakeNow: () => { wake?.(); },
        setWall: (ms: number) => { wall = ms; },
        wall: () => wall,
    };
}

/** 마이크로태스크·직렬 체인이 가라앉을 때까지. */
async function settle(): Promise<void> {
    for (let i = 0; i < 30; i++) await new Promise<void>((r) => setImmediate(r));
}

/* ------------------------------------------------------------ 가짜 대전 서버 */

type NetMode = "ok" | "network" | "lost-response";

interface Row {
    status: MatchPublic["status"];
    guestId: string | null;
    state: SessionState;
    balls: readonly BallState[];
    turn: number;
    shots: number;
    version: number;
    winnerId: string | null;
    endReason: MatchPublic["endReason"];
    lastShotAt: number | null;
    startedAt: number;
}

class FakeMatchServer {
    readonly id = "m-1";
    readonly row: Row;
    readonly log: (MatchShot & { memberId: string })[] = [];
    mode: NetMode = "ok";
    /** getShots 가 돌려주는 해시를 망가뜨린다(결정론 깨짐 흉내). */
    tamperHash = false;
    calls = { get: 0, shots: 0, post: 0, resign: 0, claim: 0 };
    /** 상대에게 보여 줄 조준 보고(phi) — 순서대로 쌓인다. */
    aims: number[] = [];
    /** 서버에 남은 마지막 조준(한 벌만 — 실제 컬럼 aim_phi/aim_at 과 같다). */
    aim: { phi: number; from: PlayerIndex } | null = null;
    private gate: Promise<void> | null = null;
    private release_: (() => void) | null = null;
    /** 라우트 paramsFor 와 같다(컨트롤러의 paramsFromConfig 와 같은 값이어야 해시가 맞는다). */
    readonly params = { table: TABLES.DAEDAE, cue: DEFAULT_CUE, cushionModel: "han2005" as const, condition: 1 };

    constructor(private readonly wall: () => number, hostTarget = 20, guestTarget = 20) {
        this.row = {
            status: "playing", guestId: GUEST,
            state: createSession({
                rules: DEFAULT_3C_RULES, finishType: "none", inningCap: 0,
                players: [{ id: HOST, target: hostTarget, cueBallId: "white" }, { id: GUEST, target: guestTarget, cueBallId: "yellow" }],
            }),
            balls: openingLayout("3c", TABLES.DAEDAE, "white"),
            turn: 0, shots: 0, version: 1, winnerId: null, endReason: null, lastShotAt: null, startedAt: wall(),
        };
    }

    hold(): void { this.gate = new Promise<void>((r) => { this.release_ = r; }); }
    release(): void { this.release_?.(); this.release_ = null; this.gate = null; }

    public(viewer: string): MatchPublic {
        const r = this.row;
        const myIndex: -1 | PlayerIndex = viewer === HOST ? 0 : viewer === r.guestId ? 1 : -1;
        const since = r.lastShotAt ?? r.startedAt;
        return {
            id: this.id, code: "123456", status: r.status,
            gameType: "3c", tableId: "DAEDAE", cushionModel: "han2005", condition: 1,
            rules: DEFAULT_3C_RULES, finishType: "none", inningCap: 0,
            hostName: "호스트", guestName: r.guestId ? "게스트" : null, hostTarget: r.state.players[0].target, guestTarget: r.state.players[1].target,
            myIndex, turn: r.turn, shots: r.shots, version: r.version,
            state: r.state, balls: r.balls,
            winnerIndex: r.winnerId === null ? null : r.winnerId === HOST ? 0 : 1,
            endReason: r.endReason, engineVersion: "2.1.0", paramsHash: "0".repeat(16),
            createdAt: new Date(r.startedAt).toISOString(), startedAt: new Date(r.startedAt).toISOString(),
            lastShotAt: r.lastShotAt === null ? null : new Date(r.lastShotAt).toISOString(), finishedAt: null,
            claimableAt: r.status === "playing" ? new Date(since + CLAIM_AFTER_MS).toISOString() : null,
            // 내 조준은 나에게 안 보낸다(라우트 publicMatch 와 같은 규칙)
            opponentAim: this.aim && this.aim.from !== myIndex ? { phi: this.aim.phi, at: new Date(this.wall()).toISOString() } : null,
        };
    }

    /** 서버 규칙대로 샷을 기록한다(라우트 POST /shots 와 같은 순서의 검사). */
    record(viewer: string, req: ShotRequest): PostShotResponse {
        const r = this.row;
        if (r.status !== "playing") throw { status: 409, data: { code: undefined }, message: "진행 중인 대전이 아닙니다" };
        const myIndex = viewer === HOST ? 0 : 1;
        if (req.idx < r.shots) {
            const prev = this.log[req.idx];
            if (prev && prev.memberId === viewer) {
                return {
                    duplicate: true, mismatch: false, hash: prev.hash, state: r.state, turn: r.turn, version: r.version, status: r.status,
                    winnerIndex: r.winnerId === null ? null : r.winnerId === HOST ? 0 : 1,
                    final: null, outcome: null, events: [], duration: 0, truncated: false,
                };
            }
            throw { status: 409, data: { code: "IDX_MISMATCH" }, message: `샷 순서가 맞지 않습니다 (서버 ${r.shots})` };
        }
        if (r.turn !== myIndex) throw { status: 409, data: { code: "NOT_YOUR_TURN" }, message: "상대 차례입니다" };
        if (req.idx !== r.shots) throw { status: 409, data: { code: "IDX_MISMATCH" }, message: `샷 순서가 맞지 않습니다 (서버 ${r.shots})` };
        if (req.input.cueBallId !== r.state.players[r.turn].cueBallId) throw { status: 400, message: "이 차례의 큐볼이 아닙니다" };
        const result = simulateShot(r.balls, req.input, this.params);
        const outcome = evaluateShot(result.events, req.input.cueBallId, r.state.rules, result.truncated, { opening: isOpeningShot(r.state, r.balls) });
        const applied = applyShot(r.state, outcome);
        const finished = applied.session.status === "finished";
        this.log.push({
            idx: req.idx, playerIndex: myIndex, memberId: viewer, preState: r.balls, input: req.input, hash: result.hash,
            outcomeCode: applied.outcome.code, points: applied.outcome.points, cushions: applied.outcome.cushionsBeforeSecond, createdAt: "",
        });
        r.state = applied.session;
        r.balls = result.final;
        r.turn = applied.session.turn;
        r.shots++;
        r.version++;
        r.lastShotAt = this.wall();
        if (finished) {
            r.status = "finished";
            r.winnerId = applied.session.winnerIndex === null ? null : applied.session.winnerIndex === 0 ? HOST : GUEST;
            r.endReason = applied.session.winnerIndex === null ? "inningCap" : "target";
        }
        return {
            duplicate: false, mismatch: req.clientHash !== result.hash, hash: result.hash,
            state: applied.session, turn: r.turn, version: r.version, status: r.status,
            winnerIndex: r.winnerId === null ? null : r.winnerId === HOST ? 0 : 1,
            final: result.final, outcome: applied.outcome, events: result.events, duration: result.duration, truncated: result.truncated,
        };
    }

    /** 상대(또는 다른 기기)가 서버에서 친다. 상대 큐볼 쪽으로 보통 세기. */
    shootAs(viewer: string, over: Partial<ShotInput> = {}): PostShotResponse {
        const me = this.row.state.players[this.row.turn];
        const input: ShotInput = { cueBallId: me.cueBallId, phi: Math.PI, V0: 2, a: 0, b: 0, theta: 0, ...over };
        const preview = simulateShot(this.row.balls, input, this.params);
        return this.record(viewer, { idx: this.row.shots, input, clientHash: preview.hash });
    }

    finish(winnerId: string | null, endReason: MatchPublic["endReason"]): void {
        this.row.status = "finished";
        this.row.winnerId = winnerId;
        this.row.endReason = endReason;
        this.row.version++;
    }

    apiFor(viewer: string): MatchApi {
        const guard = async (): Promise<void> => {
            if (this.gate) await this.gate;
            if (this.mode === "network") throw new TypeError("Failed to fetch");
        };
        const api: MatchApi = {
            createMatch: vi.fn(async () => this.public(viewer)),
            listMatches: vi.fn(async () => [this.public(viewer)]),
            lookupCode: vi.fn(async () => this.public(viewer)),
            joinMatch: vi.fn(async () => this.public(viewer)),
            getMatch: vi.fn(async () => { this.calls.get++; await guard(); return this.public(viewer); }),
            sendAim: vi.fn(async (_id: string, phi: number) => {
                this.aims.push(phi);
                this.aim = { phi, from: (viewer === HOST ? 0 : 1) as PlayerIndex };
            }),
            getShots: vi.fn(async (_id: string, from = 0) => {
                this.calls.shots++;
                await guard();
                return this.log.filter((s) => s.idx >= from).map((s) => ({ ...s, hash: this.tamperHash ? "0".repeat(16) : s.hash }));
            }),
            postShot: vi.fn(async (_id: string, req: ShotRequest) => {
                this.calls.post++;
                const mode = this.mode;
                if (this.gate) await this.gate;
                if (mode === "network") throw new TypeError("Failed to fetch");
                const res = this.record(viewer, req);
                if (mode === "lost-response") throw new TypeError("Failed to fetch");
                return res;
            }),
            resign: vi.fn(async () => {
                this.calls.resign++;
                await guard();
                if (this.row.status !== "playing") throw { status: 409, message: "진행 중인 대전이 아닙니다" };
                const winnerId = viewer === HOST ? GUEST : HOST;
                this.finish(winnerId, "resign");
                return { status: "finished" as const, winnerIndex: (winnerId === HOST ? 0 : 1) as PlayerIndex };
            }),
            claim: vi.fn(async () => {
                this.calls.claim++;
                await guard();
                if (this.row.status !== "playing") throw { status: 409, message: "진행 중인 대전이 아닙니다" };
                const myIndex = viewer === HOST ? 0 : 1;
                if (this.row.turn === myIndex) throw { status: 409, message: "지금은 내 차례입니다" };
                const since = this.row.lastShotAt ?? this.row.startedAt;
                if (this.wall() - since < CLAIM_AFTER_MS) throw { status: 409, data: { code: "TOO_EARLY" }, message: "아직 기다려야 합니다" };
                this.finish(viewer, "claim");
                return { status: "finished" as const, winnerIndex: myIndex as PlayerIndex };
            }),
        };
        return api;
    }
}

const soloApi: SimApi = {
    createSession: vi.fn(async () => { throw new Error("솔로 API 는 대전에서 쓰이면 안 된다"); }),
    postShot: vi.fn(async () => { throw new Error("솔로 API 는 대전에서 쓰이면 안 된다"); }),
    closeSession: vi.fn(async () => { throw new Error("솔로 API 는 대전에서 쓰이면 안 된다"); }),
};

function make(viewer: string, opts: { hostTarget?: number; guestTarget?: number } = {}) {
    const env = makeEnv();
    const srv = new FakeMatchServer(env.wall, opts.hostTarget, opts.guestTarget);
    const matchApi = srv.apiFor(viewer);
    const cb = { onMismatch: vi.fn(), onOffline: vi.fn(), onOutcome: vi.fn(), onMiscue: vi.fn(), onMatch: vi.fn<(e: MatchEvent) => void>() };
    const ctrl = new SimController({ ...env.deps, api: soloApi, matchApi, haptics: false });
    ctrl.setCallbacks(cb);
    const playOut = (): void => {
        for (let i = 0; i < 60 * 60 && ctrl.store.get().phase === "shooting"; i++) env.advance(1000 / 60);
    };
    const s = () => ctrl.store.get();
    return { env, srv, cb, ctrl, matchApi, playOut, s, viewer };
}

function aimAtYellow(ctrl: SimController): void {
    ctrl.setPhi(Math.PI);
    ctrl.setPower(2);
}

/* ------------------------------------------------------------ 테스트 */

describe("대전 시작", () => {
    it("호스트(내 차례): aim, 대전 설정·파라미터·이름, 솔로 API 는 안 부른다, 조준 중에도 느린 폴링(자리 표시)", async () => {
        const m = (make(HOST));
        expect(m.ctrl.startMatch(m.srv.public(HOST))).toBe(true);
        const s = m.s();
        expect(s.mode).toBe("match");
        expect(s.phase).toBe("aim");
        expect(s.match!.myIndex).toBe(0);
        expect(s.match!.opponentName).toBe("게스트");
        expect(m.ctrl.getAux().setup!.config.target).toBe(20);
        expect(m.ctrl.getAux().setup!.params.table).toBe(TABLES.DAEDAE);
        expect(m.env.wakeAttached()).toBe(true);
        // 내 차례로 들어오면 곧바로 한 번(ack — 40초 시계 시작), 그 뒤엔 5 s 주기로 자리 표시만 남긴다.
        // 자리 표시가 끊기면 서버가 나를 "자리 비움"으로 보고 상대가 건 시간 초과를 무르며 시계를 지운다.
        m.env.advance(1);
        await settle();
        expect(m.srv.calls.get).toBe(1);                 // ack 폴링(지연 0)
        m.env.advance(POLL_FAST_MS);
        await settle();
        expect(m.srv.calls.get).toBe(1);                 // 조준 중엔 2 s 로 다시 부르지 않는다
        m.env.advance(POLL_SLOW_MS);
        await settle();
        expect(m.srv.calls.get).toBe(2);
        expect(soloApi.createSession).not.toHaveBeenCalled();
    });
    it("게스트(상대 차례): waiting, 2 s 마다 폴링, 1분 뒤엔 5 s", async () => {
        const m = (make(GUEST));
        expect(m.ctrl.startMatch(m.srv.public(GUEST))).toBe(true);
        expect(m.s().phase).toBe("waiting");
        expect(m.ctrl.getAux().preview).toBeNull();
        m.ctrl.setPower(5);
        expect(m.s().input.V0).toBe(2.5);                // 입력 잠금
        await m.ctrl.shoot();
        expect(m.s().phase).toBe("waiting");
        expect(m.env.timerDues()).toEqual([POLL_FAST_MS]);
        m.env.advance(POLL_FAST_MS);
        await settle();
        expect(m.srv.calls.get).toBe(1);
        expect(m.env.timerDues()).toEqual([POLL_FAST_MS]);
        for (let t = POLL_FAST_MS; t < POLL_FAST_WINDOW_MS; t += POLL_FAST_MS) { m.env.advance(POLL_FAST_MS); await settle(); }
        expect(m.env.timerDues()).toEqual([POLL_SLOW_MS]);
        expect(m.ctrl.getAux().syncing).toBe(false);     // 폴링은 syncing 에 잡히지 않는다
    });
    it("참가 전(state 없음)·참가자 아님·waiting 상태면 시작하지 않는다", () => {
        const m = (make(HOST));
        expect(m.ctrl.startMatch({ ...m.srv.public(HOST), state: null, balls: null })).toBe(false);
        expect(m.ctrl.startMatch({ ...m.srv.public(HOST), myIndex: -1 })).toBe(false);
        expect(m.ctrl.startMatch({ ...m.srv.public(HOST), status: "waiting" })).toBe(false);
        expect(m.s().phase).toBe("setup");
    });
    it("끝난 대전은 finished 로 열린다(기권: 세션은 playing 이었어도 승자 표시)", () => {
        const m = (make(GUEST));
        m.srv.finish(GUEST, "resign");
        expect(m.ctrl.startMatch(m.srv.public(GUEST))).toBe(true);
        expect(m.s().phase).toBe("finished");
        expect(m.s().session!.winnerIndex).toBe(1);
        expect(m.s().match!.endReason).toBe("resign");
        expect(m.env.timerDues()).toEqual([]);           // 폴링 없음
    });
});

describe("따라잡기 재생", () => {
    it("상대가 서버에서 치면 폴링 → GET shots → 같은 해시로 재생(상대 샷 표시) → 내 차례 aim, 미스매치 0, onOutcome 1회", async () => {
        const m = (make(GUEST));
        m.ctrl.startMatch(m.srv.public(GUEST));
        m.srv.shootAs(HOST);                             // 호스트가 침(보통 미스 → 게스트 차례)
        expect(m.srv.row.turn).toBe(1);
        m.env.advance(POLL_FAST_MS);
        await settle();
        expect(m.srv.calls.shots).toBe(1);
        expect((m.matchApi.getShots as ReturnType<typeof vi.fn>).mock.calls[0][1]).toBe(0);
        const s = m.s();
        expect(s.phase).toBe("shooting");
        expect(s.replayOf).toBe(0);
        expect(s.shotIdx).toBe(1);
        expect(m.cb.onMatch).toHaveBeenCalledWith("opponent-shot");
        expect(m.ctrl.frameAt(m.env.deps.now() + 100).playing).toBe(true);
        m.playOut();
        await settle();
        const after = m.s();
        expect(after.phase).toBe("aim");
        expect(after.replayOf).toBeNull();
        expect(after.mismatches).toBe(0);
        expect(after.balls).toEqual(m.srv.row.balls);
        expect(after.session).toEqual(m.srv.row.state);
        expect(after.shotIdx).toBe(1);
        expect(m.cb.onOutcome).toHaveBeenCalledTimes(1);
        expect(m.cb.onMismatch).not.toHaveBeenCalled();
        expect(m.cb.onMatch).not.toHaveBeenCalledWith("resynced");
        // 내 차례가 됐으니 폴링은 멈춘다
        expect(m.env.timerDues().filter((d) => d >= POLL_FAST_MS)).toEqual([]);
    });
    it("상대가 득점하고 이어 치면(두 샷) 샷마다 재생하고, 득점 뒤엔 계속 waiting, 미스 뒤에 aim", async () => {
        const m = (make(GUEST));
        m.ctrl.startMatch(m.srv.public(GUEST));
        m.srv.shootAs(HOST, POINT_SHOT);                 // 개시 배치에서 빨간 공 먼저 3쿠션 득점(엔진 결정론)
        expect(m.srv.row.state.players[0].score).toBe(1);
        expect(m.srv.row.turn).toBe(0);
        m.srv.shootAs(HOST);                             // 이어 친 미스 → 게스트 차례
        expect(m.srv.row.turn).toBe(1);
        expect(m.srv.row.shots).toBe(2);
        m.env.advance(POLL_FAST_MS);
        await settle();
        expect(m.s().phase).toBe("shooting");
        expect(m.s().shotIdx).toBe(1);
        m.playOut();
        await settle();
        expect(m.s().phase).toBe("shooting");            // 두 번째 샷 재생(득점 뒤라 아직 상대 차례였다)
        expect(m.s().shotIdx).toBe(2);
        expect(m.s().session!.players[0].score).toBe(1);
        m.playOut();
        await settle();
        expect(m.s().phase).toBe("aim");
        expect(m.s().mismatches).toBe(0);
        expect(m.s().balls).toEqual(m.srv.row.balls);
        expect(m.cb.onOutcome).toHaveBeenCalledTimes(2);
        expect(m.cb.onMatch.mock.calls.filter((c) => c[0] === "opponent-shot")).toHaveLength(2);
    });
    it("해시가 다르면(결정론 깨짐) 재생은 하되 끝난 뒤 서버 상태로 스냅 + onMismatch 1회 + mismatches 1", async () => {
        const m = (make(GUEST));
        m.ctrl.startMatch(m.srv.public(GUEST));
        m.srv.shootAs(HOST);
        m.srv.tamperHash = true;
        m.env.advance(POLL_FAST_MS);
        await settle();
        expect(m.s().phase).toBe("shooting");
        m.playOut();
        await settle();
        expect(m.s().phase).toBe("aim");
        expect(m.s().mismatches).toBe(1);
        expect(m.cb.onMismatch).toHaveBeenCalledTimes(1);
        expect(m.cb.onMismatch).toHaveBeenCalledWith(1);
        expect(m.s().balls).toEqual(m.srv.row.balls);
    });
    it("방장의 결승 샷 → 후구: 내 마지막 이닝이 온다(아직 안 끝난다). 내가 못 채우면 방장 승", async () => {
        // 2026-09-12 후구: 자리 0(방장)이 매 이닝을 먼저 치므로, 목표에 닿아도 자리 1 에게 한 이닝을 더 준다.
        const m = (make(GUEST, { hostTarget: 1 }));
        m.ctrl.startMatch(m.srv.public(GUEST));
        m.srv.shootAs(HOST, POINT_SHOT);
        expect(m.srv.row.status).toBe("playing");                 // 서버도 아직 안 끝낸다
        m.env.advance(POLL_FAST_MS);
        await settle();
        expect(m.s().phase).toBe("shooting");
        m.playOut();
        await settle();
        expect(m.s().phase).toBe("aim");                          // 내 후구 차례
        expect(m.s().session!.pendingWinner).toBe(0);
        expect(m.s().match!.status).toBe("playing");
        expect(m.cb.onMatch).not.toHaveBeenCalledWith("finished");

        // 후구에서 못 채우고 이닝을 넘기면 방장 승리
        m.srv.shootAs(GUEST);                                     // 기본 입력은 미스다
        expect(m.srv.row.status).toBe("finished");
        m.env.advance(POLL_FAST_MS);
        await settle();
        expect(m.s().session!.winnerIndex).toBe(0);
    });
    it("서버가 기권·무응답 승리로 끝냈으면 샷 없이 finished + 세션에 승자", async () => {
        const m = (make(GUEST));
        m.ctrl.startMatch(m.srv.public(GUEST));
        m.srv.finish(GUEST, "resign");                   // 호스트가 기권
        m.env.advance(POLL_FAST_MS);
        await settle();
        expect(m.s().phase).toBe("finished");
        expect(m.s().session!.status).toBe("finished");
        expect(m.s().session!.winnerIndex).toBe(1);
        expect(m.s().match!.endReason).toBe("resign");
        expect(m.cb.onMatch).toHaveBeenCalledWith("finished");
    });
    it("화면이 다시 보이면(wake) 즉시 폴링하고 빠른 주기로 돌아간다", async () => {
        const m = (make(GUEST));
        m.ctrl.startMatch(m.srv.public(GUEST));
        for (let t = 0; t < POLL_FAST_WINDOW_MS; t += POLL_FAST_MS) { m.env.advance(POLL_FAST_MS); await settle(); }
        expect(m.env.timerDues()).toEqual([POLL_SLOW_MS]);
        const gets = m.srv.calls.get;
        m.env.wakeNow();
        await settle();
        expect(m.srv.calls.get).toBe(gets + 1);
        expect(m.env.timerDues()).toEqual([POLL_FAST_MS]);
    });
});

describe("내 샷 전송", () => {
    it("shoot → POST {idx,input,clientHash} 가 서버 재시뮬과 일치 → 재생 뒤 waiting(차례 넘어감) → 폴링 시작", async () => {
        const m = (make(HOST));
        m.ctrl.startMatch(m.srv.public(HOST));
        aimAtYellow(m.ctrl);
        const before = m.s();
        await m.ctrl.shoot();
        expect(m.s().phase).toBe("shooting");
        expect(m.s().replayOf).toBeNull();
        await settle();
        expect(m.srv.calls.post).toBe(1);
        const req = (m.matchApi.postShot as ReturnType<typeof vi.fn>).mock.calls[0][1] as ShotRequest;
        expect(req.idx).toBe(0);
        expect(req.input).toEqual({ cueBallId: "white", ...before.input });
        expect(req.clientHash).toBe(m.srv.log[0].hash);
        expect(m.s().match!.turn).toBe(m.srv.row.turn);
        expect(m.s().match!.version).toBe(m.srv.row.version);
        expect(m.s().match!.claimableAt).toBeNull();      // 다음 폴링이 준다
        m.playOut();
        await settle();
        if (m.srv.row.turn === 1) {
            expect(m.s().phase).toBe("waiting");
            expect(m.env.timerDues()).toEqual([POLL_FAST_MS]);
            m.env.advance(POLL_FAST_MS);
            await settle();
            expect(m.s().match!.claimableAt).not.toBeNull();
        } else {
            expect(m.s().phase).toBe("aim");
        }
        expect(m.s().mismatches).toBe(0);
        expect(m.s().queue).toEqual([]);
        expect(m.cb.onOffline).not.toHaveBeenCalled();
    });
    it("NOT_YOUR_TURN: 로컬 샷을 버리고 서버 정본으로 다시 맞춘다(onMatch resynced)", async () => {
        const m = (make(HOST));
        m.ctrl.startMatch(m.srv.public(HOST));
        m.srv.row.turn = 1;                              // 서버는 게스트 차례라고 본다(로컬은 모름)
        m.srv.row.state = { ...m.srv.row.state, turn: 1 };
        m.srv.row.version++;
        aimAtYellow(m.ctrl);
        await m.ctrl.shoot();
        m.playOut();
        await settle();
        expect(m.s().phase).toBe("waiting");
        expect(m.s().shotIdx).toBe(0);
        expect(m.s().balls).toEqual(m.srv.row.balls);
        expect(m.s().queue).toEqual([]);
        expect(m.cb.onMatch).toHaveBeenCalledWith("resynced");
        expect(m.srv.calls.post).toBe(1);
    });
    it("IDX_MISMATCH(다른 기기에서 이미 친 샷): 재시도 큐 대신 서버로 맞추고 놓친 샷은 재생으로 따라잡는다", async () => {
        const m = (make(HOST));
        m.ctrl.startMatch(m.srv.public(HOST));
        m.srv.shootAs(HOST);                             // 다른 기기의 나 → 이제 게스트 차례
        aimAtYellow(m.ctrl);
        await m.ctrl.shoot();                            // 로컬 idx 0, 서버 shots 1 → NOT_YOUR_TURN 또는 IDX_MISMATCH
        m.playOut();
        await settle();
        expect(m.srv.calls.post).toBe(1);
        expect(m.s().shotIdx).toBe(1);
        expect(m.s().balls).toEqual(m.srv.row.balls);
        expect(m.s().phase).toBe(m.srv.row.turn === 0 ? "aim" : "waiting");
    });
    it(`네트워크 실패: 백오프(${RETRY_BACKOFF_MS.join("/")} ms)로 ${MAX_RETRIES}번 시도 → offline + onMatch('offline'), 폴링은 계속; 연결이 돌아오면 다시 보내고 online`, async () => {
        const m = (make(HOST));
        m.ctrl.startMatch(m.srv.public(HOST));
        m.srv.mode = "network";
        aimAtYellow(m.ctrl);
        await m.ctrl.shoot();
        m.playOut();
        await settle();
        expect(m.srv.calls.post).toBe(1);
        expect(m.s().queue.map((q) => [q.idx, q.tries])).toEqual([[0, 1]]);
        expect(m.s().offline).toBe(false);
        expect(m.env.timerDues()).toContain(RETRY_BACKOFF_MS[0]);
        m.env.advance(RETRY_BACKOFF_MS[0]);
        await settle();
        expect(m.srv.calls.post).toBe(2);
        expect(m.s().queue[0].tries).toBe(2);
        m.env.advance(RETRY_BACKOFF_MS[1]);
        await settle();
        expect(m.srv.calls.post).toBe(MAX_RETRIES);
        expect(m.s().offline).toBe(true);
        expect(m.s().queue).toHaveLength(1);             // 항목은 남는다
        expect(m.cb.onMatch).toHaveBeenCalledWith("offline");
        expect(m.cb.onOffline).not.toHaveBeenCalled();   // 솔로 콜백은 안 쓴다
        // 폴링이 실패하는 동안엔 재전송도 없다
        const posts = m.srv.calls.post;
        for (let i = 0; i < 5; i++) { m.env.advance(POLL_FAST_MS); await settle(); }
        expect(m.srv.calls.post).toBe(posts);
        expect(m.srv.calls.get).toBeGreaterThan(0);
        // 연결 복구 → 폴링 성공 → 재전송 → 닿음
        m.srv.mode = "ok";
        m.env.advance(POLL_FAST_MS);
        await settle();
        expect(m.srv.calls.post).toBe(posts + 1);
        expect(m.s().offline).toBe(false);
        expect(m.s().queue).toEqual([]);
        expect(m.srv.row.shots).toBe(1);
        expect(m.cb.onMatch).toHaveBeenCalledWith("online");
        expect(m.s().mismatches).toBe(0);
    });
    it("응답만 유실된 재전송은 duplicate 로 닿고, GET 으로 배치를 확인한다", async () => {
        const m = (make(HOST));
        m.ctrl.startMatch(m.srv.public(HOST));
        m.srv.mode = "lost-response";
        aimAtYellow(m.ctrl);
        await m.ctrl.shoot();
        m.playOut();
        await settle();
        expect(m.srv.row.shots).toBe(1);                 // 서버는 기록했다
        expect(m.s().queue).toHaveLength(1);
        m.srv.mode = "ok";
        m.env.advance(RETRY_BACKOFF_MS[0]);
        await settle();
        expect(m.srv.calls.post).toBe(2);
        expect(m.s().queue).toEqual([]);
        expect(m.s().offline).toBe(false);
        expect(m.s().shotIdx).toBe(1);
        expect(m.s().balls).toEqual(m.srv.row.balls);
        expect(m.s().mismatches).toBe(0);
        expect(m.cb.onMismatch).not.toHaveBeenCalled();
    });
    it("내 샷 재생 중 도착한 폴링은 재생이 끝난 뒤에 처리된다(공이 순간이동하지 않는다)", async () => {
        const m = (make(HOST));
        m.ctrl.startMatch(m.srv.public(HOST));
        m.srv.mode = "network";
        aimAtYellow(m.ctrl);
        await m.ctrl.shoot();
        await settle();                                  // 첫 전송 실패 → 큐 → 폴링 예약
        m.srv.mode = "ok";
        m.env.advance(RETRY_BACKOFF_MS[0]);              // 재시도 → 닿음(재생 중)
        await settle();
        expect(m.s().phase).toBe("shooting");
        const localFinal = m.s().balls;
        m.env.advance(POLL_FAST_MS);
        await settle();
        expect(m.s().phase).toBe("shooting");
        expect(m.s().balls).toBe(localFinal);
        m.playOut();
        await settle();
        expect(m.s().phase).not.toBe("shooting");
        expect(m.s().balls).toEqual(m.srv.row.balls);
    });
});

describe("기권·승리 주장·종료", () => {
    it("resign → POST resign → finished(상대 승, endReason resign)", async () => {
        const m = (make(GUEST));
        m.ctrl.startMatch(m.srv.public(GUEST));
        expect(await m.ctrl.resign()).toBe(true);
        expect(m.srv.calls.resign).toBe(1);
        expect(m.s().phase).toBe("finished");
        expect(m.s().session!.winnerIndex).toBe(0);
        expect(m.s().match!.endReason).toBe("resign");
        expect(m.env.timerDues()).toEqual([]);
        expect(await m.ctrl.resign()).toBe(false);       // 이미 끝남
    });
    it("claim: 아직 이르면 false + onMatch('claim-too-early'); 48시간 지나면 true → finished(내 승)", async () => {
        const m = (make(GUEST));
        m.ctrl.startMatch(m.srv.public(GUEST));
        expect(m.ctrl.canClaim()).toBe(false);
        expect(await m.ctrl.claim()).toBe(false);
        expect(m.cb.onMatch).toHaveBeenCalledWith("claim-too-early");
        expect(m.s().phase).toBe("waiting");
        m.env.setWall(m.env.wall() + CLAIM_AFTER_MS);
        expect(m.ctrl.canClaim()).toBe(true);
        expect(await m.ctrl.claim()).toBe(true);
        expect(m.s().phase).toBe("finished");
        expect(m.s().session!.winnerIndex).toBe(1);
        expect(m.s().match!.endReason).toBe("claim");
    });
    it("exit: 서버 close 없이 setup 으로, 폴링·wake 해제; dispose 도 같다", async () => {
        const m = (make(GUEST));
        m.ctrl.startMatch(m.srv.public(GUEST));
        await m.ctrl.exit();
        expect(m.s().phase).toBe("setup");
        expect(m.env.timerDues()).toEqual([]);
        expect(m.env.wakeAttached()).toBe(false);
        expect(soloApi.closeSession).not.toHaveBeenCalled();
        m.ctrl.startMatch(m.srv.public(GUEST));
        m.ctrl.dispose();
        expect(m.env.timerDues()).toEqual([]);
        expect(m.env.wakeAttached()).toBe(false);
        expect(soloApi.closeSession).not.toHaveBeenCalled();
    });
    it("exit 뒤 도착한 옛 폴링 응답은 버린다", async () => {
        const m = (make(GUEST));
        m.ctrl.startMatch(m.srv.public(GUEST));
        m.srv.hold();
        m.env.advance(POLL_FAST_MS);                     // 폴링 시작(붙잡힘)
        await settle();
        m.srv.shootAs(HOST);
        await m.ctrl.exit();
        m.srv.release();
        await settle();
        expect(m.s().phase).toBe("setup");
        expect(m.srv.calls.shots).toBe(0);
    });
    it("endReasonFor: 승자가 목표에 닿았으면 target, 아니면 inningCap", () => {
        const st = createSession({ rules: DEFAULT_3C_RULES, players: [{ id: HOST, target: 1 }, { id: GUEST, target: 5 }] });
        const won = { ...st, players: st.players.map((p, i) => (i === 0 ? { ...p, score: 1 } : p)) };
        expect(endReasonFor({ winnerIndex: 0, state: won })).toBe("target");
        expect(endReasonFor({ winnerIndex: 1, state: won })).toBe("inningCap");
        expect(endReasonFor({ winnerIndex: null, state: won })).toBe("inningCap");
    });
});

/**
 * 조준 보고(2026-09-16 오너: "멀티가 너무 정적이다"). 내 차례에 겨누는 각도를 상대에게 흘려 보내
 * 기다리는 쪽 화면에 내 큐대가 움직이게 한다. 값은 표시용이라 실패해도 조용하고, 아끼는 규칙이 둘 있다:
 * 마지막 전송에서 AIM_REPORT_MS 가 지나야 하고, 각도가 AIM_EPS_RAD 이상 달라져야 한다.
 */
describe("조준 보고", () => {
    it("내 차례에 겨누면 첫 각도는 곧바로 간다", async () => {
        const m = make(HOST);
        m.ctrl.startMatch(m.srv.public(HOST));
        m.ctrl.setPhi(1);
        expect(m.srv.aims).toEqual([1]);
    });

    it("간격 안의 변화는 모았다가 한 번만 — 마지막 각도로", async () => {
        const m = make(HOST);
        m.ctrl.startMatch(m.srv.public(HOST));
        m.ctrl.setPhi(1);
        m.ctrl.setPhi(1.2);
        m.ctrl.setPhi(1.4);
        m.ctrl.setPhi(1.6);
        expect(m.srv.aims).toEqual([1]);                 // 간격 안이라 아직 안 보낸다
        m.env.advance(AIM_REPORT_MS);
        await settle();
        expect(m.srv.aims).toEqual([1, 1.6]);            // 손이 멈춘 자리 하나만
    });

    it("손을 멈춰도 마지막 각도는 반드시 간다 — 안 그러면 상대 큐대가 옛 자리에 굳는다", async () => {
        const m = make(HOST);
        m.ctrl.startMatch(m.srv.public(HOST));
        m.ctrl.setPhi(1);
        m.ctrl.setPhi(2);
        m.env.advance(AIM_REPORT_MS * 5);
        await settle();
        expect(m.srv.aims).toEqual([1, 2]);
    });

    it("눈에 안 보일 만큼 미세한 변화는 안 보낸다", async () => {
        const m = make(HOST);
        m.ctrl.startMatch(m.srv.public(HOST));
        m.ctrl.setPhi(1);
        m.env.advance(AIM_REPORT_MS * 2);
        m.ctrl.setPhi(1 + AIM_EPS_RAD / 2);
        m.env.advance(AIM_REPORT_MS * 2);
        await settle();
        expect(m.srv.aims).toEqual([1]);
    });

    it("세기만 바꾸면 안 보낸다 — 큐대가 가리키는 쪽이 그대로다", async () => {
        const m = make(HOST);
        m.ctrl.startMatch(m.srv.public(HOST));
        m.ctrl.setPhi(1);
        m.env.advance(AIM_REPORT_MS * 2);
        m.ctrl.setPower(3);
        m.env.advance(AIM_REPORT_MS * 2);
        await settle();
        expect(m.srv.aims).toEqual([1]);
    });

    it("당점을 옆으로 주면 보낸다 — 보정이 큐대를 실제로 틀기 때문", async () => {
        // 조준선을 유지하려고 스쿼트만큼 큐 방향을 돌린다(simReducer). 상대 화면의 큐대도 그만큼 돌아야 맞다.
        const m = make(HOST);
        m.ctrl.startMatch(m.srv.public(HOST));
        m.ctrl.setPhi(1);
        m.env.advance(AIM_REPORT_MS * 2);
        m.ctrl.setSpin(0.4, 0);
        m.env.advance(AIM_REPORT_MS * 2);
        await settle();
        expect(m.srv.aims).toHaveLength(2);
        expect(m.srv.aims[1]).toBe(m.s().input.phi);
    });

    it("상대 차례(대기)엔 한 번도 안 보낸다 — 입력 자체가 잠겨 있다", async () => {
        const m = make(GUEST);
        m.ctrl.startMatch(m.srv.public(GUEST));
        expect(m.s().phase).toBe("waiting");
        m.ctrl.setPhi(1);
        m.env.advance(AIM_REPORT_MS * 2);
        await settle();
        expect(m.srv.aims).toEqual([]);
    });

    it("정리한 뒤엔 예약된 전송이 살아남지 않는다", async () => {
        const m = make(HOST);
        m.ctrl.startMatch(m.srv.public(HOST));
        m.ctrl.setPhi(1);
        m.ctrl.setPhi(2);                                 // 예약만 걸린 상태
        m.ctrl.dispose();
        m.env.advance(AIM_REPORT_MS * 5);
        await settle();
        expect(m.srv.aims).toEqual([1]);
    });
});

/** 보낸 조준이 기다리는 쪽 화면 상태까지 실제로 닿는가 — 초기 구현이 여기서 끊겼다(회귀). */
describe("조준 도달", () => {
    it("상대가 조준만 하고 있어도(다른 건 하나도 안 바뀐다) 새 각도가 폴링으로 들어온다", async () => {
        const host = make(HOST);
        host.ctrl.startMatch(host.srv.public(HOST));
        const guest = make(GUEST);
        // 두 사람이 같은 서버를 본다
        const srv = host.srv;
        const gApi = srv.apiFor(GUEST);
        const g = new SimController({ ...guest.env.deps, api: soloApi, matchApi: gApi, haptics: false });
        g.startMatch(srv.public(GUEST));
        expect(g.store.get().phase).toBe("waiting");
        expect(g.store.get().match!.opponentAim).toBeNull();

        host.ctrl.setPhi(1.4);                            // 호스트가 겨눈다 → 서버에 각도 한 벌
        guest.env.advance(POLL_FAST_MS);
        await settle();
        expect(g.store.get().match!.opponentAim?.phi).toBe(1.4);

        // 각도만 또 바뀐 경우에도(차례·샷 수·공 그대로) 화면 상태가 따라와야 한다
        host.env.advance(AIM_REPORT_MS);
        host.ctrl.setPhi(2.0);
        await settle();
        guest.env.advance(POLL_FAST_MS);
        await settle();
        expect(g.store.get().match!.opponentAim?.phi).toBe(2.0);
        g.dispose();
    });
});
