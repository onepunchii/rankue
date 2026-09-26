/**
 * SimController 헤드리스 테스트. 시계·rAF·타이머·API 를 가짜로 주입한다.
 * 가짜 서버는 실제 엔진으로 같은 샷을 다시 돌린다 — 해시가 같으면 클라이언트가 보낸 입력이 시뮬에 쓴 것과 같다는 증거.
 */
import { describe, it, expect, vi } from "vitest";

// simApi 가 앱의 HTTP 층(@/lib/queryClient)을 정적으로 import 한다. vitest 에 "@" 별칭이 없어 대체한다(SimSetupDialog.test 와 같은 방식).
vi.mock("@/lib/queryClient", () => ({ apiRequest: vi.fn() }));

import { simulateShot } from "@shared/sim/simulate";
import { openingLayout } from "@shared/sim/layouts";
import { applyShot, createSession, evaluateShot, isOpeningShot, type SessionState } from "@shared/sim/rules";
import type { BallState } from "@shared/sim/types";
import { buildConfig } from "./setupPresets";
import { squirtFor } from "./aimAssist";
import { paramsFromConfig, MAX_RETRIES } from "./simReducer";
import type { ShotRequest, ShotResponse, SimApi, SimSessionRow } from "./simApi";
import { SimController, closeStatusFor, type OfflineReason } from "./simController";

const config = buildConfig({ gameType: "3c", target: 20 });
const params = paramsFromConfig(config);
const opening = openingLayout("3c", params.table, "white");

/* ------------------------------------------------------------ 가짜 환경 */

function makeEnv() {
    let now = 0;
    const rafs = new Map<number, () => void>();
    let rafId = 0;
    const timers = new Map<number, { cb: () => void; at: number }>();
    let timerId = 0;
    const deps = {
        now: () => now,
        raf: (cb: () => void) => { rafs.set(++rafId, cb); return rafId; },
        caf: (h: number) => { rafs.delete(h); },
        setTimer: (cb: () => void, ms: number) => { timers.set(++timerId, { cb, at: now + ms }); return timerId; },
        clearTimer: (h: unknown) => { timers.delete(h as number); },
    };
    /** 시간을 ms 만큼 전진: 만기 타이머 실행 → rAF 한 바퀴. */
    const advance = (ms: number): void => {
        now += ms;
        const due = Array.from(timers.entries()).filter(([, t]) => t.at <= now).sort((a, b) => a[1].at - b[1].at);
        for (const [id, t] of due) { timers.delete(id); t.cb(); }
        const pending = Array.from(rafs.entries());
        rafs.clear();
        for (const [, cb] of pending) cb();
    };
    return { deps, advance, hasRaf: () => rafs.size > 0, timerCount: () => timers.size };
}

/** 마이크로태스크·직렬 체인이 가라앉을 때까지. */
async function settle(): Promise<void> {
    for (let i = 0; i < 20; i++) await new Promise<void>((r) => setImmediate(r));
}

type ShotMode = "ok" | "mismatch" | "network" | "landed" | "rejected";

function makeApi(opts: { createFails?: boolean } = {}) {
    let shotMode: ShotMode = "ok";
    let serverBalls: readonly BallState[] = opening;
    let serverState: SessionState = createSession({ rules: config.rules, players: [{ id: "member", target: config.target }] });
    let shots = 0;
    let holdNext: (() => void) | null = null;
    let gate: Promise<void> | null = null;
    const row = (id: string, status: SimSessionRow["status"] = "playing"): SimSessionRow => ({
        id, memberId: "member", kind: "solo", gameType: "3c", tableId: "DAEDAE", cushionModel: "han2005", condition: 1,
        rules: config.rules, finishType: "none", targetScore: 20, inningCap: 0, state: serverState, balls: serverBalls,
        score: 0, innings: 0, highRun: 0, shots, status, engineVersion: "2.0.0", paramsHash: "0".repeat(16),
        mismatches: 0, startedAt: "2026-09-07T00:00:00.000Z", finishedAt: null, lastShotAt: null,
    });
    let created = 0;
    const api: SimApi = {
        createSession: vi.fn(async (_config, balls) => {
            if (gate) await gate;
            if (opts.createFails) throw new TypeError("Failed to fetch");
            created++;
            serverBalls = balls ?? opening;
            serverState = createSession({ rules: config.rules, players: [{ id: "member", target: config.target }] });
            shots = 0;
            return { session: row(`srv-${created}`), state: serverState, balls: serverBalls };
        }),
        postShot: vi.fn(async (_sessionId: string, req: ShotRequest): Promise<ShotResponse> => {
            const mode = shotMode;                        // 호출 시점의 모드(붙잡힌 동안 바꿔도 이 호출엔 영향 없음)
            if (gate) await gate;
            if (mode === "network") throw new TypeError("Failed to fetch");
            if (mode === "rejected") throw { status: 400, message: "샷 입력이 올바르지 않습니다" };
            if (mode === "landed") throw { status: 409, data: { code: "IDX_MISMATCH" }, message: `샷 순서가 맞지 않습니다 (서버 ${req.idx + 1})` };
            if (req.idx !== shots) throw { status: 409, data: { code: "IDX_MISMATCH" }, message: `샷 순서가 맞지 않습니다 (서버 ${shots})` };
            const result = simulateShot(serverBalls, req.input, params);
            const outcome = evaluateShot(result.events, req.input.cueBallId, serverState.rules, result.truncated, { opening: isOpeningShot(serverState, serverBalls) });
            const applied = applyShot(serverState, outcome);
            serverBalls = result.final;
            serverState = applied.session;
            shots++;
            const base: ShotResponse = {
                shot: { id: `shot-${req.idx}`, sessionId: "srv", idx: req.idx, playerIndex: 0, preState: [], input: req.input, hash: result.hash, clientHash: req.clientHash, eventCount: result.events.length, outcomeCode: applied.outcome.code, points: applied.outcome.points, cushions: 0, createdAt: "" },
                duplicate: false, mismatch: req.clientHash !== result.hash, hash: result.hash,
                events: result.events, final: result.final, duration: result.duration, truncated: result.truncated,
                outcome: applied.outcome, state: applied.session,
            };
            if (mode !== "mismatch") return base;
            // 일부러 다른 결과: 공을 옮기고 점수를 준다
            const fakeFinal = result.final.map((b) => (b.id === "red" ? { ...b, r: [b.r[0], b.r[1] - 0.3, b.r[2]] as const } : b));
            const fakeState: SessionState = { ...applied.session, players: applied.session.players.map((p) => ({ ...p, score: p.score + 5 })) };
            serverBalls = fakeFinal;
            serverState = fakeState;
            return { ...base, mismatch: true, hash: "f".repeat(16), final: fakeFinal, state: fakeState, history: result.history, outcome: { ...applied.outcome, code: "point", points: 5, scored: true } };
        }),
        closeSession: vi.fn(async (id: string, status) => row(id, status)),
    };
    return {
        api,
        setMode: (m: ShotMode) => { shotMode = m; },
        /** 다음 호출들을 release() 까지 붙잡는다. */
        hold: () => { gate = new Promise<void>((r) => { holdNext = r; }); },
        release: () => { holdNext?.(); holdNext = null; gate = null; },
        server: () => ({ balls: serverBalls, state: serverState, shots }),
    };
}

function make(opts: { createFails?: boolean; record?: boolean } = {}) {
    const env = makeEnv();
    const srv = makeApi(opts);
    const cb = {
        onMismatch: vi.fn(), onOffline: vi.fn<(r: OfflineReason) => void>(), onOutcome: vi.fn(), onMiscue: vi.fn(),
    };
    const ctrl = new SimController({ ...env.deps, api: srv.api, haptics: false });
    ctrl.setCallbacks(cb);
    ctrl.start(config, { record: opts.record ?? true });
    /** 재생을 끝까지 돌린다(최대 60 s 분량). */
    const playOut = (): void => {
        for (let i = 0; i < 60 * 60 && ctrl.store.get().phase === "shooting"; i++) env.advance(1000 / 60);
    };
    return { env, srv, cb, ctrl, playOut, api: srv.api };
}

/** 상대 큐볼 쪽으로 보통 세기 — 확실히 굴러가고 몇 초 안에 멈춘다. */
function aimAtYellow(ctrl: SimController): void {
    ctrl.setPhi(Math.PI);
    ctrl.setPower(2);
}

/* ------------------------------------------------------------ 테스트 */

describe("연습 모드(record=false)", () => {
    it("서버를 전혀 부르지 않고, shoot → 재생 → aim, onOutcome 1회, undo·placeBall 가능", async () => {
        const { ctrl, api, cb, playOut, env } = make({ record: false });
        expect(ctrl.store.get().phase).toBe("aim");
        aimAtYellow(ctrl);
        await ctrl.shoot();
        expect(ctrl.store.get().phase).toBe("shooting");
        expect(env.hasRaf()).toBe(true);
        const f = ctrl.frameAt(env.deps.now() + 100);
        expect(f.playing).toBe(true);
        expect(f.t).toBeCloseTo(0.1, 9);
        playOut();
        expect(ctrl.store.get().phase).toBe("aim");
        expect(cb.onOutcome).toHaveBeenCalledTimes(1);
        expect(ctrl.store.get().shotIdx).toBe(1);
        expect(ctrl.frameAt().playing).toBe(false);
        expect(ctrl.frameAt().balls).toBe(ctrl.store.get().balls);

        ctrl.undo();
        expect(ctrl.store.get().shotIdx).toBe(0);
        expect(ctrl.store.get().balls).toEqual(opening);
        expect(ctrl.placeBall("red", 0.5, 1.0)).toBe(true);
        expect(ctrl.placeBall("red", 0, 0)).toBe(false);
        await settle();
        expect(api.createSession).not.toHaveBeenCalled();
        expect(api.postShot).not.toHaveBeenCalled();
        await ctrl.exit();
        expect(api.closeSession).not.toHaveBeenCalled();
        expect(ctrl.store.get().phase).toBe("setup");
    });
});

describe("기록 모드: 세션 개설과 샷 전송", () => {
    it("start → createSession(설정, 개시 배치) → 서버 세션 id·상태 채택, 기록 모드는 undo 불가", async () => {
        const { ctrl, api } = make();
        await settle();
        expect(api.createSession).toHaveBeenCalledTimes(1);
        const [cfg, balls, players] = (api.createSession as ReturnType<typeof vi.fn>).mock.calls[0];
        expect(cfg).toBe(config);
        expect(balls).toEqual(opening);
        expect(players).toBeUndefined();
        const s = ctrl.store.get();
        expect(s.serverSessionId).toBe("srv-1");
        expect(s.session!.players[0].id).toBe("member");
        expect(ctrl.getAux().syncing).toBe(false);
        ctrl.undo();
        expect(ctrl.store.get().shotIdx).toBe(0);
    });

    it("shoot: 로컬 시뮬과 같은 입력·해시를 보내고 서버 재시뮬이 일치한다(mismatch 0)", async () => {
        const { ctrl, api, playOut, srv } = make();
        await settle();
        aimAtYellow(ctrl);
        const before = ctrl.store.get();
        const expected = simulateShot(before.balls, { cueBallId: "white", ...before.input }, params);
        await ctrl.shoot();
        playOut();
        await settle();
        expect(api.postShot).toHaveBeenCalledTimes(1);
        const [sid, req] = (api.postShot as ReturnType<typeof vi.fn>).mock.calls[0] as [string, ShotRequest];
        expect(sid).toBe("srv-1");
        expect(req.idx).toBe(0);
        expect(req.clientHash).toBe(expected.hash);
        expect(req.input).toEqual({ cueBallId: "white", ...before.input });
        expect(ctrl.store.get().mismatches).toBe(0);
        expect(ctrl.store.get().balls).toEqual(srv.server().balls);
        expect(ctrl.store.get().queue).toEqual([]);
    });

    it("idx 는 0,1,2 로 이어지고 서버 shots 와 같다", async () => {
        const { ctrl, api, playOut, srv } = make();
        await settle();
        for (let i = 0; i < 3; i++) {
            aimAtYellow(ctrl);
            await ctrl.shoot();
            playOut();
            await settle();
        }
        const idxs = (api.postShot as ReturnType<typeof vi.fn>).mock.calls.map((c) => (c[1] as ShotRequest).idx);
        expect(idxs).toEqual([0, 1, 2]);
        expect(srv.server().shots).toBe(3);
        expect(ctrl.store.get().shotIdx).toBe(3);
    });

    it("재생 중엔 shoot 이 무시되고 입력이 잠긴다", async () => {
        const { ctrl, api, playOut } = make();
        await settle();
        aimAtYellow(ctrl);
        await ctrl.shoot();
        const input = ctrl.store.get().input;
        ctrl.setPower(5);
        expect(ctrl.store.get().input).toBe(input);
        await ctrl.shoot();
        playOut();
        await settle();
        expect(api.postShot).toHaveBeenCalledTimes(1);
    });
});

describe("미스매치", () => {
    it("재생 중 도착한 미스매치는 재생이 끝난 뒤 서버 상태로 스냅하고 onMismatch 1회", async () => {
        const { ctrl, cb, env, playOut, srv } = make();
        await settle();
        srv.setMode("mismatch");
        aimAtYellow(ctrl);
        await ctrl.shoot();
        const localFinal = ctrl.store.get().balls;
        await settle();                                   // 응답 도착(재생 중)
        expect(ctrl.store.get().pendingSnap).not.toBeNull();
        expect(ctrl.store.get().mismatches).toBe(1);
        expect(ctrl.store.get().balls).toBe(localFinal); // 아직 스냅 전
        expect(cb.onMismatch).not.toHaveBeenCalled();
        env.advance(100);
        expect(ctrl.frameAt().playing).toBe(true);
        playOut();
        expect(ctrl.store.get().phase).toBe("aim");
        expect(ctrl.store.get().balls).toBe(srv.server().balls);
        expect(ctrl.store.get().session).toBe(srv.server().state);
        expect(ctrl.store.get().outcomeLast!.code).toBe("point");
        expect(cb.onMismatch).toHaveBeenCalledTimes(1);
        expect(cb.onMismatch).toHaveBeenCalledWith(1);
        expect(cb.onOutcome).toHaveBeenCalledTimes(1);
    });

    it("재생이 끝난 뒤 늦게 온 미스매치는 즉시 스냅 + onMismatch", async () => {
        const { ctrl, cb, playOut, srv } = make();
        await settle();
        srv.setMode("mismatch");
        srv.hold();
        aimAtYellow(ctrl);
        await ctrl.shoot();
        playOut();
        expect(ctrl.store.get().phase).toBe("aim");
        expect(cb.onMismatch).not.toHaveBeenCalled();
        srv.release();
        await settle();
        expect(ctrl.store.get().balls).toBe(srv.server().balls);
        expect(cb.onMismatch).toHaveBeenCalledTimes(1);
    });

    it("다음 샷은 앞 샷의 응답(스냅)이 반영된 배치로 시뮬레이션한다", async () => {
        const { ctrl, playOut, srv, api } = make();
        await settle();
        srv.setMode("mismatch");
        srv.hold();
        aimAtYellow(ctrl);
        await ctrl.shoot();
        playOut();
        srv.setMode("ok");
        const p = ctrl.shoot();          // 앞 샷 응답을 기다린다
        await settle();
        expect(ctrl.store.get().phase).toBe("aim");
        srv.release();
        await p;
        expect(ctrl.store.get().phase).toBe("shooting");
        playOut();
        await settle();
        const second = (api.postShot as ReturnType<typeof vi.fn>).mock.calls[1] as [string, ShotRequest];
        expect(second[1].idx).toBe(1);
        expect(ctrl.store.get().mismatches).toBe(1);     // 두 번째는 서버와 일치
    });
});

describe("네트워크 실패와 재전송 큐", () => {
    it("실패한 샷은 큐에 남고 다음 샷 전에 idx 순으로 재전송된다", async () => {
        const { ctrl, api, playOut, srv, cb } = make();
        await settle();
        srv.setMode("network");
        aimAtYellow(ctrl);
        await ctrl.shoot();
        playOut();
        await settle();
        expect(ctrl.store.get().queue.map((q) => [q.idx, q.tries])).toEqual([[0, 1]]);
        expect(ctrl.store.get().offline).toBe(false);
        const firstReq = (api.postShot as ReturnType<typeof vi.fn>).mock.calls[0][1] as ShotRequest;

        srv.setMode("ok");
        aimAtYellow(ctrl);
        await ctrl.shoot();
        playOut();
        await settle();
        const calls = (api.postShot as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[1] as ShotRequest);
        expect(calls.map((c) => c.idx)).toEqual([0, 0, 1]);
        expect(calls[1].input).toBe(firstReq.input);
        expect(calls[1].clientHash).toBe(firstReq.clientHash);
        expect(ctrl.store.get().queue).toEqual([]);
        expect(srv.server().shots).toBe(2);
        expect(cb.onOffline).not.toHaveBeenCalled();
    });

    it(`${MAX_RETRIES}번 실패하면 포기하고 offline, onOffline('shot-retries') 1회, 이후 전송 없음`, async () => {
        const { ctrl, api, playOut, srv, cb } = make();
        await settle();
        srv.setMode("network");
        for (let i = 0; i < 4; i++) {
            aimAtYellow(ctrl);
            await ctrl.shoot();
            playOut();
            await settle();
        }
        expect(api.postShot).toHaveBeenCalledTimes(MAX_RETRIES);
        expect(ctrl.store.get().offline).toBe(true);
        // 멈춘 뒤의 샷도 순서대로 쌓아 둔다 — 연결이 돌아오면(retrySync) 한꺼번에 나간다(2026-09-26)
        expect(ctrl.store.get().queue.map((q) => q.idx)).toEqual([0, 1, 2, 3]);
        expect(cb.onOffline).toHaveBeenCalledTimes(1);
        expect(cb.onOffline).toHaveBeenCalledWith("shot-retries");
        expect(ctrl.store.get().shotIdx).toBe(4);       // 로컬 플레이는 계속
        expect(ctrl.store.get().phase).toBe("aim");
    });

    it("retrySync: 연결이 돌아오면 쌓인 샷을 순서대로 보내고 기록이 온전하면 완료로 닫을 수 있다", async () => {
        const { ctrl, api, playOut, srv } = make();
        await settle();
        srv.setMode("network");
        for (let i = 0; i < 3; i++) {
            aimAtYellow(ctrl);
            await ctrl.shoot();
            playOut();
            await settle();
        }
        expect(ctrl.store.get().offline).toBe(true);
        srv.setMode("ok");
        await ctrl.retrySync();
        await settle();
        expect(ctrl.store.get().offline).toBe(false);
        expect(ctrl.store.get().queue).toEqual([]);
        expect((api.postShot as any).mock.calls.slice(-3).map((c: any[]) => c[1].idx)).toEqual([0, 1, 2]);
    });

    it("응답만 유실된 재전송(IDX_MISMATCH, 서버 shots = idx+1)은 기록된 것으로 보고 넘어간다", async () => {
        const { ctrl, api, playOut, srv } = make();
        await settle();
        srv.setMode("network");
        aimAtYellow(ctrl);
        await ctrl.shoot();
        playOut();
        await settle();
        srv.setMode("landed");
        aimAtYellow(ctrl);
        await ctrl.shoot();
        playOut();
        await settle();
        expect(ctrl.store.get().queue).toEqual([]);
        expect(ctrl.store.get().offline).toBe(false);
        expect((api.postShot as ReturnType<typeof vi.fn>).mock.calls.map((c) => (c[1] as ShotRequest).idx)).toEqual([0, 0, 1]);
    });

    it("거부(400)는 즉시 포기: onOffline('shot-rejected')", async () => {
        const { ctrl, playOut, srv, cb } = make();
        await settle();
        srv.setMode("rejected");
        aimAtYellow(ctrl);
        await ctrl.shoot();
        playOut();
        await settle();
        expect(ctrl.store.get().offline).toBe(true);
        expect(cb.onOffline).toHaveBeenCalledWith("shot-rejected");
    });

    it("세션 개설 실패 → offline, 샷은 전송하지 않는다", async () => {
        const { ctrl, api, playOut, cb } = make({ createFails: true });
        await settle();
        expect(ctrl.store.get().offline).toBe(true);
        expect(cb.onOffline).toHaveBeenCalledWith("session-create");
        aimAtYellow(ctrl);
        await ctrl.shoot();
        playOut();
        await settle();
        expect(api.postShot).not.toHaveBeenCalled();
        expect(ctrl.store.get().shotIdx).toBe(1);
    });

    it("세션 개설 응답 전에 친 샷은 기다리지 않고 큐에 들어갔다가 개설 직후 순서대로 전송된다", async () => {
        const env = makeEnv();
        const srv = makeApi();
        srv.hold();
        const ctrl = new SimController({ ...env.deps, api: srv.api, haptics: false });
        ctrl.start(config);
        const playOut = (): void => {
            for (let i = 0; i < 60 * 60 && ctrl.store.get().phase === "shooting"; i++) env.advance(1000 / 60);
        };
        aimAtYellow(ctrl);
        await ctrl.shoot();
        expect(ctrl.store.get().phase).toBe("shooting");     // 개설을 기다리느라 막히지 않는다
        playOut();
        aimAtYellow(ctrl);
        await ctrl.shoot();
        playOut();
        expect(ctrl.store.get().queue.map((q) => [q.idx, q.tries])).toEqual([[0, 0], [1, 0]]);
        expect(srv.api.postShot).not.toHaveBeenCalled();
        srv.release();
        await settle();
        expect(ctrl.store.get().serverSessionId).toBe("srv-1");
        expect((srv.api.postShot as ReturnType<typeof vi.fn>).mock.calls.map((c) => (c[1] as ShotRequest).idx)).toEqual([0, 1]);
        expect(ctrl.store.get().queue).toEqual([]);
        expect(ctrl.store.get().mismatches).toBe(0);
        expect(srv.server().shots).toBe(2);
    });

    it("개설 응답이 오기 전에 나가면 뒤늦게 만들어진 서버 세션을 닫는다", async () => {
        const env = makeEnv();
        const srv = makeApi();
        srv.hold();
        const ctrl = new SimController({ ...env.deps, api: srv.api, haptics: false });
        ctrl.start(config);
        await ctrl.exit();
        expect(ctrl.store.get().phase).toBe("setup");
        expect(srv.api.closeSession).not.toHaveBeenCalled();
        srv.release();
        await settle();
        expect(srv.api.closeSession).toHaveBeenCalledWith("srv-1", "abandoned");
    });
});

describe("미리보기", () => {
    it("aim 에서 디바운스 뒤 계산, 입력이 바뀌면 다시, 재생 중엔 null", async () => {
        const { ctrl, env, playOut } = make({ record: false });
        expect(ctrl.getAux().preview).toBeNull();
        env.advance(10);
        expect(ctrl.getAux().preview).toBeNull();
        env.advance(25);
        const p1 = ctrl.getAux().preview!;
        expect(p1).not.toBeNull();
        expect(p1.paths.paths.length).toBeGreaterThan(0);
        expect(p1.input).toEqual({ cueBallId: "white", ...ctrl.store.get().input });
        // 입력을 두 번 빠르게 바꾸면 한 번만 계산(디바운스)
        ctrl.setPhi(Math.PI);
        env.advance(10);
        ctrl.setPower(3);
        env.advance(10);
        expect(ctrl.getAux().preview).toBe(p1);
        env.advance(25);
        const p2 = ctrl.getAux().preview!;
        expect(p2).not.toBe(p1);
        expect(p2.input.V0).toBe(3);
        // 큐 상태 같은 무관한 변화엔 다시 계산하지 않는다
        expect(env.timerCount()).toBe(0);
        await ctrl.shoot();
        expect(ctrl.getAux().preview).toBeNull();
        playOut();
        env.advance(40);
        expect(ctrl.getAux().preview).not.toBeNull();
    });
});

describe("재생 배속·프레임", () => {
    it("4× 는 시각만 빨리 가고 끝나면 1× 로 돌아온다; 재생 중 frameAt 은 중간 상태", async () => {
        const { ctrl, env } = make({ record: false });
        aimAtYellow(ctrl);
        await ctrl.shoot();
        const dur = ctrl.getAux().duration;
        expect(dur).toBeGreaterThan(0.5);
        env.advance(100);
        expect(ctrl.frameAt().t).toBeCloseTo(0.1, 9);
        ctrl.setSpeed(4);
        expect(ctrl.getAux().speed).toBe(4);
        env.advance(100);
        expect(ctrl.frameAt().t).toBeCloseTo(0.5, 9);
        const mid = ctrl.frameAt();
        expect(mid.balls).not.toBe(ctrl.store.get().balls);
        const white = mid.balls.find((b) => b.id === "white")!;
        const start = opening.find((b) => b.id === "white")!;
        expect(Math.hypot(white.r[0] - start.r[0], white.r[1] - start.r[1])).toBeGreaterThan(0.01);
        for (let i = 0; i < 600 && ctrl.store.get().phase === "shooting"; i++) env.advance(16);
        expect(ctrl.store.get().phase).toBe("aim");
        expect(ctrl.getAux().speed).toBe(1);
        expect(ctrl.frameAt().t).toBe(dur);
    });
});

describe("두께·입력 헬퍼", () => {
    it("setThickness 는 기준 적구(개시 샷은 빨간 공) 기준 phi, setSpin 은 미스큐 링 클램프, nudgePhi 누적", () => {
        const { ctrl } = make({ record: false });
        const cue = opening.find((b) => b.id === "white")!;
        const red = opening.find((b) => b.id === "red")!;
        const toRed = Math.atan2(red.r[1] - cue.r[1], red.r[0] - cue.r[0]);
        ctrl.setThickness(0.5, "left");
        const half = ctrl.store.get().input.phi;
        ctrl.setThickness(1, "left");
        expect(ctrl.store.get().input.phi).toBeCloseTo(toRed, 9);
        expect(half).not.toBeCloseTo(toRed, 3);
        ctrl.setSpin(0.6, 0);
        expect(ctrl.store.get().input.a).toBeLessThanOrEqual(0.5);
        expect(ctrl.store.get().input.a).toBeGreaterThan(0.49);
        ctrl.setPhi(1);
        ctrl.nudgePhi(0.25);
        expect(ctrl.store.get().input.phi).toBeCloseTo(1.25, 12);
        ctrl.setElevation(9);
        expect(ctrl.store.get().input.theta).toBeCloseTo((60 * Math.PI) / 180, 12);
    });
});

describe("종료·재시작·정리", () => {
    it("closeStatusFor: 끝났고 기록이 완전할 때만 finished", () => {
        const fin = { ...createSession({ rules: config.rules, players: [{ id: "p", target: 1 }] }), status: "finished" as const };
        expect(closeStatusFor({ session: fin, offline: false, queue: [] })).toBe("finished");
        expect(closeStatusFor({ session: fin, offline: true, queue: [] })).toBe("abandoned");
        expect(closeStatusFor({ session: fin, offline: false, queue: [{ idx: 0, input: { cueBallId: "white", phi: 0, V0: 1, a: 0, b: 0, theta: 0 }, clientHash: "x", tries: 1 }] })).toBe("abandoned");
        expect(closeStatusFor({ session: { ...fin, status: "playing" }, offline: false, queue: [] })).toBe("abandoned");
        expect(closeStatusFor({ session: null, offline: false, queue: [] })).toBe("abandoned");
    });

    it("exit: 진행 중 세션은 abandoned 로 닫고 setup 으로", async () => {
        const { ctrl, api } = make();
        await settle();
        await ctrl.exit();
        expect(api.closeSession).toHaveBeenCalledWith("srv-1", "abandoned");
        expect(ctrl.store.get().phase).toBe("setup");
        expect(ctrl.getAux().setup).toBeNull();
        await ctrl.exit();                                 // 두 번 불러도 무해
        expect(api.closeSession).toHaveBeenCalledTimes(1);
    });

    it("exit 는 진행 중인 샷 전송을 기다린 뒤 닫는다", async () => {
        const { ctrl, api, playOut, srv } = make();
        await settle();
        srv.hold();
        aimAtYellow(ctrl);
        await ctrl.shoot();
        playOut();
        const p = ctrl.exit();
        await settle();
        expect(api.closeSession).not.toHaveBeenCalled();
        srv.release();
        await p;
        const order = (api.postShot as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0];
        const closeOrder = (api.closeSession as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0];
        expect(closeOrder).toBeGreaterThan(order);
        expect(api.closeSession).toHaveBeenCalledWith("srv-1", "abandoned");
    });

    it("restart: 옛 세션을 닫고 새 세션을 열며 카운터를 초기화한다", async () => {
        const { ctrl, api, playOut } = make();
        await settle();
        aimAtYellow(ctrl);
        await ctrl.shoot();
        playOut();
        await settle();
        ctrl.restart();
        await settle();
        expect(api.closeSession).toHaveBeenCalledWith("srv-1", "abandoned");
        expect(api.createSession).toHaveBeenCalledTimes(2);
        const s = ctrl.store.get();
        expect(s.phase).toBe("aim");
        expect(s.shotIdx).toBe(0);
        expect(s.serverSessionId).toBe("srv-2");
        expect(s.balls).toEqual(opening);
    });

    it("restart 이후 도착한 옛 세션의 응답은 버린다", async () => {
        const { ctrl, api, playOut, srv } = make();
        await settle();
        srv.setMode("mismatch");
        srv.hold();
        aimAtYellow(ctrl);
        await ctrl.shoot();
        playOut();
        ctrl.restart();
        srv.release();
        await settle();
        expect(ctrl.store.get().mismatches).toBe(0);
        expect(ctrl.store.get().serverSessionId).toBe("srv-2");
        expect(api.createSession).toHaveBeenCalledTimes(2);
    });

    it("dispose: 열린 서버 세션을 닫고 이후 호출을 무시한다", async () => {
        const { ctrl, api, env } = make();
        await settle();
        ctrl.dispose();
        await settle();
        expect(api.closeSession).toHaveBeenCalledWith("srv-1", "abandoned");
        aimAtYellow(ctrl);
        await ctrl.shoot();
        expect(ctrl.store.get().phase).toBe("aim");
        expect(env.hasRaf()).toBe(false);
    });

    it("start 를 다시 부르면 이전 서버 세션을 닫는다", async () => {
        const { ctrl, api } = make();
        await settle();
        ctrl.start(config, { record: false });
        await settle();
        expect(api.closeSession).toHaveBeenCalledWith("srv-1", "abandoned");
        expect(ctrl.store.get().record).toBe(false);
        expect(ctrl.store.get().serverSessionId).toBeNull();
    });
});

describe("두께 버튼과 조준 보정", () => {
    it("일반 모드: 옆당점이 있으면 두께 버튼이 공 방향 − 스쿼트를 큐 방향으로 저장한다(화면 조준 = 공 방향)", () => {
        const { ctrl } = make({ record: false });
        const cue = opening.find((b) => b.id === "white")!;
        const red = opening.find((b) => b.id === "red")!;
        const toRed = Math.atan2(red.r[1] - cue.r[1], red.r[0] - cue.r[0]);
        ctrl.setSpin(0.4, 0);
        ctrl.setThickness(1, "left");
        const phi = ctrl.store.get().input.phi;
        expect(phi + squirtFor(0.4)).toBeCloseTo(toRed, 9);
        expect(phi).not.toBeCloseTo(toRed, 3);
    });
    it("리얼리티 모드: 두께 버튼이 공 방향을 그대로 큐 방향으로 저장한다", () => {
        const { ctrl } = make({ record: false });
        ctrl.start(buildConfig({ gameType: "3c", target: 20, mode: "reality" }), { record: false });
        expect(ctrl.store.get().aimAssist).toBe(false);
        const cue = opening.find((b) => b.id === "white")!;
        const red = opening.find((b) => b.id === "red")!;
        const toRed = Math.atan2(red.r[1] - cue.r[1], red.r[0] - cue.r[0]);
        ctrl.setSpin(0.4, 0);
        ctrl.setThickness(1, "left");
        expect(ctrl.store.get().input.phi).toBeCloseTo(toRed, 9);
    });
});
