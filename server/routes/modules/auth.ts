import { Router } from "express";
import { hiqService } from "../../services/hiqService.js";
import { insertHiqMemberSchema } from "../../../shared/schema.js";
import { sendSuccess, sendError } from "../../utils/response.js";
import { storage } from "../../storage/index.js";
import { requireAuth, AuthRequest } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { verifyGoogleIdToken, verifyAppleIdToken } from "../../lib/socialAuth.js";
import { recordTermsAcceptance, isMemberSuspended, SUSPENDED_MESSAGE } from "../../middleware/terms.js";
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

export function registerFailure(key: string): void {
    const now = Date.now();
    let entry = attemptStore.get(key);
    if (!entry || now - entry.first > WINDOW_MS) {
        entry = { count: 0, first: now, lockedUntil: 0 };
    }
    entry.count += 1;
    if (entry.count >= MAX_ATTEMPTS) {
        entry.lockedUntil = now + LOCKOUT_MS;
    }
    attemptStore.set(key, entry);
}

export function clearAttempts(key: string): void {
    attemptStore.delete(key);
}

// POST /login - Login with phone number
router.post("/login", asyncHandler(async (req: any, res: any) => {
    const { phone, storeSlug, password } = req.body;

    const key = attemptKey('login', phone, req.ip);
    const rl = checkRateLimit(key);
    if (rl.limited) {
        return sendError(res, 429, `로그인 시도가 너무 많습니다. ${rl.retryAfterSec}초 후 다시 시도해주세요.`);
    }

    let result: Awaited<ReturnType<typeof hiqService.login>>;
    try {
        result = await hiqService.login(phone, storeSlug, password);
    } catch (err: any) {
        // Only a genuine credential mismatch counts toward the brute-force limit.
        if (err?.message === "INVALID_PASSWORD") registerFailure(key);
        throw err;
    }

    if (!result.isNew && !result.requiresPassword && result.member) {
        clearAttempts(key);
        // 운영자가 정지한 계정은 들여보내지 않는다(약관 4조 무관용·이용 정지, 검토 policy:R1). 쿠키를 주기 전에 막는다.
        if (await isMemberSuspended(result.member.id)) {
            res.clearCookie('hiq_user_id', { path: '/' });
            return sendError(res, 403, SUSPENDED_MESSAGE, ACCOUNT_SUSPENDED_CODE);
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
        return sendError(res, 400, "provider와 idToken이 필요합니다");
    }

    // 무차별 시도 방어 — 로그인과 같은 레이트리밋 재사용(키는 ip 기준)
    const key = attemptKey('social', provider, req.ip);
    const rl = checkRateLimit(key);
    if (rl.limited) {
        return sendError(res, 429, `시도가 너무 많습니다. ${rl.retryAfterSec}초 후 다시 시도해주세요.`);
    }

    const identity = provider === "google"
        ? await verifyGoogleIdToken(idToken)
        : await verifyAppleIdToken(idToken);
    if (!identity) {
        registerFailure(key);
        return sendError(res, 401, "토큰 검증에 실패했습니다");
    }

    const countryCode = ipCountry(req);

    const result = await hiqService.socialLogin(provider, identity, typeof name === "string" ? name.slice(0, 40) : undefined, countryCode);
    // 가입 때만 넣던 값이라 그 전에 만든 계정은 비어 있다 — 로그인할 때 한 번 채운다(이미 있으면 그대로).
    await fillCountry(result.member.profileId, req);
    clearAttempts(key);
    if (await isMemberSuspended(result.member.id)) {
        res.clearCookie('hiq_user_id', { path: '/' });
        return sendError(res, 403, SUSPENDED_MESSAGE, ACCOUNT_SUSPENDED_CODE);
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
    // 가입 이름도 랭킹·크루·커뮤니티에 그대로 뜨는 공개 문구다 — 프로필 수정(PATCH /me)과 같은 필터(검토 policy:R5).
    const screenedName = screenMemberProfile({ name: validation.data.name });
    if (!screenedName.ok) return sendError(res, 400, screenedName.reason);

    // 전화번호 가입은 한국 번호 흐름이다(2026-09-17 오너: "전화번호는 다 한국이야").
    // 헤더가 오면 그 값을 쓰고, 서버리스 밖·로컬처럼 헤더가 없을 때만 KR 로 둔다.
    const result = await hiqService.register(validation.data, ipCountry(req) ?? "KR");
    // 번호로 이미 정지된 프로필에 매장 회원 행만 새로 붙이는 우회를 막는다 — 가입 경로도 로그인과 같이 확인한다.
    if (await isMemberSuspended(result.member.id)) {
        return sendError(res, 403, SUSPENDED_MESSAGE, ACCOUNT_SUSPENDED_CODE);
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
    if (!token) return sendError(res, 400, "토큰이 필요합니다");
    if (!isValidPushToken(token)) return sendError(res, 400, "푸시 토큰 형식이 올바르지 않습니다");

    // 같은 기기 토큰을 쥐고 있던 다른 계정은 여기서 떼어진다(user.repo updatePushToken).
    await storage.updatePushToken(req.userId!, token);
    return sendSuccess(res, { success: true });
}));

// POST /reset-pin/question - Get security question for phone
router.post("/reset-pin/question", asyncHandler(async (req: any, res: any) => {
    const { phone } = req.body;
    if (!phone) return sendError(res, 400, "전화번호가 필요합니다");

    const key = attemptKey('reset-question', phone, req.ip);
    const rl = checkRateLimit(key);
    if (rl.limited) {
        return sendError(res, 429, `요청이 너무 많습니다. ${rl.retryAfterSec}초 후 다시 시도해주세요.`);
    }

    try {
        const result = await hiqService.getSecurityQuestion(phone);
        return sendSuccess(res, result);
    } catch (err: any) {
        // Throttle repeated lookups (incl. misses) so this endpoint can't be used as a
        // fast user-enumeration / question-harvesting oracle.
        registerFailure(key);
        if (err.message === "USER_NOT_FOUND") return sendError(res, 404, "등록되지 않은 번호입니다");
        if (err.message === "NO_SECURITY_QUESTION") return sendError(res, 400, "보안 질문이 설정되지 않은 계정입니다. 고객센터에 문의해주세요.");
        return sendError(res, 500, err.message);
    }
}));

// POST /reset-pin/verify - Verify answer and reset PIN
router.post("/reset-pin/verify", asyncHandler(async (req: any, res: any) => {
    const { phone, answer, newPin } = req.body;
    if (!phone || !answer || !newPin) return sendError(res, 400, "필수 정보가 누락되었습니다");

    const key = attemptKey('reset-verify', phone, req.ip);
    const rl = checkRateLimit(key);
    if (rl.limited) {
        return sendError(res, 429, `시도가 너무 많습니다. ${rl.retryAfterSec}초 후 다시 시도해주세요.`);
    }

    try {
        const result = await hiqService.resetPinBySecurityAnswer(phone, answer, newPin);
        clearAttempts(key);
        return sendSuccess(res, result);
    } catch (err: any) {
        if (err.message === "INVALID_ANSWER") {
            // Count each wrong security-answer guess toward the lockout threshold.
            registerFailure(key);
            return sendError(res, 401, "정답이 일치하지 않습니다");
        }
        return sendError(res, 500, err.message);
    }
}));

export default router;
