import { describe, expect, it } from "vitest";
import { makeStampResolver } from "./golfStamps";

const clubs = [
    { id: "c1", name: "동강시스타 CC", region: "강원", address: null },
    { id: "c2", name: "H1", region: "경기남부", address: null },
    { id: "c3", name: "h1", region: "경기", address: null }, // 같은 이름(대소문자만 다름) — 먼저 나온 c2 가 이긴다
];

describe("makeStampResolver — 여권·발자국 공용 도장 규칙", () => {
    const resolve = makeStampResolver(clubs);

    it("골프장 번호가 먼저", () => {
        expect(resolve({ golfClubId: "c1", locationName: "엉뚱한 이름" })?.key).toBe("c1");
    });
    it("번호가 없거나 모르면 이름(공백·대소문자 무시)으로", () => {
        expect(resolve({ golfClubId: null, locationName: "동강 시스타cc" })?.club?.id).toBe("c1");
        expect(resolve({ golfClubId: "zzz", locationName: "H 1" })?.club?.id).toBe("c2");
    });
    it("원장에 없는 이름은 이름 도장(name:)으로 남는다", () => {
        const hit = resolve({ golfClubId: null, locationName: "옛날 골프장" });
        expect(hit?.key).toBe("name:옛날골프장");
        expect(hit?.club).toBeNull();
        expect(hit?.name).toBe("옛날 골프장");
    });
    it("골프장을 모르는 기록은 도장이 아니다", () => {
        expect(resolve({ golfClubId: null, locationName: null })).toBeNull();
        expect(resolve({ golfClubId: null, locationName: "알 수 없는 구장" })).toBeNull();
    });
});
