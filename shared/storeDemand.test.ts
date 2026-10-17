import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CALL_LABELS, CLAIM_LABEL_PREFIX, DIRECTIONS_LABELS, demandDaysOf, demandRangeText, intentsOf, naverShare, reportStats, storeReportPngPath, type StoreReport } from "./storeDemand";
import { trailLabel } from "./uiTrail";

/**
 * 손님이 찾는 매장(2026-10-18 오너: 당구장 사장님 모집) — 매장 페이지를 본 사람과 가게로 가려는 누름을 센다.
 * 누른 것은 화면 말로 남는다 — 매장 페이지의 단추 이름이 바뀌면 셈이 조용히 0 이 된다. 그래서 여기서 단추 이름과 같은지 본다.
 */
const read = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");
const R = (o: Partial<StoreReport>): StoreReport => ({ code: "C02055", name: "어느 당구장", region: "대구", address: null, phone: null, claimed: false, views: 288, visitors: 245, naver: 243, directions: 57, calls: 0, addressTaps: 47, claimTaps: 1, lastAt: null, days: 30, from: "2026-10-08", to: "2026-10-18", daily: [], ...o });

describe("손님이 찾는 매장", () => {
    it("길찾기 · 전화 단추 이름은 매장 페이지의 다섯 언어와 같다", () => {
        const page = read("client/src/pages/store-listing.tsx");
        const dirs = [...page.matchAll(/directionsCta: "([^"]+)"/g)].map((m) => m[1]);
        const calls = [...page.matchAll(/callCta: "([^"]+)"/g)].map((m) => m[1]);
        expect(dirs.length).toBe(5);
        expect([...DIRECTIONS_LABELS].sort()).toEqual([...dirs].sort());
        for (const c of calls) expect(CALL_LABELS).toContain(c);
        expect(page).toContain(`claimCta: "${CLAIM_LABEL_PREFIX}`);
    });
    it("번호를 누르면 발자국에는 '(번호)'로 남는다 — 그것도 전화로 센다", () => {
        expect(trailLabel("053-123-4567")).toBe("(번호)");
        expect(CALL_LABELS).toContain("(번호)");
    });
    it("셈 — 가게로 가려는 누름 = 길찾기 + 전화 + 주소, 네이버 비율은 사람이 없으면 없다", () => {
        expect(intentsOf(R({}))).toBe(104);
        expect(naverShare(R({}))).toBe(99);
        expect(naverShare(R({ visitors: 0, naver: 0 }))).toBeNull();
        expect(reportStats(R({})).map((s) => `${s.value}${s.unit}`)).toEqual(["245명", "104번", "99%"]);
        expect(reportStats(R({ visitors: 0, naver: 0, directions: 0, addressTaps: 0 })).map((s) => s.value)).toEqual(["0", "0", "-"]);
        expect(demandRangeText("2026-10-08", "2026-10-18")).toBe("10월 8일 ~ 10월 18일");
        expect(demandRangeText("2026-10-08", "2026-10-08")).toBe("10월 8일");
        expect(demandDaysOf("7")).toBe(7);
        expect(demandDaysOf("365")).toBe(30);
    });
    it("리포트 카드는 공개 /og 가 아니다 — 어드민 가드 밑, 브라우저에만 캐시", () => {
        expect(storeReportPngPath("C02055", 30)).toBe("/api/hiq/admin/store-demand/C02055/report.png?days=30");
        const route = read("server/routes/modules/adminStoreDemand.ts");
        expect(route).toContain("router.use(checkSuperAdmin);");
        expect(route).toContain('"private, max-age=300"');
        expect(read("server/routes/modules/admin.ts")).toContain('router.use("/store-demand", adminStoreDemandRouter);');
        expect(read("server/ogImage.ts")).not.toContain("store-report");
        // 바꾸는 길이 없다(보기 전용 관리자도 본다)
        expect(route).not.toMatch(/router\.(post|patch|put|delete)\(/);
    });
    it("인증한 사장님은 자기 매장 숫자만 — 대시보드 '내 매장 페이지'와 리포트 카드(매장 코드를 받지 않는다)", () => {
        const r = read("server/routes/modules/partner.ts");
        const stats = r.slice(r.indexOf('router.get("/page-stats"'), r.indexOf('router.get("/page-report.png"'));
        const png = r.slice(r.indexOf('router.get("/page-report.png"'), r.indexOf("// GET /partner/members"));
        for (const b of [stats, png]) {
            expect(b).toContain("requirePartner");
            expect(b).toContain("await ownListingCode(store.id)");
            expect(b).not.toContain("req.params");
            expect(b).not.toContain("req.query");
        }
        expect(png).toContain("renderStoreReportPng(r, { owner: true })");
        expect(stats).not.toContain("phone");
        const dash = read("client/src/pages/partner/dashboard.tsx");
        expect(dash).toContain('queryKey: ["/api/hiq/partner/page-stats"]');
        expect(dash).toContain('src="/api/hiq/partner/page-report.png"');
    });
    it("인증하면 받는 것 셋은 다섯 언어 모두 — 지금 되는 것만 적는다", () => {
        const page = read("client/src/pages/store-listing.tsx");
        for (const k of ["perkTitle", "perk1", "perk2", "perk3", "claimHint"]) expect(page.match(new RegExp(`\\b${k}: "`, "g"))?.length, k).toBe(5);
        expect(page.match(/<ClaimPerks t=\{t\} \/>/g)?.length).toBe(2);
    });
    it("어드민 메뉴 '매장' 묶음 맨 앞 · 알림에서 바로 열린다", () => {
        const dash = read("client/src/pages/admin/dashboard.tsx");
        expect(dash).toContain('{ id: "store-demand", label: "손님이 찾는 매장"');
        expect(dash).toContain('{tab === "store-demand" && <StoreDemandView />}');
    });
});
