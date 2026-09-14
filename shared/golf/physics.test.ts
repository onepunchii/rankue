import { describe, it, expect } from "vitest";
import { COURSES, RANKUE_PARK, coursePar } from "./courses";
import { initBall, predictPath, runToRest, shoot, step, MAX_POWER, CUP_CAPTURE_SPEED } from "./physics";
import { onFairway, parLabel, pointInPolygon, toParLabel, wallsOf, v, COURSE_W, COURSE_H } from "./course";

describe("코스 자료", () => {
    it("9홀, 티·컵은 페어웨이 안(블록·범퍼 밖), 좌표는 코스 안", () => {
        expect(RANKUE_PARK.holes).toHaveLength(9);
        for (const h of RANKUE_PARK.holes) {
            expect(onFairway(h.tee, h), `${h.id} tee`).toBe(true);
            expect(onFairway(h.cup, h), `${h.id} cup`).toBe(true);
            for (const p of h.fairway) { expect(p.x).toBeGreaterThanOrEqual(0); expect(p.x).toBeLessThanOrEqual(COURSE_W); expect(p.y).toBeGreaterThanOrEqual(0); expect(p.y).toBeLessThanOrEqual(COURSE_H); }
            expect(h.par).toBeGreaterThanOrEqual(2);
        }
        expect(coursePar(RANKUE_PARK)).toBe(27);
        expect(COURSES.map((c) => c.id)).toContain("rankue-park");
    });
    it("점 안/밖 판정·파 표기", () => {
        expect(pointInPolygon(v(5, 5), [v(0, 0), v(10, 0), v(10, 10), v(0, 10)])).toBe(true);
        expect(pointInPolygon(v(15, 5), [v(0, 0), v(10, 0), v(10, 10), v(0, 10)])).toBe(false);
        expect(parLabel(1, 3)).toBe("홀인원");
        expect(parLabel(2, 3)).toBe("버디");
        expect(parLabel(3, 3)).toBe("파");
        expect(parLabel(5, 3)).toBe("더블 보기");
        expect(toParLabel(27, 27)).toBe("E");
        expect(toParLabel(25, 27)).toBe("-2");
        expect(toParLabel(30, 27)).toBe("+3");
    });
});

describe("공 물리", () => {
    const h1 = RANKUE_PARK.holes[0];   // 직선 홀: 티 (18,50) → 컵 (18,12)

    it("당긴 반대로 나가고, 마찰로 멈추고, 멈춘 자리가 복귀점이 된다", () => {
        const b = shoot(initBall(h1), 0, 6);   // 아래로 당김 → 위로(−y) 발사
        expect(b.moving).toBe(true);
        expect(b.vy).toBeLessThan(0);
        const { events, steps } = runToRest(b, h1);
        expect(b.moving).toBe(false);
        expect(steps).toBeLessThan(30 * 120);
        expect(events.at(-1)?.kind).toBe("stop");
        expect(b.restY).toBeCloseTo(b.y, 6);
        expect(b.y).toBeLessThan(h1.tee.y);
    });

    it("너무 약하게 당기면 안 나간다", () => {
        const b = shoot(initBall(h1), 0.1, 0.1);
        expect(b.moving).toBe(false);
    });

    it("정면으로 적당히 치면 컵에 들어간다", () => {
        // 티에서 컵까지 38 단위. 마찰 18 → 필요한 속도 v = sqrt(2·18·38) ≈ 37. 40 으로 치면 컵 앞에서 13 미만으로 줄어 들어간다
        const b = initBall(h1);
        const drag = 14 * (39 / MAX_POWER);
        const s = shoot(b, 0, drag);
        const { events } = runToRest(s, h1);
        expect(s.inCup, JSON.stringify({ x: s.x, y: s.y, events: events.map((e) => e.kind) })).toBe(true);
        expect(events.some((e) => e.kind === "cup")).toBe(true);
    });

    it("너무 세게 치면 컵을 지나쳐 뒷벽에 튕긴다(립아웃)", () => {
        const s = shoot(initBall(h1), 0, 14);   // 최대 파워 42
        const { events } = runToRest(s, h1);
        expect(events.some((e) => e.kind === "wall")).toBe(true);
        const cupHit = events.find((e) => e.kind === "cup");
        if (cupHit) expect(cupHit.speed).toBeLessThan(CUP_CAPTURE_SPEED);
    });

    it("벽에 맞으면 반사되고 코스 밖으로 안 나간다", () => {
        const b = shoot(initBall(h1), -10, 0);   // 왼쪽으로 당김 → 오른쪽 벽으로 발사
        const { events } = runToRest(b, h1);
        expect(events.some((e) => e.kind === "wall")).toBe(true);
        expect(b.x).toBeGreaterThan(12); expect(b.x).toBeLessThan(24);
        expect(events.some((e) => e.kind === "ob")).toBe(false);
    });

    it("범퍼 홀: 범퍼에 맞으면 bumper 이벤트", () => {
        const h3 = RANKUE_PARK.holes[2];
        const b = initBall(h3);
        b.x = 12; b.y = 40;   // 범퍼(12,30) 바로 아래
        const s = shoot(b, 0, 8);
        const { events } = runToRest(s, h3);
        expect(events.some((e) => e.kind === "bumper")).toBe(true);
    });

    it("미리보기 자취는 실제 샷과 같은 경로", () => {
        const b = initBall(h1);
        const pts = predictPath(b, h1, 0, 6, 240, 6);
        expect(pts.length).toBeGreaterThan(5);
        const s = shoot({ ...b }, 0, 6);
        for (let i = 0; i < 7; i++) step(s, h1);   // 점은 i=0,6,12… 스텝 뒤에 찍힌다 → pts[1] 은 7번째 스텝 뒤
        expect(s.x).toBeCloseTo(pts[1].x, 6); expect(s.y).toBeCloseTo(pts[1].y, 6);
    });

    it("같은 입력이면 같은 결과(결정론)", () => {
        const a = shoot(initBall(RANKUE_PARK.holes[3]), 5, 9); runToRest(a, RANKUE_PARK.holes[3]);
        const b = shoot(initBall(RANKUE_PARK.holes[3]), 5, 9); runToRest(b, RANKUE_PARK.holes[3]);
        expect([a.x, a.y]).toEqual([b.x, b.y]);
    });

    it("모든 홀에서 티에서 아무 방향으로 쳐도 30초 안에 멈추고 코스 안에 있다", () => {
        for (const h of RANKUE_PARK.holes) {
            for (const [dx, dy] of [[0, 14], [14, 0], [-14, 0], [0, -14], [9, 9], [-9, 9], [9, -9], [-9, -9]]) {
                const s = shoot(initBall(h), dx, dy);
                const { steps } = runToRest(s, h);
                expect(steps, `${h.id} ${dx},${dy}`).toBeLessThan(30 * 120);
                expect(s.inCup || onFairway({ x: s.x, y: s.y }, h) || (s.x === s.restX && s.y === s.restY), `${h.id} ${dx},${dy} → (${s.x.toFixed(1)},${s.y.toFixed(1)})`).toBe(true);
            }
        }
        expect(wallsOf(RANKUE_PARK.holes[3]).length).toBe(20);
    });
});
