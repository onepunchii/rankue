import { storage } from "../storage/index.js";
import { notificationService } from "./notificationService.js";
import { msg } from "../lib/i18n.js";

/**
 * 크루 채팅 알림 — 두 곳에서 쓴다: 사람이 친 메시지(crew.ts)와 서버가 만든 카드(골프 부킹 공유).
 * 카드도 채팅방에 뜨는 메시지라 알림이 안 가면 아무도 못 본다.
 *
 * 승인 대기(pending)는 대상에서 뺀다 — 채팅 조회가 403 으로 막힌 사람에게 알림 본문으로
 * 대화 원문이 새어 나갔던 적이 있다. 보낸 사람을 차단한 크루원도 뺀다.
 *
 * 발송을 await 한다 — 서버리스(Vercel)는 응답을 보내면 실행이 얼어붙어서 fire-and-forget 으로 띄운
 * 푸시가 그대로 유실된다. 개별 실패는 로그만 남기고 요청 자체는 성공시킨다.
 */
export async function notifyCrewChat(opts: {
    crewId: string;
    senderId: string;
    /** 알림 본문에 실을 한 줄. 카드형이면 "골프 부킹을 공유했어요" 처럼 요약을 준다. */
    preview: string;
    tag?: string;
}): Promise<void> {
    const tag = opts.tag ?? "[ChatNotif]";
    try {
        const crewData = await storage.getCrew(opts.crewId);
        if (!crewData) return;

        // 보낸 사람을 차단한 크루원에게는 보내지 않는다 — 목록에서 가려도 푸시로 이름과 원문이 잠금 화면에 뜨면
        // 차단이 반쪽이 된다(Apple 1.2 차단, 2026-09-11 검토 policy:R7).
        const blockers = await storage.crews.getBlockerIds(opts.senderId);
        const targets = (crewData.members || [])
            .filter((m: any) => m?.role !== "pending")
            .filter((m: any) => m.member.id !== opts.senderId)
            .filter((m: any) => !blockers.has(m.member.id));
        const sender = (crewData.members || []).find((m: any) => m.member.id === opts.senderId);
        const senderName: string | undefined = sender?.member.name || undefined;

        // 설정 조회도 멤버별로 병렬 — 순차 await 이면 큰 크루에서 응답이 느려진다.
        const results = await Promise.allSettled(targets.map(async (m: any) => {
            const chatSetting = await storage.notifs.getCrewNotificationSetting(opts.crewId, m.member.id);
            if (!chatSetting.chatEnabled) return;
            await notificationService.sendAndSaveNotification({
                memberId: m.member.id,
                // 받는 사람 언어로 풀린다(notificationService). preview 는 사용자 글이라 그대로.
                title: msg("notif.chat.newMessage.title", { room: crewData.crew.name }),
                body: senderName ? msg("notif.chat.newMessage.body", { name: senderName, text: opts.preview }) : msg("notif.chat.newMessageAnon.body", { text: opts.preview }),
                category: crewData.crew.sportCategory || "BILLIARDS",
                type: "CHAT",
                params: { url: `/crew/${opts.crewId}/chat`, crewId: opts.crewId, tab: "chat" },
            });
        }));
        for (const r of results) {
            if (r.status === "rejected") console.error(tag, r.reason);
        }
    } catch (err) {
        console.error(tag, "Error getting crew members:", err);
    }
}
