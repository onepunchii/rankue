import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { HIKING_SUMMIT_FIXES, applySummitFix } from "./hikingSummitFix";
import { distM } from "./hikingGeo";

const read = (f: string) => readFileSync(resolve(__dirname, "..", f), "utf8");

describe("100대 명산 — 정상 자리 바로잡기", () => {
    it("한 산에 한 줄, 자리는 나라 안, 고친 거리는 정상 인증의 반경(150m)보다 크다", () => {
        expect(new Set(HIKING_SUMMIT_FIXES.map((f) => f.id)).size).toBe(HIKING_SUMMIT_FIXES.length);
        expect(new Set(HIKING_SUMMIT_FIXES.map((f) => f.name)).size).toBe(HIKING_SUMMIT_FIXES.length);
        for (const f of HIKING_SUMMIT_FIXES) {
            expect(f.lat, f.name).toBeGreaterThan(33); expect(f.lat, f.name).toBeLessThan(38.7);
            expect(f.lng, f.name).toBeGreaterThan(124.5); expect(f.lng, f.name).toBeLessThan(131);
            expect(f.was, f.name).toBeGreaterThan(150);
            expect(["official", "track", "peak"]).toContain(f.by);
        }
    });
    it("알려진 자리와 맞는다 — 한라산은 사람이 서는 동쪽 정상, 속리산 천왕봉 · 월악산 영봉 · 소백산 비로봉", () => {
        const at = (name: string) => HIKING_SUMMIT_FIXES.find((f) => f.name === name)!;
        // 널리 알려진 좌표(도 · 분 · 초를 소수로) — 200m 안
        expect(distM(at("한라산").lat, at("한라산").lng, 33.3613, 126.5357)).toBeLessThan(200);
        expect(distM(at("속리산").lat, at("속리산").lng, 36.5433, 127.8708)).toBeLessThan(200);
        expect(distM(at("월악산").lat, at("월악산").lng, 36.8861, 128.1058)).toBeLessThan(200);
        expect(distM(at("소백산").lat, at("소백산").lng, 36.9575, 128.4847)).toBeLessThan(200);
    });
    it("산 자료의 줄에 덮어쓴다 — id 와 이름이 다 맞을 때만(자료의 id 가 다른 산으로 바뀌어 있으면 건드리지 않는다)", () => {
        const f = HIKING_SUMMIT_FIXES[0];
        expect(applySummitFix({ id: f.id, name: f.name, lat: 1, lon: 2, tier: 1 })).toEqual({ id: f.id, name: f.name, lat: f.lat, lon: f.lng, tier: 1 });
        const other = { id: f.id, name: "다른 산", lat: 1, lon: 2 };
        expect(applySummitFix(other)).toBe(other);
        const none = { id: "Q0", name: f.name, lat: 1, lon: 2 };
        expect(applySummitFix(none)).toBe(none);
    });
    it("고정: 적재가 산 자료를 읽자마자 덮어쓴다(다시 적재해도 고친 자리가 남는다)", () => {
        const imp = read("server/scripts/hiking-import.ts");
        expect(imp).toContain('(json(join(contentDir, "mountains_master.json")) as any[]).map(applySummitFix)');
    });
});
