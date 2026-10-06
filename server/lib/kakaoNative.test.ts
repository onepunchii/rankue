import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, errors as joseErrors } from "jose";
import {
    kakaoIdTokenRejected, kakaoNativeAudiences, kakaoNativeConfigured, newKakaoNonce, packKakaoNonce, takeKakaoNonce, verifyKakaoIdToken,
} from "./kakaoAuth.js";
import authRouter from "../routes/modules/auth.js";
import {
    KAKAO_ID_TOKEN_ISSUER, KAKAO_JWKS_URL, KAKAO_NATIVE_NONCE_API, KAKAO_NATIVE_VERIFY_API, KAKAO_NONCE_COOKIE, KAKAO_NONCE_COOKIE_PATH,
    KAKAO_NONCE_TTL_SEC, isKakaoNonce,
} from "../../shared/kakaoNative.js";

/**
 * 앱 안 카카오 로그인(네이티브 SDK)의 서버 쪽 — ID 토큰 검증 표와 1회용 nonce, 그리고 두 라우트.
 * (2026-10-06 오너: "카카오 로그인이 되는 앱 빌드를 만들어 구글·애플에 올리고, 승인되면 카카오를 연다")
 *
 * 카카오에 실제 요청을 보내지 않는다 — 공개 키 목록(JWKS)을 시험이 만든 키로 바꾼다(jose 의 createRemoteJWKSet 만 가짜다,
 * 서명 검증·클레임 검사는 진짜 jose 가 한다). 아래 앱 키·회원번호·PIN 은 전부 시험용으로 지어낸 글자다.
 * DB 도 건드리지 않는다(.env 는 운영 DB 다) — 저장소는 메모리 가짜이고, 라우트는 서버를 띄우지 않고 처리 함수를 직접 부른다
 * (lib/kakaoAuth.test.ts 와 같은 방식). 시도 횟수 제한·쓴 nonce 는 모듈 메모리에 남으므로 시험마다 다른 IP·회원·nonce 를 쓴다.
 */
const mem = vi.hoisted(() => {
    const state = {
        profiles: [] as any[], members: [] as any[], suspended: new Set<string>(),
        /** 카카오 공개 키를 찾는 함수 — 시험이 바꿔 끼운다(없는 키·시간 초과도 여기서 만든다) */
        getKey: null as null | ((header: unknown, token: unknown) => unknown),
        /** 공개 키 주소로 무엇을 받았는가 */
        jwksUrls: [] as string[],
    };
    const col = { google: "googleSub", apple: "appleSub", kakao: "kakaoSub" } as const;
    const storage = {
        users: {
            async getProfileBySocialSub(provider: "google" | "apple" | "kakao", sub: string) {
                return state.profiles.find((p) => p[col[provider]] === sub);
            },
            async linkProfileKakaoSub(profileId: string, sub: string) {
                if (state.profiles.some((p) => p.kakaoSub === sub && p.id !== profileId)) {
                    throw Object.assign(new Error('duplicate key value violates unique constraint "profiles_kakao_sub_unique"'), { code: "23505" });
                }
                const p = state.profiles.find((x) => x.id === profileId);
                if (!p || p.kakaoSub) return false;
                p.kakaoSub = sub;
                return true;
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
vi.mock("jose", async (importOriginal) => {
    const real = await importOriginal<typeof import("jose")>();
    return {
        ...real,
        // 진짜는 주소에서 키를 받아 온다 — 가짜는 주소만 적어 두고, 키 찾기를 시험이 넣은 함수에 맡긴다
        createRemoteJWKSet: (url: URL) => {
            mem.state.jwksUrls.push(url.href);
            return (header: unknown, token: unknown) => {
                if (!mem.state.getKey) throw new Error("시험이 공개 키를 넣지 않았다");
                return mem.state.getKey(header, token);
            };
        },
    };
});
vi.mock("../db.js", () => ({ db: {}, pool: {} }));
vi.mock("../storage/index.js", () => ({ storage: mem.storage }));
vi.mock("./handle.js", () => ({ generateHandle: async () => "player_0001" }));
vi.mock("../middleware/terms.js", () => ({
    isMemberSuspended: async (id: string) => mem.state.suspended.has(id),
    recordTermsAcceptance: async () => undefined,
    requireTermsAccepted: (_req: unknown, _res: unknown, next: () => void) => next(),
    SUSPENDED_TEXT: "정지된 계정",
}));

/** 시험용 앱 키(지어낸 글자) — 진짜 카카오 키는 32자 16진수다. */
const NATIVE_KEY = "test-native-app-key";
const REST_KEY = "test-rest-key";
const OTHER_APP_KEY = "some-other-kakao-app";
const KID = "test-kid-1";
/** 시험용 PIN — 지어낸 값이다. 옛 평문 꼴로 둔다(verifyPassword 가 평문·해시를 둘 다 받는다). */
const PIN = "4821";

type Keys = { privateKey: CryptoKey; publicJwk: Record<string, unknown> };
let kakaoKey: Keys;      // '카카오'의 키(가짜 JWKS 에 실린다)
let attackerKey: Keys;   // 남이 만든 키(JWKS 에 없다)
let warn: ReturnType<typeof vi.spyOn>;

async function makeKey(kid: string): Promise<Keys> {
    const { privateKey, publicKey } = await generateKeyPair("RS256", { extractable: true });
    return { privateKey: privateKey as CryptoKey, publicJwk: { ...(await exportJWK(publicKey)), kid, alg: "RS256", use: "sig" } };
}

type Claims = { iss?: string; aud?: string | string[]; sub?: string; nonce?: string; nickname?: string; expInSec?: number; drop?: ("sub" | "nonce" | "exp")[] };

/** 카카오 ID 토큰과 같은 꼴(iss·aud·sub·iat·exp·auth_time·nonce·nickname)의 토큰을 만든다. */
async function idToken(nonce: string, over: Claims = {}, key: Keys = kakaoKey, kid: string = KID): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const payload: Record<string, unknown> = {
        iss: over.iss ?? KAKAO_ID_TOKEN_ISSUER,
        aud: over.aud ?? NATIVE_KEY,
        sub: over.sub ?? "1234567890",
        iat: now,
        auth_time: now,
        exp: now + (over.expInSec ?? 6 * 60 * 60),
        nonce: over.nonce ?? nonce,
        ...(over.nickname !== undefined ? { nickname: over.nickname } : {}),
    };
    for (const k of over.drop ?? []) delete payload[k];
    return new SignJWT(payload).setProtectedHeader({ alg: "RS256", typ: "JWT", kid }).sign(key.privateKey);
}

/** 로그 전체를 한 줄로 — 토큰·nonce·회원번호가 새지 않았는지 볼 때 쓴다. */
const logged = () => warn.mock.calls.map((c: unknown[]) => c.map(String).join(" ")).join("\n");

beforeAll(async () => {
    kakaoKey = await makeKey(KID);
    attackerKey = await makeKey(KID);
});

beforeEach(() => {
    mem.state.profiles = [];
    mem.state.members = [];
    mem.state.suspended = new Set();
    mem.state.getKey = createLocalJWKSet({ keys: [kakaoKey.publicJwk] } as any) as any;
    vi.stubEnv("KAKAO_NATIVE_APP_KEY", NATIVE_KEY);
    vi.stubEnv("KAKAO_LOGIN_REST_KEY", REST_KEY);
    // 여는 스위치 — 시험은 열린 상태를 기준으로 본다. 닫힌 상태는 아래에서 따로 본다
    vi.stubEnv("KAKAO_LOGIN_OPEN", "1");
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
});

describe("계약의 상수 — 화면·플러그인·서버가 같은 값을 쓴다", () => {
    it("발급자·공개 키 주소는 카카오 OIDC 문서의 값이고, 서버는 그 주소 하나에서만 키를 받는다", () => {
        expect(KAKAO_ID_TOKEN_ISSUER).toBe("https://kauth.kakao.com");
        expect(KAKAO_JWKS_URL).toBe("https://kauth.kakao.com/.well-known/jwks.json");
        expect(mem.state.jwksUrls).toContain(KAKAO_JWKS_URL);
        expect(mem.state.jwksUrls.filter((u) => u.includes("kakao"))).toEqual([KAKAO_JWKS_URL]);
    });

    it("두 길의 주소 · nonce 쿠키는 이 두 길에만 실린다 · 10분", () => {
        expect(KAKAO_NATIVE_NONCE_API).toBe("/api/hiq/social/kakao/native/nonce");
        expect(KAKAO_NATIVE_VERIFY_API).toBe("/api/hiq/social/kakao/native");
        expect(KAKAO_NONCE_COOKIE_PATH).toBe(KAKAO_NATIVE_VERIFY_API);
        expect(KAKAO_NATIVE_NONCE_API.startsWith(`${KAKAO_NONCE_COOKIE_PATH}/`)).toBe(true);
        expect(KAKAO_NONCE_TTL_SEC).toBe(600);
    });
});

describe("kakaoNativeConfigured — 스위치와 aud 허용 목록", () => {
    it("허용 목록은 네이티브 앱 키(쉼표로 여럿) + REST 키 — 빈 값·공백·겹치는 값은 뺀다", () => {
        expect(kakaoNativeAudiences()).toEqual([NATIVE_KEY, REST_KEY]);
        vi.stubEnv("KAKAO_NATIVE_APP_KEY", ` ios-key , android-key ,, ${REST_KEY} `);
        expect(kakaoNativeAudiences()).toEqual(["ios-key", "android-key", REST_KEY]);
        vi.stubEnv("KAKAO_NATIVE_APP_KEY", "");
        expect(kakaoNativeAudiences()).toEqual([REST_KEY]);
        vi.stubEnv("KAKAO_LOGIN_REST_KEY", "  ");
        expect(kakaoNativeAudiences()).toEqual([]);
    });

    it("스위치(KAKAO_LOGIN_OPEN=1)가 꺼져 있으면 키가 있어도 닫혀 있다 — 웹 카카오와 같은 스위치 하나", () => {
        expect(kakaoNativeConfigured()).toBe(true);
        for (const off of ["", "0", "true", " "]) {
            vi.stubEnv("KAKAO_LOGIN_OPEN", off);
            expect(kakaoNativeConfigured(), JSON.stringify(off)).toBe(false);
        }
        vi.stubEnv("KAKAO_LOGIN_OPEN", "1");
        vi.stubEnv("KAKAO_NATIVE_APP_KEY", "");
        // 네이티브 앱 키가 없으면 REST 키가 있어도 닫혀 있다(2026-10-06 검토) — 앱이 받는 토큰의 aud 는 네이티브 앱 키라, 열어 두면 전부 401 로 떨어지고 실패로 세어진다
        expect(kakaoNativeConfigured()).toBe(false);
        vi.stubEnv("KAKAO_NATIVE_APP_KEY", " , ");
        expect(kakaoNativeConfigured()).toBe(false);
        vi.stubEnv("KAKAO_LOGIN_REST_KEY", "");
        expect(kakaoNativeConfigured()).toBe(false);
        // 네이티브 앱 키만 있어도 열린다(REST 키는 aud 목록의 보조다)
        vi.stubEnv("KAKAO_NATIVE_APP_KEY", NATIVE_KEY);
        expect(kakaoNativeConfigured()).toBe(true);
    });
});

describe("nonce — 서버가 내주고, 이 브라우저의 서명 쿠키와 견주고, 한 번만 쓴다", () => {
    const T0 = 1_800_000_000_000;

    it("난수 32바이트(base64url 43자)이고 부를 때마다 다르다", () => {
        const a = newKakaoNonce();
        const b = newKakaoNonce();
        expect(isKakaoNonce(a)).toBe(true);
        expect(a).toHaveLength(43);
        expect(a).not.toBe(b);
    });

    it("쿠키의 값과 보낸 값이 같고 10분 안이면 ok", () => {
        const n = newKakaoNonce();
        expect(takeKakaoNonce(packKakaoNonce(n, T0), n, T0 + 5_000)).toBe("ok");
    });

    it("재사용 — 같은 nonce 는 두 번째부터 거절한다(쿠키가 남아 있어도)", () => {
        const n = newKakaoNonce();
        const cookie = packKakaoNonce(n, T0);
        expect(takeKakaoNonce(cookie, n, T0 + 1_000)).toBe("ok");
        expect(takeKakaoNonce(cookie, n, T0 + 2_000)).toBe("reused");
        expect(takeKakaoNonce(cookie, n, T0 + 9 * 60_000)).toBe("reused");
    });

    it("만료 — 10분까지는 되고, 넘으면 안 된다. 시계가 뒤로 간 쿠키(1분 넘게 미래)도 안 된다", () => {
        const a = newKakaoNonce();
        expect(takeKakaoNonce(packKakaoNonce(a, T0), a, T0 + KAKAO_NONCE_TTL_SEC * 1000)).toBe("ok");
        const b = newKakaoNonce();
        expect(takeKakaoNonce(packKakaoNonce(b, T0), b, T0 + KAKAO_NONCE_TTL_SEC * 1000 + 1)).toBe("expired");
        // 만료로 거절된 것은 '썼음'으로 적히지 않는다 — 그래도 다시 보내면 여전히 만료다
        expect(takeKakaoNonce(packKakaoNonce(b, T0), b, T0 + KAKAO_NONCE_TTL_SEC * 1000 + 2)).toBe("expired");
        const c = newKakaoNonce();
        expect(takeKakaoNonce(packKakaoNonce(c, T0 + 61_000), c, T0)).toBe("expired");
    });

    it("불일치 — 쿠키와 다른 nonce(남이 받은 nonce)는 거절한다. 거절된 쿠키의 nonce 는 쓰인 것으로 치지 않는다", () => {
        const mine = newKakaoNonce();
        const theirs = newKakaoNonce();
        expect(takeKakaoNonce(packKakaoNonce(mine, T0), theirs, T0 + 1)).toBe("mismatch");
        expect(takeKakaoNonce(packKakaoNonce(mine, T0), undefined, T0 + 1)).toBe("mismatch");
        expect(takeKakaoNonce(packKakaoNonce(mine, T0), mine, T0 + 2)).toBe("ok");
    });

    it("쿠키가 없거나(다른 기기 · 이미 지워짐 · 서명이 깨져 false 로 옴) 모양이 다르면 missing", () => {
        const n = newKakaoNonce();
        for (const cookie of [undefined, null, false, "", n, `${n}.`, `${n}.abc`, `.${T0}`, `short.${T0}`, `${n}x.${T0}`, 12345, { nonce: n }]) {
            expect(takeKakaoNonce(cookie, n, T0), JSON.stringify(cookie)).toBe("missing");
        }
    });
});

describe("verifyKakaoIdToken — ID 토큰 검증 표", () => {
    it("진짜 토큰 — 회원번호(sub)와 닉네임만 돌려준다. 웹의 교환과 같은 꼴의 sub(숫자 글자)다", async () => {
        const n = newKakaoNonce();
        const r = await verifyKakaoIdToken(await idToken(n, { nickname: "  홍길동  " }), n);
        expect(r).toEqual({ ok: true, identity: { sub: "1234567890", email: null, name: "홍길동" } });
        // 닉네임 제공에 동의하지 않았으면 null
        const n2 = newKakaoNonce();
        expect(await verifyKakaoIdToken(await idToken(n2), n2)).toEqual({ ok: true, identity: { sub: "1234567890", email: null, name: null } });
    });

    it("aud 는 허용 목록 — 네이티브 앱 키도, REST 키도 받는다. 목록에 없는 앱의 토큰은 안 받는다", async () => {
        const n = newKakaoNonce();
        expect((await verifyKakaoIdToken(await idToken(n, { aud: NATIVE_KEY }), n)).ok).toBe(true);
        expect((await verifyKakaoIdToken(await idToken(n, { aud: REST_KEY }), n)).ok).toBe(true);
        expect(await verifyKakaoIdToken(await idToken(n, { aud: OTHER_APP_KEY }), n)).toEqual({ ok: false, reason: "token-invalid" });
        // 받는 앱이 여럿 적힌 토큰은 우리 키가 끼어 있어도 안 받는다
        expect(await verifyKakaoIdToken(await idToken(n, { aud: [NATIVE_KEY, OTHER_APP_KEY] }), n)).toEqual({ ok: false, reason: "token-invalid" });
    });

    it("위조 서명 — 남의 키로 서명했거나, 내용을 고쳤거나, 모르는 kid 면 안 받는다", async () => {
        const n = newKakaoNonce();
        // 같은 kid 를 달았지만 카카오의 키가 아니다
        expect(await verifyKakaoIdToken(await idToken(n, {}, attackerKey), n)).toEqual({ ok: false, reason: "token-invalid" });
        // 진짜 토큰의 내용(회원번호)만 바꿔 끼웠다 — 서명이 맞지 않는다
        const [h, , s] = (await idToken(n)).split(".");
        const forged = Buffer.from(JSON.stringify({
            iss: KAKAO_ID_TOKEN_ISSUER, aud: NATIVE_KEY, sub: "999", nonce: n, exp: Math.floor(Date.now() / 1000) + 600,
        })).toString("base64url");
        expect(await verifyKakaoIdToken(`${h}.${forged}.${s}`, n)).toEqual({ ok: false, reason: "token-invalid" });
        // 카카오 키 목록에 없는 kid
        expect(await verifyKakaoIdToken(await idToken(n, {}, attackerKey, "unknown-kid"), n)).toEqual({ ok: false, reason: "token-invalid" });
    });

    it("다른 알고리즘 — RS256 이 아니면 안 받는다(HS256 로 서명한 토큰)", async () => {
        const n = newKakaoNonce();
        const hs = await new SignJWT({ iss: KAKAO_ID_TOKEN_ISSUER, aud: NATIVE_KEY, sub: "1234567890", nonce: n, exp: Math.floor(Date.now() / 1000) + 600 })
            .setProtectedHeader({ alg: "HS256", kid: KID }).sign(new TextEncoder().encode("a".repeat(48)));
        expect(await verifyKakaoIdToken(hs, n)).toEqual({ ok: false, reason: "token-invalid" });
    });

    it("다른 iss — 카카오가 발급한 토큰이 아니다", async () => {
        const n = newKakaoNonce();
        for (const iss of ["https://accounts.google.com", "https://kauth.kakao.com/", "http://kauth.kakao.com", "kauth.kakao.com"]) {
            expect(await verifyKakaoIdToken(await idToken(n, { iss }), n), iss).toEqual({ ok: false, reason: "token-invalid" });
        }
    });

    it("만료 — exp 가 지난 토큰은 안 받는다. exp 가 아예 없는 토큰도", async () => {
        const n = newKakaoNonce();
        expect(await verifyKakaoIdToken(await idToken(n, { expInSec: -60 }), n)).toEqual({ ok: false, reason: "token-invalid" });
        expect(await verifyKakaoIdToken(await idToken(n, { drop: ["exp"] }), n)).toEqual({ ok: false, reason: "token-invalid" });
        // 발급 때는 살아 있었지만 그 사이 만료됐다
        vi.useFakeTimers({ toFake: ["Date"] });
        const live = await idToken(n, { expInSec: 60 });
        expect((await verifyKakaoIdToken(live, n)).ok).toBe(true);
        vi.setSystemTime(Date.now() + 61_000);
        expect(await verifyKakaoIdToken(live, n)).toEqual({ ok: false, reason: "token-invalid" });
    });

    it("nonce 불일치 — 다른 로그인에서 받은 토큰(다른 nonce)이나 nonce 없는 토큰은 안 받는다", async () => {
        const mine = newKakaoNonce();
        const theirs = newKakaoNonce();
        expect(await verifyKakaoIdToken(await idToken(theirs), mine)).toEqual({ ok: false, reason: "token-invalid" });
        expect(await verifyKakaoIdToken(await idToken(mine, { drop: ["nonce"] }), mine)).toEqual({ ok: false, reason: "token-invalid" });
        // 앞부분만 같은 값도 다르다
        expect(await verifyKakaoIdToken(await idToken(mine, { nonce: mine.slice(0, 42) }), mine)).toEqual({ ok: false, reason: "token-invalid" });
    });

    it("sub 가 회원번호 꼴이 아니면 안 받는다 — 없는 것도", async () => {
        const n = newKakaoNonce();
        for (const sub of ["0", "abc", "12 34", "-5", "1".repeat(21)]) {
            expect(await verifyKakaoIdToken(await idToken(n, { sub }), n), sub).toEqual({ ok: false, reason: "token-invalid" });
        }
        expect(await verifyKakaoIdToken(await idToken(n, { drop: ["sub"] }), n)).toEqual({ ok: false, reason: "token-invalid" });
    });

    it("꼴이 틀린 값은 검증기에 넣지도 않는다(bad-token) — 공개 키도 찾지 않는다", async () => {
        const n = newKakaoNonce();
        const good = await idToken(n);
        const spy = vi.fn(mem.state.getKey!);
        mem.state.getKey = spy;
        for (const token of [undefined, null, "", 123, "not-a-jwt", "a.b", "a.b.c.d", "a.b.", `${good} `, "a".repeat(5000) + ".b.c"]) {
            expect(await verifyKakaoIdToken(token, n), JSON.stringify(String(token).slice(0, 20))).toEqual({ ok: false, reason: "bad-token" });
        }
        for (const nonce of [undefined, "", "short", n + "x", 42]) {
            expect(await verifyKakaoIdToken(good, nonce), JSON.stringify(nonce)).toEqual({ ok: false, reason: "bad-token" });
        }
        expect(spy).not.toHaveBeenCalled();
    });

    it("키가 하나도 없으면 not-configured — 토큰을 보지도 않는다", async () => {
        vi.stubEnv("KAKAO_NATIVE_APP_KEY", "");
        vi.stubEnv("KAKAO_LOGIN_REST_KEY", "");
        const n = newKakaoNonce();
        expect(await verifyKakaoIdToken(await idToken(n), n)).toEqual({ ok: false, reason: "not-configured" });
    });

    it("카카오 공개 키를 못 받으면 unreachable — 보낸 사람 잘못으로 세지 않는다", async () => {
        const n = newKakaoNonce();
        const token = await idToken(n);
        for (const boom of [
            new joseErrors.JWKSTimeout(),
            new joseErrors.JOSEError("Expected 200 OK from the JSON Web Key Set HTTP response"),
            new TypeError("fetch failed"),
        ]) {
            mem.state.getKey = () => { throw boom; };
            const r = await verifyKakaoIdToken(token, n);
            expect(r, boom.message).toEqual({ ok: false, reason: "unreachable" });
        }
        expect(kakaoIdTokenRejected("unreachable")).toBe(false);
        expect(kakaoIdTokenRejected("token-invalid")).toBe(true);
        expect(kakaoIdTokenRejected("bad-token")).toBe(false);
        expect(kakaoIdTokenRejected("not-configured")).toBe(false);
    });

    it("실패를 적는 로그에 토큰·nonce·회원번호·닉네임은 없다 — 어디가 틀렸는지(iss·aud·남은 시간)만 남는다", async () => {
        const n = newKakaoNonce();
        const token = await idToken(n, { aud: OTHER_APP_KEY, sub: "7777777777", nickname: "비밀이름" });
        await verifyKakaoIdToken(token, n);
        const text = logged();
        expect(text).toContain("ID 토큰 검증 실패");
        expect(text).toContain(OTHER_APP_KEY);
        expect(text).toContain("allowed aud: 2");
        expect(text).not.toContain(token);
        expect(text).not.toContain(token.split(".")[2]);
        expect(text).not.toContain(n);
        expect(text).not.toContain("7777777777");
        expect(text).not.toContain("비밀이름");
        // 허용 목록의 값(우리 키)은 적지 않는다 — 개수만
        expect(text).not.toContain(NATIVE_KEY);
        expect(text).not.toContain(REST_KEY);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 라우트 동작 — 서버를 띄우지 않고, 라우터에 등록된 처리 함수를 가짜 요청·응답으로 직접 부른다.
// 쿠키의 서명은 cookie-parser 가 한다(여기 없다) — 가짜 요청의 signedCookies 는 '서명 검증을 통과한 값'이다.
// ─────────────────────────────────────────────────────────────────────────────
type FakeRes = {
    statusCode: number; body: any; headers: Record<string, string>;
    cookies: Record<string, { value: unknown; options: any }>; cleared: { name: string; options: any }[];
};
type FakeReq = { body?: unknown; ip?: string; userId?: string; json?: boolean; nonceCookie?: unknown; headers?: Record<string, string> };

function callRoute(path: "/social/kakao/native/nonce" | "/social/kakao/native", req: FakeReq): Promise<FakeRes> {
    const layer = (authRouter as any).stack.find((l: any) => l.route?.path === path && l.route.methods.post);
    if (!layer) throw new Error(`시험에 없는 길: POST ${path}`);
    const handlers: Function[] = layer.route.stack.map((s: any) => s.handle);
    return new Promise<FakeRes>((done, fail) => {
        const out: FakeRes = { statusCode: 200, body: undefined, headers: {}, cookies: {}, cleared: [] };
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
            body: req.body ?? {},
            ip: req.ip,
            headers: { ...(req.ip ? { "x-forwarded-for": `${req.ip}, 10.0.0.1` } : {}), ...req.headers },
            signedCookies: {
                ...(req.userId ? { hiq_user_id: req.userId } : {}),
                ...(req.nonceCookie !== undefined ? { [KAKAO_NONCE_COOKIE]: req.nonceCookie } : {}),
            },
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

let ipSeq = 0;
/** 시험마다 다른 IP — 시도 횟수 제한이 모듈 메모리에 남는다. */
const freshIp = () => `203.0.113.${++ipSeq}`;

/** nonce 를 받는다 — 앱이 하는 첫 걸음. 돌려주는 cookie 는 다음 요청에 실릴 서명 쿠키 값이다. */
async function issue(ip: string): Promise<{ nonce: string; cookie: unknown; res: FakeRes }> {
    const res = await callRoute("/social/kakao/native/nonce", { ip, body: {} });
    return { nonce: res.body?.data?.nonce, cookie: res.cookies[KAKAO_NONCE_COOKIE]?.value, res };
}

describe("POST /social/kakao/native/nonce — 발급", () => {
    it("nonce 를 본문과 서명 쿠키 양쪽에 준다 — 쿠키는 httpOnly · Strict · 이 길에만 · 10분, 응답은 캐시하지 않는다", async () => {
        const { nonce, cookie, res } = await issue(freshIp());
        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual({ success: true, data: { nonce, expiresInSec: 600 } });
        expect(isKakaoNonce(nonce)).toBe(true);
        expect(res.headers["cache-control"]).toBe("no-store");
        // 쿠키 값: <nonce>.<발급 시각>
        expect(String(cookie).startsWith(`${nonce}.`)).toBe(true);
        expect(Math.abs(Number(String(cookie).split(".")[1]) - Date.now())).toBeLessThan(5_000);
        expect(res.cookies[KAKAO_NONCE_COOKIE].options).toEqual({
            httpOnly: true, signed: true, sameSite: "strict", secure: false, path: "/api/hiq/social/kakao/native", maxAge: 600_000,
        });
        // 로그인 쿠키는 건드리지 않는다
        expect(res.cookies.hiq_user_id).toBeUndefined();
    });

    it("운영 서버에서는 secure 쿠키다", async () => {
        vi.stubEnv("NODE_ENV", "production");
        expect((await issue(freshIp())).res.cookies[KAKAO_NONCE_COOKIE].options.secure).toBe(true);
    });

    it("부를 때마다 다른 nonce 다", async () => {
        const ip = freshIp();
        expect((await issue(ip)).nonce).not.toBe((await issue(ip)).nonce);
    });

    it("스위치가 꺼져 있으면 503 — 쿠키도 nonce 도 주지 않는다(웹 카카오와 같은 답)", async () => {
        vi.stubEnv("KAKAO_LOGIN_OPEN", "");
        const res = await callRoute("/social/kakao/native/nonce", { ip: freshIp(), body: {} });
        expect(res.statusCode).toBe(503);
        expect(res.body).toMatchObject({ success: false, code: "KAKAO_NOT_CONFIGURED" });
        expect(res.body.data).toBeUndefined();
        expect(res.cookies).toEqual({});
    });

    it("JSON 본문이 아니면 400 — 숨긴 폼으로는 받을 수 없다", async () => {
        const res = await callRoute("/social/kakao/native/nonce", { ip: freshIp(), body: {}, json: false });
        expect(res.statusCode).toBe(400);
        expect(res.cookies).toEqual({});
    });
});

describe("POST /social/kakao/native — 로그인·가입", () => {
    it("한 바퀴: nonce → ID 토큰 → 로그인 쿠키. 응답은 /social 과 같은 모양이고, nonce 쿠키는 지운다", async () => {
        const ip = freshIp();
        const { nonce, cookie } = await issue(ip);
        const res = await callRoute("/social/kakao/native", { ip, nonceCookie: cookie, body: { idToken: await idToken(nonce, { nickname: "홍길동" }), nonce } });
        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data).toMatchObject({ isNew: true, redirectTo: "/dashboard", member: { id: "m1", name: "홍길동", profileId: "p1" } });
        expect(mem.state.profiles[0]).toMatchObject({ kakaoSub: "1234567890", nickname: "홍길동", countryCode: "KR" });
        expect(res.cookies.hiq_user_id.value).toBe("m1");
        expect(res.cookies.hiq_user_id.options).toMatchObject({ httpOnly: true, signed: true, sameSite: "lax", path: "/" });
        // 지울 때도 같은 Path 다(다르면 브라우저가 다른 쿠키로 보고 남겨 둔다)
        expect(res.cleared).toEqual([{ name: KAKAO_NONCE_COOKIE, options: { httpOnly: true, sameSite: "strict", secure: false, path: "/api/hiq/social/kakao/native" } }]);
        expect(res.headers["cache-control"]).toBe("no-store");
        // 응답에 토큰·nonce·회원번호가 실리지 않는다
        const text = JSON.stringify(res.body);
        expect(text).not.toContain(nonce);
        expect(text).not.toContain("1234567890");
        expect(text).not.toMatch(/idToken|id_token|access_?token/i);
    });

    it("웹 카카오와 같은 계정 규칙 — 웹에서 가입했거나 설정에서 연결해 둔 회원번호면 그 계정으로 들어온다(새로 만들지 않는다)", async () => {
        mem.state.profiles = [{ id: "pa", nickname: "가", password: PIN, kakaoSub: "5550001" }];
        mem.state.members = [{ id: "ma", profileId: "pa", phone: "01000000001", name: "가" }];
        const ip = freshIp();
        const { nonce, cookie } = await issue(ip);
        const res = await callRoute("/social/kakao/native", { ip, nonceCookie: cookie, body: { idToken: await idToken(nonce, { sub: "5550001" }), nonce, mode: "login" } });
        expect(res.statusCode).toBe(200);
        expect(res.body.data).toMatchObject({ isNew: false, member: { id: "ma" } });
        expect(res.cookies.hiq_user_id.value).toBe("ma");
        expect(mem.state.profiles).toHaveLength(1);
        expect(mem.state.members).toHaveLength(1);
    });

    it("스위치가 꺼져 있으면 503 — 진짜 토큰과 nonce 가 와도 아무것도 하지 않는다", async () => {
        const ip = freshIp();
        const { nonce, cookie } = await issue(ip);
        const token = await idToken(nonce);
        vi.stubEnv("KAKAO_LOGIN_OPEN", "");
        const res = await callRoute("/social/kakao/native", { ip, nonceCookie: cookie, body: { idToken: token, nonce } });
        expect(res.statusCode).toBe(503);
        expect(res.body).toMatchObject({ success: false, code: "KAKAO_NOT_CONFIGURED" });
        expect(res.cookies).toEqual({});
        expect(mem.state.profiles).toHaveLength(0);
        // 다시 켜면 그 nonce 는 아직 쓰이지 않았다
        vi.stubEnv("KAKAO_LOGIN_OPEN", "1");
        expect((await callRoute("/social/kakao/native", { ip, nonceCookie: cookie, body: { idToken: token, nonce } })).statusCode).toBe(200);
    });

    // 2026-10-06 검토: 여는 날 스위치만 켜고 서버에 네이티브 앱 키를 빠뜨리면(또는 Preview 에만 넣으면) 앱이 보낸 토큰이 전부 401 로 떨어지고
    // 실패로 세어져 같은 IP 의 웹 카카오까지 15분 잠겼다 — 이제는 nonce 단계에서 503 으로 닫혀 있어 카카오톡에 다녀오지도, 세지도 않는다.
    it("스위치는 켜졌는데 네이티브 앱 키가 없으면 두 길 다 503 — 실패로 세지 않아 여섯 번을 눌러도 잠기지 않는다", async () => {
        const ip = freshIp();
        const { nonce, cookie } = await issue(ip);
        const token = await idToken(nonce);
        vi.stubEnv("KAKAO_NATIVE_APP_KEY", "");
        const noNonce = await callRoute("/social/kakao/native/nonce", { ip, body: {} });
        expect(noNonce.statusCode).toBe(503);
        expect(noNonce.body).toMatchObject({ success: false, code: "KAKAO_NOT_CONFIGURED" });
        expect(noNonce.cookies).toEqual({});
        for (let i = 0; i < 6; i++) {
            const res = await callRoute("/social/kakao/native", { ip, nonceCookie: cookie, body: { idToken: token, nonce } });
            expect(res.statusCode, `try ${i + 1}`).toBe(503);
            expect(res.body.code).toBe("KAKAO_NOT_CONFIGURED");
            expect(res.cleared).toEqual([]);
        }
        expect(mem.state.profiles).toHaveLength(0);
        // 키를 넣으면 그 nonce 로 바로 된다 — 닫혀 있던 동안 잠기지도, nonce 가 쓰이지도 않았다
        vi.stubEnv("KAKAO_NATIVE_APP_KEY", NATIVE_KEY);
        expect((await callRoute("/social/kakao/native", { ip, nonceCookie: cookie, body: { idToken: token, nonce } })).statusCode).toBe(200);
    });

    it("nonce 재사용 — 같은 nonce·같은 토큰·같은 쿠키를 다시 보내면 401, 쿠키를 주지 않는다", async () => {
        const ip = freshIp();
        const { nonce, cookie } = await issue(ip);
        const token = await idToken(nonce);
        expect((await callRoute("/social/kakao/native", { ip, nonceCookie: cookie, body: { idToken: token, nonce } })).statusCode).toBe(200);
        // 가로챈 요청을 그대로 다시 보냈다(쿠키까지 들고)
        const again = await callRoute("/social/kakao/native", { ip, nonceCookie: cookie, body: { idToken: token, nonce } });
        expect(again.statusCode).toBe(401);
        expect(again.body).toMatchObject({ success: false, code: "KAKAO_NONCE_INVALID" });
        expect(again.cookies.hiq_user_id).toBeUndefined();
        // 정상적인 브라우저는 쿠키가 이미 지워져 있다 — 그래도 같은 답
        const noCookie = await callRoute("/social/kakao/native", { ip, body: { idToken: token, nonce } });
        expect(noCookie.statusCode).toBe(401);
        expect(noCookie.body.code).toBe("KAKAO_NONCE_INVALID");
        expect(mem.state.members).toHaveLength(1);
    });

    it("nonce 불일치 — 쿠키가 없거나(다른 기기에서 얻은 토큰) 쿠키와 다른 nonce 면 401. 무엇이 틀렸는지는 알려 주지 않는다", async () => {
        const ip = freshIp();
        const mine = await issue(ip);
        const theirs = await issue(freshIp());
        const stolen = await idToken(theirs.nonce);
        // 남의 토큰 + 남의 nonce 를 내 브라우저(내 쿠키)에 밀어 넣었다 — 로그인 CSRF
        const csrf = await callRoute("/social/kakao/native", { ip, nonceCookie: mine.cookie, body: { idToken: stolen, nonce: theirs.nonce } });
        // 쿠키 없이(다른 기기에서) 보냈다 — 재생
        const replay = await callRoute("/social/kakao/native", { ip, body: { idToken: stolen, nonce: theirs.nonce } });
        for (const res of [csrf, replay]) {
            expect(res.statusCode).toBe(401);
            expect(res.body).toEqual({ success: false, message: csrf.body.message, code: "KAKAO_NONCE_INVALID" });
            expect(res.cookies.hiq_user_id).toBeUndefined();
        }
        expect(mem.state.profiles).toHaveLength(0);
        // 내 nonce 쿠키는 검사하는 순간 지워진다(한 번만)
        expect(csrf.cleared.map((c) => c.name)).toEqual([KAKAO_NONCE_COOKIE]);
    });

    it("nonce 만료 — 내준 지 10분이 지나면 진짜 토큰이어도 401", async () => {
        vi.useFakeTimers({ toFake: ["Date"] });
        const ip = freshIp();
        const { nonce, cookie } = await issue(ip);
        vi.setSystemTime(Date.now() + KAKAO_NONCE_TTL_SEC * 1000 + 1_000);
        const res = await callRoute("/social/kakao/native", { ip, nonceCookie: cookie, body: { idToken: await idToken(nonce), nonce } });
        expect(res.statusCode).toBe(401);
        expect(res.body.code).toBe("KAKAO_NONCE_INVALID");
        expect(res.cookies.hiq_user_id).toBeUndefined();
    });

    it("토큰이 틀리면 401 KAKAO_TOKEN_INVALID — 위조 서명 · 다른 aud · 다른 iss · 만료 · 토큰 안의 nonce 가 다름. nonce 는 그걸로 끝난다", async () => {
        const cases: [string, (nonce: string) => Promise<string>][] = [
            ["위조 서명", (n) => idToken(n, {}, attackerKey)],
            ["다른 aud", (n) => idToken(n, { aud: OTHER_APP_KEY })],
            ["다른 iss", (n) => idToken(n, { iss: "https://accounts.google.com" })],
            ["만료", (n) => idToken(n, { expInSec: -60 })],
            ["토큰의 nonce 가 다름", (n) => idToken(n, { nonce: newKakaoNonce() })],
        ];
        for (const [name, make] of cases) {
            const ip = freshIp();
            const { nonce, cookie } = await issue(ip);
            const res = await callRoute("/social/kakao/native", { ip, nonceCookie: cookie, body: { idToken: await make(nonce), nonce } });
            expect(res.statusCode, name).toBe(401);
            expect(res.body, name).toMatchObject({ success: false, code: "KAKAO_TOKEN_INVALID" });
            expect(res.cookies.hiq_user_id, name).toBeUndefined();
            // 실패한 nonce 로는 진짜 토큰도 다시 못 쓴다 — 화면이 nonce 부터 다시 받는다
            const retry = await callRoute("/social/kakao/native", { ip, nonceCookie: cookie, body: { idToken: await idToken(nonce), nonce } });
            expect(retry.body.code, name).toBe("KAKAO_NONCE_INVALID");
        }
        expect(mem.state.profiles).toHaveLength(0);
    });

    it("본문이 JSON 이 아니거나 값의 꼴이 틀리면 400 — nonce 는 쓰이지 않고 남는다", async () => {
        const ip = freshIp();
        const { nonce, cookie } = await issue(ip);
        const token = await idToken(nonce);
        const bad: FakeReq[] = [
            { body: { idToken: token, nonce }, json: false },
            { body: { nonce } },
            { body: { idToken: token } },
            { body: { idToken: "not-a-jwt", nonce } },
            { body: { idToken: token, nonce: "short" } },
            { body: { idToken: token, nonce, mode: "admin" } },
            { body: { code: "auth-code", redirectUri: "https://www.rankue.co.kr/auth/kakao" } },
        ];
        for (const req of bad) {
            const res = await callRoute("/social/kakao/native", { ip, nonceCookie: cookie, ...req });
            expect(res.statusCode, JSON.stringify(req)).toBe(400);
            expect(res.body.code).toBe("KAKAO_BAD_REQUEST");
            expect(res.cleared).toEqual([]);
        }
        expect((await callRoute("/social/kakao/native", { ip, nonceCookie: cookie, body: { idToken: token, nonce } })).statusCode).toBe(200);
    });

    it("시도 횟수 — 틀린 토큰 다섯 번이면 그 IP 가 잠긴다(429). 웹 카카오와 같은 키라 길을 바꿔도 한도는 하나다", async () => {
        const ip = freshIp();
        for (let i = 0; i < 5; i++) {
            const { nonce, cookie } = await issue(ip);
            const res = await callRoute("/social/kakao/native", { ip, nonceCookie: cookie, body: { idToken: await idToken(nonce, {}, attackerKey), nonce } });
            expect(res.statusCode, `try ${i + 1}`).toBe(401);
        }
        const { nonce, cookie } = await issue(ip);
        const locked = await callRoute("/social/kakao/native", { ip, nonceCookie: cookie, body: { idToken: await idToken(nonce), nonce } });
        expect(locked.statusCode).toBe(429);
        expect(locked.cookies.hiq_user_id).toBeUndefined();
        // 잠긴 동안 nonce 는 쓰이지 않았다(쿠키를 지우지 않는다)
        expect(locked.cleared).toEqual([]);
        // 다른 IP 는 영향이 없다
        const other = freshIp();
        const o = await issue(other);
        expect((await callRoute("/social/kakao/native", { ip: other, nonceCookie: o.cookie, body: { idToken: await idToken(o.nonce), nonce: o.nonce } })).statusCode).toBe(200);
        const auth = readFileSync(resolve(__dirname, "../routes/modules/auth.ts"), "utf8");
        const native = auth.slice(auth.indexOf('router.post("/social/kakao/native",'));
        expect(native).toContain("attemptKey('social-link', 'kakao', userId) : attemptKey('social', 'kakao', clientIp(req))");
        expect(auth.slice(auth.indexOf('router.post("/social/kakao",'), auth.indexOf("function sendKakaoPinFailure"))).toContain("attemptKey('social', 'kakao', clientIp(req))");
    });

    it("틀린 nonce·카카오 쪽 장애는 실패로 세지 않는다 — 여섯 번을 틀려도 잠기지 않는다", async () => {
        const ip = freshIp();
        for (let i = 0; i < 6; i++) {
            const res = await callRoute("/social/kakao/native", { ip, body: { idToken: await idToken(newKakaoNonce()), nonce: newKakaoNonce() } });
            expect(res.statusCode).toBe(401);
            expect(res.body.code).toBe("KAKAO_NONCE_INVALID");
        }
        // 공개 키를 못 받는 동안의 요청도 세지 않는다
        mem.state.getKey = () => { throw new joseErrors.JWKSTimeout(); };
        for (let i = 0; i < 6; i++) {
            const { nonce, cookie } = await issue(ip);
            const res = await callRoute("/social/kakao/native", { ip, nonceCookie: cookie, body: { idToken: await idToken(nonce), nonce } });
            expect(res.statusCode).toBe(401);
            expect(res.body.code).toBe("KAKAO_UNREACHABLE");
        }
        mem.state.getKey = createLocalJWKSet({ keys: [kakaoKey.publicJwk] } as any) as any;
        const { nonce, cookie } = await issue(ip);
        expect((await callRoute("/social/kakao/native", { ip, nonceCookie: cookie, body: { idToken: await idToken(nonce), nonce } })).statusCode).toBe(200);
    });

    it("정지된 계정은 들여보내지 않는다 — 쿠키 없이 403", async () => {
        mem.state.profiles = [{ id: "pa", nickname: "가", kakaoSub: "5550002" }];
        mem.state.members = [{ id: "ma", profileId: "pa", phone: "01000000001", name: "가" }];
        mem.state.suspended.add("ma");
        const ip = freshIp();
        const { nonce, cookie } = await issue(ip);
        const res = await callRoute("/social/kakao/native", { ip, nonceCookie: cookie, body: { idToken: await idToken(nonce, { sub: "5550002" }), nonce } });
        expect(res.statusCode).toBe(403);
        expect(res.cookies.hiq_user_id).toBeUndefined();
        expect(res.cleared.map((c) => c.name)).toContain("hiq_user_id");
    });

    it("닉네임이 이름 필터에 걸리면 로그인은 되고 이름만 버린다 — 웹 카카오와 같은 규칙", async () => {
        const auth = readFileSync(resolve(__dirname, "../routes/modules/auth.ts"), "utf8");
        const native = auth.slice(auth.indexOf('router.post("/social/kakao/native",'));
        expect(native).toContain("verified.identity.name && !screenMemberProfile({ name: verified.identity.name }).ok");
        expect(native).toContain("? { ...verified.identity, name: null }");
    });
});

describe("POST /social/kakao/native — 연결(mode: link)", () => {
    beforeEach(() => {
        mem.state.profiles = [
            { id: "pa", nickname: "가", password: PIN, kakaoSub: null },      // 전화번호 회원(PIN 있음)
            { id: "pb", nickname: "나", kakaoSub: "900" },                     // 카카오로 따로 가입해 둔 계정
            { id: "pc", nickname: "다", kakaoSub: null },                      // PIN 없는 프로필
        ];
        mem.state.members = [
            { id: "ma", profileId: "pa", phone: "01000000001" },
            { id: "mb", profileId: "pb", phone: "social:kakao:0b0e6f0e-8a3f-4d0c-9d43-1c1f0a2b3c4d" },
            { id: "mc", profileId: "pc", phone: "01000000003" },
        ];
    });

    it("로그인 없이는 안 된다(401) — nonce 도 쓰이지 않는다", async () => {
        const ip = freshIp();
        const { nonce, cookie } = await issue(ip);
        const res = await callRoute("/social/kakao/native", { ip, nonceCookie: cookie, body: { idToken: await idToken(nonce, { sub: "100" }), nonce, mode: "link", pin: PIN } });
        expect(res.statusCode).toBe(401);
        expect(res.body.code).toBeUndefined();
        expect(res.cleared).toEqual([]);
        expect(mem.state.profiles[0].kakaoSub).toBeNull();
    });

    it("PIN 이 맞으면 내 프로필에 붙인다 — 로그인 쿠키는 건드리지 않는다", async () => {
        const ip = freshIp();
        const { nonce, cookie } = await issue(ip);
        const res = await callRoute("/social/kakao/native", { ip, userId: "ma", nonceCookie: cookie, body: { idToken: await idToken(nonce, { sub: "100" }), nonce, mode: "link", pin: PIN } });
        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual({ success: true, data: { linked: true } });
        expect(mem.state.profiles[0].kakaoSub).toBe("100");
        expect(res.cookies.hiq_user_id).toBeUndefined();
        expect(res.cleared.map((c) => c.name)).toEqual([KAKAO_NONCE_COOKIE]);
        // 붙인 뒤에는 앱에서 카카오로 들어와도 같은 계정이다
        const ip2 = freshIp();
        const again = await issue(ip2);
        const login = await callRoute("/social/kakao/native", { ip: ip2, nonceCookie: again.cookie, body: { idToken: await idToken(again.nonce, { sub: "100" }), nonce: again.nonce } });
        expect(login.body.data).toMatchObject({ isNew: false, member: { id: "ma" } });
    });

    it("PIN 이 틀리면 401 KAKAO_PIN_WRONG — nonce 가 쓰이지 않아, 같은 토큰으로 PIN 만 다시 보내면 된다", async () => {
        const ip = freshIp();
        const { nonce, cookie } = await issue(ip);
        const token = await idToken(nonce, { sub: "100" });
        const wrong = await callRoute("/social/kakao/native", { ip, userId: "ma", nonceCookie: cookie, body: { idToken: token, nonce, mode: "link", pin: "0000" } });
        expect(wrong.statusCode).toBe(401);
        expect(wrong.body.code).toBe("KAKAO_PIN_WRONG");
        expect(wrong.cleared).toEqual([]);
        expect(mem.state.profiles[0].kakaoSub).toBeNull();
        // PIN 이 없는 요청도 같은 답
        const none = await callRoute("/social/kakao/native", { ip, userId: "ma", nonceCookie: cookie, body: { idToken: token, nonce, mode: "link" } });
        expect(none.body.code).toBe("KAKAO_PIN_WRONG");
        const right = await callRoute("/social/kakao/native", { ip, userId: "ma", nonceCookie: cookie, body: { idToken: token, nonce, mode: "link", pin: PIN } });
        expect(right.statusCode).toBe(200);
        expect(mem.state.profiles[0].kakaoSub).toBe("100");
    });

    // 2026-10-06 검토: PIN 대조(DB · bcrypt)는 기다리는 일이다 — 자리 잡기가 그 뒤에 있을 때는 한꺼번에 온 요청이 전부 '안 잠김'으로 통과해 PIN 답을 받았다
    it("한꺼번에 몰려온 요청도 PIN 대조는 다섯 건까지만 받는다 — 묶음으로 PIN 을 맞혀 볼 수 없다", async () => {
        mem.state.members.push({ id: "m-burst", profileId: "pa", phone: "01000000001" });
        const ip = freshIp();
        const { nonce, cookie } = await issue(ip);
        const token = await idToken(nonce, { sub: "100" });
        // 서른 건을 한꺼번에 — 스물한 번째에 맞는 PIN 을 섞는다
        const pins = Array.from({ length: 30 }, (_, i) => (i === 20 ? PIN : String(1000 + i)));
        const burst = await Promise.all(pins.map((pin) => callRoute("/social/kakao/native", { ip, userId: "m-burst", nonceCookie: cookie, body: { idToken: token, nonce, mode: "link", pin } })));
        expect(burst.slice(0, 5).map((r) => r.body.code)).toEqual(Array(5).fill("KAKAO_PIN_WRONG"));
        // 나머지는 PIN 을 보지도 않았다 — 맞는 PIN 을 보낸 요청도 틀린 요청과 답이 같아 구분되지 않는다
        for (const r of burst.slice(5)) {
            expect(r.statusCode).toBe(429);
            expect(r.body).toEqual(burst[5].body);
        }
        // nonce 는 한 건도 쓰이지 않았고, 붙지도 않았다
        expect(burst.flatMap((r) => r.cleared)).toEqual([]);
        expect(mem.state.profiles[0].kakaoSub).toBeNull();
        // 다섯 번 틀렸으니 잠겼다 — 맞는 PIN 도 받지 않는다
        const locked = await callRoute("/social/kakao/native", { ip, userId: "m-burst", nonceCookie: cookie, body: { idToken: token, nonce, mode: "link", pin: PIN } });
        expect(locked.statusCode).toBe(429);
        expect(locked.cleared).toEqual([]);
        expect(mem.state.profiles[0].kakaoSub).toBeNull();
    });

    it("PIN 없는 계정·이미 다른 랭큐 계정에 있는 카카오 — 웹의 연결과 같은 답(409)", async () => {
        const ip = freshIp();
        const a = await issue(ip);
        const noPin = await callRoute("/social/kakao/native", { ip, userId: "mc", nonceCookie: a.cookie, body: { idToken: await idToken(a.nonce, { sub: "100" }), nonce: a.nonce, mode: "link", pin: PIN } });
        expect(noPin.statusCode).toBe(409);
        expect(noPin.body.code).toBe("KAKAO_PIN_REQUIRED");
        // PIN 확인에서 끊겼다 — nonce 는 그대로
        expect(noPin.cleared).toEqual([]);

        const b = await issue(ip);
        const taken = await callRoute("/social/kakao/native", { ip, userId: "ma", nonceCookie: b.cookie, body: { idToken: await idToken(b.nonce, { sub: "900" }), nonce: b.nonce, mode: "link", pin: PIN } });
        expect(taken.statusCode).toBe(409);
        expect(taken.body.code).toBe("KAKAO_TAKEN");
        expect(mem.state.profiles[0].kakaoSub).toBeNull();
        expect(mem.state.profiles[1].kakaoSub).toBe("900");
    });

    it("연결도 토큰을 검증한다 — 위조 토큰·남의 nonce 로는 붙지 않는다", async () => {
        const ip = freshIp();
        const a = await issue(ip);
        const forged = await callRoute("/social/kakao/native", { ip, userId: "ma", nonceCookie: a.cookie, body: { idToken: await idToken(a.nonce, { sub: "100" }, attackerKey), nonce: a.nonce, mode: "link", pin: PIN } });
        expect(forged.statusCode).toBe(401);
        expect(forged.body.code).toBe("KAKAO_TOKEN_INVALID");
        const other = await issue(freshIp());
        const noCookie = await callRoute("/social/kakao/native", { ip, userId: "ma", body: { idToken: await idToken(other.nonce, { sub: "100" }), nonce: other.nonce, mode: "link", pin: PIN } });
        expect(noCookie.body.code).toBe("KAKAO_NONCE_INVALID");
        expect(mem.state.profiles[0].kakaoSub).toBeNull();
    });
});

describe("라우트 규칙(server/routes/modules/auth.ts) — 순서와, 웹 카카오를 건드리지 않았다는 것", () => {
    const root = (p: string) => readFileSync(resolve(__dirname, "../..", p), "utf8");
    const auth = root("server/routes/modules/auth.ts");
    const nonceAt = auth.indexOf('router.post("/social/kakao/native/nonce",');
    const verifyAt = auth.indexOf('router.post("/social/kakao/native",');
    const nonceRoute = auth.slice(nonceAt, verifyAt);
    const verify = auth.slice(verifyAt, auth.indexOf("export default router;"));

    it("두 길은 파일 맨 끝에 있다 — 웹 카카오의 세 길(로그인·연결·해제)보다 뒤, 그 사이에 끼지 않는다", () => {
        expect(nonceAt).toBeGreaterThan(auth.indexOf('router.post("/reset-pin/verify"'));
        expect(verifyAt).toBeGreaterThan(nonceAt);
        expect(auth.slice(verifyAt).match(/\nrouter\.(post|get|delete|put|patch)\(/g)).toBeNull();
        // 웹의 길은 인가 코드를, 앱의 길은 ID 토큰을 본다 — 섞이지 않았다
        const web = auth.slice(auth.indexOf('router.post("/social/kakao",'), auth.indexOf('router.post("/register"'));
        expect(web).not.toMatch(/verifyKakaoIdToken|takeKakaoNonce|idToken/);
        expect(verify).not.toMatch(/exchangeKakaoCode|redirectUri/);
    });

    // 자리 잡기는 PIN 보다 앞이다(2026-10-06 검토) — 뒤에 있으면 한꺼번에 온 요청이 전부 PIN 대조를 받는다
    it("검증 길의 순서 — 스위치 → JSON·꼴 → (연결이면 로그인) → 시도 횟수 → 자리 잡기 → (연결이면 PIN) → nonce 를 쓰고 쿠키를 지운다 → 토큰 검증 → 계정", () => {
        const at = (s: string) => { const i = verify.indexOf(s); expect(i, s).toBeGreaterThan(0); return i; };
        const order = [
            at("if (!kakaoNativeConfigured()) return sendKakaoNativeFailure(res, \"not-configured\");"),
            at("if (!isJsonBody(req) || !looksLikeKakaoIdToken(idToken) || !isKakaoNonce(nonce))"),
            at("return sendError(res, 401, \"err.common.loginRequired\");"),
            at("checkRateLimit(key)"),
            at("takeAttemptSlot(key)"),
            at("sendKakaoPinFailure(res, key, await hiqService.checkKakaoPin(userId as string, pin))"),
            at("takeKakaoNonce(req.signedCookies?.[KAKAO_NONCE_COOKIE], nonce, Date.now())"),
            at("res.clearCookie(KAKAO_NONCE_COOKIE, kakaoNonceCookieOptions());"),
            at("verified = await verifyKakaoIdToken(idToken, nonce);"),
            at("hiqService.linkKakao(userId as string, verified.identity)"),
            at('hiqService.socialLogin("kakao", identity, undefined,'),
            at("isMemberSuspended(result.member.id)"),
            at("res.cookie('hiq_user_id'"),
        ];
        expect(order).toEqual([...order].sort((a, b) => a - b));
        // 잡은 자리는 성공·실패·예외 어느 쪽이든 놓는다
        const after = verify.slice(at("verified = await verifyKakaoIdToken(idToken, nonce);"));
        expect(after.indexOf("release();")).toBeGreaterThan(after.indexOf("} finally {"));
        // 토큰이 거절됐을 때만 실패로 센다
        expect(verify).toContain("if (kakaoIdTokenRejected(verified.reason)) registerFailure(key);");
        // nonce 는 서명 쿠키에서만 읽는다(서명 없는 쿠키는 보지 않는다)
        expect(verify).not.toMatch(/req\.cookies\b/);
        expect(nonceRoute).not.toMatch(/req\.cookies\b/);
    });

    it("로그인 쿠키 옵션은 /social 과 글자까지 같다 — 연결 갈래는 쿠키를 주지 않는다", () => {
        const cookieOf = (s: string) => s.slice(s.indexOf("res.cookie('hiq_user_id'"), s.indexOf("});", s.indexOf("res.cookie('hiq_user_id'")));
        const social = auth.slice(auth.indexOf('router.post("/social",'), auth.indexOf("// --- 카카오 로그인"));
        expect(cookieOf(verify)).toBe(cookieOf(social));
        expect(verify.match(/res\.cookie\('hiq_user_id'/g)).toHaveLength(1);
        const linkBranch = verify.slice(verify.indexOf("if (linking) {\n        clearAttempts(key);"), verify.indexOf("const identity = verified.identity.name"));
        expect(linkBranch).toContain("return sendSuccess(res, { linked: true });");
        expect(linkBranch).not.toContain("res.cookie(");
    });

    it("액세스 토큰은 받지도 저장하지도 않는다 — 두 길과 검증기 어디에도 없다. 응답·로그에 ID 토큰을 싣지 않는다", () => {
        const code = (s: string) => s.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
        for (const block of [code(nonceRoute), code(verify)]) {
            expect(block).not.toMatch(/access_?token|refresh_?token|client_?secret/i);
            expect(block).not.toMatch(/console\.(log|warn|error|info)\(/);
        }
        const lib = root("server/lib/kakaoAuth.ts");
        const nativeLib = code(lib.slice(lib.indexOf("const KAKAO_JWKS = ")));
        expect(nativeLib).not.toMatch(/access_?token|refresh_?token|client_?secret|fetch\(/i);
        // 저장소·DB 를 부르지 않는다(nonce 는 서명 쿠키 + 인스턴스 메모리)
        expect(nativeLib).not.toMatch(/storage\.|\bdb\./);
        // 알고리즘·발급자·받는 앱·필수 클레임을 못 박아 검증한다
        expect(nativeLib).toContain('algorithms: ["RS256"],');
        expect(nativeLib).toContain("issuer: KAKAO_ID_TOKEN_ISSUER,");
        expect(nativeLib).toContain('requiredClaims: ["sub", "exp", "nonce"],');
    });

    it("환경변수는 이름으로만 읽는다 — 값이 소스에 없다", () => {
        const lib = root("server/lib/kakaoAuth.ts");
        expect(lib).toContain("process.env.KAKAO_NATIVE_APP_KEY");
        expect(lib).toContain("process.env.KAKAO_LOGIN_REST_KEY");
        // 카카오 키는 32자 16진수다 — 실수로 붙여 넣은 값이 있으면 여기서 걸린다
        for (const f of ["server/lib/kakaoAuth.ts", "server/routes/modules/auth.ts", "shared/kakaoNative.ts"]) {
            expect(root(f), f).not.toMatch(/\b[0-9a-f]{32}\b/);
        }
        // 화면 번들에 실리는 계약 파일은 환경변수를 읽지 않는다
        expect(root("shared/kakaoNative.ts")).not.toMatch(/process\.env|import\.meta\.env/);
    });

    it("스키마는 바뀌지 않았다 — 새 표·새 열 없이 기존 profiles.kakao_sub 를 쓴다", () => {
        expect(root("shared/schema.ts")).not.toMatch(/kakao_nonce|kakaoNonce/i);
        expect(root("shared/schema.ts")).toContain('kakaoSub: text("kakao_sub").unique(),');
    });
});
