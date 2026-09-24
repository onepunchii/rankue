import { describe, expect, it } from "vitest";
import { BRIEFING_HUB_TITLE, briefingDesc, briefingLineKo, briefingTitle, josa, todayKst } from "./briefingMeta.js";

describe("josa — 받침으로 조사 고르기", () => {
    it("한글", () => {
        expect(josa("프레데리크 쿠드롱", "와/과")).toBe("프레데리크 쿠드롱과");
        expect(josa("딕 야스퍼스", "와/과")).toBe("딕 야스퍼스와");
        expect(josa("조명우", "이/가")).toBe("조명우가");
        expect(josa("김행직", "이/가")).toBe("김행직이");
        expect(josa("조명우", "을/를")).toBe("조명우를");
        expect(josa("허정한", "은/는")).toBe("허정한은");
        expect(josa("서울", "로/으로")).toBe("서울로");
        expect(josa("부산", "로/으로")).toBe("부산으로");
    });
    it("숫자·로마자·괄호 꼬리", () => {
        expect(josa("3", "와/과")).toBe("3과");
        expect(josa("2", "와/과")).toBe("2와");
        expect(josa("CAUDRON Frederic", "와/과")).toBe("CAUDRON Frederic와");
        expect(josa("KANG Michael", "와/과")).toBe("KANG Michael과");
        expect(josa("조명우 (CHO Myung Woo)", "와/과")).toBe("조명우 (CHO Myung Woo)와");
    });
});

describe("브리핑 문구", () => {
    const gap = { type: "gap" as const, name: "CHO Myung Woo", nativeName: "조명우", playerUmbId: "0364", rivalName: "CAUDRON Frederic", rivalNativeName: "프레데리크 쿠드롱", gap: 127 };
    it("2위 이름 뒤 조사 — '쿠드롱와'가 아니라 '쿠드롱과'", () => {
        expect(briefingLineKo(gap)).toBe("1위 조명우, 2위 프레데리크 쿠드롱과 127점 차");
        expect(briefingDesc(gap, "2026-09-20")).toBe("2026년 9월 20일 당구 브리핑: 1위 조명우, 2위 프레데리크 쿠드롱과 127점 차. UMB 공식 3쿠션 세계랭킹 데이터로 매일 갱신.");
    });
    it("오늘(대표 페이지)은 날짜 없는 제목, 지난 날짜는 날짜를 단다", () => {
        expect(briefingTitle(todayKst())).toBe(BRIEFING_HUB_TITLE);
        expect(BRIEFING_HUB_TITLE).not.toMatch(/\d{4}년/);
        expect(briefingTitle("2026-09-20")).toBe("당구 브리핑 2026년 9월 20일 · UMB 세계랭킹 | 랭큐");
        expect(briefingTitle("2026-09-20", true)).toBe(BRIEFING_HUB_TITLE);
    });
});
