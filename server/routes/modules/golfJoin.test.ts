import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

/**
 * 골프 조인 2026-09-21(오너: "누구나 만들기 쉽게 · 호스트 승인제"). 라우트의 문지기가 바뀐 지점을 소스로 지킨다 —
 * 누가 부킹 권한 검사를 다시 앞으로 올리면 조인이 조용히 매니저 전용으로 돌아간다(오류 없이, 403 만 늘어난다).
 */
const read = (f: string) => readFileSync(path.resolve(process.cwd(), f), "utf8");
const code = (f: string) => read(f).split("\n").filter((l) => !l.trim().startsWith("*") && !l.trim().startsWith("//") && !l.trim().startsWith("/*")).join("\n");

describe("조인·부킹 모두 누구나 올린다(2026-09-21 A안) — 부킹만 연락처가 필요하고 올린 쪽을 적는다", () => {
    const route = code("server/routes/modules/golf.ts");
    const i = route.indexOf('router.post("/bookings", requireAuth');
    const block = route.slice(i, route.indexOf("router.", i + 10));

    it("권한 검사는 없고, 조인이 아니면 연락처가 있어야 한다", () => {
        expect(block).toContain('items.every((it: any) => it?.listingType === "JOIN")');
        expect(block).not.toContain("NOT_BOOKING_MANAGER");
        expect(block).toContain("if (!allJoin && !phone)");
    });

    it("매장·매니저 권한이면 STORE, 아니면 PERSONAL — 개인은 핫딜을 못 켠다", () => {
        expect(block).toContain('BOOKING_WRITER_ROLES.includes(String(role)) ? "STORE" : "PERSONAL"');
        expect(block).toContain('if (sellerType === "PERSONAL") rest.isHotDeal = false;');
        expect(block).toContain('sellerType: rest.listingType === "JOIN" ? null : sellerType');
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
        // 승인은 글 행을 잠그고(FOR UPDATE) 승인된 사람을 세어 정원과 견준다 — 한 문장짜리 count 는 동시 승인 둘을 못 막았다(2026-09-22).
        const decide = repo.slice(repo.indexOf("async decideJoinRequest("), repo.indexOf("async listMyRequests("));
        expect(decide).toContain('.for("update")');
        expect(decide).toContain('eq(golfJoinRequests.status, "accepted")');
        expect(decide).toContain(">= capacity) return \"full\"");
    });

    it("노쇼는 확정된 사람에게만, 되돌리면 확정으로", () => {
        const ns = repo.slice(repo.indexOf("async setJoinNoShow("), repo.indexOf("async createGolfJoin("));
        expect(ns).toContain('status: noShow ? "noshow" : "accepted"');
        expect(ns).toContain('noShow ? "accepted" : "noshow"');
    });
});

describe("2026-09-22 리뷰로 잠근 것 — 연락처·비공개 가림, 거절은 최종", () => {
    const route = code("server/routes/modules/golf.ts");
    const repo = code("server/storage/golf.repo.ts");

    it("연락처 공개는 매장 부킹 하나뿐 — 조인·개인 양도는 올린 사람과 확정자에게만", () => {
        const block = route.slice(route.indexOf("async function withJoinCounts("), route.indexOf('router.get("/joins"'));
        expect(block).toContain('const isStoreBooking = r.listingType !== "JOIN" && r.sellerType !== "PERSONAL";');
        expect(block).toContain('const showPhone = isStoreBooking || isOwner || myStatus === "accepted";');
        expect(block).not.toContain('r.listingType !== "BOOKING" ||');
    });

    it("비공개 글은 서버가 실명·좌표를 가리고, 검색은 가명만 본다", () => {
        const block = route.slice(route.indexOf("async function withJoinCounts("), route.indexOf('router.get("/joins"'));
        expect(block).toContain("const mask = !!r.isBlind && !isOwner && !isConfirmed;");
        expect(block).toContain("lat: null, lng: null");
        expect(repo).toContain("and(eq(golfBookings.isBlind, false), like(golfBookings.courseName,");
    });

    it("거절된 사람은 재신청이 막히고, 호스트는 거절을 되돌려 승인할 수 있다", () => {
        const apply = repo.slice(repo.indexOf("async applyToJoin("), repo.indexOf("async cancelJoinRequest("));
        expect(apply).toContain('if (existing?.status === "rejected" || existing?.status === "noshow") return "rejected";');
        const decide = repo.slice(repo.indexOf("async decideJoinRequest("), repo.indexOf("async listMyRequests("));
        expect(decide).toContain('row?.status !== "applied" && row?.status !== "rejected"');
        expect(repo).not.toContain("async rejectOtherPending(");
    });
});
