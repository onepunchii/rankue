import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { applicantOf, cleanRejectReason, isContactPhone, toMyApplications } from "./partnerApply.js";

/**
 * 파트너(사장님) 신청은 랭큐 계정으로 받는다(2026-10-07 오너: "앞으로 사장님들이 신청·승인했을 때를 생각해서 진행하자").
 * 여기서는 DB 를 보지 않는 판단(lib/partnerApply)과, 라우트가 그 규칙대로 짜여 있는지를 소스로 본다 —
 * 신청·승인 라우트는 drizzle 을 직접 써서 가짜 저장소로 돌릴 수 없다(.env 는 운영 DB 다).
 */
const root = (p: string) => readFileSync(resolve(__dirname, "../..", p), "utf8");

describe("applicantOf — 신청하는 사람", () => {
    it("로그인하지 않았으면 401 — 무엇을 하면 되는지 말해 준다", () => {
        for (const m of [null, undefined]) {
            const r = applicantOf(m);
            expect(r.ok).toBe(false);
            if (!r.ok) {
                expect(r.status).toBe(401);
                expect(r.code).toBe("APPLY_LOGIN_REQUIRED");
                expect(r.message).toContain("로그인");
            }
        }
    });

    it("프로필이 없는 회원(매장에서 번호만으로 등록)은 409 — 매장의 주인이 될 계정이 없다", () => {
        const r = applicantOf({ id: "m1", profileId: null });
        expect(r.ok).toBe(false);
        if (!r.ok) {
            expect(r.status).toBe(409);
            expect(r.code).toBe("APPLY_NO_PROFILE");
        }
    });

    it("회원 행과 프로필이 있으면 둘 다 돌려준다 — 신청에 이 둘을 적는다", () => {
        expect(applicantOf({ id: "m1", profileId: "p1" })).toEqual({ ok: true, memberId: "m1", profileId: "p1" });
    });
});

describe("연락처 · 거절 사유", () => {
    it("연락처는 예전 신청 폼과 같은 꼴 — 0 으로 시작하는 번호, 하이픈·공백 허용", () => {
        for (const ok of ["010-1234-5678", "01012345678", "02-123-4567", "031 123 4567"]) expect(isContactPhone(ok), ok).toBe(true);
        for (const no of ["", "1234", "+82 10 1234 5678", "social:kakao:x", "010-12-5678", null, undefined, 1012345678]) expect(isContactPhone(no), String(no)).toBe(false);
    });

    it("거절 사유는 앞뒤 공백을 떼고 200자까지 — 비어 있으면 null", () => {
        expect(cleanRejectReason("  통화로   확인이 안 됐어요 \n")).toBe("통화로 확인이 안 됐어요");
        expect(cleanRejectReason("")).toBeNull();
        expect(cleanRejectReason("   ")).toBeNull();
        expect(cleanRejectReason(undefined)).toBeNull();
        expect(cleanRejectReason(123)).toBeNull();
        expect(cleanRejectReason("가".repeat(500))).toHaveLength(200);
    });
});

describe("toMyApplications — 신청자에게 보여 주는 목록", () => {
    const claims = [
        { id: "c1", listingCode: "C00001", listingName: "가 당구장", status: "pending", rejectReason: null, createdAt: new Date("2026-10-07T01:00:00Z") },
        { id: "c2", listingCode: "C00002", listingName: null, status: "rejected", rejectReason: "확인이 안 됐어요", createdAt: "2026-10-01T01:00:00Z" },
    ];
    const regs = [
        { id: "r1", name: "나 당구장", listingCode: "n00003", status: "approved", rejectReason: "지워져야 하는 값", createdAt: new Date("2026-10-05T01:00:00Z") },
    ];

    it("클레임과 등록 신청을 한 목록으로 — 최근 것이 위", () => {
        const out = toMyApplications(claims, regs);
        expect(out.map((a) => a.id)).toEqual(["c1", "r1", "c2"]);
        expect(out[0]).toEqual({ kind: "claim", id: "c1", name: "가 당구장", listingCode: "C00001", status: "pending", rejectReason: null, createdAt: "2026-10-07T01:00:00.000Z" });
        expect(out[1].kind).toBe("register");
    });

    it("매장 이름이 없으면 코드로 · 거절 사유는 거절된 것에만 · 모르는 상태는 확인 중으로", () => {
        const out = toMyApplications([...claims, { id: "c3", listingCode: "C00003", listingName: "다", status: "weird", rejectReason: "x", createdAt: "2026-09-01T00:00:00Z" }], regs);
        expect(out.find((a) => a.id === "c2")).toMatchObject({ name: "C00002", status: "rejected", rejectReason: "확인이 안 됐어요" });
        expect(out.find((a) => a.id === "r1")!.rejectReason).toBeNull();
        expect(out.find((a) => a.id === "c3")).toMatchObject({ status: "pending", rejectReason: null });
    });

    it("신청자에게 보일 것만 싣는다 — 연락처·PIN·계정 id 같은 칸은 없다", () => {
        const keys = Object.keys(toMyApplications(claims, regs)[0]).sort();
        expect(keys).toEqual(["createdAt", "id", "kind", "listingCode", "name", "rejectReason", "status"]);
    });
});

describe("라우트가 그 규칙대로 짜여 있는가(소스)", () => {
    const listings = root("server/routes/modules/listings.ts");
    const admin = root("server/routes/modules/admin.ts");
    const partner = root("server/routes/modules/partner.ts");

    it("클레임: 로그인 확인이 DB 를 보기 전 · 신청에 계정을 적는다 · 한 계정 한 매장", () => {
        const claim = listings.slice(listings.indexOf('router.post("/:code/claim"'), listings.indexOf("// POST /listings/register"));
        const who = claim.indexOf("const who = await currentApplicant(req);");
        expect(who).toBeGreaterThan(0);
        expect(claim.indexOf("if (!who.ok) return sendError(res, who.status, who.message, who.code);")).toBeGreaterThan(who);
        expect(claim.indexOf(".from(storeListings)")).toBeGreaterThan(who);
        const insert = claim.indexOf("await db.insert(storeListingClaims).values({");
        expect(claim.indexOf("const blocked = await applyBlocker(who.profileId);")).toBeLessThan(insert);
        expect(claim.slice(insert)).toContain("applicantMemberId: who.memberId,");
        expect(claim.slice(insert)).toContain("applicantProfileId: who.profileId,");
        // 이미 매장이 있는 계정 · 결과를 기다리는 신청이 있는 계정은 받지 않는다
        const blocker = listings.slice(listings.indexOf("async function applyBlocker"), listings.indexOf("// 비로그인 POST 남용 방어"));
        expect(blocker).toContain("eq(hiqStores.ownerId, profileId)");
        expect(blocker).toContain('"APPLY_ALREADY_OWNER"');
        expect(blocker).toContain('"APPLY_PENDING"');
    });

    it("새 매장 등록: '사장님입니다'만 로그인이 필요하다 — 이용자 제보는 계정 없이도 받는다", () => {
        const reg = listings.slice(listings.indexOf('router.post("/register"'), listings.indexOf("// POST /listings/:code/suggest"));
        expect(reg).toContain('if (kind === "owner" && !who.ok) return sendError(res, who.status, who.message, who.code);');
        expect(reg).toContain("applicantProfileId: who.ok ? who.profileId : null,");
    });

    // 이 라우터의 GET 은 CDN 에 공개로 캐시된다 — 사람마다 다른 답을 여기 두면 남의 신청이 보인다
    it("'내 신청'은 매장 디렉터리 라우터에 두지 않는다 — /partner/applications, 캐시하지 않는다", () => {
        expect(listings).toContain('res.set("CDN-Cache-Control", "public, s-maxage=600, stale-while-revalidate=86400");');
        expect(listings).not.toMatch(/router\.get\("\/(my-)?applications"/);
        const mine = partner.slice(partner.indexOf('router.get("/applications"'), partner.indexOf('router.post("/logout"'));
        expect(mine).toContain('res.set("Cache-Control", "private, no-store");');
        expect(mine).toContain("eq(storeListingClaims.applicantProfileId, who.profileId)");
        expect(mine).toContain('eq(storeRegistrations.kind, "owner")');
        expect(mine).toContain("toMyApplications(claims, regs)");
        // 로그인 쿠키(회원) 기준이다 — 파트너 쿠키가 아니다
        expect(mine).toContain("req.signedCookies?.hiq_user_id");
        expect(mine).not.toContain("hiq_partner_auth");
    });

    it("승인: 계정으로 받은 신청은 그 프로필이 주인이 된다 — 번호로 찾지 않고, PIN 을 만들지 않는다", () => {
        const core = admin.slice(admin.indexOf("async function issueOwnership"), admin.indexOf("async function notifyApplicantRejected"));
        const byAccount = core.indexOf("if (opts.applicantProfileId) {");
        expect(byAccount).toBeGreaterThan(0);
        expect(core.indexOf("where(eq(profiles.id, opts.applicantProfileId))")).toBeGreaterThan(byAccount);
        // 계정이 없어졌으면 발급하지 않는다(연락처로 다른 프로필을 찾아 붙이지 않는다)
        const gone = core.indexOf("신청한 랭큐 계정을 찾을 수 없습니다");
        expect(gone).toBeGreaterThan(byAccount);
        expect(core.indexOf("where(eq(profiles.phone, phone))")).toBeGreaterThan(gone);
        // PIN 은 프로필이 없을 때만 — 계정으로 받은 신청은 프로필이 반드시 있다
        expect(core.indexOf("issuedPin = String(crypto.randomInt(1000, 10000));")).toBeGreaterThan(core.indexOf("if (!profile) {", gone));
        // 두 승인 라우트가 신청의 계정을 넘긴다
        expect(admin).toContain("applicantProfileId: claim.applicantProfileId,");
        expect(admin).toContain("applicantProfileId: reg.applicantProfileId,");
        // 알림은 신청한 그 회원에게
        expect(core).toContain("const applicant = opts.applicantMemberId ? await storage.getMemberById(opts.applicantMemberId) : undefined;");
    });

    it("거절: 사유를 남기고 신청자에게 알린다 — 알림이 실패해도 거절은 유효하다", () => {
        expect(admin.match(/const reason = cleanRejectReason\(req\.body\?\.reason\);/g)).toHaveLength(2);
        expect(admin.match(/rejectReason: reason/g)).toHaveLength(2);
        expect(admin.match(/await notifyApplicantRejected\(/g)).toHaveLength(2);
        const notify = admin.slice(admin.indexOf("async function notifyApplicantRejected"), admin.indexOf("// POST /admin/listing-claims/:id/approve"));
        expect(notify).toContain("if (!memberId) return false;");
        expect(notify).toContain('type: "partner_rejected",');
        expect(notify).toMatch(/\} catch \(e\) \{[\s\S]*return false;/);
        // 이용자 제보의 거절에는 보내지 않는다
        expect(admin).toContain('reg.kind === "owner" ? await notifyApplicantRejected(reg.applicantMemberId, reg.name, reason) : false');
    });

    it("매장 관리 나가기는 파트너 쿠키만 지운다 — 앱 로그인은 그대로", () => {
        const out = partner.slice(partner.indexOf('router.post("/logout"'), partner.indexOf("// Helper for protected partner routes"));
        expect(out).toContain("res.clearCookie('hiq_partner_auth', { path: '/' });");
        expect(out).toContain("res.clearCookie('hiq_admin_origin', { path: '/' });");
        expect(out).not.toContain("hiq_user_id");
    });

    it("마이그레이션은 더하기만 한다 — 열과 색인, 그리고 적용 확인 방법", () => {
        const sql = root("migrations/store_claim_applicant.sql");
        const stmts = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n").split(";").map((s) => s.trim()).filter(Boolean);
        expect(stmts).toHaveLength(9);
        for (const s of stmts) expect(s, s).toMatch(/^(ALTER TABLE \w+ ADD COLUMN IF NOT EXISTS|CREATE INDEX IF NOT EXISTS) /);
        expect(sql).toContain("운영 DB 적용:");
        expect(sql).toContain("information_schema.columns");
    });
});
