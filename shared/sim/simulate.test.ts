/**
 * simulate.ts 검증 (README 시험 층 A + 시나리오).
 *  A 불변량: 시드 7 무작위 샷 1000개(대대/중대 × 3구/4구 × 개시/무작위 배치) — 매 이벤트의 resolve 직전(직전 스냅샷을
 *    dt 만큼 evolveBall 한 상태) 대비 직후 운동에너지 비증가(허용 1e-9·E0; 천 마찰 소산에 가려지지 않도록 resolve 만 본다),
 *    모든 공 테이블 안(+1e-9), 겹침 없음(2R − 1e-9), 이벤트 시각 단조, 종료(truncated=false),
 *    같은 입력 두 번 → 같은 해시, 쿠션 이벤트 뒤 안쪽 법선 방향 속도 > 0, 이벤트 폭풍 없음, 샷당 최대 이벤트 < 300.
 *  시나리오: 장축 구름 샷의 쿠션 수, 정확한 코너 입사, 정면 풀히트 속도 전달, 개시 배치의 장각(3쿠션) 존재,
 *    쿠션 모델별 해시 상이, 프로즌 공·뉴턴 요람, 0 파워, 미스큐, 상한 절단, 입력 불변.
 *  벤치마크는 RUN_BENCH=1 일 때만.
 */
import { describe, it, expect } from "vitest";
import {
    simulateShot, simulateFrom, MAX_EVENTS, debugCounters, resetDebugCounters,
} from "./simulate.js";
import { generateShotCases, paramsOf, type ShotCase } from "./fixtures/shots.js";
import { evolveBall, kineticEnergy } from "./evolve.js";
import { TABLES, DEFAULT_CUE, applyCondition, cushionSegments, type SimParams, type CushionModelId } from "./params.js";
import { openingLayout } from "./layouts.js";
import { evaluateShot, DEFAULT_3C_RULES } from "./rules/evaluate.js";
import { atan2, HALF_PI } from "./dmath.js";
import type { BallState, SimEvent, SimResult } from "./types.js";

const T = TABLES.DAEDAE;
const R = T.ball.R;
const HAN: SimParams = { table: T, cue: DEFAULT_CUE, cushionModel: "han2005", condition: 1 };

function rolling(id: string, x: number, y: number, vx: number, vy: number): BallState {
    return { id, r: [x, y, R], v: [vx, vy, 0], w: [-vy / R, vx / R, 0], state: "rolling" };
}
function still(id: string, x: number, y: number, r = R): BallState {
    return { id, r: [x, y, r], v: [0, 0, 0], w: [0, 0, 0], state: "stationary" };
}
function deepFreeze<T>(o: T): T {
    Object.freeze(o);
    for (const k of Object.keys(o as object)) {
        const v = (o as Record<string, unknown>)[k];
        if (v && typeof v === "object" && !Object.isFrozen(v)) deepFreeze(v);
    }
    return o;
}

type AnyResult = Omit<SimResult, "input">;

/** 한 샷의 불변량 위반 목록. 비면 통과. */
function checkInvariants(r: AnyResult, params: SimParams): string[] {
    const problems: string[] = [];
    const ball = applyCondition(params.table.ball, params.condition);
    const Rb = ball.R;
    const W = params.table.width, L = params.table.length;
    const segs = cushionSegments(params.table);
    const ke = (balls: readonly BallState[]) => balls.reduce((s, b) => s + kineticEnergy(b, ball), 0);
    const h = r.history;
    const E0 = ke(h[0].balls);
    let prevT = h[0].t;

    if (r.truncated) problems.push("truncated");
    for (let i = 1; i < r.events.length; i++) {
        if (r.events[i].t < r.events[i - 1].t) problems.push(`event time decreased at ${i}`);
    }
    for (let k = 1; k < h.length; k++) {
        const snap = h[k];
        if (snap.t < prevT) problems.push(`snapshot time decreased at ${k}`);
        // resolve 직전 상태 = 직전 스냅샷을 dt 만큼 닫힌 식으로 전진한 것. 이벤트 사이의 마찰 소산은 여기 포함되지 않으므로
        // resolve 자체(전이·쿠션·볼–볼·kiss·fixOverlaps)가 에너지를 늘리면 바로 드러난다.
        const dt = snap.t - prevT;
        const pre = h[k - 1].balls.map((b) => (b.state === "stationary" ? b : evolveBall(b, dt, ball)));
        prevT = snap.t;
        const Epre = ke(pre);
        const E = ke(snap.balls);
        if (E > Epre + 1e-9 * E0) {
            problems.push(`energy increased by resolve of event ${k - 1} ${JSON.stringify(r.events[k - 1])} by ${(E - Epre) / E0} E0`);
        }
        for (const b of snap.balls) {
            if (b.r[0] < Rb - 1e-9 || b.r[0] > W - Rb + 1e-9 || b.r[1] < Rb - 1e-9 || b.r[1] > L - Rb + 1e-9) {
                problems.push(`ball ${b.id} outside at event ${k - 1}: ${b.r}`);
            }
        }
        for (let a = 0; a < snap.balls.length; a++) {
            for (let c = a + 1; c < snap.balls.length; c++) {
                const dx = snap.balls[a].r[0] - snap.balls[c].r[0];
                const dy = snap.balls[a].r[1] - snap.balls[c].r[1];
                const d = Math.sqrt(dx * dx + dy * dy);
                if (d < 2 * Rb - 1e-9) problems.push(`overlap ${snap.balls[a].id}-${snap.balls[c].id} at event ${k - 1}: ${d - 2 * Rb}`);
            }
        }
        const ev = r.events[k - 1];
        if (ev && ev.type === "ball-cushion") {
            const b = snap.balls.find((x) => x.id === ev.ids[0])!;
            const seg = segs.find((s) => s.id === ev.cushion)!;
            const vn = seg.normal[0] * b.v[0] + seg.normal[1] * b.v[1];
            if (!(vn > 0)) problems.push(`cushion ${ev.cushion} at event ${k - 1}: inward velocity ${vn}`);
        }
    }
    // 마지막 스냅샷은 전부 정지
    if (!h[h.length - 1].balls.every((b) => b.state === "stationary")) problems.push("final not stationary");
    return problems;
}

/** 같은 쌍의 볼–볼 이벤트가 1e-6 s 안에 몇 번까지 몰리는가. */
function maxPairBurst(events: readonly SimEvent[]): number {
    let worst = 0;
    const bb = events.filter((e): e is Extract<SimEvent, { type: "ball-ball" }> => e.type === "ball-ball");
    for (let i = 0; i < bb.length; i++) {
        let n = 1;
        for (let j = i - 1; j >= 0 && bb[i].t - bb[j].t <= 1e-6; j--) {
            if (bb[j].ids[0] === bb[i].ids[0] && bb[j].ids[1] === bb[i].ids[1]) n++;
        }
        if (n > worst) worst = n;
    }
    return worst;
}

function runCase(c: ShotCase, model?: CushionModelId): { r: SimResult; p: SimParams } {
    const p = { ...paramsOf(c), cushionModel: model ?? c.cushionModel };
    return { r: simulateShot(c.balls, c.input, p), p };
}

describe("A 불변량: 시드 7 무작위 샷 1000개 (han2005)", () => {
    const cases = generateShotCases(7, 1000);
    const results: { c: ShotCase; r: SimResult; p: SimParams }[] = [];
    resetDebugCounters();
    for (const c of cases) results.push({ c, ...runCase(c) });
    const counters = { ...debugCounters };

    it("배치가 계약대로 섞여 있다", () => {
        expect(cases.filter((c) => c.tableId === "JUNGDAE_KR").length).toBeGreaterThan(300);
        expect(cases.filter((c) => c.gameType === "4c").length).toBeGreaterThan(300);
        expect(cases.filter((c) => c.layout === "random").length).toBeGreaterThan(300);
    });

    it("에너지 비증가·테이블 안·겹침 없음·시각 단조·종료·쿠션 뒤 안쪽 속도", () => {
        const bad: string[] = [];
        for (const { c, r, p } of results) {
            const problems = checkInvariants(r, p);
            if (problems.length) bad.push(`#${c.i} (${c.tableId} ${c.gameType} ${c.layout}): ${problems.slice(0, 3).join("; ")}`);
        }
        expect(bad, bad.slice(0, 10).join("\n")).toEqual([]);
    });

    it("샷당 최대 이벤트 < 300 (실측 보고)", () => {
        let max = 0, sum = 0, maxDur = 0;
        for (const { r } of results) { max = Math.max(max, r.events.length); sum += r.events.length; maxDur = Math.max(maxDur, r.duration); }
        console.log(`[simulate] han2005 1000샷: 최대 이벤트 ${max}, 평균 ${(sum / results.length).toFixed(1)}, 최장 ${maxDur.toFixed(2)} s, 카운터 ${JSON.stringify(counters)}`);
        expect(max).toBeLessThan(300);
        expect(sum / results.length).toBeGreaterThan(5);
    });

    it("이벤트 폭풍 없음: 같은 쌍이 1e-6 s 안에 50번 넘게 충돌하지 않는다", () => {
        let worst = 0;
        for (const { r } of results) worst = Math.max(worst, maxPairBurst(r.events));
        expect(worst).toBeLessThanOrEqual(50);
        expect(counters.sweepOverflows).toBe(0);
    });

    it("같은 입력 두 번 → 해시·이벤트·최종 상태가 비트 단위로 같다", () => {
        for (const { c, r } of results) {
            const again = simulateShot(c.balls, c.input, paramsOf(c));
            expect(again.hash).toBe(r.hash);
            expect(again.events).toEqual(r.events);
            expect(again.final).toEqual(r.final);
        }
    });

    it("결과 형태: history[0] 은 t=0 타격 직후, 마지막은 전부 정지, paramsHash·engineVersion·input 포함", () => {
        for (const { c, r } of results.slice(0, 50)) {
            expect(r.history[0].t).toBe(0);
            expect(r.history.length).toBe(r.events.length + 1);
            expect(r.history[r.history.length - 1].balls).toEqual(r.final);
            expect(r.duration).toBe(r.history[r.history.length - 1].t);
            expect(r.engineVersion).toBe("2.1.0");
            expect(r.paramsHash).toMatch(/^[0-9a-f]{16}$/);
            expect(r.input).toEqual(c.input);
            expect(r.hash).toMatch(/^[0-9a-f]{16}$/);
            const cue = r.history[0].balls.find((b) => b.id === "white")!;
            expect(cue.state).toBe("sliding");
            expect(Math.sqrt(cue.v[0] ** 2 + cue.v[1] ** 2)).toBeGreaterThan(0);
        }
    });
});

describe("A 불변량: 다른 쿠션 모델·컨디션", () => {
    for (const model of ["mathavan2010", "sphereHalfSpace"] as const) {
        it(`${model} 100샷`, () => {
            const cases = generateShotCases(7, 100, { modelFor: () => model });
            const bad: string[] = [];
            let max = 0;
            for (const c of cases) {
                const { r, p } = runCase(c);
                max = Math.max(max, r.events.length);
                const problems = checkInvariants(r, p);
                if (problems.length) bad.push(`#${c.i}: ${problems.slice(0, 3).join("; ")}`);
                expect(maxPairBurst(r.events)).toBeLessThanOrEqual(50);
            }
            expect(bad, bad.slice(0, 10).join("\n")).toEqual([]);
            expect(max).toBeLessThan(300);
        });
    }

    it("condition 0.8 / 1.25 에서도 불변량 유지", () => {
        const cases = generateShotCases(11, 60);
        for (const c of cases) {
            for (const condition of [0.8, 1.25]) {
                const p: SimParams = { ...paramsOf(c), condition };
                const r = simulateShot(c.balls, c.input, p);
                expect(checkInvariants(r, p)).toEqual([]);
            }
        }
    });
});

describe("시나리오", () => {
    it("(i) 3 m/s 구름 공이 대대 장축을 왕복하며 쿠션을 지난다", () => {
        // 측정(2026-09-07, 대대 파라미터 eC 0.88 · fC 0.15 · h 37 mm): han2005 / SHS / mathavan2010 모두 3개
        //   (top, bottom, top). 쿠션 직후 속도비 0.86, 남은 톱스핀이 역회전으로 작용해 재구름 뒤 0.52 — 세 모델이
        //   일치하므로 루프가 아니라 파라미터 보정 문제다. README 의 "4개 이상"은 파라미터 재보정 뒤 조여야 한다.
        for (const model of ["han2005", "sphereHalfSpace", "mathavan2010"] as const) {
            const r = simulateFrom([rolling("c", T.width / 2, T.length / 4, 0, 3)], { ...HAN, cushionModel: model });
            const cushions = r.events.filter((e) => e.type === "ball-cushion");
            expect(cushions.length, model).toBeGreaterThanOrEqual(3);
            expect(cushions.every((e) => e.type === "ball-cushion" && (e.cushion === "top" || e.cushion === "bottom"))).toBe(true);
            expect(r.truncated).toBe(false);
            // 장축 위에 머문다(x 불변)
            expect(r.final[0].r[0]).toBeCloseTo(T.width / 2, 9);
        }
    });

    it("(ii) 정확한 코너 입사 → 같은 시각(1e-9 안)의 쿠션 이벤트 2개, 순서는 규칙 5 (bottom < left, right < top)", () => {
        resetDebugCounters();
        const r = simulateFrom([rolling("c", R + 0.5, R + 0.5, -2, -2)], HAN);
        expect(r.events[0].type).toBe("ball-cushion");
        expect(r.events[1].type).toBe("ball-cushion");
        expect((r.events[0] as { cushion: string }).cushion).toBe("bottom");
        expect((r.events[1] as { cushion: string }).cushion).toBe("left");
        expect(Math.abs(r.events[1].t - r.events[0].t)).toBeLessThanOrEqual(1e-9);
        // 두 이벤트 뒤 속도는 두 성분 모두 안쪽
        const after = r.history[2].balls[0];
        expect(after.v[0]).toBeGreaterThan(0);
        expect(after.v[1]).toBeGreaterThan(0);
        expect(debugCounters.immediateEvents).toBe(1);
        expect(checkInvariants(r, HAN)).toEqual([]);

        const r2 = simulateFrom([rolling("c", T.width - R - 0.4, T.length - R - 0.4, 1.7, 1.7)], HAN);
        expect((r2.events[0] as { cushion: string }).cushion).toBe("right");
        expect((r2.events[1] as { cushion: string }).cushion).toBe("top");
        expect(Math.abs(r2.events[1].t - r2.events[0].t)).toBeLessThanOrEqual(1e-9);
    });

    it("(iii) 2 m/s 정면 풀히트 → 적구가 속도의 85 % 이상을 받는다", () => {
        const r = simulateFrom([rolling("c", T.width / 2, 0.5, 0, 2), still("o", T.width / 2, 1.0)], HAN);
        const k = r.events.findIndex((e) => e.type === "ball-ball");
        expect(k).toBeGreaterThanOrEqual(0);
        expect(r.events[k].ids).toEqual(["c", "o"]);
        const ob = r.history[k + 1].balls.find((b) => b.id === "o")!;
        const cb = r.history[k + 1].balls.find((b) => b.id === "c")!;
        const speed = Math.sqrt(ob.v[0] ** 2 + ob.v[1] ** 2);
        expect(speed).toBeGreaterThanOrEqual(0.85 * 2);
        expect(Math.abs(ob.v[0])).toBeLessThan(1e-9);           // 정면이라 x 성분 없음
        expect(Math.sqrt(cb.v[0] ** 2 + cb.v[1] ** 2)).toBeLessThan(0.2);   // 큐볼은 거의 정지(스턴)
        expect(checkInvariants(r, HAN)).toEqual([]);
    });

    it("(iv) 개시 배치 장각: 빨간 공 → 쿠션 3개 이상 → 노란 공 순서의 득점이 존재한다", () => {
        const balls = openingLayout("3c", T, "white", "right");
        const cue = balls[0], red = balls[2];
        const base = atan2(red.r[1] - cue.r[1], red.r[0] - cue.r[0]);
        const found: { a: number; V0: number; dphi: number; events: readonly SimEvent[] }[] = [];
        for (const a of [-0.3, -0.25, 0.25, 0.3]) {
            for (const V0 of [2.5, 3, 3.5]) {
                for (let i = -40; i <= 40; i++) {
                    const phi = base + i * 0.005;
                    const r = simulateShot(balls, { cueBallId: "white", phi, V0, a, b: 0.1, theta: 0 }, HAN);
                    const o = evaluateShot(r.events, "white", DEFAULT_3C_RULES, r.truncated);
                    if (o.scored && o.contacts[0] === "red" && o.contacts[1] === "yellow") {
                        found.push({ a, V0, dphi: i * 0.005, events: r.events });
                    }
                }
            }
        }
        expect(found.length).toBeGreaterThan(0);
        // 이벤트 열로 직접 확인: 첫 볼–볼은 red-white, white 의 쿠션이 white-yellow 전에 3개 이상
        const ev = found[0].events;
        const firstBB = ev.find((e) => e.type === "ball-ball")!;
        expect(firstBB.ids).toEqual(["red", "white"]);
        const secondIdx = ev.findIndex((e) => e.type === "ball-ball" && e.ids.includes("yellow") && e.ids.includes("white"));
        expect(secondIdx).toBeGreaterThan(0);
        const whiteCushions = ev.slice(0, secondIdx).filter((e) => e.type === "ball-cushion" && e.ids[0] === "white");
        expect(whiteCushions.length).toBeGreaterThanOrEqual(3);
        console.log(`[simulate] 장각 득점 ${found.length}개, 예: a=${found[0].a} V0=${found[0].V0} Δφ=${found[0].dphi.toFixed(3)} 쿠션 ${whiteCushions.map((e) => (e as { cushion: string }).cushion).join(">")}`);
    });

    it("(v) 쿠션 모델별로 해시가 다르고 모두 정상 종료한다", () => {
        const balls = openingLayout("3c", T, "white", "right");
        const cue = balls[0], red = balls[2];
        const input = { cueBallId: "white", phi: atan2(red.r[1] - cue.r[1], red.r[0] - cue.r[0]) + 0.05, V0: 3, a: 0.3, b: 0.1, theta: 0 };
        const hashes = new Map<string, string>();
        for (const model of ["han2005", "sphereHalfSpace", "mathavan2010"] as const) {
            const r = simulateShot(balls, input, { ...HAN, cushionModel: model });
            expect(r.truncated).toBe(false);
            expect(r.final.every((b) => b.state === "stationary")).toBe(true);
            hashes.set(model, r.hash);
        }
        expect(new Set(hashes.values()).size).toBe(3);
    });

    it("프로즌 공(접촉한 채 정지)을 향해 치면 t = 0 에 볼–볼 이벤트가 나고 정상 종료한다", () => {
        resetDebugCounters();
        const balls = [still("white", 0.5, 1.0), still("red", 0.5 + 2 * R, 1.0), still("yellow", 0.5, 2.0)];
        const r = simulateShot(balls, { cueBallId: "white", phi: 0, V0: 3, a: 0, b: 0, theta: 0 }, HAN);
        expect(r.events[0]).toEqual({ type: "ball-ball", t: 0, ids: ["red", "white"] });
        expect(debugCounters.immediateEvents).toBeGreaterThanOrEqual(1);
        expect(checkInvariants(r, HAN)).toEqual([]);
        // 적구가 속도 대부분을 받았다
        const red = r.history[1].balls.find((b) => b.id === "red")!;
        const white = r.history[1].balls.find((b) => b.id === "white")!;
        expect(red.v[0]).toBeGreaterThan(white.v[0]);
    });

    it("뉴턴 요람(일렬 프로즌 3개 + 입사구): 폭풍 없이 종료, 불변량 유지", () => {
        resetDebugCounters();
        const x0 = 0.5;
        const balls = [rolling("a", x0, 1.0, 1, 0), still("b", x0 + 0.2, 1.0), still("c", x0 + 0.2 + 2 * R, 1.0), still("d", x0 + 0.2 + 4 * R, 1.0)];
        const r = simulateFrom(balls, HAN);
        expect(r.truncated).toBe(false);
        expect(r.events.length).toBeLessThan(400);
        expect(maxPairBurst(r.events)).toBeLessThanOrEqual(50);
        expect(checkInvariants(r, HAN)).toEqual([]);
        // 마지막 공이 가장 멀리 간다
        const fx = (id: string) => r.final.find((b) => b.id === id)!.r[0];
        expect(fx("d")).toBeGreaterThan(fx("c"));
        expect(fx("c")).toBeGreaterThan(fx("b"));
        console.log(`[simulate] 뉴턴 요람 이벤트 ${r.events.length}, 카운터 ${JSON.stringify(debugCounters)}`);
    });

    it("V0 = 0 → 이벤트 없음, 큐볼 정지 (규칙의 no-shot)", () => {
        const balls = openingLayout("3c", T, "white");
        const r = simulateShot(balls, { cueBallId: "white", phi: 1, V0: 0, a: 0.2, b: 0.1, theta: 0 }, HAN);
        expect(r.events).toEqual([]);
        expect(r.history.length).toBe(1);
        expect(r.final.every((b) => b.state === "stationary")).toBe(true);
        expect(r.duration).toBe(0);
    });

    it("없는 큐볼 id → RangeError, 미스큐 → RangeError('miscue')", () => {
        const balls = openingLayout("3c", T, "white");
        expect(() => simulateShot(balls, { cueBallId: "blue", phi: 1, V0: 2, a: 0, b: 0, theta: 0 }, HAN)).toThrow(RangeError);
        expect(() => simulateShot(balls, { cueBallId: "white", phi: 1, V0: 2, a: 0.6, b: 0, theta: 0 }, HAN)).toThrow("miscue");
    });

    it("마찰 없는 상자에서 MAX_EVENTS 에 걸리면 truncated, 이벤트 수 = MAX_EVENTS, 공은 세운다", () => {
        const frictionless: SimParams = {
            ...HAN,
            table: { ...T, ball: { ...T.ball, muS: 0, muR: 0, spinDecel: 0, eC: 1, fC: 0 } },
        };
        const r = simulateShot([still("white", 0.5, 1.0)], { cueBallId: "white", phi: 0.7, V0: 2, a: 0, b: 0, theta: 0 }, frictionless);
        expect(r.truncated).toBe(true);
        expect(r.events.length).toBe(MAX_EVENTS);
        expect(r.events.every((e) => e.type === "ball-cushion")).toBe(true);
        expect(r.final[0].state).toBe("stationary");
        expect(r.history.length).toBe(MAX_EVENTS + 2);
    });

    it("simulateFrom 은 움직이는 공·t0 를 받아들이고 history 시각을 t0 부터 센다", () => {
        const r = simulateFrom([rolling("c", 0.5, 1.0, 1, 0.5), still("o", 0.9, 1.2)], HAN, 2.5);
        expect(r.history[0].t).toBe(2.5);
        expect(r.events[0].t).toBeGreaterThan(2.5);
        expect(r.duration).toBe(r.history[r.history.length - 1].t - 2.5);
        expect(r.truncated).toBe(false);
        expect(checkInvariants(r, HAN)).toEqual([]);
    });

    it("입력 검증: NaN·∞·범위 밖 입력, 중복 id, condition ≤ 0, t0 비유한 → RangeError (해시에 NaN 이 들어가지 않는다)", () => {
        const balls = openingLayout("3c", T, "white");
        const ok = { cueBallId: "white", phi: 1, V0: 3, a: 0.1, b: 0.1, theta: 0.1 };
        const bad: Partial<typeof ok>[] = [
            { phi: NaN }, { phi: Infinity }, { V0: NaN }, { V0: Infinity }, { V0: -1 }, { a: NaN }, { b: Infinity },
            { theta: NaN }, { theta: -0.1 }, { theta: HALF_PI }, { theta: 2 },
        ];
        for (const patch of bad) {
            expect(() => simulateShot(balls, { ...ok, ...patch }, HAN), JSON.stringify(patch)).toThrow(RangeError);
        }
        expect(() => simulateShot(balls, ok, { ...HAN, condition: 0 })).toThrow(RangeError);
        expect(() => simulateShot(balls, ok, { ...HAN, condition: -1 })).toThrow(RangeError);
        expect(() => simulateShot(balls, ok, { ...HAN, condition: NaN })).toThrow(RangeError);
        expect(() => simulateShot(balls, ok, { ...HAN, condition: Infinity })).toThrow(RangeError);
        const dup = [balls[0], { ...balls[1], id: "white" }, balls[2]];
        expect(() => simulateShot(dup, ok, HAN)).toThrow(/duplicate/);
        expect(() => simulateFrom(dup, HAN)).toThrow(/duplicate/);
        expect(() => simulateShot([balls[0], { ...balls[1], r: [NaN, 1, R] }, balls[2]], ok, HAN)).toThrow(RangeError);
        expect(() => simulateFrom([{ ...balls[0], v: [1, Infinity, 0], state: "sliding" }], HAN)).toThrow(RangeError);
        expect(() => simulateFrom([{ ...balls[0], state: "flying" as BallState["state"] }], HAN)).toThrow(RangeError);
        expect(() => simulateFrom([{ ...balls[0], id: "" }], HAN)).toThrow(RangeError);
        expect(() => simulateFrom(balls, HAN, NaN)).toThrow(RangeError);
        // 경계값은 허용: V0 = 0, theta = 0, condition 양수
        expect(() => simulateShot(balls, { ...ok, V0: 0, theta: 0 }, { ...HAN, condition: 0.7 })).not.toThrow();
    });

    it("공 배열 순서는 결과 물리·해시에 영향이 없다 (final 은 id 순으로 해시)", () => {
        const balls = openingLayout("3c", T, "white");
        const input = { cueBallId: "white", phi: 1.3, V0: 3, a: 0.1, b: 0.1, theta: 0 };
        const r1 = simulateShot(balls, input, HAN);
        const r2 = simulateShot([balls[2], balls[0], balls[1]], input, HAN);
        expect(r2.events).toEqual(r1.events);
        expect(r2.hash).toBe(r1.hash);
        for (const b of r1.final) expect(r2.final.find((x) => x.id === b.id)).toEqual(b);
    });

    it("입력 불변: 깊이 얼린 공·입력·파라미터로도 동작하고 입력이 그대로다", () => {
        const balls = deepFreeze(openingLayout("3c", T, "white"));
        const input = deepFreeze({ cueBallId: "white", phi: 1.2, V0: 3, a: 0.2, b: -0.1, theta: 0.1 });
        const params = deepFreeze({ ...HAN });
        const snapshot = JSON.stringify({ balls, input });
        const r = simulateShot(balls, input, params);
        expect(r.events.length).toBeGreaterThan(0);
        expect(JSON.stringify({ balls, input })).toBe(snapshot);
        expect(r.history[0].balls[0]).not.toBe(balls[0]);
    });
});

describe.skipIf(!process.env.RUN_BENCH)("벤치마크 (RUN_BENCH=1)", () => {
    it("샷당 ms (중앙값, 200샷) — han2005 < 2 ms", () => {
        const cases = generateShotCases(20260907, 200);
        const report: Record<string, number> = {};
        for (const model of ["han2005", "mathavan2010", "sphereHalfSpace"] as const) {
            // 워밍업
            for (const c of cases.slice(0, 30)) runCase(c, model);
            const times: number[] = [];
            for (const c of cases) {
                const t0 = process.hrtime.bigint();
                runCase(c, model);
                times.push(Number(process.hrtime.bigint() - t0) / 1e6);
            }
            times.sort((a, b) => a - b);
            report[model] = times[times.length >> 1];
        }
        console.log(`[bench] 샷당 ms 중앙값: ${JSON.stringify(report)}`);
        expect(report.han2005).toBeLessThan(2);
    });
});

// HALF_PI 는 시나리오 입력 각도에 쓸 수 있도록 남겨 둔다(미사용 경고 방지).
void HALF_PI;
