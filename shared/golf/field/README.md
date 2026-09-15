# shared/golf/field — 필드 골프 물리 엔진 v0 (계약서)

2026-09-15 오너 확정안("전부 추천대로", 세션 제안서 `golf-field-sim-proposal.md`)의 물리 층. 미니골프(`shared/golf/{course,courses,physics}.ts`)는
손대지 않고 이 폴더를 옆에 새로 판다. 화면·서버는 **`simulateStroke()` 하나**만 부른다.

## 절대 규칙 (당구 `shared/sim/README.md` 와 같다)
1. **초월함수 금지.** `Math.sin/cos/tan/atan/atan2/asin/acos/exp/log/pow/hypot/cbrt/random/fround` 를 이 폴더에서 쓰지 않는다.
   필요하면 `../../sim/dmath.js` 의 함수만(발사 순간·바운스 1회·LUT 생성). 비행·구름 루프는 `+ − × ÷ Math.sqrt Math.abs Math.min/max Math.floor` 만.
   `conformance.test.ts` 가 grep 으로 검사한다.
2. **시각·난수 금지.** `Date`·`performance`·`Math.random` 없음. 돌풍·러프 편차는 `(방 시드, 홀, 타수)` 해시에서 결정적으로.
3. **입력 불변.** 인자로 받은 객체를 바꾸지 않는다.
4. **임포트는 반드시 `.js` 확장자**(`./x.js`, `../../sim/dmath.js`) — 빠지면 Vercel 함수 전체가 500 (memory `serverless-shared-imports`).
5. **네트워크로 보내는 것은 `StrokeInput`(정수 9개) 뿐.** 결과 위치는 절대 보내지 않는다. 서버가 같은 함수로 재계산해 `hash` 를 대조한다.
6. **GPL 금지.** 공식은 공개 문헌(Penner 2002/2003, Bearman & Harvey 1976, Holmes 1991, 스팀프미터 정의)만. OpenFairway(MIT)·Open-Golf(MIT) 는 코드를 옮기지 않는다.
7. 모듈마다 `*.test.ts` 동반. `npm test` = `vitest run`(`shared/**` 자동 포함).

## 단위·좌표·부호
- SI(m, s, kg). 각도는 입력·표시만 도(°), 내부 라디안.
- 홀 좌표: **x = 오른쪽, y = 앞(그린 방향), z = 위.** 티가 원점 부근, 컵이 +y 쪽. 지면 `h(x,y)`(해석적 기울기+범프), 공은 `z ≥ h + R` 이면 비행.
- 조준 방위 `aimDeg10` 은 0.1° 단위 정수, 0 = +y, **+ = 오른쪽**(시계).
- 스핀: 백스핀 축 = 공 진행의 오른쪽(+x 기준). 축 기울기 τ>0 = 축이 위로 들림 = 양력이 −x 성분 = **좌로 휨(드로우/훅)**, τ<0 = 우로(페이드/슬라이스). 표시층에서 우타/좌타 부호만 뒤집는다.
- 페이스 `face_h` + = 열림(우), 패스 `path_h` + = 인투아웃(우). δ = face − path. τ = −atan(sin δ·cos L / sin L) (D-plane), L = 스핀 로프트.

## StrokeInput (정수 9개)
| 필드 | 범위 | 뜻 |
|---|---|---|
| club | "D" "3W" "5I" "7I" "9I" "PW" "SW" "PT" | 1차 8클럽 |
| aimDeg10 | −1800..1800 | 조준 방위 0.1° |
| powerPct | 20..115 | 당김 파워 %. 100 초과 = 오버스윙(창 좁아짐, 거리 +) |
| spinX | −100..100 | 의도 구질: −드로우 … +페이드 |
| spinY | −100..100 | 탄도: −펀치(핸드퍼스트) … +하이(로프트 열기) |
| impactMs | −400..400 | 탭 시각 오차 ms. − 이르게(페이스 닫힘) / + 늦게(열림). 창 밖은 뒷땅/얇게/탑 |
| padX | −100..100 | 스윙 패드 놓을 때 가로 흘림 = 패스 오차(− 왼쪽 = 아웃투인/오버더톱) |
| tapX | −100..100 | 임팩트 탭 가로 위치 = 타점(+ 토 / − 힐) |
| mode | 0 풀 · 1 칩 · 2 익스플로전 · 3 퍼트 | 특수 모드 |

## 타이밍 창 → 결과
`zoneMs = 50 × clubZone × lieZone × powerCoef × shapeCoef`. `t = impactMs / zoneMs`.
- |t| ≤ 1: 퍼펙트 대역 ±0.33, `t' = sign(t)·max(0,|t|−0.33)/0.67`, 미스 심각도 s = 0.
- |t| > 1: `t' = sign(t)`, `s = clamp((|t|−1)/1.2, 0, 1)`. t<−1 뒷땅(fat), 1<t<1.6 얇게(thin), t≥1.6 탑, 아이언·웨지 t≥2.2 생크.
- face_h = 0.4·path_int + t'·FACE_MAX, path_h = −spinX·PATH_MAX − padX'·PATH_ERR_MAX, 타점 d_x = −t'·0.5 cm + tapX'·1.0 cm(기어효과).

## 공개 API
```
simulateStroke(pre: Vec3, input: StrokeInput, ctx: StrokeContext): StrokeResult
  ctx = { hole: FieldHole, env: WindEnv, preset: "pro"|"amateur", stimp: number(ft), strokeIdx: number }
  result = { events, final(BallState3), frames(Float32Array xyz @120Hz), hash, diag(ImpactDiag), carryM, totalM, apexM, airTime }
launchFrom(input, ctx, lie): LaunchState + ImpactDiag         (impact.ts — 클럽 표·D-plane·기어·미스샷·라이)
windAt(env, z, t): Vec3                                        (wind.ts — 높이 프로파일 표 + 결정론 돌풍)
heightAt / gradAt / surfaceAt(hole, x, y)                      (course.ts)
strokeHash(events, final): string                              (hash.ts — fnv1a64, events+final 만)
```
- 비행: 반암시적 오일러 DT=1/120, `a = g + K·V·(−Cd·v_rel + Cl·(ŝ×v_rel))`, Cd·Cl 은 스핀비 S 의 함수(params.ts), 스핀 감쇠 스텝당 상수.
- 착지: Penner 유효경사 + 속도 의존 COR + 그립/슬립 임펄스. 되튐 < 0.8 m/s 면 구름.
- 구름: `a = −g∇h − a_roll·v̂ − 0.0046|v|v`. 그린 a_roll = 5.49/스팀프ft. 컵 포획 `v_cap(d) = (2√(Rh²−d²) − R)·15.16`, 립아웃 e 0.3 + 20 % 감속.
- 해시 = fnv1a64(stableStringify(events + final)). 서브스텝·프레임 저장 방식을 바꿔도 해시가 산다.

## 버전
`FIELD_ENGINE_VERSION`(version.ts). 물리 상수를 바꾸면 올린다 — 서버 재시뮬과 클라이언트가 다른 버전이면 해시 대조를 건너뛴다.
