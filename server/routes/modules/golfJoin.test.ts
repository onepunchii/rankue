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
        // 정원만이 아니라 **세는 단위**까지 넘긴다(2026-09-24) — 부킹은 팀(건수), 조인은 자리(사람 수).
        expect(block).toContain("decideJoinRequest(req.params.id, req.params.memberId, accept, seatLimit(booking))");
    });

    it("자리는 승인된 사람만 차지한다 — 신청과 승인 둘 다 accepted 로 센다", () => {
        const apply = repo.slice(repo.indexOf("async applyToJoin("), repo.indexOf("async cancelJoinRequest("));
        expect(apply).toContain("AND status = 'accepted'");
        expect(apply).not.toContain("AND status = 'applied'");
        // 자리는 사람 수로, 팀은 건수로 — 단위를 SeatLimit 이 정한다. 내 몫도 더해서 정원과 견준다.
        expect(apply).toContain('limit.unit === "seats"');
        expect(apply).toContain("coalesce(sum(headcount), 0)");
        expect(apply).toContain("+ ${mine} <= ${limit.capacity}");
        // 승인은 글 행을 잠그고(FOR UPDATE) 승인된 사람을 세어 정원과 견준다 — 한 문장짜리 count 는 동시 승인 둘을 못 막았다(2026-09-22).
        const decide = repo.slice(repo.indexOf("async decideJoinRequest("), repo.indexOf("async listMyRequests("));
        expect(decide).toContain('.for("update")');
        expect(decide).toContain('eq(golfJoinRequests.status, "accepted")');
        // 세는 단위는 SeatLimit 이 정하고, **신청자 본인의 몫까지 더해** 견준다(2026-09-24).
        // 2명짜리 부킹 신청을 1로 세던 것이 "네 자리 중 두 자리만 팔렸는데 다 팔림"의 원인이었다.
        expect(decide).toContain("seatExpr(limit)");
        expect(decide).toContain("+ mine > limit.capacity) return \"full\"");
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

describe("부킹 → 조인 전환(2026-09-23 오너: '내가 올린 부킹 내역에서 조인 돌리기')", () => {
    const route = code("server/routes/modules/golf.ts");
    const repo = code("server/storage/golf.repo.ts");
    const i = route.indexOf('router.post("/bookings/:id/to-join"');
    const block = route.slice(i, route.indexOf("router.", i + 10));

    it("라우트가 있고, 글쓴이 본인만 돌릴 수 있다 — 번호로 되짚는 길은 없다", () => {
        expect(i).toBeGreaterThan(-1);
        expect(block).toContain("!booking.ownerId || booking.ownerId !== req.userId");
        expect(block).not.toContain("managerPhone");
    });

    it("두 번 전환·지난 티타임을 막고, **네 자리가 다 팔렸을 때만** 확정으로 막는다", () => {
        expect(block).toContain('booking.listingType === "JOIN"');
        expect(block).toContain("TEE_TIME_PASSED");
        // 2026-09-24 오너("국수맘이 2명 신청했는데 왜 조인으로 전환 버튼이 사라졌지? 2명이니깐 2명을 더"):
        // 예전엔 승인 **행**이 하나라도 있으면 409 였다. 이제는 네 자리가 다 팔렸을 때(reason === "full")만 막는다.
        expect(block).toContain('result.reason === "full"');
        expect(block).toContain("BOOKING_CONFIRMED");
        expect(block).not.toContain("?.accepted ?? 0) > 0");
    });

    it("자리 배열은 화면이 아니라 **서버**가 만든다 — 화면은 '몇 자리 더'만 말한다", () => {
        // 화면이 보낸 배열을 믿으면 "두 자리 팔렸는데 네 자리 남았다"가 통과해 한 팀에 여섯 명을 받는다(2026-09-24).
        expect(block).not.toContain("req.body?.slots");
        expect(block).toContain("req.body?.more");
        expect(block).toContain("{ more, genders, costMode }");
        const conv = repo.slice(repo.indexOf("async convertBookingToJoin("), repo.indexOf("async getGolfBooking("));
        expect(conv).toContain("conversionSlots(sold, patch.more, genders)");
        expect(conv).toContain("convertibleSeats(sold)");
        // 모집 조건은 **이제부터 받을** 자리만 본다 — 이미 팔린 OPEN 칸(무관)까지 세면 늘 '성별무관'이 된다.
        expect(conv).toContain("recruitCondition(genders)");
    });

    it("전환은 id 를 유지하고(공유 링크·채팅방), 글 행을 잠근 채 한 트랜잭션에서 바꾼다", () => {
        const conv = repo.slice(repo.indexOf("async convertBookingToJoin("), repo.indexOf("async getGolfBooking("));
        expect(conv).toContain("tx.update(golfBookings)");
        expect(conv).not.toContain("db.insert(");
        // 팔린 자리를 세고 바꾸는 일이 한 잠금 안에 있어야 한다 — 밖에서 세면 그 사이 승인이 끼어들어
        // 정원보다 많은 사람이 확정된 글이 만들어진다(2026-09-24 검토).
        expect(conv).toContain('.for("update")');
        expect(conv).toContain("db.transaction(");
        expect(conv).toContain("row.ownerId !== ownerId");
        expect(conv).toContain('row.listingType === "JOIN"');
        // 지난 티타임 검사. ⚠️ JS Date 를 sql 에 끼워 넣으면 9시간이 어긋나므로 여기서는 읽어 온 행으로 판정한다.
        expect(conv).toContain('reason: "passed"');
        // sellerType 을 지우면 전환 글이라는 표시가 사라져 화면이 첫 칸을 다시 '호스트'로 그린다(유령 자리).
        expect(conv).not.toContain("sellerType: null");
    });

    it("넘어온 대기 신청의 인원을 1 로 맞춘다 — 안 그러면 4명짜리 부킹 신청이 조인 자리 하나로 세어진다", () => {
        // 부킹 신청은 '팀 통째'라 1~4 명이고, 조인 신청은 늘 1 명이다(apply 라우트: isJoin ? 1 : ...).
        // 정원 검사도 카드의 n/정원도 count(*) 라 headcount 를 안 본다 — 그대로 두면 2자리 조인에
        // 4명이 승인돼 화면은 1/2 인데 현장엔 한 팀이 넘게 온다. 살아 있는 서버로 실제로 재현했다(2026-09-23).
        const conv = repo.slice(repo.indexOf("async convertBookingToJoin("), repo.indexOf("async getGolfBooking("));
        expect(conv).toContain("tx.update(golfJoinRequests)");
        expect(conv).toContain("set({ headcount: 1 })");
        expect(conv).toContain('eq(golfJoinRequests.status, "applied")');
        // **승인된(accepted) 행은 건드리지 않는다**(2026-09-24) — 그 사람들이 산 자리가 곧 sold 이고,
        // 위에서 OPEN 칸으로 앉혀 두었다. 여기서 1 로 깎으면 두 자리를 산 사람이 한 자리로 줄어든다.
        expect(conv).not.toContain('eq(golfJoinRequests.status, "accepted"), ne(');
        // 대기열에서 빼지는 않는다 — 거절은 이 글에 한해 최종이라 되돌릴 길이 없어진다(2026-09-22).
        expect(conv).not.toContain('"rejected"');
        expect(conv).not.toContain("db.delete(golfJoinRequests)");
    });

    it("알림·긴급 방송은 응답 전에 기다린다 — 서버리스는 응답 뒤 얼어붙는다", () => {
        const notify = block.indexOf("await Promise.allSettled(waiting.map");
        const broadcast = block.indexOf("await broadcastUrgentJoin(");
        const success = block.indexOf("return sendSuccess(res");
        expect(notify).toBeGreaterThan(-1);
        expect(notify).toBeLessThan(success);
        expect(broadcast).toBeGreaterThan(-1);
        expect(broadcast).toBeLessThan(success);
    });
});
