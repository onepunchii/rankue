import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import ts from "typescript";
import { twMerge } from "tailwind-merge";
import { androidStoreUrl, iosStoreUrl, WEB_URL } from "./appLinks.js";
import { deepLinkToPath } from "./deepLink.js";
import { HANDOFF_TTL_SEC, handoffAppUrl, handoffIntentUrl } from "./loginHandoff.js";
import {
    EMPTY_RECORD, EMPTY_VISIT, INSTALL_QR_PATH, MANY_DISMISSALS, OPEN_CHECK_MS,
    PROMPT_MIN_PAGES, PROMPT_MIN_SECONDS, PROMPT_SETTLE_SECONDS, QUIET_AFTER_LOGIN_SECONDS,
    REST_AFTER_DISMISS_DAYS, REST_AFTER_MANY_DISMISSALS_DAYS, REST_AFTER_STORE_DAYS,
    handoffLaunchUrl, installDevice, installQrUrl, installSheetPlan, isInAppBrowser, isLoginScreenPath, isPromptBlockedPath,
    parsePromptRecord, parseVisit, recordAfterDismiss, recordAfterStoreClick, restUntil, serializePromptRecord,
    shouldPrompt, takeInstallFlag, visitAfterPath, visitAfterSecond,
    type InstallVisit, type PromptInput,
} from "./installPrompt.js";

/**
 * 앱 설치 팝업(2026-10-06).
 * 오너: "지금 웹 가입 사람이 많은데 웹으로 진입 시 기기에 따른 앱 설치 팝업창 잘 디자인해서 만들어줘. 지금 팝업보다 잘." · "앱에서 열기도."
 *
 * 지키는 것
 *  - 기기에 맞는 길 하나: 아이폰 App Store · 안드로이드 Google Play · PC 는 QR. 아이패드의 맥 UA 는 터치로 가른다.
 *  - 들어오자마자 띄우지 않는다(2화면 또는 20초 뒤), 닫으면 7일 · 세 번 닫으면 30일 · 스토어를 눌렀으면 14일 쉰다.
 *  - 앱 안 · 설치형 · 막는 주소(경기 중 · 게임 · 로그인/가입 · 바닥에 다른 줄이 있는 화면)에서는 안 뜬다. 가입 팝업과 겹치지 않는다.
 *  - '앱에서 열기'는 로그인한 사람(휴대폰)에게만, 눌렀을 때 받아 바로 연다.
 * 화면 코드(components/hiq/AppInstallSheet)의 시험이지만 shared 에 둔다 — vitest 가 client/src 에서는 sim · golf 만 읽는다. 소스를 읽어 검사한다.
 */
const ROOT = resolve(__dirname, "../client/src");
const client = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
/** 주석만 있는 줄을 뺀다 — 설명에 적힌 낱말이 검사를 통과시키거나 막지 않게 */
const code = (s: string) => s.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
const LOCALES = ["ko", "en", "es", "tr", "vi"] as const;
/** dir 아래의 화면 소스 전부(.ts·.tsx, 시험 제외) */
function allSources(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) return allSources(p);
        return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [p] : [];
    });
}
const dictValue = (locale: string, key: string) =>
    new RegExp(`"${key.replace(/\./g, "\\.")}":\\s*"([^"]*)"`).exec(client(`lib/i18n/${locale}.ts`))?.[1];

/** 골프 테마(index.css :root[data-sport="GOLF"])가 다른 색으로 바꿔 끼우는 유틸 */
const SWAPPED_UTIL = /\b(?:bg|text|border|ring|divide)-(?:white|black)\b/;
/** 12px 보다 작은 글자 */
const TINY_TEXT = /\btext-\[(?:[0-9]|1[01])(?:\.\d+)?px\]/;

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_800_000_000_000;

/* 실제 브라우저가 보내는 꼴의 UA(버전 숫자만 다르다) */
const UA = {
    iphoneSafari: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
    iphoneChrome: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.153 Mobile/15E148 Safari/604.1",
    ipadDesktopMode: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
    ipadOld: "Mozilla/5.0 (iPad; CPU OS 12_5_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1.2 Mobile/15E148 Safari/604.1",
    macSafari: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
    macChrome: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    windowsChrome: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    androidChrome: "Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
    samsungInternet: "Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36",
    kakaoAndroid: "Mozilla/5.0 (Linux; Android 14; SM-S918N Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.6478.134 Mobile Safari/537.36 KAKAOTALK/10.8.3 (INAPP)",
    kakaoIos: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK/10.8.5 (INAPP)",
    naverIos: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 NAVER(inapp; search; 2000; 12.6.1; 15PRO)",
    naverAndroid: "Mozilla/5.0 (Linux; Android 14; SM-S918N Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.6478.134 Mobile Safari/537.36 NAVER(inapp; search; 2000; 12.6.1)",
    instagramIos: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/21F79 Instagram 337.0.0.27.92 (iPhone15,2; iOS 17_5; ko_KR; ko; scale=3.00; 1179x2556; 612163655)",
    facebookIos: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/21F79 [FBAN/FBIOS;FBAV/470.0.0.37.106;FBBV/612163655;FBDV/iPhone15,2;FBMD/iPhone;FBSN/iOS;FBSV/17.5;FBSS/3;FBID/phone;FBLC/ko_KR;FBOP/5]",
    lineIos: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/14.9.0",
    androidWebView: "Mozilla/5.0 (Linux; Android 13; Pixel 7 Build/TQ3A.230805.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.6478.134 Mobile Safari/537.36",
    linuxFirefox: "Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0",
};

describe("installDevice — 기기에 맞는 스토어를 고른다", () => {
    it("아이폰(사파리 · 크롬 · 인앱)은 ios", () => {
        for (const ua of [UA.iphoneSafari, UA.iphoneChrome, UA.kakaoIos, UA.naverIos, UA.instagramIos, UA.facebookIos, UA.lineIos, UA.ipadOld]) {
            expect(installDevice(ua, { maxTouchPoints: 5 }), ua).toBe("ios");
        }
    });

    it("안드로이드(크롬 · 삼성 인터넷 · 인앱 · 웹뷰)는 android", () => {
        for (const ua of [UA.androidChrome, UA.samsungInternet, UA.kakaoAndroid, UA.naverAndroid, UA.androidWebView]) {
            expect(installDevice(ua, { maxTouchPoints: 5 }), ua).toBe("android");
        }
    });

    it("아이패드는 맥 UA 를 보낸다 — 글자가 같은 맥과 터치 점 수로 가른다", () => {
        expect(UA.ipadDesktopMode).toBe(UA.macSafari);
        expect(installDevice(UA.ipadDesktopMode, { maxTouchPoints: 5 })).toBe("ios");
        expect(installDevice(UA.macSafari, { maxTouchPoints: 0 })).toBe("desktop");
        // 터치 점 수를 아는 한 그 값이 정한다 — standalone 칸이 있어도 맥은 맥이다
        expect(installDevice(UA.macSafari, { maxTouchPoints: 0, standalone: false })).toBe("desktop");
        // 터치 점 수를 모를 때만 iOS 웹킷에만 있는 standalone 칸을 본다
        expect(installDevice(UA.ipadDesktopMode, { standalone: false })).toBe("ios");
        expect(installDevice(UA.macSafari)).toBe("desktop");
    });

    it("PC 는 desktop — 스토어로 보내지 않는다", () => {
        for (const ua of [UA.windowsChrome, UA.macChrome, UA.linuxFirefox]) {
            expect(installDevice(ua, { maxTouchPoints: 0 }), ua).toBe("desktop");
        }
        // 터치 노트북(윈도우)은 터치 점이 있어도 PC 다
        expect(installDevice(UA.windowsChrome, { maxTouchPoints: 10 })).toBe("desktop");
        expect(installDevice("")).toBe("desktop");
        expect(installDevice(undefined)).toBe("desktop");
    });
});

describe("isInAppBrowser — 동작 선택에만 쓴다(문구가 아니라)", () => {
    it("카카오톡 · 네이버 · 인스타그램 · 페이스북 · 라인 · 안드로이드 웹뷰", () => {
        for (const ua of [UA.kakaoAndroid, UA.kakaoIos, UA.naverIos, UA.naverAndroid, UA.instagramIos, UA.facebookIos, UA.lineIos, UA.androidWebView]) {
            expect(isInAppBrowser(ua), ua).toBe(true);
        }
    });

    it("보통 브라우저는 아니다 — 'Linux' 가 라인으로 읽히지 않는다", () => {
        for (const ua of [UA.iphoneSafari, UA.iphoneChrome, UA.androidChrome, UA.samsungInternet, UA.windowsChrome, UA.macSafari, UA.linuxFirefox]) {
            expect(isInAppBrowser(ua), ua).toBe(false);
        }
        expect(isInAppBrowser(undefined)).toBe(false);
    });

    it("화면은 이 값으로 스토어 링크를 여는 방법만 바꾼다 — 인앱은 새 창 없이 그 자리에서", () => {
        const sheet = code(client("components/hiq/AppInstallSheet.tsx"));
        expect(sheet).toContain('const storeTarget = inApp ? undefined : "_blank";');
        // 문구를 가르는 데는 쓰지 않는다 — inApp 이 나오는 곳은 받는 자리와 위 한 줄뿐이다
        const uses = sheet.split("\n").filter((l) => /\binApp\b/.test(l) && !/inApp: isInAppBrowser\(ua\)|inApp=\{env\.inApp\}|inApp: boolean/.test(l));
        expect(uses.map((l) => l.trim())).toEqual([
            // golf 는 더 받지 않는다 — 골프 시트에서만 빼던 '화면 켜 두기' 줄을 아예 걷어냈다(2026-10-06 검토: 웹도 되는 것이었다)
            "function InstallPanel({ tone, device, inApp, plan, tooSoon, onDismiss, onStore }: {",
            'const storeTarget = inApp ? undefined : "_blank";',
        ]);
        // window.open 은 인앱 웹뷰에서 막힌다 — 스토어는 늘 링크(<a href>)로 연다
        expect(sheet).not.toContain("window.open(");
    });
});

describe("isPromptBlockedPath — 막는 주소", () => {
    it("예전 게이트(App.tsx InstallBannerGate)가 막던 곳은 그대로 막는다", () => {
        for (const p of [
            "/online-game", "/online-game?room=abc",
            "/golf/arcade", "/golf/range",
            "/golf/course/남서울", "/golf/courses", "/golf/courses/경기", "/golf/courses/경기/용인",
            "/golf/booking", "/golf/booking/경기", "/golf/join", "/golf/join/경기/용인", "/golf/urgent", "/golf/urgent/제주",
        ]) expect(isPromptBlockedPath(p), p).toBe(true);
    });

    it("점수판 · 경기 결과 · 골프 스코어카드 — 경기 중에는 띄우지 않는다", () => {
        for (const p of ["/game/123", "/game/result", "/game/result?id=5", "/golf/game/new", "/golf/game/77", "/golf/game/77/result"]) {
            expect(isPromptBlockedPath(p), p).toBe(true);
        }
    });

    it("게임 화면 — 아래가 조작부다", () => {
        for (const p of ["/golf/play", "/golf/minigolf"]) expect(isPromptBlockedPath(p), p).toBe(true);
    });

    it("로그인 · 가입 · 약관 · 콜백", () => {
        for (const p of ["/", "/?login=1", "/?login=1&redirect=%2Fdashboard", "/hiq", "/register", "/auth/kakao", "/auth/kakao?code=x", "/terms", "/privacy", "/support", "/account-delete"]) {
            expect(isPromptBlockedPath(p), p).toBe(true);
        }
    });

    it("바닥에 다른 고정 줄이 있는 공개 골프 페이지(CourseShell) — 읽을거리 셋도 같은 틀이다", () => {
        for (const p of ["/golf/checklist", "/golf/terms", "/golf/terms/핸디캡", "/golf/find/2인", "/golf/find/노캐디/경기"]) {
            expect(isPromptBlockedPath(p), p).toBe(true);
        }
        // 그 화면들이 정말 같은 틀을 쓰는지 — 틀을 바꾸면 이 목록도 다시 본다
        for (const f of ["GolfChecklist.tsx", "GolfTerms.tsx", "GolfFind.tsx", "GolfCoursePage.tsx", "GolfCourseHub.tsx"]) {
            expect(client(`golf/pages/${f}`), f).toContain("<CourseShell");
        }
        expect(client("golf/components/course/CourseShell.tsx")).toContain('className="fixed inset-x-0 bottom-0 z-40');
    });

    it("초대 수락 · 채팅방 · 콘솔 · 등록 폼", () => {
        for (const p of ["/join/ABC123", "/chat/dm/12", "/chat/crew/3", "/admin", "/admin/dashboard", "/partner/login", "/partner/dashboard", "/stores/register", "/club/create"]) {
            expect(isPromptBlockedPath(p), p).toBe(true);
        }
    });

    it("그 밖은 띄울 수 있다 — 홈 · 크루 · 친구 · 기록 · 메뉴(본문 끝에 설치 카드가 있는 화면)도 포함", () => {
        for (const p of [
            "/dashboard", "/dashboard?tab=1", "/club", "/club/12", "/crew/12/feed", "/friends", "/history", "/menu", "/settings",
            "/ranking", "/chat", "/community", "/community/5", "/world-ranking", "/world-ranking/country/KOR", "/player/3c/123",
            "/pba", "/pba/records", "/pba-player/1001", "/tournaments", "/stores", "/stores/seoul", "/store/abc", "/briefing", "/r/55",
            "/about", "/billiards/terms", "/golf-ranking", "/golfer/kpga/1", "/hiq/dashboard",
            // 비슷한 이름에 걸리지 않는다
            "/golf/booking-list", "/golf/booking-list/3", "/golf/my-bookings", "/golf/passport", "/golf/ranking", "/golf/membership", "/golf/proam", "/games",
        ]) expect(isPromptBlockedPath(p), p).toBe(false);
    });

    it("끝의 '/' · 질의 · 해시는 보지 않는다. 경로가 아닌 값은 막는다", () => {
        expect(isPromptBlockedPath("/register/")).toBe(true);
        expect(isPromptBlockedPath("/dashboard/")).toBe(false);
        expect(isPromptBlockedPath("/dashboard#top")).toBe(false);
        expect(isPromptBlockedPath("")).toBe(true);
        expect(isPromptBlockedPath(undefined)).toBe(true);
        expect(isPromptBlockedPath("dashboard")).toBe(true);
    });

    it("주소 목록은 shared 한 곳에만 있다 — App.tsx 의 게이트는 경로를 건네기만 한다", () => {
        const app = client("App.tsx");
        const gate = code(app.slice(app.indexOf("function InstallBannerGate"), app.indexOf("function App()")));
        expect(gate.replace(/\s+/g, " ").trim()).toBe(
            "function InstallBannerGate() { const [location] = useLocation(); return <AppInstallSheet path={location} />; }",
        );
        expect(code(app)).not.toContain("PAGE_BANNER_ROUTES");
        expect(app).toContain('import { AppInstallSheet } from "@/components/hiq/AppInstallSheet";');
        expect(app.match(/<InstallBannerGate \/>/g)).toHaveLength(1);
        // 화면 쪽에도 자기 목록이 없다
        const sheet = code(client("components/hiq/AppInstallSheet.tsx"));
        expect(sheet).not.toMatch(/startsWith\("\//);
        expect(sheet).not.toMatch(/"\/(dashboard|game|golf|register|online-game)/);
    });
});

describe("쉬는 기간 — 닫으면 7일 · 세 번 닫으면 30일 · 스토어를 눌렀으면 14일", () => {
    it("숫자", () => {
        expect(REST_AFTER_DISMISS_DAYS).toBe(7);
        expect(MANY_DISMISSALS).toBe(3);
        expect(REST_AFTER_MANY_DISMISSALS_DAYS).toBe(30);
        expect(REST_AFTER_STORE_DAYS).toBe(14);
    });

    it("닫은 적도 누른 적도 없으면 쉬지 않는다", () => {
        expect(restUntil(EMPTY_RECORD, NOW)).toBe(0);
    });

    it("한 번 · 두 번 닫으면 7일", () => {
        const once = recordAfterDismiss(EMPTY_RECORD, NOW);
        expect(once).toEqual({ lastDismissedAt: NOW, dismissCount: 1, lastStoreClickAt: null });
        expect(restUntil(once, NOW)).toBe(NOW + 7 * DAY);
        const twice = recordAfterDismiss(once, NOW + 8 * DAY);
        expect(twice.dismissCount).toBe(2);
        expect(restUntil(twice, NOW + 8 * DAY)).toBe(NOW + 15 * DAY);
    });

    it("세 번째부터는 30일", () => {
        let r = EMPTY_RECORD;
        for (let i = 0; i < 3; i++) r = recordAfterDismiss(r, NOW);
        expect(r.dismissCount).toBe(3);
        expect(restUntil(r, NOW)).toBe(NOW + 30 * DAY);
        // 네 번째도 30일(더 길어지지 않는다)
        expect(restUntil(recordAfterDismiss(r, NOW), NOW)).toBe(NOW + 30 * DAY);
    });

    it("스토어 단추는 14일 — 닫은 횟수에는 넣지 않는다", () => {
        const r = recordAfterStoreClick(EMPTY_RECORD, NOW);
        expect(r).toEqual({ lastDismissedAt: null, dismissCount: 0, lastStoreClickAt: NOW });
        expect(restUntil(r, NOW)).toBe(NOW + 14 * DAY);
    });

    it("둘 다 있으면 늦게 끝나는 쪽", () => {
        // 스토어를 누르고(14일) 곧 닫았다(7일) → 14일
        const a = recordAfterDismiss(recordAfterStoreClick(EMPTY_RECORD, NOW), NOW + 1000);
        expect(restUntil(a, NOW + 1000)).toBe(NOW + 14 * DAY);
        // 세 번 닫은 사람이(30일) 스토어를 눌렀다(14일) → 30일
        const b = recordAfterStoreClick({ lastDismissedAt: NOW, dismissCount: 3, lastStoreClickAt: null }, NOW);
        expect(restUntil(b, NOW)).toBe(NOW + 30 * DAY);
    });

    it("미래 시각(기기 시계를 돌렸다)은 없는 것으로 본다 — 영영 안 뜨는 일이 없게", () => {
        expect(restUntil({ lastDismissedAt: NOW + 400 * DAY, dismissCount: 1, lastStoreClickAt: NOW + 400 * DAY }, NOW)).toBe(0);
    });

    it("저장한 글자를 다시 읽으면 같은 기록 — 깨진 값은 빈 기록", () => {
        const r = recordAfterStoreClick(recordAfterDismiss(EMPTY_RECORD, NOW), NOW + 5);
        expect(parsePromptRecord(serializePromptRecord(r))).toEqual(r);
        for (const bad of [null, undefined, "", "{", "[]", "null", "7", '{"d":"x","n":-3,"s":null}']) {
            expect(parsePromptRecord(bad), String(bad)).toEqual(EMPTY_RECORD);
        }
    });
});

describe("shouldPrompt — 띄울 조건", () => {
    /** 처음 온 사람이 홈을 막 열었다 */
    const base: PromptInput = {
        path: "/dashboard", isNative: false, standalone: false, loginSheetOpen: false,
        lastDismissedAt: null, dismissCount: 0, lastStoreClickAt: null,
        now: NOW, secondsOnSite: 0, pagesSeen: 1,
    };
    /** 띄울 조건을 다 채운 사람 */
    const ripe: PromptInput = { ...base, pagesSeen: 2, secondsOnSite: 40, secondsOnPage: 10 };

    it("숫자 — 화면 2번 또는 20초", () => {
        expect(PROMPT_MIN_PAGES).toBe(2);
        expect(PROMPT_MIN_SECONDS).toBe(20);
    });

    it("들어오자마자 띄우지 않는다", () => {
        expect(shouldPrompt(base)).toBe(false);
        expect(shouldPrompt({ ...base, secondsOnSite: 5, secondsOnPage: 5 })).toBe(false);
    });

    it("화면을 2번 이상 보았으면 띄운다", () => {
        expect(shouldPrompt({ ...base, pagesSeen: 2 })).toBe(true);
        expect(shouldPrompt({ ...base, pagesSeen: 5 })).toBe(true);
    });

    it("20초를 **넘겨** 머물렀으면 띄운다 — 한 화면만 보고 있어도", () => {
        expect(shouldPrompt({ ...base, secondsOnSite: 20 })).toBe(false);
        expect(shouldPrompt({ ...base, secondsOnSite: 21 })).toBe(true);
    });

    it("화면이 바뀐 직후에는 기다린다 — 새 화면이 그려지자마자 덮지 않는다", () => {
        expect(shouldPrompt({ ...base, pagesSeen: 2, secondsOnPage: 0 })).toBe(false);
        expect(shouldPrompt({ ...base, pagesSeen: 2, secondsOnPage: PROMPT_SETTLE_SECONDS - 1 })).toBe(false);
        expect(shouldPrompt({ ...base, pagesSeen: 2, secondsOnPage: PROMPT_SETTLE_SECONDS })).toBe(true);
    });

    it("앱 안 · 홈 화면에 추가한 웹앱에서는 절대 안 띄운다", () => {
        expect(shouldPrompt(ripe)).toBe(true);
        expect(shouldPrompt({ ...ripe, isNative: true })).toBe(false);
        expect(shouldPrompt({ ...ripe, standalone: true })).toBe(false);
        expect(shouldPrompt({ ...ripe, isNative: true, forced: true })).toBe(false);
        expect(shouldPrompt({ ...ripe, standalone: true, forced: true })).toBe(false);
    });

    it("막는 주소에서는 안 띄운다", () => {
        for (const path of ["/", "/register", "/game/12", "/golf/game/3", "/online-game", "/golf/course/남서울", "/terms"]) {
            expect(shouldPrompt({ ...ripe, path }), path).toBe(false);
            expect(shouldPrompt({ ...ripe, path, forced: true }), path).toBe(false);
        }
    });

    it("가입 팝업이 열려 있으면 안 띄운다 — 닫힌 직후 · 방금 로그인한 직후에도", () => {
        expect(shouldPrompt({ ...ripe, loginSheetOpen: true })).toBe(false);
        expect(shouldPrompt({ ...ripe, loginSheetOpen: true, forced: true })).toBe(false);
        expect(QUIET_AFTER_LOGIN_SECONDS).toBeGreaterThanOrEqual(30);
        expect(shouldPrompt({ ...ripe, quietSince: NOW - 1000 })).toBe(false);
        expect(shouldPrompt({ ...ripe, quietSince: NOW - (QUIET_AFTER_LOGIN_SECONDS - 1) * 1000 })).toBe(false);
        expect(shouldPrompt({ ...ripe, quietSince: NOW - QUIET_AFTER_LOGIN_SECONDS * 1000 })).toBe(true);
        expect(shouldPrompt({ ...ripe, quietSince: null })).toBe(true);
    });

    it("화면이 바쁘면(다른 창 · 입력 중 · 설치 카드가 보임 · 로그인 확인 중) 기다린다", () => {
        expect(shouldPrompt({ ...ripe, busy: true })).toBe(false);
        expect(shouldPrompt({ ...ripe, busy: true, forced: true })).toBe(false);
    });

    // 2026-10-06 검토: PC 넓은 화면에서는 옆 패널(DesktopFrame)에 QR · 스토어 단추가 이미 붙어 있는데 같은 내용의 QR 팝업이 또 올라왔다.
    // '한 화면에 설치 권유 둘은 소음'(2026-09-09 오너)을 본문 끝 카드만 보고 지키고 있었다 — PC 에는 그 카드가 없다.
    it("같은 화면에 다른 설치 권유(PC 옆 패널)가 보이면 스스로 띄우지 않는다 — 받으러 온 사람(?install=1)은 띄운다", () => {
        expect(shouldPrompt({ ...ripe, otherInstallVisible: true })).toBe(false);
        expect(shouldPrompt({ ...ripe, otherInstallVisible: false })).toBe(true);
        // busy 와 다른 점: 옆 패널은 화면에서 사라지지 않는다 — forced 까지 막으면 PC 에서 그 주소가 영영 안 뜬다
        expect(shouldPrompt({ ...base, forced: true, otherInstallVisible: true })).toBe(true);
        // 그래도 앱 안 · 막는 주소 · 가입 팝업 · 바쁨이 먼저다
        expect(shouldPrompt({ ...ripe, forced: true, otherInstallVisible: true, busy: true })).toBe(false);
        expect(shouldPrompt({ ...ripe, forced: true, otherInstallVisible: true, path: "/register" })).toBe(false);
    });

    it("닫은 뒤 7일 동안은 안 띄운다 — 7일이 지나면 다시", () => {
        const r = recordAfterDismiss(EMPTY_RECORD, NOW);
        expect(shouldPrompt({ ...ripe, ...r, now: NOW + 60_000 })).toBe(false);
        expect(shouldPrompt({ ...ripe, ...r, now: NOW + 7 * DAY - 1 })).toBe(false);
        expect(shouldPrompt({ ...ripe, ...r, now: NOW + 7 * DAY })).toBe(true);
    });

    it("세 번 닫았으면 30일", () => {
        const r = { lastDismissedAt: NOW, dismissCount: 3, lastStoreClickAt: null };
        expect(shouldPrompt({ ...ripe, ...r, now: NOW + 8 * DAY })).toBe(false);
        expect(shouldPrompt({ ...ripe, ...r, now: NOW + 30 * DAY - 1 })).toBe(false);
        expect(shouldPrompt({ ...ripe, ...r, now: NOW + 30 * DAY })).toBe(true);
    });

    it("스토어 단추를 눌렀으면 14일", () => {
        const r = recordAfterStoreClick(EMPTY_RECORD, NOW);
        expect(shouldPrompt({ ...ripe, ...r, now: NOW + 8 * DAY })).toBe(false);
        expect(shouldPrompt({ ...ripe, ...r, now: NOW + 14 * DAY - 1 })).toBe(false);
        expect(shouldPrompt({ ...ripe, ...r, now: NOW + 14 * DAY })).toBe(true);
    });

    it("한 방문에 한 번만", () => {
        expect(shouldPrompt({ ...ripe, shownThisVisit: true })).toBe(false);
    });

    it("받으러 온 사람(?install=1 — PC 의 QR)에게는 기다림 · 쉬는 기간 없이 바로", () => {
        expect(shouldPrompt({ ...base, forced: true })).toBe(true);
        expect(shouldPrompt({ ...base, forced: true, secondsOnPage: 0 })).toBe(true);
        expect(shouldPrompt({ ...base, forced: true, ...recordAfterDismiss(EMPTY_RECORD, NOW) })).toBe(true);
        expect(shouldPrompt({ ...base, forced: true, shownThisVisit: true })).toBe(true);
        expect(shouldPrompt({ ...base, forced: true, quietSince: NOW - 1000 })).toBe(true);
    });
});

describe("이 방문에서 본 것 — 화면 수 · 머문 시간", () => {
    const walk = (paths: string[], from: InstallVisit = EMPTY_VISIT) => paths.reduce((v, p) => visitAfterPath(v, p), from);

    it("화면이 바뀔 때마다 하나씩 — 같은 화면이 이어지면(질의만 바뀜) 세지 않는다", () => {
        expect(walk(["/dashboard"]).pages).toBe(1);
        expect(walk(["/dashboard", "/dashboard", "/dashboard?tab=2"]).pages).toBe(1);
        expect(walk(["/dashboard", "/ranking"]).pages).toBe(2);
        expect(walk(["/store/abc", "/stores", "/store/def"]).pages).toBe(3);
    });

    it("맨 '/' 를 연 비로그인이 예시 홈으로 넘어가는 것은 화면 한 번이다 — 들어오자마자 뜨지 않는다", () => {
        const v = walk(["/", "/dashboard"]);
        expect(v.pages).toBe(1);
        expect(shouldPrompt({
            path: "/dashboard", isNative: false, standalone: false, loginSheetOpen: false,
            lastDismissedAt: null, dismissCount: 0, lastStoreClickAt: null,
            now: NOW, secondsOnSite: v.seconds, pagesSeen: v.pages, secondsOnPage: 10,
        })).toBe(false);
        // 로그인 화면 · 카카오에서 돌아오는 화면 · 가입을 거쳐 와도 같다
        expect(walk(["/?login=1", "/auth/kakao", "/register", "/dashboard"]).pages).toBe(1);
    });

    it("막는 주소는 세지 않지만, 다녀오면 돌아온 화면은 새로 센다(경기를 마치고 홈으로)", () => {
        const v = walk(["/dashboard", "/game/12", "/game/result", "/dashboard"]);
        expect(v.pages).toBe(2);
        expect(v.lastPath).toBe("/dashboard");
        // 공개 골프 페이지만 돌아다닌 사람은 0
        expect(walk(["/golf/course/a", "/golf/course/b", "/golf/courses"]).pages).toBe(0);
    });

    it("머문 시간은 탭이 보이고 권유할 수 있는 화면일 때만 흐른다", () => {
        let v = EMPTY_VISIT;
        for (let i = 0; i < 10; i++) v = visitAfterSecond(v, "/dashboard", true);
        expect(v.seconds).toBe(10);
        // 탭이 가려져 있었다
        for (let i = 0; i < 600; i++) v = visitAfterSecond(v, "/dashboard", false);
        expect(v.seconds).toBe(10);
        // 가입 화면에서 1분 — 가입 직후 홈에서 곧바로 뜨지 않게 세지 않는다
        for (let i = 0; i < 60; i++) v = visitAfterSecond(v, "/register", true);
        expect(v.seconds).toBe(10);
        // 바뀐 게 없으면 같은 객체를 돌려준다(화면이 그걸 보고 저장을 건너뛴다)
        expect(visitAfterSecond(v, "/register", true)).toBe(v);
        const at = visitAfterPath(EMPTY_VISIT, "/dashboard");
        expect(visitAfterPath(at, "/dashboard?tab=2")).toBe(at);
    });

    it("저장한 글자를 다시 읽는다 — 깨진 값은 빈 방문", () => {
        const v: InstallVisit = { seconds: 12, pages: 2, lastPath: "/ranking", shown: true };
        expect(parseVisit(JSON.stringify(v))).toEqual(v);
        for (const bad of [null, "", "{", "null", "[]", '{"seconds":"x","pages":-1,"lastPath":5,"shown":"yes"}']) {
            expect(parseVisit(bad), String(bad)).toEqual(EMPTY_VISIT);
        }
    });
});

describe("installSheetPlan — 누구에게 무엇을 보여 주나", () => {
    it("휴대폰 · 비로그인: 스토어 단추 하나 — '앱에서 열기'는 없다", () => {
        for (const device of ["ios", "android"] as const) {
            const plan = installSheetPlan({ device, loggedIn: false, kakaoOnly: false });
            expect(plan).toEqual({ show: true, actions: ["store"], qr: false, kakaoNote: false });
            expect(plan.actions).not.toContain("open");
        }
        // 비로그인인데 kakaoOnly 가 참으로 넘어와도(있을 수 없는 값) '앱에서 열기'를 주지 않는다
        expect(installSheetPlan({ device: "ios", loggedIn: false, kakaoOnly: true }).actions).toEqual(["store"]);
    });

    it("휴대폰 · 회원: 스토어가 첫째, '앱에서 열기'가 둘째", () => {
        for (const device of ["ios", "android"] as const) {
            expect(installSheetPlan({ device, loggedIn: true, kakaoOnly: false }))
                .toEqual({ show: true, actions: ["store", "open"], qr: false, kakaoNote: false });
        }
    });

    it("휴대폰 · 카카오로만 가입한 회원: '앱에서 열기'가 첫째 + 설명 한 줄", () => {
        for (const device of ["ios", "android"] as const) {
            expect(installSheetPlan({ device, loggedIn: true, kakaoOnly: true }))
                .toEqual({ show: true, actions: ["open", "store"], qr: false, kakaoNote: true });
        }
    });

    it("PC: QR + 두 스토어 링크, '앱에서 열기'는 없다. 카카오로만 가입한 회원에게는 띄우지 않는다", () => {
        expect(installSheetPlan({ device: "desktop", loggedIn: false, kakaoOnly: false })).toEqual({ show: true, actions: [], qr: true, kakaoNote: false });
        expect(installSheetPlan({ device: "desktop", loggedIn: true, kakaoOnly: false })).toEqual({ show: true, actions: [], qr: true, kakaoNote: false });
        expect(installSheetPlan({ device: "desktop", loggedIn: true, kakaoOnly: true }).show).toBe(false);
    });
});

describe("앱에서 열기 — 눌렀을 때 받아 바로 연다", () => {
    const TOKEN = "A".repeat(43);
    const issued = { appUrl: handoffAppUrl(TOKEN), intentUrl: handoffIntentUrl(TOKEN), expiresInSec: HANDOFF_TTL_SEC };

    it("안드로이드는 intent 주소(패키지 고정), 아이폰은 앱 스킴 주소, PC 는 없다", () => {
        expect(handoffLaunchUrl("android", issued)).toBe(issued.intentUrl);
        expect(handoffLaunchUrl("android", issued)).toContain(";package=com.rankue.app;");
        expect(handoffLaunchUrl("ios", issued)).toBe(issued.appUrl);
        expect(handoffLaunchUrl("desktop", issued)).toBeNull();
        // 앱이 받는 경로는 홈 + 토큰이다
        expect(deepLinkToPath(issued.appUrl)).toBe(`/dashboard?handoff=${TOKEN}`);
    });

    it("꼴이 다른 주소로는 옮기지 않는다 — 서버 답이라도", () => {
        for (const bad of ["https://evil.example/x", "javascript:alert(1)", "//evil.example", "", null, undefined, 5]) {
            expect(handoffLaunchUrl("ios", { appUrl: bad, intentUrl: bad }), String(bad)).toBeNull();
            expect(handoffLaunchUrl("android", { appUrl: bad, intentUrl: bad }), String(bad)).toBeNull();
        }
        // 기기에 맞지 않는 칸은 쓰지 않는다
        expect(handoffLaunchUrl("ios", { appUrl: issued.intentUrl, intentUrl: issued.appUrl })).toBeNull();
        expect(handoffLaunchUrl("android", { appUrl: issued.intentUrl, intentUrl: issued.appUrl })).toBeNull();
        expect(handoffLaunchUrl("ios", null)).toBeNull();
        // 안드로이드 — 패키지가 다른 intent 는 열지 않는다(토큰이 다른 앱으로 간다)
        const otherApp = issued.intentUrl.replace("package=com.rankue.app", "package=com.evil.app");
        expect(otherApp).not.toBe(issued.intentUrl);
        expect(handoffLaunchUrl("android", { intentUrl: otherApp })).toBeNull();
        expect(handoffLaunchUrl("android", { intentUrl: issued.intentUrl.replace(";end", ";S.browser_fallback_url=https%3A%2F%2Fevil.example;end") })).toBeNull();
    });

    const raw = client("components/hiq/AppInstallSheet.tsx");
    const sheet = code(raw);
    const fn = sheet.slice(sheet.indexOf("const openInApp = async () => {"), sheet.indexOf("const storeHref"));

    it("발급은 POST /api/hiq/handoff 에 빈 JSON 본문 — 받은 답에서 기기에 맞는 주소를 골라 연다", () => {
        expect(fn.length).toBeGreaterThan(0);
        expect(fn).toContain('const issued = await apiRequest("/api/hiq/handoff", { method: "POST", body: {} }) as HandoffIssue;');
        expect(fn).toContain("const url = handoffLaunchUrl(device, issued);");
        const got = fn.indexOf("await apiRequest(");
        const go = fn.indexOf("launch(url);");
        expect(go).toBeGreaterThan(got);
        // 여는 것은 그 자리에서 주소를 옮기는 것이다(새 창이 아니다)
        expect(sheet).toContain("try { window.location.href = url; }");
        // 부르는 곳은 이 함수 한 곳뿐
        expect(sheet.match(/\/api\/hiq\/handoff/g)).toHaveLength(1);
    });

    it("미리 받지 않는다 — effect · 메모 안에서는 서버를 부르지 않는다(누르지도 않았는데 한도 5번을 쓴다)", () => {
        const sf = ts.createSourceFile("AppInstallSheet.tsx", raw, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
        const name = (node: ts.Node) => {
            if (!ts.isCallExpression(node)) return "";
            const f = node.expression;
            return ts.isIdentifier(f) ? f.text : ts.isPropertyAccessExpression(f) ? f.name.text : "";
        };
        const auto: number[] = [];
        let handlers = 0;
        const walk = (node: ts.Node, inAuto: boolean) => {
            const n = name(node);
            if (n === "apiRequest" || n === "openInApp") {
                if (inAuto) auto.push(sf.getLineAndCharacterOfPosition(node.getStart()).line + 1);
                else handlers++;
            }
            const enters = inAuto || ["useEffect", "useLayoutEffect", "useMemo"].includes(n);
            ts.forEachChild(node, (child) => walk(child, enters));
        };
        walk(sf, false);
        expect(auto).toEqual([]);
        // 검사가 빈 손으로 지나가지 않았다 — apiRequest 한 번 + 단추의 openInApp 한 번
        expect(handlers).toBe(2);
        expect(sheet).toContain("onClick={() => { void openInApp(); }}");
    });

    it("두 번째 탭은 받아 둔 주소를 기다림 없이 연다 — 살아 있는 동안만, 화면 밖에는 적지 않는다", () => {
        const again = fn.indexOf("if (kept && Date.now() < kept.until) { launch(kept.url); return; }");
        expect(again).toBeGreaterThan(0);
        expect(again).toBeLessThan(fn.indexOf("await apiRequest("));
        // 만료(120초)보다 일찍 버린다
        expect(fn).toContain("ready.current = { url, until: Date.now() + Math.max(0, (Number(issued.expiresInSec) || 0) - 10) * 1000 };");
        // 주소는 ref 에만 — 저장소에 들어가는 것은 닫은 기록과 방문 기록 둘뿐이다
        expect(sheet).toContain("const ready = useRef<{ url: string; until: number } | null>(null);");
        expect(sheet.match(/\.setItem\(/g)).toHaveLength(2);
        expect(sheet).toContain("localStorage.setItem(RECORD_KEY, serializePromptRecord(r));");
        expect(sheet).toContain("sessionStorage.setItem(VISIT_KEY, JSON.stringify(v));");
        expect(sheet).not.toMatch(/console\.(log|info|warn|error)\(/);
    });

    it("1.5초 뒤에도 화면이 그대로면 '한 번 더' + '앱이 아직 없다면 먼저 받아 주세요'", () => {
        expect(OPEN_CHECK_MS).toBe(1500);
        const launch = sheet.slice(sheet.indexOf("const launch = useCallback("), sheet.indexOf("const openInApp = async"));
        expect(launch).toMatch(/checkTimer\.current = window\.setTimeout\(\(\) => \{\s*if \(document\.visibilityState === "visible"\) setPhase\("stuck"\);\s*\}, OPEN_CHECK_MS\);/);
        // 앱이 떠서 탭이 가려졌으면 안내를 띄우지 않는다
        expect(launch).toContain('if (!launched.current || document.visibilityState !== "hidden") return;');
        expect(launch).toContain("window.clearTimeout(checkTimer.current);");
        expect(sheet).toContain('phase === "stuck" ? t("installSheet.openAgain")');
        expect(sheet).toContain('{t("installSheet.openStuck")}');
        expect(dictValue("ko", "installSheet.openAgain")).toBe("한 번 더 눌러 주세요");
        expect(dictValue("ko", "installSheet.openStuck")).toContain("앱이 아직 없다면 먼저 받아 주세요");
    });

    it("못 받았을 때 — 너무 잦으면(429) 서버 문구 그대로, 그 밖은 우리 문구", () => {
        expect(fn).toContain('e?.status === 429 && e?.data?.success === false && typeof e.data.message === "string"');
        expect(fn).toContain('t(e?.status === 401 ? "installSheet.openNeedsLogin" : "installSheet.openFailed")');
    });

    it("비로그인에게는 단추가 없다 — 그리는 곳은 규칙(plan.actions)에 'open' 이 있을 때뿐이다", () => {
        expect(sheet).toContain("installSheetPlan({ device: env.device, loggedIn: isLoggedIn, kakaoOnly })");
        const draws = sheet.split("\n").filter((l) => /openButton\((true|false)\)/.test(l)).map((l) => l.trim());
        expect(draws).toEqual(["{openButton(true)}", '{plan.actions.includes("open") && openButton(false)}']);
        // 첫째로 그리는 쪽은 규칙이 'open' 을 맨 앞에 뒀을 때만(카카오로만 가입한 회원)
        const first = sheet.indexOf('{plan.actions[0] === "open" ? (');
        expect(first).toBeGreaterThan(0);
        expect(sheet.indexOf("{openButton(true)}")).toBeGreaterThan(first);
        // 로그인 확인이 끝나기 전에는 띄우지 않는다 — 뜬 뒤에 단추가 생기거나 사라지지 않게
        expect(sheet).toContain("busy: live.current.authLoading || screenBusy(),");
    });
});

describe("PC 의 QR — 휴대폰이 열면 그 기기의 스토어 단추가 바로 뜬다", () => {
    it("QR 주소는 우리 사이트의 홈 + 표시", () => {
        expect(INSTALL_QR_PATH).toBe("/dashboard?install=1");
        expect(installQrUrl()).toBe(`${WEB_URL}/dashboard?install=1`);
        expect(installQrUrl()).toBe("https://www.rankue.co.kr/dashboard?install=1");
        // 홈은 팝업을 띄울 수 있는 화면이다
        expect(isPromptBlockedPath(INSTALL_QR_PATH)).toBe(false);
    });

    it("홈은 앱 링크 목록에 있다 — 앱이 이미 깔린 휴대폰은 앱으로 열린다", () => {
        const aasa = JSON.parse(readFileSync(resolve(__dirname, "../client/public/.well-known/apple-app-site-association"), "utf8"));
        const paths = aasa.applinks.details.flatMap((d: any) => d.components.filter((c: any) => !c.exclude).map((c: any) => c["/"]));
        expect(paths).toContain("/dashboard*");
    });

    it("표시를 꺼내고 주소에서 지운다 — 다른 질의는 글자 그대로", () => {
        expect(takeInstallFlag(installQrUrl())).toEqual({ present: true, forced: true, cleaned: "/dashboard" });
        expect(takeInstallFlag("/dashboard?install=1&store=abc#top")).toEqual({ present: true, forced: true, cleaned: "/dashboard?store=abc#top" });
        expect(takeInstallFlag("/menu?a=%EA%B0%80&install=1&b=2")).toEqual({ present: true, forced: true, cleaned: "/menu?a=%EA%B0%80&b=2" });
        // 값이 1 이 아니면 지우기만 한다
        expect(takeInstallFlag("/dashboard?install=0")).toEqual({ present: true, forced: false, cleaned: "/dashboard" });
        expect(takeInstallFlag("/dashboard?install")).toEqual({ present: true, forced: false, cleaned: "/dashboard" });
        // 없으면 건드리지 않는다. 비슷한 이름에 걸리지 않는다
        expect(takeInstallFlag("/dashboard?installed=1")).toEqual({ present: false, forced: false, cleaned: "/dashboard?installed=1" });
        expect(takeInstallFlag("https://www.rankue.co.kr/")).toEqual({ present: false, forced: false, cleaned: "/" });
        expect(takeInstallFlag(undefined)).toEqual({ present: false, forced: false, cleaned: "/" });
    });

    it("화면: QR 은 installQrUrl(), 흰 바탕에 짙은 무늬. 표시는 주소에서 지운 뒤에 띄운다", () => {
        const sheet = code(client("components/hiq/AppInstallSheet.tsx"));
        expect(sheet).toContain('<QRCodeSVG value={installQrUrl()} size={112} level="M" bgColor="#FFFFFF" fgColor="#0A0A0A" title={t("installSheet.qrAlt")} />');
        expect(sheet).toContain('import { QRCodeSVG } from "qrcode.react";');
        const effect = sheet.slice(sheet.indexOf("const taken = takeInstallFlag(window.location.href);"));
        const wipe = effect.indexOf('window.history.replaceState(window.history.state, "", taken.cleaned);');
        const force = effect.indexOf("forced.current = true;");
        expect(wipe).toBeGreaterThan(0);
        expect(force).toBeGreaterThan(wipe);
        // PC 에서는 두 스토어 링크를 같이 준다
        expect(sheet).toContain("<a href={IOS_STORE} target=\"_blank\" rel=\"noopener noreferrer\" onClick={onStoreClick}");
        expect(sheet).toContain("<a href={ANDROID_STORE} target=\"_blank\" rel=\"noopener noreferrer\" onClick={onStoreClick}");
    });
});

describe("화면(AppInstallSheet) — 소스 검사", () => {
    const raw = client("components/hiq/AppInstallSheet.tsx");
    const sheet = code(raw);

    it("스토어 추적 값은 install_sheet — 옛 띠의 install_banner 와 섞이지 않는다", () => {
        expect(sheet).toContain('const IOS_STORE = iosStoreUrl("install_sheet");');
        expect(sheet).toContain('const ANDROID_STORE = androidStoreUrl("install_sheet");');
        expect(sheet).not.toContain("install_banner");
        expect(iosStoreUrl("install_sheet")).toBe("https://apps.apple.com/app/id6760333313?ct=install_sheet");
        expect(androidStoreUrl("install_sheet")).toBe(
            "https://play.google.com/store/apps/details?id=com.rankue.app&referrer=utm_source%3Drankue%26utm_medium%3Dinstall_sheet",
        );
        // 기기마다 자기 스토어
        expect(sheet).toContain('const storeHref = device === "ios" ? IOS_STORE : ANDROID_STORE;');
        expect(sheet).toContain('const storeLabel = t(device === "ios" ? "installSheet.storeIos" : "installSheet.storeAndroid");');
    });

    it("가입 팝업이 열려 있으면 안 뜬다 — 뜬 채로 가입 팝업이 올라오면 물러나고, 닫힌 때를 적어 둔다", () => {
        expect(sheet).toContain('import { isLoginSheetOpen, useLoginSheetOpen } from "@/components/hiq/LoginSheet";');
        const tryOpen = sheet.slice(sheet.indexOf("const tryOpen = useCallback("), sheet.indexOf("const dismiss = useCallback("));
        expect(tryOpen).toContain("const ok = shouldPrompt({");
        expect(tryOpen).toContain("loginSheetOpen: isLoginSheetOpen(),");
        expect(tryOpen).toContain("quietSince: quiet || null,");
        expect(tryOpen).toContain("if (!ok) return;");
        // 여는 길은 이 함수 하나다
        expect(sheet.match(/setOpen\(true\)/g)).toHaveLength(1);
        expect(tryOpen).toContain("setOpen(true);");
        expect(sheet).toContain("const loginOpen = useLoginSheetOpen();");
        expect(sheet).toMatch(/if \(loginOpen && openRef\.current\) \{\s*openRef\.current = false;\s*setOpen\(false\);\s*\}/);
        expect(sheet).toContain("if (wasLoginOpen.current && !loginOpen) quietSince.current = Date.now();");
    });

    // 가입 직후에는 약관 동의 · 주 종목 묻기가 차례로 뜬다 — 그 뒤에 곧바로 또 하나를 올리지 않는다
    it("방금 로그인한 사람에게는 잠깐 쉰다 — 그 자리 로그인 · 로그인 화면을 거친 로그인 · 카카오처럼 통째로 다녀온 로그인", () => {
        // 비로그인이던 화면이 회원이 됐다
        expect(sheet).toMatch(/if \(isLoading\) return;\s*if \(wasGuest\.current && isLoggedIn\) quietSince\.current = Date\.now\(\);\s*wasGuest\.current = !isLoggedIn;/);
        // 로그인 · 가입 화면에서 막 넘어온 회원(화면이 새로 실려 위의 '바뀌는 순간'을 못 본 경우)
        expect(sheet).toContain("if (prev !== null && prev !== path && isLoginScreenPath(prev)) fromLoginScreenAt.current = Date.now();");
        expect(sheet).toContain("const quiet = Math.max(quietSince.current ?? 0, live.current.loggedIn ? fromLoginScreenAt.current ?? 0 : 0);");
        for (const p of ["/", "/?login=1&phone=1", "/hiq", "/register", "/auth/kakao", "/auth/kakao?code=x"]) expect(isLoginScreenPath(p), p).toBe(true);
        for (const p of ["/dashboard", "/hiq/dashboard", "/terms", "/registered", "/authors", "/game/1"]) expect(isLoginScreenPath(p), p).toBe(false);
        // 로그인 화면은 전부 막는 주소이기도 하다
        for (const p of ["/", "/hiq", "/register", "/auth/kakao"]) expect(isPromptBlockedPath(p), p).toBe(true);
    });

    it("앱 안 · 설치형에서는 세지도 그리지도 않는다", () => {
        expect(sheet).toContain("const native = isNativeApp();");
        expect(sheet).toContain("inert: native || standalone,");
        expect(sheet).toContain("if (env.inert) return null;");
        expect(sheet).toContain("if (env.inert || openRef.current || !live.current.show) return;");
        expect(sheet).toContain("isNative: env.native,");
        expect(sheet).toContain("standalone: env.standalone,");
    });

    it("다른 창이 떠 있거나 · 글자를 넣는 중이거나 · 본문 끝의 설치 카드가 보이면 기다린다", () => {
        const busy = sheet.slice(sheet.indexOf("function screenBusy(): boolean {"), sheet.indexOf("type SheetTone"));
        expect(busy).toContain(`document.querySelector('[role="dialog"], [role="alertdialog"]')`);
        expect(busy).toContain("/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable");
        // 설치 카드는 자기 스토어 링크의 추적 값으로 찾는다 — 카드가 그 값을 바꾸면 여기도 같이 바꿔야 한다
        expect(sheet).toContain('const PAGE_CARD_SOURCE: AppLinkSource = "page_banner";');
        expect(busy).toContain('document.querySelector<HTMLElement>(`a[href*="${PAGE_CARD_SOURCE}"]`)');
        expect(client("components/hiq/AppInstallCard.tsx")).toContain('const href = store === "ios" ? iosStoreUrl("page_banner") : androidStoreUrl("page_banner");');
        expect(iosStoreUrl("page_banner")).toContain("page_banner");
        expect(androidStoreUrl("page_banner")).toContain("page_banner");
    });

    // 2026-10-06 검토: 알림함 · 스코어카드 스캐너(z-100, role 표식 없음)가 열린 채 조건이 차면 팝업이 **그 밑에** 안 보이게 열렸다.
    // 모달이라 화면 전체의 누름을 가져가, 보이지도 않는 팝업의 단추가 눌리고 '닫음'(7일 쉼)으로 세어졌다.
    it("팝업이 올라올 자리를 더 높은 층이 덮고 있으면 기다린다 — role 표식이 없는 오버레이도 잡는다", () => {
        const busy = sheet.slice(sheet.indexOf("function screenBusy(): boolean {"), sheet.indexOf("function coveredByOverlay(): boolean {"));
        expect(busy).toContain("if (coveredByOverlay()) return true;");
        const covered = sheet.slice(sheet.indexOf("function coveredByOverlay(): boolean {"), sheet.indexOf("function sidePanelInstallVisible(): boolean {"));
        // 자리 둘(가운데 아래 · 정중앙)을 직접 찍어, 맨 위 요소에서 조상으로 올라가며 본다
        expect(covered).toContain("[window.innerWidth / 2, window.innerHeight - 80],");
        expect(covered).toContain("[window.innerWidth / 2, window.innerHeight / 2],");
        expect(covered).toContain("for (let el = document.elementFromPoint(x, y); el && el !== document.documentElement; el = el.parentElement) {");
        expect(covered).toContain('if (style.position !== "fixed") continue;');
        expect(covered).toContain("if (Number.isFinite(z) && z > BASE_LAYER_Z) return true;");
        // 문턱은 공용 시트 · 하단 탭의 층(z-50) — 늘 떠 있는 하단 탭에는 걸리지 않고, 그보다 높은 것만 '덮였다'로 본다
        expect(sheet).toContain("const BASE_LAYER_Z = 50;");
        expect(client("components/hiq/HiqNavigation.tsx")).toContain('"fixed bottom-0 left-0 right-0 z-50 ');
        expect(client("components/ui/sheet.tsx")).toContain('"fixed inset-0 z-50 bg-black/40 ');
    });

    it("그때 걸렸던 두 화면에는 '열린 창' 표식이 있다 — 알림함(판 쪽) · 스코어카드 스캐너", () => {
        const inbox = client("components/hiq/menu/NotificationInbox.tsx");
        // 표식은 z-[101] 판 쪽에 — 나가는 움직임 동안에도 남는다
        const panel = inbox.slice(inbox.indexOf('role="dialog"'), inbox.indexOf("{/* Header */}"));
        expect(panel).toContain('aria-modal="true"');
        expect(panel).toContain("z-[101]");
        expect(inbox.indexOf('role="dialog"')).toBeGreaterThan(inbox.indexOf('className="fixed inset-0 bg-black/60 z-[100]"'));
        expect(client("golf/components/ScorecardScanner.tsx")).toContain('<div role="dialog" aria-modal="true" className="fixed inset-0 z-[100] ');
    });

    // 다음에 생기는 오버레이가 또 빠지지 않게: 화면을 통째로 덮는 높은 층(fixed inset-0, z 50 초과)을 그리는 파일은 '열린 창' 표식을 단다
    it("화면을 통째로 덮는 높은 층을 그리는 파일에는 role=\"dialog\" 가 있다", () => {
        const KNOWN: Record<string, string> = {
            // Radix AlertDialog 가 role="alertdialog" 를 스스로 단다
            "components/AppDialog.tsx": "radix",
            // 스코어카드 화면 안에서만 열린다 — 표식은 없지만 자리 검사(coveredByOverlay)가 잡는다(z-60 · z-70)
            "golf/components/OrderModal.tsx": "covered",
            "golf/components/ScorecardModal.tsx": "covered",
        };
        // 한 클래스 묶음(따옴표 안) 안에 fixed · inset-0 · z-[N] 이 같이 있는 꼴 — 순서는 가리지 않는다. N 들을 돌려준다
        const coverLayers = (line: string) => Array.from(
            line.matchAll(/(?=[^"`\n]*\bfixed\b)(?=[^"`\n]*\binset-0\b)[^"`\n]*?\bz-\[(\d+)\]/g), (m) => Number(m[1]),
        );
        const hits = allSources(ROOT)
            .filter((file) => readFileSync(file, "utf8").split("\n").some((line) => coverLayers(line).some((z) => z > 50)))
            .map((file) => file.slice(ROOT.length + 1));
        // 검사가 빈 목록으로 지나가지 않았는지 — 지금 다섯 군데가 넘는다
        expect(hits.length).toBeGreaterThanOrEqual(6);
        expect(hits).toContain("components/hiq/menu/NotificationInbox.tsx");
        expect(hits).toContain("golf/components/ScorecardScanner.tsx");
        for (const file of hits) {
            if (KNOWN[file]) continue;
            expect(client(file), file).toMatch(/role="(?:alert)?dialog"/);
        }
        // 봐주는 목록이 낡지 않게 — 거기 적힌 파일은 지금도 그런 층을 그린다
        for (const file of Object.keys(KNOWN)) expect(hits, file).toContain(file);
        // 검사 자체가 잡는지 — 클래스 순서가 달라도 잡고, 화면을 덮지 않는 것(inset-0 없음)·다른 묶음의 z 는 세지 않는다
        expect(coverLayers('<div className="fixed inset-0 z-[100] bg-black/90">')).toEqual([100]);
        expect(coverLayers('className="z-[70] fixed inset-0"')).toEqual([70]);
        expect(coverLayers('<div className="fixed bottom-0 z-[60]">')).toEqual([]);
        expect(coverLayers('<div className="fixed inset-0"><p className="z-[99]">')).toEqual([]);
    });

    // 2026-10-06 검토: 1280px 이상 PC 의 틀 화면에는 옆 패널에 QR · 스토어 단추가 늘 붙어 있다 — 그 위로 같은 구성의 팝업이 또 떴다
    it("PC: 옆 패널(DesktopFrame)의 설치 구역이 보이는 동안은 스스로 뜨지 않는다 — QR 판(PC)에만, 바쁨과는 따로", () => {
        expect(sheet).toContain('const SIDE_PANEL_SURFACE: AppLinkSource = "desktop_side_panel";');
        const seen = sheet.slice(sheet.indexOf("function sidePanelInstallVisible(): boolean {"), sheet.indexOf("type SheetTone"));
        // 구역 전부를 훑는다(당구 패널 · 골프 패널) — 보이는지는 본문 끝 카드와 같은 사각형 판정
        expect(seen).toContain('document.querySelectorAll<HTMLElement>(`[data-install-surface="${SIDE_PANEL_SURFACE}"]`)');
        expect(seen).toContain("if (r.width > 0 && r.bottom > 0 && r.top < window.innerHeight) return true;");
        const tryOpen = sheet.slice(sheet.indexOf("const tryOpen = useCallback("), sheet.indexOf("const dismiss = useCallback("));
        // 가로로 든 아이패드(스토어 단추 판)의 팝업은 죽이지 않는다 — PC 일 때만 본다
        expect(tryOpen).toContain('otherInstallVisible: env.device === "desktop" && sidePanelInstallVisible(),');
        // 바쁨(screenBusy)에는 넣지 않는다 — 바쁨은 ?install=1 까지 막는다
        const busy = sheet.slice(sheet.indexOf("function screenBusy(): boolean {"), sheet.indexOf("function coveredByOverlay(): boolean {"));
        expect(busy).not.toContain("sidePanelInstallVisible");
        expect(busy).not.toContain("SIDE_PANEL_SURFACE");
        // 옆 패널 쪽: QR 구역 둘(당구 · 골프)에 표식이 있고, 값은 그 패널의 스토어 링크 추적 값과 같은 낱말이다
        const frame = client("components/hiq/DesktopFrame.tsx");
        expect(frame.match(/<section data-install-surface="desktop_side_panel" className="rk-card p-5 flex items-center gap-4">/g)).toHaveLength(2);
        expect(frame).toContain('const STORE_IOS = iosStoreUrl("desktop_side_panel");');
        expect(frame).toContain('const STORE_ANDROID = androidStoreUrl("desktop_side_panel");');
        // 패널은 1280px 이상에서만 보인다(그 아래는 display:none 이라 폭이 0 — '안 보임')
        expect(frame).toContain("hidden xl:flex xl:flex-col");
        // PC 에는 본문 끝 카드가 없다 — 그래서 카드만 보던 기다림이 PC 에서는 한 번도 걸리지 않았다
        expect(client("components/hiq/AppInstallCard.tsx")).toMatch(/DesktopFrame 옆 패널이 맡는다/);
    });

    // 2026-10-06 검토: 닫으려고 누른 '뒤로'가 팝업이 아니라 보던 화면을 닫았다 — 스스로 올라온 팝업 때문에 화면에서 쫓겨나고 7일 쉼까지 적혔다
    it("기기의 '뒤로'는 팝업을 닫는다 — 닫은 것으로 센다(본 것이다)", () => {
        expect(sheet).toContain('import { useBackToClose } from "@/hooks/useBackToClose";');
        expect(sheet).toContain("useBackToClose(open, dismiss);");
        // 훅은 화면을 그리지 않는 갈래(앱 안)보다 앞에서 부른다
        expect(sheet.indexOf("useBackToClose(open, dismiss);")).toBeLessThan(sheet.indexOf("if (env.inert) return null;"));
    });

    it("닫으면 적는다 — 바깥 탭 · X · 끌어내림 · '웹으로 계속 볼게요' · 화면을 떠남. 스토어 단추는 따로 적는다", () => {
        const dismiss = sheet.slice(sheet.indexOf("const dismiss = useCallback("), sheet.indexOf("const keepAfterStore"));
        expect(dismiss).toContain("setRecord(recordAfterDismiss(getRecord(), Date.now()));");
        // 두 번 세지 않는다(바깥 탭과 화면 이동이 겹쳐도)
        expect(dismiss.indexOf("if (!openRef.current) return;")).toBeLessThan(dismiss.indexOf("setRecord("));
        expect(sheet).toContain("<Sheet open={open} onOpenChange={(next) => { if (!next) userDismiss(); }}>");
        expect(sheet).toContain("onDismiss={userDismiss}");
        // 화면을 떠나서 닫히는 쪽은 거르지 않고 바로 적는다
        expect(sheet).toMatch(/pageSeconds\.current = 0;\s*dismiss\(\);/);
        expect(sheet.match(/onClick=\{onDismiss\}/g)).toHaveLength(2);
        expect(sheet).toContain("if (!cancelled && (dy > DRAG_CLOSE_PX || flick)) onDismiss();");
        expect(sheet).toContain('{t("installSheet.stay")}');
        expect(dictValue("ko", "installSheet.stay")).toBe("웹으로 계속 볼게요");
        const store = sheet.slice(sheet.indexOf("const storeClicked = useCallback("), sheet.indexOf("useEffect(() => {", sheet.indexOf("const storeClicked")));
        expect(store).toContain("setRecord(recordAfterStoreClick(getRecord(), Date.now()));");
        // 회원은 스토어를 눌러도 닫지 않는다 — 깔고 돌아오면 '앱에서 열기'가 그대로 있어야 한다
        expect(sheet).toContain('const keepAfterStore = plan.actions.includes("open");');
        expect(store).toContain("if (keepAfterStore) return;");
    });

    // 스스로 올라오는 팝업 — 다른 것을 누르려던 손가락이 닿는 순간이 '닫음'(7일 쉼)이나 스토어 이동으로 세어지면 안 된다
    it("뜬 직후의 누름은 받지 않는다 — 닫기 · 스토어 · 앱에서 열기 전부", () => {
        expect(sheet).toContain("const OPEN_GUARD_MS = 600;");
        expect(sheet).toContain("const tooSoon = useCallback(() => Date.now() - openedAt.current < OPEN_GUARD_MS, []);");
        const tryOpen = sheet.slice(sheet.indexOf("const tryOpen = useCallback("), sheet.indexOf("const dismiss = useCallback("));
        expect(tryOpen.indexOf("openedAt.current = Date.now();")).toBeGreaterThan(0);
        expect(tryOpen.indexOf("openedAt.current = Date.now();")).toBeLessThan(tryOpen.indexOf("setOpen(true);"));
        expect(sheet).toMatch(/const userDismiss = useCallback\(\(\) => \{\s*if \(!tooSoon\(\)\) dismiss\(\);\s*\}, \[tooSoon, dismiss\]\);/);
        expect(sheet).toContain("if (tooSoon()) { e.preventDefault(); return; }");
        expect(sheet).toContain('if (tooSoon() || issuing.current || phase === "waiting") return;');
        // 스토어 링크 셋(휴대폰 하나 + PC 둘) 모두 같은 문을 지난다
        expect(sheet.match(/onClick=\{onStoreClick\}/g)).toHaveLength(3);
        expect(sheet).not.toMatch(/onClick=\{onStore\}/);
    });

    it("본 화면 · 머문 시간은 규칙의 함수로 센다 — 한 방문에 한 번만 띄운다", () => {
        expect(sheet).toContain("setVisit(visitAfterPath(getVisit(), path));");
        expect(sheet).toContain("const next = visitAfterSecond(before, live.current.path, visible);");
        expect(sheet).toContain("setVisit({ ...visit, shown: true });");
        expect(sheet).toContain("shownThisVisit: visit.shown,");
        expect(sheet).toContain("secondsOnPage: pageSeconds.current,");
        // 화면이 바뀌면 그 화면에 머문 시간은 0 부터
        expect(sheet).toMatch(/setVisit\(visitAfterPath\(getVisit\(\), path\)\);\s*pageSeconds\.current = 0;/);
    });

    it("모양 — 앱 아이콘 56px, 제목, 좋은 점 줄, 큰 단추 48px, 넓은 화면에서는 가운데 448px", () => {
        expect(sheet).toContain('src="/icon-192.png"');
        expect(sheet).toMatch(/width=\{56\}\s*height=\{56\}/);
        expect(sheet).toContain("h-14 w-14 shrink-0 rounded-[14px] border");
        expect(sheet).toContain('{t("installSheet.title")}');
        expect(dictValue("ko", "installSheet.title")).toBe("랭큐를 앱으로");
        expect(sheet).toContain('const BTN = "flex h-12 w-full items-center justify-center gap-2 rounded-[12px]');
        // 층(2026-10-06 검토): 예전 단언은 "z 를 올리지 않는다"였다 — 그런데 화면에 떠 있는 단추(골프 조인 목록의 '조인 만들기' FAB, z-60)가
        // 어두운 막과 팝업 단추 위로 올라와 가렸다. 한 층 올린다(z-70). **막도 같이** 올려야 한다 — 내용만 올리면 FAB 가 막 위에 뜬다.
        expect(sheet).toContain('<SheetContent side="bottom" hideClose overlayClassName="z-[70]" className="z-[70] mx-auto max-w-[448px] border-0 bg-transparent p-0 shadow-none outline-none">');
        expect(client("golf/pages/BookingList.tsx")).toMatch(/fixed right-6 z-\[60\]/);
        // 공용 시트가 하는 것과 같은 순서로 합쳐 본다 — 막도 내용도 z-50 이 남지 않고 z-70 하나다
        const ui = client("components/ui/sheet.tsx");
        const overlayBase = /"(fixed inset-0 z-50 bg-black\/40 [^"]+)"/.exec(ui)?.[1];
        const contentBase = /const sheetVariants = cva\(\s*"([^"]+)"/.exec(ui)?.[1];
        expect(overlayBase).toBeTruthy();
        expect(contentBase).toBeTruthy();
        expect(ui).toContain("<SheetOverlay className={overlayClassName} />");
        expect(twMerge(overlayBase, "z-[70]").split(/\s+/).filter((c) => /^z-/.test(c))).toEqual(["z-[70]"]);
        expect(twMerge(contentBase, "z-[70] mx-auto max-w-[448px]").split(/\s+/).filter((c) => /^z-/.test(c))).toEqual(["z-[70]"]);
        // 이 팝업보다 위에 떠야 하는 것들은 여전히 위다 — 토스트 · 앱 안내창. 가입 팝업(z-50)이 올라오면 이 팝업이 물러난다(위 시험)
        expect(client("components/ui/toast.tsx")).toContain("z-[100]");
        expect(client("components/AppDialog.tsx")).toContain("z-[1000]");
        expect(sheet.match(/\bz-\[\d+\]/g)).toEqual(["z-[70]", "z-[70]"]);
        // Radix Dialog 는 제목 · 설명이 없으면 경고를 낸다
        expect(sheet).toContain("<SheetTitle");
        expect(sheet).toContain("<SheetDescription");
    });

    it("색 — 골프(어두운 화면)면 어두운 시트: 리터럴 색만. 골프 테마가 바꿔 끼우는 유틸은 어디에도 없다", () => {
        expect(sheet).toContain('const golf = currentSport === "GOLF";');
        expect(sheet).toContain('const tone: SheetTone = golf ? "dark" : "light";');
        expect(sheet).not.toMatch(SWAPPED_UTIL);
        expect(sheet).not.toMatch(TINY_TEXT);
        expect(sheet).not.toMatch(/\btext-(?:xs|\[10px\]|\[11px\])\b/);
        const dark = sheet.slice(sheet.indexOf("    dark: {"), sheet.indexOf("const BTN ="));
        const classes = Array.from(dark.matchAll(/"([^"]+)"/g)).flatMap((m) => m[1].split(/\s+/));
        expect(classes.length).toBeGreaterThan(20);
        for (const cls of classes) {
            // 색을 정하는 클래스는 전부 #RRGGBB / #RRGGBBAA 리터럴
            expect(cls, cls).toMatch(/^(?:active:)?(?:bg|text|border)-\[#[0-9A-F]{6}(?:[0-9A-F]{2})?\]$/);
        }
        // 밝은 시트는 토큰
        const light = sheet.slice(sheet.indexOf("    light: {"), sheet.indexOf("    dark: {"));
        expect(light).toContain('panel: "bg-surface-1 border-surface-line text-ink-1"');
        expect(light).toContain('primary: "bg-brand text-brand-fg"');
    });

    // cn() 은 뒤에 온 클래스가 앞의 같은 종류를 지운다 — 테두리 굵기(border)와 테두리 색, 글자 크기와 글자 색이 같은 종류로 읽히면 한쪽이 사라진다
    it("단추 클래스를 합쳐도 서로를 지우지 않는다 — 테두리 굵기와 색, 글자 크기와 색", () => {
        const btn = /const BTN = "([^"]+)";/.exec(sheet)?.[1] ?? "";
        expect(btn).toContain("h-12");
        const pick = (tone: "light" | "dark", name: string) => {
            const block = tone === "light"
                ? sheet.slice(sheet.indexOf("    light: {"), sheet.indexOf("    dark: {"))
                : sheet.slice(sheet.indexOf("    dark: {"), sheet.indexOf("const BTN ="));
            return new RegExp(`\\b${name}: "([^"]+)"`).exec(block)?.[1] ?? "";
        };
        for (const tone of ["light", "dark"] as const) {
            const primary = pick(tone, "primary");
            const secondary = pick(tone, "secondary");
            expect(primary, tone).toBeTruthy();
            expect(secondary, tone).toBeTruthy();
            // 첫째 단추: cn(BTN, c.primary)
            const first = twMerge(btn, primary).split(/\s+/);
            for (const kept of ["h-12", "w-full", "rounded-[12px]", "text-[15px]", "font-bold", ...primary.split(" ")]) expect(first, `${tone} ${kept}`).toContain(kept);
            // 둘째 단추: cn(BTN, cn("border", c.secondary))
            const second = twMerge(btn, twMerge("border", secondary)).split(/\s+/);
            for (const kept of ["border", "h-12", "text-[15px]", ...secondary.split(" ")]) expect(second, `${tone} ${kept}`).toContain(kept);
            // PC 의 스토어 링크: cn(BTN, "border px-2 text-[13.5px]", c.secondary) — 작은 글자 · 좁은 안쪽 여백이 이긴다
            const small = twMerge(btn, "border px-2 text-[13.5px]", secondary).split(/\s+/);
            for (const kept of ["border", "px-2", "text-[13.5px]", ...secondary.split(" ")]) expect(small, `${tone} ${kept}`).toContain(kept);
            for (const gone of ["px-4", "text-[15px]"]) expect(small, `${tone} ${gone}`).not.toContain(gone);
            // 좋은 점 줄의 가는 선: cn("border-t", c.perkRule)
            const rule = twMerge("flex items-center gap-3 py-3", twMerge("border-t", pick(tone, "perkRule"))).split(/\s+/);
            expect(rule, tone).toContain("border-t");
            expect(rule, tone).toContain(pick(tone, "perkRule"));
            // 판: cn("… border border-b-0 …", c.panel)
            const panel = twMerge("relative rounded-t-[24px] border border-b-0", pick(tone, "panel")).split(/\s+/);
            for (const kept of ["border", "border-b-0", ...pick(tone, "panel").split(" ")]) expect(panel, `${tone} ${kept}`).toContain(kept);
        }
        expect(sheet).toContain('className={cn(BTN, primary ? c.primary : cn("border", c.secondary))}');
        expect(sheet).toContain('className={cn(BTN, "border px-2 text-[13.5px]", c.secondary)}');
    });

    // 예전 띠는 이 이벤트를 붙잡아(preventDefault) 안드로이드 크롬의 '홈 화면에 추가' 띠가 스스로 뜨지 않게 했다 — 그 일은 이어받는다
    it("브라우저의 PWA 설치 띠는 계속 막는다 — 스토어 앱 권유와 나란히 뜨지 않게. 우리가 PWA 설치를 권하지는 않는다", () => {
        expect(sheet).toMatch(/const hold = \(e: Event\) => e\.preventDefault\(\);\s*window\.addEventListener\("beforeinstallprompt", hold\);\s*return \(\) => window\.removeEventListener\("beforeinstallprompt", hold\);/);
        expect(sheet).not.toMatch(/\.prompt\(\)|userChoice/);
    });

    it("브라우저 기본 창을 쓰지 않는다 · 형제 key 가 겹치지 않는다", () => {
        expect(sheet).not.toMatch(/window\.(confirm|alert|prompt)\(|[^.\w](confirm|alert|prompt)\(/);
        // key 를 다는 곳은 좋은 점 줄 하나 — 사전 키(줄마다 다르다)
        expect(sheet.match(/\bkey=\{/g)).toHaveLength(1);
        expect(sheet).toContain("<li key={key}");
    });
});

describe("문구 — 다섯 언어, 확인된 것만", () => {
    const raw = client("components/hiq/AppInstallSheet.tsx");
    const sheet = code(raw);
    const keys = Array.from(new Set(Array.from(sheet.matchAll(/"(installSheet\.[A-Za-z]+)"/g)).map((m) => m[1]))).sort();

    it("화면이 쓰는 키는 다섯 언어 전부에 있다 — 화면에 한글이 직접 적혀 있지 않다", () => {
        expect(keys.length).toBeGreaterThanOrEqual(18);
        for (const locale of LOCALES) {
            for (const key of keys) {
                const v = dictValue(locale, key);
                expect(v, `${locale} ${key}`).toBeTruthy();
            }
        }
        // 사전에만 있고 화면이 안 쓰는 키가 없다
        const inDict = Array.from(client("lib/i18n/ko.ts").matchAll(/"(installSheet\.[A-Za-z]+)":/g)).map((m) => m[1]).sort();
        expect(inDict).toEqual(keys);
        // 화면 코드(주석 제외)에 한글 문구가 없다 — JSX 주석({/* … */})은 뺀다
        const noJsxComments = sheet.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
        expect(noJsxComments).not.toMatch(/[가-힣]/);
    });

    it("단추 문구 — 기기별 스토어, 앱에서 열기, 웹으로 계속", () => {
        expect(dictValue("ko", "installSheet.storeIos")).toBe("App Store에서 받기");
        expect(dictValue("ko", "installSheet.storeAndroid")).toBe("Google Play에서 받기");
        expect(dictValue("ko", "installSheet.open")).toBe("이미 깔았어요 · 앱에서 열기");
        // 2026-10-06 검토: 예전 문구("이 단추로 지금 계정 그대로 들어갈 수 있어요")는 앱이 깔려 있어야 한다는 말이 없었다 — 이 회원은 앱이 없는 채로
        // 첫째 단추('앱에서 열기')를 누르게 된다. 순서를 말한다: 먼저 받고, 돌아와서 누른다(Play 를 거쳐 처음 연 앱에도 로그인이 넘어가지 않는다)
        expect(dictValue("ko", "installSheet.kakaoNote")).toBe("앱에는 카카오 로그인이 아직 없어요. 앱을 먼저 받은 뒤 이 화면으로 돌아와 이 단추를 누르면 지금 계정 그대로 들어가요.");
        for (const locale of LOCALES) {
            expect(dictValue(locale, "installSheet.storeIos"), locale).toContain("App Store");
            expect(dictValue(locale, "installSheet.storeAndroid"), locale).toContain("Google Play");
            expect(dictValue(locale, "installSheet.kakaoNote"), locale).toContain(locale === "ko" ? "카카오" : "Kakao");
        }
    });

    it("술 · 돈 액수 · 내기 문구가 없다", () => {
        for (const locale of LOCALES) {
            for (const key of keys) {
                expect(dictValue(locale, key) ?? "", `${locale} ${key}`).not.toMatch(/술|내기|무료|[0-9][0-9,]*\s*원|₩|\$|free/i);
            }
        }
    });

    /** dir 아래의 화면 소스(.ts·.tsx, 시험 제외) */
    function sources(dir: string): string[] {
        return readdirSync(dir).flatMap((name) => {
            const p = join(dir, name);
            if (statSync(p).isDirectory()) return sources(p);
            return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [p] : [];
        });
    }

    // 좋은 점 줄은 코드가 뒷받침하는 것만 적는다 — 코드가 바뀌면 이 시험이 문구를 다시 보게 한다
    it("'푸시 알림은 앱에서만' — 웹 화면 코드에 웹 푸시 구독이 없다", () => {
        expect(dictValue("ko", "installSheet.perkPush")).toBe("푸시 알림은 앱에서만 울려요");
        const files = sources(ROOT);
        expect(files.length).toBeGreaterThan(300);
        const webPush = files.filter((p) => /pushManager\s*\.\s*subscribe|Notification\s*\.\s*requestPermission\s*\(/.test(readFileSync(p, "utf8")));
        expect(webPush).toEqual([]);
        // 앱의 푸시는 Capacitor 플러그인이다
        expect(client("lib/nativeBridge.ts")).toContain('from "@capacitor/push-notifications"');
    });

    // 2026-10-06 검토: 예전 시험은 "앱이 화면 켜 두기 플러그인을 쓴다"만 보고 '점수판을 쓰는 동안 화면이 꺼지지 않아요'를 앱만의 장점으로
    // 통과시켰다. 웹도 같은 훅의 웹 갈래(브라우저 Screen Wake Lock)로 이미 된다 — "앱에서만 되는 것"이 아니다. 그 줄을 걷어냈다.
    it("화면 켜 두기는 적지 않는다 — 웹도 브라우저 Wake Lock 으로 된다(좋은 점은 앱에서만 되는 두 줄뿐)", () => {
        const hook = client("hooks/useKeepAwake.ts");
        // 앱이 아니면(플러그인 없음) 브라우저 기능으로 간다 — 이 갈래가 있는 동안은 '앱에서만'이라고 적을 수 없다
        expect(hook).toContain("return holdWebWakeLock();");
        expect(hook).toMatch(/wakeLock/);
        expect(client("pages/hiq/game/[id].tsx")).toMatch(/useKeepAwake\(/);
        expect(sheet).not.toContain("perkAwake");
        expect(sheet).not.toContain("LucideSun");
        for (const locale of LOCALES) expect(client(`lib/i18n/${locale}.ts`), locale).not.toContain("installSheet.perkAwake");
        // 남은 두 줄
        const perks = sheet.slice(sheet.indexOf("const perks = ["), sheet.indexOf("const perkList = ("));
        expect(Array.from(perks.matchAll(/"(installSheet\.[A-Za-z]+)"/g), (m) => m[1])).toEqual(["installSheet.perkPush", "installSheet.perkHome"]);
        // 설명("앱에서만 되는 것을 더했어요")은 그 두 줄을 가리킨다
        expect(dictValue("ko", "installSheet.desc")).toBe("웹과 같은 화면에, 앱에서만 되는 것을 더했어요.");
    });
});

describe("옛 띠(HiqInstallBanner)는 껍데기만 남았다", () => {
    it("새 팝업을 부르기만 한다 — 자기 규칙 · 자기 모양이 없다", () => {
        const banner = code(client("components/hiq/HiqInstallBanner.tsx"));
        expect(banner).toContain('import { AppInstallSheet } from "./AppInstallSheet";');
        expect(banner).toContain("return <AppInstallSheet path={location} />;");
        expect(banner).not.toMatch(/className=|beforeinstallprompt|iosStoreUrl|androidStoreUrl|window\.open/);
        // 앱에는 게이트 하나만 붙어 있다(껍데기를 같이 붙이면 팝업이 두 번 뜬다)
        expect(client("App.tsx")).not.toContain("HiqInstallBanner");
    });
});
