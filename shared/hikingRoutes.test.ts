import { describe, expect, it } from "vitest";
import { distM } from "./hikingGeo";
import { buildRoutes, type RoutePoint } from "./hikingRoutes";

// 2026-10-13: 옛 묶음의 GPX 파일 하나는 코스가 아니라 등산로 그물(갈림길에서 끊은 조각 여럿)이다 — 한 줄로 이어 붙여 292m 객산의 코스가 29.6km 였다.
// 위도 0.001도 ≈ 111m. 점을 100m 쯤마다 놓는다.
const line = (from: [number, number, number], to: [number, number, number], n = 6): RoutePoint[] =>
    Array.from({ length: n + 1 }, (_, i) => [from[0] + ((to[0] - from[0]) * i) / n, from[1] + ((to[1] - from[1]) * i) / n, Math.round(from[2] + ((to[2] - from[2]) * i) / n)] as const);
const km = (r: readonly RoutePoint[]) => { let m = 0; for (let i = 1; i < r.length; i++) m += distM(r[i - 1][0], r[i - 1][1], r[i][0], r[i][1]); return Math.round(m / 10) / 100; };
const jumps = (r: readonly RoutePoint[]) => { let big = 0; for (let i = 1; i < r.length; i++) big = Math.max(big, distM(r[i - 1][0], r[i - 1][1], r[i][0], r[i][1])); return big; };

// 그물:  A(들머리, 100m) ── J(갈림길, 400m) ── S(정상, 800m)
//                              └── B(들머리, 150m)        C(멀리 떨어진 조각)
const A: [number, number, number] = [37.0, 127.0, 100], J: [number, number, number] = [37.01, 127.0, 400], S: [number, number, number] = [37.02, 127.0, 800];
const B: [number, number, number] = [37.01, 127.012, 150];
const SUMMIT = { lat: S[0], lng: S[1] };

describe("등산로 조각을 이어 코스를 만든다", () => {
    it("조각이 하나면 그대로", () => {
        const r = buildRoutes([line(A, S)], SUMMIT);
        expect(r.kind).toBe("single");
        expect(r.routes.length).toBe(1);
    });
    it("들머리마다 정상까지 가장 짧은 길 — 조각의 방향 · 순서가 뒤섞여 있어도 들머리에서 정상으로 이어지고, 건너뛴 자리가 없다", () => {
        // 파일 안의 순서: 정상 쪽 조각(거꾸로) · B 가지 · A 쪽 조각 — 그대로 이으면 S→J, B→J(건너뜀), A→J(건너뜀)
        const r = buildRoutes([line(S, J), line(B, J), line(A, J)], SUMMIT);
        expect(r.kind).toBe("summit");
        expect(r.routes.length).toBe(2);
        for (const route of r.routes) {
            // 정상에서 끝난다 · 오르는 길이다 · 조각 사이를 건너뛴 큰 걸음이 없다
            const end = route[route.length - 1];
            expect(distM(end[0], end[1], S[0], S[1])).toBeLessThan(1);
            expect(route[0][2]).toBeLessThan(end[2]);
            expect(jumps(route)).toBeLessThan(250);
        }
        // 짧은 길부터 — A 에서 2.22km, B 에서 2.17km 쯤(이어 붙인 한 줄은 5.5km 를 넘는다)
        expect(r.routes.map(km).every((k) => k > 2 && k < 2.4)).toBe(true);
        expect(km(r.routes[0])).toBeLessThanOrEqual(km(r.routes[1]));
    });
    it("끝점이 30m 안이면 같은 갈림길 · 더 멀면 이어지지 않는다", () => {
        const near: [number, number, number] = [J[0] + 0.0002, J[1], 400];      // 22m
        expect(buildRoutes([line(A, near), line(J, S)], SUMMIT).routes.map(km)).toEqual([expect.closeTo(2.2, 1)]);
        const far: [number, number, number] = [J[0] - 0.0006, J[1], 400];       // 67m 못 미침
        const r = buildRoutes([line(A, far), line(J, S)], SUMMIT);
        // 정상 쪽 조각만 정상에 닿는다 — A 쪽 조각은 떨어진 덩어리라 코스가 되지 않는다
        expect(r.kind).toBe("summit");
        expect(r.routes.map(km)).toEqual([expect.closeTo(1.11, 1)]);
    });
    it("정상이 조각의 가운데에 있으면 그 자리에서 나눈다 — 양쪽 들머리에서 오르는 길 둘", () => {
        const far: [number, number, number] = [37.04, 127.0, 200];
        const r = buildRoutes([line(A, far, 12), line(B, J)], { lat: 37.02, lng: 127.0 });
        expect(r.kind).toBe("summit");
        // A 쪽 2.2km · 건너편 2.2km (B 가지는 본길에 닿지 않는 떨어진 조각)
        expect(r.routes.length).toBe(2);
        for (const route of r.routes) expect(distM(route[route.length - 1][0], route[route.length - 1][1], 37.02, 127.0)).toBeLessThan(120);
    });
    it("거의 겹치는 길은 하나만 — 본길 옆의 짧은 가지에서 시작하는 길을 따로 세지 않는다", () => {
        const stub: [number, number, number] = [J[0], J[1] + 0.0025, 380];        // 갈림길에서 220m 떨어진 막다른 끝
        const r = buildRoutes([line(A, J), line(J, S), line(stub, J, 2)], SUMMIT);
        expect(r.routes.length).toBe(1);
        expect(km(r.routes[0])).toBeCloseTo(2.22, 1);
    });
    it("정상을 지나지 않는 그물 — 덩어리마다 끝에서 끝까지 가장 긴 길 하나, 낮은 쪽에서 시작", () => {
        const r = buildRoutes([line(J, A), line(J, B)], { lat: 38, lng: 128 });
        expect(r.kind).toBe("span");
        expect(r.routes.length).toBe(1);
        expect(r.routes[0][0][2]).toBeLessThanOrEqual(r.routes[0][r.routes[0].length - 1][2]);
        expect(jumps(r.routes[0])).toBeLessThan(250);
        expect(km(r.routes[0])).toBeGreaterThan(2);
        // 정상을 모를 때도 같다
        expect(buildRoutes([line(J, A), line(J, B)], null).kind).toBe("span");
    });
    it("한 파일에서 여덟 개까지 · 점이 하나뿐인 조각은 버린다", () => {
        const spokes = Array.from({ length: 12 }, (_, i) => line([37.02 + 0.01 * Math.cos(i), 127.0 + 0.012 * Math.sin(i), 100 + i], S));
        const r = buildRoutes([...spokes, [[37, 127, 0]] as RoutePoint[]], SUMMIT);
        expect(r.kind).toBe("summit");
        expect(r.routes.length).toBe(8);
    });
});
