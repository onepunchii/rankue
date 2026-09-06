# shared/sim — 캐롬 물리 엔진 v2 (계약서)

이 문서는 모듈 경계와 함수 시그니처의 **계약**이다. 구현자는 여기 적힌 이름·인자·반환을 그대로 지키고,
바꿔야 하면 이 문서를 먼저 고친다. 타입은 `types.ts`, 파라미터는 `params.ts`, 출처는 `NOTICE.md`.

## 절대 규칙
1. **초월함수 금지.** `Math.sin/cos/tan/atan/atan2/asin/acos/exp/log/pow/hypot/cbrt/random/fround` 를 이 폴더에서
   쓰지 않는다. 필요하면 `dmath.ts` 의 함수를 쓴다. 허용: `+ − × ÷`, `Math.sqrt`, `Math.abs`, `Math.floor`,
   `Math.ceil`, `Math.min/max`, `Math.sign`, `Math.trunc`, `Number.isFinite`. 테스트가 grep 으로 검사한다.
2. **입력 불변.** 어떤 함수도 인자로 받은 배열·객체를 바꾸지 않는다. 새 값을 만들어 돌려준다.
3. **시각·난수 금지.** `Date`, `performance`, `Math.random` 사용 금지. 난수는 `rng.ts` 의 시드 PRNG 만.
4. **DOM·three.js·Node 금지.** import 는 이 폴더 안의 상대 경로만.
5. **동시 이벤트 순서 고정.** 두 후보의 dt 차이가 1e-9 s 이하이면 (type 순위: transition < ball-cushion < ball-ball) →
   ids 사전순 → cushion id 사전순으로 결정한다. 이 규칙이 리플레이를 재현 가능하게 만든다.
6. **테스트 동반.** 모듈마다 `*.test.ts` 를 같은 폴더에 둔다. `npm test` 는 `vitest run`.

## 좌표·부호 규약
- x ∈ [0, width] 짧은 변, y ∈ [0, length] 긴 변, z 위. 공 중심 z = R (v2.0 은 z 운동 없음).
- 각속도 ω: 오른손 법칙. 구르는 공: ω_xy = (1/R)·(k̂ × v). 접점 미끄럼 속도 u = v + ω × (−R k̂) = (v_x − R ω_y, v_y + R ω_x, 0).
- 큐 방향 d = (cos φ, sin φ). "오른쪽" = d 를 −90° 돌린 (sin φ, −cos φ).
  팁 오프셋 a>0 (오른쪽 사이드) 는 토크 (a R right) × (F d) = +aRF k̂ 이므로 **ω_z > 0 (위에서 봐서 반시계)**.
  b>0 (중심 위, 밀어치기) 는 진행 방향 앞으로 구르는 스핀: ω_xy 가 k̂ × d 방향(+).
- 쿠션 법선은 테이블 안쪽. 쿠션 코 높이 h 로 접촉 법선이 기울어진 각 θ: sin θ = (h − R)/R.

## 모듈과 시그니처

```
dmath.ts
  export const PI, TWO_PI, HALF_PI
  export function sin(x), cos(x), tan(x), atan(x), atan2(y, x), asin(x), acos(x), exp(x), log(x), cbrt(x): number
  export function hypot2(x, y): number        // Math.sqrt(x*x + y*y)
  export const sqrt = Math.sqrt
  // fdlibm 알고리즘의 순수 산술 포팅. Math.* 와 ≤ 1 ulp, 특수값(0, ±Infinity, NaN, π/2 등) 처리 동일.

vec.ts   (Vec3 순수 함수, 새 튜플 반환)
  add, sub, scale(v, s), dot, cross, length, lengthSq, unit(v) (영벡터면 [0,0,0]), negate, upCross(v) = k̂ × v, lerp
  angleOf(v): dmath.atan2(v[1], v[0])

roots/quadratic.ts
  export function solveQuadratic(a, b, c): number[]           // 실근만, 오름차순. a≈0 이면 1차로 강등
roots/quartic.ts
  export function solveQuartic(a, b, c, d, e): number[]       // Algorithm 1010 (Orellana & De Michele 2020) 실근만, 오름차순.
                                                             // pooltool _quartic_numba.py 의 d2 safety factor 포함. 계수가 퇴화하면 3차/2차로 강등.
  export function smallestPositiveRoot(roots: readonly number[], eps = 1e-9): number   // 없으면 Infinity

evolve.ts   (Leckie & Greenspan / pooltool evolve, 닫힌 식)
  export function slipVelocity(b: BallState, p: BallParams): Vec3
  export function evolveBall(b: BallState, dt: number, p: BallParams): BallState   // 상태 전이는 하지 않고 dt 만큼 전진(호출자가 전이 시각 이전만 호출)
  export function slideTime(b, p): number   // 미끄럼→구름까지 남은 시간, 해당 없으면 Infinity
  export function rollTime(b, p): number    // 구름→스핀(정지 직전)까지
  export function spinTime(b, p): number    // 스핀→정지까지
  export function nextTransition(b, p): EventCandidate | null
  export function positionPolynomial(b, p): { r0: Vec3; r1: Vec3; r2: Vec3 }   // r(t) = r0 + r1·t + r2·t² (현재 상태의 가속도 기준)
  export function kineticEnergy(b, p): number  // ½ m v² + ½ I ω²

detect/ballBall.ts
  export function ballBallTime(b1: BallState, b2: BallState, p: BallParams): number
    // 두 공의 상대 위치 다항식으로 |Δr(t)|² = (2R)² 의 최소 양근. 이미 접촉 중이고 멀어지는 중이면 Infinity. 둘 다 정지면 Infinity.
detect/ballCushion.ts
  export function ballCushionTime(b: BallState, seg: CushionSegment, p: BallParams): number
    // 코 라인까지 부호 거리 = R 이 되는 최소 양근(2차). 세그먼트 범위 안 + 쿠션 쪽으로 이동 중일 때만.
detect/index.ts
  export function nextEvent(balls: readonly BallState[], segs: readonly CushionSegment[], p: BallParams): EventCandidate | null
    // 모든 후보 중 최소 dt. 동률은 절대 규칙 5 로 결정. dt ≤ 0 인 후보는 제외.

resolve/stickBall.ts
  export function strike(cueBall: BallState, input: ShotInput, p: BallParams, cue: CueParams): BallState
    // TP A.30 (pooltool instantaneous point): v = 2V0/(1 + m/M + [a² + (b cosθ)² + (c sinθ)² − 2bc cosθ sinθ]/((2/5)R²)) × tipEfficiency,
    // ω = (v/((2/5)R²))·(−c sinθ + b cosθ, a sinθ, −a cosθ) 큐 프레임 → 테이블 프레임 회전.
    // TP A.31 스쿼트: α = atan2(2.5·a·√(1−a²), 1 + endmassRatio + 2.5(1−a²)) 만큼 v 와 ω 를 오프셋 반대쪽으로 회전.
    // |a|,|b| ≤ maxOffset, a²+b² ≤ maxOffset² 아니면 throw RangeError("miscue"). 결과 state = 'sliding'.
resolve/ballBall.ts
  export function ballBallFriction(vRel: number, p: BallParams): number       // a + b·exp(−c·vRel)
  export function resolveBallBall(b1: BallState, b2: BallState, p: BallParams): readonly [BallState, BallState]
    // pooltool FrictionalInelastic: 법선 v1n' = ½((1−e)v1n + (1+e)v2n); 접선 임펄스는 Coulomb(μ·ΔVn) 과 무슬립(−(1/7)(v1−v2 + R(ω1+ω2)×n̂)) 중 작은 것;
    // Δω = (2.5/R) n̂ × ΔV_t. z 성분 제거. 둘 다 state 'sliding'. 반환 순서 = 입력 순서.
resolve/cushion/han2005.ts
  export function resolveCushionHan(b: BallState, seg: CushionSegment, p: BallParams, cushionHeight: number): BallState
    // Han 2005 (pooltool han_2005/model.py): 프레임 회전 → s_x, s_y, c → P_zE = m c (1+e), P_zS = (2m/7)√(s_x²+s_y²)
    // grip(P_zS ≤ μ P_zE) 와 slip 분기 → 역회전. 결과 z 속도 0, state 'sliding'.
resolve/cushion/sphereHalfSpace.ts
  export function resolveCushionSHS(b, seg, p, cushionHeight): BallState
    // pooltool sphere_half_space_collision 2D: ΔV⊥ = (1+e)(−v_n), 접선은 Coulomb μ_k ΔV⊥ 와 stick (2/7)(R ω×ẑ − v) 중 작은 것, 스핀 갱신.
resolve/cushion/mathavan2010.ts
  export function resolveCushionMathavan(b, seg, p, cushionHeight, steps = 2000): BallState
    // Mathavan 2010 임펄스 스텝(압축: v_y ≤ 0 까지 + 8단계 이분 정제, 복원: W ≥ e_e²·W_c 까지). 고정 steps 라 결정론적.
resolve/cushion/index.ts
  export function resolveCushion(model: CushionModelId, b, seg, p, cushionHeight): BallState
resolve/transition.ts
  export function applyTransition(b: BallState, to: MotionState, p: BallParams): BallState
    // 정준 전이: rolling 진입 시 ω_xy 를 정확히 (1/R)k̂×v 로, spinning 진입 시 v=0·ω_xy=0, stationary 진입 시 전부 0. |x|<1e-12 스냅.
resolve/kiss.ts
  export function makeKiss(b1, b2, p, spacer = 1e-9): readonly [BallState, BallState]   // 궤적을 따라 정확히 2R+spacer 로 분리
  export function resolveContinuallyTouching(b1, b2, p): readonly [BallState, BallState] // 반경 방향 상대속도 < 1e-3 m/s 면 쫓기는 공이 10% 운동량을 가져감

simulate.ts
  export const MAX_EVENTS = 2000
  export function simulateShot(balls: readonly BallState[], input: ShotInput, params: SimParams): SimResult
  export function simulateFrom(balls: readonly BallState[], params: SimParams, t0 = 0): Omit<SimResult, "input">
    // 루프: nextEvent → 모든 공 evolveBall(dt) → 해당 이벤트 하나만 resolve → history 에 스냅샷 push → 반복.
    // 이벤트 없음(전부 stationary) 이면 종료. MAX_EVENTS 초과면 truncated=true.
    // 각 resolve 후 불변 검사(디버그): 겹침 없음, 에너지 비증가(허용 1e-9 상대) — 위반 시 console 이 아니라 결과의 warnings 에 기록하지 말고 throw 하지도 말 것; 테스트에서만 검사한다.
continuize.ts
  export function stateAt(result: Pick<SimResult,"history">, t: number, p: BallParams): readonly BallState[]   // 직전 스냅샷에서 evolveBall
  export function frames(result, dt, p): readonly Snapshot[]
hash.ts
  export function hashResult(events: readonly SimEvent[], final: readonly BallState[]): string
    // FNV-1a 64비트(두 개의 32비트, Math.imul). 입력은 이벤트의 (type, t, ids, cushion/from/to) 와 최종 상태 (id, r, v, w, state) 의 Float64 비트 패턴. 16진 16자리.
rng.ts
  export function mulberry32(seed: number): () => number
version.ts
  export const ENGINE_VERSION = "2.0.0"
  export function paramsHash(params: SimParams): string    // JSON 정렬 직렬화 → FNV-1a
index.ts   전부 재수출
```

## 테스트 층
- **A 불변량**(`simulate.test.ts`): 시드 고정 무작위 샷 1000개 × 대대/중대 × 3구/4구 배치. 매 이벤트 후 운동에너지 비증가, 모든 공 [R, W−R]×[R, L−R] 안, 어떤 두 공도 2R − 1e-9 미만으로 안 겹침, 이벤트 시각 단조증가, 종료(truncated=false), 같은 입력 두 번 → 해시 동일.
- **B 물리 단위**: pooltool 의 테스트 불변량(정면 무스핀, e_b 분리비, 대칭 쌍 유지, z-스핀 → 던지기 방향, 기어링 스핀 → 던지기 0, 낮은 상대속도 → 접점 상대속도 0, 쿠션 에너지 비증가, y 대칭), TP A.4 5/7 법칙, TP A.16 자연구름 정지거리, 45° 무스핀 입사 = 반사, 순방향 잉글리시 → 반사각 커짐·속도 증가 가능, 역방향 잉글리시 80–90° 입사 → 같은 쪽으로 되돌아옴, 코너 정확 입사 → 쿠션 이벤트 2개, 반두께(8 m/s) 분리각 ≈ 60° ± 3°(던지기 포함), 3 m/s 구름 공이 대대에서 쿠션 4개 이상 통과.
- **C 적합성**: 200개 픽스처 샷의 해시를 `fixtures/golden.json` 에 고정. 갱신은 `UPDATE_GOLDEN=1 npm test` 로만. 금지 함수 grep 테스트.
- **D 오라클**: Python pooltool 로 같은 샷을 돌려 최종 위치를 비교(별도 스크립트, `scripts/sim-oracle/`).
