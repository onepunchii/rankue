import { describe, it, expect } from "vitest";
import {
    toGrid, latestShortBase, latestMidBase, parseShort, midDays, dayFromHours, buildWeather, sunTimes, kindOf, kindOfText,
    landOf, dayLine, daySky, dayPop, addDays, kstToMs, pickMidLand, pickMidTa, type KmaItem, type WxGrid, type WxHour,
} from "./golfWeather";
import { WX_ZONES, zoneFor, weatherPoint, WX_SUSPECT_KM } from "./golfWeatherZones";

/** 한국 시각 문자열 → epoch ms */
const kst = (s: string) => Date.parse(`${s}+09:00`);

describe("toGrid — 기상청 격자", () => {
    it("기상청 표의 알려진 지점", () => {
        expect(toGrid(37.5665, 126.978)).toEqual({ nx: 60, ny: 127 }); // 서울
        expect(toGrid(35.1796, 129.0756)).toEqual({ nx: 98, ny: 76 }); // 부산
    });
    it("격자 한 칸은 5km — 동쪽으로 20km 가면 nx 가 넷, 북쪽으로 20km 가면 ny 가 넷 는다", () => {
        const a = toGrid(37.30, 127.10);
        const east = toGrid(37.30, 127.10 + 20 / 88.5), north = toGrid(37.30 + 20 / 111.0, 127.10);
        expect(east.nx - a.nx).toBe(4); expect(Math.abs(east.ny - a.ny)).toBeLessThanOrEqual(1);
        expect(north.ny - a.ny).toBe(4); expect(Math.abs(north.nx - a.nx)).toBeLessThanOrEqual(1);
    });
});

describe("발표 시각", () => {
    it("단기 — 하루 여덟 번, 발표 15분 뒤부터 그 발표를 쓴다", () => {
        expect(latestShortBase(kst("2026-10-05T13:09:00"))).toBe("202610051100");
        expect(latestShortBase(kst("2026-10-05T11:10:00"))).toBe("202610050800"); // 아직 15분이 안 지났다
        expect(latestShortBase(kst("2026-10-05T11:15:00"))).toBe("202610051100");
        expect(latestShortBase(kst("2026-10-05T23:30:00"))).toBe("202610052300");
    });
    it("단기 — 새벽 2시 발표 전에는 전날 23시", () => {
        expect(latestShortBase(kst("2026-10-05T01:00:00"))).toBe("202610042300");
        expect(latestShortBase(kst("2026-10-05T02:14:00"))).toBe("202610042300");
        expect(latestShortBase(kst("2026-01-01T00:30:00"))).toBe("202512312300"); // 해가 바뀌어도
    });
    it("단기 — 아직 안 열렸으면 그 앞 발표로 물러선다(back)", () => {
        expect(latestShortBase(kst("2026-10-05T13:09:00"), 1)).toBe("202610050800");
        expect(latestShortBase(kst("2026-10-05T02:30:00"), 1)).toBe("202610042300");
    });
    it("중기 — 06·18시, 30분 뒤부터", () => {
        expect(latestMidBase(kst("2026-10-05T13:00:00"))).toBe("202610050600");
        expect(latestMidBase(kst("2026-10-05T06:20:00"))).toBe("202610041800");
        expect(latestMidBase(kst("2026-10-05T18:31:00"))).toBe("202610051800");
        expect(latestMidBase(kst("2026-10-05T03:00:00"))).toBe("202610041800");
        expect(latestMidBase(kst("2026-10-05T13:00:00"), 1)).toBe("202610041800");
    });
});

describe("하늘", () => {
    it("강수형태가 있으면 하늘보다 그게 먼저", () => {
        expect(kindOf(1, 0)).toBe("clear"); expect(kindOf(3, 0)).toBe("partly"); expect(kindOf(4, 0)).toBe("cloudy");
        expect(kindOf(4, 1)).toBe("rain"); expect(kindOf(4, 2)).toBe("sleet"); expect(kindOf(4, 3)).toBe("snow"); expect(kindOf(3, 4)).toBe("shower");
    });
    it("중기예보의 글", () => {
        expect(kindOfText("맑음")).toBe("clear"); expect(kindOfText("구름많음")).toBe("partly"); expect(kindOfText("흐림")).toBe("cloudy");
        expect(kindOfText("구름많고 비")).toBe("rain"); expect(kindOfText("흐리고 비/눈")).toBe("sleet"); expect(kindOfText("흐리고 눈")).toBe("snow");
        expect(kindOfText("구름많고 소나기")).toBe("shower"); expect(kindOfText("")).toBeNull(); expect(kindOfText(null)).toBeNull();
    });
});

const item = (category: string, fcstDate: string, fcstTime: string, fcstValue: string): KmaItem => ({ category, fcstDate, fcstTime, fcstValue });
const hourItems = (d: string, t: string, v: Partial<Record<"TMP" | "POP" | "PTY" | "SKY" | "WSD" | "PCP" | "SNO", string>>): KmaItem[] =>
    Object.entries({ TMP: "15", POP: "0", PTY: "0", SKY: "1", WSD: "2.0", PCP: "강수없음", SNO: "적설없음", ...v }).map(([c, val]) => item(c, d, t, val!));

describe("parseShort — 단기예보 응답", () => {
    const g = parseShort([
        ...hourItems("20261006", "0700", { TMP: "12", POP: "60", PTY: "1", SKY: "4", WSD: "3.4", PCP: "1.0mm" }),
        ...hourItems("20261006", "0600", { TMP: "11", POP: "30", SKY: "3" }),
        ...hourItems("20261008", "0900", { TMP: "14", POP: "20", SKY: "1", WSD: "1", PCP: "0", SNO: "0" }),   // 나흘째: 단계로 온다
        ...hourItems("20261008", "1200", { TMP: "19", POP: "70", PTY: "1", SKY: "4", WSD: "2", PCP: "2", SNO: "0" }),
        ...hourItems("20261006", "0800", { TMP: "-999", WSD: "-999" }),                                       // 결측
        item("TMN", "20261006", "0600", "10.0"), item("TMX", "20261006", "1500", "21.0"),
    ], "202610051100");

    it("시간순으로 정렬하고 값을 숫자로", () => {
        expect(g.hours.map((h) => h.t)).toEqual(["2026100606", "2026100607", "2026100608", "2026100809", "2026100812"]);
        expect(g.hours[1]).toEqual({ t: "2026100607", tmp: 12, pop: 60, kind: "rain", wsd: 3.4, pcp: "1.0mm" });
        expect(g.hours[0]).toMatchObject({ kind: "partly", pcp: null, wsd: 2 });
    });
    it("최저·최고는 날짜별로", () => {
        expect(g.minmax).toEqual({ "20261006": { tmn: 10, tmx: 21 } });
    });
    it("나흘째의 단계 값은 숫자로 착각하지 않는다 — 바람은 단계(wq), 강수량은 글", () => {
        expect(g.hours[3]).toMatchObject({ wsd: null, wq: 1, pcp: null });
        expect(g.hours[4]).toMatchObject({ wsd: null, wq: 2, pcp: "보통 비", kind: "rain" });
    });
    it("결측(-999)은 빈칸으로 — 틀린 숫자를 만들지 않는다", () => {
        expect(g.hours[2]).toMatchObject({ tmp: null, wsd: null });
    });
});

describe("하루 묶기", () => {
    const h = (t: string, over: Partial<WxHour> = {}): WxHour => ({ t, tmp: 15, pop: 0, kind: "clear", wsd: 2, pcp: null, ...over });
    const full = (ymd: string, f: (hour: number) => Partial<WxHour> = () => ({})) => Array.from({ length: 24 }, (_, i) => h(`${ymd}${String(i).padStart(2, "0")}`, f(i)));

    it("오전(06~11)·오후(12~17) — 비는 한 시간이라도 있으면 비", () => {
        const d = dayFromHours("20261006", full("20261006", (i) => (i === 14 ? { kind: "rain", pop: 70 } : {})), { tmn: 9, tmx: 21 })!;
        expect(d.am).toEqual({ kind: "clear", pop: 0 });
        expect(d.pm).toEqual({ kind: "rain", pop: 70 });
        expect(daySky(d)).toBe("오전 맑음 · 오후 비");
        expect(dayPop(d)).toBe(70);
    });
    it("비가 없으면 가장 잦은 하늘 — 한 시간 흐렸다고 '흐림'이 아니다", () => {
        const d = dayFromHours("20261006", full("20261006", (i) => (i === 9 ? { kind: "cloudy" } : {})), undefined)!;
        expect(d.am!.kind).toBe("clear");
        const tie = dayFromHours("20261006", full("20261006", (i) => (i >= 6 && i < 9 ? { kind: "cloudy" } : {})), undefined)!;
        expect(tie.am!.kind).toBe("cloudy"); // 3:3 이면 더 흐린 쪽
    });
    it("바람은 낮(06~18시) 최대", () => {
        const d = dayFromHours("20261006", full("20261006", (i) => (i === 3 ? { wsd: 12 } : i === 15 ? { wsd: 6.8 } : {})), undefined)!;
        expect(d.wsd).toBe(6.8);
    });
    it("최저·최고 — 기상청 값이 먼저, 없으면 하루치가 다 있을 때만 시간별에서 잰다", () => {
        const temps = (i: number) => ({ tmp: 10 + (i % 12) });
        expect(dayFromHours("20261006", full("20261006", temps), { tmn: 8, tmx: 22 })).toMatchObject({ tmn: 8, tmx: 22 });
        expect(dayFromHours("20261006", full("20261006", temps), undefined)).toMatchObject({ tmn: 10, tmx: 21 });
        // 오후만 남은 오늘 — 남은 시간의 최저를 '오늘 최저'라고 하지 않는다
        expect(dayFromHours("20261006", full("20261006", temps).slice(13), { tmx: 20 })).toMatchObject({ tmn: null, tmx: 20, am: null });
    });
    it("낮 시간이 하나도 없으면 하루를 만들지 않는다(0시 한 줄만 온 닷새째)", () => {
        expect(dayFromHours("20261009", [h("2026100900")], undefined)).toBeNull();
        expect(dayFromHours("20261009", [], undefined)).toBeNull();
    });
    it("세 시간 간격(나흘째)도 하루로 — 바람은 단계", () => {
        const hs = [0, 3, 6, 9, 12, 15, 18, 21].map((i) => h(`20261008${String(i).padStart(2, "0")}`, { wsd: null, wq: i === 12 ? 2 : 1, tmp: 10 + i / 3 }));
        const d = dayFromHours("20261008", hs, undefined)!;
        expect(d).toMatchObject({ wsd: null, wq: 2, tmn: 10, tmx: 17 });
        expect(dayLine(d)).toBe("10/8(목) 맑음 · 10°~17° · 강수확률 0% · 바람 약간 강함");
    });
});

describe("midDays — 중기예보", () => {
    const land = { base: "202610050600", data: pickMidLand({ regId: "11B00000", rnSt4Am: 10, rnSt4Pm: 60, wf4Am: "맑음", wf4Pm: "흐리고 비", rnSt8: 30, wf8: "구름많음", rnSt10: 20, wf10: "흐림" }) };
    const ta = { base: "202610050600", data: pickMidTa({ regId: "11B10101", taMin4: 11, taMax4: 26, taMin4Low: 0, taMax4High: 0, taMin8: 15, taMax8: 23 }) };

    it("발표일 + n일로 날짜를 잡고 오전·오후를 가른다. 8일째부터는 하루 한 값", () => {
        const days = midDays(land, ta);
        expect(days.map((d) => d.date)).toEqual(["2026-10-09", "2026-10-13", "2026-10-15"]);
        expect(days[0]).toEqual({ date: "2026-10-09", src: "mid", am: { kind: "clear", pop: 10 }, pm: { kind: "rain", pop: 60 }, tmn: 11, tmx: 26, wsd: null });
        expect(days[1]).toMatchObject({ am: { kind: "partly", pop: 30 }, pm: { kind: "partly", pop: 30 }, tmn: 15, tmx: 23 });
        expect(days[2]).toMatchObject({ am: { kind: "cloudy", pop: 20 }, tmn: null, tmx: null });
    });
    it("하늘과 기온의 발표 시각이 달라도 날짜로 합친다", () => {
        const days = midDays(land, { base: "202610041800", data: pickMidTa({ taMin5: 12, taMax5: 25 }) });
        expect(days.find((d) => d.date === "2026-10-09")).toMatchObject({ am: { kind: "clear" }, tmn: 12, tmx: 25 }); // 10/4 + 5 = 10/9
    });
    it("필요 없는 칸(Low·High·regId)은 저장하지 않는다", () => {
        expect(Object.keys(ta.data)).toEqual(["taMin4", "taMax4", "taMin8", "taMax8"]);
        expect(Object.keys(land.data)).not.toContain("regId");
    });
    it("권역 코드", () => {
        expect(landOf("11B20612")).toEqual({ regId: "11B00000", label: "서울·인천·경기" });
        expect(landOf("11D20602").regId).toBe("11D20000"); expect(landOf("11D10301").regId).toBe("11D10000");
        expect(landOf("21F20801").regId).toBe("11F20000"); expect(landOf("21F10501").regId).toBe("11F10000");
        expect(landOf("11H10707").regId).toBe("11H10000"); expect(landOf("11H20304").regId).toBe("11H20000");
        expect(landOf("11C10101").regId).toBe("11C10000"); expect(landOf("11C20401").regId).toBe("11C20000"); expect(landOf("11G00401").regId).toBe("11G00000");
    });
});

describe("buildWeather — 한 골프장", () => {
    const NOW = kst("2026-10-05T13:09:00");
    const hour = (t: string): WxHour => ({ t, tmp: 15, pop: 0, kind: "clear", wsd: 2, pcp: null });
    const hours: WxHour[] = [];
    for (let i = 12; i < 24; i++) hours.push(hour(`20261005${String(i).padStart(2, "0")}`));
    for (const d of ["20261006", "20261007"]) for (let i = 0; i < 24; i++) hours.push(hour(`${d}${String(i).padStart(2, "0")}`));
    for (let i = 0; i < 24; i += 3) hours.push({ ...hour(`20261008${String(i).padStart(2, "0")}`), wsd: null, wq: 1 });
    hours.push(hour("2026100900"));
    const grid: WxGrid = { base: "202610051100", hours, minmax: { "20261005": { tmx: 20 }, "20261006": { tmn: 8, tmx: 21 } } };
    const land = { base: "202610050600", data: Object.fromEntries([4, 5, 6, 7].flatMap((n) => [[`wf${n}Am`, "맑음"], [`wf${n}Pm`, "맑음"], [`rnSt${n}Am`, 10], [`rnSt${n}Pm`, 10]]).concat([8, 9, 10].flatMap((n) => [[`wf${n}`, "구름많음"], [`rnSt${n}`, 20]]))) };
    const ta = { base: "202610050600", data: Object.fromEntries([4, 5, 6, 7, 8, 9, 10].flatMap((n) => [[`taMin${n}`, 10], [`taMax${n}`, 24]])) };
    const at = { lat: 37.324, lng: 127.175 };

    it("오늘부터 열하루 — 나흘은 단기, 그 뒤는 중기", () => {
        const w = buildWeather({ grid, land, ta, midArea: "서울·인천·경기 · 용인", at, nowMs: NOW })!;
        expect(w.days.map((d) => d.date)).toEqual(["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11", "2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15"]);
        expect(w.days.map((d) => d.src).join("")).toBe("shortshortshortshortmidmidmidmidmidmidmid");
        expect(w.base).toBe("202610051100"); expect(w.midBase).toBe("202610050600");
    });
    it("지난 시간은 뺀다 — 13시 9분이면 13시부터", () => {
        const w = buildWeather({ grid, land, ta, midArea: null, at, nowMs: NOW })!;
        expect(w.hours[0].t).toBe("2026100513");
        expect(w.days[0]).toMatchObject({ date: "2026-10-05", am: null, tmx: 20, tmn: null }); // 오늘 오전은 지나갔다
    });
    it("중기를 못 받았으면 단기 나흘만", () => {
        const w = buildWeather({ grid, land: null, ta: null, midArea: null, at, nowMs: NOW })!;
        expect(w.days.map((d) => d.date)).toEqual(["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08"]);
        expect(w.midBase).toBeNull();
    });
    it("가운데 날이 비면 거기서 끊는다 — 하루를 건너뛴 것처럼 보이지 않게", () => {
        const gap = { base: "202610050600", data: Object.fromEntries([6, 7].flatMap((n) => [[`wf${n}Am`, "맑음"], [`wf${n}Pm`, "맑음"]])) };
        const w = buildWeather({ grid, land: gap, ta: null, midArea: null, at, nowMs: NOW })!;
        expect(w.days.map((d) => d.date).pop()).toBe("2026-10-08"); // 10/9 가 없으니 10/11 은 싣지 않는다
    });
    it("낡은 예보 — 저녁이면 오늘 낮이 없어 내일부터, 이틀 넘게 낡으면 아무것도 없다", () => {
        const evening = buildWeather({ grid, land, ta, midArea: null, at, nowMs: kst("2026-10-05T19:30:00") })!;
        expect(evening.days[0].date).toBe("2026-10-06");
        expect(evening.hours[0].t).toBe("2026100519");
        expect(buildWeather({ grid, land: null, ta: null, midArea: null, at, nowMs: kst("2026-10-10T09:00:00") })).toBeNull();
    });
    it("좌표를 시군 중심으로 잡았으면 그렇게 적는다", () => {
        expect(buildWeather({ grid, land, ta, midArea: null, at, nowMs: NOW, approx: "울진" })!.approx).toBe("울진");
        expect(buildWeather({ grid, land, ta, midArea: null, at, nowMs: NOW })!.approx).toBeUndefined();
    });
});

describe("sunTimes — 해 뜨고 지는 시각", () => {
    const min = (s: string) => +s.slice(0, 2) * 60 + +s.slice(3);
    it("서울의 알려진 값과 3분 안쪽", () => {
        const eq = sunTimes(37.5665, 126.978, "2026-03-20")!;   // 춘분: 06:36 / 18:44
        expect(Math.abs(min(eq.rise) - min("06:36"))).toBeLessThanOrEqual(3);
        expect(Math.abs(min(eq.set) - min("18:44"))).toBeLessThanOrEqual(3);
        const summer = sunTimes(37.5665, 126.978, "2026-06-21")!; // 하지: 05:11 / 19:57
        expect(Math.abs(min(summer.rise) - min("05:11"))).toBeLessThanOrEqual(3);
        expect(Math.abs(min(summer.set) - min("19:57"))).toBeLessThanOrEqual(3);
        const winter = sunTimes(37.5665, 126.978, "2026-12-22")!; // 동지: 07:43 / 17:17
        expect(Math.abs(min(winter.rise) - min("07:43"))).toBeLessThanOrEqual(3);
        expect(Math.abs(min(winter.set) - min("17:17"))).toBeLessThanOrEqual(3);
    });
    it("동쪽이 먼저 뜬다", () => {
        expect(min(sunTimes(37.75, 128.88, "2026-10-05")!.rise)).toBeLessThan(min(sunTimes(37.45, 126.7, "2026-10-05")!.rise));
    });
});

describe("구역 표", () => {
    it("구역코드 꼴과 좌표가 한국 안", () => {
        for (const [k, [ta, lat, lng]] of Object.entries(WX_ZONES)) {
            expect(k).toMatch(/^(경기|강원|충청|전라|경상|제주)\|.+(시|군)$/);
            expect(ta).toMatch(/^(11|21)[A-H]\d{5}$/);
            expect(lat).toBeGreaterThan(33); expect(lat).toBeLessThan(38.7);
            expect(lng).toBeGreaterThan(125.9); expect(lng).toBeLessThan(129.7);
        }
        expect(Object.keys(WX_ZONES).length).toBeGreaterThanOrEqual(131);
    });
    it("이름이 같은 시군은 권역으로 가른다", () => {
        expect(zoneFor({ region: "경기", city: "광주시" })!.ta).toBe("11B20702");
        expect(zoneFor({ region: "전라", city: "광주시" })!.ta).toBe("11F20501");
        expect(zoneFor({ region: "강원", city: "고성군" })!.ta).toBe("11D20402");
        expect(zoneFor({ region: "경상", city: "고성군" })!.ta).toBe("11H20404");
    });
    it("시군이 빈 골프장은 좌표에서 가장 가까운 구역", () => {
        expect(zoneFor({ region: "경상", city: null, lat: 35.283, lng: 129.07 })!.key).toMatch(/부산시|양산시|기장군/);
        expect(zoneFor({ region: "경상", city: null })).toBeNull();
    });
    it("대관령 근처 골프장은 평창읍이 아니라 대관령 기온", () => {
        expect(zoneFor({ region: "강원", city: "평창군", lat: 37.6509, lng: 128.7056 })!.ta).toBe("11D20201");
        expect(zoneFor({ region: "강원", city: "평창군", lat: 37.3705, lng: 128.3903 })!.ta).toBe("11D10503");
    });
    it("좌표가 없거나 시군에서 터무니없이 멀면 시군 중심(approx)", () => {
        const ok = weatherPoint({ region: "경기", city: "용인시", lat: 37.3241, lng: 127.1753 })!;
        expect(ok).toMatchObject({ lat: 37.3241, lng: 127.1753, approx: false });
        const none = weatherPoint({ region: "경상", city: "김해시", lat: null, lng: null })!;
        expect(none.approx).toBe(true); expect(none.lat).toBe(WX_ZONES["경상|김해시"][1]);
        const wrong = weatherPoint({ region: "경상", city: "울진군", lat: 36.877431, lng: 127.65329 })!; // 실제로 150km 어긋나 있던 좌표
        expect(wrong.approx).toBe(true); expect(wrong.lng).toBe(WX_ZONES["경상|울진군"][2]);
        // 넓은 군의 끝(평창 대관령 — 군 중심에서 42km)은 틀린 좌표가 아니다
        expect(weatherPoint({ region: "강원", city: "홍천군", lat: 37.668, lng: 127.5589 })!.approx).toBe(false);
        expect(WX_SUSPECT_KM).toBeGreaterThan(45);
    });
});

describe("문구·날짜", () => {
    it("하루 한 줄", () => {
        expect(dayLine({ date: "2026-10-06", src: "short", am: { kind: "clear", pop: 0 }, pm: { kind: "clear", pop: 20 }, tmn: 10, tmx: 21, wsd: 3.3 }))
            .toBe("10/6(화) 맑음 · 10°~21° · 강수확률 20% · 바람 최대 3.3m/s");
        expect(dayLine({ date: "2026-10-09", src: "mid", am: { kind: "clear", pop: 10 }, pm: { kind: "rain", pop: 60 }, tmn: 11, tmx: 26, wsd: null }))
            .toBe("10/9(금) 오전 맑음 · 오후 비 · 11°~26° · 강수확률 60%");
    });
    it("날짜 더하기·한국 시각", () => {
        expect(addDays("20261230", 3)).toBe("20270102"); expect(addDays("20260301", -1)).toBe("20260228");
        expect(kstToMs("202610051100")).toBe(kst("2026-10-05T11:00:00"));
    });
});
