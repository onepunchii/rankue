import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
    KAKAO_REDIRECT_PATH, KAKAO_PROD_ORIGIN, KAKAO_SDK_URL, KAKAO_SDK_INTEGRITY, KAKAO_SDK_CROSSORIGIN,
    KAKAO_PENDING_TTL_MS, KAKAO_NICKNAME_MAX,
    kakaoRedirectUri, isAllowedKakaoOrigin, isAllowedKakaoRedirect, isKakaoOnlyAccount,
    newKakaoState, makeKakaoPending, parseKakaoPending, checkKakaoReturn, cleanKakaoNickname,
    type KakaoPending,
} from "./kakaoLogin.js";
import {
    SOCIAL_PHONE_PREFIX, DELETED_PHONE_PREFIX, isLoginPhone, isPlaceholderPhone, isKakaoSignupPhone, kakaoPhonePlaceholder,
} from "./loginPhone.js";

/**
 * 카카오 로그인 공용 규칙(2026-10-05 오너: "카카오도 오픈").
 * 서버는 화면이 보낸 redirectUri 를 카카오에 그대로 다시 보낸다 — 허용 목록이 유일한 방어라 여기서 촘촘히 본다.
 */
describe("상수 — 카카오 콘솔에 등록한 값과 글자까지 같아야 한다", () => {
    it("경로·운영 원본·SDK", () => {
        expect(KAKAO_REDIRECT_PATH).toBe("/auth/kakao");
        expect(KAKAO_PROD_ORIGIN).toBe("https://www.rankue.co.kr");
        expect(KAKAO_SDK_URL).toBe("https://t1.kakaocdn.net/kakao_js_sdk/2.8.3/kakao.min.js");
        expect(KAKAO_SDK_INTEGRITY).toBe("sha384-oroumrnFVE0xtgqyDZJARgERibXg2C28380uaUZz2kHDS5CR7tu20eGiOU6GkTpy");
        expect(KAKAO_SDK_CROSSORIGIN).toBe("anonymous");
        expect(KAKAO_PENDING_TTL_MS).toBe(10 * 60 * 1000);
    });

    it("화면 번들에 실리는 파일이다 — 환경변수를 읽지 않고 키처럼 생긴 값도 없다", () => {
        const src = readFileSync(resolve(__dirname, "kakaoLogin.ts"), "utf8");
        expect(src).not.toMatch(/process\.env\.|import\.meta\.env/);
        // 카카오 키는 32자 16진수다 — 실수로 붙여 넣은 값이 있으면 여기서 걸린다
        expect(src).not.toMatch(/\b[0-9a-f]{32}\b/);
    });
});

describe("kakaoRedirectUri", () => {
    it("원본 뒤에 경로를 붙인다(끝 슬래시는 떼고)", () => {
        expect(kakaoRedirectUri("https://www.rankue.co.kr")).toBe("https://www.rankue.co.kr/auth/kakao");
        expect(kakaoRedirectUri("https://www.rankue.co.kr/")).toBe("https://www.rankue.co.kr/auth/kakao");
        expect(kakaoRedirectUri("http://localhost:5177")).toBe("http://localhost:5177/auth/kakao");
    });
    it("만든 주소는 허용 목록을 통과한다 — localhost 는 개발(allowLocal)일 때만", () => {
        expect(isAllowedKakaoRedirect(kakaoRedirectUri(KAKAO_PROD_ORIGIN))).toBe(true);
        expect(isAllowedKakaoRedirect(kakaoRedirectUri("http://localhost:5002"), true)).toBe(true);
        expect(isAllowedKakaoRedirect(kakaoRedirectUri("http://localhost:5002"))).toBe(false);
    });
});

describe("isAllowedKakaoRedirect — 운영 원본만. http://localhost:<포트> 는 개발(allowLocal)일 때만", () => {
    const LOCALS = [
        "http://localhost:5177/auth/kakao",
        "http://localhost:5002/auth/kakao",
        "http://localhost:80/auth/kakao",
        "http://localhost:65535/auth/kakao",
    ];

    it("운영 원본은 언제나 받는다", () => {
        expect(isAllowedKakaoRedirect("https://www.rankue.co.kr/auth/kakao")).toBe(true);
        expect(isAllowedKakaoRedirect("https://www.rankue.co.kr/auth/kakao", false)).toBe(true);
        expect(isAllowedKakaoRedirect("https://www.rankue.co.kr/auth/kakao", true)).toBe(true);
    });

    // 2026-10-05 검토: 키가 한 벌이라 로컬 시험을 하려면 같은 카카오 앱에 localhost 를 등록하게 된다. 운영 서버까지
    // localhost 를 받아 주면 그 포트를 듣는 다른 프로그램이 받은 인가 코드를 운영 서버에서 쿠키로 바꿀 수 있다.
    it("localhost 는 기본이 닫힘이다 — 켜 달라고 한 쪽(개발)에서만 받는다", () => {
        for (const local of LOCALS) {
            expect(isAllowedKakaoRedirect(local), local).toBe(false);
            expect(isAllowedKakaoRedirect(local, false), local).toBe(false);
            expect(isAllowedKakaoRedirect(local, true), local).toBe(true);
            // 참 비슷한 값으로는 열리지 않는다(서버가 환경변수 글자를 그대로 넘기는 실수)
            for (const truthy of ["true", 1, "development", {}]) {
                expect(isAllowedKakaoRedirect(local, truthy as unknown as boolean), `${local} ${String(truthy)}`).toBe(false);
            }
        }
    });

    it("안 받는 것 — 개발이어도 마찬가지다", () => {
        for (const bad of [
            "https://rankue.co.kr/auth/kakao",                    // apex — 카카오에 등록되지 않았다
            "http://www.rankue.co.kr/auth/kakao",                 // http
            "https://www.rankue.co.kr:8443/auth/kakao",           // 포트
            "https://www.rankue.co.kr/auth/kakao/",               // 끝 슬래시
            "https://www.rankue.co.kr/auth/kakao?next=/x",        // 쿼리
            "https://www.rankue.co.kr/auth/kakao#x",              // 해시
            "https://www.rankue.co.kr/auth/kakaO",                // 대소문자
            "https://WWW.RANKUE.CO.KR/auth/kakao",                // 대문자 호스트(카카오에 보낼 글자가 달라진다)
            "https://www.rankue.co.kr.evil.example/auth/kakao",   // 뒤에 붙인 도메인
            "https://evil.example/https://www.rankue.co.kr/auth/kakao",
            "https://www.rankue.co.kr@evil.example/auth/kakao",   // 사용자 정보
            "https://evil.example/auth/kakao",
            "https://www.rankue.co.kr/other/auth/kakao",          // 다른 경로 밑
            "https://localhost:5177/auth/kakao",                  // localhost 는 http 만
            "http://localhost/auth/kakao",                        // 포트 없는 꼴
            "http://localhost:0/auth/kakao",
            "http://localhost:123456/auth/kakao",
            "http://localhost:5177.evil.example/auth/kakao",
            "http://localhost.evil.example:5177/auth/kakao",
            "http://127.0.0.1:5177/auth/kakao",
            "http://localhost:5177@evil.example/auth/kakao",
            " https://www.rankue.co.kr/auth/kakao",               // 앞 공백
            "https://www.rankue.co.kr/auth/kakao\n",              // 줄바꿈
            "/auth/kakao",
            "",
        ]) {
            expect(isAllowedKakaoRedirect(bad), JSON.stringify(bad)).toBe(false);
            expect(isAllowedKakaoRedirect(bad, true), JSON.stringify(bad)).toBe(false);
        }
        for (const bad of [null, undefined, 1, {}, ["https://www.rankue.co.kr/auth/kakao"]]) {
            expect(isAllowedKakaoRedirect(bad), JSON.stringify(bad)).toBe(false);
            expect(isAllowedKakaoRedirect(bad, true), JSON.stringify(bad)).toBe(false);
        }
    });

    it("원본 검사도 같은 규칙", () => {
        expect(isAllowedKakaoOrigin("https://www.rankue.co.kr")).toBe(true);
        expect(isAllowedKakaoOrigin("http://localhost:5177")).toBe(false);
        expect(isAllowedKakaoOrigin("http://localhost:5177", true)).toBe(true);
        expect(isAllowedKakaoOrigin("https://rankue.co.kr", true)).toBe(false);
        expect(isAllowedKakaoOrigin("capacitor://localhost", true)).toBe(false);
        expect(isAllowedKakaoOrigin(null, true)).toBe(false);
    });
});

/**
 * 전화번호 자리의 자리표시자(2026-10-05 검토). 소셜로 가입한 회원 행의 phone 은 `social:<제공자>:…`, 탈퇴 회원은 `del-…` 다.
 * 전화번호 로그인은 이 칸을 글자 그대로 비교하고 소셜 프로필에는 PIN 이 없어, 이 꼴을 '전화번호'로 받으면 PIN 없이 그 계정이 열렸다.
 */
describe("isLoginPhone — 전화번호 입구가 받아도 되는 글자", () => {
    it("전화번호는 받는다 — 꼴(자릿수·하이픈)은 여기서 따지지 않는다", () => {
        for (const ok of ["01012345678", "0212345678", "010-1234-5678", "+84 90 123 4567"]) {
            expect(isLoginPhone(ok), ok).toBe(true);
            expect(isPlaceholderPhone(ok), ok).toBe(false);
        }
    });

    it("소셜·탈퇴 자리표시자는 안 받는다 — 공백·대소문자를 바꿔도", () => {
        for (const bad of [
            "social:kakao:1234567890",
            "social:kakao:0b0e6f0e-8a3f-4d0c-9d43-1c1f0a2b3c4d",
            "social:google:108234567890123456789",
            "social:apple:000123.abcdef.4567",
            "social:",
            "del-0b0e6f0e-8a3",
            "del-",
            " social:kakao:1",
            "SOCIAL:KAKAO:1",
            "Del-abc",
        ]) {
            expect(isLoginPhone(bad), bad).toBe(false);
            expect(isPlaceholderPhone(bad), bad).toBe(true);
        }
    });

    it("빈 값·글자가 아닌 값도 안 받는다", () => {
        for (const bad of ["", "   ", null, undefined, 1012345678, {}, ["01012345678"], true]) {
            expect(isLoginPhone(bad), JSON.stringify(bad)).toBe(false);
        }
    });

    it("접두는 저장하는 쪽과 같은 글자다", () => {
        expect(SOCIAL_PHONE_PREFIX).toBe("social:");
        expect(DELETED_PHONE_PREFIX).toBe("del-");
        // 화면들이 소셜 회원을 가리는 검사(startsWith("social:"))가 그대로 통한다
        expect(kakaoPhonePlaceholder("x").startsWith(SOCIAL_PHONE_PREFIX)).toBe(true);
    });

    it("카카오 가입 회원의 자리표시자 — 회원번호가 아니라 넘겨받은 난수가 붙고, 로그인 입구는 받지 않는다", () => {
        const id = "0b0e6f0e-8a3f-4d0c-9d43-1c1f0a2b3c4d";
        const phone = kakaoPhonePlaceholder(id);
        expect(phone).toBe(`social:kakao:${id}`);
        expect(isLoginPhone(phone)).toBe(false);
        expect(isKakaoSignupPhone(phone)).toBe(true);
        // 전화번호 회원이 카카오를 '연결'한 것은 가입이 아니다 · 다른 제공자도 아니다
        for (const other of ["01012345678", "social:google:1", "social:apple:1", "del-abc", null, undefined, 5]) {
            expect(isKakaoSignupPhone(other), String(other)).toBe(false);
        }
    });

    it("화면 번들에 실릴 수 있는 파일이다 — 환경변수를 읽지 않는다", () => {
        const src = readFileSync(resolve(__dirname, "loginPhone.ts"), "utf8");
        expect(src).not.toMatch(/process\.env\.|import\.meta\.env/);
    });
});

describe("isKakaoOnlyAccount — 들어올 길이 카카오뿐인 계정(앱 설치 권유를 끈다)", () => {
    it("카카오만 연결된 계정", () => {
        expect(isKakaoOnlyAccount({ phone: false, google: false, apple: false, kakao: true })).toBe(true);
        expect(isKakaoOnlyAccount({ phone: false, google: false, apple: false, kakao: true, pin: false } as any)).toBe(true);
    });

    it("다른 길이 하나라도 있으면 아니다 — 앱에서 그 길로 같은 계정에 들어온다", () => {
        expect(isKakaoOnlyAccount({ phone: true, google: false, apple: false, kakao: true })).toBe(false);
        expect(isKakaoOnlyAccount({ phone: false, google: true, apple: false, kakao: true })).toBe(false);
        expect(isKakaoOnlyAccount({ phone: false, google: false, apple: true, kakao: true })).toBe(false);
    });

    it("기기에 남은 옛 '나' 답(kakao 칸이 없다)·비로그인은 아니다 — 예전처럼 권유한다", () => {
        expect(isKakaoOnlyAccount({ phone: false, google: false, apple: false })).toBe(false);
        expect(isKakaoOnlyAccount({ phone: true, google: false, apple: false })).toBe(false);
        expect(isKakaoOnlyAccount({ phone: false, google: false, apple: false, kakao: "true" })).toBe(false);
        expect(isKakaoOnlyAccount(undefined)).toBe(false);
        expect(isKakaoOnlyAccount(null)).toBe(false);
    });
});

describe("state 꾸러미", () => {
    const NOW = 1_800_000_000_000;

    it("state 는 32자 16진수이고 부를 때마다 다르다", () => {
        const a = newKakaoState();
        const b = newKakaoState();
        expect(a).toMatch(/^[0-9a-f]{32}$/);
        expect(b).toMatch(/^[0-9a-f]{32}$/);
        expect(a).not.toBe(b);
    });

    it("만들 때 돌아갈 주소를 거른다 — 우리 사이트 안의 경로만", () => {
        expect(makeKakaoPending("login", "/golf/join?x=1", NOW)).toMatchObject({ mode: "login", redirect: "/golf/join?x=1", at: NOW });
        expect(makeKakaoPending("login", "//evil.example", NOW).redirect).toBeNull();
        expect(makeKakaoPending("login", "https://evil.example/", NOW).redirect).toBeNull();
        expect(makeKakaoPending("link", null, NOW)).toMatchObject({ mode: "link", redirect: null });
        expect(makeKakaoPending("login", "/a", NOW, "fixed-state-0123456789").state).toBe("fixed-state-0123456789");
    });

    it("저장했다 꺼내면 그대로 돌아온다", () => {
        const p = makeKakaoPending("link", "/settings", NOW);
        expect(parseKakaoPending(JSON.stringify(p))).toEqual(p);
    });

    it("모양이 다르면 없던 것으로 친다", () => {
        const good = { state: "a".repeat(32), mode: "login", redirect: null, at: NOW };
        expect(parseKakaoPending(JSON.stringify(good))).toEqual(good);
        for (const bad of [
            null, undefined, "", "{", "null", "[]", "1", 5,
            JSON.stringify({ ...good, state: "" }),
            JSON.stringify({ ...good, state: "short" }),
            JSON.stringify({ ...good, state: "has space " + "a".repeat(20) }),
            JSON.stringify({ ...good, state: 123 }),
            JSON.stringify({ ...good, mode: "admin" }),
            JSON.stringify({ ...good, at: "어제" }),
            JSON.stringify({ ...good, at: null }),
            JSON.stringify({ mode: "login", at: NOW }),
        ]) expect(parseKakaoPending(bad), String(bad)).toBeNull();
    });

    it("꺼낼 때도 돌아갈 주소를 다시 거른다 — 저장소의 값은 믿지 않는다", () => {
        const raw = JSON.stringify({ state: "a".repeat(32), mode: "login", redirect: "//evil.example/x", at: NOW });
        expect(parseKakaoPending(raw)?.redirect).toBeNull();
        const raw2 = JSON.stringify({ state: "a".repeat(32), mode: "login", redirect: { path: "/x" }, at: NOW });
        expect(parseKakaoPending(raw2)?.redirect).toBeNull();
    });
});

describe("checkKakaoReturn — 내가 보낸 state 이고 10분 안일 때만", () => {
    const NOW = 1_800_000_000_000;
    const pending: KakaoPending = { state: "s".repeat(32), mode: "link", redirect: "/settings", at: NOW };

    it("같고 제때면 ok — mode 와 돌아갈 곳을 돌려준다", () => {
        expect(checkKakaoReturn(pending, pending.state, NOW + 5_000)).toEqual({ ok: true, mode: "link", redirect: "/settings" });
        expect(checkKakaoReturn(pending, pending.state, NOW + KAKAO_PENDING_TTL_MS)).toMatchObject({ ok: true });
    });

    it("꾸러미가 없다(새 탭·다른 브라우저·이미 한 번 썼다)", () => {
        expect(checkKakaoReturn(null, pending.state, NOW)).toEqual({ ok: false, reason: "no-pending" });
        expect(checkKakaoReturn(undefined, pending.state, NOW)).toEqual({ ok: false, reason: "no-pending" });
    });

    it("주소에 state 가 없다", () => {
        for (const s of [null, undefined, "", 0, ["x"]]) {
            expect(checkKakaoReturn(pending, s, NOW)).toEqual({ ok: false, reason: "no-state" });
        }
    });

    it("state 가 다르다 — 남이 만든 링크(CSRF)", () => {
        expect(checkKakaoReturn(pending, "x".repeat(32), NOW)).toEqual({ ok: false, reason: "state-mismatch" });
        expect(checkKakaoReturn(pending, pending.state + " ", NOW)).toEqual({ ok: false, reason: "state-mismatch" });
    });

    it("10분이 지났다 / 시계가 뒤로 갔다", () => {
        expect(checkKakaoReturn(pending, pending.state, NOW + KAKAO_PENDING_TTL_MS + 1)).toEqual({ ok: false, reason: "expired" });
        expect(checkKakaoReturn(pending, pending.state, NOW - 61_000)).toEqual({ ok: false, reason: "expired" });
        expect(checkKakaoReturn({ ...pending, at: Number.NaN }, pending.state, NOW)).toEqual({ ok: false, reason: "expired" });
        // 1분 안쪽의 어긋남은 봐준다
        expect(checkKakaoReturn(pending, pending.state, NOW - 30_000)).toMatchObject({ ok: true });
    });

    it("손으로 만든 꾸러미의 돌아갈 주소도 거른다", () => {
        const forged = { ...pending, redirect: "//evil.example" } as KakaoPending;
        expect(checkKakaoReturn(forged, pending.state, NOW)).toEqual({ ok: true, mode: "link", redirect: null });
    });
});

// 보이지 않는 글자는 소스에 직접 적지 않고 번호로 만든다(편집기·도구가 지우거나 바꿔 버린다)
const cp = (...codes: number[]) => String.fromCodePoint(...codes);
const NBSP = cp(0x00a0), IDEO_SPACE = cp(0x3000), ZWSP = cp(0x200b), BOM = cp(0xfeff), RLO = cp(0x202e), NUL = cp(0x0000);
const LINE_SEP = cp(0x2028), ISOLATE = cp(0x2066), ZWJ = cp(0x200d);

describe("cleanKakaoNickname", () => {
    it("공백을 한 칸으로 모으고 앞뒤를 자른다", () => {
        expect(cleanKakaoNickname("  홍   길동 ")).toBe("홍 길동");
        expect(cleanKakaoNickname("홍\n길\t동")).toBe("홍 길 동");
        expect(cleanKakaoNickname("Kim" + NBSP + IDEO_SPACE + "Minsu")).toBe("Kim Minsu");
    });

    it("동의하지 않았거나 비면 null", () => {
        for (const v of [undefined, null, "", "   ", "\n\t", ZWSP + BOM, NUL, 123, {}, ["홍길동"]]) {
            expect(cleanKakaoNickname(v), JSON.stringify(v)).toBeNull();
        }
    });

    it("40자로 자른다 — 이모지를 반으로 자르지 않는다", () => {
        expect(cleanKakaoNickname("가".repeat(60))).toBe("가".repeat(KAKAO_NICKNAME_MAX));
        const emoji = cleanKakaoNickname("🎱".repeat(60))!;
        expect(Array.from(emoji)).toHaveLength(KAKAO_NICKNAME_MAX);
        expect(emoji).toBe("🎱".repeat(KAKAO_NICKNAME_MAX));
        // 자른 자리가 공백이면 끝 공백을 남기지 않는다
        expect(cleanKakaoNickname("가".repeat(39) + " 나다라")).toBe("가".repeat(39));
    });

    it("제어 문자·방향 뒤집기는 지우고, 이모지를 묶는 결합자는 둔다", () => {
        expect(cleanKakaoNickname("홍" + RLO + "길동" + NUL)).toBe("홍 길동");
        expect(cleanKakaoNickname("홍" + LINE_SEP + "길" + ISOLATE + "동")).toBe("홍 길 동");
        const family = "👨" + ZWJ + "👩" + ZWJ + "👧";
        expect(cleanKakaoNickname(family + " 가족")).toBe(family + " 가족");
    });

    it("소스에 보이지 않는 글자가 박혀 있지 않다", () => {
        for (const f of ["kakaoLogin.ts", "kakaoLogin.test.ts"]) {
            const src = readFileSync(resolve(__dirname, f), "utf8");
            const hidden = Array.from(src).filter((ch) => {
                const c = ch.codePointAt(0)!;
                return (c < 0x20 && c !== 0x0a && c !== 0x09) || (c >= 0x7f && c <= 0xa0) || c === 0x200b || c === 0x200d
                    || c === 0x2028 || c === 0x2029 || (c >= 0x202a && c <= 0x202e) || (c >= 0x2066 && c <= 0x2069) || c === 0xfeff || c === 0x3000;
            });
            expect(hidden.map((ch) => "U+" + ch.codePointAt(0)!.toString(16)), f).toEqual([]);
        }
    });
});

/**
 * 화면 쪽(2026-10-05) — 로그인 단추·돌아오는 화면(/auth/kakao)·설정의 '연결'.
 * 화면 코드의 시험이지만 shared 에 둔다: vitest 가 client/src 에서는 sim·golf 만 읽어서, 소스를 읽어 규칙을 지킨다.
 */
describe("화면 쪽 규칙 — 소스를 읽어 지킨다", () => {
    const client = (p: string) => readFileSync(resolve(__dirname, "../client/src", p), "utf8");
    // 주석 줄은 빼고 본다(설명에 적힌 낱말에 걸리지 않게)
    const code = (s: string) => s.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
    const SCREEN_FILES = [
        "lib/kakaoLogin.ts", "pages/hiq/kakao-callback.tsx", "components/hiq/SocialLogin.tsx",
        "pages/hiq/landing.tsx", "pages/hiq/settings.tsx",
        // 가입·로그인 팝업도 카카오 안내 문구를 쓴다(2026-10-06 검토) — 빠져 있으면 팝업이 쓰는 키가 사전 검사에서 빠진다
        "components/hiq/LoginSheet.tsx",
    ];
    const lib = code(client("lib/kakaoLogin.ts"));
    const social = code(client("components/hiq/SocialLogin.tsx"));
    const callback = code(client("pages/hiq/kakao-callback.tsx"));

    it("SDK 태그 — 주소·integrity·crossorigin 은 shared 상수 그대로, 한 번만 넣고 한 번만 초기화한다", () => {
        expect(lib).toContain("s.src = KAKAO_SDK_URL;");
        expect(lib).toContain("s.integrity = KAKAO_SDK_INTEGRITY;");
        expect(lib).toContain("s.crossOrigin = KAKAO_SDK_CROSSORIGIN;");
        expect(lib.match(/document\.createElement\("script"\)/g)).toHaveLength(1);
        // 이미 떠 있거나 받는 중이면 태그를 또 넣지 않는다
        const fn = lib.slice(lib.indexOf("export function loadKakaoSdk"), lib.indexOf("const PENDING_STORES"));
        const tag = fn.indexOf('document.createElement("script")');
        expect(fn.indexOf("if (readySdk) return Promise.resolve(readySdk);")).toBeGreaterThan(0);
        expect(fn.indexOf("if (readySdk) return Promise.resolve(readySdk);")).toBeLessThan(tag);
        expect(fn.indexOf("if (sdkLoading) return sdkLoading;")).toBeLessThan(tag);
        // 이미 초기화돼 있으면 init 을 건너뛴다
        expect(fn).toContain("if (!sdk.isInitialized()) sdk.init(jsKey);");
        // 못 받으면 알린다(reject) — 실패를 기억하지 않아 다음에 누르면 다시 받는다
        expect(fn).toContain("s.onerror = ");
        expect(fn).toContain("sdkLoading = loading.catch((err) => { sdkLoading = null; throw err; });");
    });

    it("SDK 는 index.html 에 없다 — 화면 코드에도 주소를 직접 적지 않는다(shared 상수만)", () => {
        const html = readFileSync(resolve(__dirname, "../client/index.html"), "utf8");
        expect(html).not.toMatch(/kakao_js_sdk|kakaocdn|kakao\.min\.js/i);
        for (const f of SCREEN_FILES) expect(client(f), f).not.toMatch(/kakaocdn|kakao\.min\.js|sha384-/);
    });

    it("키는 환경변수 이름으로만 부른다 — 값이 소스에 없다", () => {
        expect(lib).toContain("const KAKAO_JS_KEY = import.meta.env.VITE_KAKAO_JS_KEY as string | undefined;");
        // 카카오 키는 32자 16진수다 — 실수로 붙여 넣은 값이 있으면 여기서 걸린다
        for (const f of SCREEN_FILES) expect(client(f), f).not.toMatch(/\b[0-9a-f]{32}\b/);
        // 화면은 서버 쪽 키 이름을 알 필요가 없다
        for (const f of SCREEN_FILES) expect(client(f), f).not.toMatch(/KAKAO_LOGIN_REST_KEY|KAKAO_LOGIN_CLIENT_SECRET|client_secret/);
    });

    // 2026-10-06 바뀐 것(오너: "카카오 로그인이 되는 앱 빌드를 만들어 올리고, 승인되면 카카오를 연다"): 예전 제목은 "스토어 앱 안이 아니고"였다.
    // 이제 앱 안에서도 **네이티브 카카오 플러그인이 든 바이너리**에서는 단추가 뜬다(한 줄이 늘었다 — 아래 native). 플러그인이 없는 앱(1.2 이하)은
    // 예전 줄(isNativeApp)에 그대로 걸려 숨는다. 네이티브 쪽 규칙의 시험은 shared/kakaoNative.test.ts.
    it("단추를 보일 조건 — 키가 있고 카카오에 등록된 주소일 때만. 스토어 앱 안에서는 네이티브 플러그인이 든 바이너리에서만", () => {
        expect(lib).toContain('import { isNativeApp } from "@/lib/nativeBridge";');
        const fn = lib.slice(lib.indexOf("export function kakaoLoginAvailable"), lib.indexOf("const SCRIPT_ID"));
        expect(fn).toContain("if (!KAKAO_JS_KEY || isNativeApp()) return false;");
        // 앱 안의 예외는 스위치 다음 · 예전 줄(앱이면 숨김) 앞에 있다 — 플러그인이 없으면 그대로 아래로 떨어진다
        const native = fn.indexOf("if (kakaoNativeAvailable()) return true;");
        expect(native).toBeGreaterThan(fn.indexOf("if (!KAKAO_OPEN) return false;"));
        expect(native).toBeLessThan(fn.indexOf("if (!KAKAO_JS_KEY || isNativeApp()) return false;"));
        // 닫혀 있는 동안에는 안내 문구·설정의 줄도 안 보인다(kakaoLoginOpen) — 앱 안은 단추를 못 쓰지만 안내는 보여 주는 자리라 따로 가른다
        expect(lib).toContain("export function kakaoLoginOpen(): boolean {");
        expect(lib).toContain("return KAKAO_OPEN && !!KAKAO_JS_KEY;");
        expect(code(client("pages/hiq/settings.tsx"))).toContain('...((locale === "ko" && kakaoLoginOpen()) || conn.kakao ? [{');
        // 여는 스위치(2026-10-06) — 새 앱 빌드가 승인될 때까지 꺼 둔다. 키보다 먼저 본다
        expect(fn).toContain("if (!KAKAO_OPEN) return false;");
        expect(lib).toContain('const KAKAO_OPEN = (import.meta.env.VITE_KAKAO_LOGIN_OPEN as string | undefined) === "1";');
        // 개발용 localhost 는 개발 서버(vite dev)에서만 연다 — 운영 빌드는 운영 원본에서만(2026-10-05 검토)
        expect(fn).toContain("return isAllowedKakaoOrigin(window.location.origin, import.meta.env.DEV);");
        // 화면 어디에서도 허용 목록을 손으로 켜지 않는다(true 를 박아 넣으면 운영 빌드에서 localhost 가 열린다)
        for (const f of SCREEN_FILES) expect(code(client(f)), f).not.toMatch(/isAllowedKakao(Origin|Redirect)\([^)]*,\s*true\)/);
    });

    it("한국어 화면에서만 보인다 — 로그인 단추는 맨 위, 다른 언어의 동작은 그대로", () => {
        // 부른 쪽이 끌 수 있다(kakao=false) — 매장 진입의 로그인 화면
        // 2026-10-06 가입·로그인 팝업(LoginSheet): prop 이 늘었다(redirect·onDone·tone) — 예전 단언은 prop 둘뿐인 한 줄 서명이었다.
        // 카카오 쪽 기본값(kakao = true)은 그대로이고, 새 prop 은 기본값이 없다(안 주면 로그인 화면의 예전 모양·동작).
        expect(social).toContain("export default function SocialLogin({ hint = true, kakao = true, redirect, onDone, tone }: SocialLoginProps) {");
        expect(social).toMatch(/interface SocialLoginProps \{[\s\S]*?\n  kakao\?: boolean;[\s\S]*?\n  redirect\?: string \| null;[\s\S]*?\n  onDone\?: \(\) => void;[\s\S]*?\n  tone\?: SocialTone;\n\}/);
        expect(social).toContain('const showKakao = kakao && locale === "ko" && kakaoLoginAvailable();');
        // 소셜을 쓸 수 있는가: 카카오는 locale 이 ko 일 때만 센다 — 구글 키 없는 영어 화면에 빈 소셜 묶음이 뜨지 않는다
        expect(social).toContain('return isNativeApp() || !!GOOGLE_CLIENT_ID || (locale === "ko" && kakaoLoginAvailable());');
        // 웹: 구글도 카카오도 없으면 아무것도 그리지 않는다
        const web = social.slice(social.indexOf("if (!GOOGLE_CLIENT_ID && !showKakao) return null;"));
        expect(web.length).toBeGreaterThan(0);
        const kakaoAt = web.indexOf("{showKakao && (");
        expect(kakaoAt).toBeGreaterThan(0);
        expect(kakaoAt).toBeLessThan(web.indexOf("ref={googleBtnRef}"));
        expect(kakaoAt).toBeLessThan(web.indexOf("onClick={handleAppleWeb}"));
        // 앱 안 단추 묶음(위쪽 두 갈래).
        // 2026-10-06 바뀐 것: 예전 단언은 "두 갈래 어디에도 카카오가 없다"였다. 새 앱(네이티브 카카오 플러그인)에는 카카오 단추가 생겼다 —
        //  - 옛 앱 안내 갈래(소셜 플러그인조차 없는 바이너리)에는 여전히 카카오가 없다.
        //  - 앱 갈래의 카카오는 showKakao 안에만 있고(앱 안에서는 플러그인 + 스위치일 때만 참 — shared/kakaoNative.test.ts), 웹의 길(handleKakao)이 아니라
        //    네이티브 길(nativeKakaoSignIn)로 간다. 구글 단추보다 위다.
        const appAt = social.indexOf("if (inApp) {");
        const oldApp = social.slice(social.indexOf("if (inApp && !nativeSocial) {"), appAt);
        const appBranch = social.slice(appAt, social.indexOf("if (!GOOGLE_CLIENT_ID && !showKakao) return null;"));
        expect(appAt).toBeGreaterThan(0);
        expect(oldApp).not.toMatch(/kakao/i);
        const appKakao = appBranch.indexOf("{showKakao && (");
        expect(appKakao).toBeGreaterThan(0);
        expect(appBranch.match(/\{showKakao && \(/g)).toHaveLength(1);
        expect(appBranch.indexOf("onClick={nativeKakaoSignIn}")).toBeGreaterThan(appKakao);
        expect(appBranch.indexOf('onClick={() => nativeSignIn("google")}')).toBeGreaterThan(appBranch.indexOf("onClick={nativeKakaoSignIn}"));
        expect(appBranch).not.toContain("handleKakao");
        expect(appBranch).not.toContain("startKakao(");
        // 카카오 디자인 가이드 색
        expect(web).toContain("bg-[#FEE500]");
        expect(web).toContain("text-[#191919]");
        expect(web).toContain('{t("login.kakao")}');
        // 로그인 화면에 실려 온 ?redirect= 를 들려 보낸다.
        // 2026-10-06 가입·로그인 팝업: 예전 단언은 주소를 그 자리에서 읽는 한 줄이었다. 이제 returnTo() 한 곳이 정한다 —
        // 부른 쪽이 준 값(redirect prop, 팝업)이 먼저이고, 안 줬으면(로그인 화면) 예전처럼 주소의 ?redirect= 다.
        expect(social).toContain('startKakao({ mode: "login", redirect: returnTo() });');
        const returnTo = social.slice(social.indexOf("const returnTo = useCallback("), social.indexOf("const finishInPlace = useCallback("));
        expect(returnTo).toContain("const fromCaller = given.current.redirect;");
        expect(returnTo).toContain('return fromCaller !== undefined ? fromCaller : new URLSearchParams(window.location.search).get("redirect");');
        // 카카오 단추의 높이만 팝업에서 48px 로 맞춘다 — 색·모서리·심볼·누름 동작은 한 벌이다
        expect(web).toContain('className={`w-full ${sheet ? "h-12" : "h-[44px]"} rounded-[12px] bg-[#FEE500] text-[#191919] ');
    });

    it("로그인 화면 순서 — 한국어 웹은 소셜 묶음이 먼저, 앱 안·매장 진입·비밀번호 단계·다른 언어는 예전 그대로", () => {
        const landing = code(client("pages/hiq/landing.tsx"));
        expect(landing).toContain('const storeEntry = resolveStoreSlug() !== "hiq";');
        expect(landing).toContain('const kakaoFirst = locale === "ko" && kakaoLoginAvailable() && !storeEntry;');
        expect(landing).toContain('const showPhone = requiresPassword || (phoneMode ?? (locale === "ko" ? !kakaoFirst : !socialLoginAvailable(locale)));');
        // 전화번호 길은 없애지 않는다 — 소셜 화면 아래 작은 글씨, 전화 화면에서 돌아오는 길
        expect(landing).toContain('{t(kakaoFirst ? "login.phoneLogin" : "login.phoneLoginLink")}');
        expect(landing).toContain("onClick={() => setPhoneMode(true)}");
        expect(landing).toContain("onClick={() => setPhoneMode(false)}");
        expect(landing).toContain('{t("login.socialBackLink")}');
    });

    // 2026-10-05 검토: 매장 화이트라벨(?store=) 화면에서 카카오를 눌렀다 취소·실패하면 매장 표시가 사라진 기본 로그인 화면으로
    // 돌아왔고, 거기서 번호를 넣은 매장 회원이 '미가입'으로 판정됐다. 카카오 로그인은 어차피 매장과 무관한 글로벌 회원을 만든다.
    it("매장 진입의 로그인 화면에는 카카오 단추가 없다", () => {
        const landing = code(client("pages/hiq/landing.tsx"));
        // SocialLogin 을 그리는 두 곳 모두 매장 진입이면 카카오를 끈다
        const uses = landing.match(/<SocialLogin [^>]*\/>/g) ?? [];
        expect(uses).toHaveLength(2);
        for (const use of uses) expect(use, use).toContain("kakao={!storeEntry}");
        // 전화 카드 아래 소셜 묶음을 둘지: 매장 진입은 카카오를 세지 않는다 — 구글 키 없이 카카오만 있는 배포에서 '또는' 줄만 남지 않게
        expect(landing).toContain("const socialBelowPhone = socialLoginAvailable(storeEntry ? undefined : locale);");
        expect(landing).toContain(") : socialBelowPhone && (");
    });

    // 2026-10-05 검토: 전화번호로 가입한 기존 회원이 새 첫 화면에서 카카오를 먼저 누르면 빈 계정이 생겨 기록이 갈린다.
    // 스토어 앱에는 카카오 단추가 없어, 카카오로 가입한 사람이 앱에서 다른 방법으로 들어오면 역시 새 계정이 생긴다.
    it("계정이 갈리기 전에 알린다 — 카카오 우선 화면의 기존 회원 안내 · 앱 안의 '카카오 가입자는 웹에서'", () => {
        const landing = code(client("pages/hiq/landing.tsx"));
        const hint = landing.indexOf('{t("login.phoneExistingHint")}');
        expect(hint).toBeGreaterThan(0);
        // 카카오 우선 화면에서만, 전화번호 로그인 글씨 바로 위에
        expect(landing.lastIndexOf("{kakaoFirst && (", hint)).toBeGreaterThan(0);
        expect(landing.indexOf('{t(kakaoFirst ? "login.phoneLogin" : "login.phoneLoginLink")}')).toBeGreaterThan(hint);
        // 앱 안의 한국어 화면: 기존 판별(isNativeApp)로 — 전화 카드 아래, PIN 단계에서는 빼고
        // 2026-10-06 바뀐 것: 조건 끝에 `&& !kakaoNativeAvailable()` 가 붙었다 — 네이티브 카카오 단추가 있는 새 앱(1.3~)에는 "앱에는 아직
        // 카카오 로그인이 없어"가 거짓말이 된다. 플러그인이 없는 앱(1.2 이하)에는 예전과 같은 조건으로 그대로 뜬다.
        expect(landing).toContain('import { isNativeApp } from "@/lib/nativeBridge";');
        expect(landing).toContain('const kakaoWebOnlyHint = kakaoLoginOpen() && locale === "ko" && isNativeApp() && !kakaoNativeAvailable();');
        expect(landing).toContain("{!requiresPassword && kakaoWebOnlyHint && (");
        expect(landing).toContain('{t("login.kakaoWebOnly")}');
        const ko = client("lib/i18n/ko.ts");
        // 두 안내 모두 무슨 일이 생기는지(새 계정)를 말한다 — "전화번호로 로그인"만으로는 왜 그래야 하는지 알 수 없다
        expect(ko).toMatch(/"login\.phoneExistingHint": "[^"]*전화번호로 로그인[^"]*새 계정[^"]*"/);
        expect(ko).toMatch(/"login\.kakaoWebOnly": "[^"]*www\.rankue\.co\.kr[^"]*새 계정[^"]*"/);
    });

    // 2026-10-06 검토: '로그인'을 누르면 이제 로그인 화면이 아니라 가입·로그인 팝업이 먼저 뜬다. 위 두 안내는 로그인 화면에만 있어서,
    // 팝업에서 소셜 단추를 누르는 사람은 안내를 못 본 채 새 계정이 만들어진다 — 스위치가 켜지는 순간 드러날 구멍이었다.
    it("팝업(LoginSheet)에서도 계정이 갈리기 전에 알린다 — 로그인 화면과 같은 조건 · 같은 문구", () => {
        const sheet = code(client("components/hiq/LoginSheet.tsx"));
        // 카카오 단추가 팝업에 실제로 그려질 때만 기존 회원 안내 — SocialLogin 에 넘기는 kakao={!storeEntry} 와 같은 값으로 묶는다
        expect(sheet).toContain('const kakaoShown = !storeEntry && locale === "ko" && kakaoLoginAvailable();');
        expect(sheet).toContain("<SocialLogin hint={false} kakao={!storeEntry} ");
        // 2026-10-06: 로그인 화면과 같이 `&& !kakaoNativeAvailable()` 가 붙었다(네이티브 카카오 단추가 있는 새 앱에는 띄우지 않는다)
        expect(sheet).toContain('const kakaoWebOnlyHint = kakaoLoginOpen() && locale === "ko" && isNativeApp() && !kakaoNativeAvailable();');
        const hint = sheet.indexOf('{t("login.phoneExistingHint")}');
        expect(hint).toBeGreaterThan(0);
        expect(sheet.lastIndexOf("{kakaoShown && (", hint)).toBeGreaterThan(0);
        // 안내가 가리키는 길(전화번호 단추)이 바로 아래다
        expect(sheet.indexOf("onClick={toPhone}", hint)).toBeGreaterThan(hint);
        const webOnly = sheet.indexOf('{t("login.kakaoWebOnly")}');
        expect(webOnly).toBeGreaterThan(hint);
        expect(sheet.lastIndexOf("{kakaoWebOnlyHint && (", webOnly)).toBeGreaterThan(hint);
        // 두 안내는 한 번씩만 그린다
        expect(sheet.match(/t\("login\.phoneExistingHint"\)/g)).toHaveLength(1);
        expect(sheet.match(/t\("login\.kakaoWebOnly"\)/g)).toHaveLength(1);
        // 스위치가 꺼져 있으면 두 조건 모두 false 다 — 닫혀 있는 동안 '카카오'라는 말이 팝업 어디에도 나오지 않는다
        expect(lib).toMatch(/export function kakaoLoginAvailable\(\): boolean \{\s*if \(!KAKAO_OPEN\) return false;/);
        expect(lib).toMatch(/export function kakaoLoginOpen\(\): boolean \{\s*return KAKAO_OPEN && !!KAKAO_JS_KEY;/);
        // 한국어 팝업의 순서도 로그인 화면과 같다: 카카오가 되는 곳만 소셜이 먼저, 아니면(앱 안 · 스위치 꺼짐 · 매장 진입) 전화번호가 먼저
        expect(sheet).toContain('const phoneFirst = locale === "ko" ? !kakaoShown : !social;');
    });

    // 2026-10-06 바뀐 것: 예전 제목은 "한국어 + 웹 + …"이었고 onLink 는 웹의 길 하나였다. 네이티브 카카오 플러그인이 든 새 앱에서도 연결할 수 있게
    // 되어(kakaoLoginAvailable 이 그 앱에서 참) onLink 가 둘로 갈린다 — 앱은 화면을 떠나지 않는 길(startNativeLink), 웹은 예전 그대로다.
    it("설정의 '연결' — 한국어 + 카카오 단추를 쓸 수 있는 곳 + 프로필과 PIN 이 있는 회원에게만. 웹은 같은 길로(mode=link) 다녀오고, 새 앱은 네이티브 길로", () => {
        const settings = code(client("pages/hiq/settings.tsx"));
        // PIN 이 있는 계정만(2026-10-05 검토): 연결은 PIN 으로 본인을 확인한다. 옛 '나' 답에는 pin 칸이 없어 === true 로 본다
        expect(settings).toContain('const canLinkKakao = locale === "ko" && kakaoLoginAvailable() && !!member?.profileId && conn.pin === true && !conn.kakao;');
        expect(settings).toContain('onLink: canLinkKakao ? (kakaoNative ? () => { void startNativeLink(); } : () => startKakao({ mode: "link", redirect: "/settings" })) : undefined,');
        expect(settings).toContain("const kakaoNative = kakaoNativeAvailable();");
        expect(settings).toContain("linked: !!conn.kakao");
        expect(client("hooks/useAuth.ts")).toMatch(/connections\?: \{[^}]*kakao\?: boolean[^}]*pin\?: boolean[^}]*\}/);
    });

    it("설정의 '해제' — PIN 이 있는 전화번호 계정에서만, PIN 을 받아 DELETE 로 부른다. 브라우저 기본 창을 쓰지 않는다", () => {
        const settings = code(client("pages/hiq/settings.tsx"));
        // 카카오로 가입한 계정(phone 칸이 자리표시자 — conn.phone 이 거짓)은 떼면 들어올 길이 없다
        expect(settings).toContain("const canUnlinkKakao = !!conn.kakao && conn.pin === true && !!conn.phone;");
        expect(settings).toContain("onUnlink: canUnlinkKakao ?");
        expect(settings).toContain('await apiRequest("/api/hiq/social/kakao/link", { method: "DELETE", body: { pin: unlinkPin } });');
        // PIN 은 숫자만·여덟 자까지(로그인 화면과 같은 규칙), 네 자가 안 되면 보내지 않는다
        expect(settings).toContain('onChange={(e) => setUnlinkPin(e.target.value.replace(/[^0-9]/g, "").slice(0, 8))}');
        expect(settings).toContain("if (unlinking || unlinkPin.length < 4) return;");
        // 끝나면 PIN 을 지우고 '나'를 다시 받는다
        const fn = settings.slice(settings.indexOf("const unlinkKakao = async () => {"), settings.indexOf("const kakaoLinkOnWebHint"));
        expect(fn).toContain('setUnlinkPin("");');
        expect(fn).toContain('await queryClient.invalidateQueries({ queryKey: ["/api/hiq/me"] });');
        // 서버가 만든 문구만 그대로 보여 준다
        expect(fn).toContain('e?.data?.success === false && typeof e.data.message === "string"');
        expect(settings).not.toMatch(/window\.(confirm|alert|prompt)\(|[^.\w](confirm|alert|prompt)\(/);
    });

    // 2026-10-05 검토: 앱 안에서는 카카오 줄이 '미연결'로만 보이고 설명이 없었다. "웹에서 연결"만 적으면 웹의 첫 단추
    // '카카오로 시작하기'를 누르게 되고 그러면 빈 새 계정이 생긴다 — 문구에 "전화번호로 로그인한 뒤"가 들어 있어야 한다.
    it("앱 안의 설정 — 카카오 연결은 '웹에서 전화번호로 로그인한 뒤'라고 알린다(연결할 수 있는 회원에게만)", () => {
        const settings = code(client("pages/hiq/settings.tsx"));
        // 2026-10-06 바뀐 것: `!kakaoNative` 가 끼었다 — 새 앱(네이티브 카카오 플러그인)은 이 줄에 '연결' 단추가 있어 "웹에서"라고 말하지 않는다.
        // 플러그인이 없는 앱(1.2 이하)에는 예전 조건 그대로 뜬다.
        expect(settings).toContain('const kakaoLinkOnWebHint = kakaoLoginOpen() && isNativeApp() && !kakaoNative && locale === "ko" && !!member?.profileId && conn.pin === true && !!conn.phone && !conn.kakao;');
        expect(settings).toContain('{t("settings.kakaoLinkOnWeb")}');
        expect(client("lib/i18n/ko.ts")).toMatch(/"settings\.kakaoLinkOnWeb": "[^"]*www\.rankue\.co\.kr[^"]*전화번호로 로그인한 뒤[^"]*"/);
    });

    // 2026-10-05 검토: 들어올 길이 카카오뿐인 회원이 설치 권유를 따라 앱을 깔면 자기 계정으로 들어갈 길이 없다
    //
    // 2026-10-06 바뀐 것(오너: "앱 설치 팝업창 … 지금 팝업보다 잘" · "앱에서 열기도"): 떠 있는 배너(HiqInstallBanner)가 팝업(AppInstallSheet)으로
    // 바뀌면서 이 단언이 둘로 갈렸다. 예전에는 카드·배너 둘 다 `if (!… || kakaoOnly) return null;` 이었다.
    //  - 본문 끝의 카드(AppInstallCard)는 그대로 — 스토어로만 보내는 카드라 이 회원에게는 여전히 막다른 길이다.
    //  - 팝업은 이 회원에게 숨지 않는다. 웹의 로그인을 앱으로 넘겨주는 '앱에서 열기'가 생겨서, 그 단추를 **첫째**로 올리고
    //    "앱에는 카카오 로그인이 아직 없어요…" 한 줄을 붙인다. '앱에서 열기'가 없는 PC 에서는 예전처럼 띄우지 않는다.
    //    (모양을 정하는 규칙과 그 시험은 shared/installPrompt · shared/installPrompt.test.ts)
    it("앱 설치 권유 — 카카오로만 들어오는 회원: 카드는 띄우지 않고, 팝업은 '앱에서 열기'를 첫째 단추로 준다", () => {
        const card = code(client("components/hiq/AppInstallCard.tsx"));
        expect(card).toContain('import { isKakaoOnlyAccount } from "@shared/kakaoLogin";');
        expect(card).toContain("const kakaoOnly = isKakaoOnlyAccount(member?.connections);");
        expect(card).toMatch(/if \(![A-Za-z]+ \|\| kakaoOnly\) return null;/);

        const sheet = code(client("components/hiq/AppInstallSheet.tsx"));
        expect(sheet).toContain('import { isKakaoOnlyAccount } from "@shared/kakaoLogin";');
        expect(sheet).toContain("const kakaoOnly = isKakaoOnlyAccount(member?.connections);");
        // 숨기지 않고 모양을 바꾼다 — 가르는 값을 규칙에 넘긴다
        expect(sheet).not.toMatch(/kakaoOnly\) return null;/);
        expect(sheet).toContain("installSheetPlan({ device: env.device, loggedIn: isLoggedIn, kakaoOnly })");
        expect(sheet).toContain('{t("installSheet.kakaoNote")}');
        // 옛 배너 파일은 새 팝업을 부르는 껍데기만 남았다 — 자기 규칙이 없다
        const banner = code(client("components/hiq/HiqInstallBanner.tsx"));
        expect(banner).toContain("<AppInstallSheet path={location} />");
        expect(banner).not.toContain("kakaoOnly");
    });

    // 2026-10-05 검토: 언어가 "ko" 로 시작했다가 붙은 뒤에 바뀌어서, 다른 언어 회원이 /settings 를 직접 열면 첫 그림이
    // 한국어로 판정돼 카카오 줄이 한 번 그려지고 SDK 가 실렸다. 첫 그림부터 진짜 언어로 시작한다.
    it("언어는 첫 그림부터 정해져 있다 — '한국어 화면에서만'인 것이 다른 언어에서 한 번 켜지지 않게", () => {
        const i18n = code(client("lib/i18n/index.tsx"));
        expect(i18n).toContain("const [locale, setLocaleState] = useState<Locale>(resolveInitialLocale);");
        expect(i18n).not.toContain('useState<Locale>("ko")');
        const fn = i18n.slice(i18n.indexOf("function resolveInitialLocale"), i18n.indexOf("export function I18nProvider"));
        // 순서: URL ?lang= → 저장된 선택 → 기기 언어. 읽기만 한다(저장은 effect 가 한다)
        const url = fn.indexOf("const fromUrl = localeFromUrl();");
        const saved = fn.indexOf("localStorage.getItem(STORAGE)");
        const device = fn.indexOf("detectLocale()");
        expect(url).toBeGreaterThan(0);
        expect(saved).toBeGreaterThan(url);
        expect(device).toBeGreaterThan(saved);
        expect(fn).not.toContain("setItem(");
        // ?lang= 으로 온 언어를 저장하는 일은 그대로 남아 있다
        expect(i18n).toContain("localStorage.setItem(STORAGE, fromUrl)");
    });

    it("카카오로 보낼 때 — 난수 state 를 꾸러미로 남긴 뒤에 보낸다. 팝업은 쓰지 않는다", () => {
        const fn = lib.slice(lib.indexOf("export async function startKakao"), lib.indexOf("export function useKakaoStart"));
        // SDK 가 이미 떠 있으면 await 없이 간다(카카오톡 앱 열기는 누른 그 순간 안에서)
        expect(fn).toContain("const sdk = readySdk ?? await loadKakaoSdk();");
        const make = fn.indexOf("const pending = makeKakaoPending(opts.mode, opts.redirect ?? null, Date.now(), newKakaoState());");
        const save = fn.indexOf('if (!savePending(pending)) throw new Error("kakao: storage unavailable");');
        const go = fn.indexOf("sdk.Auth.authorize({ redirectUri: kakaoRedirectUri(window.location.origin), state: pending.state });");
        expect(make).toBeGreaterThan(0);
        expect(save).toBeGreaterThan(make);
        expect(go).toBeGreaterThan(save);
        for (const f of SCREEN_FILES.slice(0, 2)) expect(code(client(f)), f).not.toMatch(/window\.open\(|Auth\.login\(/);
        // 두 번 누름 방지 + 카카오에서 '뒤로' 왔을 때 다시 누를 수 있게
        const hook = lib.slice(lib.indexOf("export function useKakaoStart"));
        expect(hook).toContain("if (lock.current) return;");
        expect(hook).toContain('window.addEventListener("pageshow", release);');
        // 단추가 보이는 화면에서만 SDK 를 미리 받는다
        expect(hook).toContain("if (shown) void loadKakaoSdk().catch(() => undefined);");
    });

    // 2026-10-05 검토: 카카오는 문서를 떠나는 로그인이다. 새 탭·새 문서에서 끝낸 뒤 떠나 있던 화면이 되살아나면 단추만 풀리고
    // 로그인 폼이 그대로였다("로그인했는데 로그인이 안 됐다고 나온다"). 되살아난 화면이 '나'를 다시 묻는다.
    it("카카오로 보냈던 화면이 되살아나면 부른 화면에 알린다 — 카카오를 누르지 않은 탭 전환에는 알리지 않는다", () => {
        const hook = lib.slice(lib.indexOf("export function useKakaoStart"));
        expect(hook).toContain("export function useKakaoStart(shown: boolean, onFail: () => void, onReturn?: () => void)");
        const release = hook.slice(hook.indexOf("const release = () => {"), hook.indexOf("const onVisible"));
        // 잠금이 걸려 있었을 때만(= 이 문서가 카카오로 보냈다) — 풀기 전에 읽어 둔다
        const was = release.indexOf("const wasAway = lock.current;");
        const unlock = release.indexOf("lock.current = false;");
        const tell = release.indexOf("if (wasAway) onReturnRef.current?.();");
        expect(was).toBeGreaterThan(0);
        expect(unlock).toBeGreaterThan(was);
        expect(tell).toBeGreaterThan(unlock);
        // bfcache 로 되살아남(pageshow)·숨었다 다시 보임(visibilitychange) 둘 다 같은 길
        expect(hook).toContain('const onVisible = () => { if (document.visibilityState === "visible") release(); };');
        // 시작에 실패하면 잠금을 풀어 둔다 — 그 뒤의 탭 전환을 '다녀옴'으로 세지 않는다
        const start = hook.slice(hook.indexOf("const start = useCallback("));
        expect(start.indexOf("lock.current = false;")).toBeGreaterThan(start.indexOf("startKakao(opts).catch("));

        // 로그인 화면: 로그인돼 있으면 '나'를 새로 받은 **뒤에** 보던 곳이나 홈으로(landing 의 로그인 확인과 같은 규칙)
        const back = social.slice(social.indexOf("const onKakaoReturn = useCallback("), social.indexOf("const { busy: kakaoBusy, start: startKakao }"));
        const ask = back.indexOf('await fetch("/api/hiq/me", { credentials: "include" })');
        const stop = back.indexOf("if (!me.ok) return;");
        const fresh = back.indexOf("await refreshAfterLogin();");
        const move = back.indexOf('setLocation(safeReturnPath(new URLSearchParams(window.location.search).get("redirect")) ?? "/dashboard", { replace: true });');
        expect(ask).toBeGreaterThan(0);
        expect(stop).toBeGreaterThan(ask);
        expect(fresh).toBeGreaterThan(stop);
        expect(move).toBeGreaterThan(fresh);
        expect(social).toContain("}, onKakaoReturn);");

        // 설정(연결): 화면은 옮기지 않고 '나'만 다시 받는다 — 로그인된 화면이라 대시보드로 튕기면 안 된다
        const settings = code(client("pages/hiq/settings.tsx"));
        const link = settings.slice(settings.indexOf("useKakaoStart(canLinkKakao,"), settings.indexOf("const canUnlinkKakao"));
        expect(link).toContain('void queryClient.invalidateQueries({ queryKey: ["/api/hiq/me"] });');
        expect(link).not.toMatch(/setLocation\(|refreshAfterLogin/);
    });

    it("꾸러미 — 정해진 키로 남기고, 꺼낼 때 지운다(한 번만 쓴다). 이 탭 것(sessionStorage)이 먼저다", () => {
        expect(lib).toContain("const PENDING_STORES: (() => Storage)[] = [() => window.sessionStorage, () => window.localStorage];");
        const save = lib.slice(lib.indexOf("function savePending"), lib.indexOf("export function takeKakaoPending"));
        expect(save).toContain("pick().setItem(KAKAO_PENDING_KEY, raw);");
        const take = lib.slice(lib.indexOf("export function takeKakaoPending"), lib.indexOf("export async function startKakao"));
        const read = take.indexOf("const raw = store.getItem(KAKAO_PENDING_KEY);");
        const drop = take.indexOf("store.removeItem(KAKAO_PENDING_KEY);");
        const parse = take.indexOf("found = found ?? parseKakaoPending(raw);");
        expect(read).toBeGreaterThan(0);
        expect(drop).toBeGreaterThan(read);
        // 모양·돌아갈 주소는 shared 가 다시 거른다(저장소의 값은 믿지 않는다)
        expect(parse).toBeGreaterThan(drop);
    });

    it("돌아온 화면 — 로그인/연결은 꾸러미에서만 읽고, 확인이 안 되면 서버를 부르지 않는다", () => {
        // 주소의 값으로 mode 를 정하지 않는다(주소는 남이 만들 수 있다) — 주소에서 읽는 것은 code·state·error 셋뿐
        expect(callback.match(/query\.get\("([a-z_]+)"\)/g)).toEqual(['query.get("code")', 'query.get("state")', 'query.get("error")']);
        expect(callback).not.toMatch(/get\("mode"\)|get\("redirect"\)/);
        const fn = callback.slice(callback.indexOf("async function readAndExchange"), callback.indexOf("function loginPath"));
        const check = fn.indexOf("const check = checkKakaoReturn(pending, stateFromUrl, Date.now());");
        const stop = fn.indexOf("if (!check.ok) return fail(", check);
        expect(check).toBeGreaterThan(0);
        expect(stop).toBeGreaterThan(check);
        // 서버 호출은 전부 확인을 통과한 뒤에 있다
        expect(fn.slice(0, stop)).not.toContain("apiRequest(");
        expect(fn.indexOf("apiRequest(", stop)).toBeGreaterThan(stop);
        // 어느 길로 갈지도 확인 결과(꾸러미에서 온 mode)로 정한다 — 연결은 여기서 서버를 부르지 않고 PIN 을 받으러 간다
        const toPin = fn.indexOf('if (check.mode === "link") return { kind: "need-pin", code, back: check.redirect };', stop);
        expect(toPin).toBeGreaterThan(stop);
        expect(fn.indexOf("apiRequest(", stop)).toBeGreaterThan(toPin);
        // 서버에 보내는 Redirect URI 는 인가 요청 때와 같은 함수로 만든다(글자가 다르면 카카오가 거절한다)
        expect(fn).toContain('apiRequest("/api/hiq/social/kakao", { method: "POST", body: { code, redirectUri: kakaoRedirectUri(window.location.origin) } })');
        expect(callback).toContain('apiRequest("/api/hiq/social/kakao/link", { method: "POST", body: { code, redirectUri: kakaoRedirectUri(window.location.origin), pin } })');
        // 동의 화면에서 취소한 것은 실패가 아니다 — 왔던 곳으로 조용히
        expect(fn).toContain('return error === "access_denied" ? { kind: "cancelled", mode, back } : fail("kakao");');
        expect(callback).toContain('go(out.mode === "link" ? "/settings" : loginPath(out.back));');
    });

    // 2026-10-05 검토: 연결은 쿠키만으로 해 주지 않는다 — 돌아온 화면이 로그인 PIN 을 받아 인가 코드와 같이 보낸다.
    // 서버는 PIN 을 카카오보다 먼저 보므로, PIN 이 틀렸을 때만 같은 코드로 다시 보낼 수 있다.
    it("연결 — PIN 을 받은 뒤에 서버를 부른다. PIN 이 틀리면 같은 화면에서 다시, 그 밖의 실패면 더 부르지 않는다", () => {
        // 돌아온 직후에는 PIN 화면만 띄운다(서버를 부르지 않는다)
        const handler = callback.slice(callback.indexOf("void settleKakaoReturn().then("), callback.indexOf("}).catch((err) => {"));
        const ask = handler.slice(handler.indexOf('if (out.kind === "need-pin") {'), handler.indexOf('if (out.kind === "signed-in") {'));
        expect(ask).toContain("setPinAsk({ code: out.code, back: out.back });");
        expect(ask).not.toContain("apiRequest(");

        // 연결 API 는 linkWithPin 한 곳, 그것을 부르는 곳도 submitPin 한 곳
        expect(callback.match(/linkWithPin\(/g)).toHaveLength(2);
        const link = callback.slice(callback.indexOf("async function linkWithPin"), callback.indexOf("function loginPath"));
        expect(link).toContain('if (api?.status === 401 && api.data?.code === "KAKAO_PIN_WRONG") return { kind: "wrong-pin", message: serverMessageOf(api) };');

        const submit = callback.slice(callback.indexOf("const submitPin = async"), callback.indexOf("if (failView) {"));
        // 두 번 누름 방지(ref) · 네 자가 안 되면 보내지 않는다
        const guard = submit.indexOf("if (!pinAsk || pinLock.current || pin.length < 4) return;");
        const lock = submit.indexOf("pinLock.current = true;");
        const call = submit.indexOf("const result = await linkWithPin(pinAsk.code, pin, pinAsk.back);");
        expect(guard).toBeGreaterThan(0);
        expect(lock).toBeGreaterThan(guard);
        expect(call).toBeGreaterThan(lock);
        // 성공하면 잠금을 풀지 않는다(화면이 옮겨 간다). 실패하면 풀고 PIN 을 지운다 — PIN 은 화면 상태에만 있다
        const after = submit.slice(call);
        const unlock = after.indexOf("pinLock.current = false;");
        expect(after.indexOf('if (result.kind === "linked") {')).toBeLessThan(unlock);
        expect(after.indexOf('setPin("");')).toBeGreaterThan(unlock);
        // PIN 만 틀렸으면 PIN 화면을 그대로 둔다
        const wrong = after.slice(after.indexOf('if (result.kind === "wrong-pin") {'));
        expect(wrong.indexOf("setPinError(")).toBeGreaterThan(0);
        expect(wrong.indexOf("return;")).toBeLessThan(wrong.indexOf("setPinAsk(null);"));
        // 그 밖의 실패는 PIN 화면을 닫고 안내로 — 끝난 코드를 다시 보내지 않는다
        expect(wrong).toContain("setFailView(failViewOf(result));");
        // PIN 은 저장소·주소에 남기지 않는다
        expect(callback).not.toMatch(/(sessionStorage|localStorage)[^\n]*pin|pin[^\n]*(sessionStorage|localStorage)/i);
        // 입력은 숫자만·여덟 자까지(로그인 화면의 PIN 과 같은 규칙), 가려서 보여 준다
        expect(callback).toContain('onChange={(e) => { setPin(e.target.value.replace(/[^0-9]/g, "").slice(0, 8)); setPinError(null); }}');
        expect(callback).toContain('type="password"');
    });

    // 2026-10-05 검토: 서버가 JSON 이 아닌 오류(플랫폼의 시간 초과 원문, 서비스 워커가 지어낸 404 "Network Unavailable")로
    // 답하면 그 원문이 안내 문구 자리에 그대로 나왔다. 서버가 만든 오류({ success:false, message })일 때만 문구로 쓴다.
    it("실패 안내 — 서버가 만든 문구만 보여 준다. 플랫폼·서비스 워커의 원문은 우리 문구로 바꾼다", () => {
        const fn = callback.slice(callback.indexOf("function serverMessageOf"), callback.indexOf("function failedFrom"));
        expect(fn).toContain('return data?.success === false && typeof data.message === "string" && data.message ? data.message : null;');
        // 화면에 실리는 문구는 전부 이 함수를 거친다 — ApiError.message(본문 원문·statusText·"HTTP 500")를 직접 쓰지 않는다
        expect(callback).not.toMatch(/api\??\.message/);
        expect(callback).toContain("message: serverMessageOf(api),");
        // 문구가 없으면 이유에 맞는 우리 문구(연결 실패 등)로 떨어진다
        expect(callback).toContain("{failView.serverMessage || t(failView.messageKey)}");
        expect(callback).toContain(': "login.connectionFailed",');
    });

    // 2026-10-05 검토: 약관을 거절해도 방금 만들어진 계정이 남아 그 카카오 계정을 쥐고 있었다 — 전화번호 회원이 나중에
    // 설정에서 카카오를 연결하려 하면 "이미 다른 계정에 연결됨"으로 막혔다. 새로 만든 계정은 거절하면 지운다.
    it("약관을 거절하면 — 방금 새로 만들어진 계정은 지우고, 원래 있던 계정은 로그아웃만 한다", () => {
        expect(callback).toContain("isNew: data?.isNew === true");
        const handler = callback.slice(callback.indexOf("void settleKakaoReturn().then("), callback.indexOf("}).catch((err) => {"));
        const declined = handler.slice(handler.indexOf("if (!agreed) {"), handler.indexOf("await refreshAfterLogin();"));
        const remove = declined.indexOf('? await apiRequest("/api/hiq/me", { method: "DELETE" }).then(() => true).catch(() => false)');
        const logout = declined.indexOf('if (!removed) await apiRequest("/api/hiq/logout", { method: "POST" }).catch(() => undefined);');
        expect(declined).toContain("const removed = out.isNew");
        expect(remove).toBeGreaterThan(0);
        expect(logout).toBeGreaterThan(remove);
        // 어느 쪽이든 '나'를 버리고 로그인 화면으로
        expect(declined.indexOf('queryClient.removeQueries({ queryKey: ["/api/hiq/me"] });')).toBeGreaterThan(logout);
        expect(declined.indexOf("go(loginPath(out.back));")).toBeGreaterThan(logout);
    });

    it("이 주소만 열었거나 꾸러미 없이 돌아왔을 때 — 이미 로그인돼 있으면 홈으로(실패라고 하지 않는다), 인가 코드는 쓰지 않는다", () => {
        // 로그인을 마친 뒤 '뒤로'를 누르면 카카오가 새 코드로 이 주소에 다시 보낸다 — 꾸러미는 이미 썼다
        const handler = callback.slice(callback.indexOf("void settleKakaoReturn().then("), callback.indexOf("}).catch((err) => {"));
        expect(handler).toContain('const signedInNow = () => queryClient.fetchQuery({ queryKey: ["/api/hiq/me"], staleTime: 0 }).then(Boolean).catch(() => false);');
        expect(handler).toContain('go(await signedInNow() ? "/dashboard" : loginPath(null));');
        const quiet = handler.indexOf('if (out.why === "no-pending" && await signedInNow()) {');
        expect(quiet).toBeGreaterThan(0);
        expect(quiet).toBeLessThan(handler.indexOf("setFailView(failViewOf(out));"));
        // 결과를 처리하는 쪽은 약관 거절(새 계정 지우기·로그아웃) 말고는 서버에 쓰지 않는다 — 교환은 readAndExchange 한 곳뿐
        expect(handler.match(/apiRequest\("[^"]+"/g)).toEqual(['apiRequest("/api/hiq/me"', 'apiRequest("/api/hiq/logout"']);
        expect(handler).toContain('apiRequest("/api/hiq/logout", { method: "POST" })');
        // 그 밖의 확인 실패(state 불일치·만료)는 로그인 여부와 무관하게 안내를 보여 준다
        expect(handler.match(/signedInNow\(\)/g)).toHaveLength(2);
    });

    it("연결에 성공하면 '나'를 새로 받고 설정으로 돌아간다 — 쿠키는 그대로라 refreshAfterLogin 은 부르지 않는다", () => {
        const submit = callback.slice(callback.indexOf("const submitPin = async"), callback.indexOf("if (failView) {"));
        const linked = submit.slice(submit.indexOf('if (result.kind === "linked") {'), submit.indexOf("pinLock.current = false;"));
        const fresh = linked.indexOf('await queryClient.invalidateQueries({ queryKey: ["/api/hiq/me"] })');
        expect(fresh).toBeGreaterThan(0);
        expect(linked.indexOf('go(safeReturnPath(pinAsk.back) ?? "/settings");')).toBeGreaterThan(fresh);
        expect(linked).toContain('t("kakao.linked")');
        expect(submit).not.toContain("refreshAfterLogin");
    });

    it("라우트는 공개이고 경로가 Redirect URI 와 같다 — 밝은 화면 한 가지로 고정", () => {
        expect(client("App.tsx")).toContain(`<Route path="${KAKAO_REDIRECT_PATH}" component={KakaoCallback} />`);
        const sport = client("contexts/SportContext.tsx");
        const m = /const consolePath = \/(.+?)\/\.test\(location\)/.exec(sport);
        expect(m).toBeTruthy();
        const re = new RegExp(m![1]);
        expect(re.test(KAKAO_REDIRECT_PATH)).toBe(true);
        for (const path of ["/author", "/authors/1", "/golf/auth", "/dashboard"]) expect(re.test(path), path).toBe(false);
    });

    it("문구 — 화면이 쓰는 키가 다섯 언어 사전에 모두 있다", () => {
        const KEYS = [
            "login.kakao", "login.kakaoStartFailed", "login.phoneLogin", "login.socialBackLink",
            "kakao.working", "kakao.failTitle", "kakao.linkFailTitle", "kakao.failNoPending", "kakao.failState",
            "kakao.failExpired", "kakao.failKakao", "kakao.toLogin", "kakao.toSettings", "kakao.linked",
            "settings.connKakao", "settings.connect",
            // 2026-10-05 검토 뒤 — 연결·해제의 PIN 확인, 기존 전화번호 회원 안내, 앱 안 안내
            "login.phoneExistingHint", "login.kakaoWebOnly",
            "kakao.pinTitle", "kakao.pinDesc", "kakao.pinSubmit", "kakao.pinWrong",
            "kakao.unlinkPinDesc", "kakao.unlinked", "kakao.unlinkFailed",
            "settings.disconnect", "settings.kakaoLinkOnWeb",
        ];
        for (const locale of ["ko", "en", "es", "tr", "vi"]) {
            const dict = client(`lib/i18n/${locale}.ts`);
            for (const key of KEYS) {
                const hit = new RegExp(`"${key.replace(/\./g, "\\.")}":\\s*"([^"]+)"`).exec(dict);
                expect(hit?.[1]?.trim(), `${locale} ${key}`).toBeTruthy();
                // 같은 키가 두 번 있으면 뒤의 것이 조용히 이긴다
                expect(dict.split(`"${key}":`).length - 1, `${locale} ${key}`).toBe(1);
            }
        }
        // 화면 파일에 적힌 카카오 키는 전부 위 목록에 있다(사전에 없는 키를 부르면 키 글자가 그대로 화면에 나온다)
        for (const f of SCREEN_FILES) {
            const used = Array.from(client(f).matchAll(/"(kakao\.[A-Za-z]+|login\.kakao[A-Za-z]*|login\.phoneLogin|login\.phoneExistingHint|login\.socialBackLink|settings\.(?:connKakao|connect|disconnect|kakaoLinkOnWeb))"/g), (x) => x[1]);
            for (const key of used) expect(KEYS, `${f} ${key}`).toContain(key);
        }
        // 돌아온 화면은 문구를 여덟 가지 넘게 쓴다 — 위 검사가 빈 목록으로 지나가지 않았는지 확인
        expect(Array.from(client("pages/hiq/kakao-callback.tsx").matchAll(/"kakao\.[A-Za-z]+"/g)).length).toBeGreaterThanOrEqual(10);
        const ko = client("lib/i18n/ko.ts");
        expect(ko).toContain('"login.kakao": "카카오로 시작하기"');
        expect(ko).toContain('"login.phoneLogin": "전화번호로 로그인"');
    });
});
