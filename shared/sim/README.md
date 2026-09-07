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
5. **동시 이벤트 순서 고정.** 최소 dt 로부터 1e-9 s 이내의 후보들 중에서 (type 순위: transition < ball-table < ball-cushion < ball-ball) →
   ids 사전순 → cushion id 사전순(UTF-16 코드 단위 비교)으로 결정한다. 창은 최솟값에 고정되므로(쌍별 비교가 아니다)
   0 / +0.8 ns / +1.6 ns 체인에서 +1.6 ns 는 창 밖이다. 이 규칙이 리플레이를 재현 가능하게 만든다.
6. **테스트 동반.** 모듈마다 `*.test.ts` 를 같은 폴더에 둔다. `npm test` 는 `vitest run`.
7. **입력 검증.** simulateShot·simulateFrom 은 NaN·∞·범위 밖 입력(phi·V0·a·b·theta, 공의 r·v·w, condition ≤ 0, t0),
   중복 공 id, 알 수 없는 state 를 RangeError 로 거부한다. NaN 비트 패턴은 엔진마다 달라 해시에 들어가면 안 된다.

## 좌표·부호 규약
- x ∈ [0, width] 짧은 변, y ∈ [0, length] 긴 변, z 위. 천 위의 공은 중심 z = R 정확히(착지가 스냅한다), 공중(airborne)이면 z ≥ R (v2.2).
- 각속도 ω: 오른손 법칙. 구르는 공: ω_xy = (1/R)·(k̂ × v). 접점 미끄럼 속도 u = v + ω × (−R k̂) = (v_x − R ω_y, v_y + R ω_x, 0).
- 큐 방향 d = (cos φ, sin φ). "오른쪽" = d 를 −90° 돌린 (sin φ, −cos φ).
  팁 오프셋 (a, b) 는 **큐 축에 수직한 평면**(선수가 큐를 따라 내려다본 공 면)에서 잰다 — TP A.19, pooltool 3D 와 같다.
  a>0 (오른쪽 사이드) 는 토크 (a R right) × (F d) = +aRF k̂ 이므로 **ω_z > 0 (위에서 봐서 반시계)**.
  b>0 (큐 축 기준 위, 밀어치기) 는 진행 방향 앞으로 구르는 스핀: ω_xy 가 k̂ × d 방향(+), 크기는 θ 와 무관.
  큐를 들고(θ>0) 중심(a=b=0)을 치면 ω = 0 이다 — 테이블 수직 오프셋이 아니다. UI 는 변환 없이 그대로 넘긴다.
- 큐 들림각 θ (v2.2): 큐볼 속도는 큐 축을 따라 나간다 — 수평 v cosθ, 수직 −v sinθ(슬레이트 쪽). θ>0 이면 큐볼은 z = R 의 airborne 으로
  시작하고 첫 이벤트는 t = 0 의 착지(ball-table)다. 착지의 반발(eT)이 점프를, 착지 마찰 + 이어지는 미끄럼이 마세이 커브를 만든다
  (최종 구름 방향은 TP A.19/A.4 의 v_f = (5/7)v_h + (2/7)R(ω×k̂) 와 일치). θ = 0 은 2.1.0 과 비트 단위로 같다(fixtures/golden-theta0.json).
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
  export function evolveBall(b: BallState, dt: number, p: BallParams): BallState   // 상태 전이는 하지 않고 dt 만큼 전진(호출자가 전이·착지 시각 이전만 호출)
    // airborne(v2.2): r = r0 + v0 t − ½ g t² ẑ, v_z = v_z0 − g t, ω 불변(ω_z 감쇠도 없음). 천 위 상태는 z = R, v_z = 0 을 유지.
  export function slideTime(b, p): number   // 미끄럼→구름까지 남은 시간, 해당 없으면(airborne 포함) Infinity
  export function rollTime(b, p): number    // 구름→스핀(정지 직전)까지
  export function spinTime(b, p): number    // 스핀→정지까지
  export function landingTime(b, p): number // airborne 공이 z = R 에 하강 중으로 닿는 시각(t ≥ 0 최소 근). z ≤ R 이고 내려가는 중이면 0. 아니면 Infinity
  export function nextTransition(b, p): EventCandidate | null   // airborne 은 null — 착지는 전이가 아니라 detect 의 ball-table 이벤트
  export function positionPolynomial(b, p): { r0: Vec3; r1: Vec3; r2: Vec3 }   // r(t) = r0 + r1·t + r2·t² (현재 상태의 가속도 기준; airborne 은 r2 = −½g ẑ)
  export function kineticEnergy(b, p): number  // ½ m v² + ½ I ω² + m g (z − R) — 위치에너지 포함(천 위의 공은 항이 정확히 0). 모든 resolve 에서 비증가

detect/ballBall.ts
  export function ballBallTime(b1: BallState, b2: BallState, p: BallParams): number
    // 두 공의 상대 위치 다항식으로 |Δr(t)|² = (2R)² 의 최소 양근(t > 1e-9, 그 순간 접근 중, 이른 전이·착지 시각 이전). 3차원이라
    // 공중 공이 다른 공 위를 넘으면(xy 만 겹침) 충돌이 아니고, 위에 떨어지면 |Δr| = 2R 인 순간 잡힌다.
    // 이미 접촉 중(≤ 2R + 1e-9)이고 멀어지는 중이며 상대 가속도가 0 이면 Infinity; 상대 가속도가 있으면 근 탐색
    // (마찰 곡률로 되돌아오는 재접촉을 잡는다 — pooltool 과 같다). 둘 다 정지면 Infinity.
detect/ballCushion.ts
  export function ballCushionTime(b: BallState, seg: CushionSegment, p: BallParams): number
    // 코 라인까지 부호 거리 = R 이 되는 최소 양근(2차). 세그먼트 범위 안 + 쿠션 쪽으로 이동 중일 때만.
    // 공중 공: 쿠션은 무한 높이의 수직 벽(xy 등속 → 1차), 유효 구간은 착지까지. 코 위를 넘는 점프는 없다(한계).
detect/ballTable.ts   (v2.2)
  export function ballTableTime(b: BallState, p: BallParams): number
    // airborne 공의 착지 시각 = landingTime 이 1e-9 s 보다 크면 그 값, 아니면 Infinity(그 대역은 simulate 의 즉시 스윕이 dt = 0 으로 해석).
detect/index.ts
  export function nextEvent(balls: readonly BallState[], segs: readonly CushionSegment[], p: BallParams): EventCandidate | null
    // 모든 후보(전이·착지·볼–쿠션·볼–볼) 중 최소 dt. 동률은 절대 규칙 5 로 결정. dt ≤ 0 인 후보는 제외.

resolve/stickBall.ts
  export function strike(cueBall: BallState, input: ShotInput, p: BallParams, cue: CueParams): BallState
    // TP A.30 / pooltool InstantaneousPoint3D. (a, b) 는 큐 축에 수직한 평면의 오프셋(R 비율). pooltool 의 큐→볼 프레임 회전
    // (ball_b = sinθ·c + cosθ·b, ball_c = cosθ·c − sinθ·b) 을 θ-식에 넣으면 c 가 소거되어
    //   v = 2V0/(1 + m/M + (a² + b²)R²/((2/5)R²)) × tipEfficiency,
    //   ω = (v/((2/5)R²))·R·(b, a sinθ, a cosθ)  — (왼쪽 L̂, 큐 방향 d̂, 위 k̂) 성분. 수평 속도 v cosθ 만 남긴다(z 운동 없음).
    // TP A.31 스쿼트: α = atan2(2.5·a·√(1−a²), 1 + endmassRatio + 2.5(1−a²)) 만큼 v 와 ω 를 오프셋 반대쪽으로 회전
    //   (pooltool 은 v 만 돌린다 — 의도된 차이, 42-oracle-report §4.2).
    // 속도는 큐 축을 따라(v2.2): v = (v cosθ d̂', 0 − v sinθ) — θ = 0 이면 v_z 가 정확히 +0 이라 2.1.0 과 비트 동일.
    // |a|,|b| ≤ maxOffset, a²+b² ≤ maxOffset² 아니면 throw RangeError("miscue"). 결과 state = θ > 0 ? 'airborne' : 'sliding'.
resolve/ballBall.ts
  export function ballBallFriction(vRel: number, p: BallParams): number       // a + b·exp(−c·vRel)
  export function resolveBallBall(b1: BallState, b2: BallState, p: BallParams): readonly [BallState, BallState]
    // pooltool FrictionalInelastic: 법선 v1n' = ½((1−e)v1n + (1+e)v2n); 접선 임펄스는 Coulomb(μ·ΔVn) 과 무슬립(−(1/7)(v1−v2 + R(ω1+ω2)×n̂)) 중 작은 것;
    // Δω = (2.5/R) n̂ × ΔV_t. 둘 다 천 위면 z 성분 제거·둘 다 'sliding'(2.1.0 경로). 공중 공이 끼면 3D 임펄스를 그대로 두고
    // 각 공은 postImpactState(v_z ≠ 0 또는 z ≠ R 이면 'airborne', 아니면 'sliding'). 반환 순서 = 입력 순서.
resolve/ballTable.ts   (v2.2, pooltool ball_table/frictional_inelastic)
  export const MIN_BOUNCE_HEIGHT = 0.005
  export function bounceHeight(vz, g): number                 // v_z²/(2g)
  export function resolveBallTable(b: BallState, p: BallParams): BallState
    // z 를 정확히 R 로 스냅 → 법선 v_z' = −eT v_z, 접선은 sphereHalfSpace.solveZNormal(μ = muS): Coulomb μ(1+eT)|v_z| 와 무슬립 −(2/7)u 중
    // 작은 것, Δω_xy = (2.5/R) ẑ × Δv∥, ω_z 보존. 정점 v_z'²/(2g) < 5 mm 면 정착: v_z = 0, state 'sliding'(applyTransition 스냅), 아니면 'airborne'.
    // v_z ≥ 0 으로 들어온 공(즉시 스윕이 넘긴 v_z ≈ +0)은 임펄스 없이 정착.
resolve/cushion/han2005.ts
  export function resolveCushionHan(b: BallState, seg: CushionSegment, p: BallParams, cushionHeight: number): BallState
    // Han 2005 (pooltool han_2005/model.py): 프레임 회전 → s_x, s_y, c → P_zE = m c (1+e), P_zS = (2m/7)√(s_x²+s_y²)
    // grip(P_zS ≤ μ P_zE) 와 slip 분기 → 역회전. 결과 z 속도 0, state 'sliding'. airborne 공은 resolveCushionSHS 로 위임.
resolve/cushion/sphereHalfSpace.ts
  export function solveZNormal(vi, wi, R, muK, e): { v; w }   // 법선 = 국소 ẑ 프레임의 구–반공간 임펄스(착지도 이 함수를 쓴다)
  export function resolveCushionSHS(b, seg, p, cushionHeight): BallState
    // pooltool sphere_half_space_collision: ΔV⊥ = (1+e)(−v_n), 접선은 Coulomb μ_k ΔV⊥ 와 stick (2/7)(R ω×ẑ − v) 중 작은 것, 스핀 갱신.
    // 천 위의 공은 테이블 ẑ 성분을 버리고 'sliding'; airborne 공(v2.2)은 무한 높이 수직 벽으로 보고 임펄스 전체를 적용해 v_z 를 남기며
    // state = postImpactState. 세 모델 모두 airborne 은 여기로 온다(Han·Mathavan 은 슬레이트 반력을 전제하므로 공중에서 정의되지 않는다).
resolve/cushion/mathavan2010.ts
  export function resolveCushionMathavan(b, seg, p, cushionHeight, steps = 2000): BallState   // airborne 공은 resolveCushionSHS 로 위임
    // Mathavan 2010 임펄스 스텝(압축: v_y ≤ 0 까지 + 8단계 이분 정제, 복원: W ≥ e_e²·W_c 까지). 고정 steps 라 결정론적.
    // e_e 는 p.eE(에너지 반발 계수, Han/SHS 의 운동학적 p.eC 와 별개; 기본 0.88 — params.ts 주석의 보정 항목).
resolve/cushion/index.ts
  export function resolveCushion(model: CushionModelId, b, seg, p, cushionHeight): BallState
    // sphereHalfSpace 는 수직 벽이라 탑스핀–반발속도 결합이 없다(Mathavan Fig. 9 위배) — 3쿠션 기본값 금지, 기본은 han2005.
resolve/transition.ts
  export function applyTransition(b: BallState, to: MotionState, p: BallParams): BallState
    // 정준 전이: rolling 진입 시 ω_xy 를 정확히 (1/R)k̂×v 로, spinning 진입 시 v=0·ω_xy=0, stationary 진입 시 전부 0. |x|<1e-12 스냅.
    // airborne 진입은 스냅만(v_z 유지).
  export function postImpactState(r: Vec3, v: Vec3, R: number): "airborne" | "sliding"   // v_z ≠ 0 이거나 z ≠ R 이면 airborne
resolve/kiss.ts
  export function makeKiss(b1, b2, p, spacer = 1e-9): readonly [BallState, BallState]   // 궤적을 따라 정확히 2R+spacer 로 분리
  export function resolveContinuallyTouching(b1, b2, p): readonly [BallState, BallState] // 반경 방향 상대속도 < 1e-3 m/s 면 쫓기는 공이 10% 운동량을 가져감
    // 문턱 1e-3 은 의도된 값(pooltool 코드는 0.01, docstring 은 1 mm/s). spacer 1e-9 도 pooltool MIN_DIST 1e-6 과 다른 의도된 값 — kiss.ts 머리.

simulate.ts
  export const MAX_EVENTS = 2000
  export function validateBalls(balls), validateShotInput(input), validateParams(params): void   // 절대 규칙 7. 위반 시 RangeError
  export function simulateShot(balls: readonly BallState[], input: ShotInput, params: SimParams): SimResult
  export function simulateFrom(balls: readonly BallState[], params: SimParams, t0 = 0): Omit<SimResult, "input">
    // 둘 다 진입에서 검증한다. 공 배열 순서는 물리·해시에 영향이 없다(감지·해석은 id 로 결정, 해시는 id 순).
    // 루프: 즉시 스윕(dt = 0 접촉·전이·착지) → nextEvent → 모든 공 evolveBall(dt) → 해당 이벤트 하나만 resolve → history 에 스냅샷 push → 반복.
    // 이벤트 없음(전부 stationary) 이면 종료. MAX_EVENTS 초과면 truncated=true(공중에 있던 공은 z = R 로 내려 세운다).
    // θ > 0 샷의 첫 이벤트는 t = 0 의 ball-table(큐볼 즉시 착지). ball-table → resolveBallTable.
    // 각 resolve 후 불변 검사(디버그): 3차원 겹침 없음, 역학적 에너지(KE + PE) 비증가(허용 1e-9 상대 + kiss 가 옮긴 z 의 위치에너지),
    // 어떤 공도 z < R − 1e-9 가 아님 — 위반 시 console 이 아니라 결과의 warnings 에 기록하지 말고 throw 하지도 말 것; 테스트에서만 검사한다.
continuize.ts
  export function stateAt(result: Pick<SimResult,"history">, t: number, p: BallParams): readonly BallState[]   // 직전 스냅샷에서 evolveBall
  export const MAX_FRAMES = 1e7
  export function frames(result, dt, p): readonly Snapshot[]   // dt 가 양의 유한수가 아니거나 프레임 수 > MAX_FRAMES 면 RangeError; 시각이 멈추면 종료
hash.ts
  export function hashResult(events: readonly SimEvent[], final: readonly BallState[]): string
    // FNV-1a 64비트(두 개의 32비트, Math.imul). 입력은 이벤트의 (type, t, ids, cushion/from/to — ball-table 은 부가 필드 없음) 와 최종 상태 (id, r, v, w, state) 의
    // Float64 비트 패턴. final 은 **id 사전순**으로 넣고(배열 순서 무관), NaN 은 정규 quiet NaN 0x7ff8000000000000 으로 통일. 16진 16자리.
rng.ts
  export function mulberry32(seed: number): () => number
version.ts
  export const ENGINE_VERSION = "2.2.0"
  export function physicsParams(params: SimParams): object  // 물리에 영향 주는 필드만(table.name 제외, eT 포함) — 새 물리 필드는 여기 추가
  export function paramsHash(params: SimParams): string    // physicsParams → JSON 정렬 직렬화 → FNV-1a
index.ts   전부 재수출
```

## v2.2 z 축 (점프·마세이) — 범위와 한계
- 상태 `airborne`: 큐를 든 타격 직후(z = R, v_z < 0)와 착지에서 튕긴 뒤. 공중에서는 중력 포물선, ω 불변(공기 저항·마그누스 없음).
- 새 이벤트 `{ type: "ball-table", t, ids: [id] }` = 착지. 동률 순위 transition < **ball-table** < ball-cushion < ball-ball.
- 착지 모델 = pooltool frictional inelastic table: 법선 eT(BallParams, 기본 0.5, paramsHash 포함), 접선 μ_s Coulomb/무슬립, 정점 < 5 mm 면 정착.
  pooltool 코드가 무슬립 분기에서 ω_z 까지 2/7 로 깎는 것은 따르지 않는다(접점 마찰은 법선 둘레 토크가 없다 — 의도된 차이).
- 볼–볼: 3차원 |Δr| = 2R. 공중 공이 끼면 z 임펄스를 남기고 postImpactState 로 상태를 정한다. 둘 다 천 위면 2.1.0 경로 그대로.
- 쿠션: 공중 공에게 쿠션은 **무한 높이의 수직 벽**이다. 코보다 높이 날아도 벽에 맞고, 레일을 넘어가는 점프·코 위를 스치는 접촉은 재현하지
  않는다. Han·Mathavan 은 슬레이트 반력을 전제하므로 공중 공은 sphereHalfSpace 3D 로 해석한다(v_z 는 마찰만큼 바뀌고 유지).
- θ = 0 샷은 2.1.0 과 비트 단위로 같다(`fixtures/golden-theta0.json`, 2.1.0 이 생성). 마세이의 최종 구름 방향은 TP A.19/A.4 와 일치한다
  (착지 마찰 임펄스는 미끄럼 마찰과 같은 운동학 Δu = 3.5 Δv 라 어떻게 소진되든 최종 방향이 같다).
- 알려진 구멍: 다른 공 꼭대기에 상대속도 0 으로 얹힌 공(중력이 곧장 접점으로 향하는 퇴화 상태)은 근이 t ≈ 0 뿐이라 감지기가 잡지 못하고
  다음 이벤트까지 파고든다(pooltool 도 같다). fixOverlaps 가 3차원 중심선으로 벌리되 천 위 공을 z < R 로 내리지는 않는다.

## 테스트 층
- **A 불변량**(`simulate.test.ts`): 시드 고정 무작위 샷 1000개 × 대대/중대 × 3구/4구 배치, θ ∈ [0, 0.6] rad · V0 ≤ 9 m/s(점프·마세이 포함). 매 이벤트의 resolve 직전(직전 스냅샷을 dt 만큼 전진한 상태) 대비 직후 역학적 에너지(KE + m g (z − R)) 비증가(천 마찰 소산에 가려지지 않게; kiss·스냅이 옮긴 z 의 위치에너지만 허용), 모든 공 [R, W−R]×[R, L−R] 안이고 z ≥ R − 1e-9, 천 위 상태는 z = R·v_z = 0, 어떤 두 공도 3차원 거리 2R − 1e-9 미만으로 안 겹침, 착지 뒤 z = R 이고 튕김(정점 ≥ 5 mm) 또는 정착, 이벤트 시각 단조증가, 종료(truncated=false), 같은 입력 두 번 → 해시 동일, 공 배열 순서 무관, θ > 0 샷은 t = 0 착지로 시작.
- **B 물리 단위**: pooltool 의 테스트 불변량(정면 무스핀, e_b 분리비, 대칭 쌍 유지, z-스핀 → 던지기 방향, 기어링 스핀 → 던지기 0, 낮은 상대속도 → 접점 상대속도 0, 쿠션 에너지 비증가, y 대칭), TP A.4 5/7 법칙, TP A.16 자연구름 정지거리, v2.2: 포물선·착지 시각(이분법 오라클)·착지 반발 e_t 와 5 mm 정착·slip/stick·ω_z 보존·공중 공의 3D 볼–볼(넘기/떨어지기)·공중 쿠션(에너지 비증가, 세 모델 위임)·큐 축 속도(θ = 0 은 +0)·마세이 최종 방향 = TP A.19·점프가 정점 자리의 공을 넘음·θ = 1e-9 는 θ = 0 과 착지 하나만 다름, 45° 구름 무스핀 입사 → 반사각 ≈ 42–44°(정반사보다 짧음, Mathavan 2010 Fig. 8; 세 모델 모두 입사 속도와 무관), 순방향 잉글리시 → 반사각 커짐·속도 증가 가능, 역방향 잉글리시를 쿠션 선 기준 80–90°(법선에서 0–10°) 입사 → 같은 쪽으로 되돌아옴(법선에서 80° 이상의 스침에서는 되돌아오지 않는 게 맞다), 코너 정확 입사 → 쿠션 이벤트 2개, 반두께(8 m/s) 분리각 ≈ 60° ± 3°(던지기 포함), 3 m/s 구름 공이 대대 장축 왕복에서 쿠션 3개 이상(대각선이면 5개) 통과 — 파라미터 재보정 뒤 조일 것, 큐를 든 중심 타격은 ω = 0.
- **C 적합성**: 200개 픽스처 샷(han2005 160 · sphereHalfSpace 20 · mathavan2010 20, condition 1/0.8/1.25 = 160/20/20, θ ∈ (0, 0.35]) + 움직이는 시작 상태 20개(simulateFrom, t0 ≠ 0)의 해시를 `fixtures/golden.json` 에 고정. 갱신은 `UPDATE_GOLDEN=1 npm test` 로만. 같은 200 케이스의 θ = 0 변형은 `fixtures/golden-theta0.json`(엔진 2.1.0 이 생성)에 고정 — θ = 0 물리를 의도적으로 바꿀 때만 `UPDATE_GOLDEN_THETA0=1`. 금지 함수 grep 테스트(asinh 등·`Math[`·`= Math` 별칭 포함). 교차 엔진: `npm run sim:conformance`(Node vm · WebKit · Chromium, Playwright) 와 `npm run sim:xengine`(Bun/JSC 로 golden 재실행, `scripts/sim-conformance/xengine-check.ts`; deno 도 가능).
- **D 오라클**: Python pooltool 로 같은 샷을 돌려 최종 위치를 비교(별도 스크립트, `scripts/sim-oracle/`).
