import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ON_COURSE_M, parseSpot, summitCandidates, summitKmOn, validSpot, type LinePoint } from "./hikingMountainEdit";

const read = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");
// 남북으로 곧은 길 하나 — 위도 0.001 ≈ 111m
const line = (lat0: number, lng: number, n: number, ele: (i: number) => number): LinePoint[] => Array.from({ length: n }, (_, i) => [lat0 + i * 0.001, lng, ele(i), i * 0.111] as LinePoint);

describe("산 자료 — 붙여 넣는 자리", () => {
    it("남한 안의 위도 · 경도만 받는다(순서가 뒤집히면 거절)", () => {
        expect(validSpot(37.5, 127.0)).toEqual({ ok: true, lat: 37.5, lng: 127 });
        expect(validSpot(127.0, 37.5).ok).toBe(false);
        expect(validSpot("x", 1).ok).toBe(false);
        expect(validSpot(33.11, 126.27).ok).toBe(true); // 마라도 쪽
    });
    it("'위도, 경도' 한 줄 — 쉼표 · 띄어쓰기 둘 다", () => {
        expect(parseSpot("37.123456, 128.654321")).toEqual({ lat: 37.123456, lng: 128.654321 });
        expect(parseSpot("37.1 128.6")).toEqual({ lat: 37.1, lng: 128.6 });
        expect(parseSpot("128.6, 37.1")).toBeNull();
        expect(parseSpot("정상")).toBeNull();
    });
});

describe("산 자료 — 코스가 정상을 지나는가", () => {
    const l = line(37.0, 128.0, 11, (i) => 500 + i * 10);
    it(`정상의 선 위 자리는 ${ON_COURSE_M}m 안일 때만`, () => {
        expect(summitKmOn(l, 37.005, 128.0)).toBeCloseTo(0.555, 3);
        expect(summitKmOn(l, 37.005, 128.003)).toBeNull(); // 동쪽으로 약 266m
    });
    it("정상 후보 — 코스마다 가장 높은 점 · 100m 안은 하나로 · 산 높이 ±35m 표시", () => {
        const a = line(37.0, 128.0, 11, (i) => 500 + i * 10);       // 꼭대기 37.010 · 600m
        const b = line(37.0005, 128.0003, 11, (i) => 498 + i * 10);  // 꼭대기가 a 의 꼭대기에서 약 60m — 한 후보
        const c = line(37.02, 128.01, 5, () => 700);                  // 다른 봉우리 700m
        const cand = summitCandidates([a, b, c], 610);
        expect(cand.map((x) => [x.ele, x.courses, x.nearHeight])).toEqual([[700, 1, false], [600, 2, true]]);
    });
});

describe("산 자료 — 다시 적재해도 고친 칸이 남는다", () => {
    it("적재(hiking-import)는 고친 칸을 먼저 읽고, 덮어쓰기에서도 그 칸을 건너뛴다", () => {
        const s = read("server/scripts/hiking-import.ts");
        expect(s).toMatch(/select id, lat, lng, height_m, peak_name, admin_keep from hiking_mountains where admin_keep is not null/);
        expect(s).toMatch(/\{ lat: "coords", lng: "coords", height_m: "height", peak_name: "peak" \}/);
        expect(s).toMatch(/case when coalesce\(\$\{table\}\.admin_keep, '\{\}'::jsonb\) \? '\$\{keep\[c\]\}' then \$\{table\}\.\$\{c\} else excluded\.\$\{c\} end/);
    });
    it("100대 명산 적재는 고친 산의 정상 자리를 옮기지 않는다", () => {
        expect(read("server/scripts/hiking-import-kfs100.ts")).toMatch(/where id = \$1 and not \(coalesce\(admin_keep, '\{\}'::jsonb\) \? 'coords'\)/);
    });
    it("어드민 고치기는 admin_keep 에 적고, 코스의 정상 자리를 다시 세고, 산 간직을 비운다", () => {
        const r = read("server/routes/modules/adminHiking.ts");
        const fn = r.slice(r.indexOf('router.post("/mountains/:id"'));
        expect(fn).toMatch(/admin_keep = coalesce\(admin_keep, '\{\}'::jsonb\) \|\| /);
        expect(fn).toMatch(/summitKmOn\(l\.line, spot\.lat, spot\.lng\)[\s\S]*update hiking_courses set summit_km/);
        expect(fn).toMatch(/forgetMountainCache\(\);/);
        expect(fn).toMatch(/if \(!reason\) return sendError\(res, 400/);
    });
    it("마이그레이션은 칸 하나를 더하기만 한다", () => {
        const body = read("migrations/hiking_mountain_keep.sql").split("\n").filter((x) => x.trim() && !x.trim().startsWith("--"));
        expect(body).toEqual(["alter table hiking_mountains add column if not exists admin_keep jsonb;"]);
    });
});
