/**
 * 신고 처리 실행과 운영자 알림(2026-09-11, 스토어 심사 SX1 — Apple 1.2 / Play UGC).
 *
 * 무엇을 할 수 있는지는 lib/reportQueue(순수 규칙), 무엇이 쌓였는지는 storage/admin.repo(조회),
 * 여기서는 실제로 가리고·지우고·정지하고·알린다. 모든 조치는 hiq_moderation_actions 에 한 줄씩 남는다.
 */
import { storage } from "../storage/index.js";
import { notificationService } from "./notificationService.js";
import { deleteBlobs } from "../utils/blob.js";
import {
    reportKey, reportStatusForAction, authorNoticeFor, shouldAlertAdmins, buildReportAlert, snapshotNote,
    REPORT_ALERT_TYPE, REPORT_QUEUE_URL,
    type ReportTargetType, type ModerationAction,
} from "../lib/reportQueue.js";

const ADMIN_BLIND_REASON = "운영 정책 위반으로 블라인드 처리되었습니다";

export type ModerationResult = { ok: true; closed: number } | { ok: false; status: number; message: string };

/**
 * 운영자 조치 하나를 실행한다. 조치 직전에 최신 상태로 가능한 조치를 다시 계산해 대조한다
 * — 화면을 띄운 사이 작성자가 지웠거나 다른 운영자가 먼저 처리했을 수 있다.
 */
export async function applyModerationAction(p: {
    targetType: ReportTargetType;
    targetId: string;
    action: ModerationAction;
    adminProfileId: string | null;
}): Promise<ModerationResult> {
    const item = await storage.admin.getReportTarget(p.targetType, p.targetId);
    if (!item) return { ok: false, status: 404, message: "신고 내역을 찾을 수 없습니다" };
    if (!item.actions.includes(p.action)) {
        return { ok: false, status: 409, message: "지금 할 수 없는 조치입니다. 목록을 새로고침해 주세요." };
    }

    let note: string | null = null;
    switch (p.action) {
        case "blind":
            await storage.admin.setReportTargetBlinded(p.targetType, p.targetId, true, ADMIN_BLIND_REASON);
            break;
        case "unblind":
        case "appeal_approve":
            await storage.admin.setReportTargetBlinded(p.targetType, p.targetId, false, null);
            break;
        case "appeal_reject":
            // 가린 채로 둔다. 이 처리 기록이 이의제기보다 늦으므로 큐에서 닫힌다(lib/reportQueue isAppealOpen).
            break;
        case "delete":
            note = snapshotNote(item.content.title, item.content.text);
            await deleteReportedContent(p.targetType, p.targetId);
            break;
        case "ban":
        case "unban": {
            const member = item.author ? await storage.getMemberById(item.author.memberId) : undefined;
            if (!member?.profileId) return { ok: false, status: 409, message: "정지할 로그인 계정이 없는 회원입니다" };
            if (p.action === "ban") await storage.banUser(member.profileId);
            else await storage.admin.unbanUser(member.profileId);
            break;
        }
        case "dismiss":
            break;
    }

    const status = reportStatusForAction(p.action);
    const closed = status ? await storage.admin.closeReports(p.targetType, p.targetId, status) : 0;
    await storage.admin.logModerationAction({
        targetType: p.targetType,
        targetId: p.targetId,
        action: p.action,
        adminProfileId: p.adminProfileId,
        authorMemberId: item.author?.memberId ?? null,
        note,
    });

    // 작성자 안내 — 알림 실패가 조치를 실패로 만들면 안 된다(조치는 이미 끝났다).
    const notice = authorNoticeFor(p.action, p.targetType);
    if (notice && item.author && p.targetType !== "member") {
        try {
            await notificationService.sendAndSaveNotification({
                memberId: item.author.memberId,
                title: notice.title,
                body: notice.body,
                category: "admin",
                type: "MODERATION",
                // 지운 글로 보내면 빈 화면이다 — 원문이 남는 조치에만 링크를 싣는다.
                ...(p.action !== "delete" && item.content.link ? { params: { url: item.content.link } } : {}),
            });
        } catch (e) { console.error("[Notify] 신고 처리 결과:", e); }
    }
    return { ok: true, closed };
}

/** 신고된 콘텐츠를 지운다. 작성자 본인 삭제 경로(community.ts·crew.ts)와 같은 저장소 함수를 쓰고, Blob 도 함께 치운다. */
async function deleteReportedContent(targetType: ReportTargetType, id: string): Promise<void> {
    switch (targetType) {
        case "community_post": {
            const post = await storage.community.getPostRaw(id);
            if (!post) return;
            await storage.community.deletePost(id);
            await deleteBlobs(post.images);
            return;
        }
        case "community_comment":
            // 답글이 달린 댓글은 '삭제된 댓글' 자리로 남는다 — 남이 단 답글까지 지우지 않게(community.repo deleteComment).
            await storage.community.deleteComment(id);
            break;
        case "player_cheer":
            await storage.umb.deleteCheer(id);
            return;
        case "crew_post": {
            const post = await storage.crews.getCrewPost(id);
            if (!post) return;
            const images = post.images ?? [];
            await storage.crews.deleteCrewPost(id);
            // 게시글 사진은 앨범에도 복사돼 있다 — 위반 사진이 앨범에 그대로 남지 않게 복사본도 지운다.
            for (const photoId of await storage.admin.findCrewAlbumCopies(post.crewId, images)) {
                await storage.crews.deleteCrewPhoto(photoId);
            }
            await deleteBlobs(images);
            return;
        }
        case "crew_comment":
            // crew_photo_comment 가 생기기 전 신고는 게시글 댓글과 사진 댓글을 함께 가리켰다 — 있는 쪽을 지운다.
            if (await storage.crews.getCrewComment(id)) await storage.crews.deleteCrewComment(id);
            else await storage.crews.deleteCrewPhotoComment(id);
            return;
        case "crew_photo_comment":
            await storage.crews.deleteCrewPhotoComment(id);
            return;
        case "crew_photo": {
            const photo = await storage.crews.getCrewPhoto(id);
            if (!photo) return;
            await storage.crews.deleteCrewPhoto(id); // 사진 댓글·좋아요는 FK cascade 로 함께 지워진다
            await deleteBlobs(photo.url);
            return;
        }
        case "crew_chat":
            // 채팅의 사진·메타데이터는 서버가 만든 것만 있어(crew.ts POST chats) 지울 Blob 이 없다.
            // storage.crews.deleteCrewChat 은 옛 표(hiq_crew_chats)를 지운다 — 채팅은 새 표에 있다. 위임 메서드로 지운다.
            await storage.deleteCrewChat(id);
            return;
        default:
            return;
    }
}

/**
 * 새 신고가 들어오면 운영자(프로필 role admin/super_admin)에게 알린다 — 24시간 안에 사람이 보도록.
 * 같은 대상은 1시간에 한 번, 전체는 시간당 상한까지만(lib/reportQueue shouldAlertAdmins). 보낸 운영자 수를 돌려준다.
 */
export async function notifyAdminsOfReport(p: {
    targetType: ReportTargetType;
    targetId: string;
    reason: string;
    reporterId: string;
}): Promise<number> {
    const state = await storage.admin.getReportAlertState(p.targetType, p.targetId, p.reporterId);
    if (!shouldAlertAdmins(state)) return 0;
    // 운영자 본인이 누른 신고를 본인에게 되돌려 알릴 필요는 없다.
    const admins = (await storage.admin.getStaffMemberIds()).filter((id) => id !== p.reporterId);
    if (!admins.length) return 0;
    const { title, body } = buildReportAlert({ targetType: p.targetType, reason: p.reason, reporterCount: state.reporterCount });
    // reporterId 는 신고자별 알림 상한을 세는 데 쓴다(admin.repo getReportAlertState). 운영자 알림에만 실린다.
    const params = { url: REPORT_QUEUE_URL, reportKey: reportKey(p.targetType, p.targetId), reporterId: p.reporterId };
    const results = await Promise.allSettled(admins.map((memberId) => notificationService.sendAndSaveNotification({
        memberId, title, body, category: "admin", type: REPORT_ALERT_TYPE, params,
    })));
    return results.filter((r) => r.status === "fulfilled").length;
}
