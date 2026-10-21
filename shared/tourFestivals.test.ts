import { describe, expect, it } from "vitest";
import { festivalDateKo, festivalOf, nearbyFestivals } from "./tourFestivals";

const f = (title: string, start: string, end: string, lat: number, lng: number) => festivalOf({ contentid: title, title, eventstartdate: start, eventenddate: end, mapy: lat, mapx: lng, addr1: "어딘가" })!;

describe("이 근처 축제 · 행사(2026-10-21)", () => {
    it("받은 줄 — 날짜 · 좌표가 이상하면 버린다", () => {
        expect(festivalOf({ title: "x", eventstartdate: "20261024", eventenddate: "20261101", mapy: 34.6, mapx: 126.7 })?.start).toBe("20261024");
        expect(festivalOf({ title: "x", eventstartdate: "2026-10-24", eventenddate: "20261101", mapy: 34.6, mapx: 126.7 })).toBeNull();
        expect(festivalOf({ title: "x", eventstartdate: "20261101", eventenddate: "20261024", mapy: 34.6, mapx: 126.7 })).toBeNull();
        expect(festivalOf({ title: "x", eventstartdate: "20261024", eventenddate: "20261101", mapy: 0, mapx: 0 })).toBeNull();
        // 축제만 · 60일 넘는 것은 빼고(공연 · 체험은 한 해 내내 열린다)
        expect(festivalOf({ title: "국악공연", lclsSystm2: "EV02", eventstartdate: "20260101", eventenddate: "20261231", mapy: 37.5, mapx: 127 })).toBeNull();
        expect(festivalOf({ title: "건축투어", lclsSystm2: "EV03", eventstartdate: "20261020", eventenddate: "20261025", mapy: 37.5, mapx: 127 })).toBeNull();
        expect(festivalOf({ title: "긴 축제", lclsSystm2: "EV01", eventstartdate: "20260801", eventenddate: "20261231", mapy: 37.5, mapx: 127 })).toBeNull();
        expect(festivalOf({ title: "국화축제", lclsSystm2: "EV01", eventstartdate: "20261030", eventenddate: "20261115", mapy: 34.8, mapx: 126.7 })?.title).toBe("국화축제");
    });
    it("반경 · 날짜 · 차례(열린 것 먼저, 빨리 시작하는 것, 가까운 것)", () => {
        const list = [
            f("먼 축제", "20261020", "20261030", 35.5, 128.5),          // 반경 밖
            f("끝난 축제", "20261001", "20261010", 38.12, 128.46),      // 끝남
            f("한참 뒤", "20261220", "20261225", 38.12, 128.46),       // 45일 밖
            f("곧", "20261101", "20261103", 38.15, 128.5),
            f("열림", "20261018", "20261026", 38.2, 128.5),
        ];
        const out = nearbyFestivals(list, 38.12, 128.46, "20261021");
        expect(out.map((x) => [x.title, x.state])).toEqual([["열림", "now"], ["곧", "soon"]]);
        expect(out[0].km).toBeGreaterThan(0);
    });
    it("날짜 글", () => {
        expect(festivalDateKo({ start: "20261024", end: "20261101" })).toBe("10월 24일 ~ 11월 1일");
        expect(festivalDateKo({ start: "20261024", end: "20261024" })).toBe("10월 24일");
    });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
describe("산 페이지에 실린다", () => {
    it("상세 응답 festivals · 화면 '이 근처 축제'(없으면 칸 없음) · 6시간 기억", () => {
        expect(readFileSync(resolve(__dirname, "../server/routes/modules/hiking.ts"), "utf8")).toContain("nearbyFestivals(await tourFestivals().catch(() => []), d.lat, d.lng, kstYmd())");
        expect(readFileSync(resolve(__dirname, "../client/src/hiking/pages/MountainPage.tsx"), "utf8")).toContain("{(d.festivals?.length ?? 0) > 0 && (");
        expect(readFileSync(resolve(__dirname, "../server/services/tourFestivals.ts"), "utf8")).toContain("const TTL = 6 * 3600_000;");
    });
});
