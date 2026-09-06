/**
 * resolve/kiss.ts — 공–공 충돌의 수치 안정화 두 가지.
 *
 * 출처: pooltool <pooltool/physics/resolve/ball_ball/core.py> (make_kiss, _apply_fallback_positioning,
 *       resolve_continually_touching, Apache-2.0, NOTICE.md). 이 두 기법이 이벤트 기반 엔진을 실전에서
 *       버티게 한다 — 11-oss-engines.md §3.1.
 *
 * 1. makeKiss — 충돌 순간 두 공의 중심 거리를 정확히 2R + spacer 로 맞춘다.
 *    감지기가 준 근으로 전진한 위치는 2R 에서 1e-16 급으로 벗어나 있고, 그 부호가 음수(겹침)면 다음 감지에서
 *    "겹친 채 접근 중"이라는 모호한 상태가 된다. 두 공을 각자의 속도 방향으로(직선 근사, 가속도 무시)
 *    |(r2 − r1) + (v2 − v1) t| = 2R + spacer 를 푸는 |t| 가 가장 작은 시각만큼 움직여 분리한다.
 *    둘 다 병진하지 않거나, 근이 없거나(같은 속도), 중점이 5·spacer 넘게 움직이면(속도가 거의 같아 t 가
 *    커진 경우) 중심선을 따라 대칭으로 밀어 벌리는 폴백을 쓴다.
 *
 * 2. resolveContinuallyTouching — 충돌 해석 뒤 반경 방향 분리 속도가 거의 0 이고 두 공이 같은 방향으로
 *    움직이면(뒤 공이 앞 공을 밀고 가는 뉴턴 요람 꼴), 순간 충돌 모델은 마이크로초 간격의 미세 충돌을
 *    무한히 만들어 이벤트 폭풍이 된다. 현상학적 처방: 쫓기는(앞) 공이 쫓는(뒤) 공의 반경 방향 속도의
 *    10 % 를 가져가 둘을 확실히 떼어 놓는다.
 *    pooltool 과 다른 점 두 가지 (README 시험 층 A "매 이벤트 후 운동에너지 비증가"를 지키기 위해):
 *     - 질량이 같을 때 순수 운동량 이전(뒤 공 −10 %, 앞 공 +10 %)은 속도 차를 키우므로 반드시 운동에너지를
 *       늘린다(합이 고정된 두 수의 제곱합은 같을 때 최소). 그래서 앞 공은 정확히 10 % 를 받고, 뒤 공은 두 공의
 *       반경 방향 운동에너지가 변하지 않도록 조금 더(≈ 11 %) 내놓는다. 잃는 운동량 ≈ 1 % 는 천 마찰과 같은
 *       외부 싱크로 본다(이 계는 원래 운동량이 보존되지 않는다).
 *     - "쫓는 공"은 라벨 순서가 아니라 기하로 정한다: 두 공이 함께 움직이는 방향의 뒤쪽 공. pooltool 은
 *       반경 속도가 큰 쪽을 쫓는 공으로 잡아, 앞 공이 조금 더 빠른(이미 벌어지는) 경우 오히려 접근시킨다.
 *
 * 초월함수 없음. 입력 불변.
 */
import type { BallState, Vec3 } from "../types";
import type { BallParams } from "../params";
import { add, dot, length, scale, sub, unit } from "../vec";
import { solveQuadratic } from "../roots/quadratic";

/** README 계약 기본값. 감지기의 "접촉" 판정 폭(EVENT_EPS = 1e-9 m)과 같다. */
export const DEFAULT_SPACER = 1e-9;
/** 이 값(m/s) 미만의 반경 방향 분리 속도는 "계속 닿아 있음"으로 본다 (README: 1e-3). */
export const CONTINUAL_TOUCH_EPS = 1e-3;
/** 쫓기는 공이 가져가는 비율. */
export const THEFT_FRACTION = 0.1;
/** 두 공의 속도 방향 코사인 유사도가 이보다 커야 "함께 움직임"으로 본다 (pooltool 0.9). */
export const ALIGNMENT_COS = 0.9;

/** 테스트용 진단 카운터. 결과에는 영향이 없다. */
export const kissDebug = { fallbacks: 0 };

function withPosition(b: BallState, r: Vec3): BallState {
    return {
        id: b.id,
        r: [r[0], r[1], r[2]],
        v: [b.v[0], b.v[1], b.v[2]],
        w: [b.w[0], b.w[1], b.w[2]],
        state: b.state,
    };
}

function withVelocity(b: BallState, v: Vec3): BallState {
    return {
        id: b.id,
        r: [b.r[0], b.r[1], b.r[2]],
        v: [v[0], v[1], v[2]],
        w: [b.w[0], b.w[1], b.w[2]],
        state: b.state,
    };
}

function isTranslating(b: BallState): boolean {
    if (b.state === "stationary" || b.state === "spinning") return false;
    return b.v[0] !== 0 || b.v[1] !== 0 || b.v[2] !== 0;
}

/** 중심선을 따라 대칭으로 밀어 정확히 target 거리로. 중심이 겹치면 +x 를 중심선으로 쓴다. */
function fallbackPositions(r1: Vec3, r2: Vec3, target: number): readonly [Vec3, Vec3] {
    let n = unit(sub(r2, r1));
    if (n[0] === 0 && n[1] === 0 && n[2] === 0) n = [1, 0, 0];
    const correction = target - length(sub(r2, r1));
    return [add(r1, scale(n, -0.5 * correction)), add(r2, scale(n, 0.5 * correction))];
}

/**
 * 두 공을 궤적을 따라(직선 근사) 정확히 2R + spacer 로 분리한 새 상태 쌍. 속도·각속도·상태는 그대로.
 * 계약: README "resolve/kiss.ts".
 */
export function makeKiss(b1: BallState, b2: BallState, p: BallParams, spacer = DEFAULT_SPACER): readonly [BallState, BallState] {
    const target = 2 * p.R + spacer;
    const r1 = b1.r, r2 = b2.r;
    let out: readonly [Vec3, Vec3] | null = null;

    if (isTranslating(b1) || isTranslating(b2)) {
        // |C + B t|² = target²  (C = r2 − r1, B = v2 − v1)
        const B = sub(b2.v, b1.v);
        const C = sub(r2, r1);
        const alpha = dot(B, B);
        const beta = 2 * dot(B, C);
        const gamma = dot(C, C) - target * target;
        const roots = solveQuadratic(alpha, beta, gamma);
        if (roots.length > 0) {
            let t = roots[0];
            for (let i = 1; i < roots.length; i++) {
                if (Math.abs(roots[i]) < Math.abs(t)) t = roots[i];
            }
            const n1 = add(r1, scale(b1.v, t));
            const n2 = add(r2, scale(b2.v, t));
            // 중점 이동 = |(v1 + v2)/2 · t|. 5·spacer 를 넘으면 직선 근사가 무의미 → 폴백.
            const shift = length(scale(add(b1.v, b2.v), 0.5 * t));
            if (shift <= 5 * spacer) out = [n1, n2];
        }
    }
    if (out === null) {
        kissDebug.fallbacks++;
        out = fallbackPositions(r1, r2, target);
    }
    return [withPosition(b1, out[0]), withPosition(b2, out[1])];
}

/**
 * 충돌 해석 직후의 두 공. 반경 방향 분리 속도가 CONTINUAL_TOUCH_EPS 미만이고 둘 다 같은 방향으로 움직이면
 * 앞(쫓기는) 공이 뒤(쫓는) 공의 반경 방향 속도 10 % 를 가져간다(파일 머리 주석의 에너지 중립 변형).
 * 조건에 걸리지 않으면 **입력 객체 그대로** [b1, b2] 를 돌려준다(호출자가 참조 비교로 발동 여부를 안다).
 */
export function resolveContinuallyTouching(b1: BallState, b2: BallState, p: BallParams): readonly [BallState, BallState] {
    void p;
    const s1 = length(b1.v);
    const s2 = length(b2.v);
    if (!(s1 > 0 && s2 > 0)) return [b1, b2];

    const loc = unit(sub(b2.r, b1.r));
    if (loc[0] === 0 && loc[1] === 0 && loc[2] === 0) return [b1, b2];

    const v1l = dot(b1.v, loc);
    const v2l = dot(b2.v, loc);
    if (!(Math.abs(v2l - v1l) < CONTINUAL_TOUCH_EPS)) return [b1, b2];

    const cosSim = dot(b1.v, b2.v) / (s1 * s2);
    if (!(cosSim > ALIGNMENT_COS)) return [b1, b2];

    // 두 공이 함께 움직이는 반경 방향 f. f = +loc 이면 공 2 가 앞(쫓기는 쪽), −loc 이면 공 1 이 앞.
    const forward = v1l + v2l >= 0;
    const chaserU = forward ? v1l : -v2l;     // 뒤 공의 f 방향 속도
    const chasedU = forward ? v2l : -v1l;     // 앞 공의 f 방향 속도
    if (!(chaserU > 0)) return [b1, b2];      // 뒤 공이 앞으로 가지 않으면 "쫓음"이 아니다

    const delta = THEFT_FRACTION * chaserU;
    const chasedNew = chasedU + delta;
    // 반경 방향 운동에너지 보존: c'² = c² − 2hΔ − Δ². 음수면 뒤 공의 반경 속도를 0 으로 두고 앞 공이 나머지를 받는다.
    const sq = chaserU * chaserU - 2 * chasedU * delta - delta * delta;
    let chaserNew: number;
    let chasedFinal = chasedNew;
    if (sq >= 0) {
        chaserNew = Math.sqrt(sq);
    } else {
        chaserNew = 0;
        chasedFinal = Math.sqrt(chaserU * chaserU + chasedU * chasedU);
    }

    const f: Vec3 = forward ? loc : [-loc[0], -loc[1], -loc[2]];
    const dChaser = chaserNew - chaserU;
    const dChased = chasedFinal - chasedU;
    const v1 = add(b1.v, scale(f, forward ? dChaser : dChased));
    const v2 = add(b2.v, scale(f, forward ? dChased : dChaser));
    return [withVelocity(b1, v1), withVelocity(b2, v2)];
}
