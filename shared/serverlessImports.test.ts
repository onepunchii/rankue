import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const root = resolve(__dirname, "..");

/**
 * 서버리스(Vercel)는 번들 없이 Node ESM 으로 돈다 — 상대 임포트에 확장자(.js)가 없으면 함수가 뜨지 못하고 api 전체가 500 이 된다.
 * 타입 검사 · 시험 · 로컬 실행(tsx)은 전부 통과하므로 배포한 뒤에야 안다(2026-08-16 · 09-14 · 10-13 세 번의 사고 — 마지막은 shared/hikingSummitWx 의
 * "./golfWeather"). 그래서 여기서 막는다: 서버가 (곧바로든 건너서든) 부르는 모든 파일의 상대 임포트는 .js 로 끝나야 한다.
 * 타입만 가져오는 줄(import type …)은 지워지므로 보지 않는다. server/scripts 는 tsx 로 손으로 돌리는 것이라 뺀다.
 */
const walk = (dir: string, out: string[] = []): string[] => {
    for (const n of readdirSync(dir)) {
        const p = join(dir, n);
        if (statSync(p).isDirectory()) { if (n !== "node_modules" && n !== "scripts" && n !== "assets") walk(p, out); }
        else if (/\.ts$/.test(n) && !/\.test\.ts$/.test(n) && !/\.d\.ts$/.test(n)) out.push(p);
    }
    return out;
};
/** 실행 때 남는 상대 임포트들 — import type · export type 은 뺀다. 동적 import("…") 도 본다 */
function relativeImports(file: string): string[] {
    const src = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    const out: string[] = [];
    for (const m of src.matchAll(/^\s*(import|export)\s+(type\s+)?[^;'"]*?from\s+["'](\.{1,2}\/[^"']+)["']/gm)) if (!m[2]) out.push(m[3]);
    for (const m of src.matchAll(/^\s*import\s+["'](\.{1,2}\/[^"']+)["']/gm)) out.push(m[1]);
    for (const m of src.matchAll(/\bimport\(\s*["'`](\.{1,2}\/[^"'`]+)["'`]\s*\)/g)) out.push(m[1]);
    return out;
}
const toFile = (from: string, spec: string): string | null => {
    const base = resolve(dirname(from), spec.replace(/\.js$/, ""));
    for (const c of [`${base}.ts`, `${base}.tsx`, join(base, "index.ts")]) if (existsSync(c)) return c;
    return null;
};

/** 개발 서버에서만 불리는 파일 — 서버리스 함수에는 실리지 않는다(server/vite.ts 는 Vite 설정 파일을 확장자째 부른다) */
const DEV_ONLY = new Set(["server/vite.ts"]);

describe("서버리스가 부르는 파일의 상대 임포트는 .js 로 끝난다(아니면 /api 전체가 죽는다)", () => {
    it("server · api 에서 닿는 모든 파일(shared 포함)", () => {
        const seen = new Set<string>();
        const queue = [...walk(join(root, "server")), ...walk(join(root, "api"))];
        const bad: string[] = [];
        while (queue.length) {
            const f = queue.pop()!;
            if (seen.has(f)) continue;
            seen.add(f);
            for (const spec of relativeImports(f)) {
                if (!/\.(js|json)$/.test(spec) && !DEV_ONLY.has(relative(root, f))) bad.push(`${relative(root, f)} → "${spec}"`);
                const next = toFile(f, spec);
                // 화면 쪽(client)으로 넘어가는 임포트는 서버에 없어야 하지만, 있더라도 여기서 따라가지는 않는다
                if (next && !next.includes(`${join(root, "client")}/`)) queue.push(next);
            }
        }
        expect(seen.size).toBeGreaterThan(200);
        // 이번에 사고를 낸 파일이 닿는 범위 안에 있다(이 시험이 그 파일을 실제로 본다)
        expect([...seen].map((f) => relative(root, f))).toContain("shared/hikingSummitWx.ts");
        expect(bad).toEqual([]);
    });
});
