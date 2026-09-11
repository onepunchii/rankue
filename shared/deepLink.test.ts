import { describe, it, expect } from "vitest";
import { sanitizeInternalPath, deepLinkToPath, resumeTarget, RESUME_MAX_AGE_MS } from "./deepLink";

describe("sanitizeInternalPath", () => {
    it("내부 경로는 통과하고 쿼리·해시를 유지한다", () => {
        expect(sanitizeInternalPath("/")).toBe("/");
        expect(sanitizeInternalPath("/crew/12/chat")).toBe("/crew/12/chat");
        expect(sanitizeInternalPath("/online-game?match=abc&x=1#top")).toBe("/online-game?match=abc&x=1#top");
    });
    it("점 경로는 사이트 안으로 정규화된다", () => {
        expect(sanitizeInternalPath("/a/../b")).toBe("/b");
        expect(sanitizeInternalPath("/../../etc")).toBe("/etc");
    });
    it("프로토콜 상대·역슬래시·스킴·절대 URL 은 막는다", () => {
        expect(sanitizeInternalPath("//evil.com")).toBeNull();
        expect(sanitizeInternalPath("//evil.com/path")).toBeNull();
        expect(sanitizeInternalPath("/\\evil.com")).toBeNull();
        expect(sanitizeInternalPath("\\\\evil.com")).toBeNull();
        expect(sanitizeInternalPath("https://evil.com")).toBeNull();
        expect(sanitizeInternalPath("javascript:alert(1)")).toBeNull();
        expect(sanitizeInternalPath("club/1")).toBeNull();
    });
    it("제어문자·공백은 막는다 (URL 파서가 탭을 지워 '//' 가 되는 경우)", () => {
        expect(sanitizeInternalPath("/\t/evil.com")).toBeNull();
        expect(sanitizeInternalPath("/\n/evil.com")).toBeNull();
        expect(sanitizeInternalPath("/club 1")).toBeNull();
        expect(sanitizeInternalPath(" /club")).toBeNull();
    });
    it("문자열이 아니거나 비었거나 너무 길면 null", () => {
        expect(sanitizeInternalPath(undefined)).toBeNull();
        expect(sanitizeInternalPath(null)).toBeNull();
        expect(sanitizeInternalPath(42)).toBeNull();
        expect(sanitizeInternalPath("")).toBeNull();
        expect(sanitizeInternalPath("/" + "a".repeat(5000))).toBeNull();
    });
});

describe("deepLinkToPath", () => {
    it("www 와 apex https 링크", () => {
        expect(deepLinkToPath("https://www.rankue.co.kr/club/3?tab=board")).toBe("/club/3?tab=board");
        expect(deepLinkToPath("https://rankue.co.kr/r/abc")).toBe("/r/abc");
        expect(deepLinkToPath("https://WWW.RANKUE.CO.KR/store/x")).toBe("/store/x");
        expect(deepLinkToPath("https://www.rankue.co.kr")).toBe("/");
    });
    it("커스텀 스킴 rankue://open?path=", () => {
        expect(deepLinkToPath("rankue://open?path=%2Fcommunity%2F9")).toBe("/community/9");
        expect(deepLinkToPath("rankue://open/?path=/join/AB12")).toBe("/join/AB12");
        expect(deepLinkToPath("rankue://open?path=%2F%2Fevil.com")).toBeNull();
        expect(deepLinkToPath("rankue://open?path=https%3A%2F%2Fevil.com")).toBeNull();
        expect(deepLinkToPath("rankue://open")).toBeNull();
        expect(deepLinkToPath("rankue://other?path=/club")).toBeNull();
        expect(deepLinkToPath("rankue://opener?path=/club")).toBeNull();
        expect(deepLinkToPath("RANKUE://open?path=/club/2")).toBe("/club/2");
    });
    it("커스텀 스킴 경로 모양 rankue://open/<path> 도 같은 경로로", () => {
        expect(deepLinkToPath("rankue://open/club/1")).toBe("/club/1");
        expect(deepLinkToPath("rankue://open/online-game?match=m1#top")).toBe("/online-game?match=m1#top");
        expect(deepLinkToPath("rankue://open/#x")).toBeNull();
        expect(deepLinkToPath("rankue://open//evil.com")).toBeNull();
        expect(deepLinkToPath("rankue://open/\\evil.com")).toBeNull();
    });
    it("다른 호스트·스킴·http·포트·계정정보는 거절", () => {
        expect(deepLinkToPath("https://evil.com/club/1")).toBeNull();
        expect(deepLinkToPath("https://www.rankue.co.kr.evil.com/club")).toBeNull();
        expect(deepLinkToPath("http://www.rankue.co.kr/club")).toBeNull();
        expect(deepLinkToPath("https://www.rankue.co.kr:8443/club")).toBeNull();
        expect(deepLinkToPath("https://user:pw@www.rankue.co.kr/club")).toBeNull();
        expect(deepLinkToPath("com.googleusercontent.apps.123:/oauth2redirect?code=x")).toBeNull();
        expect(deepLinkToPath("not a url")).toBeNull();
        expect(deepLinkToPath(undefined)).toBeNull();
    });
});

describe("resumeTarget", () => {
    const now = 1_800_000_000_000;
    it("1시간 안의 내부 경로로 돌아간다", () => {
        expect(resumeTarget({ path: "/game/55", at: now - 5 * 60 * 1000 }, now)).toBe("/game/55");
        expect(resumeTarget({ path: "/online-game?match=m1", at: now - RESUME_MAX_AGE_MS }, now)).toBe("/online-game?match=m1");
    });
    it("오래됐거나 미래 시각이면 버린다", () => {
        expect(resumeTarget({ path: "/game/55", at: now - RESUME_MAX_AGE_MS - 1 }, now)).toBeNull();
        expect(resumeTarget({ path: "/game/55", at: now + 60_000 }, now)).toBeNull();
    });
    it("형식이 깨졌거나 외부 경로면 버린다", () => {
        expect(resumeTarget(null, now)).toBeNull();
        expect(resumeTarget({}, now)).toBeNull();
        expect(resumeTarget({ path: "/game/55", at: "123" }, now)).toBeNull();
        expect(resumeTarget({ path: "//evil.com", at: now }, now)).toBeNull();
        expect(resumeTarget({ path: 7, at: now }, now)).toBeNull();
    });
    it("복귀 표식이 남은 주소로는 돌아가지 않는다(고리 방지)", () => {
        expect(resumeTarget({ path: "/?resume=1", at: now }, now)).toBeNull();
        expect(resumeTarget({ path: "/dashboard?a=1&resume=1", at: now }, now)).toBeNull();
        expect(resumeTarget({ path: "/dashboard?resume=10", at: now }, now)).toBe("/dashboard?resume=10");
    });
});
