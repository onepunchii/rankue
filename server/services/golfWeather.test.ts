import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// getCourseWeather 의 '언제 기상청을 부르나'를 시험한다 — DB 는 표 이름으로 갈라 주는 가짜, 기상청은 가짜 fetch.
// 파싱·묶기·구역 판정은 shared/golfWeather.test.ts.
const h = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock("../db.js", () => ({ db: { execute: h.execute } }));

import { readFileSync } from "fs";
import path from "path";
import { getCourseWeather, teeWeatherFor, warmWeather } from "./golfWeather";
import { toGrid } from "../../shared/golfWeather";

/** drizzle sql 객체 → 글(표 이름·동사만 보면 된다) */
function sqlText(q: any): string {
    return (q?.queryChunks ?? []).map((c: any) => (Array.isArray(c?.value) ? c.value.join("") : c?.queryChunks ? sqlText(c) : "?")).join("");
}
const kst = (s: string) => Date.parse(`${s}+09:00`);
const NOW = kst("2026-10-05T13:09:00");
const PAGE = { region: "경기", city: "용인시", lat: 37.3241, lng: 127.1753 };

/** 한 격자의 시간별 예보 응답(오늘 12시~모레) */
function shortItems(base: string) {
    const items: any[] = [];
    const day0 = base.slice(0, 8);
    for (let d = 0; d < 3; d++) {
        const ymd = String(+day0 + d);
        for (let hr = d === 0 ? 12 : 0; hr < 24; hr++) for (const [c, v] of [["TMP", "15"], ["POP", "20"], ["PTY", "0"], ["SKY", "1"], ["WSD", "2.0"], ["PCP", "강수없음"]]) {
            items.push({ category: c, fcstDate: ymd, fcstTime: `${String(hr).padStart(2, "0")}00`, fcstValue: v });
        }
    }
    return items;
}
const kmaOk = (items: any[]) => ({ json: async () => ({ response: { header: { resultCode: "00", resultMsg: "NORMAL_SERVICE" }, body: { items: { item: items } } } }) });
const kmaNoData = () => ({ json: async () => ({ response: { header: { resultCode: "03", resultMsg: "NO_DATA" } } }) });

interface Fake { grid: { base: string; data: any; ms: number } | null; mids: Record<string, { base: string; data: any; ms: number }>; writes: string[]; grids?: any[] }
function fakeDb(state: Fake) {
    h.execute.mockReset();
    h.execute.mockImplementation(async (q: any) => {
        const t = sqlText(q).replace(/\s+/g, " ").trim();
        if (t.startsWith("select base, data") && t.includes("golf_weather_grid")) return { rows: state.grid ? [state.grid] : [] };
        if (t.startsWith("select reg_id") && t.includes("golf_weather_mid")) return { rows: Object.entries(state.mids).map(([reg_id, v]) => ({ reg_id, ...v })) };
        if (t.startsWith("select nx, ny, base, data") && t.includes("golf_weather_grid")) return { rows: state.grids ?? [] }; // 글마다의 날씨(묶음 조회)
        if (t.startsWith("select nx, ny") && t.includes("golf_weather_grid")) return { rows: [] };
        state.writes.push(t.split(" ").slice(0, 3).join(" "));
        return { rows: [] };
    });
}
const calls = () => (globalThis.fetch as any).mock.calls.map((c: any[]) => String(c[0]));
const storedGrid = (base: string, fetchedMs: number) => ({ base, ms: fetchedMs, data: { hours: shortItems(base).filter((x) => x.category === "TMP").map((x) => ({ t: x.fcstDate + x.fcstTime.slice(0, 2), tmp: 15, pop: 20, kind: "clear", wsd: 2, pcp: null })), minmax: {} } });

beforeEach(() => {
    vi.useFakeTimers(); vi.setSystemTime(NOW);
    process.env.DATA_GO_KR_KEY = "test+key/with=chars";
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
        if (url.includes("getVilageFcst")) return kmaOk(shortItems(url.match(/base_date=(\d{8})/)![1] + url.match(/base_time=(\d{4})/)![1]));
        if (url.includes("getMidLandFcst")) return kmaOk([{ regId: "11B00000", wf4Am: "맑음", wf4Pm: "맑음", rnSt4Am: 10, rnSt4Pm: 10 }]);
        return kmaOk([{ regId: "11B20612", taMin4: 10, taMax4: 24 }]);
    }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("getCourseWeather — 언제 기상청을 부르나", () => {
    it("받아 둔 게 없으면 그 자리에서 받아 저장한다(단기 1 + 중기 2) — 키는 URL 인코딩해서", async () => {
        const st: Fake = { grid: null, mids: {}, writes: [] };
        fakeDb(st);
        const w = await getCourseWeather(PAGE, { fetch: true });
        expect(w?.base).toBe("202610051100");
        expect(w?.days[0].date).toBe("2026-10-05");
        const urls = calls();
        expect(urls).toHaveLength(3);
        const g = toGrid(PAGE.lat, PAGE.lng);
        expect(urls.find((u: string) => u.includes("getVilageFcst"))).toContain(`nx=${g.nx}&ny=${g.ny}`);
        expect(urls[0]).toContain("serviceKey=test%2Bkey%2Fwith%3Dchars");
        expect(st.writes.filter((x) => x.startsWith("insert into golf_weather_grid"))).toHaveLength(1);
        expect(st.writes.filter((x) => x.startsWith("insert into golf_weather_mid"))).toHaveLength(2);
    });

    it("검색엔진용(fetch:false)은 절대 부르지 않는다 — 받아 둔 게 없으면 null", async () => {
        fakeDb({ grid: null, mids: {}, writes: [] });
        expect(await getCourseWeather(PAGE, { fetch: false })).toBeNull();
        expect(calls()).toHaveLength(0);
        fakeDb({ grid: storedGrid("202610050800", NOW - 3 * 3600_000), mids: {}, writes: [] });
        const w = await getCourseWeather(PAGE, { fetch: false });
        expect(w?.base).toBe("202610050800"); // 낡았어도 가진 것을 쓴다
        expect(calls()).toHaveLength(0);
    });

    it("새 발표가 나왔으면 다시 받고, 이미 새 발표면 부르지 않는다", async () => {
        const mids = { "11B00000": { base: "202610050600", data: {}, ms: NOW - 3600_000 }, "11B20612": { base: "202610050600", data: {}, ms: NOW - 3600_000 } };
        fakeDb({ grid: storedGrid("202610050800", NOW - 3 * 3600_000), mids, writes: [] });
        expect((await getCourseWeather(PAGE, { fetch: true }))?.base).toBe("202610051100");
        expect(calls().filter((u: string) => u.includes("getVilageFcst"))).toHaveLength(1);
        (globalThis.fetch as any).mockClear();
        fakeDb({ grid: storedGrid("202610051100", NOW - 60_000), mids, writes: [] });
        await getCourseWeather(PAGE, { fetch: true });
        expect(calls()).toHaveLength(0);
    });

    it("방금(10분 안) 두드려 본 격자는 낡았어도 다시 조르지 않는다", async () => {
        const mids = { "11B00000": { base: "202610050600", data: {}, ms: NOW }, "11B20612": { base: "202610050600", data: {}, ms: NOW } };
        fakeDb({ grid: storedGrid("202610050800", NOW - 5 * 60_000), mids, writes: [] });
        expect((await getCourseWeather(PAGE, { fetch: true }))?.base).toBe("202610050800");
        expect(calls()).toHaveLength(0);
    });

    it("새 발표가 아직 안 열렸으면(NO_DATA) 그 앞 발표로 물러선다", async () => {
        (globalThis.fetch as any).mockImplementation(async (url: string) => {
            if (url.includes("getVilageFcst")) return url.includes("base_time=1100") ? kmaNoData() : kmaOk(shortItems("202610050800"));
            return kmaNoData();
        });
        fakeDb({ grid: null, mids: {}, writes: [] });
        const w = await getCourseWeather(PAGE, { fetch: true });
        expect(w?.base).toBe("202610050800");
        expect(w?.midBase).toBeNull(); // 중기를 못 받아도 단기는 보여 준다
    });

    it("기상청이 죽었으면 가진 것을 쓰고, 다음 10분 동안 조르지 않게 시각만 찍는다", async () => {
        (globalThis.fetch as any).mockImplementation(async () => { throw new Error("timeout"); });
        const st: Fake = { grid: storedGrid("202610050800", NOW - 3 * 3600_000), mids: {}, writes: [] };
        fakeDb(st);
        expect((await getCourseWeather(PAGE, { fetch: true }))?.base).toBe("202610050800");
        expect(st.writes.some((x) => x.startsWith("update golf_weather_grid set"))).toBe(true);
        expect(st.writes.some((x) => x.startsWith("insert into golf_weather_grid"))).toBe(false);
    });

    it("이틀 가까이 낡은 예보는 보여 주지 않는다", async () => {
        fakeDb({ grid: storedGrid("202610040200", NOW - 3600_000), mids: {}, writes: [] });
        expect(await getCourseWeather(PAGE, { fetch: false })).toBeNull();
    });

    it("키가 없으면 기능이 꺼진다 — DB 도 기상청도 안 건드린다", async () => {
        delete process.env.DATA_GO_KR_KEY;
        fakeDb({ grid: null, mids: {}, writes: [] });
        expect(await getCourseWeather(PAGE, { fetch: true })).toBeNull();
        expect(h.execute).not.toHaveBeenCalled();
        expect(await warmWeather([PAGE])).toEqual({ skipped: "DATA_GO_KR_KEY 없음" });
    });

    it("좌표도 시군도 모르는 골프장은 null", async () => {
        fakeDb({ grid: null, mids: {}, writes: [] });
        expect(await getCourseWeather({ region: "경기", city: null, lat: null, lng: null }, { fetch: true })).toBeNull();
        expect(calls()).toHaveLength(0);
    });
});

describe("warmWeather — 크론", () => {
    it("같은 격자·같은 구역은 한 번만 받는다(이웃 골프장은 한 줄을 나눠 쓴다)", async () => {
        vi.useRealTimers(); // 풀이 Date.now() 로 예산을 잰다
        const st: Fake = { grid: null, mids: {}, writes: [] };
        fakeDb(st);
        const near = { ...PAGE, lat: PAGE.lat + 0.001, lng: PAGE.lng + 0.001 };
        const r = await warmWeather([PAGE, near], { budgetMs: 2000, nowMs: NOW });
        expect(r).toMatchObject({ grids: toGrid(near.lat, near.lng).nx === toGrid(PAGE.lat, PAGE.lng).nx && toGrid(near.lat, near.lng).ny === toGrid(PAGE.lat, PAGE.lng).ny ? 1 : 2, mids: 2, midOk: 2, gridFail: 0 });
        expect(calls().filter((u: string) => u.includes("getMid"))).toHaveLength(2);
    });
});

describe("teeWeatherFor — 글마다의 티타임 날씨", () => {
    const g = toGrid(PAGE.lat, PAGE.lng);
    const grids = () => [{ nx: g.nx, ny: g.ny, ...storedGrid("202610051100", NOW) }, { nx: g.nx + 9, ny: g.ny, ...storedGrid("202610051100", NOW) }];
    const mids = {
        "11B00000": { base: "202610050600", ms: NOW, data: { wf5Am: "맑음", wf5Pm: "흐리고 비", rnSt5Am: 10, rnSt5Pm: 60 } },
        "11B20612": { base: "202610050600", ms: NOW, data: { taMin5: 12, taMax5: 24 } },
    };

    it("받아 둔 것만 읽는다 — 기상청을 부르지 않고, 조회는 두 번(격자 묶음 + 구역 묶음)", async () => {
        fakeDb({ grid: null, mids, writes: [], grids: grids() });
        const m = await teeWeatherFor([
            { id: "a", page: PAGE, datetime: new Date(kst("2026-10-06T07:12:00")) },
            { id: "b", page: { ...PAGE, lat: PAGE.lat - 0.001 }, datetime: "2026-10-06T04:20:00.000Z" }, // 같은 격자의 이웃 골프장, 13:20 KST
        ], NOW);
        expect(calls()).toHaveLength(0);
        expect(h.execute).toHaveBeenCalledTimes(2);
        expect(m.get("a")).toMatchObject({ src: "short", tmp: 15, pop: 20, kind: "clear" });
        expect(m.get("b")).toMatchObject({ src: "short", tmp: 15 });
        expect(m.get("a")!.verdict).toBeTruthy();
    });
    it("시간별이 없는 먼 날은 넓은 지역 예보의 그 반나절 — 기온 없이", async () => {
        fakeDb({ grid: null, mids, writes: [], grids: grids() });
        const m = await teeWeatherFor([
            { id: "am", page: PAGE, datetime: new Date(kst("2026-10-10T07:00:00")) },
            { id: "pm", page: PAGE, datetime: new Date(kst("2026-10-10T13:00:00")) },
            { id: "far", page: PAGE, datetime: new Date(kst("2026-10-20T07:00:00")) },
        ], NOW);
        expect(m.get("am")).toEqual({ kind: "clear", tmp: null, pop: 10, src: "mid" });
        expect(m.get("pm")).toEqual({ kind: "rain", tmp: null, pop: 60, src: "mid" });
        expect(m.has("far")).toBe(false); // 열흘 밖은 붙이지 않는다
    });
    it("지난 글·좌표도 시군도 모르는 글·낡은 예보는 빠진다", async () => {
        fakeDb({ grid: null, mids: {}, writes: [], grids: [{ nx: g.nx, ny: g.ny, ...storedGrid("202610030200", NOW) }] });
        const m = await teeWeatherFor([
            { id: "past", page: PAGE, datetime: new Date(NOW - 3 * 3600_000) },
            { id: "nowhere", page: { region: "경기", city: null, lat: null, lng: null }, datetime: new Date(kst("2026-10-06T07:00:00")) },
            { id: "stale", page: PAGE, datetime: new Date(kst("2026-10-06T07:00:00")) },
        ], NOW);
        expect(m.size).toBe(0);
    });
    it("키가 없거나 글이 없으면 DB 도 안 읽는다", async () => {
        fakeDb({ grid: null, mids: {}, writes: [] });
        expect((await teeWeatherFor([], NOW)).size).toBe(0);
        delete process.env.DATA_GO_KR_KEY;
        expect((await teeWeatherFor([{ id: "a", page: PAGE, datetime: new Date(kst("2026-10-06T07:00:00")) }], NOW)).size).toBe(0);
        expect(h.execute).not.toHaveBeenCalled();
    });
    it("앱 안 목록은 비공개 글·골프장 없는 글에 날씨를 붙이지 않고, 실패해도 목록은 나간다", () => {
        const src = readFileSync(path.resolve(process.cwd(), "server/routes/modules/golf.ts"), "utf8");
        const fn = src.slice(src.indexOf("async function withTeeWeather"), src.indexOf("async function withJoinCounts"));
        expect(fn).toContain("!r.isBlind");
        expect(fn).toContain('/^[0-9]+$/.test(String(r.courseId ?? ""))');
        expect(fn).toMatch(/catch \(e\) \{[\s\S]*return rows;/);
        // 날짜별 목록 두 곳에만 붙인다
        expect(src.match(/withTeeWeather\(await withJoinCounts/g)).toHaveLength(2);
    });
});
