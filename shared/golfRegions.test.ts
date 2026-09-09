import { describe, it, expect } from "vitest";
import {
    resolveGolfRegionCode,
    expandRegionCodes,
    KYUNGGI_ANY,
    GOLF_REGION_BUCKETS,
} from "./golfRegions.js";

describe("resolveGolfRegionCode", () => {
    it("경기 남부·북부·동부를 실제로 가른다 (예전엔 셋 다 '경기' 라 결과가 같았다)", () => {
        expect(resolveGolfRegionCode("경기 용인")).toBe("kyunggi_south");
        expect(resolveGolfRegionCode("경기 파주")).toBe("kyunggi_north");
        expect(resolveGolfRegionCode("경기 남양주")).toBe("kyunggi_east");
        expect(resolveGolfRegionCode("경기 김포")).toBe("incheon_west");
    });

    it("공백이 있든 없든 같게 본다", () => {
        expect(resolveGolfRegionCode("경기도 용인시 처인구")).toBe("kyunggi_south");
        expect(resolveGolfRegionCode("경기용인")).toBe("kyunggi_south");
    });

    it("시·군을 모르는 '경기' 는 숨기지 않고 KYUNGGI_ANY 로 둔다", () => {
        expect(resolveGolfRegionCode("경기")).toBe(KYUNGGI_ANY);
        expect(resolveGolfRegionCode("경기도")).toBe(KYUNGGI_ANY);
    });

    it("서울은 한강 남북을 우길 근거가 없어 KYUNGGI_ANY 로 둔다", () => {
        expect(resolveGolfRegionCode("서울")).toBe(KYUNGGI_ANY);
        expect(resolveGolfRegionCode("서울특별시 노원구")).toBe(KYUNGGI_ANY);
    });

    it("광주가 둘이라 경기가 적혀 있으면 전라로 새지 않는다", () => {
        expect(resolveGolfRegionCode("경기 광주시")).toBe("kyunggi_south");
        expect(resolveGolfRegionCode("경기도 광주시 오포읍")).toBe("kyunggi_south");
        expect(resolveGolfRegionCode("광주광역시 광산구")).toBe("jeolla");
    });

    it("광역 이름으로 권역을 잡는다", () => {
        expect(resolveGolfRegionCode("제주 서귀포")).toBe("jeju");
        expect(resolveGolfRegionCode("강원 춘천")).toBe("gangwon");
        expect(resolveGolfRegionCode("충남 천안")).toBe("chungcheong");
        expect(resolveGolfRegionCode("경남 김해")).toBe("gyeongsang");
        expect(resolveGolfRegionCode("전남 여수")).toBe("jeolla");
        expect(resolveGolfRegionCode("인천 강화")).toBe("incheon_west");
    });

    it("광역 이름 없이 시·군만 있어도 찾는다", () => {
        expect(resolveGolfRegionCode("여주")).toBe("kyunggi_south");
        expect(resolveGolfRegionCode("춘천")).toBe("gangwon");
        expect(resolveGolfRegionCode("천안")).toBe("chungcheong");
    });

    it("주소를 함께 주면 그것도 본다", () => {
        expect(resolveGolfRegionCode("", "경기도 여주시 능서면")).toBe("kyunggi_south");
        expect(resolveGolfRegionCode(null, "제주특별자치도 제주시")).toBe("jeju");
    });

    it("모르면 억지로 넣지 않고 null 이다", () => {
        expect(resolveGolfRegionCode("")).toBeNull();
        expect(resolveGolfRegionCode(null)).toBeNull();
        expect(resolveGolfRegionCode("Pebble Beach")).toBeNull();
    });

    it("칩 id 는 중복이 없다", () => {
        const ids = GOLF_REGION_BUCKETS.map((b) => b.id);
        expect(new Set(ids).size).toBe(ids.length);
    });
});

describe("expandRegionCodes", () => {
    it("경기 칩을 고르면 시·군을 못 적은 경기 매물도 함께 훑는다", () => {
        expect(expandRegionCodes(["kyunggi_south"]).sort()).toEqual(["kyunggi", "kyunggi_south"]);
    });

    it("경기와 무관한 칩만 골랐으면 KYUNGGI_ANY 를 넣지 않는다", () => {
        expect(expandRegionCodes(["jeju", "gangwon"]).sort()).toEqual(["gangwon", "jeju"]);
    });

    it("모르는 id 는 버린다 — 쿼리 문자열로 아무 값이나 들어올 수 있다", () => {
        expect(expandRegionCodes(["jeju", "'; drop table --"])).toEqual(["jeju"]);
        expect(expandRegionCodes(["없는칩"])).toEqual([]);
        expect(expandRegionCodes([])).toEqual([]);
    });
});

describe("실제 골프장 자료(golf/golf.csv 525곳) 형태", () => {
    // 이 자료의 '지역' 칸은 광역 하나뿐이고('경기'), 시·군은 '소재지'(주소)에만 있다.
    // 지역만 넘기면 경기 칩 넷이 다시 같은 결과를 내므로, 서버는 반드시 주소까지 함께 넘겨야 한다.
    it("지역만 주면 경기는 못 가른다 — 그래서 주소가 필요하다", () => {
        expect(resolveGolfRegionCode("경기")).toBe(KYUNGGI_ANY);
    });

    it("지역 + 주소를 함께 주면 갈린다", () => {
        expect(resolveGolfRegionCode("경기", "고양시 덕양구 고양대로1643번길 164")).toBe("kyunggi_north");
        expect(resolveGolfRegionCode("경기", "용인시 처인구 백암면")).toBe("kyunggi_south");
        expect(resolveGolfRegionCode("경기", "남양주시 화도읍")).toBe("kyunggi_east");
        expect(resolveGolfRegionCode("경기", "김포시 고촌읍")).toBe("incheon_west");
    });

    it("도로명에 낀 다른 지역 이름에 안 속는다", () => {
        // '대전길' 때문에 충청으로 가면 안 된다
        expect(resolveGolfRegionCode("경북", "포항시 남구 대전길 12")).toBe("gyeongsang");
        // '광주' 가 들어간 경기 주소
        expect(resolveGolfRegionCode("경기", "광주시 도척면")).toBe("kyunggi_south");
    });

    it("고성은 광역이 붙어 있으면 그대로 간다", () => {
        expect(resolveGolfRegionCode("강원", "고성군 토성면")).toBe("gangwon");
        expect(resolveGolfRegionCode("경남", "고성군 회화면")).toBe("gyeongsang");
    });
});
