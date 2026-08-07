import { Switch, Route, useLocation } from "wouter";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { HiqInstallBanner } from "@/components/hiq/HiqInstallBanner";
import NotFound from "@/pages/not-found";
import { useEffect, type ComponentType, type FunctionComponent } from "react";
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
import HiqJoin from "@/pages/hiq/join";
import HiqOnlineGame from "@/pages/hiq/online-game";
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
import About from "@/pages/about";
import Stores from "@/pages/stores";
import StoreListing from "@/pages/store-listing";
import StoreDetail from "@/pages/store-detail";
import SharedResult from "@/pages/hiq/shared-result";

import { StoreProvider } from "./contexts/StoreContext";
import { I18nProvider } from "@/lib/i18n";
import { SportProvider } from "./contexts/SportContext";
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
function framed<P extends object>(Page: ComponentType<P>): FunctionComponent<P> {
  const Framed: FunctionComponent<P> = (props) => (
    <DesktopFrame>
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
const FramedWorldRanking = framed(HiqWorldRanking);
const FramedWorldPlayer = framed(HiqWorldPlayer);
const FramedPba = framed(HiqPba);
const FramedPbaPlayer = framed(HiqPbaPlayer);

/**
 * localStorage에 저장된 FCM 토큰을 서버에 등록한다.
 * 미인증(401) 등 오류는 조용히 무시한다 — 로그인/부팅 시 재호출되어 재동기화된다.
 * storage.updatePushToken 이 upsert 이므로 반복 호출은 멱등하다.
 */
export async function syncPushToken() {
  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('fcm_token') : null;
    if (!token) return;
    await apiRequest('/api/hiq/push-token', { method: 'POST', body: { token } });
  } catch {
    // 미인증/네트워크 오류 등은 무시 (다음 인증 시점에 재시도)
  }
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
      <Route path="/about" component={About} />
      <Route path="/stores" component={Stores} />
      <Route path="/stores/:code" component={StoreListing} />
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
      {/* 이미 발송된 푸시 페이로드(/crew/:id/:tab) 호환 별칭 */}
      <Route path="/crew/:id/:tab?" component={HiqClubDetail} />
      <Route path="/join/:code" component={FramedJoin} />
      <Route path="/game/result" component={HiqGameResult} />
      <Route path="/game/:id" component={HiqScoreboard} />
      <Route path="/golf/game/new" component={GolfNewGame} />
      <Route path="/golf/game/:id" component={GolfScorecard} />
      <Route path="/golf/game/:id/result" component={GameResult} />
      <Route path="/golf/passport" component={GolfPassport} />
      <Route path="/golf/membership" component={MembershipExchange} />
      <Route path="/golf/membership/:id" component={MembershipDetail} />
      <Route path="/golf/ranking" component={GolfCourseRanking} />
      <Route path="/golf/elite60" component={GolfElite60} />
      <Route path="/golf/course/:id" component={GolfCourseDetail} />
      <Route path="/golf/booking-list/:id?" component={GolfBookingList} />
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
      <Route path="/online-game" component={HiqOnlineGame} />

      {/* 404 페이지 */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <StoreProvider>
          <SportProvider>
            <AppRoutes />
            <Toaster />
            {/* 앱 설치 유도 — iOS/안드로이드 스토어 우선, 미출시 플랫폼은 PWA 폴백.
                컴포넌트는 예전부터 있었지만 **어디에도 마운트돼 있지 않아 죽어 있었다**(번들에서도 빠졌다).
                여기 붙여야 실제로 뜬다. 네이티브 앱 안에서는 컴포넌트가 스스로 숨는다. */}
            <HiqInstallBanner />
          </SportProvider>
        </StoreProvider>
      </I18nProvider>
    </QueryClientProvider>
  );
}

export default App;
