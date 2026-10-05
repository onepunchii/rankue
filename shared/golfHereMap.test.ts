import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { mapX, mapY } from "./golfDotMap";
import { HERE_ASPECT, HERE_BOX, hereMapSvg, herePoint, hereTone } from "./golfHereMap";

/** 한반도 모양이 나올 만큼의 점 — 위경도 격자 */
const DOTS = (() => {
    const out: { lat: number; lng: number }[] = [];
    for (let lat = 34.6; lat <= 38; lat += 0.4) for (let lng = 126.6; lng <= 129.2; lng += 0.4) out.push({ lat, lng });
    return out;
})();

describe("'여기' 미니 지도 — 틀", () => {
    it("전국이 다 들어가는 세로 직사각형", () => {
        const [x, y, w, h] = HERE_BOX;
        expect(w / h).toBeCloseTo(HERE_ASPECT, 5);
        // 강원 북단(고성)·부산·제주 남단·인천 영종이 틀 안
        for (const [lat, lng] of [[38.38, 128.47], [35.1, 129.1], [33.25, 126.4], [37.45, 126.44]]) {
            expect(mapX(lng)).toBeGreaterThan(x); expect(mapX(lng)).toBeLessThan(x + w);
            expect(mapY(lat)).toBeGreaterThan(y); expect(mapY(lat)).toBeLessThan(y + h);
        }
    });

    it("좌표가 없거나 틀 밖이면 그리지 않는다", () => {
        expect(herePoint(37.29, 127.19)).toEqual({ x: mapX(127.19), y: mapY(37.29) }); // 용인
        expect(herePoint(33.31, 126.39)).not.toBeNull(); // 제주
        expect(herePoint(null, 127)).toBeNull();
        expect(herePoint(37, undefined)).toBeNull();
        expect(herePoint(Number.NaN, 127)).toBeNull();
        expect(herePoint(37.5, 130.87)).toBeNull(); // 울릉도 — 틀 밖
        expect(herePoint(0, 0)).toBeNull(); // 좌표가 0,0 으로 들어온 골프장
    });
});

describe("'여기' 미니 지도 — 켜진 점의 뜻(허브 지도와 같은 순서)", () => {
    it("긴급 > 조인 > 부킹 > 내 관심 > 그냥 여기", () => {
        expect(hereTone({ booking: 2, join: 1, urgent: 1 }, true)).toBe("urgent");
        expect(hereTone({ booking: 2, join: 1, urgent: 0 }, true)).toBe("join");
        expect(hereTone({ booking: 2, join: 0, urgent: 0 }, true)).toBe("booking");
        expect(hereTone({ booking: 0, join: 0, urgent: 0 }, true)).toBe("watch");
        expect(hereTone({ booking: 0, join: 0, urgent: 0 }, false)).toBeNull();
        expect(hereTone(null, false)).toBeNull();
    });
});

describe("'여기' 미니 지도 — 서버 카드용 그림", () => {
    it("점과 켜진 점만 — 선(윤곽선)은 한 줄도 없다", () => {
        const m = hereMapSvg(DOTS, { lat: 37.29, lng: 127.19 }, { width: 150, cols: 19, color: "#64DD17", bg: "#0A0A0A", mark: 7.5 })!;
        expect(m.width).toBe(150);
        expect(m.height).toBe(Math.round(150 / HERE_ASPECT));
        expect(m.svg).not.toMatch(/<path|<polygon|<polyline|<line/);
        expect((m.svg.match(/<circle/g) ?? []).length).toBeGreaterThan(20);
        // 켜진 점: 고리 + 점, 둘 다 그 색으로 그 자리에
        const at = `cx="${Math.round(mapX(127.19) * 100) / 100}" cy="${Math.round(mapY(37.29) * 100) / 100}"`;
        expect((m.svg.match(new RegExp(`${at}[^>]*fill="#64DD17"`, "g")) ?? []).length).toBe(2);
        expect(m.svg).toContain(`viewBox="${HERE_BOX.map((v) => Math.round(v * 100) / 100).join(" ")}"`);
    });

    it("자리를 모르거나 골프장 점이 없으면 지도를 빼라고 null", () => {
        expect(hereMapSvg(DOTS, { lat: null, lng: null }, { width: 150 })).toBeNull();
        expect(hereMapSvg(DOTS, { lat: 37.5, lng: 130.87 }, { width: 150 })).toBeNull();
        expect(hereMapSvg([], { lat: 37.29, lng: 127.19 }, { width: 150 })).toBeNull();
    });
});

describe("시도 윤곽선 자료는 화면에만 — 서버가 그려 밖으로 내보내는 그림에는 싣지 않는다", () => {
    const src = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");
    it("공용 셈·라운드 카드·og 라우트가 윤곽선 자료를 부르지 않는다", () => {
        for (const p of ["shared/golfHereMap.ts", "server/services/golfRoundCard.ts", "server/ogImage.ts", "server/services/golfFootprintsCard.ts"]) {
            expect(src(p), p).not.toMatch(/koreaMapData|koreaOutline|KOREA_MAP_PATHS|KoreaOutline/);
        }
    });
    it("라운드 카드의 지도는 shared 의 점 그림에서 온다", () => {
        expect(src("server/ogImage.ts")).toMatch(/hereMapSvg\(dots, w,/);
        expect(src("server/services/golfRoundCard.ts")).toContain("p.map.uri");
    });
});
