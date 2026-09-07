import { describe, it, expect } from "vitest";
import { TABLES } from "@shared/sim/params";
import type { BallState, SimEvent, Snapshot } from "@shared/sim/types";
import type { XY } from "../aim";
import {
    CANONICAL, analyzeAim, analyzeShot, createNumbersCache, departureFrom, guessOrientation, mirrorPoint, overlayDiamond,
    railNumber, railY, readDiamondPref, shotReadout, systemNumbers, writeDiamondPref, type Orientation,
} from "./diamondSystem";

const T = TABLES.DAEDAE;
const W = T.width, L = T.length, R = T.ball.R;
const ball = (id: string, x: number, y: number, vx = 0, vy = 0): BallState => ({
    id, r: [x, y, R], v: [vx, vy, 0], w: [0, 0, 0], state: vx || vy ? "rolling" : "stationary",
});

const ORIENTATIONS: readonly Orientation[] = [
    { ownRail: "right", nearShort: "bottom" },
    { ownRail: "left", nearShort: "bottom" },
    { ownRail: "right", nearShort: "top" },
    { ownRail: "left", nearShort: "top" },
];

/** 정규 방향: 큐볼 중심 c 에서 왼쪽 레일(공 중심선 x = R)의 y1 을 겨누는 phi. */
const aimAt = (c: XY, y1: number): number => Math.atan2(y1 - c[1], R - c[0]);
/** 방향 o 로 옮긴 phi(거울 대칭). */
const mirrorPhi = (phi: number, o: Orientation): number =>
    Math.atan2(o.nearShort === "bottom" ? Math.sin(phi) : -Math.sin(phi), o.ownRail === "right" ? Math.cos(phi) : -Math.cos(phi));

describe("눈금", () => {
    it("1·3쿠션수: 먼 코너 0, 다이아몬드마다 10, 가까운 코너 80, 클램프", () => {
        expect(railNumber(L, T)).toBe(0);
        expect(railNumber(L - L / 8, T)).toBeCloseTo(10, 12);
        expect(railNumber(L / 2, T)).toBeCloseTo(40, 12);
        expect(railNumber(0, T)).toBe(80);
        expect(railNumber(-1, T)).toBe(80);
        expect(railY(20, T)).toBeCloseTo(L - L / 4, 12);
        expect(railY(-5, T)).toBe(L);
    });
    it("출발수: 긴 레일 코너 50 → 다이아몬드마다 −5, 단쿠션 다이아몬드마다 +10", () => {
        // 큐볼이 레일에 붙어 있으면 되그은 선이 그 자리에서 만난다
        expect(departureFrom([R, L / 2], [W, 0], T)).toMatchObject({ number: 50, side: "long" });
        expect(departureFrom([R, L], [W, L / 8], T)!.number).toBeCloseTo(45, 12);
        expect(departureFrom([R, L], [W, L / 4], T)!.number).toBeCloseTo(40, 12);
        expect(departureFrom([R, L], [W / 2, 0], T)).toMatchObject({ number: 70, side: "short" });
        // 1쿠션 쪽으로 되돌아가는 선(수구 레일로 향하지 않음)은 null
        expect(departureFrom([W - R, L / 2], [R, L / 4], T)).toBeNull();
    });
});

describe("analyzeAim — 정규 방향", () => {
    it("교과서 예: 코너 50 에서 1쿠션 30 을 치면 3쿠션 20 (T = D − F)", () => {
        const cue = ball("white", W, 0); // 코너 코 라인 위(순수 함수라 배치 검증 없음)
        const phi = aimAt([W, 0], L - (3 * L) / 8);
        const a = analyzeAim(cue, [cue], phi, T)!;
        expect(a).not.toBeNull();
        expect(a.orientation).toEqual(CANONICAL);
        expect(a.firstRail.number).toBeCloseTo(30, 9);
        expect(a.firstRail.rail).toBe("left");
        expect(a.firstRail.point[0]).toBe(0);
        expect(a.firstRail.point[1]).toBeCloseTo(L - (3 * L) / 8, 9);
        expect(a.departure.number).toBeCloseTo(50, 9);
        expect(a.departure.side).toBe("long");
        expect(a.departure.rail).toBe("right");
        expect(a.predictedThird.number).toBeCloseTo(20, 9);
        expect(a.predictedThird.onRail).toBe(true);
        expect(a.predictedThird.rail).toBe("right");
        expect(a.predictedThird.point[0]).toBe(W);
        expect(a.predictedThird.point[1]).toBeCloseTo(L - L / 4, 9);
    });
    it("코너에 놓인 실제 큐볼(중심이 R 안쪽)도 출발 50, 예측 20 근처", () => {
        const cue = ball("white", W - R, R);
        const a = analyzeAim(cue, [cue], aimAt([W - R, R], (5 * L) / 8), T)!;
        expect(a.firstRail.number).toBeCloseTo(30, 9);
        expect(Math.abs(a.departure.number - 50)).toBeLessThan(0.5);
        expect(Math.abs(a.predictedThird.number - 20)).toBeLessThan(0.5);
    });
    it("레일에서 떨어진 큐볼: 출발수는 1쿠션점에서 큐볼을 지나 되그은 선이 코 라인과 만나는 곳을 보간", () => {
        const c: XY = [W / 2, L / 2];
        const y1 = L - L / 8; // 1쿠션 10
        const cue = ball("white", c[0], c[1]);
        const a = analyzeAim(cue, [cue], aimAt(c, y1), T)!;
        expect(a.firstRail.number).toBeCloseTo(10, 9);
        // 독립 계산: p1 = (R, y1) → c 방향으로 x = W 까지
        const dx = c[0] - R, dy = c[1] - y1;
        const yHit = c[1] + (dy * (W - c[0])) / dx;
        expect(yHit).toBeGreaterThan(0);
        const expected = 50 - (40 * yHit) / L;
        expect(a.departure.number).toBeCloseTo(expected, 9);
        expect(a.departure.side).toBe("long");
        expect(a.departure.point[1]).toBeCloseTo(yHit, 9);
        expect(a.predictedThird.number).toBeCloseTo(expected - 10, 9);
    });
    it("되그은 선이 단쿠션을 먼저 만나면 60·70·80 눈금으로 읽는다", () => {
        const c: XY = [W / 2, L / 4];
        const y1 = L - (3 * L) / 8; // 1쿠션 30
        const cue = ball("white", c[0], c[1]);
        const a = analyzeAim(cue, [cue], aimAt(c, y1), T)!;
        expect(a.departure.side).toBe("short");
        expect(a.departure.rail).toBe("bottom");
        expect(a.departure.point[1]).toBe(0);
        const dx = c[0] - R, dy = c[1] - y1;
        const xHit = c[0] + (dx * -c[1]) / dy;
        expect(a.departure.number).toBeCloseTo(50 + (40 * (W - xHit)) / W, 9);
    });
    it("범위 밖 예측: 산술값은 그대로, 점은 레일 안으로 클램프, onRail=false", () => {
        // 가까운 쪽에서 1쿠션 60 을 겨누면(출발 ≈ 51) 예측이 음수 — 2쿠션 뒤 수구 레일에 못 미친다
        const c: XY = [W / 2, L / 8];
        const cue = ball("white", c[0], c[1]);
        const a = analyzeAim(cue, [cue], aimAt(c, L / 4), T)!;
        expect(a.firstRail.number).toBeCloseTo(60, 9);
        expect(a.predictedThird.number).toBeLessThan(0);
        expect(a.predictedThird.onRail).toBe(false);
        expect(a.predictedThird.point[1]).toBe(L);
    });
    it("공이나 단쿠션을 먼저 만나거나 긴 레일에 수직이면 null", () => {
        const cue = ball("white", W / 2, L / 2);
        const red = ball("red", W / 4, (5 * L) / 8);
        const phi = aimAt([W / 2, L / 2], (3 * L) / 4);
        expect(analyzeAim(cue, [cue], phi, T)).not.toBeNull();
        expect(analyzeAim(cue, [cue, red], phi, T)).toBeNull(); // 빨간 공이 조준선 위
        expect(analyzeAim(cue, [cue], Math.PI / 2, T)).toBeNull(); // 위 단쿠션
        expect(analyzeAim(cue, [cue], Math.PI, T)).toBeNull(); // 왼쪽 레일에 수직
    });
});

describe("analyzeAim — 네 방향 거울 대칭", () => {
    const c: XY = [W / 2 + 0.2, L / 3];
    const phi0 = aimAt(c, L - (3 * L) / 8);
    const base = analyzeAim(ball("white", c[0], c[1]), [ball("white", c[0], c[1])], phi0, T)!;

    it.each(ORIENTATIONS)("%o", (o) => {
        const cm = mirrorPoint(c, o, T);
        const cue = ball("white", cm[0], cm[1]);
        const a = analyzeAim(cue, [cue], mirrorPhi(phi0, o), T)!;
        expect(a).not.toBeNull();
        expect(a.orientation).toEqual(o);
        expect(a.firstRail.number).toBeCloseTo(base.firstRail.number, 9);
        expect(a.departure.number).toBeCloseTo(base.departure.number, 9);
        expect(a.predictedThird.number).toBeCloseTo(base.predictedThird.number, 9);
        const f = mirrorPoint(base.firstRail.point, o, T);
        const d = mirrorPoint(base.departure.point, o, T);
        const p = mirrorPoint(base.predictedThird.point, o, T);
        expect(a.firstRail.point[0]).toBeCloseTo(f[0], 9);
        expect(a.firstRail.point[1]).toBeCloseTo(f[1], 9);
        expect(a.departure.point[0]).toBeCloseTo(d[0], 9);
        expect(a.departure.point[1]).toBeCloseTo(d[1], 9);
        expect(a.predictedThird.point[0]).toBeCloseTo(p[0], 9);
        expect(a.predictedThird.point[1]).toBeCloseTo(p[1], 9);
        expect(a.firstRail.rail).toBe(o.ownRail === "right" ? "left" : "right");
        expect(a.predictedThird.rail).toBe(o.ownRail);
    });

    it("mirrorPoint 는 자기 역함수", () => {
        for (const o of ORIENTATIONS) {
            const back = mirrorPoint(mirrorPoint(c, o, T), o, T);
            expect(back[0]).toBeCloseTo(c[0], 12);
            expect(back[1]).toBeCloseTo(c[1], 12);
        }
    });
});

describe("guessOrientation", () => {
    const c: XY = [W / 2, L / 2];
    it("진행 방향으로 수구 레일과 가까운 단쿠션을 고른다", () => {
        expect(guessOrientation(c, Math.atan2(1, -1), T)).toEqual({ ownRail: "right", nearShort: "bottom" });
        expect(guessOrientation(c, Math.atan2(-1, -1), T)).toEqual({ ownRail: "right", nearShort: "top" });
        expect(guessOrientation(c, Math.atan2(1, 1), T)).toEqual({ ownRail: "left", nearShort: "bottom" });
        expect(guessOrientation(c, Math.atan2(-1, 1), T)).toEqual({ ownRail: "left", nearShort: "top" });
    });
    it("축과 나란하면 가까운 레일", () => {
        expect(guessOrientation([0.2, 0.3], Math.PI / 2, T)).toEqual({ ownRail: "left", nearShort: "bottom" });
        expect(guessOrientation([W - 0.2, L - 0.3], -Math.PI / 2, T)).toEqual({ ownRail: "right", nearShort: "top" });
        expect(guessOrientation([W - 0.2, L - 0.3], 0, T)).toEqual({ ownRail: "left", nearShort: "top" });
    });
    it("유효한 조준이면 analyzeAim 의 방향과 같다", () => {
        const phi = aimAt(c, (3 * L) / 4);
        for (const o of ORIENTATIONS) {
            const cm = mirrorPoint(c, o, T);
            const cue = ball("white", cm[0], cm[1]);
            expect(guessOrientation(cm, mirrorPhi(phi, o), T)).toEqual(analyzeAim(cue, [cue], mirrorPhi(phi, o), T)!.orientation);
        }
    });
});

describe("systemNumbers", () => {
    it("정규 방향: 3쿠션 0…40 · 출발 50/40/30/20 + 60/70/80 · 1쿠션 10…70", () => {
        const labels = systemNumbers(T);
        expect(labels).toHaveLength(19);
        const find = (kind: string, n: number) => labels.find((l) => l.kind === kind && l.number === n)!;
        expect(find("departure", 50)).toMatchObject({ x: W, y: 0, row: 1, text: "50" });
        expect(find("departure", 30)).toMatchObject({ x: W, y: L / 2, row: 1, rail: "right" });
        expect(find("departure", 20).y).toBeCloseTo((6 * L) / 8, 12);
        expect(find("departure", 60)).toMatchObject({ x: (3 * W) / 4, y: 0, row: 0, rail: "bottom", nx: 0, ny: -1 });
        expect(find("departure", 80).x).toBeCloseTo(W / 4, 12);
        expect(find("third", 0)).toMatchObject({ x: W, y: L, row: 0 });
        expect(find("third", 40)).toMatchObject({ x: W, y: L / 2, row: 0, nx: 1, ny: 0 });
        expect(find("first", 10)).toMatchObject({ x: 0, y: L - L / 8, rail: "left", nx: -1, ny: 0 });
        expect(find("first", 70).y).toBeCloseTo(L / 8, 12);
        expect(labels.every((l) => l.text === String(l.number))).toBe(true);
        // 라벨은 모두 코 라인 위
        expect(labels.every((l) => l.x === 0 || l.x === W || l.y === 0 || l.y === L)).toBe(true);
    });
    it("네 방향은 거울 대칭으로 옮겨진다", () => {
        const base = systemNumbers(T);
        for (const o of ORIENTATIONS) {
            const labels = systemNumbers(T, o);
            expect(labels).toHaveLength(base.length);
            labels.forEach((l, i) => {
                const p = mirrorPoint([base[i].x, base[i].y], o, T);
                expect(l.number).toBe(base[i].number);
                expect(l.x).toBeCloseTo(p[0], 12);
                expect(l.y).toBeCloseTo(p[1], 12);
                expect(l.nx).toBeCloseTo(o.ownRail === "right" ? base[i].nx : -base[i].nx, 12);
                expect(l.ny).toBeCloseTo(o.nearShort === "bottom" ? base[i].ny : -base[i].ny, 12);
            });
        }
        const lt = systemNumbers(T, { ownRail: "left", nearShort: "top" });
        expect(lt.find((l) => l.kind === "departure" && l.number === 50)).toMatchObject({ x: 0, y: L, rail: "left" });
        expect(lt.find((l) => l.kind === "first" && l.number === 30)).toMatchObject({ x: W, rail: "right", nx: 1 });
        expect(lt.find((l) => l.kind === "first" && l.number === 30)!.y).toBeCloseTo((3 * L) / 8, 12);
        expect(lt.find((l) => l.kind === "departure" && l.number === 60)).toMatchObject({ rail: "top", ny: 1 });
    });
});

/* ------------------------------------------------------------------ 샷 분석 */

const snap = (t: number, ...balls: BallState[]): Snapshot => ({ t, balls });
const START: XY = [W / 2, L / 2];
const P1: XY = [R, L - L / 8]; // 1쿠션 10
const P3: XY = [W - R, 2.0];
/** 합성 3쿠션 샷(정규 방향): 왼쪽 레일(1.0) → 위 단쿠션(1.5) → 오른쪽 레일(2.0) → 빨간 공(2.5) → 정지(3.0). */
const history: Snapshot[] = [
    snap(0.0, ball("white", START[0], START[1], -1, 1.5), ball("red", 1.0, 1.0)),
    snap(1.0, ball("white", P1[0], P1[1], 1, 1), ball("red", 1.0, 1.0)),
    snap(1.5, ball("white", 0.6, L - R, 1, -1), ball("red", 1.0, 1.0)),
    snap(2.0, ball("white", P3[0], P3[1], -1, -1), ball("red", 1.0, 1.0)),
    snap(2.5, ball("white", 1.0 + 2 * R, 1.0, -0.5, 0), ball("red", 1.0, 1.0, -0.5, 0)),
    snap(3.0, ball("white", 1.0, 1.0), ball("red", 0.7, 1.0)),
];
const events: SimEvent[] = [
    { type: "ball-cushion", t: 1.0, ids: ["white"], cushion: "left" },
    { type: "ball-cushion", t: 1.5, ids: ["white"], cushion: "top" },
    { type: "ball-cushion", t: 2.0, ids: ["white"], cushion: "right" },
    { type: "ball-ball", t: 2.5, ids: ["red", "white"] },
    { type: "transition", t: 3.0, ids: ["white"], from: "rolling", to: "stationary" },
];

describe("analyzeShot", () => {
    it("1·3쿠션 접촉점과 출발선으로 시스템값·실제값을 읽는다", () => {
        const a = analyzeShot(events, history, "white", T)!;
        expect(a).not.toBeNull();
        expect(a.orientation).toEqual(CANONICAL);
        expect(a.firstRailNumber).toBeCloseTo(10, 9);
        expect(a.thirdRailNumber).toBeCloseTo((80 * (L - 2.0)) / L, 9);
        const dx = START[0] - P1[0], dy = START[1] - P1[1];
        const yHit = START[1] + (dy * (W - START[0])) / dx;
        expect(a.departure).toBeCloseTo(50 - (40 * yHit) / L, 9);
        expect(a.predicted).toBeCloseTo(a.departure - 10, 9);
        expect(a.firstPoint).toEqual(P1);
        expect(a.thirdPoint).toEqual(P3);
    });
    it("쿠션 3개 미만 · 첫 접촉이 단쿠션 · 3쿠션 전 공 접촉 · 3쿠션이 수구 레일이 아님 → null", () => {
        expect(analyzeShot(events.slice(0, 2), history, "white", T)).toBeNull();
        const shortFirst: SimEvent[] = [{ type: "ball-cushion", t: 1.0, ids: ["white"], cushion: "top" }, ...events.slice(1)];
        expect(analyzeShot(shortFirst, history, "white", T)).toBeNull();
        const ballFirst: SimEvent[] = [{ type: "ball-ball", t: 0.5, ids: ["red", "white"] }, ...events];
        expect(analyzeShot(ballFirst, history, "white", T)).toBeNull();
        const wrongThird: SimEvent[] = [events[0], events[1], { type: "ball-cushion", t: 2.0, ids: ["white"], cushion: "bottom" }];
        expect(analyzeShot(wrongThird, history, "white", T)).toBeNull();
        // 다른 공의 이벤트는 무시한다
        const other: SimEvent[] = [{ type: "ball-cushion", t: 0.5, ids: ["red"], cushion: "bottom" }, ...events];
        expect(analyzeShot(other, history, "white", T)).not.toBeNull();
        expect(analyzeShot(events, history, "yellow", T)).toBeNull();
    });
    it("거울 방향의 샷도 같은 숫자", () => {
        const base = analyzeShot(events, history, "white", T)!;
        for (const o of ORIENTATIONS) {
            const mh = history.map((s) => ({
                t: s.t,
                balls: s.balls.map((b) => { const p = mirrorPoint([b.r[0], b.r[1]], o, T); return { ...b, r: [p[0], p[1], R] as const }; }),
            }));
            const flip = (c: SimEvent): SimEvent => {
                if (c.type !== "ball-cushion") return c;
                const long = c.cushion === "left" || c.cushion === "right";
                const cushion = long
                    ? (o.ownRail === "right" ? c.cushion : c.cushion === "left" ? "right" : "left")
                    : (o.nearShort === "bottom" ? c.cushion : c.cushion === "top" ? "bottom" : "top");
                return { ...c, cushion };
            };
            const a = analyzeShot(events.map(flip), mh, "white", T)!;
            expect(a.orientation).toEqual(o);
            expect(a.firstRailNumber).toBeCloseTo(base.firstRailNumber, 9);
            expect(a.thirdRailNumber).toBeCloseTo(base.thirdRailNumber, 9);
            expect(a.predicted).toBeCloseTo(base.predicted, 9);
        }
    });
});

describe("shotReadout / overlayDiamond", () => {
    const input = { cueBallId: "white", phi: aimAt(START, P1[1]) };
    it("경로를 탔으면 시스템·실제 반올림, 아니면 샷 시점 조준의 시스템값만", () => {
        const full = shotReadout({ events, history, input }, T)!;
        const a = analyzeShot(events, history, "white", T)!;
        expect(full).toEqual({ system: Math.round(a.predicted), actual: Math.round(a.thirdRailNumber) });
        const partial = shotReadout({ events: events.slice(0, 1), history, input }, T)!;
        expect(partial.actual).toBeNull();
        expect(partial.system).toBe(Math.round(analyzeAim(history[0].balls[0], history[0].balls, input.phi, T)!.predictedThird.number));
        // 조준도 공을 먼저 맞히면 null
        expect(shotReadout({ events: [], history, input: { cueBallId: "white", phi: Math.atan2(1.0 - START[1], 1.0 - START[0]) } }, T)).toBeNull();
        expect(shotReadout({ events: [], history: [], input }, T)).toBeNull();
    });
    it("라벨은 방향이 같으면 같은 배열(캐시), 조준이 무효여도 추정 방향으로 그린다", () => {
        const cache = createNumbersCache();
        const balls = [ball("white", START[0], START[1]), ball("red", 1.0, 1.0)];
        const d1 = overlayDiamond(balls, "white", input.phi, T, cache)!;
        expect(d1.aim).not.toBeNull();
        const d2 = overlayDiamond(balls, "white", input.phi + 0.01, T, cache)!;
        expect(d2.numbers).toBe(d1.numbers);
        const d3 = overlayDiamond(balls, "white", Math.PI / 2, T, cache)!; // 위 단쿠션 → 조준 무효
        expect(d3.aim).toBeNull();
        expect(d3.numbers.length).toBe(19);
        expect(d3.numbers).not.toBe(d1.numbers); // 추정 방향 left/bottom 으로 바뀜
        expect(overlayDiamond(balls, "yellow", input.phi, T, cache)).toBeNull();
    });
});

describe("설정 저장", () => {
    it("기본 꺼짐, \"1\" 만 켜짐, 실패는 false", () => {
        const store = new Map<string, string>();
        const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } };
        expect(readDiamondPref(storage)).toBe(false);
        expect(writeDiamondPref(storage, true)).toBe(true);
        expect(store.get("rankue.sim.diamond")).toBe("1");
        expect(readDiamondPref(storage)).toBe(true);
        expect(writeDiamondPref(storage, false)).toBe(true);
        expect(readDiamondPref(storage)).toBe(false);
        expect(readDiamondPref(null)).toBe(false);
        const broken = { getItem: () => { throw new Error("x"); }, setItem: () => { throw new Error("x"); } };
        expect(readDiamondPref(broken)).toBe(false);
        expect(writeDiamondPref(broken, true)).toBe(false);
    });
});
