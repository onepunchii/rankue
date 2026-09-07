import { describe, it, expect } from "vitest";
import { TABLES } from "@shared/sim/params";
import { openingLayout } from "@shared/sim/layouts";
import { normalizeAngle } from "./aim";
import { beginGesture, hitBall, moveGesture, type GestureEnv } from "./tableGestures";

const table = TABLES.DAEDAE;
const R = table.ball.R;
const balls = openingLayout("3c", table, "white");
const cue = balls.find((b) => b.id === "white")!;
const cx = cue.r[0], cy = cue.r[1];

const env = (patch: Partial<GestureEnv> = {}): GestureEnv =>
    ({ phase: "aim", canPlace: false, balls, cueBallId: "white", R, ...patch });

describe("tableGestures", () => {
    it("hitBall 은 slop·R 안의 가장 가까운 공", () => {
        expect(hitBall(balls, [cx, cy], R)?.id).toBe("white");
        expect(hitBall(balls, [cx + R * 1.5, cy], R)?.id).toBe("white");
        expect(hitBall(balls, [cx + R * 3, cy], R)).toBeNull();
        expect(hitBall(balls, [cx, cy + 0.5], R)).toBeNull();
    });

    it("setup·finished 에선 제스처 없음, shooting 은 hold", () => {
        expect(beginGesture(env({ phase: "setup" }), [cx, cy + 0.3])).toBeNull();
        expect(beginGesture(env({ phase: "finished" }), [cx, cy + 0.3])).toBeNull();
        expect(beginGesture(env({ phase: "shooting" }), [cx, cy + 0.3])).toEqual({ kind: "hold" });
        expect(moveGesture({ kind: "hold" }, [0, 0], 1)).toEqual({ gesture: { kind: "hold" } });
    });

    it("조준 드래그: 큐볼 주위를 도는 만큼 phi 가 돈다(멀수록 같은 이동에 작은 각)", () => {
        const g0 = beginGesture(env(), [cx, cy + 0.3]);
        expect(g0?.kind).toBe("aim");
        // 위(+y)에서 왼쪽(−x)으로 반시계 90°
        const m = moveGesture(g0!, [cx - 0.3, cy], Math.PI / 2);
        expect(m.phi).toBeCloseTo(Math.PI, 9);
        expect(m.gesture.kind === "aim" && m.gesture.moved).toBe(true);
        // 시계 방향으로 돌면 줄어든다
        const m2 = moveGesture(m.gesture, [cx, cy + 0.3], m.phi!);
        expect(normalizeAngle(m2.phi!)).toBeCloseTo(Math.PI / 2, 9);
        // 같은 픽셀 이동이라도 멀리서는 각이 작다
        const near = moveGesture(beginGesture(env(), [cx, cy + 0.1])!, [cx + 0.05, cy + 0.1], 0).phi!;
        const far = moveGesture(beginGesture(env(), [cx, cy + 0.5])!, [cx + 0.05, cy + 0.5], 0).phi!;
        const dNear = Math.abs(normalizeAngle(near + Math.PI) - Math.PI);
        const dFar = Math.abs(normalizeAngle(far + Math.PI) - Math.PI);
        expect(dFar).toBeLessThan(dNear);
    });

    it("큐볼 중심을 정확히 누르면 각을 정의할 수 없어 phi 를 안 바꾼다", () => {
        const g = beginGesture(env(), [cx, cy])!;
        const m = moveGesture(g, [cx + 0.1, cy], 1.23);
        expect(m.phi).toBeUndefined();
        // 다음 이동부터는 정상
        const m2 = moveGesture(m.gesture, [cx, cy + 0.1], 1.23);
        expect(m2.phi).toBeDefined();
    });

    it("연습 모드에서 공을 누르면 place, 잡은 오프셋을 유지하며 따라온다", () => {
        const red = balls.find((b) => b.id === "red")!;
        const grabAt: [number, number] = [red.r[0] + R * 0.5, red.r[1] - R * 0.5];
        const g = beginGesture(env({ canPlace: true }), grabAt);
        expect(g?.kind).toBe("place");
        if (g?.kind !== "place") throw new Error("place expected");
        expect(g.id).toBe("red");
        expect(g.moved).toBe(false);
        expect(g.grab[0]).toBeCloseTo(R * 0.5, 12);
        expect(g.grab[1]).toBeCloseTo(-R * 0.5, 12);
        const m = moveGesture(g, [grabAt[0] + 0.2, grabAt[1] + 0.1], 0);
        expect(m.place?.id).toBe("red");
        expect(m.place?.x).toBeCloseTo(red.r[0] + 0.2, 12);
        expect(m.place?.y).toBeCloseTo(red.r[1] + 0.1, 12);
        expect(m.phi).toBeUndefined();
        // 공이 아닌 곳은 여전히 조준
        expect(beginGesture(env({ canPlace: true }), [cx, cy + 0.3])?.kind).toBe("aim");
        // 기록 모드에선 공 위를 눌러도 조준
        expect(beginGesture(env(), grabAt)?.kind).toBe("aim");
    });

    it("큐볼이 없으면 null", () => {
        expect(beginGesture(env({ cueBallId: "ghost" }), [cx, cy + 0.3])).toBeNull();
    });
});
