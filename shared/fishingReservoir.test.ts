import { describe, it, expect } from "vitest";
import { RESERVOIR_STARTERS, cleanCountyQuery, matchSpotReservoir, spotCountyQuery, spotReservoirNames, isReservoirCode, reservoirTrend, reservoirView, shortCounty, xmlItems } from "./fishingReservoir";

// 농어촌공사 응답 그대로(2026-10-14 탑정)
const XML = `<response><header><returnReasonCode>00</returnReasonCode></header><body>
<item><check_date>20261006</check_date><county>충청남도 논산시 </county><fac_code>4423010045</fac_code><fac_name>탑정</fac_name><rate>59.3</rate><water_level>27.39</water_level></item>
<item><check_date>20261013</check_date><county>충청남도 논산시 </county><fac_code>4423010045</fac_code><fac_name>탑정</fac_name><rate>60.1</rate><water_level>27.45</water_level></item>
<item><check_date>20261014</check_date><county>충청남도 논산시 </county><fac_code>4423010045</fac_code><fac_name>탑정</fac_name><rate>60.1</rate><water_level>27.45</water_level></item>
</body></response>`;

describe("저수지의 물높이", () => {
    it("XML 의 항목을 읽는다 — 값의 앞뒤 공백은 걷는다", () => {
        const items = xmlItems(XML);
        expect(items).toHaveLength(3);
        expect(items[0]).toEqual({ check_date: "20261006", county: "충청남도 논산시", fac_code: "4423010045", fac_name: "탑정", rate: "59.3", water_level: "27.39" });
        expect(xmlItems("<error>x</error>")).toEqual([]);
    });
    it("한 저수지의 모습 — 가장 최근의 저수율과 이레의 차이", () => {
        const v = reservoirView(RESERVOIR_STARTERS[0], xmlItems(XML))!;
        expect(v).toMatchObject({ code: "4423010045", name: "탑정", county: "충남 논산", rate: 60.1, delta: 0.8, asOf: "2026-10-14" });
        expect(v.days.map((d) => [d.day, d.rate, d.levelM])).toEqual([["2026-10-06", 59.3, 27.39], ["2026-10-13", 60.1, 27.45], ["2026-10-14", 60.1, 27.45]]);
        expect(reservoirView(RESERVOIR_STARTERS[0], [])).toBeNull();
        expect(reservoirView(RESERVOIR_STARTERS[0], [{ check_date: "어제", rate: "50" }, { check_date: "20261014", rate: "999" }])).toBeNull();
    });
    it("움직임을 말로 — 0.5%p 안쪽은 그대로", () => {
        expect([reservoirTrend(0.8), reservoirTrend(-2), reservoirTrend(0.4), reservoirTrend(-0.4)]).toEqual(["오르는 중", "빠지는 중", "그대로", "그대로"]);
    });
    it("주소를 짧게 — 시도는 줄임말, 시군의 끝 글자는 뗀다", () => {
        expect(["충청남도 논산시 ", "전북특별자치도 완주군", "전남광주통합특별시 나주시", "경기도 용인시 처인구", "강원특별자치도 춘천시", "세종특별자치시"].map(shortCounty))
            .toEqual(["충남 논산", "전북 완주", "전남 나주", "경기 용인", "강원 춘천", "세종"]);
    });
    it("찾기 글 · 코드의 꼴", () => {
        expect([cleanCountyQuery(" 논산시 "), cleanCountyQuery("논"), cleanCountyQuery("nonsan"), cleanCountyQuery("예산%' or 1=1")]).toEqual(["논산시", null, null, "예산"]);
        expect([isReservoirCode("4423010045"), isReservoirCode("44230"), isReservoirCode(4423010045)]).toEqual([true, false, false]);
        expect(new Set(RESERVOIR_STARTERS.map((r) => r.code)).size).toBe(6);
        for (const r of RESERVOIR_STARTERS) expect(isReservoirCode(r.code), r.name).toBe(true);
    });
});

describe("낚시터 ↔ 저수지(2026-10-19 — 저수지 낚시터 페이지의 '이 저수지 물높이')", () => {
    const list = [
        { code: "4213010045", name: "고산", county: "강원 원주" },
        { code: "4213010110", name: "서곡", county: "강원 원주" },
        { code: "4155010011", name: "마둔", county: "경기 안성" },
        { code: "4145010001", name: "고산", county: "경기 하남" },
        { code: "4171010014", name: "원당", county: "경기 양주" },
        { code: "4171010099", name: "원당", county: "경기 양주" },
    ];
    it("이름에서 '낚시터'를 떼거나 주소의 '(○○저수지)'로", () => {
        expect(spotReservoirNames({ name: "고산낚시터" })).toEqual(["고산"]);
        expect(spotReservoirNames({ name: "중흥 낚시터", address: "충청남도 공주시 의당면 도신리 487(중흥저수지)" })).toEqual(["중흥"]);
        expect(spotReservoirNames({ name: "유료 마둔낚시공원" })).toEqual(["마둔"]);
        expect(spotCountyQuery("고양시덕양구")).toBe("고양");
        expect(spotCountyQuery("원주시")).toBe("원주");
    });
    it("시도 · 시군까지 같아야 — 같은 이름의 다른 시군 저수지는 잇지 않는다", () => {
        expect(matchSpotReservoir({ name: "고산낚시터", sido: "강원특별자치도", sigungu: "원주시" }, list)?.code).toBe("4213010045");
        expect(matchSpotReservoir({ name: "고산낚시터", sido: "충청남도", sigungu: "공주시" }, list)).toBeNull();
        expect(matchSpotReservoir({ name: "마둔", sido: "경기도", sigungu: "안성시" }, list)?.code).toBe("4155010011");
    });
    it("한 시군에 같은 이름이 둘이면 고르지 않는다 · 이름이 다르면 짐작하지 않는다", () => {
        expect(matchSpotReservoir({ name: "원당낚시터", sido: "경기도", sigungu: "양주시" }, list)).toBeNull();
        expect(matchSpotReservoir({ name: "행복낚시터", sido: "강원특별자치도", sigungu: "원주시" }, list)).toBeNull();
    });
});
