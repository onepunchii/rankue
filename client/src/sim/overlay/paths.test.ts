import { describe, it, expect } from "vitest";
import { TABLES } from "@shared/sim/params";
import type { BallState, SimEvent, Snapshot } from "@shared/sim/types";
import { walkEvents, objectBallIds } from "@shared/sim/rules/evaluate";
import {
    buildPreviewPaths, cueTimeline, countCushionsBeforeSecond, cutoffTime, snapshotIndexAt, positionAt,
    ballPolyline, firstLegWindow, straightGuide, thicknessLabel,
} from "./paths";

const T = TABLES.DAEDAE;
const R = T.ball.R;

const ball = (id: string, x: number, y: number, vx = 0, vy = 0): BallState => ({
    id, r: [x, y, R], v: [vx, vy, 0], w: [0, 0, 0], state: vx || vy ? "rolling" : "stationary",
});
const snap = (t: number, ...balls: BallState[]): Snapshot => ({ t, balls });

/**
 * 합성 3쿠션 샷. 물리적으로 정확할 필요는 없고, 이벤트와 스냅샷의 짝만 맞으면 된다.
 * white: 위로 → red 정면(0.5s) → 오른쪽 쿠션(0.9) → 위 쿠션(1.3) → yellow(1.6, 두 번째 적구) → 왼쪽 쿠션(1.9) → 정지(2.5)
 * red: 맞은 뒤 위로 → 위 쿠션(1.1) → 정지
 */
const Y1 = 1.5 - 2 * R; // 0.9385
const TOP = T.length - R;
const RIGHT = T.width - R;
const history: Snapshot[] = [
    snap(0.0, ball("white", 0.5, 0.5, 0, 2), ball("red", 0.5, 1.5), ball("yellow", 1.0, 2.0)),
    snap(0.5, ball("white", 0.5, Y1, 1, 1), ball("red", 0.5, 1.5, 0, 1), ball("yellow", 1.0, 2.0)),
    snap(0.9, ball("white", RIGHT, 1.8, -1, 1), ball("red", 0.5, 1.9, 0, 1), ball("yellow", 1.0, 2.0)),
    snap(1.1, ball("white", 1.2, 2.0, -1, 1), ball("red", 0.5, TOP, 0, -0.5), ball("yellow", 1.0, 2.0)),
    snap(1.3, ball("white", 1.0, TOP, -0.5, -1), ball("red", 0.5, 2.7, 0, -0.5), ball("yellow", 1.0, 2.0)),
    snap(1.6, ball("white", 1.0, 2.0 + 2 * R, -1, 0), ball("red", 0.5, 2.55, 0, -0.5), ball("yellow", 1.0, 2.0, 0, -0.5)),
    snap(1.9, ball("white", R, 2.2, 0.5, 0), ball("red", 0.5, 2.4, 0, -0.3), ball("yellow", 1.0, 1.85, 0, -0.5)),
    snap(2.5, ball("white", 0.3, 2.2), ball("red", 0.5, 2.3), ball("yellow", 1.0, 1.6)),
];
const events: SimEvent[] = [
    { type: "ball-ball", t: 0.5, ids: ["red", "white"] },
    { type: "ball-cushion", t: 0.9, ids: ["white"], cushion: "right" },
    { type: "ball-cushion", t: 1.1, ids: ["red"], cushion: "top" },
    { type: "ball-cushion", t: 1.3, ids: ["white"], cushion: "top" },
    { type: "ball-ball", t: 1.6, ids: ["white", "yellow"] },
    { type: "ball-cushion", t: 1.9, ids: ["white"], cushion: "left" },
    { type: "transition", t: 2.5, ids: ["white"], from: "rolling", to: "stationary" },
];
const src = { history, events };

describe("스냅샷 보간", () => {
    it("snapshotIndexAt 은 t 이상인 첫 인덱스", () => {
        expect(snapshotIndexAt(history, 0)).toBe(0);
        expect(snapshotIndexAt(history, 0.5)).toBe(1);
        expect(snapshotIndexAt(history, 0.51)).toBe(2);
        expect(snapshotIndexAt(history, 9)).toBe(history.length);
    });
    it("positionAt 은 스냅샷 사이를 직선 보간한다", () => {
        const p = positionAt(history, "white", 0.25)!;
        expect(p[0]).toBeCloseTo(0.5, 12);
        expect(p[1]).toBeCloseTo((0.5 + Y1) / 2, 12);
        expect(positionAt(history, "white", 0.5)![1]).toBeCloseTo(Y1, 12);
        expect(positionAt(history, "white", 99)![0]).toBeCloseTo(0.3, 12);
        expect(positionAt(history, "nope", 0.3)).toBeNull();
    });
});

describe("타임라인·컷오프", () => {
    it("접촉 순서와 두 번째 접촉 시각", () => {
        const tl = cueTimeline(events, "white", ["yellow", "red"], null);
        expect(tl.contacts.map((c) => c.id)).toEqual(["red", "yellow"]);
        expect(tl.secondContactT).toBe(1.6);
        expect(tl.cushions.map((c) => c.cushion)).toEqual(["right", "top", "left"]);
    });
    it("쿠션 수는 판정 엔진 walkEvents 와 같다", () => {
        expect(countCushionsBeforeSecond(events, "white", "3c")).toBe(2);
        expect(countCushionsBeforeSecond(events, "white", "3c")).toBe(walkEvents(events, "white", ["yellow", "red"], null).cushionsBeforeSecond);
    });
    it("cueTimeline.contacts 는 walkEvents.contacts 와 같은 규칙(키스·상대공 무시)", () => {
        const messy: SimEvent[] = [
            { type: "ball-ball", t: 0.2, ids: ["white", "yellow"] }, // 4구: 상대 큐볼 — 접촉 아님
            { type: "ball-ball", t: 0.4, ids: ["red1", "white"] },
            { type: "ball-cushion", t: 0.5, ids: ["white"], cushion: "left" },
            { type: "ball-ball", t: 0.6, ids: ["red1", "white"] }, // 키스
            { type: "ball-ball", t: 0.7, ids: ["red1", "red2"] }, // 쫑
            { type: "ball-cushion", t: 0.8, ids: ["white"], cushion: "top" },
            { type: "ball-ball", t: 0.9, ids: ["red2", "white"] },
            { type: "ball-cushion", t: 1.0, ids: ["white"], cushion: "right" },
        ];
        const ids = objectBallIds("4c", "white");
        const w = walkEvents(messy, "white", ids, "yellow");
        const tl = cueTimeline(messy, "white", ids, "yellow");
        expect(tl.contacts.map((c) => c.id)).toEqual(w.contacts);
        expect(tl.secondContactT).toBe(0.9);
        expect(countCushionsBeforeSecond(messy, "white", "4c")).toBe(2);
    });
    it("컷오프 종류", () => {
        const tl = cueTimeline(events, "white", ["yellow", "red"], null);
        expect(cutoffTime(src, tl, { kind: "second-contact" })).toBe(1.6);
        expect(cutoffTime(src, tl, { kind: "cushions", n: 3 })).toBe(1.9);
        expect(cutoffTime(src, tl, { kind: "cushions", n: 9 })).toBe(2.5);
        expect(cutoffTime(src, tl, { kind: "time", t: 0.25 })).toBe(0.25);
        expect(cutoffTime(src, tl, { kind: "time", t: 99 })).toBe(2.5);
        expect(cutoffTime(src, tl, { kind: "end" })).toBe(2.5);
        const noSecond = cueTimeline(events.slice(0, 3), "white", ["yellow", "red"], null);
        expect(cutoffTime({ history, events: events.slice(0, 3) }, noSecond, { kind: "second-contact" })).toBe(2.5);
    });
});

describe("폴리라인", () => {
    it("긴 구간엔 최대 8개 중간점, 짧은 구간엔 없음", () => {
        // 0→0.5s: 0.9385 m, step 0.15 → floor(6.26)=6 중간점 + 끝점
        const pts = ballPolyline(history, "white", 0, 0.5);
        expect(pts.length).toBe(1 + 6 + 1);
        expect(pts[pts.length - 1]).toEqual({ x: 0.5, y: Y1, t: 0.5 });
        expect(pts[3].y).toBeGreaterThan(pts[2].y);
        expect(ballPolyline(history, "white", 0, 0.5, 2).length).toBe(1 + 2 + 1);
        expect(ballPolyline(history, "white", 0, 0.5, 8, 10).length).toBe(2);
    });
    it("정지한 공은 점 1개", () => {
        expect(ballPolyline(history, "yellow", 0, 1.6).length).toBe(1);
    });
    it("컷오프가 스냅샷 사이면 보간점으로 끝난다", () => {
        const pts = ballPolyline(history, "white", 0, 0.25, 0);
        expect(pts.length).toBe(2);
        expect(pts[1].t).toBe(0.25);
        expect(pts[1].y).toBeCloseTo((0.5 + Y1) / 2, 12);
    });
    it("중간 시각에서 시작하면 보간점에서 출발", () => {
        const pts = ballPolyline(history, "white", 0.25, 0.5, 0);
        expect(pts[0].y).toBeCloseTo((0.5 + Y1) / 2, 12);
        expect(pts[1].y).toBeCloseTo(Y1, 12);
    });
    it("firstLegWindow: 맞은 시각부터 다음 자기 이벤트까지", () => {
        expect(firstLegWindow(events, "red")).toEqual({ from: 0.5, to: 1.1 });
        expect(firstLegWindow(events, "yellow")).toEqual({ from: 1.6, to: null });
        expect(firstLegWindow(events, "blue")).toBeNull();
    });
});

describe("buildPreviewPaths", () => {
    it("기본: 두 번째 적구 접촉까지, 적구는 첫 구간만", () => {
        const p = buildPreviewPaths(src, { cueBallId: "white", gameType: "3c" });
        expect(p.cutoffT).toBe(1.6);
        expect(p.cushionCount).toBe(2);
        expect(p.contactIds).toEqual(["red", "yellow"]);
        expect(p.cushions.map((c) => [c.index, c.cushion])).toEqual([[1, "right"], [2, "top"]]);
        expect(p.cushions[0].x).toBeCloseTo(RIGHT, 12);
        expect(p.cushions[1].y).toBeCloseTo(TOP, 12);

        const ids = p.paths.map((b) => b.id);
        expect(ids).toContain("white");
        expect(ids).toContain("red");
        expect(ids).not.toContain("yellow"); // 컷오프 시각에야 움직이기 시작

        const cue = p.paths.find((b) => b.id === "white")!.points;
        expect(cue[0]).toEqual({ x: 0.5, y: 0.5, t: 0 });
        expect(cue[cue.length - 1].t).toBe(1.6);
        expect(cue[cue.length - 1].y).toBeCloseTo(2.0 + 2 * R, 12);
        expect(cue.every((q, i) => i === 0 || q.t >= cue[i - 1].t)).toBe(true);

        const red = p.paths.find((b) => b.id === "red")!.points;
        expect(red[0].t).toBe(0.5);
        expect(red[red.length - 1].t).toBe(1.1);
        expect(red[red.length - 1].y).toBeCloseTo(TOP, 12);
    });
    it("objectBalls: cutoff 면 적구도 컷오프까지", () => {
        const p = buildPreviewPaths(src, { cueBallId: "white", gameType: "3c", objectBalls: "cutoff" });
        const red = p.paths.find((b) => b.id === "red")!.points;
        expect(red[red.length - 1].t).toBe(1.6);
        expect(red[red.length - 1].y).toBeCloseTo(2.55, 12);
    });
    it("cushions 컷오프: 3쿠션까지 큐볼 경로·표식 3개", () => {
        const p = buildPreviewPaths(src, { cueBallId: "white", gameType: "3c", cutoff: { kind: "cushions", n: 3 } });
        expect(p.cutoffT).toBe(1.9);
        expect(p.cushions.length).toBe(3);
        expect(p.cushions[2].x).toBeCloseTo(R, 12);
        expect(p.cushionCount).toBe(2); // 판정용 수는 컷오프와 무관
        const cue = p.paths.find((b) => b.id === "white")!.points;
        expect(cue[cue.length - 1].t).toBe(1.9);
    });
    it("빈 결과도 안전", () => {
        const p = buildPreviewPaths({ history: [], events: [] }, { cueBallId: "white", gameType: "3c" });
        expect(p.paths).toEqual([]);
        expect(p.cushions).toEqual([]);
        expect(p.cutoffT).toBe(0);
    });
});

describe("직선 안내", () => {
    const cue = ball("white", 0.5, 0.5);
    const balls = [cue, ball("red", 0.5, 1.5), ball("yellow", 1.0, 2.0)];
    it("정면 접촉: 고스트·접촉점·적구 방향·너머 연장", () => {
        const g = straightGuide(cue, balls, Math.PI / 2, T)!;
        expect(g.contact.kind).toBe("ball");
        expect(g.ghost[1]).toBeCloseTo(Y1, 12);
        expect(g.ball!.id).toBe("red");
        expect(g.ball!.thickness).toBeCloseTo(1, 9);
        expect(g.ball!.contactPoint[1]).toBeCloseTo(1.5 - R, 12);
        expect(g.ball!.objectDir[0]).toBeCloseTo(0, 12);
        expect(g.ball!.objectDir[1]).toBeCloseTo(1, 12);
        expect(g.beyond![1]).toBeCloseTo(TOP, 12);
    });
    it("쿠션 접촉: 반사 방향으로 다음 쿠션까지", () => {
        const g = straightGuide(cue, balls, Math.PI, T)!;
        expect(g.contact.kind).toBe("cushion");
        expect(g.ball).toBeNull();
        expect(g.ghost[0]).toBeCloseTo(R, 12);
        expect(g.beyond![0]).toBeCloseTo(RIGHT, 12);
        expect(g.beyond![1]).toBeCloseTo(0.5, 12);
    });
    it("얇게 맞히면 두께와 좌우", () => {
        const phi = Math.PI / 2 + 0.05;
        const g = straightGuide(cue, balls, phi, T)!;
        expect(g.contact.kind).toBe("ball");
        expect(g.ball!.thickness).toBeLessThan(1);
        expect(g.ball!.side).toBe("right");
    });
});

describe("두께 라벨", () => {
    it("단계에 가까우면 분수, 아니면 퍼센트", () => {
        expect(thicknessLabel(1)).toBe("100%");
        expect(thicknessLabel(1, undefined, "정면")).toBe("정면");
        expect(thicknessLabel(0.5, undefined, "정면")).toBe("½");
        expect(thicknessLabel(0.98)).toBe("100%");
        expect(thicknessLabel(0.75)).toBe("¾");
        expect(thicknessLabel(0.5)).toBe("½");
        expect(thicknessLabel(0.34)).toBe("⅓");
        expect(thicknessLabel(0.25)).toBe("¼");
        expect(thicknessLabel(0.125)).toBe("⅛");
        expect(thicknessLabel(0.7)).toBe("70%");
        expect(thicknessLabel(0.6)).toBe("60%");
        expect(thicknessLabel(-1)).toBe("0%");
    });
});
