import { Router } from "express";
import { storage } from "../../storage/index.js";
import { sendSuccess, sendError } from "../../utils/response.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

const router = Router();

// --- Admin Middleware ---
const checkSuperAdmin = asyncHandler(async (req: any, res: any, next: any) => {
    const profileId = req.cookies.hiq_partner_auth;
    if (!profileId) return sendError(res, 401, "로그인이 필요합니다 (Admin)");

    const profile = await storage.getProfile(profileId);
    if (!profile || (profile.role !== "super_admin" && profile.role !== "admin")) {
        return sendError(res, 403, "관리자 권한이 없습니다.");
    }
    next();
});

// --- Admin Routes ---

router.get("/stats", checkSuperAdmin, asyncHandler(async (req: any, res: any) => {
    const stats = await storage.getGlobalStats();
    return sendSuccess(res, stats);
}));

router.get("/leads", checkSuperAdmin, asyncHandler(async (req: any, res: any) => {
    const leads = await storage.getPartnerLeads();
    return sendSuccess(res, leads);
}));

router.post("/leads/:id/status", checkSuperAdmin, asyncHandler(async (req: any, res: any) => {
    const { status } = req.body;
    await storage.updatePartnerLeadStatus(req.params.id, status);
    return sendSuccess(res, { success: true });
}));

router.get("/stores", checkSuperAdmin, asyncHandler(async (req: any, res: any) => {
    const stores = await storage.getAllStores();
    return sendSuccess(res, stores);
}));

router.get("/notices", checkSuperAdmin, asyncHandler(async (req: any, res: any) => {
    const notices = await storage.getNotices();
    return sendSuccess(res, notices);
}));

router.post("/notices", checkSuperAdmin, asyncHandler(async (req: any, res: any) => {
    const notice = await storage.createNotice(req.body);
    return sendSuccess(res, notice);
}));

router.get("/reports", checkSuperAdmin, asyncHandler(async (req: any, res: any) => {
    const reports = await storage.getReportedUsers();
    return sendSuccess(res, reports);
}));

router.post("/users/:id/ban", checkSuperAdmin, asyncHandler(async (req: any, res: any) => {
    await storage.banUser(req.params.id);
    return sendSuccess(res, { success: true });
}));

router.get("/crews", checkSuperAdmin, asyncHandler(async (req: any, res: any) => {
    const crews = await storage.getAllCrews();
    return sendSuccess(res, crews);
}));

router.post("/impersonate/:storeId", checkSuperAdmin, asyncHandler(async (req: any, res: any) => {
    const store = await storage.getStoreById(req.params.storeId);
    if (!store || !store.ownerId) return sendError(res, 404, "매장 또는 소유자를 찾을 수 없습니다.");

    // Impersonation: Set cookie to Owner's Profile ID
    res.cookie('hiq_partner_auth', store.ownerId, {
        maxAge: 30 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        path: '/'
    });

    return sendSuccess(res, { success: true, message: `Switched to ${store.name}` });
}));

router.get("/suggestions", checkSuperAdmin, asyncHandler(async (req: any, res: any) => {
    const suggestions = await storage.getSuggestions();
    return sendSuccess(res, suggestions);
}));

router.patch("/suggestions/:id", checkSuperAdmin, asyncHandler(async (req: any, res: any) => {
    const { isRead } = req.body;
    const suggestion = await storage.markSuggestionRead(req.params.id, isRead === true);
    if (!suggestion) return sendError(res, 404, "건의사항을 찾을 수 없습니다.");
    return sendSuccess(res, suggestion);
}));

// --- Golf Membership Order Routes ---
router.get("/membership/orders", checkSuperAdmin, asyncHandler(async (req: any, res: any) => {
    const orders = await storage.getGolfMembershipOrders();
    return sendSuccess(res, orders);
}));

router.patch("/membership/orders/:id/status", checkSuperAdmin, asyncHandler(async (req: any, res: any) => {
    const { status } = req.body;
    const order = await storage.updateGolfMembershipOrderStatus(req.params.id, status);
    return sendSuccess(res, order);
}));

export default router;
