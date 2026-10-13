import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { WxHour } from "./golfWeather";
import { LAPSE_PER_100M, SUMMIT_HOURS, SUMMIT_WX_COPY, summitDrop, summitFirstDay, summitWx, trailheadPoint, windChillC } from "./hikingSummitWx";
import { WEATHER_NOTE } from "./hikingPage";

const root = resolve(__dirname, "..");
const read = (f: string) => readFileSync(resolve(root, f), "utf8");
const H = (t: string, tmp: number | null, wsd: number | null = 3, kind: WxHour["kind"] = "clear"): WxHour => ({ t, tmp, pop: 10, kind, wsd, pcp: null });
// 한국 10/13(화) 10:00 — 오늘의 새벽 6시는 이미 지났다
const NOW = Date.UTC(2026, 9, 13, 1, 0);

// 2026-10-13 오너: "산 상세페이지에 날씨에 정상에서의 날씨 추가하면 어때? 시간별로는 아니지만 시간 3개 정도는 정상 온도 해놓으면 좋을 것 같은데"
describe("정상의 날씨 — 산 아래 예보를 높이 차만큼 낮춰 어림한다", () => {
    it("셈 — 100m 에 0.6℃(날씨 구역의 각주가 말하던 그 수) · 높이 차가 작거나 모르면 그리지 않는다", () => {
        expect(LAPSE_PER_100M).toBe(0.6);
        expect(WEATHER_NOTE).toContain("100m 오를 때마다 0.6℃쯤");
        expect(summitDrop(1708, 468)).toEqual({ riseM: 1240, dropC: 7.4 });
        expect(summitDrop(300, 150)).toBeNull();
        expect(summitDrop(null, 100)).toBeNull();
        expect(summitDrop(1000, null)).toBeNull();
    });
    it("들머리 — 코스들의 가장 낮은 곳(자리와 높이) · 높이가 빈 선(전부 0) · 빈 점(0) · 정상에 닿지 않는 조각은 보지 않는다", () => {
        const line = (...p: [number, number, number][]) => p.map(([la, lo, e], i) => [la, lo, e, i]);
        expect(trailheadPoint(1708, [
            { maxM: 1702, line: line([38.11, 128.41, 468], [38.119, 128.465, 1702]) },
            { maxM: 1690, line: line([38.173, 128.494, 218.4], [38.12, 128.46, 1690]) },
        ])).toEqual({ lat: 38.173, lng: 128.494, m: 218 });
        // 높이가 전부 0 인 선 · 중간에 빈 점(0)이 섞인 선 — 들머리가 0m 가 되어 정상을 10℃ 넘게 낮추는 사고를 막는다(운영의 객산: 292m 산의 높이 차가 292m 로 나왔다)
        expect(trailheadPoint(1708, [{ maxM: 0, line: line([1, 1, 0], [2, 2, 0]) }, { maxM: 1702, line: line([3, 3, 0], [4, 4, 468], [5, 5, 1702]) }])).toEqual({ lat: 4, lng: 4, m: 468 });
        expect(trailheadPoint(292, [{ maxM: 285, line: line([1, 1, 0], [2, 2, 0]) }])).toBeNull();
        // 정상에 닿지 않는 조각(가장 높은 곳이 정상 높이의 절반 아래)
        expect(trailheadPoint(1708, [{ maxM: 600, line: line([1, 1, 200], [2, 2, 600]) }])).toBeNull();
        // 바닷가에서 시작하는 섬 산은 낮은 들머리가 맞다
        expect(trailheadPoint(395, [{ maxM: 390, line: line([33.2, 126.3, 4], [33.24, 126.31, 390]) }])).toEqual({ lat: 33.2, lng: 126.3, m: 4 });
        expect(trailheadPoint(null, [{ maxM: 390, line: line([1, 1, 4]) }])).toBeNull();
        expect(trailheadPoint(1000, [])).toBeNull();
    });
    it("산 아래의 예보는 들머리 자리의 격자에서 받는다 — 정상 좌표의 격자는 이미 그 높이만큼 낮아 두 번 낮추게 된다(설악산 실측: 5~6℃)", () => {
        const route = read("server/routes/modules/hiking.ts");
        expect(route).toContain("const base = await trailheadOf(m.slug, m.heightM);");
        expect(route).toContain("const at = base ?? (m.lat != null && m.lng != null ? { lat: m.lat, lng: m.lng } : null);");
        expect(route).toContain("const summit: SummitBase | null = weather && base && m.heightM != null ? { heightM: m.heightM, baseM: base.m } : null;");
        expect(route).toContain("const v = d ? trailheadPoint(heightM, d.courseList) : null;");
        // 들머리를 모르는 산에는 정상 칸이 없다(화면은 응답의 summit 만 본다 — 높이를 다시 세지 않는다)
        const parts = read("client/src/hiking/components/MountainParts.tsx");
        expect(parts).toContain("{data.summit && <SummitWeather hours={data.hours ?? []} heightM={data.summit.heightM} baseM={data.summit.baseM} />}");
    });
    it("체감 — 기상청 겨울 식, 10℃ 이하 · 바람 1.3m/s 이상에서만", () => {
        expect(windChillC(0, 5)).toBe(-5);
        expect(windChillC(-10, 10)).toBe(-20);
        expect(windChillC(12, 8)).toBeNull();
        expect(windChillC(0, 1)).toBeNull();
        expect(windChillC(0, null)).toBeNull();
    });
    it("세 시각 — 새벽 6시 · 낮 12시 · 오후 3시. 지난 시각은 비우고, 한 시각도 없는 날은 뺀다", () => {
        expect([...SUMMIT_HOURS]).toEqual([6, 12, 15]);
        const hours = [H("2026101312", 14, 4), H("2026101315", 15, 6), H("2026101406", 5, 2), H("2026101412", 13, 3, "rain"), H("2026101415", null)];
        const wx = summitWx(hours, { heightM: 1708, baseM: 468, nowMs: NOW })!;
        expect(wx).toMatchObject({ heightM: 1708, baseM: 468, riseM: 1240, dropC: 7.4 });
        expect(wx.days.map((d) => `${d.label} ${d.date}`)).toEqual(["오늘 2026-10-13", "내일 2026-10-14"]);
        // 오늘: 6시는 지났다 · 12시 14 − 7.4 = 6.6 → 7°, 체감은 그 기온과 바람 4m/s 로
        expect(wx.days[0].slots.map((s) => s.tmp)).toEqual([null, 7, 8]);
        expect(wx.days[0].slots[1]).toMatchObject({ hour: 12, label: "낮 12시", below: 14, wsd: 4, kind: "clear", feel: windChillC(6.6, 4) });
        // 내일: 새벽 5 − 7.4 = −2.4 → −2° · 낮은 비 · 오후 3시는 예보의 기온이 비어 있다
        expect(wx.days[1].slots.map((s) => s.tmp)).toEqual([-2, 6, null]);
        expect(wx.days[1].slots[1].kind).toBe("rain");
        // 처음 보일 날 — 시각이 둘 이상 남은 첫 날
        expect(summitFirstDay(wx.days)).toBe(0);
        const late = summitWx([H("2026101315", 15), H("2026101406", 5), H("2026101412", 13), H("2026101415", 14)], { heightM: 1708, baseM: 468, nowMs: NOW + 4 * 3_600_000 })!;
        expect(summitFirstDay(late.days)).toBe(1);
    });
    it("그리지 않는 때 — 높이를 모르거나 차가 작다 · 시간별 예보가 없다", () => {
        const hours = [H("2026101312", 14)];
        expect(summitWx(hours, { heightM: null, baseM: 100, nowMs: NOW })).toBeNull();
        expect(summitWx(hours, { heightM: 1000, baseM: null, nowMs: NOW })).toBeNull();
        expect(summitWx(hours, { heightM: 300, baseM: 200, nowMs: NOW })).toBeNull();
        expect(summitWx([], { heightM: 1708, baseM: 468, nowMs: NOW })).toBeNull();
    });
    it("문구 — 잰 값이 아니라 어림이라는 것과 셈을 그대로 적는다 · 궂은 날씨의 산행을 부추기지 않는다", () => {
        const note = SUMMIT_WX_COPY.note(1240, 7.4);
        expect(note).toBe("산 아래 예보에서 높이 차 1,240m만큼 낮춰 어림한 값이에요(100m에 0.6℃ — 약 7.4℃). 정상의 바람은 예보보다 셀 수 있어요.");
        expect(note).not.toMatch(/실측|관측|정확|도전|극한/);
    });
    it("화면 — 날씨 구역 안, 오늘 카드 바로 밑 · 글자 12px 이상 · 굵기는 semibold 까지", () => {
        const parts = read("client/src/hiking/components/MountainParts.tsx");
        expect(parts.indexOf("<SummitWeather hours")).toBeGreaterThan(parts.indexOf('data-testid="weather-today"'));
        expect(parts.indexOf("<SummitWeather hours")).toBeLessThan(parts.indexOf('data-testid="weather-days"'));
        const card = parts.slice(parts.indexOf("function SummitWeather("), parts.indexOf("/** 가입 안내"));
        expect(card).toContain("{SUMMIT_WX_COPY.note(wx.riseM, wx.dropC)}");
        for (const m of card.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)) expect(Number(m[1]), m[0]).toBeGreaterThanOrEqual(12);
        expect(card).not.toMatch(/font-(bold|extrabold|black)/);
        expect(read("client/src/hiking/pages/MountainPage.tsx")).toContain("<MountainWeather key={`wx:${d.slug}`} slug={d.slug} />");
    });
});
