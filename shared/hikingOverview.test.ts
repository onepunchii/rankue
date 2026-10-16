import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fillDays } from "./hikingOverview";

const read = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");

describe("등산 현황 — 30일 줄", () => {
    it("빈 날은 0 으로 채우고 오래된 날부터 · 달이 바뀌어도", () => {
        const out = fillDays([{ day: "2026-10-02", n: 3 }, { day: "2026-09-30", n: 1 }], "2026-10-02", 4, (day) => ({ day, n: 0 }));
        expect(out).toEqual([{ day: "2026-09-29", n: 0 }, { day: "2026-09-30", n: 1 }, { day: "2026-10-01", n: 0 }, { day: "2026-10-02", n: 3 }]);
    });
});

describe("크론 일의 실행 기록 — 일했거나 실패했을 때만", () => {
    const cron = read("server/routes/modules/cron.ts");
    it("산행 · 라운드 전날 브리핑은 보낼 시간(due)에 돈 것과 실패를 적는다", () => {
        expect(cron).toMatch(/if \(out\.due\) await recordCronRun\("hiking_eve", out\.failed === 0, out\);/);
        expect(cron).toMatch(/await recordCronRun\("hiking_eve", false, \{ error: errorText\(e\) \}\);/);
        expect(cron).toMatch(/if \(out\.due\) await recordCronRun\("golf_eve", out\.failed === 0, out\);/);
    });
    it("월대회 굴리기는 치르는 대회가 있을 때만", () => {
        expect(cron).toMatch(/if \(out\.cups > 0 \|\| out\.reminded > 0\) await recordCronRun\("cup_roll", true, out\);/);
    });
    it("기록을 적다 실패해도 크론의 응답은 깨지 않는다", () => {
        const s = read("server/storage/cronRuns.ts");
        expect(s).toMatch(/export async function recordCronRun[\s\S]*?try \{[\s\S]*?\} catch \(e\) \{\s*console\.error/);
    });
    it("마이그레이션은 표 하나를 만들기만 한다", () => {
        const body = read("migrations/cron_runs.sql").split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
        expect(body).not.toMatch(/\b(drop|delete|truncate|alter|update|insert)\b/i);
        expect(body).toMatch(/create table if not exists hiq_cron_runs/);
    });
});

describe("등산 현황 — 오늘 저녁 브리핑 미리보기는 보내지 않는다", () => {
    it("dry · force 로만 부른다", () => {
        expect(read("server/routes/modules/adminHiking.ts")).toMatch(/runHikingEve\(Date\.now\(\), \{ dry: true, force: true \}\)/);
    });
});
