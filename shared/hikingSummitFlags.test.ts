import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SUMMIT_FLAG_RULES, kmBetween, summitFlags, type MountainSpot } from "./hikingSummitFlags";

const read = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");
// 정상 좌표는 대략 — 거리의 크기만 맞으면 된다
const spots = new Map<string, MountainSpot>([
    ["bukhan", { name: "북한산", lat: 37.6588, lng: 126.9779 }],
    ["dobong", { name: "도봉산", lat: 37.6989, lng: 127.0151 }],
    ["seorak", { name: "설악산", lat: 38.1194, lng: 128.4656 }],
    ["gwanak", { name: "관악산", lat: 37.4447, lng: 126.9637 }],
    ["nofix", { name: "좌표 없는 산", lat: null, lng: null }],
]);
const T0 = Date.parse("2026-10-17T00:00:00Z");
const row = (id: string, mountainId: string, minutes: number, memberId = "a", day = "2026-10-17") => ({ id, memberId, mountainId, atMs: T0 + minutes * 60_000, day });

describe("정상 인증 — 다시 볼 것", () => {
    it("거리 셈은 정상끼리 직선(북한산 ↔ 설악산 약 140km)", () => {
        const km = kmBetween(spots.get("bukhan")!, spots.get("seorak")!)!;
        expect(km).toBeGreaterThan(125);
        expect(km).toBeLessThan(150);
        expect(kmBetween(spots.get("bukhan")!, spots.get("nofix")!)).toBeNull();
    });

    it("북한산에서 설악산까지 한 시간 — 시속 40km 넘게", () => {
        const f = summitFlags([row("1", "bukhan", 0), row("2", "seorak", 60)], spots);
        expect(f.get("1")).toBeUndefined();
        expect(f.get("2")!.map((x) => x.id)).toEqual(["tooFast"]);
        expect(f.get("2")![0].text).toContain("북한산에서");
    });

    it("가까운 두 산을 20분 안에 — 빠르기는 넘지 않아도 '너무 곧'", () => {
        const f = summitFlags([row("1", "bukhan", 0), row("2", "dobong", 12)], spots);
        expect(f.get("2")!.map((x) => x.id)).toEqual(["tooSoon"]);
    });

    it("이어 오르기(북한산 → 도봉산 세 시간)는 보통", () => {
        expect(summitFlags([row("1", "bukhan", 0), row("2", "dobong", 180)], spots).size).toBe(0);
    });

    it(`하루 ${SUMMIT_FLAG_RULES.perDay}곳을 넘으면 그날의 인증마다 표시 · 다른 사람과 섞지 않는다`, () => {
        const mine = ["bukhan", "dobong", "gwanak", "seorak"].map((m, i) => row(String(i), m, i * 300));
        const f = summitFlags([...mine, row("x", "bukhan", 10, "b")], spots);
        for (const id of ["0", "1", "2", "3"]) expect(f.get(id)!.some((x) => x.id === "manyPerDay")).toBe(true);
        expect(f.get("x")).toBeUndefined();
        expect(summitFlags(mine.slice(0, 3), spots).get("0")).toBeUndefined();
    });
});

describe("정상 인증 취소 — 서버", () => {
    const route = read("server/routes/modules/adminHiking.ts");
    it("취소는 지우지 않고 '인증 없는 기록'으로 내린다(같은 날 기록이 이미 있을 때만 인증 줄을 지운다)", () => {
        expect(route).toMatch(/update hiking_summits set verified = false, admin_void = /);
        expect(route).toMatch(/if \(twin\) await db\.execute\(sql`delete from hiking_summits where id = \$\{id\}::uuid and verified`\)/);
    });
    it("거두는 것은 남은 기록이 받쳐 주지 않는 것 — 증정한 것은 빼고", () => {
        expect(route).toMatch(/hikingAwardsDue\(await allMountains\(\), summits\)/);
        expect(route).toMatch(/!granted\.has\(`\$\{a\.kind\}:\$\{a\.key\}`\)/);
    });
    it("까닭 없이는 취소 · 되살리기를 하지 않는다", () => {
        for (const p of ["revoke", "restore"]) expect(route.slice(route.indexOf(`router.post("/summits/:id/${p}"`))).toMatch(/if \(!reason\) return sendError\(res, 400/);
    });
    it("마이그레이션은 칸 하나를 더하기만 한다", () => {
        const body = read("migrations/hiking_summit_void.sql").split("\n").filter((l) => l.trim() && !l.trim().startsWith("--"));
        expect(body).toEqual(["alter table hiking_summits add column if not exists admin_void jsonb;"]);
    });
});
