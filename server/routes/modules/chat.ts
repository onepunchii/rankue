/**
 * 채팅 허브(2026-09-21 오너: "하단 전체 → 메시지, 기가막힌 채팅").
 *   GET  /chat/rooms?sport=            내 방 목록(크루 + 조인·부킹) — 마지막 메시지·안 읽은 수
 *   GET  /chat/unread?sport=           안 읽은 수 합계(하단 탭 배지)
 *   POST /chat/read { key }            방을 봤다
 *   GET  /chat/listing/:id/messages?after=<ISO>   조인·부킹 방 메시지(after 뒤만 — 2초 폴링용)
 *   POST /chat/listing/:id/messages { message }    보내기 → 같은 방 사람들에게 푸시
 * 크루 방의 메시지는 기존 /crews/:id/chats 가 그대로 맡는다.
 */
import { Router } from "express";
import { storage } from "../../storage/index.js";
import { sendSuccess, sendError } from "../../utils/response.js";
import { requireAuth, AuthRequest } from "../../middleware/auth.js";
import { requireTermsAccepted } from "../../middleware/terms.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { screenCrewText } from "../../utils/crewModeration.js";
import { notificationService } from "../../services/notificationService.js";

const router = Router();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sportOf = (q: unknown): "BILLIARDS" | "GOLF" => (q === "GOLF" ? "GOLF" : "BILLIARDS");

router.get("/rooms", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const rooms = await storage.chat.myRooms(req.userId!, sportOf(req.query.sport));
    return sendSuccess(res, rooms);
}));

router.get("/unread", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const rooms = await storage.chat.myRooms(req.userId!, sportOf(req.query.sport));
    return sendSuccess(res, { unread: rooms.reduce((n, r) => n + r.unread, 0) });
}));

router.post("/read", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const key = String(req.body?.key ?? "");
    if (!/^(crew|listing):[0-9a-f-]{36}$/i.test(key)) return sendError(res, 400, "방이 올바르지 않아요");
    await storage.chat.markRead(key, req.userId!);
    return sendSuccess(res, { ok: true });
}));

async function requireRoomMember(req: AuthRequest, res: any, bookingId: string): Promise<boolean> {
    if (!UUID.test(bookingId)) { sendError(res, 404, "대화방이 없어요"); return false; }
    if (!(await storage.chat.isListingRoomMember(bookingId, req.userId!))) {
        sendError(res, 403, "확정된 사람만 들어올 수 있는 방이에요", "NOT_ROOM_MEMBER");
        return false;
    }
    return true;
}

router.get("/listing/:id/messages", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    if (!(await requireRoomMember(req, res, req.params.id))) return;
    const after = typeof req.query.after === "string" && req.query.after ? new Date(req.query.after) : undefined;
    const rows = await storage.chat.listingChats(req.params.id, after && Number.isFinite(after.getTime()) ? after : undefined);
    return sendSuccess(res, rows);
}));

router.post("/listing/:id/messages", requireAuth, requireTermsAccepted, asyncHandler(async (req: AuthRequest, res: any) => {
    if (!(await requireRoomMember(req, res, req.params.id))) return;
    const raw = req.body?.message;
    if (typeof raw !== "string" || !raw.trim()) return sendError(res, 400, "메시지를 입력해주세요");
    if (raw.length > 1000) return sendError(res, 400, "메시지가 너무 깁니다 (1000자 이내)");
    // 크루 채팅과 같은 필터 — 내기·욕설·거래는 거부, 전화번호·오픈채팅 링크는 가린다(가린 저장본이 푸시 본문으로도 나간다).
    const screened = screenCrewText(raw);
    if (!screened.ok) return sendError(res, 400, screened.reason);

    const row = await storage.chat.addListingChat({ bookingId: req.params.id, senderId: req.userId!, message: screened.value, type: "text" });
    // 같은 방 사람들에게 푸시 — 서버리스는 응답 뒤 실행이 얼어붙으므로 기다린다.
    const [me, members, booking] = await Promise.all([
        storage.getMemberById(req.userId!),
        storage.chat.listingRoomMembers(req.params.id),
        storage.getGolfBooking(req.params.id),
    ]);
    const title = booking?.isBlind ? booking.blindName ?? booking.courseName : booking?.courseName ?? "대화방";
    await Promise.allSettled(members.filter((m) => m !== req.userId).map((memberId) => notificationService.sendAndSaveNotification({
        memberId, title: `💬 [${title}] 새 메시지`, body: `${me?.name ?? "누군가"}: ${screened.value.slice(0, 80)}`,
        category: "GOLF", type: "CHAT", pref: "golf", params: { url: `/chat/listing/${req.params.id}` },
    }).catch((e) => console.error("[ListingChatNotify]", e))));
    return sendSuccess(res, { ...row, sender: { name: me?.name ?? "", profileImageUrl: null } });
}));

export default router;
