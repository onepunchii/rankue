# client/src/sim — 시뮬레이터 화면 계층 (계약서)

물리는 `shared/sim`(엔진)과 `shared/sim/rules`(판정·세션)가 전부 맡는다. 이 폴더는 **보여주고, 입력받고, 서버와 맞추는 일**만 한다.
화면은 물리를 프레임마다 돌리지 않는다. 샷 = `simulateShot()` 한 번(수 ms) → 결과의 history 를 `continuize`/`stateAt` 로 시각 t 에 보간해 그린다.
리플레이·미리보기·네트워크 재생이 전부 이 하나의 경로를 쓴다.

## 모듈
```
client/src/sim/
  aim.ts                  순수 수학: 포인터→phi, 고스트볼, 두께(0~1)와 두께 단계(½·⅓·¼), 방향↔두께 변환, 다이아몬드 좌표. 테스트 동반.
  playback.ts             결과 history 를 벽시계로 재생하는 순수 헬퍼: makePlayback(result, params) → {duration, at(t)}. 1/120 s 키프레임 캐시.
  render/Renderer.ts      interface Renderer { mount(el, table): void; setTable(table): void; resize(): void; draw(frame: RenderFrame): void; project(x,y): [px,py]; unproject(px,py): [x,y]; viewport(): Viewport | null; screenshot(): Promise<Blob|null>; dispose(): void }
                          RenderFrame = { balls: readonly BallState[]; cue?: {phi, pullback 0..1, visible, ballId?}; highlightBallId?: string }  (cue.ballId 없으면 highlightBallId → 첫 공)
                          Viewport = { width, height: 마운트 CSS px; dpr; insets: SafeInsets; scale: px/m }. 화면 좌표는 마운트 요소(패딩 박스) 기준 CSS px.
  render/Canvas2DRenderer.ts  1차 렌더러. `new Canvas2DRenderer({ insets?: SafeInsets | () => SafeInsets, centreSpots?, dpr?, createCanvas? })`. 정적 층(라사·레일·다이아몬드) 오프스크린 캐시, 공은 색별 스프라이트+명암(ctx.filter 금지: iOS 미지원).
                          DPR 은 min(devicePixelRatio, 2) 를 resize 마다 다시 읽는다. 캔버스는 마운트에 absolute·inset 0 으로 얹힌다(Overlay 와 같은 좌표계) — 마운트는 스스로 크기를 가져야 하며 static 이면 relative 로 바뀐다.
                          `getLayout(): TableLayout | null` — 플레이 면 히트테스트(tableGeometry.isOnPlaySurface) 용. 공 색·강조 링은 토큰(render/tokens.ts) 에서 읽어 Overlay 의 경로 색과 맞춘다.
  render/tokens.ts        캔버스용 디자인 토큰 읽기(--brand, --ink-1, --surface-1, --surface-line, --ball-*): parseColor / rgba / readPalette. 렌더러·오버레이 공용, 못 읽으면 index.css 기본값.
  render/ThreeRenderer.ts     2차 렌더러(별도 단계). 오소 탑다운 카메라, 조명 구체, 접촉 그림자 스프라이트, 컨텍스트 손실 2회 → Canvas2D 폴백.
  overlay/Overlay.ts      `new Overlay(mount, { maxDpr?, labels?: { fullBall: t("sim.aim.fullBall") } })` → draw(state: OverlayState) / resize / clear / dispose. state.project 에 renderer.project 를 넘긴다.
                          조준선·고스트볼·예측 경로(큐볼 + 적구 첫 구간 + 두 번째 적구 접촉 전 쿠션 수)·두께 표시를 별도 2D 캔버스에 디바이스 픽셀로 그림. 색 문자열은 resize 때 한 번만 만든다.
  audio.ts                절차 합성 SFX(큐 타격·공·쿠션, 임펄스로 게인), 이벤트 시각에 스케줄. `new SimAudio(getCtx: () => AudioContext | null)` — getCtx 는 useGameAudio 가 제스처로 잠금 해제한 컨텍스트를 돌려주는 게터여야 한다.
                          ※ 현재 useGameAudio 는 getCtx 를 return 하지 않는다. useSimulator 를 잇기 전에 hooks/useGameAudio.ts 의 return 에 `getCtx` 를 추가할 것(두 번째 AudioContext 를 만들면 모바일 웹뷰 컨텍스트 상한·제스처 잠금 해제를 잃는다). iOS: navigator.audioSession.type='playback' 시도.
  haptics.ts              @capacitor/haptics impact, 50 ms 스로틀, 시뮬 루프 밖에서만.
  useSimulator.ts         상태 기계 훅(아래). 엔진·세션·서버 동기화·재생을 소유.
  SimSetupDialog.tsx      종목·테이블·규칙(UMB/PBA, 4구 옵션)·다마수·이닝 상한·(고급) 쿠션 모델·컨디션. QuickActions 의 기존 모달을 대체.
  SimulatorPage.tsx       DOM 셸: HUD·조작·이닝 시트·종료 다이얼로그. React.lazy 로 /online-game 에 연결(App.tsx).
```

## useSimulator 상태 기계
- `phase`: `setup` → `aim` ⇄ `shooting`(재생 중) → `finished`. `aim` 에서만 입력을 받는다.
- 상태: `params: SimParams`, `session: SessionState`(shared/sim/rules), `balls: BallState[]`, `input: {phi, V0, a, b, theta}`, `preview: SimResult | null`(입력이 바뀌면 requestIdleCallback/디바운스 30 ms 로 `simulateShot` 재계산), `playback`, `serverSessionId`, `mismatches`.
- `shoot()`: local `simulateShot` → 즉시 재생 시작 → 동시에 `POST /api/hiq/sim/sessions/:id/shots` {idx, input, clientHash}. 응답이 `mismatch` 면 재생이 끝난 뒤 서버 `final`/`state` 로 스냅하고 토스트 1회("서버와 결과가 달라 맞췄습니다"). 응답 실패(오프라인)면 로컬 결과를 유지하고 큐에 넣어 다음 샷 전에 재전송(idx 순서 보장).
- `undo()`: 마지막 샷 전 스냅샷으로 복귀(연습 모드만, 서버에는 close 후 새 세션이 아니라 **기록하지 않는 연습 샷**으로 취급 — 연습 모드에선 서버 기록 자체를 끄는 `practice: true` 옵션으로 단순화).
- 판정은 `evaluateShot` + `applyShot` 을 로컬에서도 돌려 HUD 를 즉시 갱신하되, 정본은 서버 응답의 `state` 다.
- 오디오·햅틱은 재생 시작 시 result.events 의 t 로 예약한다(재생 중 이벤트를 다시 감지하지 않는다).

## 입력 규약
- 조준: 테이블(오버레이) 위 드래그 → 큐볼 중심 기준 각도. 드래그 감도는 큐볼에서 손가락까지 거리에 반비례(멀수록 정밀). `±` 버튼 0.1°, 길게 누르면 가속. 두께 버튼(½·⅓·¼, 좌/우)은 가장 가까운 적구 기준으로 phi 를 계산(aim.ts).
- 당점: 큐볼 크기 원 안에서 드래그, 반지름 0.5 R 밖은 미스큐 링(회색)으로 표시하고 클램프. 값은 (a, b) 비율.
- 세기: 큐를 뒤로 당기는 제스처(세로 드래그) 또는 슬라이더. 표시는 % 와 m/s 둘 다. 미세 조절 슬라이더 ±0.05 m/s. 기본 2.5 m/s. 상한 9 m/s.
- 큐 각(theta): v2.0 에선 고급 패널에만(0~20°).
- 재생 중엔 모든 입력 잠금. 재생 배속 1×, 길게 누르면 4× 빨리감기(이벤트 예약 오디오는 유지).

## HUD
- 상단: 선수별 점수/다마수, 이닝, 에버리지(score/innings, 진행 중 이닝 포함 여부는 점수판 앱과 같게 "진행 중 포함"), 하이런, 현재 런 배지, 규칙 배지(UMB·PBA·4구 옵션), 테이블 이름.
- 샷 결과 토스트: i18n 코드 → 문구(`sim.outcome.point`, `sim.outcome.missCushions` …). 이모지 금지.
- 이닝 시트(시트 형태), 종료 다이얼로그(결과·다시하기·나가기). 나가기 = `close`(abandoned) 확인 후.

## 디자인 규칙(위반 시 리뷰 반려)
- 토큰만: brand / brand-strong / brand-fg, surface-1..3 / surface-line, ink-1..4, gold(우승 의례 전용), ball-yellow/ball-red/ball-white(종목·공 색 코드 전용), cloth(라사). 하드코딩 hex 는 캔버스 내부 렌더링(라사·공·큐)에만 허용.
- 금지: 그라데이션·blur·네온·animate-ping/pulse 장식·font-black·italic·tracking-tighter/widest·12px 미만 텍스트·영어 UI 라벨·이모지.
- 모든 문자열은 i18n 5개 로케일(ko/en/es/tr/vi) 키 `sim.*` 로. 키 개수 일치 검증. `useT()` → `{t, locale}`, 보간은 `.replace("{n}", …)`.
- 세이프 에어리어(env(safe-area-inset-*)) 존중, 세로 고정 레이아웃, 태블릿에서 테이블이 잘리지 않게 letterbox.

## 서버 API (server/routes/modules/sim.ts)
- `POST /api/hiq/sim/sessions` → {session, state, balls}
- `POST /api/hiq/sim/sessions/:id/shots` {idx, input, clientHash} → {shot, duplicate, mismatch, hash, events, final, duration, truncated, history?, outcome, state}
- `POST /api/hiq/sim/sessions/:id/close` {status: finished|abandoned}
- `GET /api/hiq/sim/sessions`, `GET /api/hiq/sim/sessions/:id`, `GET /api/hiq/sim/ladder?gameType&tableId`
