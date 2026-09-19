import { Router } from "express";
import { storage } from "../../storage/index.js";
import { sendSuccess, sendError } from "../../utils/response.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { SUGGESTION_REPLY_TYPE } from "../../lib/suggestionBox.js";
import { randomInt } from "crypto";
import { hashPassword } from "../../services/hiqService.js";

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

// GET /admin/online-game — 온라인당구 게임(시뮬레이터) 이용 현황: 싱글(세션)·멀티(대전)·멀티방·드릴·활성 이용자·일별 추이·상위 이용자
router.get("/online-game", checkSuperAdmin, asyncHandler(async (req: any, res: any) => {
    const days = Math.min(90, Math.max(7, Number(req.query.days) || 30));
    return sendSuccess(res, await storage.sim.adminOverview(days));
}));

// GET /admin/activity — 앱 접속 요약(DAU/WAU/MAU · 최근 7일 세션 · 가입 코호트 리텐션 D1/D7/D30), 2026-09-13 오너
router.get("/activity", checkSuperAdmin, asyncHandler(async (_req: any, res: any) => {
    return sendSuccess(res, await storage.appSessions.summary(8));
}));

router.get("/members", checkSuperAdmin, asyncHandler(async (req: any, res: any) => {
    const members = await storage.getAllMembersForAdmin();
    return sendSuccess(res, members);
}));

/**
 * POST /admin/members/:id/reset-pin — 임시 PIN 발급(2026-09-19 오너: 다대맨 문의 "PIN 을 잊어 애플로 새로 들어왔더니 기록이 다 없다").
 * 전화번호 계정은 가입 때 본인이 정한 4자리 PIN 이 있고 기본값이 없다. 보안 질문 답까지 잊으면 되찾을 길이 없어
 * 사용자가 새 계정을 만들고 기록을 잃는다. 운영자가 문의로 본인을 확인한 뒤 임시 PIN 을 발급해 전달한다.
 * PIN 은 응답으로 **한 번만** 보여 주고 서버 로그에는 남기지 않는다(누가 언제 초기화했는지만 남긴다).
 */
router.post("/members/:id/reset-pin", checkSuperAdmin, asyncHandler(async (req: any, res: any) => {
    const member = await storage.getMemberById(req.params.id);
    if (!member || !member.profileId) return sendError(res, 404, "회원을 찾을 수 없습니다");
    const profile = await storage.getProfile(member.profileId);
    if (!profile || !profile.phone) return sendError(res, 400, "전화번호 계정이 아닙니다(구글·애플 로그인은 PIN 이 없습니다)");
    const pin = String(randomInt(0, 10_000)).padStart(4, "0");
    await storage.updateProfile(profile.id, { password: await hashPassword(pin) });
    console.info("[admin] PIN 초기화", JSON.stringify({ memberId: member.id, profileId: profile.id, by: req.signedCookies?.hiq_partner_auth ?? null }));
    return sendSuccess(res, { pin, name: member.name, phone: profile.phone });
}));

// GET /admin/members/:id/games — 그 회원의 최근 경기(기록 정리용 목록)
router.get("/members/:id/games", checkSuperAdmin, asyncHandler(async (req: any, res: any) => {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));
    return sendSuccess(res, await storage.games.adminMemberGames(req.params.id, limit));
}));

// DELETE /admin/games/:id — 끝난 경기까지 지운다(어드민만). 전적 행·RP·에버리지를 함께 되돌린다.
// 회원용 DELETE /game/:id 는 진행 중인 경기만 지운다 — 끝난 경기는 랭킹에 반영돼 참가자가 지우면 안 되기 때문이다.
// 잘못 만든 판을 억지로 끝낸 기록(1이닝 16점 같은)이 에버리지·하이런을 오염시킬 때 쓴다(2026-09-12 테스터 제보).
router.delete("/games/:id", checkSuperAdmin, asyncHandler(async (req: any, res: any) => {
    const r = await storage.games.adminDeleteFinishedGame(req.params.id);
    if (!r.ok) {
        if (r.reason === "not-found") return sendError(res, 404, "경기를 찾을 수 없습니다");
        return sendError(res, 409, "대진표에 연결된 경기입니다 — 크루 대진을 먼저 정리해야 합니다");
    }
    console.info("[admin] 경기 삭제", JSON.stringify({ gameId: req.params.id, members: r.members.map((m) => ({ name: m.name, rp: m.rpRolledBack })) }));
    return sendSuccess(res, r);
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

// 가맹점 목록 — 시스템 매장(hiq·global)은 제외한다.
// 이 둘은 사업체가 아니라 유저가 소속되는 그릇인데, 목록에 섞여 있으면
// 실제로 계약된 매장이 몇 곳인지 가려진다(오너 확인 2026-08-23).
router.get("/stores", checkSuperAdmin, asyncHandler(async (req: any, res: any) => {
    const { isSystemStore } = await import("../../../shared/systemStores.js");
    const stores = await storage.getAllStores();
    return sendSuccess(res, (stores as any[]).filter((s) => !isSystemStore(s.slug)));
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
    // 선택: 누르면 열 앱 내 경로(예 /online-game). 앱 안 경로만 받는다.
    const rawUrl = String(req.body?.url || "").trim();
    const url = /^\/[A-Za-z0-9_\-./?=&%]*$/.test(rawUrl) && !rawUrl.startsWith("//") ? rawUrl.slice(0, 200) : "";

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
            await notificationService.sendAndSaveNotification({ memberId, title, body, category: "admin", type: "broadcast", ...(url ? { params: { url } } : {}) });
            sent++;
        } catch (e) {
            console.warn(`[admin push] ${memberId} 실패:`, (e as Error)?.message);
        }
    }
    return sendSuccess(res, { sent, total: memberIds.length });
}));

// --- 신고 큐 (2026-09-11, 스토어 심사 SX1 — Apple 1.2 / Play UGC) ---
// 예전 GET /reports 는 늘 빈 배열이었다(admin.repo 자리표시) — 신고가 들어와도 운영자가 볼 곳이 없었다.
const REPORT_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /admin/reports?status=open|handled|all&offset=&limit= — 신고를 대상별로 묶은 큐(미처리 먼저).
router.get("/reports", checkSuperAdmin, asyncHandler(async (req: any, res: any) => {
    const raw = String(req.query.status || "all");
    const filter = raw === "open" || raw === "handled" ? raw : "all";
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));
    const offset = Math.max(0, Math.floor(Number(req.query.offset) || 0));
    return sendSuccess(res, await storage.admin.getReportQueue({ filter, limit, offset }));
}));

// POST /admin/reports/action { targetType, targetId, action }
// 블라인드·해제·삭제·작성자 정지/해제·기각·이의제기 승인/반려. 할 수 있는 조치인지는 서버가 최신 상태로 다시 판단한다
// (services/moderation). 처리한 운영자는 서명된 파트너 쿠키에서만 읽어 기록에 남긴다.
router.post("/reports/action", checkSuperAdmin, asyncHandler(async (req: any, res: any) => {
    const { isReportTargetType, isModerationAction } = await import("../../lib/reportQueue.js");
    const { applyModerationAction } = await import("../../services/moderation.js");
    const { targetType, targetId, action } = req.body || {};
    if (!isReportTargetType(targetType)) return sendError(res, 400, "잘못된 신고 대상입니다");
    if (typeof targetId !== "string" || !REPORT_UUID_RE.test(targetId)) return sendError(res, 400, "잘못된 신고 대상입니다");
    if (!isModerationAction(action)) return sendError(res, 400, "잘못된 조치입니다");
    const result = await applyModerationAction({
        targetType, targetId, action,
        adminProfileId: req.signedCookies?.hiq_partner_auth ?? null,
    });
    if (!result.ok) return sendError(res, result.status, result.message);
    return sendSuccess(res, result);
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

// POST /admin/suggestions/:id/reply — 건의한 회원에게 답장(인앱 알림함 + 네이티브 푸시).
//
// 왜 필요한가: 건의함에는 '읽음' 표시만 있어서, 답을 주려면 남긴 연락처로 전화하는 수밖에
// 없었다(오너 제보 2026-08-19). 건의는 이미 회원 계정(profileId)에 연결돼 저장되므로
// 전화번호를 쓰지 않고 앱 안에서 바로 회신할 수 있다.
//
// 연결 고리: suggestions.userId(=profiles.id) → hiq_members → memberId → 알림.
// 비로그인 건의(userId 없음)나 탈퇴 회원은 회신 대상이 없으므로 명확히 거절한다.
router.post("/suggestions/:id/reply", checkSuperAdmin, asyncHandler(async (req: any, res: any) => {
    const message = String(req.body?.message || "").trim().slice(0, 500);
    if (!message) return sendError(res, 400, "답장 내용을 입력해주세요");

    const { db } = await import("../../db.js");
    const { suggestions } = await import("../../../shared/schema.js");
    const { eq } = await import("drizzle-orm");
    const [s] = await db.select().from(suggestions).where(eq(suggestions.id, req.params.id));
    if (!s) return sendError(res, 404, "건의사항을 찾을 수 없습니다.");
    if (!s.userId) {
        return sendError(res, 409, "회원 계정에 연결되지 않은 건의라 앱 답장을 보낼 수 없습니다. 남긴 연락처로 연락해주세요.");
    }

    const member = await storage.getMemberByProfileId(s.userId);
    if (!member) {
        return sendError(res, 409, "건의한 회원을 찾을 수 없습니다(탈퇴했을 수 있습니다).");
    }

    const { notificationService } = await import("../../services/notificationService.js");
    await notificationService.sendAndSaveNotification({
        memberId: member.id,
        title: "건의하신 내용에 답변이 도착했어요",
        body: message,
        category: "admin",
        type: SUGGESTION_REPLY_TYPE,
        // 어느 건의에 대한 답인지 알림에도 남긴다 — 옛 답장 이관(scripts/backfill-suggestion-replies)은
        // 이 값이 있는 알림을 이미 기록된 것으로 보고 건너뛴다.
        // url 은 싣지 않는다: 회원이 자기 건의를 다시 보는 화면이 없어서, 링크를 달면 알림함에서 누를 때
        // 답장을 읽던 알림함이 닫히고 다른 화면으로 넘어갈 뿐이다(NotificationInbox handleItemClick).
        params: { suggestionId: s.id },
    });

    // 보낸 답장을 건의에 남긴다(오너 요청 2026-09-11 "내가 답장한 내역도 볼 수 있게").
    // 알림이 나간 뒤에 적는다 — 전송이 실패했는데 '보낸 답장'에 뜨면 안 된다.
    // 보낸 사람은 checkSuperAdmin 이 확인한 서명 쿠키의 프로필이다.
    // 기록이 실패해도 답장은 이미 회원에게 갔다 — 여기서 500 을 돌려주면 운영자는 '전송 실패'로 알고 다시 보내
    // 회원이 같은 답장을 두 번 받는다. 로그만 남기고 성공으로 돌려주되, 기록 여부(recorded)를 함께 알린다.
    let recorded = true;
    try {
        await storage.admin.createSuggestionReply({
            suggestionId: s.id,
            message,
            adminProfileId: req.signedCookies?.hiq_partner_auth || null,
        });
    } catch (e) {
        recorded = false;
        console.error("[Suggestion] 답장 기록 실패:", s.id, e);
    }

    // 답장했으면 처리한 건이다 — 읽음 표시를 따로 누르게 하지 않는다.
    await db.update(suggestions).set({ isRead: true }).where(eq(suggestions.id, s.id));
    return sendSuccess(res, { sent: true, recorded, memberName: member.name });
}));

// 모두 읽음 — /suggestions/:id 보다 위에 둬야 "read-all" 이 id 로 안 먹힌다.
router.patch("/suggestions/read-all", checkSuperAdmin, asyncHandler(async (_req: any, res: any) => {
    const count = await storage.markAllSuggestionsRead();
    return sendSuccess(res, { count });
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
        // 초기 PIN — 승인 후에도 관리자가 전화로 알려줄 수 있게(어드민 전용 표면)
        issuedPin: storeListingClaims.issuedPin,
        createdAt: storeListingClaims.createdAt,
        listingName: storeListings.name,
        listingRegion: storeListings.region,
        listingAddress: storeListings.address,
    }).from(storeListingClaims)
        .leftJoin(storeListings, eq(storeListings.code, storeListingClaims.listingCode))
        .orderBy(desc(storeListingClaims.createdAt)).limit(100);
    return sendSuccess(res, claims);
}));

// ── 사장님 권한 발급 코어 ─────────────────────────────────────────────
// 클레임 승인(기존 매장)과 신규 등록 승인(새 매장)이 같은 파이프라인을 쓴다:
// 프로필 find-or-create(+PIN)·이중 매장 가드·파트너 매장 생성·리스팅 인증 마킹·앱 알림.
// PIN 발급·이중 소유 가드는 보안 로직이라 두 라우트에 복제하지 않는다 — 반드시 여기만 수정.
type ListingLike = {
    code: string; name: string; region: string; address: string;
    phone: string | null; rate10Large: number | null; rate10Medium: number | null;
};

async function issueOwnership(opts: {
    applicantName: string;
    applicantPhone: string;
    /** tx 안에서 대상 리스팅을 확보 — 클레임은 기존 행을 그대로, 신규 등록은 insert 후 반환 */
    prepareListing: (tx: any) => Promise<ListingLike>;
    /** tx 마지막 단계 — 신청/클레임 행의 상태 갱신 */
    finalizeTx: (tx: any, listing: ListingLike, storeId: string) => Promise<void>;
}): Promise<
    | { ok: true; storeSlug: string; partnerPhone: string; issuedPin: string | null; notified: boolean; listing: ListingLike }
    | { ok: false; status: number; message: string }
> {
    const { db } = await import("../../db.js");
    const { storeListings, hiqStores, profiles } = await import("../../../shared/schema.js");
    const { eq } = await import("drizzle-orm");
    const { hashPassword } = await import("../../services/hiqService.js");
    const crypto = await import("node:crypto");

    // 사장님 계정 — 같은 전화번호 프로필이 있으면 재사용(기존 비밀번호 유지), 없으면 새 PIN 발급
    const phone = opts.applicantPhone.replace(/[^\d]/g, "");
    let [profile] = await db.select().from(profiles).where(eq(profiles.phone, phone));

    // 이중 매장 가드 — 이 프로필이 이미 파트너 매장을 소유하면 새 매장을 또 만들지 않는다.
    // getPartnerStore 가 소유 매장 중 임의의 첫 행을 집기 때문에(비결정) 이중 소유는 사고다.
    if (profile) {
        const [owned] = await db.select({ id: hiqStores.id, name: hiqStores.name })
            .from(hiqStores).where(eq(hiqStores.ownerId, profile.id));
        if (owned) {
            return { ok: false, status: 409, message: `이 전화번호는 이미 파트너 매장(${owned.name})을 보유 중입니다. 한 계정 1매장 원칙 — 별도 처리 필요` };
        }
    }
    let issuedPin: string | null = null;
    const result = await db.transaction(async (tx) => {
        const listing = await opts.prepareListing(tx);

        if (!profile) {
            issuedPin = String(crypto.randomInt(1000, 10000)); // 파트너 로그인은 4자리 PIN
            [profile] = await tx.insert(profiles).values({
                id: crypto.randomUUID(),
                nickname: opts.applicantName,
                phone,
                password: await hashPassword(issuedPin),
                role: "store_owner",
            }).returning();
        } else if (profile.role === "user") {
            await tx.update(profiles).set({ role: "store_owner" }).where(eq(profiles.id, profile.id));
        }

        // 파트너 매장 — slug 는 디렉토리 코드 기반 (충돌 시 임의 접미)
        let slug = listing.code.toLowerCase();
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
        await opts.finalizeTx(tx, listing, store.id);
        return { slug: store.slug, listing };
    });

    // 승인 통보 — 신청자가 이미 랭큐 회원이면 PIN 자체가 필요 없다: SSO 가 로그인된 유저를
    // 파트너로 자동 진입시키므로(POST /partner/sso), 알림만 보내면 통화가 사라진다.
    let notified = false;
    try {
        const member = await storage.getMemberByProfileId(profile!.id);
        if (member) {
            const { notificationService } = await import("../../services/notificationService.js");
            await notificationService.sendAndSaveNotification({
                memberId: member.id,
                title: "🎉 매장 관리 권한이 열렸습니다",
                body: `${result.listing.name} 사장님 인증이 완료됐어요. 전체 메뉴 → 내 매장 관리에서 바로 들어가실 수 있습니다.`,
                category: "admin",
                type: "partner_approved",
                params: { url: "/partner/dashboard" },
            });
            notified = true;
        }
    } catch (e) {
        // 알림 실패가 승인을 되돌리면 안 된다 — 발급은 이미 끝났다. 관리자는 PIN/전화로 폴백한다.
        console.warn("[issueOwnership] 알림 실패:", (e as Error)?.message);
    }

    return { ok: true, storeSlug: result.slug, partnerPhone: phone, issuedPin, notified, listing: result.listing };
}

// POST /admin/listing-claims/:id/approve
router.post("/listing-claims/:id/approve", checkSuperAdmin, asyncHandler(async (req: any, res: any) => {
    const { db } = await import("../../db.js");
    const { storeListingClaims, storeListings } = await import("../../../shared/schema.js");
    const { eq } = await import("drizzle-orm");

    const [claim] = await db.select().from(storeListingClaims).where(eq(storeListingClaims.id, req.params.id));
    if (!claim) return sendError(res, 404, "클레임을 찾을 수 없습니다");
    if (claim.status !== "pending") return sendError(res, 409, "이미 처리된 클레임입니다");
    const [listing] = await db.select().from(storeListings).where(eq(storeListings.code, claim.listingCode));
    if (!listing) return sendError(res, 404, "매장을 찾을 수 없습니다");
    if (listing.claimed) return sendError(res, 409, "이미 인증된 매장입니다");

    const out = await issueOwnership({
        applicantName: claim.applicantName,
        applicantPhone: claim.applicantPhone,
        prepareListing: async () => listing, // 존재·미클레임 확인 완료된 기존 행
        finalizeTx: async (tx) => {
            await tx.update(storeListingClaims)
                .set({ status: "approved" })
                .where(eq(storeListingClaims.id, claim.id));
        },
    });
    if (!out.ok) return sendError(res, out.status, out.message);

    // 초기 PIN 을 행에 보존 — 관리자가 나중에 전화로 알려줄 수 있게(오너 요청 2026-08-28).
    // 트랜잭션 밖이지만 표시용 메타데이터라 실패해도 승인은 유효하다.
    if (out.issuedPin) {
        try {
            await db.update(storeListingClaims).set({ issuedPin: out.issuedPin } as any)
                .where(eq(storeListingClaims.id, claim.id));
        } catch (e) { console.warn("[claim approve] PIN 보존 실패:", (e as Error)?.message); }
    }

    return sendSuccess(res, {
        approved: true,
        storeSlug: out.storeSlug,
        partnerPhone: out.partnerPhone,
        // 신규 계정일 때만 발급 — 기존 계정은 쓰던 비밀번호 그대로
        issuedPin: out.issuedPin,
        // true 면 앱 알림으로 통보 완료 — 관리자가 전화할 필요 없다
        notified: out.notified,
    });
}));

// ── 신규 매장 등록 신청 (디렉토리에 없는 매장) ────────────────────────
// 접수는 공개 라우트(POST /listings/register), 여기서는 대기열 조회와 승인·거절.
// 승인 = 리스팅 생성(코드 n00001~ 서버 발급) + 지오코딩 + issueOwnership 파이프라인.

// GET /admin/store-registrations — 대기 우선, 최근 100건
router.get("/store-registrations", checkSuperAdmin, asyncHandler(async (_req: any, res: any) => {
    const { db } = await import("../../db.js");
    const { storeRegistrations } = await import("../../../shared/schema.js");
    const { desc, sql: dsql } = await import("drizzle-orm");
    const rows = await db.select().from(storeRegistrations)
        .orderBy(dsql`CASE WHEN ${storeRegistrations.status} = 'pending' THEN 0 ELSE 1 END`, desc(storeRegistrations.createdAt))
        .limit(100);
    return sendSuccess(res, rows);
}));

// POST /admin/store-registrations/:id/approve
router.post("/store-registrations/:id/approve", checkSuperAdmin, asyncHandler(async (req: any, res: any) => {
    const { db } = await import("../../db.js");
    const { storeRegistrations, storeListings } = await import("../../../shared/schema.js");
    const { eq, like, sql: dsql } = await import("drizzle-orm");

    const [reg] = await db.select().from(storeRegistrations).where(eq(storeRegistrations.id, req.params.id));
    if (!reg) return sendError(res, 404, "신청을 찾을 수 없습니다");
    if (reg.status !== "pending") return sendError(res, 409, "이미 처리된 신청입니다");

    // 신규 코드 발급 + 리스팅 삽입 — 사장님 신청과 이용자 제보가 같은 로직을 쓴다.
    const prepareListing = async (tx: any) => {
            // 신규 코드 발급 — 수집분(C#####)과 구분되는 n#####. 소문자인 이유: 파트너 매장
            // slug 가 code.toLowerCase() 로 파생되므로 처음부터 소문자가 왕복 일관적이다.
            // unique(code) 제약이 동시 승인 경쟁을 막는다(충돌 시 트랜잭션 실패 → 재시도).
            const [mx] = await tx.select({ mx: dsql<string | null>`max(${storeListings.code})` })
                .from(storeListings).where(like(storeListings.code, "n%"));
            const next = mx?.mx ? parseInt(mx.mx.slice(1), 10) + 1 : 1;
            const code = `n${String(next).padStart(5, "0")}`;
            const [listing] = await tx.insert(storeListings).values({
                code,
                name: reg.name,
                region: reg.region,
                address: reg.address,
                phone: reg.phone,
                openHours: reg.openHours,
                tableLarge: reg.tableLarge,
                tableMedium: reg.tableMedium,
                tablePocket: reg.tablePocket,
                rate10Large: reg.rate10Large,
                rate10Medium: reg.rate10Medium,
                rate10Pocket: reg.rate10Pocket,
                flatLarge: reg.flatLarge,
                flatMedium: reg.flatMedium,
                flatPocket: reg.flatPocket,
            }).returning();
            return listing as any;
    };
    const finalizeTx = async (tx: any, listing: ListingLike) => {
        await tx.update(storeRegistrations)
            .set({ status: "approved", processedAt: new Date(), listingCode: listing.code })
            .where(eq(storeRegistrations.id, reg.id));
    };
    // 지오코딩 — 실패해도 승인은 유효(좌표 없는 행은 배치 스크립트가 나중에 채운다).
    // 주소의 층·호 표기는 노이즈라 제거(geocode-listings.ts 와 동일 전처리).
    const geocode = async (code: string) => {
        try {
            const { geocodeCity } = await import("../../lib/geocode.js");
            const cleaned = reg.address.replace(/\s+(지하\s*)?\d+층.*$/, "").replace(/\s+[\dB]+호.*$/, "");
            const geo = await geocodeCity(cleaned, "KR");
            if (geo) {
                await db.update(storeListings)
                    .set({ latitude: geo.lat, longitude: geo.lng })
                    .where(eq(storeListings.code, code));
            }
        } catch (e) {
            console.warn("[store-registration approve] 지오코딩 실패:", (e as Error)?.message);
        }
    };

    // 이용자 제보 — 디렉토리에 미인증 매장으로만 올린다. 권한·PIN·파트너 매장은 발급하지
    // 않는다(제보자는 사장님이 아니다). 사장님이 나중에 오면 기존 클레임 절차로 가져간다.
    if ((reg as any).kind === "report") {
        const listing = await db.transaction(async (tx) => {
            const l = await prepareListing(tx);
            await finalizeTx(tx, l);
            return l;
        });
        await geocode(listing.code);
        return sendSuccess(res, { approved: true, kind: "report", listingCode: listing.code });
    }

    const out = await issueOwnership({
        applicantName: reg.applicantName,
        applicantPhone: reg.applicantPhone,
        prepareListing,
        finalizeTx,
    });
    if (!out.ok) return sendError(res, out.status, out.message);
    await geocode(out.listing.code);

    if (out.issuedPin) {
        try {
            await db.update(storeRegistrations).set({ issuedPin: out.issuedPin } as any)
                .where(eq(storeRegistrations.id, reg.id));
        } catch (e) { console.warn("[registration approve] PIN 보존 실패:", (e as Error)?.message); }
    }

    return sendSuccess(res, {
        approved: true,
        listingCode: out.listing.code,
        storeSlug: out.storeSlug,
        partnerPhone: out.partnerPhone,
        issuedPin: out.issuedPin,
        notified: out.notified,
    });
}));

// POST /admin/store-registrations/:id/reject
router.post("/store-registrations/:id/reject", checkSuperAdmin, asyncHandler(async (req: any, res: any) => {
    const { db } = await import("../../db.js");
    const { storeRegistrations } = await import("../../../shared/schema.js");
    const { eq } = await import("drizzle-orm");
    const [reg] = await db.select().from(storeRegistrations).where(eq(storeRegistrations.id, req.params.id));
    if (!reg) return sendError(res, 404, "신청을 찾을 수 없습니다");
    if (reg.status !== "pending") return sendError(res, 409, "이미 처리된 신청입니다");
    await db.update(storeRegistrations)
        .set({ status: "rejected", processedAt: new Date() })
        .where(eq(storeRegistrations.id, req.params.id));
    return sendSuccess(res, { rejected: true });
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
