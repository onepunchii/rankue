/**
 * 적합성 (README 시험 층 C)
 *  1. 골든 픽스처: fixtures/golden.json 의 200개 샷을 다시 돌려 해시·이벤트 수·최종 위치가 비트 단위로 같아야 한다.
 *     갱신은 `UPDATE_GOLDEN=1 npx vitest run shared/sim/conformance.test.ts` 로만.
 *  2. 금지 함수 grep: shared/sim/**\/*.ts (dmath.ts·*.test.ts 제외) 의 주석을 걷어낸 소스에
 *     Math 초월함수·Math.random·Date·performance·`**` 가 없고, import 는 전부 상대 경로다.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";
import { simulateShot } from "./simulate";
import { generateShotCases, paramsOf, type ShotCase } from "./fixtures/shots";
import { ENGINE_VERSION } from "./version";
import type { BallState, ShotInput } from "./types";
import type { CushionModelId, TableSpec } from "./params";

const here = dirname(fileURLToPath(import.meta.url));
const GOLDEN_PATH = join(here, "fixtures", "golden.json");
const GOLDEN_SEED = 20260907;
const GOLDEN_N = 200;
const MATHAVAN_FROM = 180;

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

interface GoldenFile {
    readonly engineVersion: string;
    readonly seed: number;
    readonly shots: readonly GoldenEntry[];
}

function goldenCases(): readonly ShotCase[] {
    return generateShotCases(GOLDEN_SEED, GOLDEN_N, { modelFor: (i) => (i < MATHAVAN_FROM ? "han2005" : "mathavan2010") });
}

function runCase(c: Pick<ShotCase, "tableId" | "cushionModel" | "condition" | "balls" | "input">) {
    return simulateShot(c.balls, c.input, paramsOf(c));
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
    return { engineVersion: ENGINE_VERSION, seed: GOLDEN_SEED, shots };
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

    it("픽스처 파일이 있고 200개, 두 테이블·두 종목·두 배치·한 20개는 mathavan2010", () => {
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
        expect(shots.filter((s) => s.cushionModel === "mathavan2010").length).toBe(GOLDEN_N - MATHAVAN_FROM);
        expect(shots.every((s) => !s.truncated)).toBe(true);
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
    const BANNED_MATH = /Math\.(sin|cos|tan|atan|atan2|asin|acos|exp|log|pow|hypot|cbrt|random|fround|sinh|cosh|tanh|log2|log10|log1p|expm1)\b/g;
    const BANNED_TIME = /\b(Date|performance)\b/g;
    const POW_OP = /\*\*/g;
    const IMPORT_RE = /(?:from|import)\s*\(?\s*["']([^"']+)["']/g;

    it("검사 대상 파일이 있다", () => {
        expect(files.length).toBeGreaterThan(20);
        expect(files.some((p) => p.endsWith("simulate.ts"))).toBe(true);
    });

    it("Math 초월함수·Math.random 없음", () => {
        const hits: string[] = [];
        for (const f of files) {
            const code = stripComments(readFileSync(f, "utf8"));
            for (const m of code.matchAll(BANNED_MATH)) hits.push(`${relative(here, f)}: ${m[0]}`);
        }
        expect(hits).toEqual([]);
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
