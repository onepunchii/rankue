import { describe, it, expect } from "vitest";
import { TREND_PRESETS, cleanTrendRequest, courseSuffixGroups, summarizeTrend, trendRange } from "./searchTrend";

const kst = (s: string) => Date.parse(`${s}+09:00`);

describe("trendRange — 조회 기간", () => {
    it("달 단위는 꽉 찬 달만(이번 달 제외) — 이번 달 며칠치가 마지막 칸을 꺼뜨리지 않게", () => {
        expect(trendRange(12, "month", kst("2026-10-05T13:00:00"))).toEqual({ startDate: "2025-10-01", endDate: "2026-09-30" });
        expect(trendRange(24, "month", kst("2026-01-01T00:30:00"))).toEqual({ startDate: "2024-01-01", endDate: "2025-12-31" });
        expect(trendRange(12, "month", kst("2026-03-31T23:59:00"))).toEqual({ startDate: "2025-03-01", endDate: "2026-02-28" });
    });
    it("주 단위는 어제까지", () => {
        expect(trendRange(12, "week", kst("2026-10-05T13:00:00"))).toEqual({ startDate: "2025-10-05", endDate: "2026-10-04" });
    });
    it("한국 날짜로 센다 — UTC 로는 전날이어도", () => {
        expect(trendRange(12, "month", kst("2026-10-01T03:00:00")).endDate).toBe("2026-09-30");
    });
});

describe("cleanTrendRequest — 입력 다듬기", () => {
    it("빈 묶음·겹친 검색어를 빼고 한도(묶음 5 · 검색어 20)에 맞춘다", () => {
        const r = cleanTrendRequest({
            groups: [
                { name: " 골프 조인 ", keywords: ["골프 조인", "골프조인", "골프 조인", " ", ""] },
                { name: "빈 묶음", keywords: [] },
                { name: "", keywords: ["당구장"] },
                ...Array.from({ length: 6 }, (_, i) => ({ name: `g${i}`, keywords: Array.from({ length: 30 }, (_, k) => `k${i}-${k}`) })),
            ],
            months: 24, unit: "week",
        })!;
        expect(r.groups).toHaveLength(5);
        expect(r.groups[0]).toEqual({ name: "골프 조인", keywords: ["골프 조인", "골프조인"] });
        expect(r.groups[1]).toEqual({ name: "당구장", keywords: ["당구장"] }); // 이름이 비면 첫 검색어
        expect(r.groups[2].keywords).toHaveLength(20);
        expect(r.months).toBe(24); expect(r.unit).toBe("week");
    });
    it("모르는 기간·단위는 기본값(1년 · 달)", () => {
        expect(cleanTrendRequest({ groups: [{ name: "a", keywords: ["a"] }], months: 7, unit: "day" })).toMatchObject({ months: 12, unit: "month" });
    });
    it("이름이 같은 묶음은 이름을 갈라 준다 — 응답에서 섞이지 않게", () => {
        const r = cleanTrendRequest({ groups: [{ name: "날씨", keywords: ["a"] }, { name: "날씨", keywords: ["b"] }] })!;
        expect(new Set(r.groups.map((g) => g.name)).size).toBe(2);
    });
    it("쓸 묶음이 없으면 null", () => {
        expect(cleanTrendRequest(null)).toBeNull();
        expect(cleanTrendRequest({ groups: "x" })).toBeNull();
        expect(cleanTrendRequest({ groups: [{ name: "a", keywords: [" "] }] })).toBeNull();
    });
});

describe("summarizeTrend — 평균·비중·정점", () => {
    const req = cleanTrendRequest({ groups: [{ name: "날씨", keywords: ["x 날씨"] }, { name: "맛집", keywords: ["x 맛집"] }, { name: "후기", keywords: ["x 후기"] }] })!;
    const month = (i: number) => `2025-${String(i + 1).padStart(2, "0")}-01`;
    const out = summarizeTrend([
        { title: "맛집", data: Array.from({ length: 12 }, (_, i) => ({ period: month(i), ratio: 30 })) },
        { title: "날씨", data: Array.from({ length: 12 }, (_, i) => ({ period: month(i), ratio: i === 6 ? 100 : 60 })) },
        { title: "후기", data: [{ period: month(3), ratio: 12 }] }, // 검색량이 0 인 달은 응답에 없다
    ], req);

    it("평균이 큰 순, 가장 큰 묶음이 100", () => {
        expect(out.map((g) => g.name)).toEqual(["날씨", "맛집", "후기"]);
        expect(out[0].share).toBe(100);
        expect(out[1].share).toBe(Math.round((30 / ((60 * 11 + 100) / 12)) * 100));
        expect(out[0].peak).toEqual({ period: "2025-07-01", ratio: 100 });
    });
    it("빠진 달은 0 으로 센다 — 드문 검색어가 한 달 값으로 부풀지 않게", () => {
        expect(out[2].avg).toBeCloseTo(1, 5); // 12 ÷ 12달, 12 ÷ 1달 이 아니다
        expect(out[2].share).toBe(2);
    });
    it("응답에 없는 묶음도 0 으로 남긴다", () => {
        const none = summarizeTrend([], req);
        expect(none).toHaveLength(3);
        expect(none.every((g) => g.avg === 0 && g.share === 0 && g.peak === null)).toBe(true);
    });
});

describe("묶음 만들기", () => {
    it("골프장 하나 → 붙여 찾는 말 다섯 묶음(띄어 쓴 꼴·붙여 쓴 꼴, 다른 이름도)", () => {
        const g = courseSuffixGroups("레이크사이드CC", ["레이크사이드"]);
        expect(g.map((x) => x.name)).toEqual(["날씨", "맛집", "그린피", "회원권", "예약·부킹"]);
        expect(g[0].keywords).toEqual(["레이크사이드CC 날씨", "레이크사이드CC날씨", "레이크사이드 날씨", "레이크사이드날씨"]);
        expect(g[2].keywords).toContain("레이크사이드CC 가격");
        expect(g.every((x) => x.keywords.length <= 20)).toBe(true);
    });
    it("미리 만든 묶음은 전부 한도 안이고 다듬어도 그대로다", () => {
        for (const p of TREND_PRESETS) {
            const r = cleanTrendRequest({ groups: p.groups })!;
            expect(r.groups).toEqual(p.groups);
            expect(p.groups.length).toBeLessThanOrEqual(5);
        }
    });
});
