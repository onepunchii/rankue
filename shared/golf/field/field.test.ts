import { describe, it, expect } from "vitest";
import { CLUBS, nominalCarryM } from "./clubs.js";
import { flatGreen, gradAt, heightAt, RANGE, surfaceAt, validateHole } from "./course.js";
import { launchFrom, zoneMsFor } from "./impact.js";
import { simulateStroke, perfectInput, type StrokeContext } from "./stroke.js";
import { profileAt, steadyWind, gustAt, gustSeedFor } from "./wind.js";
import type { ClubId, StrokeInput } from "./types.js";

const base = (club: ClubId, over: Partial<StrokeInput> = {}): StrokeInput => ({ club, aimDeg10: 0, powerPct: 100, spinX: 0, spinY: 0, impactMs: 0, padX: 0, tapX: 0, mode: 0, ...over });
const range: StrokeContext = { hole: RANGE, preset: "pro" };
const tee = { x: 0, y: 0, z: 0 };

// 조사 §8 모델 출력(프로, 반암시적 오일러 1/120 기준). 드라이버는 프리셋 76.5 m/s → 250
const CARRY_PRO: Record<Exclude<ClubId, "PT">, number> = { D: 250.5, "3W": 228.7, "5I": 179.1, "7I": 153.7, "9I": 132.1, PW: 119.4, SW: 97.1 };

describe("코스·지형", () => {
    it("레인지·연습 그린 불변식", () => {
        expect(validateHole(RANGE)).toEqual([]);
        expect(validateHole(flatGreen())).toEqual([]);
        expect(surfaceAt(RANGE, 0, 100)).toBe("fairway");
        expect(surfaceAt(RANGE, 0, 400)).toBe("green");
        expect(surfaceAt(RANGE, 500, 0)).toBe("ob");
    });
    it("높이·기울기(범프 해석적)", () => {
        const h = { ...RANGE, height: { slope: { x: 0, y: 0.02 }, bumps: [{ c: { x: 0, y: 50 }, r: 10, a: 2 }] } };
        expect(heightAt(h, 0, 100)).toBeCloseTo(2, 6);
        expect(heightAt(h, 0, 50)).toBeCloseTo(3, 6);           // 기울기 1 + 범프 2
        const g = gradAt(h, 0, 55);                               // 범프 내리막 쪽
        expect(g.y).toBeLessThan(0.02);
        expect(gradAt(h, 0, 100).y).toBeCloseTo(0.02, 9);
    });
    it("바람 프로파일·돌풍은 결정론", () => {
        expect(profileAt(10)).toBe(1);
        expect(profileAt(2)).toBeCloseTo(0.8, 9);
        expect(profileAt(7.5)).toBeCloseTo(0.955, 3);
        expect(gustAt(0, 3)).toBe(1);
        const seed = gustSeedFor(42, 3, 7);
        expect(gustAt(seed, 1.2)).toBe(gustAt(seed, 1.2));
        expect(gustSeedFor(42, 3, 7)).toBe(gustSeedFor(42, 3, 7));
        expect(gustSeedFor(42, 3, 8)).not.toBe(seed);
    });
});

describe("클럽 캐리(프로·무풍·평지) — 조사 표 ±2 %", () => {
    for (const club of Object.keys(CARRY_PRO) as Array<keyof typeof CARRY_PRO>) {
        it(`${club} ≈ ${CARRY_PRO[club]} m`, () => {
            const r = simulateStroke(tee, base(club), range);
            const err = (r.carryM - CARRY_PRO[club]) / CARRY_PRO[club];
            expect(Math.abs(err), `${club} carry ${r.carryM.toFixed(1)} (apex ${r.apexM.toFixed(1)}, air ${r.airTime.toFixed(2)}s)`).toBeLessThan(0.02);
            expect(r.totalM).toBeGreaterThan(r.carryM);
            expect(Math.abs(r.final.p.x)).toBeLessThan(1);   // 직진
        });
    }
    it("아마 프리셋 0.88× 는 드라이버 200~218 m, nominalCarry 와 5 % 안", () => {
        const r = simulateStroke(tee, base("D"), { ...range, preset: "amateur" });
        expect(r.carryM).toBeGreaterThan(200); expect(r.carryM).toBeLessThan(218);
        expect(Math.abs(r.carryM - nominalCarryM("D", "amateur")) / r.carryM).toBeLessThan(0.05);
    });
    it("정점: 드라이버 27~35 m, 7i 25~31 m. 착지 뒤 런은 드라이버가 더 길다", () => {
        const d = simulateStroke(tee, base("D"), range), i7 = simulateStroke(tee, base("7I"), range);
        expect(d.apexM).toBeGreaterThan(27); expect(d.apexM).toBeLessThan(35);
        expect(i7.apexM).toBeGreaterThan(25); expect(i7.apexM).toBeLessThan(31);
        expect(d.totalM - d.carryM).toBeGreaterThan(i7.totalM - i7.carryM);
        expect(d.totalM - d.carryM).toBeGreaterThan(15);
    });
});

describe("바람·구질", () => {
    it("5 m/s 옆바람 드라이버 횡이동 14~28 m, 맞바람 −14~−28 m", () => {
        const side = simulateStroke(tee, base("D"), { ...range, env: steadyWind({ x: 5, y: 0 }) });
        expect(side.final.p.x).toBeGreaterThan(14); expect(side.final.p.x).toBeLessThan(28);   // 모델 25.5 m(조사 표 18 m 는 2 m 높이 풍속 기준)
        const head = simulateStroke(tee, base("D"), { ...range, env: steadyWind({ x: 0, y: -5 }) });
        const calm = simulateStroke(tee, base("D"), range);
        expect(calm.carryM - head.carryM).toBeGreaterThan(14); expect(calm.carryM - head.carryM).toBeLessThan(28);
    });
    it("의도 드로우는 좌로, 페이드는 우로(드라이버 5~16 m)", () => {
        const draw = simulateStroke(tee, base("D", { spinX: -70 }), range);
        const fade = simulateStroke(tee, base("D", { spinX: 70 }), range);
        expect(draw.final.p.x).toBeLessThan(-5); expect(draw.final.p.x).toBeGreaterThan(-16);
        expect(fade.final.p.x).toBeGreaterThan(5); expect(fade.final.p.x).toBeLessThan(16);
        expect(draw.diag.shape).toBe("draw"); expect(fade.diag.shape).toBe("fade");
    });
    it("늦은 탭(창 끝) = 슬라이스 우 20 m+, 이른 탭 = 훅 좌", () => {
        const z = zoneMsFor("D", "tee", 100, 0, 0);
        expect(z).toBeCloseTo(35, 5);
        const slice = simulateStroke(tee, base("D", { impactMs: Math.round(z) }), range);
        const hook = simulateStroke(tee, base("D", { impactMs: -Math.round(z) }), range);
        expect(slice.final.p.x).toBeGreaterThan(20); expect(slice.diag.shape).toMatch(/slice/);
        expect(hook.final.p.x).toBeLessThan(-20); expect(hook.diag.shape).toMatch(/hook/);
    });
    it("퍼펙트 대역 안(±0.33 창)은 직진", () => {
        const r = simulateStroke(tee, base("7I", { impactMs: 10 }), range);   // 7i 창 50 → 0.2
        expect(r.diag.shape).toBe("straight");
        expect(Math.abs(r.final.p.x)).toBeLessThan(1.5);
    });
    it("오버더톱(패드 왼쪽 흘림) = 풀 슬라이스: 왼쪽 출발, 우로 휨", () => {
        const r = simulateStroke(tee, base("D", { padX: -100 }), range);
        expect(r.diag.pathDeg).toBeLessThan(-2);
        expect(r.diag.tiltDeg).toBeLessThan(-8);
        expect(r.final.p.x).toBeGreaterThan(8);
    });
    it("토 타점은 드로우, 힐은 페이드(타이밍 퍼펙트여도)", () => {
        const toe = simulateStroke(tee, base("D", { tapX: 100 }), range);
        const heel = simulateStroke(tee, base("D", { tapX: -100 }), range);
        expect(toe.diag.tiltDeg).toBeGreaterThan(2); expect(heel.diag.tiltDeg).toBeLessThan(-2);
        expect(toe.final.p.x).toBeLessThan(heel.final.p.x);
    });
});

describe("미스샷", () => {
    it("뒷땅: 짧고 훅·풀", () => {
        const fat = simulateStroke(tee, base("7I", { impactMs: -75 }), range);   // 7i 창 50 → t −1.5
        const pure = simulateStroke(tee, base("7I"), range);
        expect(fat.diag.contact).toBe("fat");
        expect(fat.carryM).toBeLessThan(pure.carryM * 0.9);
        expect(fat.final.p.x).toBeLessThan(-3);
    });
    it("얇게: 낮게 날아 런이 길다 — 총거리는 크게 안 준다", () => {
        const thin = simulateStroke(tee, base("7I", { impactMs: 65 }), range);   // t 1.3
        const pure = simulateStroke(tee, base("7I"), range);
        expect(thin.diag.contact).toBe("thin");
        expect(thin.apexM).toBeLessThan(pure.apexM * 0.7);
        expect(thin.totalM - thin.carryM).toBeGreaterThan(pure.totalM - pure.carryM);
    });
    it("탑: 캐리 25 m 미만, 런으로 굴러간다", () => {
        const top = simulateStroke(tee, base("7I", { impactMs: 100 }), range);   // t 2.0
        expect(top.diag.contact).toBe("top");
        expect(top.carryM).toBeLessThan(25);
        expect(top.totalM).toBeGreaterThan(40);
    });
    it("생크(아이언 t ≥ 2.2): 오른쪽 30° 로", () => {
        const sh = simulateStroke(tee, base("7I", { impactMs: 120 }), range);   // t 2.4
        expect(sh.diag.contact).toBe("shank");
        expect(sh.final.p.x).toBeGreaterThan(30);
    });
    it("러프 플라이어: 7i 캐리 조금 짧고 런은 훨씬 길다", () => {
        const roughHole = { ...RANGE, fairway: [[{ x: -150, y: 20 }, { x: 150, y: 20 }, { x: 150, y: 450 }, { x: -150, y: 450 }]] };   // 티 주변은 러프
        expect(surfaceAt(roughHole, 0, 0)).toBe("rough");
        const r = simulateStroke(tee, base("7I"), { ...range, hole: roughHole });
        const p = simulateStroke(tee, base("7I"), range);
        expect(r.carryM).toBeLessThan(p.carryM); expect(r.carryM).toBeGreaterThan(p.carryM * 0.9);
        expect(r.totalM - r.carryM).toBeGreaterThan((p.totalM - p.carryM) * 1.5);
    });
    it("펀치(spinY −100)는 낮게·짧게, 하이는 높게", () => {
        const punch = simulateStroke(tee, base("7I", { spinY: -100 }), range), high = simulateStroke(tee, base("7I", { spinY: 100 }), range);
        expect(punch.apexM).toBeLessThan(high.apexM - 5);
        expect(punch.diag.launchVDeg).toBeCloseTo(CLUBS["7I"].launchDeg - 3.7, 5);
    });
});

describe("착지·그린·컵", () => {
    it("SW 풀샷은 그린에 멈춘다(|런| < 3 m)", () => {
        const greenHole = { ...RANGE, green: [{ x: -40, y: 60 }, { x: 40, y: 60 }, { x: 40, y: 140 }, { x: -40, y: 140 }] };
        const r = simulateStroke(tee, base("SW"), { ...range, hole: greenHole, stimp: 10 });
        expect(surfaceAt(greenHole, r.final.p.x, r.final.p.y)).toBe("green");
        expect(Math.abs(r.totalM - r.carryM)).toBeLessThan(3);
    });
    it("스팀프 10: 1.83 m/s 출발 → 2.9~3.2 m 구른다", () => {
        const g = flatGreen();
        const r = simulateStroke({ x: 0, y: -20, z: 0 }, base("PT", { powerPct: Math.round((1.83 / 6) * 100), mode: 3 }), { hole: g, preset: "pro", stimp: 10 });
        expect(r.totalM).toBeGreaterThan(2.9); expect(r.totalM).toBeLessThan(3.2);
        expect(r.final.phase).toBe("rest");
    });
    it("컵 정면 1.30 m/s 포획, 1.32 통과(립)", () => {
        const g = flatGreen();
        // 컵 앞 5 cm 에서 시작 — 감속 전에 컵에 닿는다. 퍼터 6.0·P 이므로 P 는 정수 % 라 속도를 직접 못 맞춘다 → 홀 직전 속도로 판정한다
        const run = (mps: number) => simulateStroke({ x: 0, y: -1.0, z: 0 }, base("PT", { powerPct: Math.round((mps / 6) * 100), mode: 3 }), { hole: g, preset: "pro", stimp: 10 });
        // 1 m 앞에서 v0 → 컵 도달 속도 v = √(v0² − 2·0.549·1) : 포획 1.31 → v0 1.70, 통과 1.32 → v0 1.71 는 정수 % 해상도(0.06 m/s) 밖이라
        // 1.62(→ 컵 1.20 포획) 와 1.86(→ 컵 1.51 통과) 로 본다
        expect(run(1.62).final.phase).toBe("holed");
        const miss = run(1.86);
        expect(miss.final.phase).toBe("rest");
        expect(miss.events.some((e) => e.kind === "lip")).toBe(true);
    });
    it("경사 그린: 옆경사면 공이 휜다", () => {
        const g = flatGreen(10, { x: 0.03, y: 0 });   // 오른쪽이 높다 → 왼쪽으로 브레이크
        const r = simulateStroke({ x: 0, y: -8, z: 0 }, base("PT", { powerPct: 60, mode: 3 }), { hole: g, preset: "pro", stimp: 10 });
        expect(r.final.p.x).toBeLessThan(-0.3);
    });
    it("물·OB 는 멈추고 phase 로 남는다", () => {
        const waterHole = { ...RANGE, water: [[{ x: -60, y: 200 }, { x: 60, y: 200 }, { x: 60, y: 300 }, { x: -60, y: 300 }]] };
        const r = simulateStroke(tee, base("D"), { ...range, hole: waterHole });
        expect(r.final.phase).toBe("water");
        const ob = simulateStroke(tee, base("D", { aimDeg10: 600 }), range);   // 60° 우 → 사각형 밖
        expect(ob.final.phase).toBe("ob");
    });
});

describe("결정론·검증", () => {
    it("같은 입력 = 같은 해시·같은 프레임(100회)", () => {
        const a = simulateStroke(tee, base("D", { spinX: -30, impactMs: 12, padX: 20, tapX: -15 }), { ...range, env: steadyWind({ x: 3, y: -2 }), roomSeed: 7, strokeIdx: 2 });
        for (let i = 0; i < 100; i++) {
            const b = simulateStroke(tee, base("D", { spinX: -30, impactMs: 12, padX: 20, tapX: -15 }), { ...range, env: steadyWind({ x: 3, y: -2 }), roomSeed: 7, strokeIdx: 2 });
            expect(b.hash).toBe(a.hash);
            expect(b.frames.length).toBe(a.frames.length);
        }
        expect(a.frames[a.frames.length - 1]).toBeCloseTo(a.final.p.z, 5);
    });
    it("퍼펙트 입력은 타이밍·흘림·타점만 0 으로", () => {
        const p = perfectInput(base("D", { impactMs: 30, padX: -50, tapX: 40, spinX: -70 }));
        expect(p).toMatchObject({ impactMs: 0, padX: 0, tapX: 0, spinX: -70 });
    });
    it("범위 밖 입력은 RangeError", () => {
        expect(() => launchFrom(base("D", { powerPct: 130 }), { preset: "pro", lie: { surface: "tee", slopeAlongDeg: 0, slopeSideDeg: 0, seed: 1 }, aimDeg: 0 })).toThrow(RangeError);
        expect(() => launchFrom(base("D", { impactMs: 12.5 }), { preset: "pro", lie: { surface: "tee", slopeAlongDeg: 0, slopeSideDeg: 0, seed: 1 }, aimDeg: 0 })).toThrow(RangeError);
    });
    it("드라이버는 위험하고 아이언은 관대하다 — 같은 t=1.0 에서 옆 편차", () => {
        const d = simulateStroke(tee, base("D", { impactMs: 35 }), range);
        const i7 = simulateStroke(tee, base("7I", { impactMs: 50 }), range);
        expect(d.final.p.x).toBeGreaterThan(i7.final.p.x * 1.8);
    });
});
