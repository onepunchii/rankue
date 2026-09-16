import { describe, it, expect, vi } from "vitest";
import { TABLES, DEFAULT_CUE } from "@shared/sim/params";
import { openingLayout } from "@shared/sim/layouts";
import { applyShot, createSession, currentPlayer, DEFAULT_3C_RULES, DEFAULT_4C_RULES, type SessionState, type ShotOutcome } from "@shared/sim/rules";
import type { BallState, ShotInput } from "@shared/sim/types";
import { thicknessFor } from "./aim";
import { squirtFor } from "./aimAssist";
import { buildConfig } from "./setupPresets";
import {
    simReducer, createSimStore, INITIAL_STATE,
    clampPower, clampElevation, clampSpin, defaultPhi, thicknessPhi, initialInput, paramsFromConfig, objectTargetFor,
    V0_MIN, V0_MAX, V0_LEGACY_MAX, V0_DEFAULT, THETA_MAX, MAX_RETRIES,
    sameCueInput, type SimCoreState } from "./simReducer";

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
        // 엔진 상한은 옛 값 기준(V0_LEGACY_MAX) — 화면에서 낼 수 있는 최대치(V0_MAX)는 퍼센트 변환이 묶는다.
        // 2026-09-12 에 화면 상한을 9 → 6.5 로 낮추면서, 그 전에 저장된 샷이 그대로 재생되도록 남긴 구분이다.
        expect(clampPower(12)).toBe(V0_LEGACY_MAX);
        expect(clampPower(V0_MAX + 1)).toBe(V0_MAX + 1);
        expect(clampPower(0)).toBe(V0_MIN);
        expect(clampPower(Number.NaN)).toBe(V0_DEFAULT);
        expect(clampElevation(2)).toBe(THETA_MAX);
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
    it("개시 샷은 빨간 공 기준: 기본 조준·두께 버튼·initialInput 모두", () => {
        const cue = balls3.find((b) => b.id === "white")!;
        const red = balls3.find((b) => b.id === "red")!;
        const toRed = Math.atan2(red.r[1] - cue.r[1], red.r[0] - cue.r[0]);
        expect(objectTargetFor(balls3, "white", "3c", true)!.id).toBe("red");
        expect(defaultPhi(balls3, "white", "3c", true)).toBeCloseTo(toRed, 9);
        expect(initialInput(balls3, "white", "3c", true).phi).toBeCloseTo(toRed, 9);
        const phi = thicknessPhi(balls3, "white", "3c", 0.5, "left", R, true)!;
        expect(thicknessFor([cue.r[0], cue.r[1]], phi, [red.r[0], red.r[1]], R).thickness).toBeCloseTo(0.5, 6);
        // 빨간 공이 없는 배치면 평소대로 가장 가까운 공
        expect(objectTargetFor(balls3.filter((b) => b.id !== "red"), "white", "3c", true)!.id).toBe("yellow");
        // 세션으로 시작하면(개시 배치·첫 샷) 조준이 빨간 공을 향한다
        const st = simReducer(INITIAL_STATE, { type: "start", session: session3(), balls: balls3, record: false });
        expect(st.input.phi).toBeCloseTo(toRed, 9);
        // 공을 옮기면 개시 배치가 아니므로 가장 가까운 공(노란 공)으로 돌아간다
        const st2 = simReducer(st, { type: "placeBall", id: "white", x: cue.r[0] + 0.05, y: cue.r[1], table });
        expect(st2.input.phi).toBeCloseTo(Math.PI, 9);
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
        expect(s.input).toEqual(initialInput(balls3, "white", "3c", true));   // 개시 배치 첫 샷 → 빨간 공 기준
    });
    it("setInput 은 aim 에서만, 클램프·정규화, 변화 없으면 같은 참조", () => {
        const s = started();
        const a = simReducer(s, { type: "setInput", patch: { V0: 20, theta: 3, a: 0.6, b: 0.6, phi: -1 } });
        expect(a.input.V0).toBe(V0_LEGACY_MAX);
        expect(a.input.theta).toBe(THETA_MAX);
        expect(a.input.a * a.input.a + a.input.b * a.input.b).toBeLessThanOrEqual(0.25);
        expect(a.input.phi).toBeCloseTo(2 * Math.PI - 1, 12);
        expect(simReducer(a, { type: "setInput", patch: { V0: V0_LEGACY_MAX } })).toBe(a);
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

/* ------------------------------------------------------------------ 네트워크 대전(mode="match") */

import { cueBallIdOf, matchStateFrom, sameBalls, sameMatchMeta } from "./simReducer";
import type { MatchPublic } from "./matchApi";

const matchSession = (target = 20): SessionState => createSession({
    rules: DEFAULT_3C_RULES,
    players: [{ id: "host-uuid", target, cueBallId: "white" }, { id: "guest-uuid", target, cueBallId: "yellow" }],
});

function publicMatch(over: Partial<MatchPublic> = {}): MatchPublic {
    return {
        id: "m-1", code: "123456", status: "playing",
        gameType: "3c", tableId: "DAEDAE", cushionModel: "han2005", condition: 1,
        rules: DEFAULT_3C_RULES, finishType: "none", inningCap: 0,
        hostName: "호스트", guestName: "게스트", hostTarget: 20, guestTarget: 20,
        myIndex: 0, turn: 0, shots: 0, version: 1,
        state: matchSession(), balls: balls3,
        winnerIndex: null, endReason: null, engineVersion: "2.1.0", paramsHash: "0".repeat(16),
        createdAt: "2026-09-07T00:00:00.000Z", startedAt: "2026-09-07T00:01:00.000Z", lastShotAt: null, finishedAt: null,
        claimableAt: "2026-09-09T00:01:00.000Z", opponentAway: false,
        ...over,
    };
}

function startMatch(myIndex: 0 | 1, m: MatchPublic = publicMatch(), sess: SessionState = m.state!): SimCoreState {
    return simReducer(INITIAL_STATE, { type: "startMatch", match: matchStateFrom(m, myIndex), session: sess, balls: m.balls!, shots: m.shots });
}

/** 상대(또는 다른 기기)의 샷을 따라잡기 재생으로 넣는다. */
function replay(s: SimCoreState, outcome: ShotOutcome, playerIndex: number, mismatch = false, dy = 0.1): SimCoreState {
    const applied = applyShot(s.session!, outcome);
    const cue = s.session!.players[playerIndex].cueBallId;
    return simReducer(s, { type: "replayShot", input: { ...input, cueBallId: cue }, final: shifted(s.balls, dy), session: applied.session, outcome: applied.outcome, playerIndex, mismatch });
}

describe("대전: 메타 헬퍼", () => {
    it("matchStateFrom: 내 자리에 따라 내 이름·상대 이름, sameMatchMeta 는 필드 비교", () => {
        const m = publicMatch();
        const host = matchStateFrom(m, 0);
        expect(host).toEqual({ matchId: "m-1", myIndex: 0, version: 1, myName: "호스트", opponentName: "게스트", turn: 0, status: "playing", claimableAt: m.claimableAt, turnSeenAt: null, endReason: null, winnerIndex: null, timeouts: [0, 0], watchers: 0, opponentAway: false, handicap: false, emoji: null, opponentAim: null });
        // 상대 조준은 메타가 아니다 — 1.2초마다 바뀌는 표시용 값이라 스냅을 부르면 재생 중에도 화면이 튄다(2026-09-16)
        expect(sameMatchMeta(host, matchStateFrom({ ...m, opponentAim: { phi: 1.2, at: "2026-09-16T00:00:00.000Z" } }, 0))).toBe(true);
        // 쓰리아웃 횟수도 메타 — 바뀌면 스냅한다
        expect(sameMatchMeta(host, matchStateFrom({ ...m, timeouts: [1, 0] }, 0))).toBe(false);
        expect(sameMatchMeta(host, matchStateFrom({ ...m, turnSeenAt: "2026-09-07T00:00:00.000Z" }, 0))).toBe(false);
        expect(sameMatchMeta(host, matchStateFrom({ ...m, emoji: { code: "hi", from: 1, at: "2026-09-09T00:00:00.000Z" } }, 0))).toBe(false);
        // 상대 자리 비움도 메타 — 바뀌면 화면이 "잠시 뒤 시계가 시작됩니다" 안내를 켜고 끈다(2026-09-15)
        expect(sameMatchMeta(host, matchStateFrom({ ...m, opponentAway: true }, 0))).toBe(false);
        const guest = matchStateFrom(m, 1);
        expect(guest.myName).toBe("게스트");
        expect(guest.opponentName).toBe("호스트");
        expect(sameMatchMeta(host, matchStateFrom(m, 0))).toBe(true);
        expect(sameMatchMeta(host, matchStateFrom({ ...m, version: 2 }, 0))).toBe(false);
    });
    it("sameBalls: 순서·id·위치(허용 오차)", () => {
        expect(sameBalls(balls3, balls3.map((b) => ({ ...b })))).toBe(true);
        expect(sameBalls(balls3, shifted(balls3, 1e-12))).toBe(true);
        expect(sameBalls(balls3, shifted(balls3, 1e-6))).toBe(false);
        expect(sameBalls(balls3, balls3.slice(1))).toBe(false);
        expect(sameBalls(balls3, [balls3[1], balls3[0], balls3[2]])).toBe(false);
    });
});

describe("대전: 시작과 잠금", () => {
    it("호스트(내 차례) → aim, 게스트(상대 차례) → waiting. record 는 항상 true, idx 는 서버 샷 수", () => {
        const host = startMatch(0);
        expect(host.mode).toBe("match");
        expect(host.phase).toBe("aim");
        expect(host.record).toBe(true);
        expect(host.match!.myIndex).toBe(0);
        expect(host.input.phi).toBeCloseTo(defaultPhi(balls3, "white", "3c", true), 12);
        const guest = startMatch(1);
        expect(guest.phase).toBe("waiting");
        expect(guest.match!.opponentName).toBe("호스트");
        const later = startMatch(1, publicMatch({ shots: 7, turn: 1, state: { ...matchSession(), turn: 1 } }));
        expect(later.phase).toBe("aim");
        expect(later.shotIdx).toBe(7);
        expect(cueBallIdOf(later.session)).toBe("yellow");
    });
    it("끝난 대전으로 시작하면 finished(기권으로 끝나 세션은 playing 이어도)", () => {
        const s = startMatch(0, publicMatch({ status: "finished", winnerIndex: 1, endReason: "resign" }));
        expect(s.phase).toBe("finished");
        expect(s.session!.status).toBe("finished");
        expect(s.session!.winnerIndex).toBe(1);
    });
    it("waiting 에선 입력·샷이 잠기고, 되돌리기·배치·다시하기는 대전에 없다", () => {
        const g = startMatch(1);
        expect(simReducer(g, { type: "setInput", patch: { V0: 3 } })).toBe(g);
        expect(shoot(g, MISS)).toBe(g);
        const h = simReducer(shoot(startMatch(0), MISS), { type: "playbackEnd" });
        expect(simReducer(h, { type: "undo" })).toBe(h);
        expect(simReducer(h, { type: "placeBall", id: "red", x: 0.5, y: 1.0, table })).toBe(h);
        expect(simReducer(h, { type: "restart", session: matchSession(), balls: balls3 })).toBe(h);
        // 솔로 전용 서버 액션은 무시
        expect(simReducer(h, { type: "serverSession", id: "srv" })).toBe(h);
        expect(simReducer(h, { type: "serverUnavailable" })).toBe(h);
        expect(simReducer(h, { type: "serverAck", idx: 0, mismatch: true, final: balls3, session: h.session! })).toBe(h);
        expect(simReducer(h, { type: "serverFail", idx: 0, input, clientHash: "x", retryable: true })).toBe(h);
    });
    it("내 샷: 이닝을 넘기면 재생 뒤 waiting, 득점이면 aim 으로 이어 친다", () => {
        const s = startMatch(0);
        const miss = simReducer(shoot(s, MISS), { type: "playbackEnd" });
        expect(miss.phase).toBe("waiting");
        expect(miss.replayOf).toBeNull();
        expect(miss.shotIdx).toBe(1);
        const point = simReducer(shoot(s, POINT), { type: "playbackEnd" });
        expect(point.phase).toBe("aim");
        expect(point.input.phi).toBeCloseTo(defaultPhi(point.balls, "white", "3c"), 12);
    });
});

describe("대전: 따라잡기 재생", () => {
    it("waiting → replayShot(상대) → shooting(replayOf=상대) → playbackEnd → 내 차례면 aim", () => {
        const g = startMatch(1);
        const r = replay(g, MISS, 0);
        expect(r.phase).toBe("shooting");
        expect(r.replayOf).toBe(0);
        expect(r.shotIdx).toBe(1);
        expect(r.session!.turn).toBe(1);
        expect(r.outcomeLast!.code).toBe("miss-cushions");
        const u = simReducer(r, { type: "playbackEnd" });
        expect(u.phase).toBe("aim");
        expect(u.replayOf).toBeNull();
        expect(u.input.phi).toBeCloseTo(defaultPhi(u.balls, "yellow", "3c"), 12);
        expect(simReducer(u, { type: "setInput", patch: { V0: 3 } }).input.V0).toBe(3);
    });
    it("상대가 득점하면 재생 뒤에도 waiting", () => {
        const u = simReducer(replay(startMatch(1), POINT, 0), { type: "playbackEnd" });
        expect(u.phase).toBe("waiting");
        expect(u.session!.players[0].score).toBe(1);
    });
    it("방장의 결승 샷 → 후구로 내 차례가 온다(2026-09-12)", () => {
        const g = startMatch(1, publicMatch({ state: matchSession(1) }));
        const u = simReducer(replay(g, POINT, 0), { type: "playbackEnd" });
        expect(u.phase).toBe("aim");                    // 아직 안 끝났다 — 내 마지막 이닝
        expect(u.session!.status).toBe("playing");
        expect(u.session!.pendingWinner).toBe(0);
    });
    it("해시 불일치는 누적 카운트에 들어가고, 재생 중·setup·솔로에선 무시", () => {
        const g = startMatch(1);
        const r = replay(g, MISS, 0, true);
        expect(r.mismatches).toBe(1);
        expect(replay(r, MISS, 1)).toBe(r);                                  // shooting
        expect(simReducer(INITIAL_STATE, { type: "replayShot", input, final: balls3, session: matchSession(), outcome: MISS, playerIndex: 0, mismatch: false })).toBe(INITIAL_STATE);
        const solo = started();
        expect(simReducer(solo, { type: "replayShot", input, final: balls3, session: solo.session!, outcome: MISS, playerIndex: 0, mismatch: false })).toBe(solo);
    });
    it("aim 에서도(다시 맞춘 뒤 놓친 샷) 재생을 시작할 수 있다", () => {
        const h = startMatch(0);
        const r = replay(h, MISS, 0);        // 다른 기기에서 친 내 샷
        expect(r.phase).toBe("shooting");
        expect(r.replayOf).toBe(0);
        expect(simReducer(r, { type: "playbackEnd" }).phase).toBe("waiting");
    });
});

describe("대전: 서버 메타·스냅", () => {
    it("matchSync: 같은 메타면 같은 참조, 바뀌면 갱신하고 offline 을 푼다", () => {
        const g = startMatch(1);
        const same = simReducer(g, { type: "matchSync", match: matchStateFrom(publicMatch(), 1) });
        expect(same).toBe(g);
        const v2 = simReducer(g, { type: "matchSync", match: matchStateFrom(publicMatch({ version: 2, claimableAt: "2026-09-10T00:00:00.000Z" }), 1) });
        expect(v2.match!.version).toBe(2);
        expect(v2.phase).toBe("waiting");
        expect(v2.balls).toBe(g.balls);
    });
    it("matchSync: 서버가 끝냈으면(기권·무응답) 세션도 finished + 승자, 단계 finished", () => {
        const g = startMatch(1);
        const fin = simReducer(g, { type: "matchSync", match: matchStateFrom(publicMatch({ status: "finished", winnerIndex: 1, endReason: "resign", claimableAt: null }), 1) });
        expect(fin.phase).toBe("finished");
        expect(fin.session!.status).toBe("finished");
        expect(fin.session!.winnerIndex).toBe(1);
        expect(fin.match!.endReason).toBe("resign");
        // 재생 중이면 단계는 그대로, playbackEnd 에서 finished
        const r = replay(startMatch(1), MISS, 0);
        const during = simReducer(r, { type: "matchSync", match: matchStateFrom(publicMatch({ status: "finished", winnerIndex: 0, endReason: "claim" }), 1) });
        expect(during.phase).toBe("shooting");
        expect(simReducer(during, { type: "playbackEnd" }).phase).toBe("finished");
    });
    it("matchSnap: 공·세션·샷 수를 서버로, 큐·pendingSnap 은 버리고, mismatch 면 +1, 단계는 차례로", () => {
        let s = simReducer(shoot(startMatch(0), MISS), { type: "playbackEnd" });        // 내 샷 뒤 waiting, idx 1
        s = simReducer(s, { type: "matchShotFail", idx: 0, input, clientHash: "h".repeat(16) });
        expect(s.queue).toHaveLength(1);
        const serverBalls = shifted(balls3, 0.5);
        const serverState = { ...matchSession(), turn: 0, shotCount: 2 };
        const snapped = simReducer(s, { type: "matchSnap", match: matchStateFrom(publicMatch({ shots: 2, version: 3 }), 0), session: serverState, balls: serverBalls, shots: 2, mismatch: true });
        expect(snapped.phase).toBe("aim");
        expect(snapped.balls).toBe(serverBalls);
        expect(snapped.session).toBe(serverState);
        expect(snapped.shotIdx).toBe(2);
        expect(snapped.queue).toEqual([]);
        expect(snapped.offline).toBe(false);
        expect(snapped.mismatches).toBe(1);
        expect(snapped.input.phi).toBeCloseTo(defaultPhi(serverBalls, "white", "3c"), 12);
        // 재생 중 스냅: 값은 바꾸되 단계는 shooting 유지, playbackEnd 가 정리
        const r = replay(startMatch(1), MISS, 0);
        const rs = simReducer(r, { type: "matchSnap", match: matchStateFrom(publicMatch({ shots: 1, turn: 1 }), 1), session: { ...matchSession(), turn: 1 }, balls: serverBalls, shots: 1, mismatch: false });
        expect(rs.phase).toBe("shooting");
        const end = simReducer(rs, { type: "playbackEnd" });
        expect(end.phase).toBe("aim");
        expect(end.balls).toBe(serverBalls);
        const solo = started();
        expect(simReducer(solo, { type: "matchSnap", match: matchStateFrom(publicMatch(), 0), session: serverState, balls: serverBalls, shots: 2, mismatch: false })).toBe(solo);
    });
});

describe("대전: 내 샷 응답과 재전송", () => {
    const meta = (over: Partial<MatchPublic> = {}) => matchStateFrom(publicMatch({ version: 2, ...over }), 0);
    it("일치 응답: 큐에서 빼고 메타만(공·세션 유지)", () => {
        const t = shoot(startMatch(0), MISS);
        const u = simReducer(t, { type: "matchShotAck", idx: 0, match: meta({ turn: 1 }), mismatch: false, final: null, session: null });
        expect(u.balls).toBe(t.balls);
        expect(u.session).toBe(t.session);
        expect(u.match!.turn).toBe(1);
        expect(u.phase).toBe("shooting");
        expect(simReducer(u, { type: "playbackEnd" }).phase).toBe("waiting");
    });
    it("미스매치 응답: 재생 중이면 pendingSnap, 재생 끝에 서버 상태로 + 단계는 서버 차례 기준", () => {
        const s = startMatch(0);
        const t = shoot(s, MISS, 0.1);
        const serverFinal = shifted(balls3, 0.4);
        const serverSession = applyShot(s.session!, POINT).session;     // 서버는 득점으로 봤다 → 내 차례 유지
        const u = simReducer(t, { type: "matchShotAck", idx: 0, match: meta({ turn: 0 }), mismatch: true, final: serverFinal, session: serverSession, outcome: POINT });
        expect(u.pendingSnap).not.toBeNull();
        expect(u.mismatches).toBe(1);
        const v = simReducer(u, { type: "playbackEnd" });
        expect(v.balls).toBe(serverFinal);
        expect(v.session).toBe(serverSession);
        expect(v.outcomeLast).toBe(POINT);
        expect(v.phase).toBe("aim");
    });
    it("응답이 끝을 알리면(목표 도달) finished", () => {
        const s = startMatch(0, publicMatch({ state: matchSession(1) }));
        const t = shoot(s, POINT);
        const u = simReducer(t, { type: "matchShotAck", idx: 0, match: meta({ status: "finished", winnerIndex: 0, endReason: "target" }), mismatch: false, final: null, session: null });
        expect(simReducer(u, { type: "playbackEnd" }).phase).toBe("finished");
    });
    it(`네트워크 실패: 큐에 남기고 tries 를 세다 ${MAX_RETRIES}번째에 offline — 항목은 버리지 않는다; 폴링 성공(matchSync)이 풀어 준다`, () => {
        let s = simReducer(shoot(startMatch(0), MISS), { type: "playbackEnd" });
        const fail = (x: SimCoreState) => simReducer(x, { type: "matchShotFail", idx: 0, input, clientHash: "h".repeat(16) });
        s = fail(s);
        expect(s.queue).toEqual([{ idx: 0, input, clientHash: "h".repeat(16), tries: 1 }]);
        expect(s.offline).toBe(false);
        s = fail(fail(s));
        expect(s.queue[0].tries).toBe(3);
        expect(s.offline).toBe(true);
        // offline 이어도 다음 샷은 큐에 들어간다(연결이 돌아오면 순서대로 나간다)
        const q = simReducer(s, { type: "queueShot", idx: 1, input, clientHash: "i".repeat(16) });
        expect(q.queue.map((e) => e.idx)).toEqual([0, 1]);
        // 폴링 성공 → offline 해제 + tries 0
        const back = simReducer(q, { type: "matchSync", match: meta() });
        expect(back.offline).toBe(false);
        expect(back.queue.map((e) => e.tries)).toEqual([0, 0]);
        // 응답 도착 → 큐에서 제거
        const acked = simReducer(back, { type: "matchShotAck", idx: 0, match: meta({ turn: 1 }), mismatch: false, final: null, session: null });
        expect(acked.queue.map((e) => e.idx)).toEqual([1]);
    });
});

describe("조준 보정(스쿼트) — 일반 모드는 당점을 바꿔도 화면 조준(공 방향)이 고정", () => {
    it("옆당점 a 가 바뀌면 큐 방향 phi 가 스쿼트 차이만큼 돌아 phi + squirt(a) 가 그대로다", () => {
        const s0 = simReducer(INITIAL_STATE, { type: "start", session: session3(), balls: balls3, record: false, aimAssist: true });
        expect(s0.aimAssist).toBe(true);
        const aim0 = s0.input.phi + squirtFor(s0.input.a);
        const s1 = simReducer(s0, { type: "setInput", patch: { a: 0.4 } });
        expect(s1.input.a).toBe(0.4);
        expect(s1.input.phi).not.toBe(s0.input.phi);
        expect(s1.input.phi + squirtFor(0.4)).toBeCloseTo(aim0, 12);
        const s2 = simReducer(s1, { type: "setInput", patch: { a: -0.3, b: 0.1 } });
        expect(s2.input.phi + squirtFor(-0.3)).toBeCloseTo(aim0, 12);
        // 세로 당점만 바꾸면 phi 그대로
        const s3 = simReducer(s2, { type: "setInput", patch: { b: -0.2 } });
        expect(s3.input.phi).toBe(s2.input.phi);
    });
    it("phi 를 같이 주면(해법 적용) 보정하지 않고 그 값을 큐 방향으로 쓴다", () => {
        const s0 = simReducer(INITIAL_STATE, { type: "start", session: session3(), balls: balls3, record: false, aimAssist: true });
        const s1 = simReducer(s0, { type: "setInput", patch: { phi: 1.234, a: 0.4 } });
        expect(s1.input.phi).toBeCloseTo(1.234, 12);
        expect(s1.input.a).toBe(0.4);
    });
    it("리얼리티(보정 꺼짐)는 당점을 바꿔도 phi 그대로, 기본값은 켜짐", () => {
        const s0 = simReducer(INITIAL_STATE, { type: "start", session: session3(), balls: balls3, record: false, aimAssist: false });
        expect(s0.aimAssist).toBe(false);
        const s1 = simReducer(s0, { type: "setInput", patch: { a: 0.5 } });
        expect(s1.input.phi).toBe(s0.input.phi);
        expect(simReducer(INITIAL_STATE, { type: "start", session: session3(), balls: balls3, record: false }).aimAssist).toBe(true);
    });
});

describe("sameCueInput — 길을 고른 뒤 조준이 바뀌었나(2026-09-16)", () => {
    const base = { phi: 1.2345, V0: 2.5, a: 0.1, b: -0.2, theta: 0 };
    it("같은 값이면 같다", () => {
        expect(sameCueInput(base, { ...base })).toBe(true);
    });
    it("방향·세기·당점·큐 각 중 하나라도 달라지면 다르다 — 그린 길을 지울 신호", () => {
        expect(sameCueInput(base, { ...base, phi: 1.2346 })).toBe(false);
        expect(sameCueInput(base, { ...base, V0: 2.6 })).toBe(false);
        expect(sameCueInput(base, { ...base, a: 0 })).toBe(false);
        expect(sameCueInput(base, { ...base, b: 0 })).toBe(false);
        expect(sameCueInput(base, { ...base, theta: 5 })).toBe(false);
    });
    it("미세 방향조절 한 번(0.1°)도 잡아낸다", () => {
        expect(sameCueInput(base, { ...base, phi: base.phi + (Math.PI / 180) * 0.1 })).toBe(false);
    });
});
