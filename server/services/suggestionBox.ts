/**
 * 새 건의가 들어오면 운영자에게 알린다(2026-09-11, 오너 요청 "건의가 들어오면 관리자로 푸시").
 *
 * 문구·수신자·도배 방지 판단은 lib/suggestionBox(순수 규칙), 최근 알림 조회는 storage/admin.repo,
 * 여기서는 보내기만 한다 — 신고 알림(services/moderation notifyAdminsOfReport)과 같은 구조.
 */
import { storage } from "../storage/index.js";
import { notificationService } from "./notificationService.js";
import {
    SUGGESTION_ALERT_TYPE, SUGGESTION_QUEUE_URL,
    alertRecipients, buildSuggestionAlert, shouldAlertSuggestion,
} from "../lib/suggestionBox.js";

/**
 * 운영자(프로필 role admin/super_admin)에게 새 건의를 알린다. 보낸 운영자 수를 돌려준다.
 * 같은 회원의 건의는 SUGGESTION_ALERT_WINDOW_MIN 에 한 번만 — 연달아 여러 건을 써도 폰은 한 번 울린다.
 * 한 운영자에게 보내기가 실패해도 나머지에게는 간다(allSettled).
 */
export async function notifyAdminsOfSuggestion(p: {
    suggestionId: string;
    type: unknown;
    content: unknown;
    submitterMemberId: string;
}): Promise<number> {
    const state = await storage.admin.getSuggestionAlertState(p.submitterMemberId);
    if (!shouldAlertSuggestion(state)) return 0;
    const admins = alertRecipients(await storage.admin.getStaffMemberIds(), p.submitterMemberId);
    if (!admins.length) return 0;
    const { title, body } = buildSuggestionAlert(p);
    // submitterMemberId 는 회원별 도배 방지를 세는 데 쓴다(admin.repo getSuggestionAlertState). 운영자 알림에만 실린다.
    const params = { url: SUGGESTION_QUEUE_URL, suggestionId: p.suggestionId, submitterMemberId: p.submitterMemberId };
    const results = await Promise.allSettled(admins.map((memberId) => notificationService.sendAndSaveNotification({
        memberId, title, body, category: "admin", type: SUGGESTION_ALERT_TYPE, params,
    })));
    return results.filter((r) => r.status === "fulfilled").length;
}
