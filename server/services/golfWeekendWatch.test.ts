import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

vi.mock("../db.js", () => ({ db: {} }));
vi.mock("./notificationService.js", () => ({ notificationService: {} }));

import { WATCHED_LIST_PATH, weekendKey, weekendNotice, weekendWindow } from "./golfWeekendWatch";

const kst = (s: string) => Date.parse(`${s}+09:00`);

describe("언제 — 목요일 저녁 7 ~ 8시대에 한 번", () => {
    it("목 19:00 ~ 20:59 만, 이번 주 토 · 일", () => {
        expect(weekendWindow(kst("2026-11-05T19:05:00"))).toEqual({ due: true, sat: "2026-11-07", sun: "2026-11-08", satYmd: "20261107" });
        expect(weekendWindow(kst("2026-11-05T20:59:00")).due).toBe(true);
        expect(weekendWindow(kst("2026-11-05T21:00:00")).due).toBe(false);
        expect(weekendWindow(kst("2026-11-05T18:59:00")).due).toBe(false);
        expect(weekendWindow(kst("2026-11-06T19:30:00")).due).toBe(false);
        expect(weekendKey("2026-11-07")).toBe("golf-weekend:2026-11-07");
    });
});

describe("무엇을 — 있는 것만 말한다", () => {
    it("남은 티 많은 곳 먼저, 두 곳까지 이름 · 나머지는 '외 N곳', 여러 곳이면 내 관심 목록으로", () => {
        const n = weekendNotice([
            { slug: "a", name: "에덴블루CC", tees: 12, wx: "라베 날씨" },
            { slug: "b", name: "블루원용인CC", tees: 42, wx: null },
            { slug: "c", name: "남서울CC", tees: null, wx: "우중 라운드" },
        ])!;
        expect(n.title).toBe("⛳ 이번 주말, 관심 골프장");
        expect(n.body).toBe("블루원용인CC · 남은 티 42개 / 에덴블루CC · 남은 티 12개 · 토 라베 날씨 외 1곳");
        expect(n.url).toBe(WATCHED_LIST_PATH);
    });
    it("받지 않는 골프장은 수를 적지 않고, 예보가 없으면 날씨를 적지 않는다 — 말할 것이 없으면 보내지 않는다", () => {
        const one = weekendNotice([{ slug: "남서울CC", name: "남서울CC", tees: null, wx: "쌀쌀한 새벽 티" }, { slug: "x", name: "X", tees: 0, wx: null }])!;
        expect(one.body).toBe("남서울CC · 토 쌀쌀한 새벽 티");
        expect(one.url).toContain("/golf/course/");
        expect(weekendNotice([{ slug: "x", name: "X", tees: null, wx: null }, { slug: "y", name: "Y", tees: 0, wx: null }])).toBeNull();
        expect(weekendNotice([])).toBeNull();
    });
});

describe("고정: 크론 · 한 번만 · 관심 알림 제한과 섞이지 않음", () => {
    const src = readFileSync(resolve(__dirname, "golfWeekendWatch.ts"), "utf8");
    it("매시 리마인더에 얹고, 점검용 dry 주소가 있다", () => {
        const cron = readFileSync(resolve(__dirname, "../routes/modules/cron.ts"), "utf8");
        expect(cron.match(/golfWeekend: await golfWeekendQuietly\(\)/g)).toHaveLength(2);
        expect(cron).toContain('router.get("/golf-weekend", asyncHandler(handleGolfWeekend));');
        expect(cron).toContain('if (out.due) await recordCronRun("golf_weekend", out.failed === 0, out);');
    });
    it("같은 주 · 같은 사람에게 두 번 가지 않는다 · watchSlug 를 싣지 않는다 · 탈퇴 회원 제외 · 시간 밖이면 읽지 않는다", () => {
        expect(src).toContain("params->>'reminderKey' = ${key}");
        expect(src).toContain("params: { url: n.url, reminderKey: key },");
        expect(src).not.toMatch(/watchSlug:/);
        expect(src).toContain("where m.name <> '탈퇴회원'");
        expect(src).toContain("if (!w.due && !opts.force) return out;");
    });
    it("골프장 목록이 ?watched=1 로 '내 관심'만 보이며 열린다", () => {
        const hub = readFileSync(resolve(__dirname, "../../client/src/golf/pages/GolfCourseHub.tsx"), "utf8");
        expect(hub).toContain('new URLSearchParams(window.location.search).get("watched") === "1"');
    });
});
