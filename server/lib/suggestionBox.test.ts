import { describe, it, expect } from "vitest";
import {
    SUGGESTION_TYPES, SUGGESTION_TYPE_LABEL, SUGGESTION_QUEUE_URL, SUGGESTION_PREVIEW_MAX, SUGGESTION_ALERT_GLOBAL_CAP,
    suggestionTypeLabel, suggestionPreview, buildSuggestionAlert, shouldAlertSuggestion, alertRecipients,
    attachReplies, matchReplyToSuggestion,
} from "./suggestionBox.js";

describe("건의 종류 이름표", () => {
    it("네 종류 모두 한국어 이름이 있다", () => {
        for (const t of SUGGESTION_TYPES) expect(SUGGESTION_TYPE_LABEL[t]).toBeTruthy();
        expect(suggestionTypeLabel("BUG")).toBe("버그");
        expect(suggestionTypeLabel("FEATURE")).toBe("기능 제안");
        expect(suggestionTypeLabel("PARTNERSHIP")).toBe("제휴");
        expect(suggestionTypeLabel("ETC")).toBe("기타");
    });

    it("모르는 값·빈 값은 '기타'로 — 제목에 영문 코드나 undefined 가 뜨지 않게", () => {
        expect(suggestionTypeLabel("WHATEVER")).toBe("기타");
        expect(suggestionTypeLabel(undefined)).toBe("기타");
        expect(suggestionTypeLabel("toString")).toBe("기타"); // 프로토타입 이름이 이름표로 새지 않는다
    });
});

describe("알림 본문 미리보기", () => {
    it("줄바꿈·연속 공백을 한 칸으로 접어 한 줄로 만든다", () => {
        expect(suggestionPreview("  첫 줄\n\n둘째   줄\t끝 ")).toBe("첫 줄 둘째 줄 끝");
    });

    it("길면 잘라서 말줄임표를 붙이고, 짧으면 그대로 둔다", () => {
        const long = "가".repeat(SUGGESTION_PREVIEW_MAX + 20);
        const p = suggestionPreview(long);
        expect(p.endsWith("…")).toBe(true);
        expect(Array.from(p).length).toBe(SUGGESTION_PREVIEW_MAX + 1);
        expect(suggestionPreview("가".repeat(SUGGESTION_PREVIEW_MAX))).toBe("가".repeat(SUGGESTION_PREVIEW_MAX));
    });

    it("이모지를 반쪽으로 자르지 않는다", () => {
        const p = suggestionPreview("😀".repeat(10), 3);
        expect(p).toBe("😀😀😀…");
    });

    it("비었거나 문자열이 아니면 자리표시 문구", () => {
        expect(suggestionPreview("   \n ")).toBe("(내용 없음)");
        expect(suggestionPreview(undefined)).toBe("(내용 없음)");
    });
});

describe("운영자 알림 문구·수신자·도배 방지", () => {
    it("제목에 종류, 본문에 한 줄 미리보기", () => {
        expect(buildSuggestionAlert({ type: "BUG", content: "점수판이\n멈춰요" })).toEqual({ title: "📮 새 건의 · 버그", body: "점수판이 멈춰요" });
        expect(buildSuggestionAlert({ type: "PARTNERSHIP", content: "제휴 문의" }).title).toBe("📮 새 건의 · 제휴");
    });

    it("최근에 이 회원 건의로 알림을 보냈으면 건너뛴다", () => {
        expect(shouldAlertSuggestion({ alertedRecently: false })).toBe(true);
        expect(shouldAlertSuggestion({ alertedRecently: true })).toBe(false);
    });

    it("창 안에 알린 작성자가 전체 상한에 닿으면 새 작성자라도 건너뛴다(계정 여럿으로 도배)", () => {
        expect(shouldAlertSuggestion({ alertedRecently: false, submittersAlerted: 0 })).toBe(true);
        expect(shouldAlertSuggestion({ alertedRecently: false, submittersAlerted: SUGGESTION_ALERT_GLOBAL_CAP - 1 })).toBe(true);
        expect(shouldAlertSuggestion({ alertedRecently: false, submittersAlerted: SUGGESTION_ALERT_GLOBAL_CAP })).toBe(false);
        expect(shouldAlertSuggestion({ alertedRecently: false, submittersAlerted: 2 }, 2)).toBe(false);
    });

    it("건의를 쓴 본인(운영자)은 빼고, 중복은 한 번만", () => {
        expect(alertRecipients(["a", "b", "a", "me"], "me")).toEqual(["a", "b"]);
        expect(alertRecipients(["a"], null)).toEqual(["a"]);
        expect(alertRecipients([], "me")).toEqual([]);
    });

    it("알림 링크는 대시보드 건의함 탭", () => {
        expect(SUGGESTION_QUEUE_URL).toBe("/admin/dashboard?tab=suggestions");
    });
});

describe("건의에 답장 붙이기", () => {
    const d = (iso: string) => new Date(iso);

    it("건의마다 답장을 오래된 것부터 붙이고, 답장 없는 건의는 빈 배열", () => {
        const rows = [{ id: "s1", content: "a" }, { id: "s2", content: "b" }];
        const out = attachReplies(rows, [
            { id: "r2", suggestionId: "s1", message: "두 번째", createdAt: d("2026-09-02T00:00:00Z") },
            { id: "r1", suggestionId: "s1", message: "첫 번째", createdAt: d("2026-09-01T00:00:00Z") },
            { id: "r9", suggestionId: "gone", message: "지워진 건의", createdAt: d("2026-09-01T00:00:00Z") },
        ]);
        expect(out.map((s) => s.id)).toEqual(["s1", "s2"]); // 건의 순서는 그대로
        expect(out[0].replies.map((r) => r.message)).toEqual(["첫 번째", "두 번째"]);
        expect(out[0].replies[0]).toEqual({ id: "r1", message: "첫 번째", createdAt: d("2026-09-01T00:00:00Z") }); // suggestionId 는 싣지 않는다
        expect(out[1].replies).toEqual([]);
        expect(out[0].content).toBe("a");
    });
});

describe("옛 답장 알림을 건의에 짝짓기", () => {
    it("알림보다 먼저 쓴 건의 중 가장 최근 것", () => {
        expect(matchReplyToSuggestion(100, [
            { id: "old", createdAt: 10 }, { id: "recent", createdAt: 90 }, { id: "after", createdAt: 150 },
        ])).toEqual({ kind: "matched", suggestionId: "recent" });
    });

    it("먼저 쓴 건의가 없으면 짝이 없다(알림 뒤에 쓴 건의는 답장 대상이 아니다)", () => {
        expect(matchReplyToSuggestion(100, [{ id: "after", createdAt: 150 }])).toEqual({ kind: "unmatched" });
        expect(matchReplyToSuggestion(100, [{ id: "same", createdAt: 100 }])).toEqual({ kind: "unmatched" });
        expect(matchReplyToSuggestion(100, [])).toEqual({ kind: "unmatched" });
    });

    it("가장 최근 시각이 같은 건의가 둘이면 어느 쪽인지 몰라 건너뛴다", () => {
        expect(matchReplyToSuggestion(100, [{ id: "x", createdAt: 50 }, { id: "y", createdAt: 50 }, { id: "z", createdAt: 10 }]))
            .toEqual({ kind: "ambiguous", suggestionIds: ["x", "y"] });
    });
});
