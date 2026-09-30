import { describe, expect, it } from "vitest";
import { cleanCourseName, countEliteConquered, findEliteStamp } from "./elite60";

// Elite 60 — 화면과 여권 배너가 같은 판정을 쓴다. 넘기는 도장은 여권의 **인증 도장만**(기록 도장은 호출하는 쪽이 넘기지 않는다).
describe("elite60 — 정복 판정", () => {
    const courses = [
        { name: "삼성물산(주)안양컨트리클럽", isRankue60: true },
        { name: "트리니티 클럽", isRankue60: true },
        { name: "동네 골프장", isRankue60: false },
    ];

    it("이름은 공백·CC·컨트리클럽을 떼고 포함 관계까지 본다", () => {
        expect(cleanCourseName("안양 CC")).toBe("안양");
        expect(findEliteStamp("삼성물산(주)안양컨트리클럽", [{ name: "안양 CC" }])?.name).toBe("안양 CC");
    });

    it("Elite 60 목록 안에서만 센다", () => {
        expect(countEliteConquered(courses, [{ name: "안양 CC" }, { name: "동네 골프장" }])).toBe(1);
    });

    it("인증 도장이 없으면 0 — 기록 도장은 넘기지 않으므로 정복이 아니다", () => {
        const verified: { name: string }[] = [];
        expect(countEliteConquered(courses, verified)).toBe(0);
    });

    it("이름을 떼고 나니 빈 도장(예: 'CC')은 아무 골프장에도 붙지 않는다", () => {
        expect(findEliteStamp("트리니티 클럽", [{ name: "CC" }])).toBeUndefined();
    });
});
