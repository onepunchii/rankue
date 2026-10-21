import { describe, expect, it } from "vitest";
import { govHallCode, govHallOf, hallNameKey, hallPhone, matchHalls, placeKey, roadNumberKey, sameHall, shortenAddress } from "./billiardHalls";

/** 전국 당구장 인허가 자료 잇기(2026-10-19 — 영업 중 15,191곳 · 우리 1,199곳 중 969곳이 같은 곳) */
const row = (o: Record<string, string>) => govHallOf({ OPN_ATMY_GRP_CD: "4510000", MNG_NO: "CDFH3301082026000002", SALS_STTS_CD: "01", CRD_INFO_X: "198000", CRD_INFO_Y: "451000", ...o })!;

describe("받은 한 줄 → 우리 꼴", () => {
    it("시도를 우리 꼴로 — 전남 · 광주 통합은 광주 다섯 구만 광주", () => {
        expect(shortenAddress("경기도 평택시 비전5로 15, 4층")).toEqual({ region: "경기", address: "경기 평택시 비전5로 15, 4층" });
        expect(shortenAddress("전남광주통합특별시 광산구 첨단중앙로 1")?.region).toBe("광주");
        expect(shortenAddress("전남광주통합특별시 해남군 해남읍 수성2길 33")).toEqual({ region: "전남", address: "전남 해남군 해남읍 수성2길 33" });
        expect(shortenAddress("강원특별자치도 춘천시 중앙로 1")?.region).toBe("강원");
        expect(shortenAddress("평양 어딘가")).toBeNull();
    });
    it("좌표 · 날짜 · 상태 · 열쇠", () => {
        const g = row({ BPLC_NM: " 큐  당구장 ", ROAD_NM_ADDR: "서울특별시 종로구 새문안로3길 36", LCPMT_YMD: "20150301" });
        expect(g.name).toBe("큐 당구장");
        expect(g.key).toBe("4510000-CDFH3301082026000002");
        expect(g.licenseDate).toBe("2015-03-01");
        expect(g.status).toBe("open");
        expect(g.lat).toBeGreaterThan(37); expect(g.lng).toBeGreaterThan(126);
    });
    it("코드는 G + 10자, 다시 만들어도 같고 열쇠마다 다르다", () => {
        const a = govHallCode("4510000-CDFH3301082026000002"), b = govHallCode("3400000-CDFH3301082026000002");
        expect(a).toMatch(/^G[0-9a-z]{10}$/);
        expect(govHallCode("4510000-CDFH3301082026000002")).toBe(a);
        expect(a).not.toBe(b);
    });
});

describe("우리 매장과 같은 곳인가", () => {
    it("도로명 + 건물번호가 같으면 — 시군구 이름이 바뀌어도(2026 인천 중구 → 영종구)", () => {
        const g = row({ BPLC_NM: "김치당구클럽", ROAD_NM_ADDR: "인천광역시 영종구 하늘중앙로 193, 901호 (중산동)" });
        expect(sameHall({ code: "C1", name: "김치당구클럽", address: "인천 중구 하늘중앙로 193 조양빌딩 9층" }, g)).toBe(true);
        expect(roadNumberKey("경남 김해시 율하6로 52, 2층")).toBe("율하6로 52");
    });
    it("이름이 같아도 동이 다르고 멀면 다른 곳 — 화성 세븐당구장(진안동) ≠ 세븐당구클럽(동탄 영천동)", () => {
        const g = row({ BPLC_NM: "세븐당구클럽", ROAD_NM_ADDR: "경기도 화성시 동탄구 동탄순환대로 689, 403호 (영천동)", LOTNO_ADDR: "경기도 화성시 동탄구 영천동 1" });
        expect(sameHall({ code: "C2", name: "세븐당구장", address: "경기 화성시 진안동 914-1 메인프라자 505호" }, g)).toBe(false);
    });
    it("이름이 같고 동이 같으면 같은 곳", () => {
        const g = row({ BPLC_NM: "락 당구클럽", ROAD_NM_ADDR: "대구광역시 수성구 화랑로 134, 5층 (만촌동)" });
        expect(sameHall({ code: "C3", name: "락 당구클럽", address: "대구 수성구 만촌동 1330-51 5층" }, g)).toBe(true);
        expect(hallNameKey("JD 빌리어드")).toBe(hallNameKey("JD클럽"));
        expect(placeKey("전북특별자치도 군산시 월명로 374")).toBe("전북|군산시");
    });
    it("한 우리 매장에는 하나만", () => {
        const a = row({ BPLC_NM: "락 당구클럽", ROAD_NM_ADDR: "대구광역시 수성구 화랑로 134, 5층 (만촌동)" });
        const b = { ...row({ BPLC_NM: "락 당구클럽", ROAD_NM_ADDR: "대구광역시 수성구 화랑로 134, 5층 (만촌동)" }), key: "x-2" };
        const m = matchHalls([{ code: "C3", name: "락 당구클럽", address: "대구 수성구 만촌동 1330-51 5층" }], [a, b]);
        expect(m.size).toBe(1);
    });
});

describe("전화(2026-10-21) — 지역번호 · 070 · 050 만, 대시를 넣어서", () => {
    it("꼴", () => {
        expect(hallPhone("0212345678")).toBe("02-1234-5678");
        expect(hallPhone("02-123-4567")).toBe("02-123-4567");
        expect(hallPhone("055 321 1234")).toBe("055-321-1234");
        expect(hallPhone("0313211234")).toBe("031-321-1234");
        expect(hallPhone("03132112345")).toBe("031-3211-2345");
        expect(hallPhone("07012345678")).toBe("070-1234-5678");
        expect(hallPhone("050412345678")).toBe("0504-1234-5678");
    });
    it("휴대전화 · 지역번호 없는 번호 · 대표번호 · 빈 값은 받지 않는다", () => {
        expect(hallPhone("01012345678")).toBeNull();
        expect(hallPhone("3211234")).toBeNull();
        expect(hallPhone("15881234")).toBeNull();
        expect(hallPhone("")).toBeNull();
        expect(hallPhone(null)).toBeNull();
    });
    it("받은 줄의 전화가 GovHall 에 실린다", () => {
        expect(row({ BPLC_NM: "큐 당구장", ROAD_NM_ADDR: "서울특별시 종로구 새문안로3길 36", TELNO: "02-735-1234" }).phone).toBe("02-735-1234");
        expect(row({ BPLC_NM: "큐 당구장", ROAD_NM_ADDR: "서울특별시 종로구 새문안로3길 36", TELNO: "010-1234-5678" }).phone).toBeNull();
    });
});
