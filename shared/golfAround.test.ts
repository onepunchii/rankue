import { describe, it, expect } from "vitest";
import { NEARBY_MENUS, NEARBY_KINDS, menuChips, menuForBrief, nearbyMenu, nearbyQuery } from "./golfAround";
import { roundBrief } from "./golfRoundBrief";
import type { WxHour } from "./golfWeather";

// 메뉴 칩(이모지)과 '날씨가 고른 첫 칩'. 낱말은 실측으로 고른 것만 — 여기서는 꼴과 규칙을 붙든다.
const D = "20261006";
const SUN = { rise: "06:30", set: "18:08" };
const h = (hr: number, over: Partial<WxHour> = {}): WxHour => ({ t: `${D}${String(hr).padStart(2, "0")}`, tmp: 18, pop: 0, kind: "clear", wsd: 2, pcp: null, ...over });
const day = (f: (hr: number) => Partial<WxHour> = () => ({})) => Array.from({ length: 17 }, (_, i) => h(i + 5, f(i + 5)));
const pickAt = (tee: number, f?: (hr: number) => Partial<WxHour>) => menuForBrief(roundBrief(day(f), tee, SUN)!);

describe("메뉴 칩", () => {
    it("열쇠·낱말·이모지가 겹치지 않고, 낱말은 한글 두세 자", () => {
        expect(new Set(NEARBY_MENUS.map((m) => m.key)).size).toBe(NEARBY_MENUS.length);
        expect(new Set(NEARBY_MENUS.map((m) => m.word)).size).toBe(NEARBY_MENUS.length);
        expect(new Set(NEARBY_MENUS.map((m) => m.emoji)).size).toBe(NEARBY_MENUS.length);
        for (const m of NEARBY_MENUS) { expect(m.key).toMatch(/^[a-z]+$/); expect(m.word).toMatch(/^[가-힣]{2,3}$/); }
    });
    it("이모지는 2017년 이전 것만 — 오래된 안드로이드에 없는 것(2019년 이후: U+1F90C~, U+1FA70~)은 쓰지 않는다", () => {
        for (const m of NEARBY_MENUS) {
            for (const ch of m.emoji) {
                const cp = ch.codePointAt(0)!;
                if (cp === 0xfe0f) continue; // 그림 꼴 선택자
                expect(cp >= 0x1fa70 || [0x1f9ca, 0x1f9c6, 0x1f9c7, 0x1f9c8, 0x1f9c9, 0x1f9cb].includes(cp), `${m.word} ${cp.toString(16)}`).toBe(false);
            }
        }
    });
    it("검색어는 골프장 이름 + 근처 + 낱말", () => {
        expect(nearbyQuery("라비에벨CC", "haejang")).toBe("라비에벨CC 근처 해장국");
        expect(nearbyQuery("라비에벨CC", "hanwoo")).toBe("라비에벨CC 근처 한우");
        expect(nearbyMenu("kalguksu")).toMatchObject({ word: "칼국수", emoji: "🍜" });
        expect(NEARBY_KINDS).toHaveLength(NEARBY_MENUS.length);
    });
    it("실측에서 약했던 낱말은 싣지 않는다(국수·고기집·파전·아침식사·횟집)", () => {
        const words = NEARBY_MENUS.map((m) => m.word);
        for (const w of ["국수", "고기집", "파전", "아침식사", "횟집"]) expect(words).not.toContain(w);
    });
    it("냉면 칩은 여름이거나 골라져 있을 때만 깔린다", () => {
        const has = (cur: Parameters<typeof menuChips>[0], month: number) => menuChips(cur, month).some((m) => m.key === "naengmyeon");
        expect(has("food", 10)).toBe(false);
        expect(has("food", 1)).toBe(false);
        expect(has("food", 6)).toBe(true);
        expect(has("food", 8)).toBe(true);
        expect(has("naengmyeon", 10)).toBe(true);
        expect(menuChips("food", 10)).toHaveLength(NEARBY_MENUS.length - 1);
        expect(menuChips("food", 10)[0].key).toBe("food");
    });
});

describe("날씨가 고른 첫 칩 — 한 줄 평의 갈래를 따른다", () => {
    it("쌀쌀한 새벽 티 → 해장국", () => {
        expect(pickAt(7, (hr) => ({ tmp: hr < 9 ? 9 : 16 }))).toEqual({ kind: "haejang", line: "쌀쌀한 새벽 티, 뜨끈한 국물부터" });
    });
    it("쌀쌀한 날(낮 티) → 해장국, 말만 다르다", () => {
        expect(pickAt(12, () => ({ tmp: 8 }))).toEqual({ kind: "haejang", line: "쌀쌀한 날엔 뜨끈한 국물" });
    });
    it("영하 → 해장국(언 몸)", () => {
        expect(pickAt(7, (hr) => ({ tmp: hr < 9 ? -2 : 4 }))).toEqual({ kind: "haejang", line: "언 몸 녹이는 뜨끈한 국물" });
    });
    it("비 → 칼국수 · 눈 → 해장국", () => {
        expect(pickAt(7, (hr) => (hr === 9 ? { kind: "rain", pop: 70 } : {})).kind).toBe("kalguksu");
        expect(pickAt(7, (hr) => (hr === 9 ? { kind: "snow", pop: 70, tmp: -1 } : { tmp: 1 }))).toEqual({ kind: "haejang", line: "눈 오는 날엔 뜨끈한 국물" });
    });
    it("비 소식만(30~59%) → 칼국수", () => {
        expect(pickAt(12, () => ({ pop: 40 }))).toEqual({ kind: "kalguksu", line: "비 소식 있는 날엔 따뜻한 칼국수" });
    });
    it("강풍 → 칼국수 · 더위 → 냉면", () => {
        expect(pickAt(12, () => ({ wsd: 10 })).kind).toBe("kalguksu");
        expect(pickAt(12, () => ({ tmp: 32 }))).toEqual({ kind: "naengmyeon", line: "더운 날엔 시원한 냉면" });
    });
    it("라베 날씨 → 한우", () => {
        expect(pickAt(12)).toEqual({ kind: "hanwoo", line: "라베 날씨, 끝나고 고기 한 판" });
    });
    it("야간 라운드 → 맛집(치기 전에)", () => {
        expect(pickAt(17)).toEqual({ kind: "food", line: "야간 라운드, 치기 전에 든든하게" });
    });
    it("무난한 날 — 1부는 치기 전 한 그릇, 2부는 점심, 3부는 이른 저녁", () => {
        const mild = () => ({ wsd: 6 }); // 바람 5m/s 이상이면 '라베 날씨'가 아니라 '무난한 날씨'
        expect(pickAt(7, mild)).toEqual({ kind: "haejang", line: "티오프 전에 든든하게 한 그릇" });
        expect(pickAt(12, mild)).toEqual({ kind: "food", line: "점심 먹고 여유 있게 티오프" });
        expect(menuForBrief({ tone: "ok", teeHour: 16, minTmp: 18, pop: 0 })).toEqual({ kind: "food", line: "라운드 전에 이른 저녁" });
    });
    it("술을 권하는 말이 없다 — 다들 차를 몰고 온다", () => {
        const tones = ["good", "ok", "rain", "snow", "wind", "cold", "heat", "night"] as const;
        for (const tone of tones) for (const teeHour of [7, 12, 17]) for (const pop of [0, 40]) for (const minTmp of [-3, 12]) {
            expect(menuForBrief({ tone, teeHour, minTmp, pop }).line).not.toMatch(/한잔|한 잔|술|맥주|소주|막걸리/);
        }
    });
});
