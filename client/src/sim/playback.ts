/**
 * 재생 헬퍼(순수). simulateShot 결과의 history 를 벽시계 시각 t(샷 시작 기준, s)로 되감아 그릴 공 상태를 준다.
 *
 *  - makePlayback(result, ball): at(t) 는 [0, duration] 으로 클램프한 뒤 continuize.stateAt 으로 직전 스냅샷에서
 *    닫힌 식 전진(외삽 없음). t ≥ duration 이면 result.final 그대로(정지 상태라 할당도 없다).
 *    keyframes 는 1/120 s 격자 프레임을 처음 읽을 때 한 번만 만든다(스크럽·썸네일용).
 *  - ball 은 반드시 실효 파라미터(applyCondition 적용) — 물리 루프가 쓴 것과 같아야 재생이 이벤트 사이에서 어긋나지 않는다.
 *    effectiveBall(params) 가 그 값을 만든다.
 *  - eventsForFeedback: 결과 → 오디오·햅틱 이벤트(audioMapping.mapSoundEvents). 재생 시작 시 한 번에 예약한다.
 *  - PlaybackClock: 벽시계 → 재생 시각. 배속을 바꿔도 시각이 튀지 않도록 (baseT, baseNow) 를 갈아 끼운다.
 *
 * 결정론 규칙(dmath)은 결과를 만드는 엔진에만 적용된다. 여기는 그리는 쪽이라 Math.* 를 써도 되지만 쓸 일이 없다.
 */
import type { BallState, SimResult, Snapshot } from "@shared/sim/types";
import { applyCondition, type BallParams, type SimParams } from "@shared/sim/params";
import { frames, stateAt } from "@shared/sim/continuize";
import { mapSoundEvents, type SoundEvent } from "./audioMapping";

/** keyframes 격자 간격 (s). */
export const KEYFRAME_DT = 1 / 120;

export interface Playback {
    /** 총 재생 시간 (s). 0 이면 즉시 끝난다. */
    readonly duration: number;
    /** 시각 t(샷 시작 기준, s)의 모든 공. t 는 [0, duration] 으로 클램프, NaN 은 0. */
    at(t: number): readonly BallState[];
    /** 1/120 s 격자 프레임(끝 시각 포함). 처음 읽을 때 만들어 캐시한다. */
    readonly keyframes: readonly Snapshot[];
}

export type PlaybackSource = Pick<SimResult, "history" | "final" | "duration">;

/** 물리 루프가 실제로 쓴 공 파라미터(컨디션 반영). 재생·미리보기 모두 이것을 넘긴다. */
export function effectiveBall(params: SimParams): BallParams {
    return applyCondition(params.table.ball, params.condition);
}

export function makePlayback(result: PlaybackSource, ball: BallParams): Playback {
    const h = result.history;
    const t0 = h.length > 0 ? h[0].t : 0;
    const duration = Number.isFinite(result.duration) && result.duration > 0 ? result.duration : 0;
    let cache: readonly Snapshot[] | null = null;
    return {
        duration,
        at(t: number): readonly BallState[] {
            if (!(t > 0)) t = 0;                       // 음수·NaN → 시작
            if (t >= duration || h.length === 0) return result.final;
            return stateAt(result, t0 + t, ball);
        },
        get keyframes(): readonly Snapshot[] {
            if (cache === null) cache = h.length > 0 ? frames(result, KEYFRAME_DT, ball) : [];
            return cache;
        },
    };
}

/** 결과 → 소리·햅틱 이벤트(샷 시작 기준 t). SimAudio.schedule / SimHaptics.schedule 에 그대로 넘긴다. */
export function eventsForFeedback(result: Pick<SimResult, "events" | "history" | "input">): SoundEvent[] {
    return mapSoundEvents(result.events, result.history, result.input.cueBallId);
}

/* ------------------------------------------------------------------ 벽시계 */

/** 재생 시계. 불변 — 배속을 바꾸면 새 값을 만든다. */
export interface PlaybackClock {
    /** baseNow 시점의 재생 시각 (s) */
    readonly baseT: number;
    /** performance.now() 기준 ms */
    readonly baseNow: number;
    readonly speed: number;
}

export function startClock(nowMs: number, speed = 1): PlaybackClock {
    return { baseT: 0, baseNow: nowMs, speed: speed > 0 ? speed : 1 };
}

/** nowMs 시점의 재생 시각 (s). 시계가 거꾸로 가도(드물지만) baseT 아래로는 내려가지 않는다. */
export function clockTime(c: PlaybackClock, nowMs: number): number {
    const dt = (nowMs - c.baseNow) / 1000;
    return c.baseT + (dt > 0 ? dt : 0) * c.speed;
}

/** 배속 변경. 현재 시각을 기준점으로 옮겨 연속성을 지킨다. 같은 배속이면 그대로 돌려준다. */
export function withSpeed(c: PlaybackClock, nowMs: number, speed: number): PlaybackClock {
    const s = speed > 0 ? speed : 1;
    if (s === c.speed) return c;
    return { baseT: clockTime(c, nowMs), baseNow: nowMs, speed: s };
}
