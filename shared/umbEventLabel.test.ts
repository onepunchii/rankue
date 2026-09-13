import { describe, it, expect } from "vitest";
import { parseEventLabel, titleCase } from "./umbEventLabel";

describe("parseEventLabel — 실측 라벨 형식(2026-09)", () => {
    it("월드컵: 주최·도시·국가·날짜", () => {
        expect(parseEventLabel("UMB / CEB World Cup - ANTWERP (BE) 2025-10-12")).toEqual({
            kind: "worldcup", org: "CEB", city: "Antwerp", country: "BE", date: "2025-10-12", season: null,
        });
    });

    it("월드컵: 여러 단어 도시는 단어마다 첫 글자만 대문자", () => {
        const p = parseEventLabel("UMB / ACBC World Cup - HO CHI MINH CITY (VN) 2026-05-24");
        expect(p.kind).toBe("worldcup");
        expect(p.org).toBe("ACBC");
        expect(p.city).toBe("Ho Chi Minh City");
        expect(p.country).toBe("VN");
        expect(p.date).toBe("2026-05-24");
    });

    it("세계선수권(남자): 날짜는 마지막 날, 도시는 맨 뒤 조각", () => {
        expect(parseEventLabel("UMB World Championship - 14/18 Oct. 2025 - ANTWERP (BE)")).toEqual({
            kind: "worldchamp", org: "UMB", city: "Antwerp", country: "BE", date: "2025-10-18", season: null,
        });
    });

    it("세계선수권(주니어): 복수형 + 'Sep.2025' 처럼 붙어 쓴 날짜", () => {
        const p = parseEventLabel("UMB World Championships 2025 - 26/28 Sep.2025 - MURCIA (ES)");
        expect(p.kind).toBe("worldchamp");
        expect(p.city).toBe("Murcia");
        expect(p.country).toBe("ES");
        expect(p.date).toBe("2025-09-28");
    });

    it("대륙·국가선수권: 시즌만", () => {
        expect(parseEventLabel("Confederal Championships")).toMatchObject({ kind: "confederal", season: null, city: null });
        expect(parseEventLabel("Confederal Championships 2024 / 2025 / 2026")).toMatchObject({ kind: "confederal", season: "2024/26" });
        expect(parseEventLabel("National Championships 2025 / 2026")).toMatchObject({ kind: "national", season: "2025/26" });
    });

    it("모르는 형식·빈 문자열은 other — 정보를 잃지 않는다(화면이 원문을 쓴다)", () => {
        expect(parseEventLabel("Some Invitational 2026").kind).toBe("other");
        expect(parseEventLabel("").kind).toBe("other");
    });

    it("titleCase", () => {
        expect(titleCase("SHARM EL SHEIKH")).toBe("Sharm El Sheikh");
        expect(titleCase("  bogota ")).toBe("Bogota");
    });
});
