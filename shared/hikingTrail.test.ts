import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { withKm, type LinePoint } from "./hikingGeo";
import { TRAIL_FAR_M, aheadText, cleanTrip, climbBetween, emptyTally, projectOnLine, tallyStep, trailState, type TrailPoi } from "./hikingTrail";

// 북쪽으로 곧게 2km 오르는 길 — 500m 마다 한 점, 높이 200 → 600 → 500
const LINE: LinePoint[] = withKm([[37.0, 127.0, 200], [37.0045, 127.0, 300], [37.009, 127.0, 450], [37.0135, 127.0, 600], [37.018, 127.0, 500]]);
const TOTAL = LINE[LINE.length - 1][3];
const POIS: TrailPoi[] = [
    { id: "a", kind: "SIGN", name: "갈림길", km: 0.4 },
    { id: "b", kind: "DANGER", name: "낙석", km: 1.1 },
    { id: "c", kind: "SHELTER", name: "대피소", km: 1.45 },
    { id: "g", kind: "GRID", name: "국가지점번호", km: 0.7 },
];
const SUMMIT_KM = LINE[3][3];
const SUMMIT = { lat: LINE[3][0], lng: LINE[3][1] };

describe("길 위의 자리", () => {
    it("점이 아니라 선분 위에 내린다 — 두 점 사이에서도 거리가 매끈하다", () => {
        const p = projectOnLine(LINE, 37.00225, 127.0002)!;
        expect(p.km).toBeGreaterThan(0.2);
        expect(p.km).toBeLessThan(0.3);
        expect(p.offM).toBeLessThan(25);
        expect(p.ele).toBeGreaterThan(240);
        expect(p.ele).toBeLessThan(260);
    });
    it("선 밖으로 멀어지면 떨어진 거리가 난다", () => {
        expect(projectOnLine(LINE, 37.005, 127.005)!.offM).toBeGreaterThan(400);
        expect(projectOnLine([], 37, 127)).toBeNull();
    });
    it("겹쳐 지나는 길 — 앞 자리와 이어지는 쪽을 고른다", () => {
        // 올라갔다 같은 길로 내려오는 선
        const back: LinePoint[] = withKm([[37.0, 127.0, 200], [37.009, 127.0, 450], [37.0, 127.0001, 200]]);
        const up = projectOnLine(back, 37.0045, 127.00005, 0.4)!;
        const down = projectOnLine(back, 37.0045, 127.00005, 1.6)!;
        expect(up.km).toBeLessThan(1);
        expect(down.km).toBeGreaterThan(1);
    });
    it("오르막 — 가는 방향으로 오르는 만큼", () => {
        expect(climbBetween(LINE, 0, SUMMIT_KM)).toBe(400);
        expect(climbBetween(LINE, SUMMIT_KM, TOTAL)).toBe(0);
        // 끝에서 정상 쪽으로 거꾸로 오르면 100m
        expect(climbBetween(LINE, TOTAL, SUMMIT_KM)).toBe(100);
        expect(climbBetween(LINE, 0.5, 0.5)).toBe(0);
    });
});

describe("길 띠의 상태", () => {
    const at = (lat: number, prev?: { km: number; dir: 1 | -1 } | null, accuracy = 10) => trailState({ line: LINE, pois: POIS, summitKm: SUMMIT_KM, summit: SUMMIT, fix: { lat, lng: 127.0, accuracy }, prev })!;
    it("앞에 있는 지점을 가까운 순으로 — 지나온 것은 빼고, 남은 거리와 오르막을 같이", () => {
        const s = at(37.0027);
        expect(s.dir).toBe(1);
        expect(s.next.map((n) => n.poi.id)).toEqual(["a", "g", "b"]);
        expect(s.next[0].aheadM).toBeGreaterThan(50);
        expect(s.next[0].aheadM).toBeLessThan(150);
        expect(s.next[0].climbM).toBeGreaterThan(0);
    });
    it("종류를 고르면 그것만", () => {
        const s = trailState({ line: LINE, pois: POIS, summitKm: SUMMIT_KM, fix: { lat: 37.0027, lng: 127.0 }, kinds: ["SIGN", "DANGER", "SHELTER"] })!;
        expect(s.next.map((n) => n.poi.id)).toEqual(["a", "b", "c"]);
    });
    it("정상까지 — 가는 방향에 정상이 있을 때만", () => {
        const s = at(37.0045);
        expect(s.toSummitM).toBeGreaterThan(950);
        expect(s.toSummitM).toBeLessThan(1050);
        expect(s.climbToSummitM).toBe(300);
        expect(s.minutesToSummit).toBeGreaterThan(20);
        // 정상을 지나 계속 가면 정상은 뒤다
        const past = at(37.016, { km: 1.6, dir: 1 });
        expect(past.toSummitM).toBeNull();
    });
    it("방향 — 충분히 움직였을 때만 바뀐다(제자리의 흔들림은 무시)", () => {
        const a = at(37.009);
        const wobble = at(37.0089, { km: a.km, dir: 1 });
        expect(wobble.dir).toBe(1);
        const down = at(37.006, { km: a.km, dir: 1 });
        expect(down.dir).toBe(-1);
        // 내려가는 길에서는 아래쪽 지점이 앞이 된다(방금 지나친 위쪽 지점은 뒤다)
        expect(down.next[0].poi.id).toBe("a");
        expect(down.leftM).toBeGreaterThan(600);
    });
    it("정상 가까이면 정상 인증을 권한다", () => {
        expect(at(37.0133).nearSummit).toBe(true);
        expect(at(37.009).nearSummit).toBe(false);
    });
    it("이 코스에서 멀면 알린다 — 미터 단위의 '이탈'은 말하지 않는다", () => {
        const s = trailState({ line: LINE, pois: POIS, summitKm: SUMMIT_KM, fix: { lat: 37.005, lng: 127.006, accuracy: 10 } })!;
        expect(s.offM).toBeGreaterThan(TRAIL_FAR_M);
        expect(s.far).toBe(true);
        expect(at(37.005).far).toBe(false);
    });
    it("위치가 흐리면 자리를 옮기지 않는다", () => {
        const s = at(37.015, { km: 0.5, dir: 1 }, 400);
        expect(s.coarse).toBe(true);
        expect(s.km).toBe(0.5);
        expect(s.far).toBe(false);
        expect(s.nearSummit).toBe(false);
    });
    it("선이 없으면 상태도 없다", () => {
        expect(trailState({ line: [], pois: [], summitKm: null, fix: { lat: 37, lng: 127 } })).toBeNull();
    });
    it("거리의 글", () => {
        expect(aheadText(4)).toBe("10m");
        expect(aheadText(318)).toBe("320m");
        expect(aheadText(1240)).toBe("1.2km");
    });
});

describe("산행 요약 — 좌표 없이", () => {
    it("걸은 거리와 오른 높이를 쌓는다 — 튄 위치 · 흐린 위치 · 코스 밖은 세지 않는다", () => {
        let t = emptyTally();
        const step = (km: number, ele: number, o: { far?: boolean; coarse?: boolean } = {}) => { t = tallyStep(t, { km, ele, far: !!o.far, coarse: !!o.coarse }); };
        step(0, 200); step(0.2, 240); step(0.4, 280);
        expect(t.walkedKm).toBeCloseTo(0.4);
        expect(t.gainM).toBe(80);
        step(1.5, 500); // 한 번에 1km 넘게 — 튄 것
        expect(t.walkedKm).toBeCloseTo(0.4);
        step(1.6, 520, { coarse: true }); // 흐린 위치 — 건너뛴다
        step(1.6, 501); // 1m — 잔물결(높이로 세지 않는다)
        expect(t.gainM).toBe(80);
        step(1.7, 540);
        expect(t.walkedKm).toBeCloseTo(0.6);
        expect(t.gainM).toBe(120);
        step(1.5, 500); // 내려가는 길 — 거리는 늘고 오른 높이는 그대로
        expect(t.walkedKm).toBeCloseTo(0.8);
        expect(t.gainM).toBe(120);
    });
    it("남길 만한 산행만 — 너무 짧은 것 · 말이 안 되는 빠르기는 버린다", () => {
        const base = { mountainId: "Q1", courseId: "c-1", startedAt: 0, endedAt: 3 * 3_600_000, km: 7.13, gainM: 1370.4, reachedSummit: true };
        expect(cleanTrip(base)).toEqual({ ...base, gainM: 1370 });
        expect(cleanTrip({ ...base, endedAt: 2 * 60_000 })).toBeNull();
        expect(cleanTrip({ ...base, km: 60 })).toBeNull();
        expect(cleanTrip({ ...base, endedAt: 30 * 3_600_000 })).toBeNull();
        expect(cleanTrip({ ...base, mountainId: "" })).toBeNull();
        expect(cleanTrip({ ...base, km: -3, gainM: -10 })).toMatchObject({ km: 0, gainM: 0 });
        expect(JSON.stringify(cleanTrip(base))).not.toMatch(/lat|lng/);
    });
});

describe("걸은 길 · 좌표는 저장하지 않는다", () => {
    const read = (f: string) => readFileSync(resolve(__dirname, "..", f), "utf8");
    const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*(\/\/|--).*$/gm, "");
    it("산행 표에 위치 칸이 없다", () => {
        const sql = code(read("migrations/hiking_trips.sql"));
        expect(sql).toContain("create table if not exists hiking_trips");
        expect(sql).not.toMatch(/\blat\b|\blng\b|\blon\b|latitude|longitude|\bline\b|\btrack\b|geom|point/i);
    });
    it("산행을 남기는 길은 본문의 좌표를 읽지 않는다", () => {
        const route = code(read("server/routes/modules/hiking.ts"));
        const trips = route.slice(route.indexOf('router.post("/trips"'), route.indexOf("export default router"));
        expect(trips).toContain("cleanTrip(");
        expect(trips).not.toMatch(/\.lat\b|\.lng\b|accuracy/);
        expect(code(read("server/storage/hikingTrips.ts"))).not.toMatch(/\blat\b|\blng\b/);
    });
    it("기기에 적어 두는 것(이어 걷기)에도 좌표가 없다", () => {
        const hook = code(read("client/src/hiking/trail/useTrail.ts"));
        expect(hook).toContain("keepTrail(keepId, { tally: tally.current, prev: prev.current, reached: reached.current })");
        // 서버로 가는 요청이 없다 — 위치는 이 훅 안에서만 쓴다
        expect(hook).not.toMatch(/apiRequest|fetch\(/);
    });
    it("산행 중 화면은 설치 안내와 하단 탭이 덮지 않는다", () => {
        expect(read("shared/installPrompt.ts")).toContain('"/hiking/trail"');
        expect(read("client/src/hiking/pages/TrailPage.tsx")).toContain("nav={!active}");
    });
});
