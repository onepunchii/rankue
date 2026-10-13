import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { hikingEveKey, hikingEveNotice, hikingEvePack, hikingEveUrl } from "./hikingEve";
import { sunTimes } from "./hikingSun";
import type { WxDay } from "./golfWeather";

const read = (f: string) => readFileSync(resolve(__dirname, "..", f), "utf8");
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const half = (kind: string, pop: number) => ({ kind, pop }) as unknown as NonNullable<WxDay["am"]>;
const day = (o: Partial<WxDay>): WxDay => ({ date: "2026-10-14", src: "short", am: half("clear", 0), pm: half("partly", 10), tmn: 8, tmx: 14, wsd: 3, ...o }) as WxDay;
const start = Date.UTC(2026, 9, 13, 22, 0);          // 한국 10/14 07:00
const sun = sunTimes({ y: 2026, m: 10, d: 14 }, 38.1191, 128.4654);

describe("산행 전날 저녁 브리핑", () => {
    it("제목은 내일의 시각과 산 이름, 본문은 하늘 · 기온 · 비 올 확률 → 해 → 챙길 것", () => {
        const t = hikingEveNotice({ mountain: "설악산", startMs: start, day: day({}), sun });
        expect(t.title).toBe("내일 07:00 설악산 산행");
        expect(t.body).toMatch(/^산 아래 맑음 → 구름많음 · 8~14° · 비 올 확률 10%\. 해 뜸 06:\d\d · 해 짐 17:\d\d — 해 지기 전에 내려올 시간을 남겨 두세요\. 챙길 것: 물 · 간식 · 헤드랜턴\.$/);
    });
    it("예보를 못 읽었으면 해와 준비물만, 자리도 모르면 준비물만", () => {
        expect(hikingEveNotice({ mountain: "설악산", startMs: start, day: null, sun }).body).toMatch(/^해 뜸 .* 챙길 것: 물 · 간식 · 헤드랜턴\.$/);
        expect(hikingEveNotice({ mountain: "설악산", startMs: start, day: null, sun: null }).body).toBe("챙길 것: 물 · 간식 · 헤드랜턴.");
    });
    it("챙길 것 — 비 · 추위 · 바람에 따라 더한다", () => {
        expect(hikingEvePack(day({ pm: half("rain", 70) }))).toBe("물 · 간식 · 헤드랜턴 · 비옷");
        expect(hikingEvePack(day({ tmn: 2 }))).toBe("물 · 간식 · 헤드랜턴 · 보온 옷");
        expect(hikingEvePack(day({ wsd: 9, tmn: -3, am: half("snow", 80) }))).toBe("물 · 간식 · 헤드랜턴 · 비옷 · 보온 옷 · 바람막이");
        expect(hikingEvePack(null)).toBe("물 · 간식 · 헤드랜턴");
    });
    it("오전과 오후의 하늘이 같으면 한 번만 적는다", () => {
        expect(hikingEveNotice({ mountain: "가", startMs: start, day: day({ pm: half("clear", 0) }), sun: null }).body).toMatch(/^산 아래 맑음 · 8~14°\./);
    });
    it("재촉 · 술 · 돈 · 내기 말이 없다", () => {
        const all = [hikingEveNotice({ mountain: "설악산", startMs: start, day: day({ pm: half("rain", 80), tmn: 0, wsd: 10 }), sun }), hikingEveNotice({ mountain: "설악산", startMs: start, day: null, sun: null })].map((t) => `${t.title} ${t.body}`).join(" ");
        expect(all).not.toMatch(/빨리|서두|기록 경신|술|막걸리|원\b|내기|상금/);
    });
    it("열쇠와 주소", () => {
        expect(hikingEveKey("abc")).toBe("hiking-eve:abc");
        expect(hikingEveUrl("설악산")).toBe(`/hiking/mountains/${encodeURIComponent("설악산")}#sec-weather`);
    });
});

describe("고정: 누구에게 · 언제 · 한 번만", () => {
    const svc = code(read("server/services/hikingEve.ts"));
    it("산악회의, 산을 고른 일정에, 참가를 누른 사람에게만(대기자 제외)", () => {
        expect(svc).toContain("c.sport_category = 'HIKING'");
        expect(svc).toContain("a.mountain_slug is not null");
        expect(svc).toContain("filter (where p.status = 'joined')");
    });
    it("보낼 시간이 아니면 아무것도 읽지 않고, 같은 일정 · 같은 사람에게 두 번 가지 않는다", () => {
        expect(svc).toContain("if (!w.due && !opts.force) return out;");
        expect(svc).toContain("reminderKey: hikingEveKey(x.id)");
        expect(svc).toContain("!done.has(`${hikingEveKey(x.id)}|${id}`)");
    });
    it("예보는 받아 둔 것만 읽는다(기상청을 새로 부르지 않는다), 칸이 아직 없으면 조용히 넘어간다", () => {
        expect(svc).toContain("getCourseWeather(at, { fetch: false })");
        expect(svc).toContain("if (notReady(e)) return out;");
    });
    it("등산 알림함으로 간다 · 점검 응답에 회원 id 가 없다 · 매시 크론에 얹혀 있다", () => {
        expect(svc).toContain('category: "HIKING"');
        expect(svc).toMatch(/preview!\.push\(\{ \.\.\.t, url, to: fresh\.length \}\)/);
        const cron = read("server/routes/modules/cron.ts");
        expect(cron.match(/hikingEve: await hikingEveQuietly\(\)/g)?.length).toBe(2);
        expect(cron).toContain('router.get("/hiking-eve", asyncHandler(handleHikingEve));');
    });
});
