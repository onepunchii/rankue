# scripts/sim-oracle — pooltool 오라클 비교 (README 시험 층 D)

`shared/sim` (캐롬 물리 엔진 v2) 과 [pooltool](https://github.com/ekiefl/pooltool) (Apache-2.0, 0.6.0) 로 **같은 샷**을 돌려
최종 위치와 이벤트 열을 대조한다. 엔진 코드는 건드리지 않는다 — 발견 사항은 보고서로 낸다
(`…/scratchpad/sim-research/42-oracle-report.md`).

## 파일

| 파일 | 역할 |
|---|---|
| `export.ts` | `shared/sim/fixtures/golden.json` 에서 DAEDAE·han2005 샷 60개를 골라 θ=0 으로 우리 엔진을 돌린다. `out/shots.json`(오라클 입력) 과 `out/ours.json`(우리 결과) 을 쓴다. |
| `oracle.py` | pooltool 로 `out/shots.json` 을 돌려 `out/pooltool.json` 을 쓴다. `--min-dist` 로 pooltool 의 make_kiss 스페이서를 바꿀 수 있다(진단용). |
| `compare.ts` | 두 결과를 샷별로 대조. 최종 위치 오차(중앙값·평균·최대), 이벤트 열 일치율, 타격 직후 오차, 서브모델 진단(오차가 처음 뛴 이벤트 종류). `out/compare-<pooltool 파일명>.md/.json`. |
| `.venv/` | Python 3.11 가상환경 (uv 관리 3.11 — 시스템 3.14 는 numba 미지원). `.gitignore` 로 제외. |

## 실행

```sh
cd scripts/sim-oracle
# 최초 1회
/Users/choejeonghwan/.local/bin/python3.11 -m venv .venv && .venv/bin/pip install pooltool-billiards
# 매번
npx tsx export.ts                       # → out/shots.json, out/ours.json
.venv/bin/python oracle.py              # → out/pooltool.json   (pooltool 기본 MIN_DIST = 1e-6 m)
.venv/bin/python oracle.py --min-dist 1e-9 --out out/pooltool-mindist1e-9.json   # 우리 스페이서(1e-9)로 맞춘 진단 실행
npx tsx compare.ts                      # → out/compare-pooltool.md
npx tsx compare.ts --pt pooltool-mindist1e-9.json
```

## 두 엔진의 규약 정렬 (전부 명시적으로 처리)

| 항목 | shared/sim | pooltool 0.6.0 | 정렬 방법 |
|---|---|---|---|
| φ 단위·기준 | rad, +x 축이 0, 반시계 양수 (큐 진행 방향) | **deg**, 같은 기준 (`Cue.phi`) | `phi_deg = deg(φ + α)` (α 는 아래 스쿼트 항목) |
| θ 큐 들림각 | rad | deg | 이 비교는 **θ = 0** 으로 고정 (pooltool 0.6.0 `cue_strike` 는 `v_B` 의 z 를 항상 0 으로 두는 "3D FIXME" 상태라 θ≠0 의 v 성분 처리가 우리 v2.0 과 같지만, ω 축 기울임까지 동등한지는 이 비교 범위 밖) |
| a 부호 | +a = 큐 진행 방향 **오른쪽** (ω_z > 0) | +a = **왼쪽** (`a = +1 is the leftmost side`) | `a_pt = −a` |
| b 부호 | +b = 중심 위 | 같음 | 그대로 |
| 팁 효율 η | `cue.tipEfficiency = 0.88` 을 v 에 곱함 (ω 는 v 에서 파생 → 함께 준다) | 없음 (탄성 해 그대로) | `V0_pt = V0 × 0.88`. 두 모델 모두 v ∝ V0, ω ∝ v 라 V0 스케일로 v·ω 가 동시에 맞는다 |
| 큐 질량 m/M | `DEFAULT_CUE.M = 0.52` | `CueSpecs.M` | `CueSpecs(M=0.52)` |
| 스쿼트 (TP A.31) | α = atan2(2.5a√(1−a²), 1+m_b/m_e+2.5(1−a²)), **v 와 ω 를 함께** φ+α 로 돌림 (기저 자체를 φ+α 로 생성) | `-throttle·atan2(…)` (a 부호 반대라 결과 부호 동일), **v 만** 돌리고 ω 는 큐 프레임 φ 에 남김 | `squirt_throttle = 0` 으로 끄고 `phi_deg` 에 α 를 미리 더한다 → pooltool 도 φ+α 프레임에서 v·ω 를 만들어 우리와 동일. **모델 차이(ω 를 돌리느냐)는 보고서에 기록** |
| 엔드매스 | `endmassRatio = m_b/m_e = 12` | `CueSpecs.end_mass` | `end_mass = 0.210/12` (스쿼트를 껐으므로 결과에 영향 없음) |
| 팁 반지름 보정 | 없음 | 0.6.0 에는 docstring 만 있고 코드에 없음 (`ball_a = cue.a`) | 해당 없음 |
| 스핀 스로틀 | 없음 | `english_throttle` | 1.0 |
| 수직축 스핀 감속 | `spinDecel = 11 rad/s²` 직접 사용 | α = 5·u_sp·g/(2R), u_sp = u_sp_proportionality·R | `u_sp_proportionality = 2·11/(5·9.81)` → α = 11.000 정확히 (oracle.py 가 assert) |
| 공 파라미터 | m 0.210, R 0.03075, μ_s 0.20, μ_r 0.010, e_b 0.93, μ_bb 9.951e-3+0.108e^{−1.088v}, e_c 0.88, f_c 0.15, g 9.81 | `BallParams(...)` | 같은 값. `u_b` 는 Alciatore 마찰 모델에서 쓰이지 않음 |
| 테이블 | 1.422 × 2.844, 코 높이 0.037 | `BilliardTableSpecs(l, w, cushion_height)` → 선형 쿠션 4개, 원형·포켓 없음 | 세그먼트 id 매핑 `"3"→left(x=0)`, `"12"→right(x=w)`, `"18"→bottom(y=0)`, `"9"→top(y=l)` |
| 쿠션 모델 | han2005 (e_c, f_c 상수) | `Han2005Linear/Circular` (0.6.0 기본은 Stronge — 쓰지 않음) | 리졸버를 직접 구성. `~/.config/pooltool/physics/resolver.yaml` 은 건드리지 않음 |
| 볼–볼 모델 | FrictionalInelastic + Alciatore μ(v) | `FrictionalInelastic(friction=AlciatoreBallBallFriction(a=0.009951, b=0.108, c=1.088))` | 동일 상수 |
| 전이 | 정준 전이, 스냅 1e-12 | `CanonicalTransition` (_TOLERANCE 1e-12) | 동일 |
| 이벤트 어휘 | `ball-ball` / `ball-cushion` / `transition{from,to}` | `ball_ball` / `ball_linear_cushion` / `sliding_rolling`… + `none`, `stick_ball` | oracle.py 가 우리 어휘로 변환, `none`·`stick_ball` 은 제외(타격 직후 상태는 `afterStrike` 로 따로) |
| 이벤트 상한 | `MAX_EVENTS = 2000` | `max_events` 인자 | 2000 |
| **make_kiss 스페이서** | 볼–볼 2R + **1e-9**; 쿠션은 재배치 없음(코 라인을 넘었을 때만 되밈) | 볼–볼 **2R + 1e-6**, 쿠션도 해석 전에 R + **1e-6** 까지 속도 방향으로 되돌림 (`const.MIN_DIST`) | 정렬하지 않음(기본 실행) + `--min-dist 1e-9` 진단 실행. **이것이 두 엔진 차이의 사실상 전부** — 보고서 참조 |
| 근 하한 | 1e-9 s 이하의 근은 현재 이벤트로 보고 버림, 즉시 접촉 스윕 | 2.2e-14 s | 정렬하지 않음. 60샷에서 순서 차이 관측 없음 |
| 동률 순서 | type 순위 → id 사전순 → 쿠션 id | 감지 순서 | 정렬하지 않음. 관측된 차이 없음 |

## 결과 요약 (2026-09-07, pooltool 0.6.0, 60샷 · 854 이벤트)

| | pooltool 기본 (MIN_DIST 1e-6) | MIN_DIST 1e-9 (우리 스페이서) |
|---|---|---|
| 최종 위치 오차 중앙값 | **0.015 mm** | 0.000003 mm |
| 평균 / 최대 | 2.08 mm / 63.4 mm | 0.0006 mm / 0.033 mm |
| > 1 mm / > 5 mm 샷 수 | 9 / 4 | 0 / 0 |
| 이벤트 종류 열 동일 | 59/60 | **60/60** |
| 이벤트 엄격 열(종류+id+쿠션+전이) 동일 | 59/60 | **60/60** |
| 타격 직후 최대 오차 (Δv, RΔω) | 9.6e-15 | 9.6e-15 |

해석은 보고서(`42-oracle-report.md`)에. 한 줄 요약: 스틱–볼·Han 2005·마찰 비탄성 볼–볼·닫힌 식 전개·전이·이벤트 감지 모두
부동소수점 수준에서 pooltool 과 같다. 기본 실행의 mm 급 차이는 pooltool 의 1 µm 재배치 스페이서(우리 1 nm)가
쿠션·볼–볼을 거치며 혼돈적으로 증폭된 것이며, 스페이서를 맞추면 60샷 전부 33 µm 이내로 일치한다.
