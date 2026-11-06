/**
 * 위치 켜는 방법(2026-11-06) — 기기 · 까닭마다 맞는 순서와 단추. 화면은 이 결과를 그대로 그린다(client/src/hiking/components/LocationHelp).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { inAppName, kakaoExternalUrl, locationHelp, webBrowser } from "./locationHelp";

const UA = {
    kakaoIos: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.9.0",
    kakaoAndroid: "Mozilla/5.0 (Linux; Android 14; SM-S921N Build/UP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0 Mobile Safari/537.36 KAKAOTALK/10.9.0",
    naverIos: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 NAVER(inapp; search; 2000; 12.10.0)",
    safariIos: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
    chromeIos: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0 Mobile/15E148 Safari/604.1",
    chromeAndroid: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36",
    samsung: "Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0 Mobile Safari/537.36",
};

describe("어디서 열렸나", () => {
    it("앱 안 브라우저의 이름 — 설정에서 찾을 이름", () => {
        expect(inAppName(UA.kakaoIos)).toBe("카카오톡");
        expect(inAppName(UA.kakaoAndroid)).toBe("카카오톡");
        expect(inAppName(UA.naverIos)).toBe("네이버");
        expect(inAppName(UA.safariIos)).toBeNull();
    });
    it("보통 브라우저", () => {
        expect(webBrowser(UA.safariIos)).toBe("safari");
        expect(webBrowser(UA.chromeIos)).toBe("chrome");
        expect(webBrowser(UA.chromeAndroid)).toBe("chrome");
        expect(webBrowser(UA.samsung)).toBe("samsung");
    });
    it("카카오톡의 기본 브라우저로 열기 주소", () => {
        expect(kakaoExternalUrl("https://www.rankue.co.kr/hiking/m/bukhansan?a=1")).toBe("kakaotalk://web/openExternal?url=https%3A%2F%2Fwww.rankue.co.kr%2Fhiking%2Fm%2Fbukhansan%3Fa%3D1");
    });
});

describe("위치 권한이 꺼졌을 때", () => {
    it("랭큐 앱 — 설정 열기 단추, 옛 앱이면 설정에서 찾는 길", () => {
        const ios = locationHelp({ client: "app", os: "ios", trouble: "denied" });
        expect(ios.action).toBe("settings");
        expect(ios.steps[0]).toBe("아래 '설정 열기'를 눌러 주세요.");
        expect(ios.steps[1]).toContain("'앱을 사용하는 동안'");
        const old = locationHelp({ client: "app", os: "android", trouble: "denied", canOpenSettings: false });
        expect(old.action).toBeNull();
        expect(old.steps[0]).toBe("폰 설정 › 애플리케이션 › 랭큐로 가 주세요.");
    });
    it("카카오톡 안 — 카카오톡의 위치 권한 + 브라우저로 열기", () => {
        const h = locationHelp({ client: "inapp", os: "ios", trouble: "denied", ua: UA.kakaoIos });
        expect(h.title).toBe("카카오톡 안에서 열린 화면이에요");
        expect(h.steps[0]).toBe("아이폰 설정 › 카카오톡 › 위치 › '앱을 사용하는 동안'을 골라 주세요.");
        // 받침 있는 이름 + 으로
        expect(h.steps[1].startsWith("카카오톡으로 돌아와")).toBe(true);
        expect(h.action).toBe("kakao-external");
    });
    it("네이버 안 — 단추 없이 ⋯ 메뉴 안내, 받침 없는 이름 + 로", () => {
        const h = locationHelp({ client: "inapp", os: "android", trouble: "denied", ua: UA.naverIos });
        expect(h.action).toBeNull();
        expect(h.steps[0]).toContain("폰 설정 › 애플리케이션 › 네이버 › 권한 › 위치");
        expect(h.steps[1].startsWith("네이버로 돌아와")).toBe(true);
        expect(h.note).toContain("다른 브라우저로 열기");
    });
    it("보통 브라우저 — 브라우저마다 켜는 곳", () => {
        expect(locationHelp({ client: "web", os: "ios", trouble: "denied", ua: UA.safariIos }).steps[0]).toContain("'가가' › 웹 사이트 설정 › 위치");
        expect(locationHelp({ client: "web", os: "ios", trouble: "denied", ua: UA.chromeIos }).steps[0]).toContain("아이폰 설정 › Chrome › 위치");
        expect(locationHelp({ client: "web", os: "android", trouble: "denied", ua: UA.chromeAndroid }).steps[1]).toContain("위치 › '허용'");
        expect(locationHelp({ client: "web", os: "desktop", trouble: "denied" }).steps[0]).toContain("자물쇠");
    });
});

describe("위치를 못 잡았을 때", () => {
    it("폰의 위치 켜기 + 하늘이 트인 곳, 카카오톡 안이면 브라우저로 열기", () => {
        const a = locationHelp({ client: "app", os: "android", trouble: "unavailable" });
        expect(a.title).toBe("위치를 잡지 못했어요");
        expect(a.steps[0]).toContain("'위치'를 켜");
        expect(a.action).toBeNull();
        const k = locationHelp({ client: "inapp", os: "ios", trouble: "unavailable", ua: UA.kakaoIos });
        expect(k.steps[0]).toContain("위치 서비스를 켜");
        expect(k.action).toBe("kakao-external");
        expect(k.note).toContain("카카오톡 안에서는");
    });
});

describe("고정: 화면이 이 안내를 쓰는 곳", () => {
    const read = (f: string) => readFileSync(resolve(__dirname, "..", f), "utf8");
    it("정상 인증 · 코스 도장 · 산행 · 산 화면", () => {
        expect(read("client/src/hiking/stamps/SummitCheckin.tsx")).toContain("{msg?.trouble && !(helpShown && msg.trouble === \"denied\") && <LocationHelpButton trouble={msg.trouble}");
        expect(read("client/src/hiking/trails/TrailStamp.tsx")).toContain("{msg?.trouble && <LocationHelpButton trouble={msg.trouble}");
        const trail = read("client/src/hiking/pages/TrailPage.tsx");
        expect(trail).toContain('data-testid="trail-location-off"');
        expect(trail).toContain('{active && trail.phase === "denied" && <LocationHelpButton');
        expect(read("client/src/hiking/pages/MountainPage.tsx")).toContain('data-testid="mountain-location-off"');
        // 미리 보는 확인은 권한 창을 띄우지 않는다(묻지 않고 본다)
        const hook = read("client/src/hiking/components/LocationHelp.tsx");
        expect(hook).toContain("void locationPermission().then((st) => { if (alive) setBlocked(st === \"denied\"); });");
        expect(hook).not.toMatch(/getDevicePosition\(\{\s*prompt:\s*true/);
    });
});
