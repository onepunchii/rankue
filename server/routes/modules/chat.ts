/**
 * 채팅(2026-09-21 오너: "채팅 탭 하나, 친구·라이벌 1:1, 관리자 문의는 빠른 답변처럼").
 *   GET    /chat/rooms?sport=                 내 방 목록(크루·조인/부킹·1:1·문의) — 마지막 메시지·안 읽은 수
 *   GET    /chat/unread?sport=                안 읽은 합계(하단 탭 배지)
 *   POST   /chat/read { key }                 방을 봤다
 *   GET    /chat/rooms/:key/info              머리줄·명단·고정 카드 재료
 *   GET    /chat/rooms/:key/messages?after=   after 뒤만(2.5초 폴링)
 *   POST   /chat/rooms/:key/messages          보내기 → 같은 방 사람들에게 푸시
 *   DELETE /chat/rooms/:key/messages/:id      글쓴이·크루 운영진·운영자
 *   POST   /chat/dm { memberIds }             1:1(같은 둘이면 기존 방)·소그룹 방 만들기
 * key = "crew:<id>" | "listing:<id>" | "dm:<id>" | "support:<memberId>"
 */
import { Router } from "express";
import { storage } from "../../storage/index.js";
import { sendSuccess, sendError } from "../../utils/response.js";
import { requireAuth, AuthRequest } from "../../middleware/auth.js";
import { requireTermsAccepted } from "../../middleware/terms.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { screenCrewText } from "../../utils/crewModeration.js";
import { notificationService } from "../../services/notificationService.js";
import { parseRoomKey, type RoomRef } from "../../storage/chat.repo.js";

const router = Router();
const sportOf = (q: unknown): "BILLIARDS" | "GOLF" => (q === "GOLF" ? "GOLF" : "BILLIARDS");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.get("/rooms", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    return sendSuccess(res, await storage.chat.myRooms(req.userId!, sportOf(req.query.sport)));
}));

router.get("/unread", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const rooms = await storage.chat.myRooms(req.userId!, sportOf(req.query.sport));
    return sendSuccess(res, { unread: rooms.reduce((n, r) => n + r.unread, 0) });
}));

router.post("/read", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const ref = parseRoomKey(String(req.body?.key ?? ""));
    if (!ref) return sendError(res, 400, "방이 올바르지 않아요");
    await storage.chat.markRead(ref.key, req.userId!);
    return sendSuccess(res, { ok: true });
}));

/** 열쇠를 풀고 권한을 본다. 실패하면 응답을 보내고 null. */
async function openRoom(req: AuthRequest, res: any): Promise<RoomRef | null> {
    const ref = parseRoomKey(String(req.params.key ?? ""));
    if (!ref) { sendError(res, 404, "대화방이 없어요"); return null; }
    if (!(await storage.chat.canAccess(ref, req.userId!))) {
        sendError(res, 403, ref.kind === "listing" ? "확정된 사람만 들어올 수 있는 방이에요" : "이 방에 들어갈 수 없어요", "NOT_ROOM_MEMBER");
        return null;
    }
    return ref;
}

router.get("/rooms/:key/info", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const ref = await openRoom(req, res); if (!ref) return;
    return sendSuccess(res, { key: ref.key, kind: ref.kind, id: ref.id, ...(await storage.chat.roomInfo(ref, req.userId!)) });
}));

router.get("/rooms/:key/messages", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const ref = await openRoom(req, res); if (!ref) return;
    const after = typeof req.query.after === "string" && req.query.after ? new Date(req.query.after) : undefined;
    return sendSuccess(res, await storage.chat.messages(ref, req.userId!, after && Number.isFinite(after.getTime()) ? after : undefined));
}));

/**
 * 같은 방 사람들에게 푸시. 크루는 크루별 채팅 알림 설정과 차단을 따르고(기존 notifyCrewChat 과 같은 규칙),
 * 나머지 방은 방 사람 전원(보낸 사람 제외). 서버리스라 응답 전에 기다린다.
 */
async function notifyRoom(ref: RoomRef, senderId: string, preview: string, title: string): Promise<void> {
    const members = (await storage.chat.roomMembers(ref)).filter((m) => m !== senderId);
    const sender = await storage.getMemberById(senderId);
    const senderName = sender?.name ?? "누군가";
    const blockers = await storage.crews.getBlockerIds(senderId);
    const url = `/chat/${ref.kind}/${ref.id}`;
    const isGolf = ref.kind === "listing";
    await Promise.allSettled(members.filter((m) => !blockers.has(m)).map(async (memberId) => {
        if (ref.kind === "crew") {
            const setting = await storage.notifs.getCrewNotificationSetting(ref.id, memberId);
            if (!setting.chatEnabled) return;
        }
        await notificationService.sendAndSaveNotification({
            memberId, title: `💬 [${title}] 새 메시지`, body: `${senderName}: ${preview}`,
            category: isGolf ? "GOLF" : "BILLIARDS", type: "CHAT", ...(isGolf ? { pref: "golf" as const } : {}),
            params: { url },
        }).catch((e) => console.error("[ChatNotify]", e));
    }));
}

router.post("/rooms/:key/messages", requireAuth, requireTermsAccepted, asyncHandler(async (req: AuthRequest, res: any) => {
    const ref = await openRoom(req, res); if (!ref) return;
    const raw = req.body?.message;
    if (typeof raw !== "string" || !raw.trim()) return sendError(res, 400, "메시지를 입력해주세요");
    if (raw.length > 1000) return sendError(res, 400, "메시지가 너무 깁니다 (1000자 이내)");
    // 관리자 문의는 필터를 안 건다 — 문의에 전화번호·링크가 들어가는 게 정상이다. 나머지는 크루와 같은 필터.
    let text = raw.trim();
    if (ref.kind !== "support") {
        const screened = screenCrewText(raw);
        if (!screened.ok) return sendError(res, 400, screened.reason);
        text = screened.value;
    }
    const row = await storage.chat.addMessage({ key: ref.key, senderId: req.userId!, message: text, type: "text" });
    const me = await storage.getMemberById(req.userId!);
    const info = await storage.chat.roomInfo(ref, req.userId!);
    // 문의 방: 회원이 쓰면 운영자에게 "문의", 운영자가 쓰면 회원에게 "운영자 답변"
    const title = ref.kind === "support" ? (ref.id === req.userId ? `문의 · ${me?.name ?? "회원"}` : "랭큐 운영자 답변") : info.title;
    await notifyRoom(ref, req.userId!, text.slice(0, 80), title);
    return sendSuccess(res, { ...row, sender: { name: me?.name ?? "", profileImageUrl: null } });
}));

router.delete("/rooms/:key/messages/:id", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const ref = await openRoom(req, res); if (!ref) return;
    if (!UUID.test(req.params.id)) return sendError(res, 404, "메시지를 찾을 수 없습니다");
    const msg = await storage.chat.getMessage(req.params.id);
    if (!msg || msg.roomKey !== ref.key) return sendError(res, 404, "메시지를 찾을 수 없습니다");
    let allowed = msg.senderId === req.userId || (await storage.chat.isAdmin(req.userId!));
    if (!allowed && ref.kind === "crew") {
        const crewData = await storage.getCrew(ref.id);
        const meRole = crewData?.members?.find((m: any) => m.member.id === req.userId)?.role;
        allowed = meRole === "leader" || meRole === "manage";
    }
    if (!allowed) return sendError(res, 403, "삭제 권한이 없습니다");
    await storage.chat.deleteMessage(msg.id);
    return sendSuccess(res, { deleted: true });
}));

/** 1:1·소그룹 방 — 친구(라이벌)와만. 낯선 사람에게 방을 열 수 없다(도배·스토킹 방지). */
router.post("/dm", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const ids = Array.isArray(req.body?.memberIds) ? (req.body.memberIds as unknown[]).map(String).filter((s) => UUID.test(s) && s !== req.userId) : [];
    if (ids.length === 0 || ids.length > 7) return sendError(res, 400, "함께할 사람을 1~7명 골라 주세요");
    const friends = new Set<string>();
    for (const sport of ["BILLIARDS", "GOLF"] as const) {
        for (const f of await storage.getFriends(req.userId!, sport)) if ((f as any)?.status === "accepted") friends.add(String((f as any).friend?.id ?? (f as any).id));
    }
    const strangers = ids.filter((id) => !friends.has(id));
    if (strangers.length > 0) return sendError(res, 403, "친구(라이벌)로 등록된 사람과만 대화방을 열 수 있어요", "NOT_FRIENDS");
    const r = await storage.chat.getOrCreateDm(req.userId!, ids);
    return sendSuccess(res, { key: `dm:${r.id}`, created: r.created });
}));

export default router;
