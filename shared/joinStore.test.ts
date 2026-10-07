import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { JOIN_STORE_KEY, JOIN_STORE_TTL_MS, isStoreSlug, packJoinStore, readJoinStore } from "./joinStore";

/**
 * 매장 QR 로 온 기기의 '가입 매장' 표시(2026-10-07 오너: "QR 은 … 유저가 가입하면 해당 매장 고객으로 인식되는 부분").
 * 여기서는 표시의 규칙과, 화면이 그 규칙대로 이어져 있는지를 본다(화면 시험은 shared/ 에 둔다 — vitest 가 client 는 sim·golf 만 돈다).
 * 서버 쪽(새 계정의 소속 · 전화번호 로그인)은 server/services/joinStore.test.ts 가 본다.
 */
const root = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");
const client = (p: string) => root(`client/src/${p}`);
const code = (src: string) => src.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(l)).join("\n");
const NOW = 1_800_000_000_000;

describe("표시의 규칙", () => {
    it("매장 slug 로 올 수 있는 글자만 — 승인 때 만든 slug(리스팅 코드 소문자 + 접미)와 옛 slug", () => {
        for (const ok of ["c00012", "n00003", "c00012-a1b2", "gangnam_club", "A1"]) expect(isStoreSlug(ok), ok).toBe(true);
        for (const no of ["", " ", "a b", "../x", "-x", "한글", "x".repeat(41), null, undefined, 12]) expect(isStoreSlug(no), String(no)).toBe(false);
    });

    it("남겼다가 읽으면 그대로 — 매장 페이지 코드가 이상하면 코드만 비운다", () => {
        const packed = packJoinStore("c00012", "C00012", NOW)!;
        expect(readJoinStore(packed, NOW + 1000)).toEqual({ slug: "c00012", code: "C00012", at: NOW });
        expect(readJoinStore(packJoinStore("c00012", "<script>", NOW)!, NOW)).toEqual({ slug: "c00012", code: null, at: NOW });
        expect(readJoinStore(packJoinStore("c00012", null, NOW)!, NOW)?.code).toBeNull();
        // slug 가 이상하면 남기지 않는다
        expect(packJoinStore("a b", "C1", NOW)).toBeNull();
        expect(packJoinStore(undefined, "C1", NOW)).toBeNull();
    });

    it("하루가 지나면 없는 것으로 본다 — 시각이 미래여도, 깨진 글자여도", () => {
        const packed = packJoinStore("c00012", "C00012", NOW)!;
        expect(readJoinStore(packed, NOW + JOIN_STORE_TTL_MS - 1)).not.toBeNull();
        expect(readJoinStore(packed, NOW + JOIN_STORE_TTL_MS + 1)).toBeNull();
        expect(readJoinStore(packed, NOW - 10 * 60_000)).toBeNull();
        for (const bad of ["", "{", "null", "[]", '{"slug":"a b","at":1}', '{"slug":"c1"}', '{"slug":"c1","at":"x"}', 12, null, undefined]) {
            expect(readJoinStore(bad, NOW), String(bad)).toBeNull();
        }
        expect(JOIN_STORE_TTL_MS).toBe(24 * 60 * 60 * 1000);
        expect(JOIN_STORE_KEY).toBe("rankue:join-store");
    });
});

describe("화면이 그 규칙대로 이어져 있는가(소스)", () => {
    const detail = code(client("pages/store-detail.tsx"));
    const listing = code(client("pages/store-listing.tsx"));

    it("QR 이 가리키는 주소(/store/<slug>)가 표시를 남긴다 — 정본 페이지로 넘기기 전에", () => {
        // 사장님 화면의 QR·포스터·링크 복사가 전부 이 주소다
        expect(code(client("pages/partner/dashboard.tsx"))).toContain("const joinUrl = store ? `${window.location.origin}/store/${store.slug}` : \"\";");
        const remember = detail.indexOf("if (store?.slug) rememberJoinStore(store.slug, store.listingCode ?? null);");
        const redirect = detail.indexOf("if (store?.listingCode) setLocation(`/stores/${store.listingCode}`, { replace: true });");
        expect(remember).toBeGreaterThan(0);
        expect(redirect).toBeGreaterThan(remember);
        // 매장 찾기에서 들어온 사람(/stores/:code)에게는 남기지 않는다
        expect(listing).not.toContain("rememberJoinStore");
    });

    it("매장 페이지: QR 로 온 비로그인에게만 '이 매장 회원으로 시작하기' — 그 자리에서 가입·로그인 팝업", () => {
        const at = listing.indexOf("{isGuest && s.claimed && joinStoreFor(s.code) && (");
        expect(at).toBeGreaterThan(0);
        const cta = listing.slice(at, listing.indexOf("</button>", at));
        expect(cta).toContain("onClick={() => goLogin(setLocation)}");
        expect(cta).toContain('{t.joinTitle.replace("{name}", s.name)}');
        // 문구는 다섯 언어
        for (const k of ["joinTitle", "joinDesc", "joinCta"]) expect(listing.match(new RegExp(`\\b${k}: "`, "g")), k).toHaveLength(5);
        expect(listing.match(/joinTitle: "[^"]*\{name\}/g)).toHaveLength(5);
    });

    it("가입 요청 네 곳이 가입 매장을 실어 보낸다 — 구글·애플 · 카카오(웹) · 카카오(앱) · 전화번호", () => {
        expect(code(client("components/hiq/SocialLogin.tsx"))).toContain("body: JSON.stringify({ provider, idToken, name, joinStore: joinStoreSlug() }),");
        expect(code(client("pages/hiq/kakao-callback.tsx"))).toContain("body: { code, redirectUri: kakaoRedirectUri(window.location.origin), joinStore: joinStoreSlug() }");
        expect(code(client("lib/kakaoLogin.ts"))).toContain('body: { idToken: token.idToken, nonce: token.nonce, mode: "login", joinStore: joinStoreSlug() }');
        expect(code(client("pages/hiq/register.tsx"))).toContain("body: { ...data, termsVersion: TERMS_VERSION, joinStore: joinStoreSlug() },");
        // 연결(link) 요청에는 싣지 않는다 — 계정을 만드는 길이 아니다
        expect(code(client("lib/kakaoLogin.ts"))).toContain('body: { idToken: token.idToken, nonce: token.nonce, mode: "link", pin }');
    });

    it("로그인이 끝나면 표시를 지운다 — 다음에 이 기기에서 만들어지는 다른 계정이 그 매장에 붙지 않게", () => {
        const qc = code(client("lib/queryClient.ts"));
        const fn = qc.slice(qc.indexOf("export async function refreshAfterLogin(): Promise<void> {"), qc.indexOf("const ME_HASH"));
        expect(fn).toContain("clearJoinStore();");
        const lib = code(client("lib/joinStore.ts"));
        expect(lib).toContain("window.localStorage.removeItem(JOIN_STORE_KEY);");
        // 저장소를 못 쓰는 환경에서도 던지지 않는다
        expect(lib.match(/\} catch \{/g)?.length).toBeGreaterThanOrEqual(3);
    });

    // QR 로 들어온 지 몇 초 뒤(두 번째 화면) 설치 팝업이 가입 한 줄 위로 올라왔다(하니스에서 발견) — 앱부터 깔면 표시가 사라진다
    it("설치 팝업은 QR 로 온 비로그인의 가입이 끝날 때까지 뜨지 않는다", () => {
        const sheet = code(client("components/hiq/AppInstallSheet.tsx"));
        expect(sheet).toContain("busy: live.current.authLoading || screenBusy() || (!live.current.loggedIn && !!joinStoreSlug()),");
    });

    it("서버: 새 회원 행을 만들 때만 쓴다 · 전화번호 가입은 PIN 을 정했고 기본 매장으로 오던 가입만 옮긴다", () => {
        const svc = root("server/services/hiqService.ts");
        const social = svc.slice(svc.indexOf("    async socialLogin("), svc.indexOf("    async linkKakao("));
        const create = social.indexOf("const home = (await resolveJoinStore(joinStoreSlug)) ?? await storage.getStoreBySlug(GLOBAL_STORE_SLUG);");
        expect(create).toBeGreaterThan(social.indexOf("if (!member) {"));
        expect(social.match(/resolveJoinStore\(/g)).toHaveLength(1);
        const auth = root("server/routes/modules/auth.ts");
        expect(auth.match(/req\.body\?\.joinStore\)/g)).toHaveLength(4);
        const reg = auth.slice(auth.indexOf('router.post("/register"'), auth.indexOf('router.post("/logout"'));
        expect(reg).toContain("const joinStore = validation.data.password ? await resolveJoinStore(req.body?.joinStore) : null;");
        expect(reg).toContain("const signup = joinStore && isSystemStore(requested?.slug) ? { ...validation.data, storeId: joinStore.id } : validation.data;");
        expect(reg).toContain("await hiqService.register(signup, ");
    });
});
