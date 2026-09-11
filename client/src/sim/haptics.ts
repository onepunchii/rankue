/**
 * 시뮬레이터 햅틱. @capacitor/haptics 의 impact 를 얇게 감싼다.
 *  - 접근 속도(impulse, m/s) → light / medium / heavy.
 *  - 50 ms 미만 간격의 진동은 버린다(연속 충돌이 한 덩어리 진동으로 뭉개지는 것을 막는다).
 *  - Haptics 플러그인이 없으면(웹·옛 바이너리) navigator.vibrate, 그것도 없으면 완전한 no-op. 어떤 경우에도 throw 하지 않는다.
 *  - 예약은 setTimeout + performance.now() — UI 타이밍이므로 물리의 결정론 규칙과 무관하다.
 *  - 시뮬 루프(재생 프레임) 안에서 호출하지 않는다. 샷 시작 시 이벤트 목록을 통째로 예약한다.
 */
import { hasPlugin } from "@shared/nativeCaps";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import type { SoundEvent } from "./audioMapping";

export type HapticStyle = "light" | "medium" | "heavy";

/** 두 진동 사이 최소 간격 (ms). */
export const HAPTIC_MIN_GAP_MS = 50;
/** 이보다 약한 충돌은 진동하지 않는다 (m/s). */
export const HAPTIC_SILENT = 0.15;

const STYLE: Record<HapticStyle, ImpactStyle> = {
    light: ImpactStyle.Light, medium: ImpactStyle.Medium, heavy: ImpactStyle.Heavy,
};
/** navigator.vibrate 폴백용 지속 시간 (ms). */
const VIBRATE_MS: Record<HapticStyle, number> = { light: 8, medium: 15, heavy: 25 };

/** 접근 속도 → 진동 세기. 큐 타격은 같은 속도라도 손에 더 크게 느껴지므로 한 단계 올린다. */
export function impactFor(impulse: number, kind: SoundEvent["kind"] = "ball"): HapticStyle | null {
    if (!(impulse > HAPTIC_SILENT)) return null;
    const v = kind === "strike" ? impulse * 1.6 : kind === "cushion" ? impulse * 0.8 : impulse;
    if (v < 1.2) return "light";
    if (v < 3.2) return "medium";
    return "heavy";
}

export interface PlannedHaptic {
    /** ms, 재생 시작 기준 */
    readonly atMs: number;
    readonly style: HapticStyle;
}

/**
 * 이벤트 목록을 스로틀이 적용된 진동 계획으로 바꾼다(순수). 시각 순으로 정렬한 뒤 minGap 안에 든 것은
 * 버리되, 버린 것이 더 셌다면 살아남은 앞 진동의 세기를 그것으로 올린다(짧은 간격의 두 충돌 = 한 번의 큰 충격).
 */
export function planHaptics(events: readonly SoundEvent[], minGapMs: number = HAPTIC_MIN_GAP_MS): PlannedHaptic[] {
    const sorted = events
        .map(ev => ({ atMs: ev.t * 1000, style: impactFor(ev.impulse, ev.kind) }))
        .filter((p): p is PlannedHaptic => p.style !== null)
        .sort((a, b) => a.atMs - b.atMs);
    const out: PlannedHaptic[] = [];
    for (const p of sorted) {
        const last = out[out.length - 1];
        if (last && p.atMs - last.atMs < minGapMs) {
            if (RANK[p.style] > RANK[last.style]) out[out.length - 1] = { atMs: last.atMs, style: p.style };
            continue;
        }
        out.push(p);
    }
    return out;
}

const RANK: Record<HapticStyle, number> = { light: 0, medium: 1, heavy: 2 };

function hasVibrate(): boolean {
    return typeof navigator !== "undefined" && typeof (navigator as Navigator).vibrate === "function";
}

export class SimHaptics {
    private timers: ReturnType<typeof setTimeout>[] = [];
    private lastFiredMs = -Infinity;
    private enabled: boolean;
    private native: boolean;

    constructor() {
        // 네이티브라도 Haptics 플러그인이 없는 옛 바이너리(안드로이드 1.0.2 등)는 navigator.vibrate 로 내려간다 —
        // isNativePlatform 만 보면 없는 플러그인을 불러 아무 진동도 없다.
        this.native = hasPlugin("Haptics");
        this.enabled = this.native || hasVibrate();
    }

    isAvailable(): boolean {
        return this.enabled;
    }

    /** 지금 즉시 한 번. 50 ms 스로틀 적용. 절대 throw 하지 않는다. */
    impact(style: HapticStyle): void {
        if (!this.enabled) return;
        const now = nowMs();
        if (now - this.lastFiredMs < HAPTIC_MIN_GAP_MS) return;
        this.lastFiredMs = now;
        try {
            if (this.native) {
                Haptics.impact({ style: STYLE[style] }).catch(() => { /* 플러그인 없음 */ });
            } else if (hasVibrate()) {
                navigator.vibrate(VIBRATE_MS[style]);
            }
        } catch { /* noop */ }
    }

    /**
     * 이벤트 목록을 예약한다. startAt 은 performance.now() 기준 ms 로 재생 t=0 에 해당하는 시각.
     * 이미 지난 이벤트는 즉시 울린다.
     */
    schedule(events: readonly SoundEvent[], startAt: number): void {
        if (!this.enabled) return;
        const now = nowMs();
        for (const p of planHaptics(events)) {
            const delay = Math.max(0, startAt + p.atMs - now);
            const timer = setTimeout(() => {
                this.timers = this.timers.filter(t => t !== timer);
                this.impact(p.style);
            }, delay);
            this.timers.push(timer);
        }
    }

    cancel(): void {
        for (const t of this.timers) clearTimeout(t);
        this.timers = [];
    }
}

function nowMs(): number {
    return typeof performance !== "undefined" ? performance.now() : Date.now();
}
