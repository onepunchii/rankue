import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

/**
 * 골프 조인 2026-09-21(오너: "누구나 만들기 쉽게 · 호스트 승인제"). 라우트의 문지기가 바뀐 지점을 소스로 지킨다 —
 * 누가 부킹 권한 검사를 다시 앞으로 올리면 조인이 조용히 매니저 전용으로 돌아간다(오류 없이, 403 만 늘어난다).
 */
const read = (f: string) => readFileSync(path.resolve(process.cwd(), f), "utf8");
const code = (f: string) => read(f).split("\n").filter((l) => !l.trim().startsWith("*") && !l.trim().startsWith("//") && !l.trim().startsWith("/*")).join("\n");

describe("조인 글 올리기는 누구나, 부킹은 매니저만", () => {
    const route = code("server/routes/modules/golf.ts");
    const i = route.indexOf('router.post("/bookings", requireAuth');
    const block = route.slice(i, route.indexOf("router.", i + 10));

    it("전부 조인이면 권한·연락처 검사를 건너뛴다", () => {
        expect(block).toContain('items.every((it: any) => it?.listingType === "JOIN")');
        expect(block).toContain("if (!allJoin && !BOOKING_WRITER_ROLES.includes(String(role)))");
        expect(block).toContain("if (!allJoin && !phone)");
    });

    it("자리 목록은 shared 규칙으로 검증하고 모집 인원은 자리에서 센다", () => {
        expect(block).toContain("normalizeSlots(rest.slots)");
        expect(block).toContain("rest.joinHeadcount = openSlotCount(slots)");
        expect(block).toContain("isKoreaCoord(rest.lat, rest.lng)");
    });
});

describe("호스트 승인제", () => {
    const route = code("server/routes/modules/golf.ts");
    const repo = code("server/storage/golf.repo.ts");

    it("승인·거절 라우트가 있고 글쓴이만 부른다", () => {
        const i = route.indexOf('router.post("/bookings/:id/applicants/:memberId/decision"');
        expect(i).toBeGreaterThan(-1);
        const block = route.slice(i, route.indexOf("router.", i + 10));
        expect(block).toContain("canManageBooking(req, booking)");
        expect(block).toContain("decideJoinRequest(req.params.id, req.params.memberId, accept, joinCapacity(booking))");
    });

    it("자리는 승인된 사람만 차지한다 — 신청과 승인 둘 다 accepted 로 센다", () => {
        const apply = repo.slice(repo.indexOf("async applyToJoin("), repo.indexOf("async cancelJoinRequest("));
        expect(apply).toContain("AND status = 'accepted'");
        expect(apply).not.toContain("AND status = 'applied'\n            ) <");
        const decide = repo.slice(repo.indexOf("async decideJoinRequest("), repo.indexOf("async listJoinApplicants("));
        expect(decide).toContain("status = 'accepted') < ${capacity}");
    });

    it("노쇼는 확정된 사람에게만, 되돌리면 확정으로", () => {
        const ns = repo.slice(repo.indexOf("async setJoinNoShow("), repo.indexOf("async createGolfJoin("));
        expect(ns).toContain('status: noShow ? "noshow" : "accepted"');
        expect(ns).toContain('noShow ? "accepted" : "noshow"');
    });
});
