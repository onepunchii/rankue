/**
 * scripts/sim-conformance/build.ts — shared/sim/index.ts 를 단일 IIFE 번들로 묶는다.
 *
 * 왜 번들인가: Node·WebKit·Chromium 세 엔진에 "글자 하나 다르지 않은 같은 JS 텍스트"를 넣어야 결과 차이가
 * 오직 엔진(JIT·libm)에서만 나온다고 말할 수 있다. esbuild 는 vite 의존성이라 이미 설치돼 있다.
 *
 * 옵션 근거
 *  - format iife, globalName Sim: <script> 태그 한 장으로 주입하고 globalThis.Sim 으로 접근.
 *  - target es2020: 문법 다운레벨 변환 없음(숫자 연산 순서를 건드릴 여지를 없앤다). 세 엔진 모두 ES2020 지원.
 *  - minify 없음: 상수 접기 등 최적화가 IEEE 연산 순서를 바꾸는 일은 없지만, 진단 시 소스와 대조하기 쉽도록 남긴다.
 *  - 실행 경로: `npx tsx scripts/sim-conformance/build.ts` 또는 run.ts 가 import 해 호출.
 */
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { mkdirSync, readFileSync, statSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(here, "..", "..");
export const ENTRY = join(REPO_ROOT, "shared", "sim", "index.ts");
export const OUT_DIR = join(here, "dist");
export const OUT_FILE = join(OUT_DIR, "sim.iife.js");

export interface BuildInfo {
    readonly outFile: string;
    readonly bytes: number;
    readonly code: string;
}

/** 번들을 만들고 코드 텍스트를 돌려준다. */
export async function buildSimBundle(): Promise<BuildInfo> {
    mkdirSync(OUT_DIR, { recursive: true });
    const result = await build({
        entryPoints: [ENTRY],
        bundle: true,
        format: "iife",
        globalName: "Sim",
        target: ["es2020"],
        platform: "neutral",
        minify: false,
        sourcemap: false,
        treeShaking: true,
        legalComments: "none",
        outfile: OUT_FILE,
        logLevel: "warning",
        write: true,
    });
    if (result.errors.length > 0) {
        throw new Error("esbuild 오류: " + result.errors.map((e) => e.text).join("\n"));
    }
    const code = readFileSync(OUT_FILE, "utf8");
    // 번들 안에 금지 함수가 섞이지 않았는지 마지막으로 한 번 더 본다(dmath.ts 자체는 Math.* 를 쓰지 않는다).
    const banned = code.match(/Math\.(sin|cos|tan|atan2?|asin|acos|asinh|acosh|atanh|sinh|cosh|tanh|exp|expm1|log|log2|log10|log1p|pow|hypot|cbrt|random|fround)\b/g);
    if (banned) {
        throw new Error("번들에 금지 Math 함수가 들어 있다: " + Array.from(new Set(banned)).join(", "));
    }
    return { outFile: OUT_FILE, bytes: statSync(OUT_FILE).size, code };
}

// 직접 실행하면 번들만 만들고 크기를 출력한다.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    buildSimBundle().then((b) => {
        console.log(`bundled ${ENTRY} -> ${b.outFile} (${(b.bytes / 1024).toFixed(1)} KiB)`);
    }).catch((err) => {
        console.error(err);
        process.exit(1);
    });
}
