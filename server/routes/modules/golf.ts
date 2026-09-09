import { Router } from "express";
import { storage } from "../../storage/index.js";
import { insertGolfBookingSchema, GolfBooking, insertGolfJoinSchema, GolfJoin, insertGolfMembershipOrderSchema } from "../../../shared/schema.js";
import { sendSuccess, sendError } from "../../utils/response.js";
import { requireAuth, AuthRequest } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { notifyCrewChat } from "../../services/crewChatNotify.js";

const router = Router();

// --- Golf Booking Routes ---
router.get("/bookings", asyncHandler(async (req: AuthRequest, res: any) => {
    const date = req.query.date as string | undefined;
    // Pass all query params as filters
    const bookings = await storage.getGolfBookings(date, req.query);
    return sendSuccess(res, await withJoinCounts(bookings as any[], req.userId));
}));

router.get("/bookings/counts", asyncHandler(async (req: any, res: any) => {
    const { startDate, endDate, viewType } = req.query;
    if (!startDate || !endDate) {
        return sendError(res, 400, "시작일과 종료일은 필수입니다.");
    }
    // 필터를 그대로 넘긴다 — 예전엔 안 넘겨서 날짜 칩이 "12개" 라고 하는데 목록엔 2개만 있었다(2026-09-09 검토).
    const counts = await storage.getGolfBookingCounts(startDate as string, endDate as string, viewType as string, req.query);
    return sendSuccess(res, counts);
}));

/** 매물을 올릴 수 있는 역할. 화면(BookingList.tsx)과 같은 목록을 서버에서도 검사한다 — 화면만 가리면 주소로 뚫린다. */
const BOOKING_WRITER_ROLES = ["admin", "super_admin", "store_owner", "booking_manager"];

/** 연락 가능한 휴대폰인가. 소셜 가입 회원의 phone 은 "social:google:..." 이라 sms: 링크가 죽는다. */
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

    const role = (member as any).role ?? (member.profileId ? (await storage.getProfile(member.profileId) as any)?.role : null);
    if (!BOOKING_WRITER_ROLES.includes(String(role))) {
        return sendError(res, 403, "티타임을 등록할 수 있는 계정이 아니에요", "NOT_BOOKING_MANAGER");
    }
    const phone = usablePhone(member.phone);
    if (!phone) return sendError(res, 400, "연락 가능한 휴대폰 번호를 먼저 등록해 주세요", "NO_CONTACT_PHONE");

    // Multi-create support from frontend
    const items = Array.isArray(req.body) ? req.body : [req.body];
    const results: GolfBooking[] = [];

    for (const item of items) {
        // 클라이언트가 보낸 신원 값은 버린다(덮어쓰기가 아니라 제거 — 스키마가 넓어져도 새지 않게).
        const { managerPhone: _p, ownerId: _o, ...rest } = item ?? {};
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
            managerPhone: phone,
        };

        const validation = insertGolfBookingSchema.safeParse(data);
        if (!validation.success) {
            return sendError(res, 400, validation.error.message);
        }

        const booking = await storage.createGolfBooking(validation.data as any);
        results.push(booking);
    }

    return sendSuccess(res, results);
}));

router.delete("/bookings/:id", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
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
    if (!booking || booking.isBlinded) return sendError(res, 404, "조인 글을 찾을 수 없어요");
    if (booking.listingType !== "JOIN") return sendError(res, 400, "조인 글이 아니에요");
    if (booking.ownerId && booking.ownerId === req.userId) return sendError(res, 400, "내가 올린 조인이에요");
    if (new Date(booking.datetime).getTime() <= Date.now()) return sendError(res, 400, "이미 지난 티타임이에요");

    const capacity = Number(booking.joinHeadcount) > 0 ? Number(booking.joinHeadcount) : DEFAULT_JOIN_CAPACITY;
    const r = await storage.applyToJoin(req.params.id, req.userId!, capacity);
    if (r === "already") return sendError(res, 409, "이미 신청했어요", "ALREADY_APPLIED");
    if (r === "full") return sendError(res, 409, "자리가 다 찼어요", "JOIN_FULL");
    return sendSuccess(res, { applied: true });
}));

router.delete("/bookings/:id/apply", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    if (!UUID.test(req.params.id)) return sendError(res, 404, "신청 내역이 없어요");
    // 티타임이 지난 뒤에는 못 무른다. 안 막으면 안 나타난 사람이 뒤늦게 '취소' 를 눌러
    // 노쇼 표시를 피해 갈 수 있다 — 노쇼는 status 가 'applied' 인 사람만 찍을 수 있기 때문이다.
    const booking: any = await storage.getGolfBooking(req.params.id);
    if (booking && new Date(booking.datetime).getTime() <= Date.now()) {
        return sendError(res, 400, "이미 지난 티타임이라 취소할 수 없어요", "TEE_TIME_PASSED");
    }
    const ok = await storage.cancelJoinRequest(req.params.id, req.userId!);
    if (!ok) return sendError(res, 404, "신청 내역이 없어요");
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
    const ok = await storage.setJoinNoShow(req.params.id, req.params.memberId, noShow);
    if (!ok) return sendError(res, 404, noShow ? "신청 중인 사람이 아니에요" : "노쇼로 표시된 사람이 아니에요");
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
        userId ? storage.myJoinRequestIds(userId, ids) : Promise.resolve(new Set<string>()),
    ]);
    return rows.map((r) => ({
        ...r,
        joinApplied: counts.get(r.id) ?? 0,
        joinedByMe: mine.has(r.id),
    }));
}

router.get("/joins", asyncHandler(async (req: AuthRequest, res: any) => {
    const date = req.query.date as string | undefined;
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

router.post("/scorecard/ocr", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const { ocrData, courseId, courseName } = req.body;
    if (!ocrData) return sendError(res, 400, "OCR 데이터가 필요합니다.");

    const parsed = await storage.processScorecardOCR(ocrData);
    if (!parsed) return sendError(res, 400, "분석 가능한 데이터가 없습니다.");

    // Crowdsourcing Logic: Update Master DB with identified PARs
    if (courseId && courseName) {
        for (const course of parsed.courses) {
            for (let i = 0; i < course.pars.length; i++) {
                await storage.updateCourseHoleInfo({
                    courseId,
                    courseName,
                    subPathName: course.course_name,
                    holeNo: i + 1,
                    par: course.pars[i]
                });
            }
        }
    }

    return sendSuccess(res, parsed);
}));

// --- Golf Match Session (PIN based) ---
// 경기 세션은 전부 로그인 뒤에만. 예전엔 requireAuth 도 없고 hostId·memberId 를 요청 본문에서 받아,
// 남의 회원 번호로 가짜 라운드를 만들어 그 사람 평균·핸디캡·등급을 덮어쓸 수 있었다(2026-09-09 검토).
router.post("/match/create", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const { hostId: _h, ...rest } = req.body ?? {};
    const session = await storage.createGolfMatchSession({ ...rest, hostId: req.userId });
    return sendSuccess(res, session);
}));

router.get("/match/pin/:pin", asyncHandler(async (req: any, res: any) => {
    const session = await storage.getGolfMatchSessionByPin(req.params.pin);
    if (!session) return sendError(res, 404, "게임을 찾을 수 없습니다.");
    return sendSuccess(res, session);
}));

router.post("/match/join", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    // 참가자는 자기 자신뿐이다 — 본문의 memberId 는 무시한다.
    const { pin, name } = req.body ?? {};
    const session = await storage.joinGolfMatchSession(pin, req.userId!, name);
    return sendSuccess(res, session);
}));

router.get("/match/:id", asyncHandler(async (req: any, res: any) => {
    const session = await storage.getGolfMatchSession(req.params.id);
    if (!session) return sendError(res, 404, "게임을 찾을 수 없습니다.");
    return sendSuccess(res, session);
}));

/** 그 경기에 참여한 사람만 점수를 만질 수 있다(방장 또는 참가자). */
async function requireMatchMember(req: AuthRequest, res: any): Promise<any | null> {
    const session: any = await storage.getGolfMatchSession(req.params.id);
    if (!session) { sendError(res, 404, "게임을 찾을 수 없습니다."); return null; }
    const players: any[] = Array.isArray(session.players) ? session.players : [];
    const mine = session.hostId === req.userId || players.some((p) => p?.memberId === req.userId);
    if (!mine) { sendError(res, 403, "이 경기의 참가자가 아니에요"); return null; }
    return session;
}

router.post("/match/:id/score", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    if (!await requireMatchMember(req, res)) return;
    const { holeNo, players, nearHistory } = req.body ?? {};
    const session = await storage.updateGolfMatchScore(req.params.id, holeNo, players, nearHistory);
    return sendSuccess(res, session);
}));

router.post("/match/:id/finish", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    if (!await requireMatchMember(req, res)) return;
    const session = await storage.finishGolfMatchSession(req.params.id);
    return sendSuccess(res, session);
}));

router.post("/match/:id/course", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    if (!await requireMatchMember(req, res)) return;
    const { frontCourseName, backCourseName } = req.body ?? {};
    const session = await storage.updateGolfMatchCourse(req.params.id, frontCourseName, backCourseName);
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
