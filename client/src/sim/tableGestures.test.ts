import { describe, it, expect } from "vitest";
import { TABLES } from "@shared/sim/params";
import { openingLayout } from "@shared/sim/layouts";
import { normalizeAngle } from "./aim";
import {
    beginGesture, gestureActive, hitBall, idleGestureState, isAbnormalReset, moveGesture, planGestureReset, shouldDropStale,
    staleResetReason, type GestureEnv, type TableGestureState,
} from "./tableGestures";

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

/** 페이지가 pointerdown 에서 만드는 조준 기록(주인 손가락 id, dragging 켜짐) */
const aimingState = (pointerId: number, patch: Partial<TableGestureState> = {}): TableGestureState => ({
    ...idleGestureState(),
    gesture: beginGesture(env(), [cx, cy + 0.3]),
    pointerId,
    lastScreen: [100, 200],
    pointers: new Map([[pointerId, [100, 200]]]),
    dragging: true,
    ...patch,
});

describe("조준 기록 정리(2026-09-11 먹통 수정)", () => {
    it("회귀: 뗌 신호가 빠진 뒤(top 뷰) 다음 터치는 옛 기록을 버리고 새 조준을 시작해 각이 다시 돈다", () => {
        // 손가락 6 으로 조준 중 — pointerup/cancel 이 오지 않았다(OS 메뉴가 가로챔). 새 터치 7 은 첫 손가락(isPrimary)이고 캡처도 이미 없다.
        const stuck = aimingState(6);
        const reason = staleResetReason({ view: "top", isPrimary: true, hasCapture: false });
        expect(reason).toBe("stale-pointerdown");
        const plan = planGestureReset(stuck, reason!);
        expect(plan.next).toEqual(idleGestureState());
        expect(plan.releasePointerId).toBe(6);
        expect(plan.clearDisplay).toBe(true); // dragging 이 굳어 직선 안내만 보이던 것을 푼다
        expect(plan.abnormal).toBe(true);
        // 새 손가락으로 시작한 조준이 실제로 각을 바꾼다(예전엔 여기서 return 해 0°)
        const g = beginGesture(env(), [cx, cy + 0.3])!;
        const m = moveGesture(g, [cx - 0.3, cy], Math.PI / 2);
        expect(m.phi).toBeCloseTo(Math.PI, 9);
    });

    it("회귀: 뗌 신호가 빠진 채 캡처만 풀리면(lostpointercapture) 그 자리에서 비우고 계측한다", () => {
        const plan = planGestureReset(aimingState(3), "lostcapture");
        expect(plan.next.pointerId).toBeNull();
        expect(plan.next.gesture).toBeNull();
        expect(plan.next.pointers.size).toBe(0);
        expect(plan.abnormal).toBe(true);
    });

    it("회귀: 선수 시점에서 뗌 신호가 빠지면 새 첫 손가락(isPrimary)이나 캡처가 풀린 옛 손가락 모두 새로 시작", () => {
        expect(staleResetReason({ view: "player", isPrimary: true, hasCapture: true })).toBe("stale-pointerdown");
        expect(staleResetReason({ view: "player", isPrimary: false, hasCapture: false })).toBe("stale-pointerdown");
        expect(shouldDropStale({ view: "player", isPrimary: true, hasCapture: false })).toBe(true);
    });

    it("선수 시점의 진짜 두 번째 손가락(첫 손가락이 캡처를 쥐고 있음)은 그대로 둔다 — 핀치 축소", () => {
        expect(staleResetReason({ view: "player", isPrimary: false, hasCapture: true })).toBeNull();
        expect(shouldDropStale({ view: "player", isPrimary: false, hasCapture: true })).toBe(false);
    });

    it("top 뷰의 진짜 두 번째 손가락은 새 조준으로 넘기되 비정상으로 세지 않는다", () => {
        const reason = staleResetReason({ view: "top", isPrimary: false, hasCapture: true });
        expect(reason).toBe("second-finger");
        expect(planGestureReset(aimingState(1), reason!).abnormal).toBe(false);
    });

    it("top 뷰 재생 중 길게 누르기(hold)에 살아 있는 두 번째 손가락이 닿으면 예전처럼 무시한다 — 4× 가 끊기지 않게", () => {
        expect(staleResetReason({ view: "top", isPrimary: false, hasCapture: true, gesture: "hold" })).toBeNull();
        // 뗌 신호를 놓친 증거가 있으면 hold 여도 버린다
        expect(staleResetReason({ view: "top", isPrimary: true, hasCapture: true, gesture: "hold" })).toBe("stale-pointerdown");
        expect(staleResetReason({ view: "top", isPrimary: false, hasCapture: false, gesture: "hold" })).toBe("stale-pointerdown");
        // 조준·공 옮기기는 조준 단계라 샷 전엔 단계 전환이 없다 — 늘 새 손가락으로 넘긴다
        expect(staleResetReason({ view: "top", isPrimary: false, hasCapture: true, gesture: "aim" })).toBe("second-finger");
        expect(staleResetReason({ view: "top", isPrimary: false, hasCapture: true, gesture: "place" })).toBe("second-finger");
        expect(staleResetReason({ view: "player", isPrimary: false, hasCapture: true, gesture: "hold" })).toBeNull();
    });

    it("길게 눌러 4× 가 켜진 채 풀리면 1× 로, 타이머만 걸린 상태면 타이머만 끈다", () => {
        const fast = planGestureReset({ ...idleGestureState(), gesture: { kind: "hold" }, pointerId: 2, holdFast: true }, "hidden");
        expect(fast.restoreSpeed).toBe(true);
        expect(fast.clearHoldTimer).toBe(false);
        expect(fast.abnormal).toBe(true);
        const pending = planGestureReset({ ...idleGestureState(), gesture: { kind: "hold" }, pointerId: 2, holdPending: true }, "end");
        expect(pending.clearHoldTimer).toBe(true);
        expect(pending.restoreSpeed).toBe(false);
        expect(pending.abnormal).toBe(false);
    });

    it("핀치 끝: 원래 크기로 돌아가고 남은 손가락 항목까지 지운다(다음 핀치 판정 size===2 가 틀어지지 않게)", () => {
        const pinching = aimingState(1, {
            pointers: new Map([[1, [0, 0]], [2, [50, 50]]]), pinch: { d0: 70 }, dragging: false,
        });
        const plan = planGestureReset(pinching, "pinch-end");
        expect(plan.restoreZoom).toBe(true);
        expect(plan.next.pointers.size).toBe(0);
        expect(plan.next.pinch).toBeNull();
        expect(plan.abnormal).toBe(false);
    });

    it("blur·visibility 는 제스처가 걸려 있을 때만 비정상, 단계 전환·언마운트는 늘 정상", () => {
        expect(isAbnormalReset("blur", false)).toBe(false);
        expect(isAbnormalReset("blur", true)).toBe(true);
        expect(isAbnormalReset("hidden", true)).toBe(true);
        expect(isAbnormalReset("pagehide", true)).toBe(true);
        expect(isAbnormalReset("phase", true)).toBe(false);
        expect(isAbnormalReset("unmount", true)).toBe(false);
        expect(isAbnormalReset("end", true)).toBe(false);
        expect(planGestureReset(idleGestureState(), "blur")).toMatchObject({ wasActive: false, abnormal: false, releasePointerId: null });
        // 표시만 남은 상태(dragging)도 진행 중으로 본다 — 굳은 직선 안내가 바로 그 증상이다
        expect(gestureActive({ ...idleGestureState(), dragging: true })).toBe(true);
    });

    it("언마운트는 기록·타이머·캡처만 비우고 컨트롤러·렌더러·React 상태는 건드리지 않는다", () => {
        const plan = planGestureReset(aimingState(4, { holdFast: true, holdPending: true, pinch: { d0: 10 } }), "unmount");
        expect(plan.releasePointerId).toBe(4);
        expect(plan.clearHoldTimer).toBe(true);
        expect(plan.restoreSpeed).toBe(false);
        expect(plan.restoreZoom).toBe(false);
        expect(plan.clearDisplay).toBe(false);
        expect(plan.next).toEqual(idleGestureState());
    });
});
