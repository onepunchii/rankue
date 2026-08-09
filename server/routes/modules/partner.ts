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

// POST /partner/sso — 이미 유저로 로그인된 세션에서 파트너 자동 진입.
// 전화번호 문자열 비교가 아니라 **계정 연결(member.profileId)** 기준: 유저 세션은 이미
// 비밀번호 인증을 통과했으므로, 같은 profile 이 매장을 소유(또는 관리자)하면 재인증은 중복이다.
router.post("/sso", asyncHandler(async (req: any, res: any) => {
    const userId = req.signedCookies?.hiq_user_id;
    if (!userId) return sendError(res, 401, "로그인이 필요합니다");

    const member = await storage.getMemberById(userId);
    if (!member?.profileId) return sendError(res, 403, "파트너 계정이 아닙니다");
    const profile = await storage.getProfile(member.profileId);
    if (!profile) return sendError(res, 403, "파트너 계정이 아닙니다");

    const store = await storage.getStoreByOwnerProfileId(profile.id);
    const isAdmin = profile.role === "admin" || profile.role === "super_admin";
    if (!store && !isAdmin) return sendError(res, 403, "파트너 계정이 아닙니다");

    res.cookie('hiq_partner_auth', profile.id, {
        maxAge: 30 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        signed: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production' || !!process.env.VERCEL,
        path: '/'
    });
    return sendSuccess(res, { success: true, storeName: store?.name ?? "관리자", role: profile.role });
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

    // 클레임으로 연결된 디렉토리 페이지 정보 — 사장님 대시보드의 "내 매장 페이지" 카드용
    // (활동 크루·멤버 합계 = 이 매장 페이지가 유저에게 어떻게 보이는지의 핵심 지표)
    let listing: any = null;
    try {
        const { db } = await import("../../db.js");
        const { storeListings, hiqCrews } = await import("../../../shared/schema.js");
        const { eq, sql } = await import("drizzle-orm");
        const [l] = await db.select({ code: storeListings.code, description: storeListings.description })
            .from(storeListings).where(eq(storeListings.claimedStoreId, store.id));
        if (l) {
            const [stats] = await db.select({
                crewCount: sql<number>`count(*)::int`,
                memberTotal: sql<number>`coalesce(sum((SELECT count(*)::int FROM hiq_crew_members m WHERE m.crew_id = hiq_crews.id AND m.role != 'pending')), 0)::int`,
            }).from(hiqCrews).where(eq(hiqCrews.baseListingCode, l.code));
            listing = { code: l.code, description: l.description, crewCount: stats?.crewCount ?? 0, crewMemberTotal: stats?.memberTotal ?? 0 };
        }
    } catch (e) {
        console.warn("[partner] listing 조회 실패:", (e as Error)?.message);
    }
    return sendSuccess(res, { ...store, listing });
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

    // 클레임된 디렉토리 페이지 동기화 — 사장님이 여기서 고치면 공개 매장 페이지(/stores/:code)에
    // 그대로 반영된다 (소개·전화·요금·영업시간). 플라이휠 3단계의 핵심 흐름.
    try {
        const { db } = await import("../../db.js");
        const { storeListings } = await import("../../../shared/schema.js");
        const { eq } = await import("drizzle-orm");
        const sync: any = {};
        if (patch.description !== undefined) sync.description = String(patch.description ?? "").slice(0, 2000) || null;
        if (patch.phone !== undefined) sync.phone = patch.phone || null;
        if (patch.priceLarge !== undefined) sync.rate10Large = Number(patch.priceLarge) || null;
        if (patch.priceMedium !== undefined) sync.rate10Medium = Number(patch.priceMedium) || null;
        if (patch.openTime !== undefined || patch.closeTime !== undefined) {
            const open = patch.openTime ?? (updated as any)?.openTime;
            const close = patch.closeTime ?? (updated as any)?.closeTime;
            if (open && close) sync.openHours = `${open} ~ ${close}`;
        }
        if (Object.keys(sync).length) {
            sync.updatedAt = new Date();
            await db.update(storeListings).set(sync).where(eq(storeListings.claimedStoreId, store.id));
        }
    } catch (e) {
        console.warn("[partner] listing 동기화 실패:", (e as Error)?.message);
    }
    return sendSuccess(res, updated);
}));

// POST /partner/inquiry - Partner lead submission (UNAUTHENTICATED, public).
// This ONLY records a lead. It must NOT create/escalate a profile or issue a session
// cookie — doing so previously let anyone take over a store/admin account by phone number.
// Actual partner onboarding happens through /partner/login (password-verified).
router.post("/inquiry", asyncHandler(async (req: any, res: any) => {
    // 무검증 직삽입이었다 — 필수값·화이트리스트·레이트리밋. status 등 내부 필드 주입 차단.
    const { isSubmitLimited } = await import("./listings.js");
    if (isSubmitLimited(req.ip || "?")) return sendError(res, 429, "잠시 후 다시 시도해주세요");
    const ownerName = String(req.body?.ownerName || "").trim().slice(0, 30);
    const phoneNumber = String(req.body?.phoneNumber || "").trim().slice(0, 20);
    if (!ownerName || !/^0\d{1,2}-?\d{3,4}-?\d{4}$/.test(phoneNumber.replace(/\s/g, ""))) {
        return sendError(res, 400, "성함과 올바른 연락처를 입력해주세요");
    }
    await storage.createPartnerLead({
        ownerName,
        phoneNumber,
        storeName: String(req.body?.storeName || "").slice(0, 60) || null,
        region: String(req.body?.region || "").slice(0, 60) || null,
        regionDetail: String(req.body?.regionDetail || "").slice(0, 60) || null,
        businessNumber: String(req.body?.businessNumber || "").slice(0, 20) || null,
        businessLicenseFile: String(req.body?.businessLicenseFile || "").slice(0, 120) || null,
    });
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
