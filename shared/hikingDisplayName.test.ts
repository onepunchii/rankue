import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { hikingDisplayName, mountainPlace, sigunguText } from "./hikingMountains";

/** 산 이름에서 정상 표지 설명 떼기(2026-10-19 — '검마산(정상안내판)' 페이지가 검색으로 들어오고 있었다) */
describe("산 이름 — 표지 설명은 떼고 다른 이름은 남긴다", () => {
    it("표지 설명", () => {
        expect(hikingDisplayName("검마산(정상안내판)")).toBe("검마산");
        expect(hikingDisplayName("내대암봉(삼각점)")).toBe("내대암봉");
        expect(hikingDisplayName("화산(종이표지)")).toBe("화산");
    });
    it("다른 이름 · 보통 이름은 그대로", () => {
        expect(hikingDisplayName("금정봉(쇠미산)")).toBe("금정봉(쇠미산)");
        expect(hikingDisplayName("대륙봉(평평바위)")).toBe("대륙봉(평평바위)");
        expect(hikingDisplayName("한라산")).toBe("한라산");
    });
    it("산 요약이 이 함수를 거친다(페이지 · 사이트맵 · 카드가 같은 이름)", () => {
        const s = readFileSync(resolve(__dirname, "..", "server/storage/hiking.ts"), "utf8");
        expect(s).toContain("name: hikingDisplayName(r.name)");
    });
});

describe("시군구 띄어 쓰기(2026-10-19 — '전북 전주시완산구')", () => {
    it("시 + 구/군만 띄우고 나머지는 그대로", () => {
        expect(sigunguText("전주시완산구")).toBe("전주시 완산구");
        expect(sigunguText("창원시마산합포구")).toBe("창원시 마산합포구");
        expect(sigunguText("고양시일산동구")).toBe("고양시 일산동구");
        expect(sigunguText("시흥시")).toBe("시흥시");
        expect(sigunguText("양평군")).toBe("양평군");
        expect(sigunguText("중구")).toBe("중구");
        expect(sigunguText("창원시 마산합포구")).toBe("창원시 마산합포구");
        expect(mountainPlace({ sido: "전북특별자치도", sigungu: "전주시완산구" })).toBe("전북 전주시 완산구");
    });
});
