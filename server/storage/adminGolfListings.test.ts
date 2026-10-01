import { describe, it, expect, vi } from "vitest";

// 2026-10-01 골프 관리 — 조인·부킹. 운영자 목록의 거르기·검색·알림 모양(순수 부분)을 굳힌다. DB 는 부르지 않는다.
vi.mock("../db.js", () => ({ db: {} }));

import {
    parseListingFilters, likePattern, effectiveSeller, publicName, kstTee, listingPostIdFromUrl,
    golfListingNotice, golfListingGoneNotice, listingSnapshot, myListingsUrl, LISTING_PAGE,
} from "./adminGolfListings.js";
import { render, type I18nText } from "../lib/i18n.js";
import { ko } from "../../shared/i18n/ko.js";
import { en } from "../../shared/i18n/en.js";
import { es } from "../../shared/i18n/es.js";
import { tr } from "../../shared/i18n/tr.js";
import { vi as viDict } from "../../shared/i18n/vi.js";

const ID = "74988c46-9e72-4f90-b3d3-700050d87cdb";
// 2026-10-05 22:40Z = 한국 10/6 07:40
const TEE = "2026-10-05T22:40:00.000Z";
const join = { id: ID, listingType: "JOIN", courseName: "파인밸리CC", isBlind: false, blindName: null, datetime: TEE };
const blindBooking = { id: ID, listingType: "BOOKING", courseName: "남서울CC", isBlind: true, blindName: "경기 남부 명문 A", datetime: TEE };
const keyOf = (t: string | I18nText) => (typeof t === "string" ? t : t.key);

describe("parseListingFilters — 모르는 값은 기본으로(400 이 아니라)", () => {
    it("기본: 다가오는 · 거르기 없음 · 첫 쪽 50개", () => {
        expect(parseListingFilters({})).toEqual({ when: "upcoming", type: null, seller: null, flag: null, q: "", offset: 0, limit: LISTING_PAGE });
    });
    it("아는 값은 그대로", () => {
        expect(parseListingFilters({ when: "recent7", type: "BOOKING", seller: "PERSONAL", flag: "reported", q: "  남서울 ", offset: "50", limit: "20" }))
            .toEqual({ when: "recent7", type: "BOOKING", seller: "PERSONAL", flag: "reported", q: "남서울", offset: 50, limit: 20 });
    });
    it("모르는 값·배열(같은 키 두 번)·음수·너무 큰 값", () => {
        const f = parseListingFilters({ when: "yesterday", type: ["JOIN", "BOOKING"], seller: "store", flag: "deleted", offset: "-5", limit: "999" });
        expect(f).toMatchObject({ when: "upcoming", type: null, seller: null, flag: null, offset: 0, limit: LISTING_PAGE });
        expect(parseListingFilters({ limit: "0" }).limit).toBe(1);
        expect(parseListingFilters({ offset: "abc" }).offset).toBe(0);
        expect(parseListingFilters({ q: "가".repeat(80) }).q).toHaveLength(40);
    });
});

describe("likePattern — 검색어의 % _ \\ 는 글자 그대로", () => {
    it("감싸고 이스케이프한다", () => {
        expect(likePattern("남서울")).toBe("%남서울%");
        expect(likePattern("50%_\\")).toBe("%50\\%\\_\\\\%");
    });
});

describe("표시 규칙", () => {
    it("올린 쪽: 옛 부킹(null)은 매장, 조인은 없음, 부킹에서 돌린 조인은 원래 값", () => {
        expect(effectiveSeller("BOOKING", null)).toBe("STORE");
        expect(effectiveSeller("BOOKING", "PERSONAL")).toBe("PERSONAL");
        expect(effectiveSeller("JOIN", null)).toBeNull();
        expect(effectiveSeller("JOIN", "STORE")).toBe("STORE");
    });
    it("회원에게 보이는 이름 — golf.ts listingName 과 같다", () => {
        expect(publicName(join)).toBe("파인밸리CC");
        expect(publicName(blindBooking)).toBe("경기 남부 명문 A");
        expect(publicName({ ...blindBooking, blindName: "" })).toBe("비공개 골프장");
    });
    it("티타임은 한국 시각", () => {
        expect(kstTee(TEE)).toBe("10/6 07:40");
        expect(kstTee("아님")).toBe("");
    });
    it("긴급 방송 링크에서 글 id", () => {
        expect(listingPostIdFromUrl(`/golf/booking-list/${ID}?view=JOIN`)).toBe(ID);
        expect(listingPostIdFromUrl(`/golf/booking-list/${ID.toUpperCase()}`)).toBe(ID);
        expect(listingPostIdFromUrl("/golf/booking-list?view=JOIN")).toBeNull();
        expect(listingPostIdFromUrl(`/golf/booking-list/${ID}x`)).toBeNull();
        expect(listingPostIdFromUrl(null)).toBeNull();
    });
});

describe("글쓴이 알림 — 골프 알림함, 이의제기 약속 없음(감사 4.2)", () => {
    it("자동 가림: GOLF · 내 글 목록 링크 · 실명(글쓴이 본인)", () => {
        const n = golfListingNotice("autoHidden", join);
        expect(n.category).toBe("GOLF");
        expect(n.type).toBe("MODERATION");
        expect(keyOf(n.title)).toBe("notif.golfListing.hidden.title");
        expect(keyOf(n.body)).toBe("notif.golfListing.hidden.body");
        expect(n.params.url).toBe("/golf/my-bookings?tab=join&role=mine");
        expect(JSON.stringify(n)).not.toContain("/community");
        expect(JSON.stringify(n)).not.toContain("autoBlind");
        expect(render("ko", n.body)).toContain("파인밸리CC 10/6 07:40");
    });
    it("비공개 글이라도 글쓴이에게는 실명으로, 부킹은 부킹 탭으로", () => {
        const n = golfListingNotice("adminHidden", blindBooking);
        expect(keyOf(n.body)).toBe("notif.golfListing.hiddenByAdmin.body");
        expect(render("ko", n.body)).toContain("남서울CC");
        expect(n.params.url).toBe(myListingsUrl("BOOKING"));
        expect(n.params.url).toBe("/golf/my-bookings?tab=booking&role=mine");
    });
    it("다시 보이면 글 자체로, 지우면 내 글 목록으로", () => {
        expect(golfListingNotice("shown", join).params.url).toBe(`/golf/booking-list/${ID}?view=JOIN`);
        expect(golfListingNotice("shown", blindBooking).params.url).toBe(`/golf/booking-list/${ID}?view=BOOKING`);
        const del = golfListingNotice("deleted", join);
        expect(keyOf(del.title)).toBe("notif.golfListing.deleted.title");
        expect(del.params.url).toBe("/golf/my-bookings?tab=join&role=mine");
    });
    it("신청자: 확정자는 실명, 대기자는 비공개 글이면 가명 — 목록으로", () => {
        expect(render("ko", golfListingGoneNotice(blindBooking, "accepted").body)).toContain("남서울CC");
        const waiting = golfListingGoneNotice(blindBooking, "applied");
        expect(render("ko", waiting.body)).toContain("경기 남부 명문 A");
        expect(render("ko", waiting.body)).not.toContain("남서울CC");
        expect(waiting.category).toBe("GOLF");
        expect(waiting.params.url).toBe("/golf/booking-list?view=BOOKING");
    });
});

describe("알림 문구 사전 — 다섯 언어 모두, 자리표시자 그대로", () => {
    const dicts = { ko, en, es, tr, vi: viDict } as Record<string, Record<string, string>>;
    const keys = [
        "notif.golfListing.hidden.title", "notif.golfListing.hidden.body", "notif.golfListing.hiddenByAdmin.body",
        "notif.golfListing.deleted.title", "notif.golfListing.deleted.body", "notif.golfListing.deletedApplicant.body",
        "notif.moderation.unblind.title", "notif.moderation.unblind.body",
    ];
    it.each(Object.keys(dicts))("%s", (l) => {
        for (const k of keys) {
            expect(dicts[l][k], `${l} ${k}`).toBeTruthy();
            if (k.endsWith(".body") && k.startsWith("notif.golfListing")) {
                expect(dicts[l][k], `${l} ${k} {course}`).toContain("{course}");
                expect(dicts[l][k], `${l} ${k} {tee}`).toContain("{tee}");
            }
        }
    });
    it("골프 글 안내는 '이의제기'를 약속하지 않는다(그 칸이 없다)", () => {
        for (const k of keys.filter((x) => x.startsWith("notif.golfListing"))) expect(ko[k]).not.toContain("이의제기");
    });
});

describe("listingSnapshot — 지우기 전 처리 기록에 남길 원문", () => {
    it("실명·가명·종류·티타임·그린피·메모", () => {
        const s = listingSnapshot({ ...blindBooking, region: "경기", greenFee: 260000, comment: " 선입금 후 양도 " });
        expect(s.title).toBe("남서울CC(가명 경기 남부 명문 A)");
        expect(s.text).toBe("부킹 · 경기 · 10/6 07:40 · 260,000원\n선입금 후 양도");
    });
});
