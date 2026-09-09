import { describe, it, expect } from "vitest";
import { summarize, type FeedIssue } from "./feedHealth";

describe("랭킹 수집 건강 점검 요약", () => {
    it("밀림·출처 오류를 한 줄로 적는다", () => {
        const issues: FeedIssue[] = [
            { feed: "umb", scope: "players", kind: "stale", detail: "출처 2026-09-06 · 우리 2026-07-18" },
            { feed: "pba", scope: "LPBA 2026", kind: "source-error", detail: "fetch failed" },
        ];
        const s = summarize(issues);
        expect(s).toContain("UMB players: 밀림");
        expect(s).toContain("PBA LPBA 2026: 출처 오류");
        expect(s).toContain("2026-07-18");
        expect(summarize([])).toBe("");
    });
});
