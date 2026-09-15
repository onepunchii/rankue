/**
 * 결정론 규율 검사(shared/sim/conformance.test.ts 와 같은 grep) — 이 폴더의 소스에 초월함수·시각·난수·`**` 가 없고,
 * 임포트는 전부 상대 경로 + `.js` 확장자(서버리스 500 사고 방지)여야 한다.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const here = new URL(".", import.meta.url).pathname;
function listTs(dir: string): string[] {
    const out: string[] = [];
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) out.push(...listTs(p));
        else if (name.endsWith(".ts")) out.push(p);
    }
    return out;
}
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

describe("shared/golf/field 결정론 grep", () => {
    const files = listTs(here).filter((p) => !p.endsWith(".test.ts"));
    const BANNED_MATH = /Math\.(sin|cos|tan|atan|atan2|asin|acos|asinh|acosh|atanh|exp|log|pow|hypot|cbrt|random|fround|sinh|cosh|tanh|log2|log10|log1p|expm1)\b/g;
    const BANNED_MATH_ALIAS = /\bMath\s*\[|=\s*Math\b(?!\s*\.)/g;
    const BANNED_TIME = /\b(Date|performance)\b/g;
    const POW_OP = /\*\*/g;
    const IMPORT_RE = /(?:from|import)\s*\(?\s*["']([^"']+)["']/g;

    it("파일이 있다", () => { expect(files.length).toBeGreaterThan(6); });

    it("Math 초월함수·random·별칭 없음", () => {
        const hits: string[] = [];
        for (const f of files) {
            const code = stripComments(readFileSync(f, "utf8"));
            for (const m of code.matchAll(BANNED_MATH)) hits.push(`${relative(here, f)}: ${m[0]}`);
            for (const m of code.matchAll(BANNED_MATH_ALIAS)) hits.push(`${relative(here, f)}: ${m[0]}`);
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

    it("임포트는 상대 경로 + .js 확장자, 허용 범위(이 폴더 · ../course.js · ../../sim/*.js)", () => {
        const hits: string[] = [];
        for (const f of files) {
            const code = stripComments(readFileSync(f, "utf8"));
            for (const m of code.matchAll(IMPORT_RE)) {
                const spec = m[1];
                const ok = /^\.\/[A-Za-z0-9_-]+\.js$/.test(spec) || spec === "../course.js" || /^\.\.\/\.\.\/sim\/[A-Za-z0-9_-]+\.js$/.test(spec);
                if (!ok) hits.push(`${relative(here, f)}: ${spec}`);
            }
        }
        expect(hits).toEqual([]);
    });
});
