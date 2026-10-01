/**
 * 골프 관리 — 조인·부킹(2026-10-01 오너: "골프 부분이 어드민에 많이 빠져 있다 — 넣을 수 있는 거 다 넣자").
 * index.ts 가 checkSuperAdmin 뒤에 /api/hiq/admin/golf/listings 로 붙인다.
 *
 * 그전엔 운영자가 조인·부킹 글을 볼 곳이 신고 큐뿐이었다 — 신고가 안 들어온 글은 아예 안 보였고, 누가 신청했는지·긴급 방송이
 * 몇 명에게 나갔는지도 몰랐다. 여기서 보고, 가리고, 지운다.
 *
 *   GET    /                  글 목록(기간·종류·올린 쪽·긴급/가림/신고·검색, 50개씩)
 *   GET    /urgent            최근 7일 긴급 조인 방송 — 글별로 묶어서
 *   GET    /:id/applicants    글 자세히 + 신청자(평생 취소·노쇼 횟수 포함)
 *   POST   /:id/hide          가리기·보이기 { hidden, reason? } — 신고 없이도
 *   DELETE /:id               지우기 — 신청·채팅방까지 사라진다(되돌릴 수 없다)
 *
 * 가리기·보이기·지우기는 신고 큐(services/moderation)와 **같은 칸·같은 기록**을 쓴다: is_blinded 는 setReportTargetBlinded,
 * 처리 기록은 hiq_moderation_actions(target golf_booking), 안 닫힌 신고는 그 조치가 뜻하는 상태로 닫는다(reportStatusForAction).
 * 그래야 신고 큐에서 같은 글을 열었을 때 '마지막 처리'가 여기서 한 일로 보인다. 매니저 전화번호(manager_phone)는 어떤 응답에도 없다.
 */
import { Router } from "express";
import { storage } from "../../../storage/index.js";
import {
    adminGolfListings, parseListingFilters, golfListingNotice, golfListingGoneNotice, listingSnapshot, URGENT_LOG_DAYS,
} from "../../../storage/adminGolfListings.js";
import { notificationService } from "../../../services/notificationService.js";
import { reportStatusForAction, snapshotNote } from "../../../lib/reportQueue.js";
import { adminLog } from "../../../middleware/adminAuth.js";
import { asyncHandler } from "../../../utils/asyncHandler.js";
import { sendSuccess, sendError } from "../../../utils/response.js";

const router = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** 사유를 안 적고 가렸을 때 남는 말(blind_reason) — 신고 큐 '가린 이유' 칸에 보인다. */
const ADMIN_HIDE_REASON = "운영자가 가렸습니다";
const NOT_FOUND = "글을 찾을 수 없습니다";

/** 처리한 운영자 — 서명된 파트너 쿠키(profile id)에서만 읽는다(신고 큐와 같다). */
const adminProfileOf = (req: any): string | null => req.signedCookies?.hiq_partner_auth ?? null;

router.get("/", asyncHandler(async (req: any, res: any) => {
    return sendSuccess(res, await adminGolfListings.list(parseListingFilters(req.query ?? {})));
}));

// ⚠️ 글자 그대로의 경로는 /:id 보다 먼저 — 아니면 "urgent" 가 id 로 잡힌다.
router.get("/urgent", asyncHandler(async (_req: any, res: any) => {
    return sendSuccess(res, { days: URGENT_LOG_DAYS, items: await adminGolfListings.urgentLog(URGENT_LOG_DAYS) });
}));

router.get("/:id/applicants", asyncHandler(async (req: any, res: any) => {
    const id = String(req.params.id ?? "");
    if (!UUID_RE.test(id)) return sendError(res, 404, NOT_FOUND);
    const [listing, rows] = await Promise.all([adminGolfListings.detail(id), storage.golf.listJoinApplicants(id)]);
    if (!listing) return sendError(res, 404, NOT_FOUND);
    // 고른 칸만 — 저장소 함수가 나중에 칸을 늘려도(연락처 등) 운영자 응답으로 새지 않게.
    const applicants = rows.map((a: any) => ({
        memberId: String(a.memberId),
        name: a.name ?? null,
        status: a.status,
        headcount: Number(a.headcount) || 1,
        appliedAt: a.appliedAt,
        changedAt: a.changedAt,
        cancelCount: Number(a.cancelCount) || 0,
        noShowCount: Number(a.noShowCount) || 0,
        golfGrade: a.golfGrade ?? null,
        profileImageUrl: a.profileImageUrl ?? null,
    }));
    return sendSuccess(res, { listing, applicants });
}));

/**
 * 가리기·보이기 — 신고가 없어도 된다(사기 글은 신고보다 운영자가 먼저 본다).
 * 가리면 목록·글 상세에서 빠지고 새 신청을 못 받는다(golf.ts 가 is_blinded 를 본다). 글과 신청·채팅방은 그대로 남는다.
 * 사유는 기록(blind_reason)에만 남고 글쓴이 알림에는 싣지 않는다 — 운영자 메모가 그대로 푸시로 나가지 않게.
 */
router.post("/:id/hide", asyncHandler(async (req: any, res: any) => {
    const id = String(req.params.id ?? "");
    if (!UUID_RE.test(id)) return sendError(res, 404, NOT_FOUND);
    const hidden = req.body?.hidden;
    if (typeof hidden !== "boolean") return sendError(res, 400, "가릴지(hidden: true) 보일지(false) 정해 주세요");
    const typed = typeof req.body?.reason === "string" ? req.body.reason.trim().slice(0, 200) : "";

    const b: any = await storage.golf.getGolfBooking(id);
    if (!b) return sendError(res, 404, NOT_FOUND);
    // 같은 상태로 또 누르면(두 번 누름·다른 운영자가 먼저 처리) 알림·기록이 두 번 남는다 — 지금 상태를 알려 주고 멈춘다.
    if (!!b.isBlinded === hidden) return sendError(res, 409, hidden ? "이미 가려진 글입니다" : "이미 보이는 글입니다");

    const reason = hidden ? (typed || ADMIN_HIDE_REASON) : null;
    const changed = await storage.admin.setReportTargetBlinded("golf_booking", id, hidden, reason);
    if (!changed) return sendError(res, 404, NOT_FOUND);

    // 신고 큐의 블라인드·해제와 같은 결과 — 가리면 안 닫힌 신고는 '조치', 다시 보이면 '기각'으로 닫힌다.
    const action = hidden ? "blind" as const : "unblind" as const;
    const status = reportStatusForAction(action);
    const closedReports = status ? await storage.admin.closeReports("golf_booking", id, status) : 0;
    // note 는 비운다 — 신고 큐가 note 를 '삭제 전 내용'으로 보여 준다(사유는 blind_reason 에 있다).
    await storage.admin.logModerationAction({
        targetType: "golf_booking", targetId: id, action,
        adminProfileId: adminProfileOf(req), authorMemberId: b.ownerId ?? null, note: null,
    });
    adminLog(req, hidden ? "golf.listing.hide" : "golf.listing.unhide", { id, reason, closedReports, ownerId: b.ownerId ?? null });

    // 글쓴이 안내 — 자동 가림과 같은 골프 알림(storage/adminGolfListings golfListingNotice). 알림 실패가 조치를 실패로 만들면 안 된다.
    // ⚠️ 응답 전에 기다린다 — 서버리스는 응답 뒤 얼어붙어 기다리지 않은 푸시는 사라진다.
    let notified = false;
    if (b.ownerId) {
        try {
            await notificationService.sendAndSaveNotification({ memberId: b.ownerId, ...golfListingNotice(hidden ? "adminHidden" : "shown", b) });
            notified = true;
        } catch (e) { console.error("[AdminGolfListings] 가림 안내:", e); }
    }
    return sendSuccess(res, { hidden, closedReports, notified });
}));

/**
 * 지우기 — storage.golf.deleteGolfBooking 을 글쓴이 없이(운영자) 부른다. 신청 행은 cascade 로 함께 지워지고,
 * 채팅방(listing:<id>) 메시지도 지운다(golf.ts 글 내리기와 같다). 되돌릴 수 없다 — 화면은 '가리기'를 먼저 권한다.
 * 누가 무엇을 올렸는지는 처리 기록(note = 원문 요약, author = 글쓴이)에 남긴다: 신고 큐가 "골프 매물은 지우면 추적이
 * 사라져 가리기만 한다"고 막아 둔 이유를 여기서는 기록으로 메운다.
 */
router.delete("/:id", asyncHandler(async (req: any, res: any) => {
    const id = String(req.params.id ?? "");
    if (!UUID_RE.test(id)) return sendError(res, 404, NOT_FOUND);
    const b: any = await storage.golf.getGolfBooking(id);
    if (!b) return sendError(res, 404, NOT_FOUND);
    // 알릴 사람을 먼저 본다 — 신청 행은 글과 함께 cascade 로 지워진다.
    const requesters = await storage.golf.activeRequesterIds(id);
    const deleted = await storage.golf.deleteGolfBooking(id);
    if (!deleted) return sendError(res, 404, NOT_FOUND);

    // 여기부터는 이미 지워진 뒤다 — 뒷정리가 실패해도 '지우기 실패'로 답하면 운영자가 같은 일을 또 시도한다. 실패는 로그로.
    await storage.chat.deleteRoom(`listing:${id}`).catch((e: unknown) => console.error("[AdminGolfListings] 채팅방 정리:", e));
    let closedReports = 0;
    try {
        closedReports = await storage.admin.closeReports("golf_booking", id, "actioned");
        const snap = listingSnapshot(b);
        await storage.admin.logModerationAction({
            targetType: "golf_booking", targetId: id, action: "delete",
            adminProfileId: adminProfileOf(req), authorMemberId: b.ownerId ?? null, note: snapshotNote(snap.title, snap.text),
        });
    } catch (e) { console.error("[AdminGolfListings] 처리 기록:", e); }
    adminLog(req, "golf.listing.delete", { id, ownerId: b.ownerId ?? null, requesters: requesters.length, closedReports });

    // 글쓴이와 신청해 둔 사람(대기·확정)에게 — 응답 전에 기다린다(서버리스).
    const sends: Promise<unknown>[] = [];
    if (b.ownerId) sends.push(notificationService.sendAndSaveNotification({ memberId: b.ownerId, ...golfListingNotice("deleted", b) }));
    for (const r of requesters) {
        if (r.memberId === b.ownerId) continue;
        sends.push(notificationService.sendAndSaveNotification({ memberId: r.memberId, ...golfListingGoneNotice(b, r.status) }));
    }
    const results = await Promise.allSettled(sends);
    for (const r of results) if (r.status === "rejected") console.error("[AdminGolfListings] 내림 안내:", r.reason);

    return sendSuccess(res, { deleted: true, requesters: requesters.length, closedReports, notified: results.filter((r) => r.status === "fulfilled").length });
}));

export default router;
