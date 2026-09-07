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
 *  - 접점 오프셋 (a, b) 는 **큐 축에 수직한 평면**에서 잰다 — 선수가 큐를 따라 내려다본 공 면의 좌우·상하
 *    (TP A.19 의 정의, pooltool InstantaneousPoint3D 가 cue-frame 오프셋을 볼 프레임으로 회전해 넣는 것과 같다).
 *    a>0 은 큐 진행 방향의 오른쪽, b>0 은 큐 축 기준 위, c = √(R² − a² − b²) 는 큐 축을 따라 들어간 깊이.
 *    큐 축 단위벡터 Ĵ = cosθ d̂ − sinθ k̂ (앞·아래), 큐 축에 수직한 "위" ĵ⊥ = sinθ d̂ + cosθ k̂, 오른쪽 r̂ = −L̂ 이면
 *      Q = a R r̂ + b R ĵ⊥ − c R Ĵ
 *    임펄스는 큐 축 방향이라 c 항은 Ĵ × Ĵ = 0 으로 사라지고, (d̂, L̂, k̂) 가 오른손계(d̂ × L̂ = k̂)이므로
 *      r̂ × Ĵ = sinθ d̂ + cosθ k̂,   ĵ⊥ × Ĵ = L̂   →   Q × Ĵ = R·[ b L̂ + a sinθ d̂ + a cosθ k̂ ]
 *    즉 |Q × Ĵ|² = (a² + b²)R² 로 TP A.30 식 7 그대로이고, ω 의 L̂ 성분(밀어치기·끌어치기)은 θ 와 무관하다
 *    (TP A.19: ω_x ∝ b, ω_y ∝ a sinφ). pooltool 의 ball_b = sinθ·c + cosθ·b, ball_c = cosθ·c − sinθ·b 를
 *    θ-식 (b' cosθ − c' sinθ) 에 넣으면 정확히 b 가 되므로 이 정리는 pooltool 3D 와 대수적으로 동일하다.
 *    검산: a>0(오른쪽 사이드) → ω_z > 0 (위에서 봐서 반시계). b>0(밀어치기) → ω_xy 가 k̂ × d̂ 방향 = 앞으로 구르는 스핀.
 *    θ>0 이면 a 가 큐 방향 축 스핀(ω_d)을 만든다 — 마세이·커브는 미끄럼 상태에서 자연히 나온다. 큐를 들고
 *    중심(a = b = 0)을 치면 임펄스가 중심을 지나므로 ω = 0 이다(테이블 프레임 해석이었다면 가짜 끌어치기가 생긴다 —
 *    40-physics-review Finding 2).
 *  - 팁 효율 η(tipEfficiency): 가죽 팁의 비탄성으로 실제 임펄스가 탄성 해보다 작다. η 는 v 에 정의된 값이므로
 *    v 에 곱하고, ω 는 그 v 로부터 (v/I_m)(Q × Ĵ) 로 계산한다 — 임펄스가 하나이므로 ω 도 같은 비율로 준다.
 *  - 속도는 큐 축을 따라 나간다(v2.2, pooltool InstantaneousPoint3D 의 v_B = −v(0, cosθ, sinθ)): 수평 v cosθ, 수직 −v sinθ
 *    (슬레이트 쪽). θ > 0 이면 state 'airborne' 이고 z = R 이라 simulate 의 즉시 스윕이 dt = 0 착지(ball-table)를 해석한다 —
 *    그 착지의 반발(eT)이 점프를, 슬레이트 마찰과 이어지는 미끄럼이 마세이 커브를 만든다(TP A.19 의 v_yo = v_e cosφ 는
 *    착지 뒤 수평 속도에 해당). θ = 0 이면 v_z 는 정확히 +0 이고 state 'sliding' 으로 2.1.0 과 비트 단위로 같다
 *    (0 − v·sinθ 로 계산해 −0 이 나오지 않게 한다 — 해시가 부호를 구분한다).
 *  - 스쿼트(TP A.31 식 13, pooltool get_squirt_angle): 샤프트 엔드매스 m_e 가 오프셋 쪽으로 밀려나고 그 반작용으로
 *    공은 오프셋 반대쪽으로 α 만큼 튼다.
 *      tan α = (5/2)·a·√(1 − a²) / (1 + m_b/m_e + (5/2)(1 − a²))     (a 는 R 비율)
 *    오른쪽 사이드(a>0) → 공은 왼쪽으로 → 위에서 봐서 반시계(+α) 회전. README 대로 v 와 ω 를 함께 돌린다
 *    (ω_z 는 k̂ 축 회전에 불변). 구현은 기저 자체를 φ + α 로 만들어 두 벡터를 한 번에 돌린다.
 *    pooltool 은 v 만 돌리고 ω 는 큐 프레임 φ 에 둔다(42-oracle-report §4.2) — 최대 오프셋에서 스핀 축 2–3° 차이.
 *    TP A.31 은 ω 를 다루지 않아 문헌으로 가를 수 없으므로 "틀어진 임펄스의 각임펄스도 함께 틀어진다"는 우리
 *    해석을 유지한다. 실측(사이드 샷의 커브 방향)과 어긋나면 재검토.
 *  - 미스큐: |a|, |b| ≤ maxOffset, a² + b² ≤ maxOffset² 를 넘으면 RangeError("miscue"). NaN 도 걸리도록 부정형으로 검사.
 *
 * 결과 state 는 θ = 0 이면 'sliding'(중심 타격이라도 접점 미끄럼 u = v ≠ 0 이므로 미끄럼이 맞고, 전이는 evolve 가 처리한다),
 * θ > 0 이면 'airborne'(v_z < 0).
 * 초월함수는 dmath 만 쓴다(sin/cos/atan2). 입력은 변형하지 않는다.
 */
import type { BallState, ShotInput, Vec3 } from "../types.js";
import type { BallParams, CueParams } from "../params.js";
import { atan2, cos, sin } from "../dmath.js";

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
    const aM = a * R;                                   // 큐 축에 수직한 평면의 접점 오프셋 (m)
    const bM = b * R;
    const ct = cos(theta);
    const st = sin(theta);
    const Im = 0.4 * R * R;                             // I/m = (2/5)R²

    // |Q × Ĵ|² = (a² + b²)R² — 큐 축 방향 깊이 c 는 임펄스와 평행이라 레버암이 없다 (파일 머리 주석, TP A.30 식 7)
    const temp = aM * aM + bM * bM;
    const vElastic = (2 * V0) / (1 + p.m / cue.M + temp / Im);
    const v = vElastic * cue.tipEfficiency;

    // ω = (v/I_m)(Q × Ĵ): 큐 프레임 성분 (왼쪽 L̂, 큐 방향 d̂, 위 k̂). L̂ 성분은 θ 와 무관(TP A.19).
    const k = v / Im;
    const wL = k * bM;
    const wD = k * aM * st;
    const wZ = k * aM * ct;

    // 큐 축을 따라: 수평 v cosθ, 수직 −v sinθ. v ≥ 0, sinθ ≥ 0 이라 v·st ≥ +0 이고 0 − (+0) = +0 (θ = 0 에서 −0 금지).
    const vH = v * ct;
    const vZ = 0 - v * st;

    // 스쿼트: 기저를 φ + α 로 만들어 v 와 ω_xy 를 함께 돌린다
    const psi = phi + squirtAngle(a, cue.endmassRatio);
    const cp = cos(psi);
    const sp = sin(psi);
    // d̂' = (cp, sp, 0), L̂' = k̂ × d̂' = (−sp, cp, 0)
    const vOut: Vec3 = [vH * cp, vH * sp, vZ];
    const wOut: Vec3 = [wD * cp - wL * sp, wD * sp + wL * cp, wZ];

    return {
        id: cueBall.id,
        r: [cueBall.r[0], cueBall.r[1], cueBall.r[2]],
        v: vOut,
        w: wOut,
        state: vZ !== 0 ? "airborne" : "sliding",
    };
}
