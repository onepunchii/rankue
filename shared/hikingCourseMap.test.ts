import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
    COURSE_MAP_ASPECT, COURSE_MAP_COPY, COURSE_MAP_DOT_KINDS, COURSE_MAP_LABEL_KINDS, COURSE_MAP_MIN_VIEW_KM, boxAround, clampKmBox, courseMapFrame, focusBox, hereOnMap, labelPx, lineBreaks,
    offViewNote, pickLabels, scaleBarKm, scaleBarText, summitRingsKm, toKmXY,
} from "./hikingCourseMap";
import { withKm, type LinePoint } from "./hikingGeo";

const read = (f: string) => readFileSync(resolve(__dirname, "..", f), "utf8");
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
/** 남북으로 4km 쯤 곧게 오르는 길(설악산 언저리) */
const ridge: LinePoint[] = withKm(Array.from({ length: 41 }, (_, i) => [38.08 + i * 0.0009, 128.445 + i * 0.0002, 400 + i * 30] as const));
/** 동쪽으로 8km 떨어진 다른 코스 */
const east: LinePoint[] = withKm(Array.from({ length: 21 }, (_, i) => [38.09 + i * 0.0005, 128.54 + i * 0.0006, 300 + i * 10] as const));
const summit = { lat: 38.1160, lng: 128.4530 };

describe("코스 지도의 틀 — km 단위 · 위가 북쪽", () => {
    it("북쪽이 위(y 가 작다) · 동쪽이 오른쪽 · 1도는 110km 남짓", () => {
        const f = courseMapFrame([ridge], null)!;
        const [x0, y0] = toKmXY(f, ridge[0][0], ridge[0][1]), [x1, y1] = toKmXY(f, ridge[40][0], ridge[40][1]);
        expect(y1).toBeLessThan(y0);
        expect(x1).toBeGreaterThan(x0);
        expect(Math.hypot(x1 - x0, y1 - y0)).toBeCloseTo(ridge[40][3], 1);
    });
    it("가장 넓은 그림은 코스 전부(와 가까운 정상)를 담고 그림 칸의 비에 맞는다", () => {
        const f = courseMapFrame([ridge, east], summit)!;
        expect(f.home.h / f.home.w).toBeCloseTo(COURSE_MAP_ASPECT, 5);
        for (const p of [...ridge, ...east]) { const [x, y] = toKmXY(f, p[0], p[1]); expect(x > f.home.x && x < f.home.x + f.home.w && y > f.home.y && y < f.home.y + f.home.h).toBe(true); }
        const [sx, sy] = toKmXY(f, summit.lat, summit.lng);
        expect(sx > f.home.x && sx < f.home.x + f.home.w && sy > f.home.y && sy < f.home.y + f.home.h).toBe(true);
        expect(courseMapFrame([], summit)).toBeNull();
        expect(courseMapFrame([[ridge[0]]], null)).toBeNull();
    });
    it("정상이 코스에서 너무 멀면 처음 그림에 넣지 않는다(길이 콩알만 해진다)", () => {
        const near = courseMapFrame([ridge], summit)!, far = courseMapFrame([ridge], { lat: 38.5, lng: 128.9 })!;
        const none = courseMapFrame([ridge], null)!;
        expect(far.home.w).toBeCloseTo(none.home.w, 6);
        expect(near.home.w).toBeGreaterThanOrEqual(none.home.w);
    });
    it("처음 보이는 그림은 고른 코스에 맞춘다 — 산 전체보다 좁고, 그 코스를 다 담는다", () => {
        const f = courseMapFrame([ridge, east], summit)!;
        const b = focusBox(f, ridge, summit);
        expect(b.w).toBeLessThan(f.home.w * 0.8);
        expect(b.h / b.w).toBeCloseTo(f.home.h / f.home.w, 5);
        for (const p of ridge) { const [x, y] = toKmXY(f, p[0], p[1]); expect(x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h).toBe(true); }
        // 가장 넓은 그림 밖으로 나가지 않는다
        expect(b.x).toBeGreaterThanOrEqual(f.home.x - 1e-9);
        expect(b.x + b.w).toBeLessThanOrEqual(f.home.x + f.home.w + 1e-9);
        expect(focusBox(f, [], summit)).toEqual(f.home);
    });
    it("상자 가두기 — 가장 넓은 그림보다 커지지 않고, 밖으로 나가지 않고, 가장 좁은 너비 아래로 줄지 않는다", () => {
        const home = { x: -5, y: -5.4, w: 10, h: 10.8 };
        expect(clampKmBox({ x: -100, y: -100, w: 50, h: 54 }, home)).toEqual(home);
        const tiny = clampKmBox({ x: 0, y: 0, w: 0.01, h: 0.01 }, home);
        expect(tiny.w).toBe(COURSE_MAP_MIN_VIEW_KM);
        expect(tiny.h / tiny.w).toBeCloseTo(1.08, 5);
        const edge = clampKmBox({ x: 4.5, y: 5, w: 2, h: 2.16 }, home);
        expect(edge.x + edge.w).toBeCloseTo(5, 6);
        expect(edge.y + edge.h).toBeCloseTo(5.4, 6);
    });
});

describe("축척 · 고리 · 끊긴 선", () => {
    it("축척 막대는 보이는 너비의 3분의 1을 넘지 않는 깔끔한 수", () => {
        expect([30, 11, 5, 3.3, 1.2, 0.5, 0.31].map(scaleBarKm)).toEqual([10, 2, 1, 1, 0.2, 0.1, 0.1]);
        expect([10, 1, 0.5, 0.2, 0.05].map(scaleBarText)).toEqual(["10km", "1km", "500m", "200m", "50m"]);
        for (const w of [0.3, 1, 4, 12, 28]) expect(scaleBarKm(w)).toBeLessThanOrEqual(w / 3 + 1e-9);
    });
    it("정상에서의 거리 고리는 셋 — 같은 간격", () => {
        const r = summitRingsKm(5);
        expect(r).toHaveLength(3);
        expect(r[1]).toBeCloseTo(r[0] * 2, 9);
        expect(r[2]).toBeCloseTo(r[0] * 3, 9);
    });
    it("직선으로 건너뛴 자리에서 선을 끊는다(옛 묶음의 이어 붙인 구간) — 고른 길은 끊지 않는다", () => {
        expect(lineBreaks(ridge)).toEqual([]);
        const jumped = withKm([...ridge.slice(0, 20).map((p) => [p[0], p[1], p[2]] as const), ...east.slice(0, 10).map((p) => [p[0], p[1], p[2]] as const)]);
        expect(lineBreaks(jumped)).toEqual([20]);
        expect(lineBreaks(ridge.slice(0, 2))).toEqual([]);
    });
});

describe("내 위치 — 지도 안이면 점, 밖이면 한 줄", () => {
    const f = courseMapFrame([ridge], summit)!;
    it("지도 안 — 점의 자리", () => {
        const me = hereOnMap(f, { lat: ridge[20][0], lng: ridge[20][1] })!;
        expect(me.inside).toBe(true);
        expect(me.note).toBeNull();
    });
    it("지도 밖 — 방향과 거리만(좌표는 적지 않는다)", () => {
        const me = hereOnMap(f, { lat: 37.5665, lng: 126.978 })!;
        expect(me.inside).toBe(false);
        expect(me.note).toMatch(/^내 위치는 지도 밖 · (남서|서)쪽 \d+km$/);
        expect(me.note).not.toMatch(/\d+\.\d{3,}/);
    });
    it("넓은 그림 안이지만 지금 보는 그림 밖 — 보는 그림의 가운데에서 본 방향 · 거리와 가는 법", () => {
        expect(offViewNote(1.6, -1.6)).toBe("내 위치는 지금 보는 그림 밖 · 북동쪽 2.3km — '내 위치'를 누르면 그리로 가요");
        expect(offViewNote(0, 3)).toMatch(/· 남쪽 3\.0km —/);
        expect(offViewNote(-0.4, 0)).toMatch(/· 서쪽 /);
    });
    it("자리가 없으면 아무것도 없다", () => {
        expect(hereOnMap(f, null)).toBeNull();
        expect(hereOnMap(f, { lat: NaN, lng: 1 })).toBeNull();
    });
    it("내 위치로 당겨 들어가도 가장 넓은 그림 안이다", () => {
        const me = hereOnMap(f, { lat: ridge[0][0], lng: ridge[0][1] })!;
        const b = boxAround(f, me.x, me.y);
        expect(b.w).toBeLessThanOrEqual(1.2 + 1e-9);
        expect(b.x).toBeGreaterThanOrEqual(f.home.x - 1e-9);
        expect(b.y + b.h).toBeLessThanOrEqual(f.home.y + f.home.h + 1e-9);
    });
});

describe("이름표 — 겹치면 앞의 것이 남는다", () => {
    it("글의 너비 어림 — 한글은 글자 크기만큼, 숫자 · 영문은 그보다 좁게", () => {
        expect(labelPx("화장실", 12)).toBe(36);
        expect(labelPx("1km", 12)).toBeCloseTo(12 * 0.58 * 3, 6);
        expect(labelPx("정상에서 1km", 12)).toBeGreaterThan(labelPx("정상에서", 12));
    });
    it("겹치는 뒤의 것은 빠지고, keep 은 겹쳐도 남고, 미리 막아 둔 자리(단추)는 피한다", () => {
        const spots = [{ x: 100, y: 100, w: 40 }, { x: 110, y: 104, w: 40 }, { x: 110, y: 130, w: 40 }, { x: 105, y: 101, w: 20, keep: true }];
        expect(pickLabels(spots)).toEqual([0, 2, 3]);
        expect(pickLabels([{ x: 10, y: 10, w: 60 }, { x: 200, y: 200, w: 30 }], [{ x0: 0, y0: 0, x1: 176, y1: 46 }])).toEqual([1]);
        expect(pickLabels(Array.from({ length: 40 }, (_, i) => ({ x: 0, y: i * 30, w: 20 })), [], 16, 5)).toHaveLength(5);
    });
    it("이름표를 다는 종류는 걷는 사람이 지도에서 찾는 것 — 갈림길은 점만", () => {
        expect(COURSE_MAP_LABEL_KINDS).toEqual(["ENTRY", "PARK", "BUS", "TOILET", "WATER", "SHELTER", "VIEW", "PEAK", "DANGER"]);
        expect(COURSE_MAP_DOT_KINDS).toContain("SIGN");
        expect(COURSE_MAP_LABEL_KINDS).not.toContain("SIGN");
    });
});

describe("고정: 바깥 지도를 쓰지 않는다 · 내 위치는 기기 밖으로 나가지 않는다(소스)", () => {
    const map = read("client/src/hiking/components/CourseMap.tsx"), zoom = read("client/src/hiking/lib/useBoxZoom.ts"), trail = read("client/src/hiking/trail/useTrail.ts");
    it("지도 회사의 스크립트 · 조각 그림을 부르지 않는다 — 그림은 우리 종이 한 장뿐", () => {
        for (const src of [map, zoom, read("shared/hikingCourseMap.ts")]) expect(code(src)).not.toMatch(/dapi\.kakao|kakao\.maps|naver\.maps|openapi\.map|googleapis|tile\.openstreetmap|mapbox|leaflet|https?:\/\//i);
        expect(map).toContain("url(/hiking/art/map-paper.webp)");
    });
    it("지도는 위치를 받지도 보내지도 않는다 — 받은 자리를 그리기만 한다", () => {
        expect(code(map)).not.toMatch(/apiRequest|fetch\(|getDevicePosition|navigator\.geolocation|localStorage|sessionStorage/);
        expect(code(zoom)).not.toMatch(/apiRequest|fetch\(|localStorage/);
        // 산행 중의 자리는 화면의 메모리에만 — 기기에 적는 것(keepTrail)에 좌표가 없다
        expect(trail).toContain("setHere({ lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy });");
        expect(trail).toContain("keepTrail(keepId, { tally: tally.current, prev: prev.current, reached: reached.current });");
        expect(trail).toContain('if (!active) { setPhase("idle"); setHere(null); return; }');
        expect(COURSE_MAP_COPY.hereNote).toBe("내 위치는 이 기기에서만 찍어요.");
    });
    it("처음 그림은 고른 코스 · 한 손가락 끌기는 키운 뒤에만 · 산행 중에는 선을 눌러 코스를 바꾸지 않는다", () => {
        expect(map).toContain("const z = useBoxZoom(home, start, COURSE_MAP_MIN_VIEW_KM);");
        expect(zoom).toContain("} else if (s.view.w < startRef.current.w * 0.98) {");
        expect(zoom).toContain('touchAction: zoomed ? "none" as const : "pan-y" as const,');
        expect(read("client/src/hiking/pages/TrailPage.tsx")).toContain("onPick={active ? undefined : (k) => setCourseId(d.courseList[k]?.id ?? null)}");
        expect(read("client/src/hiking/pages/TrailPage.tsx")).toContain("here={active ? trail.here : null} live={active}");
        expect(read("client/src/hiking/pages/MountainPage.tsx")).toContain("here={loc.here} ask={loc.ask} asking={loc.asking}");
    });
});
