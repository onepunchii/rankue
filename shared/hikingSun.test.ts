import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SUNSET_NOTICE_MIN, SUN_NOTE, kstClock, kstYmd, spanText, sunLine, sunTimes, sunsetNotice } from "./hikingSun";

const read = (f: string) => readFileSync(resolve(__dirname, "..", f), "utf8");
/** "06:38" → 분 */
const min = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));
const SEOUL = { lat: 37.5665, lng: 126.978 };
const kst = (y: number, m: number, d: number, h: number, mi = 0) => Date.UTC(y, m - 1, d, h - 9, mi);

describe("해 뜨는 시각 · 지는 시각", () => {
    it("서울 — 알려진 값과 3분 안으로 맞는다(추분 무렵 · 하지 · 동지)", () => {
        // 한국천문연구원 발표값(서울): 10/13 06:38 · 17:57 | 6/21 05:11 · 19:57 | 12/22 07:43 · 17:17
        const cases: [number, number, number, string, string][] = [[2026, 10, 13, "06:38", "17:57"], [2026, 6, 21, "05:11", "19:57"], [2026, 12, 22, "07:43", "17:17"]];
        for (const [y, m, d, rise, set] of cases) {
            const st = sunTimes({ y, m, d }, SEOUL.lat, SEOUL.lng)!;
            expect(Math.abs(min(kstClock(st.rise)) - min(rise)), `${m}/${d} 해 뜸 ${kstClock(st.rise)}`).toBeLessThanOrEqual(3);
            expect(Math.abs(min(kstClock(st.set)) - min(set)), `${m}/${d} 해 짐 ${kstClock(st.set)}`).toBeLessThanOrEqual(3);
            expect(st.rise).toBeLessThan(st.noon); expect(st.noon).toBeLessThan(st.set);
            // 그 날짜(한국)의 해다 — 전날이나 다음 날의 값이 아니다
            expect(kstYmd(st.rise)).toEqual({ y, m, d }); expect(kstYmd(st.set)).toEqual({ y, m, d });
        }
    });
    it("동쪽일수록 일찍, 남쪽일수록 겨울 낮이 길다 — 독도 · 한라산", () => {
        const day = { y: 2026, m: 12, d: 22 };
        const seoul = sunTimes(day, SEOUL.lat, SEOUL.lng)!, dokdo = sunTimes(day, 37.24, 131.87)!, halla = sunTimes(day, 33.36, 126.53)!;
        expect(dokdo.rise).toBeLessThan(seoul.rise - 15 * 60_000);
        expect(halla.set - halla.rise).toBeGreaterThan(seoul.set - seoul.rise);
    });
    it("한국 날짜와 시계 — 자정 앞뒤", () => {
        expect(kstYmd(kst(2026, 10, 13, 0, 5))).toEqual({ y: 2026, m: 10, d: 13 });
        expect(kstYmd(kst(2026, 10, 13, 23, 59))).toEqual({ y: 2026, m: 10, d: 13 });
        expect(kstYmd(kst(2026, 12, 31, 23, 59) + 2 * 60_000)).toEqual({ y: 2027, m: 1, d: 1 });
        expect(kstClock(kst(2026, 10, 13, 6, 38))).toBe("06:38");
    });
    it("글 — 한 줄과 걸리는 시간", () => {
        const st = sunTimes({ y: 2026, m: 10, d: 13 }, SEOUL.lat, SEOUL.lng)!;
        expect(sunLine(st)).toMatch(/^해 뜸 06:3\d · 해 짐 17:5\d · 낮 11시간 \d+분$/);
        expect(spanText(679)).toBe("11시간 19분"); expect(spanText(120)).toBe("2시간"); expect(spanText(42)).toBe("42분"); expect(spanText(-5)).toBe("0분");
        // 일출 · 야간 산행을 권하지 않는다
        expect(SUN_NOTE).toContain("내려올 시간");
        expect(SUN_NOTE).not.toMatch(/일출 산행|야간 산행|밤 산행을 즐/);
    });
    it("자리를 모르거나 값이 이상하면 없다", () => {
        expect(sunTimes({ y: 2026, m: 10, d: 13 }, NaN, 127)).toBeNull();
        expect(sunTimes({ y: 2026, m: 6, d: 21 }, 80, 20)).toBeNull();     // 백야
    });
});

describe("산행 중 — 해 지는 때 알림", () => {
    const st = sunTimes({ y: 2026, m: 10, d: 13 }, SEOUL.lat, SEOUL.lng)!;
    it("해 지기 세 시간 전까지는 아무 말도 하지 않는다", () => {
        expect(sunsetNotice(st.set - (SUNSET_NOTICE_MIN + 5) * 60_000, st)).toBeNull();
        expect(sunsetNotice(kst(2026, 10, 13, 10), st)).toBeNull();
    });
    it("세 시간 안이면 남은 시간과 내려가라는 말, 한 시간 안이면 더 눈에 띄게", () => {
        const a = sunsetNotice(st.set - 100 * 60_000, st)!;
        expect(a.text).toMatch(/^해 지기까지 1시간 40분\(17:5\d\) — 내려갈 시간을 남겨 두세요\.$/);
        expect(a.urgent).toBe(false);
        expect(sunsetNotice(st.set - 40 * 60_000, st)!.urgent).toBe(true);
    });
    it("해가 진 뒤 · 해 뜨기 전 — 불을 켜라는 말만(밤 산행을 권하지 않는다)", () => {
        expect(sunsetNotice(st.set + 30 * 60_000, st)!.text).toBe("해가 졌어요. 불을 켜고 천천히 내려오세요.");
        expect(sunsetNotice(st.rise - 40 * 60_000, st)!.text).toMatch(/^아직 해 뜨기 전이에요\(06:3\d\)/);
        expect(sunsetNotice(Date.now(), null)).toBeNull();
    });
});

describe("고정: 화면에 걸려 있다", () => {
    it("산 화면의 날씨 구역과 산행 중 화면", () => {
        expect(read("client/src/hiking/components/MountainParts.tsx")).toContain("export function SunToday(");
        expect(read("client/src/hiking/pages/MountainPage.tsx")).toContain("<SunToday");
        expect(read("client/src/hiking/pages/TrailPage.tsx")).toContain("sunsetNotice(");
    });
});
