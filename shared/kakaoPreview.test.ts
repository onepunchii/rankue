import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import {
    KAKAO_PREVIEW_API, KAKAO_PREVIEW_COOKIE, KAKAO_PREVIEW_FLAG, KAKAO_PREVIEW_KEY_MAX, KAKAO_PREVIEW_KEY_MIN, KAKAO_PREVIEW_PATH,
    KAKAO_STATUS_API, kakaoPreviewAppUrl, readKakaoPreviewAsk,
} from "./kakaoLogin.js";
import { deepLinkToPath, isAppSchemeLink, openedAppLink } from "./deepLink.js";

/**
 * 카카오 로그인 미리보기의 화면 쪽 규칙(2026-10-06) — 공개 스위치는 꺼 둔 채, 열쇠를 넣은 기기에서만 카카오 단추가 보인다.
 * 서버 쪽 표는 server/lib/kakaoPreview.test.ts.
 *
 * 가장 중요한 한 줄: **미리보기를 켜지 않은 기기의 화면은 예전과 한 글자도 다르지 않다.**
 * 화면 파일은 이 시험 환경에서 실행할 수 없어(브라우저 · '@' 별칭) 소스를 읽어 지킨다. 아래 열쇠는 전부 지어낸 글자다.
 */
const root = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");
const client = (p: string) => root(join("client/src", p));
// 주석 줄은 빼고 본다(설명에 적힌 낱말에 걸리지 않게)
const code = (s: string) => s.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");

/** client/src 의 화면 소스 전부(시험 파일 제외) — "이 글자는 여기 한 곳에만 있다"를 볼 때 쓴다. */
function clientSources(): { file: string; src: string }[] {
    const base = resolve(__dirname, "../client/src");
    const out: { file: string; src: string }[] = [];
    const walk = (dir: string) => {
        for (const name of readdirSync(dir)) {
            const full = join(dir, name);
            if (statSync(full).isDirectory()) { walk(full); continue; }
            if (!/\.(ts|tsx)$/.test(name) || /\.test\.tsx?$/.test(name)) continue;
            out.push({ file: relative(base, full), src: code(readFileSync(full, "utf8")) });
        }
    };
    walk(base);
    return out;
}
const filesWith = (needle: string | RegExp) => clientSources()
    .filter(({ src }) => (typeof needle === "string" ? src.includes(needle) : needle.test(src)))
    .map(({ file }) => file)
    .sort();

const KEY = "preview-test-key-0123456789";
const lib = code(client("lib/kakaoLogin.ts"));
const page = code(client("pages/hiq/kakao-preview.tsx"));
const app = code(client("App.tsx"));

describe("계약의 상수", () => {
    it("깃발 · 페이지 주소 · 서버의 두 길", () => {
        expect(KAKAO_PREVIEW_FLAG).toBe("rankue_kakao_preview");
        expect(KAKAO_PREVIEW_PATH).toBe("/kakao-preview");
        expect(KAKAO_PREVIEW_API).toBe("/api/hiq/social/kakao/preview");
        expect(KAKAO_STATUS_API).toBe("/api/hiq/social/kakao/status");
        expect(KAKAO_PREVIEW_COOKIE).toBe("hiq_kakao_preview");
        expect(KAKAO_PREVIEW_KEY_MIN).toBe(16);
    });

    it("shared 파일에 열쇠처럼 생긴 값도, 환경변수 읽기도 없다 — 화면 번들에 실리는 파일이다", () => {
        const src = root("shared/kakaoLogin.ts");
        expect(src).not.toMatch(/process\.env\.|import\.meta\.env/);
        expect(src).not.toContain("KAKAO_PREVIEW_KEY=");
    });
});

describe("readKakaoPreviewAsk — 미리보기 페이지가 주소에서 읽는 것", () => {
    it("?k=<열쇠> 는 켜기, ?off=1 은 끄기(둘 다 있으면 끈다)", () => {
        expect(readKakaoPreviewAsk(`?k=${KEY}`)).toEqual({ kind: "on", key: KEY });
        expect(readKakaoPreviewAsk(`k=${KEY}`)).toEqual({ kind: "on", key: KEY });
        expect(readKakaoPreviewAsk(`?utm=x&k=${KEY}`)).toEqual({ kind: "on", key: KEY });
        expect(readKakaoPreviewAsk("?off=1")).toEqual({ kind: "off" });
        expect(readKakaoPreviewAsk(`?k=${KEY}&off=1`)).toEqual({ kind: "off" });
    });

    it("주소에 실린 글자는 한 번 풀어서 읽는다 — 감싼 열쇠도 원래 글자로 돌아온다", () => {
        const odd = "a+b/c=d&e%f g?h#i-0123456789";
        expect(readKakaoPreviewAsk(`?k=${encodeURIComponent(odd)}`)).toEqual({ kind: "on", key: odd });
    });

    it("할 일이 없는 주소 — 열쇠가 없거나 길이가 맞지 않으면 서버에 보내지도 않는다", () => {
        const none = { kind: "none" };
        for (const search of ["", "?", "?k=", "?k=short", `?k=${"x".repeat(KAKAO_PREVIEW_KEY_MIN - 1)}`, `?k=${"x".repeat(KAKAO_PREVIEW_KEY_MAX + 1)}`,
            `?key=${KEY}`, `?K=${KEY}`, "?off=0", "?off=true", "?off", "?lang=en"]) {
            expect(readKakaoPreviewAsk(search), search).toEqual(none);
        }
        for (const bad of [undefined, null, 1, {}, [`?k=${KEY}`]]) expect(readKakaoPreviewAsk(bad)).toEqual(none);
        // 길이의 양 끝은 받는다
        expect(readKakaoPreviewAsk(`?k=${"x".repeat(KAKAO_PREVIEW_KEY_MIN)}`).kind).toBe("on");
        expect(readKakaoPreviewAsk(`?k=${"x".repeat(KAKAO_PREVIEW_KEY_MAX)}`).kind).toBe("on");
    });
});

describe("앱에서는 rankue://open?path=… 로 들어온다 — 딥링크 처리가 경로와 쿼리를 그대로 넘긴다", () => {
    it("오너가 쓰는 꼴(rankue://open?path=%2Fkakao-preview%3Fk%3D<열쇠>)이 앱 안에서 /kakao-preview?k=<열쇠> 가 된다", () => {
        const url = `rankue://open?path=%2Fkakao-preview%3Fk%3D${KEY}`;
        expect(kakaoPreviewAppUrl(KEY)).toBe(url);
        expect(isAppSchemeLink(url)).toBe(true);
        expect(deepLinkToPath(url)).toBe(`/kakao-preview?k=${KEY}`);
        // 앱이 실제로 쓰는 함수 — '앱에서 열기' 토큰이 아니므로 떼는 것도 건네는 것도 없다
        expect(openedAppLink(url)).toEqual({ path: `/kakao-preview?k=${KEY}`, handoff: null });
        const path = openedAppLink(url).path!;
        expect(path.split("?")[0]).toBe(KAKAO_PREVIEW_PATH);
        expect(readKakaoPreviewAsk(path.slice(path.indexOf("?")))).toEqual({ kind: "on", key: KEY });
    });

    it("끄는 주소도 같은 길로 간다", () => {
        const url = "rankue://open?path=%2Fkakao-preview%3Foff%3D1";
        expect(openedAppLink(url)).toEqual({ path: "/kakao-preview?off=1", handoff: null });
        expect(readKakaoPreviewAsk("?off=1")).toEqual({ kind: "off" });
    });

    it("주소에 그대로 못 싣는 글자가 섞인 열쇠도 웹 화면의 '앱에서도 켜기' 주소로는 그대로 넘어간다(두 번 감싼다)", () => {
        for (const key of ["a+b/c=d&e%f?h#i-0123456789", "열쇠-한글도-섞인-열여섯자-이상", KEY]) {
            const path = openedAppLink(kakaoPreviewAppUrl(key)).path;
            expect(path, key).toBeTruthy();
            expect(readKakaoPreviewAsk(path!.slice(path!.indexOf("?"))), key).toEqual({ kind: "on", key });
        }
    });

    it("앱의 딥링크 처리(nativeBridge)는 받은 경로를 쿼리째 라우터에 넘긴다", () => {
        const bridge = code(client("lib/nativeBridge.ts"));
        const open = bridge.slice(bridge.indexOf("function openDeepLink("), bridge.indexOf("function initDeepLinks("));
        expect(open).toContain("const { path, handoff } = openedAppLink(url);");
        expect(open).toContain("navigateInApp(path, replace);");
        const nav = bridge.slice(bridge.indexOf("export function navigateInApp("), bridge.indexOf("export function openStorePage("));
        expect(nav).toContain("const safe = sanitizeInternalPath(path);");
        expect(nav).toContain("navigate(safe, { replace });");
        // 처리한 링크를 기기에 적을 때는 원문이 아니라 단방향 키다 — 열쇠가 실린 주소가 저장소에 남지 않는다
        expect(bridge).toContain("const key = handledLinkKey(url);");
    });
});

describe("앱 링크 경로 목록에 /kakao-preview 는 없다 — https 링크로는 앱이 이 주소를 열지 않는다", () => {
    const aasaRaw = root("client/public/.well-known/apple-app-site-association");
    const components: { "/": string; exclude?: boolean }[] = JSON.parse(aasaRaw).applinks.details.flatMap((d: any) => d.components);
    const toRegExp = (pattern: string) => new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".")}$`);

    it("iOS(apple-app-site-association) — 어느 줄에도 맞지 않는다", () => {
        expect(aasaRaw).not.toMatch(/kakao-preview/);
        for (const c of components.filter((x) => !x.exclude)) {
            expect(toRegExp(c["/"]).test("/kakao-preview"), c["/"]).toBe(false);
            expect(toRegExp(c["/"]).test("/kakao-preview/"), c["/"]).toBe(false);
        }
    });

    const MANIFEST = resolve(__dirname, "../android/app/src/main/AndroidManifest.xml");
    it.skipIf(!existsSync(MANIFEST))("안드로이드(AndroidManifest) — 경로 목록에 없다", () => {
        const manifest = readFileSync(MANIFEST, "utf8").replace(/<!--[\s\S]*?-->/g, "");
        expect(manifest).not.toMatch(/kakao-preview/);
        const paths = [...manifest.matchAll(/android:(?:pathPrefix|path)="([^"]+)"/g)].map((m) => m[1]);
        for (const p of paths) expect("/kakao-preview".startsWith(p), p).toBe(false);
    });

    it("검색에도 내놓지 않는다 — 사이트맵 · 프리렌더 · 봇 라우트 · robots · llms 어디에도 이 주소가 없다(robots 에 적으면 오히려 드러난다)", () => {
        for (const f of ["server/sitemap.ts", "server/prerender.ts", "vercel.json", "client/public/robots.txt", "client/public/llms.txt", "client/index.html"]) {
            expect(root(f), f).not.toMatch(/kakao-preview/);
        }
        // 떠 있는 동안에는 robots 메타도 noindex 로 둔다
        expect(page).toContain(`meta?.setAttribute("content", "noindex, nofollow");`);
    });
});

describe("깃발이 없는 기기는 예전과 완전히 같다(client lib/kakaoLogin)", () => {
    it("스위치는 한 줄이다 — 공개 스위치 || 미리보기 깃발. 깃발이 없으면 공개 스위치 그대로다", () => {
        expect(lib).toContain('const KAKAO_OPEN = (import.meta.env.VITE_KAKAO_LOGIN_OPEN as string | undefined) === "1";');
        expect(lib).toMatch(/function kakaoSwitchOn\(\): boolean \{\s*return KAKAO_OPEN \|\| kakaoPreviewOn\(\);\s*\}/);
        // 공개 스위치를 읽는 곳은 정의와 저 한 줄뿐이다
        expect(lib.match(/\bKAKAO_OPEN\b/g)).toHaveLength(2);
        expect(filesWith("VITE_KAKAO_LOGIN_OPEN")).toEqual(["lib/kakaoLogin.ts"]);
    });

    it("깃발은 기기 저장소의 한 칸('1')만 본다 — 못 읽으면 없는 것이다", () => {
        const fn = lib.slice(lib.indexOf("export function kakaoPreviewOn"), lib.indexOf("let previewEpoch"));
        expect(fn).toMatch(/try \{\s*return window\.localStorage\.getItem\(KAKAO_PREVIEW_FLAG\) === "1";\s*\} catch \{\s*return false;\s*\}/);
        // 주소·쿠키·세션 저장소·전역 변수로는 켜지지 않는다
        expect(fn).not.toMatch(/location|document\.cookie|sessionStorage|window\.__/);
    });

    it("세 판정은 스위치를 보는 글자만 바뀌었다 — kakaoSwitchOn() 을 KAKAO_OPEN 으로 되돌리면 예전 소스와 글자까지 같다", () => {
        const slice = (from: string, to: string) => lib.slice(lib.indexOf(from), lib.indexOf(to)).trimEnd();
        const now = [
            slice("export function kakaoLoginOpen", "export function kakaoNativeAvailable"),
            slice("export function kakaoNativeAvailable", "export function kakaoLoginAvailable"),
            slice("export function kakaoLoginAvailable", "const SCRIPT_ID"),
        ].join("\n\n").replace(/kakaoSwitchOn\(\)/g, "KAKAO_OPEN");
        // 2026-10-06 미리보기 전(b344edcd)의 세 함수 — 주석 줄을 뺀 모양
        const before = [
            "export function kakaoLoginOpen(): boolean {",
            "    return KAKAO_OPEN && !!KAKAO_JS_KEY;",
            "}",
            "",
            "export function kakaoNativeAvailable(): boolean {",
            '    return KAKAO_OPEN && nativeSupports("nativeKakaoLogin");',
            "}",
            "",
            "export function kakaoLoginAvailable(): boolean {",
            "    if (!KAKAO_OPEN) return false;",
            "    if (kakaoNativeAvailable()) return true;",
            "    if (!KAKAO_JS_KEY || isNativeApp()) return false;",
            "    try {",
            "        return isAllowedKakaoOrigin(window.location.origin, import.meta.env.DEV);",
            "    } catch {",
            "        return false;",
            "    }",
            "}",
        ].join("\n");
        expect(now).toBe(before);
        // 바뀐 곳은 정확히 세 군데다
        expect(lib.match(/kakaoSwitchOn\(\)/g)).toHaveLength(4); // 정의 1 + 판정 3
    });

    it("화면들은 깃발을 직접 보지 않는다 — 예전과 같은 세 판정만 부른다(화면 파일은 건드리지 않았다)", () => {
        const flagReaders = filesWith(/KAKAO_PREVIEW_FLAG|rankue_kakao_preview/);
        expect(flagReaders).toEqual(["lib/kakaoLogin.ts"]);
        expect(filesWith("kakaoPreviewOn")).toEqual(["lib/kakaoLogin.ts", "pages/hiq/kakao-preview.tsx"]);
        expect(filesWith("setKakaoPreview")).toEqual(["lib/kakaoLogin.ts", "pages/hiq/kakao-preview.tsx"]);
        // 판정을 쓰는 화면의 줄은 그대로다
        expect(code(client("components/hiq/SocialLogin.tsx"))).toContain('const showKakao = kakao && locale === "ko" && kakaoLoginAvailable();');
        expect(code(client("components/hiq/LoginSheet.tsx"))).toContain('const kakaoShown = !storeEntry && locale === "ko" && kakaoLoginAvailable();');
        expect(code(client("pages/hiq/landing.tsx"))).toContain('const kakaoFirst = locale === "ko" && kakaoLoginAvailable() && !storeEntry;');
        const settings = code(client("pages/hiq/settings.tsx"));
        expect(settings).toContain('const canLinkKakao = locale === "ko" && kakaoLoginAvailable() && !!member?.profileId && conn.pin === true && !conn.kakao;');
        expect(settings).toContain('...((locale === "ko" && kakaoLoginOpen()) || conn.kakao ? [{');
        for (const f of ["components/hiq/LoginSheet.tsx", "pages/hiq/landing.tsx"]) {
            expect(code(client(f)), f).toContain('const kakaoWebOnlyHint = kakaoLoginOpen() && locale === "ko" && isNativeApp() && !kakaoNativeAvailable();');
        }
    });

    it("깃발은 미리보기 페이지만 세운다 — 서버가 켰다고 답한 뒤에", () => {
        expect(filesWith("setKakaoPreview(true)")).toEqual(["pages/hiq/kakao-preview.tsx"]);
        expect(filesWith(/localStorage\.setItem\(KAKAO_PREVIEW_FLAG/)).toEqual(["lib/kakaoLogin.ts"]);
        const set = lib.slice(lib.indexOf("export function setKakaoPreview"), lib.indexOf("function kakaoSwitchOn"));
        expect(set).toContain('if (on) window.localStorage.setItem(KAKAO_PREVIEW_FLAG, "1");');
        expect(set).toContain("else window.localStorage.removeItem(KAKAO_PREVIEW_FLAG);");
    });
});

describe("/status 는 깃발이 선 기기만 묻는다 — 닫혔다는 답을 받으면 조용히 깃발을 내린다", () => {
    const sync = lib.slice(lib.indexOf("export async function syncKakaoPreview"), lib.indexOf("type KakaoSdk"));

    it("깃발이 없으면 요청을 보내기 전에 끝난다", () => {
        const guard = sync.indexOf("if (!kakaoPreviewOn()) return;");
        const ask = sync.indexOf("await apiRequest(KAKAO_STATUS_API)");
        expect(guard).toBeGreaterThan(0);
        expect(ask).toBeGreaterThan(guard);
        // 그 사이에 다른 요청도, 기다림도 없다
        expect(sync.slice(guard, ask)).not.toMatch(/await|fetch\(|apiRequest\(/);
    });

    it("상태 길을 부르는 곳은 이 함수 하나뿐이다 — 화면 어디에도 주소를 손으로 적지 않았다", () => {
        expect(filesWith("KAKAO_STATUS_API")).toEqual(["lib/kakaoLogin.ts"]);
        expect(filesWith("kakao/status")).toEqual([]);
        expect(lib.match(/apiRequest\(KAKAO_STATUS_API\)/g)).toHaveLength(1);
        // 미리보기 길(켜기·끄기)은 미리보기 페이지만 부른다
        expect(filesWith("KAKAO_PREVIEW_API")).toEqual(["pages/hiq/kakao-preview.tsx"]);
        expect(filesWith("kakao/preview")).toEqual([]);
    });

    it("앱이 뜰 때 한 번 — 파일이 실릴 때 부른다(가입·로그인 팝업이 이 파일을 늘 싣는다)", () => {
        expect(lib.match(/^void syncKakaoPreview\(\);$/gm)).toHaveLength(1);
        expect(filesWith("syncKakaoPreview")).toEqual(["lib/kakaoLogin.ts"]);
        expect(app).toContain('import { LoginSheetHost } from "@/components/hiq/LoginSheet";');
        expect(code(client("components/hiq/LoginSheet.tsx"))).toMatch(/from "@\/lib\/kakaoLogin";/);
    });

    it("'닫힘'이라는 답을 받았을 때만 내린다 — 못 물어봤으면(오프라인 · 오류 · 서비스 워커의 가짜 404) 그대로 둔다", () => {
        expect(sync).toContain("if (status?.open === false && epoch === previewEpoch) setKakaoPreview(false);");
        expect(sync).toMatch(/try \{[\s\S]*apiRequest\(KAKAO_STATUS_API\)[\s\S]*\} catch \{/);
        // 실패 갈래(catch)에서는 깃발을 건드리지 않는다
        expect(sync.slice(sync.indexOf("} catch {"))).not.toContain("setKakaoPreview");
        // 물어본 사이에 새로 세운 깃발은 지우지 않는다(세우거나 내릴 때마다 번호가 오른다)
        expect(sync).toContain("const epoch = previewEpoch;");
        expect(lib).toMatch(/export function setKakaoPreview\(on: boolean\): void \{\s*previewEpoch \+= 1;/);
    });
});

describe("웹 카카오 SDK — 미리보기 깃발이 선 기기에서도 로그인 화면이 미리 싣는다", () => {
    it("싣는 조건에 스위치가 없다 — 단추가 보이면(= 판정이 참이면) 싣는다", () => {
        const hook = lib.slice(lib.indexOf("export function useKakaoStart"), lib.indexOf("let nativePlugin"));
        expect(hook).toContain("if (shown) void loadKakaoSdk().catch(() => undefined);");
        const load = lib.slice(lib.indexOf("export function loadKakaoSdk"), lib.indexOf("const PENDING_STORES"));
        expect(load).not.toMatch(/KAKAO_OPEN|kakaoSwitchOn|kakaoPreviewOn/);
        expect(load).toContain("const jsKey = KAKAO_JS_KEY;");
        // 단추가 보이는지는 깃발을 포함한 판정이 정한다
        expect(code(client("components/hiq/SocialLogin.tsx"))).toMatch(/useKakaoStart\(showKakao,/);
        expect(code(client("pages/hiq/settings.tsx"))).toMatch(/useKakaoStart\(canLinkKakao,/);
    });
});

describe("미리보기 페이지(/kakao-preview)", () => {
    it("라우트는 공개 한 줄이다 — 없는 화면(404) 줄보다 앞", () => {
        const route = `<Route path="${KAKAO_PREVIEW_PATH}" component={KakaoPreview} />`;
        expect(app.split(route).length - 1).toBe(1);
        expect(app).toContain('import KakaoPreview from "@/pages/hiq/kakao-preview";');
        expect(app.indexOf(route)).toBeLessThan(app.indexOf("<Route component={NotFound} />"));
        expect(app.indexOf(route)).toBeGreaterThan(app.indexOf('<Route path="/auth/kakao" component={KakaoCallback} />'));
    });

    it("주소의 열쇠는 서버를 부르기 전에 지운다 — 열쇠는 요청 본문으로만 간다", () => {
        const strip = page.indexOf('window.history.replaceState(window.history.state, "", KAKAO_PREVIEW_PATH);');
        const read = page.indexOf("const raw = window.location.search;");
        const firstCall = page.indexOf("apiRequest(KAKAO_PREVIEW_API");
        expect(read).toBeGreaterThan(0);
        expect(strip).toBeGreaterThan(read);
        expect(firstCall).toBeGreaterThan(strip);
        // 읽기와 지우기 사이에 기다림이 없다
        expect(page.slice(read, strip)).not.toMatch(/await|\.then\(|setTimeout/);
        expect(page).toContain('apiRequest(KAKAO_PREVIEW_API, { method: "POST", body: { key: ask.key } })');
        // 서버 주소에 열쇠를 이어 붙이지 않는다
        expect(page).not.toMatch(/KAKAO_PREVIEW_API\s*\+|\$\{KAKAO_PREVIEW_API\}/);
        // 열쇠를 기기에 적어 두지 않는다
        expect(page).not.toMatch(/localStorage|sessionStorage|document\.cookie/);
    });

    it("깃발은 서버가 켰다고 답한 뒤에만 세운다 — 그 밖의 답은 전부 '없는 화면'이다", () => {
        const post = page.slice(page.indexOf('apiRequest(KAKAO_PREVIEW_API, { method: "POST"'));
        const check = post.indexOf('if (data?.open !== true) { show({ kind: "none" }); return; }');
        const flag = post.indexOf("setKakaoPreview(true);");
        expect(check).toBeGreaterThan(0);
        expect(flag).toBeGreaterThan(check);
        expect(post).toContain('.catch(() => show({ kind: "none" }));');
        expect(page.match(/setKakaoPreview\(true\)/g)).toHaveLength(1);
    });

    it("실패는 일반 404 화면과 같은 모양이다 — 확인하는 동안에도 글자를 그리지 않는다", () => {
        expect(page).toContain('import NotFound from "@/pages/not-found";');
        expect(page).toContain('if (view.kind === "none") return <NotFound />;');
        expect(app).toContain('import NotFound from "@/pages/not-found";');
        const checking = /if \(view\.kind === "checking"\) return (<div[^>]*\/>);/.exec(page);
        expect(checking).not.toBeNull();
        expect(checking![1]).not.toMatch(/t\(/);
        // 주소에 아무것도 없으면 처음부터 없는 화면이다
        expect(page).toContain('useState<View>(() => (window.location.search ? { kind: "checking" } : { kind: "none" }))');
        // 없는 화면 갈래는 문구를 그리는 줄보다 앞에서 끝난다
        expect(page.indexOf("return <NotFound />;")).toBeLessThan(page.indexOf('t(view.kind === "on"'));
    });

    it("?off=1 — 깃발을 내리고 DELETE 를 부른다. 켜 둔 적이 없는 기기에는 껐다는 말도 하지 않는다", () => {
        const off = page.slice(page.indexOf('if (ask.kind === "off") {'), page.indexOf('apiRequest(KAKAO_PREVIEW_API, { method: "POST"'));
        expect(off).toContain("const had = kakaoPreviewOn();");
        expect(off).toContain("setKakaoPreview(false);");
        expect(off).toContain('apiRequest(KAKAO_PREVIEW_API, { method: "DELETE" })');
        expect(off).toContain('show(had ? { kind: "off" } : { kind: "none" })');
        // 깃발은 서버의 답을 기다리지 않고 내린다
        expect(off.indexOf("setKakaoPreview(false);")).toBeLessThan(off.indexOf("apiRequest("));
    });

    it("새 로그인 길이 아니다 — 로그인 쿠키도 '나'도 건드리지 않고, 브라우저 기본 창도 쓰지 않는다", () => {
        expect(page).not.toMatch(/refreshAfterLogin|hiq_user_id|\/api\/hiq\/me|socialLogin|kakaoNativeLogin|startKakao/);
        expect(page).not.toMatch(/\b(?:window\.)?(?:confirm|alert|prompt)\(/);
        // 켜진 뒤의 단추는 로그인 화면으로 보낸다(로그인은 그 화면의 카카오 단추가 예전 그대로 한다)
        expect(page).toContain('onClick={() => setLocation("/?login=1", { replace: true })}');
    });

    it("문구 — 화면에 한글을 직접 적지 않고, 쓰는 키가 다섯 언어 사전에 모두 있다", () => {
        const used = Array.from(page.matchAll(/"((?:kakaoPreview|kakao)\.[A-Za-z]+)"/g), (m) => m[1]);
        const KEYS = ["kakaoPreview.onTitle", "kakaoPreview.offTitle", "kakaoPreview.onDesc", "kakaoPreview.nativeMissing", "kakaoPreview.openApp", "kakao.toLogin"];
        expect([...new Set(used)].sort()).toEqual([...KEYS].sort());
        // 줄 안에 낀 주석(/* … */)까지 걷어 내고 본다 — 남는 한글이 있으면 화면에 그대로 박힌 글자다
        expect(page.replace(/\/\*[\s\S]*?\*\//g, "")).not.toMatch(/[가-힣]/);
        for (const locale of ["ko", "en", "es", "vi", "tr"]) {
            const dict = client(`lib/i18n/${locale}.ts`);
            for (const key of KEYS) {
                const hit = new RegExp(`"${key.replace(/\./g, "\\.")}":\\s*"([^"]+)"`).exec(dict);
                expect(hit?.[1]?.trim(), `${locale} ${key}`).toBeTruthy();
                // 같은 키가 두 번 있으면 뒤의 것이 조용히 이긴다
                expect(dict.split(`"${key}":`).length - 1, `${locale} ${key}`).toBe(1);
            }
        }
        // 사전에 있는 미리보기 키는 전부 화면이 쓴다(남은 키 없음)
        const inKo = Array.from(client("lib/i18n/ko.ts").matchAll(/"(kakaoPreview\.[A-Za-z]+)":/g), (m) => m[1]).sort();
        expect(inKo).toEqual(KEYS.filter((k) => k.startsWith("kakaoPreview.")).sort());
        expect(client("lib/i18n/ko.ts")).toContain('"kakaoPreview.onTitle": "이 기기에서 카카오 로그인 미리보기가 켜졌어요"');
    });

    it("'이 기기의 앱에서도 켜기'는 휴대폰 브라우저에서 켰을 때만 — 앱 안과 PC 에는 없다", () => {
        expect(page).toContain('const appUrl = view.kind === "on" && onPhoneBrowser() ? kakaoPreviewAppUrl(view.key) : null;');
        const fn = page.slice(page.indexOf("function onPhoneBrowser()"), page.indexOf("export default function KakaoPreview"));
        expect(fn).toContain("if (isNativeApp()) return false;");
        expect(fn).toContain('!== "desktop"');
        expect(page).toMatch(/\{appUrl && \(\s*<a\s+href=\{appUrl\}/);
    });
});
