# shared/golf/field — 필드 골프 물리 엔진 v0.3 (계약서)

2026-09-15 오너 확정안("전부 추천대로", 세션 제안서 `golf-field-sim-proposal.md`)의 물리 층. 미니골프(`shared/golf/{course,courses,physics}.ts`)는
손대지 않고 이 폴더를 옆에 새로 판다. 화면·서버는 **`simulateStroke()` 하나**만 부른다.

## 절대 규칙 (당구 `shared/sim/README.md` 와 같다)
1. **초월함수 금지.** `Math.sin/cos/tan/atan/atan2/asin/acos/exp/log/pow/hypot/cbrt/random/fround` 를 이 폴더에서 쓰지 않는다.
   필요하면 `../../sim/dmath.js` 의 함수만(발사 순간·바운스 1회·LUT 생성). 비행·구름 루프는 `+ − × ÷ Math.sqrt Math.abs Math.min/max Math.floor` 만.
   `conformance.test.ts` 가 grep 으로 검사한다.
2. **시각·난수 금지.** `Date`·`performance`·`Math.random` 없음. 돌풍·러프 편차는 `(방 시드, 홀, 타수)` 해시에서 결정적으로.
3. **입력 불변.** 인자로 받은 객체를 바꾸지 않는다.
4. **임포트는 반드시 `.js` 확장자**(`./x.js`, `../../sim/dmath.js`) — 빠지면 Vercel 함수 전체가 500 (memory `serverless-shared-imports`).
5. **네트워크로 보내는 것은 `StrokeInput`(정수 10개) 뿐.** 결과 위치는 절대 보내지 않는다. 서버가 같은 함수로 재계산해 `hash` 를 대조한다.
6. **GPL 금지.** 공식은 공개 문헌(Penner 2002/2003, Bearman & Harvey 1976, Holmes 1991, 스팀프미터 정의)만. OpenFairway(MIT)·Open-Golf(MIT) 는 코드를 옮기지 않는다.
7. 모듈마다 `*.test.ts` 동반. `npm test` = `vitest run`(`shared/**` 자동 포함).

## 단위·좌표·부호
- SI(m, s, kg). 각도는 입력·표시만 도(°), 내부 라디안.
- 홀 좌표: **x = 오른쪽, y = 앞(그린 방향), z = 위.** 티가 원점 부근, 컵이 +y 쪽. 지면 `h(x,y)`(해석적 기울기+범프), 공은 `z ≥ h + R` 이면 비행.
- 조준 방위 `aimDeg10` 은 0.1° 단위 정수, 0 = +y, **+ = 오른쪽**(시계).
- 스핀: 백스핀 축 = 공 진행의 오른쪽(+x 기준). 축 기울기 τ>0 = 축이 위로 들림 = 양력이 −x 성분 = **좌로 휨(드로우/훅)**, τ<0 = 우로(페이드/슬라이스). 표시층에서 우타/좌타 부호만 뒤집는다.
- 페이스 `face_h` + = 열림(우), 패스 `path_h` + = 인투아웃(우). δ = face − path. τ = −atan(sin δ·cos L / sin L) (D-plane), L = 스핀 로프트.

## StrokeInput (정수 10개) — v0.2 A안: 구질은 고르지 않고 만든다
세 축이 세 물리량을 하나씩 맡는다. **스탠스 → 패스, 회전 타이밍 → 페이스, 컨택 높이 → 저점.** 구질 = 페이스 − 패스(D-plane).

| 필드 | 범위 | 뜻 |
|---|---|---|
| club | 풀 백 14: D 3W 5W HY 3I 4I 5I 6I 7I 8I 9I PW SW PT | 1차 화면은 8개(D·3W·5I·7I·9I·PW·SW·PT)만 노출 |
| aimDeg10 | −1800..1800 | 타깃 라인 0.1°(카메라·조준선) |
| stanceDeg10 | −150..150 | 스탠스 = 스윙 패스 오프셋 0.1°. − 왼쪽(아웃투인) / + 오른쪽(인투아웃). 크게 열수록 창이 좁다 |
| powerPct | 20..115 | 당김 파워 %. 100 초과 = 오버스윙(창 좁아짐, 거리 +) |
| ballPos | −100..100 | 볼 포지션/탄도: −뒤(핸드퍼스트·펀치, 로프트 −) … +앞(하이, 로프트 +) |
| impactMs | −400..400 | 회전 타이밍 ms. − 이르게 = 손이 먼저 = 페이스 닫힘 / + 늦게 = 몸이 먼저 = 열림. **컨택과 무관** |
| padX | −100..100 | 스윙 패드 놓을 때 가로 흘림 = 의도치 않은 패스 오차(− 왼쪽 = 오버더톱) |
| tapX | −100..100 | 탭 가로 위치 = 타점(+ 토 / − 힐, 기어효과·생크). 1차 화면은 0 |
| tapY | −100..100 | 컨택 높이: 스위트스팟이 공의 어디를 지났나. 0 = 이상적, +100 = 공 위 1.5R, −100 = 공 아래 1.5R(잔디·티·모래). 익스플로전의 이상값은 −47(모래) |
| mode | 0 풀 · 1 칩 · 2 익스플로전 · 3 퍼트 | 특수 모드 |

## 세 축 → 발사
- 창: `zoneMs = 50 × clubZone × lieZone × powerCoef × shapeCoef`, `t = impactMs / zoneMs`.
- 페이스(타깃 기준): |t| ≤ 1 → `t' = sign·max(0,|t|−0.33)/0.67`, |t| > 1 → `t' = sign·min(2.5, |t|)`. `face = t'·FACE_MAX`. 열린 페이스는 다이내믹 로프트를 늘린다(+0.25°/°, 스핀 로프트 +0.35°/°).
- 패스: `path = stance + padX'·PATH_ERR_MAX`. 출발 방향 = face + kPath·(path − face) + 기어. 축 기울기 τ = −atan(sin(face−path)·cos L / sin L) + 기어 + 옆경사.
- 컨택(tapY → 페이스 위 타점 `sv = −tapY/100·1.5R` cm, + 위):
  - **티 위 우드**: 잔디 없음. 수직 기어효과 `spin −k·sv, launch +c·sv, speed ×(1−k₂sv²)` (D 600 rpm/cm·1°/cm). 리딩엣지 0.8 cm 안 = 얇은 드라이브, 리딩엣지가 적도 위(sv < −faceDown) = 탑, 크라운 위(sv > faceUp) = 스카이.
  - **잔디(아이언·웨지·오프더덱)**: sv ≥ 0 은 솔이 잔디를 판 깊이 — 0.4 cm 까지 바운스가 봐주고 그 뒤 `s = (sv−0.4)/2.4` 로 볼스피드 ×(1−0.45s), 스핀 ×(1−0.5s), 발사각 +5s(뒷땅 = s > 0.1). sv < 0 은 페이스 아래쪽: 0.4 cm 뒤부터 발사각 −1.2°/cm, 스핀은 살짝 +(수직 기어)하다가 리딩엣지 구간에서 급감(얇게), 적도 위면 탑.
  - **익스플로전**: 이상 진입 −47(공 1.5 cm 아래 모래). 얕을수록 세고(+60 %까지) 공을 직접 치면 홈런(×1.8, 12°), 깊으면 모래에 묻힌다(−65 %).
  - **생크**: 아이언·웨지 tapX ≤ −85(호젤): 우 30°, 속도 0.6.
- 퍼펙트(`perfectInput`) = 같은 스탠스·파워·볼포지션에 impactMs·padX·tapX 0, tapY 0(익스플로전은 −47).

## 클럽 표·프리셋(clubs.ts)
- 클럽 발사 조건은 **트랙맨 PGA 투어 평균**(볼스피드·발사각·스핀·캐리). 모델 캐리는 표 대비 ±4 %(`engine-grid.test.ts`), 드라이버는 프로 프리셋 76.5 m/s 로 250 m(오너 확정).
- 프리셋 `pro` · `amateur`(볼스피드 0.88×, 오너 확정 ≈ 5 핸디) · `lpga`(LPGA 투어 평균 표 — 볼스피드·캐리는 표, 발사각·스핀은 통상값) · `ama15`(트랙맨 평균 남성 아마 드라이버 실측 132.6 mph·12.6°·3275 rpm·204 yd, 나머지 클럽은 배율).
  표에 있는 클럽은 표 값을, 없는 클럽은 프로 표에 배율(`presetLaunch`).

## 코스·공기 컨디션(StrokeContext.conditions)
`{ altitudeM, tempC, firmness, wet }` 전부 선택. 공기 밀도비 `airDensityRatio` = exp(−h/8435)(3차 근사)×288.15/(273.15+T) 가 K_AERO 에 곱해진다(1500 m ≈ 캐리 +7 %).
단단함 0.6..1.4 는 되튐 ×firm·구름 감속 ÷firm, 젖음 0..1 은 되튐 ×(1−0.4w)·구름 감속 ×(1+0.8w)·스팀프 ×(1−0.15w). 비행에는 안 닿는다.

## 지형·나무(course.ts)
- 고도 = 전체 기울기 + 범프 + **격자**(`height.grid`: origin·cell·nx·ny·z 행우선, 쌍선형 보간, 밖은 가장자리 값으로 편평). `gridFrom(origin, cell, nx, ny, f)` 로 만든다.
- 나무 `{ c, r, h, trunkR? }`: 캐노피 구(중심 z = h − r) 안에 들어오면 법선 반사(e 0.2) 뒤 속도 35 %·스핀 30 % 만 남고 `tree` 이벤트, 둥치(기본 0.25 m)는 수평 반사 50 %. 굴러가는 공은 둥치만 본다. 결정론.

## 화면 입력 방식(client/src/golf/field) — 엔진은 정수만 받는다
- **아크 스윙(기본, `ArcSwing.tsx`, 오너 지정 — 골프 슈퍼 크루 형태)**: 큰 공을 뒤로 끌어 파워, 끌면서 좌우로 드로우·페이드(= 엔진 `stanceDeg10`),
  놓으면 위쪽 아크를 바늘이 왕복 → 초록 창에 탭 = `impactMs`(페이스). 창 밖이면 당점까지 무너진다(이르면 뒷땅 −, 늦으면 얇게 +, `tapY = ±min(1.5, |t|−1)·45`).
- **쓸기 스윙(`SwipeSwing.tsx`)**: 한 제스처가 세 축을 전부 *결과* 로 만든다. 오른쪽으로 당김(파워) → 왼쪽으로 쓸어 공 중심선 통과.
  통과 높이 → `tapY`(뒷땅·얇게), 다운스윙 소요 시간 vs 클럽 템포(`sweepMs/4`) → `impactMs`(**빠르면 몸이 먼저 = 열림 = 페이드**,
  느리면 손이 먼저 = 닫힘 = 드로우), 통과 순간 경로 기울기 → `padX`, 공을 못 지나고 떼면 헛스윙(`noTapInput`).
- **바늘 + 당점 선택(`SwingPad.tsx` + `ContactPicker.tsx`)**: 왕복 바늘을 탭해 `impactMs`, 당점은 샷 전에 공 위에서 골라 `tapX`·`tapY`.
  당점을 *선택* 하는 건 골프가 아니라 당구의 개념이라 A/B 비교용으로만 남긴다(설정 시트에서 전환).

## 공개 API
```
simulateStroke(pre: Vec3, input: StrokeInput, ctx: StrokeContext): StrokeResult
  ctx = { hole: FieldHole, env: WindEnv, preset: "pro"|"amateur"|"lpga"|"ama15", stimp: number(ft), strokeIdx: number, roomSeed: number, conditions?: Conditions }
  result = { events, final(BallState3), frames(Float32Array xyz @120Hz), hash, diag(ImpactDiag), carryM, totalM, apexM, airTime }
launchFrom(input, ctx): LaunchState + ImpactDiag              (impact.ts — 클럽 표·D-plane·기어·수직 컨택·라이)
verticalContact(club, tapY, teedWood, explosion, putt)       (impact.ts — 컨택 높이 → 속도·스핀·발사각 배율, 표로 검증)
windAt(env, z, t): Vec3                                        (wind.ts — 높이 프로파일 표 + 결정론 돌풍)
heightAt / gradAt / surfaceAt(hole, x, y)                      (course.ts)
strokeHash(events, final): string                              (hash.ts — fnv1a64, events+final 만)
```
- 비행: 반암시적 오일러 DT=1/120, `a = g + K·V·(−Cd·v_rel + Cl·(ŝ×v_rel))`, Cd·Cl 은 스핀비 S 의 함수(params.ts; Cd 의 스핀 항은 S 0.40 에서 평탄 — 웨지 과항력 방지), 스핀 감쇠 스텝당 상수. K 는 컨디션의 공기 밀도비를 곱한다.
- 착지: Penner 유효경사 + 속도 의존 COR + 그립/슬립 임펄스. 되튐 < 0.8 m/s 면 구름.
- 구름: `a = −g∇h − a_roll·v̂ − 0.0046|v|v`. 그린 a_roll = 5.49/스팀프ft. 컵 포획 `v_cap(d) = (2√(Rh²−d²) − R)·15.16`, 립아웃 e 0.3 + 20 % 감속.
- 해시 = fnv1a64(stableStringify(events + final)). 서브스텝·프레임 저장 방식을 바꿔도 해시가 산다.

## 버전
`FIELD_ENGINE_VERSION`(version.ts). 물리 상수를 바꾸면 올린다 — 서버 재시뮬과 클라이언트가 다른 버전이면 해시 대조를 건너뛴다.
