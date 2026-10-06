import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
// 순수 모듈 — DB 를 물지 않는다
import { checkContent } from "../server/utils/contentFilter.js";

/**
 * 2026-10-06 — 골프 조인·부킹의 UGC 안전장치(스토어 심사 1.2 · 개인정보). 다시 빠지지 않게 소스를 읽어 지킨다.
 * 라우트·저장소는 DB 를 물고 있어 불러오지 못한다 — 이 저장소의 다른 골프 시험(server/routes/modules/golfJoin.test.ts)과 같은 방식이다.
 * 화면 코드도 여기서 본다(vitest 는 client/src 에서 sim·golf 만 읽는다).
 *
 *  (가) 올리기 문: POST /bookings 는 약관 동의·정지 계정 문지기를 지난다.
 *  (나) 내용 필터: 남에게 보이는 글자 칸 여덟을 "listing" 맥락으로 본다(판정 표는 server/utils/contentFilter.test.ts).
 *       region·courseType 도 그 안이고, 옵션은 아는 id 만 저장한다 — 필터가 안 보는 칸에 실어 건너뛸 수 없다.
 *  (다) 차단: 나와 차단 관계인 사람(내가 걸었든, 나를 걸었든)의 글은 목록·개수에서 같이 빠지고, 보는 사람 값은 질의로 못 바꾼다.
 *       긴급 조인 방송도 그 사람들을 뺀다.
 *  (라) 차단한 사람의 신청은 받지 않는다 — 가려진 글과 같은 답, 알림 없음. 상세도 같은 답이다.
 *  (마) 탈퇴: 그 회원의 글을 가리고 번호를 비운다(옛 글은 익명화 전 번호로).
 *  (바) 화면: 차단 뒤 목록을 다시 받고, 골프장 이름을 사람 이름으로 묻지 않고, 신청자 줄에 신고·차단이 있다.
 *  (사) 계정 삭제 안내의 골프 줄은 코드가 하는 일과 같다.
 */
const root = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");
/** 주석만 있는 줄을 뺀다 — 주석 속 낱말이 검사를 통과시키지 않게 */
const code = (p: string) => root(p).split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(l)).join("\n");

/** from 부터 그 뒤 처음 나오는 to 앞까지 */
function between(s: string, from: string, to: string): string {
    const a = s.indexOf(from);
    if (a < 0) throw new Error(`시작을 못 찾음: ${from}`);
    const b = s.indexOf(to, a + from.length);
    if (b < 0) throw new Error(`끝을 못 찾음: ${to}`);
    return s.slice(a, b);
}

const route = code("server/routes/modules/golf.ts");
const repo = code("server/storage/golf.repo.ts");
const userRepo = code("server/storage/user.repo.ts");

describe("(가) 올리기 문 — POST /bookings", () => {
    it("requireAuth 다음에 requireTermsAccepted 를 지난다", () => {
        expect(route).toContain('router.post("/bookings", requireAuth, requireTermsAccepted, asyncHandler(');
        expect(route).not.toContain('router.post("/bookings", requireAuth, asyncHandler(');
        expect(route).toContain('import { requireTermsAccepted } from "../../middleware/terms.js";');
    });

    it("그 문지기는 미동의와 정지 계정을 함께 막는다", () => {
        const gate = between(code("server/middleware/terms.ts"), "export async function requireTermsAccepted(", "\n}\n");
        // 정지가 먼저 — 동의한 사람이라도 정지면 막힌다. 조회가 실패해도 통과시키지 않는다.
        expect(gate).toContain("if (state.banned) {");
        expect(gate).toContain("ACCOUNT_SUSPENDED_CODE");
        expect(gate).toContain('return sendError(res, 403, "err.terms.required", TERMS_REQUIRED_CODE);');
        expect(gate.indexOf("state.banned")).toBeLessThan(gate.indexOf("isTermsAccepted(state.termsVersion)"));
        expect(gate).toContain('return sendError(res, 503, "err.common.retryLater");');
    });
});

describe("(나) 내용 필터 — 자유 입력 칸", () => {
    const post = between(route, 'router.post("/bookings", requireAuth', 'router.post("/bookings/:id/to-join"');

    it("남에게 보이는 글자 칸 여덟을 매물 맥락으로, 한 칸씩 본다 — region·courseType 포함", () => {
        expect(route).toContain('const LISTING_TEXT_FIELDS = ["comment", "policyCustomText", "blindName", "venueName", "joinCondition", "courseName", "region", "courseType"] as const;');
        const fn = between(route, "function listingTextBlock(", "\n}\n");
        expect(fn).toContain("for (const k of LISTING_TEXT_FIELDS)");
        expect(fn).toContain('checkContent(v, { context: "listing" })');
        // 이어 붙여 한 번에 보지 않는다 — 칸 경계가 붙어 멀쩡한 글이 걸린다
        expect(fn).not.toContain(".join(");
    });

    it("걸리면 400, 저장 전에 — 한 건도 넣지 않는다", () => {
        expect(post).toContain("const blockedReason = listingTextBlock(data);");
        expect(post).toContain("if (blockedReason) return sendError(res, 400, blockedReason);");
        // 잘라 낸(저장될) 값을 본 뒤에 스키마 검증·저장으로 간다
        expect(post.indexOf("comment: cut(rest.comment, 300)")).toBeLessThan(post.indexOf("listingTextBlock(data)"));
        expect(post.indexOf("listingTextBlock(data)")).toBeLessThan(post.indexOf("insertGolfBookingSchema.safeParse(data)"));
        expect(post.indexOf("listingTextBlock(data)")).toBeLessThan(post.indexOf("storage.createGolfBooking("));
    });

    it("골프장 이름은 한 곳도 걸리지 않는다 — 이름 때문에 글이 안 올라가는 일이 없다", () => {
        const names = Array.from(root("client/src/golf/data/golfCourses.ts").matchAll(/"name":\s*"([^"]+)"/g), (m) => m[1]);
        expect(names.length).toBeGreaterThan(400);
        const blocked = names.filter((n) => checkContent(n, { context: "listing" }).blocked);
        expect(blocked).toEqual([]);
    });

    it("지역(region)·코스 종류(courseType)도 잘라서 본다 — 화면이 보내는 값은 걸리지도 잘리지도 않는다", () => {
        // 저장될 값에서 자른다(필터는 그 뒤에 본다)
        expect(post).toContain("region: cut(rest.region, 40),");
        expect(post).toContain("courseType: cut(rest.courseType, 20),");
        expect(post.indexOf("region: cut(rest.region, 40)")).toBeLessThan(post.indexOf("listingTextBlock(data)"));
        // 화면이 보내는 지역: 필드는 골프장 원장의 지역, 스크린·파크는 고른 지역·주소 첫 낱말·종류 이름
        const sheet = code("client/src/golf/components/join/JoinCreateSheet.tsx");
        expect(sheet).toContain('const regionText = type === "FIELD" ? course!.region : (region || place?.address?.split(" ")[0] || JOIN_TYPE_LABEL[type]);');
        expect(code("client/src/golf/components/booking/BookingCreateSheet.tsx")).toContain("region: course!.region,");
        const regions = Array.from(new Set(Array.from(root("client/src/golf/data/golfCourses.ts").matchAll(/"region":\s*"([^"]+)"/g), (m) => m[1])));
        expect(regions.length).toBeGreaterThan(3);
        for (const r of [...regions, "필드", "스크린", "파크골프"]) {
            expect(r.length, r).toBeLessThanOrEqual(40);
            expect(checkContent(r, { context: "listing" }).blocked, r).toBe(false);
        }
        // 이 칸에 실어 보내도 걸린다
        for (const bad of ["내기 골프 타당 만원 모집", "씨발"]) expect(checkContent(bad, { context: "listing" }).blocked, bad).toBe(true);
    });

    it("옵션은 아는 id 만 저장한다 — 카드가 모르는 id 를 글자 그대로 그리기 때문이다", () => {
        expect(post).toContain("options: listingOptions(rest.options),");
        const fn = between(route, "function listingOptions(", "\n}\n");
        expect(fn).toContain("if (!Array.isArray(v)) return [];");
        expect(fn).toContain('typeof o === "string" && LISTING_OPTION_IDS.has(o)');
        // 카드의 그 줄 — 모르는 id 는 그대로 칩이 된다
        expect(code("client/src/golf/components/booking/BookingCard.tsx")).toContain("JOIN_OPTIONS.find(o => o.id === id)?.label || id);");

        // 서버 목록 = 부킹 시트의 옵션(화면 상수) + 조인 옵션(shared). 화면에 옵션을 더하고 서버를 빼먹으면 여기서 걸린다.
        const decl = /const LISTING_OPTION_IDS: ReadonlySet<string> = new Set\(\[([^\]]+)\]\);/.exec(route)?.[1] ?? "";
        expect(decl).toContain("...JOIN_OPTIONS.map((o) => o.id)");
        const serverIds = Array.from(decl.matchAll(/"([a-z0-9_]+)"/g), (m) => m[1]);
        const constants = root("client/src/golf/constants/booking.ts");
        const idsOf = (name: string) => Array.from(between(constants, `export const ${name} = [`, "];").matchAll(/id: '([a-z0-9_]+)'/g), (m) => m[1]);
        const sheetIds = [...idsOf("PARTY_OPTIONS"), ...idsOf("CONDITION_OPTIONS")];
        expect(sheetIds.length).toBe(6);
        expect(constants).toContain("export const SPECIAL_OPTIONS = [...PARTY_OPTIONS, ...CONDITION_OPTIONS];");
        expect([...serverIds].sort()).toEqual([...sheetIds].sort());
        // 두 시트가 보내는 것은 그 목록의 id 뿐이다
        expect(code("client/src/golf/components/booking/BookingCreateSheet.tsx")).toMatch(/SPECIAL_OPTIONS\.map\(\(o\) => \(/);
        expect(code("client/src/golf/components/join/JoinCreateSheet.tsx")).toContain("const optionsForType = JOIN_OPTIONS.filter((o) => o.types.includes(type));");
    });
});

describe("(다) 차단 — 목록과 개수", () => {
    it("차단 조건은 한 곳에서 만들고, uuid 꼴의 보는 사람이 있을 때만 건다", () => {
        const fn = between(repo, "function notBlockedByViewer(", "\n}\n");
        expect(fn).toContain('if (typeof viewerId !== "string" || !UUID_RE.test(viewerId)) return undefined;');
        // 양방향 — 내가 차단한 사람의 글도, 나를 차단한 사람의 글도 뺀다(한 방향이면 글은 보이는데 신청만 404 라 차단당한 것이 드러난다)
        expect(fn).toContain("NOT EXISTS (SELECT 1 FROM ${hiqBlocks} WHERE (${hiqBlocks.blockerId} = ${viewerId} AND ${hiqBlocks.blockedId} = ${golfBookings.ownerId}) OR (${hiqBlocks.blockerId} = ${golfBookings.ownerId} AND ${hiqBlocks.blockedId} = ${viewerId}))");
    });

    it("긴급 조인 방송도 올린 사람과 차단 관계인 회원을 뺀다 — 목록에서 그 글이 빠지는 사람에게 푸시가 가지 않는다", () => {
        const targets = between(route, "async function urgentTargets(", "\n}\n");
        expect(targets).toContain("storage.golf.blockPeerIds(ownerId),");
        expect(targets).toContain("return blocked.size ? ids.filter((id) => !blocked.has(id)) : ids;");
        // 방송도, 방송 받은 사람을 조용히 처리하는 관심·지역 알림도 이 목록 하나를 쓴다
        expect(route.split("await urgentTargets(req.userId!)").length - 1).toBe(2);
        const peers = between(repo, "async blockPeerIds(", "\n    }\n");
        expect(peers).toContain("or(eq(hiqBlocks.blockerId, memberId), eq(hiqBlocks.blockedId, memberId))");
    });

    it("부킹 목록·날짜별 개수·조인 목록 셋 다 같은 조건을 쓴다", () => {
        const list = between(repo, "async getGolfBookings(", "async countRecentBookingsByOwner(");
        const counts = between(repo, "async getGolfBookingCounts(", "async deleteGolfBooking(");
        const joins = between(repo, "async getGolfJoins(", "async deleteGolfJoin(");
        expect(list).toContain("notBlockedByViewer(filters)");
        expect(counts).toContain("notBlockedByViewer(filters)");
        expect(joins).toContain("notBlockedByViewer(filters)");
        // 셋 말고는 쓰지 않는다(정의 1 + 사용 3)
        expect(repo.split("notBlockedByViewer(").length - 1).toBe(4);
    });

    it("'내가 올린 글'과 '내가 신청한 글'에는 걸지 않는다", () => {
        const list = between(repo, "async getGolfBookings(", "async countRecentBookingsByOwner(");
        // ownerId 필터가 있으면 차단 조건 대신 그 필터만 건다
        expect(list).toMatch(/if \(typeof filters\?\.ownerId === "string" && filters\.ownerId\) conditions\.push\(eq\(golfBookings\.ownerId, filters\.ownerId\)\);\s*else conditions\.push\(notBlockedByViewer\(filters\)\);/);
        expect(between(repo, "async listMyRequests(", "async pendingRequesterIds(")).not.toContain("notBlockedByViewer");
        // 라우트의 '내 글' 질의는 보는 사람 값을 넘기지 않는다(예전 그대로)
        expect(route).toContain("storage.getGolfBookings(undefined, { ownerId: req.userId, includeBlinded: true, sinceDays: 60, limit: 400 })");
    });

    it("보는 사람은 로그인 id 로만 — 질의 문자열로 덮어쓸 수 없다", () => {
        // 부킹 목록: 질의의 viewerId 를 버리고, 로그인 id 를 뒤에 적는다
        expect(route).toContain("const { ownerId: _o, includeBlinded: _b, limit: _l, sinceDays: _s, viewerId: _v, ...filters } = req.query as Record<string, unknown>;");
        expect(route).toContain("storage.getGolfBookings(date, { ...filters, viewerId: req.userId })");
        // 개수·조인 목록: 질의를 펼친 **뒤에** 적는다(앞에 적으면 ?viewerId= 가 덮는다)
        expect(route).toContain("storage.getGolfBookingCounts(startDate as string, endDate as string, viewType as string, { ...req.query, viewerId: req.userId })");
        expect(route).toContain("storage.getGolfJoins({ date, ...req.query, viewerId: req.userId })");
        expect(route).not.toMatch(/viewerId: req\.userId,\s*\.\.\.req\.query/);
        expect(route).not.toContain("viewerId: req.query");
    });

    it("가려진 글 조건은 그대로 — 차단은 그 위에 더한 것이다", () => {
        const counts = between(repo, "async getGolfBookingCounts(", "async deleteGolfBooking(");
        const joins = between(repo, "async getGolfJoins(", "async deleteGolfJoin(");
        expect(counts).toContain("eq(golfBookings.isBlinded, false),");
        expect(joins).toContain("const conditions: any[] = [eq(golfBookings.isBlinded, false)];");
        expect(between(repo, "async getGolfBookings(", "async countRecentBookingsByOwner("))
            .toContain("const conditions: any[] = filters?.includeBlinded ? [] : [eq(golfBookings.isBlinded, false)];");
    });
});

describe("(라) 차단한 사람의 신청은 받지 않는다", () => {
    const apply = between(route, 'router.post("/bookings/:id/apply"', "function listingName(");

    it("올린 사람이 신청자를 차단했는지 본다 — 방향이 맞다(차단한 쪽 = 올린 사람)", () => {
        expect(apply).toContain("await storage.crews.hasBlocked(booking.ownerId, req.userId!)");
    });

    it("가려진 글과 글자까지 같은 답 — 차단 사실이 드러나지 않는다", () => {
        const blinded = 'if (!booking || booking.isBlinded) return sendError(res, 404, "글을 찾을 수 없어요");';
        expect(apply).toContain(blinded);
        expect(apply).toContain('if (booking.ownerId && await storage.crews.hasBlocked(booking.ownerId, req.userId!)) return sendError(res, 404, "글을 찾을 수 없어요");');
        expect(apply).not.toMatch(/차단(했|됐|당|된)/);
    });

    it("신청 행을 만들기 전, 알림을 보내기 전에 끊는다", () => {
        const at = apply.indexOf("storage.crews.hasBlocked(");
        expect(at).toBeGreaterThan(-1);
        expect(at).toBeLessThan(apply.indexOf("storage.applyToJoin("));
        expect(at).toBeLessThan(apply.indexOf("notificationService.sendAndSaveNotification("));
    });

    it("상세(GET /bookings/:id)도 같은 답 — 글은 보이는데 신청만 안 되는 일이 없다", () => {
        const detail = between(route, 'router.get("/bookings/:id", asyncHandler(', "\n}));");
        const blinded = 'if (!booking || booking.isBlinded) return sendError(res, 404, "티타임을 찾을 수 없어요");';
        expect(detail).toContain(blinded);
        // 방향이 맞다(차단한 쪽 = 올린 사람), 내 글은 해당 없고, 로그인하지 않았으면 검사하지 않는다
        expect(detail).toContain('if (req.userId && booking.ownerId && booking.ownerId !== req.userId && await storage.crews.hasBlocked(booking.ownerId, req.userId)) return sendError(res, 404, "티타임을 찾을 수 없어요");');
        expect(detail.indexOf("storage.crews.hasBlocked(")).toBeLessThan(detail.indexOf("withJoinCounts("));
        expect(detail).not.toMatch(/차단(했|됐|당|된)/);
    });
});

describe("(마) 탈퇴 — 조인·부킹 글을 가리고 번호를 비운다", () => {
    const del = between(userRepo, "async deleteAccount(", "\n    }\n}");
    const tx = del.slice(del.indexOf("await db.transaction(async (tx) => {"));
    const golf = between(tx, "await tx.update(golfBookings)", "await tx.update(hiqMembers).set({");

    it("탈퇴 트랜잭션 안에서 한다 — 회원 행을 익명화하기 전에", () => {
        expect(tx).toContain("await tx.update(golfBookings)");
        expect(del.indexOf("await db.transaction(")).toBeLessThan(del.indexOf("await tx.update(golfBookings)"));
        // 익명화(phone → del-…)보다 앞이다
        expect(tx.indexOf("await tx.update(golfBookings)")).toBeLessThan(tx.indexOf("phone: `del-${memberId.slice(0, 12)}`"));
    });

    it("가리고(is_blinded) 번호(manager_phone)를 빈 문자열로 — NOT NULL 칸이라 null 이 아니다", () => {
        expect(golf).toContain('managerPhone: "",');
        expect(golf).toContain("isBlinded: true,");
        const schema = root("shared/schema.ts");
        expect(schema).toContain('managerPhone: text("manager_phone").notNull(),');
        expect(schema).toContain('isBlinded: boolean("is_blinded").default(false).notNull(),');
        expect(schema).toContain('blindReason: text("blind_reason"),');
    });

    it("내 글(owner_id)과, 옛 글(owner_id 가 비고 번호가 같은 글)을 함께 잡는다", () => {
        expect(golf).toContain("eq(golfBookings.ownerId, memberId),");
        expect(golf).toContain("legacyPhone ? and(isNull(golfBookings.ownerId), eq(golfBookings.managerPhone, legacyPhone)) : undefined,");
    });

    it("옛 글을 되짚는 번호는 익명화 전에 읽은 값이고, 자리표시자·빈 값으로는 되짚지 않는다", () => {
        // member 는 트랜잭션 전에 읽는다
        expect(del.indexOf("const [member] = await db.select().from(hiqMembers)")).toBeLessThan(del.indexOf("await db.transaction("));
        expect(tx).toContain("const legacyPhone = isLoginPhone(member.phone) ? member.phone : null;");
        expect(root("server/storage/user.repo.ts")).toContain('import { isLoginPhone } from "../../shared/loginPhone.js";');
    });

    it("이미 가려져 사유가 적힌 글은 그 사유를 남긴다", () => {
        expect(golf).toContain("case when ${golfBookings.isBlinded} and ${golfBookings.blindReason} is not null then ${golfBookings.blindReason} else ${WITHDRAWN_LISTING_REASON} end");
    });

    it("raw sql 에 Date 를 넘기지 않는다", () => {
        expect(golf).not.toContain("new Date(");
        expect(golf).not.toContain("Date.now(");
    });
});

describe("(바) 화면 — 차단이 바로 보이고, 이름을 잘못 묻지 않는다", () => {
    it("차단·해제 뒤 골프 부킹·조인 목록과 날짜 칩 숫자를 다시 받는다", () => {
        const fn = between(code("client/src/components/hiq/community/ReportDialog.tsx"), "export const invalidateAfterBlock = (", "\n};");
        expect(fn).toContain('queryClient.invalidateQueries({ queryKey: ["/api/hiq/golf/bookings"] });');
        expect(fn).toContain('queryClient.invalidateQueries({ queryKey: ["/api/hiq/golf/joins"] });');
        expect(fn).toContain('queryClient.invalidateQueries({ queryKey: ["/api/hiq/golf/bookings/counts"] });');
        // 예전 것도 그대로
        expect(fn).toContain("invalidateCommunityPosts(queryClient);");
        expect(fn).toContain('queryClient.invalidateQueries({ queryKey: ["golf-photos"] });');
        expect(fn).toContain('queryClient.invalidateQueries({ queryKey: ["/api/hiq/community/blocks"] });');
    });

    it("그 키들이 실제 목록 화면의 키와 같다", () => {
        const hook = code("client/src/golf/hooks/useBookingData.ts");
        expect(hook).toContain("queryKey: ['/api/hiq/golf/bookings/counts', rangeStart, rangeEnd, viewType, JSON.stringify(selectedFilters)],");
        expect(hook).toContain("queryKey: [viewType === 'JOIN' ? '/api/hiq/golf/joins' : '/api/hiq/golf/bookings', {");
    });

    it("부킹 카드의 신고 창에 골프장 이름을 작성자 이름으로 넘기지 않는다", () => {
        const card = code("client/src/golf/components/booking/BookingCard.tsx");
        const dialog = /<ReportDialog[\s\S]*?\/>/.exec(card)?.[0] ?? "";
        expect(dialog).toContain('targetType="golf_booking"');
        expect(dialog).toContain("targetAuthorId={item.ownerId ?? undefined}");
        expect(dialog).not.toContain("targetAuthorName");
        expect(card).not.toContain("targetAuthorName={item.courseName}");
    });

    it("신청자 이름 줄에 회원 신고·차단 메뉴가 있다", () => {
        const src = code("client/src/golf/components/booking/JoinApplicants.tsx");
        expect(src).toContain('import { UgcActionMenu } from "@/components/hiq/community/UgcActionMenu";');
        const row = between(src, "{applicants.map((a) => {", '{!teePassed && a.status === "applied" && (');
        const menu = /<UgcActionMenu[\s\S]*?\/>/.exec(row)?.[0] ?? "";
        expect(menu).toContain('targetType="member"');
        expect(menu).toContain("targetId={a.memberId}");
        expect(menu).toContain("authorId={a.memberId}");
        expect(menu).toContain("authorName={a.name}");
        // 이름 줄 안이다 — 이름 뒤, 신청 시각 줄 앞
        expect(row.indexOf("{a.name}</span>")).toBeLessThan(row.indexOf("<UgcActionMenu"));
        expect(row.indexOf("<UgcActionMenu")).toBeLessThan(row.indexOf("kstDateLabel(a.appliedAt)"));
        // 위로 연다 — 명단이 카드(overflow-hidden) 안이라 아래로 열면 마지막 줄에서 '차단'이 잘린다
        expect(menu).toContain('side="top"');
        // 골프 화면은 리터럴 색
        expect(menu).not.toMatch(/text-(black|white|ink)|bg-(black|white)/);
    });

    it("서버가 회원 신고를 받는다", () => {
        const targets = /const REPORT_TARGETS = \[([^\]]+)\]/.exec(root("server/routes/modules/community.ts"))?.[1] ?? "";
        expect(targets).toContain('"member"');
        expect(targets).toContain('"golf_booking"');
    });
});

describe("(사) 계정 삭제 안내 — 골프 줄은 코드가 하는 일만 적는다", () => {
    const page = code("client/src/pages/account-delete.tsx");
    const deleted = between(page, "삭제되는 데이터</h2>", "</ul>");
    const kept = between(page, "보관되는 데이터(예외)</h2>", "문의:");

    it("조인·부킹 글: 가려지고 연락처가 지워진다 — (마)의 코드와 같다", () => {
        expect(deleted).toContain("<li>골프 조인·부킹 글 — 즉시 가려져 다른 회원에게 보이지 않고, 글에 표시되던 연락처는 즉시 삭제</li>");
        expect(userRepo).toContain("isBlinded: true,");
        expect(userRepo).toContain('managerPhone: "",');
    });

    it("라운드 사진: 행과 파일을 지운다", () => {
        expect(deleted).toContain("<li>골프 라운드 사진(골프장 페이지에 공개한 사진 포함) — 즉시 삭제</li>");
        const me = between(code("server/routes/modules/member.ts"), 'router.delete("/me", requireAuth', "\n}));");
        expect(me).toContain("await deleteBlobs(await storage.golfPhotos.deleteAllByMember(req.userId!)");
        const photos = between(code("server/storage/golfPhoto.repo.ts"), "async deleteAllByMember(", "\n    }\n");
        expect(photos).toContain("db.delete(golfRoundPhotos).where(eq(golfRoundPhotos.memberId, memberId))");
    });

    it("라운드 기록: 지운다고 적지 않는다 — 실제로 남기 때문이다", () => {
        // 탈퇴는 경기 기록·경기 방을 지우지 않는다
        const del = between(userRepo, "async deleteAccount(", "\n    }\n}");
        expect(del).not.toContain("hiqGameHistory");
        expect(del).not.toContain("golfMatchSessions");
        expect(del).not.toContain("golf_match_sessions");
        expect(del).toContain('name: "탈퇴회원",');
        // 스코어카드는 그때 이름을 담은 채 참가자에게 그대로 나간다
        expect(code("server/storage/golf.repo.ts")).toContain('name: me?.name || "동반자",');
        expect(deleted).not.toContain("라운드 기록");
        expect(kept).toContain("골프 라운드 기록(타수)은 함께 친 사람의 스코어카드를 지키기 위해 삭제하지 않습니다.");
        expect(kept).toContain("이름은 '탈퇴회원'으로 바뀌지만, 함께 친 라운드의 스코어카드에는 당시 이름이 남습니다.");
    });
});
