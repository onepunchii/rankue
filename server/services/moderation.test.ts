import { describe, it, expect, vi, beforeEach } from "vitest";

// DB 없이 조치 흐름만 본다 — storage·알림·Blob 삭제는 가짜로 바꾼다.
const m = vi.hoisted(() => ({
    getReportTarget: vi.fn(), setReportTargetBlinded: vi.fn(), closeReports: vi.fn(), logModerationAction: vi.fn(),
    unbanUser: vi.fn(), findCrewAlbumCopies: vi.fn(), getReportAlertState: vi.fn(), getStaffMemberIds: vi.fn(),
    getPostRaw: vi.fn(), deletePost: vi.fn(), deleteComment: vi.fn(),
    getCrewPost: vi.fn(), deleteCrewPost: vi.fn(), deleteCrewPhoto: vi.fn(), getCrewComment: vi.fn(),
    deleteCrewComment: vi.fn(), deleteCrewPhotoComment: vi.fn(), getCrewPhoto: vi.fn(), deleteCrewChat: vi.fn(),
    getMemberById: vi.fn(), banUser: vi.fn(), send: vi.fn(), deleteBlobs: vi.fn(),
}));
vi.mock("../storage/index.js", () => ({
    storage: {
        admin: {
            getReportTarget: m.getReportTarget, setReportTargetBlinded: m.setReportTargetBlinded, closeReports: m.closeReports,
            logModerationAction: m.logModerationAction, unbanUser: m.unbanUser, findCrewAlbumCopies: m.findCrewAlbumCopies,
            getReportAlertState: m.getReportAlertState, getStaffMemberIds: m.getStaffMemberIds,
        },
        community: { getPostRaw: m.getPostRaw, deletePost: m.deletePost, deleteComment: m.deleteComment },
        crews: {
            getCrewPost: m.getCrewPost, deleteCrewPost: m.deleteCrewPost, deleteCrewPhoto: m.deleteCrewPhoto,
            getCrewComment: m.getCrewComment, deleteCrewComment: m.deleteCrewComment, deleteCrewPhotoComment: m.deleteCrewPhotoComment,
            getCrewPhoto: m.getCrewPhoto, deleteCrewChat: m.deleteCrewChat,
        },
        getMemberById: m.getMemberById,
        banUser: m.banUser,
    },
}));
vi.mock("./notificationService.js", () => ({ notificationService: { sendAndSaveNotification: m.send } }));
vi.mock("../utils/blob.js", () => ({ deleteBlobs: m.deleteBlobs }));

import { applyModerationAction, notifyAdminsOfReport } from "./moderation";
import { REPORT_ALERT_TYPE, REPORT_QUEUE_URL } from "../lib/reportQueue";

const item = (over: Record<string, unknown> = {}) => ({
    targetType: "community_post",
    targetId: "t1",
    actions: ["blind", "delete", "ban", "dismiss"],
    content: { exists: true, title: "제목", text: "본문", images: [], isBlinded: false, blindReason: null, meta: null, link: "/community/t1", crewName: null, createdAt: null },
    author: { memberId: "a1", name: "작성자", banned: false, canBan: true, banBlock: null },
    ...over,
});
const run = (targetType: string, action: string) =>
    applyModerationAction({ targetType: targetType as any, targetId: "t1", action: action as any, adminProfileId: "admin-p" });

beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    m.getReportTarget.mockResolvedValue(item());
    m.closeReports.mockResolvedValue(2);
    m.logModerationAction.mockResolvedValue(undefined);
    m.send.mockResolvedValue(undefined);
    m.findCrewAlbumCopies.mockResolvedValue([]);
    m.getMemberById.mockResolvedValue({ id: "a1", profileId: "pr1" });
});

describe("운영자 조치(applyModerationAction)", () => {
    it("신고가 없는 대상은 404", async () => {
        m.getReportTarget.mockResolvedValue(null);
        expect(await run("community_post", "blind")).toMatchObject({ ok: false, status: 404 });
    });

    it("최신 상태에서 할 수 없는 조치는 아무것도 바꾸지 않고 409", async () => {
        m.getReportTarget.mockResolvedValue(item({ actions: ["dismiss"] }));
        expect(await run("community_post", "delete")).toMatchObject({ ok: false, status: 409 });
        expect(m.deletePost).not.toHaveBeenCalled();
        expect(m.closeReports).not.toHaveBeenCalled();
        expect(m.logModerationAction).not.toHaveBeenCalled();
    });

    it("블라인드: 가리고, 신고를 '조치'로 닫고, 기록하고, 작성자에게 이의제기 안내와 원문 링크를 보낸다", async () => {
        expect(await run("community_post", "blind")).toEqual({ ok: true, closed: 2 });
        expect(m.setReportTargetBlinded).toHaveBeenCalledWith("community_post", "t1", true, expect.any(String));
        expect(m.closeReports).toHaveBeenCalledWith("community_post", "t1", "actioned");
        expect(m.logModerationAction).toHaveBeenCalledWith(expect.objectContaining({
            action: "blind", adminProfileId: "admin-p", authorMemberId: "a1", note: null,
        }));
        expect(m.send).toHaveBeenCalledWith(expect.objectContaining({ memberId: "a1", params: { url: "/community/t1" } }));
        // 문구는 받는 사람 언어로 풀리므로 키로 나간다(이의제기 가능한 대상 → bodyAppeal)
        expect(m.send.mock.calls[0][0].body).toBe("notif.moderation.blind.bodyAppeal");
    });

    it("알림이 실패해도 조치는 성공으로 끝난다", async () => {
        m.send.mockRejectedValue(new Error("push down"));
        expect(await run("community_post", "blind")).toMatchObject({ ok: true });
    });

    it("크루 게시글 삭제: 앨범에 복사된 사진과 Blob 까지 치우고 원문 일부를 기록에 남긴다", async () => {
        const images = ["https://x.public.blob.vercel-storage.com/hiq/a.webp"];
        m.getReportTarget.mockResolvedValue(item({ targetType: "crew_post", actions: ["delete", "ban", "dismiss"] }));
        m.getCrewPost.mockResolvedValue({ id: "t1", crewId: "c1", images });
        m.findCrewAlbumCopies.mockResolvedValue(["p1", "p2"]);
        await run("crew_post", "delete");
        expect(m.deleteCrewPost).toHaveBeenCalledWith("t1");
        expect(m.findCrewAlbumCopies).toHaveBeenCalledWith("c1", images);
        expect(m.deleteCrewPhoto.mock.calls.map((c) => c[0])).toEqual(["p1", "p2"]);
        expect(m.deleteBlobs).toHaveBeenCalledWith(images);
        expect(m.logModerationAction).toHaveBeenCalledWith(expect.objectContaining({ action: "delete", note: "제목\n본문" }));
        // 지운 글로 가는 링크는 싣지 않는다
        expect(m.send.mock.calls[0][0].params).toBeUndefined();
    });

    it("커뮤니티 글 삭제는 이미지 Blob 도 지운다", async () => {
        m.getPostRaw.mockResolvedValue({ id: "t1", images: ["https://x.public.blob.vercel-storage.com/hiq/community/u-1.webp"] });
        await run("community_post", "delete");
        expect(m.deletePost).toHaveBeenCalledWith("t1");
        expect(m.deleteBlobs).toHaveBeenCalledWith(["https://x.public.blob.vercel-storage.com/hiq/community/u-1.webp"]);
    });

    it("크루 댓글 삭제는 게시글 댓글이 없으면 사진 댓글을 지운다", async () => {
        m.getReportTarget.mockResolvedValue(item({ targetType: "crew_comment", actions: ["delete"] }));
        m.getCrewComment.mockResolvedValue(undefined);
        await run("crew_comment", "delete");
        expect(m.deleteCrewComment).not.toHaveBeenCalled();
        expect(m.deleteCrewPhotoComment).toHaveBeenCalledWith("t1");
    });

    it("작성자 정지: 회원의 로그인 계정(프로필)을 정지하고 따로 알리지 않는다", async () => {
        await run("community_post", "ban");
        expect(m.banUser).toHaveBeenCalledWith("pr1");
        expect(m.closeReports).toHaveBeenCalledWith("community_post", "t1", "actioned");
        expect(m.send).not.toHaveBeenCalled();
    });

    it("정지 해제는 신고 상태를 건드리지 않는다", async () => {
        m.getReportTarget.mockResolvedValue(item({ actions: ["unban"] }));
        expect(await run("community_post", "unban")).toEqual({ ok: true, closed: 0 });
        expect(m.unbanUser).toHaveBeenCalledWith("pr1");
        expect(m.closeReports).not.toHaveBeenCalled();
        expect(m.logModerationAction).toHaveBeenCalledWith(expect.objectContaining({ action: "unban" }));
    });

    it("정지할 계정이 없으면 409", async () => {
        m.getMemberById.mockResolvedValue({ id: "a1", profileId: null });
        expect(await run("community_post", "ban")).toMatchObject({ ok: false, status: 409 });
        expect(m.banUser).not.toHaveBeenCalled();
    });

    it("기각: 콘텐츠는 그대로 두고 신고만 '기각'으로 닫는다", async () => {
        await run("community_post", "dismiss");
        expect(m.setReportTargetBlinded).not.toHaveBeenCalled();
        expect(m.deletePost).not.toHaveBeenCalled();
        expect(m.closeReports).toHaveBeenCalledWith("community_post", "t1", "dismissed");
        expect(m.send).not.toHaveBeenCalled();
    });

    it("이의제기 승인은 블라인드를 풀고, 반려는 가린 채 둔다", async () => {
        m.getReportTarget.mockResolvedValue(item({ actions: ["appeal_approve", "appeal_reject"] }));
        await run("community_post", "appeal_approve");
        expect(m.setReportTargetBlinded).toHaveBeenCalledWith("community_post", "t1", false, null);
        expect(m.closeReports).toHaveBeenLastCalledWith("community_post", "t1", "dismissed");
        vi.clearAllMocks();
        m.getReportTarget.mockResolvedValue(item({ actions: ["appeal_approve", "appeal_reject"] }));
        m.closeReports.mockResolvedValue(0);
        await run("community_post", "appeal_reject");
        expect(m.setReportTargetBlinded).not.toHaveBeenCalled();
        expect(m.closeReports).toHaveBeenCalledWith("community_post", "t1", "actioned");
        expect(m.logModerationAction).toHaveBeenCalledWith(expect.objectContaining({ action: "appeal_reject" }));
    });
});

describe("운영자 신고 알림(notifyAdminsOfReport)", () => {
    const report = { targetType: "community_post" as const, targetId: "t1", reason: "abuse", reporterId: "rep1" };

    it("같은 대상으로 최근 알림이 있으면 보내지 않는다", async () => {
        m.getReportAlertState.mockResolvedValue({ freshReport: true, alertedThisTarget: true, targetsAlerted: 1, reporterCount: 2 });
        expect(await notifyAdminsOfReport(report)).toBe(0);
        expect(m.getStaffMemberIds).not.toHaveBeenCalled();
        expect(m.send).not.toHaveBeenCalled();
    });

    it("새 신고면 운영자에게 큐 링크와 대상 키를 실어 보낸다(신고한 운영자 본인은 빼고)", async () => {
        m.getReportAlertState.mockResolvedValue({ freshReport: true, alertedThisTarget: false, targetsAlerted: 0, reporterCount: 1 });
        m.getStaffMemberIds.mockResolvedValue(["adm1", "rep1"]);
        expect(await notifyAdminsOfReport(report)).toBe(1);
        expect(m.send).toHaveBeenCalledTimes(1);
        expect(m.send).toHaveBeenCalledWith(expect.objectContaining({
            // reporterId 는 신고자별 알림 상한(검토 code:R6)을 세려고 운영자 알림에만 싣는다
            memberId: "adm1", type: REPORT_ALERT_TYPE, params: { url: REPORT_QUEUE_URL, reportKey: "community_post:t1", reporterId: report.reporterId },
        }));
    });

    it("운영자가 없으면 보내지 않는다", async () => {
        m.getReportAlertState.mockResolvedValue({ freshReport: true, alertedThisTarget: false, targetsAlerted: 0, reporterCount: 1 });
        m.getStaffMemberIds.mockResolvedValue([]);
        expect(await notifyAdminsOfReport(report)).toBe(0);
    });
});
