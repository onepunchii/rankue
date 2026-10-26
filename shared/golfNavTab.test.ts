/**
 * 골프 하단 탭의 '조인'이 켜지는 주소(2026-10-26 오너: "골프 홈의 골프 코스 카드를 누르면 네비게이션 바에 조인으로 선택된다 — 조인으로 선택되지 않게").
 * 골프장 목록 · 상세(/golf/courses · /golf/course/:slug)는 홈 카드 · 검색 · 지도에서도 들어오는 화면이라 어느 탭도 켜지 않는다.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const nav = readFileSync(resolve(__dirname, "../client/src/components/hiq/HiqNavigation.tsx"), "utf8");
const joinTab = nav.slice(nav.indexOf('{ id: "join"'), nav.indexOf("},", nav.indexOf('{ id: "join"')) + 2);

describe("골프 하단 탭 — 조인", () => {
    it("골프장 목록 · 상세에서는 켜지지 않는다", () => {
        expect(joinTab).not.toContain('"/golf/courses"');
        expect(joinTab).not.toContain('"/golf/course"');
    });
    it("조인 · 부킹 화면에서는 그대로 켜진다", () => {
        expect(joinTab).toContain('path: "/golf/booking-list"');
        for (const p of ['"/golf/booking"', '"/golf/join"', '"/golf/urgent"']) expect(joinTab, p).toContain(p);
    });
});
