import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { closedNow, closedOn, closedRange, closedSeo, dayOfYear, FISHING_CLOSED_PATH, minSize } from "./fishingClosed";

/**
 * 금어기 달력(2026-10-18) — 받은 법령 표(regs.json)의 금어기 줄을 막대로. 글은 고치지 않고 날짜 구간만 읽는다.
 */
const read = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");
const regs = JSON.parse(read("client/public/fishing/guide/regs.json")) as { rows: { kind: string; group: string; name: string; rule: string }[] };
const closed = regs.rows.filter((r) => r.kind === "closed");
const row = (name: string) => closed.find((r) => r.name === name)!;

describe("금어기 달력", () => {
    it("받은 금어기 줄은 전부 막대가 된다(못 읽은 줄이 생기면 글만 보이게 되니 여기서 잡는다)", () => {
        expect(closed.length).toBeGreaterThanOrEqual(30);
        for (const r of closed) expect(closedRange(r.rule), r.name).not.toBeNull();
    });
    it("고정 · 해 넘김 · 그 안에서 따로 고시 · 해역 한정", () => {
        expect(closedRange(row("감성돔").rule)).toEqual({ from: dayOfYear(5, 1), to: dayOfYear(5, 31), wraps: false, kind: "fixed", conditional: false });
        const flat = closedRange(row("문치가자미").rule)!;
        expect(flat.wraps).toBe(true);
        expect(closedOn(flat, 1, 15)).toBe(true);
        expect(closedOn(flat, 12, 10)).toBe(true);
        expect(closedOn(flat, 3, 1)).toBe(false);
        expect(closedRange(row("고등어").rule)!.kind).toBe("window");
        expect(closedRange(row("꽃게").rule)!.kind).toBe("window");
        const galchi = closedRange(row("갈치").rule)!;
        expect(galchi.conditional).toBe(true); // 북위 33도 이북 해역 한정
        expect(galchi.from).toBe(dayOfYear(7, 1));
    });
    it("오늘 금어기 — 5월 20일이면 감성돔 · 삼치 · 주꾸미가 걸리고, 3월 1일이면 감성돔은 아니다", () => {
        const may = closedNow(closed, 5, 20).map((r) => r.name);
        for (const n of ["감성돔", "삼치", "주꾸미"]) expect(may).toContain(n);
        expect(closedNow(closed, 3, 1).map((r) => r.name)).not.toContain("감성돔");
    });
    it("주소 · 검색용 화면 · 앱 라우트 · 사이트맵 · 카드", () => {
        expect(FISHING_CLOSED_PATH).toBe("/fishing/closed");
        expect(closedSeo(33).title).toContain("금어기 달력");
        expect(read("vercel.json")).toContain("|fish(?:/[^/]+)?|closed))/?");
        expect(read("client/src/App.tsx")).toContain('<Route path="/fishing/closed">');
        const seo = read("server/seo/fishingFish.ts");
        expect(seo).toContain("if (p === FISHING_CLOSED_PATH) return closedPage(Date.now());");
        expect(seo).toContain("entry(`${ORIGIN}${FISHING_CLOSED_PATH}`");
        expect(read("shared/fishingSeaPages.ts")).toContain('if (key === "closed") return { name: "금어기 달력"');
        // 검색용 글은 서버 자산에 — 받은 표와 같은 줄 수
        expect((JSON.parse(read("server/assets/fishing/fish-pages.json")).closed as unknown[]).length).toBe(closed.length);
    });
    it("금지체장 줄자 — 센티미터 줄은 첫 값, 무게(대문어)는 그램, '다만'이 있으면 조건", () => {
        const mins = regs.rows.filter((r) => r.kind === "min");
        for (const r of mins) expect(minSize(r.rule), r.name).not.toBeNull();
        expect(minSize("25센티미터 이하")).toEqual({ cm: 25, g: null, conditional: false });
        expect(minSize("600그램 이하")).toEqual({ cm: null, g: 600, conditional: false });
        expect(minSize(mins.find((r) => r.name === "문치가자미")!.rule)).toEqual({ cm: 20, g: null, conditional: true });
        expect((JSON.parse(read("server/assets/fishing/fish-pages.json")).mins as unknown[]).length).toBe(mins.length);
        expect(read("client/src/fishing/spots/ClosedPage.tsx")).toContain('data-testid="min-ruler"');
    });
});
