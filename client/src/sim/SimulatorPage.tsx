/**
 * 시뮬레이터 화면(DOM 셸). 물리·판정·재생·서버 동기화는 useSimulator 가 전부 맡고, 여기서는
 *  - 렌더러·오버레이(Overlay)를 테이블 래퍼에 얹고 rAF 루프에서 frameAt() 으로 그리며(React 상태 없음),
 *    렌더러는 기기 저장값(rendererChoice: "rankue.sim.renderer")과 WebGL2 탐색으로 ThreeRenderer 를 고르고, 생성 실패나
 *    컨텍스트 손실 2회면 Canvas2DRenderer 로 내려간다(같은 Renderer 계약이라 루프·오버레이·제스처는 모른다),
 *  - 테이블 포인터 제스처(조준 드래그 · 연습 모드 공 배치 · 재생 중 길게 눌러 4×)를 tableGestures 로 해석하고,
 *  - 레이아웃 B("오른쪽 툴바형", 2026-09-07 오너 선택): 상단 띠(TopBar 44 px) 아래가 전부 테이블 영역이고, 조작은 그 위에 얹힌다 —
 *    오른쪽 열(툴바 ToolRail → 세로 큐 슬라이더 PowerRail(흰 알약) → ± → 샷 ShotButton), 왼쪽 아래 두께 독(ThicknessDock, 둘째 줄에
 *    되돌리기), 당점·큐 각은 시트(SpinSheet), 공유는 왼쪽 위 칩 열의 알약 버튼(샷 뒤). 렌더러는 TABLE_INSETS 만큼 비워 탑다운 테이블을
 *    조작 층 밖에 letterbox 하고(player 뷰는 그 사각형을 원근 뷰로 삼는다), 큐대도 그 사각형 안에서만 그린다. 재생·상대 차례엔 조작 층이
 *    150 ms 로 흐려지고(opacity 0 + pointer-events none) 조준으로 돌아오면 되살아난다. 결과 배너 · 이닝 시트 · 종료/나가기 다이얼로그.
 *    조작 층은 테이블 마운트의 형제(자식이 아님) — 자식이면 슬라이더·버튼의 pointerdown 이 테이블 제스처로 번진다.
 *    툴바 버튼 수는 모드에 따라 6~9개 — railLayout.railFitsMd 로 md(44 px) 가 열에 들어가는지 세어 안 들어가면 compact(40 px) 로 내린다
 *    (스크롤은 마지막 수단: 잘린 버튼은 있는 줄 모른다).
 *  - 다이아몬드 시스템 훈련(3쿠션만): 툴바 토글(localStorage "rankue.sim.diamond", 기본 꺼짐)이 켜지면 rAF 경로에서
 *    overlay/diamondSystem.overlayDiamond 로 레일 숫자·조준 분석을 오버레이에 넘기고, 샷이 끝나면 sim.lastResult 로
 *    "시스템 {예측} · 실제 {3쿠션수}" 를 결과 배너 아래 한 줄로 보인다.
 *  - 선수 시점("3D 보기", localStorage "rankue.sim.view", 기본 top): ThreeRenderer 가 올라오면 툴바 토글이 생기고, rAF 가 매 프레임
 *    큐볼·phi 를 draw 의 view 로 넘겨 카메라가 조준을 따라간다(재생·공 옮기기 중엔 빼서 카메라가 멈춘다). 오버레이는 renderer.project
 *    만 쓰므로 두 뷰에서 그대로 공 위에 얹히고, 다이아몬드 시스템 숫자는 원근에서 겹쳐 player 뷰에선 그리지 않는다.
 *    조준 드래그는 직전 포인터를 현재 카메라로 다시 unproject 해 각을 재므로 카메라가 따라 도는 만큼이 되먹임되지 않는다.
 *  - 공유·리플레이(share/): 솔로·연습·드릴에서 샷이 끝나면 툴바 아래쪽 "공유" 버튼(종료 다이얼로그에도) → 카드 PNG +
 *    `?replay=` 링크(useShare). `?replay=<payload>` 로 열면 연습 세션을 그 배치로 열어 한 번 자동으로 치고, 결과 해시가
 *    원본과 같은지 칩("리플레이" / "결과가 달라요")으로 보인다 — 그 뒤엔 보통 연습처럼 이어서 칠 수 있다.
 * 설정은 `?cfg=<base64url JSON>`(pageConfig) 으로 받고, 없거나 깨졌으면 SimSetupDialog 를 위에 연다.
 * 세로 고정 레이아웃, env(safe-area-inset-*) 패딩, 태블릿에서는 렌더러가 letterbox 해서 테이블이 잘리지 않는다.
 * 레거시 Expo ReactNativeWebView 방향 브리지는 옮기지 않는다 — 이 화면은 세로 레이아웃 그 자체다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { TABLES, type TableSpec } from "@shared/sim/params";
import { isOpeningShot, type ShotOutcome } from "@shared/sim/rules";
import type { GameType } from "@shared/sim/rules/types";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useGameAudio } from "@/hooks/useGameAudio";
import { useAuth } from "@/hooks/useAuth";
import { useSimulator, type OfflineReason } from "./useSimulator";
import type { Renderer, RendererView, SafeInsets } from "./render/Renderer";
import { Canvas2DRenderer } from "./render/Canvas2DRenderer";
import {
    CONTEXT_LOSS_LIMIT, readViewPref, safeLocalStorage, selectRendererKind, writeRendererPref, writeViewPref, type RendererKind,
} from "./render/rendererChoice";
import { Overlay, type Project } from "./overlay/Overlay";
import { createNumbersCache, overlayDiamond, readDiamondPref, shotReadout, writeDiamondPref } from "./overlay/diamondSystem";
import { SimSetupDialog, type SimSetupConfig } from "./SimSetupDialog";
import { matchApi, type MatchPublic } from "./matchApi";
import { MatchLobby } from "./match/MatchLobby";
import { MatchList, MATCH_LIST_QUERY_KEY } from "./match/MatchList";
import { endReasonText } from "./match/matchView";
import { ResignConfirm } from "./components/ResignConfirm";
import { CoachHint, COACH_PREF_KEY } from "./components/CoachHint";
import { useSolver } from "./solver/useSolver";
import { SolverSheet } from "./solver/SolverSheet";
import type { SolveCandidate } from "./solver/search";
import { buildPreviewPaths, type PreviewPaths } from "./overlay/paths";
import { DrillPanel, DRILL_WEEK_QUERY_KEY, DRILL_LADDER_QUERY_KEY } from "./drill/DrillPanel";
import { drillApi, type DrillWeek, type WeekDrill } from "./drill/drillApi";
import { buildConfig } from "./setupPresets";
import { decodePageConfig, readCfgParam } from "./pageConfig";
import { decodeReplay, encodeReplay, forSoloSession, replaySource, replayUrl, REPLAY_PARAM, toReplayConfig, type ReplayPayload } from "./share/replayLink";
import { fileNameFor, gameBadge, replayShortText, sessionStatsLine, shotSubtitle, shotTitle } from "./share/shareCard";
import { useShare } from "./share/useShare";
import { activeThickness, elevationDeg, FINE_STEP_RAD, pullbackFor, stepPower, type ThicknessStep } from "./controlsMath";
import { appendShot, EMPTY_LOG, popShot, type InningLog } from "./inningLog";
import { beginGesture, moveGesture, type Gesture } from "./tableGestures";
import { playerLabel, tableLabel } from "./hudMath";
import type { CueInput, Phase } from "./simReducer";
import type { SimPreview } from "./simController";
import { TopBar } from "./components/TopBar";
import { ToolRail, type RailItem } from "./components/ToolRail";
import {
    CloseIcon, CubeIcon, DiamondIcon, ElevationIcon, FlagIcon, ListIcon, MinusIcon, PlusIcon, ResetIcon, ShareIcon, SolverIcon, SoundIcon,
    SpinIcon,
} from "./components/railIcons";
import { POWER_RAIL_MIN_MD, PowerRail } from "./components/PowerRail";
import { DOCK_HEIGHT, ThicknessDock } from "./components/ThicknessDock";
import { railFitsMd } from "./railLayout";
import { ShotButton } from "./components/ShotButton";
import { SpinSheet, type SpinSheetTab } from "./components/SpinSheet";
import { HoldButton } from "./components/HoldButton";
import { OutcomeBanner } from "./components/OutcomeBanner";
import { InningSheet } from "./components/InningSheet";
import { EndDialog } from "./components/EndDialog";
import { ExitConfirm } from "./components/ExitConfirm";

const OFFLINE_KEYS: Record<OfflineReason, string> = {
    "session-create": "sim.sync.offlineCreate",
    "shot-retries": "sim.sync.offlineShots",
    "shot-rejected": "sim.sync.rejected",
};

/** 재생 중 테이블을 이만큼 누르고 있으면 4× */
const HOLD_FF_MS = 200;
/** 결과 배너 표시 시간 */
const BANNER_MS = 2400;
const EXIT_PATH = "/dashboard";
/**
 * 테이블이 조작 층을 피해 letterbox 되는 인셋(CSS px). 오른쪽 68 = 툴바 44 + 여백, 아래 = 두께 독(두 줄 106) + 여백 8.
 * 세로가 남는 폰(375×812)에선 폭이 배율을 정하므로 인셋이 테이블 크기를 줄이지 않는다.
 * player 뷰(3D)도 이 사각형을 원근 뷰(카메라 화면)로 삼는다 — 캔버스 전체를 뷰로 쓰면 큐볼이 슬라이더·± 아래에 투영됐다(2026-09-07 리뷰).
 * 큐대(1.45 m)도 두 렌더러 모두 이 사각형 안에서만 그려 오른쪽 열 틈으로 비치지 않는다.
 */
const TABLE_INSETS: SafeInsets = { top: 8, right: 68, bottom: DOCK_HEIGHT + 8, left: 8 };
/**
 * 테이블 영역이 이보다 낮으면(iPhone SE 375×667 → 623, 세이프 에어리어 있는 6.1" 폰 ≈ 715) compact: 툴바 40 px·간격 6, 큐대 80 px, 샷 56 px.
 * 그 밖에도 툴바 버튼 수(모드·렌더러·드릴에 따라 6~9)가 md 로 열에 안 들어가면(railFitsMd) compact. 그래도 넘치면 툴바가 스크롤된다
 * (큐 슬라이더 최소 높이가 우선). 375×812 는 768 이라 8개까지 기본.
 */
const COMPACT_BELOW_PX = 720;
/** 오른쪽 열에서 툴바를 뺀 고정 높이(md, px): 열 상하 여백(top/bottom-1.5) 12 + 큐 슬라이더 알약 최소 + 간격 8×3 + ± 36 + 샷 64. */
const RIGHT_FIXED_MD = 12 + POWER_RAIL_MIN_MD + 8 * 3 + 36 + 64;

/** rAF 루프가 읽는 화면 상태. React 상태를 ref 로 비춰 두어 프레임마다 재렌더하지 않는다. */
interface View {
    phase: Phase;
    input: CueInput;
    cueBallId: "white" | "yellow";
    balls: ReturnType<typeof useSimulator>["balls"];
    preview: SimPreview | null;
    table: TableSpec;
    canPlace: boolean;
    dragging: boolean;
    placing: string | null;
    /** 다이아몬드 시스템 오버레이(토글 켜짐 + 3쿠션). player 뷰에선 숫자가 원근으로 겹쳐 그리지 않는다. */
    diamond: boolean;
    /** 해법 찾기에서 "경로 보기"를 켠 후보 — 조준선·경로를 그 후보로 그린다 */
    solverPreview: { candidate: SolveCandidate; paths: PreviewPaths } | null;
    /** 카메라 뷰(HUD "3D 보기"). 렌더러가 지원하지 않으면 top 으로 남는다. */
    cameraView: RendererView;
}

export function SimulatorPage() {
    const { t } = useT();
    const { toast } = useToast();
    const { getCtx } = useGameAudio();
    const { member } = useAuth();
    const [, navigate] = useLocation();
    const search = useSearch();

    // ── 설정 (URL → 없으면 설정 창). 대전(?match=)·로비(?lobby=1)는 설정 창을 열지 않는다 ──
    const params = useMemo(() => new URLSearchParams(search.startsWith("?") ? search.slice(1) : search), [search]);
    const matchId = params.get("match");
    const lobby = params.get("lobby") === "1";
    const drillsView = params.get("drills") === "1";
    // 리플레이 링크(?replay=): 대전·로비·드릴이 아닐 때만. cfg 보다 우선하고, 깨진 링크는 cfg 처럼 설정 창으로 떨어진다
    const [replay] = useState<ReplayPayload | null>(() => (matchId || lobby || drillsView ? null : decodeReplay(params.get(REPLAY_PARAM))));
    const [initial] = useState(() => (matchId || lobby || drillsView || replay ? null : decodePageConfig(readCfgParam(search))));
    const [setupOpen, setSetupOpen] = useState(initial === null && replay === null && !matchId && !lobby && !drillsView);
    // 드릴 모드: 고정 배치에서 첫 샷만 서버가 채점(문제당 1회), 그 뒤는 연습. scored 전엔 공 배치를 막는다.
    const [drill, setDrill] = useState<{ drill: WeekDrill; week: DrillWeek; scored: boolean; result: { success: boolean; cushions: number } | null } | null>(null);
    const drillRef = useRef(drill);
    drillRef.current = drill;
    const [matchLoad, setMatchLoad] = useState<"idle" | "loading" | "error" | "notMine">("idle");
    const [resignOpen, setResignOpen] = useState(false);
    // 첫 세션 안내: 기기에 저장된 적 없으면 첫 aim 단계에서 한 번
    const [coachOpen, setCoachOpen] = useState(() => { try { return safeLocalStorage()?.getItem(COACH_PREF_KEY) !== "1"; } catch { return false; } });
    const closeCoach = useCallback(() => { setCoachOpen(false); try { safeLocalStorage()?.setItem(COACH_PREF_KEY, "1"); } catch { /* 저장 불가 */ } }, []);
    const [turnChip, setTurnChip] = useState(false);
    const queryClient = useQueryClient();

    // ── 화면 상태 ─────────────────────────────────────────────────────────
    const [muted, setMuted] = useState(false);
    const [diamond, setDiamond] = useState(() => readDiamondPref(safeLocalStorage()));
    // 카메라 뷰: 저장값으로 시작. ThreeRenderer 가 올라와야(setView 지원) HUD 토글이 보이고 실제로 적용된다.
    const [cameraView, setCameraView] = useState<RendererView>(() => readViewPref(safeLocalStorage()));
    const cameraViewRef = useRef(cameraView);
    const [viewSupported, setViewSupported] = useState(false);
    const [side, setSide] = useState<"left" | "right">("right");
    const [log, setLog] = useState<InningLog>(EMPTY_LOG);
    const [banner, setBanner] = useState<{ outcome: ShotOutcome; id: number } | null>(null);
    const [bannerVisible, setBannerVisible] = useState(false);
    const [sheetOpen, setSheetOpen] = useState(false);
    // 당점·큐 각 시트. 툴바의 두 버튼이 각자 탭으로 연다
    const [spinSheet, setSpinSheet] = useState<{ open: boolean; tab: SpinSheetTab }>({ open: false, tab: "spin" });
    const [exitOpen, setExitOpen] = useState(false);
    const [exiting, setExiting] = useState(false);
    const [endDismissed, setEndDismissed] = useState(false);
    const [dragging, setDragging] = useState(false);
    const [placing, setPlacing] = useState<string | null>(null);
    // 테이블 영역 높이(ResizeObserver). 오른쪽 열의 compact 여부를 여기서(높이 + 툴바 버튼 수) 정한다
    const [tableH, setTableH] = useState(0);

    const sim = useSimulator({
        getAudioContext: getCtx,
        muted,
        onMismatch: () => toast({ title: t("sim.sync.mismatch") }),
        onOffline: (reason) => toast({ title: t(OFFLINE_KEYS[reason]) }),
        onMiscue: () => toast({ title: t("sim.shot.miscue") }),
        onOutcome: (outcome, session) => {
            setLog((l) => appendShot(l, outcome, session));
            setBanner({ outcome, id: session.shotCount });
            void queryClient.invalidateQueries({ queryKey: MATCH_LIST_QUERY_KEY });
        },
        matchApi,
        onMatch: (e) => {
            if (e === "offline") toast({ title: t("sim.match.offline") });
            else if (e === "online") toast({ title: t("sim.match.online") });
            else if (e === "resynced") toast({ title: t("sim.match.resynced") });
            else if (e === "finished") { toast({ title: t("sim.match.finishedByServer") }); void queryClient.invalidateQueries({ queryKey: MATCH_LIST_QUERY_KEY }); }
            else if (e === "claim-too-early") toast({ title: t("sim.match.claimTooEarly") });
        },
    });
    const { actions } = sim;
    const table = sim.params?.table ?? TABLES.DAEDAE;
    // ── 해법 찾기(연습·드릴 전용, 워커) ─────────────────────────────────
    const solver = useSolver();
    const [solverOpen, setSolverOpen] = useState(false);
    const [solverPreview, setSolverPreview] = useState<{ candidate: SolveCandidate; paths: PreviewPaths } | null>(null);
    const solverSeedRef = useRef(1);
    const lastResultRef = useRef(sim.lastResult);
    lastResultRef.current = sim.lastResult;
    const drillLocked = !!drill && !drill.scored;
    // 드릴 채점은 샷 직후 바로 보낸다(재생이 끝나길 기다리지 않는다) — 치자마자 앱을 꺼도 채점이 남고,
    // 서버가 고정 배치에서 다시 시뮬하므로 클라이언트 재생과 무관하게 정본이 된다. 결과 표시는 재생이 끝난 뒤.
    const [drillPending, setDrillPending] = useState<{ success: boolean; cushions: number } | null>(null);
    useEffect(() => {
        const r = sim.lastResult;
        const d = drillRef.current;
        if (!r || !d || d.scored || sim.mode !== "solo") return;
        setDrill((x) => (x ? { ...x, scored: true } : x));
        drillApi.attempt(d.drill.id, r.input, r.hash).then((res) => {
            setDrillPending({ success: res.outcome.scored, cushions: res.outcome.cushionsBeforeSecond });
        }).catch((e: unknown) => {
            const code = (e as { code?: string; data?: { code?: string } })?.code ?? (e as { data?: { code?: string } })?.data?.code;
            if (code !== "ALREADY_ATTEMPTED") toast({ title: t("sim.drill.scoreFailed") });
        });
    }, [sim.lastResult, sim.mode, toast, t]);
    useEffect(() => {
        if (!drillPending || sim.phase === "shooting") return;
        setDrill((x) => (x ? { ...x, result: drillPending } : x));
        toast({ title: t(drillPending.success ? "sim.drill.scoredToastSuccess" : "sim.drill.scoredToastFail").replace("{n}", String(drillPending.cushions)) });
        setDrillPending(null);
        void queryClient.invalidateQueries({ queryKey: DRILL_WEEK_QUERY_KEY });
        void queryClient.invalidateQueries({ queryKey: DRILL_LADDER_QUERY_KEY });
    }, [drillPending, sim.phase, toast, t, queryClient]);
    const gameType: GameType | null = sim.session?.rules.gameType ?? null;
    const is3c = gameType === "3c";
    const diamondOn = diamond && is3c;

    // 처음 한 번: URL 설정이 있으면 바로 시작
    const startedRef = useRef(false);
    useEffect(() => {
        if (startedRef.current || !initial) return;
        startedRef.current = true;
        actions.start(initial.config, { record: initial.record });
    }, [actions, initial]);

    // ?replay=<payload>: 연습 세션을 그 배치로 열고 입력을 넣은 뒤, aim 이 되면 한 번만 자동으로 친다(단계 ref 가드).
    // 재생이 시작되면(lastResult) 해시를 원본과 견줘 "리플레이" / "결과가 달라요"(엔진 버전이 다름) 칩을 정한다.
    const replaySolo = useMemo(() => (replay ? forSoloSession(replay) : null), [replay]);
    const replayStageRef = useRef<"idle" | "started" | "shot" | "done">("idle");
    const [replayChip, setReplayChip] = useState<"ok" | "mismatch" | null>(null);
    useEffect(() => {
        if (!replay || !replaySolo || startedRef.current) return;
        startedRef.current = true;
        actions.start(toReplayConfig(replay), { record: false, balls: replaySolo.balls });
        const i = replaySolo.input;
        actions.setInput({ phi: i.phi, V0: i.V0, a: i.a, b: i.b, theta: i.theta });
        replayStageRef.current = "started";
    }, [replay, replaySolo, actions]);
    useEffect(() => {
        if (replayStageRef.current !== "started" || sim.phase !== "aim") return;
        replayStageRef.current = "shot";
        void actions.shoot();
    }, [sim.phase, actions]);
    useEffect(() => {
        const r = sim.lastResult;
        if (replayStageRef.current !== "shot" || !r || !replay || !replaySolo) return;
        replayStageRef.current = "done";
        setReplayChip(!replaySolo.verifiable || r.hash === replay.hash ? "ok" : "mismatch");
    }, [sim.lastResult, replay, replaySolo]);

    // ?match=<id> (푸시 딥링크·목록에서 열기): 서버에서 받아 대전 모드로 연다
    useEffect(() => {
        if (!matchId || startedRef.current) return;
        startedRef.current = true;
        setMatchLoad("loading");
        matchApi.getMatch(matchId).then((m) => {
            if (m.myIndex < 0) { setMatchLoad("notMine"); return; }
            if (m.status === "waiting") { setMatchLoad("idle"); navigate("/online-game?lobby=1", { replace: true }); return; }
            setMatchLoad(actions.startMatch(m) ? "idle" : "error");
        }, () => setMatchLoad("error"));
    }, [matchId, actions, navigate]);

    // 대전에서 내 차례가 돌아오면 짧게 알린다
    const prevPhaseRef = useRef<Phase>(sim.phase);
    useEffect(() => {
        const prev = prevPhaseRef.current;
        prevPhaseRef.current = sim.phase;
        if (sim.mode === "match" && sim.phase === "aim" && prev === "waiting") {
            setTurnChip(true);
            const h = setTimeout(() => setTurnChip(false), BANNER_MS);
            return () => clearTimeout(h);
        }
    }, [sim.phase, sim.mode]);

    // ── 렌더러·오버레이 ───────────────────────────────────────────────────
    const tableRef = useRef<HTMLDivElement>(null);
    const rendererRef = useRef<Renderer | null>(null);
    const overlayRef = useRef<Overlay | null>(null);
    const dirtyRef = useRef(true);
    const tableSpecRef = useRef(table);
    tableSpecRef.current = table;
    const fullLabel = t("sim.aim.fullBall");
    const projectRef = useRef<Project>((x, y) => rendererRef.current?.project(x, y) ?? [0, 0]);
    // 렌더러 종류는 화면 인스턴스마다 한 번 고른다(저장값 → WebGL2 탐색). 컨텍스트 손실이 쌓이면 세션 동안 canvas 로 고정.
    const rendererKindRef = useRef<RendererKind | null>(null);
    if (rendererKindRef.current === null) rendererKindRef.current = selectRendererKind();
    const contextLossesRef = useRef(0);
    // 다이아몬드 시스템 라벨 캐시(테이블·방향이 같으면 같은 배열) — rAF 경로에서만 쓴다
    const numbersCacheRef = useRef(createNumbersCache());

    useEffect(() => {
        const el = tableRef.current;
        if (!el) return;
        let alive = true;
        let swapTimer: ReturnType<typeof setTimeout> | null = null;

        const mountCanvas2d = (): Renderer => {
            const r = new Canvas2DRenderer({ insets: TABLE_INSETS });
            r.mount(el, tableSpecRef.current);
            return r;
        };
        // WebGL 컨텍스트를 CONTEXT_LOSS_LIMIT 회 잃으면 기기 설정을 canvas 로 저장하고, 이벤트 핸들러 밖에서 렌더러를 교체한다.
        // rAF 루프·오버레이·제스처는 rendererRef 만 보므로 교체를 모른다(오버레이 캔버스는 z-index 로 위에 남는다).
        const onContextLost = () => {
            contextLossesRef.current += 1;
            if (contextLossesRef.current < CONTEXT_LOSS_LIMIT || rendererKindRef.current === "canvas") return;
            rendererKindRef.current = "canvas";
            writeRendererPref(safeLocalStorage(), "canvas");
            swapTimer = setTimeout(() => {
                swapTimer = null;
                if (!alive) return;
                rendererRef.current?.dispose();
                rendererRef.current = mountCanvas2d();
                setViewSupported(false); // Canvas2D 는 항상 top — 토글을 숨긴다(저장값은 남겨 다음에 three 가 되면 다시 쓴다)
                dirtyRef.current = true;
            }, 0);
        };

        // 먼저 Canvas2D 를 올려 테이블이 즉시 보이게 하고, three.js 는 필요한 기기에서만 동적으로 내려받아
        // 준비되면 바꿔 끼운다(three 청크 ~540 kB 를 canvas 사용자는 받지 않는다).
        let renderer: Renderer = mountCanvas2d();
        if (rendererKindRef.current === "three") {
            import("./render/ThreeRenderer").then(({ ThreeRenderer }) => {
                if (!alive || rendererKindRef.current !== "three") return;
                let three: InstanceType<typeof ThreeRenderer> | null = null;
                try {
                    three = new ThreeRenderer({ onContextLost, insets: TABLE_INSETS });
                    three.mount(el, tableSpecRef.current);
                } catch {
                    // WebGL2 를 못 열었다(드라이버 차단·컨텍스트 상한) — 이 화면에선 canvas 유지
                    try { three?.dispose(); } catch { /* 이미 망가진 상태 */ }
                    rendererKindRef.current = "canvas";
                    return;
                }
                rendererRef.current?.dispose();
                rendererRef.current = three;
                // 저장된 카메라 뷰를 적용하고 툴바에 "3D 보기" 토글을 연다
                three.setView(cameraViewRef.current);
                setViewSupported(true);
                dirtyRef.current = true;
            }).catch(() => {
                // 청크 로드 실패(오프라인 등) — canvas 유지
                rendererKindRef.current = "canvas";
            });
        }

        let overlay: Overlay | null = null;
        try {
            overlay = new Overlay(el, { labels: { fullBall: fullLabel } });
        } catch {
            overlay = null; // 2D 컨텍스트가 없는 환경 — 조준선 없이 진행
        }
        rendererRef.current = renderer;
        overlayRef.current = overlay;
        dirtyRef.current = true;
        return () => {
            alive = false;
            if (swapTimer) clearTimeout(swapTimer);
            overlay?.dispose();
            rendererRef.current?.dispose();
            rendererRef.current = null;
            overlayRef.current = null;
        };
    }, [fullLabel]);

    useEffect(() => {
        rendererRef.current?.setTable(table);
        dirtyRef.current = true;
    }, [table]);

    // 테이블 영역 크기가 바뀌면(두 선수 HUD 로 커짐·회전·키보드) 다음 프레임에 오버레이를 새 투영으로 다시 그린다.
    // 렌더러·오버레이의 ResizeObserver 순서는 보장되지 않아, 오버레이가 옛 레이아웃으로 먼저 그려질 수 있었다(실측 2026-09-07).
    useEffect(() => {
        const el = tableRef.current;
        if (!el || typeof ResizeObserver === "undefined") return;
        const measure = () => {
            dirtyRef.current = true;
            setTableH(el.clientHeight);
        };
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        measure();
        return () => ro.disconnect();
    }, []);

    // rAF 루프가 읽는 뷰 — 렌더마다 갱신(할당만, 재렌더 없음)
    const viewRef = useRef<View>({
        phase: sim.phase, input: sim.input, cueBallId: sim.cueBallId, balls: sim.balls, preview: sim.preview,
        table, canPlace: sim.canPlace && !drillLocked, dragging, placing, diamond: diamondOn, solverPreview, cameraView,
    });
    viewRef.current = {
        phase: sim.phase, input: sim.input, cueBallId: sim.cueBallId, balls: sim.balls, preview: sim.preview,
        table, canPlace: sim.canPlace && !drillLocked, dragging, placing, diamond: diamondOn, solverPreview, cameraView,
    };
    useEffect(() => {
        dirtyRef.current = true;
    }, [sim.phase, sim.input, sim.cueBallId, sim.balls, sim.preview, table, dragging, placing, diamondOn, solverPreview, cameraView]);

    const { frameAt } = sim;
    useEffect(() => {
        let handle = 0;
        let overlayCleared = false;
        const loop = () => {
            handle = requestAnimationFrame(loop);
            const renderer = rendererRef.current;
            if (!renderer) return;
            const frame = frameAt(performance.now());
            // 선수 시점 카메라가 아직 움직이는 중이면(needsFrame) dirty 가 아니어도 그린다 — 오버레이도 같은 자세로 다시 얹힌다
            if (!frame.playing && !dirtyRef.current && !renderer.needsFrame?.()) return;
            dirtyRef.current = false;
            const v = viewRef.current;
            renderer.draw({
                balls: frame.balls,
                cue: { phi: v.input.phi, pullback: pullbackFor(v.input.V0), visible: v.phase === "aim", ballId: v.cueBallId },
                // 큐볼은 큐 스틱이 가리키므로 링을 두르지 않는다 — 8px 남짓한 공에 링이 겹치면 속이 빈 공처럼 보였다(실측).
                highlightBallId: v.placing ?? undefined,
                // 선수 시점 카메라 대상: 조준 중에만. 재생 중(움직이는 공을 쫓지 않는다)·공 옮기기 중(끌리는 공을 카메라가 따라가면
                // 손가락 아래 테이블 점이 같이 밀려 되먹임된다)엔 빼서 카메라가 그 자리에 머문다. 놓으면 새 자리 뒤로 옮겨 간다.
                view: v.phase === "aim" && !v.placing ? { cueBallId: v.cueBallId, phi: v.input.phi } : undefined,
            });
            const overlay = overlayRef.current;
            if (!overlay) return;
            if (v.phase === "aim") {
                // 드래그 중엔 직선 안내(미리보기는 30 ms 뒤에 오므로), 손을 떼면 예측 경로
                const sp = v.solverPreview;
                overlay.draw({
                    balls: v.balls, phi: sp ? sp.candidate.input.phi : v.input.phi, cueBallId: v.cueBallId, table: v.table,
                    guide: sp || (!v.dragging && v.preview) ? "preview" : "straight",
                    preview: sp ? sp.paths : (v.preview?.paths ?? null),
                    // 다이아몬드 시스템: 조준 분석은 싸다(광선 하나·산술 몇 줄) — dirty 프레임에만 다시 계산된다.
                    // player 뷰에선 그리지 않는다: 먼 레일의 숫자 알약(레일당 7개 + 바깥 행)이 원근으로 몇 px 간격에 몰려 겹친다.
                    diamond: v.diamond && v.cameraView === "top" ? overlayDiamond(v.balls, v.cueBallId, v.input.phi, v.table, numbersCacheRef.current) : null,
                    project: projectRef.current,
                });
                overlayCleared = false;
            } else if (!overlayCleared) {
                overlay.clear();
                overlayCleared = true;
            }
        };
        handle = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(handle);
    }, [frameAt]);

    // ── 테이블 포인터 제스처 ──────────────────────────────────────────────
    const gestureRef = useRef<Gesture | null>(null);
    const pointerIdRef = useRef<number | null>(null);
    const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    /** 직전 포인터의 화면 px(마운트 기준). 조준 드래그의 각 변화를 현재 카메라로 다시 재기 위해 둔다. */
    const lastScreenRef = useRef<[number, number] | null>(null);

    const screenPoint = (e: React.PointerEvent<HTMLDivElement>): [number, number] => {
        const r = e.currentTarget.getBoundingClientRect();
        return [e.clientX - r.left, e.clientY - r.top];
    };

    const unprojectEvent = (e: React.PointerEvent<HTMLDivElement>): [number, number] | null => {
        const renderer = rendererRef.current;
        if (!renderer) return null;
        const s = screenPoint(e);
        lastScreenRef.current = s;
        return renderer.unproject(s[0], s[1]);
    };

    const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        if (pointerIdRef.current !== null) return; // 두 번째 손가락은 무시
        if (e.pointerType === "mouse" && e.button !== 0) return;
        const p = unprojectEvent(e);
        if (!p) return;
        const v = viewRef.current;
        const g = beginGesture({ phase: v.phase, canPlace: v.canPlace, balls: v.balls, cueBallId: v.cueBallId, R: v.table.ball.R }, p);
        if (!g) return;
        gestureRef.current = g;
        pointerIdRef.current = e.pointerId;
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* noop */ }
        if (g.kind === "hold") {
            holdTimerRef.current = setTimeout(() => { holdTimerRef.current = null; actions.setSpeed(4); }, HOLD_FF_MS);
        } else if (g.kind === "aim") {
            setDragging(true);
        } else {
            setPlacing(g.id);
        }
    };

    const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        if (e.pointerId !== pointerIdRef.current) return;
        let g = gestureRef.current;
        if (!g || g.kind === "hold") return;
        const renderer = rendererRef.current;
        // 조준 드래그: 직전 포인터도 "현재" 카메라로 다시 unproject 해 둘의 각 차이만 쓴다. 선수 시점에선 카메라가 phi 를 따라
        // 돌기 때문에 지난 이벤트 때의 테이블 점을 그대로 쓰면 카메라가 돈 만큼이 매번 더해져 회전이 폭주한다(top 뷰에선 같은 값).
        const prevScreen = lastScreenRef.current;
        if (g.kind === "aim" && renderer && prevScreen) g = { ...g, prev: renderer.unproject(prevScreen[0], prevScreen[1]) };
        const p = unprojectEvent(e);
        if (!p) return;
        const r = moveGesture(g, p, viewRef.current.input.phi);
        gestureRef.current = r.gesture;
        if (r.phi !== undefined) actions.setPhi(r.phi);
        if (r.place) actions.placeBall(r.place.id, r.place.x, r.place.y);
    };

    const onPointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
        if (e.pointerId !== pointerIdRef.current) return;
        const g = gestureRef.current;
        gestureRef.current = null;
        pointerIdRef.current = null;
        lastScreenRef.current = null;
        try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* noop */ }
        if (g?.kind === "hold") {
            if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null; }
            actions.setSpeed(1);
        }
        setDragging(false);
        setPlacing(null);
    };

    useEffect(() => () => { if (holdTimerRef.current) clearTimeout(holdTimerRef.current); }, []);

    // ── 결과 배너 ─────────────────────────────────────────────────────────
    useEffect(() => {
        if (!banner) return;
        setBannerVisible(true);
        const h = setTimeout(() => setBannerVisible(false), BANNER_MS);
        return () => clearTimeout(h);
    }, [banner]);

    // 종료 다이얼로그: finished 로 들어갈 때마다 다시 연다
    useEffect(() => {
        if (sim.phase !== "finished") setEndDismissed(false);
    }, [sim.phase]);

    // ── 파생값 ───────────────────────────────────────────────────────────
    const matchNames = sim.match?.names;
    const names = useMemo(() => {
        if (matchNames) return matchNames;
        const n = sim.session?.players.length ?? 0;
        return Array.from({ length: n }, (_, i) => playerLabel(i, n, member?.nickname, t));
    }, [matchNames, sim.session?.players.length, member?.nickname, t]);
    const isMatch = sim.mode === "match";

    const active = useMemo(() => {
        if (!sim.session || !sim.params) return null;
        return activeThickness(sim.balls, sim.cueBallId, sim.session.rules.gameType, sim.input.phi, sim.params.table.ball.R);
    }, [sim.balls, sim.cueBallId, sim.session, sim.params, sim.input.phi]);

    // 다이아몬드 시스템 읽기: 결과 배너와 같은 타이밍에 "시스템 {예측} · 실제 {3쿠션수}" 한 줄.
    // banner 는 onOutcome(재생 끝) 에, lastResult 는 재생 시작에 갱신되므로 둘은 같은 샷을 가리킨다.
    const lastResult = sim.lastResult;
    const readoutText = useMemo(() => {
        if (!diamondOn || !banner || !lastResult) return null;
        const r = shotReadout(lastResult, table);
        if (!r) return null;
        if (r.actual === null) return t("sim.diamond.readoutMissed").replace("{system}", String(r.system));
        return t("sim.diamond.readout").replace("{system}", String(r.system)).replace("{actual}", String(r.actual));
    }, [diamondOn, banner, lastResult, table, t]);

    // ── 조작 콜백(참조 안정 — Controls 는 memo) ──────────────────────────
    const onThickness = useCallback((step: ThicknessStep) => actions.setThickness(step, side), [actions, side]);
    const onSide = useCallback((s: "left" | "right") => {
        setSide(s);
        const step = active?.step;
        if (step && step !== 1) actions.setThickness(step, s);
    }, [actions, active?.step]);
    const onNudge = useCallback((dir: -1 | 1) => actions.nudgePhi(dir * FINE_STEP_RAD), [actions]);
    const onSpin = useCallback((a: number, b: number) => actions.setSpin(a, b), [actions]);
    const onElevation = useCallback((theta: number) => actions.setElevation(theta), [actions]);
    const onPower = useCallback((V0: number) => actions.setPower(V0), [actions]);
    const onShoot = useCallback(() => { void actions.shoot(); }, [actions]);
    const onUndo = useCallback(() => { actions.undo(); setLog(popShot); setBanner(null); }, [actions]);
    const onRestart = useCallback(() => {
        actions.restart();
        setLog(EMPTY_LOG);
        setBanner(null);
        setEndDismissed(false);
    }, [actions]);
    const onInnings = useCallback(() => setSheetOpen(true), []);
    const onExitRequest = useCallback(() => setExitOpen(true), []);
    const onToggleMute = useCallback(() => setMuted((m) => !m), []);
    const onToggleDiamond = useCallback(() => {
        setDiamond((d) => {
            const next = !d;
            writeDiamondPref(safeLocalStorage(), next);
            return next;
        });
    }, []);
    // "3D 보기": 렌더러에 바로 적용하고(스냅) 기기에 저장. 다음 프레임에 새 카메라로 다시 그린다.
    const onToggleView = useCallback(() => {
        const next: RendererView = cameraViewRef.current === "player" ? "top" : "player";
        cameraViewRef.current = next;
        rendererRef.current?.setView?.(next);
        writeViewPref(safeLocalStorage(), next);
        dirtyRef.current = true;
        setCameraView(next);
    }, []);
    const openSpinSheet = useCallback((tab: SpinSheetTab) => setSpinSheet({ open: true, tab }), []);
    const onSpinSheetOpen = useCallback((open: boolean) => setSpinSheet((x) => ({ ...x, open })), []);
    const onSpinSheetTab = useCallback((tab: SpinSheetTab) => setSpinSheet((x) => ({ ...x, tab })), []);
    // 길게 누르는 동안 누적되도록 최신 세기를 ref 로 읽는다
    const v0Ref = useRef(sim.input.V0);
    v0Ref.current = sim.input.V0;
    const onPowerDown = useCallback(() => actions.setPower(stepPower(v0Ref.current, -1)), [actions]);
    const onPowerUp = useCallback(() => actions.setPower(stepPower(v0Ref.current, 1)), [actions]);

    // ── 공유(카드 PNG + 리플레이 링크). 솔로·연습·드릴에서 샷이 끝난 뒤(aim/finished)만 ──
    const { share, busy: sharing } = useShare();
    const canShare = sim.mode === "solo" && sim.lastResult !== null && (sim.phase === "aim" || sim.phase === "finished");
    // 드릴 "다시 배치" 는 툴바(토글 묶음 끝)에 놓인다
    const drillReset = drill !== null && !isMatch && sim.phase !== "shooting";
    // 되돌리기는 두께 독 둘째 줄(툴바에 두면 샷 뒤 버튼 수가 늘어 열을 넘쳤다). 독은 재생 중 페이지가 통째로 흐린다
    const undoInDock = sim.canUndo;
    const shareLast = useCallback((withStats: boolean) => {
        const result = lastResultRef.current;
        const config = sim.config;
        const session = sim.session;
        if (!result || !config || !session) return;
        const gt = session.rules.gameType;
        const url = replayUrl(encodeReplay(replaySource(result, config)));
        const outcomeTitle = shotTitle(t, sim.outcomeLast, gt);
        const d = drillRef.current;
        // 통계는 1인 세션의 그 선수(2인이면 승자, 없으면 첫 선수)
        const statsFor = session.players[session.players.length === 1 ? 0 : (session.winnerIndex ?? 0)];
        void share(result, {
            table: TABLES[config.tableId], gameType: gt, cueBallId: result.input.cueBallId,
            badge: gameBadge(t, gt),
            title: d ? t(d.drill.nameKey) : outcomeTitle,
            subtitle: d ? `${outcomeTitle} · ${tableLabel(config, t)}` : shotSubtitle(t, config, result.input),
            stats: withStats && statsFor ? sessionStatsLine(t, statsFor, sim.phase) : null,
            footer: t("sim.share.footer"),
            replayText: replayShortText(url),
            replayUrl: url,
            filename: fileNameFor(result),
        });
    }, [share, sim.config, sim.session, sim.outcomeLast, sim.phase, t]);
    const onShareShot = useCallback(() => shareLast(false), [shareLast]);
    const onShareEnd = useCallback(() => shareLast(true), [shareLast]);

    const exitNow = useCallback(async () => {
        setExiting(true);
        try {
            await actions.exit();
        } finally {
            // 대전은 서버에 남으므로 목록(로비)으로 돌아간다
            navigate(isMatch ? "/online-game?lobby=1" : drillRef.current ? "/online-game?drills=1" : EXIT_PATH);
            setDrill(null);
            setExiting(false);
        }
    }, [actions, navigate, isMatch]);

    const openMatch = useCallback((m: MatchPublic) => {
        if (m.status === "waiting") return;
        if (actions.startMatch(m)) navigate(`/online-game?match=${m.id}`, { replace: true });
    }, [actions, navigate]);

    const onResign = useCallback(async () => {
        setExiting(true);
        try {
            await actions.resign();
        } finally {
            setExiting(false);
            setResignOpen(false);
            void queryClient.invalidateQueries({ queryKey: MATCH_LIST_QUERY_KEY });
        }
    }, [actions, queryClient]);

    const onClaim = useCallback(async () => {
        const ok = await actions.claim();
        if (!ok) toast({ title: t("sim.match.claimTooEarly") });
        else void queryClient.invalidateQueries({ queryKey: MATCH_LIST_QUERY_KEY });
    }, [actions, toast, t, queryClient]);

    const onPlayDrill = useCallback((d: WeekDrill, week: DrillWeek) => {
        setDrill({
            drill: d, week, scored: !!d.attempt,
            result: d.attempt ? { success: d.attempt.success, cushions: d.attempt.cushions } : null,
        });
        setLog(EMPTY_LOG);
        setBanner(null);
        actions.start(buildConfig({ gameType: "3c", tableId: week.tableId, target: 100, rules: { ruleSet: "umb" } }), { record: false, balls: d.balls });
    }, [actions]);

    const openSolver = useCallback(() => {
        if (!sim.config || !sim.params || sim.phase !== "aim") return;
        setSolverOpen(true);
        void solver.solve({
            balls: sim.balls, cueBallId: sim.cueBallId, gameType: sim.config.gameType, rules: sim.config.rules,
            params: sim.params, seed: solverSeedRef.current,
            opening: sim.session ? isOpeningShot(sim.session, sim.balls) : false,
        });
    }, [sim.config, sim.params, sim.phase, sim.balls, sim.cueBallId, sim.session, solver]);
    const retrySolver = useCallback(() => { solverSeedRef.current += 1; openSolver(); }, [openSolver]);
    const onSolverPreview = useCallback((c: SolveCandidate | null) => {
        if (!c || !sim.config) { setSolverPreview(null); return; }
        setSolverPreview({ candidate: c, paths: buildPreviewPaths(c.result, { cueBallId: sim.cueBallId, gameType: sim.config.gameType }) });
    }, [sim.config, sim.cueBallId]);
    const onSolverApply = useCallback((c: SolveCandidate) => {
        // 반올림 없이 그대로 → 샷 해시가 후보와 같다
        actions.setInput({ phi: c.input.phi, V0: c.input.V0, a: c.input.a, b: c.input.b, theta: 0 });
        setSolverPreview(null);
        setSolverOpen(false);
        toast({ title: t("sim.solver.applied") });
    }, [actions, toast, t]);
    // 배치가 바뀌면(샷·되돌리기·공 옮기기) 후보는 낡은 것 — 경로를 끄고 시트를 닫는다
    useEffect(() => { setSolverPreview(null); setSolverOpen(false); }, [sim.balls]);
    // 연습·드릴(채점 뒤)에서만. 기록 세션·대전엔 넘기지 않는다.
    const solverAllowed = sim.mode === "solo" && !sim.record && !drillLocked;

    const onSetupStart = useCallback((config: SimSetupConfig, opts: { record: boolean }) => {
        setDrill(null);
        setSetupOpen(false);
        setLog(EMPTY_LOG);
        setBanner(null);
        actions.start(config, { record: opts.record });
    }, [actions]);

    const onSetupOpenChange = useCallback((open: boolean) => {
        setSetupOpen(open);
        // 세션 없이 설정을 닫으면 돌아간다
        if (!open && sim.phase === "setup") navigate(EXIT_PATH);
    }, [navigate, sim.phase]);

    const finished = sim.session?.status === "finished";
    const endOpen = sim.phase === "finished" && !endDismissed && !exitOpen;
    const showLobby = lobby && sim.phase === "setup";
    const showDrills = drillsView && sim.phase === "setup";
    const endSubtitle = sim.match
        ? endReasonText({ status: sim.match.status, endReason: sim.match.endReason, winnerIndex: sim.match.winnerIndex, hostName: sim.match.names[0], guestName: sim.match.names[1] }, t)
        : null;
    const aiming = sim.phase === "aim";
    // 재생(내 샷·상대 샷 따라잡기)·상대 차례·시작 전엔 조작 층을 통째로 흐린다. 상단 띠·칩·결과 배너는 남는다.
    const controlsHidden = sim.phase === "shooting" || sim.phase === "waiting" || sim.phase === "setup";
    const thetaDeg = elevationDeg(sim.input.theta);
    const canResign = isMatch && !!sim.match?.canResign && sim.phase !== "finished";

    // ── 툴바 묶음: 조준 도구 / 토글·동작 / 나가기(대전은 기권). 되돌리기는 독, 공유는 왼쪽 위 알약 — 툴바는 최대 9개 ──
    const railAim: RailItem[] = [
        { id: "spin", label: t("sim.controls.spin"), icon: <SpinIcon a={sim.input.a} b={sim.input.b} />, onPress: () => openSpinSheet("spin"), disabled: !aiming },
        {
            id: "elevation", label: t("sim.rail.elevation"), icon: <ElevationIcon />, onPress: () => openSpinSheet("elevation"),
            active: thetaDeg > 0, caption: thetaDeg > 0 ? `${thetaDeg}°` : null, disabled: !aiming,
        },
    ];
    if (solverAllowed) railAim.push({ id: "solver", label: t("sim.solver.button"), icon: <SolverIcon />, onPress: openSolver, disabled: !aiming });
    const railToggles: RailItem[] = [];
    if (is3c) railToggles.push({ id: "diamond", label: t("sim.diamond.toggleLabel"), hint: t("sim.diamond.toggle"), icon: <DiamondIcon />, toggle: true, active: diamond, onPress: onToggleDiamond });
    if (viewSupported) railToggles.push({ id: "view", label: t("sim.hud.view3d"), icon: <CubeIcon />, toggle: true, active: cameraView === "player", onPress: onToggleView });
    railToggles.push({ id: "sound", label: muted ? t("sim.hud.unmute") : t("sim.hud.mute"), icon: <SoundIcon muted={muted} />, toggle: true, active: false, dim: muted, onPress: onToggleMute });
    railToggles.push({ id: "innings", label: t("sim.controls.innings"), icon: <ListIcon />, onPress: onInnings });
    if (drillReset) railToggles.push({ id: "reset", label: t("sim.drill.reset"), icon: <ResetIcon />, onPress: onRestart });
    const railBottom: RailItem[] = [];
    railBottom.push(canResign
        ? { id: "resign", label: t("sim.match.resign"), icon: <FlagIcon />, onPress: () => setResignOpen(true) }
        : { id: "exit", label: t("sim.controls.exit"), icon: <CloseIcon />, onPress: onExitRequest });
    const railGroups = [railAim, railToggles, railBottom];
    // compact: 짧은 화면이거나 md 툴바가 열에 안 들어갈 때(측정 전엔 기본)
    const compact = tableH > 0 && (tableH < COMPACT_BELOW_PX || !railFitsMd(tableH, [railAim.length, railToggles.length, railBottom.length], RIGHT_FIXED_MD));

    const chipNeutral = "rk-chip bg-surface-1 border border-surface-line text-ink-3 max-w-full truncate";
    const chipBrand = "rk-chip bg-brand text-brand-fg max-w-full truncate";

    return (
        <div
            className="fixed inset-0 flex flex-col bg-surface-1 text-ink-1 select-none overflow-hidden"
            style={{
                paddingTop: "env(safe-area-inset-top)",
                paddingBottom: "env(safe-area-inset-bottom)",
                paddingLeft: "env(safe-area-inset-left)",
                paddingRight: "env(safe-area-inset-right)",
            }}
        >
            <div className="flex-1 min-h-0 w-full max-w-[640px] mx-auto flex flex-col">
                <TopBar
                    session={sim.session} config={sim.config} phase={sim.phase} names={names}
                    record={sim.record} offline={isMatch ? false : sim.offline} syncing={sim.syncing} queued={sim.queued}
                    drillName={drill ? t(drill.drill.nameKey) : null}
                    onSummary={onInnings}
                    onBack={isMatch ? onExitRequest : undefined}
                />

                {/* 테이블 영역: 남은 높이 전부. 렌더러·오버레이는 absolute 마운트(tableRef)에, 조작·칩은 그 형제로 얹힌다. */}
                <div className="relative flex-1 min-h-0 overflow-hidden bg-surface-3">
                    <div
                        ref={tableRef}
                        className="absolute inset-0 touch-none bg-surface-3"
                        onPointerDown={onPointerDown}
                        onPointerMove={onPointerMove}
                        onPointerUp={onPointerEnd}
                        onPointerCancel={onPointerEnd}
                        onContextMenu={(e) => e.preventDefault()}
                    />

                    {/* 왼쪽 위 칩 열(상단 띠 바로 아래): 공유 알약(샷 뒤) · 빨리감기 안내 · 드릴 · 배치 안내 · 리플레이 · 종료 · 대전 상태. 겹치지 않게 세로로 쌓는다. */}
                    <div className="absolute top-2 left-2 z-[3] flex flex-col items-start gap-1 pointer-events-none max-w-[calc(100%-64px)]">
                        {canShare && (
                            <button
                                type="button" onClick={onShareShot} disabled={sharing}
                                aria-label={t("sim.share.button")} title={t("sim.share.button")}
                                className="pointer-events-auto h-11 px-4 inline-flex items-center gap-1.5 rounded-pill bg-surface-1 border border-surface-line rk-shadow text-[13px] font-semibold text-ink-2 active:bg-surface-3 disabled:opacity-40"
                            >
                                <ShareIcon />
                                {t("sim.share.button")}
                            </button>
                        )}
                        {sim.phase === "shooting" && (
                            <span className={chipNeutral}>{sim.playback.speed === 4 ? t("sim.hud.fastForward") : t("sim.hud.holdToFastForward")}</span>
                        )}
                        {drill && (
                            <span className={drillLocked ? chipBrand : chipNeutral}>
                                {drillLocked
                                    ? t("sim.drill.chipScoring").replace("{name}", t(drill.drill.nameKey))
                                    : drill.result
                                        ? t(drill.result.success ? "sim.drill.chipScoredSuccess" : "sim.drill.chipScoredFail").replace("{n}", String(drill.result.cushions))
                                        : t("sim.drill.chipPractice")}
                            </span>
                        )}
                        {!drill && sim.canPlace && sim.session && sim.session.shotCount === 0 && (
                            <span className={chipNeutral}>{t("sim.hud.placeHint")}</span>
                        )}
                        {replayChip && sim.session?.shotCount === 1 && (
                            <>
                                <span className={chipBrand}>{t("sim.share.replayChip")}</span>
                                {replayChip === "mismatch" && <span className={chipNeutral}>{t("sim.share.replayMismatch")}</span>}
                            </>
                        )}
                        {finished && !endOpen && <span className={chipNeutral}>{t("sim.hud.finished")}</span>}
                        {matchLoad === "loading" && <span className={chipNeutral}>{t("sim.match.loading")}</span>}
                        {isMatch && sim.offline && <span className={chipNeutral}>{t("sim.match.offline")}</span>}
                        {isMatch && sim.replaying && sim.match?.opponentShot && <span className={chipBrand}>{t("sim.match.opponentShot")}</span>}
                        {isMatch && turnChip && sim.phase === "aim" && <span className={chipBrand}>{t("sim.match.yourTurn")}</span>}
                    </div>

                    {/* 오른쪽 열: 툴바 → 세로 큐 슬라이더(남은 높이) → ± → 샷. 이 화면의 초록은 샷 하나다. */}
                    <div
                        data-sim-controls="right"
                        data-compact={compact ? "1" : undefined}
                        aria-hidden={controlsHidden || undefined}
                        className={cn(
                            "absolute right-2 z-[3] flex flex-col items-end transition-opacity duration-150",
                            compact ? "top-1 bottom-1 gap-1.5" : "top-1.5 bottom-1.5 gap-2",
                            controlsHidden ? "opacity-0 pointer-events-none" : "opacity-100",
                        )}
                    >
                        {/* 툴바는 남는 높이가 없으면(compact 로도) 줄어들며 스크롤된다 — 큐 슬라이더(최소 높이)·±·샷은 항상 보인다 */}
                        <ToolRail groups={railGroups} size={compact ? "sm" : "md"} className="shrink min-h-0 overflow-y-auto overscroll-contain" />
                        <PowerRail V0={sim.input.V0} disabled={!aiming} onChange={onPower} compact={compact} className="flex-1" />
                        {/* ± 0.05 m/s: 36 px 원 두 개, 사이 8 px(탭 대상 간격 규칙) */}
                        <div className="shrink-0 flex gap-2">
                            <HoldButton label={t("sim.controls.powerDown")} disabled={!aiming} onTick={onPowerDown} className="h-9 w-9 rounded-pill">
                                <MinusIcon />
                            </HoldButton>
                            <HoldButton label={t("sim.controls.powerUp")} disabled={!aiming} onTick={onPowerUp} className="h-9 w-9 rounded-pill">
                                <PlusIcon />
                            </HoldButton>
                        </div>
                        {!(isMatch && sim.phase === "finished") && (
                            <ShotButton phase={sim.phase} onShoot={onShoot} onRestart={onRestart} compact={compact} className="shrink-0" />
                        )}
                    </div>

                    {/* 왼쪽 아래: 두께 독(둘째 줄에 되돌리기) */}
                    <ThicknessDock
                        active={active} side={side} disabled={!aiming}
                        onThickness={onThickness} onSide={onSide} onNudge={onNudge}
                        onUndo={undoInDock ? onUndo : null}
                        className={cn(
                            "absolute left-2 bottom-2 z-[3] transition-opacity duration-150",
                            controlsHidden ? "opacity-0 pointer-events-none" : "opacity-100",
                        )}
                    />

                    {/* ── 대전 전용 표시 ── */}
                    {(matchLoad === "error" || matchLoad === "notMine") && (
                        <div className="absolute inset-0 z-[4] flex items-center justify-center p-6">
                            <div className="rounded-card bg-surface-1 border border-surface-line px-5 py-4 text-center max-w-[300px]">
                                <p className="text-[14px] font-semibold text-ink-1">{t(matchLoad === "notMine" ? "sim.match.notMine" : "sim.match.loadFailed")}</p>
                                <button type="button" onClick={() => navigate("/online-game?lobby=1", { replace: true })} className="mt-3 h-11 px-5 rounded-xl bg-brand text-brand-fg text-[14px] font-semibold">
                                    {t("sim.match.listTitle")}
                                </button>
                            </div>
                        </div>
                    )}
                    {isMatch && sim.phase === "waiting" && sim.match && !bannerVisible && (
                        <div className="absolute inset-x-0 bottom-3 z-[3] flex flex-col items-center gap-2 px-4">
                            <div className="rounded-card bg-surface-1 border border-surface-line px-4 py-3 text-center max-w-[320px] w-full">
                                <p className="text-[12px] font-medium text-ink-4">{sim.match.opponentName}</p>
                                <p className="text-[14px] font-semibold text-ink-1">{t("sim.match.waitingTurn")}</p>
                                <p className="text-[12px] font-medium text-ink-4 mt-0.5">{t("sim.match.waitingHint")}</p>
                                {sim.match.canClaim ? (
                                    <button type="button" onClick={() => { void onClaim(); }} className="mt-2 h-11 w-full rounded-xl bg-brand text-brand-fg text-[13px] font-semibold">
                                        {t("sim.match.claim")}
                                    </button>
                                ) : (
                                    <p className="text-[12px] font-medium text-ink-4 mt-1">{t("sim.match.claimWait")}</p>
                                )}
                            </div>
                        </div>
                    )}
                    {coachOpen && sim.phase === "aim" && sim.mode === "solo" && <CoachHint onClose={closeCoach} />}
                    {/* 결과 배너: 두께 독 위, 오른쪽 열 왼쪽 — 테이블 아래쪽 가운데 */}
                    <div className="absolute left-0 right-[60px] top-0 z-[3] pointer-events-none" style={{ bottom: DOCK_HEIGHT + 8 }}>
                        <OutcomeBanner outcome={banner?.outcome ?? null} visible={bannerVisible} sub={readoutText} />
                    </div>
                </div>
            </div>

            {/* 드릴·로비 전체 화면: 머리글(제목 + 닫기 알약)은 각 패널이 로비와 같은 꼴로 그린다. 폭·여백은 여기서 한 번만. */}
            {showDrills && (
                <div className="fixed inset-0 z-[5] overflow-y-auto bg-surface-1" style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
                    <div className="w-full max-w-[420px] mx-auto px-5 pt-4 pb-8">
                        <DrillPanel onPlay={onPlayDrill} myMemberId={member?.id} onClose={() => navigate(EXIT_PATH)} />
                    </div>
                </div>
            )}
            {showLobby && (
                <div className="fixed inset-0 z-[5] overflow-y-auto bg-surface-1" style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
                    <MatchLobby onStarted={openMatch} onCreated={() => { void queryClient.invalidateQueries({ queryKey: MATCH_LIST_QUERY_KEY }); }} onClose={() => navigate(EXIT_PATH)} />
                    <div className="w-full max-w-[420px] mx-auto px-5 pb-8">
                        <div className="border-t border-surface-line pt-2">
                            <MatchList onOpen={openMatch} />
                        </div>
                    </div>
                </div>
            )}
            <SimSetupDialog open={setupOpen} onOpenChange={onSetupOpenChange} onStart={onSetupStart} onMatch={() => navigate("/online-game?lobby=1", { replace: true })} onDrills={() => navigate("/online-game?drills=1", { replace: true })} />
            <SpinSheet
                open={spinSheet.open} tab={spinSheet.tab} onOpenChange={onSpinSheetOpen} onTab={onSpinSheetTab}
                a={sim.input.a} b={sim.input.b} theta={sim.input.theta} cueBallId={sim.cueBallId} disabled={!aiming}
                onSpin={onSpin} onElevation={onElevation}
            />
            <SolverSheet
                open={solverOpen}
                onOpenChange={(o) => { if (!o) solver.cancel(); setSolverOpen(o); }}
                status={solver.status} progress={solver.progress}
                candidates={solver.result?.candidates ?? []}
                onApply={onSolverApply} onPreview={onSolverPreview}
                onCancel={solver.cancel} onRetry={retrySolver}
            />
            <ResignConfirm open={resignOpen} onOpenChange={setResignOpen} busy={exiting} onConfirm={() => { void onResign(); }} />
            <InningSheet open={sheetOpen} onOpenChange={setSheetOpen} log={log} session={sim.session} names={names} phase={sim.phase} />
            <EndDialog
                open={endOpen} onOpenChange={(o) => { if (!o) setEndDismissed(true); }}
                session={sim.session} phase={sim.phase} names={names}
                record={sim.record} offline={isMatch ? false : sim.offline} mismatches={sim.mismatches} busy={exiting}
                onRestart={onRestart} onExit={() => { void exitNow(); }}
                onShare={canShare ? onShareEnd : undefined}
                subtitle={endSubtitle} hideRestart={isMatch}
            />
            <ExitConfirm
                open={exitOpen} onOpenChange={setExitOpen}
                record={sim.record} offline={isMatch ? false : sim.offline} finished={!!finished} busy={exiting}
                desc={isMatch ? t("sim.match.leaveDesc") : undefined}
                onConfirm={() => { void exitNow(); }}
            />
        </div>
    );
}

export default SimulatorPage;
