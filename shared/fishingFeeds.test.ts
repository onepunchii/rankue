import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { FISHING_FEEDS, SOURCE_LABEL, feedState } from "./fishingFeeds";

const read = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");
const NOW = Date.parse("2026-10-17T00:00:00Z");

describe("낚시 공공자료 상태판", () => {
    it("정해진 때의 두 배를 넘기면 낡음 · 날마다의 값은 하루(26시간) · 없으면 없음", () => {
        expect(feedState(NOW - 30 * 60_000, 15, NOW)).toBe("fresh");
        expect(feedState(NOW - 31 * 60_000, 15, NOW)).toBe("stale");
        expect(feedState(NOW - 25 * 3600_000, null, NOW)).toBe("fresh");
        expect(feedState(NOW - 27 * 3600_000, null, NOW)).toBe("stale");
        expect(feedState(null, 180, NOW)).toBe("empty");
    });

    it("서비스가 남기는 출처마다 이름이 있고, 상태판의 어느 자료에 묶여 있다", () => {
        const sources = new Set(FISHING_FEEDS.flatMap((f) => f.sources));
        for (const s of sources) expect(SOURCE_LABEL[s], s).toBeTruthy();
        const noted = ["fishingPort", "fishingSea", "fishingMarket", "fishingReservoir"].map((f) => read(`server/services/${f}.ts`)).join("\n");
        for (const m of noted.matchAll(/noteFeed\("([a-z]+:[A-Za-z]+)"/g)) expect(sources.has(m[1]), m[1]).toBe(true);
        // 해양조사원은 서비스 이름으로 남긴다 — 쓰는 서비스가 전부 상태판에 있다
        for (const m of read("server/services/fishingPort.ts").matchAll(/khoa\("([A-Za-z0-9]+)\//g)) expect(sources.has(`khoa:${m[1]}`), m[1]).toBe(true);
    });

    it("조과 저장은 공공자료를 기다리지 않는다 — 받아 둔 지도만(낡았어도)", () => {
        expect(read("server/routes/modules/fishing.ts")).toMatch(/getIndexMap\(day, Date\.now\(\), \{ cachedOnly: true \}\)/);
        expect(read("server/services/fishingPort.ts")).toMatch(/const stale = \{ data: have\?\.data \?\? null, fresh: false, ageMs \};[\s\S]{0,200}if \(cachedOnly\) return stale;/);
    });

    it("데우기는 '새로 받았는가'로 성공을 본다 · 다섯 쪽은 함수 한도 안에서(한 쪽은 한 번 더)", () => {
        const port = read("server/services/fishingPort.ts");
        expect(port).toContain("const INDEX_FETCH_BUDGET_MS = 7_500;");
        expect(port).toMatch(/for \(let attempt = 0; attempt < 2 && !rows; attempt\+\+\)/);
        expect(read("server/services/fishingWarm.ts")).toContain("const out = { index: idx.fresh && !!idx.data?.length, sea: !!sea, ms: Date.now() - t0 };");
    });

    it("매시 50분에 미리 받는다 — 크론이 있고, 못 받으면 실행 기록에 남긴다", () => {
        expect(read("vercel.json")).toContain('{ "path": "/api/cron/fishing-warm", "schedule": "50 * * * *" }');
        expect(read("server/routes/modules/cron.ts")).toContain('router.get("/fishing-warm", asyncHandler(handleFishingWarm));');
        expect(read("server/services/fishingWarm.ts")).toMatch(/recordCronRun\("fishing_warm", false/);
    });

    it("받기 기록을 적다 실패해도 받기는 깨지지 않는다", () => {
        expect(read("server/services/fishingFeedHealth.ts")).toMatch(/\} catch \{ \/\* 기록 실패는 받기를 깨지 않는다 \*\/ \}/);
    });
});
