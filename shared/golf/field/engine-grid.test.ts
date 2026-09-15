/**
 * v0.3 — 풀 백 캐리 대조(트랙맨 PGA/LPGA 표), 프리셋, 코스·공기 컨디션, 높이 격자, 나무, 전 입력 격자 강건성, 서버 재시뮬 성능.
 */
import { describe, it, expect } from "vitest";
import { CLUB_IDS, type ClubId, type Preset, type StrokeInput } from "./types.js";
import { CLUBS, PRESETS } from "./clubs.js";
import { gridFrom, heightAt, gradAt, RANGE, validateHole, type FieldHole } from "./course.js";
import { airDensityRatio } from "./params.js";
import { simulateStroke, type StrokeContext } from "./stroke.js";
import { noTapInput } from "./impact.js";

const base = (club: ClubId, over: Partial<StrokeInput> = {}): StrokeInput => ({ club, aimDeg10: 0, stanceDeg10: 0, powerPct: 100, ballPos: 0, impactMs: 0, padX: 0, tapX: 0, tapY: 0, mode: 0, ...over });
const range: StrokeContext = { hole: RANGE, preset: "pro" };
const tee = { x: 0, y: 0, z: 0 };
const FULL: ClubId[] = CLUB_IDS.filter((c) => c !== "PT" && c !== "SW");

describe("풀 백 캐리 — 트랙맨 PGA 투어 평균 대비", () => {
    for (const c of FULL) {
        it(`${c}: 표 ${CLUBS[c].carryPgaM.toFixed(0)} m ±4 %`, () => {
            const r = simulateStroke(tee, base(c), range);
            const err = (r.carryM - CLUBS[c].carryPgaM) / CLUBS[c].carryPgaM;
            expect(Math.abs(err), `${c} 모델 ${r.carryM.toFixed(1)} vs 표 ${CLUBS[c].carryPgaM.toFixed(1)} (${(err * 100).toFixed(1)} %)`).toBeLessThan(0.04);
        });
    }
    it("긴 클럽일수록 멀리 간다(단조)", () => {
        const carries = FULL.map((c) => simulateStroke(tee, base(c), range).carryM);
        for (let i = 1; i < carries.length; i++) expect(carries[i]).toBeLessThan(carries[i - 1]);
    });
});

describe("프리셋", () => {
    it("LPGA 표 클럽: 캐리 ±6 % (발사각·스핀은 통상값)", () => {
        for (const [c, row] of Object.entries(PRESETS.lpga.table!) as Array<[ClubId, { carryM?: number }]>) {
            const r = simulateStroke(tee, base(c), { ...range, preset: "lpga" });
            const err = (r.carryM - row.carryM!) / row.carryM!;
            expect(Math.abs(err), `LPGA ${c} 모델 ${r.carryM.toFixed(1)} vs 표 ${row.carryM!.toFixed(1)} (${(err * 100).toFixed(1)} %)`).toBeLessThan(0.06);
        }
    });
    it("아마 15핸디 드라이버: 트랙맨 실측 204 yd(186.5 m) ±4 %, 프로보다 짧고 높이 뜬다", () => {
        const r = simulateStroke(tee, base("D"), { ...range, preset: "ama15" });
        expect(Math.abs(r.carryM - 186.5) / 186.5).toBeLessThan(0.04);
        expect(r.diag.spinRpm).toBeCloseTo(3275, 0);
        expect(r.carryM).toBeLessThan(simulateStroke(tee, base("D"), { ...range, preset: "amateur" }).carryM);
    });
    it("프리셋 순서: 프로 > 아마(0.88) > LPGA > 아마15 (드라이버 캐리)", () => {
        const order: Preset[] = ["pro", "amateur", "lpga", "ama15"];
        const carries = order.map((p) => simulateStroke(tee, base("D"), { ...range, preset: p }).carryM);
        for (let i = 1; i < carries.length; i++) expect(carries[i]).toBeLessThan(carries[i - 1]);
    });
});

describe("코스·공기 컨디션", () => {
    const calm = simulateStroke(tee, base("D"), range);
    it("공기 밀도비: 해면 15 °C = 1, 1500 m ≈ 0.837, 35 °C ≈ 0.935", () => {
        expect(airDensityRatio({})).toBeCloseTo(1, 9);
        expect(airDensityRatio({ altitudeM: 1500 })).toBeCloseTo(0.837, 2);
        expect(airDensityRatio({ tempC: 35 })).toBeCloseTo(0.935, 2);
    });
    it("고지대(1500 m) 드라이버 캐리 +4~9 %, 더운 날(35 °C) +1~4 %, 추운 날(5 °C) −", () => {
        const hi = simulateStroke(tee, base("D"), { ...range, conditions: { altitudeM: 1500 } });
        const hot = simulateStroke(tee, base("D"), { ...range, conditions: { tempC: 35 } });
        const cold = simulateStroke(tee, base("D"), { ...range, conditions: { tempC: 5 } });
        const gainHi = hi.carryM / calm.carryM - 1, gainHot = hot.carryM / calm.carryM - 1;
        expect(gainHi).toBeGreaterThan(0.04); expect(gainHi).toBeLessThan(0.09);
        expect(gainHot).toBeGreaterThan(0.01); expect(gainHot).toBeLessThan(0.04);
        expect(cold.carryM).toBeLessThan(calm.carryM);
    });
    it("젖은 페어웨이는 런이 짧고, 단단한 페어웨이는 런이 길다. 젖은 그린은 퍼트가 덜 구른다", () => {
        const wet = simulateStroke(tee, base("D"), { ...range, conditions: { wet: 1 } });
        const firm = simulateStroke(tee, base("D"), { ...range, conditions: { firmness: 1.3 } });
        const run = (r: typeof calm) => r.totalM - r.carryM;
        expect(run(wet)).toBeLessThan(run(calm) * 0.7);
        expect(run(firm)).toBeGreaterThan(run(calm) * 1.15);
        expect(wet.carryM).toBeCloseTo(calm.carryM, 5);   // 컨디션은 비행을 안 건드린다(공기는 별도)
    });
});

describe("높이 격자·나무", () => {
    it("격자 쌍선형: 언덕 높이·기울기가 해석해와 일치하고 밖은 편평", () => {
        const grid = gridFrom({ x: -50, y: 0 }, 5, 21, 41, (x, y) => 0.02 * y + (Math.abs(x) < 20 ? 0 : 0));   // y 방향 2 % 오르막
        const hole: FieldHole = { ...RANGE, height: { slope: { x: 0, y: 0 }, bumps: [], grid } };
        expect(validateHole(hole)).toEqual([]);
        expect(heightAt(hole, 0, 100)).toBeCloseTo(2, 6);
        expect(heightAt(hole, 3, 47.5)).toBeCloseTo(0.95, 6);
        expect(gradAt(hole, 3, 47.5).y).toBeCloseTo(0.02, 6);
        expect(gradAt(hole, 3, 47.5).x).toBeCloseTo(0, 6);
        expect(heightAt(hole, 0, 300)).toBeCloseTo(4, 6);          // 격자 끝(y 200) 값으로 편평
        expect(gradAt(hole, 0, 300).y).toBeCloseTo(0, 9);
    });
    it("오르막(격자 3 %) 착지는 캐리·런이 짧고, 내리막은 길다", () => {
        const up = gridFrom({ x: -150, y: -20 }, 10, 31, 48, (_x, y) => 0.03 * Math.max(0, y));
        const down = gridFrom({ x: -150, y: -20 }, 10, 31, 48, (_x, y) => -0.03 * Math.max(0, y));
        const flat = simulateStroke(tee, base("7I"), range);
        const u = simulateStroke(tee, base("7I"), { ...range, hole: { ...RANGE, height: { slope: { x: 0, y: 0 }, bumps: [], grid: up } } });
        const d = simulateStroke(tee, base("7I"), { ...range, hole: { ...RANGE, height: { slope: { x: 0, y: 0 }, bumps: [], grid: down } } });
        expect(u.carryM).toBeLessThan(flat.carryM - 4);
        expect(d.carryM).toBeGreaterThan(flat.carryM + 4);
        expect(u.totalM).toBeLessThan(d.totalM);
    });
    it("티 앞 40 m 나무 캐노피: tree 이벤트, 캐리 60 m 미만·속도 대부분 잃음. 옆으로 비껴 치면 무사", () => {
        const treeHole: FieldHole = { ...RANGE, trees: [{ c: { x: 0, y: 40 }, r: 6, h: 18 }] };
        expect(validateHole(treeHole)).toEqual([]);
        const hit = simulateStroke(tee, base("7I"), { ...range, hole: treeHole });
        expect(hit.events.some((e) => e.kind === "tree")).toBe(true);
        expect(hit.carryM).toBeLessThan(60);
        const miss = simulateStroke(tee, base("7I", { aimDeg10: 150 }), { ...range, hole: treeHole });   // 15° 우 → 40 m 에서 10 m 옆
        expect(miss.events.some((e) => e.kind === "tree")).toBe(false);
        expect(miss.carryM).toBeGreaterThan(140);
    });
    it("둥치: 낮게 구르는 탑 샷이 둥치에 맞으면 되돌아온다", () => {
        const treeHole: FieldHole = { ...RANGE, trees: [{ c: { x: 0, y: 30 }, r: 4, h: 14, trunkR: 0.6 }] };
        const r = simulateStroke(tee, base("7I", { tapY: 90 }), { ...range, hole: treeHole });   // 탑 → 땅볼
        expect(r.events.some((e) => e.kind === "tree")).toBe(true);
        expect(r.final.p.y).toBeLessThan(30);
    });
});

describe("전 입력 격자 강건성(결정론·유한·범위)", () => {
    it("14클럽 × 프리셋 2 × 스탠스 3 × 타이밍 5 × 컨택 5 × 파워 3 — NaN·음수·범위 밖 없음", () => {
        const bunkerHole: FieldHole = { ...RANGE, bunkers: [[{ x: -10, y: 50 }, { x: 10, y: 50 }, { x: 10, y: 70 }, { x: -10, y: 70 }]] };
        let n = 0;
        for (const club of CLUB_IDS) for (const preset of ["pro", "ama15"] as Preset[]) for (const st of [-150, 0, 150]) for (const im of [-400, -50, 0, 50, 400]) for (const ty of [-100, -40, 0, 40, 100]) for (const pw of [20, 100, 115]) {
            const mode = club === "PT" ? 3 : club === "SW" && ty < 0 ? 2 : 0;
            const pre = mode === 2 ? { x: 0, y: 60, z: 0 } : tee;
            const r = simulateStroke(pre, base(club, { stanceDeg10: st, impactMs: im, tapY: ty, powerPct: pw, mode }), { ...range, preset, hole: mode === 2 ? bunkerHole : RANGE });
            n++;
            const nums = [r.carryM, r.totalM, r.apexM, r.airTime, r.final.p.x, r.final.p.y, r.final.p.z, r.diag.ballSpeed, r.diag.spinRpm, r.diag.launchVDeg, r.diag.tiltDeg];
            for (const v of nums) expect(Number.isFinite(v), `${club} ${preset} st${st} im${im} ty${ty} pw${pw}`).toBe(true);
            expect(r.diag.ballSpeed).toBeGreaterThan(0);
            expect(r.diag.spinRpm).toBeGreaterThanOrEqual(0);
            expect(r.carryM).toBeGreaterThanOrEqual(0); expect(r.totalM).toBeLessThan(400);
            expect(Math.abs(r.diag.tiltDeg)).toBeLessThanOrEqual(45);
            expect(["rest", "holed", "water", "ob"]).toContain(r.final.phase);
            expect(r.truncated, `${club} ${preset} st${st} im${im} ty${ty} pw${pw} truncated`).toBe(false);
            for (let i = 0; i < r.frames.length; i += 97) expect(Number.isFinite(r.frames[i])).toBe(true);
        }
        expect(n).toBe(14 * 2 * 3 * 5 * 5 * 3);
    });
    it("입력 하나만 바뀌어도 해시가 다르다(타이밍·컨택·스탠스)", () => {
        const a = simulateStroke(tee, base("7I"), range).hash;
        expect(simulateStroke(tee, base("7I", { impactMs: 1 }), range).hash).toBe(a);           // 퍼펙트 대역 안: 같은 발사 → 같은 해시
        expect(simulateStroke(tee, base("7I", { impactMs: 30 }), range).hash).not.toBe(a);
        expect(simulateStroke(tee, base("7I", { tapY: 30 }), range).hash).not.toBe(a);
        expect(simulateStroke(tee, base("7I", { stanceDeg10: 10 }), range).hash).not.toBe(a);
    });
});

describe("스윙을 놓쳤을 때(noTapInput) — 화면에서 탭이 없었던 샷", () => {
    it("어떤 클럽이든 얇게 + 크게 오른쪽: 캐리 −15~−40 %, 옆 10 m 이상. '정타 슬라이스' 가 아니다", () => {
        for (const c of FULL) {
            const teeShot = c === "D" || c === "3W" || c === "5W" || c === "HY";
            const pre = teeShot ? tee : { x: 0, y: 60, z: 0 };
            const nt = noTapInput(c);
            const miss = simulateStroke(pre, base(c, nt), range);
            const pure = simulateStroke(pre, base(c), range);
            expect(miss.diag.contact, `${c} contact`).not.toBe("pure");
            const loss = 1 - miss.carryM / pure.carryM;
            expect(loss, `${c} 캐리 손실 ${(loss * 100).toFixed(0)} %`).toBeGreaterThan(0.15);
            expect(loss, `${c} 캐리 손실 ${(loss * 100).toFixed(0)} %`).toBeLessThan(0.40);
            expect(miss.final.p.x, `${c} 옆 ${miss.final.p.x.toFixed(0)} m`).toBeGreaterThan(10);
            expect(miss.diag.shape).toMatch(/slice|push/);
        }
    });
    it("입력은 정수·범위 안(서버 재시뮬이 같은 값을 받는다)", () => {
        for (const c of CLUB_IDS) {
            const nt = noTapInput(c);
            expect(Number.isInteger(nt.impactMs) && Math.abs(nt.impactMs) <= 400).toBe(true);
            expect(Number.isInteger(nt.tapY) && Math.abs(nt.tapY) <= 100).toBe(true);
        }
    });
});

describe("성능(서버 재시뮬)", () => {
    it("드라이버 풀샷 300회 — 1회 평균 3 ms 미만", () => {
        const t0 = performance.now();
        for (let i = 0; i < 300; i++) simulateStroke(tee, base("D", { impactMs: (i % 21) - 10, tapY: (i % 11) - 5 }), range);
        const per = (performance.now() - t0) / 300;
        console.log(`[perf] driver stroke ${per.toFixed(2)} ms/회 → ${(1000 / per).toFixed(0)} 회/s`);
        expect(per).toBeLessThan(3);
    });
});
