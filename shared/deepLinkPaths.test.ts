// 앱으로 여는 주소 목록 — iOS(apple-app-site-association) 와 안드로이드(AndroidManifest 앱 링크) 가 같은지 지킨다.
//
// 왜 시험으로 두나: 두 파일은 형식이 달라(AASA 는 "/x*", 매니페스트는 pathPrefix="/x") 손으로 맞추다 한쪽만 고치기 쉽다.
// AASA 는 웹 파일이라 배포하면 **지금 깔린 앱에도** 적용되고, 매니페스트는 바이너리에 고정이다 — 어긋나면 한 플랫폼에서만
// 링크가 브라우저로 열린다.
// 짝: pathPrefix="/x" ↔ "/x*" · pathPrefix="/x/" ↔ "/x/*" · path="/x"(정확히 그 주소) ↔ "/x".
// android/ 는 gitignore 라 이 맥에만 있다 — 없는 곳에서는 매니페스트 대조만 건너뛴다(AASA 쪽 시험은 늘 돈다).

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = (p: string) => resolve(__dirname, "..", p);
const AASA_PATH = root("client/public/.well-known/apple-app-site-association");
const MANIFEST_PATH = root("android/app/src/main/AndroidManifest.xml");

type Component = { "/": string; exclude?: boolean };

const aasa = JSON.parse(readFileSync(AASA_PATH, "utf8"));
const components: Component[] = aasa.applinks.details.flatMap((d: any) => d.components);
const included = components.filter((c) => !c.exclude).map((c) => c["/"]);
const excluded = components.filter((c) => c.exclude).map((c) => c["/"]);

/** AASA 무늬 → 정규식. '*' 는 아무 글자 0개 이상, '?' 는 한 글자(애플 규칙). 주소의 경로 부분만 견준다. */
function toRegExp(pattern: string): RegExp {
    const body = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
    return new RegExp(`^${body}$`);
}

/** 이 경로가 앱으로 열리는가 — 애플은 위에서부터 처음 맞는 줄을 따른다(제외 줄이 먼저 맞으면 열지 않는다). */
function opensInApp(pathname: string): boolean {
    for (const c of components) {
        if (toRegExp(c["/"]).test(pathname)) return !c.exclude;
    }
    return false;
}

// 1.2(2026-09-11)의 18개 + 1.3(2026-10-06)에 더한 8개. 여기를 고치면 두 파일도 같이 고친다.
const EXPECTED = [
    "/club", "/club/*", "/crew*", "/join*", "/r/*", "/community*", "/store/*", "/stores*",
    "/pba-player/*", "/player/*", "/pba*", "/online-game*", "/world-ranking*", "/ranking*",
    "/briefing", "/briefing/*", "/game/*", "/dashboard*", "/history*", "/friends*",
    // 1.3 — 골프 공개(9/13) · 채팅 허브(9/21) · 대회 · 당구 용어. (위의 "/club" · "/briefing" 정확 일치도 1.3 에 더했다)
    "/golf/*", "/golf-ranking*", "/golfer/*", "/chat*", "/tournaments*", "/billiards/terms*",
];

describe("앱으로 여는 주소(apple-app-site-association)", () => {
    it("목록은 정해 둔 26개다 — 순서까지", () => {
        expect(included).toEqual(EXPECTED);
        expect(new Set(included).size).toBe(included.length);
    });

    it("앱 식별자는 팀 29U5FPY2FG 의 com.rankue.app 하나", () => {
        expect(aasa.applinks.details).toHaveLength(1);
        expect(aasa.applinks.details[0].appIDs).toEqual(["29U5FPY2FG.com.rankue.app"]);
    });

    it("제외 줄(/api · /auth)은 여는 줄보다 먼저 온다 — 애플은 처음 맞는 줄을 따른다", () => {
        expect(excluded).toEqual(["/api/*", "/auth/*"]);
        const firstInclude = components.findIndex((c) => !c.exclude);
        const lastExclude = components.map((c) => !!c.exclude).lastIndexOf(true);
        expect(lastExclude).toBeLessThan(firstInclude);
    });

    it("웹 로그인이 돌아오는 주소는 앱이 가로채지 않는다 — /auth/kakao 를 앱이 받으면 웹 카카오 로그인이 깨진다", () => {
        // 카카오 state 꾸러미는 로그인을 시작한 브라우저의 저장소에 있고 인가 코드는 한 번짜리다(shared/kakaoLogin · server/lib/kakaoAuth)
        for (const p of ["/auth/kakao", "/auth/kakao/", "/auth/anything"]) expect(opensInApp(p)).toBe(false);
        // 여는 줄만 따로 봐도 /auth 로 시작하는 주소에 맞는 무늬가 없다(제외 줄에 기대지 않는다)
        for (const pattern of included) expect(toRegExp(pattern).test("/auth/kakao")).toBe(false);
        expect(included.some((p) => p.startsWith("/auth"))).toBe(false);
    });

    it("로그인 화면(/) · API · 카드 이미지 · 파트너 · 관리자 · 약관류는 브라우저에 남는다", () => {
        for (const p of ["/", "/api/hiq/me", "/og/player/1.png", "/og/golf-round", "/partner/login", "/partner/subscription", "/admin", "/admin/dashboard", "/privacy", "/terms", "/support", "/account-delete", "/menu", "/settings", "/register"]) {
            expect(opensInApp(p)).toBe(false);
        }
    });

    it("골프는 '/golf/' 와 '/golf-ranking' 으로 나눠 적는다 — '/golf*' 한 줄로 넓히지 않는다", () => {
        expect(included).not.toContain("/golf*");
        expect(included).not.toContain("/golf");
        expect(opensInApp("/golf")).toBe(false);
        expect(opensInApp("/golfing")).toBe(false);
    });

    it("실제로 공유되는 주소가 앱으로 열린다", () => {
        const shared = [
            // 골프 — 골프장 페이지(공유 카드의 ?d=&t= 는 질의라 경로와 무관) · 지역 허브 · 조인/부킹 글 · 라운드 초대 · 랭킹 · 선수
            "/golf/course/some-cc", "/golf/courses", "/golf/courses/gyeonggi/yongin", "/golf/booking", "/golf/join/seoul", "/golf/urgent",
            "/golf/find/2in", "/golf/checklist", "/golf/terms", "/golf/terms/mulligan", "/golf/booking-list/abc", "/golf/game/new",
            "/golf-ranking", "/golfer/kpga/123",
            // 채팅 허브와 방
            "/chat", "/chat/crew/12", "/chat/dm/abc",
            // 대회 · 당구 용어
            "/tournaments", "/tournaments/pba/2026/T01", "/tournaments/umb/world-cup", "/billiards/terms", "/billiards/terms/bank-shot",
            // 목록 화면(끝에 빗금 없음) — 1.2 에서는 /club/ · /briefing/ 만 있어 브라우저로 열렸다
            "/club", "/briefing",
            // 전부터 열리던 것
            "/club/12", "/club/create", "/crew/12/chat", "/join/ABC123", "/r/abc", "/community", "/community/12", "/store/some-hall", "/stores",
            "/stores/SEOUL01", "/pba-player/1234", "/player/3c/123", "/pba", "/pba/records", "/online-game", "/world-ranking",
            "/world-ranking/country/KOR", "/ranking", "/briefing/2026-10-06", "/game/abc", "/game/result", "/dashboard", "/history", "/friends",
        ];
        for (const p of shared) expect(opensInApp(p), p).toBe(true);
    });

    it("PC 의 QR(/dashboard?install=1)이 여는 홈은 목록에 있다 — 빼면 앱 깐 휴대폰이 브라우저로 열린다", () => {
        expect(included).toContain("/dashboard*");
    });

    it("목록의 모든 줄은 화면(App.tsx 의 Route)이 있는 주소다 — 오타·없어진 화면을 잡는다", () => {
        const app = readFileSync(root("client/src/App.tsx"), "utf8");
        for (const pattern of included) {
            const exact = !pattern.endsWith("*");
            const prefix = exact ? pattern : pattern.slice(0, -1);
            const found = exact ? app.includes(`<Route path="${prefix}"`) : app.includes(`<Route path="${prefix}`);
            expect(found, pattern).toBe(true);
        }
    });
});

describe("안드로이드 앱 링크(AndroidManifest) — iOS 와 같은 목록", () => {
    const has = existsSync(MANIFEST_PATH);
    const manifest = has ? readFileSync(MANIFEST_PATH, "utf8") : "";
    // 주석을 걷어 낸 뒤 autoVerify 필터 한 덩어리만 본다(주석 안의 예시 글자에 걸리지 않게)
    const code = manifest.replace(/<!--[\s\S]*?-->/g, "");
    const filter = /<intent-filter android:autoVerify="true">([\s\S]*?)<\/intent-filter>/.exec(code)?.[1] ?? "";

    it.skipIf(!has)("앱 링크 필터는 https://www.rankue.co.kr 하나만 받는다", () => {
        expect(filter).not.toBe("");
        expect([...filter.matchAll(/android:scheme="([^"]+)"/g)].map((m) => m[1])).toEqual(["https"]);
        expect([...filter.matchAll(/android:host="([^"]+)"/g)].map((m) => m[1])).toEqual(["www.rankue.co.kr"]);
        // 정규식·고급 무늬는 쓰지 않는다 — 짝을 기계로 견줄 수 있는 두 가지(pathPrefix · path)만
        expect(filter).not.toMatch(/android:pathPattern|android:pathAdvancedPattern|android:pathSuffix/);
    });

    it.skipIf(!has)("경로 목록이 apple-app-site-association 과 같다(순서까지)", () => {
        const android = [...filter.matchAll(/android:(pathPrefix|path)="([^"]+)"/g)].map((m) => (m[1] === "pathPrefix" ? `${m[2]}*` : m[2]));
        expect(android).toEqual(included);
    });

    it.skipIf(!has)("/auth 로 시작하는 경로가 없다", () => {
        expect(filter).not.toMatch(/android:path(Prefix)?="\/auth/);
        expect(filter).not.toMatch(/android:path(Prefix)?="\/"/);
        expect(filter).not.toMatch(/android:path(Prefix)?="\/api/);
    });
});
