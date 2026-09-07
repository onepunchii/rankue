/**
 * 길게 누르면 반복·가속하는 버튼(± 0.1°, ± 0.05 m/s)용 타이머 헬퍼. 순수 로직 — 타이머를 주입받아 테스트한다.
 *
 * start(): 즉시 한 번 tick, initialDelay 뒤부터 interval 간격으로 반복하며 매 tick 마다 간격이 accel 배로 줄어
 * minInterval 에서 멈춘다(누를수록 빨라진다). stop(): 예약 취소. 두 번 start 해도 타이머는 하나만 돈다.
 */
export interface HoldRepeatOptions {
    /** count 는 이번 누름에서 몇 번째 tick 인지(1부터). */
    readonly onTick: (count: number) => void;
    readonly initialDelayMs?: number;
    readonly intervalMs?: number;
    readonly minIntervalMs?: number;
    /** tick 마다 간격에 곱하는 배수(< 1 이면 가속). */
    readonly accel?: number;
    readonly setTimer?: (cb: () => void, ms: number) => unknown;
    readonly clearTimer?: (handle: unknown) => void;
}

export interface HoldRepeat {
    start(): void;
    stop(): void;
    active(): boolean;
}

export const HOLD_INITIAL_DELAY_MS = 350;
export const HOLD_INTERVAL_MS = 110;
export const HOLD_MIN_INTERVAL_MS = 35;
export const HOLD_ACCEL = 0.85;

export function createHoldRepeat(o: HoldRepeatOptions): HoldRepeat {
    const setTimer = o.setTimer ?? ((cb, ms) => setTimeout(cb, ms));
    const clearTimer = o.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
    const initial = o.initialDelayMs ?? HOLD_INITIAL_DELAY_MS;
    const minInterval = o.minIntervalMs ?? HOLD_MIN_INTERVAL_MS;
    const accel = o.accel ?? HOLD_ACCEL;

    let handle: unknown = null;
    let count = 0;
    let interval = o.intervalMs ?? HOLD_INTERVAL_MS;

    const schedule = (ms: number) => {
        handle = setTimer(() => {
            handle = null;
            count++;
            o.onTick(count);
            // 첫 반복은 intervalMs 그대로, 그 다음부터 줄어든다
            schedule(interval);
            interval = Math.max(minInterval, interval * accel);
        }, ms);
    };

    return {
        start() {
            if (handle !== null) return;
            count = 1;
            interval = o.intervalMs ?? HOLD_INTERVAL_MS;
            o.onTick(count);
            schedule(initial);
        },
        stop() {
            if (handle !== null) { clearTimer(handle); handle = null; }
        },
        active() {
            return handle !== null;
        },
    };
}
