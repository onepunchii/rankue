import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { exchangeKakaoCode, kakaoConfigured, kakaoLocalAllowed, kakaoRedirectAllowed, kakaoRejected, KAKAO_TIMEOUT_MS } from "./kakaoAuth.js";
import { pickLoginMember } from "./loginMember.js";
import { hiqService } from "../services/hiqService.js";
import authRouter, { attemptKey, checkRateLimit, registerFailure, takeAttemptSlot } from "../routes/modules/auth.js";

/**
 * 카카오 인가 코드 교환(2026-10-05 오너: "카카오도 오픈").
 * 카카오에 실제 요청을 보내지 않는다 — 전역 fetch 를 가짜로 바꾼다. 아래 키·코드·토큰은 전부 시험용으로 지어낸 글자다.
 * DB 도 건드리지 않는다 — 아래쪽 hiqService 시험은 저장소를 메모리 가짜로 바꾼다(.env 는 운영 DB 다).
 * 라우트 시험도 서버를 띄우지 않는다 — 라우터에 등록된 처리 함수를 가짜 요청·응답으로 직접 부른다.
 */
const mem = vi.hoisted(() => {
    const state = {
        profiles: [] as any[], members: [] as any[], beforeLinkWrite: null as null | (() => void),
        // 저장소를 몇 번 불렀는지 — "DB 를 보기 전에 끊는다"를 확인할 때 쓴다
        reads: 0,
    };
    const col = { google: "googleSub", apple: "appleSub", kakao: "kakaoSub" } as const;
    // 매장 id 는 "<slug>-store" 꼴로 둔다(가짜) — 로그인할 회원 행을 고를 때 매장 slug 가 필요하다
    const slugOf = (storeId: unknown) => (typeof storeId === "string" && storeId.endsWith("-store") ? storeId.slice(0, -"-store".length) : null);
    const storage = {
        users: {
            async getProfileBySocialSub(provider: "google" | "apple" | "kakao", sub: string) {
                state.reads++;
                return state.profiles.find((p) => p[col[provider]] === sub);
            },
            // 진짜와 같은 규칙: 비어 있을 때만 쓴다 + 같은 번호가 다른 프로필에 있으면 유니크 제약(23505)
            async linkProfileKakaoSub(profileId: string, sub: string) {
                state.beforeLinkWrite?.();
                if (state.profiles.some((p) => p.kakaoSub === sub && p.id !== profileId)) {
                    throw Object.assign(new Error('duplicate key value violates unique constraint "profiles_kakao_sub_unique"'), { code: "23505" });
                }
                const p = state.profiles.find((x) => x.id === profileId);
                if (!p || p.kakaoSub) return false;
                p.kakaoSub = sub;
                return true;
            },
            // 진짜와 같은 규칙: 지금 붙어 있는 그 번호일 때만 지운다
            async unlinkProfileKakaoSub(profileId: string, sub: string) {
                const p = state.profiles.find((x) => x.id === profileId);
                if (!p || p.kakaoSub !== sub) return false;
                p.kakaoSub = null;
                return true;
            },
            // 진짜(user.repo)와 같은 규칙 함수를 쓴다 — 저장소는 행을 모아 줄 뿐, 고르는 것은 lib/loginMember 다
            async getLoginMemberByProfileId(profileId: string) {
                state.reads++;
                const { pickLoginMember } = await import("./loginMember.js");
                return pickLoginMember(state.members.filter((m) => m.profileId === profileId)
                    .map((m) => ({ member: m, storeSlug: slugOf(m.storeId), createdAt: m.createdAt })));
            },
            async fillProfileCountryIfEmpty() { /* 국가는 이 시험과 무관 */ },
        },
        async createProfile(data: any) { const p = { id: `p${state.profiles.length + 1}`, ...data }; state.profiles.push(p); return p; },
        async getProfile(id: string) { state.reads++; return state.profiles.find((p) => p.id === id); },
        async getProfileByPhone(phone: string) { state.reads++; return state.profiles.find((p) => p.phone === phone); },
        async updateProfile(id: string, data: any) { const p = state.profiles.find((x) => x.id === id); Object.assign(p, data); return p; },
        // 운영자 알림이 쓰는 옛 조회 — 가장 먼저 만든 행(넣은 순서). 로그인은 이제 이걸 쓰지 않는다
        async getMemberByProfileId(profileId: string) { state.reads++; return state.members.find((m) => m.profileId === profileId); },
        async getMemberById(id: string) { state.reads++; return state.members.find((m) => m.id === id); },
        async getMemberByPhone(storeId: string, phone: string) { state.reads++; return state.members.find((m) => m.storeId === storeId && m.phone === phone); },
        async getStoreBySlug(slug: string) { state.reads++; return { id: `${slug}-store`, slug }; },
        async createMember(data: any) { const m = { id: `m${state.members.length + 1}`, ...data }; state.members.push(m); return m; },
        async incrementVisitCount() { /* 방문 수는 이 시험과 무관 */ },
    };
    return { state, storage };
});
vi.mock("../db.js", () => ({ db: {}, pool: {} }));
vi.mock("../storage/index.js", () => ({ storage: mem.storage }));
vi.mock("./handle.js", () => ({ generateHandle: async () => "player_0001" }));
// 정지 계정 확인·약관 기록은 DB 를 직접 읽는다 — 라우트 시험에서는 '정지 아님'으로 둔다(이 시험이 보는 것이 아니다)
vi.mock("../middleware/terms.js", () => ({
    isMemberSuspended: async () => false,
    recordTermsAcceptance: async () => undefined,
    requireTermsAccepted: (_req: unknown, _res: unknown, next: () => void) => next(),
    SUSPENDED_TEXT: "정지된 계정",
}));
const REST = "test-rest-key";
const SECRET = "test-client-secret";
const CODE = "test-auth-code-0123456789";
const ACCESS = "test-access-token-abcdef";
const REDIRECT = "https://www.rankue.co.kr/auth/kakao";
/** 시험용 PIN — 지어낸 값이다. 저장은 옛 평문 꼴로 둔다(verifyPassword 가 평문·해시를 둘 다 받는다). */
const PIN = "4821";

type Call = { url: string; init: RequestInit };
let calls: Call[] = [];
let warn: ReturnType<typeof vi.spyOn>;

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** 토큰·사용자 조회 응답을 차례로 돌려주는 가짜 fetch. */
function fakeFetch(handlers: { token?: () => Response | Promise<Response>; me?: () => Response | Promise<Response> }) {
    const fn = vi.fn(async (url: any, init: any = {}) => {
        calls.push({ url: String(url), init });
        if (String(url).startsWith("https://kauth.kakao.com/oauth/token")) return (handlers.token ?? (() => json(200, { access_token: ACCESS, token_type: "bearer", refresh_token: "test-refresh", expires_in: 21599 })))();
        if (String(url).startsWith("https://kapi.kakao.com/v2/user/me")) return (handlers.me ?? (() => json(200, { id: 1234567890, kakao_account: { profile: { nickname: "홍길동" } } })))();
        throw new Error("시험에 없는 주소: " + url);
    });
    vi.stubGlobal("fetch", fn);
    return fn;
}

/** 로그 전체를 한 줄로 — 비밀 값이 새지 않았는지 볼 때 쓴다. */
const logged = () => warn.mock.calls.map((c: unknown[]) => c.map(String).join(" ")).join("\n");

beforeEach(() => {
    calls = [];
    vi.stubEnv("KAKAO_LOGIN_REST_KEY", REST);
    vi.stubEnv("KAKAO_LOGIN_CLIENT_SECRET", SECRET);
    // 여는 스위치(2026-10-06) — 시험은 열린 상태를 기준으로 본다. 닫힌 상태는 아래 kakaoConfigured 시험이 따로 본다
    vi.stubEnv("KAKAO_LOGIN_OPEN", "1");
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
});

describe("kakaoConfigured", () => {
    it("키가 둘 다 있어야 켜진다", () => {
        expect(kakaoConfigured()).toBe(true);
        vi.stubEnv("KAKAO_LOGIN_CLIENT_SECRET", "");
        expect(kakaoConfigured()).toBe(false);
        vi.stubEnv("KAKAO_LOGIN_CLIENT_SECRET", SECRET);
        vi.stubEnv("KAKAO_LOGIN_REST_KEY", "   ");
        expect(kakaoConfigured()).toBe(false);
    });

    it("키가 있어도 여는 스위치(KAKAO_LOGIN_OPEN=1)가 없으면 꺼져 있다 — 새 앱 빌드가 승인될 때까지", () => {
        expect(kakaoConfigured()).toBe(true);
        for (const off of ["", "0", "true", " "]) {
            vi.stubEnv("KAKAO_LOGIN_OPEN", off);
            expect(kakaoConfigured(), JSON.stringify(off)).toBe(false);
        }
        vi.stubEnv("KAKAO_LOGIN_OPEN", "1");
        expect(kakaoConfigured()).toBe(true);
    });
});

describe("exchangeKakaoCode — 성공", () => {
    it("토큰 요청: POST · form-urlencoded · 다섯 값이 다 실린다", async () => {
        fakeFetch({});
        const r = await exchangeKakaoCode(CODE, REDIRECT);
        expect(r).toEqual({ ok: true, identity: { sub: "1234567890", email: null, name: "홍길동" } });

        expect(calls).toHaveLength(2);
        const t = calls[0];
        expect(t.url).toBe("https://kauth.kakao.com/oauth/token");
        expect(t.init.method).toBe("POST");
        expect(new Headers(t.init.headers).get("content-type")).toMatch(/^application\/x-www-form-urlencoded/);
        expect(typeof t.init.body).toBe("string");
        const body = new URLSearchParams(t.init.body as string);
        expect(Object.fromEntries(body)).toEqual({
            grant_type: "authorization_code",
            client_id: REST,
            client_secret: SECRET,
            redirect_uri: REDIRECT,
            code: CODE,
        });
        expect(t.init.signal).toBeInstanceOf(AbortSignal);
    });

    it("사용자 조회: GET · Bearer 토큰 — 토큰은 주소에 싣지 않는다", async () => {
        fakeFetch({});
        await exchangeKakaoCode(CODE, REDIRECT);
        const m = calls[1];
        expect(m.url).toBe("https://kapi.kakao.com/v2/user/me");
        expect(m.init.method).toBe("GET");
        expect(new Headers(m.init.headers).get("authorization")).toBe(`Bearer ${ACCESS}`);
        expect(m.init.body).toBeUndefined();
    });

    it("화면이 보낸 redirectUri 를 글자 그대로 다시 보낸다(개발 서버에서는 localhost 도)", async () => {
        vi.stubEnv("NODE_ENV", "development");
        vi.stubEnv("VERCEL", "");
        fakeFetch({});
        const local = "http://localhost:5177/auth/kakao";
        expect((await exchangeKakaoCode(CODE, local)).ok).toBe(true);
        expect(new URLSearchParams(calls[0].init.body as string).get("redirect_uri")).toBe(local);
    });

    // 2026-10-05 검토: 운영 서버가 localhost Redirect URI 를 받아 주면, 같은 카카오 앱에 localhost 가 등록되는 순간
    // 그 포트를 듣는 다른 프로그램이 받은 인가 코드를 운영 서버에서 쿠키로 바꿀 수 있다. 개발일 때만 연다(닫힌 쪽이 기본).
    it("localhost 는 개발 서버에서만 받는다 — 운영·Vercel·환경을 모르는 곳에서는 카카오를 부르지도 않는다", async () => {
        const local = "http://localhost:5177/auth/kakao";
        const f = fakeFetch({});
        for (const [nodeEnv, vercel] of [["production", ""], ["production", "1"], ["development", "1"], ["test", ""], ["", ""]] as const) {
            vi.stubEnv("NODE_ENV", nodeEnv);
            vi.stubEnv("VERCEL", vercel);
            expect(kakaoLocalAllowed(), `${nodeEnv}/${vercel}`).toBe(false);
            expect(kakaoRedirectAllowed(local), `${nodeEnv}/${vercel}`).toBe(false);
            expect(await exchangeKakaoCode(CODE, local), `${nodeEnv}/${vercel}`).toEqual({ ok: false, reason: "bad-redirect" });
            // 운영 원본은 어디서나 받는다
            expect(kakaoRedirectAllowed(REDIRECT), `${nodeEnv}/${vercel}`).toBe(true);
        }
        expect(f).not.toHaveBeenCalled();

        vi.stubEnv("NODE_ENV", "development");
        vi.stubEnv("VERCEL", "");
        expect(kakaoLocalAllowed()).toBe(true);
        expect(kakaoRedirectAllowed(local)).toBe(true);
        // 개발이어도 localhost 꼴이 아니면 안 받는다
        expect(kakaoRedirectAllowed("http://127.0.0.1:5177/auth/kakao")).toBe(false);
        expect(kakaoRedirectAllowed("https://evil.example/auth/kakao")).toBe(false);
    });

    it("돌려주는 값에는 회원번호·닉네임뿐이다 — 토큰이 섞이지 않는다", async () => {
        fakeFetch({});
        const r = await exchangeKakaoCode(CODE, REDIRECT);
        const flat = JSON.stringify(r);
        for (const s of [ACCESS, "test-refresh", SECRET, REST, CODE]) expect(flat).not.toContain(s);
        expect(logged()).toBe("");
    });

    it("닉네임: kakao_account.profile 이 먼저, 없으면 properties, 동의하지 않았으면 null", async () => {
        fakeFetch({ me: () => json(200, { id: 7, kakao_account: { profile: { nickname: "  계정  닉네임 " } }, properties: { nickname: "옛 닉네임" } }) });
        expect(await exchangeKakaoCode(CODE, REDIRECT)).toEqual({ ok: true, identity: { sub: "7", email: null, name: "계정 닉네임" } });

        fakeFetch({ me: () => json(200, { id: 7, properties: { nickname: "옛 닉네임" } }) });
        expect(await exchangeKakaoCode(CODE, REDIRECT)).toMatchObject({ identity: { name: "옛 닉네임" } });

        fakeFetch({ me: () => json(200, { id: 7, kakao_account: { profile_nickname_needs_agreement: true } }) });
        expect(await exchangeKakaoCode(CODE, REDIRECT)).toEqual({ ok: true, identity: { sub: "7", email: null, name: null } });

        fakeFetch({ me: () => json(200, { id: 7, kakao_account: { profile: { nickname: "가".repeat(80) }, email: "someone@example.com" } }) });
        const long = await exchangeKakaoCode(CODE, REDIRECT);
        expect(long).toEqual({ ok: true, identity: { sub: "7", email: null, name: "가".repeat(40) } });
    });
});

describe("exchangeKakaoCode — 카카오를 부르지도 않는 경우", () => {
    it("키가 없으면 not-configured", async () => {
        const f = fakeFetch({});
        vi.stubEnv("KAKAO_LOGIN_REST_KEY", "");
        expect(await exchangeKakaoCode(CODE, REDIRECT)).toEqual({ ok: false, reason: "not-configured" });
        vi.stubEnv("KAKAO_LOGIN_REST_KEY", REST);
        vi.stubEnv("KAKAO_LOGIN_CLIENT_SECRET", "");
        expect(await exchangeKakaoCode(CODE, REDIRECT)).toEqual({ ok: false, reason: "not-configured" });
        expect(f).not.toHaveBeenCalled();
    });

    it("허용되지 않은 redirectUri 는 bad-redirect", async () => {
        const f = fakeFetch({});
        for (const bad of [
            "https://evil.example/auth/kakao",
            "https://rankue.co.kr/auth/kakao",
            "https://www.rankue.co.kr/auth/kakao?x=1",
            "https://www.rankue.co.kr.evil.example/auth/kakao",
            "http://127.0.0.1:5177/auth/kakao",
            "",
            undefined,
            null,
            { href: REDIRECT },
        ]) expect(await exchangeKakaoCode(CODE, bad), JSON.stringify(bad)).toEqual({ ok: false, reason: "bad-redirect" });
        expect(f).not.toHaveBeenCalled();
    });

    it("code 가 없거나 이상하면 bad-code", async () => {
        const f = fakeFetch({});
        for (const bad of ["", undefined, null, 12345, ["a"], "x".repeat(513)]) {
            expect(await exchangeKakaoCode(bad, REDIRECT), JSON.stringify(bad)?.slice(0, 20)).toEqual({ ok: false, reason: "bad-code" });
        }
        expect(f).not.toHaveBeenCalled();
    });
});

describe("exchangeKakaoCode — 토큰 실패", () => {
    it("KOE320(코드 만료·재사용) → token-failed. 사용자 조회는 부르지 않는다", async () => {
        fakeFetch({ token: () => json(400, { error: "invalid_grant", error_description: `authorization code not found for code=${CODE}`, error_code: "KOE320" }) });
        expect(await exchangeKakaoCode(CODE, REDIRECT)).toEqual({ ok: false, reason: "token-failed" });
        expect(calls).toHaveLength(1);
    });

    it("오류 본문은 서버 로그에 남긴다 — 단 code·secret·키는 가린다", async () => {
        fakeFetch({ token: () => json(400, { error: "invalid_grant", error_description: `authorization code not found for code=${CODE}`, error_code: "KOE320" }) });
        await exchangeKakaoCode(CODE, REDIRECT);
        const log = logged();
        expect(log).toContain("KOE320");
        expect(log).toContain("invalid_grant");
        expect(log).toContain("400");
        expect(log).not.toContain(CODE);
        expect(log).not.toContain(SECRET);
        expect(log).not.toContain(REST);
    });

    it("KOE010(client_secret 불일치) — 카카오가 본문에 값을 되돌려 줘도 로그에 남지 않는다", async () => {
        fakeFetch({ token: () => json(401, { error: "invalid_client", error_description: `Bad client credentials: ${REST} / ${SECRET}`, error_code: "KOE010" }) });
        expect(await exchangeKakaoCode(CODE, REDIRECT)).toEqual({ ok: false, reason: "token-failed" });
        const log = logged();
        expect(log).toContain("KOE010");
        expect(log).not.toContain(SECRET);
        expect(log).not.toContain(REST);
    });

    it("KOE006(redirect 불일치) → token-failed, 보낸 redirect_uri 는 로그에 남긴다(진단용)", async () => {
        fakeFetch({ token: () => json(400, { error: "invalid_grant", error_description: "Redirect URI mismatch.", error_code: "KOE006" }) });
        expect(await exchangeKakaoCode(CODE, REDIRECT)).toEqual({ ok: false, reason: "token-failed" });
        expect(logged()).toContain(REDIRECT);
    });

    it("200 인데 access_token 이 없다 / 본문이 JSON 이 아니다", async () => {
        fakeFetch({ token: () => json(200, { token_type: "bearer" }) });
        expect(await exchangeKakaoCode(CODE, REDIRECT)).toEqual({ ok: false, reason: "token-failed" });

        fakeFetch({ token: () => new Response("<html>bad gateway</html>", { status: 200 }) });
        expect(await exchangeKakaoCode(CODE, REDIRECT)).toEqual({ ok: false, reason: "token-failed" });

        // 200 이 아닌데 토큰처럼 생긴 값이 와도 믿지 않는다
        fakeFetch({ token: () => json(400, { access_token: ACCESS }) });
        expect(await exchangeKakaoCode(CODE, REDIRECT)).toEqual({ ok: false, reason: "token-failed" });
        expect(calls.filter((c) => c.url.includes("/v2/user/me"))).toHaveLength(0);
    });

    it("카카오가 5xx 로 답하면 upstream — 보낸 사람 잘못으로 세지 않는다", async () => {
        fakeFetch({ token: () => json(503, { error: "temporarily_unavailable" }) });
        expect(await exchangeKakaoCode(CODE, REDIRECT)).toEqual({ ok: false, reason: "upstream" });
        fakeFetch({ token: () => new Response("<html>bad gateway</html>", { status: 502 }) });
        expect(await exchangeKakaoCode(CODE, REDIRECT)).toEqual({ ok: false, reason: "upstream" });
        fakeFetch({ me: () => json(500, { id: 1234567890 }) });
        expect(await exchangeKakaoCode(CODE, REDIRECT)).toEqual({ ok: false, reason: "upstream" });

        expect(kakaoRejected("token-failed")).toBe(true);
        expect(kakaoRejected("user-failed")).toBe(true);
        for (const r of ["upstream", "timeout", "network", "not-configured", "bad-redirect", "bad-code"] as const) {
            expect(kakaoRejected(r), r).toBe(false);
        }
    });

    it("카카오에 닿지 못하면 network", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
        expect(await exchangeKakaoCode(CODE, REDIRECT)).toEqual({ ok: false, reason: "network" });
    });
});

describe("exchangeKakaoCode — 사용자 조회 실패", () => {
    it("401(-401 토큰 무효) → user-failed. 로그에 토큰이 남지 않는다", async () => {
        fakeFetch({ me: () => json(401, { msg: `this access token does not exist: ${ACCESS}`, code: -401 }) });
        expect(await exchangeKakaoCode(CODE, REDIRECT)).toEqual({ ok: false, reason: "user-failed" });
        const log = logged();
        expect(log).toContain("-401");
        expect(log).not.toContain(ACCESS);
        expect(log).not.toContain(CODE);
        expect(log).not.toContain(SECRET);
    });

    it("200 인데 id 가 없거나 쓸 수 없는 값이다", async () => {
        for (const id of [undefined, null, 0, -5, 1.5, "", "abc", "0123", Number.MAX_SAFE_INTEGER + 2, {}, true]) {
            fakeFetch({ me: () => json(200, { id, properties: { nickname: "홍길동" } }) });
            expect(await exchangeKakaoCode(CODE, REDIRECT), String(id)).toEqual({ ok: false, reason: "user-failed" });
        }
    });

    it("id 가 숫자 글자로 와도 받는다", async () => {
        fakeFetch({ me: () => json(200, { id: "4000000001" }) });
        expect(await exchangeKakaoCode(CODE, REDIRECT)).toEqual({ ok: true, identity: { sub: "4000000001", email: null, name: null } });
    });

    it("200 이 아니면 id 가 있어도 믿지 않는다 / 본문이 JSON 이 아니다", async () => {
        fakeFetch({ me: () => json(403, { id: 1234567890 }) });
        expect(await exchangeKakaoCode(CODE, REDIRECT)).toEqual({ ok: false, reason: "user-failed" });
        fakeFetch({ me: () => new Response("oops", { status: 200 }) });
        expect(await exchangeKakaoCode(CODE, REDIRECT)).toEqual({ ok: false, reason: "user-failed" });
    });

    it("사용자 조회에서 연결이 끊기면 network", async () => {
        fakeFetch({ me: () => { throw new TypeError("fetch failed"); } });
        expect(await exchangeKakaoCode(CODE, REDIRECT)).toEqual({ ok: false, reason: "network" });
    });
});

describe("exchangeKakaoCode — 시간 초과(6초)", () => {
    /** 끊길 때까지 답하지 않는 응답 — 진짜 fetch 처럼 signal 이 끊기면 AbortError 로 거절한다. */
    const hang = (init: RequestInit) => new Promise<Response>((_resolve, reject) => {
        init.signal!.addEventListener("abort", () => reject(Object.assign(new Error("This operation was aborted"), { name: "AbortError" })));
    });

    it("제한 시간은 6초다", () => {
        expect(KAKAO_TIMEOUT_MS).toBe(6000);
    });

    it("토큰 요청이 6초를 넘기면 끊고 timeout", async () => {
        vi.useFakeTimers();
        const f = vi.fn((_url: any, init: any) => hang(init));
        vi.stubGlobal("fetch", f);
        const p = exchangeKakaoCode(CODE, REDIRECT);
        let settled = false;
        void p.then(() => { settled = true; });
        await vi.advanceTimersByTimeAsync(KAKAO_TIMEOUT_MS - 1);
        expect(settled).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
        expect(await p).toEqual({ ok: false, reason: "timeout" });
        expect(f).toHaveBeenCalledTimes(1);
    });

    it("사용자 조회가 6초를 넘겨도 timeout", async () => {
        vi.useFakeTimers();
        const f = vi.fn((url: any, init: any) => String(url).includes("/oauth/token")
            ? Promise.resolve(json(200, { access_token: ACCESS }))
            : hang(init));
        vi.stubGlobal("fetch", f);
        const p = exchangeKakaoCode(CODE, REDIRECT);
        await vi.advanceTimersByTimeAsync(KAKAO_TIMEOUT_MS);
        expect(await p).toEqual({ ok: false, reason: "timeout" });
        expect(f).toHaveBeenCalledTimes(2);
        expect(logged()).not.toContain(ACCESS);
    });

    // 2026-10-05 검토: 예전에는 호출마다 6초라 합쳐 12초 가까이 갈 수 있었다 — 뒤에 DB 왕복이 붙으면 서버리스 함수 제한에 걸려
    // 플랫폼의 오류 원문이 화면에 나왔다. 이제 6초는 두 호출이 나눠 쓰는 상한이다.
    /** ms 뒤에 답하는 응답(가짜 시계로 흘려보낸다). */
    const after = (ms: number, res: () => Response) => new Promise<Response>((done) => { setTimeout(() => done(res()), ms); });

    it("6초는 두 호출을 합친 상한이다 — 토큰 요청이 4초를 쓰면 사용자 조회는 남은 2초만 쓴다", async () => {
        vi.useFakeTimers();
        const f = vi.fn((url: any, init: any) => String(url).includes("/oauth/token")
            ? after(4000, () => json(200, { access_token: ACCESS }))
            : hang(init));
        vi.stubGlobal("fetch", f);
        const p = exchangeKakaoCode(CODE, REDIRECT);
        let settled = false;
        void p.then(() => { settled = true; });
        await vi.advanceTimersByTimeAsync(KAKAO_TIMEOUT_MS - 1);
        expect(settled).toBe(false);
        expect(f).toHaveBeenCalledTimes(2);
        await vi.advanceTimersByTimeAsync(1);
        // 합쳐서 6초에 끝난다(예전 같으면 4초 + 6초 = 10초까지 붙잡았다)
        expect(await p).toEqual({ ok: false, reason: "timeout" });
        expect(vi.getTimerCount()).toBe(0);
    });

    it("토큰 요청이 시간을 거의 다 썼으면 사용자 조회를 시작하지 않고 timeout", async () => {
        vi.useFakeTimers();
        const f = vi.fn((url: any, init: any) => String(url).includes("/oauth/token")
            ? after(KAKAO_TIMEOUT_MS - 100, () => json(200, { access_token: ACCESS }))
            : hang(init));
        vi.stubGlobal("fetch", f);
        const p = exchangeKakaoCode(CODE, REDIRECT);
        await vi.advanceTimersByTimeAsync(KAKAO_TIMEOUT_MS - 100);
        expect(await p).toEqual({ ok: false, reason: "timeout" });
        expect(f).toHaveBeenCalledTimes(1);
        expect(logged()).not.toContain(ACCESS);
        expect(vi.getTimerCount()).toBe(0);
        // 느린 것은 보낸 사람 잘못이 아니다 — 시도 횟수에 세지 않는다
        expect(kakaoRejected("timeout")).toBe(false);
    });

    it("두 호출이 다 빠르면 예전과 같다 — 시간 예산이 정상 로그인을 건드리지 않는다", async () => {
        vi.useFakeTimers();
        const f = vi.fn((url: any) => String(url).includes("/oauth/token")
            ? after(300, () => json(200, { access_token: ACCESS }))
            : after(300, () => json(200, { id: 42 })));
        vi.stubGlobal("fetch", f);
        const p = exchangeKakaoCode(CODE, REDIRECT);
        await vi.advanceTimersByTimeAsync(600);
        expect(await p).toEqual({ ok: true, identity: { sub: "42", email: null, name: null } });
        expect(f).toHaveBeenCalledTimes(2);
    });

    it("제때 끝나면 타이머를 치운다 — 남은 타이머가 서버리스 함수를 붙잡지 않게", async () => {
        vi.useFakeTimers();
        fakeFetch({});
        expect((await exchangeKakaoCode(CODE, REDIRECT)).ok).toBe(true);
        expect(vi.getTimerCount()).toBe(0);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 신원 → 계정(hiqService). 저장소는 위의 메모리 가짜다.
// ─────────────────────────────────────────────────────────────────────────────
const kakao = (sub: string, name: string | null = null) => ({ sub, email: null, name });

describe("hiqService.socialLogin — 카카오", () => {
    beforeEach(() => {
        mem.state.profiles = [];
        mem.state.members = [];
        mem.state.beforeLinkWrite = null;
    });

    it("처음이면 프로필(kakao_sub)과 회원(글로벌 매장)을 만든다", async () => {
        const r = await hiqService.socialLogin("kakao", kakao("1234567890", "홍길동"), undefined, "KR");
        expect(r.isNew).toBe(true);
        expect(mem.state.profiles).toHaveLength(1);
        expect(mem.state.profiles[0]).toMatchObject({ kakaoSub: "1234567890", nickname: "홍길동", countryCode: "KR", role: "user" });
        expect(mem.state.profiles[0].googleSub).toBeUndefined();
        expect(mem.state.profiles[0].appleSub).toBeUndefined();
        expect(mem.state.members[0]).toMatchObject({ name: "홍길동", profileId: "p1", storeId: "global-store" });
        expect(r.member.id).toBe("m1");
    });

    // 2026-10-05 검토: 회원 행의 phone 자리에 카카오 회원번호를 넣으면(`social:kakao:<번호>`) 그 글자가 로그인 응답·/me 에 실리고,
    // 회원번호는 짧은 숫자라 주변 대역을 훑을 수 있다. 카카오 로그인은 프로필의 kakao_sub 로 찾으므로 난수면 충분하다.
    it("회원 행의 phone 자리표시자에는 회원번호가 아니라 난수가 붙는다 — 응답에 회원번호가 실리지 않는다", async () => {
        const a = await hiqService.socialLogin("kakao", kakao("1234567890", "홍길동"));
        const b = await hiqService.socialLogin("kakao", kakao("1234567891", "김당구"));
        for (const r of [a, b]) {
            expect(r.member.phone).toMatch(/^social:kakao:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
            expect(JSON.stringify(r)).not.toMatch(/123456789[01]/);
        }
        // 사람마다 다르다 — (store_id, phone) 유니크에 걸리지 않고, 하나를 알아도 다른 것을 짐작할 수 없다
        expect(a.member.phone).not.toBe(b.member.phone);
        // 화면들이 소셜 회원을 가리는 검사(startsWith("social:"))는 그대로 통한다
        expect(a.member.phone.startsWith("social:")).toBe(true);
        // 두 번째 로그인은 번호가 아니라 프로필(kakao_sub)로 같은 회원을 찾는다
        const again = await hiqService.socialLogin("kakao", kakao("1234567890"));
        expect(again.member.id).toBe(a.member.id);
        expect(again.member.phone).toBe(a.member.phone);
    });

    it("닉네임에 동의하지 않았으면 기본 이름은 '랭큐회원'", async () => {
        await hiqService.socialLogin("kakao", kakao("7"));
        expect(mem.state.profiles[0].nickname).toBe("랭큐회원");
        expect(mem.state.members[0].name).toBe("랭큐회원");
    });

    it("두 번째부터는 같은 계정으로 들어온다 — 새로 만들지 않는다", async () => {
        const a = await hiqService.socialLogin("kakao", kakao("7", "홍길동"));
        const b = await hiqService.socialLogin("kakao", kakao("7", "이름을 바꿨다"));
        expect(b.isNew).toBe(false);
        expect(b.member.id).toBe(a.member.id);
        expect(mem.state.profiles).toHaveLength(1);
        expect(mem.state.members).toHaveLength(1);
        expect(mem.state.profiles[0].nickname).toBe("홍길동"); // 우리 쪽 이름은 로그인할 때마다 덮지 않는다
    });

    it("구글·애플의 동작은 그대로다 — 열도, 기본 이름 'Player' 도", async () => {
        await hiqService.socialLogin("google", { sub: "g-1", email: null, name: null });
        await hiqService.socialLogin("apple", { sub: "a-1", email: "someone@example.com", name: null }, "Kim");
        expect(mem.state.profiles[0]).toMatchObject({ googleSub: "g-1", nickname: "Player" });
        expect(mem.state.profiles[0].kakaoSub).toBeUndefined();
        expect(mem.state.members[0]).toMatchObject({ phone: "social:google:g-1", name: "Player" });
        expect(mem.state.profiles[1]).toMatchObject({ appleSub: "a-1", nickname: "Kim" });
        expect(mem.state.members[1].phone).toBe("social:apple:a-1");
    });

    it("같은 번호라도 제공자가 다르면 다른 사람이다", async () => {
        await hiqService.socialLogin("google", { sub: "777", email: null, name: "G" });
        const r = await hiqService.socialLogin("kakao", kakao("777", "K"));
        expect(r.isNew).toBe(true);
        expect(mem.state.profiles).toHaveLength(2);
    });

    it("전화번호 회원이 카카오를 연결해 뒀으면 카카오로 들어와도 그 계정이다", async () => {
        mem.state.profiles.push({ id: "phone-profile", nickname: "김당구", phone: "01000000000", password: PIN, kakaoSub: null });
        mem.state.members.push({ id: "phone-member", profileId: "phone-profile", storeId: "hiq-store", phone: "01000000000", name: "김당구" });
        expect(await hiqService.linkKakao("phone-member", kakao("55"))).toBe("ok");

        const r = await hiqService.socialLogin("kakao", kakao("55", "카카오 닉네임"));
        expect(r.isNew).toBe(false);
        expect(r.member.id).toBe("phone-member");
        expect(mem.state.profiles).toHaveLength(1);
        expect(mem.state.members).toHaveLength(1);
    });

    // 2026-10-05 검토: 같은 전화번호+PIN 으로 제휴 매장에 먼저 가입하고 본 사이트(hiq)에 나중에 가입하면 프로필 하나에 회원 행이 둘이다.
    // hiq 행에서 카카오를 연결했는데 카카오 로그인이 '가장 오래된 행'(매장 행)으로 들어가, 전적·레이팅이 다른 계정처럼 보였다.
    it("회원 행이 여럿인 프로필 — 카카오 로그인은 연결을 누른 본 사이트(hiq) 행으로 들어온다(더 오래된 매장 행이 아니라)", async () => {
        mem.state.profiles.push({ id: "multi", nickname: "김당구", phone: "01000000009", password: PIN, kakaoSub: null });
        mem.state.members.push(
            { id: "store-row", profileId: "multi", storeId: "abc-store", phone: "01000000009", name: "김당구", createdAt: new Date("2026-01-01T00:00:00Z") },
            { id: "hiq-row", profileId: "multi", storeId: "hiq-store", phone: "01000000009", name: "김당구", createdAt: new Date("2026-06-01T00:00:00Z") },
        );
        // 옛 조회(가장 먼저 만든 행)는 매장 행을 준다 — 예전 로그인이 고르던 행
        expect((await mem.storage.getMemberByProfileId("multi"))?.id).toBe("store-row");

        expect(await hiqService.linkKakao("hiq-row", kakao("77"))).toBe("ok");
        const r = await hiqService.socialLogin("kakao", kakao("77"));
        expect(r.isNew).toBe(false);
        expect(r.member.id).toBe("hiq-row");
        expect(mem.state.members).toHaveLength(2); // 새 회원 행을 만들지 않는다
    });
});

describe("pickLoginMember — 소셜 로그인이 들어갈 회원 행(본 사이트 → 글로벌 → 가장 오래된 것)", () => {
    const row = (id: string, storeSlug: string | null, at: string | null) => ({ member: { id }, storeSlug, createdAt: at ? new Date(at) : null });

    it("행이 하나면 그 행 — 소셜로 가입한 프로필(글로벌 행 하나)은 예전과 같다", () => {
        expect(pickLoginMember([row("g", "global", "2026-01-01")])?.id).toBe("g");
        expect(pickLoginMember([row("s", "abc", "2026-01-01")])?.id).toBe("s");
        expect(pickLoginMember([])).toBeUndefined();
    });

    it("본 사이트(hiq) 행이 가장 먼저다 — 만든 순서·넘겨받은 순서와 무관하게", () => {
        const rows = [row("store", "abc", "2025-01-01"), row("global", "global", "2025-06-01"), row("hiq", "hiq", "2026-06-01")];
        expect(pickLoginMember(rows)?.id).toBe("hiq");
        expect(pickLoginMember([...rows].reverse())?.id).toBe("hiq");
    });

    it("hiq 행이 없으면 글로벌 행, 그것도 없으면 가장 오래된 행", () => {
        expect(pickLoginMember([row("store", "abc", "2025-01-01"), row("global", "global", "2026-06-01")])?.id).toBe("global");
        expect(pickLoginMember([row("new", "abc", "2026-06-01"), row("old", "xyz", "2025-01-01")])?.id).toBe("old");
        // 같은 매장 급이면 오래된 쪽 — 만든 때를 모르는 행은 뒤로
        expect(pickLoginMember([row("unknown", "abc", null), row("dated", "xyz", "2026-06-01")])?.id).toBe("dated");
        expect(pickLoginMember([row("no-store", null, "2025-01-01"), row("hiq", "hiq", "2026-06-01")])?.id).toBe("hiq");
    });

    it("넘겨받은 배열을 건드리지 않는다", () => {
        const rows = [row("store", "abc", "2025-01-01"), row("hiq", "hiq", "2026-06-01")];
        const before = rows.map((r) => r.member.id);
        pickLoginMember(rows);
        expect(rows.map((r) => r.member.id)).toEqual(before);
    });

    it("저장소는 이 규칙을 쓰고, 운영자 알림이 기대는 옛 조회(가장 먼저 만든 행)는 건드리지 않았다", () => {
        const repo = root("server/storage/user.repo.ts");
        const login = repo.slice(repo.indexOf("async getLoginMemberByProfileId("), repo.indexOf("async getProfileByPhone("));
        expect(login).toContain("return pickLoginMember(");
        expect(login).toContain("storeSlug: hiqStores.slug");
        const old = repo.slice(repo.indexOf("async getMemberByProfileId("), repo.indexOf("async getLoginMemberByProfileId("));
        expect(old).toContain(".orderBy(asc(hiqMembers.createdAt))");
        expect(old).toContain(".limit(1);");
        expect(old).not.toContain("hiqStores");
        // 로그인(socialLogin)만 새 조회를 쓴다
        const service = root("server/services/hiqService.ts");
        expect(service).toContain("let member = await storage.users.getLoginMemberByProfileId(profile.id);");
        expect(service).not.toContain("storage.getMemberByProfileId(");
    });
});

describe("hiqService.linkKakao — 로그인한 회원의 프로필에 카카오를 붙인다", () => {
    beforeEach(() => {
        mem.state.profiles = [
            { id: "pa", nickname: "가", password: PIN, kakaoSub: null },
            { id: "pb", nickname: "나", kakaoSub: "900" },
            { id: "pc", nickname: "다", kakaoSub: null }, // PIN 없는 프로필(매장 등록 회원이 설정에서 성별을 눌러 생긴 것 등)
        ];
        mem.state.members = [
            { id: "ma", profileId: "pa", phone: "01000000001" },
            { id: "mb", profileId: "pb", phone: "social:kakao:0b0e6f0e-8a3f-4d0c-9d43-1c1f0a2b3c4d" },
            { id: "store-only", profileId: null, phone: "01000000002" }, // 매장에서 전화번호만으로 등록
            { id: "mc", profileId: "pc", phone: "01000000003" },
        ];
        mem.state.beforeLinkWrite = null;
    });

    it("ok — 내 프로필에 적는다", async () => {
        expect(await hiqService.linkKakao("ma", kakao("100"))).toBe("ok");
        expect(mem.state.profiles[0].kakaoSub).toBe("100");
    });

    it("ok — 이미 같은 카카오가 붙어 있으면 두 번 눌러도 된다", async () => {
        expect(await hiqService.linkKakao("mb", kakao("900"))).toBe("ok");
        expect(await hiqService.linkKakao("ma", kakao("100"))).toBe("ok");
        expect(await hiqService.linkKakao("ma", kakao("100"))).toBe("ok");
        expect(mem.state.profiles.map((p) => p.kakaoSub)).toEqual(["100", "900", null]);
    });

    it("no-profile — 프로필이 없는 회원·없는 회원", async () => {
        expect(await hiqService.linkKakao("store-only", kakao("100"))).toBe("no-profile");
        expect(await hiqService.linkKakao("nobody", kakao("100"))).toBe("no-profile");
        mem.state.members.push({ id: "dangling", profileId: "gone" });
        expect(await hiqService.linkKakao("dangling", kakao("100"))).toBe("no-profile");
        expect(mem.state.profiles.map((p) => p.kakaoSub)).toEqual([null, "900", null]);
    });

    // 2026-10-05 검토: PIN 없는 계정은 번호만 알면 들어올 수 있다 — 거기에 카카오를 붙이게 두면 남이 영구적인 로그인 수단을 심는다.
    // 라우트가 PIN 확인을 빠뜨려도 서비스가 붙이지 않는다.
    it("no-pin — PIN 없는 프로필에는 붙이지 않는다", async () => {
        expect(await hiqService.linkKakao("mc", kakao("100"))).toBe("no-pin");
        expect(mem.state.profiles.map((p) => p.kakaoSub)).toEqual([null, "900", null]);
    });

    it("taken — 그 카카오가 이미 다른 랭큐 계정에 있다. 남의 것도 내 것도 바꾸지 않는다", async () => {
        expect(await hiqService.linkKakao("ma", kakao("900"))).toBe("taken");
        expect(mem.state.profiles.map((p) => p.kakaoSub)).toEqual([null, "900", null]);
    });

    it("other-linked — 내 프로필에 다른 카카오가 이미 있다. 덮어쓰지 않는다", async () => {
        expect(await hiqService.linkKakao("mb", kakao("901"))).toBe("other-linked");
        expect(mem.state.profiles[1].kakaoSub).toBe("900");
    });

    it("확인과 쓰기 사이에 남이 먼저 가져가면(유니크 위반) taken", async () => {
        mem.state.beforeLinkWrite = () => { mem.state.profiles[1].kakaoSub = "100"; };
        expect(await hiqService.linkKakao("ma", kakao("100"))).toBe("taken");
        expect(mem.state.profiles[0].kakaoSub).toBeNull();
    });

    it("확인과 쓰기 사이에 내 프로필에 먼저 적혔으면 — 같은 값이면 ok, 다른 값이면 other-linked", async () => {
        mem.state.beforeLinkWrite = () => { mem.state.profiles[0].kakaoSub = "100"; };
        expect(await hiqService.linkKakao("ma", kakao("100"))).toBe("ok");

        mem.state.profiles[0].kakaoSub = null;
        mem.state.beforeLinkWrite = () => { mem.state.profiles[0].kakaoSub = "101"; };
        expect(await hiqService.linkKakao("ma", kakao("100"))).toBe("other-linked");
        expect(mem.state.profiles[0].kakaoSub).toBe("101");
    });

    it("유니크 위반이 아닌 DB 오류는 삼키지 않는다", async () => {
        mem.state.beforeLinkWrite = () => { throw Object.assign(new Error("connection terminated"), { code: "08006" }); };
        await expect(hiqService.linkKakao("ma", kakao("100"))).rejects.toThrow("connection terminated");
    });
});

// 2026-10-05 검토: 연결·해제는 쿠키만으로 해 주지 않는다 — 30일짜리 로그인 쿠키를 쥔 사람(빌린 폰·PIN 없는 계정에 번호만으로
// 들어온 사람)이 PIN 과 무관한 영구 로그인 수단을 심거나 떼지 못하게 로그인 PIN 을 다시 받는다.
describe("hiqService.checkKakaoPin · unlinkKakao — 연결·해제의 본인 확인(PIN)", () => {
    beforeEach(() => {
        mem.state.profiles = [
            { id: "pa", nickname: "가", password: PIN, kakaoSub: "100" },                      // 전화번호 회원, 카카오 연결됨
            { id: "pb", nickname: "나", kakaoSub: "900" },                                       // 카카오로 가입(PIN 없음)
            { id: "pc", nickname: "다", kakaoSub: null },                                        // PIN 없는 프로필
            { id: "pd", nickname: "라", password: "$2b$10$" + "a".repeat(53), kakaoSub: null }, // 해시로 저장된 PIN(맞는 값을 모른다)
        ];
        mem.state.members = [
            { id: "ma", profileId: "pa", phone: "01000000001" },
            { id: "mb", profileId: "pb", phone: "social:kakao:0b0e6f0e-8a3f-4d0c-9d43-1c1f0a2b3c4d" },
            { id: "mc", profileId: "pc", phone: "01000000003" },
            { id: "md", profileId: "pd", phone: "01000000004" },
            { id: "store-only", profileId: null, phone: "01000000002" },
        ];
        mem.state.beforeLinkWrite = null;
    });

    it("checkKakaoPin — 맞으면 ok, 틀리거나 비면 wrong-pin", async () => {
        expect(await hiqService.checkKakaoPin("ma", PIN)).toBe("ok");
        for (const bad of ["0000", "", undefined, null, 4821, ["4821"], PIN + "0"]) {
            expect(await hiqService.checkKakaoPin("ma", bad), JSON.stringify(bad)).toBe("wrong-pin");
        }
        // 해시로 저장된 PIN 도 같은 길(bcrypt)로 본다 — 아무 값이나 맞다고 하지 않는다
        expect(await hiqService.checkKakaoPin("md", PIN)).toBe("wrong-pin");
    });

    it("checkKakaoPin — PIN 없는 계정은 no-pin(확인할 방법이 없다), 프로필 없는 회원은 no-profile", async () => {
        expect(await hiqService.checkKakaoPin("mc", PIN)).toBe("no-pin");
        expect(await hiqService.checkKakaoPin("mb", PIN)).toBe("no-pin");
        expect(await hiqService.checkKakaoPin("mc", undefined)).toBe("no-pin");
        expect(await hiqService.checkKakaoPin("store-only", PIN)).toBe("no-profile");
        expect(await hiqService.checkKakaoPin("nobody", PIN)).toBe("no-profile");
    });

    it("unlinkKakao — PIN 이 맞으면 뗀다. 떼고 나면 그 카카오로는 이 계정에 못 들어온다", async () => {
        expect(await hiqService.unlinkKakao("ma", PIN)).toBe("ok");
        expect(mem.state.profiles[0].kakaoSub).toBeNull();
        // 다시 눌러도 ok(이미 떼어져 있다)
        expect(await hiqService.unlinkKakao("ma", PIN)).toBe("ok");
        // 그 카카오로 들어오면 이제 새 계정이다 — 옛 계정의 회원 행이 잡히지 않는다
        const r = await hiqService.socialLogin("kakao", kakao("100"));
        expect(r.isNew).toBe(true);
        expect(r.member.id).not.toBe("ma");
        // 뗀 뒤에는 다른 카카오를 붙일 수 있다(잘못 붙은 것을 바로잡는 길)
        expect(await hiqService.linkKakao("ma", kakao("101"))).toBe("ok");
        expect(mem.state.profiles[0].kakaoSub).toBe("101");
    });

    it("unlinkKakao — PIN 이 틀리면 떼지 않는다", async () => {
        for (const bad of ["0000", "", undefined, null]) {
            expect(await hiqService.unlinkKakao("ma", bad), JSON.stringify(bad)).toBe("wrong-pin");
        }
        expect(mem.state.profiles[0].kakaoSub).toBe("100");
    });

    it("unlinkKakao — 카카오로 가입한 계정은 떼지 않는다(떼면 들어올 길이 없다)", async () => {
        expect(await hiqService.unlinkKakao("mb", PIN)).toBe("signup-account");
        expect(await hiqService.unlinkKakao("mb", undefined)).toBe("signup-account");
        expect(mem.state.profiles[1].kakaoSub).toBe("900");
    });

    it("unlinkKakao — PIN 없는 계정·프로필 없는 회원", async () => {
        mem.state.profiles[2].kakaoSub = "300"; // PIN 없는 프로필에 붙어 있던 카카오(이 변경 전에 붙인 것)
        expect(await hiqService.unlinkKakao("mc", PIN)).toBe("no-pin");
        expect(mem.state.profiles[2].kakaoSub).toBe("300");
        expect(await hiqService.unlinkKakao("store-only", PIN)).toBe("no-profile");
        expect(await hiqService.unlinkKakao("nobody", PIN)).toBe("no-profile");
    });
});

// 2026-10-05 검토(high): POST /login 이 `social:kakao:<회원번호>` 를 전화번호로 받아 PIN 없이 카카오 가입자로 로그인시켰다.
// 전화번호 로그인은 phone 칸을 글자 그대로 비교하고, 소셜로 가입한 프로필에는 PIN 이 없기 때문이다.
describe("hiqService.login — 소셜 계정은 전화번호 길로 들이지 않는다", () => {
    beforeEach(() => {
        mem.state.profiles = [
            { id: "k", nickname: "카카오 가입", kakaoSub: "1234567890" },
            { id: "g", nickname: "구글 가입", googleSub: "108234567890123456789" },
            { id: "a", nickname: "애플 가입", appleSub: "000123.abcdef.4567" },
            { id: "legacy", nickname: "매장 등록", phone: "01000000005" },          // PIN 없는 옛 프로필(소셜 아님)
            { id: "pin", nickname: "PIN 회원", phone: "01000000006", password: PIN },
        ];
        mem.state.members = [
            // 옛 꼴(회원번호가 붙은 자리표시자)도 막혀야 한다 — 구글·애플 행은 지금도 이 꼴이다
            { id: "mk", profileId: "k", storeId: "global-store", phone: "social:kakao:1234567890", name: "카카오 가입" },
            { id: "mg", profileId: "g", storeId: "global-store", phone: "social:google:108234567890123456789", name: "구글 가입" },
            { id: "ma", profileId: "a", storeId: "global-store", phone: "social:apple:000123.abcdef.4567", name: "애플 가입" },
            { id: "gone", profileId: null, storeId: "global-store", phone: "del-0b0e6f0e-8a3", name: "탈퇴회원" },
            { id: "ml", profileId: "legacy", storeId: "hiq-store", phone: "01000000005", name: "매장 등록" },
            { id: "mp", profileId: "pin", storeId: "hiq-store", phone: "01000000006", name: "PIN 회원" },
            { id: "bare", profileId: null, storeId: "hiq-store", phone: "01000000007", name: "번호만" },
        ];
        mem.state.reads = 0;
    });

    it("자리표시자를 전화번호로 보내면 400 — 저장소를 보기도 전에 끊는다(있는 계정인지도 알려 주지 않는다)", async () => {
        for (const phone of [
            "social:kakao:1234567890", "social:google:108234567890123456789", "social:apple:000123.abcdef.4567",
            "social:kakao:9999999999", "del-0b0e6f0e-8a3", " social:kakao:1234567890", "SOCIAL:kakao:1234567890",
        ]) {
            await expect(hiqService.login(phone, "global"), phone).rejects.toMatchObject({ statusCode: 400 });
        }
        for (const bad of [undefined, null, "", 1012345678] as unknown as string[]) {
            await expect(hiqService.login(bad, "hiq"), String(bad)).rejects.toMatchObject({ statusCode: 400 });
        }
        expect(mem.state.reads).toBe(0);
    });

    it("자리표시자 꼴이 달라도 — PIN 없는 소셜 프로필에 매달린 회원 행은 전화번호 길로 열리지 않는다", async () => {
        // 가정: 어떤 이유로 소셜 프로필의 회원 행이 전화번호처럼 생긴 글자를 갖게 됐다(자리표시자 규칙이 바뀌는 등)
        mem.state.members.push(
            { id: "odd-k", profileId: "k", storeId: "hiq-store", phone: "01099990001", name: "카카오 가입" },
            { id: "odd-g", profileId: "g", storeId: "hiq-store", phone: "01099990002", name: "구글 가입" },
            { id: "odd-a", profileId: "a", storeId: "hiq-store", phone: "01099990003", name: "애플 가입" },
        );
        for (const phone of ["01099990001", "01099990002", "01099990003"]) {
            const err = await hiqService.login(phone, "hiq").then(() => null, (e) => e);
            expect(err, phone).toMatchObject({ statusCode: 401 });
            // PIN 이 틀린 것과는 다른 실패다 — 라우트가 이것을 PIN 시도로 세지 않는다
            expect(err.message, phone).not.toBe("INVALID_PASSWORD");
        }
    });

    it("기존 전화번호 회원의 동작은 그대로다 — PIN 회원은 PIN 을 묻고, 번호만으로 등록한 옛 회원은 통과, 없는 번호는 가입으로", async () => {
        expect(await hiqService.login("01000000006", "hiq")).toMatchObject({ isNew: false, requiresPassword: true });
        expect(await hiqService.login("01000000006", "hiq", PIN)).toMatchObject({ isNew: false, member: { id: "mp" } });
        await expect(hiqService.login("01000000006", "hiq", "0000")).rejects.toThrow("INVALID_PASSWORD");
        expect(await hiqService.login("01000000005", "hiq")).toMatchObject({ isNew: false, member: { id: "ml" } });
        expect(await hiqService.login("01000000007", "hiq")).toMatchObject({ isNew: false, member: { id: "bare" } });
        expect(await hiqService.login("01000000099", "hiq")).toMatchObject({ isNew: true, storeId: "hiq-store" });
    });

    it("가입(register)도 자리표시자를 전화번호로 받지 않는다 — 소셜 회원이 쓸 자리를 남이 먼저 차지하지 못한다", async () => {
        const before = mem.state.members.length;
        for (const phone of ["social:kakao:5555555555", "social:google:1", "del-abc"]) {
            await expect(hiqService.register({ phone, name: "선점", storeId: "global-store" } as any), phone).rejects.toMatchObject({ statusCode: 400 });
        }
        expect(mem.state.members).toHaveLength(before);
        expect(mem.state.reads).toBe(0);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 소스 규칙 — 라우트·사전·스키마·마이그레이션이 서로 어긋나지 않는지 글자로 본다.
// (서버를 띄우는 시험은 두지 않는다: 올리면 운영 DB 에 붙는다. 동작은 아래 '라우트 동작'에서 처리 함수를 직접 불러 본다.)
// ─────────────────────────────────────────────────────────────────────────────
const root = (p: string) => readFileSync(resolve(__dirname, "../..", p), "utf8");

describe("카카오 라우트 규칙(server/routes/modules/auth.ts)", () => {
    const auth = root("server/routes/modules/auth.ts");
    const loginAt = auth.indexOf('router.post("/social/kakao",');
    const linkAt = auth.indexOf('router.post("/social/kakao/link",');
    const unlinkAt = auth.indexOf('router.delete("/social/kakao/link",');
    const registerAt = auth.indexOf('router.post("/register"');
    const login = auth.slice(loginAt, auth.indexOf("function sendKakaoPinFailure"));
    const link = auth.slice(linkAt, unlinkAt);
    const unlink = auth.slice(unlinkAt, registerAt);
    const social = auth.slice(auth.indexOf('router.post("/social",'), auth.indexOf("// --- 카카오 로그인"));

    it("세 길이 다 있다 — 로그인·연결·해제", () => {
        expect(loginAt).toBeGreaterThan(0);
        expect(linkAt).toBeGreaterThan(loginAt);
        expect(unlinkAt).toBeGreaterThan(linkAt);
        expect(registerAt).toBeGreaterThan(unlinkAt);
    });

    it("둘 다 JSON 본문만·허용 목록·시도 횟수 제한·자리 잡기를 거친 뒤에 카카오를 부른다", () => {
        for (const block of [login, link]) {
            const ex = block.indexOf("exchanged = await exchangeKakaoCode(code, redirectUri);");
            expect(ex).toBeGreaterThan(0);
            for (const guard of ["kakaoConfigured()", "isJsonBody(req)", "kakaoRedirectAllowed(redirectUri)", "checkRateLimit(key)", "takeAttemptSlot(key)"]) {
                const at = block.indexOf(guard);
                expect(at, guard).toBeGreaterThan(0);
                expect(at, guard).toBeLessThan(ex);
            }
            // 잡은 자리는 성공·실패·예외 어느 쪽이든 놓는다
            const after = block.slice(ex);
            expect(after.indexOf("} finally {")).toBeGreaterThan(0);
            expect(after.indexOf("release();")).toBeGreaterThan(after.indexOf("} finally {"));
            // 카카오가 느리거나 죽은 것은 세지 않는다
            expect(block).toContain("if (kakaoRejected(exchanged.reason)) registerFailure(key);");
        }
        // 허용 목록은 서버 한 곳의 판단(개발일 때만 localhost)을 거친다 — shared 의 함수를 라우트가 직접 부르지 않는다
        expect(auth).not.toContain("isAllowedKakaoRedirect");
        expect(root("server/lib/kakaoAuth.ts")).toContain("return isAllowedKakaoRedirect(uri, kakaoLocalAllowed());");
    });

    it("연결·해제: 본인 확인(PIN)이 먼저다 — 연결은 카카오를 부르기 전에 본다(틀려도 인가 코드가 쓰이지 않는다). 자리는 PIN 보다 먼저 잡는다", () => {
        const check = link.indexOf("sendKakaoPinFailure(res, key, await hiqService.checkKakaoPin(req.userId!, pin))");
        expect(check).toBeGreaterThan(link.indexOf("checkRateLimit(key)"));
        // 자리 잡기가 PIN 대조보다 앞이다(2026-10-06 검토) — 뒤에 있으면 한꺼번에 온 요청이 전부 PIN 답을 받는다
        expect(link.indexOf("takeAttemptSlot(key)")).toBeGreaterThan(link.indexOf("checkRateLimit(key)"));
        expect(check).toBeGreaterThan(link.indexOf("takeAttemptSlot(key)"));
        expect(check).toBeLessThan(link.indexOf("exchanged = await exchangeKakaoCode(code, redirectUri);"));
        // 틀린 PIN 은 실패 횟수에 센다 — 쿠키를 쥔 사람이 이 길로 PIN 을 맞혀 보지 못하게
        const fn = auth.slice(auth.indexOf("function sendKakaoPinFailure"), linkAt);
        expect(fn.indexOf("registerFailure(key);")).toBeGreaterThan(fn.indexOf('if (checked === "wrong-pin") {'));
        expect(fn).toContain('sendError(res, 401, "err.auth.kakaoPinWrong", "KAKAO_PIN_WRONG")');
        expect(fn).toContain('sendError(res, 409, "err.auth.kakaoPinRequired", "KAKAO_PIN_REQUIRED")');
        // 해제도 로그인 필수 + 같은 확인
        expect(unlink).toContain('router.delete("/social/kakao/link", requireAuth,');
        expect(unlink).toContain("hiqService.unlinkKakao(req.userId!, pin)");
        expect(unlink).toContain("sendKakaoPinFailure(res, key, unlinked)");
        expect(unlink).toContain('sendError(res, 409, "err.auth.kakaoUnlinkSignup", "KAKAO_SIGNUP_ACCOUNT")');
        expect(unlink).not.toContain("res.cookie(");
        expect(unlink).not.toContain("exchangeKakaoCode");
        // 해제도 PIN 대조 전에 자리를 잡고, 끝나면(성공·실패·예외) 놓는다(2026-10-06 검토)
        const unlinkCall = unlink.indexOf("unlinked = await hiqService.unlinkKakao(req.userId!, pin);");
        expect(unlink.indexOf("takeAttemptSlot(key)")).toBeGreaterThan(unlink.indexOf("checkRateLimit(key)"));
        expect(unlinkCall).toBeGreaterThan(unlink.indexOf("takeAttemptSlot(key)"));
        expect(unlink.slice(unlinkCall)).toMatch(/\} finally \{\s+release\(\);/);
    });

    it("로그인: PIN 대조 전에 자리를 잡고, 끝나면(성공·실패·예외) 놓는다", () => {
        const block = auth.slice(auth.indexOf('router.post("/login"'), auth.indexOf('router.post("/social",'));
        const slot = block.indexOf("takeAttemptSlot(key)");
        const call = block.indexOf("result = await hiqService.login(phone, storeSlug, password);");
        expect(slot).toBeGreaterThan(block.indexOf("checkRateLimit(probeKey)"));
        expect(call).toBeGreaterThan(slot);
        expect(block.slice(call)).toMatch(/\} finally \{\s+release\(\);/);
    });

    it("전화번호 입구 네 곳이 같은 검사로 자리표시자를 끊는다 — 로그인·가입·PIN 재설정(질문·확인)", () => {
        const routes = ['router.post("/login"', 'router.post("/register"', 'router.post("/reset-pin/question"', 'router.post("/reset-pin/verify"'];
        for (let i = 0; i < routes.length; i++) {
            const at = auth.indexOf(routes[i]);
            expect(at, routes[i]).toBeGreaterThan(0);
            const next = auth.indexOf("router.", at + 10);
            const block = auth.slice(at, next > 0 ? next : undefined);
            const guard = block.search(/if \(!isLoginPhone\([a-zA-Z.]+\)\) return sendError\(res, 400, "err\.auth\.phoneInvalid"\);/);
            expect(guard, routes[i]).toBeGreaterThan(0);
            // 저장소·서비스를 부르기 전이다
            const firstUse = block.search(/await (hiqService|storage)\./);
            expect(firstUse, routes[i]).toBeGreaterThan(guard);
        }
        expect(auth).toContain('import { isLoginPhone } from "../../../shared/loginPhone.js";');
    });

    it("로그인: '없는 번호' 답을 IP 하나로 따로 센다 — 번호를 바꿔 가며 훑는 것은 번호가 든 키로 못 막는다", () => {
        const block = auth.slice(auth.indexOf('router.post("/login"'), auth.indexOf('router.post("/social",'));
        // 키에 번호가 없고, IP 는 x-forwarded-for 첫 값(trust proxy 를 켜지 않았다)
        expect(block).toContain("const probeKey = attemptKey('login-unknown', 'any', clientIp(req));");
        const check = block.indexOf("checkRateLimit(probeKey)");
        const call = block.indexOf("await hiqService.login(phone, storeSlug, password)");
        const count = block.indexOf("if (result.isNew) registerFailure(probeKey, LOGIN_UNKNOWN_MAX);");
        expect(check).toBeGreaterThan(0);
        expect(call).toBeGreaterThan(check);
        expect(count).toBeGreaterThan(call);
        // 성공해도 지우지 않는다 — 아는 번호 하나로 로그인해 가며 세는 것을 되돌리지 못하게
        expect(block).not.toContain("clearAttempts(probeKey)");
    });

    it("로그인: 정지 계정을 걸러 낸 뒤에 쿠키를 준다 — 쿠키 옵션은 /social 과 글자까지 같다", () => {
        const cookieOf = (s: string) => s.slice(s.indexOf("res.cookie('hiq_user_id'"), s.indexOf("});", s.indexOf("res.cookie('hiq_user_id'")));
        expect(cookieOf(login)).toBe(cookieOf(social));
        expect(cookieOf(login)).toContain("httpOnly: true");
        expect(cookieOf(login)).toContain("signed: true");
        expect(login.indexOf("isMemberSuspended(result.member.id)")).toBeGreaterThan(0);
        expect(login.indexOf("isMemberSuspended(result.member.id)")).toBeLessThan(login.indexOf("res.cookie('hiq_user_id'"));
        expect(login).toContain('hiqService.socialLogin("kakao", identity, undefined,');
        expect(login).toContain("await fillCountry(result.member.profileId, req);");
    });

    it("연결: 로그인 필수이고 쿠키를 건드리지 않는다", () => {
        expect(link).toContain('router.post("/social/kakao/link", requireAuth,');
        expect(link).not.toContain("res.cookie(");
        expect(link).not.toContain("clearCookie(");
        expect(link).toContain("hiqService.linkKakao(req.userId!, exchanged.identity)");
        expect(link).toContain('sendError(res, 409, "err.auth.kakaoTaken"');
        expect(link).toContain('sendError(res, 409, "err.auth.kakaoNoProfile"');
        expect(link).toContain('sendError(res, 409, "err.auth.kakaoOtherLinked"');
        // 서비스가 PIN 없는 프로필이라 거절한 경우도 같은 답으로(라우트의 확인과 서비스의 확인이 어긋나도 500 이 되지 않게)
        expect(link).toContain('if (linked === "no-pin") return sendError(res, 409, "err.auth.kakaoPinRequired", "KAKAO_PIN_REQUIRED");');
    });

    it("응답에 카카오 토큰이 실리지 않는다 — 라우트는 토큰을 만져 보지도 않는다", () => {
        for (const block of [login, link, unlink]) {
            expect(block).not.toMatch(/access_?token|refresh_?token|client_?secret/i);
        }
    });

    it("기존 /social 은 구글·애플만 받는다(건드리지 않았다)", () => {
        expect(social).toContain('(provider !== "google" && provider !== "apple")');
        expect(social).not.toContain("kakao");
    });
});

describe("서버 사전 — 카카오 오류 문구는 다섯 언어 전부", () => {
    const auth = root("server/routes/modules/auth.ts");
    const used = Array.from(new Set(auth.match(/err\.auth\.kakao[A-Za-z]+/g) ?? []));
    /** 서버 사전 다섯 개(주소를 글자로 적어 불러온다 — 변수로 조립한 주소는 시험 도구가 못 찾는다). */
    const serverDicts = async (): Promise<Record<"ko" | "en" | "es" | "tr" | "vi", Record<string, string>>> => ({
        ko: (await import("../../shared/i18n/ko.js")).ko,
        en: (await import("../../shared/i18n/en.js")).en,
        es: (await import("../../shared/i18n/es.js")).es,
        tr: (await import("../../shared/i18n/tr.js")).tr,
        vi: (await import("../../shared/i18n/vi.js")).vi,
    });

    it("라우트가 쓰는 키가 열한 개다", () => {
        expect(used.sort()).toEqual([
            "err.auth.kakaoFailed", "err.auth.kakaoNoProfile", "err.auth.kakaoOtherLinked", "err.auth.kakaoParamsRequired",
            "err.auth.kakaoPinRequired", "err.auth.kakaoPinWrong",
            "err.auth.kakaoRedirectNotAllowed", "err.auth.kakaoTaken", "err.auth.kakaoUnavailable", "err.auth.kakaoUnlinkSignup",
            "err.auth.kakaoUnreachable",
        ]);
    });

    // 2026-10-05 검토: "그 계정으로 로그인해 주세요"만 적혀 있어, 실수로 생긴 빈 카카오 계정 때문에 연결이 막힌 사람을
    // 그 빈 계정으로 보냈다. 푸는 방법(카카오로 로그인 → 전체 메뉴 → 계정 삭제 → 다시 연결)을 적는다.
    it("'이미 다른 계정에 연결됨' 문구는 푸는 방법을 알려 준다 — 화면 메뉴의 이름과 같은 글자로", async () => {
        const dicts = await serverDicts();
        const taken = dicts.ko["err.auth.kakaoTaken"];
        expect(taken).toMatch(/카카오로 로그인/);
        expect(taken).toMatch(/계정 삭제/);
        expect(taken).toMatch(/다시 로그인해 연결/);
        expect(taken).not.toMatch(/그 계정으로 로그인해 주세요/);
        // 화면 메뉴의 이름을 그대로 쓴다(전체 메뉴 → 계정 삭제)
        const menu = { ko: ["전체 메뉴", "계정 삭제"], en: ["Menu", "Delete account"], es: ["Menú", "Eliminar cuenta"], tr: ["Menü", "Hesabı sil"], vi: ["Menu", "Xóa tài khoản"] } as const;
        for (const [lang, words] of Object.entries(menu) as [keyof typeof menu, readonly string[]][]) {
            const server = dicts[lang];
            const screen = root(`client/src/lib/i18n/${lang}.ts`);
            expect(screen, lang).toContain(`"menu.title": "${words[0]}"`);
            expect(screen, lang).toContain(`"menu.deleteAccount": "${words[1]}"`);
            for (const w of words) expect(server["err.auth.kakaoTaken"], `${lang} ${w}`).toContain(w);
        }
    });

    it("전화번호 입구의 새 오류 문구도 다섯 언어 전부", async () => {
        const { ko, ...others } = await serverDicts();
        for (const key of ["err.auth.phoneInvalid", "err.auth.socialAccountOnly"]) {
            expect(ko[key], `ko ${key}`).toBeTruthy();
            for (const [lang, dict] of Object.entries(others)) {
                expect(dict[key], `${lang} ${key}`).toBeTruthy();
                expect(dict[key], `${lang} ${key}`).not.toBe(ko[key]);
            }
        }
        // 서비스·라우트가 실제로 이 키를 쓴다
        expect(root("server/services/hiqService.ts")).toContain('msg("err.auth.socialAccountOnly")');
        expect(auth).toContain('"err.auth.phoneInvalid"');
    });

    it("다섯 사전에 다 있고, 한국어를 그대로 베낀 번역이 없다", async () => {
        const { ko } = await import("../../shared/i18n/ko.js");
        const others = {
            en: (await import("../../shared/i18n/en.js")).en,
            es: (await import("../../shared/i18n/es.js")).es,
            tr: (await import("../../shared/i18n/tr.js")).tr,
            vi: (await import("../../shared/i18n/vi.js")).vi,
        };
        for (const key of used) {
            expect(ko[key], `ko ${key}`).toBeTruthy();
            expect(ko[key]).toMatch(/카카오/);
            for (const [lang, dict] of Object.entries(others)) {
                expect(dict[key], `${lang} ${key}`).toBeTruthy();
                expect(dict[key], `${lang} ${key}`).not.toBe(ko[key]);
                expect(dict[key], `${lang} ${key}`).toMatch(/Kakao/);
            }
        }
    });
});

describe("스키마 · 마이그레이션 · 연결 표시", () => {
    it("profiles.kakao_sub 는 google_sub·apple_sub 와 같은 꼴(text + unique)", () => {
        const schema = root("shared/schema.ts");
        expect(schema).toContain('googleSub: text("google_sub").unique(),');
        expect(schema).toContain('kakaoSub: text("kakao_sub").unique(),');
    });

    it("마이그레이션은 덧붙이기만 하고 두 번 돌려도 된다 — 제약 이름은 drizzle 이 기대하는 이름", () => {
        const sql = root("migrations/profile_kakao_sub.sql");
        const body = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
        expect(body).toContain("ALTER TABLE profiles ADD COLUMN IF NOT EXISTS kakao_sub text;");
        expect(body).toContain("ADD CONSTRAINT profiles_kakao_sub_unique UNIQUE (kakao_sub)");
        expect(body).toContain("IF NOT EXISTS (");
        expect(body).not.toMatch(/\bDROP\b|\bDELETE\b|\bTRUNCATE\b|\bUPDATE\b/i);
    });

    it("GET /me 의 connections 에 kakao 가 연결 여부로만 실린다(값은 내보내지 않는다)", () => {
        const member = root("server/routes/modules/member.ts");
        expect(member).toContain("kakao: !!profile?.kakaoSub,");
    });

    it("GET /me 의 connections 에 PIN 이 있는지도 있고 없음으로만 실린다 — 연결·해제 단추를 보일지 화면이 정한다", () => {
        const member = root("server/routes/modules/member.ts");
        expect(member).toContain("pin: !!profile?.password,");
        // PIN(해시 포함)이 응답에 실릴 길이 없다 — /me 는 프로필을 통째로 펼치지 않는다
        const me = member.slice(member.indexOf('router.get("/me"'), member.indexOf('router.patch("/me/handle"'));
        expect(me).not.toMatch(/\.\.\.profile\b/);
        expect(me).not.toMatch(/password:\s*profile/);
    });

    // 2026-10-05 검토: 열이 DB 에 먼저 없으면 프로필을 읽는 길(로그인·/me …)이 전부 500 난다 — 코드가 아니라 적용 순서의 문제다.
    // 열만이 아니라 유니크 제약까지 확인해야 한다(제약이 없으면 같은 카카오가 두 프로필에 붙을 수 있다).
    it("마이그레이션 머리말에 적용 확인 방법이 적혀 있다 — 열과 유니크 제약 둘 다", () => {
        const sql = root("migrations/profile_kakao_sub.sql");
        const notes = sql.split("\n").filter((l) => l.trim().startsWith("--")).join("\n");
        expect(notes).toContain("information_schema.columns");
        expect(notes).toContain("pg_constraint WHERE conname = 'profiles_kakao_sub_unique'");
        expect(notes).toMatch(/운영 DB 적용:/);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 라우트 동작 — 서버를 띄우지 않고, 라우터에 등록된 처리 함수를 가짜 요청·응답으로 직접 부른다.
// 저장소는 위의 메모리 가짜, 카카오는 가짜 fetch 다. 시도 횟수 제한은 모듈 메모리에 남으므로 시험마다 다른 IP·회원을 쓴다.
// ─────────────────────────────────────────────────────────────────────────────
type FakeRes = { statusCode: number; body: any; cookies: Record<string, unknown>; cleared: string[] };

function callRoute(method: "post" | "delete", path: string, req: { body?: unknown; ip?: string; userId?: string; json?: boolean; headers?: Record<string, string> }): Promise<FakeRes> {
    const layer = (authRouter as any).stack.find((l: any) => l.route?.path === path && l.route.methods[method]);
    if (!layer) throw new Error(`시험에 없는 길: ${method} ${path}`);
    const handlers: Function[] = layer.route.stack.map((s: any) => s.handle);
    return new Promise<FakeRes>((done, fail) => {
        const out: FakeRes = { statusCode: 200, body: undefined, cookies: {}, cleared: [] };
        const res: any = {
            locals: { locale: "ko" },
            headersSent: false,
            status(code: number) { out.statusCode = code; return res; },
            json(body: unknown) { out.body = body; res.headersSent = true; done(out); return res; },
            cookie(name: string, value: unknown) { out.cookies[name] = value; return res; },
            clearCookie(name: string) { out.cleared.push(name); return res; },
        };
        const request: any = {
            body: req.body ?? {},
            ip: req.ip,
            headers: { ...(req.ip ? { "x-forwarded-for": `${req.ip}, 10.0.0.1` } : {}), ...req.headers },
            // 로그인한 요청은 서명 쿠키로 온다(requireAuth 가 여기서 회원을 읽는다)
            signedCookies: req.userId ? { hiq_user_id: req.userId } : {},
            is: (type: string) => (req.json === false ? false : type === "application/json"),
        };
        let i = 0;
        const next = (err?: unknown) => {
            if (err) { fail(err); return; }
            const handle = handlers[i++];
            if (handle) handle(request, res, next);
        };
        next();
    });
}

/** 끊길 때까지 답하지 않는 카카오 — 풀어 줄 때까지 요청이 '진행 중'으로 남는다. */
function slowKakao() {
    let open!: () => void;
    const gate = new Promise<void>((r) => { open = r; });
    const f = vi.fn(async (url: any) => {
        await gate;
        return String(url).includes("/oauth/token")
            ? json(400, { error: "invalid_grant", error_code: "KOE320" })
            : json(401, { code: -401 });
    });
    vi.stubGlobal("fetch", f);
    return { f, open };
}

const tokenCalls = () => calls.filter((c) => c.url.includes("/oauth/token")).length;

describe("라우트 동작 — POST /login (전화번호 입구)", () => {
    beforeEach(() => {
        mem.state.profiles = [{ id: "k", nickname: "카카오 가입", kakaoSub: "1234567890" }];
        mem.state.members = [
            { id: "mk", profileId: "k", storeId: "global-store", phone: "social:kakao:1234567890", name: "카카오 가입" },
            { id: "bare", profileId: null, storeId: "hiq-store", phone: "01000000007", name: "번호만" },
        ];
        mem.state.reads = 0;
    });

    // 검토에서 확인된 공격 그대로: POST /login {"phone":"social:kakao:<회원번호>","storeSlug":"global"}
    it("자리표시자를 전화번호로 보내면 400 — 쿠키를 주지 않고, 저장소를 보지도 않는다", async () => {
        for (const phone of ["social:kakao:1234567890", "social:kakao:9999999999", "social:google:1", "del-0b0e6f0e-8a3"]) {
            const r = await callRoute("post", "/login", { body: { phone, storeSlug: "global" }, ip: "198.51.100.1" });
            expect(r.statusCode, phone).toBe(400);
            expect(r.body, phone).toMatchObject({ success: false, message: "전화번호 형식이 올바르지 않습니다" });
            expect(r.cookies, phone).toEqual({});
            // 있는 계정이든 없는 계정이든 답이 같다(존재 여부를 알려 주지 않는다)
            expect(JSON.stringify(r.body), phone).not.toMatch(/isNew|member/);
        }
        expect(mem.state.reads).toBe(0);
    });

    it("기존 전화번호 로그인은 그대로 된다 — 쿠키가 나간다", async () => {
        const r = await callRoute("post", "/login", { body: { phone: "01000000007", storeSlug: "hiq" }, ip: "198.51.100.2" });
        expect(r.statusCode).toBe(200);
        expect(r.body).toMatchObject({ success: true, data: { isNew: false, member: { id: "bare" } } });
        expect(r.cookies.hiq_user_id).toBe("bare");
    });

    it("번호를 바꿔 가며 훑으면 IP 하나로 막힌다 — '없는 번호' 답 이백 번 뒤부터 429, 다른 IP 는 영향이 없다", async () => {
        const ip = "198.51.100.3";
        // 한도는 사람이 닿을 수 없는 높이(200)다 — 통신사 망·매장 와이파이처럼 여럿이 한 주소를 쓰는 곳에서 기존 회원 로그인이 막히지 않게(2026-10-06)
        for (let n = 0; n < 200; n++) {
            const r = await callRoute("post", "/login", { body: { phone: `0105550${String(n).padStart(4, "0")}`, storeSlug: "hiq" }, ip });
            expect(r.statusCode, String(n)).toBe(200);
            expect(r.body.data.isNew, String(n)).toBe(true);
        }
        const before = mem.state.reads;
        const blocked = await callRoute("post", "/login", { body: { phone: "01055509999", storeSlug: "hiq" }, ip });
        expect(blocked.statusCode).toBe(429);
        // 막힌 뒤에는 저장소도 보지 않는다
        expect(mem.state.reads).toBe(before);
        // 같은 IP 에서는 아는 번호로도 잠시 못 들어온다(잠금은 IP 단위다) — 다른 IP 는 그대로 된다
        expect((await callRoute("post", "/login", { body: { phone: "01055508888", storeSlug: "hiq" }, ip: "198.51.100.4" })).statusCode).toBe(200);
    });

    // 2026-10-06 검토: 로그인의 PIN 대조도 기다리는 일이다 — 자리 잡기가 없을 때는 한꺼번에 온 요청이 '다섯 번 틀리면 15분 잠금'을 전부 통과했다
    it("한꺼번에 몰려온 로그인도 PIN 대조는 다섯 건까지만 받는다 — 묶음으로 PIN 을 맞혀 볼 수 없다", async () => {
        mem.state.profiles.push({ id: "pp", nickname: "핀", phone: "01000000008", password: PIN });
        mem.state.members.push({ id: "pinned", profileId: "pp", storeId: "hiq-store", phone: "01000000008", name: "핀" });
        const ip = "198.51.100.6";
        // 서른 건을 한꺼번에 — 스물한 번째에 맞는 PIN 을 섞는다
        const pins = Array.from({ length: 30 }, (_, i) => (i === 20 ? PIN : String(1000 + i)));
        vi.spyOn(console, "error").mockImplementation(() => {});   // 틀린 PIN 은 asyncHandler 가 오류로 적는다 — 시험 로그를 어지럽히지 않게
        const burst = await Promise.all(pins.map((password) => callRoute("post", "/login", { body: { phone: "01000000008", storeSlug: "hiq", password }, ip })));
        // 앞의 다섯 건만 PIN 대조를 받았다(틀린 PIN 은 401)
        for (const r of burst.slice(0, 5)) {
            expect(r.statusCode).toBe(401);
            expect(r.body).toMatchObject({ success: false, message: "INVALID_PASSWORD" });
        }
        // 나머지는 PIN 을 보지도 않았다 — 맞는 PIN 을 보낸 요청도 쿠키 없이 같은 429 다
        for (const r of burst.slice(5)) {
            expect(r.statusCode).toBe(429);
            expect(r.cookies).toEqual({});
            expect(r.body).toEqual(burst[5].body);
        }
        // 다섯 번 틀렸으니 잠겼다 — 맞는 PIN 도 받지 않는다
        const locked = await callRoute("post", "/login", { body: { phone: "01000000008", storeSlug: "hiq", password: PIN }, ip });
        expect(locked.statusCode).toBe(429);
        expect(locked.cookies).toEqual({});
    });

    it("한 건씩 오는 로그인은 예전과 같다 — 네 번 틀린 뒤 다섯 번째에 맞히면 들어온다", async () => {
        mem.state.profiles.push({ id: "pq", nickname: "큐", phone: "01000000009", password: PIN });
        mem.state.members.push({ id: "pinned-ok", profileId: "pq", storeId: "hiq-store", phone: "01000000009", name: "큐" });
        const ip = "198.51.100.7";
        // PIN 없이 번호만 — PIN 을 묻는다(자리를 잡았다 놓는다)
        const ask = await callRoute("post", "/login", { body: { phone: "01000000009", storeSlug: "hiq" }, ip });
        expect(ask.body.data).toMatchObject({ isNew: false, requiresPassword: true });
        vi.spyOn(console, "error").mockImplementation(() => {});
        for (let n = 0; n < 4; n++) {
            expect((await callRoute("post", "/login", { body: { phone: "01000000009", storeSlug: "hiq", password: `000${n}` }, ip })).statusCode, String(n)).toBe(401);
        }
        const ok = await callRoute("post", "/login", { body: { phone: "01000000009", storeSlug: "hiq", password: PIN }, ip });
        expect(ok.statusCode).toBe(200);
        expect(ok.cookies.hiq_user_id).toBe("pinned-ok");
    });

    it("가입·PIN 재설정 입구도 자리표시자를 400 으로 끊는다", async () => {
        const register = await callRoute("post", "/register", { body: { phone: "social:kakao:5555555555", name: "선점", storeId: "global-store" } });
        expect(register.statusCode).toBe(400);
        expect(register.cookies).toEqual({});
        const question = await callRoute("post", "/reset-pin/question", { body: { phone: "social:kakao:1234567890" }, ip: "198.51.100.5" });
        expect(question.statusCode).toBe(400);
        const verify = await callRoute("post", "/reset-pin/verify", { body: { phone: "del-0b0e6f0e-8a3", answer: "x", newPin: "0000" }, ip: "198.51.100.5" });
        expect(verify.statusCode).toBe(400);
        expect(mem.state.members).toHaveLength(2);
        expect(mem.state.reads).toBe(0);
    });
});

describe("라우트 동작 — POST /social/kakao (로그인)", () => {
    beforeEach(() => {
        mem.state.profiles = [];
        mem.state.members = [];
    });

    it("성공하면 쿠키를 주고, 응답에 카카오 회원번호·토큰이 실리지 않는다", async () => {
        fakeFetch({ me: () => json(200, { id: 3141592653, kakao_account: { profile: { nickname: "홍길동" } } }) });
        const r = await callRoute("post", "/social/kakao", { body: { code: CODE, redirectUri: REDIRECT }, ip: "203.0.113.1" });
        expect(r.statusCode).toBe(200);
        expect(r.body).toMatchObject({ success: true, data: { isNew: true, redirectTo: "/dashboard" } });
        expect(r.cookies.hiq_user_id).toBe(mem.state.members[0].id);
        const flat = JSON.stringify(r.body);
        for (const secret of ["3141592653", ACCESS, "test-refresh", SECRET, REST, CODE]) expect(flat).not.toContain(secret);
        expect(mem.state.profiles[0].kakaoSub).toBe("3141592653");
    });

    it("운영 서버는 localhost Redirect URI 를 400 으로 거절한다 — 카카오를 부르지 않는다", async () => {
        const f = fakeFetch({});
        vi.stubEnv("NODE_ENV", "production");
        const r = await callRoute("post", "/social/kakao", { body: { code: CODE, redirectUri: "http://localhost:5177/auth/kakao" }, ip: "203.0.113.2" });
        expect(r.statusCode).toBe(400);
        expect(r.body.code).toBe("KAKAO_BAD_REDIRECT");
        expect(f).not.toHaveBeenCalled();
        expect(r.cookies).toEqual({});
    });

    it("JSON 본문이 아니면 400(숨긴 폼으로 남의 코드를 밀어 넣는 로그인 CSRF)", async () => {
        const f = fakeFetch({});
        const r = await callRoute("post", "/social/kakao", { body: { code: CODE, redirectUri: REDIRECT }, ip: "203.0.113.3", json: false });
        expect(r.statusCode).toBe(400);
        expect(f).not.toHaveBeenCalled();
    });

    // 2026-10-05 검토: 실패는 카카오가 답한 **뒤에** 세어져서, 한꺼번에 온 요청은 전부 확인을 통과해 카카오를 두드렸다.
    it("한꺼번에 몰려와도 카카오에 닿는 것은 다섯 개뿐이다 — 나머지는 바로 429", async () => {
        const { f, open } = slowKakao();
        const ip = "203.0.113.10";
        const send = () => callRoute("post", "/social/kakao", { body: { code: "garbage-code", redirectUri: REDIRECT }, ip });
        const burst = Array.from({ length: 40 }, send);
        // 뒤의 서른다섯은 카카오가 답하기 전에 이미 거절됐다
        const early = await Promise.all(burst.slice(5));
        expect(early.map((r) => r.statusCode)).toEqual(Array(35).fill(429));
        expect(f).toHaveBeenCalledTimes(5);
        open();
        const first = await Promise.all(burst.slice(0, 5));
        expect(first.map((r) => r.statusCode)).toEqual(Array(5).fill(401));
        expect(f).toHaveBeenCalledTimes(5);
        // 다섯 번의 거절이 세어져 이제는 잠겼다 — 자리가 비었어도 카카오를 부르지 않는다
        const later = await send();
        expect(later.statusCode).toBe(429);
        expect(f).toHaveBeenCalledTimes(5);
    });

    it("다른 IP 는 영향이 없고, 끝난 요청의 자리는 돌아온다", async () => {
        const { f, open } = slowKakao();
        const a = Array.from({ length: 5 }, () => callRoute("post", "/social/kakao", { body: { code: "garbage-code", redirectUri: REDIRECT }, ip: "203.0.113.11" }));
        const other = callRoute("post", "/social/kakao", { body: { code: "garbage-code", redirectUri: REDIRECT }, ip: "203.0.113.12" });
        await Promise.resolve();
        expect(f).toHaveBeenCalledTimes(6);
        open();
        await Promise.all([...a, other]);
        // 한 번만 실패한 IP 는 잠기지 않았다 — 자리가 돌아와 다시 부를 수 있다
        fakeFetch({ me: () => json(200, { id: 2718281828 }) });
        const ok = await callRoute("post", "/social/kakao", { body: { code: CODE, redirectUri: REDIRECT }, ip: "203.0.113.12" });
        expect(ok.statusCode).toBe(200);
    });

    it("카카오가 느려서 실패한 것은 세지 않고, 그 자리도 돌아온다(장애 때 멀쩡한 사람이 잠기지 않는다)", async () => {
        const ip = "203.0.113.13";
        vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
        for (let n = 0; n < 8; n++) {
            const r = await callRoute("post", "/social/kakao", { body: { code: CODE, redirectUri: REDIRECT }, ip });
            expect(r.statusCode, String(n)).toBe(401);
            expect(r.body.code, String(n)).toBe("KAKAO_UNREACHABLE");
        }
        fakeFetch({ me: () => json(200, { id: 1618033988 }) });
        expect((await callRoute("post", "/social/kakao", { body: { code: CODE, redirectUri: REDIRECT }, ip })).statusCode).toBe(200);
    });
});

describe("takeAttemptSlot — 바깥 호출의 자리 잡기", () => {
    it("실패 수 + 진행 중 수가 다섯에 닿으면 자리가 없다. 놓으면 돌아온다(두 번 놓아도 한 번만)", () => {
        const key = attemptKey("slot-test", "a", "192.0.2.1");
        const held = Array.from({ length: 5 }, () => takeAttemptSlot(key));
        expect(held.every((r) => typeof r === "function")).toBe(true);
        expect(takeAttemptSlot(key)).toBeNull();
        held[0]!();
        held[0]!();
        const again = takeAttemptSlot(key);
        expect(typeof again).toBe("function");
        expect(takeAttemptSlot(key)).toBeNull();
        for (const release of [...held.slice(1), again]) release!();
        // 실패가 쌓이면 그만큼 자리가 준다
        registerFailure(key);
        registerFailure(key);
        const three = Array.from({ length: 3 }, () => takeAttemptSlot(key));
        expect(three.every((r) => typeof r === "function")).toBe(true);
        expect(takeAttemptSlot(key)).toBeNull();
        three.forEach((release) => release!());
        expect(checkRateLimit(key).limited).toBe(false);
    });

    it("키마다 따로 센다", () => {
        const a = attemptKey("slot-test", "b", "192.0.2.2");
        const b = attemptKey("slot-test", "b", "192.0.2.3");
        const held = Array.from({ length: 5 }, () => takeAttemptSlot(a));
        expect(takeAttemptSlot(a)).toBeNull();
        const other = takeAttemptSlot(b);
        expect(typeof other).toBe("function");
        other!();
        held.forEach((release) => release!());
    });
});

describe("라우트 동작 — POST·DELETE /social/kakao/link (연결·해제)", () => {
    beforeEach(() => {
        mem.state.profiles = [
            { id: "pa", nickname: "가", phone: "01000000001", password: PIN, kakaoSub: null },
            { id: "pc", nickname: "다", phone: "01000000003", kakaoSub: null },                  // PIN 없는 프로필
            { id: "pk", nickname: "카", kakaoSub: "900" },                                       // 카카오로 가입
            { id: "pl", nickname: "라", phone: "01000000004", password: PIN, kakaoSub: "400" }, // 전화번호 회원, 카카오 연결됨
        ];
        mem.state.members = [
            { id: "link-a", profileId: "pa", storeId: "hiq-store", phone: "01000000001" },
            { id: "link-c", profileId: "pc", storeId: "hiq-store", phone: "01000000003" },
            { id: "link-k", profileId: "pk", storeId: "global-store", phone: "social:kakao:0b0e6f0e-8a3f-4d0c-9d43-1c1f0a2b3c4d" },
            { id: "link-l", profileId: "pl", storeId: "hiq-store", phone: "01000000004" },
            { id: "link-wrong", profileId: "pa", storeId: "abc-store", phone: "01000000001" },
        ];
        mem.state.beforeLinkWrite = null;
    });

    it("로그인하지 않았으면 401 — 카카오를 부르지 않는다", async () => {
        const f = fakeFetch({});
        const r = await callRoute("post", "/social/kakao/link", { body: { code: CODE, redirectUri: REDIRECT, pin: PIN } });
        expect(r.statusCode).toBe(401);
        expect(r.body.code).toBeUndefined(); // 화면은 code 없는 401 을 '로그인이 풀렸다'로 읽는다
        expect(f).not.toHaveBeenCalled();
    });

    it("PIN 이 맞으면 붙인다 — 쿠키는 건드리지 않는다", async () => {
        fakeFetch({ me: () => json(200, { id: 100 }) });
        const r = await callRoute("post", "/social/kakao/link", { body: { code: CODE, redirectUri: REDIRECT, pin: PIN }, userId: "link-a" });
        expect(r.statusCode).toBe(200);
        expect(r.body).toEqual({ success: true, data: { linked: true } });
        expect(r.cookies).toEqual({});
        expect(mem.state.profiles[0].kakaoSub).toBe("100");
    });

    // 쿠키만 쥔 사람(빌린 폰·PIN 없는 계정에 번호만으로 들어온 사람)이 자기 카카오를 남의 계정에 붙이지 못한다
    it("PIN 이 틀리면 401 KAKAO_PIN_WRONG — 카카오를 부르지 않아 인가 코드가 그대로다. 같은 코드로 다시 보내면 된다", async () => {
        const f = fakeFetch({ me: () => json(200, { id: 100 }) });
        for (const pin of ["0000", "", undefined]) {
            const r = await callRoute("post", "/social/kakao/link", { body: { code: CODE, redirectUri: REDIRECT, pin }, userId: "link-wrong" });
            expect(r.statusCode, String(pin)).toBe(401);
            expect(r.body.code, String(pin)).toBe("KAKAO_PIN_WRONG");
            expect(r.body.message, String(pin)).toMatch(/PIN/);
        }
        expect(f).not.toHaveBeenCalled();
        expect(mem.state.profiles[0].kakaoSub).toBeNull();
        // 같은 코드 + 맞는 PIN — 이제야 카카오를 부른다
        const ok = await callRoute("post", "/social/kakao/link", { body: { code: CODE, redirectUri: REDIRECT, pin: PIN }, userId: "link-wrong" });
        expect(ok.statusCode).toBe(200);
        expect(tokenCalls()).toBe(1);
        expect(new URLSearchParams(calls[0].init.body as string).get("code")).toBe(CODE);
    });

    it("PIN 을 다섯 번 틀리면 잠긴다 — 이 길로 PIN 을 맞혀 볼 수 없다", async () => {
        mem.state.members.push({ id: "link-guess", profileId: "pa", storeId: "hiq-store", phone: "01000000001" });
        const f = fakeFetch({});
        for (let n = 0; n < 5; n++) {
            const r = await callRoute("post", "/social/kakao/link", { body: { code: CODE, redirectUri: REDIRECT, pin: `000${n}` }, userId: "link-guess" });
            expect(r.statusCode, String(n)).toBe(401);
        }
        // 맞는 PIN 이어도 잠긴 동안은 안 된다
        const locked = await callRoute("post", "/social/kakao/link", { body: { code: CODE, redirectUri: REDIRECT, pin: PIN }, userId: "link-guess" });
        expect(locked.statusCode).toBe(429);
        expect(f).not.toHaveBeenCalled();
        expect(mem.state.profiles[0].kakaoSub).toBeNull();
    });

    it("PIN 없는 계정은 409 KAKAO_PIN_REQUIRED — 번호만으로 들어올 수 있는 계정에 영구 로그인 수단을 붙여 주지 않는다", async () => {
        const f = fakeFetch({ me: () => json(200, { id: 100 }) });
        const r = await callRoute("post", "/social/kakao/link", { body: { code: CODE, redirectUri: REDIRECT, pin: "1234" }, userId: "link-c" });
        expect(r.statusCode).toBe(409);
        expect(r.body.code).toBe("KAKAO_PIN_REQUIRED");
        expect(f).not.toHaveBeenCalled();
        expect(mem.state.profiles[1].kakaoSub).toBeNull();
    });

    it("이미 다른 계정이 쥔 카카오면 409 KAKAO_TAKEN — 문구가 푸는 방법을 알려 준다", async () => {
        fakeFetch({ me: () => json(200, { id: 900 }) });
        const r = await callRoute("post", "/social/kakao/link", { body: { code: CODE, redirectUri: REDIRECT, pin: PIN }, userId: "link-a" });
        expect(r.statusCode).toBe(409);
        expect(r.body.code).toBe("KAKAO_TAKEN");
        expect(r.body.message).toMatch(/계정 삭제/);
        expect(mem.state.profiles[0].kakaoSub).toBeNull();
        expect(mem.state.profiles[2].kakaoSub).toBe("900");
    });

    it("해제: PIN 이 맞으면 뗀다 · 틀리면 401 · PIN 이 없으면 400", async () => {
        const none = await callRoute("delete", "/social/kakao/link", { body: {}, userId: "link-l" });
        expect(none.statusCode).toBe(400);
        const wrong = await callRoute("delete", "/social/kakao/link", { body: { pin: "0000" }, userId: "link-l" });
        expect(wrong.statusCode).toBe(401);
        expect(wrong.body.code).toBe("KAKAO_PIN_WRONG");
        expect(mem.state.profiles[3].kakaoSub).toBe("400");

        const ok = await callRoute("delete", "/social/kakao/link", { body: { pin: PIN }, userId: "link-l" });
        expect(ok.statusCode).toBe(200);
        expect(ok.body).toEqual({ success: true, data: { linked: false } });
        expect(ok.cookies).toEqual({});
        expect(ok.cleared).toEqual([]);
        expect(mem.state.profiles[3].kakaoSub).toBeNull();
    });

    it("해제: 로그인 필수 · 카카오로 가입한 계정은 409 KAKAO_SIGNUP_ACCOUNT(떼면 들어올 길이 없다)", async () => {
        expect((await callRoute("delete", "/social/kakao/link", { body: { pin: PIN } })).statusCode).toBe(401);
        const r = await callRoute("delete", "/social/kakao/link", { body: { pin: PIN }, userId: "link-k" });
        expect(r.statusCode).toBe(409);
        expect(r.body.code).toBe("KAKAO_SIGNUP_ACCOUNT");
        expect(mem.state.profiles[2].kakaoSub).toBe("900");
    });

    // 2026-10-06 검토: PIN 대조(DB · bcrypt)는 기다리는 일이다 — 자리 잡기가 그 뒤에 있거나(연결) 아예 없을 때(해제)는
    // 한꺼번에 온 요청이 전부 '안 잠김'으로 통과해 PIN 답을 받았다. 세 길(웹 연결·해제·앱 안 연결)이 같은 키를 쓰므로 하나라도 열려 있으면 PIN 이 드러난다.
    it("한꺼번에 몰려온 연결·해제 요청도 PIN 대조는 다섯 건까지만 받는다 — 묶음으로 PIN 을 맞혀 볼 수 없다", async () => {
        mem.state.members.push(
            { id: "link-burst", profileId: "pa", storeId: "hiq-store", phone: "01000000001" },
            { id: "unlink-burst", profileId: "pl", storeId: "hiq-store", phone: "01000000004" },
        );
        const f = fakeFetch({ me: () => json(200, { id: 100 }) });
        // 서른 건을 한꺼번에 — 스물한 번째에 맞는 PIN 을 섞는다
        const pins = Array.from({ length: 30 }, (_, i) => (i === 20 ? PIN : String(1000 + i)));
        const bursts = {
            link: await Promise.all(pins.map((pin) => callRoute("post", "/social/kakao/link", { body: { code: CODE, redirectUri: REDIRECT, pin }, userId: "link-burst" }))),
            unlink: await Promise.all(pins.map((pin) => callRoute("delete", "/social/kakao/link", { body: { pin }, userId: "unlink-burst" }))),
        };
        for (const [name, burst] of Object.entries(bursts)) {
            expect(burst.slice(0, 5).map((r) => r.body.code), name).toEqual(Array(5).fill("KAKAO_PIN_WRONG"));
            // 나머지는 PIN 을 보지도 않았다 — 맞는 PIN 을 보낸 요청도 틀린 요청과 답이 같아 구분되지 않는다
            for (const r of burst.slice(5)) {
                expect(r.statusCode, name).toBe(429);
                expect(r.body, name).toEqual(burst[5].body);
            }
        }
        // 카카오를 부르지 않았고, 붙지도 떼어지지도 않았다
        expect(f).not.toHaveBeenCalled();
        expect(mem.state.profiles[0].kakaoSub).toBeNull();
        expect(mem.state.profiles[3].kakaoSub).toBe("400");
        // 다섯 번 틀렸으니 잠겼다 — 맞는 PIN 도 받지 않는다
        expect((await callRoute("post", "/social/kakao/link", { body: { code: CODE, redirectUri: REDIRECT, pin: PIN }, userId: "link-burst" })).statusCode).toBe(429);
        expect((await callRoute("delete", "/social/kakao/link", { body: { pin: PIN }, userId: "unlink-burst" })).statusCode).toBe(429);
        expect(mem.state.profiles[3].kakaoSub).toBe("400");
    });

    it("해제는 카카오 키가 없어도 된다(카카오를 부르지 않는다) — 연결은 503", async () => {
        vi.stubEnv("KAKAO_LOGIN_REST_KEY", "");
        const f = fakeFetch({});
        mem.state.members.push({ id: "link-nokey", profileId: "pl", storeId: "hiq-store", phone: "01000000004" });
        expect((await callRoute("post", "/social/kakao/link", { body: { code: CODE, redirectUri: REDIRECT, pin: PIN }, userId: "link-nokey" })).statusCode).toBe(503);
        expect((await callRoute("delete", "/social/kakao/link", { body: { pin: PIN }, userId: "link-nokey" })).statusCode).toBe(200);
        expect(f).not.toHaveBeenCalled();
    });
});
