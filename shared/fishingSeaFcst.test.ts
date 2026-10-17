import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SEA_FCST_REG, parseSeaFcst, slotEndMs, slotLabel, slotOf, waveLevel, waveText, windText } from "./fishingSeaFcst";
import { SEA_AREAS } from "./fishingSea";

const read = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");
const kst = (s: string) => Date.parse(`${s}+09:00`);

describe("바다 예보(기상청 해상예보)", () => {
    it("오늘의 바다 일곱 곳마다 구역 코드가 있다", () => {
        for (const a of SEA_AREAS) expect(SEA_FCST_REG[a.id], a.id).toMatch(/^12[ABC]\d{5}$/);
    });

    it("반나절의 이름은 발표 시각으로 — 05시는 오늘 오전부터 · 11시는 오늘 오후부터 · 17시는 오늘 밤부터", () => {
        expect(slotOf("202610170500", 0)).toEqual({ day: "2026-10-17", part: "am" });
        expect(slotOf("202610170500", 1)).toEqual({ day: "2026-10-17", part: "pm" });
        expect(slotOf("202610170500", 2)).toEqual({ day: "2026-10-18", part: "am" });
        expect(slotOf("202610171100", 0)).toEqual({ day: "2026-10-17", part: "pm" });
        expect(slotOf("202610171100", 1)).toEqual({ day: "2026-10-18", part: "am" });
        expect(slotOf("202610171700", 0)).toEqual({ day: "2026-10-17", part: "night" });
        expect(slotOf("202610171700", 1)).toEqual({ day: "2026-10-18", part: "am" });
        expect(slotOf("202610171700", 4)).toEqual({ day: "2026-10-19", part: "pm" });
        expect(slotOf("엉뚱", 0)).toBeNull();
        expect(slotLabel("2026-10-17", "pm", "2026-10-17")).toBe("오늘 오후");
        expect(slotLabel("2026-10-19", "am", "2026-10-17")).toBe("모레 오전");
        expect(slotLabel("2026-10-20", "am", "2026-10-17")).toBe("화 오전");
    });

    it("끝난 칸은 빼고 · 물결 · 바람은 낮은 값~높은 값", () => {
        const items = [
            { numEf: 0, tmFc: 202610170500, wf: "구름많음", rnYn: 0, wh1: 0.5, wh2: 2, wd1: "SE", wd2: "S", ws1: 5, ws2: 12 },
            { numEf: 1, tmFc: 202610170500, wf: "흐리고 가끔 비", rnYn: 1, wh1: 1, wh2: 3.5, wd1: "S", wd2: "S", ws1: 8, ws2: 16 },
            { numEf: 2, tmFc: 202610170500, wf: "맑음", rnYn: 0, wh1: 0.5, wh2: 0.5, wd1: "NW", wd2: "N", ws1: 6, ws2: 6 },
        ];
        const f = parseSeaFcst("west-mid", items, kst("2026-10-17T13:00:00"));
        expect(f.issued).toBe("10/17 5시");
        expect(f.slots.map((s) => s.label)).toEqual(["오늘 오후", "내일 오전"]);
        expect(f.slots[0]).toMatchObject({ rain: true, waveMin: 1, waveMax: 3.5, windMin: 8, windMax: 16 });
        expect(waveText(f.slots[0])).toBe("1–3.5m");
        expect(waveText(f.slots[1])).toBe("0.5m");
        expect(windText(f.slots[0])).toBe("남 · 8–16m/s");
        expect(windText(f.slots[1])).toBe("북서 → 북 · 6m/s");
        expect(slotEndMs("2026-10-17", "night")).toBe(kst("2026-10-18T06:00:00"));
    });

    it("물결의 크기 — 1.5m · 3m 를 넘는가", () => {
        expect(waveLevel({ waveMax: 1 })).toBe("calm");
        expect(waveLevel({ waveMax: 2 })).toBe("mid");
        expect(waveLevel({ waveMax: 3.5 })).toBe("high");
    });

    it("고른 바다 하나만 받는다 · 받기 결과는 상태판에", () => {
        expect(read("server/routes/modules/fishing.ts")).toMatch(/router\.get\("\/sea\/forecast\/:area", requireAuth, gate,/);
        expect(read("server/services/fishingSeaFcst.ts")).toContain('await noteFeed("kma:seaFcst", ok,');
        expect(read("shared/fishingFeeds.ts")).toContain('sources: ["kma:seaFcst"]');
    });
});
