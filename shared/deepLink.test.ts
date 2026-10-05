import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sanitizeInternalPath, deepLinkToPath, handledLinkKey, isAppSchemeLink, openedAppLink, resumeTarget, RESUME_MAX_AGE_MS } from "./deepLink";
import { handoffAppUrl, handoffIntentUrl } from "./loginHandoff";

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

/**
 * 2026-10-06 검토 — '앱에서 열기' 토큰(?handoff=)이 든 링크를 남에게 보내면 받은 사람이 보낸 사람의 계정으로 로그인됐다.
 * 앱은 토큰을 경로에서 떼고, **커스텀 스킴으로 온 것만** 받는 쪽에 건넨다. 아래 토큰은 시험용으로 지어낸 글자다.
 */
describe("openedAppLink — 앱을 연 주소에서 경로와 '앱에서 열기' 토큰을 가른다", () => {
    const TOKEN = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_AbCdE";

    it("웹의 '앱에서 열기'가 만드는 주소(rankue://open?path=…): 토큰을 건네고, 경로에서는 뗀다", () => {
        expect(openedAppLink(handoffAppUrl(TOKEN))).toEqual({ path: "/dashboard", handoff: TOKEN });
        // 안드로이드 intent 주소도 앱에는 같은 모양으로 온다
        const delivered = handoffIntentUrl(TOKEN).replace(/^intent:\/\//, "rankue://").replace(/#Intent;.*$/, "");
        expect(openedAppLink(delivered)).toEqual({ path: "/dashboard", handoff: TOKEN });
        // 다른 질의는 그대로 둔다
        expect(openedAppLink(`rankue://open?path=${encodeURIComponent(`/golf/booking-list?pin=123456&handoff=${TOKEN}`)}`))
            .toEqual({ path: "/golf/booking-list?pin=123456", handoff: TOKEN });
    });

    it("https 앱 링크에 실린 토큰은 버린다 — 메신저가 링크로 만들어 주는 주소로는 로그인되지 않는다. 경로에서는 그래도 뗀다", () => {
        for (const url of [
            `https://www.rankue.co.kr/dashboard?handoff=${TOKEN}`,
            `https://rankue.co.kr/community/5?handoff=${TOKEN}`,
            `https://www.rankue.co.kr/dashboard?a=1&handoff=${TOKEN}#top`,
        ]) {
            const out = openedAppLink(url);
            expect(out.handoff, url).toBeNull();
            expect(out.path, url).not.toContain(TOKEN);
            expect(out.path, url).not.toMatch(/handoff/);
        }
        expect(openedAppLink(`https://www.rankue.co.kr/dashboard?a=1&handoff=${TOKEN}#top`).path).toBe("/dashboard?a=1#top");
    });

    it("꼴이 틀린 토큰은 건네지 않는다(주소에서는 뗀다). 토큰이 없는 링크는 예전 그대로", () => {
        expect(openedAppLink(`rankue://open?path=${encodeURIComponent("/dashboard?handoff=nope")}`)).toEqual({ path: "/dashboard", handoff: null });
        expect(openedAppLink("rankue://open?path=%2Fcommunity%2F9")).toEqual({ path: "/community/9", handoff: null });
        expect(openedAppLink("https://www.rankue.co.kr/club/3?tab=board")).toEqual({ path: "/club/3?tab=board", handoff: null });
        // 우리 주소가 아니면 건드리지 않는다
        expect(openedAppLink("com.googleusercontent.apps.123:/oauth2redirect?code=x")).toEqual({ path: null, handoff: null });
        expect(openedAppLink(`https://evil.example/dashboard?handoff=${TOKEN}`)).toEqual({ path: null, handoff: null });
        expect(openedAppLink(undefined)).toEqual({ path: null, handoff: null });
    });

    it("커스텀 스킴인지는 주소 머리로만 본다", () => {
        expect(isAppSchemeLink(handoffAppUrl(TOKEN))).toBe(true);
        expect(isAppSchemeLink("RANKUE://open/club/1")).toBe(true);
        expect(isAppSchemeLink("rankue://opener?path=/club")).toBe(false);
        expect(isAppSchemeLink(`https://www.rankue.co.kr/?x=rankue://open?path=%2Fdashboard%3Fhandoff%3D${TOKEN}`)).toBe(false);
        expect(isAppSchemeLink(null)).toBe(false);
    });

    it("앱(nativeBridge)이 이 함수로 주소를 풀고, 토큰 없는 경로로만 옮긴다", () => {
        const bridge = readFileSync(resolve(__dirname, "../client/src/lib/nativeBridge.ts"), "utf8");
        expect(bridge).toContain("const { path, handoff } = openedAppLink(url);");
        expect(bridge).toContain("navigateInApp(path, replace);");
        // 주소를 푸는 길은 이것 하나다(토큰이 든 경로를 그대로 라우터에 넘기는 옛 길이 남아 있지 않다)
        expect(bridge).not.toContain("deepLinkToPath");
    });
});

/**
 * 2026-10-06 검토 — 처리한 딥링크를 sessionStorage 에 **원문 그대로** 적고 있었다. '앱에서 열기' 주소에는 토큰이 실려 있어,
 * 받는 쪽이 쓰지 않고 버린 토큰(만료까지 살아 있다)이 앱 세션 내내 저장소에 남았다. 이제 적는 것은 단방향 키다.
 */
describe("handledLinkKey — 처리한 링크를 적어 둘 때의 키", () => {
    const TOKEN = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_AbCdE";
    const OTHER = "zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz";

    it("키에는 토큰도 주소의 다른 글자도 남지 않는다", () => {
        const key = handledLinkKey(handoffAppUrl(TOKEN));
        expect(key).not.toContain(TOKEN);
        // 토큰의 조각(8자 이상)도 없다
        for (let i = 0; i + 8 <= TOKEN.length; i++) expect(key).not.toContain(TOKEN.slice(i, i + 8));
        expect(key).not.toMatch(/handoff|dashboard|rankue|path/i);
        expect(key).toMatch(/^k[0-9a-z]+\.[0-9a-z]+$/);
        expect(key.length).toBeLessThan(20);
        // 초대 핀이 든 주소도 마찬가지다
        expect(handledLinkKey("https://www.rankue.co.kr/golf/booking-list?pin=123456")).not.toContain("123456");
    });

    it("같은 주소는 같은 키, 다른 주소는 다른 키 — 같은 링크인지 견주는 데 쓴다", () => {
        expect(handledLinkKey(handoffAppUrl(TOKEN))).toBe(handledLinkKey(handoffAppUrl(TOKEN)));
        expect(handledLinkKey(handoffAppUrl(TOKEN))).not.toBe(handledLinkKey(handoffAppUrl(OTHER)));
        const urls = [
            "https://www.rankue.co.kr/club/1", "https://www.rankue.co.kr/club/2", "https://www.rankue.co.kr/club/12",
            "rankue://open?path=%2Fclub%2F1", "rankue://open/club/1", "https://rankue.co.kr/club/1", "", "a", "b",
            ...Array.from({ length: 200 }, (_, i) => `https://www.rankue.co.kr/r/${i}`),
        ];
        expect(new Set(urls.map(handledLinkKey)).size).toBe(urls.length);
    });

    it("앱(nativeBridge)은 원문이 아니라 키를 적고 키로 견준다", () => {
        const bridge = readFileSync(resolve(__dirname, "../client/src/lib/nativeBridge.ts"), "utf8");
        const mark = bridge.slice(bridge.indexOf("function markLinkHandled(url: string): void {"), bridge.indexOf("function wasLinkHandled("));
        expect(mark).toContain("const key = handledLinkKey(url);");
        expect(mark).toContain("list.push(key);");
        // 원문을 목록에 넣지 않는다
        expect(mark).not.toMatch(/push\(url\)|=== url|!== url/);
        const was = bridge.slice(bridge.indexOf("function wasLinkHandled("), bridge.indexOf("let deliveredHandoff"));
        expect(was).toContain("list.includes(handledLinkKey(url))");
        expect(bridge).toContain("if (wasLinkHandled(url)) return;");
        // 저장소에 적는 곳은 markLinkHandled 하나다
        expect(bridge.match(/storageSet\("session", HANDLED_LINKS_KEY/g)).toHaveLength(1);
    });
});
