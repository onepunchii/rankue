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
  render/ThreeRenderer.ts     2차 렌더러(three r182, WebGL2). `new ThreeRenderer({ insets?, centreSpots?, dpr?, shadows?, onContextLost?, onContextRestored?, createCanvas?, canvas?, now? })`.
                          같은 Renderer 계약 + `getLayout()` + `stats()`. 오소 탑다운 카메라(절두체 = threeMath.orthoFrustum, computeLayout 과 1:1 px), 라사 텍스처 평면·압출 레일·다이아몬드 인스턴스,
                          조명 구체(토큰 색 6점 무늬 텍스처, ω 를 벽시계 dt 로 적분한 자세, id 가 사라지면 초기화), 접촉 그림자 사각형, 큐대 원기둥 4토막, 강조 링.
                          그리기는 draw()/resize() 때만, draw 는 할당 없음. WebGL2 를 못 열면 생성자가 던진다. 컨텍스트 손실마다 onContextLost, 복구 시 마지막 프레임 재그리기.
                          레터박스는 alpha:false 라 마운트 배경(surface-3 를 surface-1 위에 합성)으로 지운다. dispose 는 GL 자원 해제 + forceContextLoss(재마운트 불가).
  render/threeMath.ts     ThreeRenderer 의 순수 수학(테스트 동반): orthoFrustum / projectOrtho / unprojectOrtho, integrateOrientation(q ← Δq(ω̂,|ω|dt) ⊗ q), cueGap / cueRotationZ, diamondWorld.
  render/rendererChoice.ts 렌더러 선택: localStorage "rankue.sim.renderer" = "three" | "canvas". 없으면 WebGL2 탐색(탐색 컨텍스트는 즉시 loseContext) → 되면 three, 아니면 canvas. 저장값이 three 여도 WebGL2 가 안 되면 canvas.
                          `selectRendererKind()`(페이지용) · `chooseRendererKind(pref, webgl2)` · `read/writeRendererPref(storage, kind)` · `CONTEXT_LOSS_LIMIT = 2`.
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

## useSimulator API

파일: `useSimulator.ts`(React 바인딩) → `simController.ts`(부수효과: 물리·판정·재생 루프·오디오/햅틱·미리보기·서버 동기화) →
`simReducer.ts`(순수 상태 기계 + 스토어) / `simApi.ts`(서버 클라이언트) / `playback.ts`(재생 보간·시계).
화면은 훅이 주는 상태와 `frameAt()` 만 쓴다. Renderer/Overlay 인스턴스·rAF 그리기 루프·토스트·i18n 은 전부 화면(SimulatorPage) 소유.

```ts
import { useSimulator } from "@/sim/useSimulator";

const sim = useSimulator({
    getAudioContext: getCtx,                 // useGameAudio().getCtx — 없으면 무음
    muted,                                   // 기본 false
    haptics: true,                           // 기본 true
    previewDelayMs: 30,                      // 기본 30
    onMismatch: (n) => toast({ title: t("sim.sync.mismatch") }),           // 서버 결과로 스냅한 직후, 샷당 1회
    onOffline: (reason) => toast({ title: t(OFFLINE_KEY[reason]) }),      // 기록 포기 순간 1회
    onOutcome: (outcome, session) => ...,    // 재생이 끝나 공이 멈춘 뒤(스냅 반영 후). 토스트·이닝 시트
    onMiscue: () => toast({ title: t("sim.shot.miscue") }),               // 정상 경로에선 안 나옴(setSpin 이 클램프)
});
```

### 반환 `Simulator`
```ts
interface Simulator {
    phase: "setup" | "aim" | "shooting" | "finished";
    config: SimSetupConfig | null;            // start() 에 넘긴 설정
    params: SimParams | null;                 // { table: TABLES[tableId], cue: DEFAULT_CUE, cushionModel, condition }
    session: SessionState | null;             // shared/sim/rules. 점수·이닝·하이런·턴·status·winnerIndex
    balls: readonly BallState[];              // 정지 상태의 공(마지막 샷 final 또는 서버 스냅). 재생 중엔 frameAt()
    input: { phi; V0; a; b; theta };          // CueInput. cueBallId 는 별도(cueBallId)
    cueBallId: "white" | "yellow";            // 현재 차례
    preview: { result: SimResult; paths: PreviewPaths; input: ShotInput } | null;   // aim 에서만. Overlay.preview 로 paths 를 그대로
    playback: { duration: number; playing: boolean; speed: 1 | 4 };
    outcomeLast: ShotOutcome | null;          // 로컬 판정(서버 스냅 시 서버 판정)
    mismatches: number;
    offline: boolean;                         // 서버 기록 포기됨(로컬 플레이 계속). 화면에 "기록되지 않음" 표시
    record: boolean;                          // false = 연습 모드
    syncing: boolean;                         // 서버 호출 진행 중(세션 개설·샷 전송·재전송)
    queued: number;                           // 재전송 대기 샷 수
    serverSessionId: string | null;
    canUndo: boolean;                         // 연습 모드 + aim/finished + 스택 있음
    canPlace: boolean;                        // 연습 모드 + aim
    actions: SimulatorActions;                // 참조 안정(useMemo). 이펙트 deps 에 넣어도 된다
    frameAt(now?: number): SimFrame;          // 참조 안정. rAF 안에서 부른다
}
interface SimFrame { balls: readonly BallState[]; t: number; duration: number; playing: boolean; speed: 1 | 4 }
```
`frameAt(now)` 는 React 상태를 건드리지 않는다. 재생 중이면 `playback.at(t)` 의 공(시계 기준), 아니면 `balls`. 화면의 rAF 루프:
`renderer.draw({ balls: sim.frameAt(now).balls, cue: { phi: sim.input.phi, pullback, visible: sim.phase === "aim", ballId: sim.cueBallId }, highlightBallId: sim.cueBallId })`.
Overlay 는 aim 에서만: `overlay.draw({ balls: sim.balls, phi: sim.input.phi, cueBallId: sim.cueBallId, table: sim.params.table, guide: sim.preview ? "preview" : "straight", preview: sim.preview?.paths, project: renderer.project })`.

### `actions`
```ts
interface SimulatorActions {
    start(config: SimSetupConfig, opts?: { record?: boolean; players?: readonly { id: string; target: number }[] }): void;
        // setup → aim. record 기본 true(서버 세션 개설은 백그라운드, 응답 전에 친 샷은 큐에 들어갔다가 바로 전송).
        // record=false 는 연습: 서버 호출 없음, undo·placeBall 허용. players 는 2인 로컬 대전일 때만(생략 = 1인, 서버가 요청자로 기록).
    setInput(patch: Partial<CueInput>): void;   // aim 에서만. phi 정규화·V0 [0.2, 9]·theta [0, 20°]·(a,b) 미스큐 링(0.5R) 클램프
    setPhi(phi: number): void;
    nudgePhi(deltaRad: number): void;
    setThickness(step: number, side: "left" | "right"): void;   // aim.THICKNESS_STEPS 값. 가장 가까운 적구 기준(4구는 상대 큐볼 제외)
    setSpin(a: number, b: number): void;        // R 비율. 링 밖은 같은 방향으로 링 위까지
    setPower(V0: number): void;                 // m/s
    setElevation(theta: number): void;          // rad
    shoot(): Promise<void>;                     // aim 에서만. (record) 앞 샷 전송·재전송을 먼저 끝낸 뒤 → 로컬 simulateShot → evaluateShot/applyShot → 재생 시작 → 오디오·햅틱 예약 → 서버 전송
    setSpeed(speed: 1 | 4): void;               // 빨리감기. 길게 누르는 동안 4, 떼면 1. 재생이 끝나면 자동으로 1
    placeBall(id: string, x: number, y: number): boolean;   // 연습 + aim. isValidLayout 실패면 false
    undo(): void;                               // 연습 모드만. finished 에서도 가능(이어서 치기)
    restart(): void;                            // 같은 설정으로 새 세션(서버 세션도 새로). 세기(V0)는 유지
    exit(): Promise<void>;                      // 세션 닫기 후 setup. 서버 status = finished(끝났고 기록 완전) | abandoned. 닫기 호출까지 기다린다(진행 중 전송은 최대 3 s)
}
```

### 동작 규약
- 결정론: `shoot()` 이 만든 `ShotInput` 객체 하나를 로컬 시뮬과 서버 전송에 그대로 쓴다(숫자 반올림 없음). 서버가 `clientHash`(= `result.hash`) 와 다르면 `mismatch`.
- 미스매치: 재생 중 도착 → 재생이 끝난 뒤 `balls`/`session`/`outcomeLast` 를 서버 값으로 스냅 + `onMismatch`. 재생 후 도착 → 즉시 스냅 + `onMismatch`. `mismatches` 는 세션 누적.
- 오프라인: 네트워크 실패(응답 없음·5xx)는 큐에 넣고 다음 `shoot()` 전에 idx 순으로 재전송, 3회 실패면 포기 → `offline=true` + `onOffline("shot-retries")`.
  400/401/409(세션 종료) 등 거부 → 즉시 포기 `onOffline("shot-rejected")`. 세션 개설 실패 → `onOffline("session-create")`. 포기 뒤에도 로컬 플레이는 계속되지만 `exit()` 는 abandoned 로 닫는다.
  응답만 유실된 재전송(409 IDX_MISMATCH, 서버 shots = idx+1)은 기록된 것으로 보고 넘어간다.
- 재렌더: `phase/session/balls/input/preview/outcomeLast/speed/syncing/offline` 가 바뀔 때만. 드래그 중 `setPhi` 는 그때마다 재렌더된다(입력은 React 상태) — 프레임 값은 `frameAt`.
- 언마운트: 컨트롤러 dispose → 재생·예약 취소, 열린 서버 세션은 조용히 닫는다(abandoned/finished 규칙 동일).
- 테스트에서 `useSimulator`/`simController`/`simApi` 를 import 하면 `vi.mock("@/lib/queryClient", () => ({ apiRequest: vi.fn() }))` 를 먼저 둔다(vitest 에 "@" 별칭이 없다). `useSimulator({ api })` 로 가짜 API 주입 가능.

### i18n 키(훅 콜백용, 5개 로케일에 있음)
`sim.sync.mismatch`(서버와 결과가 달라 맞췄습니다) · `sim.sync.offlineShots`(shot-retries) · `sim.sync.offlineCreate`(session-create) · `sim.sync.rejected`(shot-rejected) · `sim.shot.miscue`

### 하위 모듈 API
- `playback.ts`: `makePlayback(result, ball)` → `{ duration, at(t), keyframes }`(at 은 [0, duration] 클램프, t ≥ duration 이면 `result.final` 참조 그대로; keyframes 는 1/120 s 격자 지연 캐시). `effectiveBall(params)` = `applyCondition(table.ball, condition)` — 재생·미리보기에 반드시 이것을 넘긴다. `eventsForFeedback(result)` → `SoundEvent[]`(audioMapping). `startClock/clockTime/withSpeed` 배속 연속 시계.
- `simApi.ts`: `simApi.createSession(config, balls?, players?)` → `{ session: SimSessionRow, state: SessionState, balls }`, `postShot(sessionId, { idx, input, clientHash })` → `ShotResponse`, `closeSession(sessionId, "finished" | "abandoned")` → `SimSessionRow`. 순수: `toCreateSessionBody`, `toShotBody`, `parse*Response`, `classifyApiError` → `"network" | "idx-mismatch" | "session-closed" | "unauthorized" | "rejected"`, `serverShotsFromError`. `createSimApi(request)` 로 주입.
- `simReducer.ts`: `simReducer(state, action)`, `createSimStore()`, `INITIAL_STATE`, `paramsFromConfig`, `clampPower/clampElevation/clampSpin`, `defaultPhi/thicknessPhi/objectTargetFor`, 상수 `V0_DEFAULT=2.5, V0_MIN=0.2, V0_MAX=9, THETA_MAX=20°, MAX_RETRIES=3`.

## SimulatorPage (화면 계층)

파일: `SimulatorPage.tsx`(DOM 셸, default export 도 있음 — `React.lazy(() => import("@/sim/SimulatorPage"))` 로 `/online-game` 에 연결)
→ `components/`(HUD · Controls · SpinPad · PowerControl · HoldButton · OutcomeBanner · InningSheet · EndDialog · ExitConfirm, 전부 memo 의 얇은 컴포넌트)
→ 순수 모듈(테스트 동반): `pageConfig.ts` · `hudMath.ts` · `inningLog.ts` · `outcomeText.ts` · `controlsMath.ts` · `tableGestures.ts` · `holdRepeat.ts`.

### 설정 전달 `?cfg=`
`/online-game?cfg=<base64url(JSON)>` — JSON 은 `SimSetupConfig` + `record?: boolean`(기본 true). `pageConfig.simulatorPath({ config, record })` 로 만들고
`decodePageConfig(readCfgParam(search))` 로 읽는다(신뢰하지 않는 입력: 필드 검사 뒤 `buildConfig` 로 정규화, 깨졌으면 null → 페이지가 `SimSetupDialog` 를 위에 연다).
`SimSetupDialog.onStart(config, { record })` — 고급 섹션의 "기록하기" 스위치(기본 켜짐). 세션 없이 설정 창을 닫으면 `/dashboard` 로 돌아간다.

### 레이아웃(세로 고정)
`fixed inset-0` 컬럼 + `env(safe-area-inset-*)` 패딩, 내용은 `max-w-[640px]`. 위에서부터 HUD(규칙·테이블 배지 / 상태 칩 / 소리 토글 / 선수 카드) → 테이블 래퍼(`relative flex-1 touch-none`,
렌더러(ThreeRenderer | Canvas2DRenderer)와 Overlay 가 absolute 캔버스로 얹힘, 태블릿은 렌더러가 letterbox) → 조작 패널(두께 5단계 / 좌·우 · ±0.1° · 되돌리기 · 이닝 시트 · 나가기 / 당점 패드 · 세기 · 샷).
모든 탭 대상 ≥ 44 px, 텍스트 ≥ 12 px, 토큰만 사용.

### 렌더러 선택(자동, UI 없음)
화면 인스턴스마다 한 번 `selectRendererKind()`(저장값 → WebGL2 탐색). three 면 `new ThreeRenderer({ onContextLost })` 를 try/catch 로 만들고 실패하면 Canvas2DRenderer.
컨텍스트 손실이 `CONTEXT_LOSS_LIMIT`(2)회 쌓이면 "canvas" 를 저장하고 이벤트 밖(setTimeout 0)에서 ThreeRenderer 를 dispose → Canvas2DRenderer 를 같은 래퍼에 마운트.
rAF 루프·오버레이(`project`)·제스처(`unproject`)는 `rendererRef` 만 보므로 교체를 모른다. 사용자 토글은 아직 없다(설정 화면에서 `writeRendererPref` 로 붙일 것).

### 그리기 루프
rAF 마다 `sim.frameAt(performance.now())` → 재생 중이거나 dirty 일 때만 `renderer.draw({ balls, cue: { phi, pullback: pullbackFor(V0), visible: phase==="aim", ballId: cueBallId }, highlightBallId })`.
Overlay 는 aim 에서만: 드래그 중엔 `guide: "straight"`, 손을 떼면 `preview`(훅의 미리보기 경로). 재생 중엔 `overlay.clear()` 한 번. React 상태는 프레임마다 건드리지 않는다(뷰는 ref).

### 제스처(tableGestures.ts, 테이블 좌표 m 로 해석)
- aim: 드래그 → `aim.phiFromDrag`(큐볼 중심 기준 각 변화, 멀수록 정밀) → `actions.setPhi`.
- place(연습 모드만): 공을 눌러 끌기(잡은 오프셋 유지) → `actions.placeBall`(isValidLayout 실패면 무시). 끄는 동안 그 공을 강조.
- hold(재생 중): 200 ms 길게 누르면 `setSpeed(4)`, 떼면 1.

### HUD 규약
- 에버리지 = score / max(1, innings + (currentRun > 0 || phase !== "setup" ? 1 : 0)) — 점수판 앱(`game/[id].tsx` getAvg: 완료 이닝 뒤에 진행 중 런을 항상 덧붙임)과 같은 "진행 중 이닝 포함". `hudMath.inningsForAverage` 주석.
- 이닝 시트는 `inningLog.ts` 가 `onOutcome(outcome, sessionAfter)` 마다 쌓는다(친 선수는 `applyShot` 규칙에서 역산). 되돌리기 = `popShot`, 다시하기·나가기 = `EMPTY_LOG`.
- 결과 배너: `outcomeText.outcomeMessage(t, outcome)` — `sim.outcome.*`, 3쿠션 미스는 "쿠션 {n}개". 2.4 s 뒤 사라짐.
- 종료: `session.status === "finished"` → EndDialog(승자 이름만 gold). 다시하기 = `actions.restart()`(같은 설정, 새 서버 세션). 나가기 = ExitConfirm → `await actions.exit()` → `/dashboard`.
- 소리: `useGameAudio().getCtx` 를 훅에 넘기고, HUD 토글이 `muted` 만 바꾼다.

### 테스트
`SimulatorPage.test.ts` 는 jsdom 을 직접 띄우고("@" 별칭 없음 → `vi.mock`) 진짜 훅·컨트롤러·엔진·렌더러로 페이지를 마운트한다: ?cfg 연습 세션 → 샷 → `performance.now` 를 앞당겨 재생 종료 → 배너·이닝 시트·되돌리기, 설정 창 → 시작 → 나가기.

## 네트워크 대전 A — 페이지 통합 메모

비동기 2인 대전(코드로 초대 → 번갈아 샷 → 폴링으로 따라잡기). 서버 계약은 `server/routes/modules/simMatch.ts`(정본), 클라이언트는 아래 파일이 전부다.
SimulatorPage.tsx · render/* · App.tsx · QuickActions.tsx 는 이 작업에서 건드리지 않았다 — 아래 (a)~(e) 대로 잇는다.

```
client/src/sim/
  matchApi.ts             simMatch 라우트 타입 클라이언트. MatchPublic(=publicMatch) · MatchShot · PostShotResponse · createMatchApi(request) · matchApi.
                          순수: URL · toCreateMatchBody/toJoinBody · parse* · classifyMatchError("not-your-turn"|"too-early"|simApi 분류) ·
                          isMyTurn/myName/opponentName/playerNames/claimableNow/matchResult/myTarget/matchConfig · sanitizeCode/isCompleteCode/formatCode.
  simReducer.ts           mode "solo"|"match", match: MatchState, replayOf, Phase 에 "waiting" 추가. 액션 startMatch/matchSync/matchSnap/replayShot/matchShotAck/matchShotFail.
  simController.ts        startMatch/resign/claim/sync/canClaim, 폴링(2 s → 1분 뒤 5 s, wake 즉시), 따라잡기 재생, 백오프 재전송, resync. deps: matchApi·wallClock·onWake.
  useSimulator.ts         Simulator.mode/match(MatchView)/replaying, actions.startMatch/resign/claim/sync, options.matchApi/onMatch.
  match/MatchLobby.tsx    로비(만들기 / 코드로 참가). props { onStarted(match), onClose, api?, initialTab?, pollMs? }
  match/MatchList.tsx     내 대전 목록(TanStack Query, 키 ["sim-matches"], 진행 중이면 10 s 재조회). props { onOpen(match), api? }
  match/matchView.ts      목록·로비 표시값(배지 키·정렬·상대 이름·종목 문구·종료 사유 문구·joinErrorKey·shareText). 테스트 동반.
```

### 훅 API 델타(위 "useSimulator API" 에 더해지는 것)
```ts
type Phase = "setup" | "aim" | "waiting" | "shooting" | "finished";   // waiting = 상대 차례(입력 잠금·폴링)
type MatchEvent = "offline" | "online" | "opponent-shot" | "finished" | "resynced" | "claim-too-early";

useSimulator({ ..., matchApi?: MatchApi, onMatch?: (e: MatchEvent) => void });

interface Simulator {
    mode: "solo" | "match";
    match: MatchView | null;          // 아래
    replaying: boolean;               // 따라잡기 재생 중(이 기기에서 친 샷이 아님) — "상대 샷" 칩
    ...                               // 나머지는 그대로. 대전에선 record=true, canUndo=canPlace=false, config.target = 내 다마수
}
interface MatchView {
    id: string; myIndex: 0 | 1; myCueBallId: "white" | "yellow";
    names: readonly [string, string];   // players 순서: [호스트(흰 공), 게스트(노란 공)]
    myName: string; opponentName: string;
    turn: number; isMyTurn: boolean;
    status: "waiting" | "playing" | "finished" | "canceled"; version: number;
    winnerIndex: 0 | 1 | null; endReason: "target" | "inningCap" | "resign" | "claim" | null;
    claimableAt: string | null; canClaim: boolean;   // 상대 차례 + 48 h 지남(폴링마다 다시 계산)
    canResign: boolean;                              // playing
    opponentShot: boolean;                           // 재생 중인 샷이 상대 샷
}
interface SimulatorActions {
    ...
    startMatch(match: MatchPublic): boolean;   // 내 차례 → aim, 상대 차례 → waiting, 끝남 → finished. state/balls 없거나(참가 전) myIndex<0 이면 false
    resign(): Promise<boolean>;                // 성공하면 phase finished(상대 승, endReason "resign")
    claim(): Promise<boolean>;                 // false 면 onMatch("claim-too-early") 가 먼저 온다
    sync(): void;                              // 지금 한 번 GET(당겨서 새로고침)
}
```
동작: 내 샷 = `shoot()` 그대로(로컬 시뮬·재생 → `POST /sim/matches/:id/shots {idx,input,clientHash}`). 409 NOT_YOUR_TURN/IDX_MISMATCH/끝난 대전/400 은 재시도 큐 대신
서버 정본으로 스냅(`onMatch("resynced")`), 네트워크 실패는 1·2·4 s 백오프로 3번 → `offline=true` + `onMatch("offline")`(항목은 큐에 남고 폴링이 성공하면 다시 보낸다 → `onMatch("online")`).
상대 샷은 `GET /shots?from=` 으로 받아 `simulateShot(preState, input)` 으로 재시뮬, 해시가 다르면 `mismatches+1` 후 재생이 끝나고 서버 상태로 스냅(`onMismatch`). 재생은 로컬 샷과 같은 경로(오디오·햅틱·`onOutcome`).
서버가 끝냈으면(상대 결승 샷·기권·무응답 승리) `session.status="finished"` + `session.winnerIndex` 를 채워 주므로 기존 HUD·EndDialog 가 그대로 승자를 그린다.
`exit()` 는 서버 close 없이 setup 으로(대전은 남는다). 실전 경기 API(`/api/hiq/game/*`)는 여전히 부르지 않는다.

### (a) `?match=<id>` 로 열기
서버 알림 딥링크가 `/online-game?match=<id>` 다(simMatch.ts notify). `?cfg` 보다 우선한다.
```tsx
import { matchApi, type MatchPublic } from "./matchApi";
const params = useMemo(() => new URLSearchParams(search.startsWith("?") ? search.slice(1) : search), [search]);
const matchId = params.get("match");
const lobby = params.get("lobby") === "1";
const [initial] = useState(() => (matchId || lobby ? null : decodePageConfig(readCfgParam(search))));
const [setupOpen, setSetupOpen] = useState(initial === null && !matchId && !lobby);   // 대전·로비에선 설정 창을 열지 않는다
const [matchLoad, setMatchLoad] = useState<"idle" | "loading" | "error" | "notMine">("idle");

useEffect(() => {
    if (!matchId || startedRef.current) return;
    startedRef.current = true;
    setMatchLoad("loading");
    matchApi.getMatch(matchId).then((m) => {
        if (m.myIndex < 0) { setMatchLoad("notMine"); return; }          // t("sim.match.notMine")
        if (m.status === "waiting") { setMatchLoad("idle"); navigate("/online-game?lobby=1", { replace: true }); return; }   // 호스트가 아직 대기 중
        setMatchLoad(actions.startMatch(m) ? "idle" : "error");           // t("sim.match.loadFailed")
    }, () => setMatchLoad("error"));
}, [matchId, actions, navigate]);
```
`matchLoad === "loading"` 동안 테이블 위에 `t("sim.match.loading")` 칩. `onMatch` 토스트 매핑:
`offline → sim.match.offline`, `online → sim.match.online`, `resynced → sim.match.resynced`, `finished → sim.match.finishedByServer`, `claim-too-early → sim.match.claimTooEarly`, `opponent-shot` 은 칩으로 충분(토스트 생략).

### (b) HUD — 두 선수
- `names`: `sim.match ? sim.match.names : (기존 playerLabel 배열)`. players[0]=호스트(흰 공), players[1]=게스트(노란 공) — 순서가 `session.players` 와 같다.
- 차례 강조는 HUD 가 이미 `session.turn` 으로 한다(`sim.hud.turn` 칩). 상대 이름은 `names` 로 들어간다.
- 상태 칩: 대전에선 `offline` 의 뜻이 "지금 끊김·재시도 중"이라 HUD 에 `offline={false}` 를 주고, 대신 `sim.mode === "match" && sim.offline` 일 때 테이블 위 칩 `t("sim.match.offline")`. `record`/`syncing`/`queued` 는 그대로.
- 규칙·테이블 배지는 `sim.config`(matchConfig) 로 기존과 같다.

### (c) waiting 단계
- `Controls` 는 `phase="waiting"` 을 받으면 이미 전부 잠긴다(aim 이 아니면 locked, 샷 버튼 disabled). 되돌리기는 `canUndo=false` 라 안 보인다.
- 테이블 위 배너(포인터 이벤트 없음): `t("sim.match.waitingTurn")` + `t("sim.match.waitingHint")`, 상대 이름은 `sim.match.opponentName`. 재생 중 `sim.match.opponentShot` 이면 칩 `t("sim.match.opponentShot")`.
- 내 차례가 되면(`phase === "aim"`) 짧은 칩 `t("sim.match.yourTurn")`(2.4 s, OutcomeBanner 와 같은 리듬).
- 기권 버튼(h-11, 나가기 옆): `phase !== "finished" && sim.match?.canResign` → 확인 다이얼로그(`sim.match.resignTitle` / `resignDesc` / `resignConfirm`) → `await actions.resign()`.
- 승리 주장 버튼: `sim.match?.canClaim` 일 때만 배너 아래에 `t("sim.match.claim")` + `t("sim.match.claimDesc")`; `const ok = await actions.claim(); if (!ok) toast(t("sim.match.claimTooEarly"))`. claim 불가일 땐 `t("sim.match.claimWait")` 한 줄.
- 나가기(ExitConfirm): 대전이면 설명을 `t("sim.match.leaveDesc")` 로, 확인 시 `await actions.exit()` 뒤 `/online-game?lobby=1`(목록으로) 또는 `/dashboard`.
- 폴링은 훅이 맡는다(가시성·포커스 wake 포함). 페이지는 당겨서 새로고침 같은 명시적 갱신에만 `actions.sync()`.

### (d) 종료 다이얼로그
`phase === "finished"` 에서 EndDialog 가 열리는 규칙은 그대로. `names={sim.match.names}`. 부제(`endTitle` 아래 한 줄)에 종료 사유:
```tsx
import { endReasonText } from "./match/matchView";
const reason = sim.match ? endReasonText({ status: sim.match.status, endReason: sim.match.endReason, winnerIndex: sim.match.winnerIndex, hostName: sim.match.names[0], guestName: sim.match.names[1] }, t) : null;
// "목표 점수에 도달했어요" / "이닝 제한으로 끝났어요" / "{name}님이 기권했어요" / "48시간 무응답으로 {name}님의 승리예요"
```
대전엔 "다시하기"가 없다(`actions.restart()` 는 no-op). EndDialog 에 `hideRestart?: boolean`(또는 `onRestart` 생략 시 숨김) 을 더해 대전이면 나가기만 두거나, 나가기 라벨을 `t("sim.end.exit")` 그대로 두고 `/online-game?lobby=1` 로 보낸다.
`record`/`offline` 은 그대로 전달(대전은 record=true; offline 이면 "이 세션은 기록되지 않았어요" 대신 `sim.match.offline` 이 맞다 — `offline={false}` 로 주고 필요하면 별도 문구).

### (e) 로비·목록 마운트
- QuickActions: SimSetupDialog 의 시작 버튼 옆(또는 고급 위)에 "친구와 대전" 항목 — `t("sim.match.entry")` / `t("sim.match.entryDesc")` — 누르면 `setLocation("/online-game?lobby=1")`. (SimSetupDialog 에 `onMatch?: () => void` prop 을 더해 링크 버튼 한 줄을 그리면 된다; 설정 값은 로비가 자체 폼으로 다시 받는다.)
- SimulatorPage: `lobby && sim.phase === "setup"` 이면 테이블 대신(또는 `fixed inset-0 z-[5] overflow-y-auto bg-surface-1` 로 위에) 렌더:
```tsx
import { MatchLobby } from "./match/MatchLobby";
import { MatchList, MATCH_LIST_QUERY_KEY } from "./match/MatchList";
const openMatch = useCallback((m: MatchPublic) => {
    if (m.status === "waiting") return;                     // 호스트 대기 중: 로비 코드 화면이 이미 그 대전을 폴링한다(목록 탭은 안내만)
    if (actions.startMatch(m)) navigate(`/online-game?match=${m.id}`, { replace: true });
}, [actions, navigate]);
<MatchLobby onStarted={openMatch} onClose={() => navigate("/dashboard")} />
<MatchList onOpen={openMatch} />
```
  MatchList 는 QueryClientProvider 안이어야 한다(App 이 감싼다). 샷·기권·참가 뒤 `queryClient.invalidateQueries({ queryKey: MATCH_LIST_QUERY_KEY })` 하면 목록이 바로 갱신된다.
  MatchLobby 의 `onStarted` 는 호스트(상대 입장 → playing 폴링)·게스트(참가 응답) 모두 playing 행을 준다 → `actions.startMatch` 가 바로 aim/waiting 으로 연다.
- 알림 권한·푸시는 서버가 이미 보낸다(차례·종료). 클라이언트는 딥링크만 처리하면 된다.

### 검증·테스트
- `matchApi.test.ts`(18) · `simReducer.test.ts` 대전 블록(18) · `simController.match.test.ts`(21, FakeMatchServer 가 실제 엔진으로 서버 규칙을 흉내) · `useSimulator.test.ts`(4) · `match/matchView.test.ts`(5) · `match/MatchLobby.test.ts`(8, 로비·목록 jsdom 스모크).
- 테스트에서 `matchApi`/`useSimulator`/`MatchLobby` 를 import 하면 `vi.mock("@/lib/queryClient", ...)` 를 먼저 둔다(기존 규칙과 같다). 컨트롤러엔 `matchApi`·`wallClock`·`onWake` 를 주입한다.
- i18n: `sim.match.*` 68개, 5개 로케일 키 집합 동일(스크립트로 검증).

## 리플레이 공유 (share/)
```
share/replayLink.ts   encodeReplay/decodeReplay/parseReplay — `?replay=<base64url JSON>` {v:1, table, cushionModel, condition?, balls, input, engineVersion, hash}.
                      숫자는 반올림하지 않아(JSON 최단 왕복) 재시뮬 해시가 비트 단위로 같다. 디코더는 모든 필드를 검사하고 하나라도 어긋나면 null.
share/shareCard.ts    renderShareCard(result, opts) → 1080×1350 캔버스(세로 테이블·큐볼 경로·쿠션 번호·최종 배치·제목/통계/푸터). 렌더러 인스턴스 의존 없음.
share/useShare.ts     shareShot(): 링크 클립보드 복사(제스처 직후) → PNG → Capacitor Filesystem+Share / Web Share(files) / 다운로드.
페이지: 솔로·연습·드릴에서 lastResult 가 있으면 테이블 오른쪽 위 "공유", EndDialog 에도 "공유". `?replay=` 는 연습 세션으로 열어 자동으로 한 번 치고 해시를 비교해 "리플레이" 칩을 띄운다.
```
