/**
 * scripts/sim-conformance/run.ts — 교차 엔진 적합성 검사 (V8/Node · JavaScriptCore/WebKit · V8/Chromium).
 *
 * 목적: shared/sim 이 "어느 기기에서 돌려도 비트 단위로 같은 결과"를 낸다는 주장을 실제 세 엔진으로 증명한다.
 *  1. build.ts 로 번들을 만들고 harness.js 와 함께 Node vm 컨텍스트에서 실행 → golden.json 200 샷의 해시·이벤트·최종 상태.
 *  2. Playwright 로 WebKit·Chromium 을 띄워 빈 페이지에 같은 번들·같은 하네스를 주입하고 같은 계산.
 *  3. 세 결과를 비교. 불일치가 있으면 샷 번호, 처음 달라진 이벤트 인덱스, 처음 달라진 숫자의 ulp 차이를 찍는다.
 *  4. dmath 자기 검사: 시드 고정 20,000 입력에 대해 dmath.* 비트 패턴이 세 엔진에서 같아야 하고(필수),
 *     Math.* 는 정보용으로 얼마나 다른지 센다 — dmath 가 존재해야 하는 이유의 실증.
 *
 * 실행: npm run sim:conformance  (= tsx scripts/sim-conformance/run.ts)
 * 옵션: --report <path>  마크다운 보고서 저장,  --n <int>  dmath 입력 수(기본 20000),  --seed <int>
 * 종료 코드: 샷 해시 또는 dmath 비트가 하나라도 다르면 1.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";
import { chromium, webkit, type Browser } from "playwright";
import { buildSimBundle, REPO_ROOT } from "./build";

const here = dirname(fileURLToPath(import.meta.url));
const GOLDEN_PATH = join(REPO_ROOT, "shared", "sim", "fixtures", "golden.json");
const HARNESS_PATH = join(here, "harness.js");
const DMATH_SEED = 20260907;

// ---------------------------------------------------------------------------
// 하네스가 돌려주는 형태 (harness.js 와 1:1)
// ---------------------------------------------------------------------------

interface HEvent {
    readonly type: string;
    readonly t: string;          // f64 bits hex
    readonly ids: readonly string[];
    readonly cushion: string;
    readonly from: string;
    readonly to: string;
}
interface HBall {
    readonly id: string;
    readonly r: readonly string[];
    readonly v: readonly string[];
    readonly w: readonly string[];
    readonly state: string;
}
interface HShot {
    readonly i: number;
    readonly hash: string;
    readonly goldenHash: string;
    readonly paramsHash: string;
    readonly duration: string;
    readonly truncated: boolean;
    readonly events: readonly HEvent[];
    readonly final: readonly HBall[];
}
interface HFn {
    readonly arity: number;
    readonly inputs: string;
    readonly dmath: string | null;
    readonly math: string;
}
type HDmath = Record<string, HFn>;

interface EngineRun {
    readonly name: string;
    readonly label: string;       // 버전 문자열
    readonly shots: readonly HShot[];
    readonly dmath: HDmath;
    readonly ms: number;
}

// ---------------------------------------------------------------------------
// 비트 패턴 유틸
// ---------------------------------------------------------------------------

function hexToDouble(hex: string): number {
    const buf = new DataView(new ArrayBuffer(8));
    buf.setUint32(0, parseInt(hex.slice(0, 8), 16), false);
    buf.setUint32(4, parseInt(hex.slice(8, 16), 16), false);
    return buf.getFloat64(0, false);
}

/**
 * 두 double 비트 패턴의 ulp 거리. 부호가 같으면 정수 표현의 차, 다르면 0 을 거쳐 가는 거리.
 * NaN 이 끼면 "NaN" 문자열.
 */
function ulpDiff(aHex: string, bHex: string): bigint | "NaN" {
    if (aHex === bHex) return 0n;
    const a = BigInt("0x" + aHex);
    const b = BigInt("0x" + bHex);
    const SIGN = 1n << 63n;
    const MAG = SIGN - 1n;
    const EXP_ALL = 0x7ffn << 52n;
    const isNan = (x: bigint) => (x & EXP_ALL) === EXP_ALL && (x & ((1n << 52n) - 1n)) !== 0n;
    if (isNan(a) || isNan(b)) return "NaN";
    const sa = a & SIGN, sb = b & SIGN;
    const ma = a & MAG, mb = b & MAG;
    if (sa === sb) return ma > mb ? ma - mb : mb - ma;
    return ma + mb;
}

function fmtDouble(hex: string): string {
    const d = hexToDouble(hex);
    return `${d} (0x${hex})`;
}

/** 16자리씩 잘라 배열로. */
function splitHex(s: string, width = 16): string[] {
    const out: string[] = [];
    for (let i = 0; i < s.length; i += width) out.push(s.slice(i, i + width));
    return out;
}

// ---------------------------------------------------------------------------
// 실행: Node (vm 새 컨텍스트) 와 브라우저 (Playwright)
// ---------------------------------------------------------------------------

interface Inputs {
    readonly bundle: string;
    readonly harness: string;
    readonly golden: unknown;
    readonly n: number;
}

function runNode(inp: Inputs): EngineRun {
    const t0 = Date.now();
    // 새 컨텍스트: 이 프로세스의 전역과 섞이지 않는 순수한 realm. 번들·하네스 텍스트는 브라우저와 완전히 같다.
    const ctx = vm.createContext({});
    vm.runInContext(inp.bundle, ctx, { filename: "sim.iife.js" });
    vm.runInContext(inp.harness, ctx, { filename: "harness.js" });
    const api = (ctx as unknown as { __simConformance: { runShots: (S: unknown, g: unknown) => HShot[]; runDmath: (S: unknown, n: number, seed: number) => HDmath } }).__simConformance;
    const Sim = (ctx as unknown as { Sim: unknown }).Sim;
    // 컨텍스트 밖 객체(golden)를 넘겨도 읽기만 하므로 무방. 결과는 컨텍스트 realm 객체지만 순수 데이터라 JSON 왕복으로 정규화한다.
    const shots = JSON.parse(JSON.stringify(api.runShots(Sim, inp.golden))) as HShot[];
    const dmath = JSON.parse(JSON.stringify(api.runDmath(Sim, inp.n, DMATH_SEED))) as HDmath;
    return { name: "node", label: `Node ${process.version} (V8 ${process.versions.v8})`, shots, dmath, ms: Date.now() - t0 };
}

async function runBrowser(name: "webkit" | "chromium", inp: Inputs): Promise<EngineRun> {
    const t0 = Date.now();
    const launcher = name === "webkit" ? webkit : chromium;
    let browser: Browser | null = null;
    try {
        browser = await launcher.launch({ headless: true });
        const page = await browser.newPage();
        page.on("pageerror", (e) => console.error(`[${name}] pageerror:`, e.message));
        await page.setContent("<!doctype html><html><head><meta charset=\"utf-8\"></head><body></body></html>");
        await page.addScriptTag({ content: inp.bundle });
        await page.addScriptTag({ content: inp.harness });
        const ua = await page.evaluate(() => navigator.userAgent);
        // Playwright 직렬화는 숫자를 건드릴 수 있으니(−0, NaN 특수 취급) 하네스가 전부 16진 문자열로 돌려준다.
        const shots = await page.evaluate((golden) => {
            const api = (globalThis as unknown as { __simConformance: { runShots: (S: unknown, g: unknown) => unknown } }).__simConformance;
            return api.runShots((globalThis as unknown as { Sim: unknown }).Sim, golden);
        }, inp.golden) as HShot[];
        const dmath = await page.evaluate(([n, seed]) => {
            const api = (globalThis as unknown as { __simConformance: { runDmath: (S: unknown, n: number, seed: number) => unknown } }).__simConformance;
            return api.runDmath((globalThis as unknown as { Sim: unknown }).Sim, n, seed);
        }, [inp.n, DMATH_SEED] as const) as HDmath;
        const label = `${name === "webkit" ? "WebKit" : "Chromium"} ${browser.version()} — ${ua}`;
        return { name, label, shots, dmath, ms: Date.now() - t0 };
    } finally {
        if (browser) await browser.close();
    }
}

// ---------------------------------------------------------------------------
// 비교
// ---------------------------------------------------------------------------

interface ShotMismatch {
    readonly i: number;
    readonly other: string;
    readonly detail: string;
}

/** 두 엔진의 샷 결과를 비교해 처음 달라진 지점을 설명한다. 같으면 null. */
function diffShot(a: HShot, b: HShot, otherName: string): ShotMismatch | null {
    if (a.hash === b.hash && a.events.length === b.events.length && a.duration === b.duration) {
        // 해시가 같으면 이벤트·최종 상태 전부 같다(해시가 그것들의 함수). 그래도 방어적으로 검사한다.
        for (let e = 0; e < a.events.length; e++) {
            if (JSON.stringify(a.events[e]) !== JSON.stringify(b.events[e])) {
                return { i: a.i, other: otherName, detail: `해시 같은데 이벤트 #${e} 가 다름 (해시 충돌?)` };
            }
        }
        return null;
    }
    const lines: string[] = [`hash node=${a.hash} ${otherName}=${b.hash}`];
    // 처음 달라진 이벤트
    const n = Math.min(a.events.length, b.events.length);
    let firstEvent = -1;
    for (let e = 0; e < n; e++) {
        const x = a.events[e], y = b.events[e];
        if (x.type !== y.type || x.t !== y.t || x.ids.join(",") !== y.ids.join(",") || x.cushion !== y.cushion || x.from !== y.from || x.to !== y.to) {
            firstEvent = e;
            const structural = x.type !== y.type || x.ids.join(",") !== y.ids.join(",") || x.cushion !== y.cushion || x.from !== y.from || x.to !== y.to;
            lines.push(`첫 불일치 이벤트 #${e}: node ${x.type}[${x.ids.join(",")}]${x.cushion || x.to ? ` ${x.cushion || x.from + "→" + x.to}` : ""} t=${fmtDouble(x.t)}`);
            lines.push(`                     ${otherName} ${y.type}[${y.ids.join(",")}]${y.cushion || y.to ? ` ${y.cushion || y.from + "→" + y.to}` : ""} t=${fmtDouble(y.t)}`);
            if (structural) lines.push(`  → 구조가 다름(이벤트 종류/공/쿠션)`);
            if (x.t !== y.t) lines.push(`  → t 의 ulp 차이: ${String(ulpDiff(x.t, y.t))}`);
            break;
        }
    }
    if (firstEvent < 0 && a.events.length !== b.events.length) {
        lines.push(`이벤트 수 다름: node ${a.events.length}, ${otherName} ${b.events.length} (앞 ${n}개는 동일)`);
    }
    // 처음 달라진 최종 상태 숫자
    outer: for (let k = 0; k < Math.min(a.final.length, b.final.length); k++) {
        const x = a.final[k], y = b.final[k];
        for (const field of ["r", "v", "w"] as const) {
            for (let d = 0; d < 3; d++) {
                if (x[field][d] !== y[field][d]) {
                    lines.push(`첫 불일치 최종값 ${x.id}.${field}[${d}]: node ${fmtDouble(x[field][d])} vs ${otherName} ${fmtDouble(y[field][d])} → ${String(ulpDiff(x[field][d], y[field][d]))} ulp`);
                    break outer;
                }
            }
        }
        if (x.state !== y.state) { lines.push(`최종 state 다름 ${x.id}: ${x.state} vs ${y.state}`); break; }
    }
    return { i: a.i, other: otherName, detail: lines.join("\n    ") };
}

interface DmathStat {
    readonly fn: string;
    readonly pair: string;
    readonly kind: "dmath" | "math";
    readonly n: number;
    readonly mismatches: number;
    readonly maxUlp: bigint | "NaN";
    readonly firstExample: string;
}

function compareDmath(a: EngineRun, b: EngineRun): DmathStat[] {
    const stats: DmathStat[] = [];
    for (const fn of Object.keys(a.dmath)) {
        const fa = a.dmath[fn], fb = b.dmath[fn];
        if (!fb) continue;
        if (fa.inputs !== fb.inputs) {
            throw new Error(`${fn}: 입력 비트열이 ${a.name} 과 ${b.name} 에서 다르다 — mulberry32 또는 산술이 엔진 종속?`);
        }
        const inputs = splitHex(fa.inputs);
        for (const kind of ["dmath", "math"] as const) {
            const xa = fa[kind], xb = fb[kind];
            if (xa === null || xb === null) continue;
            const va = splitHex(xa), vb = splitHex(xb);
            let mismatches = 0;
            let maxUlp: bigint | "NaN" = 0n;
            let firstExample = "";
            for (let i = 0; i < va.length; i++) {
                if (va[i] === vb[i]) continue;
                mismatches++;
                const u = ulpDiff(va[i], vb[i]);
                if (u === "NaN") maxUlp = "NaN";
                else if (maxUlp !== "NaN" && u > maxUlp) maxUlp = u;
                if (!firstExample) {
                    const args = fa.arity === 2
                        ? `(${hexToDouble(inputs[2 * i])}, ${hexToDouble(inputs[2 * i + 1])})`
                        : `(${hexToDouble(inputs[i])})`;
                    firstExample = `${fn}${args}: ${a.name}=${fmtDouble(va[i])} ${b.name}=${fmtDouble(vb[i])} (${String(u)} ulp)`;
                }
            }
            stats.push({ fn, pair: `${a.name}↔${b.name}`, kind, n: va.length, mismatches, maxUlp, firstExample });
        }
    }
    return stats;
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

function arg(name: string): string | undefined {
    const i = process.argv.indexOf(name);
    return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<number> {
    const n = Number(arg("--n") ?? 20000);
    const reportPath = arg("--report");

    const built = await buildSimBundle();
    console.log(`bundle: ${built.outFile} (${(built.bytes / 1024).toFixed(1)} KiB)`);
    const golden = JSON.parse(readFileSync(GOLDEN_PATH, "utf8")) as { engineVersion: string; shots: unknown[]; fromShots?: unknown[] };
    const harness = readFileSync(HARNESS_PATH, "utf8");
    console.log(`golden: ${golden.shots.length} shots + ${(golden.fromShots ?? []).length} fromShots, engine ${golden.engineVersion}; dmath n=${n}`);
    const inp: Inputs = { bundle: built.code, harness, golden, n };

    const node = runNode(inp);
    console.log(`[node] ${node.label} — ${node.ms} ms`);
    const wk = await runBrowser("webkit", inp);
    console.log(`[webkit] ${wk.label} — ${wk.ms} ms`);
    const cr = await runBrowser("chromium", inp);
    console.log(`[chromium] ${cr.label} — ${cr.ms} ms`);

    // 1) Node 결과가 golden.json 자체와 맞는지 (같은 프로세스에서 vitest 가 이미 검증하지만, 번들 경로도 확인)
    const goldenMismatch = node.shots.filter((s) => s.hash !== s.goldenHash).map((s) => s.i);
    // 2) 세 엔진 상호 비교
    const mismatches: ShotMismatch[] = [];
    for (let k = 0; k < node.shots.length; k++) {
        for (const other of [wk, cr]) {
            const d = diffShot(node.shots[k], other.shots[k], other.name);
            if (d) mismatches.push(d);
        }
        // webkit ↔ chromium 도 (node 와 둘 다 같으면 자동으로 같지만, node 와 둘 다 다를 때 서로 같은지는 정보가 된다)
        const d2 = diffShot(wk.shots[k], cr.shots[k], "chromium");
        if (d2 && node.shots[k].hash !== wk.shots[k].hash) mismatches.push({ ...d2, other: "webkit↔chromium" });
    }
    // 3) dmath
    const dstats = [...compareDmath(node, wk), ...compareDmath(node, cr), ...compareDmath(wk, cr)];
    const dmathBad = dstats.filter((s) => s.kind === "dmath" && s.mismatches > 0);
    const mathInfo = dstats.filter((s) => s.kind === "math");

    // ----- 출력 -----
    const lines: string[] = [];
    const p = (s = "") => { lines.push(s); console.log(s); };
    p();
    p(`## 샷 적합성 (golden.json ${golden.shots.length} 샷 + fromShots ${(golden.fromShots ?? []).length})`);
    p(`- Node 번들 vs golden.json 해시: ${goldenMismatch.length === 0 ? `${node.shots.length}/${node.shots.length} 일치` : `불일치 ${goldenMismatch.length}: #${goldenMismatch.join(", #")}`}`);
    p(`- Node ↔ WebKit: ${node.shots.filter((s, k) => s.hash === wk.shots[k].hash).length}/${node.shots.length} 해시 일치`);
    p(`- Node ↔ Chromium: ${node.shots.filter((s, k) => s.hash === cr.shots[k].hash).length}/${node.shots.length} 해시 일치`);
    p(`- WebKit ↔ Chromium: ${wk.shots.filter((s, k) => s.hash === cr.shots[k].hash).length}/${node.shots.length} 해시 일치`);
    const totalEvents = node.shots.reduce((acc, s) => acc + s.events.length, 0);
    p(`- 비교한 이벤트 수 ${totalEvents}, 최종 상태 double ${node.shots.reduce((acc, s) => acc + s.final.length * 9, 0)}개, paramsHash 일치: ${node.shots.every((s, k) => s.paramsHash === wk.shots[k].paramsHash && s.paramsHash === cr.shots[k].paramsHash)}`);
    if (mismatches.length > 0) {
        p();
        p("### 불일치 상세");
        for (const m of mismatches) p(`- 샷 #${m.i} (node vs ${m.other})\n    ${m.detail}`);
    }
    p();
    p(`## dmath 자기 검사 (n=${n}, seed=${DMATH_SEED}) — 세 엔진의 비트 패턴이 같아야 한다`);
    p("| 함수 | 쌍 | 불일치 | 최대 ulp |");
    p("|---|---|---:|---:|");
    for (const s of dstats.filter((x) => x.kind === "dmath")) p(`| dmath.${s.fn} | ${s.pair} | ${s.mismatches}/${s.n} | ${String(s.maxUlp)} |`);
    if (dmathBad.length > 0) for (const s of dmathBad) p(`- 예: ${s.firstExample}`);
    p();
    p("## Math.* 엔진 차이 (정보용 — 같은 입력에 대한 세 엔진 내장 libm 비교)");
    p("| 함수 | 쌍 | 불일치 | 최대 ulp | 첫 예 |");
    p("|---|---|---:|---:|---|");
    for (const s of mathInfo) p(`| Math.${s.fn} | ${s.pair} | ${s.mismatches}/${s.n} | ${String(s.maxUlp)} | ${s.firstExample || "—"} |`);
    p();
    const ok = mismatches.length === 0 && dmathBad.length === 0 && goldenMismatch.length === 0;
    p(`## 결론: ${ok ? "세 엔진 비트 동일 (PASS)" : "불일치 있음 (FAIL)"}`);

    if (reportPath) {
        const header = [
            "# 교차 엔진 적합성 실행 로그",
            "",
            `- 실행 시각: ${new Date().toISOString()}`,
            `- 번들: ${built.outFile} (${(built.bytes / 1024).toFixed(1)} KiB, esbuild iife es2020)`,
            `- 엔진: ${node.label} / ${wk.label} / ${cr.label}`,
            `- 소요: node ${node.ms} ms, webkit ${wk.ms} ms, chromium ${cr.ms} ms`,
            "",
        ];
        writeFileSync(reportPath, header.concat(lines).join("\n") + "\n");
        console.log(`report -> ${reportPath}`);
    }
    return ok ? 0 : 1;
}

main().then((code) => process.exit(code)).catch((err) => {
    console.error(err);
    process.exit(2);
});
