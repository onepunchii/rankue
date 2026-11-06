/**
 * 당구장 사장님 도구(2026-11-06 오너 '추천대로') — 바로 고칠 것 다섯:
 *  ① 승인 안내: 폰 알림이 실제로 나갔을 때만 '연락 안 해도 됨' ② '방문' → '접속'(앱을 연 날이다) ③ 공지 · 주차 · 테이블 수 · 매장 사진을 매장 페이지에
 *  ④ 대회 탭의 약속을 실제에 맞춤 ⑤ 프리미엄(엑셀 · 단체 문자)을 당분간 모두에게.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { STORE_PHOTO_CATEGORY, STORE_PHOTO_MAX, cleanStorePhotos, isStorePhotoUrl, storePhotosOf } from "./storePhotos";

const read = (f: string) => readFileSync(resolve(__dirname, "..", f), "utf8");
const U = (n: string) => `https://zts7idyjw1ng1uqz.public.blob.vercel-storage.com/hiq/store-photo/${n}.webp`;

describe("매장 사진", () => {
    it("우리 Blob 의 store-photo 주소만", () => {
        expect(isStorePhotoUrl(U("a-1x"))).toBe(true);
        expect(isStorePhotoUrl("https://zts7idyjw1ng1uqz.public.blob.vercel-storage.com/hiq/avatar/a.webp")).toBe(false);
        expect(isStorePhotoUrl("https://evil.com/hiq/store-photo/a.webp")).toBe(false);
        expect(isStorePhotoUrl(`${U("a")}?x=1`)).toBe(false);
        expect(STORE_PHOTO_CATEGORY).toBe("store-photo");
    });
    it("저장 — 하나라도 틀리면 받지 않고, 겹친 것은 하나로, 최대 8장", () => {
        expect(cleanStorePhotos([U("a"), U("a"), U("b")])).toEqual([U("a"), U("b")]);
        expect(cleanStorePhotos([U("a"), "https://evil.com/x.webp"])).toBeNull();
        expect(cleanStorePhotos("x")).toBeNull();
        expect(cleanStorePhotos(Array.from({ length: 12 }, (_, i) => U(`p${i}`)))).toHaveLength(STORE_PHOTO_MAX);
        expect(storePhotosOf(null)).toEqual([]);
        expect(storePhotosOf([U("a"), 3, "x"])).toEqual([U("a")]);
    });
    it("올리기는 위치 정보를 걷은 그림만 · 사장님 저장 · 공개 매장 API · 화면", () => {
        expect(read("server/routes/modules/member.ts")).toContain("|| safeCat === STORE_PHOTO_CATEGORY) && !clean.type) return sendError(res, 400");
        const partner = read("server/routes/modules/partner.ts");
        expect(partner).toContain("const photos = cleanStorePhotos(req.body.images);");
        expect(partner).toContain("if (patch.tableLarge !== undefined) sync.tableLarge =");
        const listings = read("server/routes/modules/listings.ts");
        expect(listings).toContain("owner = { notice: st.notice?.trim().slice(0, 500) || null, parking: st.parking?.trim().slice(0, 120) || null, photos: storePhotosOf(st.images) };");
        expect(listings).toContain("return sendSuccess(res, { ...pub, crews, honor, owner, venue });");
        const page = read("client/src/pages/store-listing.tsx");
        for (const id of ["listing-owner-photos", "listing-owner-notice", "listing-owner-parking"]) expect(page).toContain(`data-testid="${id}"`);
        expect(read("client/src/pages/partner/settings.tsx")).toContain("<StorePhotos images={(store as { images?: unknown }).images} />");
    });
});

describe("승인 안내 — 폰 알림이 갔을 때만 '연락 안 해도 됨'", () => {
    it("알림 보내기가 결과를 돌려준다", () => {
        const svc = read("server/services/notificationService.ts");
        expect(svc).toContain('export type NotifyOutcome = "pushed" | "inbox" | "none";');
        expect(svc).toContain('return r.result === "ok" ? "pushed" : "inbox";');
        expect(svc.match(/return "inbox";/g)?.length).toBeGreaterThanOrEqual(3);
    });
    it("승인이 그 결과를 싣고, 화면은 안 갔으면 전화하라고 · 연락처", () => {
        const admin = read("server/routes/modules/admin.ts");
        expect(admin).toContain('pushed = how === "pushed";');
        expect(admin.match(/pushed: out\.pushed,/g)).toHaveLength(2);
        const ui = read("client/src/pages/admin/StoreOnboardingViews.tsx");
        expect(ui).toContain("{r.pushed ? (");
        expect(ui).toContain('data-testid="approve-call-owner"');
        expect(ui).not.toContain("앱 알림을 보냈습니다. 따로 연락하지 않으셔도 됩니다");
    });
});

describe("사장님 대시보드", () => {
    const d = read("client/src/pages/partner/dashboard.tsx");
    it("'방문'이 아니라 '접속' — 앱을 연 날이다", () => {
        expect(d).toContain(">오늘 앱을 연 회원</p>");
        // 주석 말고 화면 글자에 '방문'이 남지 않는다(매장 페이지를 본 사람 주석 · 설명 주석은 예외)
        const ui = d.split("\n").filter((l) => !/^\s*(\*|\/\/|\{\/\*)/.test(l));
        expect(ui.filter((l) => l.includes("방문"))).toEqual([]);
    });
    it("대회 탭은 아직 만들어 두기만 된다고 말한다 · 프리미엄은 당분간 모두에게", () => {
        expect(d).toContain('data-testid="partner-tournament-soon"');
        expect(d).toContain("export const PARTNER_PREMIUM_OPEN = true;");
        expect(d).toContain("const isBasic = !PARTNER_PREMIUM_OPEN && !paidPremium;");
        expect(d).toContain('{ label: "매장 사진", done:');
    });
});
