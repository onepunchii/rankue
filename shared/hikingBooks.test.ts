import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { HIKING_GROUPS } from "./hikingMountains";

const root = (f: string) => resolve(__dirname, "..", f);
const read = (f: string) => readFileSync(root(f), "utf8");

describe("묶음 수첩 — 표지 그림과 책장", () => {
    it("묶음마다 표지 그림이 한 장씩 있고(가볍다), 권의 차례에 빠진 묶음이 없다", () => {
        const book = read("client/src/hiking/components/BundleNotebook.tsx");
        const order = /const ORDER = \[([^\]]+)\]/.exec(book)?.[1].split(",").map((x) => x.trim().replace(/"/g, "")).filter(Boolean) ?? [];
        expect(order.length).toBe(HIKING_GROUPS.length);
        for (const g of HIKING_GROUPS) {
            expect(order, g.id).toContain(g.id);
            const file = root(`client/public/hiking/art/book-${g.id}.webp`);
            expect(existsSync(file), g.id).toBe(true);
            expect(statSync(file).size, g.id).toBeLessThan(160_000);
        }
    });
    it("이름 · 권 번호 · 숫자는 그림이 아니라 화면이 찍는다 — 줄여 찍는 이름은 책장에서만", () => {
        const book = read("client/src/hiking/components/BundleNotebook.tsx");
        expect(book).toContain("{big ? name : SHELF_NAME[id] ?? name}");
        expect(book).toContain("No.{volume(id)}");
        // 줄여 찍는 묶음은 실제로 있는 묶음이다
        const short = /const SHELF_NAME[^=]*= \{([^}]+)\}/.exec(book)?.[1] ?? "";
        for (const id of [...short.matchAll(/(\w+):/g)].map((m) => m[1])) expect(HIKING_GROUPS.some((g) => g.id === id), id).toBe(true);
        // 읽어 주는 말에는 제 이름이 간다
        expect(book).toContain("aria-label={`${name} · 산 ${count.toLocaleString(\"en-US\")}곳");
        // 진행은 그 묶음의 산을 다 알 때만 찍는다(허브)
        expect(read("client/src/hiking/pages/HikingHub.tsx")).toContain("my.mine && members.length === g.count && g.count > 0");
    });
});

describe("산 지도 — 손으로 키우기", () => {
    const map = read("client/src/hiking/components/MountainMap.tsx");
    it("안 키웠을 때는 한 손가락이 화면을 스크롤하고, 키운 뒤에만 지도를 끈다", () => {
        expect(map).toContain('touchAction: !interactive ? "auto" : zoomed ? "none" : "pan-y"');
        expect(map).toContain("} else if (s.view.w < homeRef.current.w * 0.98) {");
    });
    it("단추로도 된다(키우기 · 줄이기 · 처음 크기로) — 두 손가락이 어려운 사람과 마우스", () => {
        for (const id of ["map-zoom-in", "map-zoom-out", "map-zoom-reset"]) expect(map).toContain(`data-testid="${id}"`);
        expect(map).toContain('aria-label="지도 키우기"');
        // 평소의 휠은 화면 스크롤에 맡긴다
        expect(map).toContain("if (!e.ctrlKey && !e.metaKey) return;");
    });
    it("끌다가 놓은 것을 누름으로 보지 않는다(산 화면으로 튀지 않는다)", () => {
        expect(map).toContain("if (!dragged.current) setLocation(hikingMountainPath(slug));");
    });
    it("글자는 화면에서 12px 아래로 내려가지 않는다 — 실제 너비를 재서 키운다", () => {
        expect(map).toContain("const fs = 12.5 * unit;");
        expect(map).toContain("new ResizeObserver(");
    });
    it("작게 세우는 자리('여기' 지도)는 손짓 · 단추 없이 그림만", () => {
        expect(read("client/src/hiking/components/MountainLocation.tsx")).toContain("<MountainMap mountains={pins} interactive={false} />");
        expect(map).toContain("if (!interactive) return svg;");
    });
});
