import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
    kakaoConfigured, kakaoNativeConfigured, kakaoOpen, kakaoOpenFor, kakaoPreviewEnabled, kakaoPreviewKeyMatches, kakaoPreviewValid, packKakaoPreview,
} from "./kakaoAuth.js";
import authRouter from "../routes/modules/auth.js";
import {
    KAKAO_PREVIEW_API, KAKAO_PREVIEW_COOKIE, KAKAO_PREVIEW_KEY_MAX, KAKAO_PREVIEW_KEY_MIN, KAKAO_PREVIEW_TTL_SEC, KAKAO_STATUS_API,
} from "../../shared/kakaoLogin.js";
import { KAKAO_NONCE_COOKIE } from "../../shared/kakaoNative.js";

/**
 * 카카오 로그인 미리보기의 서버 쪽(2026-10-06) — 공개 스위치는 꺼 둔 채, 열쇠를 넣은 기기에서만 카카오 길이 열린다.
 * (오너: 1.3 을 Play 내부 테스트에 올렸는데 스위치가 꺼져 있어 실기기에서 시험할 길이 없다. 스위치를 켜면 모든 사용자에게 열린다.)
 *
 * 이 표가 지키는 것
 *  - 열쇠(환경변수 KAKAO_PREVIEW_KEY)가 서버에 없으면 미리보기는 **없는 기능**이다: 켜기·끄기는 없는 주소와 같고, 아무 효과가 없다.
 *  - 틀린 열쇠는 없는 주소와 같은 답 · IP 기준 시도 제한 · 맞는 열쇠는 서명 쿠키 · 그 쿠키를 든 요청에만 카카오 길이 열린다.
 *  - 열쇠를 바꾸면 옛 쿠키가 죽는다 · 공개 스위치만 켠 경우는 예전과 같다 · 공개 스위치만 보던 곳이 남지 않았다.
 *
 * 서버를 띄우지 않는다 — 라우터(authRouter)에 가짜 요청·응답을 그대로 흘려 넣는다(진짜 길 찾기를 탄다: 흘려보낸 요청이 어느 길에도
 * 걸리지 않고 끝까지 나가는지까지 본다). DB 도 카카오도 건드리지 않는다(.env 는 운영 DB 다) — 저장소는 메모리 가짜, 카카오는 가짜 fetch.
 * 아래 열쇠·앱 키·회원번호는 전부 시험용으로 지어낸 글자다. 시도 횟수는 모듈 메모리에 남으므로 시험마다 다른 IP 를 쓴다.
 */
const mem = vi.hoisted(() => {
    const state = { profiles: [] as any[], members: [] as any[] };
    const col = { google: "googleSub", apple: "appleSub", kakao: "kakaoSub" } as const;
    const storage = {
        users: {
            async getProfileBySocialSub(provider: "google" | "apple" | "kakao", sub: string) {
                return state.profiles.find((p) => p[col[provider]] === sub);
            },
            async getLoginMemberByProfileId(profileId: string) {
                return state.members.find((m) => m.profileId === profileId);
            },
            async fillProfileCountryIfEmpty() { /* 국가는 이 시험과 무관 */ },
        },
        async createProfile(data: any) { const p = { id: `p${state.profiles.length + 1}`, ...data }; state.profiles.push(p); return p; },
        async getProfile(id: string) { return state.profiles.find((p) => p.id === id); },
        async updateProfile(id: string, data: any) { const p = state.profiles.find((x) => x.id === id); Object.assign(p, data); return p; },
        async getMemberById(id: string) { return state.members.find((m) => m.id === id); },
        async getStoreBySlug(slug: string) { return { id: `${slug}-store`, slug }; },
        async createMember(data: any) { const m = { id: `m${state.members.length + 1}`, ...data }; state.members.push(m); return m; },
        async incrementVisitCount() { /* 방문 수는 이 시험과 무관 */ },
    };
    return { state, storage };
});
vi.mock("../db.js", () => ({ db: {}, pool: {} }));
vi.mock("../storage/index.js", () => ({ storage: mem.storage }));
vi.mock("./handle.js", () => ({ generateHandle: async () => "player_0001" }));
vi.mock("../middleware/terms.js", () => ({
    isMemberSuspended: async () => false,
    recordTermsAcceptance: async () => undefined,
    requireTermsAccepted: (_req: unknown, _res: unknown, next: () => void) => next(),
    SUSPENDED_TEXT: "정지된 계정",
}));

/** 시험용 열쇠(지어낸 글자, 16자 이상). */
const KEY = "preview-test-key-0123456789";
const OTHER_KEY = "another-preview-key-abcdef";
const REDIRECT = "https://www.rankue.co.kr/auth/kakao";

type FakeRes = {
    statusCode: number; body: any; headers: Record<string, string>;
    cookies: Record<string, { value: unknown; options: any }>; cleared: { name: string; options: any }[];
    /** 어느 길도 답하지 않고 라우터를 빠져나갔다 — 진짜 서버에서는 없는 주소의 404 가 나간다 */
    fellThrough: boolean;
};
type FakeReq = { body?: unknown; ip?: string; json?: boolean; cookies?: Record<string, unknown>; userId?: string };

/** 라우터에 요청 하나를 흘려 넣는다. cookies 는 '서명 검증을 통과한 쿠키'(req.signedCookies)다 — 서명은 cookie-parser 가 한다(여기 없다). */
function call(method: "GET" | "POST" | "DELETE", path: string, req: FakeReq = {}): Promise<FakeRes> {
    return new Promise<FakeRes>((done, fail) => {
        const out: FakeRes = { statusCode: 200, body: undefined, headers: {}, cookies: {}, cleared: [], fellThrough: false };
        const res: any = {
            locals: { locale: "ko" },
            headersSent: false,
            set(name: string, value: string) { out.headers[name.toLowerCase()] = value; return res; },
            status(code: number) { out.statusCode = code; return res; },
            json(body: unknown) { out.body = body; res.headersSent = true; done(out); return res; },
            cookie(name: string, value: unknown, options: unknown) { out.cookies[name] = { value, options }; return res; },
            clearCookie(name: string, options: unknown) { out.cleared.push({ name, options }); return res; },
        };
        const request: any = {
            method,
            url: path,
            body: req.body ?? {},
            ip: req.ip,
            headers: req.ip ? { "x-forwarded-for": `${req.ip}, 10.0.0.1` } : {},
            signedCookies: { ...(req.userId ? { hiq_user_id: req.userId } : {}), ...req.cookies },
            is: (type: string) => (req.json === false ? false : type === "application/json"),
        };
        (authRouter as any).handle(request, res, (err?: unknown) => {
            if (err) { fail(err); return; }
            out.fellThrough = true;
            done(out);
        });
    });
}

const PREVIEW = "/social/kakao/preview";
const STATUS = "/social/kakao/status";

let ipSeq = 0;
/** 시험마다 다른 IP — 시도 횟수 제한이 모듈 메모리에 남는다. */
const freshIp = () => `198.18.0.${++ipSeq}`;

/** 맞는 열쇠로 미리보기를 켜고, 다음 요청에 실릴 쿠키 값을 돌려준다. */
async function turnOn(ip: string = freshIp(), key: string = KEY): Promise<{ cookie: unknown; res: FakeRes }> {
    const res = await call("POST", PREVIEW, { ip, body: { key } });
    return { cookie: res.cookies[KAKAO_PREVIEW_COOKIE]?.value, res };
}
const withPreview = (cookie: unknown) => ({ [KAKAO_PREVIEW_COOKIE]: cookie });

/** 아무 일도 하지 않고 흘려보냈는가 — 없는 주소와 구분되지 않는다. */
function expectGone(res: FakeRes) {
    expect(res.fellThrough).toBe(true);
    expect(res.body).toBeUndefined();
    expect(res.statusCode).toBe(200); // 손대지 않았다(상태를 정하는 것은 뒤의 '없는 주소' 처리다)
    expect(res.headers).toEqual({});
    expect(res.cookies).toEqual({});
    expect(res.cleared).toEqual([]);
}

let logs: ReturnType<typeof vi.spyOn>[] = [];
/** 이 시험 동안 찍힌 로그 전체 — 열쇠가 새지 않았는지 볼 때 쓴다. */
const logged = () => logs.flatMap((s) => s.mock.calls.map((c: unknown[]) => c.map(String).join(" "))).join("\n");

beforeEach(() => {
    mem.state.profiles = [];
    mem.state.members = [];
    // 기준: 공개 스위치는 꺼져 있고(지금 운영과 같다), 미리보기 열쇠와 카카오 키들은 서버에 들어 있다
    vi.stubEnv("KAKAO_LOGIN_OPEN", "");
    vi.stubEnv("KAKAO_PREVIEW_KEY", KEY);
    vi.stubEnv("KAKAO_LOGIN_REST_KEY", "test-rest-key");
    vi.stubEnv("KAKAO_LOGIN_CLIENT_SECRET", "test-client-secret");
    vi.stubEnv("KAKAO_NATIVE_APP_KEY", "test-native-app-key");
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("VERCEL", "");
    logs = [vi.spyOn(console, "log").mockImplementation(() => {}), vi.spyOn(console, "warn").mockImplementation(() => {}), vi.spyOn(console, "error").mockImplementation(() => {})];
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe("계약의 상수 — 화면과 서버가 같은 값을 쓴다", () => {
    it("주소 · 쿠키 이름 · 30일 · 열쇠는 16자 이상", () => {
        expect(KAKAO_PREVIEW_API).toBe(`/api/hiq${PREVIEW}`);
        expect(KAKAO_STATUS_API).toBe(`/api/hiq${STATUS}`);
        expect(KAKAO_PREVIEW_COOKIE).toBe("hiq_kakao_preview");
        expect(KAKAO_PREVIEW_TTL_SEC).toBe(30 * 24 * 60 * 60);
        expect(KAKAO_PREVIEW_KEY_MIN).toBe(16);
        expect(KAKAO_PREVIEW_KEY_MAX).toBeGreaterThan(KAKAO_PREVIEW_KEY_MIN);
    });
});

describe("열쇠가 서버에 없으면 미리보기는 없는 기능이다 — 길은 없는 주소와 같고 아무 효과가 없다", () => {
    const OFF = ["", "   ", "short-key-15chr", "x".repeat(KAKAO_PREVIEW_KEY_MAX + 1)];

    it("열쇠가 없거나 16자 미만(또는 터무니없이 길면) 판정 함수가 전부 닫힌 값을 준다 — 열려 있을 때 구운 쿠키도 죽는다", async () => {
        const { cookie } = await turnOn();
        expect(kakaoPreviewValid(cookie, Date.now())).toBe(true);
        for (const value of OFF) {
            vi.stubEnv("KAKAO_PREVIEW_KEY", value);
            expect(kakaoPreviewEnabled(), JSON.stringify(value.slice(0, 20))).toBe(false);
            expect(kakaoPreviewKeyMatches(value)).toBe(false);
            expect(kakaoPreviewKeyMatches(KEY)).toBe(false);
            expect(packKakaoPreview(Date.now())).toBeNull();
            expect(kakaoPreviewValid(cookie, Date.now())).toBe(false);
            expect(kakaoOpenFor({ signedCookies: withPreview(cookie) })).toBe(false);
            expect(kakaoConfigured({ signedCookies: withPreview(cookie) })).toBe(false);
            expect(kakaoNativeConfigured({ signedCookies: withPreview(cookie) })).toBe(false);
        }
        // 환경변수 자체가 없을 때도 같다
        vi.stubEnv("KAKAO_PREVIEW_KEY", undefined as unknown as string);
        expect(kakaoPreviewEnabled()).toBe(false);
        expect(kakaoOpenFor({ signedCookies: withPreview(cookie) })).toBe(false);
    });

    it("켜기·끄기는 없는 주소와 똑같이 흘러 나간다 — 쿠키를 굽지도 지우지도 않고, 무엇을 보냈는지도 보지 않는다", async () => {
        const never = await call("POST", "/social/kakao/no-such-route", { ip: freshIp(), body: { key: KEY } });
        expectGone(never);
        for (const value of OFF) {
            vi.stubEnv("KAKAO_PREVIEW_KEY", value);
            // 서버에 든 값(짧은 열쇠)을 그대로 보내도 열리지 않는다
            for (const key of [KEY, value, "", undefined]) {
                expectGone(await call("POST", PREVIEW, { ip: freshIp(), body: { key } }));
            }
            expectGone(await call("DELETE", PREVIEW, { ip: freshIp() }));
            expectGone(await call("DELETE", PREVIEW, { ip: freshIp(), cookies: withPreview("v1.1.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa") }));
        }
    });

    it("없는 동안의 시도는 세지도 않는다 — 열쇠를 넣은 뒤 같은 IP 가 바로 켤 수 있다", async () => {
        const ip = freshIp();
        vi.stubEnv("KAKAO_PREVIEW_KEY", "");
        for (let i = 0; i < 25; i++) expectGone(await call("POST", PREVIEW, { ip, body: { key: `wrong-key-number-${i}-padding` } }));
        vi.stubEnv("KAKAO_PREVIEW_KEY", KEY);
        expect((await turnOn(ip)).res.statusCode).toBe(200);
    });

    it("카카오 길은 예전 그대로 닫혀 있다 — 열려 있을 때 구운 쿠키를 들고 와도 503, 상태는 닫힘", async () => {
        const { cookie } = await turnOn();
        vi.stubEnv("KAKAO_PREVIEW_KEY", "");
        const cookies = withPreview(cookie);
        const closed = [
            await call("POST", "/social/kakao", { ip: freshIp(), cookies, body: { code: "c", redirectUri: REDIRECT } }),
            await call("POST", "/social/kakao/link", { ip: freshIp(), cookies, userId: "m1", body: { code: "c", redirectUri: REDIRECT, pin: "0000" } }),
            await call("POST", "/social/kakao/native/nonce", { ip: freshIp(), cookies, body: {} }),
            await call("POST", "/social/kakao/native", { ip: freshIp(), cookies, body: { idToken: "a.b.c", nonce: "n" } }),
        ];
        for (const res of closed) {
            expect(res.statusCode).toBe(503);
            expect(res.body).toMatchObject({ success: false, code: "KAKAO_NOT_CONFIGURED" });
            expect(res.cookies).toEqual({});
        }
        const status = await call("GET", STATUS, { ip: freshIp(), cookies });
        expect(status.body).toEqual({ success: true, data: { open: false, native: false } });
    });
});

describe("POST /social/kakao/preview — 열쇠 확인", () => {
    it("맞는 열쇠 → 200 과 서명 쿠키(httpOnly · Lax · Path=/ · 30일). 응답은 캐시하지 않는다", async () => {
        const before = Date.now();
        const { cookie, res } = await turnOn();
        expect(res.fellThrough).toBe(false);
        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual({ success: true, data: { open: true, native: true } });
        expect(res.headers["cache-control"]).toBe("no-store");
        expect(res.cookies[KAKAO_PREVIEW_COOKIE].options).toEqual({
            httpOnly: true, signed: true, sameSite: "lax", secure: false, path: "/", maxAge: 30 * 24 * 60 * 60 * 1000,
        });
        // 값: v1.<발급 시각 ms>.<꼬리표 32자>
        const hit = /^v1\.(\d+)\.([A-Za-z0-9_-]{32})$/.exec(String(cookie));
        expect(hit).not.toBeNull();
        expect(Number(hit![1])).toBeGreaterThanOrEqual(before);
        expect(Number(hit![1])).toBeLessThanOrEqual(Date.now());
        // 로그인 쿠키는 건드리지 않는다 — 미리보기는 로그인 길이 아니다
        expect(Object.keys(res.cookies)).toEqual([KAKAO_PREVIEW_COOKIE]);
        expect(res.cleared).toEqual([]);
    });

    it("운영 서버에서는 secure 쿠키다", async () => {
        vi.stubEnv("NODE_ENV", "production");
        expect((await turnOn()).res.cookies[KAKAO_PREVIEW_COOKIE].options.secure).toBe(true);
        vi.stubEnv("NODE_ENV", "test");
        vi.stubEnv("VERCEL", "1");
        expect((await turnOn()).res.cookies[KAKAO_PREVIEW_COOKIE].options.secure).toBe(true);
    });

    it("열쇠는 쿠키에도 응답에도 로그에도 없다 — 쿠키에는 열쇠로 만든 꼬리표만 들어간다", async () => {
        const { cookie, res } = await turnOn();
        await call("POST", PREVIEW, { ip: freshIp(), body: { key: `${KEY}-wrong` } });
        expect(String(cookie)).not.toContain(KEY);
        expect(JSON.stringify(res.body)).not.toContain(KEY);
        expect(logged()).not.toContain(KEY);
        // 같은 열쇠는 늘 같은 꼬리표, 다른 열쇠는 다른 꼬리표(인스턴스가 달라도 같은 쿠키가 통한다 — 난수가 아니다)
        const tagOf = (v: unknown) => String(v).split(".")[2];
        expect(tagOf((await turnOn()).cookie)).toBe(tagOf(cookie));
        vi.stubEnv("KAKAO_PREVIEW_KEY", OTHER_KEY);
        expect(tagOf((await turnOn(freshIp(), OTHER_KEY)).cookie)).not.toBe(tagOf(cookie));
    });

    it("서버에 앱용 키가 없으면 native 는 false 로 알려 준다(웹 길은 열린다)", async () => {
        vi.stubEnv("KAKAO_NATIVE_APP_KEY", "");
        expect((await turnOn()).res.body.data).toEqual({ open: true, native: false });
    });

    it("틀린 열쇠는 없는 주소와 같은 답이다 — 쿠키도, 틀렸다는 말도 없다", async () => {
        const wrong: unknown[] = [
            `${KEY}x`, KEY.slice(0, -1), KEY.toUpperCase(), ` ${KEY}`, OTHER_KEY, "", "1", undefined, null, 12345678901234567, [KEY], { key: KEY },
            "x".repeat(KAKAO_PREVIEW_KEY_MAX + 1),
        ];
        for (const key of wrong) expectGone(await call("POST", PREVIEW, { ip: freshIp(), body: { key } }));
        // 본문이 없거나 다른 칸에 넣어도
        expectGone(await call("POST", PREVIEW, { ip: freshIp() }));
        expectGone(await call("POST", PREVIEW, { ip: freshIp(), body: { k: KEY } }));
    });

    it("JSON 본문이 아니면 맞는 열쇠라도 받지 않는다 — 숨긴 폼으로는 켤 수 없다", async () => {
        expectGone(await call("POST", PREVIEW, { ip: freshIp(), body: { key: KEY }, json: false }));
    });

    it("시도 제한(IP 기준) — 열 번 틀리면 잠기고, 잠긴 동안에는 맞는 열쇠도 같은 답이다. 다른 IP 는 그대로다", async () => {
        const ip = freshIp();
        for (let i = 0; i < 10; i++) expectGone(await call("POST", PREVIEW, { ip, body: { key: `wrong-key-number-${i}-padding` } }));
        expectGone(await call("POST", PREVIEW, { ip, body: { key: KEY } }));
        expectGone(await call("POST", PREVIEW, { ip, body: { key: KEY } }));
        // 다른 주소에서는 켜진다
        expect((await turnOn(freshIp())).res.statusCode).toBe(200);
    });

    it("잠금은 15분 뒤에 풀린다", async () => {
        vi.useFakeTimers();
        const ip = freshIp();
        for (let i = 0; i < 10; i++) await call("POST", PREVIEW, { ip, body: { key: `wrong-key-number-${i}-padding` } });
        expectGone(await call("POST", PREVIEW, { ip, body: { key: KEY } }));
        vi.setSystemTime(Date.now() + 14 * 60 * 1000);
        expectGone(await call("POST", PREVIEW, { ip, body: { key: KEY } }));
        vi.setSystemTime(Date.now() + 2 * 60 * 1000);
        expect((await turnOn(ip)).res.statusCode).toBe(200);
    });

    it("아홉 번 틀린 뒤 맞히면 켜지고, 센 횟수는 지워진다", async () => {
        const ip = freshIp();
        for (let round = 0; round < 2; round++) {
            for (let i = 0; i < 9; i++) expectGone(await call("POST", PREVIEW, { ip, body: { key: `wrong-key-number-${i}-padding` } }));
            expect((await turnOn(ip)).res.statusCode, `round ${round}`).toBe(200);
        }
    });
});

describe("쿠키를 든 요청에만 카카오 길이 열린다 — 공개 스위치는 꺼진 채", () => {
    it("상태(GET /social/kakao/status) — 쿠키가 있으면 열림, 없으면 닫힘. 캐시하지 않는다", async () => {
        const { cookie } = await turnOn();
        const open = await call("GET", STATUS, { ip: freshIp(), cookies: withPreview(cookie) });
        expect(open.statusCode).toBe(200);
        expect(open.body).toEqual({ success: true, data: { open: true, native: true } });
        expect(open.headers["cache-control"]).toBe("no-store");
        expect(open.cookies).toEqual({});

        const closed = await call("GET", STATUS, { ip: freshIp() });
        expect(closed.statusCode).toBe(200);
        expect(closed.body).toEqual({ success: true, data: { open: false, native: false } });
        expect(closed.headers["cache-control"]).toBe("no-store");
    });

    it("네 길 전부 — 쿠키가 없으면 503(예전 그대로), 있으면 스위치를 지나 다음 검사로 간다", async () => {
        const { cookie } = await turnOn();
        const cases: { path: string; req: FakeReq; opened: { status: number; code?: string } }[] = [
            // 웹 로그인(콜백의 코드 교환) — 스위치를 지나면 허용 목록 검사에 걸린다
            { path: "/social/kakao", req: { body: { code: "c", redirectUri: "https://evil.example/auth/kakao" } }, opened: { status: 400, code: "KAKAO_BAD_REDIRECT" } },
            // 웹 연결
            { path: "/social/kakao/link", req: { userId: "m1", body: { code: "c", redirectUri: "https://evil.example/auth/kakao", pin: "0000" } }, opened: { status: 400, code: "KAKAO_BAD_REDIRECT" } },
            // 앱 nonce — 그대로 발급된다
            { path: "/social/kakao/native/nonce", req: { body: {} }, opened: { status: 200 } },
            // 앱 검증(로그인·연결) — 스위치를 지나면 토큰 꼴 검사에 걸린다
            { path: "/social/kakao/native", req: { body: { idToken: "not-a-token", nonce: "n" } }, opened: { status: 400, code: "KAKAO_BAD_REQUEST" } },
            { path: "/social/kakao/native", req: { userId: "m1", body: { idToken: "not-a-token", nonce: "n", mode: "link", pin: "0000" } }, opened: { status: 400, code: "KAKAO_BAD_REQUEST" } },
        ];
        for (const c of cases) {
            const without = await call("POST", c.path, { ...c.req, ip: freshIp() });
            expect(without.statusCode, c.path).toBe(503);
            expect(without.body, c.path).toMatchObject({ success: false, code: "KAKAO_NOT_CONFIGURED" });

            const withCookie = await call("POST", c.path, { ...c.req, ip: freshIp(), cookies: withPreview(cookie) });
            expect(withCookie.fellThrough, c.path).toBe(false);
            expect(withCookie.statusCode, c.path).toBe(c.opened.status);
            if (c.opened.code) expect(withCookie.body, c.path).toMatchObject({ success: false, code: c.opened.code });
        }
        // nonce 는 진짜로 나온다(쿠키와 본문 양쪽)
        const nonce = await call("POST", "/social/kakao/native/nonce", { ip: freshIp(), cookies: withPreview(cookie), body: {} });
        expect(nonce.body.data.nonce).toBeTruthy();
        expect(String(nonce.cookies[KAKAO_NONCE_COOKIE].value).startsWith(`${nonce.body.data.nonce}.`)).toBe(true);
    });

    it("한 바퀴: 열쇠 → 쿠키 → 웹 카카오 로그인이 끝까지 된다(가짜 카카오). 쿠키가 없는 같은 요청은 카카오를 부르지도 않는다", async () => {
        const fetchMock = vi.fn(async (url: any) => {
            const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
            if (String(url).startsWith("https://kauth.kakao.com/oauth/token")) return json({ access_token: "test-access-token", token_type: "bearer" });
            if (String(url).startsWith("https://kapi.kakao.com/v2/user/me")) return json({ id: 1234567890, kakao_account: { profile: { nickname: "홍길동" } } });
            throw new Error("시험에 없는 주소: " + url);
        });
        vi.stubGlobal("fetch", fetchMock);
        const body = { code: "test-auth-code-0123456789", redirectUri: REDIRECT };

        const closed = await call("POST", "/social/kakao", { ip: freshIp(), body });
        expect(closed.statusCode).toBe(503);
        expect(fetchMock).not.toHaveBeenCalled();
        expect(mem.state.profiles).toHaveLength(0);

        const { cookie } = await turnOn();
        const res = await call("POST", "/social/kakao", { ip: freshIp(), cookies: withPreview(cookie), body });
        expect(res.statusCode).toBe(200);
        expect(res.body.data).toMatchObject({ isNew: true, member: { id: "m1", name: "홍길동" } });
        expect(res.cookies.hiq_user_id.value).toBe("m1");
        expect(mem.state.profiles[0]).toMatchObject({ kakaoSub: "1234567890" });
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("서명이 깨졌거나 꼴이 다른 쿠키로는 열리지 않는다", async () => {
        const { cookie } = await turnOn();
        const [, stamp, tag] = String(cookie).split(".");
        const bad: unknown[] = [
            false,                                  // cookie-parser 는 서명이 깨진 쿠키를 false 로 준다
            undefined, null, "", "1", 1, true,
            `v2.${stamp}.${tag}`,                   // 다른 판
            `v1.${stamp}.${tag.slice(0, -1)}A`,     // 꼬리표 한 글자가 다르다
            `v1.${stamp}.${tag}x`,
            `v1.${stamp}`, `v1..${tag}`, `v1.abc.${tag}`,
            `${cookie} `,
            [cookie],
        ];
        for (const value of bad) {
            expect(kakaoPreviewValid(value, Date.now()), JSON.stringify(value)).toBe(false);
            const status = await call("GET", STATUS, { ip: freshIp(), cookies: withPreview(value) });
            expect(status.body.data, JSON.stringify(value)).toEqual({ open: false, native: false });
        }
        // 다른 이름의 쿠키에 넣어도 소용없다
        expect((await call("GET", STATUS, { ip: freshIp(), cookies: { hiq_user_id: cookie, other: cookie } })).body.data.open).toBe(false);
    });

    it("서명 없는 쿠키(req.cookies)는 보지 않는다", () => {
        const { cookie } = { cookie: packKakaoPreview(Date.now()) };
        expect(kakaoPreviewValid(cookie, Date.now())).toBe(true);
        expect(kakaoOpenFor({ cookies: withPreview(cookie) } as any)).toBe(false);
        expect(kakaoOpenFor({ signedCookies: withPreview(cookie) })).toBe(true);
    });
});

describe("열쇠를 바꾸면 옛 쿠키가 죽는다 · 30일이 지나도 죽는다", () => {
    it("열쇠를 바꾼 순간부터 옛 쿠키로는 아무 길도 열리지 않는다 — 새 열쇠로 다시 켜야 한다", async () => {
        const { cookie } = await turnOn();
        const cookies = withPreview(cookie);
        expect((await call("GET", STATUS, { ip: freshIp(), cookies })).body.data.open).toBe(true);

        vi.stubEnv("KAKAO_PREVIEW_KEY", OTHER_KEY);
        expect(kakaoPreviewValid(cookie, Date.now())).toBe(false);
        expect((await call("GET", STATUS, { ip: freshIp(), cookies })).body.data).toEqual({ open: false, native: false });
        expect((await call("POST", "/social/kakao/native/nonce", { ip: freshIp(), cookies, body: {} })).statusCode).toBe(503);
        expect((await call("POST", "/social/kakao", { ip: freshIp(), cookies, body: { code: "c", redirectUri: REDIRECT } })).statusCode).toBe(503);
        // 옛 열쇠는 이제 틀린 열쇠다
        expectGone(await call("POST", PREVIEW, { ip: freshIp(), body: { key: KEY } }));
        // 새 열쇠로 켜면 새 쿠키로 열린다
        const next = await turnOn(freshIp(), OTHER_KEY);
        expect(next.res.statusCode).toBe(200);
        expect(next.cookie).not.toBe(cookie);
        expect((await call("GET", STATUS, { ip: freshIp(), cookies: withPreview(next.cookie) })).body.data.open).toBe(true);
    });

    it("수명은 발급 시각으로도 본다 — 30일이 지났거나 시계가 1분 넘게 뒤로 간 쿠키는 받지 않는다", () => {
        const at = Date.now();
        const cookie = packKakaoPreview(at);
        const ttl = KAKAO_PREVIEW_TTL_SEC * 1000;
        expect(kakaoPreviewValid(cookie, at)).toBe(true);
        expect(kakaoPreviewValid(cookie, at + ttl - 1000)).toBe(true);
        expect(kakaoPreviewValid(cookie, at + ttl + 1000)).toBe(false);
        expect(kakaoPreviewValid(cookie, at - 30_000)).toBe(true);
        expect(kakaoPreviewValid(cookie, at - 120_000)).toBe(false);
    });
});

describe("공개 스위치만 켠 경우는 예전과 같다 — 미리보기와 무관하다", () => {
    it("스위치가 켜져 있으면 쿠키 없이 열린다. 열쇠가 서버에 없어도 같다", async () => {
        vi.stubEnv("KAKAO_LOGIN_OPEN", "1");
        for (const previewKey of ["", KEY]) {
            vi.stubEnv("KAKAO_PREVIEW_KEY", previewKey);
            expect(kakaoOpen()).toBe(true);
            expect(kakaoOpenFor()).toBe(true);
            expect(kakaoOpenFor(null)).toBe(true);
            expect(kakaoOpenFor({})).toBe(true);
            expect(kakaoConfigured()).toBe(true);
            expect(kakaoNativeConfigured()).toBe(true);
            expect((await call("GET", STATUS, { ip: freshIp() })).body.data).toEqual({ open: true, native: true });
            expect((await call("POST", "/social/kakao/native/nonce", { ip: freshIp(), body: {} })).statusCode).toBe(200);
            expect((await call("POST", "/social/kakao", { ip: freshIp(), body: { code: "c", redirectUri: "https://evil.example/auth/kakao" } })).body.code).toBe("KAKAO_BAD_REDIRECT");
        }
        // 열쇠가 없으면 스위치가 켜져 있어도 미리보기 길은 없는 주소다
        vi.stubEnv("KAKAO_PREVIEW_KEY", "");
        expectGone(await call("POST", PREVIEW, { ip: freshIp(), body: { key: KEY } }));
        expectGone(await call("DELETE", PREVIEW, { ip: freshIp() }));
    });

    it("스위치가 꺼져 있고 쿠키가 없으면 닫혀 있다 — 열쇠가 서버에 있든 없든 예전과 같은 값", () => {
        for (const previewKey of ["", KEY]) {
            vi.stubEnv("KAKAO_PREVIEW_KEY", previewKey);
            for (const req of [undefined, null, {}, { signedCookies: {} }, { signedCookies: null }]) {
                expect(kakaoOpenFor(req), JSON.stringify(req)).toBe(false);
                expect(kakaoConfigured(req)).toBe(false);
                expect(kakaoNativeConfigured(req)).toBe(false);
            }
        }
        // 스위치 값은 예전 규칙 그대로다 — 글자 "1" 만
        for (const value of ["true", "0", "yes", "on", " ", "11"]) {
            vi.stubEnv("KAKAO_LOGIN_OPEN", value);
            expect(kakaoOpenFor(), JSON.stringify(value)).toBe(false);
        }
    });

    it("요청 없이 부르면 공개 스위치만 본다 — 닫힌 쪽이 기본이다", async () => {
        const { cookie } = await turnOn();
        expect(kakaoConfigured()).toBe(false);
        expect(kakaoNativeConfigured()).toBe(false);
        expect(kakaoConfigured({ signedCookies: withPreview(cookie) })).toBe(true);
        expect(kakaoNativeConfigured({ signedCookies: withPreview(cookie) })).toBe(true);
        // 스위치만으로는 안 된다 — 키가 없으면 미리보기 쿠키가 있어도 닫혀 있다(예전의 not-configured 그대로)
        vi.stubEnv("KAKAO_LOGIN_CLIENT_SECRET", "");
        expect(kakaoConfigured({ signedCookies: withPreview(cookie) })).toBe(false);
        vi.stubEnv("KAKAO_NATIVE_APP_KEY", "");
        expect(kakaoNativeConfigured({ signedCookies: withPreview(cookie) })).toBe(false);
    });
});

describe("DELETE /social/kakao/preview — 끄기", () => {
    it("쿠키가 있든 없든 200 이고, 구울 때와 같은 속성으로 지운다(Path 가 다르면 브라우저가 남겨 둔다)", async () => {
        const { cookie, res: on } = await turnOn();
        const { signed: _signed, maxAge: _maxAge, ...attrs } = on.cookies[KAKAO_PREVIEW_COOKIE].options;
        for (const cookies of [withPreview(cookie), {}, withPreview(false)]) {
            const res = await call("DELETE", PREVIEW, { ip: freshIp(), cookies });
            expect(res.fellThrough).toBe(false);
            expect(res.statusCode).toBe(200);
            // 쿠키 없이 받을 답 = 공개 스위치 그대로(지금은 꺼져 있다)
            expect(res.body).toEqual({ success: true, data: { open: false, native: false } });
            expect(res.headers["cache-control"]).toBe("no-store");
            expect(res.cleared).toEqual([{ name: KAKAO_PREVIEW_COOKIE, options: attrs }]);
            expect(res.cookies).toEqual({});
        }
        expect(attrs).toEqual({ httpOnly: true, sameSite: "lax", secure: false, path: "/" });
    });

    it("시도 횟수에 걸린 IP 도 끌 수는 있다 — 끄기는 열쇠를 받지 않는다", async () => {
        const ip = freshIp();
        for (let i = 0; i < 10; i++) await call("POST", PREVIEW, { ip, body: { key: `wrong-key-number-${i}-padding` } });
        expect((await call("DELETE", PREVIEW, { ip })).statusCode).toBe(200);
    });
});

describe("소스 — 공개 스위치만 보던 곳이 남지 않았다", () => {
    const root = (p: string) => readFileSync(resolve(__dirname, "../..", p), "utf8");
    // 주석 줄은 빼고 본다(설명에 적힌 낱말에 걸리지 않게)
    const code = (s: string) => s.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
    const auth = code(root("server/routes/modules/auth.ts"));
    const lib = code(root("server/lib/kakaoAuth.ts"));

    it("라우트는 판정 함수에 늘 요청을 넘긴다 — 요청 없이 부르는 곳도, 공개 스위치를 직접 보는 곳도 없다", () => {
        expect(auth).not.toMatch(/kakaoConfigured\(\s*\)/);
        expect(auth).not.toMatch(/kakaoNativeConfigured\(\s*\)/);
        expect(auth).not.toMatch(/\bkakaoOpen\(/);
        expect(auth).not.toMatch(/KAKAO_LOGIN_OPEN/);
        // 웹 로그인·웹 연결·앱 nonce·앱 검증(로그인·연결이 한 길)
        expect(auth.match(/if \(!kakaoConfigured\(req\)\) return sendKakaoFailure\(res, "not-configured"\);/g)).toHaveLength(2);
        expect(auth.match(/if \(!kakaoNativeConfigured\(req\)\) return sendKakaoNativeFailure\(res, "not-configured"\);/g)).toHaveLength(2);
        const at = (route: string) => { const i = auth.indexOf(route); expect(i, route).toBeGreaterThan(0); return i; };
        const blocks = [
            auth.slice(at('router.post("/social/kakao",'), at("function sendKakaoPinFailure")),
            auth.slice(at('router.post("/social/kakao/link",'), at('router.delete("/social/kakao/link",')),
            auth.slice(at('router.post("/social/kakao/native/nonce",'), at('router.post("/social/kakao/native",')),
            auth.slice(at('router.post("/social/kakao/native",')),
        ];
        for (const block of blocks) expect(block).toMatch(/kakao(Native)?Configured\(req\)/);
        // 상태 길도 같은 판정이다
        const status = auth.slice(at('router.get("/social/kakao/status",'), at("function kakaoNonceCookieOptions"));
        expect(status).toContain("{ open: kakaoOpenFor(req), native: kakaoNativeConfigured(req) }");
    });

    it("해제(DELETE /social/kakao/link)는 예전처럼 스위치를 보지 않는다 — 닫혀 있어도 잘못 붙은 카카오를 뗄 수 있어야 한다", () => {
        const unlink = auth.slice(auth.indexOf('router.delete("/social/kakao/link",'), auth.indexOf('router.post("/register"'));
        expect(unlink.length).toBeGreaterThan(100);
        expect(unlink).not.toMatch(/kakaoConfigured|kakaoNativeConfigured|kakaoOpen/);
    });

    it("판정은 한 곳이다 — kakaoOpenFor 만 공개 스위치를 보고, 두 판정이 그것을 쓴다", () => {
        // kakaoOpen() 이라는 글자는 정의와 kakaoOpenFor 안, 두 군데뿐이다
        expect(lib.match(/\bkakaoOpen\(\)/g)).toHaveLength(2);
        expect(lib).toMatch(/export function kakaoOpenFor\(req\?: KakaoGateRequest \| null\): boolean \{\s*return kakaoOpen\(\) \|\| kakaoPreviewValid\(req\?\.signedCookies\?\.\[KAKAO_PREVIEW_COOKIE\], Date\.now\(\)\);\s*\}/);
        expect(lib).toMatch(/export function kakaoConfigured\(req\?: KakaoGateRequest \| null\): boolean \{\s*return kakaoOpenFor\(req\) && readKeys\(\) !== null;\s*\}/);
        expect(lib).toMatch(/export function kakaoNativeConfigured\(req\?: KakaoGateRequest \| null\): boolean \{\s*return kakaoOpenFor\(req\) && /);
        // 쿠키는 서명 검증을 통과한 것만 읽는다
        expect(lib).not.toMatch(/req\??\.cookies/);
        expect(auth).not.toMatch(/req\.cookies\b/);
    });

    it("열쇠는 한 곳에서만 읽고, 어디에도 적지 않는다", () => {
        expect(lib.match(/process\.env\.KAKAO_PREVIEW_KEY/g)).toHaveLength(1);
        expect(auth).not.toContain("process.env.KAKAO_PREVIEW_KEY");
        const preview = lib.slice(lib.indexOf("function previewKey()"), lib.indexOf("export function kakaoConfigured"));
        expect(preview.length).toBeGreaterThan(500);
        expect(preview).not.toMatch(/console\.(log|warn|error|info)\(/);
        // 열쇠를 돌려주는 함수는 내보내지 않는다
        expect(lib).not.toMatch(/export function previewKey|export \{[^}]*previewKey/);
        // 대조는 시간 일정 비교다
        const match = lib.slice(lib.indexOf("export function kakaoPreviewKeyMatches"), lib.indexOf("export function packKakaoPreview"));
        expect(match).toContain("timingSafeEqual(");
        expect(match).not.toMatch(/input === key|key === input/);
        const routes = auth.slice(auth.indexOf('router.post("/social/kakao/preview",'), auth.indexOf('router.get("/social/kakao/status",'));
        expect(routes).not.toMatch(/console\.(log|warn|error|info)\(/);
    });

    it("켜기 길의 순서 — 열쇠가 서버에 있는가 → 시도 횟수 → JSON·열쇠 대조(틀리면 센다) → 쿠키. 닫힌 답은 전부 next() 다", () => {
        const start = auth.indexOf('router.post("/social/kakao/preview",');
        const post = auth.slice(start, auth.indexOf('router.delete("/social/kakao/preview",'));
        const at = (s: string) => { const i = post.indexOf(s); expect(i, s).toBeGreaterThan(0); return i; };
        const order = [
            at("if (!kakaoPreviewEnabled()) return next();"),
            at("attemptKey('kakao-preview', 'any', clientIp(req))"),
            at("if (checkRateLimit(key).limited) return next();"),
            at("if (!isJsonBody(req) || !kakaoPreviewKeyMatches(req.body?.key)) {"),
            at("registerFailure(key, KAKAO_PREVIEW_MAX_TRIES);"),
            at("clearAttempts(key);"),
            at("res.cookie(KAKAO_PREVIEW_COOKIE, value, { ...kakaoPreviewCookieOptions(), signed: true, maxAge: KAKAO_PREVIEW_TTL_SEC * 1000 });"),
        ];
        expect(order).toEqual([...order].sort((a, b) => a - b));
        // 틀렸을 때 따로 만든 답이 없다(404 를 직접 보내면 없는 주소의 답과 글자가 달라져 기능이 드러난다)
        expect(post).not.toMatch(/sendError\(|status\(40[0-9]\)/);
        expect(auth).toContain("const KAKAO_PREVIEW_MAX_TRIES = 10;");
        // 끄기도 열쇠가 서버에 있을 때만 있는 길이다
        const del = auth.slice(auth.indexOf('router.delete("/social/kakao/preview",'), auth.indexOf('router.get("/social/kakao/status",'));
        expect(del).toContain("if (!kakaoPreviewEnabled()) return next();");
        expect(del).toContain("res.clearCookie(KAKAO_PREVIEW_COOKIE, kakaoPreviewCookieOptions());");
    });

    it("미리보기 길은 앱 안 카카오 묶음 앞에 있다 — 그 묶음은 여전히 파일 맨 끝이다", () => {
        const raw = root("server/routes/modules/auth.ts");
        const previewAt = raw.indexOf('router.post("/social/kakao/preview",');
        expect(previewAt).toBeGreaterThan(raw.indexOf('router.post("/reset-pin/verify"'));
        expect(raw.indexOf('router.get("/social/kakao/status",')).toBeLessThan(raw.indexOf('router.post("/social/kakao/native/nonce",'));
        // shared 를 상대 경로로 부를 때는 .js 확장자(서버리스 규칙)
        expect(raw).toContain('from "../../../shared/kakaoLogin.js";');
        expect(root("server/lib/kakaoAuth.ts")).toContain('} from "../../shared/kakaoLogin.js";');
    });
});
