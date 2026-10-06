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
 *   GET    /chat/admin/members?q=             (운영자만) 회원 찾기 — 고른 회원의 문의 방(support:<id>)에 먼저 쓴다
 * key = "crew:<id>" | "listing:<id>" | "dm:<id>" | "support:<memberId>"
 *
 * 문의 방을 거꾸로도 쓴다(2026-10-06 오너: "관리자는 누구와도 다 채팅을 할 수 있게") — 운영자가 회원의 문의 방에 먼저 쓴다.
 * 회원에게 운영자는 '랭큐 운영팀' 한 사람이다(이름·사진·회원 id·읽은 시각·알림 본문). 규칙은 shared/chatSupport.ts.
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
import { msg, localeOf, memberLocale, type I18nText } from "../../lib/i18n.js";
import { memberSearchTerm, supportHidesSender, supportNotifyTitleKey } from "../../../shared/chatSupport.js";
import { translateConfigured, translateText, TranslateError, translateCacheKey, cachedTranslation, rememberTranslation, takeTranslateSlot } from "../../lib/chatTranslate.js";
import { polishReply, replyDraft, REPLY_DRAFT_MAX } from "../../lib/chatReply.js";

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

/**
 * 운영자만. 채팅은 **회원 쿠키**(hiq_user_id)로 들어오므로 그 회원의 profiles.role 을 본다 — 문의 방을 여는 검사(canAccess)와 같은 눈이다.
 * 어드민 콘솔 가드(middleware/adminAuth)는 파트너 쿠키(hiq_partner_auth)를 읽는데, 폰 앱의 채팅 탭에는 그 쿠키가 없다.
 * 역할의 출처는 같다(profiles.role 의 admin·super_admin) — 전화번호·이메일로 가르지 않는다.
 */
const requireChatAdmin = asyncHandler(async (req: AuthRequest, res: any, next: any) => {
    if (!(await storage.chat.isAdmin(req.userId!))) return sendError(res, 403, "err.common.forbidden", "ADMIN_ONLY");
    next();
});

/**
 * 회원 찾기(운영자 전용) — 채팅 탭의 '회원에게 메시지'. 이름·닉네임, 2글자부터, 최대 20명.
 * 방을 여기서 만들지 않는다: 문의 방은 행이 없는 방이라(열쇠가 곧 방) 고른 회원의 /chat/support/<id> 로 가면 된다.
 * 2글자 미만·글자가 아닌 q 는 DB 를 부르지 않고 빈 목록.
 */
router.get("/admin/members", requireAuth, requireChatAdmin, asyncHandler(async (req: AuthRequest, res: any) => {
    const term = memberSearchTerm(req.query.q);
    if (!term) return sendSuccess(res, []);
    return sendSuccess(res, await storage.chat.searchMembersForAdmin(term, req.userId!));
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
    // locale — 문의 방을 회원이 볼 때 운영자 글의 보낸 사람('랭큐 운영팀')을 이 언어로 만든다.
    const messages = await storage.chat.messages(ref, req.userId!, { after: at(req.query.after), before: at(req.query.before), locale: localeOf(res) });
    // reads=1 이면 방 사람들의 읽은 시각을 같이 준다 — 내 말풍선 옆 '안 읽은 사람 수'용.
    // 응답 모양이 바뀌므로 **물어본 요청만** 객체로 준다(안 물어보면 예전처럼 배열).
    // 요청을 따로 만들지 않은 이유: 2.5초 폴링이 둘이 되면 서버리스 호출이 그대로 두 배가 된다.
    if (req.query.reads !== "1") return sendSuccess(res, messages);
    // 문의 방의 회원에게는 운영자들의 커서가 '운영팀' 하나로 접혀 간다(운영자 회원 id·각자 읽은 시각을 싣지 않는다).
    return sendSuccess(res, { messages, reads: await storage.chat.readCursorsFor(ref, req.userId!) });
}));

/**
 * 같은 방 사람들에게 푸시. 크루는 크루별 채팅 알림 설정과 차단을 따르고(기존 notifyCrewChat 과 같은 규칙),
 * 나머지 방은 방 사람 전원(보낸 사람 제외). 서버리스라 응답 전에 기다린다.
 * heading 은 받는 사람마다 다를 수 있다(함수) — 문의 방은 회원과 다른 운영자에게 가는 제목이 다르다.
 * 문의 방에서 운영자가 쓴 글이 **그 방의 회원에게** 갈 때는 본문에 보낸 사람 이름을 붙이지 않는다(운영자 개인 이름이 알림으로 샌다 —
 * 누가 보냈는지는 제목이 말한다). 이 규칙은 부르는 쪽이 아니라 여기서 지킨다.
 */
export async function notifyRoom(ref: RoomRef, senderId: string, preview: string | I18nText, heading: I18nText | ((memberId: string) => I18nText), sport?: "BILLIARDS" | "GOLF", urlOverride?: string): Promise<void> {
    const members = (await storage.chat.roomMembers(ref)).filter((m) => m !== senderId);
    // 이 방 알림을 끈 사람(채팅 ⋯ 메뉴). 크루 방은 아래에서 크루 설정을 따로 보므로 여기서는 빈 집합이다.
    const muted = ref.kind === "crew" ? new Set<string>() : await storage.chat.mutedMemberIds(ref.key);
    const sender = await storage.getMemberById(senderId);
    const senderName = sender?.name;
    // 보낸 사람을 차단한 사람에게는 알리지 않는다 — **문의 방만 예외**다(2026-10-06 검토, chat.repo messages 와 같은 규칙).
    // 회원이 예전에 운영자의 개인 계정을 차단해 두었으면 운영팀이 먼저 건 연락이 푸시도 알림함도 없이 사라졌고(운영자 화면에는 정상 전송),
    // 운영자가 회원을 개인적으로 차단해 두었으면 그 회원의 문의 알림을 못 받았다. 운영 연락은 개인 사이의 차단과 무관하게 닿는다.
    const blockers = ref.kind === "support" ? new Set<string>() : await storage.crews.getBlockerIds(senderId);
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
            memberId, title: typeof heading === "function" ? heading(memberId) : heading,
            body: supportHidesSender(ref, senderId, memberId) ? preview : body,
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
    // 운영자가 남의 문의 방에 쓴다(먼저 말 걸기 포함) — 탈퇴회원의 방은 읽기만. 받을 사람이 없는데 보내면 떠난 사람의 알림함에 행만 쌓인다.
    const senderIsOwner = ref.kind === "support" && ref.id === req.userId;
    if (ref.kind === "support" && !senderIsOwner && (await storage.chat.supportOwnerState(ref.id)) !== "ok") {
        return sendError(res, 403, "err.chat.supportMemberGone", "MEMBER_GONE");
    }
    const row = await storage.chat.addMessage({ key: ref.key, senderId: req.userId!, message: text, type: "text" });
    // 문의 방: 회원이 쓰면 운영자에게 "문의", 운영자가 쓰면 회원에게 "운영자 답변" —
    // 단 회원이 이 방에 **쓴 적이 없으면**(운영자가 먼저 말을 건 것) 회원에게는 "랭큐 운영팀 메시지"(2026-10-06). 문의한 적도 없는데 '답변'이 오면 이상하다.
    // 다른 운영자에게는 예전 그대로 "답변" 제목 + 보낸 운영자 이름이 간다(누가 답했는지 알아야 이어받는다).
    // 1:1 은 제목이 곧 보낸 사람이다 — 방 제목(info.title)은 **보는 사람 기준 상대 이름**이라 그대로 쓰면 받는 사람 폰에 자기 이름이 떴다.
    let heading: I18nText | ((memberId: string) => I18nText);
    if (ref.kind === "support") {
        const ownerHasWritten = senderIsOwner || (await storage.chat.hasMessageFrom(ref.key, ref.id));
        heading = (memberId) => {
            const key = supportNotifyTitleKey({ senderIsOwner, recipientIsOwner: memberId === ref.id, ownerHasWritten });
            return key === "notif.chat.supportInquiry.title" ? msg(key, { name: me?.name ?? "" }) : msg(key);
        };
    } else {
        heading = ref.kind === "dm" ? (me?.name ? msg("notif.chat.dm.title", { name: me.name }) : msg("notif.chat.dmAnon.title"))
            : msg("notif.chat.newMessage.title", { room: info.title });
    }
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

/**
 * 번역(운영자 전용, 2026-10-06 오너: "번역하기는 일단 관리자만 — 서비스 관리에 필요") — 고른 메시지 한 건을 요청 언어(x-locale)로.
 *  - 글은 **DB 에서 읽는다**. 화면이 보낸 글을 옮기지 않는다 — 번역기를 아무 글에나 쓰는 통로가 되지 않게.
 *  - 그 방에 들어올 수 있는 운영자만(openRoom). 운영자도 회원끼리의 방(조인·부킹·1:1)은 못 열므로 거기 글은 못 옮긴다.
 *  - 글자 메시지만. 카드·사진·시스템 글은 옮길 글이 없다.
 *  - 번역은 저장하지 않는다(인스턴스 안의 작은 기억뿐). 외부로 나가는 것은 그 메시지의 글자뿐이다 — 보낸 사람·방·회원 id 는 싣지 않는다.
 */
router.post("/rooms/:key/messages/:id/translate", requireAuth, requireChatAdmin, asyncHandler(async (req: AuthRequest, res: any) => {
    const ref = await openRoom(req, res); if (!ref) return;
    if (!UUID.test(req.params.id)) return sendError(res, 404, "err.chat.messageNotFound");
    if (!translateConfigured()) return sendError(res, 503, "err.chat.translateOff", "TRANSLATE_OFF");
    const row = await storage.chat.getMessage(req.params.id);
    if (!row || row.roomKey !== ref.key) return sendError(res, 404, "err.chat.messageNotFound");
    if ((row.type ?? "text") !== "text" || !String(row.message ?? "").trim()) return sendError(res, 400, "err.chat.translateNoText", "NO_TEXT");
    const to = localeOf(res);
    const ck = translateCacheKey(row.id, to);
    const hit = cachedTranslation(ck);
    if (hit) return sendSuccess(res, { text: hit.text, to, truncated: hit.truncated });
    if (!takeTranslateSlot(req.userId!)) return sendError(res, 429, "err.chat.translateBusy", "TRANSLATE_BUSY");
    try {
        const out = await translateText(row.message, to);
        rememberTranslation(ck, out);
        return sendSuccess(res, { text: out.text, to, truncated: out.truncated });
    } catch (e) {
        const code = e instanceof TranslateError ? e.code : "UPSTREAM";
        if (code === "NOT_CONFIGURED") return sendError(res, 503, "err.chat.translateOff", "TRANSLATE_OFF");
        if (code === "EMPTY") return sendError(res, 400, "err.chat.translateNoText", "NO_TEXT");
        return sendError(res, 502, "err.chat.translateFailed", "TRANSLATE_FAILED");
    }
}));

/**
 * 문의 답변 다듬기(2026-10-06 오너: "내가 한국어로 적어서 버튼이 있으면 … 해당 언어로 정식적인 내용으로 바꿔주는 형태").
 * POST /chat/rooms/:key/reply-polish { text } → { text, language, back }
 *  - 운영자가 입력칸에 쓴 글을 회원 언어의 정중한 문장으로 바꿔 **돌려준다**. 보내지 않고, 저장하지 않는다 — 보내기는 운영자가 누른다.
 *  - 운영자만, 문의 방에서만, 남의 문의 방에서만(내 문의 방에서는 내가 회원이다).
 *  - 밖으로 나가는 것: 운영자가 쓴 글과, 회원이 이 방에 쓴 최근 글(DB 에서 읽은 것 — 언어를 알아보는 근거). 회원·방 id 는 싣지 않는다.
 *  - 회원 글이 없으면(운영자가 먼저 건 말) 회원의 앱 언어로. 뜻풀이(back)는 운영자의 화면 언어로.
 *  - 한 사람 1분 상한은 번역과 같이 센다.
 */
router.post("/rooms/:key/reply-polish", requireAuth, requireChatAdmin, asyncHandler(async (req: AuthRequest, res: any) => {
    const ref = await openRoom(req, res); if (!ref) return;
    if (ref.kind !== "support" || ref.id === req.userId) return sendError(res, 400, "err.chat.polishSupportOnly", "SUPPORT_ONLY");
    if (!translateConfigured()) return sendError(res, 503, "err.chat.translateOff", "TRANSLATE_OFF");
    const draft = replyDraft(req.body?.text);
    if (!draft) return sendError(res, 400, "err.chat.polishEmpty", "EMPTY");
    if ([...draft].length > REPLY_DRAFT_MAX) return sendError(res, 400, msg("err.chat.polishTooLong", { n: REPLY_DRAFT_MAX }), "TOO_LONG");
    if (!takeTranslateSlot(req.userId!)) return sendError(res, 429, "err.chat.translateBusy", "TRANSLATE_BUSY");
    const [rows, owner] = await Promise.all([storage.chat.messages(ref, req.userId!, { limit: 40 }), storage.getMemberById(ref.id)]);
    const texts = rows.filter((m) => (m.type ?? "text") === "text" && !!m.senderId);
    const customer = texts.filter((m) => m.senderId === ref.id).map((m) => String(m.message ?? ""));
    // 운영자가 이미 답한 대화면 인사를 다시 붙이지 않는다
    const ongoing = texts.some((m) => m.senderId !== ref.id);
    try {
        const out = await polishReply({ draft, customer, fallback: memberLocale(owner), operator: localeOf(res), ongoing });
        return sendSuccess(res, { text: out.text, language: out.language, back: out.back });
    } catch (e) {
        const code = e instanceof TranslateError ? e.code : "UPSTREAM";
        if (code === "NOT_CONFIGURED") return sendError(res, 503, "err.chat.translateOff", "TRANSLATE_OFF");
        if (code === "EMPTY") return sendError(res, 400, "err.chat.polishEmpty", "EMPTY");
        if (e instanceof TranslateError && e.message === "too-long") return sendError(res, 422, "err.chat.polishResultTooLong", "RESULT_TOO_LONG");
        return sendError(res, 502, "err.chat.polishFailed", "POLISH_FAILED");
    }
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
