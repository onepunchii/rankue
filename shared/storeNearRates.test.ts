import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { nearRateCompare, rate10Ok, rateDomain, rateLanes, ratePos, rateVerdict } from "./storeNearRates";

/**
 * 이 근처 10분 요금 견주기(2026-10-18) — 큐대 눈금 위의 공. 받은 값만, 시간당 요금이 섞인 줄은 견줄 때만 뺀다.
 */
const read = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");

describe("이 근처 10분 요금 견주기", () => {
    it("시간당 요금이 10분 칸에 들어간 값(1만~2만 원대)은 견주지 않는다", () => {
        expect(rate10Ok(1800)).toBe(true);
        expect(rate10Ok(22000)).toBe(false);
        expect(rate10Ok(500)).toBe(false);
        expect(rate10Ok(null)).toBe(false);
        const c = nearRateCompare(1700, [1800, 20000, 1600, null, 2000])!;
        expect(c.points.map((p) => p.i)).toEqual([0, 2, 4]); // 번호는 목록 차례 그대로
        expect(c.avg).toBe(1800);
        expect([c.lo, c.hi]).toEqual([1600, 2000]);
        expect(c.diff).toBe(-100);
    });
    it("근처 값이 모자라면 줄을 그리지 않는다 — 이 매장 값이 있으면 둘, 없으면 셋", () => {
        expect(nearRateCompare(1700, [1800, null, null])).toBeNull();
        expect(nearRateCompare(1700, [1800, 1900])).not.toBeNull();
        expect(nearRateCompare(null, [1800, 1900])).toBeNull();
        const only = nearRateCompare(22000, [1800, 1900, 2000])!; // 이 매장 값이 이상하면 근처 범위만
        expect(only.mine).toBeNull();
        expect(only.diff).toBeNull();
    });
    it("평균은 이 매장을 빼고 10원 단위, 50원 안쪽은 비슷해요", () => {
        expect(nearRateCompare(1500, [1700, 1800, 1700])!.avg).toBe(1730);
        expect(rateVerdict(-40)).toBe("same");
        expect(rateVerdict(-100)).toBe("lower");
        expect(rateVerdict(200)).toBe("higher");
    });
    it("눈금은 최소 600원 폭 · 100원 단위 — 170원 차이가 큐대 끝과 끝으로 부풀지 않게", () => {
        expect(rateDomain(2000, 2170)).toEqual({ from: 1700, to: 2400 });
        expect(rateDomain(1800, 1800)).toEqual({ from: 1500, to: 2100 });
        expect(rateDomain(1500, 2500)).toEqual({ from: 1500, to: 2500 });
        const c = nearRateCompare(2000, [2000, 2100, 2170])!;
        expect([c.from, c.to]).toEqual([1700, 2400]);
    });
    it("눈금 자리 · 공 층 — 같은 값은 위층으로 쌓이고, 이 매장(맨 먼저)은 늘 맨 아래", () => {
        expect(ratePos(1500, 1500, 2000)).toBe(7);
        expect(ratePos(2000, 1500, 2000)).toBe(93);
        expect(ratePos(1800, 1800, 1800)).toBe(50);
        expect(rateLanes([50, 50, 50, 90], 8)).toEqual([0, 1, 2, 0]);
        expect(rateLanes([50, 50, 50, 50, 50, 50], 8, 4)).toEqual([0, 1, 2, 3, 3, 3]);
    });
    it("매장 상세가 이 매장 요금과 5개 언어 문구를 넘긴다", () => {
        const page = read("client/src/pages/store-listing.tsx");
        expect(page).toContain("mine={{ large: s.rate10Large, medium: s.rate10Medium }}");
        expect(page.match(/rateCmpTitle: "/g)?.length).toBe(5);
        expect(read("client/src/components/hiq/stores/StoreTableMap.tsx")).toContain('data-testid="store-near-rates"');
        // 검색용 화면(/stores/:code)도 같은 규칙으로 한 줄 — 서버는 ./x.js 로 부른다
        const pre = read("server/prerender.ts");
        expect(pre).toContain('import { nearRateCompare } from "../shared/storeNearRates.js";');
        expect(pre).toContain("<h2>이 근처 10분 요금</h2>");
        // 근처 목록 API 가 요금을 같이 준다(같은 질의 키를 공유)
        expect(read("server/routes/modules/listings.ts")).toContain("rate10Large: storeListings.rate10Large, rate10Medium: storeListings.rate10Medium,");
    });
});
