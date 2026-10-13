import { describe, it, expect } from "vitest";
import { boatCount, boatRegion, boatRow, boatValidUntil, cleanBoatQuery } from "./fishingBoats";

// 해양수산부 응답 그대로(2026-10-14)
const RAW = { fsboNo: "20090016261404", fsboNm: "광성호", fshNtNm: "부산광역시 서구 제2026-011호", fsboTotTons: "9.77", fshryApvPermNm: "서구 연안복합어업 제2024-00005호", shpmHangNm: "부산광역시 서구 암남항", maxShcrNum: "2명", maxPsrNum: "20명", bsnStEndDt: "2026.10.09 ~ 2027.10.09" };

describe("낚시어선 명부", () => {
    it("받은 한 줄을 우리 줄로 — 시군은 신고확인번호의 앞부분, 유효기간은 끝 날짜", () => {
        expect(boatRow(RAW)).toEqual({ id: "20090016261404", name: "광성호", region: "부산광역시 서구", port: "부산광역시 서구 암남항", tons: 9.77, passengers: 20, validUntil: "2027-10-09" });
        expect(boatRow({ ...RAW, fsboNm: " " })).toBeNull();
        expect(boatRow({ ...RAW, fsboNo: "abc" })).toBeNull();
        expect(boatRow({ fsboNo: "20090016261404", fsboNm: "무명호" })).toMatchObject({ region: "", port: null, tons: null, passengers: null, validUntil: null });
    });
    it("조각들 — 지역 · 정원 · 유효기간", () => {
        expect([boatRegion("전라남도 여수시 제 2025-123호"), boatRegion("남해군"), boatRegion(null)]).toEqual(["전라남도 여수시", "남해군", ""]);
        expect([boatCount("20명"), boatCount("0명"), boatCount("-"), boatCount(12)]).toEqual([20, null, null, 12]);
        expect([boatValidUntil("2026.10.09 ~ 2027.10.09"), boatValidUntil("2027-1-5"), boatValidUntil("무기한"), boatValidUntil("2027.13.45")]).toEqual(["2027-10-09", "2027-01-05", null, null]);
    });
    it("찾기 글은 한글 · 숫자 두 글자 이상", () => {
        expect([cleanBoatQuery(" 여수 "), cleanBoatQuery("여"), cleanBoatQuery("%' or 1=1 --"), cleanBoatQuery("광성호2")]).toEqual(["여수", null, "11", "광성호2"]);
    });
});
