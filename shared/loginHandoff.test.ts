import { describe, expect, it } from "vitest";
import {
    HANDOFF_ANDROID_PACKAGE, HANDOFF_ISSUE_MAX, HANDOFF_ISSUE_WINDOW_SEC, HANDOFF_LAND_PATH, HANDOFF_PARAM, HANDOFF_SCHEME,
    HANDOFF_TOKEN_LENGTH, HANDOFF_TTL_SEC,
    handoffAppUrl, handoffIntentUrl, handoffPath, isHandoffToken, takeHandoffFromUrl,
} from "./loginHandoff";
import { deepLinkToPath, openedAppLink, sanitizeInternalPath } from "./deepLink";

/**
 * '앱에서 열기'(2026-10-06 오너: "웹에서 로그인한 사람이 앱을 깔았을 때 다시 로그인하지 않고 그대로 이어 쓰게").
 * 주소 만들기 · 앱이 그 주소를 읽는 길(deepLinkToPath) · 받는 쪽이 토큰을 꺼내고 지우는 일. 아래 토큰은 전부 시험용으로 지어낸 글자다.
 */
const TOKEN = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_AbCdE"; // 43자, base64url 글자만
const OTHER = "zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz";

describe("숫자·이름", () => {
    it("토큰은 120초, 쿼리 이름은 handoff, 회원당 10분에 5번", () => {
        expect(HANDOFF_TTL_SEC).toBe(120);
        expect(HANDOFF_PARAM).toBe("handoff");
        expect(HANDOFF_ISSUE_MAX).toBe(5);
        expect(HANDOFF_ISSUE_WINDOW_SEC).toBe(600);
        expect(HANDOFF_LAND_PATH).toBe("/dashboard");
    });

    it("스킴·패키지는 앱에 등록된 값과 같다 — iOS Info.plist · AndroidManifest · build.gradle", async () => {
        const { readFileSync } = await import("node:fs");
        const { resolve } = await import("node:path");
        const root = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");
        expect(HANDOFF_SCHEME).toBe("rankue");
        expect(HANDOFF_ANDROID_PACKAGE).toBe("com.rankue.app");
        expect(root("android/app/build.gradle")).toContain(`applicationId "${HANDOFF_ANDROID_PACKAGE}"`);
        expect(root("android/app/src/main/AndroidManifest.xml")).toContain(`<data android:scheme="${HANDOFF_SCHEME}" android:host="open" />`);
        expect(root("ios/App/App/Info.plist")).toContain(`<string>${HANDOFF_SCHEME}</string>`);
    });
});

describe("isHandoffToken — 토큰 꼴(base64url 43자)", () => {
    it("난수 32바이트를 base64url 로 적은 꼴만 받는다", () => {
        expect(TOKEN).toHaveLength(HANDOFF_TOKEN_LENGTH);
        expect(isHandoffToken(TOKEN)).toBe(true);
        expect(isHandoffToken(OTHER)).toBe(true);
        // 진짜로 만든 값도 통과한다(서버가 만드는 방식 그대로)
        for (let i = 0; i < 20; i++) {
            const bytes = new Uint8Array(32);
            for (let j = 0; j < 32; j++) bytes[j] = (i * 37 + j * 101 + 7) % 256;
            expect(isHandoffToken(Buffer.from(bytes).toString("base64url"))).toBe(true);
        }
    });

    it("길이가 다르거나 다른 글자가 섞이면 거절한다", () => {
        expect(isHandoffToken(TOKEN.slice(1))).toBe(false);
        expect(isHandoffToken(TOKEN + "A")).toBe(false);
        expect(isHandoffToken("")).toBe(false);
        // base64(표준)의 + / = , 공백·개행, 경로·쿼리 글자
        for (const bad of ["+", "/", "=", " ", "\n", "%", "&", "?", "#", ".", "한"]) {
            expect(isHandoffToken(TOKEN.slice(0, 42) + bad), JSON.stringify(bad)).toBe(false);
        }
        expect(isHandoffToken(TOKEN + "\n")).toBe(false);
    });

    it("글자가 아닌 값은 거절한다 — 본문에 배열·객체를 보내도", () => {
        for (const bad of [undefined, null, 42, true, [TOKEN], { token: TOKEN }, { length: 43 }]) {
            expect(isHandoffToken(bad)).toBe(false);
        }
    });
});

describe("앱을 여는 주소", () => {
    it("handoffAppUrl — rankue://open?path= 뒤에 경로를 통째로 한 번 감싼다", () => {
        expect(handoffPath(TOKEN)).toBe(`/dashboard?handoff=${TOKEN}`);
        expect(handoffAppUrl(TOKEN)).toBe(`rankue://open?path=${encodeURIComponent(`/dashboard?handoff=${TOKEN}`)}`);
        expect(handoffAppUrl(TOKEN)).toBe(`rankue://open?path=%2Fdashboard%3Fhandoff%3D${TOKEN}`);
        // 바깥 쿼리에는 path 하나뿐이다 — 토큰이 바깥으로 새어 나오면 deepLinkToPath 가 읽지 못한다
        expect(handoffAppUrl(TOKEN).split("?")).toHaveLength(2);
        expect(handoffAppUrl(TOKEN)).not.toContain("&");
    });

    it("handoffIntentUrl — 안드로이드는 패키지를 못 박는다(같은 스킴을 등록한 다른 앱이 받아 가지 못하게)", () => {
        const url = handoffIntentUrl(TOKEN);
        expect(url).toBe(`intent://open?path=%2Fdashboard%3Fhandoff%3D${TOKEN}#Intent;scheme=rankue;package=com.rankue.app;end`);
        expect(url.endsWith(";end")).toBe(true);
        // '#Intent' 앞에 '#' 이 또 있으면 안드로이드가 주소를 잘못 가른다
        expect(url.match(/#/g)).toHaveLength(1);
        // 앱이 받는 주소(intent → scheme://host?query)는 iOS 용 주소와 같다
        const delivered = url.replace(/^intent:\/\//, "rankue://").replace(/#Intent;.*$/, "");
        expect(delivered).toBe(handoffAppUrl(TOKEN));
    });

    // 과제에서 확인하라고 한 것: deepLinkToPath 가 쿼리를 떼어 버리면 토큰이 사라진다
    it("지금 앱이 쓰는 deepLinkToPath 가 이 주소를 '/dashboard?handoff=<토큰>' 으로 읽는다 — 쿼리가 살아남는다", () => {
        expect(deepLinkToPath(handoffAppUrl(TOKEN))).toBe(`/dashboard?handoff=${TOKEN}`);
        // 앱 안 이동(navigateInApp)이 한 번 더 거르는 sanitizeInternalPath 도 그대로 통과한다
        expect(sanitizeInternalPath(`/dashboard?handoff=${TOKEN}`)).toBe(`/dashboard?handoff=${TOKEN}`);
        // 2026-10-06 검토 뒤: 앱은 이 경로를 그대로 열지 않는다 — 토큰을 떼어 받는 쪽에 건네고, 토큰 없는 경로로 옮긴다(shared/deepLink openedAppLink)
        expect(openedAppLink(handoffAppUrl(TOKEN))).toEqual({ path: "/dashboard", handoff: TOKEN });
        expect(openedAppLink(`https://www.rankue.co.kr/dashboard?handoff=${TOKEN}`)).toEqual({ path: "/dashboard", handoff: null });
        // 그렇게 열린 주소에서 받는 쪽이 같은 토큰을 꺼낸다(만들기 → 앱 → 꺼내기 한 바퀴)
        const path = deepLinkToPath(handoffAppUrl(TOKEN))!;
        expect(takeHandoffFromUrl(`https://www.rankue.co.kr${path}`)).toEqual({ present: true, token: TOKEN, cleaned: "/dashboard" });
        // 서버가 만드는 모든 글자(-, _ 포함)가 감싸고 푸는 동안 바뀌지 않는다
        for (const t of [OTHER, "-".repeat(43), "_".repeat(43), "0123456789".repeat(4) + "-_A"]) {
            expect(isHandoffToken(t)).toBe(true);
            expect(takeHandoffFromUrl(deepLinkToPath(handoffAppUrl(t))!).token).toBe(t);
        }
    });

    it("경로를 감싸지 않은 주소는 쓰지 않는다 — 그러면 토큰이 바깥 쿼리가 되어 사라진다(왜 감싸는지의 증거)", () => {
        // rankue://open?path=/dashboard?handoff=T → 바깥 쿼리를 path 로만 읽는다. 우연히 통과하더라도 '&' 가 붙는 순간 깨진다
        expect(deepLinkToPath(`rankue://open?path=/dashboard&handoff=${TOKEN}`)).toBe("/dashboard");
    });
});

describe("takeHandoffFromUrl — 주소에서 토큰을 꺼내고, 지운 주소를 돌려준다", () => {
    it("전체 주소·경로 어느 쪽이든 받는다", () => {
        expect(takeHandoffFromUrl(`https://www.rankue.co.kr/dashboard?handoff=${TOKEN}`)).toEqual({ present: true, token: TOKEN, cleaned: "/dashboard" });
        expect(takeHandoffFromUrl(`/dashboard?handoff=${TOKEN}`)).toEqual({ present: true, token: TOKEN, cleaned: "/dashboard" });
        expect(takeHandoffFromUrl(`http://localhost:5177/dashboard?handoff=${TOKEN}`)).toEqual({ present: true, token: TOKEN, cleaned: "/dashboard" });
        // 경로가 없는 주소
        expect(takeHandoffFromUrl(`https://www.rankue.co.kr?handoff=${TOKEN}`)).toEqual({ present: true, token: TOKEN, cleaned: "/" });
    });

    it("다른 쿼리와 해시는 글자 그대로 남긴다 — handoff 만 뺀다", () => {
        expect(takeHandoffFromUrl(`/golf/booking-list?pin=123456&handoff=${TOKEN}&store=hiq#top`))
            .toEqual({ present: true, token: TOKEN, cleaned: "/golf/booking-list?pin=123456&store=hiq#top" });
        expect(takeHandoffFromUrl(`/dashboard?handoff=${TOKEN}&q=a%20b+c&redirect=%2Fclub%2F3`).cleaned).toBe("/dashboard?q=a%20b+c&redirect=%2Fclub%2F3");
        expect(takeHandoffFromUrl(`/dashboard?a=1&handoff=${TOKEN}`).cleaned).toBe("/dashboard?a=1");
        expect(takeHandoffFromUrl(`/dashboard?handoff=${TOKEN}#x?handoff=no`).cleaned).toBe("/dashboard#x?handoff=no");
    });

    it("지운 주소에는 토큰이 남지 않는다", () => {
        for (const href of [
            `/dashboard?handoff=${TOKEN}`,
            `/dashboard?handoff=${TOKEN}&handoff=${OTHER}`,
            `/dashboard?x=1&handoff=${TOKEN}&y=2&handoff=${OTHER}#h`,
            `/dashboard?%68andoff=${TOKEN}`,
        ]) {
            const out = takeHandoffFromUrl(href);
            expect(out.present, href).toBe(true);
            expect(out.cleaned, href).not.toContain(TOKEN);
            expect(out.cleaned, href).not.toContain(OTHER);
            expect(out.cleaned, href).not.toMatch(/handoff=/i);
            // 다시 넣어도 더 꺼낼 것이 없다
            expect(takeHandoffFromUrl(out.cleaned)).toEqual({ present: false, token: null, cleaned: out.cleaned });
        }
    });

    it("같은 이름이 여러 번 오면 첫 번째만 쓰고 전부 지운다", () => {
        expect(takeHandoffFromUrl(`/dashboard?handoff=${TOKEN}&handoff=${OTHER}`)).toEqual({ present: true, token: TOKEN, cleaned: "/dashboard" });
        // 첫 번째가 꼴이 틀리면 뒤의 것을 쓰지 않는다(무엇을 쓸지 고르게 두지 않는다)
        expect(takeHandoffFromUrl(`/dashboard?handoff=nope&handoff=${TOKEN}`)).toEqual({ present: true, token: null, cleaned: "/dashboard" });
    });

    it("꼴이 틀린 값도 '실려 있었다'로 본다 — 서버에 보내지는 않지만 주소에서는 지운다", () => {
        for (const bad of ["", "abc", TOKEN + "A", TOKEN.slice(1), `${TOKEN.slice(0, 42)}%2B`, "%E0%A4%A"]) {
            const out = takeHandoffFromUrl(`/dashboard?handoff=${bad}&a=1`);
            expect(out, bad).toEqual({ present: true, token: null, cleaned: "/dashboard?a=1" });
        }
        // 값 없이 이름만
        expect(takeHandoffFromUrl("/dashboard?handoff")).toEqual({ present: true, token: null, cleaned: "/dashboard" });
    });

    it("실려 있지 않으면 아무것도 하지 않는다 — 이름이 비슷한 쿼리·해시 안의 글자에 속지 않는다", () => {
        expect(takeHandoffFromUrl("/dashboard")).toEqual({ present: false, token: null, cleaned: "/dashboard" });
        expect(takeHandoffFromUrl("https://www.rankue.co.kr/")).toEqual({ present: false, token: null, cleaned: "/" });
        expect(takeHandoffFromUrl(`/dashboard?handoffs=${TOKEN}&xhandoff=${TOKEN}`).present).toBe(false);
        expect(takeHandoffFromUrl(`/dashboard?redirect=%2Fdashboard%3Fhandoff%3D${TOKEN}`).present).toBe(false);
        expect(takeHandoffFromUrl(`/dashboard#handoff=${TOKEN}`)).toEqual({ present: false, token: null, cleaned: `/dashboard#handoff=${TOKEN}` });
        expect(takeHandoffFromUrl(`/dashboard?a=1&b=2#h`).cleaned).toBe("/dashboard?a=1&b=2#h");
    });

    it("글자가 아닌 값이 와도 던지지 않는다", () => {
        for (const bad of [undefined, null, 42, {}, []]) {
            expect(takeHandoffFromUrl(bad)).toEqual({ present: false, token: null, cleaned: "/" });
        }
    });
});
