/**
 * 손님 관리(2026-11-06 사장님 도구 ③) — 매장 소식(광고 규칙) · 손님 카드의 경기 · 마케팅 수신 켜고 끄기 · 우리 매장 크루 만들기.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { STORE_NEWS_EVERY_DAYS, cleanStoreNews, isKstNight, storeNewsNextAt, storeNewsNotice, topWeekdays } from "./storeNews";

const read = (f: string) => readFileSync(resolve(__dirname, "..", f), "utf8");

describe("매장 소식 — 광고 규칙", () => {
    it("글 거르기 · 대상", () => {
        expect(cleanStoreNews({ message: "  토요일 대회!  ", target: "dormant" })).toEqual({ message: "토요일 대회!", target: "dormant" });
        expect(cleanStoreNews({ message: "x" })).toBeNull();
        expect(cleanStoreNews({ message: "가".repeat(200) })?.message.length).toBe(120);
        expect(cleanStoreNews({ message: "안녕하세요", target: "?" })?.target).toBe("all");
    });
    it("제목에 (광고) · 보내는 매장 · 본문 끝에 수신 거부 방법(설정의 실제 이름)", () => {
        const n = storeNewsNotice("한솔대대전용", "토요일 대회 접수 중");
        expect(n.title).toBe("(광고) 한솔대대전용");
        expect(n.body).toBe("토요일 대회 접수 중\n수신 거부: 랭큐 설정 › 알림 › 마케팅 정보 받기");
        expect(read("client/src/lib/i18n/ko.ts")).toContain('"settings.marketing": "마케팅 정보 받기",');
    });
    it("밤(21~08시 한국)에는 알림함에만 · 7일에 한 번", () => {
        expect(isKstNight(Date.parse("2026-11-06T21:30:00+09:00"))).toBe(true);
        expect(isKstNight(Date.parse("2026-11-07T07:59:00+09:00"))).toBe(true);
        expect(isKstNight(Date.parse("2026-11-07T08:00:00+09:00"))).toBe(false);
        const now = Date.parse("2026-11-06T12:00:00Z");
        expect(storeNewsNextAt(null, now)).toBeNull();
        expect(storeNewsNextAt(now - 2 * 86_400_000, now)).toBe(now + (STORE_NEWS_EVERY_DAYS - 2) * 86_400_000);
        expect(storeNewsNextAt(now - 8 * 86_400_000, now)).toBeNull();
    });
    it("자주 오는 요일", () => {
        expect(topWeekdays([0, 0, 0, 3, 1, 0, 5])).toEqual(["토", "수"]);
        expect(topWeekdays([0, 0, 0, 0, 0, 0, 0])).toEqual([]);
    });
});

describe("고정 — 서버 · 화면", () => {
    it("받는 사람은 우리 매장 회원 중 동의한 사람만 · 밤엔 알림함 · 7일 제한", () => {
        const p = read("server/routes/modules/partner.ts");
        expect(p).toContain("where store_id = ${store.id} and marketing_agree = true");
        expect(p).toContain("if (night) { await storage.createNotification({ ...base, isRead: false }); inbox++; }");
        expect(p).toContain('return sendError(res, 429, "매장 소식은 7일에 한 번 보낼 수 있어요");');
        expect(p).toContain("where (g.venue_store_id = ${store.id} or g.store_id = ${store.id})");
    });
    it("마케팅 수신을 끄는 곳이 있다(설정)", () => {
        expect(read("server/routes/modules/member.ts")).toContain('router.patch("/me/marketing", requireAuth');
        expect(read("client/src/components/hiq/settings/NotificationKinds.tsx")).toContain('data-testid="settings-marketing"');
    });
    it("대시보드: 소식 보내기 · 손님 카드 경기 · 우리 매장 크루 만들기(활동 매장 미리 골라짐)", () => {
        const d = read("client/src/pages/partner/dashboard.tsx");
        expect(d).toContain("<StoreNewsCard storeName={store.name}");
        expect(d).toContain("<MemberGames memberId={openMember.id} />");
        expect(d).toContain("setLocation(`/club/create?base=${store.listing!.code}`)");
        expect(read("client/src/pages/hiq/create-club.tsx")).toContain('setSelectedStore({ type: "listing", code: l.code, name: l.name, address: l.address })');
    });
});
