import { Router } from "express";
import { storage } from "../../storage/index.js";
import { sendSuccess, sendError } from "../../utils/response.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

const router = Router();

// --- Admin Middleware ---
const checkSuperAdmin = asyncHandler(async (req: any, res: any, next: any) => {
    // Trust only the SIGNED partner cookie (a forged value is rejected).
    const profileId = req.signedCookies?.hiq_partner_auth;
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

router.get("/members", checkSuperAdmin, asyncHandler(async (req: any, res: any) => {
    const members = await storage.getAllMembersForAdmin();
    return sendSuccess(res, members);
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

// 공지 숨김 토글 · 삭제
router.patch("/notices/:id", checkSuperAdmin, asyncHandler(async (req: any, res: any) => {
    const { db } = await import("../../db.js");
    const { notices } = await import("../../../shared/schema.js");
    const { eq } = await import("drizzle-orm");
    await db.update(notices).set({ hidden: !!req.body?.hidden }).where(eq(notices.id, req.params.id));
    return sendSuccess(res, { success: true });
}));
router.delete("/notices/:id", checkSuperAdmin, asyncHandler(async (req: any, res: any) => {
    const { db } = await import("../../db.js");
    const { notices } = await import("../../../shared/schema.js");
    const { eq } = await import("drizzle-orm");
    await db.delete(notices).where(eq(notices.id, req.params.id));
    return sendSuccess(res, { success: true });
}));

// 푸시함 — 선택한 회원(들)에게 인앱 알림 + 네이티브 푸시 발송.
// memberIds: uuid[] 또는 "all". 인앱 알림함에도 남으므로 토큰 없는 회원도 수신한다.
router.post("/push", checkSuperAdmin, asyncHandler(async (req: any, res: any) => {
    const title = String(req.body?.title || "").trim().slice(0, 60);
    const body = String(req.body?.body || "").trim().slice(0, 200);
    if (!title || !body) return sendError(res, 400, "제목과 내용을 입력해주세요");

    let memberIds: string[];
    if (req.body?.memberIds === "all") {
        const all = await storage.getAllMembersForAdmin();
        memberIds = (all as any[]).map((m) => m.id);
    } else if (Array.isArray(req.body?.memberIds)) {
        const UUID_RE = /^[0-9a-f-]{36}$/i;
        memberIds = req.body.memberIds.filter((id: any) => typeof id === "string" && UUID_RE.test(id)).slice(0, 500);
    } else {
        return sendError(res, 400, "받는 사람을 선택해주세요");
    }
    if (!memberIds.length) return sendError(res, 400, "받는 사람이 없습니다");

    const { notificationService } = await import("../../services/notificationService.js");
    let sent = 0;
    for (const memberId of memberIds) {
        try {
            await notificationService.sendAndSaveNotification({ memberId, title, body, category: "admin", type: "broadcast" });
            sent++;
        } catch (e) {
            console.warn(`[admin push] ${memberId} 실패:`, (e as Error)?.message);
        }
    }
    return sendSuccess(res, { sent, total: memberIds.length });
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

    // Impersonation: Set cookie to Owner's Profile ID.
    // Must be SIGNED with the same options as /partner/login — every guard reads
    // req.signedCookies.hiq_partner_auth, so an unsigned cookie would fail signature
    // verification everywhere (breaking impersonation AND clobbering the admin's own session).
    res.cookie('hiq_partner_auth', store.ownerId, {
        maxAge: 30 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        signed: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production' || !!process.env.VERCEL,
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

// --- 매장 클레임 승인 대기열 ---
// 승인 = 사장님 계정(profile) + 파트너 매장(hiqStores) 자동 발급 + 디렉토리 연결.
// 임시 PIN은 응답에 1회만 노출 — 오너가 사장님께 전화로 전달하는 운영 전제.

// GET /admin/listing-claims — 대기 중 클레임 + 매장 정보
router.get("/listing-claims", checkSuperAdmin, asyncHandler(async (_req: any, res: any) => {
    const { db } = await import("../../db.js");
    const { storeListingClaims, storeListings } = await import("../../../shared/schema.js");
    const { eq, desc } = await import("drizzle-orm");
    const claims = await db.select({
        id: storeListingClaims.id,
        listingCode: storeListingClaims.listingCode,
        applicantName: storeListingClaims.applicantName,
        applicantPhone: storeListingClaims.applicantPhone,
        message: storeListingClaims.message,
        status: storeListingClaims.status,
        createdAt: storeListingClaims.createdAt,
        listingName: storeListings.name,
        listingRegion: storeListings.region,
        listingAddress: storeListings.address,
    }).from(storeListingClaims)
        .leftJoin(storeListings, eq(storeListings.code, storeListingClaims.listingCode))
        .orderBy(desc(storeListingClaims.createdAt)).limit(100);
    return sendSuccess(res, claims);
}));

// POST /admin/listing-claims/:id/approve
router.post("/listing-claims/:id/approve", checkSuperAdmin, asyncHandler(async (req: any, res: any) => {
    const { db } = await import("../../db.js");
    const { storeListingClaims, storeListings, hiqStores, profiles } = await import("../../../shared/schema.js");
    const { eq } = await import("drizzle-orm");
    const { hashPassword } = await import("../../services/hiqService.js");
    const crypto = await import("node:crypto");

    const [claim] = await db.select().from(storeListingClaims).where(eq(storeListingClaims.id, req.params.id));
    if (!claim) return sendError(res, 404, "클레임을 찾을 수 없습니다");
    if (claim.status !== "pending") return sendError(res, 409, "이미 처리된 클레임입니다");
    const [listing] = await db.select().from(storeListings).where(eq(storeListings.code, claim.listingCode));
    if (!listing) return sendError(res, 404, "매장을 찾을 수 없습니다");
    if (listing.claimed) return sendError(res, 409, "이미 인증된 매장입니다");

    // 사장님 계정 — 같은 전화번호 프로필이 있으면 재사용(기존 비밀번호 유지), 없으면 새 PIN 발급
    const phone = claim.applicantPhone.replace(/[^\d]/g, "");
    let [profile] = await db.select().from(profiles).where(eq(profiles.phone, phone));

    // 이중 매장 가드 — 이 프로필이 이미 파트너 매장을 소유하면 새 매장을 또 만들지 않는다.
    // getPartnerStore 가 소유 매장 중 임의의 첫 행을 집기 때문에(비결정) 이중 소유는 사고다.
    if (profile) {
        const [owned] = await db.select({ id: hiqStores.id, name: hiqStores.name })
            .from(hiqStores).where(eq(hiqStores.ownerId, profile.id));
        if (owned) {
            return sendError(res, 409, `이 전화번호는 이미 파트너 매장(${owned.name})을 보유 중입니다. 한 계정 1매장 원칙 — 별도 처리 필요`);
        }
    }
    let issuedPin: string | null = null;
    const result = await db.transaction(async (tx) => {
        if (!profile) {
            issuedPin = String(crypto.randomInt(1000, 10000)); // 파트너 로그인은 4자리 PIN
            [profile] = await tx.insert(profiles).values({
                id: crypto.randomUUID(),
                nickname: claim.applicantName,
                phone,
                password: await hashPassword(issuedPin),
                role: "store_owner",
            }).returning();
        } else if (profile.role === "user") {
            await tx.update(profiles).set({ role: "store_owner" }).where(eq(profiles.id, profile.id));
        }

        // 파트너 매장 — slug 는 디렉토리 코드 기반 (충돌 시 임의 접미)
        let slug = claim.listingCode.toLowerCase();
        const [dup] = await tx.select({ id: hiqStores.id }).from(hiqStores).where(eq(hiqStores.slug, slug));
        if (dup) slug = `${slug}-${crypto.randomBytes(2).toString("hex")}`;
        const [store] = await tx.insert(hiqStores).values({
            slug,
            name: listing.name,
            ownerId: profile.id,
            region: listing.region,
            address: listing.address,
            phone: listing.phone,
            priceLarge: listing.rate10Large ?? undefined,
            priceMedium: listing.rate10Medium ?? undefined,
        }).returning();

        await tx.update(storeListings)
            .set({ claimed: true, claimedStoreId: store.id, updatedAt: new Date() })
            .where(eq(storeListings.code, listing.code));
        await tx.update(storeListingClaims)
            .set({ status: "approved" })
            .where(eq(storeListingClaims.id, claim.id));
        return { storeId: store.id, slug: store.slug };
    });

    return sendSuccess(res, {
        approved: true,
        storeSlug: result.slug,
        partnerPhone: phone,
        // 신규 계정일 때만 발급 — 기존 계정은 쓰던 비밀번호 그대로
        issuedPin,
    });
}));

// POST /admin/listing-claims/:id/reject
router.post("/listing-claims/:id/reject", checkSuperAdmin, asyncHandler(async (req: any, res: any) => {
    const { db } = await import("../../db.js");
    const { storeListingClaims } = await import("../../../shared/schema.js");
    const { eq } = await import("drizzle-orm");
    const [claim] = await db.select().from(storeListingClaims).where(eq(storeListingClaims.id, req.params.id));
    if (!claim) return sendError(res, 404, "클레임을 찾을 수 없습니다");
    if (claim.status !== "pending") return sendError(res, 409, "이미 처리된 클레임입니다");
    await db.update(storeListingClaims).set({ status: "rejected" }).where(eq(storeListingClaims.id, req.params.id));
    return sendSuccess(res, { rejected: true });
}));

export default router;
