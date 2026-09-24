import { describe, expect, it } from "vitest";
import { PBA_L10N, pbaLatestSeasonRank, pbaPlayerDescKo, pbaPlayerTitleKo, pbaPrizeText } from "./pbaMeta.js";

describe("PBA 선수 제목·설명(ko) — 화면·프리렌더 공용", () => {
    it("상금 글은 프리렌더 prizeStr 와 같은 꼴", () => {
        expect(pbaPrizeText(207_000_000)).toBe("2억 700만원");
        expect(pbaPrizeText(3_300_000)).toBe("330만원");
        expect(pbaPrizeText(207_000_000, "en")).toBe("2억 700만 KRW");
        expect(pbaPrizeText(null)).toBe("-");
    });
    it("최근 시즌 상금랭킹 — 순위 없는 시즌은 건너뛴다", () => {
        expect(pbaLatestSeasonRank([
            { season: 2024, prizeRank: 30 }, { season: 2025, prizeRank: 12 }, { season: 2026, prizeRank: null },
        ])).toEqual({ season: 2025, rank: 12 });
        expect(pbaLatestSeasonRank([])).toBeNull();
        expect(pbaLatestSeasonRank(undefined)).toBeNull();
    });
    it("통산 상금이 있으면 제목에 숫자 — 연봉이 아니라 '통산 상금'이라고 적는다", () => {
        expect(pbaPlayerTitleKo("모리 유스케", "PBA", pbaPrizeText(207_000_000))).toBe("모리 유스케 상금·연봉 — PBA 통산 상금 2억 700만원 | 랭큐");
        expect(pbaPlayerTitleKo("모리 유스케", "PBA", "-")).toBe("모리 유스케 상금·연봉 — PBA 프로당구 선수 | 랭큐");
        expect(pbaPlayerTitleKo("모리 유스케", "PBA")).toBe("모리 유스케 상금·연봉 — PBA 프로당구 선수 | 랭큐");
    });
    it("설명엔 시즌 순위가 들어가고, 모든 페이지에 붙던 연봉제 문장은 없다", () => {
        const d = pbaPlayerDescKo("양교천", "Kyo-cheon YANG", "PBA", pbaPrizeText(3_300_000), 1.332, 13, { season: 2025, rank: 88 });
        expect(d).toBe("양교천 (Kyo-cheon YANG) — PBA 통산 상금 330만원, 2025-26 시즌 상금랭킹 88위, 에버리지 1.332, 하이런 13.");
        expect(d).not.toContain("연봉제");
    });
    it("값이 없는 칸은 줄표 대신 뺀다 — 기록이 하나도 없으면 '프로당구 선수'", () => {
        expect(pbaPlayerDescKo("양교천", null, "PBA", "-", null, null)).toBe("양교천 — PBA 프로당구 선수.");
        expect(pbaPlayerDescKo("이재민1", "Jae-min Lee1", "PBA", "-", null, null, { season: 2019, rank: 101 }))
            .toBe("이재민1 (Jae-min Lee1) — PBA 2019-20 시즌 상금랭킹 101위.");
        // 프리렌더 현재 호출(시즌 순위 없이)과 같은 꼴
        expect(PBA_L10N.ko.playerDesc("모리 유스케", "Yusuke MORI", "PBA", pbaPrizeText(207_000_000), "1.491", 15))
            .toBe("모리 유스케 (Yusuke MORI) — PBA 통산 상금 2억 700만원, 에버리지 1.491, 하이런 15.");
    });
    it("프리렌더가 부르는 PBA_L10N.ko 는 화면과 같은 함수", () => {
        expect(PBA_L10N.ko.playerTitle).toBe(pbaPlayerTitleKo);
        expect(PBA_L10N.ko.playerDesc).toBe(pbaPlayerDescKo);
    });
});
