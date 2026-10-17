import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { obsAdvice, obsFresh, obsTimeIso, parseObs, stationFor, windArrowDeg, windChill, windDirKo } from "./hikingMountObs";

const read = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");
const row = (o: Record<string, unknown> = {}) => ({ obsid: 1917, obsname: "서울 관악산", tm: "2026-10-17 15:40", tm2m: 22.1, tm10m: 22.3, ws10m: 2.6, wd10mstr: "SSE", hm2m: 50.2, rn: 0, ...o });

describe("산 위 관측 · 지금", () => {
    it("API 한 줄 — 한국 시각을 UTC 로 · '-' 는 없음 · 기온도 바람도 없으면 버린다", () => {
        expect(obsTimeIso("2026-10-17 15:40")).toBe("2026-10-17T06:40:00.000Z");
        expect(obsTimeIso("-")).toBeNull();
        expect(parseObs(row())).toEqual({ obsId: 1917, station: "서울 관악산", at: "2026-10-17T06:40:00.000Z", temp: 22.1, wind: 2.6, windDir: "SSE", humidity: 50.2, rain: 0 });
        expect(parseObs(row({ tm2m: "-", tm10m: "-", ws10m: "-", ws2m: "-" }))).toBeNull();
        expect(parseObs(row({ tm2m: "-" }))!.temp).toBe(22.3);
        expect(parseObs(row({ wd10mstr: "-", wd2mstr: "ENE" }))!.windDir).toBe("ENE");
    });

    it("이름과 시군이 둘 다 맞을 때만 — 같은 이름 다른 시군은 안 붙인다 · 둘이 맞으면 안 붙인다", () => {
        const list = [{ station: "서울 관악산" }, { station: "평창 매봉" }, { station: "강릉 매봉" }, { station: "가평 서리산" }, { station: "가평 서리산" }];
        expect(stationFor(list, { name: "관악산", sido: "서울특별시", sigungu: "관악구" })).toEqual({ station: "서울 관악산" });
        expect(stationFor(list, { name: "관악산", sido: "경기도", sigungu: "과천시" })).toBeNull();
        expect(stationFor(list, { name: "매봉", sido: "강원특별자치도", sigungu: "평창군" })).toEqual({ station: "평창 매봉" });
        expect(stationFor(list, { name: "매봉", sido: "전라남도", sigungu: "순천시" })).toBeNull();
        expect(stationFor(list, { name: "서리산", sido: "경기도", sigungu: "가평군" })).toBeNull();
        expect(stationFor([{ station: "영월 백운산 " }], { name: "백운산", sido: "강원특별자치도", sigungu: "영월군" })).toEqual({ station: "영월 백운산 " });
    });

    it("바람 — 우리말 방위 · 화살은 불어 가는 쪽 · 체감은 10° 이하에서만", () => {
        expect(windDirKo("NW")).toBe("북서풍");
        expect(windDirKo(null)).toBeNull();
        expect(windArrowDeg("N")).toBe(180);
        expect(windArrowDeg("E")).toBe(270);
        expect(windChill(20, 5)).toBeNull();
        expect(windChill(-5, 8)).toBeLessThan(-5);
    });

    it("한 줄 — 잰 값으로만 · 비 > 센 바람 > 영하 > 무더위", () => {
        expect(obsAdvice({ temp: -3, wind: 12, rain: 0.5 })).toMatch(/비가/);
        expect(obsAdvice({ temp: -3, wind: 15, rain: 0 })).toMatch(/아주 거셉니다/);
        expect(obsAdvice({ temp: -3, wind: 9, rain: 0 })).toMatch(/셉니다/);
        expect(obsAdvice({ temp: -3, wind: 2, rain: 0 })).toMatch(/영하/);
        expect(obsAdvice({ temp: 31, wind: 2, rain: null })).toMatch(/무더워요/);
        expect(obsAdvice({ temp: 18, wind: 3, rain: 0 })).toBeNull();
    });

    it("90분 넘은 값은 '지금'이 아니다", () => {
        const at = "2026-10-17T06:40:00.000Z", t = Date.parse(at);
        expect(obsFresh({ at }, t + 89 * 60_000)).toBe(true);
        expect(obsFresh({ at }, t + 91 * 60_000)).toBe(false);
    });

    it("산 날씨 길이 관측을 같이 싣는다 — 예보를 못 받아도 관측만으로", () => {
        const src = read("server/routes/modules/hiking.ts");
        expect(src).toContain("const hit = stations ? stationFor(stations, m) : null;");
        expect(src).toContain("const obs = hit && obsFresh(hit, Date.now()) ? hit : null;");
        expect(src).toMatch(/weather \? \{ \.\.\.weather, summit, obs, fire \} : \{ days: \[\], hours: \[\], summit: null, obs, fire \}/);
    });
});
