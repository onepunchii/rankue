/**
 * 해법 탐색 테스트. 공식 개시 배치(shared/sim/layouts.openingLayout) + DEFAULT_PARAMS.
 * 시각은 now: () => 0 으로 고정해(예산 없음) 결정론적으로 검사한다.
 */
import { describe, it, expect } from "vitest";
import { DEFAULT_PARAMS, TABLES } from "@shared/sim/params";
import { openingLayout } from "@shared/sim/layouts";
import { simulateShot } from "@shared/sim/simulate";
import { DEFAULT_3C_RULES, DEFAULT_4C_RULES } from "@shared/sim/rules";
import {
    aimTargets, buildSeeds, clampOffset, createShotSearch, cushionMarginFor, easeFor, FAMILY_DV, FAMILY_PHI_DEG,
    orderedCombos, safetyFor, searchShots, SPEED_GRID, SPIN_GRID, sumTerms, WEIGHTS, type SolveRequest,
} from "./search";

const NO_CLOCK = { now: () => 0 };
const DEG = Math.PI / 180;

function req3c(over: Partial<SolveRequest> = {}): SolveRequest {
    return {
        balls: openingLayout("3c", DEFAULT_PARAMS.table), cueBallId: "white", gameType: "3c",
        rules: DEFAULT_3C_RULES, params: DEFAULT_PARAMS, seed: 1, ...over,
    };
}

function angleDiff(x: number, y: number): number {
    let d = Math.abs(x - y) % (2 * Math.PI);
    if (d > Math.PI) d = 2 * Math.PI - d;
    return d;
}

describe("격자·시드", () => {
    it("세기 × 당점 조합은 45개, 첫 조합은 2.8 m/s 무회전, 전부 미스큐 원 안", () => {
        const combos = orderedCombos(DEFAULT_PARAMS.cue.maxOffset);
        expect(combos).toHaveLength(SPEED_GRID.length * SPIN_GRID.length);
        expect(combos[0]).toEqual({ V0: 2.8, a: 0, b: 0 });
        for (const c of combos) expect(c.a * c.a + c.b * c.b).toBeLessThanOrEqual(DEFAULT_PARAMS.cue.maxOffset ** 2);
        // 등급 순서: 앞 5개는 무회전 또는 2.8 m/s 옆 회전
        for (const c of combos.slice(0, 5)) expect(c.V0 === 2.8 || (c.a === 0 && c.b === 0)).toBe(true);
    });

    it("clampOffset 은 원 밖을 같은 방향으로 원 위까지 당긴다", () => {
        const [a, b] = clampOffset(0.6, 0, 0.5);
        expect(a).toBeLessThan(0.5);
        expect(a).toBeGreaterThan(0.499);
        expect(b).toBe(0);
        expect(clampOffset(0.3, 0.25, 0.5)).toEqual([0.3, 0.25]);
    });

    it("개시 배치 시드: 적구 2개 × 13(정면 1 + 6단계 × 좌우) 두께 시드, 뱅크 시드는 공에 가려진 광선을 뺀다", () => {
        const balls = openingLayout("3c", DEFAULT_PARAMS.table);
        const s = buildSeeds(balls, "white", "3c", DEFAULT_PARAMS.table);
        expect(s.ball).toHaveLength(26);
        expect(s.bank.length).toBeGreaterThan(12);
        expect(s.bank.length).toBeLessThanOrEqual(24);
        const keys = new Set([...s.ball, ...s.bank].map((x) => Math.round(x.phi * 1e4)));
        expect(keys.size).toBe(s.ball.length + s.bank.length);
        for (const b of s.ball) expect(["yellow", "red"]).toContain(b.target);
    });

    it("조준 대상: 4구는 빨간 공 둘(상대 큐볼 제외), 3쿠션은 나머지 둘, id 규약 밖이면 큐볼 외 전부", () => {
        const balls4 = openingLayout("4c", DEFAULT_PARAMS.table);
        expect(aimTargets(balls4, "white", "4c").map((b) => b.id).sort()).toEqual(["red1", "red2"]);
        const balls3 = openingLayout("3c", DEFAULT_PARAMS.table);
        expect(aimTargets(balls3, "white", "3c").map((b) => b.id).sort()).toEqual(["red", "yellow"]);
        expect(aimTargets(balls3, "yellow", "3c").map((b) => b.id).sort()).toEqual(["red", "white"]);
        const custom = balls3.map((b) => ({ ...b, id: b.id === "white" ? "cue" : b.id === "yellow" ? "b1" : "b2" }));
        expect(aimTargets(custom, "cue", "3c").map((b) => b.id).sort()).toEqual(["b1", "b2"]);
    });
});

describe("점수 항", () => {
    it("안전: 0.3–1.2 m 는 1, 0.1 m·2 m 밖은 0, 사이는 선형", () => {
        expect(safetyFor(0.5)).toBe(1);
        expect(safetyFor(0.3)).toBe(1);
        expect(safetyFor(1.2)).toBe(1);
        expect(safetyFor(0.2)).toBeCloseTo(0.5);
        expect(safetyFor(1.6)).toBeCloseTo(0.5);
        expect(safetyFor(0.05)).toBe(0);
        expect(safetyFor(2.5)).toBe(0);
        expect(safetyFor(NaN)).toBe(0);
    });
    it("쉬움: 1.6 → 1, 4.5 → 0", () => {
        expect(easeFor(1.6)).toBe(1);
        expect(easeFor(4.5)).toBe(0);
        expect(easeFor(3.05)).toBeCloseTo(0.5);
    });
    it("쿠션 여유: 3쿠션은 (쿠션−3)/2, 4구는 2배 규칙일 때만", () => {
        const o = (c: number) => ({ code: "point", points: 1, scored: true, consumesInning: false, cushionsBeforeSecond: c, cushionsBeforeFirst: 0, contacts: [], kisses: 0 } as const);
        expect(cushionMarginFor(o(3), DEFAULT_3C_RULES)).toBe(0);
        expect(cushionMarginFor(o(4), DEFAULT_3C_RULES)).toBe(0.5);
        expect(cushionMarginFor(o(7), DEFAULT_3C_RULES)).toBe(1);
        expect(cushionMarginFor(o(3), DEFAULT_4C_RULES)).toBe(0);
        expect(cushionMarginFor(o(3), { ...DEFAULT_4C_RULES, gameType: "4c", threeCushionDouble: true })).toBe(1);
    });
});

describe("개시 배치 탐색", () => {
    it("3쿠션: 400회 안에 득점 후보를 찾고, 점수 내림차순이며, 재시뮬 해시가 같다", () => {
        const r = searchShots(req3c({ maxSimulations: 400 }), NO_CLOCK);
        expect(r.tried).toBeLessThanOrEqual(400);
        expect(r.candidates.length).toBeGreaterThanOrEqual(1);
        expect(r.aborted).toBe(false);
        for (let i = 1; i < r.candidates.length; i++) expect(r.candidates[i - 1].score).toBeGreaterThanOrEqual(r.candidates[i].score);
        for (const c of r.candidates) {
            expect(c.outcome.scored).toBe(true);
            expect(c.outcome.cushionsBeforeSecond).toBeGreaterThanOrEqual(3);
            expect(c.input.cueBallId).toBe("white");
            expect(c.input.theta).toBe(0);
            expect(c.tried).toBeGreaterThanOrEqual(1);
            expect(c.tried).toBeLessThanOrEqual(r.tried);
            // 결정론: 같은 입력을 다시 돌리면 같은 해시
            const again = simulateShot(r.candidates[0].result.history[0].balls.length ? req3c().balls : [], c.input, DEFAULT_PARAMS);
            expect(again.hash).toBe(c.result.hash);
            expect(c.result.input).toEqual(c.input);
            // 점수 분해의 합 = 점수
            expect(sumTerms(c.terms)).toBeCloseTo(c.score, 12);
            expect(c.robustness === null || (c.robustness >= 0 && c.robustness <= 1)).toBe(true);
        }
    });

    it("같은 시드 → 같은 결과, 다른 시드도 후보를 찾는다", () => {
        const a = searchShots(req3c({ maxSimulations: 400 }), NO_CLOCK);
        const b = searchShots(req3c({ maxSimulations: 400 }), NO_CLOCK);
        expect(b.candidates.map((c) => c.result.hash)).toEqual(a.candidates.map((c) => c.result.hash));
        expect(b.tried).toBe(a.tried);
        for (const seed of [2, 3, 42]) {
            const r = searchShots(req3c({ seed, maxSimulations: 400 }), NO_CLOCK);
            expect(r.candidates.length).toBeGreaterThanOrEqual(1);
        }
    });

    it("후보는 서로 다른 해법 가족(당점 같고 각도 1.5°·세기 0.35 안이면 같은 가족)", () => {
        const r = searchShots(req3c({ maxSimulations: 1500, maxCandidates: 10 }), NO_CLOCK);
        for (let i = 0; i < r.candidates.length; i++) {
            for (let j = i + 1; j < r.candidates.length; j++) {
                const x = r.candidates[i].input, y = r.candidates[j].input;
                const same = x.a === y.a && x.b === y.b && Math.abs(x.V0 - y.V0) <= FAMILY_DV && angleDiff(x.phi, y.phi) <= FAMILY_PHI_DEG * DEG;
                expect(same).toBe(false);
            }
        }
    });

    it("4구: 개시 배치에서 후보를 찾는다(파울 없이 빨간 공 둘)", () => {
        const balls = openingLayout("4c", DEFAULT_PARAMS.table);
        const r = searchShots({ balls, cueBallId: "white", gameType: "4c", rules: DEFAULT_4C_RULES, params: DEFAULT_PARAMS, seed: 1, maxSimulations: 400 }, NO_CLOCK);
        expect(r.candidates.length).toBeGreaterThanOrEqual(1);
        for (const c of r.candidates) {
            expect(c.outcome.scored).toBe(true);
            expect(c.outcome.contacts.slice().sort()).toEqual(["red1", "red2"]);
            expect(simulateShot(balls, c.input, DEFAULT_PARAMS).hash).toBe(c.result.hash);
        }
    });

    it("maxCandidates 를 지키고, 정제된 세기는 0.01 격자에 있다", () => {
        const r = searchShots(req3c({ maxSimulations: 800, maxCandidates: 2 }), NO_CLOCK);
        expect(r.candidates.length).toBeLessThanOrEqual(2);
        for (const c of r.candidates) expect(Math.abs(c.input.V0 * 100 - Math.round(c.input.V0 * 100))).toBeLessThan(1e-9);
        // 상위 후보는 정제됐으므로 오차 허용이 잰 값이다
        expect(r.candidates[0].robustness).not.toBeNull();
    });

    it("조준 라벨: 공이면 두께·좌우, 뱅크면 쿠션", () => {
        const r = searchShots(req3c({ maxSimulations: 1500, maxCandidates: 10 }), NO_CLOCK);
        for (const c of r.candidates) {
            if (c.aim.kind === "ball") {
                expect(["yellow", "red"]).toContain(c.aim.id);
                expect(c.aim.thickness).toBeGreaterThanOrEqual(0);
                expect(c.aim.thickness).toBeLessThanOrEqual(1);
            } else if (c.aim.kind === "bank") {
                expect(["left", "right", "bottom", "top"]).toContain(c.aim.cushion);
            }
        }
    });
});

describe("예산·단계", () => {
    it("시간 예산: 가짜 시계(호출마다 1 ms)에서 100 ms 면 100회 근처에서 멈추고 exhausted 가 아니다", () => {
        let clock = 0;
        const r = searchShots(req3c({ budgetMs: 100 }), { now: () => clock++ });
        expect(r.tried).toBeLessThan(130);
        expect(r.tried).toBeGreaterThan(50);
        expect(r.exhausted).toBe(false);
        expect(r.elapsedMs).toBeGreaterThan(0);
    });

    it("step(n) 은 n 회를 넘지 않고 progress 가 단계를 알려 준다", () => {
        const s = createShotSearch(req3c({ maxSimulations: 300 }), NO_CLOCK);
        expect(s.progress()).toEqual({ tried: 0, found: 0, phase: "seed" });
        expect(s.step(10)).toBe(false);
        expect(s.progress().tried).toBe(10);
        let done = false;
        let guard = 0;
        while (!done && guard++ < 1000) done = s.step(50);
        expect(done).toBe(true);
        const p = s.progress();
        expect(p.phase).toBe("done");
        expect(p.tried).toBeLessThanOrEqual(300);
        // 끝난 뒤 step 은 계속 true
        expect(s.step(5)).toBe(true);
        const r = s.result();
        expect(r.tried).toBe(p.tried);
        // 중간 결과도 정렬돼 있다
        const partial = createShotSearch(req3c({ maxSimulations: 300 }), NO_CLOCK);
        partial.step(120);
        const pr = partial.result({ aborted: true });
        expect(pr.aborted).toBe(true);
        expect(pr.exhausted).toBe(false);
        for (let i = 1; i < pr.candidates.length; i++) expect(pr.candidates[i - 1].score).toBeGreaterThanOrEqual(pr.candidates[i].score);
    });

    it("계획 전체를 돌면 exhausted 이고 sweep 이 두께 격자보다 많이 찾는다(성능 기록)", () => {
        const t0 = performance.now();
        const full = searchShots(req3c(), NO_CLOCK);
        const dt = performance.now() - t0;
        expect(full.exhausted).toBe(true);
        expect(full.tried).toBeGreaterThan(10000);
        expect(full.found).toBeGreaterThan(20);
        expect(full.candidates).toHaveLength(5);
        const rate = full.tried / (dt / 1000);
        // 성능 기록(README 에 적는다). Node 에서 3만/s 안팎. CI 여유로 1000/s 만 요구
        console.log(`[solver perf] ${full.tried} sims in ${dt.toFixed(0)} ms → ${rate.toFixed(0)} sims/s, found=${full.found}`);
        expect(rate).toBeGreaterThan(1000);
    });

    it("가중치 합계 상한: 점수는 항 최대치의 합을 넘지 않는다", () => {
        const r = searchShots(req3c({ maxSimulations: 400 }), NO_CLOCK);
        const max = WEIGHTS.cushion + WEIGHTS.safety + WEIGHTS.ease + WEIGHTS.spin + WEIGHTS.robust;
        for (const c of r.candidates) expect(c.score).toBeLessThanOrEqual(max + 1e-12);
    });

    it("큐볼 id 가 배치에 없으면 RangeError", () => {
        expect(() => searchShots(req3c({ cueBallId: "blue" }), NO_CLOCK)).toThrow(RangeError);
    });
});

describe("적구 먼저 길 자리(BALL_FIRST_SLOTS)", () => {
    // 전수 탐색 세 번이라 전체 스위트(워커가 붐빌 때)에선 5 s 기본 제한을 넘긴다 — 제한만 넉넉히
    it("무작위 배치에서 적구 먼저 득점 길이 있으면 후보에 최소 하나는 들어온다(정제도 받는다)", { timeout: 30_000 }, async () => {
        const { randomLayout } = await import("@shared/sim/randomLayout");
        let withBall = 0, checked = 0;
        for (const seed of [1, 2, 3]) {
            const balls = randomLayout("3c", TABLES.DAEDAE, seed);
            const r = searchShots({ balls, cueBallId: "white", gameType: "3c", rules: DEFAULT_3C_RULES, params: DEFAULT_PARAMS, seed }, { now: () => 0 });
            const ballFirst = r.candidates.filter((c) => c.aim.kind === "ball");
            checked++;
            if (ballFirst.length > 0) {
                withBall++;
                // 자리를 받은 적구 먼저 후보 중 적어도 하나는 정제를 받아 여유가 있다(정제 뒤 대표가 바뀌며 라벨이 뒤집힐 수 있어 전부는 아니다)
                expect(ballFirst.some((c) => c.robustness !== null)).toBe(true);
            }
        }
        // 실측(0.1° 전수): 네 배치 모두 적구 먼저 득점 길이 있다 → 후보에도 있어야 한다
        expect(withBall).toBe(checked);
    });
});
