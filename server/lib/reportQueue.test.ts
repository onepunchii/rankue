import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
    REPORT_TARGET_TYPES, MODERATION_ACTIONS, TARGET_LABEL, ACTION_LABEL, REASON_LABEL,
    summarizeReports, isAppealOpen, reportStatusForAction, queueState, isOverdue, availableActions,
    shouldAlertAdmins, buildReportAlert, authorNoticeFor, previewText, snapshotNote, reportKey,
    REPORT_ALERT_HOURLY_CAP, REPORT_ALERT_PER_REPORTER_CAP, type ActionContext,
} from "./reportQueue.js";
import { hiqReports } from "../../shared/schema.js";

const at = (iso: string) => new Date(iso);

describe("신고 묶기(summarizeReports)", () => {
    const rows = [
        { reporterId: "a", reason: "abuse", status: "pending", createdAt: at("2026-09-10T10:00:00Z") },
        { reporterId: "b", reason: "spam", status: "pending", createdAt: at("2026-09-10T08:00:00Z") },
        { reporterId: "c", reason: "abuse", status: "actioned", createdAt: at("2026-09-09T08:00:00Z") },
        { reporterId: "d", reason: "gambling", status: "dismissed", createdAt: "2026-09-11T01:00:00Z" },
    ];

    it("건수·신고자 수·상태별 수·기간을 센다", () => {
        const s = summarizeReports(rows);
        expect(s.reportCount).toBe(4);
        expect(s.reporterCount).toBe(4);
        expect(s.pendingCount).toBe(2);
        expect(s.actionedCount).toBe(1);
        expect(s.firstReportedAt?.toISOString()).toBe("2026-09-09T08:00:00.000Z");
        expect(s.latestReportedAt?.toISOString()).toBe("2026-09-11T01:00:00.000Z");
    });
    it("24시간 기한은 **안 닫힌** 신고 중 가장 오래된 것에서 잰다 — 이미 처리한 옛 신고로 재지 않는다", () => {
        expect(summarizeReports(rows).oldestPendingAt?.toISOString()).toBe("2026-09-10T08:00:00.000Z");
    });
    it("사유는 많은 순, 같으면 이름순이고 한국어 이름이 붙는다", () => {
        expect(summarizeReports(rows).reasons).toEqual([
            { reason: "abuse", label: "욕설·비방", count: 2 },
            { reason: "gambling", label: "금전 내기", count: 1 },
            { reason: "spam", label: "도배·스팸", count: 1 },
        ]);
    });
    it("모르는 사유는 원래 값을 그대로 보여 준다", () => {
        expect(summarizeReports([{ reporterId: "a", reason: "weird", status: "pending", createdAt: at("2026-09-10T00:00:00Z") }]).reasons[0].label).toBe("weird");
    });
    it("행 순서가 바뀌어도 결과가 같다", () => {
        expect(summarizeReports([...rows].reverse())).toEqual(summarizeReports(rows));
    });
    it("빈 목록", () => {
        const s = summarizeReports([]);
        expect(s).toMatchObject({ reportCount: 0, reporterCount: 0, pendingCount: 0, firstReportedAt: null, oldestPendingAt: null, reasons: [] });
    });
});

describe("이의제기 열림(isAppealOpen)", () => {
    it("이의제기가 없거나 가려져 있지 않으면 닫혀 있다", () => {
        expect(isAppealOpen({ appealAt: null, isBlinded: true, lastActionAt: null })).toBe(false);
        expect(isAppealOpen({ appealAt: at("2026-09-10T00:00:00Z"), isBlinded: false, lastActionAt: null })).toBe(false);
    });
    it("처리 기록이 없으면(자동 블라인드 뒤 이의제기) 열려 있다", () => {
        expect(isAppealOpen({ appealAt: at("2026-09-10T00:00:00Z"), isBlinded: true, lastActionAt: null })).toBe(true);
    });
    it("마지막 처리보다 나중에 낸 이의제기만 열려 있다 — 반려 뒤 다시 내면 다시 열린다", () => {
        expect(isAppealOpen({ appealAt: "2026-09-10T00:00:00Z", isBlinded: true, lastActionAt: "2026-09-10T01:00:00Z" })).toBe(false);
        expect(isAppealOpen({ appealAt: "2026-09-10T02:00:00Z", isBlinded: true, lastActionAt: "2026-09-10T01:00:00Z" })).toBe(true);
    });
});

describe("조치와 신고 상태", () => {
    it("모든 조치가 신고를 어떻게 닫는지 정해져 있다", () => {
        const map = Object.fromEntries(MODERATION_ACTIONS.map((a) => [a, reportStatusForAction(a)]));
        expect(map).toEqual({
            blind: "actioned", delete: "actioned", ban: "actioned", appeal_reject: "actioned",
            dismiss: "dismissed", unblind: "dismissed", appeal_approve: "dismissed",
            unban: null,
        });
    });
    it("큐 상태: 안 닫힌 신고나 열린 이의제기가 있으면 미처리", () => {
        expect(queueState({ pendingCount: 1, actionedCount: 3, appealOpen: false, lastAction: "blind" })).toBe("open");
        expect(queueState({ pendingCount: 0, actionedCount: 3, appealOpen: true, lastAction: "blind" })).toBe("open");
    });
    it("큐 상태: 마지막 처리가 말하는 쪽을 따른다", () => {
        expect(queueState({ pendingCount: 0, actionedCount: 0, appealOpen: false, lastAction: "delete" })).toBe("actioned");
        expect(queueState({ pendingCount: 0, actionedCount: 2, appealOpen: false, lastAction: "appeal_approve" })).toBe("dismissed");
    });
    it("큐 상태: 정지 해제나 처리 기록 없음이면 신고 행 상태로 판단한다", () => {
        expect(queueState({ pendingCount: 0, actionedCount: 1, appealOpen: false, lastAction: "unban" })).toBe("actioned");
        expect(queueState({ pendingCount: 0, actionedCount: 0, appealOpen: false, lastAction: null })).toBe("dismissed");
    });
    it("24시간 초과", () => {
        const now = at("2026-09-11T12:00:00Z");
        expect(isOverdue(at("2026-09-10T11:59:00Z"), now)).toBe(true);
        expect(isOverdue(at("2026-09-10T12:01:00Z"), now)).toBe(false);
        expect(isOverdue(null, now)).toBe(false);
    });
});

describe("가능한 조치(availableActions)", () => {
    const base: ActionContext = {
        targetType: "community_post", exists: true, isBlinded: false, appealOpen: false, pendingCount: 2,
        author: { canBan: true, banned: false },
    };
    it("커뮤니티 글: 가리기·지우기·작성자 정지·기각", () => {
        expect(availableActions(base)).toEqual(["blind", "delete", "ban", "dismiss"]);
    });
    it("가려진 글에 이의제기가 열려 있으면 판정 버튼이 먼저, 해제는 승인으로만", () => {
        expect(availableActions({ ...base, isBlinded: true, appealOpen: true, pendingCount: 0 }))
            .toEqual(["appeal_approve", "appeal_reject", "delete", "ban"]);
        expect(availableActions({ ...base, isBlinded: true })).toEqual(["unblind", "delete", "ban", "dismiss"]);
    });
    it("크루 콘텐츠는 가릴 칸이 없어 지우기만 된다", () => {
        for (const t of ["crew_post", "crew_comment", "crew_photo", "crew_photo_comment", "crew_chat"] as const) {
            expect(availableActions({ ...base, targetType: t })).toEqual(["delete", "ban", "dismiss"]);
        }
    });
    it("골프 매물은 지우지 않고 가리기만 한다", () => {
        expect(availableActions({ ...base, targetType: "golf_booking" })).toEqual(["blind", "ban", "dismiss"]);
    });
    it("회원 신고는 사람 조치만", () => {
        expect(availableActions({ ...base, targetType: "member" })).toEqual(["ban", "dismiss"]);
        expect(availableActions({ ...base, targetType: "member", author: { canBan: true, banned: true } })).toEqual(["unban", "dismiss"]);
    });
    it("원문이 없으면 콘텐츠 조치가 사라지고 사람 조치는 남는다", () => {
        expect(availableActions({ ...base, exists: false })).toEqual(["ban", "dismiss"]);
    });
    it("정지할 계정이 없거나 운영자면 정지 버튼이 없다", () => {
        expect(availableActions({ ...base, author: { canBan: false, banned: false } })).toEqual(["blind", "delete", "dismiss"]);
        expect(availableActions({ ...base, author: null, pendingCount: 0 })).toEqual(["blind", "delete"]);
    });
    it("이의제기 경로가 없는 대상엔 이의제기 버튼을 만들지 않는다", () => {
        expect(availableActions({ ...base, targetType: "golf_booking", isBlinded: true, appealOpen: true })).not.toContain("appeal_approve");
    });
});

describe("운영자 알림 도배 방지(shouldAlertAdmins)", () => {
    it("새 신고이고 이 대상으로 최근 알림이 없고 상한 아래면 보낸다", () => {
        expect(shouldAlertAdmins({ freshReport: true, alertedThisTarget: false, targetsAlerted: 0 })).toBe(true);
    });
    it("같은 사람이 또 누른 신고(새 행 없음)는 알리지 않는다", () => {
        expect(shouldAlertAdmins({ freshReport: false, alertedThisTarget: false, targetsAlerted: 0 })).toBe(false);
    });
    it("같은 대상은 창 안에 한 번만", () => {
        expect(shouldAlertAdmins({ freshReport: true, alertedThisTarget: true, targetsAlerted: 1 })).toBe(false);
    });
    it("시간당 상한을 넘으면 멈춘다(큐에는 그대로 있다)", () => {
        expect(shouldAlertAdmins({ freshReport: true, alertedThisTarget: false, targetsAlerted: REPORT_ALERT_HOURLY_CAP - 1 })).toBe(true);
        expect(shouldAlertAdmins({ freshReport: true, alertedThisTarget: false, targetsAlerted: REPORT_ALERT_HOURLY_CAP })).toBe(false);
    });

    it("한 신고자는 창 안에 몇 대상까지만 알림을 일으킨다 — 가짜 신고로 전체 상한을 먼저 채우지 못하게", () => {
        const base = { freshReport: true, alertedThisTarget: false, targetsAlerted: 0 };
        expect(shouldAlertAdmins({ ...base, reporterAlerts: REPORT_ALERT_PER_REPORTER_CAP - 1 })).toBe(true);
        expect(shouldAlertAdmins({ ...base, reporterAlerts: REPORT_ALERT_PER_REPORTER_CAP })).toBe(false);
        // 옛 호출처럼 값이 없으면 0 으로 본다
        expect(shouldAlertAdmins(base)).toBe(true);
    });
    it("알림 문구엔 종류·사유·신고자 수만 — 원문은 싣지 않는다", () => {
        expect(buildReportAlert({ targetType: "crew_chat", reason: "privacy", reporterCount: 1 }).body)
            .toBe("크루 채팅 · 개인정보 노출. 24시간 안에 확인해 주세요.");
        expect(buildReportAlert({ targetType: "community_post", reason: "abuse", reporterCount: 3 }).body)
            .toBe("커뮤니티 글 · 욕설·비방 · 신고 3명. 24시간 안에 확인해 주세요.");
    });
    it("reportKey", () => {
        expect(reportKey("member", "x")).toBe("member:x");
    });
});

describe("작성자 안내(authorNoticeFor)", () => {
    it("이의제기 경로가 있는 대상에만 이의제기 안내를 붙인다", () => {
        expect(authorNoticeFor("blind", "community_comment")?.body).toContain("이의제기");
        expect(authorNoticeFor("blind", "golf_booking")?.body).not.toContain("이의제기");
    });
    it("기각·정지·정지 해제는 따로 알리지 않는다", () => {
        expect(authorNoticeFor("dismiss", "community_post")).toBeNull();
        expect(authorNoticeFor("ban", "community_post")).toBeNull();
        expect(authorNoticeFor("unban", "member")).toBeNull();
    });
});

describe("미리보기·스냅샷", () => {
    it("빈 줄 도배를 줄이고 길면 자른다", () => {
        expect(previewText("가\n\n\n\n나")).toBe("가\n\n나");
        expect(previewText("  ")).toBeNull();
        expect(previewText("a".repeat(10), 5)).toBe("aaaa…");
    });
    it("삭제 스냅샷은 제목과 본문을 잇는다", () => {
        expect(snapshotNote("제목", "본문")).toBe("제목\n본문");
        expect(snapshotNote(null, null)).toBeNull();
    });
});

describe("다른 곳과 목록이 맞다", () => {
    it("신고 대상 종류 = DB 칸(enum), 신고 API 가 받는 종류는 모두 큐가 안다", () => {
        expect([...hiqReports.targetType.enumValues].sort()).toEqual([...REPORT_TARGET_TYPES].sort());
        const src = readFileSync(new URL("../routes/modules/community.ts", import.meta.url), "utf8");
        const list = (name: string) => JSON.parse(src.match(new RegExp(`const ${name} = (\\[[^\\]]+\\])`))![1]) as string[];
        // 크루 사진 댓글처럼 다른 경로(크루 라우트)로만 받는 종류가 있어 부분집합으로 본다.
        for (const t of list("REPORT_TARGETS")) expect(REPORT_TARGET_TYPES as readonly string[]).toContain(t);
        expect([...list("REPORT_REASONS")].sort()).toEqual(Object.keys(REASON_LABEL).sort());
    });
    it("모든 종류·조치에 한국어 이름이 있다", () => {
        for (const t of REPORT_TARGET_TYPES) expect(TARGET_LABEL[t]).toBeTruthy();
        for (const a of MODERATION_ACTIONS) expect(ACTION_LABEL[a]).toBeTruthy();
    });
});
