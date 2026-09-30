import { describe, expect, it } from "vitest";
import { mapX, mapY } from "./golfDotMap";
import {
    buildTrail, fitFootprintBox, kstYear, labelsClear, parseFootprintYear, placeFootprints, placedStops, spreadBadges, trailKm, mixHex,
    REGION_LABELS,
} from "./golfFootprints";

// 오너 실제 도장 3곳(2026-09-30 기준) — 충남 → 경기 → 강원
const OWNER = [
    { lat: 36.8462, lng: 126.9187 },
    { lat: 37.1881, lng: 127.4029 },
    { lat: 37.2149, lng: 128.5118 },
];

describe("kstYear", () => {
    it("한국 시각으로 해를 가른다 — 1월 1일 새벽(UTC 전날)은 새해", () => {
        expect(kstYear("2025-12-31T15:30:00Z")).toBe(2026);
        expect(kstYear("2025-12-31T14:59:59Z")).toBe(2025);
    });
});

describe("parseFootprintYear", () => {
    it("네 자리 연도만 받는다", () => {
        expect(parseFootprintYear("2026")).toBe(2026);
        expect(parseFootprintYear("all")).toBeNull();
        expect(parseFootprintYear("26")).toBeNull();
        expect(parseFootprintYear("1999")).toBeNull();
        expect(parseFootprintYear(undefined)).toBeNull();
        expect(parseFootprintYear(["2026"])).toBeNull();
    });
});

describe("fitFootprintBox", () => {
    const aspect = 0.8;
    it("비율을 지키고 모든 도장을 안에 담는다", () => {
        const [x, y, w, h] = fitFootprintBox(OWNER, aspect);
        expect(w / h).toBeCloseTo(aspect, 5);
        for (const p of OWNER) {
            expect(mapX(p.lng)).toBeGreaterThan(x);
            expect(mapX(p.lng)).toBeLessThan(x + w);
            expect(mapY(p.lat)).toBeGreaterThan(y);
            expect(mapY(p.lat)).toBeLessThan(y + h);
        }
    });
    it("한 곳뿐이어도 전국 틀의 최소 비율보다 작아지지 않는다", () => {
        const korea = fitFootprintBox([], aspect);
        const one = fitFootprintBox([OWNER[0]], aspect);
        expect(one[2]).toBeGreaterThanOrEqual(korea[2] * 0.45 - 1e-6);
    });
    it("제주·강원 끝의 도장을 이상치로 빼지 않는다(모두 화면 안)", () => {
        const pts = [...OWNER, { lat: 37.3, lng: 127.2 }, { lat: 37.4, lng: 127.1 }, { lat: 33.3, lng: 126.4 }];
        const [x, y, w, h] = fitFootprintBox(pts, aspect);
        const jeju = pts[pts.length - 1];
        expect(mapY(jeju.lat)).toBeLessThan(y + h);
        expect(mapX(jeju.lng)).toBeGreaterThan(x);
        expect(w).toBeGreaterThan(0);
    });
});

describe("trail · footprints", () => {
    const pts = OWNER.map((p) => ({ x: mapX(p.lng), y: mapY(p.lat) }));
    const trail = buildTrail(pts);

    it("길은 도장을 지난다(시작·끝이 첫·마지막 도장)", () => {
        expect(trail.samples[0].x).toBeCloseTo(pts[0].x, 6);
        expect(trail.samples.at(-1)!.x).toBeCloseTo(pts[2].x, 6);
        expect(trail.stopAt[0]).toBe(0);
        expect(trail.stopAt.at(-1)).toBeCloseTo(1, 6);
        expect(trail.stopAt[1]).toBeGreaterThan(0);
        expect(trail.stopAt[1]).toBeLessThan(1);
    });

    it("발자국은 좌우 번갈아, 순서대로, 도장 둘레는 비운다", () => {
        const clear = 8;
        const marks = placeFootprints(trail, pts, 5, 1.2, clear);
        expect(marks.length).toBeGreaterThan(5);
        for (let i = 1; i < marks.length; i++) {
            expect(marks[i].side).toBe(-marks[i - 1].side);
            expect(marks[i].t).toBeGreaterThan(marks[i - 1].t);
        }
        // 옆으로 비킨 거리(stride)만큼 여유를 두고 확인
        for (const m of marks) for (const p of pts) expect(Math.hypot(m.x - p.x, m.y - p.y)).toBeGreaterThan(clear - 1.2 - 1e-6);
    });

    it("도장이 하나면 길도 발자국도 없다", () => {
        const one = buildTrail([pts[0]]);
        expect(one.d).toBe("");
        expect(placeFootprints(one, [pts[0]], 5, 1, 5)).toEqual([]);
    });
});

describe("spreadBadges", () => {
    it("붙은 배지를 최소 간격 이상으로 떼고, 매번 같은 결과를 낸다", () => {
        const pts = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 0 }, { x: 40, y: 40 }];
        const a = spreadBadges(pts, 10);
        const b = spreadBadges(pts, 10);
        expect(a).toEqual(b);
        for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) {
            expect(Math.hypot(a[i].x - a[j].x, a[i].y - a[j].y)).toBeGreaterThanOrEqual(10 - 0.05);
        }
        // 떨어져 있던 배지는 그대로
        expect(a[3]).toEqual({ x: 40, y: 40 });
    });
});

describe("placedStops · trailKm · mixHex", () => {
    it("좌표 없는 도장은 지도에서 빠지되 번호는 원래 순서", () => {
        const s = placedStops([{ lat: 37, lng: 127 }, { lat: null, lng: null }, { lat: 36, lng: 128 }]);
        expect(s.map((x) => x.n)).toEqual([1, 3]);
    });
    it("서울 → 부산 직선 약 325km", () => {
        expect(trailKm([{ lat: 37.5665, lng: 126.978 }, { lat: 35.1796, lng: 129.0756 }])).toBeGreaterThan(315);
        expect(trailKm([{ lat: 37.5665, lng: 126.978 }, { lat: 35.1796, lng: 129.0756 }])).toBeLessThan(335);
        expect(trailKm([{ lat: 37, lng: 127 }])).toBe(0);
    });
    it("색 섞기 양 끝", () => {
        expect(mixHex("#8BE84A", "#FF8A3D", 0)).toBe("#8be84a");
        expect(mixHex("#8BE84A", "#FF8A3D", 1)).toBe("#ff8a3d");
    });
});

describe("labelsClear", () => {
    const box = fitFootprintBox([], 0.82); // 전국
    const at = (name: string) => { const l = REGION_LABELS.find((x) => x.name === name)!; return { x: mapX(l.lng), y: mapY(l.lat) }; };
    it("아무것도 없으면 틀 안의 이름이 다 남는다", () => {
        expect(labelsClear(box, [], 10).map((l) => l.name)).toEqual(expect.arrayContaining(["경기", "강원", "충청", "전라", "경상"]));
    });
    it("배지 곁·발자국(길) 곁의 이름은 뺀다", () => {
        const c = at("충청");
        expect(labelsClear(box, [{ x: c.x + 3, y: c.y }], 10).some((l) => l.name === "충청")).toBe(false);
        expect(labelsClear(box, [], 10, [{ x: c.x + 5, y: c.y + 4 }], 12, 8).some((l) => l.name === "충청")).toBe(false);
        expect(labelsClear(box, [], 10, [{ x: c.x + 40, y: c.y }], 12, 8).some((l) => l.name === "충청")).toBe(true);
    });
});
