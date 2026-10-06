import { Router } from "express";
import { hiqService } from "../../services/hiqService.js";
import { insertHiqMemberSchema } from "../../../shared/schema.js";
import { sendSuccess, sendError } from "../../utils/response.js";
import { storage } from "../../storage/index.js";
import { requireAuth, AuthRequest } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { msg } from "../../lib/i18n.js";
import { verifyGoogleIdToken, verifyAppleIdToken } from "../../lib/socialAuth.js";
import { exchangeKakaoCode, kakaoConfigured, kakaoRedirectAllowed, kakaoRejected, type KakaoFailReason } from "../../lib/kakaoAuth.js";
import {
    kakaoIdTokenRejected, kakaoNativeConfigured, newKakaoNonce, packKakaoNonce, takeKakaoNonce, verifyKakaoIdToken,
    type KakaoIdTokenFailReason,
} from "../../lib/kakaoAuth.js";
import { kakaoOpenFor, kakaoPreviewEnabled, kakaoPreviewKeyMatches, packKakaoPreview } from "../../lib/kakaoAuth.js";
import { KAKAO_PREVIEW_COOKIE, KAKAO_PREVIEW_TTL_SEC, type KakaoStatus } from "../../../shared/kakaoLogin.js";
import {
    KAKAO_NONCE_COOKIE, KAKAO_NONCE_COOKIE_PATH, KAKAO_NONCE_TTL_SEC, isKakaoNonce, looksLikeKakaoIdToken, type KakaoNonceIssue,
} from "../../../shared/kakaoNative.js";
import { isLoginPhone } from "../../../shared/loginPhone.js";
import { recordTermsAcceptance, isMemberSuspended, SUSPENDED_TEXT } from "../../middleware/terms.js";
import { isTermsAccepted, ACCOUNT_SUSPENDED_CODE } from "../../../shared/terms.js";
import { screenMemberProfile } from "../../utils/crewModeration.js";

const router = Router();

/**
 * 접속 국가(ISO alpha-2). Vercel 이 붙여 주는 IP 헤더 하나가 유일한 출처다 — 유저에게 묻지 않는다.
 * 국가 랭킹과 대전 헤더의 국기가 이 값을 쓴다.
 *
 * 2026-09-17 실측: 이 수집이 **소셜(구글·애플) 가입 경로에만** 있어서 전화번호로 가입한 41명이 전부 비어 있었다
 * (소셜 36명 중 35명은 잡혀 있었다). 그래서 헤더 읽기를 한 곳으로 모으고, 전화 가입·로그인에서도 채운다.
 */
function ipCountry(req: { headers: Record<string, unknown> }): string | undefined {
    const raw = req.headers["x-vercel-ip-country"];
    if (typeof raw !== "string") return undefined;
    const cc = raw.toUpperCase().slice(0, 2);
    return /^[A-Z]{2}$/.test(cc) ? cc : undefined;
}

/**
 * 국가가 비어 있으면 이번 접속 국가로 한 번 채운다. **이미 있으면 절대 덮지 않는다** —
 * 여행이나 VPN 으로 접속할 때마다 국적이 바뀌면 안 된다. 조건부 UPDATE 한 문장이라 실패해도 로그인은 살린다.
 */
async function fillCountry(profileId: string | null | undefined, req: { headers: Record<string, unknown> }): Promise<void> {
    const cc = ipCountry(req);
    if (!profileId || !cc) return;
    try { await storage.users.fillProfileCountryIfEmpty(profileId, cc); } catch { /* 로그인을 막지 않는다 */ }
}

// --- Lightweight in-memory brute-force protection (dependency-free) ---
// Keyed by action + phone + ip. Counts failed credential attempts inside a rolling
// window and locks the key out once the threshold is crossed; a successful auth
// clears the key. This is best-effort per-instance protection (a shared store would
// be needed across multiple nodes), but it closes the trivial unlimited-guess hole
// against 4-digit PIN login and low-entropy security-answer PIN reset.
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;   // rolling window for counting failures
const LOCKOUT_MS = 15 * 60 * 1000;  // lock duration once threshold is crossed

type AttemptEntry = { count: number; first: number; lockedUntil: number };
const attemptStore = new Map<string, AttemptEntry>();

// 파트너 로그인(partner.ts)도 같은 4자리 PIN을 쓰므로 이 방어를 공유한다 — export.
export function attemptKey(action: string, phone: unknown, ip: unknown): string {
    return `${action}:${phone || 'nophone'}:${ip || 'noip'}`;
}

export function checkRateLimit(key: string): { limited: boolean; retryAfterSec: number } {
    const now = Date.now();
    const entry = attemptStore.get(key);
    if (!entry) return { limited: false, retryAfterSec: 0 };
    if (entry.lockedUntil > now) {
        return { limited: true, retryAfterSec: Math.ceil((entry.lockedUntil - now) / 1000) };
    }
    // Window fully elapsed — drop the stale entry so counting restarts fresh.
    if (now - entry.first > WINDOW_MS) {
        attemptStore.delete(key);
    }
    return { limited: false, retryAfterSec: 0 };
}

/** max: 이 키가 잠기는 횟수 — 대부분 MAX_ATTEMPTS(5), 여러 사람이 한 주소를 나눠 쓰는 키(아래 LOGIN_UNKNOWN_MAX)만 따로 준다. */
export function registerFailure(key: string, max: number = MAX_ATTEMPTS): void {
    const now = Date.now();
    let entry = attemptStore.get(key);
    if (!entry || now - entry.first > WINDOW_MS) {
        entry = { count: 0, first: now, lockedUntil: 0 };
    }
    entry.count += 1;
    if (entry.count >= max) {
        entry.lockedUntil = now + LOCKOUT_MS;
    }
    attemptStore.set(key, entry);
}

export function clearAttempts(key: string): void {
    attemptStore.delete(key);
}

// --- 바깥 호출의 자리 잡기(2026-10-05 카카오 로그인 검토) ---
// 위의 실패 세기는 응답이 **돌아온 뒤에** 오른다. 카카오 교환처럼 요청 한 건이 바깥 호출 한 건이 되는 길에서는
// 확인(checkRateLimit)과 기록(registerFailure) 사이에 await 가 끼어, 한꺼번에 몰려온 요청이 전부 통과해 카카오를 두드렸다.
// 그래서 부르기 전에 자리를 **동기적으로** 잡는다: 창 안의 실패 수 + 지금 진행 중인 수가 MAX_ATTEMPTS 에 닿으면 받지 않는다.
// 카카오가 느린 날에도 키 하나당 대기 중인 호출이 다섯으로 묶이고, 느린 것을 실패로 세지 않으므로 15분 잠금도 생기지 않는다.
// PIN 대조(DB · bcrypt)도 같은 꼴이다(2026-10-06 검토) — 전화번호 로그인과 카카오 연결·해제는 PIN 을 보기 **전에** 자리를 잡는다.
// 뒤에 잡으면 몰려온 요청이 전부 PIN 답을 받아, 다섯 번 틀리면 잠기는 규칙이 묶음 한 번에 수백 번이 된다.
// 이것도 인스턴스 안에서만 통하는 최선 노력이다(메모리 Map) — 인스턴스를 넘는 한도는 플랫폼 방화벽 규칙이나 공유 저장소가 있어야 한다.
const inFlight = new Map<string, number>();
/** 자리가 없을 때 화면에 알려 줄 '다시 해 볼 때까지'(초). 진행 중인 호출은 길어야 카카오 제한 시간 안에 끝난다. */
const SLOT_RETRY_SEC = 5;

/**
 * 자리를 잡는다. 잡았으면 **끝났을 때 한 번 부를 함수**를 돌려준다(성공·실패·예외 모두 — try/finally 로 감쌀 것).
 * 자리가 없으면 null. 잡는 동안 await 가 없어 동시에 온 요청도 순서대로 센다.
 */
export function takeAttemptSlot(key: string): (() => void) | null {
    const now = Date.now();
    const entry = attemptStore.get(key);
    const failures = entry && now - entry.first <= WINDOW_MS ? entry.count : 0;
    const busy = inFlight.get(key) ?? 0;
    if (failures + busy >= MAX_ATTEMPTS) return null;
    inFlight.set(key, busy + 1);
    let released = false;
    return () => {
        if (released) return;
        released = true;
        const left = (inFlight.get(key) ?? 1) - 1;
        if (left > 0) inFlight.set(key, left);
        else inFlight.delete(key);
    };
}

/**
 * 전화번호 로그인에서 '없는 번호'(isNew) 답을 IP 하나가 15분 동안 받을 수 있는 횟수(2026-10-05 검토).
 * 로그인의 잠금 키에는 번호가 들어가서(login:<번호>:<ip>) 번호를 바꿔 가며 훑는 것은 막지 못했다 — 번호마다 새 키다.
 * '없는 번호' 답은 새로 가입하려는 사람도 받는 정상 답이라 PIN 실패(5회)보다 훨씬 넉넉하게 둔다:
 * 당구장·골프장 와이파이처럼 여러 사람이 한 주소로 나오는 곳에서 가입이 몰려도 걸리지 않게.
 */
// 30 이던 것을 200 으로 올렸다(2026-10-06): 통신사 망은 수천 명이 한 주소를 나눠 쓰고(휴대폰 데이터), 매장 행사에서는 한 와이파이로
// 가입이 몰린다. 한도에 걸리면 그 주소의 **기존 회원 로그인까지** 15분 막히므로, 사람이 닿을 수 없는 높이에 둔다 — 번호를 훑는 쪽은 그래도 걸린다.
const LOGIN_UNKNOWN_MAX = 200;

// POST /login - Login with phone number
router.post("/login", asyncHandler(async (req: any, res: any) => {
    const { phone, storeSlug, password } = req.body ?? {};

    // 전화번호 자리에 소셜·탈퇴 자리표시자(`social:kakao:…` 등)를 보내는 것을 DB 를 보기 **전에** 끊는다(2026-10-05 검토).
    // 소셜로 가입한 프로필은 PIN 이 없어서, 이 꼴을 받아 주면 PIN 없이 그 계정의 쿠키가 나갔다. 있는 계정인지도 알려 주지 않는다.
    if (!isLoginPhone(phone)) return sendError(res, 400, "err.auth.phoneInvalid");

    const key = attemptKey('login', phone, req.ip);
    const rl = checkRateLimit(key);
    if (rl.limited) {
        return sendError(res, 429, msg("err.auth.loginTooMany", { sec: rl.retryAfterSec }));
    }
    // 번호를 바꿔 가며 훑는 것은 위 키(번호가 들어간다)로 못 막는다 — '없는 번호' 답을 IP 하나로 따로 센다.
    // IP 는 clientIp(x-forwarded-for 첫 값): trust proxy 를 켜지 않아 req.ip 는 앞단 주소일 수 있고, 그러면 모두가 한 키를 나눠 쓴다.
    const probeKey = attemptKey('login-unknown', 'any', clientIp(req));
    const probe = checkRateLimit(probeKey);
    if (probe.limited) {
        return sendError(res, 429, msg("err.auth.loginTooMany", { sec: probe.retryAfterSec }));
    }

    // PIN 대조(DB · bcrypt)는 기다리는 일이고 실패는 답이 나온 뒤에야 세어진다 — 그 사이에 한꺼번에 몰려온 요청이 위의 '안 잠김'을
    // 전부 통과해 PIN 답을 받았다(2026-10-06 검토). 부르기 전에 자리를 잡는다: 창 안 실패 수 + 진행 중 수가 다섯이면 받지 않는다.
    // 한 건씩 오는 로그인은 예전과 같다(네 번 틀린 뒤의 다섯 번째도 받는다).
    const release = takeAttemptSlot(key);
    if (!release) {
        return sendError(res, 429, msg("err.auth.loginTooMany", { sec: SLOT_RETRY_SEC }));
    }

    let result: Awaited<ReturnType<typeof hiqService.login>>;
    try {
        result = await hiqService.login(phone, storeSlug, password);
    } catch (err: any) {
        // Only a genuine credential mismatch counts toward the brute-force limit.
        if (err?.message === "INVALID_PASSWORD") registerFailure(key);
        throw err;
    } finally {
        release();
    }
    // 없는 번호였다 — 가입하려는 사람의 정상 답이지만 훑는 쪽도 이 답으로 구분하므로 센다(넉넉한 한도, 성공해도 지우지 않는다).
    if (result.isNew) registerFailure(probeKey, LOGIN_UNKNOWN_MAX);

    if (!result.isNew && !result.requiresPassword && result.member) {
        clearAttempts(key);
        // 운영자가 정지한 계정은 들여보내지 않는다(약관 4조 무관용·이용 정지, 검토 policy:R1). 쿠키를 주기 전에 막는다.
        if (await isMemberSuspended(result.member.id)) {
            res.clearCookie('hiq_user_id', { path: '/' });
            return sendError(res, 403, SUSPENDED_TEXT, ACCOUNT_SUSPENDED_CODE);
        }
        // 예전 가입자는 국가가 비어 있다 — 이번 접속 국가로 한 번만 채운다(이미 있으면 그대로).
        await fillCountry(result.member.profileId, req);
        res.cookie('hiq_user_id', result.member.id, {
            maxAge: 30 * 24 * 60 * 60 * 1000,
            httpOnly: true,
            signed: true,
            sameSite: 'lax',
            secure: process.env.NODE_ENV === 'production' || !!process.env.VERCEL,
            path: '/'
        });
    }

    return sendSuccess(res, result);
}));

// POST /social - 구글·애플 소셜 로그인 (글로벌 유저 경로. 한국 전화 로그인과 별개)
// body: { provider: 'google'|'apple', idToken, name? } — idToken은 서버에서 JWKS로 재검증(위조 불가)
router.post("/social", asyncHandler(async (req: any, res: any) => {
    const { provider, idToken, name } = req.body ?? {};
    if ((provider !== "google" && provider !== "apple") || typeof idToken !== "string" || !idToken) {
        return sendError(res, 400, "err.auth.socialParamsRequired");
    }

    // 무차별 시도 방어 — 로그인과 같은 레이트리밋 재사용(키는 ip 기준)
    const key = attemptKey('social', provider, req.ip);
    const rl = checkRateLimit(key);
    if (rl.limited) {
        return sendError(res, 429, msg("err.auth.tooManyAttempts", { sec: rl.retryAfterSec }));
    }

    const identity = provider === "google"
        ? await verifyGoogleIdToken(idToken)
        : await verifyAppleIdToken(idToken);
    if (!identity) {
        registerFailure(key);
        return sendError(res, 401, "err.auth.tokenInvalid");
    }

    const countryCode = ipCountry(req);

    const result = await hiqService.socialLogin(provider, identity, typeof name === "string" ? name.slice(0, 40) : undefined, countryCode);
    // 가입 때만 넣던 값이라 그 전에 만든 계정은 비어 있다 — 로그인할 때 한 번 채운다(이미 있으면 그대로).
    await fillCountry(result.member.profileId, req);
    clearAttempts(key);
    if (await isMemberSuspended(result.member.id)) {
        res.clearCookie('hiq_user_id', { path: '/' });
        return sendError(res, 403, SUSPENDED_TEXT, ACCOUNT_SUSPENDED_CODE);
    }

    res.cookie('hiq_user_id', result.member.id, {
        maxAge: 30 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        signed: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production' || !!process.env.VERCEL,
        path: '/'
    });

    return sendSuccess(res, result);
}));

// --- 카카오 로그인(웹 전용) — 2026-10-05 오너: "카카오도 오픈 — 한국은 카카오·구글, 다른 나라는 구글·애플" ---
// 구글·애플(/social)은 화면이 id_token 을 들고 오지만, 카카오는 **인가 코드**를 들고 온다 — 서버가 토큰과 바꾼다(lib/kakaoAuth).
// 그래서 /social 에 끼워 넣지 않고 길을 따로 뒀다. 카카오 토큰은 저장하지 않는다.

/**
 * 시도 횟수 제한에 쓸 접속 IP. 이 앱은 trust proxy 를 켜지 않아서, 프록시 뒤(Vercel)에서는 req.ip 가 접속자가 아니라
 * 앞단 주소로 잡힐 수 있다 — 그러면 모두가 한 키를 나눠 써서, 누군가 잘못된 코드를 다섯 번 보내는 것만으로
 * 그 인스턴스의 카카오 로그인이 15분 동안 모두에게 잠긴다(카카오는 한국 화면의 첫 번째 단추다).
 * 그래서 Vercel 이 붙여 주는 x-forwarded-for 의 첫 값을 먼저 본다(오류 수집 routes/modules/errors.ts 와 같은 방식).
 */
function clientIp(req: { headers: Record<string, unknown>; ip?: string }): string | undefined {
    const fwd = String(req.headers["x-forwarded-for"] ?? "").split(",")[0].trim();
    return (fwd || req.ip || undefined)?.slice(0, 64);
}

/**
 * 본문이 JSON 으로 왔는가. 이 서버는 폼 본문(urlencoded)도 읽는다 — 그대로 두면 남의 사이트가 숨긴 폼으로
 * 자기 카카오 코드를 보내 방문자를 **공격자 계정으로 로그인**시킬 수 있다(로그인 CSRF). 폼은 application/json 을 못 보내고,
 * 다른 사이트의 fetch 는 사전 요청(preflight)에서 막힌다. 화면은 fetch + JSON 으로만 부른다.
 */
function isJsonBody(req: { is?: (type: string) => unknown }): boolean {
    return typeof req.is === "function" && !!req.is("application/json");
}

/**
 * 카카오 교환 실패 → 응답. 화면에는 **종류만** 준다 — 카카오가 준 오류 본문(KOE320 등)은 서버 로그에만 있다.
 * 네 번째 값(code)은 화면이 문구와 상관없이 갈래를 탈 수 있게 붙이는 꼬리표다.
 *   503 KAKAO_NOT_CONFIGURED · 400 KAKAO_BAD_REDIRECT · 400 KAKAO_BAD_REQUEST · 401 KAKAO_EXCHANGE_FAILED · 401 KAKAO_UNREACHABLE
 */
function sendKakaoFailure(res: any, reason: KakaoFailReason) {
    switch (reason) {
        case "not-configured": return sendError(res, 503, "err.auth.kakaoUnavailable", "KAKAO_NOT_CONFIGURED");
        case "bad-redirect": return sendError(res, 400, "err.auth.kakaoRedirectNotAllowed", "KAKAO_BAD_REDIRECT");
        case "bad-code": return sendError(res, 400, "err.auth.kakaoParamsRequired", "KAKAO_BAD_REQUEST");
        case "timeout":
        case "network":
        case "upstream": return sendError(res, 401, "err.auth.kakaoUnreachable", "KAKAO_UNREACHABLE");
        default: return sendError(res, 401, "err.auth.kakaoFailed", "KAKAO_EXCHANGE_FAILED");
    }
}

// POST /social/kakao — 카카오 로그인·가입. body: { code, redirectUri }
// redirectUri 는 화면이 인가 때 쓴 값 그대로(카카오에 다시 보내야 한다) — 허용 목록 밖이면 400.
// 허용 목록은 운영 원본 하나다. 개발용 localhost 는 개발 서버에서만 받는다(lib/kakaoAuth kakaoRedirectAllowed).
// 같은 code 를 두 번 보내면 카카오가 KOE320 을 준다 → 401. 두 번 부르지 않는 것은 화면 몫이다.
router.post("/social/kakao", asyncHandler(async (req: any, res: any) => {
    const { code, redirectUri } = req.body ?? {};
    // 키가 없으면 기능이 꺼진 것이다 — 화면은 단추를 숨기지만, 옛 화면이나 직접 호출에는 친절한 503 을 준다
    // 열려 있는지는 **이 요청 기준**이다(공개 스위치 또는 미리보기 쿠키 — lib/kakaoAuth kakaoOpenFor)
    if (!kakaoConfigured(req)) return sendKakaoFailure(res, "not-configured");
    if (!isJsonBody(req) || typeof code !== "string" || !code) return sendKakaoFailure(res, "bad-code");
    if (!kakaoRedirectAllowed(redirectUri)) return sendKakaoFailure(res, "bad-redirect");

    // 무차별 시도 방어 — /social 과 같은 레이트리밋(키는 ip 기준). 우리 서버가 카카오를 두드리는 망치가 되지 않게.
    // 인스턴스 안에서만 통하는 최선 노력이다(메모리 Map) — 위 takeAttemptSlot 의 설명 참고.
    const key = attemptKey('social', 'kakao', clientIp(req));
    const rl = checkRateLimit(key);
    if (rl.limited) {
        return sendError(res, 429, msg("err.auth.tooManyAttempts", { sec: rl.retryAfterSec }));
    }
    // 실패는 카카오가 답한 뒤에야 세어진다 — 그 사이에 몰려온 요청은 자리 수로 막는다(부르기 전에 잡고, 끝나면 놓는다)
    const release = takeAttemptSlot(key);
    if (!release) {
        return sendError(res, 429, msg("err.auth.tooManyAttempts", { sec: SLOT_RETRY_SEC }));
    }

    let exchanged: Awaited<ReturnType<typeof exchangeKakaoCode>>;
    try {
        exchanged = await exchangeKakaoCode(code, redirectUri);
    } finally {
        release();
    }
    if (!exchanged.ok) {
        // 카카오가 느리거나 죽은 것은 세지 않는다 — 보낸 값이 거절됐을 때만(코드 만료·재사용 등)
        if (kakaoRejected(exchanged.reason)) registerFailure(key);
        return sendKakaoFailure(res, exchanged.reason);
    }

    // 카카오 닉네임은 본인이 자유롭게 적는 글자다 — 랭킹·크루에 그대로 뜨는 이름이라 가입(POST /register)과 같은 필터를 건다.
    // 걸리면 로그인을 막지 않고 이름만 버린다(기본 이름 "랭큐회원"으로 시작하고, 프로필에서 바꾼다).
    const identity = exchanged.identity.name && !screenMemberProfile({ name: exchanged.identity.name }).ok
        ? { ...exchanged.identity, name: null }
        : exchanged.identity;

    // 카카오는 한국 서비스다 — 헤더가 없는 곳(로컬·서버리스 밖)에서만 KR 로 둔다(전화 가입과 같은 규칙).
    const result = await hiqService.socialLogin("kakao", identity, undefined, ipCountry(req) ?? "KR");
    // 연결해 둔 옛 계정으로 들어온 경우 국가가 비어 있을 수 있다 — 한 번 채운다(이미 있으면 그대로).
    await fillCountry(result.member.profileId, req);
    clearAttempts(key);
    if (await isMemberSuspended(result.member.id)) {
        res.clearCookie('hiq_user_id', { path: '/' });
        return sendError(res, 403, SUSPENDED_TEXT, ACCOUNT_SUSPENDED_CODE);
    }

    res.cookie('hiq_user_id', result.member.id, {
        maxAge: 30 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        signed: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production' || !!process.env.VERCEL,
        path: '/'
    });

    return sendSuccess(res, result);
}));

/**
 * 카카오 연결·해제의 본인 확인(PIN) 결과 → 응답. 통과했으면 null 을 돌려준다(응답을 보내지 않았다).
 *   409 KAKAO_NO_PROFILE · 409 KAKAO_PIN_REQUIRED(PIN 없는 계정 — 확인할 방법이 없어 열지 않는다) · 401 KAKAO_PIN_WRONG
 * 틀린 PIN 은 실패 횟수에 센다 — 쿠키를 쥔 사람이 이 길로 PIN 을 맞혀 보지 못하게(다섯 번이면 15분 잠긴다).
 */
function sendKakaoPinFailure(res: any, key: string, checked: "ok" | "no-profile" | "no-pin" | "wrong-pin") {
    if (checked === "no-profile") return sendError(res, 409, "err.auth.kakaoNoProfile", "KAKAO_NO_PROFILE");
    if (checked === "no-pin") return sendError(res, 409, "err.auth.kakaoPinRequired", "KAKAO_PIN_REQUIRED");
    if (checked === "wrong-pin") {
        registerFailure(key);
        return sendError(res, 401, "err.auth.kakaoPinWrong", "KAKAO_PIN_WRONG");
    }
    return null;
}

// POST /social/kakao/link — 로그인한 회원이 내 계정에 카카오를 붙인다(설정 '연결된 로그인'). body: { code, redirectUri, pin }
// 전화번호로 가입한 회원이 카카오로 들어오면 계정이 둘로 갈린다 — 미리 붙여 두면 카카오로 들어와도 같은 계정이다.
// 쿠키는 건드리지 않는다(누구로 로그인했는지는 그대로).
// 결과: 200 { linked: true } · 409 KAKAO_TAKEN · 409 KAKAO_NO_PROFILE · 409 KAKAO_OTHER_LINKED · 409 KAKAO_PIN_REQUIRED · 401 KAKAO_PIN_WRONG
//
// 쿠키만으로는 붙여 주지 않는다(2026-10-05 검토): 연결은 30일짜리 로그인을 **PIN 과 무관한 영구 로그인 수단**으로 바꾸는 길이다.
// 그래서 로그인 PIN 을 같이 받고, 카카오를 부르기 **전에** 확인한다 — 틀려도 한 번만 쓸 수 있는 인가 코드가 소모되지 않아
// 같은 화면에서 PIN 만 다시 넣으면 된다.
router.post("/social/kakao/link", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const { code, redirectUri, pin } = req.body ?? {};
    if (!kakaoConfigured(req)) return sendKakaoFailure(res, "not-configured");
    if (!isJsonBody(req) || typeof code !== "string" || !code) return sendKakaoFailure(res, "bad-code");
    if (!kakaoRedirectAllowed(redirectUri)) return sendKakaoFailure(res, "bad-redirect");

    // 로그인한 회원이라 키는 회원 기준 — 한 사람이 잘못된 코드·PIN 을 계속 보내는 것만 막는다
    const key = attemptKey('social-link', 'kakao', req.userId);
    const rl = checkRateLimit(key);
    if (rl.limited) {
        return sendError(res, 429, msg("err.auth.tooManyAttempts", { sec: rl.retryAfterSec }));
    }

    // 로그인 길과 같은 자리 잡기 — 실패가 세어지기 전에 몰려온 요청을 막는다.
    // PIN 보다 **먼저** 잡는다(2026-10-06 검토): PIN 대조(DB · bcrypt)도 기다리는 일이라, 뒤에 두면 한꺼번에 온 요청이
    // 위의 '안 잠김'을 전부 통과해 PIN 답을 받았다 — 다섯 번 틀리면 잠기는 규칙이 묶음 한 번에 수백 번이 됐다.
    const release = takeAttemptSlot(key);
    if (!release) {
        return sendError(res, 429, msg("err.auth.tooManyAttempts", { sec: SLOT_RETRY_SEC }));
    }

    let exchanged: Awaited<ReturnType<typeof exchangeKakaoCode>>;
    try {
        // 본인 확인 — 카카오를 부르기 전에
        const pinFailed = sendKakaoPinFailure(res, key, await hiqService.checkKakaoPin(req.userId!, pin));
        if (pinFailed) return pinFailed;

        exchanged = await exchangeKakaoCode(code, redirectUri);
    } finally {
        release();
    }
    if (!exchanged.ok) {
        if (kakaoRejected(exchanged.reason)) registerFailure(key);
        return sendKakaoFailure(res, exchanged.reason);
    }
    clearAttempts(key);

    const linked = await hiqService.linkKakao(req.userId!, exchanged.identity);
    if (linked === "taken") return sendError(res, 409, "err.auth.kakaoTaken", "KAKAO_TAKEN");
    if (linked === "no-profile") return sendError(res, 409, "err.auth.kakaoNoProfile", "KAKAO_NO_PROFILE");
    if (linked === "no-pin") return sendError(res, 409, "err.auth.kakaoPinRequired", "KAKAO_PIN_REQUIRED");
    if (linked === "other-linked") return sendError(res, 409, "err.auth.kakaoOtherLinked", "KAKAO_OTHER_LINKED");
    return sendSuccess(res, { linked: true });
}));

// DELETE /social/kakao/link — 내 계정에서 카카오를 뗀다(설정 '연결된 로그인' → 해제). body: { pin }
// 연결만 있고 해제가 없으면 잘못 붙은(또는 남이 붙여 둔) 카카오를 주인이 되돌릴 길이 없다(2026-10-05 검토).
// 연결과 같은 PIN 확인을 거친다. 카카오로 **가입한** 계정은 떼면 들어올 길이 없어져 거절한다.
// 카카오를 부르지 않으므로 키가 없어도(기능이 꺼져 있어도) 뗄 수 있다.
// 결과: 200 { linked: false } · 400(pin 없음) · 409 KAKAO_SIGNUP_ACCOUNT · 409 KAKAO_NO_PROFILE · 409 KAKAO_PIN_REQUIRED · 401 KAKAO_PIN_WRONG
router.delete("/social/kakao/link", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const { pin } = req.body ?? {};
    if (typeof pin !== "string" || !pin) return sendError(res, 400, "err.auth.missingFields");

    const key = attemptKey('social-link', 'kakao', req.userId);
    const rl = checkRateLimit(key);
    if (rl.limited) {
        return sendError(res, 429, msg("err.auth.tooManyAttempts", { sec: rl.retryAfterSec }));
    }

    // 연결과 같은 자리 잡기(2026-10-06 검토) — 해제의 PIN 대조도 기다리는 일이라, 자리 없이는 한꺼번에 온 요청이 전부 PIN 답을 받았다.
    // 연결(웹·앱)과 같은 키를 쓰므로 이 길 하나만 열려 있어도 PIN 이 드러난다.
    const release = takeAttemptSlot(key);
    if (!release) {
        return sendError(res, 429, msg("err.auth.tooManyAttempts", { sec: SLOT_RETRY_SEC }));
    }

    let unlinked: Awaited<ReturnType<typeof hiqService.unlinkKakao>>;
    try {
        unlinked = await hiqService.unlinkKakao(req.userId!, pin);
    } finally {
        release();
    }
    if (unlinked === "signup-account") return sendError(res, 409, "err.auth.kakaoUnlinkSignup", "KAKAO_SIGNUP_ACCOUNT");
    const pinFailed = sendKakaoPinFailure(res, key, unlinked);
    if (pinFailed) return pinFailed;
    clearAttempts(key);
    return sendSuccess(res, { linked: false });
}));

// POST /register
router.post("/register", asyncHandler(async (req: any, res: any) => {
    // 가입 화면의 약관 동의(감사 S4) — 화면이 필수 동의를 받은 뒤 본 약관 버전을 함께 보낸다.
    // zod 가입 스키마 밖의 값이라(스키마가 terms* 를 뺀다) 검증 전에 따로 읽는다.
    // 버전이 없다고 가입을 막지는 않는다: 옛 화면의 가입이 통째로 깨지고, 동의가 없으면 첫 글쓰기에서 서버가 다시 받는다.
    const termsVersion = req.body?.termsVersion;
    const validation = insertHiqMemberSchema.safeParse(req.body);
    if (!validation.success) {
        return sendError(res, 400, validation.error.errors[0].message);
    }
    // 전화번호 자리에 소셜·탈퇴 자리표시자를 받지 않는다 — 로그인과 같은 검사(shared/loginPhone). DB 를 보기 전에 끊는다.
    if (!isLoginPhone(validation.data.phone)) return sendError(res, 400, "err.auth.phoneInvalid");
    // 가입 이름도 랭킹·크루·커뮤니티에 그대로 뜨는 공개 문구다 — 프로필 수정(PATCH /me)과 같은 필터(검토 policy:R5).
    const screenedName = screenMemberProfile({ name: validation.data.name });
    if (!screenedName.ok) return sendError(res, 400, screenedName.reason);

    // 전화번호 가입은 한국 번호 흐름이다(2026-09-17 오너: "전화번호는 다 한국이야").
    // 헤더가 오면 그 값을 쓰고, 서버리스 밖·로컬처럼 헤더가 없을 때만 KR 로 둔다.
    const result = await hiqService.register(validation.data, ipCountry(req) ?? "KR");
    // 번호로 이미 정지된 프로필에 매장 회원 행만 새로 붙이는 우회를 막는다 — 가입 경로도 로그인과 같이 확인한다.
    if (await isMemberSuspended(result.member.id)) {
        return sendError(res, 403, SUSPENDED_TEXT, ACCOUNT_SUSPENDED_CODE);
    }
    if (isTermsAccepted(termsVersion)) {
        // 기록이 실패해도 가입은 살린다 — 첫 글쓰기 때 동의 시트가 다시 받는다
        await recordTermsAcceptance(result.member.id, termsVersion)
            .catch((e: unknown) => console.error("[Register] terms record failed:", (e as Error)?.message));
    }
    res.cookie('hiq_user_id', result.member.id, {
        maxAge: 30 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        signed: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production' || !!process.env.VERCEL,
        path: '/'
    });

    return sendSuccess(res, result);
}));

// POST /logout
// 앱에서 로그아웃하면 이 기기의 푸시 토큰도 계정에서 뗀다 — 안 그러면 로그아웃한 폰에 이전 계정의
// 크루 채팅 원문이 계속 뜬다(감사 P4). 앱이 body.pushToken 으로 지금 기기 토큰을 보내면, 그 회원 프로필에
// 저장된 토큰이 바로 그 기기일 때만 비운다(다른 기기의 토큰은 그대로). 토큰이 없거나 형식이 틀리거나
// DB 가 실패해도 로그아웃 자체(쿠키 삭제)는 늘 성공한다.
router.post("/logout", asyncHandler(async (req: any, res: any) => {
    const userId = req.signedCookies?.hiq_user_id;
    const pushToken = req.body?.pushToken;
    if (typeof userId === "string" && userId && isValidPushToken(pushToken)) {
        try {
            await storage.users.clearPushToken(userId, pushToken);
        } catch (e) {
            console.error("[Logout] push token clear failed:", (e as Error)?.message);
        }
    }
    res.clearCookie('hiq_user_id', { path: '/' });
    res.clearCookie('hiq_partner_auth', { path: '/' });
    res.clearCookie('hiq_admin_origin', { path: '/' });
    return sendSuccess(res, { success: true });
}));

// 푸시 토큰 형식 검증.
// APNs 발송(pushNative.ts)은 토큰을 HTTP/2 :path(`/3/device/${token}`)에 그대로 보간하므로,
// 슬래시·공백·개행이 섞인 값이 들어오면 요청 경로 자체가 변조된다. 저장 시점에 막는다.
// 클라 규약과 판별 규칙은 pushNative.ts와 동일: 'apns:'/'fcm:' 접두사, 없으면 64 hex=APNs / 그 외 FCM.
const APNS_TOKEN_RE = /^[0-9a-fA-F]{64}$/;
// FCM 등록 토큰 — base64url 문자에 ':' 구분자(예: cXX…:APA91b…)가 섞인 형태.
const FCM_TOKEN_RE = /^[A-Za-z0-9_:.-]{32,512}$/;

function isValidPushToken(raw: unknown): raw is string {
    if (typeof raw !== "string" || raw.length > 600) return false;
    if (raw.startsWith("apns:")) return APNS_TOKEN_RE.test(raw.slice(5));
    const body = raw.startsWith("fcm:") ? raw.slice(4) : raw;
    return APNS_TOKEN_RE.test(body) || FCM_TOKEN_RE.test(body);
}

// POST /push-token - Save/Update Push Token (FCM / APNs)
router.post("/push-token", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    // 새 웹은 { pushToken }, 이미 떠 있는 옛 웹 번들(nativeBridge·App.tsx)은 { token } 으로 보낸다 — 둘 다 받는다.
    const { pushToken, token: legacyToken } = req.body || {};
    const token = pushToken ?? legacyToken;
    if (!token) return sendError(res, 400, "err.auth.pushTokenRequired");
    if (!isValidPushToken(token)) return sendError(res, 400, "err.auth.pushTokenFormat");

    // 같은 기기 토큰을 쥐고 있던 다른 계정은 여기서 떼어진다(user.repo updatePushToken).
    await storage.updatePushToken(req.userId!, token);
    return sendSuccess(res, { success: true });
}));

// POST /reset-pin/question - Get security question for phone
router.post("/reset-pin/question", asyncHandler(async (req: any, res: any) => {
    const { phone } = req.body;
    if (!phone) return sendError(res, 400, "err.auth.phoneRequired");
    // 자리표시자(`social:…`·`del-…`)는 전화번호가 아니다 — 로그인과 같은 검사로 DB 를 보기 전에 끊는다
    if (!isLoginPhone(phone)) return sendError(res, 400, "err.auth.phoneInvalid");

    const key = attemptKey('reset-question', phone, req.ip);
    const rl = checkRateLimit(key);
    if (rl.limited) {
        return sendError(res, 429, msg("err.auth.requestTooMany", { sec: rl.retryAfterSec }));
    }

    try {
        const result = await hiqService.getSecurityQuestion(phone);
        return sendSuccess(res, result);
    } catch (err: any) {
        // Throttle repeated lookups (incl. misses) so this endpoint can't be used as a
        // fast user-enumeration / question-harvesting oracle.
        registerFailure(key);
        if (err.message === "USER_NOT_FOUND") return sendError(res, 404, "err.auth.phoneNotRegistered");
        if (err.message === "NO_SECURITY_QUESTION") return sendError(res, 400, "err.auth.noSecurityQuestion");
        return sendError(res, 500, err.message);
    }
}));

// POST /reset-pin/verify - Verify answer and reset PIN
router.post("/reset-pin/verify", asyncHandler(async (req: any, res: any) => {
    const { phone, answer, newPin } = req.body;
    if (!phone || !answer || !newPin) return sendError(res, 400, "err.auth.missingFields");
    if (!isLoginPhone(phone)) return sendError(res, 400, "err.auth.phoneInvalid");

    const key = attemptKey('reset-verify', phone, req.ip);
    const rl = checkRateLimit(key);
    if (rl.limited) {
        return sendError(res, 429, msg("err.auth.tooManyAttempts", { sec: rl.retryAfterSec }));
    }

    try {
        const result = await hiqService.resetPinBySecurityAnswer(phone, answer, newPin);
        clearAttempts(key);
        return sendSuccess(res, result);
    } catch (err: any) {
        if (err.message === "INVALID_ANSWER") {
            // Count each wrong security-answer guess toward the lockout threshold.
            registerFailure(key);
            return sendError(res, 401, "err.auth.wrongAnswer");
        }
        return sendError(res, 500, err.message);
    }
}));

// --- 카카오 로그인 미리보기(2026-10-06) — 공개 스위치는 꺼 둔 채, 열쇠를 넣은 기기(브라우저·앱 웹뷰)에서만 카카오 로그인을 연다 ---
// 1.3 을 Play 내부 테스트에 올렸는데 스위치(KAKAO_LOGIN_OPEN)가 꺼져 있어 실기기에서 시험할 길이 없었다 — 켜면 모든 사용자에게 열린다.
// 열쇠(환경변수 KAKAO_PREVIEW_KEY)가 서버에 없으면 켜기·끄기 두 길은 **없는 주소**다: next() 로 흘려보내 없는 길과 똑같은 404 가 나간다.
// 판정과 쿠키 값은 lib/kakaoAuth(kakaoOpenFor · packKakaoPreview), 주소·쿠키 이름은 shared/kakaoLogin.ts.
// 이 쿠키는 '카카오 단추를 쓸 수 있는가'만 바꾼다 — 누구로 로그인되는지는 예전과 같이 카카오가 확인한 회원번호가 정한다.

/** 미리보기 열쇠를 IP 하나가 15분 동안 틀릴 수 있는 횟수 — 넘으면 15분 동안은 맞는 열쇠도 보지 않는다(답은 같은 404). */
const KAKAO_PREVIEW_MAX_TRIES = 10;

/**
 * 미리보기 쿠키의 속성 — 굽는 쪽과 지우는 쪽이 같은 값을 쓴다(Path 가 다르면 브라우저가 다른 쿠키로 보고 지우지 않는다).
 * 카카오 길 전부(웹 로그인·연결·앱 nonce·검증·상태)에 실려야 해서 Path 는 '/', 링크로 들어온 첫 요청에도 실리게 Lax 다.
 * 서명(signed)과 수명(maxAge)은 굽는 쪽만 붙인다.
 */
function kakaoPreviewCookieOptions() {
    return {
        httpOnly: true,
        sameSite: 'lax' as const,
        secure: process.env.NODE_ENV === 'production' || !!process.env.VERCEL,
        path: '/',
    };
}

// POST /social/kakao/preview — 이 기기에서 미리보기를 켠다. body: { key }
// 맞으면 200 { open, native } 와 서명 쿠키(30일). 틀리면 **없는 주소와 같은 답**(404) — 이 기능이 있는지조차 드러내지 않는다.
// 열쇠가 서버에 없을 때 · 시도 횟수에 걸렸을 때 · JSON 본문이 아닐 때도 같은 답이다(구분해 알려 주지 않는다).
router.post("/social/kakao/preview", asyncHandler(async (req: any, res: any, next: any) => {
    if (!kakaoPreviewEnabled()) return next();

    // 시도 횟수 — IP 기준, 로그인과 같은 도구. 잠긴 동안에는 맞는 열쇠도 보지 않는다(잠겼다는 것도 알리지 않는다)
    const key = attemptKey('kakao-preview', 'any', clientIp(req));
    if (checkRateLimit(key).limited) return next();
    if (!isJsonBody(req) || !kakaoPreviewKeyMatches(req.body?.key)) {
        registerFailure(key, KAKAO_PREVIEW_MAX_TRIES);
        return next();
    }
    // 그 사이에 열쇠가 사라졌으면 굽지 않는다(없는 기능)
    const value = packKakaoPreview(Date.now());
    if (!value) return next();
    clearAttempts(key);

    res.set("Cache-Control", "no-store");
    res.cookie(KAKAO_PREVIEW_COOKIE, value, { ...kakaoPreviewCookieOptions(), signed: true, maxAge: KAKAO_PREVIEW_TTL_SEC * 1000 });
    // 이 쿠키를 들고 올 다음 요청이 받을 답을 미리 알려 준다 — 화면이 "서버에 앱용 키가 없다"를 그 자리에서 보여 줄 수 있게
    const withCookie = { signedCookies: { [KAKAO_PREVIEW_COOKIE]: value } };
    const status: KakaoStatus = { open: kakaoOpenFor(withCookie), native: kakaoNativeConfigured(withCookie) };
    return sendSuccess(res, status);
}));

// DELETE /social/kakao/preview — 이 기기의 미리보기를 끈다(쿠키를 지운다). 쿠키가 있든 없든 200 이다.
// 열쇠가 서버에 없으면 이 길도 없는 주소다(그때는 남은 쿠키가 있어도 이미 쓸모가 없다 — kakaoPreviewValid).
router.delete("/social/kakao/preview", asyncHandler(async (_req: any, res: any, next: any) => {
    if (!kakaoPreviewEnabled()) return next();
    res.set("Cache-Control", "no-store");
    res.clearCookie(KAKAO_PREVIEW_COOKIE, kakaoPreviewCookieOptions());
    // 쿠키 없이 받을 답 = 공개 스위치 그대로
    const status: KakaoStatus = { open: kakaoOpenFor(null), native: kakaoNativeConfigured(null) };
    return sendSuccess(res, status);
}));

// GET /social/kakao/status — **이 요청에** 카카오가 열려 있는가. 결과: 200 { open, native } (캐시하지 않는다)
// 화면이 미리보기 깃발이 아직 유효한지 확인하는 데 쓴다 — 깃발이 선 기기만 앱이 뜰 때 한 번 묻는다(client lib/kakaoLogin).
// 미리보기 길이 아니라 상태 길이라 열쇠가 없는 서버에서도 답한다(그때는 공개 스위치 그대로): 열쇠를 지우거나 바꾼 뒤에
// 깃발이 남은 기기가 '닫힘'을 받아야 깃발을 내린다. 쿠키가 없는 요청에 새로 알려 주는 것은 없다(닫혀 있으면 둘 다 false).
router.get("/social/kakao/status", asyncHandler(async (req: any, res: any) => {
    res.set("Cache-Control", "no-store");
    const status: KakaoStatus = { open: kakaoOpenFor(req), native: kakaoNativeConfigured(req) };
    return sendSuccess(res, status);
}));

// --- 앱 안 카카오 로그인(네이티브 SDK · ID 토큰) — 2026-10-06 오너: "카카오 로그인이 되는 앱 빌드를 만들어 올리고, 승인되면 카카오를 연다" ---
// 앱의 웹뷰는 rankue.co.kr 밖으로 못 나가 위의 웹 길(인가 코드 + Redirect URI)을 못 쓴다. 새 바이너리(1.3~)는 네이티브 플러그인이
// 카카오 SDK 로 **ID 토큰**을 받아 오고, 여기서 검증한다(lib/kakaoAuth verifyKakaoIdToken). 계약 전문은 shared/kakaoNative.ts.
// 검증된 회원번호(sub)는 웹 카카오와 **같은 계정 규칙**을 탄다 — 같은 hiqService.socialLogin("kakao") · linkKakao · profiles.kakao_sub.
// 스위치(KAKAO_LOGIN_OPEN)가 꺼져 있으면 두 길 모두 503 이다(웹 카카오와 같은 답). 액세스 토큰은 받지도 저장하지도 않는다.
// (미리보기 쿠키를 든 요청에는 스위치가 꺼져 있어도 열린다 — 웹과 같은 판정 하나다: lib/kakaoAuth kakaoOpenFor)
// 이 묶음은 파일 맨 끝에 둔다 — 위의 웹 카카오 세 길(로그인·연결·해제)의 답·키·문구는 그대로다.
// (같은 날 검토에서 연결·해제·전화번호 로그인에 '자리 잡기를 PIN 대조 앞에'만 더했다 — 아래 연결 갈래와 같은 순서다.)

/**
 * nonce 쿠키의 속성 — 굽는 쪽과 지우는 쪽이 같은 값을 쓴다(Path 가 다르면 브라우저가 다른 쿠키로 보고 지우지 않는다).
 * 이 두 길에만 실리고(Path), 다른 사이트에서 온 요청에는 실리지 않는다(Strict). 서명(signed)과 수명(maxAge)은 굽는 쪽만 붙인다.
 */
function kakaoNonceCookieOptions() {
    return {
        httpOnly: true,
        sameSite: 'strict' as const,
        secure: process.env.NODE_ENV === 'production' || !!process.env.VERCEL,
        path: KAKAO_NONCE_COOKIE_PATH,
    };
}

/**
 * ID 토큰 검증 실패 → 응답. 화면에는 **종류만** 준다(무엇이 틀렸는지는 서버 로그에만 있다).
 *   503 KAKAO_NOT_CONFIGURED · 400 KAKAO_BAD_REQUEST · 401 KAKAO_TOKEN_INVALID · 401 KAKAO_UNREACHABLE
 */
function sendKakaoNativeFailure(res: any, reason: KakaoIdTokenFailReason) {
    switch (reason) {
        case "not-configured": return sendError(res, 503, "err.auth.kakaoUnavailable", "KAKAO_NOT_CONFIGURED");
        case "bad-token": return sendError(res, 400, "err.auth.kakaoParamsRequired", "KAKAO_BAD_REQUEST");
        case "unreachable": return sendError(res, 401, "err.auth.kakaoUnreachable", "KAKAO_UNREACHABLE");
        default: return sendError(res, 401, "err.auth.kakaoFailed", "KAKAO_TOKEN_INVALID");
    }
}

// POST /social/kakao/native/nonce — 앱이 카카오 SDK 를 부르기 전에 받는 1회용 nonce. 본문은 빈 JSON `{}` 면 된다.
// 같은 값을 서명 쿠키에도 넣는다 — 검증할 때 본문의 nonce 와 쿠키의 nonce 가 같아야 한다(이 브라우저에 묶인다).
// DB 도 카카오도 부르지 않는다(난수 + 쿠키 한 장). 결과: 200 { nonce, expiresInSec } · 400(JSON 본문 아님) · 503(닫혀 있음)
router.post("/social/kakao/native/nonce", asyncHandler(async (req: any, res: any) => {
    res.set("Cache-Control", "no-store");
    if (!kakaoNativeConfigured(req)) return sendKakaoNativeFailure(res, "not-configured");
    if (!isJsonBody(req)) return sendKakaoNativeFailure(res, "bad-token");

    const nonce = newKakaoNonce();
    res.cookie(KAKAO_NONCE_COOKIE, packKakaoNonce(nonce, Date.now()), { ...kakaoNonceCookieOptions(), signed: true, maxAge: KAKAO_NONCE_TTL_SEC * 1000 });
    const issued: KakaoNonceIssue = { nonce, expiresInSec: KAKAO_NONCE_TTL_SEC };
    return sendSuccess(res, issued);
}));

// POST /social/kakao/native — 앱이 받은 카카오 ID 토큰으로 로그인·가입(mode 없음 또는 "login")하거나 내 계정에 붙인다("link").
// body: { idToken, nonce, mode?: "login" | "link", pin? }
// 결과(login): 200 { member, isNew, redirectTo } (/social 과 같은 모양) · 403 ACCOUNT_SUSPENDED
// 결과(link):  200 { linked: true } · 401(비로그인) · 409 KAKAO_TAKEN · KAKAO_NO_PROFILE · KAKAO_OTHER_LINKED · KAKAO_PIN_REQUIRED · 401 KAKAO_PIN_WRONG
// 공통: 400 KAKAO_BAD_REQUEST · 401 KAKAO_NONCE_INVALID(쿠키 없음·다름·만료·이미 씀 — 구분해 알려 주지 않는다) · 401 KAKAO_TOKEN_INVALID
//       · 401 KAKAO_UNREACHABLE · 429 · 503 KAKAO_NOT_CONFIGURED
//
// 순서가 규칙이다: 꼴 검사 → 시도 횟수 → 자리 잡기 → (연결이면 PIN) → nonce 를 쓰고 쿠키를 지운다 → 토큰 검증 → 계정.
//  - 자리는 PIN 보다 먼저 잡는다 — 한꺼번에 몰려온 요청이 PIN 대조를 다섯 건 넘게 받지 못한다(창 안 실패 수 + 진행 중 수 < 5).
//  - 연결의 PIN 은 nonce 보다 먼저 본다 — 틀려도 nonce 가 쓰이지 않아, 화면이 같은 토큰으로 PIN 만 다시 보낼 수 있다(웹의 인가 코드와 같은 이치).
//  - nonce 는 토큰 검증의 결과와 무관하게 한 번으로 끝난다(실패했으면 화면이 nonce 부터 다시 받는다).
router.post("/social/kakao/native", asyncHandler(async (req: any, res: any) => {
    res.set("Cache-Control", "no-store");
    const { idToken, nonce, mode, pin } = req.body ?? {};
    if (!kakaoNativeConfigured(req)) return sendKakaoNativeFailure(res, "not-configured");
    // JSON 본문만(로그인 CSRF — 위 isJsonBody) · 토큰과 nonce 는 꼴이 맞을 때만 · mode 는 둘 중 하나
    if (!isJsonBody(req) || !looksLikeKakaoIdToken(idToken) || !isKakaoNonce(nonce)) return sendKakaoNativeFailure(res, "bad-token");
    if (mode !== undefined && mode !== "login" && mode !== "link") return sendKakaoNativeFailure(res, "bad-token");
    const linking = mode === "link";

    // 연결은 로그인한 회원만 — requireAuth 와 같은 규칙이다(서명 쿠키만 믿는다). 한 길에 두 모드가 있어 미들웨어 대신 여기서 본다.
    const userId: unknown = linking ? req.signedCookies?.hiq_user_id : undefined;
    if (linking && (typeof userId !== "string" || !userId)) return sendError(res, 401, "err.common.loginRequired");

    // 시도 횟수 — 웹 카카오와 **같은 키**를 쓴다(로그인은 IP, 연결은 회원). 길을 바꿔 가며 한도를 두 배로 쓰지 못한다.
    const key = linking ? attemptKey('social-link', 'kakao', userId) : attemptKey('social', 'kakao', clientIp(req));
    const rl = checkRateLimit(key);
    if (rl.limited) {
        return sendError(res, 429, msg("err.auth.tooManyAttempts", { sec: rl.retryAfterSec }));
    }

    // 웹 카카오와 같은 자리 잡기 — 검증은 카카오 공개 키를 받아 올 수 있는 바깥 호출이다.
    // PIN 보다 **먼저** 잡는다(2026-10-06 검토): PIN 대조(DB · bcrypt)도 기다리는 일이라, 뒤에 두면 한꺼번에 온 요청이
    // 위의 '안 잠김'을 전부 통과해 PIN 답을 받았다 — 다섯 번 틀리면 잠기는 규칙이 묶음 한 번에 수백 번이 됐다.
    // nonce 를 쓰기 **전에** 잡는다: 자리가 없어 429 로 돌아간 요청은 nonce 가 그대로라 잠시 뒤 같은 토큰으로 다시 보낼 수 있다.
    const release = takeAttemptSlot(key);
    if (!release) {
        return sendError(res, 429, msg("err.auth.tooManyAttempts", { sec: SLOT_RETRY_SEC }));
    }

    let verified: Awaited<ReturnType<typeof verifyKakaoIdToken>>;
    try {
        // 연결: 본인 확인(PIN) — nonce 를 쓰기 전에(틀려도 nonce 쿠키가 남아 PIN 만 다시 보낼 수 있다)
        if (linking) {
            const pinFailed = sendKakaoPinFailure(res, key, await hiqService.checkKakaoPin(userId as string, pin));
            if (pinFailed) return pinFailed;
        }

        // nonce — 이 브라우저에 내준 그 값인가. 결과와 무관하게 쿠키를 지운다(한 번만 쓴다).
        // 틀린 nonce 는 실패 횟수에 세지 않는다: 맞혀 볼 수 있는 값이 아니고(256비트 난수 + 서명 쿠키), 카카오톡에서 10분 넘게 머문 사람이 잠기면 안 된다.
        const nonceOk = takeKakaoNonce(req.signedCookies?.[KAKAO_NONCE_COOKIE], nonce, Date.now()) === "ok";
        res.clearCookie(KAKAO_NONCE_COOKIE, kakaoNonceCookieOptions());
        if (!nonceOk) return sendError(res, 401, "err.auth.kakaoFailed", "KAKAO_NONCE_INVALID");

        verified = await verifyKakaoIdToken(idToken, nonce);
    } finally {
        release();
    }
    if (!verified.ok) {
        // 카카오가 느리거나 죽은 것은 세지 않는다 — 보낸 토큰이 거절됐을 때만(위조·다른 앱·만료·nonce 불일치)
        if (kakaoIdTokenRejected(verified.reason)) registerFailure(key);
        return sendKakaoNativeFailure(res, verified.reason);
    }

    if (linking) {
        clearAttempts(key);
        // 쿠키는 건드리지 않는다(누구로 로그인했는지는 그대로) — 답은 웹의 연결과 같다
        const linked = await hiqService.linkKakao(userId as string, verified.identity);
        if (linked === "taken") return sendError(res, 409, "err.auth.kakaoTaken", "KAKAO_TAKEN");
        if (linked === "no-profile") return sendError(res, 409, "err.auth.kakaoNoProfile", "KAKAO_NO_PROFILE");
        if (linked === "no-pin") return sendError(res, 409, "err.auth.kakaoPinRequired", "KAKAO_PIN_REQUIRED");
        if (linked === "other-linked") return sendError(res, 409, "err.auth.kakaoOtherLinked", "KAKAO_OTHER_LINKED");
        return sendSuccess(res, { linked: true });
    }

    // 여기부터는 웹 카카오 로그인(POST /social/kakao)의 뒤쪽과 같은 규칙이다 — 이름 필터 · 같은 계정 규칙 · 국가 · 정지 확인 · 쿠키
    const identity = verified.identity.name && !screenMemberProfile({ name: verified.identity.name }).ok
        ? { ...verified.identity, name: null }
        : verified.identity;

    const result = await hiqService.socialLogin("kakao", identity, undefined, ipCountry(req) ?? "KR");
    await fillCountry(result.member.profileId, req);
    clearAttempts(key);
    if (await isMemberSuspended(result.member.id)) {
        res.clearCookie('hiq_user_id', { path: '/' });
        return sendError(res, 403, SUSPENDED_TEXT, ACCOUNT_SUSPENDED_CODE);
    }

    res.cookie('hiq_user_id', result.member.id, {
        maxAge: 30 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        signed: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production' || !!process.env.VERCEL,
        path: '/'
    });

    return sendSuccess(res, result);
}));

export default router;
