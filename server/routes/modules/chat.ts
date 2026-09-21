/**
 * 채팅(2026-09-21 오너: "채팅 탭 하나, 친구·라이벌 1:1, 관리자 문의는 빠른 답변처럼").
 *   GET    /chat/rooms?sport=                 내 방 목록(크루·조인/부킹·1:1·문의) — 마지막 메시지·안 읽은 수
 *   GET    /chat/unread?sport=                안 읽은 합계(하단 탭 배지)
 *   POST   /chat/read { key }                 방을 봤다
 *   GET    /chat/rooms/:key/info              머리줄·명단·고정 카드 재료
 *   GET    /chat/rooms/:key/messages          최근 60건 · ?after= 그 뒤만(2.5초 폴링) · ?before= 그 앞 60건(위로 더 읽기)
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
/** 조인·부킹 방은 티타임 이틀 뒤 목록에서 빠진다(chat.repo myRooms 와 같은 값) — 그 뒤엔 읽기만. */
const LISTING_ROOM_GRACE_MS = 2 * 86_400_000;

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
    // 들어갈 수 없는 방에 읽음 행을 만들 수 없다(표에 남의 방 열쇠가 쌓이는 것을 막는다).
    if (!(await storage.chat.canAccess(ref, req.userId!))) return sendError(res, 403, "이 방에 들어갈 수 없어요", "NOT_ROOM_MEMBER");
    await storage.chat.markRead(ref.key, req.userId!);
    return sendSuccess(res, { ok: true });
}));

/** 열쇠를 풀고 권한을 본다. 실패하면 응답을 보내고 null. */
async function openRoom(req: AuthRequest, res: any): Promise<RoomRef | null> {
    const ref = parseRoomKey(String(req.params.key ?? ""));
    if (!ref) { sendError(res, 404, "대화방이 없어요"); return null; }
    if (!(await storage.chat.canAccess(ref, req.userId!))) {
        // 글을 내려 닫힌 방은 "들어올 수 없다"가 아니라 "없다" — 화면이 다른 말을 한다(권한이 없을 때만 한 번 더 물으므로 폴링 비용은 없다).
        if (ref.kind === "listing" && !(await storage.getGolfBooking(ref.id))) { sendError(res, 404, "끝났거나 내려간 방이에요", "ROOM_GONE"); return null; }
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
    const at = (v: unknown) => { const d = typeof v === "string" && v ? new Date(v) : undefined; return d && Number.isFinite(d.getTime()) ? d : undefined; };
    return sendSuccess(res, await storage.chat.messages(ref, req.userId!, { after: at(req.query.after), before: at(req.query.before) }));
}));

/**
 * 같은 방 사람들에게 푸시. 크루는 크루별 채팅 알림 설정과 차단을 따르고(기존 notifyCrewChat 과 같은 규칙),
 * 나머지 방은 방 사람 전원(보낸 사람 제외). 서버리스라 응답 전에 기다린다.
 */
async function notifyRoom(ref: RoomRef, senderId: string, preview: string, title: string, sport?: "BILLIARDS" | "GOLF"): Promise<void> {
    const members = (await storage.chat.roomMembers(ref)).filter((m) => m !== senderId);
    const sender = await storage.getMemberById(senderId);
    const senderName = sender?.name ?? "누군가";
    const blockers = await storage.crews.getBlockerIds(senderId);
    const url = `/chat/${ref.kind}/${ref.id}`;
    // 알림함은 종목으로 갈린다 — 방의 종목을 따라야 한다. 예전엔 listing 만 골프로 쳐서 골프 크루·골프 친구 방 알림이
    // 당구 알림함에 쌓이고 골프 알림함에서는 안 보였다(2026-09-22 리뷰).
    const isGolf = sport === "GOLF" || ref.kind === "listing";
    // 1:1 은 제목이 곧 보낸 사람이다 — 방 제목(roomInfo.title)은 **보는 사람 기준 상대 이름**이라, 보낸 사람 눈으로 만든 제목을
    // 그대로 쓰면 받는 사람 폰에 자기 이름이 떴다. 그룹 방도 보낸 사람 이름이 가장 쓸모 있다.
    const heading = ref.kind === "dm" ? `💬 ${senderName}` : `💬 [${title}] 새 메시지`;
    const body = ref.kind === "dm" ? preview : `${senderName}: ${preview}`;
    await Promise.allSettled(members.filter((m) => !blockers.has(m)).map(async (memberId) => {
        if (ref.kind === "crew") {
            const setting = await storage.notifs.getCrewNotificationSetting(ref.id, memberId);
            if (!setting.chatEnabled) return;
        }
        await notificationService.sendAndSaveNotification({
            memberId, title: heading, body,
            // 문의 답변은 '크루' 알림을 꺼 둔 사람에게도 가야 한다 → notice.
            category: isGolf ? "GOLF" : "BILLIARDS", type: "CHAT", ...(isGolf ? { pref: "golf" as const } : ref.kind === "support" ? { pref: "notice" as const } : {}),
            params: { url },
        }).catch((e) => console.error("[ChatNotify]", e));
    }));
}

router.post("/rooms/:key/messages", requireAuth, requireTermsAccepted, asyncHandler(async (req: AuthRequest, res: any) => {
    const ref = await openRoom(req, res); if (!ref) return;
    const raw = req.body?.message;
    if (typeof raw !== "string" || !raw.trim()) return sendError(res, 400, "메시지를 입력해주세요");
    if (raw.length > 1000) return sendError(res, 400, "메시지가 너무 깁니다 (1000자 이내)");
    // 보내기마다 방 전원에게 푸시가 간다 — 10초에 8건이면 멈춘다(2026-09-22 리뷰: 속도 제한이 없었다).
    if ((await storage.chat.recentSendCount(ref.key, req.userId!, 10)) >= 8) return sendError(res, 429, "너무 빨리 보내고 있어요. 잠시 뒤에 다시 보내 주세요", "CHAT_TOO_FAST");
    // 관리자 문의는 필터를 안 건다 — 문의에 전화번호·링크가 들어가는 게 정상이다. 나머지는 크루와 같은 필터.
    let text = raw.trim();
    if (ref.kind !== "support") {
        const screened = screenCrewText(raw);
        if (!screened.ok) return sendError(res, 400, screened.reason);
        text = screened.value;
    }
    const me = await storage.getMemberById(req.userId!);
    const info = await storage.chat.roomInfo(ref, req.userId!);
    // 티타임이 이틀 지난 조인·부킹 방은 목록에서 빠진다 — 그 뒤에도 보내지고 푸시가 가면 목록에 없는 방에서 알림만 온다.
    if (ref.kind === "listing" && info.booking && new Date(info.booking.datetime).getTime() < Date.now() - LISTING_ROOM_GRACE_MS) {
        return sendError(res, 403, "끝난 라운드의 방이라 더 보낼 수 없어요", "ROOM_CLOSED");
    }
    const row = await storage.chat.addMessage({ key: ref.key, senderId: req.userId!, message: text, type: "text" });
    // 문의 방: 회원이 쓰면 운영자에게 "문의", 운영자가 쓰면 회원에게 "운영자 답변"
    const title = ref.kind === "support" ? (ref.id === req.userId ? `문의 · ${me?.name ?? "회원"}` : "랭큐 운영자 답변") : info.title;
    await notifyRoom(ref, req.userId!, text.slice(0, 80), title, info.sport);
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
    // 남의 글을 지우는 것은 운영 행위다 — 하드 삭제라 최소한 서버 기록은 남긴다(누가·어느 방·누구 글·앞 80자).
    if (msg.senderId !== req.userId) console.warn("[ChatModDelete]", JSON.stringify({ by: req.userId, room: ref.key, messageId: msg.id, author: msg.senderId, text: String(msg.message).slice(0, 80) }));
    await storage.chat.deleteMessage(msg.id);
    return sendSuccess(res, { deleted: true });
}));

/** 1:1·소그룹 방 — 친구(라이벌)와만. 낯선 사람에게 방을 열 수 없다(도배·스토킹 방지). */
router.post("/dm", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const ids = Array.isArray(req.body?.memberIds) ? (req.body.memberIds as unknown[]).map(String).filter((s) => UUID.test(s) && s !== req.userId) : [];
    if (ids.length === 0 || ids.length > 7) return sendError(res, 400, "함께할 사람을 1~7명 골라 주세요");
    // 방은 종목을 가진다 — 골프 탭에서 연 방은 골프 친구와만, 골프 탭에만 보인다(2026-09-21).
    const sport = sportOf(req.body?.sport);
    // getFriends 는 친구마다 상대전적까지 계산한다(N+1) — 여기서는 고른 사람만 isFriend 로 본다.
    const checks = await Promise.all(ids.map((id) => storage.isFriend(req.userId!, id, sport)));
    const strangers = ids.filter((_, i) => !checks[i]);
    if (strangers.length > 0) return sendError(res, 403, sport === "GOLF" ? "골프 친구로 등록된 사람과만 대화방을 열 수 있어요" : "친구(라이벌)로 등록된 사람과만 대화방을 열 수 있어요", "NOT_FRIENDS");
    const r = await storage.chat.getOrCreateDm(req.userId!, ids, sport);
    return sendSuccess(res, { key: `dm:${r.id}`, created: r.created });
}));

export default router;
