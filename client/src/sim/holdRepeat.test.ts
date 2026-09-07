import { describe, it, expect } from "vitest";
import { createHoldRepeat } from "./holdRepeat";

/** 수동 타이머: 예약 목록을 시각 순으로 실행한다. */
function fakeTimers() {
    let now = 0;
    let seq = 0;
    const pending = new Map<number, { at: number; cb: () => void }>();
    return {
        setTimer: (cb: () => void, ms: number) => { const id = ++seq; pending.set(id, { at: now + ms, cb }); return id; },
        clearTimer: (h: unknown) => { pending.delete(h as number); },
        advance(ms: number) {
            const until = now + ms;
            for (;;) {
                let next: [number, { at: number; cb: () => void }] | null = null;
                for (const e of pending) if (e[1].at <= until && (!next || e[1].at < next[1].at)) next = e;
                if (!next) break;
                pending.delete(next[0]);
                now = next[1].at;
                next[1].cb();
            }
            now = until;
        },
        count: () => pending.size,
    };
}

describe("holdRepeat", () => {
    it("start 는 즉시 1회, 지연 뒤 반복하며 간격이 줄어 최소에서 멈춘다", () => {
        const tm = fakeTimers();
        const ticks: number[] = [];
        const h = createHoldRepeat({
            onTick: (n) => ticks.push(n), initialDelayMs: 300, intervalMs: 100, minIntervalMs: 40, accel: 0.5,
            setTimer: tm.setTimer, clearTimer: tm.clearTimer,
        });
        h.start();
        expect(ticks).toEqual([1]);
        expect(h.active()).toBe(true);
        tm.advance(299);
        expect(ticks).toEqual([1]);
        tm.advance(1);                // 300: 2번째
        expect(ticks).toEqual([1, 2]);
        tm.advance(100);              // 400: 3번째 (간격 100 → 다음 50)
        expect(ticks).toEqual([1, 2, 3]);
        tm.advance(50);               // 450: 4번째 (다음 40 = 최소)
        expect(ticks).toEqual([1, 2, 3, 4]);
        tm.advance(40);               // 490
        tm.advance(40);               // 530
        expect(ticks).toEqual([1, 2, 3, 4, 5, 6]);
        h.stop();
        expect(h.active()).toBe(false);
        tm.advance(1000);
        expect(ticks).toHaveLength(6);
        expect(tm.count()).toBe(0);
    });

    it("두 번 start 해도 타이머는 하나, stop 뒤 다시 start 하면 처음부터", () => {
        const tm = fakeTimers();
        const ticks: number[] = [];
        const h = createHoldRepeat({ onTick: (n) => ticks.push(n), initialDelayMs: 100, intervalMs: 100, setTimer: tm.setTimer, clearTimer: tm.clearTimer });
        h.start();
        h.start();
        expect(ticks).toEqual([1]);
        expect(tm.count()).toBe(1);
        h.stop();
        h.stop();
        h.start();
        expect(ticks).toEqual([1, 1]);
        tm.advance(100);
        expect(ticks).toEqual([1, 1, 2]);
        h.stop();
    });
});
