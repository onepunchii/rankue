/**
 * 물때 지점(2026-11-04 — 낚시 2번 '물때 화면 키우기'). 조석예보 지점(SO_)의 이레 만조 · 간조 화면.
 */
import { describe, expect, it } from "vitest";
import { cosineTide, fishingTidePath, nearTidePoints, nearestTidePoint, tidePointSeo, turnsFromApi } from "./fishingTidePoints";
import { buildPoints } from "../server/scripts/fishing-tide-points";
import { FISHING_PORTS } from "./fishingStations";

describe("조석예보 한 줄 → 그날의 만조 · 간조", () => {
    it("extrSe 1 · 3 = 만조, 2 · 4 = 간조, 그날 것만, 이른 순, 꼴이 틀린 줄은 버린다", () => {
        const t = turnsFromApi([
            { predcDt: "2026-11-04 06:50", predcTdlvVl: 261.0, extrSe: "2" },
            { predcDt: "2026-11-04 00:14", predcTdlvVl: 700.0, extrSe: "1" },
            { predcDt: "2026-11-05 00:52", predcTdlvVl: 690, extrSe: "1" },
            { predcDt: "nope", predcTdlvVl: 1, extrSe: "1" },
            { predcDt: "2026-11-04 12:00", predcTdlvVl: "x", extrSe: "1" },
            { predcDt: "2026-11-04 13:01", predcTdlvVl: 690, extrSe: "3" },
            { predcDt: "2026-11-04 19:30", predcTdlvVl: 230, extrSe: "4" },
            { predcDt: "2026-11-04 20:00", predcTdlvVl: 230, extrSe: "5" },
        ], "2026-11-04");
        expect(t).toEqual([{ min: 14, cm: 700, kind: "high" }, { min: 410, cm: 261, kind: "low" }, { min: 781, cm: 690, kind: "high" }, { min: 1170, cm: 230, kind: "low" }]);
    });
});

describe("어림 곡선 — 만조 · 간조를 지나고, 그 사이는 단조롭게", () => {
    it("꺾임 시각에 그 높이, 0시 · 24시까지 열 분 간격", () => {
        const turns = [{ min: 120, cm: 600, kind: "high" as const }, { min: 480, cm: 100, kind: "low" as const }, { min: 860, cm: 620, kind: "high" as const }];
        const pts = cosineTide(turns, { min: 1200, cm: 120, kind: "low" }, { min: 200, cm: 90, kind: "low" });
        expect(pts[0].min).toBe(0);
        expect(pts.at(-1)!.min).toBe(1440);
        expect(pts.find((p) => p.min === 120)!.cm).toBe(600);
        expect(pts.find((p) => p.min === 480)!.cm).toBe(100);
        const mid = pts.filter((p) => p.min > 120 && p.min < 480).map((p) => p.cm);
        expect(mid.every((v, i) => i === 0 || v <= mid[i - 1])).toBe(true);
        expect(cosineTide([])).toEqual([]);
        // 앞날을 모르면 0시 쪽도 평평하지 않다(반 주기 앞에 반대 꺾임)
        const first = cosineTide([{ min: 326, cm: 205, kind: "high" }, { min: 671, cm: 87, kind: "low" }]);
        expect(first[0].cm).toBeLessThan(205);
        expect(first.find((p) => p.min === 320)!.cm).toBeGreaterThan(first[0].cm);
    });
});

describe("가까운 지점 · 제목", () => {
    const pts = [{ code: "SO_1", name: "미조항", lat: 34.706, lng: 128.049 }, { code: "SO_2", name: "상주", lat: 34.72, lng: 127.99 }, { code: "SO_3", name: "멀리", lat: 37.5, lng: 129.1 }];
    it("가장 가까운 지점은 30km 안에서만, 이웃은 자기 자신을 빼고 가까운 순", () => {
        expect(nearestTidePoint(pts, { lat: 34.71, lng: 128.04 })?.name).toBe("미조항");
        expect(nearestTidePoint(pts, { lat: 36.0, lng: 126.0 })).toBeNull();
        expect(nearTidePoints(pts, { code: "SO_1", lat: 34.706, lng: 128.049 }).map((x) => x.name)).toEqual(["상주"]);
    });
    it("제목은 사실만 — 지점 이름 · 이레 · 바다, 가까운 항구는 설명에", () => {
        const seo = tidePointSeo({ name: "미조항", port: { code: "DT_0014", name: "통영", km: 30 } }, "남해동부");
        expect(seo.title).toBe("미조항 물때표 — 오늘 만조 · 간조 시각 · 이레 물때 · 남해동부 | 랭큐 낚시");
        expect(seo.description).toContain("가까운 통영 항구");
        expect(seo.title).not.toMatch(/추천|최고|꿀팁|명당/);
        expect(fishingTidePath("미조항")).toBe("/fishing/tide/%EB%AF%B8%EC%A1%B0%ED%95%AD");
    });
});

describe("지점 목록 만들기(server/scripts/fishing-tide-points)", () => {
    it("항구와 같은 이름 · 옛 관측소 · 나라 밖은 빼고, 겹친 이름은 가까운 항구를 붙이고, 가까운 항구 · 바다를 적는다", () => {
        const port = FISHING_PORTS[0];
        const out = buildPoints([
            { code: "SO_0001", name: port.name, lat: port.lat, lng: port.lng },
            { code: "SO_0002", name: "포항_구", lat: 36.05, lng: 129.37 },
            { code: "SO_0003", name: "바깥", lat: 10, lng: 10 },
            { code: "SO_0004", name: "대진항", lat: 38.50, lng: 128.43 },
            { code: "SO_0005", name: "대진항", lat: 36.62, lng: 129.43 },
            { code: "SO_0006", name: "미조항", lat: 34.706, lng: 128.049 },
            { code: "SO_0006", name: "미조항", lat: 34.706, lng: 128.049 },
        ]);
        expect(out.map((p) => p.name).sort()).toEqual(["대진항(속초)", `대진항(${out.find((p) => p.code === "SO_0005")!.port.name})`, "미조항"].sort());
        const m = out.find((p) => p.name === "미조항")!;
        expect(FISHING_PORTS.some((p) => p.code === m.port.code && p.area === m.area)).toBe(true);
        expect(m.port.km).toBeGreaterThan(0);
    });
});
