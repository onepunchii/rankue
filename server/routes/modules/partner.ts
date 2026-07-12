import { Router } from "express";
import { hiqService } from "../../services/hiqService.js";
import { storage } from "../../storage/index.js";
import { sendSuccess, sendError } from "../../utils/response.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

const router = Router();

// POST /partner/login
router.post("/login", asyncHandler(async (req: any, res: any) => {
    const { phone, password } = req.body;
    if (!phone) return sendError(res, 400, "전화번호가 필요합니다.");

    const result = await hiqService.partnerLogin(phone, password);

    if (result.success) {
        res.cookie('hiq_partner_auth', result.profileId, {
            maxAge: 30 * 24 * 60 * 60 * 1000,
            httpOnly: true,
            signed: true,
            sameSite: 'lax',
            secure: process.env.NODE_ENV === 'production' || !!process.env.VERCEL,
            path: '/'
        });
        return sendSuccess(res, result);
    }
    return sendError(res, 401, "로그인에 실패했습니다.");
}));

// Helper for protected partner routes — trust only the SIGNED partner cookie.
const requirePartner = asyncHandler(async (req: any, res: any, next: any) => {
    const profileId = req.signedCookies?.hiq_partner_auth;
    if (!profileId) return sendError(res, 401, "로그인이 필요합니다 (Partner)");
    req.partnerProfileId = profileId;
    next();
});

// GET /partner/store
router.get("/store", requirePartner, asyncHandler(async (req: any, res: any) => {
    const store = await hiqService.getPartnerStore(req.partnerProfileId);
    if (!store) return sendError(res, 404, "매장을 찾을 수 없습니다.");
    return sendSuccess(res, store);
}));

// PATCH /partner/store — allowlisted fields only. Billing/subscription/ownership are
// NEVER accepted from the client here (they are set by the payment flow), preventing a
// partner from self-granting a PREMIUM subscription or reassigning ownership.
const STORE_EDITABLE = new Set([
    'name', 'region', 'address', 'phone', 'themeColor', 'neonColor',
    'logoText', 'subText', 'description', 'notice', 'openTime', 'closeTime',
    'pricePer10Min', 'priceLarge', 'priceMedium', 'tableCount', 'latitude', 'longitude',
]);
router.patch("/store", requirePartner, asyncHandler(async (req: any, res: any) => {
    const store = await hiqService.getPartnerStore(req.partnerProfileId);
    if (!store) return sendError(res, 404, "매장을 찾을 수 없습니다.");

    const patch: any = {};
    for (const [k, v] of Object.entries(req.body || {})) {
        if (STORE_EDITABLE.has(k)) patch[k] = v;
    }
    const updated = await hiqService.updateStore(store.id, patch);
    return sendSuccess(res, updated);
}));

// POST /partner/inquiry - Partner lead submission (UNAUTHENTICATED, public).
// This ONLY records a lead. It must NOT create/escalate a profile or issue a session
// cookie — doing so previously let anyone take over a store/admin account by phone number.
// Actual partner onboarding happens through /partner/login (password-verified).
router.post("/inquiry", asyncHandler(async (req: any, res: any) => {
    await storage.createPartnerLead(req.body);
    return sendSuccess(res, { success: true, message: "입점 신청이 접수되었습니다. 담당자가 확인 후 연락드립니다." });
}));

// POST /partner/subscription
router.post("/subscription", requirePartner, asyncHandler(async (req: any, res: any) => {
    const { billingKey, paymentMethod } = req.body;
    if (!billingKey) return sendError(res, 400, "Billing key required");

    const store = await hiqService.getPartnerStore(req.partnerProfileId);
    if (!store) return sendError(res, 404, "매장을 찾을 수 없습니다.");

    const nextBillingAt = new Date();
    nextBillingAt.setMonth(nextBillingAt.getMonth() + 1);

    const updated = await storage.updateStore(store.id, {
        billingKey,
        paymentMethod: paymentMethod || "CARD",
        subscriptionTier: "PREMIUM",
        subscriptionStatus: "active",
        nextBillingDate: nextBillingAt
    });

    return sendSuccess(res, updated);
}));

// GET /partner/stats
router.get("/stats", requirePartner, asyncHandler(async (req: any, res: any) => {
    const store = await hiqService.getPartnerStore(req.partnerProfileId);
    if (!store) return sendError(res, 404, "매장을 찾을 수 없습니다.");

    const stats = await storage.getAdminStats(store.id);
    return sendSuccess(res, stats);
}));

// GET /partner/members
router.get("/members", requirePartner, asyncHandler(async (req: any, res: any) => {
    const store = await hiqService.getPartnerStore(req.partnerProfileId);
    if (!store) return sendError(res, 404, "매장을 찾을 수 없습니다.");

    const members = await storage.getStoreMembersWithStats(store.id);
    return sendSuccess(res, members);
}));

export default router;
