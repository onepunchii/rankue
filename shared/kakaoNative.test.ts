import { afterEach, describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import {
    KAKAO_ID_TOKEN_MAX, KAKAO_NATIVE_CANCELED, KAKAO_NATIVE_NONCE_API, KAKAO_NATIVE_PLUGIN, KAKAO_NATIVE_VERIFY_API, KAKAO_NONCE_LENGTH,
    isKakaoNativeCanceled, isKakaoNonce, looksLikeKakaoIdToken,
} from "./kakaoNative";
import { NATIVE_FEATURES, hasPlugin, meetsRequirement, nativeSupports } from "./nativeCaps";

/**
 * 앱 안 카카오 로그인(네이티브 SDK)의 계약과 화면 쪽 규칙.
 * (2026-10-06 오너: "카카오 로그인이 되는 앱 빌드를 만들어 구글·애플에 올리고, 승인되면 카카오를 연다")
 *
 * 지키려는 것은 넷이다.
 *  1) 앱 안에서 카카오 단추가 보이는 조건 = **플러그인 "RankueKakao" 가 있음 && 여는 스위치** — 지금 스토어 앱(1.2)에는 플러그인이 없어
 *     스위치를 켜도 아무것도 안 뜬다. 스위치가 꺼져 있으면 새 앱에서도 안 뜬다.
 *  2) 화면은 registerPlugin 으로만 부른다 — 플러그인 패키지를 import 하지 않는다.
 *  3) 로그인되는 길이다 — 성공하면 refreshAfterLogin 뒤에 화면을 옮긴다('로그인했는데 로그인 안 됨'이 돌아오지 않게).
 *  4) 문구는 다섯 언어 사전의 키로만.
 * 화면 코드의 시험이지만 shared 에 둔다: vitest 가 client/src 에서는 sim·golf 만 읽어서, 소스를 읽어 규칙을 지킨다.
 * 서버 쪽(ID 토큰 검증 표·nonce·라우트)은 server/lib/kakaoNative.test.ts.
 */
const root = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");
const client = (p: string) => root(join("client/src", p));
// 주석은 빼고 본다(설명에 적힌 낱말에 걸리지 않게) — JSX 안의 설명({/* … */})과 주석 줄
const code = (s: string) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");

const lib = code(client("lib/kakaoLogin.ts"));
const social = code(client("components/hiq/SocialLogin.tsx"));
const settings = code(client("pages/hiq/settings.tsx"));
const sheet = code(client("components/hiq/LoginSheet.tsx"));
const landing = code(client("pages/hiq/landing.tsx"));

/** lib/kakaoLogin.ts 의 네이티브 묶음(파일 맨 아래) */
const nativeLib = lib.slice(lib.indexOf("let nativePlugin: RankueKakaoPlugin | null = null;"));
/** SocialLogin 의 앱 안 카카오 처리 함수 */
const signIn = social.slice(social.indexOf("const nativeKakaoSignIn = useCallback("), social.indexOf("const el = wrapRef.current;"));
/** SocialLogin 의 '앱' 갈래(네이티브 단추 묶음) */
const appBranch = social.slice(social.indexOf("if (inApp) {"), social.indexOf("if (!GOOGLE_CLIENT_ID && !showKakao) return null;"));
/** 설정의 앱 안 연결 */
const nativeLink = settings.slice(settings.indexOf("const kakaoNative = kakaoNativeAvailable();"), settings.indexOf("const canUnlinkKakao"));

describe("계약(shared/kakaoNative.ts) — 플러그인 이름 · 취소 코드 · 값의 꼴", () => {
    it("플러그인 이름은 RankueKakao, 취소는 code CANCELED — 기능 표(nativeCaps)도 같은 이름을 본다", () => {
        expect(KAKAO_NATIVE_PLUGIN).toBe("RankueKakao");
        expect(KAKAO_NATIVE_CANCELED).toBe("CANCELED");
        expect(NATIVE_FEATURES.nativeKakaoLogin).toEqual({ plugin: KAKAO_NATIVE_PLUGIN });
        // 세대(UA 표식)로 가르지 않는다 — 플러그인이 실제로 들어 있는지로만 본다
        expect("minGeneration" in NATIVE_FEATURES.nativeKakaoLogin).toBe(false);
    });

    it("계약 전문이 한 파일에 적혀 있다 — 메서드 둘, 넘기는 값, 서버의 두 길", () => {
        const src = root("shared/kakaoNative.ts");
        expect(src).toContain("login({ nonce: string }): Promise<{ idToken: string; viaTalk: boolean }>");
        expect(src).toContain("logout(): Promise<void>");
        expect(src).toMatch(/export interface RankueKakaoPlugin \{\s*login\(options: KakaoNativeLoginOptions\): Promise<KakaoNativeLoginResult>;\s*logout\(\): Promise<void>;\s*\}/);
        expect(src).toMatch(/export type KakaoNativeLoginResult = \{[\s\S]*?idToken: string;[\s\S]*?viaTalk: boolean;\s*\};/);
        expect(KAKAO_NATIVE_NONCE_API).toBe("/api/hiq/social/kakao/native/nonce");
        expect(KAKAO_NATIVE_VERIFY_API).toBe("/api/hiq/social/kakao/native");
    });

    it("화면 번들에 실리는 파일이다 — 환경변수를 읽지 않고 키처럼 생긴 값도 없다", () => {
        const src = root("shared/kakaoNative.ts");
        expect(src).not.toMatch(/process\.env|import\.meta\.env/);
        expect(src).not.toMatch(/\b[0-9a-f]{32}\b/);
        expect(src).not.toMatch(/^import /m);
    });

    it("isKakaoNonce — base64url 43자만", () => {
        expect(KAKAO_NONCE_LENGTH).toBe(43);
        expect(isKakaoNonce("A".repeat(43))).toBe(true);
        expect(isKakaoNonce("aZ09_-".repeat(7) + "x")).toBe(true);
        for (const bad of ["", "A".repeat(42), "A".repeat(44), "A".repeat(42) + "=", "A".repeat(42) + "+", " " + "A".repeat(42), undefined, null, 43, ["A".repeat(43)]]) {
            expect(isKakaoNonce(bad), JSON.stringify(bad)).toBe(false);
        }
    });

    it("looksLikeKakaoIdToken — 점 둘로 나뉜 base64url 세 토막, 4KB 까지", () => {
        expect(looksLikeKakaoIdToken("aaa.bbb.ccc")).toBe(true);
        expect(looksLikeKakaoIdToken(`${"a".repeat(KAKAO_ID_TOKEN_MAX - 4)}.b.c`)).toBe(true);
        for (const bad of ["", "aaa", "aaa.bbb", "aaa.bbb.", ".bbb.ccc", "aaa.bbb.ccc.ddd", "aaa.b b.ccc", "aaa.bbb.ccc\n", `${"a".repeat(KAKAO_ID_TOKEN_MAX)}.b.c`, undefined, null, 1, {}]) {
            expect(looksLikeKakaoIdToken(bad), JSON.stringify(String(bad).slice(0, 12))).toBe(false);
        }
    });

    it("isKakaoNativeCanceled — 오류 객체의 code 가 CANCELED 일 때만", () => {
        expect(isKakaoNativeCanceled(Object.assign(new Error("user canceled"), { code: "CANCELED" }))).toBe(true);
        expect(isKakaoNativeCanceled({ code: "CANCELED" })).toBe(true);
        for (const other of [new Error("CANCELED"), Object.assign(new Error("x"), { code: "FAILED" }), { code: "canceled" }, "CANCELED", null, undefined]) {
            expect(isKakaoNativeCanceled(other), String(other)).toBe(false);
        }
    });

    // 네이티브 과제가 만든 플러그인 소스가 저장소에 있으면, 이름과 취소 코드가 계약과 같은 글자인지 본다(없으면 건너뛴다)
    const ANDROID = "native-plugins/rankue-kakao/android/src/main/kotlin/com/rankue/kakao/RankueKakaoPlugin.kt";
    const IOS = "native-plugins/rankue-kakao/ios/Sources/RankueKakaoPlugin/RankueKakaoPlugin.swift";
    const here = (p: string) => existsSync(resolve(__dirname, "..", p));
    it.skipIf(!here(ANDROID) || !here(IOS))("네이티브 플러그인 소스가 같은 이름·같은 취소 코드를 쓴다", () => {
        const android = root(ANDROID);
        const ios = root(IOS);
        expect(android).toContain(`@CapacitorPlugin(name = "${KAKAO_NATIVE_PLUGIN}")`);
        expect(ios).toContain(`public let jsName = "${KAKAO_NATIVE_PLUGIN}"`);
        for (const src of [android, ios]) {
            expect(src).toContain(`"${KAKAO_NATIVE_CANCELED}"`);
            // 돌려주는 값은 idToken · viaTalk 둘뿐 — 액세스·리프레시 토큰을 화면으로 넘기지 않는다
            expect(src).toContain('"idToken"');
            expect(src).toContain('"viaTalk"');
            expect(src).not.toMatch(/"(accessToken|refreshToken)"/);
        }
    });
});

describe("앱 안 노출 조건 — 플러그인 있음 && 스위치", () => {
    afterEach(() => { delete (globalThis as { Capacitor?: unknown }).Capacitor; });

    /** 지금 스토어 앱(1.2)에 든 플러그인 일부 — RankueKakao 는 없다 */
    const STORE_1_2 = ["App", "AppLauncher", "Browser", "PushNotifications", "SocialLogin", "Share", "Keyboard"];
    const fakeApp = (plugins: string[]) => {
        (globalThis as { Capacitor?: unknown }).Capacitor = {
            isNativePlatform: () => true,
            getPlatform: () => "ios",
            isPluginAvailable: (name: string) => plugins.includes(name),
        };
    };

    it("기능 표: 웹은 늘 false, 플러그인 없는 앱(1.2)도 false, 플러그인이 든 앱만 true", () => {
        const has = (names: string[]) => (n: string) => names.includes(n);
        // 웹(0세대) — 이름이 같은 무언가가 있어도 아니다
        expect(meetsRequirement(NATIVE_FEATURES.nativeKakaoLogin, 0, has([KAKAO_NATIVE_PLUGIN]))).toBe(false);
        // 1.2 바이너리(2세대, 플러그인 없음)
        expect(meetsRequirement(NATIVE_FEATURES.nativeKakaoLogin, 2, has(STORE_1_2))).toBe(false);
        // 새 바이너리
        expect(meetsRequirement(NATIVE_FEATURES.nativeKakaoLogin, 2, has([...STORE_1_2, KAKAO_NATIVE_PLUGIN]))).toBe(true);
    });

    it("실제 판별(전역 Capacitor)로도 같다 — 웹 · 1.2 앱 · 새 앱", () => {
        expect(nativeSupports("nativeKakaoLogin")).toBe(false);
        fakeApp(STORE_1_2);
        expect(hasPlugin("SocialLogin")).toBe(true);
        expect(nativeSupports("nativeKakaoLogin")).toBe(false);
        fakeApp([...STORE_1_2, KAKAO_NATIVE_PLUGIN]);
        expect(nativeSupports("nativeKakaoLogin")).toBe(true);
    });

    it("화면의 판정은 한 줄이다 — 스위치(VITE_KAKAO_LOGIN_OPEN) && 플러그인. 웹용 JS 키는 이 길에 쓰이지 않는다", () => {
        expect(lib).toContain('const KAKAO_OPEN = (import.meta.env.VITE_KAKAO_LOGIN_OPEN as string | undefined) === "1";');
        // 2026-10-06 미리보기: 스위치는 kakaoSwitchOn() 으로 본다 — 공개 스위치(KAKAO_OPEN) || 이 기기의 미리보기 깃발(shared/kakaoPreview.test.ts)
        expect(lib).toMatch(/function kakaoSwitchOn\(\): boolean \{\s*return KAKAO_OPEN \|\| kakaoPreviewOn\(\);\s*\}/);
        expect(lib).toMatch(/export function kakaoNativeAvailable\(\): boolean \{\s*return kakaoSwitchOn\(\) && nativeSupports\("nativeKakaoLogin"\);\s*\}/);
        expect(lib).toContain('import { nativeSupports } from "@shared/nativeCaps";');
        // 플러그인 이름을 화면 코드에 다시 적지 않는다 — 계약의 상수와 기능 표만 쓴다
        for (const [name, src] of [["lib", lib], ["SocialLogin", social], ["settings", settings], ["LoginSheet", sheet], ["landing", landing]] as const) {
            expect(src, name).not.toContain('"RankueKakao"');
        }
    });

    it("'카카오 단추를 쓸 수 있는가'는 스위치가 먼저다 — 앱 안에서는 플러그인이 있을 때만 참, 없으면 예전처럼 숨는다", () => {
        const fn = lib.slice(lib.indexOf("export function kakaoLoginAvailable"), lib.indexOf("const SCRIPT_ID"));
        const off = fn.indexOf("if (!kakaoSwitchOn()) return false;");
        const native = fn.indexOf("if (kakaoNativeAvailable()) return true;");
        const hide = fn.indexOf("if (!KAKAO_JS_KEY || isNativeApp()) return false;");
        expect(off).toBeGreaterThan(0);
        expect(native).toBeGreaterThan(off);
        expect(hide).toBeGreaterThan(native);
        // 앱에서 참이 되는 길은 저 한 줄뿐이다
        expect(fn.match(/return true;/g)).toHaveLength(1);
    });

    it("로그인 단추 — 앱 갈래의 카카오는 showKakao 안에만 있다(= 한국어 · 매장 진입 아님 · 스위치 · 플러그인). 옛 앱 안내 갈래에는 없다", () => {
        expect(social).toContain('const showKakao = kakao && locale === "ko" && kakaoLoginAvailable();');
        const at = appBranch.indexOf("{showKakao && (");
        expect(at).toBeGreaterThan(0);
        expect(appBranch.match(/\{showKakao && \(/g)).toHaveLength(1);
        expect(appBranch.indexOf("onClick={nativeKakaoSignIn}")).toBeGreaterThan(at);
        // 카카오라는 글자는 그 블록 안에만 있다
        const block = appBranch.slice(at, appBranch.indexOf('onClick={() => nativeSignIn("google")}'));
        expect(appBranch.replace(block, "")).not.toMatch(/kakao/i);
        const oldApp = social.slice(social.indexOf("if (inApp && !nativeSocial) {"), social.indexOf("if (inApp) {"));
        expect(oldApp).not.toMatch(/kakao/i);
        // 앱에서는 웹의 길(카카오로 화면 이동)로 가지 않는다
        expect(appBranch).not.toMatch(/handleKakao|startKakao\(/);
    });

    it("앱 안에서는 웹 SDK 를 싣지 않는다 — 단추가 미리 싣기를 걸어도 스크립트 태그를 넣기 전에 끝난다", () => {
        const fn = lib.slice(lib.indexOf("export function loadKakaoSdk"), lib.indexOf("const PENDING_STORES"));
        const guard = fn.indexOf("if (isNativeApp()) return Promise.reject(");
        expect(guard).toBeGreaterThan(0);
        expect(guard).toBeLessThan(fn.indexOf('document.createElement("script")'));
    });

    it("안내 문구 — '앱에는 아직 카카오 로그인이 없어'·'웹에서 연결'은 플러그인이 없는 앱에만 남긴다", () => {
        const hint = 'const kakaoWebOnlyHint = kakaoLoginOpen() && locale === "ko" && isNativeApp() && !kakaoNativeAvailable();';
        expect(sheet).toContain(hint);
        expect(landing).toContain(hint);
        expect(settings).toContain("const kakaoLinkOnWebHint = kakaoLoginOpen() && isNativeApp() && !kakaoNative && ");
        // 셋 다 스위치(kakaoLoginOpen)가 먼저다 — 닫혀 있는 동안에는 어느 앱에서도 '카카오'라는 말이 나오지 않는다
        expect(lib).toMatch(/export function kakaoLoginOpen\(\): boolean \{\s*return kakaoSwitchOn\(\) && !!KAKAO_JS_KEY;/);
    });

    it("설정의 연결 — 같은 조건(kakaoLoginAvailable)이고, 새 앱에서는 네이티브 길로 간다", () => {
        expect(settings).toContain('const canLinkKakao = locale === "ko" && kakaoLoginAvailable() && !!member?.profileId && conn.pin === true && !conn.kakao;');
        expect(settings).toContain('onLink: canLinkKakao ? (kakaoNative ? () => { void startNativeLink(); } : () => startKakao({ mode: "link", redirect: "/settings" })) : undefined,');
        // 해제는 카카오에 다녀오지 않는다 — 예전 조건 그대로(앱 안에서도 된다)
        expect(settings).toContain("const canUnlinkKakao = !!conn.kakao && conn.pin === true && !!conn.phone;");
    });

    it("앱의 웹뷰를 카카오로 보내는 길은 열지 않았다 — allowNavigation 은 우리 도메인뿐", () => {
        const m = /allowNavigation:\s*\[([^\]]*)\]/.exec(root("capacitor.config.ts"));
        expect(m).toBeTruthy();
        expect(m![1]).not.toMatch(/kakao/i);
        expect(m![1].split(",").map((s) => s.trim()).filter(Boolean)).toEqual(['"rankue.co.kr"']);
    });
});

describe("화면은 registerPlugin 으로만 부른다", () => {
    /** client/src 아래의 소스 파일 전부 */
    function sources(dir: string): string[] {
        return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
            const p = join(dir, e.name);
            if (e.isDirectory()) return sources(p);
            return /\.(ts|tsx)$/.test(e.name) ? [p] : [];
        });
    }

    it("@capacitor/core 의 registerPlugin 으로, 쓸 때 한 번만 등록한다", () => {
        expect(lib).toContain('import { registerPlugin } from "@capacitor/core";');
        expect(nativeLib).toContain("nativePlugin ??= registerPlugin<RankueKakaoPlugin>(KAKAO_NATIVE_PLUGIN);");
        // import 한 줄 + 부르는 한 줄
        expect(lib.match(/registerPlugin/g)).toHaveLength(2);
        // 모듈이 실릴 때가 아니라 함수 안에서(네이티브가 플러그인 목록을 넣은 뒤에) 등록한다
        const fn = nativeLib.slice(nativeLib.indexOf("function kakaoPlugin(): RankueKakaoPlugin {"), nativeLib.indexOf("export type KakaoNativeToken"));
        expect(fn).toContain("registerPlugin<RankueKakaoPlugin>(");
        // 대리 객체를 async 함수가 돌려주면 Promise 가 then 을 찾다가 네이티브의 "then" 을 부른다 — 동기 함수여야 한다
        expect(nativeLib).not.toMatch(/async function kakaoPlugin/);
        expect(nativeLib).not.toMatch(/await kakaoPlugin\(\)\s*[;)]/);
    });

    it("플러그인 패키지를 import 하지 않는다 — 화면 코드 어디에서도", () => {
        const dir = resolve(__dirname, "../client/src");
        const files = sources(dir);
        expect(files.length).toBeGreaterThan(100);
        for (const f of files) {
            const src = readFileSync(f, "utf8");
            if (!/rankue-kakao|native-plugins/.test(src)) continue;
            expect(src, f).not.toMatch(/(from\s+|import\(\s*|require\(\s*)["'][^"']*(rankue-kakao|native-plugins)/);
        }
        // 플러그인을 부르는 곳은 lib 한 파일뿐이다
        const callers = files.filter((f) => /\bkakaoPlugin\(\)|registerPlugin<RankueKakaoPlugin>/.test(readFileSync(f, "utf8")));
        expect(callers.map((f) => f.slice(dir.length + 1))).toEqual(["lib/kakaoLogin.ts"]);
    });

    it("한 번의 흐름 — nonce 받기 → login({ nonce }) → (취소면 조용히 null) → SDK 토큰 지우기 → 꼴 확인", () => {
        const fn = nativeLib.slice(nativeLib.indexOf("export async function kakaoNativeToken"), nativeLib.indexOf("export type KakaoNativeSignedIn"));
        const guard = fn.indexOf('if (!kakaoNativeAvailable()) throw new Error("kakao: native login unavailable");');
        const nonce = fn.indexOf('const issued = await apiRequest(KAKAO_NATIVE_NONCE_API, { method: "POST", body: {} });');
        const shape = fn.indexOf('if (!isKakaoNonce(nonce)) throw new Error("kakao: bad nonce");');
        const login = fn.indexOf("idToken = (await kakaoPlugin().login({ nonce }))?.idToken;");
        const cancel = fn.indexOf("if (isKakaoNativeCanceled(err)) return null;");
        const forget = fn.indexOf("void kakaoPlugin().logout().catch(() => undefined);");
        const token = fn.indexOf('if (!looksLikeKakaoIdToken(idToken)) throw new Error("kakao: no id token");');
        const order = [guard, nonce, shape, login, cancel, forget, token];
        for (const at of order) expect(at).toBeGreaterThan(-1);
        expect(order).toEqual([...order].sort((a, b) => a - b));
        // 플러그인이 없는 바이너리에서는 플러그인을 건드리기 전에 끝난다(맨 앞의 확인)
        expect(guard).toBeLessThan(fn.indexOf("kakaoPlugin()"));
        // nonce 는 받은 글자 그대로 넘긴다
        expect(fn).not.toMatch(/login\(\{ nonce: /);
    });

    it("받은 토큰은 화면 메모리에만 — 저장소·주소에 남기지 않고, 서버에는 정해진 두 길로만 보낸다", () => {
        expect(nativeLib).not.toMatch(/sessionStorage|localStorage|document\.cookie|history\.|location\./);
        // 2026-10-07: 로그인 본문에 joinStore 가 늘었다 — 매장 QR 로 온 기기의 가입 매장(shared/joinStore · 저장소는 lib/joinStore 가 읽는다). 연결에는 싣지 않는다
        expect(nativeLib).toContain('apiRequest(KAKAO_NATIVE_VERIFY_API, { method: "POST", body: { idToken: token.idToken, nonce: token.nonce, mode: "login", joinStore: joinStoreSlug() } })');
        expect(nativeLib).toContain('apiRequest(KAKAO_NATIVE_VERIFY_API, { method: "POST", body: { idToken: token.idToken, nonce: token.nonce, mode: "link", pin } })');
        expect(nativeLib.match(/apiRequest\(/g)).toHaveLength(3);
        // 로그에 토큰을 적지 않는다(오류 객체만)
        expect(nativeLib).not.toMatch(/console\.\w+\([^)]*(idToken|token\.|nonce)/);
        // 액세스 토큰은 받지 않는다
        expect(nativeLib).not.toMatch(/access_?token/i);
    });
});

describe("앱 안 카카오 로그인의 마무리 — 구글·애플과 같은 순서", () => {
    it("취소는 조용히 — 알림도 화면 이동도 없다", () => {
        const get = signIn.indexOf("const data = await kakaoNativeLogin();");
        const quiet = signIn.indexOf("if (!data) return;");
        expect(get).toBeGreaterThan(0);
        expect(quiet).toBeGreaterThan(get);
        expect(signIn.slice(0, quiet)).not.toMatch(/toast\(|setLocation\(|finishInPlace\(/);
    });

    it("'나'를 새로 받은 뒤에 닫거나 옮긴다 — 팝업은 그 자리 마무리, 로그인 화면은 보던 곳 → 서버가 준 곳 → 홈", () => {
        const fresh = signIn.indexOf("await refreshAfterLogin();");
        const inPlace = signIn.indexOf("if (given.current.redirect !== undefined) { finishInPlace(back); return; }");
        const move = signIn.indexOf('setLocation(safeReturnPath(back) ?? safeReturnPath(data.redirectTo) ?? "/dashboard");');
        expect(fresh).toBeGreaterThan(signIn.indexOf("if (!data) return;"));
        expect(inPlace).toBeGreaterThan(fresh);
        expect(move).toBeGreaterThan(inPlace);
        // 새로 받기 전에는 닫지도 옮기지도 않는다
        expect(signIn.slice(0, fresh)).not.toMatch(/finishInPlace\(|onDone|setLocation\(/);
        expect(signIn.match(/setLocation\(/g)).toHaveLength(1);
        expect(signIn.match(/refreshAfterLogin\(\)/g)).toHaveLength(1);
        // 이 길의 서버 호출은 lib 가 한다 — 이 함수는 약관 거절의 뒷정리 말고는 서버에 쓰지 않는다
        expect(signIn.match(/apiRequest\("[^"]+"/g)).toEqual(['apiRequest("/api/hiq/me"', 'apiRequest("/api/hiq/logout"']);
        expect(signIn).not.toMatch(/\bfetch\(/);
        // lib 는 '나'를 새로 받지 않는다(부른 화면이 약관 동의 뒤에 한다)
        expect(lib).not.toContain("refreshAfterLogin(");
    });

    it("약관 동의는 새로 받기보다 먼저 — 거절하면 방금 만들어진 계정은 지우고, 원래 있던 계정은 로그아웃만", () => {
        const terms = signIn.indexOf("if (!isTermsAccepted(data.member?.termsVersion)) {");
        const fresh = signIn.indexOf("await refreshAfterLogin();");
        expect(terms).toBeGreaterThan(0);
        expect(terms).toBeLessThan(fresh);
        const declined = signIn.slice(signIn.indexOf("if (!agreed) {"), fresh);
        const remove = declined.indexOf('? await apiRequest("/api/hiq/me", { method: "DELETE" }).then(() => true).catch(() => false)');
        const logout = declined.indexOf('if (!removed) await apiRequest("/api/hiq/logout", { method: "POST" }).catch(() => undefined);');
        expect(declined).toContain("const removed = data.isNew === true");
        expect(remove).toBeGreaterThan(0);
        expect(logout).toBeGreaterThan(remove);
        expect(declined.indexOf('queryClient.removeQueries({ queryKey: ["/api/hiq/me"] });')).toBeGreaterThan(logout);
        expect(declined.indexOf("return;")).toBeGreaterThan(logout);
    });

    it("실패는 기존 소셜 로그인과 같은 문구 — 서버가 만든 문구만 그대로, 플러그인·플랫폼의 원문은 싣지 않는다", () => {
        const fail = signIn.slice(signIn.indexOf("} catch (err) {"));
        expect(fail).toContain('toast({ title: t("login.failedTitle"), description: kakaoServerMessage(err) ?? t("login.socialFailed"), variant: "destructive" });');
        expect(signIn).not.toMatch(/err\.message|String\(err\)/);
        const fn = nativeLib.slice(nativeLib.indexOf("export function kakaoServerMessage"), nativeLib.indexOf("export async function kakaoNativeToken"));
        expect(fn).toContain("const data = err instanceof ApiError ? err.data : null;");
        expect(fn).toContain('return data?.success === false && typeof data.message === "string" && data.message ? data.message : null;');
        // 끝나면(성공·취소·실패) 단추를 푼다. 두 번 누름은 busy 로 막는다
        expect(signIn).toMatch(/\} finally \{\s*setBusy\(false\);\s*\}/);
        expect(signIn).toMatch(/if \(busy\) return;\s*setBusy\(true\);/);
    });

    it("애플 4.8 — 카카오 단추는 구글·애플 단추와 같은 묶음 · 같은 폭 · 같은 높이, iOS 에는 애플 단추가 같이 있다", () => {
        const kakaoAt = appBranch.indexOf("{showKakao && (");
        const googleAt = appBranch.indexOf('onClick={() => nativeSignIn("google")}');
        const appleAt = appBranch.indexOf('onClick={() => nativeSignIn("apple")}');
        expect(googleAt).toBeGreaterThan(kakaoAt);
        expect(appleAt).toBeGreaterThan(googleAt);
        // 애플 단추는 iOS 에서 늘 있다(안드로이드만 뺀다) — 카카오가 떠도 조건이 바뀌지 않는다
        expect(appBranch).toContain('{nativePlatform() !== "android" && (');
        // 같은 묶음(한 틀) 안이다
        expect(appBranch.match(/className=\{stackClass\}/g)).toHaveLength(1);
        // 크기: 로그인 화면은 320×44, 팝업은 48px — 구글·애플 단추의 값과 같다
        expect(appBranch).toContain('className={`w-full ${sheet ? "h-12" : "max-w-[320px] h-[44px]"} rounded-[12px] bg-[#FEE500] text-[#191919] ');
        const page = social.slice(social.indexOf("const PAGE_LOOK"), social.indexOf("const SHEET_BTN"));
        expect(page).toMatch(/google: "w-full max-w-\[320px\] h-\[44px\] /);
        expect(page).toMatch(/apple: "w-full max-w-\[320px\] h-\[44px\] /);
        expect(social).toContain('const SHEET_BTN = "w-full h-12 rounded-[12px] ');
        // 카카오 가이드: 심볼 + 문구
        const block = appBranch.slice(kakaoAt, googleAt);
        expect(block).toContain("<KakaoSymbol />");
        expect(block).toContain('{t("login.kakao")}');
        expect(block).toContain("disabled={busy}");
    });
});

describe("설정의 앱 안 연결 — 카카오에 먼저 다녀오고, PIN 을 받아 같이 보낸다", () => {
    it("토큰을 받은 뒤에 PIN 칸을 연다 — 취소면 아무 일도 없다", () => {
        const start = nativeLink.slice(nativeLink.indexOf("const startNativeLink = async () => {"), nativeLink.indexOf("const submitNativeLink = async () => {"));
        const get = start.indexOf("const token = await kakaoNativeToken();");
        const open = start.indexOf("setNativeLink(token);");
        expect(get).toBeGreaterThan(0);
        expect(open).toBeGreaterThan(start.indexOf("if (token) {"));
        // 두 번 누름 방지(ref) · 실패는 카카오를 못 열었다는 우리 문구
        expect(start).toContain("if (nativeLinkLock.current) return;");
        expect(start).toContain('toast({ title: t("login.kakaoStartFailed"), variant: "destructive" });');
        // 시작만으로는 서버의 연결 길을 부르지 않는다
        expect(start).not.toContain("kakaoNativeLink(");
    });

    it("PIN 이 틀리면 같은 자리에서 다시(토큰은 그대로), 그 밖의 답이면 PIN 칸을 닫는다", () => {
        const submit = nativeLink.slice(nativeLink.indexOf("const submitNativeLink = async () => {"));
        const guard = submit.indexOf("if (!nativeLink || nativeLinkLock.current || linkPin.length < 4) return;");
        const call = submit.indexOf("const result = await kakaoNativeLink(nativeLink, linkPin);");
        expect(guard).toBeGreaterThan(0);
        expect(call).toBeGreaterThan(guard);
        const after = submit.slice(call);
        // PIN 은 보낸 뒤 바로 지운다(화면 상태에만 있다)
        const clear = after.indexOf('setLinkPin("");');
        const wrong = after.indexOf('if (result.kind === "wrong-pin") {');
        const close = after.indexOf("setNativeLink(null);");
        expect(clear).toBeGreaterThan(0);
        expect(wrong).toBeGreaterThan(clear);
        // 틀린 PIN 은 닫기 전에 돌아간다
        expect(after.indexOf("return;", wrong)).toBeLessThan(close);
        expect(after.slice(wrong, close)).toContain('setLinkPinError(result.message ?? t("kakao.pinWrong"));');
        // 성공: 알리고 '나'를 다시 받는다
        const linked = after.slice(after.indexOf('if (result.kind === "linked") {'));
        expect(linked).toContain('toast({ title: t("kakao.linked") });');
        expect(linked).toContain('await queryClient.invalidateQueries({ queryKey: ["/api/hiq/me"] });');
        // 실패: 서버가 만든 문구가 있으면 그대로
        expect(after).toContain('toast({ title: t("kakao.linkFailTitle"), description: result.message ?? undefined, variant: "destructive" });');
    });

    it("쿠키는 그대로다 — refreshAfterLogin 도 화면 이동도 하지 않는다. PIN 은 저장소에 남기지 않는다", () => {
        expect(nativeLink).not.toMatch(/refreshAfterLogin|setLocation\(/);
        expect(nativeLink).not.toMatch(/sessionStorage|localStorage/);
        // lib: PIN 만 틀린 것(서버가 nonce 를 쓰기 전에 거절)을 따로 가른다
        const fn = nativeLib.slice(nativeLib.indexOf("export async function kakaoNativeLink"));
        expect(fn).toContain('if (err instanceof ApiError && err.status === 401 && err.data?.code === "KAKAO_PIN_WRONG") return { kind: "wrong-pin", message };');
        expect(fn).toContain('return { kind: "failed", message };');
    });

    it("PIN 칸 — 숫자만·여덟 자까지·가려서, 네 자가 안 되면 보내지 않는다. 브라우저 기본 창을 쓰지 않는다", () => {
        const form = settings.slice(settings.indexOf('{c.key === "kakao" && nativeLink && ('), settings.indexOf('{c.key === "kakao" && c.onUnlink && unlinkOpen && ('));
        expect(form.length).toBeGreaterThan(0);
        expect(form).toContain("onSubmit={(e) => { e.preventDefault(); void submitNativeLink(); }}");
        expect(form).toContain('type="password"');
        expect(form).toContain('onChange={(e) => { setLinkPin(e.target.value.replace(/[^0-9]/g, "").slice(0, 8)); setLinkPinError(null); }}');
        expect(form).toContain("disabled={nativeLinkBusy || linkPin.length < 4}");
        expect(form).toContain('{t("kakao.pinDesc")}');
        expect(form).toContain('{t("common.cancel")}');
        // 연결 단추는 카카오에 다녀오는 동안·PIN 을 받는 동안 다시 눌리지 않는다
        expect(settings).toContain("disabled={kakaoLinking || nativeLinkBusy || !!nativeLink}");
        expect(settings).not.toMatch(/window\.(confirm|alert|prompt)\(|[^.\w](confirm|alert|prompt)\(/);
    });
});

describe("문구 — 다섯 언어 사전의 키로만", () => {
    const LOCALES = ["ko", "en", "es", "vi", "tr"] as const;
    const KEYS = [
        // 로그인 단추·실패·약관 거절
        "login.kakao", "login.failedTitle", "login.socialFailed", "terms.declinedTitle", "terms.declinedDesc",
        // 설정의 연결
        "login.kakaoStartFailed", "kakao.pinDesc", "kakao.pinWrong", "kakao.linked", "kakao.linkFailTitle",
        "login.pinPlaceholder", "settings.connect", "common.cancel",
    ];
    const used = (src: string) => Array.from(src.matchAll(/\bt\("([A-Za-z]+\.[A-Za-z0-9]+)"\)/g), (m) => m[1]);

    it("새로 생긴 화면 조각이 쓰는 키는 전부 목록에 있고, 목록의 키는 다섯 사전에 다 있다", () => {
        const form = settings.slice(settings.indexOf('{c.key === "kakao" && nativeLink && ('), settings.indexOf('{c.key === "kakao" && c.onUnlink && unlinkOpen && ('));
        const block = appBranch.slice(appBranch.indexOf("{showKakao && ("), appBranch.indexOf('onClick={() => nativeSignIn("google")}'));
        const keys = [...used(signIn), ...used(block), ...used(nativeLink), ...used(form)];
        // 빈 목록으로 지나가지 않았는지
        expect(keys.length).toBeGreaterThanOrEqual(10);
        for (const key of keys) expect(KEYS, key).toContain(key);
        for (const locale of LOCALES) {
            const dict = client(`lib/i18n/${locale}.ts`);
            for (const key of KEYS) {
                const hit = new RegExp(`"${key.replace(/\./g, "\\.")}":\\s*"([^"]+)"`).exec(dict);
                expect(hit?.[1]?.trim(), `${locale} ${key}`).toBeTruthy();
            }
        }
    });

    it("화면 조각에 한글 문장을 직접 적지 않았다(사전의 키만 쓴다)", () => {
        const form = settings.slice(settings.indexOf('{c.key === "kakao" && nativeLink && ('), settings.indexOf('{c.key === "kakao" && c.onUnlink && unlinkOpen && ('));
        // 줄 끝 설명(// …)과 JSX 설명({/* … */})은 빼고, 따옴표 안의 한글만 본다
        const strip = (s: string) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
        for (const [name, src] of [["nativeKakaoSignIn", signIn], ["appBranch", appBranch], ["nativeLink", nativeLink], ["form", form]] as const) {
            expect(strip(src), name).not.toMatch(/["'`][^"'`\n]*[가-힣][^"'`\n]*["'`]/);
            expect(strip(src), name).not.toMatch(/>[^<{]*[가-힣][^<{]*</);
        }
    });

    it("서버가 돌려주는 실패 문구도 다섯 언어다 — 새 길은 기존 카카오 키만 쓴다", async () => {
        const auth = root("server/routes/modules/auth.ts");
        const native = auth.slice(auth.indexOf("function kakaoNonceCookieOptions"));
        const keys = Array.from(new Set(native.match(/err\.(auth|common)\.[A-Za-z]+/g) ?? []));
        expect(keys.length).toBeGreaterThanOrEqual(6);
        const dicts = {
            ko: (await import("./i18n/ko.js")).ko,
            en: (await import("./i18n/en.js")).en,
            es: (await import("./i18n/es.js")).es,
            vi: (await import("./i18n/vi.js")).vi,
            tr: (await import("./i18n/tr.js")).tr,
        } as Record<string, Record<string, string>>;
        for (const [lang, dict] of Object.entries(dicts)) {
            for (const key of keys) expect(dict[key], `${lang} ${key}`).toBeTruthy();
        }
    });
});
