/**
 * 적합성 (README 시험 층 C)
 *  1. 골든 픽스처: fixtures/golden.json 의 200개 샷(shots: han2005 160 · sphereHalfSpace 20 · mathavan2010 20,
 *     condition 1 / 0.8 / 1.25 섞음) + 움직이는 시작 상태 20개(fromShots: 샷의 3번째 이벤트 직후 스냅샷에서 simulateFrom,
 *     t0 ≠ 0)를 다시 돌려 해시·이벤트 수·최종 위치가 비트 단위로 같아야 한다.
 *     갱신은 `UPDATE_GOLDEN=1 npx vitest run shared/sim/conformance.test.ts` 로만.
 *  2. 금지 함수 grep: shared/sim/**\/*.ts (dmath.ts·*.test.ts 제외) 의 주석을 걷어낸 소스에
 *     Math 초월함수(asinh·acosh·atanh 포함)·Math.random·`Math[`·`= Math` 별칭·Date·performance·`**` 가 없고,
 *     import 는 전부 상대 경로다.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";
import { simulateFrom, simulateShot } from "./simulate.js";
import { generateShotCases, paramsOf, type ShotCase } from "./fixtures/shots.js";
import { ENGINE_VERSION } from "./version.js";
import type { BallState, ShotInput } from "./types.js";
import type { CushionModelId, TableSpec } from "./params.js";

const here = dirname(fileURLToPath(import.meta.url));
const GOLDEN_PATH = join(here, "fixtures", "golden.json");
const GOLDEN_SEED = 20260907;
const GOLDEN_N = 200;
/** [0, SHS_FROM) han2005, [SHS_FROM, MATHAVAN_FROM) sphereHalfSpace, [MATHAVAN_FROM, N) mathavan2010 */
const SHS_FROM = 160;
const MATHAVAN_FROM = 180;
/** i ≡ 3 (mod 10) 은 0.8, i ≡ 7 (mod 10) 은 1.25 — 40개가 condition ≠ 1 */
const CONDITION_FOR = (i: number): number => (i % 10 === 3 ? 0.8 : i % 10 === 7 ? 1.25 : 1);
/** 움직이는 시작 상태 케이스: 10번째마다 하나, 그 샷의 FROM_EVENT 번째 이벤트 직후 스냅샷 */
const FROM_EVERY = 10;
const FROM_EVENT = 3;

interface GoldenEntry {
    readonly i: number;
    readonly tableId: TableSpec["id"];
    readonly gameType: "3c" | "4c";
    readonly layout: "opening" | "random";
    readonly cushionModel: CushionModelId;
    readonly condition: number;
    readonly balls: readonly BallState[];
    readonly input: ShotInput;
    readonly hash: string;
    readonly eventCount: number;
    readonly duration: number;
    readonly truncated: boolean;
    readonly final: readonly { readonly id: string; readonly r: readonly [number, number, number] }[];
}

/** 움직이는 시작 상태(simulateFrom) 케이스. balls 는 sliding/rolling/spinning 이 섞인 스냅샷, t0 는 그 스냅샷 시각. */
interface GoldenFromEntry {
    readonly i: number;
    readonly tableId: TableSpec["id"];
    readonly cushionModel: CushionModelId;
    readonly condition: number;
    readonly t0: number;
    readonly balls: readonly BallState[];
    readonly hash: string;
    readonly eventCount: number;
    readonly duration: number;
    readonly truncated: boolean;
    readonly final: readonly { readonly id: string; readonly r: readonly [number, number, number] }[];
}

interface GoldenFile {
    readonly engineVersion: string;
    readonly seed: number;
    readonly shots: readonly GoldenEntry[];
    readonly fromShots: readonly GoldenFromEntry[];
}

function modelFor(i: number): CushionModelId {
    return i < SHS_FROM ? "han2005" : i < MATHAVAN_FROM ? "sphereHalfSpace" : "mathavan2010";
}

function goldenCases(): readonly ShotCase[] {
    return generateShotCases(GOLDEN_SEED, GOLDEN_N, { modelFor, conditionFor: CONDITION_FOR });
}

function runCase(c: Pick<ShotCase, "tableId" | "cushionModel" | "condition" | "balls" | "input">) {
    return simulateShot(c.balls, c.input, paramsOf(c));
}

function runFromCase(c: Pick<GoldenFromEntry, "tableId" | "cushionModel" | "condition" | "balls" | "t0">) {
    return simulateFrom(c.balls, paramsOf(c), c.t0);
}

/** 샷 케이스에서 움직이는 시작 상태를 만든다: FROM_EVENT 번째 이벤트 직후(없으면 마지막 전) 스냅샷. */
function fromCaseOf(c: ShotCase): Pick<GoldenFromEntry, "i" | "tableId" | "cushionModel" | "condition" | "t0" | "balls"> {
    const r = runCase(c);
    const k = Math.min(FROM_EVENT, Math.max(0, r.history.length - 2));
    const snap = r.history[k];
    return { i: c.i, tableId: c.tableId, cushionModel: c.cushionModel, condition: c.condition, t0: snap.t, balls: snap.balls };
}

function goldenFromCases() {
    return goldenCases().filter((c) => c.i % FROM_EVERY === 0).map(fromCaseOf);
}

function generateGolden(): GoldenFile {
    const shots = goldenCases().map((c): GoldenEntry => {
        const r = runCase(c);
        return {
            i: c.i, tableId: c.tableId, gameType: c.gameType, layout: c.layout, cushionModel: c.cushionModel,
            condition: c.condition, balls: c.balls, input: c.input,
            hash: r.hash, eventCount: r.events.length, duration: r.duration, truncated: r.truncated,
            final: r.final.map((b) => ({ id: b.id, r: b.r })),
        };
    });
    const fromShots = goldenFromCases().map((c): GoldenFromEntry => {
        const r = runFromCase(c);
        return {
            ...c,
            hash: r.hash, eventCount: r.events.length, duration: r.duration, truncated: r.truncated,
            final: r.final.map((b) => ({ id: b.id, r: b.r })),
        };
    });
    return { engineVersion: ENGINE_VERSION, seed: GOLDEN_SEED, shots, fromShots };
}

describe("골든 픽스처", () => {
    const update = process.env.UPDATE_GOLDEN === "1";
    if (update) {
        it("UPDATE_GOLDEN=1: fixtures/golden.json 재생성", () => {
            const g = generateGolden();
            mkdirSync(dirname(GOLDEN_PATH), { recursive: true });
            writeFileSync(GOLDEN_PATH, JSON.stringify(g, null, 1) + "\n");
            expect(g.shots.length).toBe(GOLDEN_N);
        });
    }

    const golden: GoldenFile | null = existsSync(GOLDEN_PATH) || update
        ? (update ? generateGolden() : (JSON.parse(readFileSync(GOLDEN_PATH, "utf8")) as GoldenFile))
        : null;

    it("픽스처 파일이 있고 200개, 두 테이블·두 종목·두 배치·세 쿠션 모델·컨디션 3종·움직이는 시작 20개", () => {
        expect(golden, "fixtures/golden.json 이 없다 — UPDATE_GOLDEN=1 로 생성").not.toBeNull();
        const shots = golden!.shots;
        expect(shots.length).toBe(GOLDEN_N);
        expect(golden!.engineVersion).toBe(ENGINE_VERSION);
        expect(shots.filter((s) => s.tableId === "DAEDAE").length).toBeGreaterThan(50);
        expect(shots.filter((s) => s.tableId === "JUNGDAE_KR").length).toBeGreaterThan(50);
        expect(shots.filter((s) => s.gameType === "3c").length).toBeGreaterThan(50);
        expect(shots.filter((s) => s.gameType === "4c").length).toBeGreaterThan(50);
        expect(shots.filter((s) => s.layout === "opening").length).toBeGreaterThan(50);
        expect(shots.filter((s) => s.layout === "random").length).toBeGreaterThan(50);
        expect(shots.filter((s) => s.cushionModel === "han2005").length).toBe(SHS_FROM);
        expect(shots.filter((s) => s.cushionModel === "sphereHalfSpace").length).toBe(MATHAVAN_FROM - SHS_FROM);
        expect(shots.filter((s) => s.cushionModel === "mathavan2010").length).toBe(GOLDEN_N - MATHAVAN_FROM);
        expect(shots.filter((s) => s.condition === 0.8).length).toBe(20);
        expect(shots.filter((s) => s.condition === 1.25).length).toBe(20);
        expect(shots.filter((s) => s.condition === 1).length).toBe(160);
        expect(shots.every((s) => !s.truncated)).toBe(true);
        const from = golden!.fromShots;
        expect(from.length).toBe(GOLDEN_N / FROM_EVERY);
        expect(from.every((f) => !f.truncated)).toBe(true);
        expect(from.every((f) => f.t0 > 0)).toBe(true);
        // 움직이는 공이 실제로 있고, 상태 종류가 섞여 있다
        expect(from.every((f) => f.balls.some((b) => b.state !== "stationary"))).toBe(true);
        const states = new Set(from.flatMap((f) => f.balls.map((b) => b.state)));
        expect(states.has("sliding") || states.has("rolling")).toBe(true);
        expect(new Set(from.map((f) => f.cushionModel)).size).toBe(3);
        for (const s of shots) {
            expect(s.input.V0).toBeGreaterThanOrEqual(0.8);
            expect(s.input.V0).toBeLessThanOrEqual(9);
            expect(s.input.a * s.input.a + s.input.b * s.input.b).toBeLessThanOrEqual(0.25);
            expect(s.input.theta).toBeGreaterThanOrEqual(0);
            expect(s.input.theta).toBeLessThanOrEqual(0.35);
        }
    });

    it("생성기가 같은 시드에서 픽스처의 입력을 그대로 재현한다", () => {
        expect(golden).not.toBeNull();
        const cases = goldenCases();
        for (let i = 0; i < GOLDEN_N; i++) {
            expect(cases[i].input).toEqual(golden!.shots[i].input);
            expect(cases[i].balls).toEqual(golden!.shots[i].balls);
            expect(cases[i].cushionModel).toBe(golden!.shots[i].cushionModel);
            expect(cases[i].condition).toBe(golden!.shots[i].condition);
        }
        const from = goldenFromCases();
        expect(from.length).toBe(golden!.fromShots.length);
        for (let k = 0; k < from.length; k++) {
            expect(from[k].i).toBe(golden!.fromShots[k].i);
            expect(from[k].t0).toBe(golden!.fromShots[k].t0);
            expect(from[k].balls).toEqual(golden!.fromShots[k].balls);
        }
    });

    it("200개 샷의 해시·이벤트 수·최종 위치가 픽스처와 정확히 같다", () => {
        expect(golden).not.toBeNull();
        const mismatches: string[] = [];
        for (const s of golden!.shots) {
            const r = runCase(s);
            if (r.hash !== s.hash) mismatches.push(`#${s.i} hash ${r.hash} != ${s.hash}`);
            if (r.events.length !== s.eventCount) mismatches.push(`#${s.i} events ${r.events.length} != ${s.eventCount}`);
            if (r.duration !== s.duration) mismatches.push(`#${s.i} duration`);
            if (r.truncated !== s.truncated) mismatches.push(`#${s.i} truncated`);
            for (let k = 0; k < s.final.length; k++) {
                const b = r.final.find((x) => x.id === s.final[k].id);
                if (!b) { mismatches.push(`#${s.i} missing ball ${s.final[k].id}`); continue; }
                for (let d = 0; d < 3; d++) {
                    if (!Object.is(b.r[d], s.final[k].r[d])) mismatches.push(`#${s.i} ${b.id}.r[${d}] ${b.r[d]} != ${s.final[k].r[d]}`);
                }
            }
        }
        expect(mismatches, mismatches.slice(0, 10).join("\n")).toEqual([]);
    });

    it("움직이는 시작 상태 20개(simulateFrom, t0 ≠ 0)의 해시·이벤트 수·최종 위치가 픽스처와 정확히 같다", () => {
        expect(golden).not.toBeNull();
        const mismatches: string[] = [];
        for (const s of golden!.fromShots) {
            const r = runFromCase(s);
            if (r.hash !== s.hash) mismatches.push(`from#${s.i} hash ${r.hash} != ${s.hash}`);
            if (r.events.length !== s.eventCount) mismatches.push(`from#${s.i} events ${r.events.length} != ${s.eventCount}`);
            if (r.duration !== s.duration) mismatches.push(`from#${s.i} duration`);
            if (r.history[0].t !== s.t0) mismatches.push(`from#${s.i} t0`);
            for (let k = 0; k < s.final.length; k++) {
                const b = r.final.find((x) => x.id === s.final[k].id);
                if (!b) { mismatches.push(`from#${s.i} missing ball ${s.final[k].id}`); continue; }
                for (let d = 0; d < 3; d++) {
                    if (!Object.is(b.r[d], s.final[k].r[d])) mismatches.push(`from#${s.i} ${b.id}.r[${d}]`);
                }
            }
        }
        expect(mismatches, mismatches.slice(0, 10).join("\n")).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// 소스 grep
// ---------------------------------------------------------------------------

function listTs(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) listTs(p, out);
        else if (name.endsWith(".ts")) out.push(p);
    }
    return out;
}

function stripComments(src: string): string {
    return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("금지 함수·import grep (dmath.ts, *.test.ts 제외)", () => {
    const files = listTs(here).filter((p) => !p.endsWith(".test.ts") && !p.endsWith("dmath.ts"));
    const BANNED_MATH = /Math\.(sin|cos|tan|atan|atan2|asin|acos|asinh|acosh|atanh|exp|log|pow|hypot|cbrt|random|fround|sinh|cosh|tanh|log2|log10|log1p|expm1)\b/g;
    /** `Math[...]` 대괄호 접근과 `= Math` / `= Math;` 별칭·구조분해(`const { sin } = Math`)로 grep 을 우회하는 것도 막는다. */
    const BANNED_MATH_ALIAS = /\bMath\s*\[|=\s*Math\b(?!\s*\.)/g;
    const BANNED_TIME = /\b(Date|performance)\b/g;
    const POW_OP = /\*\*/g;
    const IMPORT_RE = /(?:from|import)\s*\(?\s*["']([^"']+)["']/g;

    it("검사 대상 파일이 있다", () => {
        expect(files.length).toBeGreaterThan(20);
        expect(files.some((p) => p.endsWith("simulate.ts"))).toBe(true);
    });

    it("Math 초월함수·Math.random 없음, Math 별칭·대괄호 접근 없음", () => {
        const hits: string[] = [];
        for (const f of files) {
            const code = stripComments(readFileSync(f, "utf8"));
            for (const m of code.matchAll(BANNED_MATH)) hits.push(`${relative(here, f)}: ${m[0]}`);
            for (const m of code.matchAll(BANNED_MATH_ALIAS)) hits.push(`${relative(here, f)}: ${m[0]}`);
        }
        expect(hits).toEqual([]);
        // 정규식 자체 검증: 과거에 놓쳤던 asinh/acosh/atanh 와 우회 패턴을 잡고, 허용 패턴은 잡지 않는다
        const catches = (src: string, re: RegExp) => Array.from(src.matchAll(new RegExp(re.source, "g"))).length > 0;
        expect(catches("Math.asinh(x)", BANNED_MATH)).toBe(true);
        expect(catches("Math.acosh(x)", BANNED_MATH)).toBe(true);
        expect(catches("Math.atanh(x)", BANNED_MATH)).toBe(true);
        expect(catches("Math[\"sin\"](x)", BANNED_MATH_ALIAS)).toBe(true);
        expect(catches("const { sin } = Math;", BANNED_MATH_ALIAS)).toBe(true);
        expect(catches("const M = Math\n", BANNED_MATH_ALIAS)).toBe(true);
        expect(catches("const y = Math.sqrt(x);", BANNED_MATH_ALIAS)).toBe(false);
        expect(catches("Math.sqrt(x) + Math.abs(y)", BANNED_MATH)).toBe(false);
    });

    it("Date·performance·`**` 없음", () => {
        const hits: string[] = [];
        for (const f of files) {
            const code = stripComments(readFileSync(f, "utf8"));
            for (const m of code.matchAll(BANNED_TIME)) hits.push(`${relative(here, f)}: ${m[0]}`);
            for (const m of code.matchAll(POW_OP)) hits.push(`${relative(here, f)}: ${m[0]}`);
        }
        expect(hits).toEqual([]);
    });

    it("import 는 전부 이 폴더 안의 상대 경로", () => {
        const hits: string[] = [];
        for (const f of files) {
            const code = stripComments(readFileSync(f, "utf8"));
            for (const m of code.matchAll(IMPORT_RE)) {
                const spec = m[1];
                if (!spec.startsWith("./") && !spec.startsWith("../")) hits.push(`${relative(here, f)}: ${spec}`);
            }
        }
        expect(hits).toEqual([]);
    });
});
