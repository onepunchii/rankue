import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { TRAIL_END_RADIUS_M, TRAIL_PAIR_WINDOW_H, isLoopCourse, judgeTrailEnd, loopGapMin, trailHalfLine, trailHint, trailPairs, type TrailEnds } from "./trailStamps";

const read = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");
// 해파랑길 1코스의 두 끝(받은 자료 그대로)
const one: TrailEnds = { start: [35.0997, 129.1237], end: [35.159, 129.1603], loop: false, minutes: 390 };
const H = 3_600_000;

/** 코리아둘레길 코스 도장(2026-10-21) — 두 끝에서 위치 확인 */
describe("코스 도장 — 어느 끝에 왔나", () => {
    it("끝에서 200m 안이면 그 끝 · 가까운 끝을 고른다 · 좌표 대신 거리 구간", () => {
        expect(judgeTrailEnd(one, { lat: 35.0999, lng: 129.1239 })).toMatchObject({ at: "start", bucket: "<200m", reason: "ok" });
        expect(judgeTrailEnd(one, { lat: 35.1592, lng: 129.1601 })).toMatchObject({ at: "end", reason: "ok" });
        expect(judgeTrailEnd(one, { lat: 35.104, lng: 129.1237 })).toMatchObject({ at: null, bucket: "200m-1km", reason: "far" });
        expect(judgeTrailEnd(one, { lat: 35.13, lng: 129.14 })).toMatchObject({ at: null, reason: "far" });
        expect(TRAIL_END_RADIUS_M).toBe(200);
    });
    it("위치가 흐리거나 없으면 판단하지 않는다", () => {
        expect(judgeTrailEnd(one, { lat: 35.0997, lng: 129.1237, accuracy: 500 })).toMatchObject({ at: null, reason: "coarse" });
        expect(judgeTrailEnd(one, null)).toMatchObject({ at: null, reason: "no-fix" });
        expect(judgeTrailEnd(one, { lat: NaN, lng: 1 })).toMatchObject({ reason: "no-fix" });
        expect(trailHint({ reason: "coarse", bucket: "coarse" })).toContain("흐려요");
        expect(trailHint({ reason: "far", bucket: "200m-1km" })).toContain("가까워요");
    });
    it("순환 코스 — 두 끝이 300m 안이거나 순환이라 적힌 코스", () => {
        expect(isLoopCourse({ start: [35, 129], end: [35.001, 129.001], loop: false })).toBe(true);
        expect(isLoopCourse({ ...one, loop: false })).toBe(false);
        expect(judgeTrailEnd({ ...one, end: one.start, loop: true }, { lat: 35.0998, lng: 129.1238 }).at).toBe("start");
    });
});

describe("코스 도장 — 두 번의 확인이 짝을 이루면", () => {
    const t0 = Date.parse("2026-10-21T00:00:00Z");
    it("한 방향: 반대쪽 끝의 확인이 36시간 안에 있으면 도장 · 거꾸로 걸어도 된다", () => {
        expect(trailPairs(one, [{ end: "start", atMs: t0 }], { end: "end", atMs: t0 + 6 * H })).toEqual({ done: true, from: { end: "start", atMs: t0 } });
        expect(trailPairs(one, [{ end: "end", atMs: t0 }], { end: "start", atMs: t0 + 5 * H }).done).toBe(true);
    });
    it("같은 끝에서만 두 번 · 36시간이 지난 출발 확인은 짝이 아니다", () => {
        expect(trailPairs(one, [{ end: "start", atMs: t0 }], { end: "start", atMs: t0 + H }).done).toBe(false);
        expect(trailPairs(one, [{ end: "start", atMs: t0 }], { end: "end", atMs: t0 + (TRAIL_PAIR_WINDOW_H + 1) * H }).done).toBe(false);
        expect(trailPairs(one, [], { end: "end", atMs: t0 }).done).toBe(false);
    });
    it("순환: 같은 자리에서 코스 시간의 40%(30분 아래로는 안 내림)가 지난 뒤", () => {
        const loop = { ...one, end: one.start, loop: true, minutes: 240 };
        expect(loopGapMin(240)).toBe(96);
        expect(loopGapMin(30)).toBe(30);
        expect(trailPairs(loop, [{ end: "start", atMs: t0 }], { end: "start", atMs: t0 + 60 * 60_000 }).done).toBe(false);
        expect(trailPairs(loop, [{ end: "start", atMs: t0 }], { end: "start", atMs: t0 + 100 * 60_000 }).done).toBe(true);
    });
    it("출발 확인만 있을 때의 한 줄 — 반대쪽 끝의 이름과 남은 시간", () => {
        const line = trailHalfLine({ ...one, startName: "오륙도 해맞이공원", endName: "해운대" }, { end: "start", atMs: t0 }, t0 + 2 * H);
        expect(line).toContain("반대쪽 끝 해운대에서 34시간 안에");
        expect(trailHalfLine({ ...one, startName: null, endName: null }, { end: "end", atMs: t0 }, t0 + 35.5 * H)).toContain("코스 시작에서 30분 안에");
    });
});

describe("코스 도장 — 이어 붙인 곳", () => {
    it("좌표를 저장하지 않는다 — 표에 위경도 칸이 없고, 라우트는 끝 · 때만 넘긴다", () => {
        const mig = read("migrations/hiking_trail_stamps.sql");
        expect(mig).toContain("create table if not exists hiking_trail_checks");
        expect(mig).toContain("create table if not exists hiking_trail_stamps");
        expect(mig).not.toMatch(/\b(lat|lng|latitude|longitude)\b\s+(double|numeric|real|float)/i);
        const store = read("server/storage/trailStamps.ts");
        expect(store).not.toMatch(/\blat\b|\blng\b/);
        const route = read("server/routes/modules/trails.ts");
        expect(route).toContain('router.post("/:route/:key/check", ...requireHikingAccess,');
        expect(route).toContain('router.get("/me", ...requireHikingAccess,');
        // '/me' 가 '/:route/:key' 보다 먼저(같은 두 칸 주소가 아니지만 순서를 고정해 둔다)
        expect(route.indexOf('router.get("/me"')).toBeLessThan(route.indexOf('router.get("/:route/:key"'));
    });
    it("탈퇴하면 지운다 · 하루 확인 상한 · 화면은 등산 회원만(방문자는 가입 안내)", () => {
        const purge = read("server/storage/withdrawPurge.ts");
        for (const t of ["hiking_trail_checks", "hiking_trail_stamps"]) expect(purge).toContain(`delete from ${t} where member_id`);
        expect(read("server/routes/modules/trails.ts")).toContain("const CHECKS_PER_DAY = 30;");
        const ui = read("client/src/hiking/trails/TrailStamp.tsx");
        expect(ui).toContain("if (member && !can) return null;");
        expect(ui).toContain("가입하고 코스 도장 모으기");
        expect(ui).toContain("위치는 코스 끝까지의 거리를 재는 데만 쓰고 저장하지 않아요.");
        expect(read("client/src/hiking/trails/TrailCoursePage.tsx")).toContain("<TrailStampCard c={c} />");
    });
});
