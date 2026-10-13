import { describe, it, expect } from "vitest";
import { RESERVOIR_STARTERS, cleanCountyQuery, isReservoirCode, reservoirTrend, reservoirView, shortCounty, xmlItems } from "./fishingReservoir";

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
