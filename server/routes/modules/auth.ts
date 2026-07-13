import { Router } from "express";
import { hiqService } from "../../services/hiqService.js";
import { insertHiqMemberSchema } from "../../../shared/schema.js";
import { sendSuccess, sendError } from "../../utils/response.js";
import { storage } from "../../storage/index.js";
import { requireAuth, AuthRequest } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

const router = Router();

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

function attemptKey(action: string, phone: unknown, ip: unknown): string {
    return `${action}:${phone || 'nophone'}:${ip || 'noip'}`;
}

function checkRateLimit(key: string): { limited: boolean; retryAfterSec: number } {
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

function registerFailure(key: string): void {
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

function clearAttempts(key: string): void {
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

    let result;
    try {
        result = await hiqService.login(phone, storeSlug, password);
    } catch (err: any) {
        // Only a genuine credential mismatch counts toward the brute-force limit.
        if (err?.message === "INVALID_PASSWORD") registerFailure(key);
        throw err;
    }

    if (!result.isNew && !result.requiresPassword && result.member) {
        clearAttempts(key);
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

// POST /register
router.post("/register", asyncHandler(async (req: any, res: any) => {
    const validation = insertHiqMemberSchema.safeParse(req.body);
    if (!validation.success) {
        return sendError(res, 400, validation.error.errors[0].message);
    }

    const result = await hiqService.register(validation.data);
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
router.post("/logout", (req, res) => {
    res.clearCookie('hiq_user_id', { path: '/' });
    res.clearCookie('hiq_partner_auth', { path: '/' });
    return sendSuccess(res, { success: true });
});

// POST /push-token - Save/Update Expo Push Token
router.post("/push-token", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const { token } = req.body;
    if (!token) return sendError(res, 400, "토큰이 필요합니다");

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
