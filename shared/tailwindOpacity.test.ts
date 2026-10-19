import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Tailwind 투명도 눈금(2026-10-19) — 눈금에 없는 값(`bg-brand/12`)은 클래스가 만들어지지 않아 조용히 빈다.
 * 서른한 곳이 그랬다(PBA 랭킹 1위 메달 바탕 · 승패 표시 · 알림 권한 창 아이콘 바탕 …). 쓰는 값은 눈금에 있어야 한다.
 */
const ROOT = resolve(__dirname, "..");
const DEFAULT = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100];

describe("Tailwind 투명도 눈금", () => {
    it("화면에 쓴 /숫자 투명도는 모두 눈금에 있다(기본 + tailwind.config 의 opacity)", () => {
        const cfg = readFileSync(resolve(ROOT, "tailwind.config.ts"), "utf8");
        const extra = [...(cfg.match(/opacity:\s*\{([^}]*)\}/)?.[1] ?? "").matchAll(/(\d+):/g)].map((m) => Number(m[1]));
        const allowed = new Set([...DEFAULT, ...extra]);
        const out = execSync(
            `grep -rhoE "\\b(bg|text|border|ring|fill|stroke|outline|divide|decoration|accent|caret|placeholder|shadow)-[a-zA-Z0-9#\\[\\]()_.:-]+/[0-9]+\\b" client/src || true`,
            { cwd: ROOT, encoding: "utf8" },
        );
        const bad = [...new Set(out.split("\n").filter(Boolean).filter((c) => !/^(from|to|via)-/.test(c)).filter((c) => !allowed.has(Number(c.split("/").pop()))))];
        expect(bad).toEqual([]);
        expect(extra).toEqual(expect.arrayContaining([12, 18, 88]));
    });
});
