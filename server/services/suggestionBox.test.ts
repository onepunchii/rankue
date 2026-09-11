import { describe, it, expect, vi, beforeEach } from "vitest";

// DB 없이 알림 흐름만 본다 — storage·알림 발송은 가짜로 바꾼다.
const m = vi.hoisted(() => ({ getSuggestionAlertState: vi.fn(), getStaffMemberIds: vi.fn(), send: vi.fn() }));
vi.mock("../storage/index.js", () => ({
    storage: { admin: { getSuggestionAlertState: m.getSuggestionAlertState, getStaffMemberIds: m.getStaffMemberIds } },
}));
vi.mock("./notificationService.js", () => ({ notificationService: { sendAndSaveNotification: m.send } }));

import { notifyAdminsOfSuggestion } from "./suggestionBox";
import { SUGGESTION_ALERT_TYPE, SUGGESTION_QUEUE_URL } from "../lib/suggestionBox";

const input = { suggestionId: "s1", type: "BUG", content: "점수판이\n멈춰요", submitterMemberId: "mem1" };

describe("새 건의 운영자 알림(notifyAdminsOfSuggestion)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        m.send.mockResolvedValue(undefined);
    });

    it("이 회원 건의로 최근에 알렸으면 보내지 않는다", async () => {
        m.getSuggestionAlertState.mockResolvedValue({ alertedRecently: true });
        expect(await notifyAdminsOfSuggestion(input)).toBe(0);
        expect(m.getSuggestionAlertState).toHaveBeenCalledWith("mem1");
        expect(m.getStaffMemberIds).not.toHaveBeenCalled();
        expect(m.send).not.toHaveBeenCalled();
    });

    it("창 안에 알린 작성자가 전체 상한이면 보내지 않는다", async () => {
        m.getSuggestionAlertState.mockResolvedValue({ alertedRecently: false, submittersAlerted: 5 });
        expect(await notifyAdminsOfSuggestion(input)).toBe(0);
        expect(m.getStaffMemberIds).not.toHaveBeenCalled();
        expect(m.send).not.toHaveBeenCalled();
    });

    it("운영자에게 건의함 링크·건의 id·작성자를 실어 보낸다(쓴 본인은 빼고)", async () => {
        m.getSuggestionAlertState.mockResolvedValue({ alertedRecently: false });
        m.getStaffMemberIds.mockResolvedValue(["adm1", "mem1", "adm2"]);
        expect(await notifyAdminsOfSuggestion(input)).toBe(2);
        expect(m.send).toHaveBeenCalledTimes(2);
        expect(m.send).toHaveBeenCalledWith({
            memberId: "adm1",
            title: "📮 새 건의 · 버그",
            body: "점수판이 멈춰요",
            category: "admin",
            type: SUGGESTION_ALERT_TYPE,
            params: { url: SUGGESTION_QUEUE_URL, suggestionId: "s1", submitterMemberId: "mem1" },
        });
        expect(m.send.mock.calls.map((c) => c[0].memberId)).toEqual(["adm1", "adm2"]);
    });

    it("한 운영자에게 실패해도 나머지에게는 가고, 예외를 던지지 않는다", async () => {
        m.getSuggestionAlertState.mockResolvedValue({ alertedRecently: false });
        m.getStaffMemberIds.mockResolvedValue(["adm1", "adm2"]);
        m.send.mockRejectedValueOnce(new Error("push down")).mockResolvedValueOnce(undefined);
        expect(await notifyAdminsOfSuggestion(input)).toBe(1);
    });

    it("운영자가 없으면(또는 본인뿐이면) 보내지 않는다", async () => {
        m.getSuggestionAlertState.mockResolvedValue({ alertedRecently: false });
        m.getStaffMemberIds.mockResolvedValue(["mem1"]);
        expect(await notifyAdminsOfSuggestion(input)).toBe(0);
        expect(m.send).not.toHaveBeenCalled();
    });
});
