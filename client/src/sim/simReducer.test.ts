import { describe, it, expect, vi } from "vitest";
import { TABLES, DEFAULT_CUE } from "@shared/sim/params";
import { openingLayout } from "@shared/sim/layouts";
import { applyShot, createSession, currentPlayer, DEFAULT_3C_RULES, DEFAULT_4C_RULES, type SessionState, type ShotOutcome } from "@shared/sim/rules";
import type { BallState, ShotInput } from "@shared/sim/types";
import { thicknessFor } from "./aim";
import { buildConfig } from "./setupPresets";
import {
    simReducer, createSimStore, INITIAL_STATE,
    clampPower, clampElevation, clampSpin, defaultPhi, thicknessPhi, initialInput, paramsFromConfig, objectTargetFor,
    V0_MIN, V0_MAX, V0_DEFAULT, THETA_MAX, MAX_RETRIES,
    type SimCoreState,
} from "./simReducer";

const table = TABLES.DAEDAE;
const R = table.ball.R;
const balls3 = openingLayout("3c", table, "white");
const balls4 = openingLayout("4c", TABLES.JUNGDAE_KR, "white");
const session3 = (target = 20, players = 1): SessionState => createSession({
    rules: DEFAULT_3C_RULES,
    players: players === 2 ? [{ id: "p1", target }, { id: "p2", target }] : [{ id: "p1", target }],
});

const POINT: ShotOutcome = { code: "point", points: 1, scored: true, consumesInning: false, cushionsBeforeSecond: 3, cushionsBeforeFirst: 0, contacts: ["yellow", "red"], kisses: 0 };
const MISS: ShotOutcome = { code: "miss-cushions", points: 0, scored: false, consumesInning: true, cushionsBeforeSecond: 1, cushionsBeforeFirst: 0, contacts: ["yellow", "red"], kisses: 0 };

const input: ShotInput = { cueBallId: "white", phi: 1, V0: 2.5, a: 0, b: 0, theta: 0 };

/** 공을 조금 옮긴 가짜 최종 배치(물리 없이). */
function shifted(bs: readonly BallState[], dy: number): readonly BallState[] {
    return bs.map((b) => (b.id === "white" ? { ...b, r: [b.r[0], b.r[1] + dy, b.r[2]] as const } : b));
}

function started(record = true, sess = session3(), bs = balls3): SimCoreState {
    return simReducer(INITIAL_STATE, { type: "start", session: sess, balls: bs, record });
}

/** 로컬 샷 한 번: applyShot 을 실제로 돌려 세션을 만든다. */
function shoot(s: SimCoreState, outcome: ShotOutcome, dy = 0.1, hash = "h".repeat(16)): SimCoreState {
    const applied = applyShot(s.session!, outcome);
    return simReducer(s, { type: "shoot", input, final: shifted(s.balls, dy), clientHash: hash, session: applied.session, outcome: applied.outcome });
}

describe("헬퍼", () => {
    it("paramsFromConfig: 테이블·기본 큐·쿠션 모델·컨디션", () => {
        const p = paramsFromConfig(buildConfig({ gameType: "4c", target: 80, cushionModel: "mathavan2010", condition: 0.9 }));
        expect(p.table).toBe(TABLES.JUNGDAE_KR);
        expect(p.cue).toBe(DEFAULT_CUE);
        expect(p.cushionModel).toBe("mathavan2010");
        expect(p.condition).toBe(0.9);
    });
    it("세기·각 클램프", () => {
        expect(clampPower(12)).toBe(V0_MAX);
        expect(clampPower(0)).toBe(V0_MIN);
        expect(clampPower(Number.NaN)).toBe(V0_DEFAULT);
        expect(clampElevation(1)).toBe(THETA_MAX);
        expect(clampElevation(-0.1)).toBe(0);
    });
    it("당점 클램프: 링 밖은 같은 방향으로 링 위, strike 의 경계 조건을 만족", () => {
        const c = clampSpin(0.5, 0.5);
        expect(c.a).toBeCloseTo(c.b, 12);
        expect(c.a * c.a + c.b * c.b).toBeLessThanOrEqual(0.25);
        expect(Math.abs(c.a)).toBeLessThanOrEqual(0.5);
        expect(c.a * c.a + c.b * c.b).toBeGreaterThan(0.2499);
        expect(clampSpin(0.1, -0.2)).toEqual({ a: 0.1, b: -0.2 });
        expect(clampSpin(Number.NaN, 0.3)).toEqual({ a: 0, b: 0.3 });
    });
    it("기본 조준: 3쿠션은 가장 가까운 공(상대 큐볼 포함), 4구는 상대 큐볼 제외", () => {
        // 개시 배치: 큐볼은 상대 큐볼에서 182.5 mm 오른쪽 → 3쿠션은 상대 큐볼(−x 방향, π)
        expect(defaultPhi(balls3, "white", "3c")).toBeCloseTo(Math.PI, 9);
        expect(objectTargetFor(balls3, "white", "3c")!.id).toBe("yellow");
        const t4 = objectTargetFor(balls4, "white", "4c")!;
        expect(t4.id).toBe("red2");
        const cue = balls4.find((b) => b.id === "white")!;
        expect(defaultPhi(balls4, "white", "4c")).toBeCloseTo(Math.atan2(t4.r[1] - cue.r[1], t4.r[0] - cue.r[0]), 9);
        expect(defaultPhi([balls3[0]], "white", "3c")).toBe(Math.PI / 2);
        expect(initialInput(balls3, "white", "3c")).toEqual({ phi: Math.PI, V0: V0_DEFAULT, a: 0, b: 0, theta: 0 });
    });
    it("두께 단계 → phi: 반두께면 thicknessFor 가 0.5 를 돌려준다", () => {
        const cue = balls3.find((b) => b.id === "red")!;
        // 빨간 공을 큐볼로 가정해 멀리 있는 공을 조준(가까우면 asin 이 크다)
        const bs = balls3.map((b) => (b.id === "red" ? { ...b, id: "white" } : b.id === "white" ? { ...b, id: "red" } : b));
        const phi = thicknessPhi(bs, "white", "3c", 0.5, "left", R)!;
        const target = objectTargetFor(bs, "white", "3c")!;
        const th = thicknessFor([cue.r[0], cue.r[1]], phi, [target.r[0], target.r[1]], R);
        expect(th.thickness).toBeCloseTo(0.5, 6);
        expect(th.side).toBe("left");
        expect(thicknessPhi([bs[0]], "white", "3c", 0.5, "left", R)).toBeNull();
    });
});

describe("start / setInput", () => {
    it("start → aim, 기본 입력, 기록 플래그", () => {
        const s = started(false);
        expect(s.phase).toBe("aim");
        expect(s.record).toBe(false);
        expect(s.shotIdx).toBe(0);
        expect(s.input).toEqual(initialInput(balls3, "white", "3c"));
    });
    it("setInput 은 aim 에서만, 클램프·정규화, 변화 없으면 같은 참조", () => {
        const s = started();
        const a = simReducer(s, { type: "setInput", patch: { V0: 20, theta: 3, a: 0.6, b: 0.6, phi: -1 } });
        expect(a.input.V0).toBe(V0_MAX);
        expect(a.input.theta).toBe(THETA_MAX);
        expect(a.input.a * a.input.a + a.input.b * a.input.b).toBeLessThanOrEqual(0.25);
        expect(a.input.phi).toBeCloseTo(2 * Math.PI - 1, 12);
        expect(simReducer(a, { type: "setInput", patch: { V0: V0_MAX } })).toBe(a);
        const shooting = shoot(s, MISS);
        expect(simReducer(shooting, { type: "setInput", patch: { V0: 3 } })).toBe(shooting);
    });
    it("phi 가 NaN 이면 무시", () => {
        const s = started();
        expect(simReducer(s, { type: "setInput", patch: { phi: Number.NaN } })).toBe(s);
    });
});

describe("shoot → playbackEnd", () => {
    it("aim → shooting: 공·세션·판정 즉시 반영, idx 증가", () => {
        const s = started();
        const t = shoot(s, POINT);
        expect(t.phase).toBe("shooting");
        expect(t.shotIdx).toBe(1);
        expect(t.outcomeLast!.code).toBe("point");
        expect(t.session!.players[0].score).toBe(1);
        expect(t.balls.find((b) => b.id === "white")!.r[1]).toBeCloseTo(balls3[0].r[1] + 0.1, 12);
        expect(t.undo).toHaveLength(0);       // 기록 모드: 되돌리기 없음
    });
    it("shooting 에서 shoot 은 무시", () => {
        const t = shoot(started(), MISS);
        expect(shoot(t, MISS)).toBe(t);
    });
    it("playbackEnd → aim, 새 배치 기준으로 다시 조준", () => {
        const s = started();
        const t = shoot(s, MISS, 0.3);
        const u = simReducer(t, { type: "playbackEnd" });
        expect(u.phase).toBe("aim");
        expect(u.input.phi).toBeCloseTo(defaultPhi(t.balls, "white", "3c"), 12);
        expect(u.input.V0).toBe(s.input.V0);
        expect(simReducer(u, { type: "playbackEnd" })).toBe(u);
    });
    it("목표 도달 → finished", () => {
        const s = started(true, session3(1));
        const t = shoot(s, POINT);
        expect(t.session!.status).toBe("finished");
        const u = simReducer(t, { type: "playbackEnd" });
        expect(u.phase).toBe("finished");
        expect(simReducer(u, { type: "setInput", patch: { V0: 3 } })).toBe(u);
    });
    it("2인: 이닝을 소모하면 턴이 넘어가고 큐볼도 바뀐다", () => {
        const s = started(true, session3(20, 2));
        const u = simReducer(shoot(s, MISS), { type: "playbackEnd" });
        expect(currentPlayer(u.session!).cueBallId).toBe("yellow");
        expect(u.input.phi).toBeCloseTo(defaultPhi(u.balls, "yellow", "3c"), 12);
    });
});

describe("서버 응답", () => {
    it("일치 응답은 큐에서만 빼고 아무것도 바꾸지 않는다", () => {
        const t = shoot(started(), MISS);
        expect(simReducer(t, { type: "serverAck", idx: 0, mismatch: false, final: balls3, session: t.session! })).toBe(t);
    });
    it("재생 중 미스매치 → pendingSnap, 재생 끝에 서버 상태로 스냅", () => {
        const t = shoot(started(), MISS, 0.1);
        const serverFinal = shifted(balls3, 0.4);
        const serverSession = applyShot(t.session!, POINT).session; // 일부러 다른 세션
        const u = simReducer(t, { type: "serverAck", idx: 0, mismatch: true, final: serverFinal, session: serverSession });
        expect(u.mismatches).toBe(1);
        expect(u.pendingSnap).not.toBeNull();
        expect(u.balls).toBe(t.balls);           // 재생 중엔 아직 안 바꾼다
        const v = simReducer(u, { type: "playbackEnd" });
        expect(v.balls).toBe(serverFinal);
        expect(v.session).toBe(serverSession);
        expect(v.pendingSnap).toBeNull();
        expect(v.phase).toBe("aim");
        expect(v.input.phi).toBeCloseTo(defaultPhi(serverFinal, "white", "3c"), 12);
    });
    it("aim 에서 온 미스매치(늦은 응답·재전송)는 즉시 스냅, 서버가 끝났다면 finished", () => {
        const u = simReducer(shoot(started(), MISS), { type: "playbackEnd" });
        const fin: SessionState = { ...u.session!, status: "finished", winnerIndex: 0 };
        const v = simReducer(u, { type: "serverAck", idx: 0, mismatch: true, final: balls3, session: fin });
        expect(v.balls).toBe(balls3);
        expect(v.phase).toBe("finished");
        expect(v.mismatches).toBe(1);
    });
    it("setup 에선 어떤 서버 응답도 무시", () => {
        expect(simReducer(INITIAL_STATE, { type: "serverAck", idx: 0, mismatch: true, final: balls3, session: session3() })).toBe(INITIAL_STATE);
        expect(simReducer(INITIAL_STATE, { type: "serverFail", idx: 0, input, clientHash: "x", retryable: true })).toBe(INITIAL_STATE);
        expect(simReducer(INITIAL_STATE, { type: "serverSession", id: "s" })).toBe(INITIAL_STATE);
    });
    it("serverSession: id 저장, 샷 전이면 서버 세션 상태를 정본으로", () => {
        const s = started();
        const server: SessionState = { ...s.session!, players: [{ ...s.session!.players[0], id: "member-uuid" }] };
        const u = simReducer(s, { type: "serverSession", id: "srv-1", session: server });
        expect(u.serverSessionId).toBe("srv-1");
        expect(u.session!.players[0].id).toBe("member-uuid");
        // 이미 샷을 쳤으면 세션은 그대로
        const t = shoot(s, MISS);
        const v = simReducer(t, { type: "serverSession", id: "srv-2", session: server });
        expect(v.serverSessionId).toBe("srv-2");
        expect(v.session).toBe(t.session);
        // 연습 모드는 서버 세션이 없다
        expect(simReducer(started(false), { type: "serverSession", id: "x" }).serverSessionId).toBeNull();
    });
    it("serverUnavailable → offline", () => {
        const u = simReducer(started(), { type: "serverUnavailable" });
        expect(u.offline).toBe(true);
        expect(simReducer(u, { type: "serverUnavailable" })).toBe(u);
    });
});

describe("재전송 큐", () => {
    const fail = (s: SimCoreState, idx: number, retryable = true) =>
        simReducer(s, { type: "serverFail", idx, input, clientHash: "h".repeat(16), retryable });

    it("네트워크 실패는 큐에 들어가고(idx 순), 재시도마다 tries 가 오르고, MAX_RETRIES 에 포기(offline)", () => {
        let s = simReducer(shoot(started(), MISS), { type: "playbackEnd" });
        s = fail(s, 0);
        expect(s.queue).toEqual([{ idx: 0, input, clientHash: "h".repeat(16), tries: 1 }]);
        expect(s.offline).toBe(false);
        s = fail(s, 0);
        expect(s.queue[0].tries).toBe(2);
        expect(s.offline).toBe(false);
        s = fail(s, 0);
        expect(MAX_RETRIES).toBe(3);
        expect(s.queue).toEqual([]);
        expect(s.offline).toBe(true);
        // 포기한 뒤엔 무시
        expect(fail(s, 1)).toBe(s);
    });
    it("큐는 idx 오름차순을 유지", () => {
        let s = started();
        s = fail(fail(s, 2), 1);
        expect(s.queue.map((q) => q.idx)).toEqual([1, 2]);
        s = fail(s, 0);
        expect(s.queue.map((q) => q.idx)).toEqual([0, 1, 2]);
    });
    it("거부(비재시도) 실패는 즉시 포기", () => {
        const s = fail(started(), 0, false);
        expect(s.offline).toBe(true);
        expect(s.queue).toEqual([]);
    });
    it("queueShot: 시도 0 으로 넣고, 같은 idx 가 있거나 offline 이면 무시", () => {
        let s = started();
        s = simReducer(s, { type: "queueShot", idx: 1, input, clientHash: "b" });
        s = simReducer(s, { type: "queueShot", idx: 0, input, clientHash: "a" });
        expect(s.queue.map((q) => [q.idx, q.tries])).toEqual([[0, 0], [1, 0]]);
        expect(simReducer(s, { type: "queueShot", idx: 1, input, clientHash: "zzz" })).toBe(s);
        const off = simReducer(s, { type: "serverUnavailable" });
        expect(simReducer(off, { type: "queueShot", idx: 2, input, clientHash: "c" })).toBe(off);
        // 큐에 든 뒤 실패하면 tries 1
        expect(fail(s, 0).queue[0].tries).toBe(1);
    });
    it("미스매치 스냅은 서버 판정도 가져온다(있을 때만)", () => {
        const u = simReducer(shoot(started(), MISS), { type: "playbackEnd" });
        const v = simReducer(u, { type: "serverAck", idx: 0, mismatch: true, final: balls3, session: u.session!, outcome: POINT });
        expect(v.outcomeLast).toBe(POINT);
        const w = simReducer(u, { type: "serverAck", idx: 0, mismatch: true, final: balls3, session: u.session! });
        expect(w.outcomeLast).toBe(u.outcomeLast);
    });
    it("성공(ack)·이미 기록됨(landed)은 큐에서 뺀다", () => {
        let s = fail(fail(started(), 0), 1);
        s = simReducer(s, { type: "serverAck", idx: 0, mismatch: false, final: balls3, session: s.session! });
        expect(s.queue.map((q) => q.idx)).toEqual([1]);
        s = simReducer(s, { type: "serverLanded", idx: 1 });
        expect(s.queue).toEqual([]);
        expect(simReducer(s, { type: "serverLanded", idx: 9 })).toBe(s);
    });
});

describe("undo / placeBall (연습 모드 전용)", () => {
    it("기록 모드에선 undo 가 아무것도 하지 않는다", () => {
        const u = simReducer(shoot(started(true), MISS), { type: "playbackEnd" });
        expect(simReducer(u, { type: "undo" })).toBe(u);
    });
    it("연습 모드: 샷 전 상태(공·세션·idx·입력)로 되돌리고, 스택이 비면 무시", () => {
        const s0 = started(false);
        const s1 = simReducer(shoot(s0, MISS, 0.1), { type: "playbackEnd" });
        const s2 = simReducer(shoot(s1, POINT, 0.2), { type: "playbackEnd" });
        expect(s2.undo).toHaveLength(2);
        expect(s2.shotIdx).toBe(2);
        const u1 = simReducer(s2, { type: "undo" });
        expect(u1.balls).toBe(s1.balls);
        expect(u1.session).toBe(s1.session);
        expect(u1.shotIdx).toBe(1);
        expect(u1.outcomeLast).toBe(s1.outcomeLast);
        expect(u1.input).toBe(s1.input);
        const u0 = simReducer(u1, { type: "undo" });
        expect(u0.balls).toBe(balls3);
        expect(u0.shotIdx).toBe(0);
        expect(u0.outcomeLast).toBeNull();
        expect(simReducer(u0, { type: "undo" })).toBe(u0);
    });
    it("재생 중엔 불가, 끝난 뒤(finished)엔 가능해 이어서 칠 수 있다", () => {
        const s = started(false, session3(1));
        const t = shoot(s, POINT);
        expect(simReducer(t, { type: "undo" })).toBe(t);
        const f = simReducer(t, { type: "playbackEnd" });
        expect(f.phase).toBe("finished");
        const u = simReducer(f, { type: "undo" });
        expect(u.phase).toBe("aim");
        expect(u.session!.status).toBe("playing");
    });
    it("placeBall: 기록 모드·재생 중·잘못된 배치는 무시, 유효하면 이동, 큐볼이면 다시 조준", () => {
        const rec = started(true);
        expect(simReducer(rec, { type: "placeBall", id: "red", x: 0.5, y: 1.0, table })).toBe(rec);
        const s = started(false);
        // 테이블 밖
        expect(simReducer(s, { type: "placeBall", id: "red", x: 0, y: 1.0, table })).toBe(s);
        // 다른 공과 겹침(상대 큐볼 위치)
        const yellow = balls3.find((b) => b.id === "yellow")!;
        expect(simReducer(s, { type: "placeBall", id: "red", x: yellow.r[0] + R, y: yellow.r[1], table })).toBe(s);
        // 없는 공
        expect(simReducer(s, { type: "placeBall", id: "nope", x: 0.5, y: 1, table })).toBe(s);
        // 유효
        const m = simReducer(s, { type: "placeBall", id: "red", x: 0.5, y: 1.0, table });
        const red = m.balls.find((b) => b.id === "red")!;
        expect(red.r).toEqual([0.5, 1.0, R]);
        expect(red.state).toBe("stationary");
        expect(m.input).toBe(s.input);
        // 큐볼을 옮기면 다시 조준
        const c = simReducer(m, { type: "placeBall", id: "white", x: 0.5, y: 1.5, table });
        expect(c.input.phi).toBeCloseTo(defaultPhi(c.balls, "white", "3c"), 12);
        // 재생 중
        const t = shoot(s, MISS);
        expect(simReducer(t, { type: "placeBall", id: "red", x: 0.5, y: 1.0, table })).toBe(t);
    });
});

describe("restart / exit", () => {
    it("restart: 새 세션·배치, 카운터 초기화, 기록 플래그·세기 유지", () => {
        let s = started(false);
        s = simReducer(s, { type: "setInput", patch: { V0: 4 } });
        s = simReducer(shoot(s, MISS), { type: "playbackEnd" });
        s = simReducer(s, { type: "serverFail", idx: 0, input, clientHash: "x", retryable: true });
        const r = simReducer(s, { type: "restart", session: session3(), balls: balls3 });
        expect(r.phase).toBe("aim");
        expect(r.record).toBe(false);
        expect(r.shotIdx).toBe(0);
        expect(r.undo).toEqual([]);
        expect(r.queue).toEqual([]);
        expect(r.mismatches).toBe(0);
        expect(r.offline).toBe(false);
        expect(r.serverSessionId).toBeNull();
        expect(r.input.V0).toBe(4);
        expect(r.balls).toBe(balls3);
        expect(simReducer(INITIAL_STATE, { type: "restart", session: session3(), balls: balls3 })).toBe(INITIAL_STATE);
    });
    it("exit → 초기 상태(같은 참조)", () => {
        const s = shoot(started(), MISS);
        expect(simReducer(s, { type: "exit" })).toBe(INITIAL_STATE);
        expect(simReducer(INITIAL_STATE, { type: "exit" })).toBe(INITIAL_STATE);
    });
    it("4구 세션도 같은 흐름", () => {
        const sess = createSession({ rules: DEFAULT_4C_RULES, players: [{ id: "p1", target: 30 }] });
        const s = simReducer(INITIAL_STATE, { type: "start", session: sess, balls: balls4, record: true });
        expect(s.input.phi).toBeCloseTo(defaultPhi(balls4, "white", "4c"), 12);
    });
});

describe("createSimStore", () => {
    it("바뀔 때만 알리고, 해제하면 더 이상 부르지 않는다", () => {
        const store = createSimStore();
        const cb = vi.fn();
        const off = store.subscribe(cb);
        store.dispatch({ type: "exit" });                 // 변화 없음
        expect(cb).not.toHaveBeenCalled();
        store.dispatch({ type: "start", session: session3(), balls: balls3, record: true });
        expect(cb).toHaveBeenCalledTimes(1);
        expect(store.get().phase).toBe("aim");
        off();
        store.dispatch({ type: "setInput", patch: { V0: 3 } });
        expect(cb).toHaveBeenCalledTimes(1);
        expect(store.get().input.V0).toBe(3);
    });
    it("구독 콜백 안에서 해제해도 안전", () => {
        const store = createSimStore();
        const calls: string[] = [];
        const off = store.subscribe(() => { calls.push("a"); off(); });
        store.subscribe(() => calls.push("b"));
        store.dispatch({ type: "start", session: session3(), balls: balls3, record: true });
        store.dispatch({ type: "setInput", patch: { V0: 3 } });
        expect(calls).toEqual(["a", "b", "b"]);
    });
});
