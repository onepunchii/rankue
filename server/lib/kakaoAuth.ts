/**
 * 카카오 로그인 — 인가 코드를 서버에서 신원으로 바꾼다.
 * (2026-10-05 오너: "카카오도 오픈 — 한국은 카카오·구글, 다른 나라는 구글·애플")
 *
 * 구글·애플(socialAuth.ts)은 화면이 받은 id_token 을 JWKS 로 검증하지만, 카카오는 화면이 **인가 코드**만 받아 온다.
 * 서버가 그 코드를 REST API 로 토큰과 바꾸고(client_secret 은 서버만 안다), 그 토큰으로 회원번호를 한 번 읽는다.
 *
 *  - 카카오 토큰은 **저장하지 않는다** — 회원번호를 읽는 데 한 번 쓰고 버린다. 응답·로그에도 싣지 않는다.
 *  - redirectUri 는 화면이 인가 때 쓴 값을 그대로 다시 보내야 한다(글자 하나라도 다르면 KOE006) — 허용 목록 검사가 유일한 방어다.
 *    운영 서버는 운영 원본만 받는다. 개발용 localhost 는 `npm run dev`(NODE_ENV=development, Vercel 밖)에서만 — kakaoLocalAllowed.
 *  - 카카오가 준 오류 본문(error·error_code·error_description)은 **서버 로그에만** 남기고, 부른 쪽에는 종류만 돌려준다.
 *    KOE320 = 인가 코드 만료·재사용, KOE006 = redirect 불일치, KOE010 = client_secret 불일치.
 *  - 키: KAKAO_LOGIN_REST_KEY · KAKAO_LOGIN_CLIENT_SECRET (없으면 not-configured — 기능이 꺼진다).
 *  - 새 패키지 없이 fetch 만 쓴다(서버리스 규칙).
 *
 * 앱 안(네이티브 SDK)의 길은 이 파일 아래쪽에 따로 있다(2026-10-06) — 화면이 **ID 토큰**을 들고 오고, 서버는 구글·애플처럼
 * 발급사 공개 키(JWKS)로 검증한다(이미 쓰는 jose — 새 패키지가 아니다). 계약은 shared/kakaoNative.ts.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { createRemoteJWKSet, decodeJwt, jwtVerify } from "jose";
import type { SocialIdentity } from "./socialAuth.js";
import {
    KAKAO_PREVIEW_COOKIE, KAKAO_PREVIEW_KEY_MAX, KAKAO_PREVIEW_KEY_MIN, KAKAO_PREVIEW_TTL_SEC,
    isAllowedKakaoRedirect, cleanKakaoNickname,
} from "../../shared/kakaoLogin.js";
import {
    KAKAO_ID_TOKEN_ISSUER, KAKAO_JWKS_URL, KAKAO_NONCE_TTL_SEC, isKakaoNonce, looksLikeKakaoIdToken,
} from "../../shared/kakaoNative.js";

const TOKEN_URL = "https://kauth.kakao.com/oauth/token";
const USER_URL = "https://kapi.kakao.com/v2/user/me";
const FORM_TYPE = "application/x-www-form-urlencoded;charset=utf-8";

/**
 * 카카오에 쓰는 시간의 상한 — 토큰 요청과 사용자 조회 **둘을 합쳐서** 6초다(2026-10-05 검토).
 * 예전에는 호출마다 6초라 카카오가 느린 날 12초 가까이 갈 수 있었고, 뒤에 DB 왕복이 붙으면 서버리스 함수 제한에 걸려
 * 플랫폼이 낸 오류 원문이 화면에 나왔다(이 저장소는 그 제한을 10초로 보고 다른 곳도 6~7초만 쓴다 — services/naverLocal).
 * 두 번째 호출은 남은 시간만 쓰고, 남은 시간이 거의 없으면 부르지 않고 timeout 으로 끝낸다.
 */
export const KAKAO_TIMEOUT_MS = 6000;
/** 남은 시간이 이보다 적으면 사용자 조회를 시작하지 않는다 — 어차피 못 끝낸다. */
const KAKAO_MIN_CALL_MS = 250;
/** 인가 코드는 80자 남짓이다. 터무니없이 긴 값은 카카오에 보내지도 않는다. */
const CODE_MAX = 512;

export type KakaoFailReason =
    | "not-configured"   // 서버에 키가 없다
    | "bad-redirect"     // 허용 목록 밖의 redirectUri
    | "bad-code"         // code 가 없거나 꼴이 이상하다
    | "token-failed"     // 카카오가 토큰을 주지 않았다(코드 만료·재사용, redirect·secret 불일치 …)
    | "user-failed"      // 토큰은 받았는데 회원번호를 읽지 못했다
    | "timeout"          // 카카오가 6초 안에 답하지 않았다
    | "network"          // 카카오에 닿지 못했다
    | "upstream";        // 카카오가 5xx 로 답했다(카카오 쪽 장애)

/**
 * 보낸 쪽 잘못으로 볼 실패인가 — 라우트가 시도 횟수 제한(registerFailure)에 셀지 정할 때 쓴다.
 * 카카오가 느리거나 죽은 것(timeout·network·upstream)까지 세면 카카오 장애 때 멀쩡한 사람들이 15분씩 잠긴다.
 */
export function kakaoRejected(reason: KakaoFailReason): boolean {
    return reason === "token-failed" || reason === "user-failed";
}

export type KakaoExchange =
    | { ok: true; identity: SocialIdentity }
    | { ok: false; reason: KakaoFailReason };

function readKeys(): { restKey: string; secret: string } | null {
    const restKey = (process.env.KAKAO_LOGIN_REST_KEY ?? "").trim();
    const secret = (process.env.KAKAO_LOGIN_CLIENT_SECRET ?? "").trim();
    return restKey && secret ? { restKey, secret } : null;
}

/**
 * 카카오 로그인을 **열었는가**(2026-10-06 오너 결정: "앱 빌드해서 승인받고 그때 카카오 오픈") — 키와 별개의 스위치.
 * 지금 스토어 앱(1.2)은 웹뷰가 카카오로 못 넘어가서 앱 안에서는 카카오 로그인이 안 된다. 웹에만 먼저 열면 카카오로 가입한 사람이
 * 앱에서 자기 계정에 들어갈 길이 없다 — 그래서 앱 안 카카오 로그인이 들어간 새 빌드가 승인되는 날 웹·앱을 같이 연다.
 * 여는 법: Vercel 운영 환경에 KAKAO_LOGIN_OPEN=1 과 VITE_KAKAO_LOGIN_OPEN=1(화면 빌드용) 을 넣고 다시 배포한다. 키는 이미 들어 있다.
 * 앱 안 로그인(네이티브 SDK — 이 파일 아래쪽)까지 같이 열리려면 그 전에 KAKAO_NATIVE_APP_KEY(카카오 콘솔의 네이티브 앱 키,
 * 여럿이면 쉼표로)도 **운영(Production) 환경에** 넣어 둔다 — 없으면 앱 안 길은 503 으로 닫힌 채다(아래 kakaoNativeConfigured).
 */
export function kakaoOpen(): boolean {
    return (process.env.KAKAO_LOGIN_OPEN ?? "").trim() === "1";
}

// ─────────────────────────────────────────────────────────────────────────────
// 미리보기(2026-10-06) — 공개 스위치(위 kakaoOpen)는 꺼 둔 채, **열쇠를 넣은 기기**에서만 카카오 로그인을 연다.
// 1.3 을 Play 내부 테스트에 올렸는데 스위치가 꺼져 있어 실기기에서 카카오 로그인을 시험할 길이 없었다. 스위치를 켜면 모든 사용자에게
// 열린다(웹에도, 1.2 앱의 안내 문구에도) — 그래서 스위치와 무관한 길을 따로 둔다. 계약(주소·쿠키 이름·깃발)은 shared/kakaoLogin.ts.
//
//  - 열쇠: 환경변수 KAKAO_PREVIEW_KEY(16자 이상). **없거나 짧으면 미리보기는 없는 기능이다** — 아래 함수가 전부 false·null 을 주고
//    라우트는 없는 주소처럼 흘려보낸다(404). 값은 어디에도 적지 않는다: 로그에도 응답에도 쿠키에도 없다.
//  - 쿠키 hiq_kakao_preview(서명 쿠키 · 30일): `v1.<발급 시각 ms>.<꼬리표>`. 꼬리표는 **지금 열쇠**로 만든 HMAC 의 앞 32자다 —
//    열쇠를 바꾸면 옛 쿠키가 전부 죽고, 열쇠를 지우면 미리보기 전체가 꺼진다. 서명(cookie-parser)이 있어 화면이 값을 지어낼 수 없고,
//    꼬리표에서 열쇠를 되찾을 수도 없다. 수명은 브라우저의 쿠키 만료와 별개로 발급 시각으로도 본다.
//  - 판정은 kakaoOpenFor(req) **하나**다: 공개 스위치가 켜졌거나, 이 요청이 유효한 미리보기 쿠키를 들고 왔다.
//    kakaoConfigured · kakaoNativeConfigured 가 이 판정을 쓰고, 라우트는 요청(req)을 넘긴다. 요청 없이 부르면 공개 스위치만 본다.
// ─────────────────────────────────────────────────────────────────────────────

/** 미리보기 열쇠 — 서버에 없거나 길이가 맞지 않으면 null(= 미리보기 없음). 값을 이 함수 밖으로 내보내지 않는다. */
function previewKey(): string | null {
    const key = (process.env.KAKAO_PREVIEW_KEY ?? "").trim();
    return key.length >= KAKAO_PREVIEW_KEY_MIN && key.length <= KAKAO_PREVIEW_KEY_MAX ? key : null;
}

/** 미리보기가 있는 서버인가 — 열쇠가 설정돼 있다. 아니면 미리보기 길은 없는 주소다. */
export function kakaoPreviewEnabled(): boolean {
    return previewKey() !== null;
}

/** 쿠키에 적는 꼬리표 — 열쇠로 만든 HMAC 의 앞 32자(192비트). 열쇠가 바뀌면 달라진다. */
function previewTag(key: string): string {
    return createHmac("sha256", key).update("rankue:kakao-preview:v1").digest("base64url").slice(0, 32);
}

// 열쇠 대조에 쓰는 소금 — 인스턴스마다 다르다. 두 값을 같은 길이의 요약으로 바꿔 견주면 길이도 내용도 시간 차로 새지 않는다.
const PREVIEW_COMPARE_SALT = randomBytes(32);

/** 보낸 값이 미리보기 열쇠와 같은가(시간 일정 비교). 열쇠가 없는 서버에서는 무엇을 보내도 false. */
export function kakaoPreviewKeyMatches(input: unknown): boolean {
    const key = previewKey();
    if (!key || typeof input !== "string" || input.length < KAKAO_PREVIEW_KEY_MIN || input.length > KAKAO_PREVIEW_KEY_MAX) return false;
    const digest = (s: string) => createHmac("sha256", PREVIEW_COMPARE_SALT).update(s, "utf8").digest();
    return timingSafeEqual(digest(input), digest(key));
}

/** 미리보기 쿠키에 적을 값 — `v1.<발급 시각 ms>.<꼬리표>`. 열쇠가 없는 서버에서는 null(쿠키를 굽지 않는다). 서명은 cookie-parser 가 한다. */
export function packKakaoPreview(nowMs: number): string | null {
    const key = previewKey();
    return key ? `v1.${Math.floor(nowMs)}.${previewTag(key)}` : null;
}

/**
 * 미리보기 쿠키가 유효한가. cookieValue 는 **서명 검증을 통과한** 값(req.signedCookies)이어야 한다 — 서명이 깨진 쿠키는 false 로 온다.
 * 지금도 열쇠가 설정돼 있고 · 꼴이 맞고 · 30일 안이고 · 꼬리표가 지금 열쇠의 것일 때만 참이다.
 */
export function kakaoPreviewValid(cookieValue: unknown, nowMs: number): boolean {
    const key = previewKey();
    if (!key || typeof cookieValue !== "string") return false;
    const hit = /^v1\.(\d{1,16})\.([A-Za-z0-9_-]{32})$/.exec(cookieValue);
    if (!hit) return false;
    const age = nowMs - Number(hit[1]);
    if (!(age >= -60_000 && age <= KAKAO_PREVIEW_TTL_SEC * 1000)) return false;
    return sameText(hit[2], previewTag(key));
}

/** 판정에 쓰는 요청의 모양 — 서명 검증을 통과한 쿠키만 본다(서명 없는 req.cookies 는 보지 않는다). */
export type KakaoGateRequest = { signedCookies?: Record<string, unknown> | null };

/**
 * **이 요청에** 카카오가 열려 있는가 — 공개 스위치가 켜졌거나, 이 요청이 유효한 미리보기 쿠키를 들고 왔다.
 * 요청 없이 부르면 공개 스위치만 본다(닫힌 쪽이 기본). 열쇠가 없는 서버에서는 kakaoOpen() 과 늘 같은 값이다.
 */
export function kakaoOpenFor(req?: KakaoGateRequest | null): boolean {
    return kakaoOpen() || kakaoPreviewValid(req?.signedCookies?.[KAKAO_PREVIEW_COOKIE], Date.now());
}

/**
 * 카카오 로그인을 받을 수 있는가 — 이 요청에 열려 있고(kakaoOpenFor) 서버에 키가 둘 다 있다. 아니면 두 API 는 503 을 준다.
 * 라우트는 요청을 넘긴다(미리보기 쿠키를 보려면 필요하다). 요청 없이 부르면 공개 스위치만 본다.
 */
export function kakaoConfigured(req?: KakaoGateRequest | null): boolean {
    return kakaoOpenFor(req) && readKeys() !== null;
}

/**
 * 개발용 localhost Redirect URI 를 받아도 되는 서버인가 — **개발일 때만** 참이다(닫힌 쪽이 기본).
 * "운영이면 거절"로 쓰면 NODE_ENV·VERCEL 이 둘 다 없는 환경에서 열린 채 남는다. `npm run dev` 는 NODE_ENV=development 를 명시한다.
 */
export function kakaoLocalAllowed(): boolean {
    return process.env.NODE_ENV === "development" && !process.env.VERCEL;
}

/** 이 서버가 받아 줄 Redirect URI 인가 — 라우트와 교환이 모두 이 함수 하나로 본다(shared 의 규칙 + 위의 개발 판단). */
export function kakaoRedirectAllowed(uri: unknown): boolean {
    return isAllowedKakaoRedirect(uri, kakaoLocalAllowed());
}

/** 로그에 남길 글자 — 비밀 값·코드·토큰이 섞여 있으면 가리고 200자로 자른다(KOE320 설명에는 code 가 그대로 실려 온다). */
function scrub(v: unknown, hide: readonly string[]): string | null {
    if (typeof v !== "string" && typeof v !== "number") return null;
    let s = String(v);
    for (const h of hide) if (h) s = s.split(h).join("[가림]");
    return s.slice(0, 200);
}

type Called = { status: number; body: any } | "timeout" | "network";

/** 시간 제한(timeoutMs)을 건 JSON 호출. 본문을 다 읽을 때까지가 제한 시간 안이다. JSON 이 아니면 body 는 null. */
async function callJson(url: string, init: RequestInit, timeoutMs: number): Promise<Called> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const res = await fetch(url, { ...init, signal: ctrl.signal });
        const text = await res.text();
        let body: any = null;
        try { body = text ? JSON.parse(text) : null; } catch { body = null; }
        return { status: res.status, body };
    } catch {
        return ctrl.signal.aborted ? "timeout" : "network";
    } finally {
        clearTimeout(timer);
    }
}

/** 카카오 회원번호 — 숫자로 온다. 정밀도를 잃을 만큼 큰 수는 받지 않는다(다른 사람과 같은 번호로 뭉개지면 계정이 섞인다). */
function kakaoId(raw: unknown): string | null {
    if (typeof raw === "number") return Number.isSafeInteger(raw) && raw > 0 ? String(raw) : null;
    if (typeof raw === "string") return /^[1-9]\d{0,19}$/.test(raw) ? raw : null;
    return null;
}

/**
 * 인가 코드 → 신원({ sub: 회원번호, name: 닉네임 | null }).
 * redirectUri 는 화면이 인가 때 쓴 값 그대로. 허용 목록 밖이면 카카오를 부르지도 않는다.
 */
export async function exchangeKakaoCode(code: unknown, redirectUri: unknown): Promise<KakaoExchange> {
    const keys = readKeys();
    if (!keys) {
        console.warn("[kakao] KAKAO_LOGIN_REST_KEY·KAKAO_LOGIN_CLIENT_SECRET 미설정 — 카카오 로그인 불가");
        return { ok: false, reason: "not-configured" };
    }
    if (typeof redirectUri !== "string" || !kakaoRedirectAllowed(redirectUri)) return { ok: false, reason: "bad-redirect" };
    if (typeof code !== "string" || !code || code.length > CODE_MAX) return { ok: false, reason: "bad-code" };

    // 로그에서 가릴 값 — 아래 어디에서도 이 값들을 그대로 찍지 않는다
    const hide = [code, keys.secret, keys.restKey];
    // 두 호출이 나눠 쓰는 마감 시각(합쳐서 KAKAO_TIMEOUT_MS)
    const deadline = Date.now() + KAKAO_TIMEOUT_MS;

    // 1) 코드 → 토큰
    const form = new URLSearchParams({
        grant_type: "authorization_code",
        client_id: keys.restKey,
        client_secret: keys.secret,
        redirect_uri: redirectUri,
        code,
    });
    const token = await callJson(TOKEN_URL, { method: "POST", headers: { "Content-Type": FORM_TYPE }, body: form.toString() }, KAKAO_TIMEOUT_MS);
    if (typeof token === "string") {
        console.warn(`[kakao] 토큰 요청 ${token === "timeout" ? "시간 초과" : "연결 실패"}`);
        return { ok: false, reason: token };
    }
    const accessToken: unknown = token.body?.access_token;
    if (token.status !== 200 || typeof accessToken !== "string" || !accessToken) {
        console.warn("[kakao] 토큰 교환 실패:", JSON.stringify({
            status: token.status,
            error: scrub(token.body?.error, hide),
            error_code: scrub(token.body?.error_code, hide),
            error_description: scrub(token.body?.error_description, hide),
            redirect_uri: redirectUri, // 비밀이 아니다(허용 목록을 통과한 우리 주소) — KOE006 진단용
        }));
        return { ok: false, reason: token.status >= 500 ? "upstream" : "token-failed" };
    }

    // 2) 토큰 → 회원번호·닉네임. 토큰은 이 호출에만 쓰고 버린다. 토큰 요청이 쓰고 남은 시간만 쓴다.
    const left = deadline - Date.now();
    if (left < KAKAO_MIN_CALL_MS) {
        console.warn("[kakao] 사용자 조회 시간 초과(토큰 요청이 시간을 다 썼다)");
        return { ok: false, reason: "timeout" };
    }
    const me = await callJson(USER_URL, { method: "GET", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": FORM_TYPE } }, Math.min(KAKAO_TIMEOUT_MS, left));
    if (typeof me === "string") {
        console.warn(`[kakao] 사용자 조회 ${me === "timeout" ? "시간 초과" : "연결 실패"}`);
        return { ok: false, reason: me };
    }
    const sub = me.status === 200 ? kakaoId(me.body?.id) : null;
    if (!sub) {
        const hideMore = [...hide, accessToken];
        console.warn("[kakao] 사용자 조회 실패:", JSON.stringify({
            status: me.status,
            code: scrub(me.body?.code, hideMore),
            msg: scrub(me.body?.msg, hideMore),
            hasId: me.body?.id !== undefined && me.body?.id !== null,
        }));
        return { ok: false, reason: me.status >= 500 ? "upstream" : "user-failed" };
    }

    // 닉네임은 동의 항목이다 — 동의하지 않았으면 없다(null). 이메일은 받지 않는다.
    const name = cleanKakaoNickname(me.body?.kakao_account?.profile?.nickname) ?? cleanKakaoNickname(me.body?.properties?.nickname);
    return { ok: true, identity: { sub, email: null, name } };
}

// ─────────────────────────────────────────────────────────────────────────────
// 앱 안 카카오 로그인(네이티브 SDK) — ID 토큰(OIDC) 검증과 1회용 nonce (2026-10-06)
// 오너: "카카오 로그인이 되는 앱 빌드를 만들어 구글·애플에 올리고, 승인되면 카카오를 연다". 계약은 shared/kakaoNative.ts.
//
//  - 앱의 플러그인(RankueKakao)이 카카오 SDK 로 받은 **ID 토큰**을 화면이 서버에 넘긴다. 서버는 그 토큰을 믿지 않고
//    카카오 공개 키(JWKS)로 서명을 보고, 발급자(iss) · 받는 앱(aud — 허용 목록) · 만료(exp) · nonce 를 검사한다.
//  - 액세스 토큰은 **받지도 저장하지도 않는다.** ID 토큰도 검증에 한 번 쓰고 버린다(응답·로그에 싣지 않는다).
//  - aud 허용 목록: KAKAO_NATIVE_APP_KEY(쉼표로 여럿 — 콘솔의 네이티브 앱 키) + 기존 KAKAO_LOGIN_REST_KEY.
//    네이티브 SDK 가 발급한 토큰의 aud 는 네이티브 앱 키다(카카오 문서: SDK 초기화에 쓴 앱 키). REST 키를 같이 두는 것은
//    실제 토큰으로 확인하기 전의 안전망이다 — REST 키로 토큰을 받으려면 서버만 아는 client_secret 이 있어야 해서 넓어지는 것이 없다.
//  - nonce: 서버가 난수를 내주면서 같은 값을 **서명 쿠키**에 넣는다(DB 없음). 검증할 때 본문의 nonce · 쿠키의 nonce · 토큰의
//    nonce 클레임 셋이 같아야 한다. 쿠키가 있는 그 브라우저(앱의 웹뷰)에서만 쓸 수 있어, 어디선가 얻은 남의 ID 토큰을
//    다른 기기에서 다시 보내는 것(재생)도, 남의 브라우저에 내 토큰을 밀어 넣는 것(로그인 CSRF)도 막힌다.
//    만료는 쿠키 값에 적은 발급 시각으로 본다(10분). 한 번 검사하면 라우트가 쿠키를 지우고, 같은 값이 같은 인스턴스에 다시 오면
//    여기서도 거절한다(아래 usedNonces — 메모리라 인스턴스 안에서만 통하는 최선 노력이다. 인스턴스를 넘는 1회 보장이 필요해지면
//    '앱에서 열기'(storage/loginHandoff.repo)처럼 해시를 적는 표가 있어야 한다 — 지금은 쿠키 묶음이 주된 방어다).
// ─────────────────────────────────────────────────────────────────────────────

/** 카카오 공개 키 목록. jose 가 인스턴스 안에 캐시한다(카카오 문서: 자주 받으면 차단될 수 있다) — 모르는 kid 가 오면 30초에 한 번까지만 다시 받는다. */
const KAKAO_JWKS = createRemoteJWKSet(new URL(KAKAO_JWKS_URL), { timeoutDuration: 4000, cacheMaxAge: 60 * 60 * 1000 });

/** 네이티브 ID 토큰의 aud 로 받아 줄 앱 키들 — 값은 환경변수에만 있다(로그에도 개수만 남긴다). */
export function kakaoNativeAudiences(): string[] {
    const native = (process.env.KAKAO_NATIVE_APP_KEY ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    const rest = (process.env.KAKAO_LOGIN_REST_KEY ?? "").trim();
    return Array.from(new Set(rest ? [...native, rest] : native));
}

/**
 * 앱 안 카카오 로그인을 받을 수 있는가 — 여는 스위치(kakaoOpen)가 켜져 있고 **네이티브 앱 키**(KAKAO_NATIVE_APP_KEY)가 하나 이상 있다.
 * 아니면 두 API 는 503. REST 키만으로는 열지 않는다(2026-10-06 검토): 앱이 받는 토큰의 aud 는 네이티브 앱 키라, 그 키 없이 열면
 * nonce 는 나가는데 토큰은 전부 401 로 떨어지고 실패로 세어져 같은 IP 의 웹 카카오까지 15분 잠겼다. 닫혀 있으면 nonce 단계에서 끝난다.
 * 스위치는 웹과 같은 판정(kakaoOpenFor)이다 — 미리보기 쿠키를 든 요청에도 열린다. 라우트는 요청을 넘긴다.
 */
export function kakaoNativeConfigured(req?: KakaoGateRequest | null): boolean {
    return kakaoOpenFor(req) && (process.env.KAKAO_NATIVE_APP_KEY ?? "").split(",").some((s) => s.trim() !== "");
}

/** 새 nonce — 난수 32바이트(base64url 43자). 추측할 수 없다. */
export function newKakaoNonce(): string {
    return randomBytes(32).toString("base64url");
}

/** 쿠키에 적는 값: `<nonce>.<발급 시각 ms>`. 서명은 cookie-parser(signed)가 한다 — 화면이 고칠 수 없다. */
export function packKakaoNonce(nonce: string, nowMs: number): string {
    return `${nonce}.${Math.floor(nowMs)}`;
}

/** 글자 둘이 같은가 — 길이가 같을 때만 시간 차 없이 견준다. */
function sameText(a: string, b: string): boolean {
    const x = Buffer.from(a, "utf8");
    const y = Buffer.from(b, "utf8");
    return x.length === y.length && timingSafeEqual(x, y);
}

// 이 인스턴스에서 이미 쓴 nonce → 그 nonce 가 만료되는 시각(ms). 만료된 것은 볼 때마다 치운다.
const usedNonces = new Map<string, number>();
/** 기억해 두는 수의 상한 — 넘으면 가장 오래된 것부터 버린다(쿠키가 먼저 지워지므로 여기까지 오는 것은 거의 없다). */
const USED_NONCE_MAX = 5000;

export type KakaoNonceCheck =
    | "ok"
    | "missing"    // 쿠키가 없다(다른 기기·다른 브라우저 · 이미 한 번 써서 지워졌다 · 서명이 깨졌다)
    | "mismatch"   // 쿠키의 nonce 와 보낸 nonce 가 다르다
    | "expired"    // 내준 지 10분이 지났다(시계가 뒤로 간 경우도)
    | "reused";    // 같은 nonce 가 이 인스턴스에 다시 왔다

/**
 * 보낸 nonce 가 **이 브라우저에 내준 그 값**인지 보고, 맞으면 '썼음'으로 적는다(한 번만 ok 가 나온다).
 * cookieValue 는 서명 검증을 통과한 쿠키 값(req.signedCookies)이어야 한다. 결과와 무관하게 쿠키를 지우는 것은 라우트 몫이다.
 */
export function takeKakaoNonce(cookieValue: unknown, nonce: unknown, nowMs: number): KakaoNonceCheck {
    if (typeof cookieValue !== "string" || !cookieValue) return "missing";
    const dot = cookieValue.lastIndexOf(".");
    const issued = dot > 0 ? cookieValue.slice(0, dot) : "";
    const stamp = dot > 0 ? cookieValue.slice(dot + 1) : "";
    // 발급 시각은 숫자 글자만(빈 글자를 0 으로 읽지 않는다) — packKakaoNonce 가 만든 꼴이 아니면 없는 쿠키로 친다
    if (!isKakaoNonce(issued) || !/^\d{1,16}$/.test(stamp)) return "missing";
    const at = Number(stamp);
    if (!isKakaoNonce(nonce) || !sameText(issued, nonce)) return "mismatch";
    const age = nowMs - at;
    if (!(age >= -60_000 && age <= KAKAO_NONCE_TTL_SEC * 1000)) return "expired";

    for (const [key, until] of usedNonces) if (until <= nowMs) usedNonces.delete(key);
    if (usedNonces.has(issued)) return "reused";
    if (usedNonces.size >= USED_NONCE_MAX) {
        const oldest = usedNonces.keys().next().value;
        if (oldest !== undefined) usedNonces.delete(oldest);
    }
    usedNonces.set(issued, at + KAKAO_NONCE_TTL_SEC * 1000);
    return "ok";
}

export type KakaoIdTokenFailReason =
    | "not-configured"   // aud 허용 목록이 비어 있다(키 미설정)
    | "bad-token"        // idToken·nonce 의 꼴이 틀렸다 — 검증기에 넣지도 않았다
    | "token-invalid"    // 서명·발급자·받는 앱·만료·nonce·회원번호 가운데 하나가 틀렸다
    | "unreachable";     // 카카오 공개 키를 받지 못했다(느림·장애) — 보낸 사람 잘못이 아니다

export type KakaoIdTokenResult =
    | { ok: true; identity: SocialIdentity }
    | { ok: false; reason: KakaoIdTokenFailReason };

/** 보낸 쪽 잘못으로 볼 실패인가 — 라우트가 시도 횟수 제한에 셀지 정한다(카카오가 느린 것까지 세면 장애 때 멀쩡한 사람이 잠긴다). */
export function kakaoIdTokenRejected(reason: KakaoIdTokenFailReason): boolean {
    return reason === "token-invalid";
}

// jose 가 '토큰이 틀렸다'고 던지는 오류의 code 들. 여기에 없는 오류(공개 키 요청의 시간 초과·200 아님·연결 실패)는 카카오 쪽 사정으로 본다.
const TOKEN_FAULT_CODES = new Set([
    "ERR_JWT_CLAIM_VALIDATION_FAILED", "ERR_JWT_EXPIRED", "ERR_JWT_INVALID", "ERR_JWS_INVALID",
    "ERR_JWS_SIGNATURE_VERIFICATION_FAILED", "ERR_JOSE_ALG_NOT_ALLOWED", "ERR_JOSE_NOT_SUPPORTED",
    "ERR_JWKS_NO_MATCHING_KEY", "ERR_JWKS_MULTIPLE_MATCHING_KEYS",
]);

/**
 * 검증 실패를 서버 로그에 남긴다 — 서명 검증 없이 클레임만 읽어 어디가 틀렸는지(발급자·받는 앱·만료) 보이게.
 * 토큰 원문·nonce·회원번호·닉네임은 남기지 않는다. aud 는 앱 키(비밀이 아니다 — 앱 바이너리에 들어 있다)라 진단용으로 남긴다.
 */
function logIdTokenFailure(idToken: string, why: string, allowed: number) {
    let claims: Record<string, unknown>;
    try {
        const p = decodeJwt(idToken);
        claims = { iss: p.iss, aud: p.aud, expInSec: typeof p.exp === "number" ? p.exp - Math.floor(Date.now() / 1000) : null, hasNonce: typeof p.nonce === "string" };
    } catch {
        claims = { decode: "failed" };
    }
    console.warn("[kakao] ID 토큰 검증 실패:", why.slice(0, 200), "| claims:", JSON.stringify(claims), "| allowed aud:", allowed);
}

/**
 * 앱이 보낸 카카오 ID 토큰 → 신원({ sub: 회원번호, name: 닉네임 | null }). 웹의 exchangeKakaoCode 와 **같은 꼴의 sub** 를 돌려준다
 * (숫자 글자) — 그래야 웹에서 가입·연결한 계정(profiles.kakao_sub)과 같은 사람으로 잡힌다.
 *
 * nonce 는 **이미 쿠키와 견준**(takeKakaoNonce) 값이어야 한다 — 여기서는 토큰의 nonce 클레임이 그 값과 같은지만 본다.
 */
export async function verifyKakaoIdToken(idToken: unknown, nonce: unknown): Promise<KakaoIdTokenResult> {
    const audience = kakaoNativeAudiences();
    if (audience.length === 0) {
        console.warn("[kakao] KAKAO_NATIVE_APP_KEY·KAKAO_LOGIN_REST_KEY 미설정 — 앱 안 카카오 로그인 불가");
        return { ok: false, reason: "not-configured" };
    }
    if (!looksLikeKakaoIdToken(idToken) || !isKakaoNonce(nonce)) return { ok: false, reason: "bad-token" };

    let payload: Awaited<ReturnType<typeof jwtVerify>>["payload"];
    try {
        // 카카오 ID 토큰은 RS256 이다 — 알고리즘을 못 박는다. sub·exp·nonce 가 없는 토큰은 받지 않는다.
        ({ payload } = await jwtVerify(idToken, KAKAO_JWKS, {
            issuer: KAKAO_ID_TOKEN_ISSUER,
            audience,
            algorithms: ["RS256"],
            requiredClaims: ["sub", "exp", "nonce"],
        }));
    } catch (err) {
        const code = (err as { code?: unknown } | null)?.code;
        const message = err instanceof Error ? err.message : String(err);
        if (typeof code === "string" && TOKEN_FAULT_CODES.has(code)) {
            logIdTokenFailure(idToken, message, audience.length);
            return { ok: false, reason: "token-invalid" };
        }
        console.warn("[kakao] 공개 키를 받지 못했다:", message.slice(0, 200));
        return { ok: false, reason: "unreachable" };
    }

    // 받는 앱이 여럿 적힌 토큰은 받지 않는다(카카오는 앱 키 하나를 글자로 준다)
    if (typeof payload.aud !== "string") {
        logIdTokenFailure(idToken, "aud 가 글자 하나가 아니다", audience.length);
        return { ok: false, reason: "token-invalid" };
    }
    // 이 로그인을 위해 내준 nonce 로 받은 토큰인가 — 다른 로그인에서 받은 토큰을 가져다 쓰지 못하게
    if (typeof payload.nonce !== "string" || !sameText(payload.nonce, nonce)) {
        logIdTokenFailure(idToken, "nonce 가 다르다", audience.length);
        return { ok: false, reason: "token-invalid" };
    }
    const sub = kakaoId(payload.sub);
    if (!sub) {
        logIdTokenFailure(idToken, "sub 가 회원번호 꼴이 아니다", audience.length);
        return { ok: false, reason: "token-invalid" };
    }

    // 닉네임은 동의 항목이다 — 동의하지 않았으면 클레임이 없다(null). 이메일·프로필 사진은 읽지 않는다.
    return { ok: true, identity: { sub, email: null, name: cleanKakaoNickname(payload.nickname) } };
}
