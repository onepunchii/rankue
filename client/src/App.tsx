import { Switch, Route, useLocation } from "wouter";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { HiqInstallBanner } from "@/components/hiq/HiqInstallBanner";
import { useAuth } from "@/hooks/useAuth";
import { useGolfAccess } from "@/hooks/useGolfAccess";
import { VisitBeacon } from "@/components/hiq/VisitBeacon";
import { NativePrompts } from "@/components/hiq/NativePrompts";
import { syncPushToken } from "@/lib/nativeBridge";
import NotFound from "@/pages/not-found";
import { useEffect, lazy, Suspense, type ComponentType, type FunctionComponent, type ReactNode } from "react";
import { useToast } from "@/hooks/use-toast";

// HiQ Pages
import HiqLanding from "@/pages/hiq/landing";
import HiqRegister from "@/pages/hiq/register";
import HiqDashboard from "@/pages/hiq/dashboard";
import HiqAdmin from "@/pages/hiq/admin";
import HiqScoreboard from "@/pages/hiq/game/[id]";
import HiqGameResult from "@/pages/hiq/game/result";
import HiqHistory from "@/pages/hiq/history";
import HiqRanking from "@/pages/hiq/ranking";
import HiqMenu from "@/pages/hiq/menu";
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
import HiqPba from "@/pages/hiq/pba";
import HiqPbaPlayer from "@/pages/hiq/pba-player";
import HiqWorldPlayer from "@/pages/hiq/world-player";
import GolfNewGame from "@/golf/pages/NewGame";
import GolfScorecard from "@/golf/pages/GamePage";
import GameResult from "@/golf/pages/GameResult";
import GolfPassport from "@/golf/pages/Passport";
import GolfCourseRanking from "@/golf/pages/CourseRanking";
import GolfElite60 from "@/golf/pages/Elite60";
import GolfCourseDetail from "@/golf/pages/CourseDetail";
import GolfBookingList from "@/golf/pages/BookingList";
import GolfProAm from "@/golf/pages/ProAm";
import MembershipExchange from "@/golf/pages/MembershipExchange";
import MembershipDetail from "@/golf/pages/MembershipDetail";
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
import { I18nProvider } from "@/lib/i18n";
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
const FramedSettings = framed(HiqSettings);
const FramedFriends = framed(HiqFriends);
const FramedClub = framed(HiqClub);
const FramedCreateClub = framed(HiqCreateClub);
const FramedJoin = framed(HiqJoin);
const FramedHistory = framed(HiqHistory);
const FramedRanking = framed(HiqRanking);
const FramedMenu = framed(HiqMenu);
const FramedCommunity = framed(HiqCommunity);
const FramedCommunityPost = framed(HiqCommunityPost);
// 데이터 표 페이지들은 데스크탑에서 넓게 (사이드 패널 없이 중앙 720px)
const FramedWorldRanking = framed(HiqWorldRanking, { wide: true });
const FramedWorldPlayer = framed(HiqWorldPlayer, { wide: true });
const FramedPba = framed(HiqPba, { wide: true });
const FramedPbaPlayer = framed(HiqPbaPlayer, { wide: true });

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

/**
 * 골프 화면 문지기. 허용되지 않으면 홈으로 돌린다.
 * 로그인 확인 중에는 아무것도 그리지 않는다 — 잠깐 골프가 보였다 사라지는 것보다 낫다.
 */
function GolfOnly({ children }: { children: ReactNode }) {
  const { isLoading } = useAuth();
  const golfOk = useGolfAccess();
  const [, setLocation] = useLocation();
  useEffect(() => {
    if (!isLoading && !golfOk) {
      // 초대 링크(?pin=)로 왔는데 아직 로그인 전이면, 로그인 뒤 골프 홈에서 이어서 들어가게 핀을 잠깐 남긴다.
      try {
        const pin = new URLSearchParams(window.location.search).get("pin");
        if (pin) sessionStorage.setItem("rankue_golf_pending_pin", pin);
      } catch { /* 저장소를 못 쓰는 환경 */ }
      setLocation("/dashboard", { replace: true });
    }
  }, [isLoading, golfOk, setLocation]);
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
    <Switch>
      {/* 메인 랜딩 페이지 */}
      <Route path="/" component={HiqLanding} />
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
      <Route path="/golf/course/:id"><GolfOnly><GolfCourseDetail /></GolfOnly></Route>
      <Route path="/golf/booking-list/:id?"><GolfOnly><GolfBookingList /></GolfOnly></Route>
      <Route path="/golf/proam"><GolfOnly><GolfProAm /></GolfOnly></Route>
      <Route path="/history" component={FramedHistory} />
      <Route path="/ranking" component={FramedRanking} />
      <Route path="/menu" component={FramedMenu} />
      <Route path="/community" component={FramedCommunity} />
      <Route path="/community/:id" component={FramedCommunityPost} />
      <Route path="/world-ranking" component={FramedWorldRanking} />
      <Route path="/player/:category/:umbId" component={FramedWorldPlayer} />
      <Route path="/pba" component={FramedPba} />
      <Route path="/pba-player/:memCode" component={FramedPbaPlayer} />
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
  );
}

// 시뮬레이터 화면은 하단 조작부가 꽉 차 있어 설치 배너를 띄우지 않는다(실측 2026-09-07: 샷 버튼을 덮음).
// 본문 아래에 AppInstallCard 를 놓은 페이지에서도 띄우지 않는다 — 한 화면에 설치 권유가 둘이면 소음이다
// (2026-09-09 오너: 각 페이지 하단에 카드형 배너). 나머지 화면은 떠 있는 배너가 계속 맡는다.
const PAGE_BANNER_ROUTES = ["/dashboard", "/club", "/friends", "/history", "/menu"];
function InstallBannerGate() {
  const [location] = useLocation();
  if (location.startsWith("/online-game")) return null;
  if (PAGE_BANNER_ROUTES.includes(location)) return null;
  return <HiqInstallBanner />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <StoreProvider>
          <SportProvider>
            {/* 이용약관 동의 시트 — 첫 글쓰기·첫 소셜 로그인 때 뜬다(감사 S4). 화면 어디서나 useTermsGate 로 부른다 */}
            <TermsConsentProvider>
              <AppRoutes />
            </TermsConsentProvider>
            <Toaster />
            {/* 네이티브 앱 전용 안내(업데이트·알림 권한 사전 설명). 웹에선 아무것도 그리지 않는다. */}
            <NativePrompts />
            {/* 앱 설치 유도 — iOS/안드로이드 스토어 우선, 미출시 플랫폼은 PWA 폴백.
                컴포넌트는 예전부터 있었지만 **어디에도 마운트돼 있지 않아 죽어 있었다**(번들에서도 빠졌다).
                여기 붙여야 실제로 뜬다. 네이티브 앱 안에서는 컴포넌트가 스스로 숨는다. */}
            <InstallBannerGate />
            {/* 일별 유니크 접속자 비콘 — 하루 1회만 전송 */}
            <VisitBeacon />
          </SportProvider>
        </StoreProvider>
      </I18nProvider>
    </QueryClientProvider>
  );
}

export default App;
