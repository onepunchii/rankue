import { Router } from "express";
import { storage } from "../../storage/index.js";
import { insertGolfBookingSchema, GolfBooking, insertGolfJoinSchema, GolfJoin, insertGolfMembershipOrderSchema } from "../../../shared/schema.js";
import { sendSuccess, sendError } from "../../utils/response.js";
import { requireAuth, AuthRequest } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

const router = Router();

// --- Golf Booking Routes ---
router.get("/bookings", asyncHandler(async (req: any, res: any) => {
    const date = req.query.date as string | undefined;
    // Pass all query params as filters
    const bookings = await storage.getGolfBookings(date, req.query);
    return sendSuccess(res, bookings);
}));

router.get("/bookings/counts", asyncHandler(async (req: any, res: any) => {
    const { startDate, endDate, viewType } = req.query;
    if (!startDate || !endDate) {
        return sendError(res, 400, "시작일과 종료일은 필수입니다.");
    }
    const counts = await storage.getGolfBookingCounts(startDate as string, endDate as string, viewType as string);
    return sendSuccess(res, counts);
}));

router.post("/bookings", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    // Multi-create support from frontend
    const items = Array.isArray(req.body) ? req.body : [req.body];
    const results: GolfBooking[] = [];

    for (const item of items) {
        const data = {
            ...item,
            datetime: new Date(item.datetime)
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
    const deleted = await storage.deleteGolfBooking(req.params.id, member.phone);
    if (!deleted) return sendError(res, 404, "삭제할 예약이 없거나 권한이 없습니다");
    return sendSuccess(res, { success: true });
}));


// --- Golf Join Routes ---
router.get("/joins", asyncHandler(async (req: any, res: any) => {
    const date = req.query.date as string | undefined;
    const joins = await storage.getGolfJoins({ date, ...req.query });
    return sendSuccess(res, joins);
}));

router.post("/joins", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const items = Array.isArray(req.body) ? req.body : [req.body];
    const results: GolfJoin[] = [];

    for (const item of items) {
        const data = {
            ...item,
            datetime: new Date(item.datetime),
            hostId: req.userId,
            status: 'recruiting'
        };

        const validation = insertGolfJoinSchema.safeParse(data);
        if (!validation.success) {
            return sendError(res, 400, validation.error.message);
        }

        const join = await storage.createGolfJoin(validation.data as any);
        results.push(join);
    }

    return sendSuccess(res, results);
}));

router.delete("/joins/:id", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const deleted = await storage.deleteGolfJoin(req.params.id, req.userId!);
    if (!deleted) return sendError(res, 404, "삭제할 글이 없거나 권한이 없습니다");
    return sendSuccess(res, { success: true });
}));

router.get("/passport-stats", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    // Self-healing: seed data if empty
    await storage.seedGolfSampleData(req.userId!);

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
router.post("/match/create", asyncHandler(async (req: any, res: any) => {
    const session = await storage.createGolfMatchSession(req.body);
    return sendSuccess(res, session);
}));

router.get("/match/pin/:pin", asyncHandler(async (req: any, res: any) => {
    const session = await storage.getGolfMatchSessionByPin(req.params.pin);
    if (!session) return sendError(res, 404, "게임을 찾을 수 없습니다.");
    return sendSuccess(res, session);
}));

router.post("/match/join", asyncHandler(async (req: any, res: any) => {
    const { pin, memberId, name } = req.body;
    const session = await storage.joinGolfMatchSession(pin, memberId, name);
    return sendSuccess(res, session);
}));

router.get("/match/:id", asyncHandler(async (req: any, res: any) => {
    const session = await storage.getGolfMatchSession(req.params.id);
    if (!session) return sendError(res, 404, "게임을 찾을 수 없습니다.");
    return sendSuccess(res, session);
}));

router.post("/match/:id/score", asyncHandler(async (req: any, res: any) => {
    const { holeNo, players, nearHistory } = req.body;
    const session = await storage.updateGolfMatchScore(req.params.id, holeNo, players, nearHistory);
    return sendSuccess(res, session);
}));

router.post("/match/:id/finish", asyncHandler(async (req: any, res: any) => {
    const session = await storage.finishGolfMatchSession(req.params.id);
    return sendSuccess(res, session);
}));

router.post("/match/:id/course", asyncHandler(async (req: any, res: any) => {
    const { frontCourseName, backCourseName } = req.body;
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
