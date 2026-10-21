import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const read = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");
import { storeDescKo, storeJsonLd, storeLocality, storeTitleKo, isBasicListing, licenseSinceKo, listingCityOf, cityHubPath, cityTitleKo, cityDescKo, closedNoticeKo, isClosedListing, isNewlyLicensed, cleanListingPatch } from "./storeMeta.js";

describe("매장 주소 → 시군구·동(2026-09-24)", () => {
    it("지번·도로명·광역시·긴 시도 표기", () => {
        expect(storeLocality("경기 화성시 남양읍 역골로 17 6층", "경기")).toEqual({ city: "화성시", gu: null, dong: "남양읍" });
        expect(storeLocality("경기 수원시 권선구 권선동 1297-5 6층", "경기")).toEqual({ city: "수원시", gu: "권선구", dong: "권선동" });
        expect(storeLocality("서울 동작구 상도동 358-1 3층", "서울")).toEqual({ city: "동작구", gu: null, dong: "상도동" });
        expect(storeLocality("대전 서구 갈마중로 12 (갈마동) 2층", "대전")).toEqual({ city: "서구", gu: null, dong: "갈마동" });
        expect(storeLocality("세종 아름서1길 23 (아름동)3층", "세종")).toEqual({ city: null, gu: null, dong: "아름동" });
        expect(storeLocality("전북특별자치도 전주시 덕진구 아중1길 16 3층", "전북")).toEqual({ city: "전주시", gu: "덕진구", dong: null });
    });
    it("건물 이름의 '상가'는 동이 아니고, 시도로 시작하지 않는 주소는 읽지 않는다", () => {
        expect(storeLocality("경남 김해시 가야로 12 (대성상가) 3층", "경남").dong).toBeNull();
        expect(storeLocality("아양로40", "대구")).toEqual({ city: null, gu: null, dong: null });
    });
});

describe("매장 제목·설명·구조화데이터", () => {
    it("제목에 동네 — 읍·면은 꼬리를 떼고, 광역시는 시도+구+동", () => {
        expect(storeTitleKo("캐롬 그라운드", "경기", "경기 화성시 남양읍 역골로 17 6층")).toBe("캐롬 그라운드 화성 남양 당구장 — 요금·영업시간 | 랭큐");
        expect(storeTitleKo("와우당구클럽", "부산", "부산 사하구 감천동 476-6 5층")).toBe("와우당구클럽 부산 사하구 감천동 당구장 — 요금·영업시간 | 랭큐");
        expect(storeTitleKo("상상당구클럽", "전북", "전북 부안군 부안읍 봉덕리 592-4 2층")).toBe("상상당구클럽 부안 당구장 — 요금·영업시간 | 랭큐");
        expect(storeTitleKo("Jy캐롬클럽", "대구", "아양로40")).toBe("Jy캐롬클럽 대구 당구장 — 요금·영업시간 | 랭큐");
        // 이름에 '당구장'이 있으면 한 번만
        expect(storeTitleKo("허슬러1 당구장", "서울", "서울 중구 초동 158-1 2층")).toBe("허슬러1 당구장 서울 중구 초동 — 요금·영업시간 | 랭큐");
        expect(storeTitleKo("코빌당구장", "인천", "인천 미추홀구 주안동 1-1")).toBe("코빌당구장 인천 미추홀구 주안동 — 요금·영업시간 | 랭큐");
        // 주소를 안 넘기면(프리렌더 현재 호출) 예전 꼴 그대로
        expect(storeTitleKo("캐롬 그라운드", "경기")).toBe("캐롬 그라운드 — 경기 당구장 요금·영업시간 | 랭큐");
    });
    it("이름이 길면 짧은 동네로 내려간다", () => {
        const addr = "인천 남동구 인주대로 524 (구월동) A동 2층";
        expect(storeTitleKo("정정당당캐롬클럽", "인천", addr)).toBe("정정당당캐롬클럽 인천 남동구 구월동 당구장 — 요금·영업시간 | 랭큐");
        expect(storeTitleKo("정정당당캐롬클럽 본점 2관", "인천", addr)).toBe("정정당당캐롬클럽 본점 2관 인천 남동구 당구장 — 요금·영업시간 | 랭큐");
        expect(storeTitleKo("정정당당캐롬클럽 구월 본점 2관", "인천", addr)).toBe("정정당당캐롬클럽 구월 본점 2관 인천 당구장 — 요금·영업시간 | 랭큐");
    });
    it("설명은 요금이 먼저, 고정 꼬리 문장 없음", () => {
        const d = storeDescKo("캐롬 그라운드", "경기 화성시 남양읍 역골로 17 6층", { rate10Large: 2500, tableLarge: 8 }, "10:00 ~ 05:00");
        expect(d).toBe("대대 10분당 2,500원 — 캐롬 그라운드, 경기 화성시 남양읍 역골로 17 6층. 영업시간 10:00 ~ 05:00. 테이블 대대 8.");
        expect(d).not.toContain("디렉토리");
        expect(storeDescKo("A당구장", "서울 동작구 상도동 1", {}, null)).toBe("A당구장, 서울 동작구 상도동 1.");
    });
    it("100자를 넘으면 주소의 괄호·건물·층을 뗀다", () => {
        const d = storeDescKo("사사당구장", "서울 마포구 월드컵로 196 (성산동) 대명 비첸시티 B102,103 지하1층", { rate10Large: 2000, rate10Medium: 1700 }, "11:00 ~ 23:30");
        expect(d).toBe("대대 10분당 2,000원 · 중대 10분당 1,700원 — 사사당구장, 서울 마포구 월드컵로 196. 영업시간 11:00 ~ 23:30.");
    });
    it("JSON-LD — locality 는 시·군·구, region 은 시·도", () => {
        const ld = storeJsonLd({ code: "C00007", name: "캐롬 그라운드", region: "경기", address: "경기 화성시 남양읍 역골로 17 6층" }) as any;
        expect(ld.address).toEqual({ "@type": "PostalAddress", streetAddress: "경기 화성시 남양읍 역골로 17 6층", addressLocality: "화성시", addressRegion: "경기", addressCountry: "KR" });
        const sj = storeJsonLd({ code: "C1", name: "B", region: "세종", address: "세종 도담동 675" }) as any;
        expect(sj.address.addressLocality).toBeUndefined();
        expect(sj.address.addressRegion).toBe("세종");
    });
});

describe("인허가 자료로만 들어온 매장(2026-10-19)", () => {
    const gov = { source: "gov", claimed: false, openHours: null, tableLarge: null, tableMedium: null, tablePocket: null, rate10Large: null, rate10Medium: null, rate10Pocket: null };
    it("얇은 매장 — 인증 · 요금 · 테이블 · 영업시간 중 하나라도 있으면 아니다, 수집 매장은 늘 아니다", () => {
        expect(isBasicListing(gov)).toBe(true);
        expect(isBasicListing({ ...gov, rate10Large: 2000 })).toBe(false);
        expect(isBasicListing({ ...gov, claimed: true })).toBe(false);
        expect(isBasicListing({ ...gov, source: "collected" })).toBe(false);
    });
    it("제목은 있는 것만 — '위치·인허가', 인허가일은 말로", () => {
        expect(storeTitleKo("1박2일당구클럽", "전남", "전남 여수시 문수로 152-1 (문수동)", true)).toBe("1박2일당구클럽 여수 문수동 당구장 — 위치·인허가 | 랭큐");
        expect(licenseSinceKo("2009-12-03")).toBe("2009년 12월부터");
        expect(licenseSinceKo(null)).toBeNull();
    });
});

describe("시군구 허브(2026-10-19)", () => {
    it("주소의 둘째 낱말이 시 · 군 · 구일 때만", () => {
        expect(listingCityOf("서울 강남구 역삼동 669-15")).toBe("강남구");
        expect(listingCityOf("경기 수원시 권선구 고색동 154")).toBe("수원시");
        expect(listingCityOf("세종 한누리대로 1")).toBeNull();
        expect(listingCityOf("전북특별자치도 군산시 월명로 374")).toBe("군산시");
    });
    it("주소 · 제목 · 설명", () => {
        expect(cityHubPath("서울", "강남구")).toBe("/stores?region=%EC%84%9C%EC%9A%B8&city=%EA%B0%95%EB%82%A8%EA%B5%AC");
        expect(cityTitleKo("서울", "강남구")).toBe("서울 강남구 당구장 목록 · 위치·요금 | 랭큐");
        expect(cityDescKo("서울", "강남구", 187)).toContain("서울 강남구 당구장 187곳");
    });
});

describe("인허가 자료의 폐업 · 휴업(2026-10-20 — 오너 '목록 · 지도에서 빼고 페이지엔 안내')", () => {
    it("폐업은 안내 + 숨김, 휴업은 안내만, 사장님 인증은 둘 다 아님", () => {
        expect(closedNoticeKo({ govStatus: "closed", govClosedDate: "2026-10-06" })?.text).toBe("2026년 10월 폐업 신고된 곳이에요 — 지금은 영업하지 않을 수 있어요.");
        expect(closedNoticeKo({ govStatus: "paused" })?.kind).toBe("paused");
        expect(closedNoticeKo({ govStatus: "open" })).toBeNull();
        expect(closedNoticeKo({ govStatus: "closed", claimed: true })).toBeNull();
        expect(isClosedListing({ govStatus: "closed" })).toBe(true);
        expect(isClosedListing({ govStatus: "paused" })).toBe(false);
    });
    it("목록 · 지도 · 사이트맵이 쓰는 LIVE 는 수집 매장의 폐업도 숨긴다(인증 매장은 빼고)", () => {
        const s = read("server/storage/listingSql.ts");
        expect(s).toContain("not (coalesce(store_listings.gov_status, 'open') = 'closed' and not store_listings.claimed)");
    });
});

describe("새로 연 곳 · 아는 만큼 알려 주기 · 매장 정보 제보(2026-10-21)", () => {
    it("인허가일이 120일 안이면 새로 연 곳", () => {
        const now = Date.UTC(2026, 9, 21);
        expect(isNewlyLicensed("2026-09-14", now)).toBe(true);
        expect(isNewlyLicensed("2026-06-01", now)).toBe(false);
        expect(isNewlyLicensed(null, now)).toBe(false);
        expect(isNewlyLicensed("2026-10-22", now)).toBe(true);    // 하루 앞(시간대 차이)은 봐준다
        expect(isNewlyLicensed("2027-01-01", now)).toBe(false);
    });
    it("빈 매장에 묻는 칸 · 제보는 어드민 '매장 정보 제보'에서 처리함으로", () => {
        const page = read("client/src/pages/store-listing.tsx");
        expect(page).toContain("{isBasicListing(s) && !isClosedListing(s) && (");
        expect(page).toContain('data-testid="listing-fill"');
        expect(page).toContain("sMsg.trim() === t.fillTemplate.trim()");      // 빈 틀 그대로는 못 보낸다
        const admin = read("server/routes/modules/admin.ts");
        expect(admin).toContain('router.get("/listing-suggestions", checkSuperAdmin,');
        expect(admin).toContain('router.post("/listing-suggestions/:id/handled", checkSuperAdmin,');
        expect(read("client/src/pages/admin/dashboard.tsx")).toContain('{tab === "store-suggestions" && <ListingSuggestionsView />}');
    });
});

describe("제보 확인 뒤 고치기 — 받는 칸(2026-10-21)", () => {
    it("영업시간 · 전화 · 테이블 · 10분 요금만, 빈 칸은 지우기, 보내지 않은 칸은 그대로", () => {
        expect(cleanListingPatch({ openHours: "  12:00   ~ 02:00 ", tableLarge: "4", rate10Large: 2500, phone: "" }))
            .toEqual({ ok: true, patch: { openHours: "12:00 ~ 02:00", tableLarge: 4, rate10Large: 2500, phone: null } });
        expect(cleanListingPatch({ name: "바꾼 이름", address: "다른 주소" })).toEqual({ ok: false, reason: "고칠 칸이 없습니다" });
        expect(cleanListingPatch({ tableMedium: null })).toEqual({ ok: true, patch: { tableMedium: null } });
    });
    it("이상한 값은 통째로 거절", () => {
        expect(cleanListingPatch({ phone: "1234" }).ok).toBe(false);
        expect(cleanListingPatch({ tableLarge: 61 }).ok).toBe(false);
        expect(cleanListingPatch({ rate10Medium: 2500.5 }).ok).toBe(false);
        expect(cleanListingPatch({ openHours: "가".repeat(41) }).ok).toBe(false);
        expect(cleanListingPatch(null).ok).toBe(false);
    });
    it("서버: 슈퍼관리자만 · 사장님 인증 매장은 409", () => {
        const admin = read("server/routes/modules/admin.ts");
        expect(admin).toContain('router.patch("/listings/:code", checkSuperAdmin,');
        expect(admin).toContain('if (listing.claimed) return sendError(res, 409,');
    });
});
