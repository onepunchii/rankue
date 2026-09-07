/**
 * 물리 결과 → 소리·햅틱 이벤트 매핑. 순수 함수만 (Web Audio·DOM 무관). 테스트 동반.
 *
 * 임펄스(impulse) 단위는 m/s — 충돌 직전 접촉 법선 방향의 접근 속도다. 진짜 역적(N·s)이 아니라
 * "얼마나 세게 부딪혔나"를 게인·피치·햅틱 강도로 바꾸기 위한 척도로만 쓴다.
 *  - 큐 타격: 타격 직후(history[0]) 큐볼 속력.
 *  - 공–공: 직전 스냅샷의 상대 속도를, 사건 직후 스냅샷의 중심 연결선(= 접촉 시각의 실제 위치)에 사영한 절댓값.
 *  - 쿠션: 직전 스냅샷 속도의 쿠션 법선 성분 절댓값.
 * 스냅샷은 사건이 해결된 직후 상태이므로 "직전 스냅샷" = t 가 사건 시각보다 작은 마지막 것.
 */
import type { BallState, CushionId, SimEvent, Snapshot } from "@shared/sim/types";

export type SoundKind = "strike" | "ball" | "cushion";

export interface SoundEvent {
    /** 재생 시각 (s, 샷 시작 기준) */
    readonly t: number;
    readonly kind: SoundKind;
    /** 접근 속도 (m/s), 0 이상 */
    readonly impulse: number;
}

/** 게인 곡선이 1 로 포화하는 접근 속도 (m/s). 세게 친 샷(큐 9 m/s)의 큐볼 속력이 대략 이 근처. */
export const IMPULSE_FULL = 7;
/** 이보다 약한 충돌은 소리를 내지 않는다(정지 직전 미세 접촉, 수치 잡음). */
export const IMPULSE_SILENT = 0.03;

/** 종류별 최대 게인. 합쳐도 클리핑하지 않게 1 미만. */
export const KIND_PEAK: Record<SoundKind, number> = { strike: 0.9, ball: 0.85, cushion: 0.55 };

/**
 * 접근 속도 → 게인 [0, 1]. 거듭제곱 0.6 곡선: 약한 충돌도 들리되 세기 차이가 남는다(음량 지각은 대략 압력의 0.6승).
 */
export function impulseToGain(impulse: number, kind: SoundKind = "ball"): number {
    if (!(impulse > IMPULSE_SILENT)) return 0;
    const x = Math.min(1, impulse / IMPULSE_FULL);
    return Math.pow(x, 0.6) * KIND_PEAK[kind];
}

/**
 * 재생 속도 배율: 세기에 따른 피치 변화(공–공은 세게 부딪힐수록 살짝 밝게) × 인덱스로 정해지는 ±5% 편차.
 * Math.random 을 쓰지 않아 같은 샷은 언제나 같은 소리가 난다.
 */
export function playbackRateFor(kind: SoundKind, impulse: number, index: number): number {
    const x = Math.min(1, Math.max(0, impulse / IMPULSE_FULL));
    const pitch = kind === "ball" ? 0.94 + 0.12 * x : kind === "cushion" ? 0.97 + 0.06 * x : 1;
    return pitch * (1 + 0.05 * seededUnit(index));
}

/** 정수 인덱스 → [-1, 1] 결정론 의사난수 (32비트 정수 해시). */
export function seededUnit(index: number): number {
    let h = (index | 0) * 2654435761 + 0x9e3779b9;
    h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    return ((h >>> 0) / 4294967295) * 2 - 1;
}

const CUSHION_NORMAL: Record<CushionId, readonly [number, number]> = {
    left: [1, 0], right: [-1, 0], bottom: [0, 1], top: [0, -1],
};

/** t 가 주어진 시각보다 작은 마지막 스냅샷 인덱스. 없으면 0. */
export function snapshotBefore(history: readonly Snapshot[], t: number): number {
    let lo = 0, hi = history.length - 1, ans = 0;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (history[mid].t < t) { ans = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return ans;
}

/** t 이상인 첫 스냅샷 인덱스. 없으면 마지막. */
export function snapshotAtOrAfter(history: readonly Snapshot[], t: number): number {
    let lo = 0, hi = history.length - 1, ans = history.length - 1;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (history[mid].t >= t) { ans = mid; hi = mid - 1; } else lo = mid + 1;
    }
    return ans;
}

function findBall(snap: Snapshot | undefined, id: string): BallState | undefined {
    return snap?.balls.find(b => b.id === id);
}

function speedXY(b: BallState | undefined): number {
    if (!b) return 0;
    return Math.hypot(b.v[0], b.v[1]);
}

/**
 * 시뮬 결과의 이벤트와 스냅샷으로 소리 이벤트 목록을 만든다. transition 이벤트는 무시.
 * 큐 타격은 항상 t=0 에 하나 (큐볼이 움직였을 때만).
 */
export function mapSoundEvents(
    events: readonly SimEvent[],
    history: readonly Snapshot[],
    cueBallId: string,
): SoundEvent[] {
    const out: SoundEvent[] = [];
    if (history.length === 0) return out;

    const strike = speedXY(findBall(history[0], cueBallId));
    if (strike > IMPULSE_SILENT) out.push({ t: 0, kind: "strike", impulse: strike });

    for (const ev of events) {
        // 착지(ball-table, 엔진 2.2)는 아직 소리를 내지 않는다 — 전이처럼 건너뛴다.
        if (ev.type === "transition" || ev.type === "ball-table") continue;
        const before = history[snapshotBefore(history, ev.t)];
        if (ev.type === "ball-cushion") {
            const b = findBall(before, ev.ids[0]);
            if (!b) continue;
            const n = CUSHION_NORMAL[ev.cushion];
            const impulse = Math.abs(b.v[0] * n[0] + b.v[1] * n[1]);
            if (impulse > IMPULSE_SILENT) out.push({ t: ev.t, kind: "cushion", impulse });
            continue;
        }
        // ball-ball: 직전 속도, 직후 위치의 중심 연결선
        const a0 = findBall(before, ev.ids[0]);
        const b0 = findBall(before, ev.ids[1]);
        if (!a0 || !b0) continue;
        const after = history[snapshotAtOrAfter(history, ev.t)];
        const a1 = findBall(after, ev.ids[0]) ?? a0;
        const b1 = findBall(after, ev.ids[1]) ?? b0;
        let nx = b1.r[0] - a1.r[0], ny = b1.r[1] - a1.r[1];
        const len = Math.hypot(nx, ny);
        const rvx = a0.v[0] - b0.v[0], rvy = a0.v[1] - b0.v[1];
        let impulse: number;
        if (len > 1e-9) {
            nx /= len; ny /= len;
            impulse = Math.abs(rvx * nx + rvy * ny);
        } else {
            impulse = Math.hypot(rvx, rvy);
        }
        if (impulse > IMPULSE_SILENT) out.push({ t: ev.t, kind: "ball", impulse });
    }
    return out;
}
