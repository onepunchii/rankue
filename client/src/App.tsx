import { Switch, Route, useLocation } from "wouter";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { AppDialogHost } from "@/components/AppDialog";
import { PrimarySportGate } from "@/components/hiq/sport/PrimarySport";
import { PresenceArrivals } from "@/components/hiq/presence/PresenceArrivals";
import { AppInstallSheet } from "@/components/hiq/AppInstallSheet";
import { HandoffRedeemer } from "@/components/hiq/HandoffRedeemer";
import { useAuth } from "@/hooks/useAuth";
import { AppSessionTracker } from "@/components/hiq/AppSessionTracker";
import { useGolfAccess } from "@/hooks/useGolfAccess";
import { goLoginPage } from "@/components/hiq/LoginGate";
import { LoginSheetHost } from "@/components/hiq/LoginSheet";
import { AttachPhoneSheetHost } from "@/components/hiq/AttachPhoneSheet";
import { VisitBeacon } from "@/components/hiq/VisitBeacon";
import { Tracker } from "@/components/hiq/Tracker";
import { NativePrompts } from "@/components/hiq/NativePrompts";
import { LiveMatchBanner } from "@/sim/match/LiveMatchBanner";
import { syncPushToken } from "@/lib/nativeBridge";
import NotFound from "@/pages/not-found";
import { useEffect, lazy, Suspense, type ComponentType, type FunctionComponent, type ReactNode } from "react";
import { useToast } from "@/hooks/use-toast";

// HiQ Pages
import HiqLanding from "@/pages/hiq/landing";
import KakaoCallback from "@/pages/hiq/kakao-callback";
import KakaoPreview from "@/pages/hiq/kakao-preview";
import HiqRegister from "@/pages/hiq/register";
import HiqDashboard from "@/pages/hiq/dashboard";
import HiqAdmin from "@/pages/hiq/admin";
import HiqScoreboard from "@/pages/hiq/game/[id]";
import HiqGameResult from "@/pages/hiq/game/result";
import HiqHistory from "@/pages/hiq/history";
import HiqRanking from "@/pages/hiq/ranking";
import HiqMenu from "@/pages/hiq/menu";
import HiqChatHub from "@/pages/hiq/chat-hub";
import HiqChatRoom from "@/pages/hiq/chat-room";
import HiqSettings from "@/pages/hiq/settings";
import HiqFriends from "@/pages/hiq/friends";
import HiqClub from "@/pages/hiq/club";
import HiqCreateClub from "@/pages/hiq/create-club";
import HiqClubDetail from "@/pages/hiq/club-detail";
import CrewHallOfFame from "@/pages/hiq/crew-hall-of-fame";
import HiqJoin from "@/pages/hiq/join";
import HiqCommunity from "@/pages/hiq/community";
import HiqCommunityPost from "@/pages/hiq/community-post";
import HiqWorldRanking from "@/pages/hiq/world-ranking";
import HiqWorldRankingCountry from "@/pages/hiq/world-ranking-country";
import HiqWorldRankingMovers from "@/pages/hiq/world-ranking-movers";
import HiqPba from "@/pages/hiq/pba";
import HiqPbaPlayer from "@/pages/hiq/pba-player";
import HiqPbaRecords from "@/pages/hiq/pba-records";
import HiqGolfRanking from "@/pages/hiq/golf-ranking";
import HiqGolfer from "@/pages/hiq/golfer";
import HiqWorldPlayer from "@/pages/hiq/world-player";
import GolfPlay from "@/golf/pages/GolfPlay";
import MiniGolfPlay from "@/golf/pages/MiniGolfPlay";
import GolfNewGame from "@/golf/pages/NewGame";
import GolfScorecard from "@/golf/pages/GamePage";
import GameResult from "@/golf/pages/GameResult";
import GolfPassport from "@/golf/pages/Passport";
import GolfCourseRanking from "@/golf/pages/CourseRanking";
import GolfElite60 from "@/golf/pages/Elite60";
import GolfCoursePage from "@/golf/pages/GolfCoursePage";
import GolfCourseHub from "@/golf/pages/GolfCourseHub";
import GolfBookingList from "@/golf/pages/BookingList";
import GolfMyBookings from "@/golf/pages/MyBookings";
import GolfProAm from "@/golf/pages/ProAm";
import MembershipExchange from "@/golf/pages/MembershipExchange";
import MembershipDetail from "@/golf/pages/MembershipDetail";
import GolfArcadePage from "@/golf/arcade/GolfArcadePage";
import GolfRangePage from "@/golf/field/RangePage";
import PartnerLogin from "@/pages/partner/login";
import PartnerDashboard from "@/pages/partner/dashboard";
import PartnerSettings from "@/pages/partner/settings";
import CreateTournament from "@/pages/partner/create-tournament";
import PartnerSubscription from "@/pages/partner/subscription";
import AdminDashboard from "@/pages/admin/dashboard";
import Privacy from "@/pages/privacy";
import AccountDelete from "@/pages/account-delete";
import Support from "@/pages/support";
import Terms from "@/pages/terms";
import About from "@/pages/about";
import Stores from "@/pages/stores";
import StoreListing from "@/pages/store-listing";
import StoreRegister from "@/pages/store-register";
import BriefingPage from "@/pages/briefing";
import StoreDetail from "@/pages/store-detail";
import SharedResult from "@/pages/hiq/shared-result";

import { StoreProvider } from "./contexts/StoreContext";
import { I18nProvider, useT } from "@/lib/i18n";
import { SportProvider } from "./contexts/SportContext";
import { TermsConsentProvider } from "@/components/hiq/TermsConsent";
import { DesktopFrame } from "@/components/hiq/DesktopFrame";

/**
 * 폰 기준(375~430px)으로 그려진 앱 화면을 데스크탑에서 중앙 448px로 고정하고,
 * 남는 좌우에 랭큐 콘텐츠를 채우는 껍데기를 씌운다. lg 미만에서는 아무 효과가 없다.
 *
 * 감싸는 화면: 대시보드·크루·기록·랭킹·친구·메뉴 같은 "모바일 앱 화면"만.
 * 감싸지 않는 화면과 그 이유 —
 *   /game/:id        가로모드 전용(LandscapeGuard)이 화면 전체를 쓴다
 *   /online-game     캔버스 전체화면
 *   /game/result     유일하게 md: 반응형을 쓰는 화면 — 뷰포트 기준이라 좁은 프레임 안에서 깨진다
 *   / /about /stores /store/:slug /support /privacy /account-delete /r/:id
 *                    이미 자체 반응형 레이아웃을 가진 공개 페이지
 *   /admin /admin/dashboard /partner/*   데스크탑 전용 레이아웃
 *   /golf/*          다크 테마의 별도 모듈 — 크림 껍데기와 톤이 맞지 않는다
 *   /club/:id /crew/:id/:tab?
 *                    루트가 `fixed inset-0` 전체화면 셸 + framer-motion drag(transform) 탭이라
 *                    DOM 을 감싸도 프레임을 뚫고 나온다. 페이지 구조부터 손대야 한다.
 *
 * ⚠️ 모듈 최상위에서 한 번만 만든다. 렌더마다 새로 만들면 컴포넌트 정체성이 바뀌어
 *    라우트를 오갈 때마다 페이지 전체가 언마운트/재마운트된다(상태·스크롤 유실).
 */
function framed<P extends object>(Page: ComponentType<P>, opts?: { wide?: boolean }): FunctionComponent<P> {
  const Framed: FunctionComponent<P> = (props) => (
    <DesktopFrame wide={opts?.wide}>
      <Page {...(props as P)} />
    </DesktopFrame>
  );
  Framed.displayName = `Framed(${Page.displayName || Page.name || "Page"})`;
  return Framed;
}

const FramedRegister = framed(HiqRegister);
const FramedDashboard = framed(HiqDashboard);
const FramedGolfRanking = framed(HiqGolfRanking);
const FramedGolfer = framed(HiqGolfer);
const FramedSettings = framed(HiqSettings);
const FramedFriends = framed(HiqFriends);
const FramedClub = framed(HiqClub);
const FramedCreateClub = framed(HiqCreateClub);
const FramedJoin = framed(HiqJoin);
const FramedHistory = framed(HiqHistory);
const FramedRanking = framed(HiqRanking);
const FramedMenu = framed(HiqMenu);
const FramedChatHub = framed(HiqChatHub);
const FramedChatRoom = framed(HiqChatRoom);
const FramedCommunity = framed(HiqCommunity);
const FramedCommunityPost = framed(HiqCommunityPost);
// 데이터 표 페이지들은 데스크탑에서 넓게 (사이드 패널 없이 중앙 720px)
const FramedWorldRanking = framed(HiqWorldRanking, { wide: true });
const FramedWorldRankingCountry = framed(HiqWorldRankingCountry, { wide: true });
const FramedWorldRankingMovers = framed(HiqWorldRankingMovers, { wide: true });
const FramedWorldPlayer = framed(HiqWorldPlayer, { wide: true });
const FramedPba = framed(HiqPba, { wide: true });
const FramedPbaPlayer = framed(HiqPbaPlayer, { wide: true });
const FramedPbaRecords = framed(HiqPbaRecords, { wide: true });

// 당구 대회(2026-09-24) — 허브·PBA 시즌/대회·UMB 대회. 공유 메타(shared/tournamentMeta)가 길어 메인 청크에서 뺀다.
const HiqTournaments = lazy(() => import("@/pages/hiq/tournaments"));
const HiqTournamentDetail = lazy(() => import("@/pages/hiq/tournament-detail"));
const tournamentsFallback = <div className="min-h-[100dvh] bg-surface-0" aria-busy="true" />;
const FramedTournaments = framed(() => <Suspense fallback={tournamentsFallback}><HiqTournaments /></Suspense>, { wide: true });
const FramedTournamentDetail = framed(() => <Suspense fallback={tournamentsFallback}><HiqTournamentDetail /></Suspense>, { wide: true });

// 푸시 토큰 서버 등록(syncPushToken)은 lib/nativeBridge.ts 로 옮겼다 — 네이티브 registration 이벤트도 같은 함수를 쓴다.

// 시뮬레이터 페이지는 물리 엔진·캔버스 렌더러를 포함해 메인 청크에서 분리한다.
const SimulatorPage = lazy(() => import("@/sim/SimulatorPage"));
function SimulatorLazy() {
  return (
    <Suspense fallback={<div className="min-h-[100dvh] bg-surface-1" aria-busy="true" />}>
      <SimulatorPage />
    </Suspense>
  );
}

// 당구 용어 사전(2026-09-24) — 본문(shared/billiardsTerms.ts)이 길어 메인 청크에서 뺀다. 페이지가 자체 max-w-2xl 레이아웃이라 프레임 없이.
const BilliardsTermsHub = lazy(() => import("@/pages/billiards-terms"));
const BilliardsTerm = lazy(() => import("@/pages/billiards-term"));
const termsFallback = <div className="min-h-[100dvh] bg-surface-0" aria-busy="true" />;
function BilliardsTermsRoute() {
  return <Suspense fallback={termsFallback}><BilliardsTermsHub /></Suspense>;
}
function BilliardsTermRoute() {
  return <Suspense fallback={termsFallback}><BilliardsTerm /></Suspense>;
}

// 골프 읽을거리(2026-10-05) — 준비물 체크리스트. 글이 길어 메인 청크에서 뺀다. 골프 공개 틀(CourseShell)이 어두운 바탕이라 기다리는 화면도 어둡게.
const GolfChecklist = lazy(() => import("@/golf/pages/GolfChecklist"));
const golfReadFallback = <div className="min-h-[100dvh] bg-[#0A0A0A]" aria-busy="true" />;
function GolfChecklistRoute() {
  return <Suspense fallback={golfReadFallback}><GolfChecklist /></Suspense>;
}
// 조건으로 찾는 골프장 목록(2026-10-05) — 2인 플레이 · 노캐디 · 3인 플레이. 공개 페이지(로그인 없이 열린다).
const GolfFind = lazy(() => import("@/golf/pages/GolfFind"));
function GolfFindRoute() {
  return <Suspense fallback={golfReadFallback}><GolfFind /></Suspense>;
}
// 골프 용어 사전(2026-10-05) — 본문(shared/golfTerms.ts)이 길어 메인 청크에서 뺀다. 허브와 용어 한 개가 같은 화면 파일.
const GolfTerms = lazy(() => import("@/golf/pages/GolfTerms"));
function GolfTermsRoute() {
  return <Suspense fallback={golfReadFallback}><GolfTerms /></Suspense>;
}

/**
 * 골프 화면 문지기. 비로그인은 로그인으로 보내고(끝나면 가려던 골프 화면으로 돌아온다), 로그인했지만 허용되지 않은 사람은 홈으로 돌린다.
 * 로그인 확인 중에는 아무것도 그리지 않는다 — 잠깐 골프가 보였다 사라지는 것보다 낫다.
 *
 * 2026-10-05 오너 결정("홈을 비로그인에 다 열고, 가입 안 한 사람에겐 예시로 보여 준다"): 예전엔 비로그인도 /dashboard 로 돌렸다.
 * 그때 홈은 로그인 안내 한 장이라 그게 맞았지만, 이제 방문자에게 골프 홈이 열려 있어서 홈에서 조인·내 예약·여권을 누르면
 * 아무 말 없이 홈으로 되돌아오는 막다른 길이 된다. 방문자는 로그인으로 보낸다.
 *
 * 단, **한국어로 보는 방문자만** 로그인으로 보낸다. 골프는 한국어 화면에서만 열려서(useGolfAccess) 다른 언어로 보는 방문자는
 * 가입·로그인을 마치고 돌아와도 이 문이 열리지 않는다 — 열리지 않는 화면을 보라고 가입을 시키게 된다(공개 골프 랭킹의 '조인'·'내 예약' 탭).
 * 그 사람은 예전처럼 홈으로 돌린다. 홈은 이제 로그인 안내 한 장이 아니라 비로그인에게 열린 당구 예시 홈이다.
 */
function GolfOnly({ children }: { children: ReactNode }) {
  const { isLoading, isGuest } = useAuth();
  const golfOk = useGolfAccess();
  const { locale } = useT();
  const [, setLocation] = useLocation();
  useEffect(() => {
    if (isLoading) return;
    const KEY = "rankue_golf_pending_pin";
    if (golfOk) {
      // 로그인 뒤 초대 주소(?pin=)로 곧장 돌아왔으면 남겨 둔 핀은 이 주소가 쓴다 — 지우지 않으면 다음에 골프 홈을 열 때 같은 방으로 또 들어간다.
      // 남긴 핀이 없는 사람(처음부터 로그인돼 있던 회원)에겐 아무 일도 없다.
      try {
        const pin = new URLSearchParams(window.location.search).get("pin");
        if (pin && sessionStorage.getItem(KEY) === pin) sessionStorage.removeItem(KEY);
      } catch { /* 저장소를 못 쓰는 환경 */ }
      return;
    }
    // 초대 링크(?pin=)로 왔는데 아직 로그인 전이면, 로그인 뒤 골프 홈에서 이어서 들어가게 핀을 잠깐 남긴다.
    // (로그인 뒤 이 주소로 못 돌아오는 길 — 새로 가입하는 경우 등 — 의 안전망이다.)
    try {
      const pin = new URLSearchParams(window.location.search).get("pin");
      if (pin) sessionStorage.setItem(KEY, pin);
    } catch { /* 저장소를 못 쓰는 환경 */ }
    if (isGuest && locale === "ko") {
      // 한국어로 보는 비로그인(확인 끝) — 로그인으로. 끝나면 가려던 골프 화면(지금 주소)으로 돌아온다.
      // 자리를 바꿔 끼운다(replace): 로그인 화면에서 '뒤로'를 누르면 이 문으로 돌아와 다시 로그인으로 튕기는 걸 막는다.
      // 이 자리에 팝업을 띄우지 않고 **보낸다**(goLoginPage) — 이 문은 아무것도 그리지 않아서, 빈 화면 위에 팝업이 뜨고 닫으면 갇힌다.
      // 가는 곳은 예시 홈 위의 가입·로그인 팝업이다(2026-10-07 — 전체 로그인 화면이 아니다). 닫아도 예시 홈에 남는다.
      goLoginPage((to) => setLocation(to, { replace: true }), window.location.pathname + window.location.search);
      return;
    }
    // 로그인했지만 골프 허용이 없는 사람(한국어가 아닌 화면 등), 그리고 한국어가 아닌 비로그인 — 홈으로.
    // (한국어가 아닌 비로그인은 가입해도 이 문이 열리지 않으므로 로그인으로 보내지 않는다.)
    setLocation("/dashboard", { replace: true });
  }, [isLoading, isGuest, golfOk, locale, setLocation]);
  if (isLoading || !golfOk) return null;
  return <>{children}</>;
}

function AppRoutes() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  // 인증된 부팅 시점에 저장된 푸시 토큰을 재동기화 (최초 설치 시 로그인 전 401로 유실된 토큰 복구)
  const { data: me } = useQuery<{ id?: string }>({
    queryKey: ["/api/hiq/me"],
    retry: false,
  });

  useEffect(() => {
    if (me?.id) {
      syncPushToken();
    }
  }, [me?.id]);

  useEffect(() => {
    const handleMessage = async (event: any) => {
      // 오리진/소스 검증: 크로스 오리진 opener/embedding frame 의 postMessage 는 거부한다.
      // 네이티브 브릿지(RN/Capacitor)는 인페이지 window.postMessage 로 주입되어 event.source === window 이다.
      // legacy document-dispatched 및 네이티브 주입 메시지는 origin 이 빈 문자열일 수 있어 이를 허용한다.
      if (event.source && event.source !== window) return;
      if (event.origin && event.origin !== window.location.origin) return;

      try {
        const message = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        const { type, payload } = message || {};

        if (type === 'FCM_TOKEN') {
          const token = payload?.token;
          if (token) {
            localStorage.setItem('fcm_token', token);
            // 서버 등록 (미인증 시 401은 무시되고 로그인/부팅 시 재동기화됨)
            syncPushToken();
          }
        }

        // 🚀 Deep Linking Navigation Support
        else if (type === 'NAVIGATE') {
          if (payload?.path) {
            console.log("🚀 Deep Link Navigation:", payload.path);
            setLocation(payload.path);
          }
        }

      } catch (e) {
        // JSON 파싱 에러 등 무시
      }
    };

    // iOS/Android 및 Legacy WebView 대응
    window.addEventListener("message", handleMessage);
    document.addEventListener("message", handleMessage as any);

    return () => {
      window.removeEventListener("message", handleMessage);
      document.removeEventListener("message", handleMessage as any);
    };
  }, [toast, setLocation]);

  return (
    <>
      {/* 로그인한 회원의 앱 접속을 기록한다(잔류 측정, 2026-09-13) — 화면 없음 */}
      <AppSessionTracker />
      <Switch>
      {/* 메인 랜딩 페이지 */}
      <Route path="/" component={HiqLanding} />
      {/* 카카오 로그인에서 돌아오는 주소(2026-10-05) — 공개. 경로는 카카오 콘솔에 등록한 Redirect URI 와 같아야 한다(shared/kakaoLogin KAKAO_REDIRECT_PATH) */}
      <Route path="/auth/kakao" component={KakaoCallback} />
      {/* 카카오 로그인 미리보기(2026-10-06) — 열쇠를 넣은 기기에서만 켜진다. 로그인 불필요, 열쇠가 없으면 없는 화면과 같다(shared/kakaoLogin KAKAO_PREVIEW_PATH) */}
      <Route path="/kakao-preview" component={KakaoPreview} />
      {/* 공개 정책 문서 — 스토어 심사용, 로그인 불필요 */}
      <Route path="/privacy" component={Privacy} />
      <Route path="/account-delete" component={AccountDelete} />
      <Route path="/support" component={Support} />
      {/* 이용약관(EULA) — 공개 문서. 가입·동의 시트·설정·고객지원에서 링크한다(감사 S4) */}
      <Route path="/terms" component={Terms} />
      <Route path="/about" component={About} />
      <Route path="/stores" component={Stores} />
      {/* register 는 :code 와일드카드보다 먼저 — 아니면 "register"가 매장 코드로 해석돼 404 */}
      <Route path="/stores/register" component={StoreRegister} />
      <Route path="/stores/:code" component={StoreListing} />
      <Route path="/briefing" component={BriefingPage} />
      <Route path="/briefing/:date" component={BriefingPage} />
      {/* 당구 용어 사전(2026-09-24) — 공개 문서, 로그인 불필요. 봇에게는 server/seo/billiardsTerms.ts */}
      <Route path="/billiards/terms" component={BilliardsTermsRoute} />
      <Route path="/billiards/terms/:slug" component={BilliardsTermRoute} />
      <Route path="/store/:slug" component={StoreDetail} />
      {/* 공유 링크로 열리는 공개 경기 결과 — 로그인 불필요 */}
      <Route path="/r/:id" component={SharedResult} />

      {/* HiQ 기능 페이지들 — 데스크탑에서는 DesktopFrame 이 중앙 448px로 고정한다 */}
      <Route path="/register" component={FramedRegister} />
      <Route path="/dashboard" component={FramedDashboard} />
      <Route path="/settings" component={FramedSettings} />
      <Route path="/friends" component={FramedFriends} />
      <Route path="/club" component={FramedClub} />
      <Route path="/club/create" component={FramedCreateClub} />
      {/* 크루 상세는 프레임에서 뺐다 — 루트가 `fixed inset-0` 전체화면 셸이라 DOM 을 감싸도
          효과가 없고(뷰포트 기준으로 튀어나온다), 탭이 framer-motion drag(transform)로
          움직여 그 안의 fixed 요소 기준까지 어긋난다. 프레임에 넣으려면 club-detail.tsx
          자체를 일반 흐름 레이아웃으로 바꿔야 한다. */}
      <Route path="/club/:id" component={HiqClubDetail} />
      {/* 명예의 전당은 탭이 아니라 별도 페이지다. 아래 /crew/:id/:tab? 보다 반드시 위에
          둬야 한다 — 아래면 "hall-of-fame" 이 탭 이름으로 먹혀 홈으로 떨어진다. */}
      <Route path="/crew/:id/hall-of-fame" component={CrewHallOfFame} />
      {/* 이미 발송된 푸시 페이로드(/crew/:id/:tab) 호환 별칭 */}
      <Route path="/crew/:id/:tab?" component={HiqClubDetail} />
      <Route path="/join/:code" component={FramedJoin} />
      <Route path="/game/result" component={HiqGameResult} />
      <Route path="/game/:id" component={HiqScoreboard} />
      {/* 골프 주소는 허용된 사람에게만 연다. 예전엔 종목 스위치만 숨기고 이 라우트는 열어 둬서
          로그인한 사람이 주소만 치면 골프 화면이 그대로 열렸다(2026-09-09 프로덕션 실측).
          서버의 /api/hiq/golf/* 도 같은 목록으로 막는다 — 화면만 가리는 잠금은 잠금이 아니다. */}
      <Route path="/golf/game/new"><GolfOnly><GolfNewGame /></GolfOnly></Route>
      <Route path="/golf/game/:id/result"><GolfOnly><GameResult /></GolfOnly></Route>
      <Route path="/golf/game/:id"><GolfOnly><GolfScorecard /></GolfOnly></Route>
      <Route path="/golf/passport"><GolfOnly><GolfPassport /></GolfOnly></Route>
      <Route path="/golf/membership/:id"><GolfOnly><MembershipDetail /></GolfOnly></Route>
      <Route path="/golf/membership"><GolfOnly><MembershipExchange /></GolfOnly></Route>
      <Route path="/golf/ranking"><GolfOnly><GolfCourseRanking /></GolfOnly></Route>
      <Route path="/golf/elite60"><GolfOnly><GolfElite60 /></GolfOnly></Route>
      {/* 골프장 페이지(2026-09-24) — 검색 유입용 공개 페이지라 GolfOnly 를 타지 않는다(GolfOnly 는 비로그인을 /dashboard 로 쫓아낸다).
          슬러그는 한글(정본). 옛 숫자 주소(/golf/course/74)는 GolfCoursePage 가 슬러그로 바꿔 준다.
          wouter 는 기본이 정확 일치라(regexparam, loose 아님) /golf/booking 이 /golf/booking-list 를 먹지 않는다. */}
      <Route path="/golf/checklist" component={GolfChecklistRoute} />
      <Route path="/golf/terms" component={GolfTermsRoute} />
      <Route path="/golf/terms/:slug" component={GolfTermsRoute} />
      <Route path="/golf/find/:key" component={GolfFindRoute} />
      <Route path="/golf/find/:key/:region" component={GolfFindRoute} />
      <Route path="/golf/course/:slug" component={GolfCoursePage} />
      <Route path="/golf/courses" component={GolfCourseHub} />
      <Route path="/golf/courses/:region" component={GolfCourseHub} />
      <Route path="/golf/courses/:region/:city" component={GolfCourseHub} />
      <Route path="/golf/booking" component={GolfCourseHub} />
      <Route path="/golf/booking/:region" component={GolfCourseHub} />
      <Route path="/golf/booking/:region/:city" component={GolfCourseHub} />
      <Route path="/golf/join" component={GolfCourseHub} />
      <Route path="/golf/join/:region" component={GolfCourseHub} />
      <Route path="/golf/join/:region/:city" component={GolfCourseHub} />
      <Route path="/golf/urgent" component={GolfCourseHub} />
      <Route path="/golf/urgent/:region" component={GolfCourseHub} />
      <Route path="/golf/urgent/:region/:city" component={GolfCourseHub} />
      <Route path="/golf/booking-list/:id?"><GolfOnly><GolfBookingList /></GolfOnly></Route>
      {/* 내 예약(2026-09-23) — 하단 탭 '라운드' 자리를 받았다. 시트였던 '내역'이 주소를 갖는다:
          알림이 "내 신청이 어떻게 됐나"로 바로 보낼 곳이 생긴다. */}
      <Route path="/golf/my-bookings"><GolfOnly><GolfMyBookings /></GolfOnly></Route>
      <Route path="/golf/proam"><GolfOnly><GolfProAm /></GolfOnly></Route>
      {/* 3D 필드 골프 & 미니골프(2026-09-17) — 물리 진짜 계산하는 단독 페이지 */}
      <Route path="/golf/play"><GolfOnly><GolfPlay /></GolfOnly></Route>
      <Route path="/golf/minigolf"><GolfOnly><MiniGolfPlay /></GolfOnly></Route>
      {/* 골프 온라인게임(미니골프 대전, 2026-09-14) */}
      <Route path="/golf/arcade"><GolfOnly><GolfArcadePage /></GolfOnly></Route>
      {/* 필드 골프 연습장(2026-09-15 확정안 3주차 게이트) */}
      <Route path="/golf/range"><GolfOnly><GolfRangePage /></GolfOnly></Route>
      <Route path="/history" component={FramedHistory} />
      <Route path="/ranking" component={FramedRanking} />
      <Route path="/menu" component={FramedMenu} />
      {/* 채팅(2026-09-21): 하단 탭 '전체' 자리. 조인·부킹 방은 글 id 로 */}
      <Route path="/chat/:kind/:id" component={FramedChatRoom} />
      <Route path="/chat" component={FramedChatHub} />
      <Route path="/community" component={FramedCommunity} />
      <Route path="/community/:id" component={FramedCommunityPost} />
      <Route path="/world-ranking" component={FramedWorldRanking} />
      {/* 국가별 세계랭킹·순위 변동(2026-09-24) — 공개. 봇에게는 server/seo/rankingExtra.ts */}
      <Route path="/world-ranking/country/:fed" component={FramedWorldRankingCountry} />
      <Route path="/world-ranking/movers" component={FramedWorldRankingMovers} />
      <Route path="/player/:category/:umbId" component={FramedWorldPlayer} />
      <Route path="/pba" component={FramedPba} />
      {/* PBA·LPBA 통산 기록 순위(2026-09-24) — 공개. 봇에게는 server/seo/pbaRecords.ts */}
      <Route path="/pba/records" component={FramedPbaRecords} />
      <Route path="/pba-player/:memCode" component={FramedPbaPlayer} />
      {/* 당구 대회(2026-09-24) — 공개. 봇에게는 server/seo/tournaments.ts. 상세 셋은 한 화면이 useRoute 로 가른다 */}
      <Route path="/tournaments" component={FramedTournaments} />
      <Route path="/tournaments/pba/:season" component={FramedTournamentDetail} />
      <Route path="/tournaments/pba/:season/:tourCode" component={FramedTournamentDetail} />
      <Route path="/tournaments/umb/:slug" component={FramedTournamentDetail} />
      {/* 골프 랭킹(2026-09-13 오너: 공개 전체) — GolfOnly 를 타지 않는다. 검색 유입용 공개 페이지 */}
      <Route path="/golf-ranking" component={FramedGolfRanking} />
      <Route path="/golfer/:tour/:id" component={FramedGolfer} />
      <Route path="/admin" component={HiqAdmin} />

      {/* Partner (SaaS) Pages */}
      <Route path="/partner/login" component={PartnerLogin} />
      <Route path="/partner/dashboard" component={PartnerDashboard} />
      <Route path="/partner/settings" component={PartnerSettings} />
      <Route path="/partner/create-tournament" component={CreateTournament} />
      <Route path="/partner/subscription" component={PartnerSubscription} />
      <Route path="/admin/dashboard" component={AdminDashboard} />

      {/* 호환성 라우트 */}
      <Route path="/hiq" component={HiqLanding} />
      <Route path="/hiq/dashboard" component={FramedDashboard} />
      {/* 시뮬레이터 v2 — 엔진·렌더러가 무거워 별도 청크로 지연 로드 */}
      <Route path="/online-game" component={SimulatorLazy} />

      {/* 404 페이지 */}
      <Route component={NotFound} />
    </Switch>
    </>
  );
}

// 앱 설치 팝업(2026-10-06 오너: "웹으로 진입 시 기기에 따른 앱 설치 팝업창 잘 디자인해서 만들어줘. 지금 팝업보다 잘") — 예전의 떠 있는 띠를 대신한다.
// 어느 주소에서 막는지는 여기가 아니라 shared/installPrompt **한 곳**이 정한다(isPromptBlockedPath): 온라인게임(2026-09-07 실측: 샷 버튼을 덮음) ·
// 골프 아크/레인지(2026-09-15: 스윙 패드를 덮음) · 공개 골프 페이지(바닥의 '로그인하고 취소티 알림 받기' 줄과 겹친다)에 더해
// 점수판 · 스코어카드 · 로그인/가입 · 약관 · 콘솔. 이 게이트는 지금 경로를 건네기만 한다.
// 본문 아래에 AppInstallCard 를 놓은 화면(홈 · 크루 · 친구 · 기록 · 메뉴)에서는 예전엔 띠를 껐다 — 이제는 뜬다: 한 번 뜨고 쉬는 팝업이라
// 가장 오래 머무는 홈에서 떠야 효과가 있다. '한 화면에 설치 권유 둘은 소음'(2026-09-09)은 그 카드가 화면에 보이는 동안 팝업이 기다리는 것으로 지킨다.
// PC 에는 그 카드가 없고 옆 패널(DesktopFrame)의 QR · 스토어 단추가 그 자리다 — 옆 패널이 보이는 동안은 팝업이 스스로 뜨지 않는다(2026-10-06 검토).
function InstallBannerGate() {
  const [location] = useLocation();
  return <AppInstallSheet path={location} />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <StoreProvider>
          <SportProvider>
            {/* '앱에서 열기'(2026-10-06) — 웹의 로그인을 넘겨받는다: 앱이 커스텀 스킴으로 받아 건넨 한 번짜리 토큰을, 물어본 뒤 쿠키와 바꾼다. 화면 없음.
                주소에 실려 온 토큰은 쓰지 않고 지우기만 한다(2026-10-06 검토). 다른 화면보다 먼저 둔다(주소에서 지우는 일이 가장 먼저여야 한다) */}
            <HandoffRedeemer />
            {/* 이용약관 동의 시트 — 첫 글쓰기·첫 소셜 로그인 때 뜬다(감사 S4). 화면 어디서나 useTermsGate 로 부른다 */}
            <TermsConsentProvider>
              <AppRoutes />
              {/* 가입·로그인 팝업(2026-10-06) — goLogin·가입 안내(guard)가 여기로 띄운다. 약관 동의(useTermsGate)를 쓰므로 이 Provider 안쪽이어야 한다 */}
              <LoginSheetHost />
              {/* 전화번호 계정 잇기(2026-10-07) — 소셜로 새 계정이 만들어진 직후 "전에 전화번호로 쓰셨나요?"를 한 번 묻는다. 설정에서도 연다 */}
              <AttachPhoneSheetHost />
            </TermsConsentProvider>
            <Toaster />
            {/* 앱 안내창 — 흰 시스템 confirm/alert 대신(2026-10-01). appConfirm·appAlert 가 여기로 띄운다 */}
            <AppDialogHost />
            {/* 주 종목 한 번 묻기(2026-10-01) — 가입 직후·기존 회원 다음 접속 때 한 번. 고른 종목으로 앱이 시작한다 */}
            <PrimarySportGate />
            {/* 친구·크루 접속 배너(2026-10-01) — 앱을 보고 있을 때만, 폰은 울리지 않는다 */}
            <PresenceArrivals />
            {/* 네이티브 앱 전용 안내(업데이트·알림 권한 사전 설명). 웹에선 아무것도 그리지 않는다. */}
            <NativePrompts />
            {/* 온라인게임 대전 호출 — 방을 열고 다른 화면에 있어도 상대가 들어오면·내 차례면 앱 안에서 바로 알린다(2026-09-26) */}
            <LiveMatchBanner />
            {/* 앱 설치 팝업(2026-10-06) — 웹으로 들어온 사람에게 기기에 맞는 길 하나(아이폰 App Store · 안드로이드 Google Play · PC 는 QR),
                로그인한 사람에게는 '앱에서 열기'. 들어오자마자 뜨지 않고 닫으면 쉰다(shared/installPrompt).
                네이티브 앱 안 · 홈 화면에 추가한 웹앱에서는 스스로 숨는다. 가입 팝업(LoginSheetHost)이 열려 있으면 뜨지 않는다. */}
            <InstallBannerGate />
            {/* 일별 유니크 접속자 비콘 — 하루 1회만 전송 */}
            <VisitBeacon />
            {/* 방문자 발자국(2026-10-08) — 화면 이동·누른 단추·스크롤 깊이를 모아 20초마다 한 번에. 남기지 않는 것은 shared/uiTrail */}
            <Tracker />
          </SportProvider>
        </StoreProvider>
      </I18nProvider>
    </QueryClientProvider>
  );
}

export default App;
