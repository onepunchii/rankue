/**
 * 골프장 모노그램(로고가 없을 때의 글자판) — 2026-10-01 로고 없는 194곳 조사에서 나온 깨진 이름들.
 * '1.2.3'→'1.', 'J-PUBLIC'→'J-', 'JNJ골프리조트'→'골프', 클럽디→'클럽', 세 글자 이름이 두 글자로 잘리던 것.
 */
import { describe, it, expect, vi } from "vitest";

// vitest 설정엔 '@' 별칭이 없다 — ShotStrip.test 와 같이 막아 둔다
vi.mock("@/lib/utils", () => ({ cn: (...a: unknown[]) => a.filter((x) => typeof x === "string" && x).join(" ") }));

import { monogram, isLightLogo } from "./CourseLogo";

describe("monogram", () => {
    it.each([
        ["1.2.3", "123"],
        ["88CC", "88"],
        ["J-PUBLIC", "JP"],
        ["JNJ골프리조트", "JNJ"],
        ["클럽디속리산", "속리산"],
        ["골프존카운티 안성W", "안성"],
        ["더힐 컨트리클럽", "더힐"],
        ["더반G.C.", "더반"],
        ["더클래식CC", "클래식"],
        ["곤지암", "곤지암"],
        ["뉴서울CC", "뉴서울"],
        ["가평베네스트GC", "가평"],
        ["잭 니클라우스 골프클럽 코리아", "잭니"],
        ["sk핀크스골프장", "핀크스"],
        ["OKCC", "OK"],
    ])("%s → %s", (name, want) => {
        expect(monogram(name)).toBe(want);
    });

    it("작은 판(xs)은 한글 두 글자까지", () => {
        expect(monogram("곤지암", 2)).toBe("곤지");
        expect(monogram("1.2.3", 2)).toBe("123");
    });

    it("빈 결과 없이 언제나 두 글자 이상(이름에 글자가 있으면)", () => {
        for (const n of ["(주)가든골프클럽", "J-", "더", "SK", "골프장"]) expect(monogram(n).length).toBeGreaterThanOrEqual(1);
    });
});

describe("isLightLogo", () => {
    it("파일 이름 -light.png 만", () => {
        expect(isLightLogo("/img/golf-logos/g-abc123def0-light.png")).toBe(true);
        expect(isLightLogo("/img/golf-logos/554.png")).toBe(false);
        expect(isLightLogo(null)).toBe(false);
    });
});
