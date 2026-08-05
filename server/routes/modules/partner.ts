import { Router } from "express";
import { hiqService } from "../../services/hiqService.js";
import { storage } from "../../storage/index.js";
import { sendSuccess, sendError } from "../../utils/response.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { attemptKey, checkRateLimit, registerFailure, clearAttempts } from "./auth.js";

const router = Router();

// POST /partner/login
router.post("/login", asyncHandler(async (req: any, res: any) => {
    const { phone, password } = req.body;
    if (!phone) return sendError(res, 400, "전화번호가 필요합니다.");

    // 일반 로그인과 동일한 무차별 대입 방어. 파트너도 4자리 PIN이라, 무방비면
    // 매장 관리자(그리고 role=admin 계정)까지 전수 탐색으로 뚫린다.
    const key = attemptKey('partner-login', phone, req.ip);
    const rl = checkRateLimit(key);
    if (rl.limited) {
        return sendError(res, 429, `로그인 시도가 너무 많습니다. ${rl.retryAfterSec}초 후 다시 시도해주세요.`);
    }

    const result = await hiqService.partnerLogin(phone, password);

    if (result.success) {
        clearAttempts(key);
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
    registerFailure(key);
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
    'tableLarge', 'tableMedium', 'parkingDescription',
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
// SECURITY: Never trust the client-supplied tier. A billingKey alone does not prove
// payment — it must be verified against PortOne V2 before we grant PREMIUM, otherwise any
// authenticated partner could self-upgrade with an arbitrary string.
router.post("/subscription", requirePartner, asyncHandler(async (req: any, res: any) => {
    const { billingKey, paymentMethod } = req.body;
    if (!billingKey || typeof billingKey !== "string") return sendError(res, 400, "Billing key required");

    const store = await hiqService.getPartnerStore(req.partnerProfileId);
    if (!store) return sendError(res, 404, "매장을 찾을 수 없습니다.");

    // Server-side billing key verification via PortOne V2.
    const portoneSecret = process.env.PORTONE_V2_SECRET;
    if (!portoneSecret) {
        // Fail closed: without the verification secret we cannot confirm payment.
        return sendError(res, 501, "결제 검증 미구성");
    }

    let verified: any;
    try {
        const resp = await fetch(
            `https://api.portone.io/billing-keys/${encodeURIComponent(billingKey)}`,
            { headers: { Authorization: `PortOne ${portoneSecret}` } }
        );
        if (!resp.ok) {
            return sendError(res, 402, "결제 수단 검증에 실패했습니다.");
        }
        verified = await resp.json();
    } catch {
        return sendError(res, 502, "결제 검증 서버에 연결할 수 없습니다.");
    }

    // Confirm the billing key is actually issued (active) before upgrading.
    if (!verified || verified.status !== "ISSUED") {
        return sendError(res, 402, "유효하지 않은 결제 수단입니다.");
    }

    // If our own PortOne store/channel are configured, confirm the key belongs to them.
    const expectedStoreId = process.env.PORTONE_STORE_ID;
    const expectedChannelKey = process.env.PORTONE_CHANNEL_KEY;
    if (expectedStoreId && verified.storeId && verified.storeId !== expectedStoreId) {
        return sendError(res, 402, "유효하지 않은 결제 수단입니다.");
    }
    if (expectedChannelKey && verified.channelKey && verified.channelKey !== expectedChannelKey) {
        return sendError(res, 402, "유효하지 않은 결제 수단입니다.");
    }

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

// POST /partner/tournaments - Create a tournament for the partner's own store
router.post("/tournaments", requirePartner, asyncHandler(async (req: any, res: any) => {
    const store = await hiqService.getPartnerStore(req.partnerProfileId);
    if (!store) return sendError(res, 404, "매장을 찾을 수 없습니다.");

    const b = req.body || {};
    if (!b.title || typeof b.title !== 'string' || !b.title.trim()) {
        return sendError(res, 400, "대회명을 입력해주세요.");
    }
    if (!b.startDate) return sendError(res, 400, "시작 날짜를 선택해주세요.");

    // Whitelist fields (storeId is set from the authenticated partner, never the client);
    // date strings -> Date for Drizzle timestamp columns.
    const data = {
        title: b.title,
        content: b.content ?? null,
        startDate: new Date(b.startDate),
        endDate: b.endDate ? new Date(b.endDate) : null,
        recruitEnd: b.recruitEnd ? new Date(b.recruitEnd) : null,
        gameType: b.gameType,
        matchMethod: b.matchMethod,
        handicapRate: b.handicapRate ?? 100,
        targetScore: b.targetScore ?? null,
        bankShotPoint: b.bankShotPoint ?? 2,
        timeLimit: b.timeLimit ?? 40,
        maxPlayers: b.maxPlayers ?? 32,
        entryFee: b.entryFee ?? 20000,
        prizes: b.prizes ?? null,
    };

    const tournament = await hiqService.createTournament(store.id, data);
    return sendSuccess(res, tournament);
}));

export default router;
