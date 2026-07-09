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
            path: '/'
        });
        return sendSuccess(res, result);
    }
    return sendError(res, 401, "로그인에 실패했습니다.");
}));

// Helper for protected partner routes
const requirePartner = asyncHandler(async (req: any, res: any, next: any) => {
    const profileId = req.cookies.hiq_partner_auth;
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

// PATCH /partner/store
router.patch("/store", requirePartner, asyncHandler(async (req: any, res: any) => {
    const store = await hiqService.getPartnerStore(req.partnerProfileId);
    if (!store) return sendError(res, 404, "매장을 찾을 수 없습니다.");

    const updated = await hiqService.updateStore(store.id, req.body);
    return sendSuccess(res, updated);
}));

// POST /partner/inquiry - Partner Lead Gen (Auto Register)
router.post("/inquiry", asyncHandler(async (req: any, res: any) => {
    const data = req.body;

    // 1. Create Lead Record (Log)
    await storage.createPartnerLead(data);

    // 2. Auto Register: Create Profile
    let profile = await storage.getProfileByPhone(data.phoneNumber);
    if (!profile) {
        profile = await storage.createProfile({
            phone: data.phoneNumber,
            password: data.password || "1234",
            role: 'store_owner',
            nickname: data.ownerName
        });
    } else {
        if (profile.role === 'user') {
            profile = await storage.updateProfile(profile.id, { role: 'store_owner' });
        }
    }

    // 3. Auto Register: Create Store
    let store = await storage.getStoreByOwnerProfileId(profile.id);
    if (!store) {
        store = await storage.createStore({
            slug: 'store-' + Math.random().toString(36).substring(7),
            name: data.storeName || `${data.ownerName}님의 당구장`,
            ownerId: profile.id,
            themeColor: '#10b981',
            neonColor: '#34d399',
            region: data.region,
            address: data.regionDetail,
        });
    }

    // 4. Auto Login (Issue Cookie)
    res.cookie('hiq_partner_auth', profile.id, {
        maxAge: 30 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        path: '/'
    });

    return sendSuccess(res, { success: true, message: "입점 신청 및 자동 로그인 완료" });
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
