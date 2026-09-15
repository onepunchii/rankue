import { describe, it, expect } from "vitest";
import { CLUBS, EXPLOSION_IDEAL_TAPY, nominalCarryM } from "./clubs.js";
import { flatGreen, gradAt, heightAt, RANGE, surfaceAt, validateHole } from "./course.js";
import { launchFrom, zoneMsFor } from "./impact.js";
import { simulateStroke, perfectInput, type StrokeContext } from "./stroke.js";
import { profileAt, steadyWind, gustAt, gustSeedFor } from "./wind.js";
import type { ClubId, StrokeInput } from "./types.js";

const base = (club: ClubId, over: Partial<StrokeInput> = {}): StrokeInput => ({ club, aimDeg10: 0, stanceDeg10: 0, powerPct: 100, ballPos: 0, impactMs: 0, padX: 0, tapX: 0, tapY: 0, mode: 0, ...over });
const range: StrokeContext = { hole: RANGE, preset: "pro" };
const tee = { x: 0, y: 0, z: 0 };
const turf = { x: 0, y: 60, z: 0 };   // 티 박스 밖 잔디
const lieTee = { surface: "tee" as const, slopeAlongDeg: 0, slopeSideDeg: 0, seed: 1 };

// 조사 §8 모델 출력(프로, 반암시적 오일러 1/120 기준). 드라이버는 프리셋 76.5 m/s → 250
const CARRY_PRO: Record<Exclude<ClubId, "PT">, number> = { D: 250.5, "3W": 228.7, "5I": 179.1, "7I": 153.7, "9I": 132.1, PW: 119.4, SW: 97.1 };

describe("코스·지형", () => {
    it("레인지·연습 그린 불변식", () => {
        expect(validateHole(RANGE)).toEqual([]);
        expect(validateHole(flatGreen())).toEqual([]);
        expect(surfaceAt(RANGE, 0, 0)).toBe("tee");
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

describe("세 축: 스탠스(패스) · 회전 타이밍(페이스) · 흘림·타점", () => {
    it("5 m/s 옆바람 드라이버 횡이동 14~28 m, 맞바람 −14~−28 m", () => {
        const side = simulateStroke(tee, base("D"), { ...range, env: steadyWind({ x: 5, y: 0 }) });
        expect(side.final.p.x).toBeGreaterThan(14); expect(side.final.p.x).toBeLessThan(28);   // 모델 25.5 m(조사 표 18 m 는 2 m 높이 풍속 기준)
        const head = simulateStroke(tee, base("D"), { ...range, env: steadyWind({ x: 0, y: -5 }) });
        const calm = simulateStroke(tee, base("D"), range);
        expect(calm.carryM - head.carryM).toBeGreaterThan(14); expect(calm.carryM - head.carryM).toBeLessThan(28);
    });
    it("스탠스 오른쪽 3° + 스퀘어 페이스 = 드로우(좌 8~40 m), 왼쪽 3° = 페이드(우)", () => {
        const draw = simulateStroke(tee, base("D", { stanceDeg10: 30 }), range);
        const fade = simulateStroke(tee, base("D", { stanceDeg10: -30 }), range);
        expect(draw.diag.pathDeg).toBeCloseTo(3, 9); expect(draw.diag.faceDeg).toBe(0);
        expect(draw.final.p.x).toBeLessThan(-8); expect(draw.final.p.x).toBeGreaterThan(-40);
        expect(fade.final.p.x).toBeGreaterThan(8); expect(fade.final.p.x).toBeLessThan(40);
        expect(draw.diag.shape).toBe("draw"); expect(fade.diag.shape).toBe("fade");
    });
    it("오너의 페이드 공식: 왼쪽 스탠스 + 몸이 먼저(늦은 탭·열림) → 더 크게 우로. 오른쪽 + 손이 먼저(이른 탭) → 훅", () => {
        const z = zoneMsFor("D", "tee", 100, -30, 0);
        const fade = simulateStroke(tee, base("D", { stanceDeg10: -30 }), range);
        const bigFade = simulateStroke(tee, base("D", { stanceDeg10: -30, impactMs: Math.round(z * 0.8) }), range);
        expect(bigFade.diag.faceDeg).toBeGreaterThan(0);
        expect(bigFade.final.p.x).toBeGreaterThan(fade.final.p.x + 10);
        const hook = simulateStroke(tee, base("D", { stanceDeg10: 30, impactMs: -Math.round(z) }), range);
        expect(hook.diag.shape).toMatch(/hook/); expect(hook.final.p.x).toBeLessThan(-30);
    });
    it("늦은 탭(창 끝) = 슬라이스 우 20 m+, 이른 탭 = 훅 좌", () => {
        const z = zoneMsFor("D", "tee", 100, 0, 0);
        expect(z).toBeCloseTo(35, 5);
        const slice = simulateStroke(tee, base("D", { impactMs: Math.round(z) }), range);
        const hook = simulateStroke(tee, base("D", { impactMs: -Math.round(z) }), range);
        expect(slice.final.p.x).toBeGreaterThan(20); expect(slice.diag.shape).toMatch(/slice/);
        expect(hook.final.p.x).toBeLessThan(-20); expect(hook.diag.shape).toMatch(/hook/);
    });
    it("타이밍은 페이스만 바꾼다 — 창을 한참 벗어나도 컨택은 정타, 페이스는 계속 열린다(최대 2.5배)", () => {
        const late = simulateStroke(tee, base("7I", { impactMs: 150 }), range);
        expect(late.diag.contact).toBe("pure");
        expect(late.diag.faceDeg).toBeCloseTo(2.5 * CLUBS["7I"].faceMaxDeg, 5);
        expect(late.final.p.x).toBeGreaterThan(25);
        const early = simulateStroke(tee, base("7I", { impactMs: -150 }), range);
        expect(early.diag.contact).toBe("pure"); expect(early.final.p.x).toBeLessThan(-25);
        // 열린 페이스는 로프트가 늘어 높고 스핀이 많다, 닫히면 낮고 적다
        expect(late.diag.launchVDeg).toBeGreaterThan(early.diag.launchVDeg + 2);
        expect(late.diag.spinRpm).toBeGreaterThan(early.diag.spinRpm + 500);
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
        const heel = simulateStroke(tee, base("D", { tapX: -60 }), range);
        expect(toe.diag.tiltDeg).toBeGreaterThan(2); expect(heel.diag.tiltDeg).toBeLessThan(-2);
        expect(toe.final.p.x).toBeLessThan(heel.final.p.x);
    });
    it("스탠스를 크게 열수록 창이 좁다", () => {
        expect(zoneMsFor("7I", "fairway", 100, 150, 0)).toBeLessThan(zoneMsFor("7I", "fairway", 100, 0, 0));
    });
});

describe("컨택 높이(tapY) — 티 위 드라이버", () => {
    const pure = simulateStroke(tee, base("D"), range);
    it("높은 타점(1 cm 위): 발사각 +, 스핀 −500 안팎, 정타", () => {
        const r = simulateStroke(tee, base("D", { tapY: -30 }), range);
        expect(r.diag.strikeHighCm).toBeCloseTo(0.96, 1);
        expect(r.diag.contact).toBe("pure");
        expect(r.diag.launchVDeg).toBeGreaterThan(pure.diag.launchVDeg + 0.8);
        expect(r.diag.spinRpm).toBeLessThan(pure.diag.spinRpm - 400); expect(r.diag.spinRpm).toBeGreaterThan(pure.diag.spinRpm - 800);
        expect(r.totalM - r.carryM).toBeGreaterThan(pure.totalM - pure.carryM);   // 낮은 스핀 = 런이 길다
    });
    it("낮은 타점(1 cm 아래): 발사각 −, 스핀 +", () => {
        const r = simulateStroke(tee, base("D", { tapY: 30 }), range);
        expect(r.diag.launchVDeg).toBeLessThan(pure.diag.launchVDeg - 0.8);
        expect(r.diag.spinRpm).toBeGreaterThan(pure.diag.spinRpm + 400);
    });
    it("리딩엣지 근처 = 얇은 드라이브(낮고 짧다), 적도 위 = 탑(땅볼), 크라운 아래로 지나면 스카이", () => {
        const thin = simulateStroke(tee, base("D", { tapY: 75 }), range);
        expect(thin.diag.contact).toBe("thin"); expect(thin.apexM).toBeLessThan(pure.apexM * 0.7); expect(thin.carryM).toBeLessThan(pure.carryM - 20);
        const top = simulateStroke(tee, base("D", { tapY: 95 }), range);
        expect(top.diag.contact).toBe("top"); expect(top.carryM).toBeLessThan(30); expect(top.totalM).toBeGreaterThan(60);
        const sky = simulateStroke(tee, base("D", { tapY: -100 }), range);
        expect(sky.diag.contact).toBe("sky"); expect(sky.apexM).toBeGreaterThan(30); expect(sky.carryM).toBeLessThan(130);
    });
    it("티 위 드라이버는 뒷땅이 없다(티가 잔디를 대신한다)", () => {
        for (const ty of [-15, -40, -70, -85]) expect(simulateStroke(tee, base("D", { tapY: ty }), range).diag.contact).toBe("pure");
    });
});

describe("컨택 높이(tapY) — 잔디 위 아이언", () => {
    const pure = simulateStroke(turf, base("7I"), range);
    it("살짝 아래(0.5 cm)는 바운스가 봐준다: 정타, 거리 −3 % 안", () => {
        const r = simulateStroke(turf, base("7I", { tapY: -15 }), range);
        expect(r.diag.contact).toBe("pure");
        expect(r.carryM).toBeGreaterThan(pure.carryM * 0.97);
    });
    it("뒷땅: 1 cm 는 −10 % 안팎, 1.6 cm 는 −25 % 안팎, 3 cm 는 절반 이하. 살짝 왼쪽", () => {
        const f1 = simulateStroke(turf, base("7I", { tapY: -30 }), range);
        const f2 = simulateStroke(turf, base("7I", { tapY: -50 }), range);
        const f3 = simulateStroke(turf, base("7I", { tapY: -100 }), range);
        expect(f1.diag.contact).toBe("fat"); expect(f2.diag.contact).toBe("fat"); expect(f3.diag.contact).toBe("fat");
        expect(f1.carryM / pure.carryM).toBeGreaterThan(0.82); expect(f1.carryM / pure.carryM).toBeLessThan(0.95);
        expect(f2.carryM / pure.carryM).toBeGreaterThan(0.65); expect(f2.carryM / pure.carryM).toBeLessThan(0.8);
        expect(f3.carryM / pure.carryM).toBeLessThan(0.5);
        expect(f2.diag.spinRpm).toBeLessThan(pure.diag.spinRpm);   // 잔디가 끼면 스핀이 준다
        expect(f2.final.p.x).toBeLessThanOrEqual(0);
    });
    it("조금 낮은 타점(0.8 cm): 발사각 −, 스핀은 조금 +(아이언 수직 기어)", () => {
        const r = simulateStroke(turf, base("7I", { tapY: 25 }), range);
        expect(r.diag.launchVDeg).toBeLessThan(pure.diag.launchVDeg);
        expect(r.diag.spinRpm).toBeGreaterThan(pure.diag.spinRpm);
        expect(r.diag.contact).toBe("pure");
    });
    it("얇게(리딩엣지 쪽 1.4 cm): 낮게 날고 스핀이 죽어 런이 길다 — 총거리는 크게 안 준다", () => {
        const thin = simulateStroke(turf, base("7I", { tapY: 45 }), range);
        expect(thin.diag.contact).toBe("thin");
        expect(thin.apexM).toBeLessThan(pure.apexM * 0.7);
        expect(thin.diag.spinRpm).toBeLessThan(pure.diag.spinRpm * 0.85);
        expect(thin.totalM - thin.carryM).toBeGreaterThan(pure.totalM - pure.carryM);
        expect(thin.totalM).toBeGreaterThan(pure.totalM * 0.9);
    });
    it("탑: 캐리 25 m 미만, 런으로 굴러간다", () => {
        const top = simulateStroke(turf, base("7I", { tapY: 70 }), range);
        expect(top.diag.contact).toBe("top");
        expect(top.carryM).toBeLessThan(25);
        expect(top.totalM).toBeGreaterThan(40);
    });
    it("생크(힐 극단, 아이언): 오른쪽 30° 로", () => {
        const sh = simulateStroke(turf, base("7I", { tapX: -100 }), range);
        expect(sh.diag.contact).toBe("shank");
        expect(sh.final.p.x).toBeGreaterThan(30);
    });
    it("러프 플라이어: 7i 캐리 조금 짧고 런은 훨씬 길다", () => {
        const roughHole = { ...RANGE, teeBox: undefined, fairway: [[{ x: -150, y: 20 }, { x: 150, y: 20 }, { x: 150, y: 450 }, { x: -150, y: 450 }]] };   // 티 주변은 러프
        expect(surfaceAt(roughHole, 0, 0)).toBe("rough");
        const r = simulateStroke(tee, base("7I"), { ...range, hole: roughHole });
        const p = simulateStroke(turf, base("7I"), range);
        expect(r.carryM).toBeLessThan(p.carryM); expect(r.carryM).toBeGreaterThan(p.carryM * 0.9);
        expect(r.totalM - r.carryM).toBeGreaterThan((p.totalM - p.carryM) * 1.5);
    });
    it("볼 포지션 뒤(펀치)는 낮게·짧게, 앞(하이)은 높게", () => {
        const punch = simulateStroke(turf, base("7I", { ballPos: -100 }), range), high = simulateStroke(turf, base("7I", { ballPos: 100 }), range);
        expect(punch.apexM).toBeLessThan(high.apexM - 5);
        expect(punch.diag.launchVDeg).toBeCloseTo(CLUBS["7I"].launchDeg - 3.7, 5);
    });
});

describe("벙커 익스플로전 — 이상적인 컨택은 공이 아니라 그 아래 모래", () => {
    const bunkerHole = { ...RANGE, bunkers: [[{ x: -10, y: 50 }, { x: 10, y: 50 }, { x: 10, y: 70 }, { x: -10, y: 70 }]] };
    const ctx = { ...range, hole: bunkerHole };
    const ideal = simulateStroke(turf, base("SW", { powerPct: 60, mode: 2, tapY: EXPLOSION_IDEAL_TAPY }), ctx);
    it("이상 진입(−47): 정타, 60 % 파워로 20~35 m, 높이 뜬다", () => {
        expect(surfaceAt(bunkerHole, 0, 60)).toBe("bunker");
        expect(ideal.diag.contact).toBe("pure");
        expect(ideal.carryM).toBeGreaterThan(20); expect(ideal.carryM).toBeLessThan(35);
        expect(ideal.diag.launchVDeg).toBeGreaterThan(40);
    });
    it("공을 직접 치면 홈런(얇게, 1.6배 이상 멀리·낮게), 너무 깊으면 모래에 묻힌다", () => {
        const skull = simulateStroke(turf, base("SW", { powerPct: 60, mode: 2, tapY: 10 }), ctx);
        expect(skull.diag.contact).toBe("thin"); expect(skull.totalM).toBeGreaterThan(ideal.totalM * 1.6); expect(skull.apexM).toBeLessThan(ideal.apexM);
        const buried = simulateStroke(turf, base("SW", { powerPct: 60, mode: 2, tapY: -95 }), ctx);
        expect(buried.diag.contact).toBe("fat"); expect(buried.totalM).toBeLessThan(ideal.totalM * 0.5);
    });
    it("퍼펙트 입력은 익스플로전이면 모래 진입값, 아니면 0", () => {
        expect(perfectInput(base("SW", { mode: 2, tapY: 30 })).tapY).toBe(EXPLOSION_IDEAL_TAPY);
        expect(perfectInput(base("7I", { tapY: 30 })).tapY).toBe(0);
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
        const run = (mps: number) => simulateStroke({ x: 0, y: -1.0, z: 0 }, base("PT", { powerPct: Math.round((mps / 6) * 100), mode: 3 }), { hole: g, preset: "pro", stimp: 10 });
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
        const inp = base("D", { stanceDeg10: -30, impactMs: 12, padX: 20, tapX: -15, tapY: 22 });
        const a = simulateStroke(tee, inp, { ...range, env: steadyWind({ x: 3, y: -2 }), roomSeed: 7, strokeIdx: 2 });
        for (let i = 0; i < 100; i++) {
            const b = simulateStroke(tee, inp, { ...range, env: steadyWind({ x: 3, y: -2 }), roomSeed: 7, strokeIdx: 2 });
            expect(b.hash).toBe(a.hash);
            expect(b.frames.length).toBe(a.frames.length);
        }
        expect(a.frames[a.frames.length - 1]).toBeCloseTo(a.final.p.z, 5);
    });
    it("퍼펙트 입력은 타이밍·흘림·타점만 0 으로 — 스탠스·볼포지션은 그대로", () => {
        const p = perfectInput(base("D", { impactMs: 30, padX: -50, tapX: 40, tapY: -20, stanceDeg10: -40, ballPos: 50 }));
        expect(p).toMatchObject({ impactMs: 0, padX: 0, tapX: 0, tapY: 0, stanceDeg10: -40, ballPos: 50 });
    });
    it("범위 밖 입력은 RangeError", () => {
        expect(() => launchFrom(base("D", { powerPct: 130 }), { preset: "pro", lie: lieTee, aimDeg: 0 })).toThrow(RangeError);
        expect(() => launchFrom(base("D", { impactMs: 12.5 }), { preset: "pro", lie: lieTee, aimDeg: 0 })).toThrow(RangeError);
        expect(() => launchFrom(base("D", { stanceDeg10: 160 }), { preset: "pro", lie: lieTee, aimDeg: 0 })).toThrow(RangeError);
        expect(() => launchFrom(base("D", { tapY: 101 }), { preset: "pro", lie: lieTee, aimDeg: 0 })).toThrow(RangeError);
    });
    it("드라이버는 위험하고 아이언은 관대하다 — 같은 t=1.0 에서 옆 편차", () => {
        const d = simulateStroke(tee, base("D", { impactMs: 35 }), range);
        const i7 = simulateStroke(tee, base("7I", { impactMs: 50 }), range);
        expect(d.final.p.x).toBeGreaterThan(i7.final.p.x * 1.8);
    });
});
