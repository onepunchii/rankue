/**
 * resolve/stickBall.ts — 큐 타격(stick–ball) 해석. TP A.30 (속도·스핀) + TP A.31 (스쿼트).
 *
 * 출처: Alciatore TP A.30, TP A.31 (NOTICE.md),
 *       pooltool <pooltool/physics/resolve/stick_ball/instantaneous_point/__init__.py>,
 *       pooltool <pooltool/physics/resolve/stick_ball/squirt.py> (Apache-2.0).
 *
 * 물리 요약
 *  - 큐와 공의 접촉은 순간적·점접촉. 접점 Q 를 지나 큐 축 방향으로 임펄스 P 가 한 번 전달된다.
 *    선운동량·각운동량·(탄성) 에너지 보존을 같이 풀면 (TP A.30 식 1–7, pooltool cue_strike 의 3차원 일반화):
 *      v = 2V0 / (1 + m/M + |Q × Ĵ|² / I_m),   I_m = I/m = (2/5)R²
 *      ω = (v / I_m) · (Q × Ĵ)                 ← 각임펄스 Q × P = I ω, P = m v Ĵ
 *    여기서 Q 는 공 중심 기준 접점(m), Ĵ 는 임펄스 단위방향. 두 식은 같은 임펄스 P 에서 나오므로
 *    v 와 ω 는 서로 묶여 있다(ω = (5/2) v·(오프셋)/R² — TP A.30 식 6).
 *  - 접점: README 규약대로 a>0 은 큐 진행 방향의 오른쪽, b>0 은 중심 위, c = √(R² − a² − b²) 는 큐 쪽 깊이.
 *      Q = a R r̂ − c R d̂ + b R k̂       (r̂ = 오른쪽, d̂ = 큐 방향, k̂ = 위)
 *    큐 들림각 θ 의 임펄스 방향은 앞·아래로: Ĵ = cosθ d̂ − sinθ k̂. 외적을 풀면
 *      Q × Ĵ = R·[ (b cosθ − c sinθ) L̂ + a sinθ d̂ + a cosθ k̂ ],   L̂ = k̂ × d̂ (왼쪽)
 *    이것이 README 의 (−c sinθ + b cosθ, a sinθ, −a cosθ) 큐 프레임 식과 같다(pooltool 은 왼쪽이 +a 라 부호만 반대).
 *    검산: a>0(오른쪽 사이드) → ω_z > 0 (위에서 봐서 반시계). b>0(밀어치기) → ω_xy 가 k̂ × d̂ 방향 = 앞으로 구르는 스핀.
 *    θ>0 이면 a 가 큐 방향 축 스핀(ω_d)을, c 가 끌어치기 성분(−c sinθ)을 만든다 — 마세이·커브는 미끄럼 상태에서 자연히 나온다.
 *  - 팁 효율 η(tipEfficiency): 가죽 팁의 비탄성으로 실제 임펄스가 탄성 해보다 작다. η 는 v 에 정의된 값이므로
 *    v 에 곱하고, ω 는 그 v 로부터 (v/I_m)(Q × Ĵ) 로 계산한다 — 임펄스가 하나이므로 ω 도 같은 비율로 준다.
 *  - v2.0 은 z 운동이 없다: 속도의 수직 성분(−v sinθ)은 슬레이트가 흡수한다고 보고 수평 성분 v cosθ 만 남긴다
 *    (pooltool InstantaneousPoint2D 가 v_z 를 0 으로 두는 것과 같다. TP A.19 의 v_yo = v_e cosφ).
 *  - 스쿼트(TP A.31 식 13, pooltool get_squirt_angle): 샤프트 엔드매스 m_e 가 오프셋 쪽으로 밀려나고 그 반작용으로
 *    공은 오프셋 반대쪽으로 α 만큼 튼다.
 *      tan α = (5/2)·a·√(1 − a²) / (1 + m_b/m_e + (5/2)(1 − a²))     (a 는 R 비율)
 *    오른쪽 사이드(a>0) → 공은 왼쪽으로 → 위에서 봐서 반시계(+α) 회전. README 대로 v 와 ω 를 함께 돌린다
 *    (ω_z 는 k̂ 축 회전에 불변). 구현은 기저 자체를 φ + α 로 만들어 두 벡터를 한 번에 돌린다.
 *  - 미스큐: |a|, |b| ≤ maxOffset, a² + b² ≤ maxOffset² 를 넘으면 RangeError("miscue"). NaN 도 걸리도록 부정형으로 검사.
 *
 * 결과 state 는 'sliding'. 중심 타격이라도 접점 미끄럼 u = v ≠ 0 이므로 미끄럼이 맞고, 전이는 evolve 가 처리한다.
 * 초월함수는 dmath 만 쓴다(sin/cos/atan2). 입력은 변형하지 않는다.
 */
import type { BallState, ShotInput, Vec3 } from "../types";
import type { BallParams, CueParams } from "../params";
import { atan2, cos, sin } from "../dmath";

/**
 * TP A.31 스쿼트 각 (rad). a 는 R 비율의 가로 오프셋(오른쪽 양수), endmassRatio = m_b/m_e.
 * 부호는 a 와 같다: a>0(오른쪽 사이드) → 양수 → 위에서 봐서 반시계 → 큐 방향의 왼쪽으로 튼다.
 */
export function squirtAngle(a: number, endmassRatio: number): number {
    const A = 1 - a * a;
    if (!(A > 0)) return 0;
    return atan2(2.5 * a * Math.sqrt(A), 1 + endmassRatio + 2.5 * A);
}

/**
 * 큐 타격. cueBall 의 위치·id 를 유지한 채 타격 직후 속도·각속도를 가진 새 BallState 를 돌려준다.
 * 계약: README "resolve/stickBall.ts". 오프셋이 maxOffset 을 넘으면 RangeError("miscue").
 */
export function strike(cueBall: BallState, input: ShotInput, p: BallParams, cue: CueParams): BallState {
    const { a, b, theta, V0, phi } = input;
    const max = cue.maxOffset;
    const offsetSq = a * a + b * b;
    // 부정형(!(x <= y))이라 NaN 도 미스큐로 거른다. a²+b² ≥ 1 이면 접점이 공 표면 밖 — 역시 미스큐.
    if (!(Math.abs(a) <= max) || !(Math.abs(b) <= max) || !(offsetSq <= max * max) || !(offsetSq < 1)) {
        throw new RangeError("miscue");
    }

    const R = p.R;
    const aM = a * R;                                   // 접점 오프셋 (m)
    const bM = b * R;
    const cM = Math.sqrt(R * R - aM * aM - bM * bM);    // 큐 쪽 깊이 (m)
    const ct = cos(theta);
    const st = sin(theta);
    const Im = 0.4 * R * R;                             // I/m = (2/5)R²

    // |Q × Ĵ|² = (b cosθ − c sinθ)² + a²  (a, b, c 는 m 단위) — TP A.30 식 7 의 x² 를 3차원으로 일반화
    const lever = bM * ct - cM * st;
    const temp = aM * aM + lever * lever;
    const vElastic = (2 * V0) / (1 + p.m / cue.M + temp / Im);
    const v = vElastic * cue.tipEfficiency;

    // ω = (v/I_m)(Q × Ĵ): 큐 프레임 성분 (왼쪽 L̂, 큐 방향 d̂, 위 k̂)
    const k = v / Im;
    const wL = k * lever;
    const wD = k * aM * st;
    const wZ = k * aM * ct;

    // 수평 속도만 남긴다 (v2.0: z 운동 없음)
    const vH = v * ct;

    // 스쿼트: 기저를 φ + α 로 만들어 v 와 ω_xy 를 함께 돌린다
    const psi = phi + squirtAngle(a, cue.endmassRatio);
    const cp = cos(psi);
    const sp = sin(psi);
    // d̂' = (cp, sp, 0), L̂' = k̂ × d̂' = (−sp, cp, 0)
    const vOut: Vec3 = [vH * cp, vH * sp, 0];
    const wOut: Vec3 = [wD * cp - wL * sp, wD * sp + wL * cp, wZ];

    return {
        id: cueBall.id,
        r: [cueBall.r[0], cueBall.r[1], cueBall.r[2]],
        v: vOut,
        w: wOut,
        state: "sliding",
    };
}
