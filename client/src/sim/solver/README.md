# client/src/sim/solver — 해법 찾기

지금 배치에서 **득점이 되는 샷**을 결정론 엔진(`shared/sim` `simulateShot` + `rules/evaluateShot`)으로 찾아 상위 후보를 경로와 함께 돌려준다.
탐색은 Web Worker(모듈 워커)에서 돌고, 화면은 후보의 `SimResult` 를 기존 오버레이(`buildPreviewPaths` → `OverlayState.preview`)로 고스트 경로처럼 그린 뒤
"적용" 으로 `actions.setInput` 에 넣는다. 이 폴더 밖 파일은 건드리지 않았다(i18n 5개 로케일에 `sim.solver.*` 35개 키만 추가).

```
client/src/sim/solver/
  search.ts          순수 탐색. createShotSearch(req, {now}) → { step(n), progress(), result() } / searchShots(req, opts) 한 번에.
                     시드(적구 두께 × 좌우, 뱅크) → 360° 전수(0.5°) → 상위 5개 정제. 점수·가족 병합·조준 라벨. DOM·시각·Math.random 없음.
  runner.ts          runSearchCooperatively(req, {now, yieldFn, isCancelled, onProgress, batch}) — 배치 사이 양보(기본 setTimeout 0). 워커·폴백 공용.
  protocol.ts        워커 메시지 타입(SolverInMessage / SolverOutMessage)과 상수: DEFAULT_BUDGET_MS 1500 · PROGRESS_INTERVAL_MS 200 · WORKER_BATCH 200 · MAIN_THREAD_BATCH 60.
  solver.worker.ts   모듈 워커. 'solve' → 진행(~200 ms) → 'result'. 'cancel' 은 배치 사이 양보에서 처리(부분 결과 aborted: true). 새 solve 는 앞 것을 취소.
  useSolver.ts       React 훅. 워커는 첫 solve 에 게으르게 생성, 언마운트에 terminate. Worker 가 없거나(SSR·테스트) 워커가 error 를 내면 메인 스레드 폴백(60개 배치 + setTimeout 0).
  SolverSheet.tsx    시트 UI(InningSheet 와 같은 틀). 상태 한 줄 + 상위 3개 후보(조준·세기·당점·쿠션·오차 허용) + [경로 보기] [적용].
  *.test.ts          search(18) · runner+protocol(5) · useSolver(7, 폴백 + 가짜 워커 프로토콜) · SolverSheet(5, jsdom 스모크)
```

## 성능(측정)
- Node 22, 대대 3쿠션 개시 배치: **34,405 시뮬레이션 / 1.06 s ≈ 32,000 sims/s**(샷당 ≈ 0.03 ms, 이벤트 평균 9.6개). `search.test.ts` 가 매번 로그로 남긴다.
- 개시 배치에서 첫 득점 후보는 시드 55–72회 안에 나온다(시드 1·2·3·4·5·42). 계획 전체(시드 2,340 + 전수 32,400 + 정제 70)를 1.5 s 예산 안에
  데스크톱은 다 돌고, 폰(JSC)은 대략 절반 — 예산에 잘려도 "그럴듯한 조합" 순서라 앞쪽 조합은 전수까지 본다.

## 탐색·점수(요약, 자세한 건 search.ts 머리 주석)
1. **seed** — 적구마다 두께 {1, .85, .7, .55, .4, .25, .15} × 좌/우(정면은 한 번) + 쿠션 4면 × 6점 뱅크(공에 가려진 광선 제외) = 개시 배치 26 + ≤ 24 개 조준
   × (세기 {1.6, 2.2, 2.8, 3.5, 4.5} × 당점 {(0,0), (±.3,0), (±.3,.25), (0,±.3), (±.15,−.3)}) 45 조합. 조합은 등급순(무회전·2.8 부터), 조준은 시드 셔플(mulberry32).
2. **sweep** — 예산이 남으면 같은 조합 순서로 360° 를 0.5° 간격(셔플)으로 전수.
3. **refine** — 점수 상위 5개 해법 가족의 대표 주변 phi ±0.25°/±0.5° × V0 ±0.2 m/s(14개). 더 좋은 이웃이 대표가 되고, 이웃 성공률이 `robustness`(오차 허용).
- 해법 가족: 당점 같고 |ΔV0| ≤ 0.35, |Δphi| ≤ 1.5° 면 같은 샷 → 후보는 가족 대표만(서로 다른 샷).
- 점수 = 1.0×쿠션 여유(3쿠션: 4개 0.5, 5개 1 / 4구: 2배 규칙일 때만) + 1.0×안전(큐볼 최종 위치–가장 가까운 적구 0.3–1.2 m 면 1) + 1.0×쉬움(1.6 m/s → 1, 4.5 → 0)
  + 0.5×당점 쉬움(중앙 1) − 0.5×min(키스, 2) + 2.0×오차 허용(정제한 상위 5개만). `candidate.terms` 에 분해가 들어 있다.
- 예산: `budgetMs`(seed+sweep 90 %, refine 10 %) · `maxSimulations`(refine 몫 ≤ 70 남김) · `maxCandidates`(기본 5). 시각은 `opts.now` 주입(테스트는 `() => 0`).
- 결정론: 같은 `seed` → 같은 순서 → 같은 후보. 후보 `input` 은 반올림 없이 그대로 쓰므로 `simulateShot(balls, input, params).hash === candidate.result.hash`(테스트).

## 페이지 통합(SimulatorPage — 다른 에이전트가 잇는다)

### 1. 버튼 위치·노출 조건
`Controls` 2행(좌/우 · ±0.1° · 되돌리기 · **이닝 시트** · 나가기)에서 이닝 시트 아이콘 **바로 옆**에 같은 `IconButton`(h-11 w-11)으로 "해법" 을 둔다.
라벨 `t("sim.solver.button")`, 아이콘은 `@/lib/icons` 의 `LucideSparkles`(또는 `Search`). `Controls` 에 `onSolve?: () => void` prop 을 더하고 있을 때만 그린다.
- 노출: **연습·드릴만** — `sim.mode === "solo" && !sim.record`(연습 세션·드릴·리플레이 세션은 모두 record=false) 이고 `phase === "aim"`.
- 금지: 기록 세션(`sim.record === true`)·네트워크 대전(`sim.mode === "match"`)에는 prop 자체를 넘기지 않는다. 드릴의 채점 샷 대기 중(`drillLocked`)에도 넘기지 않는다(채점은 첫 샷 한 번).

### 2. 페이지 상태
```tsx
import { useSolver } from "./solver/useSolver";
import { SolverSheet } from "./solver/SolverSheet";
import type { SolveCandidate } from "./solver/search";
import { buildPreviewPaths, type PreviewPaths } from "./overlay/paths";

const solver = useSolver();                                   // 워커는 첫 solve 때 생성
const [solverOpen, setSolverOpen] = useState(false);
const [solverPreview, setSolverPreview] = useState<{ candidate: SolveCandidate; paths: PreviewPaths } | null>(null);
const solverSeedRef = useRef(1);

const openSolver = useCallback(() => {
    if (!sim.config || !sim.params || sim.phase !== "aim") return;
    setSolverOpen(true);
    void solver.solve({
        balls: sim.balls, cueBallId: sim.cueBallId, gameType: sim.config.gameType, rules: sim.config.rules,
        params: sim.params, seed: solverSeedRef.current,       // budgetMs 기본 1500(훅 옵션으로 조정)
    });
}, [sim.config, sim.params, sim.phase, sim.balls, sim.cueBallId, solver]);

const retrySolver = useCallback(() => { solverSeedRef.current += 1; openSolver(); }, [openSolver]);   // 다른 시드 → 다른 순서·후보

const onSolverPreview = useCallback((c: SolveCandidate | null) => {
    if (!c || !sim.config) { setSolverPreview(null); return; }
    setSolverPreview({ candidate: c, paths: buildPreviewPaths(c.result, { cueBallId: sim.cueBallId, gameType: sim.config.gameType }) });
}, [sim.config, sim.cueBallId]);

const onSolverApply = useCallback((c: SolveCandidate) => {
    actions.setInput({ phi: c.input.phi, V0: c.input.V0, a: c.input.a, b: c.input.b, theta: 0 });   // 반올림 없이 그대로 → 샷 해시가 후보와 같다
    setSolverPreview(null);
    setSolverOpen(false);
    toast({ title: t("sim.solver.applied") });
}, [actions, toast, t]);

// 배치가 바뀌면(샷·되돌리기·공 옮기기) 후보는 낡은 것 — 경로를 끄고 시트를 닫는다
useEffect(() => { setSolverPreview(null); setSolverOpen(false); }, [sim.balls]);

<SolverSheet
    open={solverOpen}
    onOpenChange={(o) => { if (!o) solver.cancel(); setSolverOpen(o); }}
    status={solver.status} progress={solver.progress}
    candidates={solver.result?.candidates ?? []}
    onApply={onSolverApply} onPreview={onSolverPreview}
    onCancel={solver.cancel} onRetry={retrySolver}
/>
```
`SolverSheet` props: `{ open, onOpenChange, status: "idle"|"running"|"done"|"error", progress: SolveProgress|null, candidates: readonly SolveCandidate[], onApply(candidate), onPreview(candidate|null), onCancel?, onRetry? }`.
시트는 "경로 보기" 를 한 줄만 켜고, 다른 줄을 켜면 그 후보로 바꿔 부르며, 시트를 닫거나 `candidates` 가 바뀌면 `onPreview(null)` 을 부른다.
`useSolver` 는 `{ solve(req): Promise<SolveResult>, cancel(), status, progress, result, error, usedWorker }` — 프로미스는 취소돼도 부분 결과(`aborted: true`)로 resolve 되고, 탐색 오류만 reject(status "error").

### 3. 경로 그리기(기존 오버레이 그대로)
rAF 루프가 읽는 `View` 에 `solverPreview` 를 더하고(`viewRef.current = { ..., solverPreview }`, dirty deps 에도 추가), aim 단계 `overlay.draw` 에서
```ts
const sp = v.solverPreview;
overlay.draw({
    balls: v.balls,
    phi: sp ? sp.candidate.input.phi : v.input.phi,          // 조준선을 후보 방향으로 — 고스트볼·두께 라벨이 후보를 가리킨다
    cueBallId: v.cueBallId, table: v.table,
    guide: sp || (!v.dragging && v.preview) ? "preview" : "straight",
    preview: sp ? sp.paths : (v.preview?.paths ?? null),     // PreviewPaths 는 OverlayPreview 와 같은 모양
    diamond: ..., project: projectRef.current,
});
```
`buildPreviewPaths(candidate.result, { cueBallId, gameType })` 의 기본 컷오프는 두 번째 적구 접촉(득점 순간)까지 — 큐볼 경로 + 쿠션 번호 + 적구 첫 구간이 그려진다.
끝까지 보이려면 `cutoff: { kind: "end" }`. 시트가 화면 아래 56 dvh 를 덮으므로 테이블 위쪽이 보이는 채로 경로를 고를 수 있다.

### 4. 적용
`actions.setInput({ phi, V0, a, b, theta: 0 })` — 훅이 phi 정규화·V0 [0.2, 9]·당점 미스큐 클램프를 하지만 후보 값은 모두 범위 안이라 그대로 들어간다.
적용 뒤 30 ms 안에 훅의 미리보기(`sim.preview`)가 같은 경로를 그리고, 샷을 치면 `simulateShot` 결과 해시가 `candidate.result.hash` 와 같다(같은 입력·같은 배치·같은 파라미터).

### 5. i18n(`sim.solver.*`, 5개 로케일 동일 키)
button · title · desc · idle · searching `{n}` · done `{n}`,`{m}` · none · noneHint · error · start · retry · cancel · apply · preview · previewOn ·
cushions `{n}` · margin `{n}` · bankFirst · aimNone · spinCenter · spinLeft/Right/Top/Bottom `{n}` · ball.white/yellow/red/red1/red2 · cushion.left/right/bottom/top ·
applied(적용 토스트) · practiceOnly(기록·대전에서 버튼 대신 안내가 필요할 때).

## 검증
```
npx vitest run client/src/sim/solver     # 4 파일 35 테스트
npx tsc --noEmit -p tsconfig.json         # solver/·i18n/ 오류 없음
npx vite build                            # 페이지가 useSolver 를 import 하면 assets/solver.worker-*.js 가 별도 청크로 나온다
```
