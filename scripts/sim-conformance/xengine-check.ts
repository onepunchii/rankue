/**
 * scripts/sim-conformance/xengine-check.ts — 교차 JS 엔진 결정론 검사 (Bun/JavaScriptCore · Deno · Node).
 *
 * run.ts 가 Playwright 브라우저(WebKit·Chromium)로 하는 검사의 가벼운 형제. 브라우저 다운로드 없이 설치된 런타임만으로
 * shared/sim 소스를 **그대로**(번들 없이) 돌려 golden.json 의 해시가 재현되는지 본다. 종료 코드 0 = 불일치 0.
 * 41-determinism-review 2.3: 같은 V8 계열(Node 25 ↔ Deno 2.8)끼리도 Math.* 는 다르고 dmath 는 같았다 — 그 사실을
 * 리포지토리가 검사하도록 둔 스크립트다.
 *
 * 실행
 *   npm run sim:xengine                                   # = bun run scripts/sim-conformance/xengine-check.ts
 *   npx tsx scripts/sim-conformance/xengine-check.ts      # Node (V8)
 *   deno run --allow-read --unstable-sloppy-imports scripts/sim-conformance/xengine-check.ts
 * 출력: 엔진 라벨, golden shots/fromShots 불일치 수, 시드 7 코퍼스(han 300 · SHS 100 · mathavan 100) 해시 다이제스트,
 *       paramsHash(DEFAULT), dmath 10 함수 × 2만 입력의 출력 다이제스트(엔진 간 반드시 동일), Math.* 다이제스트(정보용).
 * 다른 런타임의 출력과 나란히 놓고 다이제스트가 같은지 보면 된다(CI 는 golden 불일치 0 만 단언).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { simulateFrom, simulateShot } from "../../shared/sim/simulate";
import { generateShotCases, paramsOf } from "../../shared/sim/fixtures/shots";
import { fnv1a64String, HashWriter } from "../../shared/sim/hash";
import { paramsHash } from "../../shared/sim/version";
import { DEFAULT_PARAMS, DEFAULT_CUE, TABLES } from "../../shared/sim/params";
import * as dm from "../../shared/sim/dmath";
import { mulberry32 } from "../../shared/sim/rng";
import type { BallState, ShotInput } from "../../shared/sim/types";
import type { CushionModelId, TableSpec } from "../../shared/sim/params";

interface GoldenShot {
    readonly i: number;
    readonly tableId: TableSpec["id"];
    readonly cushionModel: CushionModelId;
    readonly condition: number;
    readonly balls: readonly BallState[];
    readonly input: ShotInput;
    readonly hash: string;
}
interface GoldenFrom {
    readonly i: number;
    readonly tableId: TableSpec["id"];
    readonly cushionModel: CushionModelId;
    readonly condition: number;
    readonly t0: number;
    readonly balls: readonly BallState[];
    readonly hash: string;
}
interface Golden {
    readonly engineVersion: string;
    readonly shots: readonly GoldenShot[];
    readonly fromShots?: readonly GoldenFrom[];
}

const g = globalThis as unknown as {
    Bun?: { version: string };
    Deno?: { version: { deno: string; v8: string } };
    process?: { versions: { node: string; v8: string } };
};
const engine = g.Bun ? `bun ${g.Bun.version} (JavaScriptCore)`
    : g.Deno ? `deno ${g.Deno.version.deno} (V8 ${g.Deno.version.v8})`
    : `node ${g.process?.versions.node} (V8 ${g.process?.versions.v8})`;
console.log("engine:", engine);

const here = dirname(fileURLToPath(import.meta.url));
const golden = JSON.parse(readFileSync(join(here, "..", "..", "shared", "sim", "fixtures", "golden.json"), "utf8")) as Golden;

// 1) golden shots / fromShots
let mism = 0;
for (const s of golden.shots) {
    const r = simulateShot(s.balls, s.input, { table: TABLES[s.tableId], cue: DEFAULT_CUE, cushionModel: s.cushionModel, condition: s.condition });
    if (r.hash !== s.hash) { mism++; if (mism <= 5) console.log(`  golden mismatch #${s.i}: ${r.hash} != ${s.hash}`); }
}
let mismFrom = 0;
for (const s of golden.fromShots ?? []) {
    const r = simulateFrom(s.balls, { table: TABLES[s.tableId], cue: DEFAULT_CUE, cushionModel: s.cushionModel, condition: s.condition }, s.t0);
    if (r.hash !== s.hash) { mismFrom++; if (mismFrom <= 5) console.log(`  golden fromShots mismatch #${s.i}: ${r.hash} != ${s.hash}`); }
}
console.log(`golden ${golden.engineVersion}: shots mismatches ${mism} / ${golden.shots.length}, fromShots mismatches ${mismFrom} / ${(golden.fromShots ?? []).length}`);

// 2) 코퍼스 다이제스트 (엔진 간 반드시 동일)
for (const model of ["han2005", "sphereHalfSpace", "mathavan2010"] as const) {
    const cases = generateShotCases(7, model === "han2005" ? 300 : 100, { modelFor: () => model });
    let acc = "";
    let events = 0;
    for (const c of cases) {
        const r = simulateShot(c.balls, c.input, paramsOf(c));
        acc += r.hash;
        events += r.events.length;
    }
    console.log(`corpus ${model} n=${cases.length} events=${events} digest=${fnv1a64String(acc)}`);
}

// 3) paramsHash
console.log("paramsHash DEFAULT:", paramsHash(DEFAULT_PARAMS));

// 4) dmath 출력 다이제스트 (반드시 동일) vs Math.* (정보용)
const N = 20000;
const w = new HashWriter();
const wm = new HashWriter();
const fns: Array<[string, (x: number) => number, (x: number) => number, (r: () => number) => number]> = [
    ["sin", dm.sin, Math.sin, (r) => (r() - 0.5) * 200],
    ["cos", dm.cos, Math.cos, (r) => (r() - 0.5) * 200],
    ["tan", dm.tan, Math.tan, (r) => (r() - 0.5) * 200],
    ["atan", dm.atan, Math.atan, (r) => (r() - 0.5) * 200],
    ["asin", dm.asin, Math.asin, (r) => r() * 2 - 1],
    ["acos", dm.acos, Math.acos, (r) => r() * 2 - 1],
    ["exp", dm.exp, Math.exp, (r) => (r() - 0.5) * 1400],
    ["log", dm.log, Math.log, (r) => r() * 1e6 + 1e-6],
    ["cbrt", dm.cbrt, Math.cbrt, (r) => (r() - 0.5) * 2e6],
];
let seed = 1;
let totalDiff = 0;
for (const [name, f, m, sample] of fns) {
    const rnd = mulberry32(seed++);
    let diff = 0;
    for (let i = 0; i < N; i++) {
        const x = sample(rnd);
        const a = f(x), b = m(x);
        w.f64bits(a);
        wm.f64bits(b);
        if (!Object.is(a, b)) diff++;
    }
    totalDiff += diff;
    console.log(`  ${name}: dmath != Math.* in ${diff}/${N}`);
}
{
    const rnd = mulberry32(99);
    let diff = 0;
    for (let i = 0; i < N; i++) {
        const y = (rnd() - 0.5) * 20, x = (rnd() - 0.5) * 20;
        const a = dm.atan2(y, x), b = Math.atan2(y, x);
        w.f64bits(a); wm.f64bits(b);
        if (!Object.is(a, b)) diff++;
    }
    totalDiff += diff;
    console.log(`  atan2: dmath != Math.* in ${diff}/${N}`);
}
console.log("dmath output digest (must match across engines):", w.hex());
console.log("Math.* output digest (may differ across engines):", wm.hex(), `(${totalDiff} samples differ from dmath on this engine)`);

const ok = mism === 0 && mismFrom === 0;
console.log(ok ? "RESULT: PASS (golden mismatches 0)" : "RESULT: FAIL");
if (!ok) {
    if (g.Deno) (g.Deno as unknown as { exit: (c: number) => void }).exit(1);
    else (g.process as unknown as { exit: (c: number) => void }).exit(1);
}
