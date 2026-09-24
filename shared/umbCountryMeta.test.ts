import { describe, expect, it } from "vitest";
import { countryDescription, moversDescription, type UmbCountrySection, type UmbMoveRow, type UmbMoversSection } from "./umbCountryMeta.js";

const row = (nativeName: string | null, playerName: string, rank: number, move = 0): UmbMoveRow =>
    ({ playerUmbId: playerName, playerName, nativeName, fed: "KR", rank, prevRank: rank + move, move, points: 100, prevPoints: 100 });

describe("국가·순위 변동 설명 — 숫자 먼저, 100자 안팎(2026-09-24)", () => {
    const men: UmbCountrySection = {
        category: "players", edition: "22/2026", date: "2026-09-06", prevEdition: "21/2026", prevDate: "2026-08-30", worldTotal: 1400,
        nationRank: 1, nationCount: 57, top5Points: 1500, total: 330, top100: 10, top300: 40,
        rows: [row("조명우", "CHO Myung Woo", 1)], risers: [], fallers: [], newCount: 3,
    };
    it("국가 페이지 — 국가 순위·등재 인원·최고 선수, 셈법 괄호 없이", () => {
        const d = countryDescription({ fed: "KR", nations: [], sections: [men, { ...men, category: "ladies", total: 20 }] });
        // 국가 순위는 남자 부문 셈 — '남자'가 순위 앞에
        expect(d).toBe("대한민국 3쿠션 남자 국가 순위 1위 — 330명 등재, 최고 조명우 1위, 톱 100에 10명. 여자 20명. UMB 2026년 9월 6일 회차 기준.");
        expect(d).not.toContain("합산");
        expect(d.length).toBeLessThanOrEqual(100);
    });
    it("순위 변동 — 한국 선수 숫자가 앞에", () => {
        const mv: UmbMoversSection = {
            category: "players", edition: "22/2026", date: "2026-09-06", prevEdition: "21/2026", prevDate: "2026-08-30",
            total: 1400, changed: 1353, up: 600, down: 700, same: 47, newCount: 12, outCount: 5,
            risers: [{ ...row(null, "CHRISTOFORIDIS Nikos", 294, 496), fed: "GR" }], fallers: [], entries: [], dropouts: [],
            kr: { total: 90, up: 33, down: 52, same: 5, newCount: 0, outCount: 0, rows: [] },
        };
        const d = moversDescription({ sections: [mv] });
        // 긴 로마자 이름이면 100자를 넘어 최대 상승 문장을 뺀다(본문 목록 맨 위에 있다)
        expect(d).toBe("UMB 3쿠션 남자 세계랭킹 2026년 9월 6일 회차 — 한국 선수 33명 상승·52명 하락, 전체 1,353명 변동.");
        expect(d.indexOf("한국 선수")).toBeLessThan(40);
        const ko = moversDescription({ sections: [{ ...mv, risers: [row("김행직", "KIM Haeng Jik", 12, 5)] }] });
        expect(ko).toBe("UMB 3쿠션 남자 세계랭킹 2026년 9월 6일 회차 — 한국 선수 33명 상승·52명 하락, 전체 1,353명 변동. 300위 안 최대 상승 김행직 ▲5(12위).");
        expect(ko.length).toBeLessThanOrEqual(100);
    });
});
