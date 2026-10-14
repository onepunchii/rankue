import { describe, it, expect } from "vitest";
import { bestOf, durationKo, goodSpots, hhmm, hmToMin, indexMapOf, indexOutlook, isFishingIndexStep, rangeText, tideFlowAt, tideRange, tideTurns, visibilityText, windDirKo, type IndexAllRow, type PortIndexRow, type TidePoint } from "./fishingPort";
import { FISHING_PORTS, fishingPort, portsOfArea } from "./fishingStations";
import { SEA_AREAS } from "./fishingSea";

/** 반일주조 흉내 — 12시간 25분 주기, 만조가 highAt 분에 온다 */
const wave = (highAt: number, amp = 300, mean = 450, step = 10): TidePoint[] =>
    Array.from({ length: 1440 / step + 1 }, (_, i) => ({ min: i * step, cm: Math.round((mean + amp * Math.cos((2 * Math.PI * (i * step - highAt)) / 745)) * 10) / 10 }));

describe("만조 · 간조 찾기", () => {
    it("하루에 만조 둘 · 간조 둘을 시각 순으로 찾는다", () => {
        const t = tideTurns(wave(200));
        expect(t.map((x) => x.kind)).toEqual(["high", "low", "high", "low"]);
        // 만조 03:20 · 간조 09:32 무렵 · 만조 15:45 무렵 · 간조 21:58 무렵(10분 눈금 — 가운데에 걸리면 앞의 눈금)
        expect(t.map((x) => x.min)).toEqual([200, 570, 940, 1320]);
        expect(t[0].cm).toBe(750);
        expect(t[1].cm).toBeLessThan(155);
    });
    it("하루의 맨 끝에 걸린 꼭대기는 세지 않는다 · 평평한 곡선(잔물결)에는 속지 않는다", () => {
        expect(tideTurns(wave(10)).map((x) => [x.kind, x.min])).toEqual([["low", 380], ["high", 750], ["low", 1130]]);
        expect(tideTurns(wave(200, 1))).toEqual([]);
        // 동해처럼 물높이 차가 작은 곳(진폭 8cm)도 찾는다
        expect(tideTurns(wave(200, 8, 20)).map((x) => x.kind)).toEqual(["high", "low", "high", "low"]);
        expect(tideTurns([])).toEqual([]);
    });
    it("같은 높이가 이어지는 마루는 하나로 센다", () => {
        const flat: TidePoint[] = [];
        for (let m = 0; m <= 600; m += 10) flat.push({ min: m, cm: m < 280 ? 100 + m : m <= 320 ? 380 : 380 - (m - 320) });
        const t = tideTurns(flat);
        expect(t).toHaveLength(1);
        expect(t[0]).toMatchObject({ kind: "high", cm: 380 });
        expect(t[0].min).toBeGreaterThanOrEqual(280);
        expect(t[0].min).toBeLessThanOrEqual(320);
    });
});

describe("지금의 물 · 말", () => {
    const t = tideTurns(wave(200));
    it("다음 전환점이 만조면 들물, 간조면 날물", () => {
        expect(tideFlowAt(t, 100)).toMatchObject({ flow: "들물", inMin: 100, next: { kind: "high" } });
        expect(tideFlowAt(t, 300)).toMatchObject({ flow: "날물", inMin: 270 });
        expect(tideFlowAt(t, 1400)).toBeNull();
    });
    it("시각 · 걸리는 시간 · 물높이 차", () => {
        expect([hhmm(200), hhmm(570), hhmm(0), hhmm(1439)]).toEqual(["03:20", "09:30", "00:00", "23:59"]);
        expect([durationKo(45), durationKo(120), durationKo(200), durationKo(-3)]).toEqual(["45분", "2시간", "3시간 20분", "0분"]);
        expect(tideRange(t)).toBeGreaterThan(590);
        expect(tideRange([])).toBeNull();
    });
});

describe("항구 브리핑의 조각", () => {
    it("천문연의 시각 꼴(뒤에 공백) · 풍향 · 시정", () => {
        expect([hmToMin("0629 "), hmToMin("1751"), hmToMin("----"), hmToMin(null), hmToMin("2460")]).toEqual([389, 1071, null, null, null]);
        expect([windDirKo(0), windDirKo(283.58), windDirKo(359), windDirKo(-90), windDirKo(null)]).toEqual(["북", "서북서", "북", "서", null]);
        expect([visibilityText(20000), visibilityText(13685), visibilityText(4200), visibilityText(640), visibilityText(null)]).toEqual(["20km 넘게", "14km", "4.2km", "640m", null]);
    });
    it("낚시지수 — 다섯 단계만 받고, 오전 · 오후의 파고 · 바람을 한 범위로 합친다", () => {
        expect([isFishingIndexStep("좋음"), isFishingIndexStep("최고")]).toEqual([true, false]);
        const row = (over: Partial<PortIndexRow>): PortIndexRow => ({ day: "2026-10-14", part: "오전", fish: "감성돔", index: "보통", wave: null, wind: null, wtemp: null, tide: null, ...over });
        expect(indexOutlook([row({ wave: [0.7, 1.0], wind: [7.4, 8.3] }), row({ part: "오후", wave: [0.5, 0.8], wind: [5, 9.1] })])).toEqual({ wave: [0.5, 1.0], wind: [5, 9.1] });
        expect(indexOutlook([row({})])).toBeNull();
        expect([rangeText([0.7, 1]), rangeText([0.5, 0.5]), rangeText(null)]).toEqual(["0.7~1.0", "0.5", null]);
    });
});

describe("항구 목록", () => {
    it("쉰한 곳 · 코드가 겹치지 않고 · 바다 일곱 곳에 다 놓인다", () => {
        expect(FISHING_PORTS).toHaveLength(51);
        expect(new Set(FISHING_PORTS.map((p) => p.code)).size).toBe(51);
        const areas = new Set(SEA_AREAS.map((a) => a.id));
        for (const p of FISHING_PORTS) { expect(areas.has(p.area), p.name).toBe(true); expect(p.code, p.name).toMatch(/^DT_\d{4}$/); expect(p.lat).toBeGreaterThan(33); expect(p.lng).toBeGreaterThan(125); }
        for (const a of SEA_AREAS) expect(portsOfArea(a.id).length, a.id).toBeGreaterThanOrEqual(4);
    });
    it("좌표로 가른 바다 — 인천은 서해중부, 목포는 서해남부, 여수는 남해서부, 부산은 남해동부, 제주 · 추자도는 제주, 포항은 동해남부, 속초 · 울릉도는 동해중부", () => {
        const of = (name: string) => FISHING_PORTS.find((p) => p.name === name)!.area;
        expect(["인천", "목포", "여수", "부산", "제주", "추자도", "포항", "속초", "울릉도", "완도", "진도", "통영"].map(of))
            .toEqual(["west-mid", "west-south", "south-west", "south-east", "jeju", "jeju", "east-south", "east-mid", "east-mid", "south-west", "west-south", "south-east"]);
        expect(fishingPort("DT_0001")?.name).toBe("인천");
        expect(fishingPort("DT_9999")).toBeNull();
        // 큰 항구가 앞에 온다
        expect(portsOfArea("west-mid")[0].name).toBe("인천");
    });
});

describe("낚시지수 지도", () => {
    const row = (point: string, fish: string, part: "오전" | "오후" | "일", index: IndexAllRow["index"], over: Partial<IndexAllRow> = {}): IndexAllRow => ({ point, lat: 34, lng: 127, day: "2026-10-14", part, fish, index, wave: [0.2, 0.4], wind: [3, 5], wtemp: [20, 21], tide: "대조기", ...over });
    const rows = [
        row("연도", "감성돔", "오전", "좋음"), row("연도", "감성돔", "오후", "매우좋음", { wave: [0.1, 0.6] }), row("연도", "참돔", "오전", "보통"),
        row("거문도", "감성돔", "오전", "좋음", { wave: [0.7, 1.0] }), row("거문도", "감성돔", "오후", "보통"),
        row("가거도", "감성돔", "일", "매우나쁨"), row("먼바다", "종합", "오전", "나쁨"), row("연도", "감성돔", "오전", "나쁨", { day: "2026-10-15" }),
    ];
    const map = indexMapOf(rows, "2026-10-14", ["2026-10-14", "2026-10-15"]);
    it("그날의 줄만 지점별로 모은다 — 어종마다 오전 · 오후, 파고는 합친 범위, '종합'은 어종으로 세지 않는다", () => {
        expect(map.spots.map((s) => s.name).sort()).toEqual(["가거도", "거문도", "먼바다", "연도"]);
        const yeondo = map.spots.find((s) => s.name === "연도")!;
        expect(yeondo.fish).toEqual({ 감성돔: { am: "좋음", pm: "매우좋음" }, 참돔: { am: "보통", pm: null } });
        expect(yeondo.wave).toEqual([0.1, 0.6]);
        expect(map.spots.find((s) => s.name === "먼바다")!.fish).toEqual({});
        // '일'은 오전 · 오후 둘 다
        expect(map.spots.find((s) => s.name === "가거도")!.fish.감성돔).toEqual({ am: "매우나쁨", pm: "매우나쁨" });
        expect(map.fishes).toEqual(["감성돔", "참돔"]);
    });
    it("좋은 곳 — 오전 · 오후 가운데 좋은 쪽으로, 좋음 이상만, 좋은 순", () => {
        expect(bestOf({ am: "보통", pm: "좋음" })).toBe("좋음");
        expect(bestOf({ am: null, pm: null })).toBeNull();
        expect(goodSpots(map, "감성돔").map((g) => [g.spot.name, g.step])).toEqual([["연도", "매우좋음"], ["거문도", "좋음"]]);
        expect(goodSpots(map, "참돔")).toEqual([]);
    });
});

