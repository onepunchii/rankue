/**
 * 채팅(2026-09-21 오너: "채팅 탭 하나, 친구·라이벌 1:1, 관리자 문의는 빠른 답변처럼").
 *   GET    /chat/rooms?sport=                 내 방 목록(크루·조인/부킹·1:1·문의) — 마지막 메시지·안 읽은 수
 *   GET    /chat/unread?sport=                안 읽은 합계(하단 탭 배지)
 *   POST   /chat/read { key }                 방을 봤다
 *   GET    /chat/rooms/:key/info              머리줄·명단·고정 카드 재료
 *   GET    /chat/rooms/:key/messages          최근 60건 · ?after= 그 뒤만(2.5초 폴링) · ?before= 그 앞 60건(위로 더 읽기)
 *   POST   /chat/rooms/:key/messages          보내기 → 같은 방 사람들에게 푸시
 *   DELETE /chat/rooms/:key/messages/:id      글쓴이·크루 운영진·운영자
 *   POST   /chat/rooms/:key/mute { muted }    이 방 알림 끄기/켜기(크루는 크루 알림 설정으로 간다)
 *   POST   /chat/rooms/:key/leave             1:1·소그룹 방 나가기(크루·조인/부킹 방은 안 된다)
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
import { msg, localeOf, type I18nText } from "../../lib/i18n.js";

const router = Router();
const sportOf = (q: unknown): "BILLIARDS" | "GOLF" => (q === "GOLF" ? "GOLF" : "BILLIARDS");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** 조인·부킹 방은 티타임 이틀 뒤 목록에서 빠진다(chat.repo myRooms 와 같은 값) — 그 뒤엔 읽기만. */
const LISTING_ROOM_GRACE_MS = 2 * 86_400_000;

router.get("/rooms", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    return sendSuccess(res, await storage.chat.myRooms(req.userId!, sportOf(req.query.sport), localeOf(res)));
}));

router.get("/unread", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const rooms = await storage.chat.myRooms(req.userId!, sportOf(req.query.sport), localeOf(res));
    return sendSuccess(res, { unread: rooms.reduce((n, r) => n + r.unread, 0) });
}));

router.post("/read", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const ref = parseRoomKey(String(req.body?.key ?? ""));
    if (!ref) return sendError(res, 400, "err.chat.badRoom");
    // 들어갈 수 없는 방에 읽음 행을 만들 수 없다(표에 남의 방 열쇠가 쌓이는 것을 막는다).
    if (!(await storage.chat.canAccess(ref, req.userId!))) return sendError(res, 403, "err.chat.noAccess", "NOT_ROOM_MEMBER");
    await storage.chat.markRead(ref.key, req.userId!);
    return sendSuccess(res, { ok: true });
}));

/** 열쇠를 풀고 권한을 본다. 실패하면 응답을 보내고 null. */
async function openRoom(req: AuthRequest, res: any): Promise<RoomRef | null> {
    const ref = parseRoomKey(String(req.params.key ?? ""));
    if (!ref) { sendError(res, 404, "err.chat.roomNotFound"); return null; }
    if (!(await storage.chat.canAccess(ref, req.userId!))) {
        // 글을 내려 닫힌 방은 "들어올 수 없다"가 아니라 "없다" — 화면이 다른 말을 한다(권한이 없을 때만 한 번 더 물으므로 폴링 비용은 없다).
        if (ref.kind === "listing" && !(await storage.getGolfBooking(ref.id))) { sendError(res, 404, "err.chat.roomGone", "ROOM_GONE"); return null; }
        sendError(res, 403, ref.kind === "listing" ? "err.chat.confirmedOnly" : "err.chat.noAccess", "NOT_ROOM_MEMBER");
        return null;
    }
    return ref;
}

/**
 * 이 방 알림이 꺼져 있나. **크루는 크루 알림 설정**(설정 화면과 같은 값)을, 나머지 방은 hiq_chat_reads.muted 를 본다.
 * 한 가지를 두 곳에 저장하지 않으려는 것이다 — 크루 설정에서 끈 사람이 채팅 메뉴에서 "켜짐"을 보면 안 된다.
 */
async function isMuted(ref: RoomRef, memberId: string): Promise<boolean> {
    if (ref.kind === "crew") return !(await storage.notifs.getCrewNotificationSetting(ref.id, memberId)).chatEnabled;
    return (await storage.chat.myRead(ref.key, memberId)).muted;
}

router.get("/rooms/:key/info", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const ref = await openRoom(req, res); if (!ref) return;
    // lastReadAt 은 **읽음 처리 전** 값이다 — 화면이 "여기까지 읽었어요" 줄을 그 시각에 긋는다.
    // 방을 열면 곧바로 POST /chat/read 가 커서를 지금으로 옮기므로, 이 값은 여기서 한 번 받은 것만 쓴다.
    const [info, read, muted] = await Promise.all([
        storage.chat.roomInfo(ref, req.userId!, localeOf(res)),
        storage.chat.myRead(ref.key, req.userId!),
        isMuted(ref, req.userId!),
    ]);
    return sendSuccess(res, { key: ref.key, kind: ref.kind, id: ref.id, ...info, lastReadAt: read.lastReadAt, muted });
}));

/** 이 방 알림 끄기/켜기. 크루는 크루 알림 설정의 '채팅' 스위치를 그대로 움직인다(설정 화면과 같은 값). */
router.post("/rooms/:key/mute", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const ref = await openRoom(req, res); if (!ref) return;
    const muted = req.body?.muted === true || req.body?.muted === "true";
    if (ref.kind === "crew") {
        const cur = await storage.notifs.getCrewNotificationSetting(ref.id, req.userId!);
        await storage.notifs.upsertCrewNotificationSetting({ crewId: ref.id, memberId: req.userId!, ...cur, chatEnabled: !muted } as any);
    } else {
        await storage.chat.setMuted(ref.key, req.userId!, muted);
    }
    return sendSuccess(res, { muted });
}));

/**
 * 방 나가기 — 1:1·소그룹만. 크루 방에서 나가는 것은 크루 탈퇴이고, 조인/부킹 방은 신청 취소라서
 * 채팅 메뉴가 대신 할 수 있는 일이 아니다(둘 다 그쪽 화면에 따로 있다). 문의 방은 나갈 대상이 아니다.
 * 나가면 남은 사람들에게 시스템 메시지로 알린다 — 말이 끊긴 이유를 알 수 있어야 한다. 푸시는 보내지 않는다.
 */
router.post("/rooms/:key/leave", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const ref = await openRoom(req, res); if (!ref) return;
    if (ref.kind !== "dm") return sendError(res, 400, "err.chat.leaveNotAllowed", "LEAVE_NOT_ALLOWED");
    const me = await storage.getMemberById(req.userId!);
    const r = await storage.chat.leaveDm(ref.id, req.userId!);
    if (r === "gone") return sendError(res, 404, "err.chat.roomNotFound");
    if (r === "ok" && me?.name) {
        await storage.chat.addMessage({
            key: ref.key, senderId: null, message: `${me.name}님이 나갔어요`, type: "system",
            metadata: { i18n: { key: "chat.system.left", params: { name: me.name } } },
        });
    }
    return sendSuccess(res, { ok: true });
}));

router.get("/rooms/:key/messages", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const ref = await openRoom(req, res); if (!ref) return;
    const at = (v: unknown) => { const d = typeof v === "string" && v ? new Date(v) : undefined; return d && Number.isFinite(d.getTime()) ? d : undefined; };
    const messages = await storage.chat.messages(ref, req.userId!, { after: at(req.query.after), before: at(req.query.before) });
    // reads=1 이면 방 사람들의 읽은 시각을 같이 준다 — 내 말풍선 옆 '안 읽은 사람 수'용.
    // 응답 모양이 바뀌므로 **물어본 요청만** 객체로 준다(안 물어보면 예전처럼 배열).
    // 요청을 따로 만들지 않은 이유: 2.5초 폴링이 둘이 되면 서버리스 호출이 그대로 두 배가 된다.
    if (req.query.reads !== "1") return sendSuccess(res, messages);
    return sendSuccess(res, { messages, reads: await storage.chat.readCursors(ref.key) });
}));

/**
 * 같은 방 사람들에게 푸시. 크루는 크루별 채팅 알림 설정과 차단을 따르고(기존 notifyCrewChat 과 같은 규칙),
 * 나머지 방은 방 사람 전원(보낸 사람 제외). 서버리스라 응답 전에 기다린다.
 */
export async function notifyRoom(ref: RoomRef, senderId: string, preview: string | I18nText, heading: I18nText, sport?: "BILLIARDS" | "GOLF", urlOverride?: string): Promise<void> {
    const members = (await storage.chat.roomMembers(ref)).filter((m) => m !== senderId);
    // 이 방 알림을 끈 사람(채팅 ⋯ 메뉴). 크루 방은 아래에서 크루 설정을 따로 보므로 여기서는 빈 집합이다.
    const muted = ref.kind === "crew" ? new Set<string>() : await storage.chat.mutedMemberIds(ref.key);
    const sender = await storage.getMemberById(senderId);
    const senderName = sender?.name;
    const blockers = await storage.crews.getBlockerIds(senderId);
    // 보통은 방으로 — 카드처럼 "누르면 바로 그 일을 하는" 알림만 딥링크를 덮어쓴다(온라인 대전 카드 → 참가 화면).
    const url = urlOverride ?? `/chat/${ref.kind}/${ref.id}`;
    // 알림함은 종목으로 갈린다 — 방의 종목을 따라야 한다. 예전엔 listing 만 골프로 쳐서 골프 크루·골프 친구 방 알림이
    // 당구 알림함에 쌓이고 골프 알림함에서는 안 보였다(2026-09-22 리뷰).
    const isGolf = sport === "GOLF" || ref.kind === "listing";
    // 제목·본문은 받는 사람 언어로 풀린다(notificationService). 사용자 글(preview 가 문자열)은 그대로 두고,
    // 서버가 만든 문구(카드 요약 — I18nText)는 받는 사람 언어로 푼다. 이름을 덧붙이는 틀은 문자열일 때만 쓴다.
    const body: string | I18nText = typeof preview !== "string" ? preview
        : ref.kind === "dm" ? preview
        : senderName ? msg("notif.chat.newMessage.body", { name: senderName, text: preview }) : msg("notif.chat.newMessageAnon.body", { text: preview });
    await Promise.allSettled(members.filter((m) => !blockers.has(m) && !muted.has(m)).map(async (memberId) => {
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
    if (typeof raw !== "string" || !raw.trim()) return sendError(res, 400, "err.chat.emptyMessage");
    if (raw.length > 1000) return sendError(res, 400, "err.chat.tooLong");
    // 보내기마다 방 전원에게 푸시가 간다 — 10초에 8건이면 멈춘다(2026-09-22 리뷰: 속도 제한이 없었다).
    if ((await storage.chat.recentSendCount(ref.key, req.userId!, 10)) >= 8) return sendError(res, 429, "err.chat.tooFast", "CHAT_TOO_FAST");
    // 관리자 문의는 필터를 안 건다 — 문의에 전화번호·링크가 들어가는 게 정상이다. 나머지는 크루와 같은 필터.
    let text = raw.trim();
    if (ref.kind !== "support") {
        const screened = screenCrewText(raw);
        if (!screened.ok) return sendError(res, 400, screened.reason);
        text = screened.value;
    }
    const me = await storage.getMemberById(req.userId!);
    const info = await storage.chat.roomInfo(ref, req.userId!, localeOf(res));
    // 티타임이 이틀 지난 조인·부킹 방은 목록에서 빠진다 — 그 뒤에도 보내지고 푸시가 가면 목록에 없는 방에서 알림만 온다.
    if (ref.kind === "listing" && info.booking && new Date(info.booking.datetime).getTime() < Date.now() - LISTING_ROOM_GRACE_MS) {
        return sendError(res, 403, "err.chat.roundOver", "ROOM_CLOSED");
    }
    const row = await storage.chat.addMessage({ key: ref.key, senderId: req.userId!, message: text, type: "text" });
    // 문의 방: 회원이 쓰면 운영자에게 "문의", 운영자가 쓰면 회원에게 "운영자 답변"
    // 1:1 은 제목이 곧 보낸 사람이다 — 방 제목(info.title)은 **보는 사람 기준 상대 이름**이라 그대로 쓰면 받는 사람 폰에 자기 이름이 떴다.
    const heading: I18nText = ref.kind === "support"
        ? (ref.id === req.userId ? msg("notif.chat.supportInquiry.title", { name: me?.name ?? "" }) : msg("notif.chat.supportReply.title"))
        : ref.kind === "dm" ? (me?.name ? msg("notif.chat.dm.title", { name: me.name }) : msg("notif.chat.dmAnon.title"))
        : msg("notif.chat.newMessage.title", { room: info.title });
    await notifyRoom(ref, req.userId!, text.slice(0, 80), heading, info.sport);
    return sendSuccess(res, { ...row, sender: { name: me?.name ?? "", profileImageUrl: null } });
}));

router.delete("/rooms/:key/messages/:id", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const ref = await openRoom(req, res); if (!ref) return;
    if (!UUID.test(req.params.id)) return sendError(res, 404, "err.chat.messageNotFound");
    const msg = await storage.chat.getMessage(req.params.id);
    if (!msg || msg.roomKey !== ref.key) return sendError(res, 404, "err.chat.messageNotFound");
    let allowed = msg.senderId === req.userId || (await storage.chat.isAdmin(req.userId!));
    if (!allowed && ref.kind === "crew") {
        const crewData = await storage.getCrew(ref.id);
        const meRole = crewData?.members?.find((m: any) => m.member.id === req.userId)?.role;
        allowed = meRole === "leader" || meRole === "manage";
    }
    if (!allowed) return sendError(res, 403, "err.chat.deleteForbidden");
    // 남의 글을 지우는 것은 운영 행위다 — 하드 삭제라 최소한 서버 기록은 남긴다(누가·어느 방·누구 글·앞 80자).
    if (msg.senderId !== req.userId) console.warn("[ChatModDelete]", JSON.stringify({ by: req.userId, room: ref.key, messageId: msg.id, author: msg.senderId, text: String(msg.message).slice(0, 80) }));
    await storage.chat.deleteMessage(msg.id);
    return sendSuccess(res, { deleted: true });
}));

/** 1:1·소그룹 방 — 친구(라이벌)와만. 낯선 사람에게 방을 열 수 없다(도배·스토킹 방지). */
router.post("/dm", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const ids = Array.isArray(req.body?.memberIds) ? (req.body.memberIds as unknown[]).map(String).filter((s) => UUID.test(s) && s !== req.userId) : [];
    if (ids.length === 0 || ids.length > 7) return sendError(res, 400, "err.chat.pickMembers");
    // 방은 종목을 가진다 — 골프 탭에서 연 방은 골프 친구와만, 골프 탭에만 보인다(2026-09-21).
    const sport = sportOf(req.body?.sport);
    // getFriends 는 친구마다 상대전적까지 계산한다(N+1) — 여기서는 고른 사람만 isFriend 로 본다.
    const checks = await Promise.all(ids.map((id) => storage.isFriend(req.userId!, id, sport)));
    const strangers = ids.filter((_, i) => !checks[i]);
    if (strangers.length > 0) return sendError(res, 403, sport === "GOLF" ? "err.chat.golfFriendsOnly" : "err.chat.friendsOnly", "NOT_FRIENDS");
    const r = await storage.chat.getOrCreateDm(req.userId!, ids, sport);
    return sendSuccess(res, { key: `dm:${r.id}`, created: r.created });
}));

export default router;
