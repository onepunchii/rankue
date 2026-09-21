/**
 * 시뮬레이터 화면(DOM 셸). 물리·판정·재생·서버 동기화는 useSimulator 가 전부 맡고, 여기서는
 *  - 렌더러·오버레이(Overlay)를 테이블 래퍼에 얹고 rAF 루프에서 frameAt() 으로 그리며(React 상태 없음),
 *    렌더러는 기기 저장값(rendererChoice: "rankue.sim.renderer")과 WebGL2 탐색으로 ThreeRenderer 를 고르고, 생성 실패나
 *    컨텍스트 손실 2회면 Canvas2DRenderer 로 내려간다(같은 Renderer 계약이라 루프·오버레이·제스처는 모른다),
 *  - 테이블 포인터 제스처(조준 드래그 · 연습 모드 공 배치 · 재생 중 길게 눌러 4×)를 tableGestures 로 해석하고,
 *    조준 기록은 resetTableGesture 한 곳에서 비운다 — 뗌 신호 말고도 캡처 상실·옛 손가락 위 새 터치·단계 전환·앱 가려짐·언마운트에서
 *    스스로 풀린다(2026-09-11 먹통 수정). 떠 있는 동안 <html> 에 sim-no-select 를 붙여 복사하기 메뉴를 막는다(index.css),
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
import { randomLayout } from "@shared/sim/randomLayout";
import { DEFAULT_CUE } from "@shared/sim/params";
import { isOpeningShot, SHOT_CLOCK_GRACE_S, SHOT_CLOCK_S, type ShotOutcome } from "@shared/sim/rules";
import type { GameType } from "@shared/sim/rules/types";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useGameAudio } from "@/hooks/useGameAudio";
import { useAuth } from "@/hooks/useAuth";
import { useKeepAwake } from "../hooks/useKeepAwake"; // 상대 경로 — vitest 에 "@/" 별칭이 없고 SimulatorPage.test 는 "@/" 를 전부 목으로 바꾼다
import { useSimulator, type OfflineReason } from "./useSimulator";
import type { Renderer, RendererView, SafeInsets } from "./render/Renderer";
import { ZOOM_MAX, ZOOM_MIN } from "./render/Renderer";
import { Canvas2DRenderer } from "./render/Canvas2DRenderer";
import {
    CONTEXT_LOSS_LIMIT, readViewPref, safeLocalStorage, selectRendererKind, writeRendererPref, writeViewPref, type RendererKind,
    readZoomPref, writeZoomPref,
} from "./render/rendererChoice";
import { Overlay, type Project } from "./overlay/Overlay";
import { createNumbersCache, overlayDiamond, readDiamondPref, shotReadout, writeDiamondPref } from "./overlay/diamondSystem";
import { SimSetupDialog, type SimSetupConfig } from "./SimSetupDialog";
import { SimEntry } from "./entry/SimEntry";
import { ENTRY_STYLE } from "./entry/entryTheme";
import { bumpPathCount } from "./entry/entryStats";
import { SimDash } from "./dash/SimDash";
import { RoomList } from "./match/RoomList";
import { WatchList } from "./watch/WatchList";
import WatchPage from "./watch/WatchPage";
import { RankPage } from "./rank/RankPage";
import { isCompleteCode, sanitizeCode } from "./matchApi";
import { matchApi, type MatchPublic } from "./matchApi";
import { MatchLobby } from "./match/MatchLobby";
import { MATCH_LIST_QUERY_KEY } from "./match/queryKeys";
import { endReasonText, shouldOpenMatch } from "./match/matchView";
import { ResignConfirm } from "./components/ResignConfirm";
import { CoachHint, COACH_PREF_KEY } from "./components/CoachHint";
import { RealityHint, REALITY_PREF_KEY } from "./components/RealityHint";
import { MatchEndRapport } from "./match/MatchEndRapport";
import { MatchIntro, INTRO_MS } from "./match/MatchIntro";
import { aimPhi } from "./aimAssist";
import { useSolver } from "./solver/useSolver";
import { SolverSheet } from "./solver/SolverSheet";
import type { SolveCandidate } from "./solver/search";
import { buildPreviewPaths, type PreviewPaths } from "./overlay/paths";
import { DrillPanel, DRILL_WEEK_QUERY_KEY, DRILL_LADDER_QUERY_KEY } from "./drill/DrillPanel";
import { drillApi, type DrillWeek, type WeekDrill } from "./drill/drillApi";
import { aimAssistFor, buildConfig } from "./setupPresets";
import { decodePageConfig, readCfgParam } from "./pageConfig";
import { decodeReplay, encodeReplay, forSoloSession, replaySource, replayUrl, REPLAY_PARAM, toReplayConfig, type ReplayPayload } from "./share/replayLink";
import { fileNameFor, gameBadge, replayShortText, sessionStatsLine, shotSubtitle, shotTitle } from "./share/shareCard";
import { useShare } from "./share/useShare";
import { activeThickness, elevationDeg, FINE_STEP_RAD, pullbackFor, stepPower, type ThicknessStep } from "./controlsMath";
import { appendShot, EMPTY_LOG, inningRows, popShot, type InningLog } from "./inningLog";
import { makeHistoryLoader } from "./matchHistory";
import { beginGesture, moveGesture, planGestureReset, staleResetReason, type Gesture, type GestureResetReason, pinchZoom} from "./tableGestures";
import { reportGestureRecover, type TelemetryMode } from "./gestureTelemetry";
import { RISK_KEYS, shotRisk } from "./shotRisk";
import { playerLabel, tableLabel } from "./hudMath";
import { sameCueInput } from "./simReducer";
import { easeOppAim, OPP_AIM_PULLBACK } from "./match/oppAim";
import { MatchChatLog, MatchChatToggle, MatchMiniChat } from "./match/MatchChat";
import { chatMaxHeight } from "./match/chatLayout";
import { MatchScoreStrip } from "./match/MatchScoreStrip";
import type { ChatLine } from "./matchApi";
import type { CueInput, Phase } from "./simReducer";
import type { SimPreview } from "./simController";
import { TopBar, type MatchHeaderPlayer } from "./components/TopBar";
import { ToolRail, type RailItem } from "./components/ToolRail";
import {
    CloseIcon, CubeIcon, DiamondIcon, ElevationIcon, FlagIcon, ListIcon, MinusIcon, PlusIcon, ResetIcon, ShareIcon, SolverIcon, SoundIcon, WarnIcon,
    SpinIcon, PathChip } from "./components/railIcons";
import { POWER_RAIL_MIN_MD, PowerRail } from "./components/PowerRail";
import { DOCK_HEIGHT, ThicknessDock } from "./components/ThicknessDock";
import { BestPathCard } from "./solver/BestPathCard";
import { rankedPaths, successPct } from "./solver/bestPath";
import { railFitsMd } from "./railLayout";
import { ShotButton } from "./components/ShotButton";
import { SpinSheet, type SpinSheetTab } from "./components/SpinSheet";
import { HoldButton } from "./components/HoldButton";
import { OutcomeBanner } from "./components/OutcomeBanner";
import { InningSheet } from "./components/InningSheet";
import { EndDialog } from "./components/EndDialog";
import { ExitConfirm } from "./components/ExitConfirm";

/**
 * 시뮬레이터가 떠 있는 동안 <html> 에 붙이는 클래스 — index.css 가 문서 전체의 글자 선택·길게 누르기 메뉴를 끈다(입력칸 제외).
 * 몸체로 포털되는 시트·대화상자·토스트까지 덮으려고 이 화면 루트가 아니라 문서에 건다. 화면이 겹쳐 떠도(전환 중) 마지막이
 * 내려갈 때만 떼도록 센다.
 */
const NO_SELECT_CLASS = "sim-no-select";
let noSelectHolders = 0;

/** 남아 있는 글자 선택을 지운다 — 선택이 살아 있으면 다음 길게 누르기에 OS 복사하기 메뉴가 뜨고, 그 메뉴가 뗌 신호를 삼킨다. */
function clearDocumentSelection(): void {
    try {
        const sel = typeof window !== "undefined" ? window.getSelection?.() : null;
        if (sel && sel.rangeCount > 0) sel.removeAllRanges();
    } catch { /* 선택 API 없음 */ }
}

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
/** 길 찾기 화면의 탐색 예산(ms) — 기본 1.5 s 보다 길게 본다. */
/** 샷을 누른 뒤 큐대가 앞으로 밀리는 시간(ms) — 이 뒤에 공이 출발한다. */
const STROKE_MS = 180;
const PATH_BUDGET_MS = 3500;
/** 오른쪽 바에 세울 길 수(오너: 확률 좋은 길 다섯 개). */
const PATH_TOP_N = 5;
const TABLE_INSETS: SafeInsets = { top: 8, right: 68, bottom: DOCK_HEIGHT + 8, left: 8 };
/**
 * 테이블 영역이 이보다 낮으면(iPhone SE 375×667 → 623, 세이프 에어리어 있는 6.1" 폰 ≈ 715) compact: 툴바 40 px·간격 6, 큐대 80 px, 샷 56 px.
 * 그 밖에도 툴바 버튼 수(모드·렌더러·드릴에 따라 6~9)가 md 로 열에 안 들어가면(railFitsMd) compact. 그래도 넘치면 툴바가 스크롤된다
 * (큐 슬라이더 최소 높이가 우선). 375×812 는 768 이라 8개까지 기본.
 */
const COMPACT_BELOW_PX = 720;
/** 대전이 아닐 때의 빈 채팅 — 매 렌더 새 배열을 만들면 memo 가 무의미해진다. */
const EMPTY_CHAT: readonly ChatLine[] = [];
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
    /** 조준 보정(일반 모드). 오버레이·카메라·두께 활성은 aimPhi(큐 방향 + 스쿼트)로 본다. */
    assist: boolean;
    /** 상대가 지금 겨누는 각도(대전 대기 중에만). 여기에 상대 큐대만 얹는다 — 조준선·길은 안 준다. */
    opponentAim: number | null;
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
    // ?dash=1 대시보드(기록·그래프·내 대전, 2026-09-08 오너). 예전 링크 ?lobby=1&tab=list(내 대전 목록)도 대시보드의 대전 섹션으로 보낸다.
    const legacyList = params.get("lobby") === "1" && params.get("tab") === "list";
    const dashView = params.get("dash") === "1" || legacyList;
    const dashSection = params.get("sec") === "matches" || legacyList ? "matches" as const : undefined;
    const lobby = params.get("lobby") === "1" && !legacyList;
    // ?lobby=1&public=1: 멀티방으로 열기 토글이 켜진 채 · ?lobby=1&tab=join&code=: 코드가 채워진 참가 화면(비밀번호 초대 등)
    const lobbyPublic = params.get("public") === "1";
    const lobbyCode = sanitizeCode(params.get("code") ?? "");
    // ?rooms=1 멀티방 목록(2026-09-08 오너: 별도 카드) · ?rank=1 온라인 대전 랭킹
    const roomsView = params.get("rooms") === "1";
    const rankView = params.get("rank") === "1";
    // ?watch=<대전 id> 관전·다시보기(2026-09-12 오너). 읽기 전용 화면이라 시뮬레이터 세션을 열지 않는다.
    const watchId = params.get("watch");
    // ?join=<code>[&auto=1]: 푸시 초대 딥링크. auto 면 비밀번호 없는 대기 방에 바로 참가, 아니면 코드가 채워진 참가 화면
    const joinCodeRaw = sanitizeCode(params.get("join") ?? "");
    const joinCode = isCompleteCode(joinCodeRaw) ? joinCodeRaw : "";
    const autoJoin = params.get("auto") === "1";
    const drillsView = params.get("drills") === "1";
    // 길 찾기(?path=1, 2026-09-08 오너): 공을 놓고 3쿠션 해법을 찾는 연습 세션. 오버레이가 아니라 세션이라 overlayParam 에는 넣지 않는다.
    const pathView = params.get("path") === "1";
    // 리플레이 링크(?replay=): 대전·로비·드릴·대시보드가 아닐 때만. cfg 보다 우선하고, 깨진 링크는 cfg 처럼 설정 창으로 떨어진다
    const overlayParam = !!matchId || !!watchId || lobby || drillsView || dashView || roomsView || rankView || joinCode !== "" || pathView;
    const [replay] = useState<ReplayPayload | null>(() => (overlayParam ? null : decodeReplay(params.get(REPLAY_PARAM))));
    const [initial] = useState(() => (overlayParam || replay ? null : decodePageConfig(readCfgParam(search))));
    // 파라미터가 하나도 없으면 진입 화면(싱글 / 친구와 대전 / 멀티방)부터. cfg 가 있는데 깨졌으면 예전처럼 설정 창을 바로 연다.
    const entryView = !overlayParam && !replay && readCfgParam(search) === null && params.get(REPLAY_PARAM) === null;
    const [setupOpen, setSetupOpen] = useState(!entryView && initial === null && replay === null && !overlayParam);
    const lobbyTab = params.get("tab") === "join" ? "join" as const : undefined;
    // 드릴 모드: 고정 배치에서 첫 샷만 서버가 채점(문제당 1회), 그 뒤는 연습. scored 전엔 공 배치를 막는다.
    const [drill, setDrill] = useState<{ drill: WeekDrill; week: DrillWeek; scored: boolean; result: { success: boolean; cushions: number } | null } | null>(null);
    const drillRef = useRef(drill);
    drillRef.current = drill;
    const [matchLoad, setMatchLoad] = useState<"idle" | "loading" | "error" | "notMine">("idle");
    const [resignOpen, setResignOpen] = useState(false);
    // 첫 세션 안내: 기기에 저장된 적 없으면 첫 aim 단계에서 한 번
    const [coachOpen, setCoachOpen] = useState(() => { try { return safeLocalStorage()?.getItem(COACH_PREF_KEY) !== "1"; } catch { return false; } });
    const closeCoach = useCallback(() => { setCoachOpen(false); try { safeLocalStorage()?.setItem(COACH_PREF_KEY, "1"); } catch { /* 저장 불가 */ } }, []);
    const [realityOpen, setRealityOpen] = useState(() => { try { return safeLocalStorage()?.getItem(REALITY_PREF_KEY) !== "1"; } catch { return false; } });
    const closeReality = useCallback(() => { setRealityOpen(false); try { safeLocalStorage()?.setItem(REALITY_PREF_KEY, "1"); } catch { /* 저장 불가 */ } }, []);
    const [turnChip, setTurnChip] = useState(false);
    const queryClient = useQueryClient();

    // ── 화면 상태 ─────────────────────────────────────────────────────────
    const [muted, setMuted] = useState(false);
    const [diamond, setDiamond] = useState(() => readDiamondPref(safeLocalStorage()));
    const [diamondTouched, setDiamondTouched] = useState(false);
    // 카메라 뷰: 저장값으로 시작. ThreeRenderer 가 올라와야(setView 지원) HUD 토글이 보이고 실제로 적용된다.
    const [cameraView, setCameraView] = useState<RendererView>(() => readViewPref(safeLocalStorage()));
    const cameraViewRef = useRef(cameraView);
    const [viewSupported, setViewSupported] = useState(false);
    const [log, setLog] = useState<InningLog>(EMPTY_LOG);
    /**
     * 대전 기록 되살리기(2026-09-18 오너: "방 나갔다 다시 이어 하면 이닝별 스코어가 다 지워져 있다").
     * 컨트롤러가 기준점(onMatchBase)을 알리면 서버 샷 기록을 받아 그 앞부분을 채운다 — 경합 규칙은 matchHistory.ts.
     * 로더는 번호표를 들고 있어 화면 수명 동안 하나만 만든다.
     */
    const openMatchIdRef = useRef<string | null>(null);
    const historyLoaderRef = useRef<ReturnType<typeof makeHistoryLoader> | null>(null);
    if (historyLoaderRef.current === null) {
        historyLoaderRef.current = makeHistoryLoader({
            getShots: (id, from) => matchApi.getShots(id, from),
            update: setLog,
            isOpen: (id) => openMatchIdRef.current === id,
        });
    }
    const [banner, setBanner] = useState<{ outcome: ShotOutcome; id: number } | null>(null);
    const [bannerVisible, setBannerVisible] = useState(false);
    // 굿샷 권유(2026-09-15 라포 4번): 상대가 득점한 직후에만 잠깐 뜨는 큰 버튼. run 은 상대의 지금 연속 득점.
    // onOutcome 은 useSimulator 보다 먼저 만들어져 sim 을 못 본다 — 내 자리만 ref 로 넘긴다.
    const myIndexRef = useRef<number | null>(null);
    // 시작 인사(2026-09-15 라포 3번): 첫 샷 전에 한 번만. 대전 id 를 적어 두어 같은 판에서 다시 뜨지 않게 한다.
    const [introFor, setIntroFor] = useState<string | null>(null);
    const introShownRef = useRef<string | null>(null);
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
    /** 테이블 영역 폭 — 대화창 높이 상한(천을 덮지 않게)을 렌더러와 같은 배치 계산으로 구할 때 쓴다. */
    const [tableW, setTableW] = useState(0);

    const sim = useSimulator({
        getAudioContext: getCtx,
        muted,
        onMismatch: () => toast({ title: t("sim.sync.mismatch") }),
        onOffline: (reason) => toast({ title: t(OFFLINE_KEYS[reason]) }),
        onMiscue: () => toast({ title: t("sim.shot.miscue") }),
        onOutcome: (outcome, session, shooter, idx) => {
            setLog((l) => appendShot(l, outcome, session, shooter, idx));
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
            else if (e === "timeout-me") toast({ title: t("sim.match.timeoutMe") });
            else if (e === "timeout-opponent") toast({ title: t("sim.match.timeoutOpponent") });
        },
        onMatchBase: (b) => historyLoaderRef.current?.(b),
    });
    const { actions } = sim;
    openMatchIdRef.current = sim.mode === "match" ? sim.match?.id ?? null : null;
    /**
     * 선수별 끝낸 이닝 수 — 샷 없이 끝난 이닝(40초 시간 초과)을 점수판에 0 으로 채우는 데 쓴다.
     * 공이 구르는 동안(shooting)엔 세션이 이미 샷 **뒤** 값이라 그대로 쓰면 결과(놓쳤다)가 공이 멈추기 전에 칸에 먼저 뜬다 —
     * 그동안은 직전 값을 붙들어 둔다.
     */
    const completedRef = useRef("");
    if (sim.phase !== "shooting") completedRef.current = sim.session ? sim.session.players.map((p) => p.innings).join(",") : "";
    const completedKey = completedRef.current;
    const completed = useMemo(() => (completedKey ? completedKey.split(",").map(Number) : undefined), [completedKey]);
    /** 세로 이닝 점수판(대전)의 행 — 이닝 시트와 같은 기록에서 뽑는다. */
    const scoreRows = useMemo(() => inningRows(log, 2, completed), [log, completed]);
    const table = sim.params?.table ?? TABLES.DAEDAE;
    // ── 해법 찾기(연습·드릴 전용, 워커) ─────────────────────────────────
    const solver = useSolver();
    const [solverOpen, setSolverOpen] = useState(false);
    const [solverPreview, setSolverPreview] = useState<{ candidate: SolveCandidate; paths: PreviewPaths } | null>(null);
    /** 길을 눌러 넣은 입력. 이 값에서 벗어나면(내가 조준을 바꾸면) 그린 경로를 지운다. */
    const appliedInputRef = useRef<CueInput | null>(null);
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
    const assist = sim.config ? aimAssistFor(sim.config.mode) : true;
    const reality = sim.config?.mode === "reality";
    const is3c = gameType === "3c";
    // 길 찾기에선 다이아몬드가 기본(길을 다이아몬드 숫자로 읽는다) — 끄고 싶으면 툴바에서 끈다
    const diamondOn = (diamond || (pathView && !diamondTouched)) && is3c;

    // 처음 한 번: URL 설정이 있으면 바로 시작
    const startedRef = useRef(false);
    /**
     * 이미 연 대전 id. startedRef 하나로 "한 번이라도 시작했나"만 보면 **재경기로 새 대전에 들어와도 옛 판이 그대로 남는다**
     * (2026-09-15 오너 제보: "재경기시 새 당구대가 안 열리고 기존 마지막 대결이 열려 있음").
     * id 를 기억해 두면 같은 대전은 두 번 열지 않으면서 다른 대전으로는 갈아탈 수 있다.
     */
    const startedMatchRef = useRef<string | null>(null);
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

    // ?join=<code>&auto=1 (푸시 초대): 대기 중이고 비밀번호가 없으면 바로 참가해 ?match= 로 넘어간다.
    // 비밀번호 방·auto 아님 → 코드가 채워진 참가 화면. 내 대전이면 그대로 연다. 없어졌으면 안내하고 진입 화면으로.
    const joinRef = useRef("");
    useEffect(() => {
        if (!joinCode || joinRef.current === joinCode) return;
        joinRef.current = joinCode;
        const toJoinScreen = () => navigate(`/online-game?lobby=1&tab=join&code=${joinCode}`, { replace: true });
        (async () => {
            try {
                const m = await matchApi.lookupCode(joinCode);
                if (m.myIndex >= 0) {
                    navigate(m.status === "playing" ? `/online-game?match=${m.id}` : "/online-game?lobby=1", { replace: true });
                    return;
                }
                if (!autoJoin || m.hasPassword) { toJoinScreen(); return; }
                const handi = member ? (m.gameType === "3c" ? member.handi3c : member.handi4c) : null;
                const target = handi !== null && handi !== undefined && handi >= 1 && handi <= 999 ? handi : m.hostTarget;
                const joined = await matchApi.joinMatch(joinCode, target);
                void queryClient.invalidateQueries({ queryKey: MATCH_LIST_QUERY_KEY });
                navigate(`/online-game?match=${joined.id}`, { replace: true });
            } catch {
                toast({ title: t("sim.match.inviteGone") });
                navigate("/online-game", { replace: true });
            }
        })();
    }, [joinCode, autoJoin, member, navigate, queryClient, toast, t]);

    // ?match=<id> (푸시 딥링크·목록에서 열기): 서버에서 받아 대전 모드로 연다
    useEffect(() => {
        if (!matchId || !shouldOpenMatch(startedMatchRef.current, matchId)) return;
        startedMatchRef.current = matchId;
        startedRef.current = true;   // 솔로 자동 시작은 계속 막는다
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
                // 저장된 카메라 뷰·배율을 적용하고 툴바에 "3D 보기" 토글을 연다(배율은 기기에 남는다 — 2026-09-12 오너)
                three.setView(cameraViewRef.current);
                three.setZoom?.(zoomRef.current);
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
            setTableW(el.clientWidth);
        };
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        measure();
        return () => ro.disconnect();
    }, []);

    /**
     * 상대가 겨누는 각도 — 내 차례가 아니고(waiting) 서버가 낡지 않은 값을 줄 때만.
     * 서버가 이미 AIM_FRESH_MS 로 걸러 주므로(상대가 앱을 닫으면 null 이 온다) 여기선 화면 상태만 본다.
     */
    const opponentAim = sim.phase === "waiting" ? sim.match?.opponentAim?.phi ?? null : null;
    /** 직전 프레임에 그린 상대 큐 각도(따라가는 중간값). 값이 없어지면 null 로 비워 큐대를 지운다. */
    const oppAimRef = useRef<number | null>(null);

    // rAF 루프가 읽는 뷰 — 렌더마다 갱신(할당만, 재렌더 없음)
    const viewRef = useRef<View>({
        phase: sim.phase, input: sim.input, cueBallId: sim.cueBallId, balls: sim.balls, preview: sim.preview,
        table, canPlace: sim.canPlace && !drillLocked, dragging, placing, diamond: diamondOn, solverPreview, cameraView, assist, opponentAim,
    });
    viewRef.current = {
        phase: sim.phase, input: sim.input, cueBallId: sim.cueBallId, balls: sim.balls, preview: sim.preview,
        table, canPlace: sim.canPlace && !drillLocked, dragging, placing, diamond: diamondOn, solverPreview, cameraView, assist, opponentAim,
    };
    useEffect(() => {
        dirtyRef.current = true;
    }, [sim.phase, sim.input, sim.cueBallId, sim.balls, sim.preview, table, dragging, placing, diamondOn, solverPreview, cameraView, assist, opponentAim]);

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
            const v = viewRef.current;
            // 상대 큐대는 받은 각도로 프레임마다 조금씩 따라간다 — 따라가는 중이면 dirty 가 아니어도 그려야 움직인다.
            const opp = easeOppAim(oppAimRef.current, v.opponentAim);
            oppAimRef.current = opp?.phi ?? null;
            if (!frame.playing && !dirtyRef.current && !renderer.needsFrame?.() && strokeRef.current === null && !opp?.moving) return;
            dirtyRef.current = false;
            renderer.draw({
                balls: frame.balls,
                // 큐대는 조준 중에만. 샷을 누르면 STROKE_MS 동안 당김이 0 으로 줄며(앞으로 밀리며) 그 뒤 공이 출발한다.
                // 상대 차례엔 상대가 겨누는 각도로 큐대만 얹는다(화면이 멈춰 있지 않게). 세기는 안 오므로 당김은 고정.
                cue: {
                    phi: opp ? opp.phi : v.input.phi,
                    pullback: opp
                        ? OPP_AIM_PULLBACK
                        : strokeRef.current === null
                            ? pullbackFor(v.input.V0)
                            : pullbackFor(v.input.V0) * Math.max(0, 1 - (performance.now() - strokeRef.current) / STROKE_MS),
                    visible: v.phase === "aim" || opp !== null,
                    ballId: v.cueBallId,
                },
                // 큐볼은 큐 스틱이 가리키므로 링을 두르지 않는다 — 8px 남짓한 공에 링이 겹치면 속이 빈 공처럼 보였다(실측).
                highlightBallId: v.placing ?? undefined,
                // 선수 시점 카메라 대상: 조준 중엔 큐볼 뒤(follow), 재생 중엔 부감(overview — 테이블 전체가 보이게 올라갔다가 조준으로
                // 돌아오면 큐볼 뒤로 내려온다). 공 옮기기 중(끌리는 공을 카메라가 따라가면 손가락 아래 테이블 점이 같이 밀려 되먹임된다)·
                // 상대 차례 대기·종료엔 빼서 카메라가 그 자리에 머문다.
                view: v.phase === "aim" && !v.placing ? { cueBallId: v.cueBallId, phi: aimPhi(v.input.phi, v.input.a, v.assist) }
                    : v.phase === "shooting" ? { cueBallId: v.cueBallId, phi: aimPhi(v.input.phi, v.input.a, v.assist), mode: "overview" as const } : undefined,
            });
            const overlay = overlayRef.current;
            if (!overlay) return;
            if (v.phase === "aim") {
                // 드래그 중엔 직선 안내(미리보기는 30 ms 뒤에 오므로), 손을 떼면 예측 경로
                const sp = v.solverPreview;
                overlay.draw({
                    // 조준선은 화면 조준 방향(보정 켜짐 = 큐 방향 + 스쿼트, 리얼리티 = 큐 방향). 큐대 그림만 큐 방향이다.
                    balls: v.balls, phi: sp ? aimPhi(sp.candidate.input.phi, sp.candidate.input.a, v.assist) : aimPhi(v.input.phi, v.input.a, v.assist), cueBallId: v.cueBallId, table: v.table,
                    guide: sp || (!v.dragging && v.preview) ? "preview" : "straight",
                    preview: sp ? sp.paths : (v.preview?.paths ?? null),
                    // 다이아몬드 시스템: 조준 분석은 싸다(광선 하나·산술 몇 줄) — dirty 프레임에만 다시 계산된다.
                    // player 뷰에선 그리지 않는다: 먼 레일의 숫자 알약(레일당 7개 + 바깥 행)이 원근으로 몇 px 간격에 몰려 겹친다.
                    diamond: v.diamond && v.cameraView === "top" ? overlayDiamond(v.balls, v.cueBallId, aimPhi(v.input.phi, v.input.a, v.assist), v.table, numbersCacheRef.current) : null,
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
    /** 눌린 포인터 전부의 화면 px — 두 번째 손가락이 오면 핀치 축소(선수 시점 조준 중에만). */
    const pointersRef = useRef(new Map<number, [number, number]>());
    /** 핀치 중이면 시작 거리와 그때의 배율. 새 배율 = 시작 배율 × (현재 거리 / 시작 거리). */
    const pinchRef = useRef<{ d0: number; z0: number } | null>(null);
    /**
     * 지금 3D 확대·축소 배율(2026-09-12 오너: "손가락 놓더라도 내가 맞춘 크기가 고정으로").
     * 손을 떼도 남고 기기에도 저장한다 — 핀치는 이 값을 바꾸는 조작이지, 잡고 있는 동안의 임시 상태가 아니다.
     */
    const zoomRef = useRef<number>(readZoomPref(safeLocalStorage()));
    /** 조준 드래그 시작 때의 phi — 핀치로 바뀌면 손가락 둘이 닿기 전 드래그된 몇 px 을 되돌린다. */
    const phiAtDownRef = useRef(0);
    /** 직전 포인터의 화면 px(마운트 기준). 조준 드래그의 각 변화를 현재 카메라로 다시 재기 위해 둔다. */
    const lastScreenRef = useRef<[number, number] | null>(null);
    /** 길게 누르기로 4× 를 켰다 — 정리할 때 1× 로 되돌릴지 여기서 안다(뗌 신호가 빠져도 빨리감기가 남지 않게). */
    const holdFastRef = useRef(false);
    // 정리 함수는 리스너(blur·visibilitychange)와 언마운트에서도 불리므로 참조가 안정해야 한다 — 바뀌는 값은 ref 로 읽는다
    const actionsRef = useRef(actions);
    actionsRef.current = actions;
    /** 계측에 싣는 모드 */
    const telemetryModeRef = useRef<TelemetryMode>("practice");
    telemetryModeRef.current = drill ? "drill" : sim.mode === "match" ? "online" : "practice";

    /**
     * 조준 기록을 한 번에 비운다: 제스처·주인 손가락·직전 화면점·손가락 목록·핀치·빨리감기 타이머(와 켜진 4×)·dragging·placing.
     * 예전엔 onPointerEnd(같은 손가락의 up/cancel)만 이 일을 해서, 그 신호 하나가 빠지면 새 터치가 전부 '두 번째 손가락'으로
     * 무시되고 dragging 이 굳어 직선 안내만 보였다(± 버튼만 먹는 먹통). 판단은 tableGestures.planGestureReset, 여기선 실행만.
     * 비정상 사유(캡처 상실·옛 손가락 위 새 터치·제스처 중 앱 가려짐)면 계측 한 건.
     */
    const resetTableGesture = useCallback((reason: GestureResetReason) => {
        const v = viewRef.current;
        const plan = planGestureReset({
            gesture: gestureRef.current, pointerId: pointerIdRef.current, lastScreen: lastScreenRef.current,
            pointers: pointersRef.current, pinch: pinchRef.current,
            holdPending: holdTimerRef.current !== null, holdFast: holdFastRef.current,
            dragging: v.dragging, placing: v.placing,
        }, reason);
        const next = plan.next;
        gestureRef.current = next.gesture;
        pointerIdRef.current = next.pointerId;
        lastScreenRef.current = next.lastScreen;
        pointersRef.current = next.pointers;
        pinchRef.current = next.pinch;
        holdFastRef.current = next.holdFast;
        if (plan.clearHoldTimer && holdTimerRef.current) clearTimeout(holdTimerRef.current);
        holdTimerRef.current = null;
        // 이미 풀린 캡처(뗌 신호를 놓친 손가락)는 브라우저가 예외를 낸다
        if (plan.releasePointerId !== null) { try { tableRef.current?.releasePointerCapture(plan.releasePointerId); } catch { /* 이미 풀림 */ } }
        // 배율은 되돌리지 않는다(2026-09-12 오너) — 제스처가 어떻게 끝나든 사용자가 맞춘 크기는 남는다.
        if (plan.restoreSpeed) actionsRef.current.setSpeed(1);
        if (plan.clearDisplay) { setDragging(false); setPlacing(null); }
        if (plan.abnormal) reportGestureRecover({ reason, view: v.cameraView, mode: telemetryModeRef.current });
    }, []);

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

    const pinchDistance = (): number => {
        const pts = Array.from(pointersRef.current.values());
        if (pts.length < 2) return 0;
        return Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]);
    };

    const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        clearDocumentSelection();
        if (pointerIdRef.current !== null) {
            // 옛 손가락 기록이 남아 있다. 그 손가락이 살아 있다는 증거(이 터치가 두 번째 손가락 + 캡처 유지)가 없으면 뗌 신호를 놓친 것 —
            // 버리고 이 손가락으로 조준을 새로 시작한다. top 뷰엔 두 손가락 기능이 없어 새로 시작한다 — 재생 중 길게 누르기만 예외로
            // 두 번째 손가락을 무시해 4× 가 이어진다(staleResetReason).
            let hasCapture = false;
            try { hasCapture = e.currentTarget.hasPointerCapture(pointerIdRef.current); } catch { /* 조회 불가 = 캡처 없음으로 본다 */ }
            const stale = staleResetReason({
                view: viewRef.current.cameraView, isPrimary: e.isPrimary, hasCapture, gesture: gestureRef.current?.kind ?? null,
            });
            if (stale) {
                resetTableGesture(stale);
            } else {
                // 두 번째 손가락: 선수 시점(3D)에서 조준 중이면 핀치 축소 — 조준 드래그는 취소하고 시작 각으로 되돌린다(2026-09-07 오너 요청:
                // 30 % 까지만 작아지고 떼면 원래대로). 그 밖(공 옮기기·재생)에선 무시.
                pointersRef.current.set(e.pointerId, screenPoint(e));
                const g = gestureRef.current;
                const renderer = rendererRef.current;
                if (g?.kind === "aim" && !pinchRef.current && pointersRef.current.size === 2 && viewRef.current.cameraView === "player" && renderer?.setZoom) {
                    actions.setPhi(phiAtDownRef.current);
                    pinchRef.current = { d0: Math.max(1, pinchDistance()), z0: zoomRef.current };
                    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* noop */ }
                    setDragging(false);
                }
                return;
            }
        }
        pointersRef.current.set(e.pointerId, screenPoint(e));
        const p = unprojectEvent(e);
        if (!p) return;
        const v = viewRef.current;
        const g = beginGesture({ phase: v.phase, canPlace: v.canPlace, balls: v.balls, cueBallId: v.cueBallId, R: v.table.ball.R }, p);
        if (!g) return;
        gestureRef.current = g;
        pointerIdRef.current = e.pointerId;
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* noop */ }
        if (g.kind === "hold") {
            holdTimerRef.current = setTimeout(() => { holdTimerRef.current = null; holdFastRef.current = true; actions.setSpeed(4); }, HOLD_FF_MS);
        } else if (g.kind === "aim") {
            phiAtDownRef.current = v.input.phi;
            setDragging(true);
        } else {
            setPlacing(g.id);
        }
    };

    const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        const pts = pointersRef.current;
        if (pts.has(e.pointerId)) pts.set(e.pointerId, screenPoint(e));
        const pinch = pinchRef.current;
        if (pinch) {
            // 핀치 중: 시작 배율에서 두 손가락 거리 비율만큼 — 오므리면 넓게, 벌리면 확대. 범위는 ZOOM_MIN..ZOOM_MAX.
            if (pts.size >= 2) {
                const z = pinchZoom(pinch.z0, pinch.d0, pinchDistance());
                zoomRef.current = z;
                rendererRef.current?.setZoom?.(z);
            }
            return;
        }
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
        pointersRef.current.delete(e.pointerId);
        if (pinchRef.current) {
            // 어느 손가락이든 떼면 핀치 끝. 배율은 **그대로 남긴다**(2026-09-12 오너) — 기기에 저장해 다음에도 같은 크기로 연다.
            writeZoomPref(safeLocalStorage(), zoomRef.current);
            // 남은 손가락 항목까지 목록에서 비운다 — 남겨 두면 다음 핀치 판정(size===2)이 틀어졌다(2026-09-11 검토).
            try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* noop */ }
            resetTableGesture("pinch-end");
            return;
        }
        if (e.pointerId !== pointerIdRef.current) return;
        resetTableGesture("end");
    };

    // 추적 중인 손가락의 캡처가 뗌 신호 없이 풀렸다(± 버튼·당점 패드와 같은 안전망). 정상 흐름에선 up/cancel 이 먼저 와서
    // onPointerEnd 가 기록을 비우므로 여기선 id 가 맞지 않는다.
    const onLostPointerCapture = (e: React.PointerEvent<HTMLDivElement>) => {
        if (pointerIdRef.current === null || e.pointerId !== pointerIdRef.current) return;
        resetTableGesture("lostcapture");
    };

    // 단계가 바뀌면(샷 발사·차례 넘김·나가기) 진행 중이던 테이블 제스처는 이어질 수 없다 — 굳은 기록이 다음 단계로 새지 않게 비운다.
    // 대전 '나가기 → 목록 → 다시 입장'은 같은 /online-game 이라 이 화면이 그대로 재사용되므로 여기서 풀려야 한다.
    const gesturePhaseRef = useRef(sim.phase);
    useEffect(() => {
        if (gesturePhaseRef.current === sim.phase) return;
        gesturePhaseRef.current = sim.phase;
        resetTableGesture("phase");
    }, [sim.phase, resetTableGesture]);

    // 앱이 가려지거나 포커스를 잃으면(홈으로 나감·알림 창·OS 메뉴) 뗌 신호가 오지 않을 수 있다 — 돌아왔을 때 굳어 있지 않게 비운다.
    // 언마운트에서도 비운다(타이머·캡처만 — 컨트롤러는 함께 사라진다).
    useEffect(() => {
        const onBlur = () => resetTableGesture("blur");
        const onVisibility = () => { if (document.visibilityState === "hidden") resetTableGesture("hidden"); };
        const onPageHide = () => resetTableGesture("pagehide");
        window.addEventListener("blur", onBlur);
        document.addEventListener("visibilitychange", onVisibility);
        window.addEventListener("pagehide", onPageHide);
        return () => {
            window.removeEventListener("blur", onBlur);
            document.removeEventListener("visibilitychange", onVisibility);
            window.removeEventListener("pagehide", onPageHide);
            resetTableGesture("unmount");
        };
    }, [resetTableGesture]);

    // 복사하기 메뉴 막기: 떠 있는 동안 <html> 에 sim-no-select(index.css), 테이블에선 선택 시작 자체를 막는다.
    useEffect(() => {
        const root = document.documentElement;
        noSelectHolders += 1;
        root.classList.add(NO_SELECT_CLASS);
        const el = tableRef.current;
        const stopSelect = (ev: Event) => ev.preventDefault();
        el?.addEventListener("selectstart", stopSelect);
        return () => {
            el?.removeEventListener("selectstart", stopSelect);
            noSelectHolders = Math.max(0, noSelectHolders - 1);
            if (noSelectHolders === 0) root.classList.remove(NO_SELECT_CLASS);
        };
    }, []);

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
    // 대전이 진행 중인 동안은 화면이 꺼지지 않게 — 상대 차례를 기다리는 중에도 40초 시계가 돈다.
    useKeepAwake(isMatch && sim.match?.status === "playing");
    // ── 40초 룰 시계(대전): 서버가 적은 turnSeenAt 부터 센다(서버 시각 보정). 0 이 되면 내 차례는 스스로, 상대 차례는 10초 유예 뒤 서버에 알린다.
    // 0 = 시계 없음(NaN 을 쓰면 NaN !== NaN 이라 아래 useEffect 가 매 렌더 다시 걸린다)
    const clockSeenAt = isMatch && sim.match?.status === "playing" && sim.match.turnSeenAt ? Date.parse(sim.match.turnSeenAt) : 0;
    const clockValid = clockSeenAt > 0 && Number.isFinite(clockSeenAt);
    const clockOn = clockValid && (sim.phase === "aim" || sim.phase === "waiting");
    const [clockNow, setClockNow] = useState(() => Date.now());
    useEffect(() => {
        if (!clockOn) return;
        setClockNow(Date.now());
        const id = setInterval(() => setClockNow(Date.now()), 250);
        return () => clearInterval(id);
    }, [clockOn, clockSeenAt]);
    const clockRemaining = clockOn ? SHOT_CLOCK_S - (clockNow + (sim.match?.serverOffsetMs ?? 0) - clockSeenAt) / 1000 : null;
    // 서버가 재생 여유(REPLAY_GRACE_MS)를 더해 미래 시각을 적어 두는 동안(remaining > 40)은 시계를 그리지 않는다 —
    // 40 에 멈춘 숫자가 고장처럼 보인다(2026-09-08 리뷰). 여유가 끝나는 순간 40 부터 자연스럽게 줄어든다.
    const clock = clockRemaining !== null && clockRemaining <= SHOT_CLOCK_S && sim.match
        ? { seconds: Math.max(0, Math.ceil(clockRemaining)), mine: sim.match.isMyTurn }
        : null;
    /**
     * 채팅 초안(2026-09-16). **입력칸 밖**에 둔다 — 상대가 연속 득점하면 재생·결과 배너 때문에 하단 블록이
     * 몇 번씩 마운트를 오가는데, 안에 두면 그때마다 쓰던 글이 날아간다.
     */
    const [chatDraft, setChatDraft] = useState("");
    /** 1탭 문구판이 펼쳐졌나. 펼친 동안엔 상대 차례 카드를 감춰 칩 두 줄 자리를 내준다. */
    const [chatQuickOpen, setChatQuickOpen] = useState(false);
    /** 내 차례에 말풍선으로 연 대화창(2026-09-18 오너: "칠 때도 쓰게"). 조준이 끝나면(샷·차례 바뀜) 저절로 닫힌다. */
    const [aimChatOpen, setAimChatOpen] = useState(false);
    /** 대화창을 위로 펼쳤나(화면 중간까지, 2026-09-18). 내 차례가 되면 접는다 — 조준에 당구대가 필요하다. */
    const [chatExpanded, setChatExpanded] = useState(false);
    /** 마지막으로 본 대화 줄 번호 — 이보다 뒤의 상대 말이 있으면 말풍선에 빨간 점. */
    const [seenChatSeq, setSeenChatSeq] = useState(0);
    /** 칩 열의 한마디는 12초 뒤 사라진다 — 그걸 다시 계산하려면 시계가 돌아야 한다. 말이 있을 때만 돈다. */
    const chatLines = isMatch && sim.match ? sim.match.chat : EMPTY_CHAT;
    const lastChatAt = chatLines.length > 0 ? chatLines[chatLines.length - 1].at : "";
    const [chatNow, setChatNow] = useState(() => Date.now());
    useEffect(() => {
        if (!lastChatAt) return;
        setChatNow(Date.now());
        const id = setInterval(() => setChatNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, [lastChatAt]);
    // 조준이 끝나면(샷을 쳤거나 차례가 넘어갔다) 내 차례 대화창은 닫는다 — 다음 내 차례에 저절로 다시 떠 있으면 조작을 덮는다.
    useEffect(() => { if (sim.phase !== "aim") setAimChatOpen(false); }, [sim.phase]);
    // 내 차례가 되는 순간 펼친 대화창을 접는다 — 다음 조준 때 화면 절반이 대화로 덮여 있으면 안 된다.
    useEffect(() => { if (sim.phase === "aim") setChatExpanded(false); }, [sim.phase]);
    /** 대화 줄이 화면에 보이는 동안은 본 것으로 친다(상대 차례 대화창, 또는 내 차례에 연 대화창). */
    const chatVisible = isMatch && (sim.phase === "waiting" || aimChatOpen);
    const lastChatSeq = chatLines.length > 0 ? chatLines[chatLines.length - 1].seq : 0;
    useEffect(() => { if (chatVisible) setSeenChatSeq(lastChatSeq); }, [chatVisible, lastChatSeq]);
    const myIdx = sim.match?.myIndex ?? -1;
    const chatUnread = chatLines.some((l) => l.seq > seenChatSeq && l.from !== myIdx);
    /** 대화창 높이 상한 — 윗변이 당구 천 아래끝보다 아래에 오게(공을 가릴 수 없게). 렌더러와 같은 배치 계산을 쓴다. */
    const chatMaxH = useMemo(
        () => chatMaxHeight({ width: tableW, height: tableH, table, insets: TABLE_INSETS, bottomGap: 12, floor: 60 }),
        [tableW, tableH, table],
    );
    /*
     * 대화창 높이(2026-09-18 오너: "당구천은 조금 덮어도 돼, 내역이 너무 짧게 보인다").
     *  · 접힘: 천 아래끝(chatMaxH)에서 한 줄 반쯤 더 — 천 맨 아래 가장자리만 살짝 덮는다.
     *  · 펼침: 테이블 영역의 55 %(화면 중간쯤)까지. 키보드가 떠 있으면 그 위에 남는 만큼으로 줄인다 —
     *    안 그러면 상자 윗부분이 헤더 위로 밀려 나간다.
     */
    const CHAT_COLLAPSED_EXTRA = 40;
    const chatBoxMax: number | string = chatExpanded
        ? `min(${Math.max(chatMaxH + CHAT_COLLAPSED_EXTRA, Math.round(tableH * 0.55))}px, calc(100dvh - var(--keyboard-height, 0px) - 150px))`
        : chatMaxH + CHAT_COLLAPSED_EXTRA;

    /** clientKey: 응답만 유실된 재시도를 서버가 한 줄로 합친다(모바일에서 흔하다). */
    const chatKey = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const onSendChat = useCallback(async (text: string) => actionsRef.current.sendChat({ text, clientKey: chatKey() }), []);
    const onSendChatCode = useCallback(async (code: string) => actionsRef.current.sendChat({ code, clientKey: chatKey() }), []);
    /** 조준 중 1탭 전송 — 조용히 실패하면 "눌렀는데 아무 일도 안 난다"가 되므로 반드시 알린다(예전 이모지 사고). */
    const onQuickCode = useCallback(async (code: string) => {
        const r = await actionsRef.current.sendChat({ code, clientKey: chatKey() });
        if (r === "too-fast") toast({ title: t("sim.emoji.tooFast") });
        else if (r === "limit") toast({ title: t("sim.emoji.limit") });
        else if (r !== "ok") toast({ title: t("sim.chat.failed") });
    }, [toast, t]);

    // 내 자리를 ref 에 실어 onOutcome 이 볼 수 있게 한다(옵션 객체는 sim 보다 먼저 만들어진다).
    myIndexRef.current = isMatch && sim.match ? sim.match.myIndex : null;
    // 대전이 막 시작됐으면(아직 아무도 안 쳤다) 인사 화면을 한 번 띄운다.
    const introKey = isMatch && sim.match?.status === "playing" && (sim.session?.shotCount ?? 1) === 0 ? sim.match.id : null;
    useEffect(() => {
        if (!introKey || introShownRef.current === introKey) return;
        introShownRef.current = introKey;
        setIntroFor(introKey);
        const id = setTimeout(() => setIntroFor(null), INTRO_MS);
        return () => clearTimeout(id);
    }, [introKey]);

    /**
     * 대전 헤더의 두 선수(2026-09-16). **왼쪽이 나, 오른쪽이 상대** — 참고 화면과 같은 배치라
     * 내 점수를 늘 같은 자리에서 찾는다. 자리(myIndex)와 화면 순서가 다를 수 있어 여기서 뒤집는다.
     */
    const headerPlayers = useMemo((): readonly [MatchHeaderPlayer, MatchHeaderPlayer] | null => {
        const m = sim.match;
        const sess = sim.session;
        if (!isMatch || !m || !sess || sess.players.length !== 2) return null;
        const mk = (i: 0 | 1): MatchHeaderPlayer => ({
            name: names[i] ?? "",
            country: m.countries[i] ?? null,
            cueBallId: sess.players[i]?.cueBallId ?? (i === 0 ? "white" : "yellow"),
            score: sess.players[i]?.score ?? 0,
            target: sess.players[i]?.target ?? 0,
            timeouts: m.timeouts[i] ?? 0,
            turn: m.status === "playing" && sess.turn === i,
            winner: sess.status === "finished" && sess.winnerIndex === i,
        });
        const me = m.myIndex === 1 ? 1 : 0;
        const opp = me === 0 ? 1 : 0;
        return [mk(me as 0 | 1), mk(opp as 0 | 1)] as const;
    }, [isMatch, sim.match, sim.session, names]);

    // 0 이 되면 서버에 시간 초과를 알린다. 서버가 아직 이르다고 하면(시계 오차) 3 초마다 다시 — 차례가 바뀌어 key 가 달라질 때까지.
    const timeoutFiredRef = useRef<{ key: string; at: number }>({ key: "", at: 0 });
    useEffect(() => {
        if (clockRemaining === null || !sim.match) return;
        const key = `${sim.match.id}:${sim.match.version}:${sim.match.turnSeenAt}`;
        const due = sim.match.isMyTurn ? clockRemaining <= -0.3 : clockRemaining <= -(SHOT_CLOCK_GRACE_S + 0.3);
        if (!due) return;
        const now = Date.now();
        if (timeoutFiredRef.current.key === key && now - timeoutFiredRef.current.at < 3000) return;
        timeoutFiredRef.current = { key, at: now };
        void actions.timeout();
    }, [clockRemaining, sim.match, actions]);

    const active = useMemo(() => {
        if (!sim.session || !sim.params) return null;
        return activeThickness(sim.balls, sim.cueBallId, sim.session.rules.gameType, aimPhi(sim.input.phi, sim.input.a, assist), sim.params.table.ball.R);
    }, [sim.balls, sim.cueBallId, sim.session, sim.params, sim.input.phi, sim.input.a, assist]);

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
    /* 좌/우 버튼을 없앴다(2026-09-17 오너) — 컨트롤러가 지금 겨누는 쪽을 골라 준다. */
    const onThickness = useCallback((step: ThicknessStep) => actions.setThickness(step), [actions]);
    const onNudge = useCallback((dir: -1 | 1) => actions.nudgePhi(dir * FINE_STEP_RAD), [actions]);
    const onSpin = useCallback((a: number, b: number) => actions.setSpin(a, b), [actions]);
    const onSpinVertical = useCallback((b: number) => actions.setSpinVertical(b), [actions]);
    const onElevation = useCallback((theta: number) => actions.setElevation(theta), [actions]);
    const onPower = useCallback((V0: number) => actions.setPower(V0), [actions]);
    // 샷: 큐대가 STROKE_MS 동안 앞으로 밀린 뒤 공이 출발한다(조준 단계에서 그린다 — 예전엔 재생 중에 그려 큐가 굴러가는 공을 따라갔다)
    const strokeRef = useRef<number | null>(null);
    const beginShot = useCallback(() => {
        if (strokeRef.current !== null) return;
        strokeRef.current = performance.now();
        dirtyRef.current = true;
        window.setTimeout(() => { strokeRef.current = null; dirtyRef.current = true; void actions.shoot(); }, STROKE_MS);
    }, [actions]);
    const onShoot = useCallback(() => { beginShot(); }, [beginShot]);
    const onShootPathRef = useRef<() => void>(() => undefined);
    const onShootPath = useCallback(() => { onShootPathRef.current(); }, []);
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
        setDiamondTouched(true);
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
    // 조준 위험 안내(미스큐·마세·점프): 입력·미리보기가 바뀔 때만 다시 계산. 문구는 왼쪽 위 칩 열.
    const risk = useMemo(
        () => (sim.phase === "aim" && sim.params
            ? shotRisk(sim.input, sim.params.cue.maxOffset, sim.preview ? { result: sim.preview.result, cueBallId: sim.cueBallId, R: sim.params.table.ball.R } : null)
            : null),
        [sim.phase, sim.params, sim.input, sim.preview, sim.cueBallId],
    );
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
            stats: withStats && statsFor ? sessionStatsLine(t, statsFor, sim.phase, sim.session?.rules.gameType) : null,
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
        // 대전 열기도 히스토리를 남긴다 — 기기 뒤로가기가 로비·목록으로 돌아온다(2026-09-09 오너)
        if (actions.startMatch(m)) navigate(`/online-game?match=${m.id}`);
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

    // 길 찾기: 무작위 배치로 연습 세션을 연다(기록 없음). 공은 손가락으로 옮길 수 있고, 툴바의 "길 찾기"가 해법을 찾는다.
    const pathSeedRef = useRef(1);
    const pathViewRef = useRef(false);
    pathViewRef.current = pathView;
    const startPath = useCallback((seed: number) => {
        const table = TABLES.DAEDAE;
        pathSeedRef.current = seed;
        setLog(EMPTY_LOG);
        setBanner(null);
        actions.start(buildConfig({ gameType: "3c", tableId: "DAEDAE", target: 100, rules: { ruleSet: "umb" } }), {
            record: false, balls: randomLayout("3c", table, seed),
        });
    }, [actions]);
    const pathStartedRef = useRef(false);
    useEffect(() => {
        if (!pathView || pathStartedRef.current) return;
        pathStartedRef.current = true;
        startPath(Math.floor(Date.now() % 100000) + 1);
    }, [pathView, startPath]);

    // 오른쪽 바의 "길 1·2·3": 성공 확률 순 상위 세 개. 누르면 그 길을 고르고 경로를 그린다(2026-09-08 오너).
    const ballsKey = useMemo(() => sim.balls.map((b) => `${b.id}:${b.r[0].toFixed(4)},${b.r[1].toFixed(4)}`).join("|"), [sim.balls]);
    // 탐색을 건 그 배치를 openSolver 가 한 번 찍는다. 예전엔 "탐색 중이면 지금 배치로 다시 찍기" 였는데,
    // 그러면 탐색 도중 공을 옮겼을 때 솔버가 본 적도 없는 배치가 '푼 배치' 로 기록돼(2026-09-09 검토),
    // 결과가 도착하면 옛 배치의 길이 새 배치 위에 그대로 그려졌다 — 적구를 스치지도 않는 길을 카드가 설명한다.
    const solvedKeyRef = useRef("");
    // 찾은 길은 그때의 배치에만 유효하다 — 공이 움직이면(샷·손으로 옮김) 목록을 비운다
    const pathStale = solvedKeyRef.current !== ballsKey;
    // 찾은 길(성공 확률 순). 길 찾기 화면은 상위 셋, 대전은 1등 하나만 쓴다 — 아래에서 나눈다.
    const rankedAll = useMemo(
        () => (pathStale ? [] : rankedPaths(solver.result?.candidates ?? [], PATH_TOP_N)),
        [pathStale, solver.result],
    );
    const paths = pathView ? rankedAll : [];
    const [pathPick, setPathPick] = useState(0);
    useEffect(() => { setPathPick(0); }, [solver.result]);
    const pickedPath = paths[pathPick] ?? paths[0] ?? null;

    /** sheet: false 면 결과 시트를 열지 않고 탐색만 한다(대전의 길 찾기 — 오른쪽 바에 길 하나만 뜬다). */
    const openSolver = useCallback((opts?: { sheet?: boolean }) => {
        if (!sim.config || !sim.params || sim.phase !== "aim") return;
        solvedKeyRef.current = ballsKey;
        setSolverOpen(opts?.sheet !== false);
        void solver.solve({
            balls: sim.balls, cueBallId: sim.cueBallId, gameType: sim.config.gameType, rules: sim.config.rules,
            params: sim.params, seed: solverSeedRef.current,
            opening: sim.session ? isOpeningShot(sim.session, sim.balls) : false,
            // 길 찾기는 전용 화면이라 예산을 넉넉히 준다 — 전수 탐색이 더 돌고 오차 허용(여유) 추정이 안정된다
            ...(pathViewRef.current ? { budgetMs: PATH_BUDGET_MS } : {}),
        });
    }, [sim.config, sim.params, sim.phase, sim.balls, sim.cueBallId, sim.session, solver, ballsKey]);
    const retrySolver = useCallback(() => { solverSeedRef.current += 1; openSolver(); }, [openSolver]);
    // 길 찾기에서 결과가 나오면 이 기기의 "찾아본 배치" 수를 올린다(서버에 남기지 않는다)
    const pathCountedRef = useRef("");
    useEffect(() => {
        if (!pathView || solver.status !== "done") return;
        const key = `${solver.result?.candidates.length ?? 0}:${sim.balls.map((b) => b.r.join(",")).join("|")}`;
        if (pathCountedRef.current === key) return;
        pathCountedRef.current = key;
        bumpPathCount(safeLocalStorage());
    }, [pathView, solver.status, solver.result, sim.balls]);
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
    // 길을 고르면 큐대가 그 길로 향한다 — 입력(방향·세기·당점)을 그 샷으로 넣는다(2026-09-08 오너). 샷 버튼은 그대로 친다.
    // 길 찾기 화면과 대전의 길 버튼이 같은 적용부를 쓴다.
    const applyPath = useCallback((c: SolveCandidate | null) => {
        if (!c || !sim.config) return;
        const next = { phi: c.input.phi, V0: c.input.V0, a: c.input.a, b: c.input.b, theta: 0 };
        appliedInputRef.current = next;   // 내가 조준을 바꾸면 풀린다(아래 효과)
        actions.setInput(next);
        setSolverPreview({ candidate: c, paths: buildPreviewPaths(c.result, { cueBallId: sim.cueBallId, gameType: sim.config.gameType }) });
    }, [sim.config, sim.cueBallId, actions]);
    const onPickPath = useCallback((i: number) => {
        setPathPick(i);
        applyPath(paths[i] ?? null);
    }, [paths, applyPath]);
    // 길을 찾으면 1등 길을 바로 고른다 — 큐대가 그 길을 향하고 카드가 채워진다
    const autoPickedRef = useRef<unknown>(null);
    useEffect(() => {
        if (!pathView || paths.length === 0 || autoPickedRef.current === solver.result) return;
        autoPickedRef.current = solver.result;
        onPickPath(0);
    }, [pathView, paths, solver.result, onPickPath]);
    // 길 찾기의 샷 버튼: 고른 길을 그대로 친다(큐대 스트로크 뒤). 아직 길이 없으면 먼저 찾는다.
    onShootPathRef.current = () => {
        if (pickedPath) {
            actions.setInput({ phi: pickedPath.input.phi, V0: pickedPath.input.V0, a: pickedPath.input.a, b: pickedPath.input.b, theta: 0 });
            setSolverPreview(null);
            beginShot();
        } else openSolver();
    };
    // 배치가 바뀌면(샷·되돌리기·공 옮기기) 후보는 낡은 것 — 경로를 끄고 시트를 닫는다
    useEffect(() => { appliedInputRef.current = null; setSolverPreview(null); setSolverOpen(false); }, [sim.balls]);

    /**
     * 길을 고른 뒤 **내가 조준을 바꾸면 그 길은 풀린다**(2026-09-16 오너: "방향을 바꾸면 해제되어야 하는데 계속 그 길을 보여준다").
     * 그린 경로는 '이 입력으로 치면 이렇게 간다' 는 그림이라, 입력이 달라지면 더는 맞는 그림이 아니다.
     * applyPath 는 후보 값을 반올림 없이 그대로 넣으므로 정확히 같은지만 보면 된다.
     * 시트에서 손가락만 올려 본 미리보기(onSolverPreview)는 적용한 적이 없어 ref 가 비어 있고, 여기서 건드리지 않는다.
     */
    useEffect(() => {
        const ap = appliedInputRef.current;
        if (!ap || sameCueInput(sim.input, ap)) return;
        appliedInputRef.current = null;
        setSolverPreview(null);
    }, [sim.input]);
    // 길 찾기: 결과가 오면 시트를 스스로 닫는다. 목록을 뺀 뒤로 시트가 할 일은 '찾는 중' 뿐인데,
    // 열린 채로 두면 검은 막(Radix 모달)이 정작 안내가 가리키는 오른쪽 바와 아래 카드를 덮는다(2026-09-09 검토).
    // 길을 못 찾은 경우도 아래 카드가 '이 배치에선 길이 없어요' 로 받아 준다.
    useEffect(() => { if (pathView && solver.result) setSolverOpen(false); }, [pathView, solver.result]);
    // 연습·드릴(채점 뒤)에서만. 기록 세션·대전엔 넘기지 않는다.
    const solverAllowed = sim.mode === "solo" && !sim.record && !drillLocked;
    /**
     * 대전 중 길 찾기 — **관리자 전용**(2026-09-16 오너). 오른쪽 바에 성공 확률이 가장 높은 길 하나만 띄우고,
     * 그 버튼을 누르면 큐대가 그 길을 향한다(입력을 그대로 넣는다). 샷은 평소처럼 치면 그 길로 이어진다.
     *
     * 왜 관리자만인가: 조준 보조라 상대는 알 수 없다. 테스트·시연용이라 한 사람에게만 연다.
     * 한계: 이 판정은 화면 쪽에서만 한다(서버가 막지 않는다) — 솔버는 브라우저에서 도는 계산이라
     * 마음먹으면 누구나 밖에서 같은 계산을 할 수 있고, 샷 자체는 서버가 다시 시뮬레이션해 검증한다.
     * 즉 '기록을 속이는 길' 이 아니라 '조준을 도와주는 화면' 이다.
     */
    const isAdmin = member?.role === "super_admin" || member?.role === "admin";
    const matchSolverAllowed = isAdmin && isMatch && !pathView;
    // 대전에선 1등 길 하나만 쓴다. 공이 움직이면(pathStale) 비어 다시 '찾기' 로 돌아간다.
    const matchPath = matchSolverAllowed ? (rankedAll[0] ?? null) : null;

    // 대전(관리자): 내 차례가 되면 배치마다 한 번 알아서 찾아 둔다 — 오른쪽 바에 길이 이미 떠 있게.
    // 누를 것은 "길" 하나뿐이고, 누르면 큐대가 그 길로 향한다(자동으로 조준까지 바꾸지는 않는다).
    const autoSolvedRef = useRef("");
    useEffect(() => {
        if (!matchSolverAllowed || sim.phase !== "aim") return;
        if (autoSolvedRef.current === ballsKey || solver.status === "running") return;
        autoSolvedRef.current = ballsKey;
        openSolver({ sheet: false });
    }, [matchSolverAllowed, sim.phase, ballsKey, solver.status, openSolver]);


    const onSetupStart = useCallback((config: SimSetupConfig, opts: { record: boolean }) => {
        setDrill(null);
        setSetupOpen(false);
        setLog(EMPTY_LOG);
        setBanner(null);
        actions.start(config, { record: opts.record });
    }, [actions]);

    const onSetupOpenChange = useCallback((open: boolean) => {
        setSetupOpen(open);
        // 세션 없이 설정을 닫으면 돌아간다 — 진입 화면에서 열었으면 진입 화면으로(setupOpen=false 만), 바로 열렸으면(cfg 깨짐) 대시보드로
        if (!open && sim.phase === "setup" && !entryView) navigate(EXIT_PATH);
    }, [navigate, sim.phase, entryView]);

    const finished = sim.session?.status === "finished";
    const endOpen = sim.phase === "finished" && !endDismissed && !exitOpen;
    const showLobby = lobby && sim.phase === "setup";
    const showDrills = drillsView && sim.phase === "setup";
    const showDash = dashView && sim.phase === "setup";
    const showRooms = roomsView && sim.phase === "setup";
    const showRank = rankView && sim.phase === "setup";
    const showEntry = entryView && sim.phase === "setup" && !setupOpen;
    const endSubtitle = sim.match
        ? endReasonText({ status: sim.match.status, endReason: sim.match.endReason, winnerIndex: sim.match.winnerIndex, hostName: sim.match.names[0], guestName: sim.match.names[1] }, t)
        : null;
    const aiming = sim.phase === "aim";
    // 재생(내 샷·상대 샷 따라잡기)·상대 차례·시작 전엔 조작 층을 통째로 흐린다. 상단 띠·칩·결과 배너는 남는다.
    const controlsHidden = sim.phase === "shooting" || sim.phase === "waiting" || sim.phase === "setup";
    const thetaDeg = elevationDeg(sim.input.theta);
    const canResign = isMatch && !!sim.match?.canResign && sim.phase !== "finished";

    // ── 툴바 묶음: 조준 도구 / 토글·동작 / 나가기(대전은 기권). 되돌리기는 독, 공유는 왼쪽 위 알약 — 툴바는 최대 9개 ──
    // 길 찾기 화면엔 당점·큐 각이 없다 — 해법이 값을 준다(2026-09-08 오너)
    const railAim: RailItem[] = pathView ? [] : [
        { id: "spin", label: t("sim.controls.spin"), icon: <SpinIcon a={sim.input.a} b={sim.input.b} />, onPress: () => openSpinSheet("spin"), disabled: !aiming },
        {
            id: "elevation", label: t("sim.rail.elevation"), icon: <ElevationIcon />, onPress: () => openSpinSheet("elevation"),
            active: thetaDeg > 0, caption: thetaDeg > 0 ? `${thetaDeg}°` : null, disabled: !aiming,
        },
    ];
    if (solverAllowed && !pathView) railAim.push({ id: "solver", label: t("sim.solver.button"), icon: <SolverIcon />, onPress: () => openSolver(), disabled: !aiming });
    // 대전(관리자): 찾기 → 결과가 오면 같은 자리에 1등 길 칩. 칩을 누르면 큐대가 그 길로 향한다.
    if (matchSolverAllowed) {
        railAim.push(matchPath
            ? {
                id: "match-path", label: t("sim.path.nth").replace("{n}", "1"), hint: t("sim.path.nth").replace("{n}", "1"),
                icon: <PathChip rank={1} pct={successPct(matchPath)} active={solverPreview !== null} />, bare: true,
                active: solverPreview !== null, onPress: () => applyPath(matchPath), disabled: !aiming,
            }
            : {
                id: "match-path-find", label: t("sim.solver.button"), icon: <SolverIcon />,
                onPress: () => openSolver({ sheet: false }), disabled: !aiming || solver.status === "running",
                caption: solver.status === "running" ? "…" : null,
            });
    }
    // 길 찾기 화면의 오른쪽 바: 찾은 길 1·2·3(성공률이 캡션) + 다시 찾기/무작위 배치. 당점·큐 각·이닝·소리는 여기서 쓸 일이 없어 뺀다.
    if (pathView) {
        if (paths.length > 0) {
            paths.forEach((c, i) => railAim.push({
                id: `path-${i}`, label: t("sim.path.nth").replace("{n}", String(i + 1)),
                hint: t("sim.path.nth").replace("{n}", String(i + 1)),
                icon: <PathChip rank={i + 1} pct={successPct(c)} active={pathPick === i} />, bare: true,
                active: pathPick === i, onPress: () => onPickPath(i), disabled: !aiming,
            }));
        }
        railAim.push({ id: "path-random", label: t("sim.path.random"), icon: <ResetIcon />, onPress: () => startPath(pathSeedRef.current + 1), disabled: sim.phase === "shooting" });
    }
    const railToggles: RailItem[] = [];
    if (is3c) railToggles.push({ id: "diamond", label: t("sim.diamond.toggleLabel"), hint: t("sim.diamond.toggle"), icon: <DiamondIcon />, toggle: true, active: diamondOn, onPress: onToggleDiamond });
    if (viewSupported) railToggles.push({ id: "view", label: t("sim.hud.view3d"), icon: <CubeIcon />, toggle: true, active: cameraView === "player", onPress: onToggleView });
    if (!pathView) railToggles.push({ id: "sound", label: muted ? t("sim.hud.unmute") : t("sim.hud.mute"), icon: <SoundIcon muted={muted} />, toggle: true, active: false, dim: muted, onPress: onToggleMute });
    if (!pathView) railToggles.push({ id: "innings", label: t("sim.controls.innings"), icon: <ListIcon />, onPress: onInnings });
    if (drillReset) railToggles.push({ id: "reset", label: t("sim.drill.reset"), icon: <ResetIcon />, onPress: onRestart });
    const railBottom: RailItem[] = [];
    // 길 찾기에선 나가기가 머리글의 닫기 알약이다(툴바엔 두지 않는다 — 오너)
    if (!pathView) railBottom.push(canResign
        ? { id: "resign", label: t("sim.match.resign"), icon: <FlagIcon />, onPress: () => setResignOpen(true) }
        : { id: "exit", label: t("sim.controls.exit"), icon: <CloseIcon />, onPress: onExitRequest });
    const railGroups = [railAim, railToggles, railBottom];
    // compact: 짧은 화면이거나 md 툴바가 열에 안 들어갈 때(측정 전엔 기본)
    const compact = tableH > 0 && (tableH < COMPACT_BELOW_PX || !railFitsMd(tableH, [railAim.length, railToggles.length, railBottom.length], RIGHT_FIXED_MD));

    const chipNeutral = "rk-chip bg-surface-1 border border-surface-line text-ink-3 max-w-full truncate";
    const chipBrand = "rk-chip bg-brand text-brand-fg max-w-full truncate";

    return (
        <div
            /* 테이블 화면은 검은 배색(2026-09-17). 로비·랭킹은 2026-09-08 부터 sim-dark 인데 이 화면만 안 따라와
               앱 테마를 그대로 썼다 — 밝은 테마에서 초록 펠트 위아래만 하얬다. sim-table 은 그 위의 강조색. */
            className="sim-dark sim-table fixed inset-0 flex flex-col bg-surface-1 text-ink-1 select-none overflow-hidden"
            style={{
                paddingTop: "env(safe-area-inset-top)",
                paddingBottom: "env(safe-area-inset-bottom)",
                paddingLeft: "env(safe-area-inset-left)",
                paddingRight: "env(safe-area-inset-right)",
            }}
        >
            <div className="flex-1 min-h-0 w-full max-w-[640px] mx-auto flex flex-col">
                {/* 길 찾기 화면에선 머리글의 "길 찾기" 알약이 곧 해법 찾기 버튼(이닝 시트 대신) */}
                <TopBar
                    session={sim.session} config={sim.config} phase={sim.phase} names={names}
                    record={sim.record} offline={isMatch ? false : sim.offline} syncing={sim.syncing} queued={sim.queued}
                    drillName={drill ? t(drill.drill.nameKey) : null}
                    hideStatus={pathView}
                    hideSummary={pathView}
                    onClose={pathView ? onExitRequest : undefined}
                    onSummary={pathView ? openSolver : onInnings}
                    clock={clock}
                    matchHeader={headerPlayers ? { players: headerPlayers, onExit: onExitRequest } : null}
                />

                {/* 테이블 영역: 남은 높이 전부. 렌더러·오버레이는 absolute 마운트(tableRef)에, 조작·칩은 그 형제로 얹힌다. */}
                <div className="relative flex-1 min-h-0 overflow-hidden bg-surface-3">
                    <div
                        ref={tableRef}
                        data-sim-table=""
                        className="absolute inset-0 touch-none bg-surface-3"
                        onPointerDown={onPointerDown}
                        onPointerMove={onPointerMove}
                        onPointerUp={onPointerEnd}
                        onPointerCancel={onPointerEnd}
                        onLostPointerCapture={onLostPointerCapture}
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
                        {/* 대전 알림은 헤더에서 여기로 내려왔다(2026-09-16 헤더 재설계) — 헤더는 "누가 치고 시간이 얼마 남았나"만 말한다.
                            관전자 수는 여기 없다 — 대화창 손잡이 옆 👀 하나만 둔다(2026-09-21 오너: "거기만 보여도 될 것 같아"). */}
                        {isMatch && (sim.session?.pendingWinner ?? null) !== null && (
                            <span className="rk-chip bg-ball-yellow text-ink-1 font-bold max-w-full truncate" title={t("sim.match.finalInningHint")}>
                                {t("sim.match.finalInning")}
                            </span>
                        )}
                        {/* 오간 한마디(2026-09-16). 이 열은 이미 pointer-events-none 이라 글자 위 터치도 조준으로 지나간다 —
                            **auto 를 붙이지 마라.** 조준 중에도 보인다: 상대 말이 안 보이면 대화가 아니라 편지가 된다. */}
                        {/* 상대 차례엔 아래 대화창이 같은 말을 계속 보여 주므로 여기는 조준·재생 중에만 */}
                        {isMatch && sim.match && sim.phase !== "waiting" && (
                            <MatchChatLog lines={chatLines} myIndex={sim.match.myIndex} now={chatNow} />
                        )}
                        {/* 조준 중 1탭 문구(2026-09-16). 하단 입력줄은 상대 차례에만 있는데, 상대가 빗나간 직후
                            "아깝다"를 보내고 싶은 순간이 바로 내 차례다. 읽은 자리 바로 아래에서 답한다. */}
                        {/* 내 차례 대화(2026-09-18). 샷 버튼 옆이 아니라 여기 — 대화하려다 샷 버튼을 잘못 누르면 샷이 나가고 되돌릴 수 없다.
                            여기는 상대 한마디가 뜨는 바로 그 자리라 읽은 곳에서 답한다. */}
                        {isMatch && sim.match?.status === "playing" && sim.phase === "aim" && (
                            <MatchChatToggle open={aimChatOpen} unread={chatUnread} onToggle={() => setAimChatOpen((v) => !v)} />
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
                        {/* 채점 중엔 힌트를 곁에 둔다 — 예전엔 목록에만 있어서 정작 칠 때는 안 보였다(2026-09-09 오너) */}
                        {drill && drillLocked && sim.phase === "aim" && (
                            // 다른 칩과 달리 자르지 않는다 — 잘린 힌트는 쓸모가 없다(한국어 밖에서 특히 길다).
                            <span className={cn(chipNeutral.replace(" truncate", ""), "whitespace-normal text-left leading-snug")}>
                                {t(drill.drill.hintKey)}
                            </span>
                        )}
                        {!drill && sim.canPlace && sim.session && sim.session.shotCount === 0 && (
                            <span className={cn(chipNeutral, pathView && "hidden")}>{t("sim.hud.placeHint")}</span>
                        )}
                        {reality && sim.phase === "aim" && <span className={chipNeutral}>{t("sim.hud.realityChip")}</span>}
                        {risk && sim.phase === "aim" && (
                            <span role="status" className={cn(chipNeutral, "inline-flex items-center gap-1", risk.level === "warn" && "text-ink-1")}>
                                <WarnIcon className="w-4 h-4 shrink-0" />
                                {t(RISK_KEYS[risk.kind])}
                            </span>
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
                        {pathView ? <div className="flex-1" /> : <PowerRail V0={sim.input.V0} disabled={!aiming} onChange={onPower} compact={compact} className="flex-1" />}
                        {/* ± 0.05 m/s: 36 px 원 두 개, 사이 8 px(탭 대상 간격 규칙) */}
                        <div className={cn("shrink-0 flex gap-2", pathView && "hidden")}>
                            <HoldButton label={t("sim.controls.powerDown")} disabled={!aiming} onTick={onPowerDown} className="h-9 w-9 rounded-pill">
                                <MinusIcon />
                            </HoldButton>
                            <HoldButton label={t("sim.controls.powerUp")} disabled={!aiming} onTick={onPowerUp} className="h-9 w-9 rounded-pill">
                                <PlusIcon />
                            </HoldButton>
                        </div>
                        {!pathView && !(isMatch && sim.phase === "finished") && (
                            <ShotButton phase={sim.phase} onShoot={onShoot} onRestart={onRestart} compact={compact} className="shrink-0" />
                        )}
                    </div>

                    {/* 왼쪽 아래: 두께 독(둘째 줄에 되돌리기) */}
                    {/* 길 찾기 화면에선 두께 독 대신 "가장 잘 들어가는 길" 카드(2026-09-08 오너) — 조준은 해법을 적용해서 맞춘다 */}
                    {pathView ? (
                        <BestPathCard
                            status={pathStale ? "idle" : solver.status} progress={solver.progress} candidate={pickedPath}
                            maxOffset={DEFAULT_CUE.maxOffset} onSearch={openSolver} onShoot={onShootPath} shooting={sim.phase === "shooting"}
                            className={cn(
                                "absolute left-2 right-2 bottom-2 z-[3] transition-opacity duration-150",
                                controlsHidden ? "opacity-0 pointer-events-none" : "opacity-100",
                            )}
                        />
                    ) : (
                        <ThicknessDock
                            active={active} disabled={!aiming}
                            onThickness={onThickness} onNudge={onNudge}
                            spin={{ a: sim.input.a, b: sim.input.b }} onSpinVertical={onSpinVertical}
                            onUndo={undoInDock ? onUndo : null}
                            className={cn(
                                "absolute left-2 bottom-2 z-[3] transition-opacity duration-150",
                                // 내 차례 대화창을 열면 그 자리를 대화창이 덮는다 — 반쯤 비친 버튼이 남지 않게 누를 수 없게 한다
                                controlsHidden || aimChatOpen ? "opacity-0 pointer-events-none" : "opacity-100",
                            )}
                        />
                    )}

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
                    {/*
                      * 상대 차례 블록. **조건에 phase 가 들어가는 것이 중요하다** — 내 조준(aim) 중에 이 띠가 살아 있으면
                      * 정확히 같은 자리(bottom, 높이 DOCK_HEIGHT 대역)에 있는 두께 독·미세 방향조절 키를 덮는다(2026-09-15 사고).
                      * 재생(shooting)까지 포함하는 이유는 상대가 연속 득점할 때 입력칸과 키보드를 살려 두기 위해서다.
                      */}
                    {/*
                      * 세로 이닝 점수판(2026-09-18 안 A) — 조작 버튼이 사라져 비는 오른쪽 띠에 앉는다. 누를 수 없다(같은 자리를
                      * 내 차례엔 조작 버튼이 쓴다). 아래 끝은 대화창 위에서 멈추고, 넘치면 오래된 이닝이 위로 잘린다.
                      * 한계: 이 화면이 열린 뒤의 샷만 쌓인다(이닝 시트와 같다) — 도중에 들어오면 그 전 이닝은 비어 있다.
                      */}
                    {isMatch && sim.match && sim.session && sim.session.players.length === 2 && (sim.phase === "waiting" || sim.phase === "shooting") && !chatExpanded && (
                        <MatchScoreStrip
                            /* 아래 끝 = 대화창이 가장 커졌을 때(4줄 + 승리 주장 버튼)의 위쪽 — 375 폭에서 카드(가운데 320)의
                               오른쪽 끝이 이 띠(오른쪽 64)와 36 px 겹치므로 세로로 비켜 둔다. 키보드가 뜨면 대화창이 통째로 올라와
                               겹치니 그동안은 숨긴다(hide-on-keyboard) — 쓰는 동안엔 대화가 먼저다. */
                            className="hide-on-keyboard absolute right-1 top-2 z-[3] w-[60px]"
                            style={{ bottom: DOCK_HEIGHT + 150 }}
                            rows={scoreRows}
                            order={[sim.match.myIndex, sim.match.myIndex === 0 ? 1 : 0]}
                            balls={[
                                sim.session.players[sim.match.myIndex]?.cueBallId === "yellow" ? "yellow" : "white",
                                sim.session.players[sim.match.myIndex === 0 ? 1 : 0]?.cueBallId === "yellow" ? "yellow" : "white",
                            ]}
                        />
                    )}
                    {/*
                      * 미니 대화창(2026-09-18). 상대 차례·재생 중엔 늘, 내 차례엔 말풍선을 눌러 열었을 때만.
                      * **조건에 phase 가 들어가는 것이 중요하다** — 조준 중에 저절로 떠 있으면 같은 자리의 두께 독·미세 방향조절을
                      * 덮는다(2026-09-15 사고). 내 차례 대화는 사용자가 직접 연 경우라 그동안 독을 감춘다(아래 ThicknessDock).
                      */}
                    {isMatch && sim.match && (sim.phase === "waiting" || sim.phase === "shooting" || (sim.phase === "aim" && aimChatOpen)) && (
                        <div
                            className={cn(
                                "absolute inset-x-0 z-[3] flex flex-col gap-2 pointer-events-none",
                                /*
                                 * 내 차례엔 두께 독 자리(왼쪽)에만 앉는다. 가운데 340 px 로 두면 오른쪽 샷 버튼(x 303~367)의 왼쪽을 덮고
                                 * 오른쪽 10 px 만 삐져나와 눌리는 반쯤 가려진 버튼이 된다(실측). 샷 버튼은 온전히 남겨 바로 칠 수 있게
                                 * 하고(치면 대화창은 저절로 닫힌다), 오른쪽을 78 px 비워 탭 간격 하한 6 px 을 지킨다.
                                 */
                                sim.phase === "aim" ? "items-start pl-2 pr-[78px]" : "items-center px-4",
                            )}
                            /*
                             * 키보드 위로 띄운다. 앱(네이티브)은 웹뷰를 일부러 안 줄이므로(keyboardAvoid 의 setResizeMode "none")
                             * bottom 만 주면 입력줄이 키보드 **밑에 깔린다** — 2026-09-16 오너 제보의 원인이 이것이다.
                             * 웹·구형 APK 는 뷰포트가 줄어 변수가 0 이고 max() 가 평소 값을 고른다. 두 경로 다 맞는다.
                             * ⚠ bottom 에 transition 을 걸지 마라 — 걸면 크로미움이 변수 변경을 bottom 에 반영하지 않아
                             *   키보드가 입력줄을 그대로 덮는다(2026-08-22 크루 채팅에서 실측).
                             */
                            style={{ bottom: "max(0.75rem, calc(var(--keyboard-height, 0px) + 0.5rem))" }}
                        >
                            {/* 대화 줄과 입력을 한 상자에(오너: "분리될 필요가 없네"). 높이 상한 = 당구 천을 덮지 않는 값.
                                대화 줄은 결과 배너가 뜨는 동안·재생 중엔 접는다(배너와 겹치지 않게, 굴러가는 공을 덜 가리게) —
                                입력줄은 남겨 쓰던 글과 키보드가 살아 있다. 자리 비움은 시계가 아직 안 돌 때만. */}
                            <MatchMiniChat
                                lines={chatLines} myIndex={sim.match.myIndex} opponentName={sim.match.opponentName}
                                draft={chatDraft} onDraft={setChatDraft}
                                onSend={onSendChat} onSendCode={onSendChatCode}
                                quickOpen={chatQuickOpen} onQuickOpen={setChatQuickOpen}
                                /* 펼친 동안은 사용자가 대화를 읽는 중이라 배너·재생 때도 줄을 접지 않는다 */
                                showLines={chatExpanded || (!bannerVisible && sim.phase !== "shooting")}
                                maxHeight={chatBoxMax}
                                expanded={chatExpanded} onExpanded={setChatExpanded}
                                myTurn={sim.phase === "aim" ? { seconds: clock?.mine ? clock.seconds : null, onClose: () => setAimChatOpen(false) } : null}
                                away={sim.phase === "waiting" && !clock && sim.match.opponentAway}
                                onClaim={sim.phase === "waiting" && sim.match.canClaim ? () => { void onClaim(); } : null}
                                watchers={sim.match.watchers ?? 0}
                                disabled={!sim.match.canChat}
                            />
                        </div>
                    )}
                    {coachOpen && !pathView && sim.phase === "aim" && sim.mode === "solo" && <CoachHint onClose={closeCoach} />}
                    {!coachOpen && realityOpen && reality && sim.phase === "aim" && <RealityHint onClose={closeReality} />}
                    {/* 결과 배너: 두께 독 위, 오른쪽 열 왼쪽 — 테이블 아래쪽 가운데 */}
                    <div className="absolute left-0 right-[60px] top-0 z-[3] pointer-events-none" style={{ bottom: DOCK_HEIGHT + 8 }}>
                        {/* 길 찾기는 점수를 세는 화면이 아니라 결과 배너(득점 +1)를 띄우지 않는다(2026-09-08 오너) */}
                        <OutcomeBanner outcome={banner?.outcome ?? null} visible={bannerVisible && !pathView} sub={readoutText} />
                    </div>
                    {/* 시작 인사(2026-09-15 라포): 누가 누구와, 다마수 몇으로, 몇 번째 만남인지. 누르면 바로 닫힌다. */}
                    {isMatch && sim.match && sim.session && (
                        <MatchIntro
                            matchId={sim.match.id} names={names} myIndex={sim.match.myIndex}
                            targets={[sim.session.players[0]?.target ?? 0, sim.session.players[1]?.target ?? 0]}
                            handicap={sim.match.handicap}
                            visible={introFor === sim.match.id}
                            onDismiss={() => setIntroFor(null)}
                        />
                    )}
                    {/* 굿샷 권유(2026-09-15 라포): 상대가 득점한 직후에만. 조준을 가리지 않게 테이블 아래쪽에 잠깐. */}
                </div>
            </div>

            {/* 드릴·로비 전체 화면: 머리글(제목 + 닫기 알약)은 각 패널이 로비와 같은 꼴로 그린다. 폭·여백은 여기서 한 번만. */}
            {showDrills && (
                <div className="sim-dark fixed inset-0 z-[5] overflow-y-auto bg-[var(--surface-0)]" style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
                    <div className="w-full max-w-[420px] mx-auto px-5 pt-4 pb-8">
                        <DrillPanel onPlay={onPlayDrill} myMemberId={member?.id} onClose={() => navigate(EXIT_PATH)} />
                    </div>
                </div>
            )}
            {showEntry && (
                <div className={cn("fixed inset-0 z-[5] overflow-y-auto", ENTRY_STYLE.page)} style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
                    <SimEntry
                        onSingle={() => setSetupOpen(true)}
                        onDrills={() => navigate("/online-game?drills=1")}
                        onMulti={() => navigate("/online-game?lobby=1")}
                        onJoin={() => navigate("/online-game?lobby=1&tab=join")}
                        onRooms={() => navigate("/online-game?rooms=1")}
                        onRank={() => navigate("/online-game?rank=1")}
                        onPath={() => navigate("/online-game?path=1")}
                        onDash={() => navigate("/online-game?dash=1")}
                        onClose={() => navigate(EXIT_PATH)}
                    />
                </div>
            )}
            {showRooms && (
                <div className="sim-dark fixed inset-0 z-[5] overflow-y-auto bg-[var(--surface-0)]" style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
                    <RoomList
                        onOpen={openMatch}
                        onWatch={(id) => navigate(`/online-game?watch=${id}`)}
                        onCreate={() => navigate("/online-game?lobby=1&public=1")}
                        onEnterMine={() => navigate("/online-game?lobby=1")}
                        onClose={() => navigate("/online-game", { replace: true })}
                        autoJoinId={params.get("join") ?? undefined}
                        myHandi={member ? { handi3c: member.handi3c, handi4c: member.handi4c } : undefined}
                    />
                    {/* 끝난 공개 대전 다시보기. 게임 중인 방은 위 목록에 '게임 중 · 관전'으로 함께 뜬다. */}
                    <div className="px-4 pb-8">
                        <WatchList onOpen={(id) => navigate(`/online-game?watch=${id}`)} />
                    </div>
                </div>
            )}
            {showRank && (
                <div className="sim-dark fixed inset-0 z-[5] overflow-y-auto bg-[var(--surface-0)]" style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
                    <RankPage onClose={() => navigate("/online-game", { replace: true })} />
                </div>
            )}
            {/* 관전·다시보기: 읽기 전용 화면을 위에 덮는다(대전 화면·시뮬 세션과 완전히 분리) */}
            {watchId && (
                <div className="sim-dark fixed inset-0 z-[6] overflow-y-auto bg-[var(--surface-0)]" style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
                    <WatchPage matchId={watchId} />
                </div>
            )}
            {joinCode !== "" && sim.phase === "setup" && (
                <div className="fixed inset-0 z-[5] bg-surface-1 flex items-center justify-center" role="status">
                    <p className="text-[14px] font-semibold text-ink-2">{t("sim.match.joiningInvite")}</p>
                </div>
            )}
            {showDash && (
                <div className="sim-dark fixed inset-0 z-[5] overflow-y-auto bg-[var(--surface-0)]" style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
                    <SimDash
                        initialSection={dashSection}
                        onClose={() => navigate("/online-game", { replace: true })}
                        onOpenMatch={openMatch}
                        onPractice={() => { navigate("/online-game", { replace: true }); setSetupOpen(true); }}
                        onDrills={() => navigate("/online-game?drills=1")}
                        onLobby={() => navigate("/online-game?lobby=1")}
                        onRank={() => navigate("/online-game?rank=1")}
                    />
                </div>
            )}
            {showLobby && (
                <div className="sim-dark fixed inset-0 z-[5] overflow-y-auto bg-[var(--surface-0)]" style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
                    <MatchLobby
                        initialTab={lobbyTab} initialPublic={lobbyPublic} initialCode={lobbyCode || undefined}
                        onStarted={openMatch} onCreated={() => { void queryClient.invalidateQueries({ queryKey: MATCH_LIST_QUERY_KEY }); }}
                        onClose={() => navigate("/online-game", { replace: true })}
                    />
                    {/* 내 대전 목록은 대시보드의 대전 섹션으로 옮겼다(2026-09-08 오너) — 로비는 만들기·참가만 */}
                    <div className="w-full max-w-[420px] mx-auto px-5 pb-8">
                        <button type="button" onClick={() => navigate("/online-game?dash=1&sec=matches", { replace: true })} className="w-full h-12 rounded-tile border border-surface-line bg-surface-1 text-[14px] font-semibold text-ink-2 active:bg-surface-3">
                            {t("sim.dash.myMatchesLink")}
                        </button>
                    </div>
                </div>
            )}
            <SimSetupDialog open={setupOpen} onOpenChange={onSetupOpenChange} onStart={onSetupStart} />
            <SpinSheet
                open={spinSheet.open} tab={spinSheet.tab} onOpenChange={onSpinSheetOpen} onTab={onSpinSheetTab}
                a={sim.input.a} b={sim.input.b} theta={sim.input.theta} cueBallId={sim.cueBallId} disabled={!aiming}
                onSpin={onSpin} onElevation={onElevation}
            />
            <SolverSheet
                titleKey={pathView ? "sim.path.title" : undefined}
                descKey={pathView ? "sim.path.desc" : undefined}
                pickInRail={pathView}
                open={solverOpen}
                // 길 찾기에선 닫아도 탐색을 이어 간다 — 목록을 뺀 뒤로 "닫기" 가 오른쪽 바로 가는 기본 동작이 되어서,
                // 여기서 취소하면 사용자가 모르는 채 탐색이 잘린다(예산이 있어 알아서 끝난다). 멈추려면 시트의 중단 버튼.
                onOpenChange={(o) => { if (!o && !pathView) solver.cancel(); setSolverOpen(o); }}
                status={solver.status} progress={solver.progress}
                candidates={solver.result?.candidates ?? []}
                onApply={onSolverApply} onPreview={onSolverPreview}
                onCancel={solver.cancel} onRetry={retrySolver}
            />
            <ResignConfirm open={resignOpen} onOpenChange={setResignOpen} busy={exiting} onConfirm={() => { void onResign(); }} />
            <InningSheet open={sheetOpen} onOpenChange={setSheetOpen} log={log} completed={completed} session={sim.session} names={names} phase={sim.phase} />
            <EndDialog
                open={endOpen} onOpenChange={(o) => { if (!o) setEndDismissed(true); }}
                session={sim.session} phase={sim.phase} names={names}
                record={sim.record} offline={isMatch ? false : sim.offline} mismatches={sim.mismatches} busy={exiting}
                onRestart={onRestart} onExit={() => { void exitNow(); }}
                onShare={canShare ? onShareEnd : undefined}
                subtitle={endSubtitle} hideRestart={isMatch}
                rapport={isMatch && sim.match ? (
                    <MatchEndRapport
                        matchId={sim.match.id}
                        myIndex={sim.match.myIndex}
                        onRematch={(id) => { setEndDismissed(true); navigate(`/online-game?match=${id}`, { replace: true }); }}
                    />
                ) : undefined}
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
