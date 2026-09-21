import { Router } from "express";
import { storage } from "../../storage/index.js";
import { insertGolfBookingSchema, GolfBooking, insertGolfJoinSchema, GolfJoin, insertGolfMembershipOrderSchema } from "../../../shared/schema.js";
import { sendSuccess, sendError } from "../../utils/response.js";
import { requireAuth, AuthRequest } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { notifyCrewChat } from "../../services/crewChatNotify.js";
import { attemptKey, checkRateLimit, registerFailure, clearAttempts } from "./auth.js";
import { z } from "zod";
import { notificationService } from "../../services/notificationService.js";
import { JOIN_TYPES, MAX_SLOTS, normalizeSlots, openSlotCount, slotsFromLegacy, isKoreaCoord, type JoinType } from "../../../shared/golfJoin.js";

const router = Router();

// --- Golf Booking Routes ---
router.get("/bookings", asyncHandler(async (req: AuthRequest, res: any) => {
    // ?applied=1 — 내가 신청한 글(조인·부킹)과 내 상태(2026-09-21 '내 신청' 탭).
    if (req.query.applied === "1") {
        if (!req.userId) return sendError(res, 401, "로그인이 필요합니다");
        const rows = await storage.listMyRequests(req.userId);
        const counted = await withJoinCounts(rows as any[], req.userId);
        // withJoinCounts 가 myJoinStatus 를 다시 채우지만 같은 값이다. 연락처는 확정된 글만.
        return sendSuccess(res, counted);
    }
    // ?mine=1 — 내가 올린 글 전부, 날짜와 무관(2026-09-21 '내역' 시트). 목록은 하루치만 받으므로 따로 둔다.
    if (req.query.mine === "1") {
        if (!req.userId) return sendError(res, 401, "로그인이 필요합니다");
        // 티타임순(asc)이라 하한 없이 limit 만 걸면 **가장 오래된 글부터** 채워 '다가오는'이 잘린다 — 최근 60일부터로 잡고 넉넉히 받는다.
        const mine = await storage.getGolfBookings(undefined, { ownerId: req.userId, includeBlinded: true, sinceDays: 60, limit: 400 });
        return sendSuccess(res, await withJoinCounts(mine as any[], req.userId));
    }
    const date = req.query.date as string | undefined;
    if (!validDate(date) || !validDate(req.query.startDate) || !validDate(req.query.endDate)) return sendError(res, 400, "날짜가 올바르지 않아요");
    // 화면 질의를 그대로 필터로 넘기되, 서버 전용 키(ownerId·includeBlinded·limit)는 지운다 — 남의 글 목록이나 가려진 글을 못 꺼내게.
    const { ownerId: _o, includeBlinded: _b, limit: _l, sinceDays: _s, ...filters } = req.query as Record<string, unknown>;
    const bookings = await storage.getGolfBookings(date, filters);
    return sendSuccess(res, await withJoinCounts(bookings as any[], req.userId));
}));

router.get("/bookings/counts", asyncHandler(async (req: any, res: any) => {
    const { startDate, endDate, viewType } = req.query;
    if (!startDate || !endDate) {
        return sendError(res, 400, "시작일과 종료일은 필수입니다.");
    }
    if (!validDate(startDate) || !validDate(endDate)) return sendError(res, 400, "날짜가 올바르지 않아요");
    // 필터를 그대로 넘긴다 — 예전엔 안 넘겨서 날짜 칩이 "12개" 라고 하는데 목록엔 2개만 있었다(2026-09-09 검토).
    const counts = await storage.getGolfBookingCounts(startDate as string, endDate as string, viewType as string, req.query);
    return sendSuccess(res, counts);
}));

/** 질의로 온 날짜가 없거나(undefined) 읽을 수 있는 날짜인가. 못 읽는 값이 저장소까지 가면 Invalid Date 가 500 을 낸다(2026-09-22 리뷰). */
function validDate(v: unknown): boolean {
    if (v === undefined || v === null || v === "") return true;
    return typeof v === "string" && v.length <= 40 && !Number.isNaN(new Date(v).getTime());
}

/** 매물을 올릴 수 있는 역할. 화면(BookingList.tsx)과 같은 목록을 서버에서도 검사한다 — 화면만 가리면 주소로 뚫린다. */
const BOOKING_WRITER_ROLES = ["admin", "super_admin", "store_owner", "booking_manager"];
const MAX_ITEMS_PER_POST = 40;   // 부킹 시트는 티오프 시간을 여러 개 담아 한 번에 보낸다
/** 한 시간에 올릴 수 있는 글 — 매장·매니저는 재고를 몰아 올리므로 넉넉히, 개인은 도배를 막을 만큼만. */
const postsPerHour = (sellerType: string) => (sellerType === "STORE" ? 400 : 40);

/** 연락 가능한 휴대폰인가. 소셜 가입 회원의 phone 은 "social:google:..." 이라 sms: 링크가 죽는다. */
function cutText(v: unknown, n: number): string | null | undefined {
    if (v === undefined) return undefined;
    if (v === null) return null;
    return typeof v === "string" ? v.slice(0, n) : null;
}

function usablePhone(phone: string | null | undefined): string | null {
    if (!phone || phone.startsWith("social:")) return null;
    const d = phone.replace(/\D/g, "");
    return d.length >= 10 && d.length <= 11 ? phone : null;
}

router.post("/bookings", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    // 신원은 **서버가 정한다**. 예전엔 managerPhone 을 클라이언트가 보냈고 회원 id 컬럼도 없어서,
    // 남의 번호를 매니저로 박아 매물을 올릴 수 있었다 — 문의 전화는 그 사람에게 가고, 그 사람 목록에
    // 자기가 올린 적 없는 매물이 서고, 지울 수 있는 것도 그 사람뿐이었다(2026-09-09 검토).
    const member = await storage.getMemberById(req.userId!);
    if (!member) return sendError(res, 403, "권한이 없습니다");

    // 조인(같이 칠 사람 모집)은 **누구나**, 부킹(티타임 판매·양도)도 **누구나**(2026-09-21 오너 A안). 예전엔 부킹이
    // 매니저·매장 권한 전용이라 일반 회원은 아무것도 올릴 수 없었다. 대신 부킹은 올린 쪽을 적어 카드에 '매장 / 개인 양도'
    // 배지를 단다 — 돈이 먼저 오가는 글이라 보는 사람이 누구 글인지 알아야 한다. 신고 3건이면 자동으로 가려진다(기존).
    // 조인은 연락처가 필요 없고(신청·승인이 앱 안에서 끝난다), 부킹은 문자 문의 버튼이 있어 휴대폰 번호가 있어야 한다.
    const items = Array.isArray(req.body) ? req.body : [req.body];
    // 한 번에·한 시간에 올릴 수 있는 수(2026-09-22 리뷰) — 배열 본문에 상한이 없어 한 요청으로 수천 건을 만들 수 있었다.
    if (items.length === 0 || items.length > MAX_ITEMS_PER_POST) return sendError(res, 400, `한 번에 ${MAX_ITEMS_PER_POST}건까지 올릴 수 있어요. 나눠서 올려 주세요`);
    const allJoin = items.length > 0 && items.every((it: any) => it?.listingType === "JOIN");
    const role = (member as any).role ?? (member.profileId ? (await storage.getProfile(member.profileId) as any)?.role : null);
    const sellerType = BOOKING_WRITER_ROLES.includes(String(role)) ? "STORE" : "PERSONAL";
    const hourCap = postsPerHour(sellerType);
    if ((await storage.countRecentBookingsByOwner(req.userId!, 60)) + items.length > hourCap) return sendError(res, 429, `한 시간에 ${hourCap}건까지 올릴 수 있어요. 잠시 뒤에 다시 올려 주세요`, "TOO_MANY_POSTS");
    const phone = usablePhone(member.phone);
    if (!allJoin && !phone) return sendError(res, 400, "연락 가능한 휴대폰 번호를 먼저 등록해 주세요", "NO_CONTACT_PHONE");

    // 먼저 전부 검증하고, 다 통과해야 넣는다 — 중간 항목에서 400 이 나면 앞 항목만 저장돼 다시 올릴 때 중복이 됐다.
    const validated: any[] = [];

    for (const item of items) {
        // 클라이언트가 보낸 신원 값은 버린다(덮어쓰기가 아니라 제거 — 스키마가 넓어져도 새지 않게).
        const { managerPhone: _p, ownerId: _o, sellerType: _s, ...rest } = item ?? {};
        // 개인은 매장만 쓰는 값을 못 건드린다 — 핫딜 리본은 매장 매물 표시다.
        if (sellerType === "PERSONAL") rest.isHotDeal = false;
        // 조인의 자리·종류·비용·장소(2026-09-21). 자리가 오면 모집 인원은 자리에서 센다 — 두 값이 어긋나지 않게.
        if (rest.listingType === "JOIN") {
            if (rest.slots !== undefined) {
                const slots = normalizeSlots(rest.slots);
                if (!slots) return sendError(res, 400, "자리 구성이 올바르지 않아요(호스트 1 + 모집 자리 1 이상, 최대 4자리)");
                rest.slots = slots;
                rest.joinHeadcount = openSlotCount(slots);
            } else {
                // 자리 없이 온 옛 형식 — 모집 인원을 1~3 으로 묶는다(4인 1팀). 안 묶으면 정원을 아무 숫자로나 만들 수 있었다.
                rest.joinHeadcount = Math.max(1, Math.min(MAX_SLOTS - 1, Math.floor(Number(rest.joinHeadcount)) || MAX_SLOTS - 1));
            }
            if (rest.joinType !== undefined && !JOIN_TYPES.includes(rest.joinType)) return sendError(res, 400, "조인 종류가 올바르지 않아요");
            if (rest.costMode !== undefined && rest.costMode !== "FIXED" && rest.costMode !== "SPLIT") return sendError(res, 400, "비용 방식이 올바르지 않아요");
            if (rest.costMode === "SPLIT" && (rest.greenFee === undefined || rest.greenFee === null)) rest.greenFee = 0;
            if (!isKoreaCoord(rest.lat, rest.lng)) { rest.lat = null; rest.lng = null; }
            rest.venueName = cutText(rest.venueName, 40);
            // 스크린·파크는 골프장 마스터가 없다 — 장소 이름이 곧 코스 이름이다(목록·검색이 courseName 을 본다).
            if ((rest.joinType === "SCREEN" || rest.joinType === "PARK") && !rest.courseName) { rest.courseName = rest.venueName ?? ""; rest.courseId = rest.courseId ?? "venue"; }
        }
        // 공개되는 자유 입력은 서버에서 자른다 — 화면 maxLength 는 API 로 우회된다.
        // 길이 제한이 없으면 글 본문에 계좌번호·안내문을 통째로 붙일 수 있다(2026-09-09 검토).
        const cut = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : v);
        const data = {
            ...rest,
            comment: cut(rest.comment, 300),
            policyCustomText: cut(rest.policyCustomText, 300),
            blindName: cut(rest.blindName, 30),
            joinCondition: cut(rest.joinCondition, 200),
            courseName: cut(rest.courseName, 60),
            datetime: new Date(item.datetime),
            ownerId: req.userId,
            managerPhone: phone ?? "",
            sellerType: rest.listingType === "JOIN" ? null : sellerType,
        };

        const validation = insertGolfBookingSchema.safeParse(data);
        if (!validation.success) {
            return sendError(res, 400, validation.error.message);
        }

        validated.push(validation.data);
    }

    const results: GolfBooking[] = [];
    for (const data of validated) results.push(await storage.createGolfBooking(data as any));

    return sendSuccess(res, results);
}));

router.delete("/bookings/:id", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    if (!UUID.test(req.params.id)) return sendError(res, 404, "삭제할 예약이 없거나 권한이 없습니다");
    // 내리기 전에 알릴 사람을 먼저 본다 — 신청 행은 글과 함께 cascade 로 지워진다.
    const requesters = await storage.activeRequesterIds(req.params.id);
    const before: any = await storage.getGolfBooking(req.params.id);
    const member = await storage.getMemberById(req.userId!);
    if (!member?.phone) return sendError(res, 403, "권한이 없습니다");
    // 운영자는 아무 매물이나 내릴 수 있다 — 사기 글을 내릴 방법이 없으면 신고가 무의미하다(2026-09-09).
    const role = (member as any).role ?? (member.profileId ? (await storage.getProfile(member.profileId) as any)?.role : null);
    const isAdmin = role === "admin" || role === "super_admin";
    // 그 외에는 등록자 본인만. 옛 행(owner_id 가 빈 행)은 번호로 되짚는다.
    const deleted = isAdmin
        ? await storage.deleteGolfBooking(req.params.id)
        : await storage.deleteGolfBooking(req.params.id, member.phone, req.userId!);
    if (!deleted) return sendError(res, 404, "삭제할 예약이 없거나 권한이 없습니다");
    // 글과 함께 그 방도 닫는다 — 안 지우면 아무도 못 들어가는 방의 메시지만 남는다(명단이 글에서 나오므로 전원 403).
    await storage.chat.deleteRoom(`listing:${req.params.id}`).catch((e) => console.error("[ListingRoomCleanup]", e));
    // 확정·대기 중이던 사람에게 알린다(2026-09-21) — 예전엔 글이 사라진 것을 아무도 몰랐다.
    if (before && requesters.length > 0) {
        const isJoin = before.listingType === "JOIN";
        await Promise.allSettled(requesters.map((r) => notificationService.sendAndSaveNotification({
            memberId: r.memberId, title: isJoin ? "조인 글이 내려갔어요" : "부킹 글이 내려갔어요",
            body: `${r.status === "accepted" ? before.courseName : listingName(before)} ${teeText(before)} 글을 올린 분이 내렸어요.${r.status === "accepted" ? " 확정됐던 자리라 다시 찾아보셔야 해요." : ""}`,
            category: "GOLF", type: "JOIN", pref: "golf", params: { url: `/golf/booking-list?view=${isJoin ? "JOIN" : "BOOKING"}` },
        }).catch((e) => console.error("[GolfJoinNotify]", e))));
    }
    return sendSuccess(res, { success: true });
}));


/**
 * 한 건만 조회. 공유 링크(/golf/booking-list/<id>)를 받은 사람이 그 티타임의 날짜를 모르면
 * 목록이 오늘로 열려 글이 안 보인다 — 화면이 id 로 날짜를 되짚을 때 쓴다(2026-09-10).
 * 가려진 매물은 안 준다.
 */
router.get("/bookings/:id", asyncHandler(async (req: AuthRequest, res: any) => {
    if (!UUID.test(req.params.id)) return sendError(res, 404, "티타임을 찾을 수 없어요");
    const booking: any = await storage.getGolfBooking(req.params.id);
    if (!booking || booking.isBlinded) return sendError(res, 404, "티타임을 찾을 수 없어요");
    const [withCounts] = await withJoinCounts([booking], req.userId);
    return sendSuccess(res, withCounts);
}));

// --- Golf Join Routes ---
// ── 조인 신청 ──────────────────────────────────────────────────────────────
// 그전엔 '조인 신청하기' 가 문자 앱만 열고 아무 기록도 안 남겼다. 누가 신청했는지·몇 명 찼는지·
// 안 나타났는지가 전부 없었다(2026-09-09 검토). 크루 안에서 조인을 열려면 이게 먼저다.
const DEFAULT_JOIN_CAPACITY = 3;   // 4인 1팀에서 방장을 뺀 자리

router.post("/bookings/:id/apply", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    if (!UUID.test(req.params.id)) return sendError(res, 404, "조인 글을 찾을 수 없어요");
    const booking: any = await storage.getGolfBooking(req.params.id);
    if (!booking || booking.isBlinded) return sendError(res, 404, "글을 찾을 수 없어요");
    const isJoin = booking.listingType === "JOIN";
    if (booking.ownerId && booking.ownerId === req.userId) return sendError(res, 400, isJoin ? "내가 올린 조인이에요" : "내가 올린 부킹이에요");
    if (new Date(booking.datetime).getTime() <= Date.now()) return sendError(res, 400, "이미 지난 티타임이에요");
    // 부킹 예약 신청(2026-09-21 오너: "푸시로 승부") — 문자 대신 앱 안에서 신청→승인→확정. 인원 1~4.
    const headcount = isJoin ? 1 : Math.max(1, Math.min(4, Math.floor(Number(req.body?.headcount)) || 1));

    const capacity = joinCapacity(booking);
    const r = await storage.applyToJoin(req.params.id, req.userId!, capacity, headcount);
    if (r === "already") return sendError(res, 409, "이미 신청했어요", "ALREADY_APPLIED");
    if (r === "rejected") return sendError(res, 403, "올린 분이 받지 않은 신청이라 다시 신청할 수 없어요", "APPLY_REJECTED");
    if (r === "cooldown") return sendError(res, 429, "방금 취소했어요. 1분 뒤에 다시 신청해 주세요", "APPLY_COOLDOWN");
    if (r === "too_many") return sendError(res, 429, "이 글에는 더 신청할 수 없어요(취소 3번)", "APPLY_TOO_MANY");
    if (r === "full") return sendError(res, 409, isJoin ? "자리가 다 찼어요" : "이미 예약이 확정된 티타임이에요", "JOIN_FULL");
    // 올린 사람에게 알린다 — 승인제라 그 사람이 봐야 다음이 있다.
    // ⚠️ 알림은 **기다린다** — 서버리스(Vercel)는 응답을 보내면 실행이 얼어붙어 기다리지 않은 푸시가 통째로 사라진다
    // (2026-09-21 오너: "호스트한테 알림이 잘 안 와요" 의 원인). 이 파일의 모든 알림이 같은 규칙이다.
    if (booking.ownerId) {
        const me = await storage.getMemberById(req.userId!);
        await notificationService.sendAndSaveNotification({
            memberId: booking.ownerId,
            title: isJoin ? "조인 신청이 왔어요" : "예약 신청이 왔어요",
            body: isJoin
                ? `${me?.name ?? "회원"}님이 ${booking.courseName} 조인에 신청했어요. 승인해 주세요.`
                : `${me?.name ?? "회원"}님 · ${headcount}명 · ${booking.courseName} ${teeText(booking)} — 승인해 주세요.`,
            category: "GOLF", type: "JOIN", pref: "golf", params: { url: `/golf/booking-list/${booking.id}?view=${isJoin ? "JOIN" : "BOOKING"}` },
        }).catch((e) => console.error("[GolfJoinNotify]", e));
    }
    return sendSuccess(res, { applied: true });
}));

/** 알림·메시지에 쓰는 글 이름 — 비공개(isBlind) 글은 확정 전 사람에게도 가는 알림이라 가명으로. */
function listingName(booking: { isBlind?: boolean | null; blindName?: string | null; courseName: string }): string {
    return booking.isBlind ? (booking.blindName || "비공개 골프장") : booking.courseName;
}

/** 푸시 본문용 티타임 "9/25 07:40"(한국시각). */
function teeText(booking: { datetime: Date | string }): string {
    const d = new Date(booking.datetime);
    const k = new Date(d.getTime() + 9 * 3_600_000);
    return `${k.getUTCMonth() + 1}/${k.getUTCDate()} ${String(k.getUTCHours()).padStart(2, "0")}:${String(k.getUTCMinutes()).padStart(2, "0")}`;
}

/** 정원 = 모집 자리 수. 자리가 없는 옛 글은 모집 인원, 그것도 없으면 기본 3. 부킹은 1 — 티타임 하나는 한 팀에게만 확정된다. */
function joinCapacity(booking: any): number {
    if (booking.listingType !== "JOIN") return 1;
    const slots = Array.isArray(booking.slots) ? normalizeSlots(booking.slots) : null;
    if (slots) return openSlotCount(slots);
    // 옛 글의 모집 인원도 4인 1팀 안으로 묶는다 — 자리 없이 저장된 큰 숫자가 그대로 정원이 되지 않게.
    return Number(booking.joinHeadcount) > 0 ? Math.min(MAX_SLOTS - 1, Number(booking.joinHeadcount)) : openSlotCount(slotsFromLegacy(booking.joinHeadcount, booking.joinCondition));
}

/**
 * POST /bookings/:id/applicants/:memberId/decision — 호스트의 승인·거절(2026-09-21 오너: "호스트 승인제").
 * 승인은 정원 안에서만 된다. 결과는 신청한 사람에게 푸시로 간다.
 */
router.post("/bookings/:id/applicants/:memberId/decision", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    if (!UUID.test(req.params.id) || !UUID.test(req.params.memberId)) return sendError(res, 404, "조인 글을 찾을 수 없어요");
    const booking: any = await storage.getGolfBooking(req.params.id);
    if (!booking) return sendError(res, 404, "조인 글을 찾을 수 없어요");
    if (!(await canManageBooking(req, booking))) return sendError(res, 403, "글쓴이만 할 수 있어요");
    const accept = req.body?.accept === true;
    const isJoin = booking.listingType === "JOIN";
    if (accept && new Date(booking.datetime).getTime() <= Date.now()) return sendError(res, 400, "이미 지난 티타임이에요", "TEE_TIME_PASSED");
    const r = await storage.decideJoinRequest(req.params.id, req.params.memberId, accept, joinCapacity(booking));
    if (r === "full") return sendError(res, 409, isJoin ? "자리가 다 찼어요" : "이미 다른 분께 확정한 티타임이에요", "JOIN_FULL");
    if (r === "gone") return sendError(res, 409, "대기 중인 신청이 아니에요");
    // 확정되면 대화방에 들어온다(2026-09-21 채팅) — 시스템 메시지로 알리고, 푸시는 방으로 바로 보낸다.
    if (accept) {
        const who = await storage.getMemberById(req.params.memberId);
        await storage.chat.addMessage({ key: `listing:${booking.id}`, senderId: null, type: "system", message: `${who?.name ?? "회원"}님이 확정됐어요. 이제 여기서 대화해요.` })
            .catch((e) => console.error("[ListingChatSystem]", e));
    }
    // 이번 승인으로 자리가 다 찼으면 남은 대기자에게 알린다(조인·부킹 공통). 거절로 돌리지는 않는다 —
    // 거절은 재신청이 막히는 최종 상태라(2026-09-22), 확정자가 빠져 자리가 다시 나면 이 사람들이 돌아올 수 있어야 한다.
    if (accept) {
        const counts = await storage.countJoinRequests([booking.id]);
        if ((counts.get(booking.id)?.accepted ?? 0) >= joinCapacity(booking)) {
            const waiting = await storage.pendingRequesterIds(booking.id);
            await Promise.allSettled(waiting.map((memberId) => notificationService.sendAndSaveNotification({
                memberId, title: isJoin ? "조인 자리가 다 찼어요" : "예약이 다른 분께 확정됐어요",
                body: `${listingName(booking)} ${teeText(booking)} — 자리가 다시 나면 알려 드릴게요. 기다리기 싫으면 신청을 취소해도 돼요.`,
                category: "GOLF", type: "JOIN", pref: "golf", params: { url: `/golf/booking-list/${booking.id}?view=${isJoin ? "JOIN" : "BOOKING"}` },
            }).catch((e) => console.error("[GolfJoinNotify]", e))));
        }
    }
    await notificationService.sendAndSaveNotification({
        memberId: req.params.memberId,
        title: accept ? (isJoin ? "조인이 확정됐어요" : "예약이 확정됐어요") : (isJoin ? "조인 신청이 거절됐어요" : "예약 신청이 거절됐어요"),
        body: accept
            ? (isJoin ? `${booking.courseName} ${teeText(booking)} 자리가 확정됐어요. 채팅방이 열렸어요.` : `${booking.courseName} ${teeText(booking)} 예약이 확정됐어요. 연락처와 채팅방이 열렸어요.`)
            : `${listingName(booking)} ${teeText(booking)}은 이번엔 함께하지 못하게 됐어요.`,
        category: "GOLF", type: "JOIN", pref: "golf",
        params: { url: accept ? `/chat/listing/${booking.id}` : `/golf/booking-list/${booking.id}?view=${isJoin ? "JOIN" : "BOOKING"}` },
    }).catch((e) => console.error("[GolfJoinNotify]", e));
    return sendSuccess(res, { status: accept ? "accepted" : "rejected" });
}));

/**
 * GET /places?q= — 스크린·파크 장소 검색(카카오 로컬). KAKAO_REST_KEY 가 없으면 501 을 주고 화면은 이름 직접 입력으로 간다.
 * 좌표가 있어야 "내 주변" 정렬이 된다 — 그래서 키가 생기면 이 경로 하나로 조인이 지도 위에 선다.
 */
router.get("/places", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const key = process.env.KAKAO_REST_KEY;
    const q = String(req.query.q ?? "").trim().slice(0, 40);
    if (!key) return sendError(res, 501, "장소 검색을 아직 쓸 수 없어요", "NO_PLACE_API");
    if (q.length < 2) return sendSuccess(res, []);
    const u = new URL("https://dapi.kakao.com/v2/local/search/keyword.json");
    u.searchParams.set("query", q);
    u.searchParams.set("size", "8");
    const lat = Number(req.query.lat), lng = Number(req.query.lng);
    if (isKoreaCoord(lat, lng)) { u.searchParams.set("x", String(lng)); u.searchParams.set("y", String(lat)); u.searchParams.set("sort", "distance"); }
    const r = await fetch(u, { headers: { Authorization: `KakaoAK ${key}` } });
    if (!r.ok) return sendError(res, 502, "장소 검색이 잠시 안 돼요");
    const j = await r.json() as { documents?: any[] };
    return sendSuccess(res, (j.documents ?? []).map((d) => ({
        name: String(d.place_name ?? ""), address: String(d.road_address_name || d.address_name || ""),
        lat: Number(d.y), lng: Number(d.x), category: String(d.category_name ?? ""),
    })).filter((d) => d.name && isKoreaCoord(d.lat, d.lng)));
}));

router.delete("/bookings/:id/apply", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    if (!UUID.test(req.params.id)) return sendError(res, 404, "신청 내역이 없어요");
    // 티타임이 지난 뒤에는 못 무른다. 안 막으면 안 나타난 사람이 뒤늦게 '취소' 를 눌러
    // 노쇼 표시를 피해 갈 수 있다 — 노쇼는 status 가 'applied' 인 사람만 찍을 수 있기 때문이다.
    const booking: any = await storage.getGolfBooking(req.params.id);
    if (booking && new Date(booking.datetime).getTime() <= Date.now()) {
        return sendError(res, 400, "이미 지난 티타임이라 취소할 수 없어요", "TEE_TIME_PASSED");
    }
    // 확정됐던 사람이 빠지면 방에도 남긴다(취소 전에 명단을 봐야 한다)
    const wasInRoom = booking ? await storage.chat.canAccess({ kind: "listing", id: req.params.id, key: `listing:${req.params.id}` }, req.userId!) : false;
    const ok = await storage.cancelJoinRequest(req.params.id, req.userId!);
    if (!ok) return sendError(res, 404, "신청 내역이 없어요");
    // 확정됐던 사람이 빠졌다 = 자리가 다시 났다. 기다리던 사람들에게 알린다(호스트가 그중에서 다시 승인한다).
    if (wasInRoom && booking && booking.ownerId !== req.userId) {
        const isJoinListing = booking.listingType === "JOIN";
        const waiting = await storage.pendingRequesterIds(req.params.id);
        await Promise.allSettled(waiting.map((memberId) => notificationService.sendAndSaveNotification({
            memberId, title: "자리가 다시 났어요", body: `${listingName(booking)} ${teeText(booking)} — 확정됐던 분이 빠졌어요. 올린 분이 승인하면 알려 드릴게요.`,
            category: "GOLF", type: "JOIN", pref: "golf", params: { url: `/golf/booking-list/${booking.id}?view=${isJoinListing ? "JOIN" : "BOOKING"}` },
        }).catch((e) => console.error("[GolfJoinNotify]", e))));
    }
    if (wasInRoom && booking?.ownerId !== req.userId) {
        const me = await storage.getMemberById(req.userId!);
        await storage.chat.addMessage({ key: `listing:${req.params.id}`, senderId: null, type: "system", message: `${me?.name ?? "회원"}님이 빠졌어요.` })
            .catch((e) => console.error("[ListingChatSystem]", e));
    }
    // 올린 사람이 모르고 있으면 안 된다 — 확정해 둔 사람이 빠지면 자리가 다시 비는 일이다(2026-09-21).
    if (booking?.ownerId) {
        const me = await storage.getMemberById(req.userId!);
        const isJoin = booking.listingType === "JOIN";
        await notificationService.sendAndSaveNotification({
            memberId: booking.ownerId, title: isJoin ? "조인 신청이 취소됐어요" : "예약 신청이 취소됐어요",
            body: `${me?.name ?? "회원"}님이 ${booking.courseName} ${teeText(booking)} 신청을 취소했어요.`,
            category: "GOLF", type: "JOIN", pref: "golf", params: { url: `/golf/booking-list/${booking.id}?view=${isJoin ? "JOIN" : "BOOKING"}` },
        }).catch((e) => console.error("[GolfJoinNotify]", e));
    }
    return sendSuccess(res, { applied: false });
}));

/**
 * 이 조인 글의 주인인가. 운영자도 통과시킨다(사기 글 정리).
 *
 * 전화번호로 되짚는 길은 **일부러 안 둔다**. manager_phone 은 2026-09-09 이전에 클라이언트가 보내던
 * 자기신고 문자열이라, 그걸 신원으로 쓰면 남의 번호를 박아 둔 글의 신청자 명단(이름·사진·노쇼 이력)이
 * 그 번호의 주인에게 열린다. owner_id 가 빈 옛 글은 운영자가 맡는다.
 */
async function canManageBooking(req: AuthRequest, booking: any): Promise<boolean> {
    if (booking.ownerId && booking.ownerId === req.userId) return true;
    const member = await storage.getMemberById(req.userId!);
    if (!member) return false;
    const role = (member as any).role ?? (member.profileId ? (await storage.getProfile(member.profileId) as any)?.role : null);
    return role === "admin" || role === "super_admin";
}

/** 주소로 들어온 id 가 uuid 꼴인가. 아니면 Postgres 가 던져 500 이 난다 — 없는 것으로 보고 404 를 준다. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 신청자 목록 — 글쓴이(와 운영자)만.
 * 신청이 쌓여도 볼 화면이 없으면 글쓴이는 여전히 누가 오는지 모른다. 노쇼 표시도 여기서 한다.
 */
router.get("/bookings/:id/applicants", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    if (!UUID.test(req.params.id)) return sendError(res, 404, "조인 글을 찾을 수 없어요");
    const booking: any = await storage.getGolfBooking(req.params.id);
    if (!booking) return sendError(res, 404, "조인 글을 찾을 수 없어요");
    if (!(await canManageBooking(req, booking))) return sendError(res, 403, "글쓴이만 볼 수 있어요");
    const applicants = await storage.listJoinApplicants(req.params.id);
    return sendSuccess(res, {
        teeTime: booking.datetime,
        applicants,
    });
}));

/**
 * 안 나타났다고 표시한다(되돌리기 포함). 글쓴이·운영자만, 그리고 **티타임이 지난 뒤에만**.
 * 치기도 전에 노쇼를 찍을 수 있으면 그건 기록이 아니라 협박 수단이 된다.
 */
router.post("/bookings/:id/applicants/:memberId/noshow", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    if (!UUID.test(req.params.id) || !UUID.test(req.params.memberId)) return sendError(res, 404, "조인 글을 찾을 수 없어요");
    const booking: any = await storage.getGolfBooking(req.params.id);
    if (!booking) return sendError(res, 404, "조인 글을 찾을 수 없어요");
    if (!(await canManageBooking(req, booking))) return sendError(res, 403, "글쓴이만 표시할 수 있어요");
    if (new Date(booking.datetime).getTime() > Date.now()) {
        return sendError(res, 400, "티타임이 지난 뒤에 표시할 수 있어요", "TEE_TIME_NOT_PASSED");
    }
    const noShow = req.body?.noShow !== false;
    const r = await storage.setJoinNoShow(req.params.id, req.params.memberId, noShow, joinCapacity(booking));
    if (r === "full") return sendError(res, 409, "그 사이 자리가 차서 되돌릴 수 없어요", "JOIN_FULL");
    if (r === "gone") return sendError(res, 404, noShow ? "신청 중인 사람이 아니에요" : "노쇼로 표시된 사람이 아니에요");
    return sendSuccess(res, { noShow });
}));

/**
 * 크루 채팅방에 부킹 카드를 올린다.
 *
 * 왜 서버가 만드나: 화면에서 /crews/:id/chats 로 metadata 를 실어 보내고 있었는데, 그 라우트는
 * metadata 를 **버린다**(클라이언트가 카드를 지정할 수 있으면 가짜 정산·예약 카드를 주입할 수 있어서).
 * 그래서 크루방에는 카드가 아니라 눌리지 않는 글자 덩어리만 올라갔다(2026-09-09 검토).
 * 이제 서버가 실제 매물을 읽어 카드를 만든다 — 없는 부킹으로 카드를 만들 수 없다.
 */
router.post("/bookings/:id/share/crew", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const crewId = String(req.body?.crewId ?? "");
    if (!crewId || !UUID.test(crewId)) return sendError(res, 400, "크루를 골라 주세요");
    if (!UUID.test(req.params.id)) return sendError(res, 404, "티타임을 찾을 수 없어요");

    const booking: any = await storage.getGolfBooking(req.params.id);
    if (!booking || booking.isBlinded) return sendError(res, 404, "티타임을 찾을 수 없어요");

    const membership = await storage.getCrewMembership(crewId, req.userId!);
    if (!membership || membership.role === "pending") return sendError(res, 403, "크루 멤버만 공유할 수 있어요");

    const crewData = await storage.getCrew(crewId);
    // 당구 크루에 골프 부킹을 올리지 않는다 — 두 종목은 아예 다른 플랫폼으로 본다.
    if (crewData?.crew?.sportCategory && crewData.crew.sportCategory !== "GOLF") {
        return sendError(res, 400, "골프 크루에만 공유할 수 있어요", "NOT_GOLF_CREW");
    }

    const name = booking.isBlind ? (booking.blindName || "비공개 골프장") : booking.courseName;
    const when = new Date(booking.datetime).toLocaleString("ko-KR", {
        month: "long", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit",
        hour12: false, timeZone: "Asia/Seoul",
    });
    const kstDay = new Date(booking.datetime).toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
    const view = booking.listingType === "JOIN" ? "JOIN" : "BOOKING";
    const label = view === "JOIN" ? "조인" : "부킹";

    const chat = await storage.createCrewChat({
        crewId,
        senderId: req.userId,
        // 카드가 못 그려지는 옛 앱에서도 읽히도록 본문에 요점을 남긴다.
        message: `⛳️ [${label} 공유] ${name} / ${when} / 그린피 ${Number(booking.greenFee).toLocaleString()}원`,
        type: "text",
        metadata: {
            type: "GOLF_BOOKING",
            bookingId: booking.id,
            courseName: name,
            datetime: booking.datetime,
            greenFee: booking.greenFee,
            listingType: view,
            // 날짜를 함께 싣는다 — 받는 사람이 눌렀을 때 목록이 그 날짜로 열려야 글이 보인다.
            date: kstDay,
        },
    } as any);

    await notifyCrewChat({
        crewId,
        senderId: req.userId!,
        preview: `${label} 공유 · ${name}`,
        tag: "[GolfShareNotif]",
    });

    return sendSuccess(res, chat);
}));

/** 목록에 '몇 명 찼는지'와 '내가 신청했는지'를 얹는다 — 화면이 그걸 알아야 신청/취소를 가른다. */
async function withJoinCounts(rows: any[], userId?: string) {
    const ids = rows.map((r) => r.id);
    const [counts, mine] = await Promise.all([
        storage.countJoinRequests(ids),
        userId ? storage.myJoinStatuses(userId, ids) : Promise.resolve(new Map<string, string>()),
    ]);
    return rows.map((r) => {
        const c = counts.get(r.id);
        const myStatus = mine.get(r.id) ?? null;
        // 연락처(2026-09-21): 매장 글은 번호가 영업용이라 그대로, 개인 양도 글은 **올린 사람과 확정된 신청자**에게만.
        // 예약 신청이 앱 안에서 끝나므로 확정 전엔 번호가 필요 없다 — 모두에게 열면 전화번호 수집 창구가 된다.
        // ⚠️ 2026-09-22 리뷰: 이 조건이 `listingType !== "BOOKING"` 으로 시작해 **조인 글은 호스트 개인 번호가 누구에게나** 나갔다.
        // 공개는 매장 부킹 하나뿐이다. 조인과 개인 양도는 올린 사람·확정된 사람에게만.
        const isOwner = !!userId && r.ownerId === userId;
        const isConfirmed = myStatus === "accepted" || myStatus === "noshow";
        const isStoreBooking = r.listingType !== "JOIN" && r.sellerType !== "PERSONAL";
        const showPhone = isStoreBooking || isOwner || myStatus === "accepted";
        const { managerPhone, ...safe } = r;
        // 비공개(isBlind) 글은 실명·장소·좌표를 서버에서 가린다 — 화면만 가명으로 바꿔 그리면 응답 JSON 과 검색 결과에 실명이 그대로 있다.
        // 지역(region)은 남긴다: 지역 필터가 서버에서 걸리므로 가려도 걸러지는 것으로 드러나고, 가명 글도 지역으로는 찾을 수 있어야 한다.
        const mask = !!r.isBlind && !isOwner && !isConfirmed;
        if (mask) Object.assign(safe, { courseName: r.blindName || "비공개 골프장", courseId: null, venueName: null, lat: null, lng: null });
        return {
            ...safe,
            managerPhone: showPhone ? managerPhone : null,
            // joinApplied 는 **자리를 차지한** 인원(승인됨) — 화면의 n/정원. 대기는 따로.
            joinApplied: c?.accepted ?? 0,
            joinPending: c?.pending ?? 0,
            joinCapacity: joinCapacity(r),
            myJoinStatus: myStatus,
            joinedByMe: myStatus === "applied" || myStatus === "accepted",
        };
    });
}

router.get("/joins", asyncHandler(async (req: AuthRequest, res: any) => {
    const date = req.query.date as string | undefined;
    if (!validDate(date)) return sendError(res, 400, "날짜가 올바르지 않아요");
    const joins = await storage.getGolfJoins({ date, ...req.query });
    return sendSuccess(res, await withJoinCounts(joins as any[], req.userId));
}));

/*
 * POST/DELETE /joins 는 2026-09-09 제거했다.
 * golf_joins 표에 쓰는 라우트였는데 읽는 곳이 한 군데도 없었다 — GET /joins 는 golf_bookings 에서
 * listing_type='JOIN' 을 꺼내 온다. 즉 이 라우트로 만든 조인은 어디에도 안 뜨는 유령이었다.
 * 조인 글은 POST /bookings 로 listingType:'JOIN' 을 실어 만들고, 신청은 /bookings/:id/apply 가 받는다.
 */

router.get("/passport-stats", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    // 예전엔 여기서 "비어 있으면 표본을 심는" 코드를 돌렸다. 없는 경기 번호로 넣어서 프로덕션에서
    // 열 때마다 500 이 났고, 성공했다면 남의 골프 평균·랭킹에 가짜 8라운드가 들어갔을 것이다.
    // 2026-09-09 삭제 — 통계는 실제 기록만 센다.
    const stats = await storage.getGolfPassportStats(req.userId!);
    return sendSuccess(res, stats);
}));

/**
 * 스코어카드 글자 인식 결과를 표로 정리해 돌려준다. **아무것도 저장하지 않는다.**
 *
 * 예전엔 여기서 공용 코스 자료(hiq_course_hole_info)에 홀별 파를 적었다. 두 가지가 겹쳐 있었다:
 *  1. 화면(ScorecardScanner)이 올린 사진을 보지도 않고, 코드에 박아 둔 가짜 결과
 *     (HOLE 1 / PAR 4 / HONG 5)를 3초 기다린 뒤 보내고 있었다. 여기 쌓이던 건 실제 스코어카드가
 *     아니라 지어낸 숫자였고, 사용자에게는 "성공적으로 분석했습니다" 라고 말했다.
 *  2. ocrData 는 클라이언트가 보내는 값이다. 아무나 아무 숫자나 실어 보내면 그게 모든 사람이 보는
 *     골프장 코스 자료가 됐다 — 검증이 한 군데도 없었다.
 * 2026-09-10 저장을 걷어냈다. 진짜 인식을 붙일 때는 **서버가** 이미지에서 직접 뽑은 결과만 적는다.
 */
router.post("/scorecard/ocr", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const { ocrData } = req.body;
    if (!ocrData) return sendError(res, 400, "OCR 데이터가 필요합니다.");

    const parsed = await storage.processScorecardOCR(ocrData);
    if (!parsed) return sendError(res, 400, "분석 가능한 데이터가 없습니다.");

    return sendSuccess(res, parsed);
}));

// --- 랭큐매치 (PIN 으로 모이는 골프 경기) ---
//
// 2026-09-11 다시 짰다. 예전엔 참가자면 누구나 점수·시작·종료·코스를 서버에 직접 바꿀 수 있었고(방장 전용은
// 화면에서만), 점수 저장이 남의 회원번호까지 받아 그 사람 평균·등급을 덮을 수 있었다. 이제 쓰기는 **방장만**,
// 읽기는 **그 경기에 든 사람만**이다. 로그인 없이 방 정보를 통째로 주던 GET /match/pin/:pin 은 없앴다
// (화면이 쓰지도 않았고, 4자리라 전수 조회로 모든 대기방이 새었다).

const matchCreateSchema = z.object({
    courseId: z.string().max(64).nullish(),
    // 골프장 없이 끝낸 라운드가 '알 수 없는 구장' 도장이 됐다 — 이름은 꼭 받는다(화면도 이미 강제한다).
    courseName: z.string().trim().min(1).max(80),
    gameMode: z.enum(["stroke", "skins"]),
    strokeMode: z.enum(["solo", "group"]).nullish(),
    stake: z.coerce.number().optional(),
    useDouble: z.boolean().optional(),
    doublingMode: z.enum(["none", "current", "next"]).optional(),
    birdieAmount: z.coerce.number().optional(),
    eagleAmount: z.coerce.number().optional(),
    frontCourseName: z.string().trim().max(40).nullish(),
    backCourseName: z.string().trim().max(40).nullish(),
    guests: z.array(z.string().trim().min(1).max(12)).max(3).optional(),
});

const matchScoreSchema = z.object({
    holeNo: z.coerce.number().int().min(1).max(18),
    players: z.array(z.object({ memberId: z.string().max(64) }).passthrough()).max(4),
});

router.post("/match/create", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const parsed = matchCreateSchema.safeParse(req.body ?? {});
    if (!parsed.success) return sendError(res, 400, "경기 설정이 올바르지 않아요");
    const session = await storage.createGolfMatchSession(req.userId!, parsed.data as any);
    return sendSuccess(res, session);
}));

router.post("/match/join", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const pin = String(req.body?.pin ?? "").replace(/\D/g, "");
    if (pin.length !== 4) return sendError(res, 400, "핀번호 4자리를 입력해 주세요");
    // 4자리는 만 개뿐이다 — 틀린 번호를 연달아 넣으면 잠깐 막는다(로그인 PIN 과 같은 방어).
    const key = attemptKey("golf-pin", req.userId, req.ip);
    const rl = checkRateLimit(key);
    if (rl.limited) {
        return sendError(res, 429, `번호를 여러 번 틀렸어요. ${Math.max(1, Math.ceil(rl.retryAfterSec / 60))}분 뒤에 다시 해 주세요`);
    }
    try {
        const { session, added } = await storage.joinGolfMatchSession(pin, req.userId!);
        // 이미 든 방(내 방 포함)에 다시 들어간 건 '맞힌 것' 으로 치지 않는다 — 치면 틀린 번호 4번 → 내 방 입장을
        // 되풀이해 잠금을 영영 피할 수 있었다(2026-09-11 리뷰).
        if (added) clearAttempts(key);
        return sendSuccess(res, session);
    } catch (e: any) {
        if (e?.statusCode === 404 || e?.statusCode === 409) registerFailure(key);
        throw e;
    }
}));

/** 홈의 '진행 중 라운드' 카드. 없으면 null. (/match/:id 보다 먼저 둔다) */
router.get("/match/active", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    return sendSuccess(res, await storage.getActiveGolfMatch(req.userId!));
}));

/** 그 경기에 든 사람(방장 포함)만 통과. hostOnly 면 방장만. */
async function loadMatch(req: AuthRequest, res: any, hostOnly: boolean): Promise<any | null> {
    if (!UUID.test(req.params.id)) { sendError(res, 404, "게임을 찾을 수 없어요"); return null; }
    const session: any = await storage.getGolfMatchSession(req.params.id);
    if (!session) { sendError(res, 404, "게임을 찾을 수 없어요"); return null; }
    const players: any[] = Array.isArray(session.players) ? session.players : [];
    const isHost = session.hostId === req.userId;
    if (!isHost && !players.some((p) => p?.memberId === req.userId)) {
        sendError(res, 403, "이 경기의 참가자가 아니에요");
        return null;
    }
    if (hostOnly && !isHost) { sendError(res, 403, "방장만 할 수 있어요"); return null; }
    return session;
}

router.get("/match/:id", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const session = await loadMatch(req, res, false);
    if (!session) return;
    return sendSuccess(res, session);
}));

router.post("/match/:id/start", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    if (!await loadMatch(req, res, true)) return;
    return sendSuccess(res, await storage.startGolfMatchSession(req.params.id));
}));

router.post("/match/:id/score", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    if (!await loadMatch(req, res, true)) return;
    const parsed = matchScoreSchema.safeParse(req.body ?? {});
    if (!parsed.success) return sendError(res, 400, "점수 형식이 올바르지 않아요");
    const session = await storage.updateGolfMatchScore(req.params.id, parsed.data.holeNo, parsed.data.players);
    return sendSuccess(res, session);
}));

router.post("/match/:id/finish", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    if (!await loadMatch(req, res, true)) return;
    return sendSuccess(res, await storage.finishGolfMatchSession(req.params.id));
}));

router.post("/match/:id/abandon", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    if (!await loadMatch(req, res, true)) return;
    return sendSuccess(res, await storage.abandonGolfMatchSession(req.params.id));
}));

router.post("/match/:id/course", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    if (!await loadMatch(req, res, true)) return;
    const name = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 40) : undefined);
    const session = await storage.updateGolfMatchCourse(req.params.id, name(req.body?.frontCourseName), name(req.body?.backCourseName));
    return sendSuccess(res, session);
}));

// --- Golf Club & Course Routes ---
router.get("/clubs", asyncHandler(async (req: any, res: any) => {
    const search = req.query.search as string | undefined;
    const lat = req.query.lat ? parseFloat(req.query.lat as string) : undefined;
    const lng = req.query.lng ? parseFloat(req.query.lng as string) : undefined;
    const clubs = await storage.getGolfClubs(search, lat, lng);
    return sendSuccess(res, clubs);
}));

router.get("/clubs/:clubId/courses", asyncHandler(async (req: any, res: any) => {
    const clubId = req.params.clubId;
    const courses = await storage.getGolfClubCourses(clubId);
    return sendSuccess(res, courses);
}));

/**
 * 코스 구성이 아직 없는 골프장에 **회원이 코스 이름을 알려 준다.**
 * 전국 634곳 중 317곳이 자료가 없어, 그런 골프장을 고르면 전반/후반을 못 골라 라운드를 시작할 수 없었다.
 * 이미 자료가 있는 골프장은 이 길로 못 바꾼다(저장소에서 막는다).
 */
router.post("/clubs/:clubId/courses", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    if (!UUID.test(req.params.clubId)) return sendError(res, 404, "골프장을 찾을 수 없어요");
    const names = Array.isArray(req.body?.names) ? req.body.names : [];
    if (names.length === 0) return sendError(res, 400, "코스 이름을 적어 주세요");
    const courses = await storage.addCourseNamesIfEmpty(req.params.clubId, names);
    return sendSuccess(res, courses);
}));

// --- Golf Membership Routes ---
router.post("/membership/orders", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const data = {
        ...req.body,
        status: 'PENDING'
    };

    const validation = insertGolfMembershipOrderSchema.safeParse(data);
    if (!validation.success) {
        return sendError(res, 400, validation.error.message);
    }

    const order = await storage.createGolfMembershipOrder(validation.data as any);
    return sendSuccess(res, order);
}));

export default router;
