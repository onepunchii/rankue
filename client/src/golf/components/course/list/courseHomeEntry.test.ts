/**
 * 골프 홈 '전국 골프장' 카드 — 넷째 판(2026-10-05 오너: 세로 2배 시안 중 "C 로 하고").
 * 숫자와 점의 색은 실제 값에서만 나오고(0 인 줄은 없다), 카드 안에 링크가 겹치지 않고, 골프 화면 규칙(리터럴 색·12px)을 지킨다.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// vitest 설정엔 '@' 별칭이 없다 — courseLogo.test 와 같이 막아 둔다(훅·아이콘·윤곽선 자료는 셈 시험에 필요 없다)
vi.mock("@/lib/icons", () => ({ LucideArrowRight: () => null }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ member: undefined }) }));
vi.mock("../../../lib/courseApi", () => ({ useCourseList: () => ({ data: undefined }), useMyWatches: () => ({ data: undefined }) }));
vi.mock("./KoreaOutline", () => ({ KoreaOutline: () => null }));

import { homeEntryData, homeEntryStats } from "./CourseHomeEntry";

const row = (slug: string, counts: Partial<{ booking: number; join: number; urgent: number }> = {}, at: { lat: number | null; lng: number | null } = { lat: 37.4, lng: 127.1 }) =>
    ({ slug, ...at, counts: { booking: 0, join: 0, urgent: 0, ...counts } });

describe("homeEntryData — 점의 색과 글 수", () => {
    it("허브 지도와 같은 순서: 긴급 > 조인 > 부킹 > 내 관심, 아니면 흰 점", () => {
        const { dots } = homeEntryData([
            row("a", { urgent: 1, join: 1, booking: 2 }),
            row("b", { join: 2, booking: 1 }),
            row("c", { booking: 1 }),
            row("d"),
            row("e"),
            row("f", { join: 1 }),
        ], new Set(["d", "f"]));
        expect(dots.map((d) => [d.key, d.tone])).toEqual([["a", "urgent"], ["b", "join"], ["c", "booking"], ["d", "watch"], ["e", "on"], ["f", "join"]]);
    });

    it("좌표가 없는 골프장은 점은 없어도 글 수에는 들어간다", () => {
        const { dots, counts } = homeEntryData([row("a", { join: 2, urgent: 1 }), row("b", { booking: 3 }, { lat: null, lng: null })], new Set());
        expect(dots.map((d) => d.key)).toEqual(["a"]);
        expect(counts).toEqual({ booking: 3, join: 2, urgent: 1 });
    });

    it("비로그인(내 관심 없음) — 호박색 점이 하나도 없다", () => {
        const { dots } = homeEntryData([row("a"), row("b", { booking: 1 })], new Set());
        expect(dots.some((d) => d.tone === "watch")).toBe(false);
    });
});

describe("homeEntryStats — 숫자 줄", () => {
    it("긴급 · 조인 · 부킹 · 내 관심 순, 각 줄이 그 목록으로 간다", () => {
        expect(homeEntryStats({ urgent: 1, join: 3, booking: 2 }, 4).map((s) => [s.label, s.n, s.href])).toEqual([
            ["긴급", 1, "/golf/urgent"], ["조인", 3, "/golf/join"], ["부킹", 2, "/golf/booking"], ["내 관심", 4, "/golf/courses"],
        ]);
    });

    it("0 인 줄은 그리지 않는다 — 거짓 빈 값('긴급 0')을 보이지 않는다", () => {
        expect(homeEntryStats({ urgent: 0, join: 1, booking: 0 }, 0).map((s) => s.key)).toEqual(["join"]);
        expect(homeEntryStats({ urgent: 0, join: 0, booking: 0 }, 0)).toEqual([]);
    });
});

describe("화면 규칙(소스를 읽어 지킨다)", () => {
    const file = readFileSync(resolve(__dirname, "CourseHomeEntry.tsx"), "utf8");
    // 주석을 걷는다 — 머리말이 옛 판(onColor·bg-white)을 설명한다
    const code = file.replace(/\/\*[\s\S]*?\*\//g, "");
    const view = code.slice(code.indexOf("export function CourseHomeEntry"));

    it("a 안에 a 가 없다 — 바깥은 div, 전체 링크는 비어 있는 한 장", () => {
        expect(view).toMatch(/return \(\s*<div\b/);
        expect(view).toMatch(/<Link\s+href="\/golf\/courses"\s+aria-label="전국 골프장 보기"\s+className="absolute inset-0[^"]*"\s*\/>/);
        // 닫는 태그가 있는 Link 는 숫자 줄 하나뿐이고, 그 안에 또 Link 가 없다(비어 있는 전체 링크는 먼저 걷고 센다)
        const paired = view.replace(/<Link\b[^>]*\/>/g, "").match(/<Link\b[^]*?<\/Link>/g) ?? [];
        expect(paired).toHaveLength(1);
        expect(paired[0].slice(5)).not.toContain("<Link");
        expect(paired[0]).toContain("pointer-events-auto relative z-10");
    });

    it("세로 2배(384) · 어두운 바탕 지도(onColor 끔) · 윤곽선 · 숨 쉬는 점", () => {
        expect(view).toContain("min-h-[384px]");
        expect(view).not.toMatch(/\bonColor\b/);
        expect(view).toMatch(/<CourseDotMap[^]*?\bpulse\b[^]*?under=\{<KoreaOutline stroke="#FFFFFF33" \/>\}/);
        // 지도·글·화살표는 손가락을 비켜 준다 — 눌러도 전체 링크가 받는다
        expect(view.match(/pointer-events-none/g)!.length).toBeGreaterThanOrEqual(3);
    });

    it("리터럴 색만 — 골프 테마가 바꿔 끼우는 유틸(white·black)을 쓰지 않는다", () => {
        expect(code).not.toMatch(/\b(?:bg|text|border|ring|outline|from|via|to|fill|stroke)-(?:white|black)\b/);
    });

    it("글자는 12px 이상", () => {
        const sizes = [...code.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)].map((m) => Number(m[1]));
        expect(sizes.length).toBeGreaterThan(0);
        expect(Math.min(...sizes)).toBeGreaterThanOrEqual(12);
    });
});
