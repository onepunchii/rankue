import { Router } from "express";
import { hiqService } from "../../services/hiqService.js";
import { insertHiqMemberSchema } from "../../../shared/schema.js";
import { sendSuccess, sendError } from "../../utils/response.js";
import { storage } from "../../storage/index.js";
import { requireAuth, AuthRequest } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

const router = Router();

// POST /login - Login with phone number
router.post("/login", asyncHandler(async (req: any, res: any) => {
    const { phone, storeSlug, password } = req.body;
    const result = await hiqService.login(phone, storeSlug, password);

    if (!result.isNew && !result.requiresPassword && result.member) {
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

    try {
        const result = await hiqService.getSecurityQuestion(phone);
        return sendSuccess(res, result);
    } catch (err: any) {
        if (err.message === "USER_NOT_FOUND") return sendError(res, 404, "등록되지 않은 번호입니다");
        if (err.message === "NO_SECURITY_QUESTION") return sendError(res, 400, "보안 질문이 설정되지 않은 계정입니다. 고객센터에 문의해주세요.");
        return sendError(res, 500, err.message);
    }
}));

// POST /reset-pin/verify - Verify answer and reset PIN
router.post("/reset-pin/verify", asyncHandler(async (req: any, res: any) => {
    const { phone, answer, newPin } = req.body;
    if (!phone || !answer || !newPin) return sendError(res, 400, "필수 정보가 누락되었습니다");

    try {
        const result = await hiqService.resetPinBySecurityAnswer(phone, answer, newPin);
        return sendSuccess(res, result);
    } catch (err: any) {
        if (err.message === "INVALID_ANSWER") return sendError(res, 401, "정답이 일치하지 않습니다");
        return sendError(res, 500, err.message);
    }
}));

export default router;
