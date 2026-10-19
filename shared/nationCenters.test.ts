import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { NATION_CENTERS } from "./nationCenters";
import { EU_DOT_ROWS } from "./worldDotsEurope";

/** 3쿠션 세계 지도(2026-10-19) — 나라 가운데 · 유럽 점 */
// 2026-10-19 UMB 국가 순위에 오른 57개 연맹
const FEDS = ["KR", "BE", "TR", "VN", "NL", "EG", "DE", "FR", "ES", "CO", "IT", "GR", "US", "AT", "SE", "VE", "PT", "JO", "JP", "MX", "DK", "CZ", "EC", "AR", "PE", "CH", "IQ", "NO", "FI", "LU", "GT", "LB", "AL", "CR", "CL", "LY", "DZ", "PA", "MA", "BO", "DO", "SY", "CN", "SA", "NI", "UY", "CY", "PS", "TN", "HU", "ZA", "PL", "HR", "ID", "ME", "SD", "KH"];

describe("3쿠션 세계 지도", () => {
    it("국가 순위에 오른 나라는 다 자리가 있다", () => {
        for (const f of FEDS) expect(NATION_CENTERS[f], f).toBeDefined();
    });
    it("가운데는 본토 — 프랑스 · 미국이 바다 건너 땅으로 가지 않았다", () => {
        const [flat, flng] = NATION_CENTERS.FR; expect(flat).toBeGreaterThan(42); expect(flng).toBeGreaterThan(-5); expect(flng).toBeLessThan(8);
        const [ulat, ulng] = NATION_CENTERS.US; expect(ulat).toBeGreaterThan(30); expect(ulng).toBeGreaterThan(-125); expect(ulng).toBeLessThan(-70);
        const [klat, klng] = NATION_CENTERS.KR; expect(klat).toBeGreaterThan(34); expect(klng).toBeGreaterThan(126);
    });
    it("유럽 점은 촘촘하게(세계 점 2.5°로는 유럽 모양이 안 나왔다)", () => {
        const n = EU_DOT_ROWS.reduce((a, runs) => a + runs.filter((_, i) => i % 2 === 1).reduce((x, y) => x + y, 0), 0);
        expect(n).toBeGreaterThan(1000);
    });
    it("세계랭킹 '국가' 보기가 지도를 단다", () => {
        const s = readFileSync(resolve(__dirname, "..", "client/src/pages/hiq/world-ranking.tsx"), "utf8");
        expect(s).toContain("<NationsWorldMap nations={nationsData!.nations}");
    });
});
