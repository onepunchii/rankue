import { describe, it, expect, vi, beforeEach } from "vitest";

// DB 없이 조치 흐름만 본다 — storage·알림·Blob 삭제는 가짜로 바꾼다.
const m = vi.hoisted(() => ({
    getReportTarget: vi.fn(), setReportTargetBlinded: vi.fn(), closeReports: vi.fn(), logModerationAction: vi.fn(),
    unbanUser: vi.fn(), findCrewAlbumCopies: vi.fn(), getReportAlertState: vi.fn(), getStaffMemberIds: vi.fn(),
    getPostRaw: vi.fn(), deletePost: vi.fn(), deleteComment: vi.fn(),
    getCrewPost: vi.fn(), deleteCrewPost: vi.fn(), deleteCrewPhoto: vi.fn(), getCrewComment: vi.fn(),
    deleteCrewComment: vi.fn(), deleteCrewPhotoComment: vi.fn(), getCrewPhoto: vi.fn(), deleteCrewChat: vi.fn(),
    getMemberById: vi.fn(), banUser: vi.fn(), send: vi.fn(), deleteBlobs: vi.fn(),
    getGolfPhoto: vi.fn(), deleteGolfPhoto: vi.fn(),
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
        golfPhotos: { get: m.getGolfPhoto, delete: m.deleteGolfPhoto },
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

// 라운드 사진(감사 4.1, 2026-10-01) — 신고 큐와 골프 관리 '라운드 사진' 화면이 같은 실행기를 쓴다.
describe("라운드 사진 조치(golf_photo)", () => {
    const photoItem = (actions: string[], over: Record<string, unknown> = {}) => item({
        targetType: "golf_photo",
        actions,
        content: {
            exists: true, title: "동강시스타", text: null, images: ["https://x.public.blob.vercel-storage.com/hiq/golf-thumb/a.webp"],
            isBlinded: true, blindReason: null, meta: "라운드 사진 · 비공개(앨범만)",
            // 비공개 사진의 '원문 열기'는 Blob 주소다 — 작성자 알림 링크로 쓰면 안 된다
            link: "https://x.public.blob.vercel-storage.com/hiq/golf-photo/a.webp", crewName: null, createdAt: null,
        },
        ...over,
    });
    const runPhoto = (action: string, extra: Record<string, unknown> = {}) =>
        applyModerationAction({ targetType: "golf_photo", targetId: "ph1", action: action as any, adminProfileId: "admin-p", ...extra });

    beforeEach(() => {
        m.getGolfPhoto.mockResolvedValue({ id: "ph1", sessionId: "round-1", memberId: "a1" });
    });

    it("이의제기 승인: 가림을 풀고, 신고를 기각으로 닫고, 결과를 골프 알림함으로 보내 그 경기 앨범을 연다", async () => {
        m.getReportTarget.mockResolvedValue(photoItem(["appeal_approve", "appeal_reject", "delete"]));
        expect(await runPhoto("appeal_approve")).toEqual({ ok: true, closed: 2 });
        expect(m.setReportTargetBlinded).toHaveBeenCalledWith("golf_photo", "ph1", false, null);
        expect(m.closeReports).toHaveBeenCalledWith("golf_photo", "ph1", "dismissed");
        expect(m.logModerationAction).toHaveBeenCalledWith(expect.objectContaining({ targetType: "golf_photo", action: "appeal_approve", authorMemberId: "a1" }));
        expect(m.send).toHaveBeenCalledWith(expect.objectContaining({
            memberId: "a1", category: "GOLF", type: "MODERATION",
            title: "notif.moderation.appealResult.title", body: "notif.moderation.appealApprove.body",
            params: { url: "/history?album=round-1" },
        }));
    });

    it("이의제기 반려: 가린 채 두고, 신고를 조치로 닫고, 운영자 메모는 처리 기록에만 남긴다", async () => {
        m.getReportTarget.mockResolvedValue(photoItem(["appeal_approve", "appeal_reject", "delete"]));
        await runPhoto("appeal_reject", { note: "  동반자 얼굴이 그대로 보임 \r\n" });
        expect(m.setReportTargetBlinded).not.toHaveBeenCalled();
        expect(m.closeReports).toHaveBeenCalledWith("golf_photo", "ph1", "actioned");
        expect(m.logModerationAction).toHaveBeenCalledWith(expect.objectContaining({ action: "appeal_reject", note: "동반자 얼굴이 그대로 보임" }));
        const sent = m.send.mock.calls[0][0];
        expect(sent).toMatchObject({ category: "GOLF", body: "notif.moderation.appealReject.body", params: { url: "/history?album=round-1" } });
        expect(JSON.stringify(sent)).not.toContain("동반자 얼굴");
    });

    it("지우기: 행과 원본·썸네일 Blob 을 함께 지우고, 링크 없이 골프 알림함으로 알린다", async () => {
        m.getReportTarget.mockResolvedValue(photoItem(["unblind", "delete"]));
        m.deleteGolfPhoto.mockResolvedValue({ url: "https://x/hiq/golf-photo/a.webp", thumbUrl: "https://x/hiq/golf-thumb/a.webp" });
        await runPhoto("delete");
        expect(m.getGolfPhoto).toHaveBeenCalledWith("ph1"); // 경기 id 는 지우기 전에 읽는다
        expect(m.deleteGolfPhoto).toHaveBeenCalledWith("ph1");
        expect(m.deleteBlobs).toHaveBeenCalledWith(["https://x/hiq/golf-photo/a.webp", "https://x/hiq/golf-thumb/a.webp"]);
        expect(m.closeReports).toHaveBeenCalledWith("golf_photo", "ph1", "actioned");
        expect(m.logModerationAction).toHaveBeenCalledWith(expect.objectContaining({ action: "delete", note: "동강시스타" }));
        const sent = m.send.mock.calls[0][0];
        expect(sent).toMatchObject({ category: "GOLF", body: "notif.moderation.delete.body" });
        expect(sent.params).toBeUndefined();
    });

    it("가리기는 이의제기 안내 문구로 간다(사진도 앨범에서 이의제기할 수 있다)", async () => {
        m.getReportTarget.mockResolvedValue(photoItem(["blind", "delete"], { content: { ...photoItem([]).content, isBlinded: false } }));
        await runPhoto("blind");
        expect(m.setReportTargetBlinded).toHaveBeenCalledWith("golf_photo", "ph1", true, expect.any(String));
        expect(m.send.mock.calls[0][0]).toMatchObject({ category: "GOLF", body: "notif.moderation.blind.bodyAppeal" });
    });

    it("골프 관리 화면은 신고가 없는 사진에도 조치한다(allowUnreported) — 신고 큐 경로는 그대로 신고가 있어야 한다", async () => {
        m.getReportTarget.mockResolvedValue(photoItem(["blind", "delete"], { reportCount: 0 }));
        await runPhoto("delete", { allowUnreported: true });
        expect(m.getReportTarget).toHaveBeenCalledWith("golf_photo", "ph1", { unreported: true });
        vi.clearAllMocks();
        m.getReportTarget.mockResolvedValue(null);
        expect(await run("community_post", "blind")).toMatchObject({ ok: false, status: 404, message: "신고 내역을 찾을 수 없습니다" });
        expect(m.getReportTarget).toHaveBeenCalledWith("community_post", "t1", { unreported: false });
        expect(await runPhoto("blind", { allowUnreported: true })).toMatchObject({ ok: false, status: 404, message: "대상을 찾을 수 없습니다" });
    });

    it("열린 이의제기가 있으면 '보이기'는 409 — 풀기는 승인으로만", async () => {
        m.getReportTarget.mockResolvedValue(photoItem(["appeal_approve", "appeal_reject", "delete"]));
        expect(await runPhoto("unblind", { allowUnreported: true })).toMatchObject({ ok: false, status: 409 });
        expect(m.setReportTargetBlinded).not.toHaveBeenCalled();
        expect(m.logModerationAction).not.toHaveBeenCalled();
        expect(m.send).not.toHaveBeenCalled();
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
