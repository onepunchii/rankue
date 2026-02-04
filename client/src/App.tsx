import { Switch, Route, useLocation } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient, apiRequest } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/not-found";
import { useEffect } from "react";
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
import HiqFriends from "@/pages/hiq/friends";
import HiqClub from "@/pages/hiq/club";
import HiqCreateClub from "@/pages/hiq/create-club";
import HiqClubDetail from "@/pages/hiq/club-detail";
import HiqJoin from "@/pages/hiq/join";
import HiqSimulation from "@/pages/hiq/simulation";
import HiqOnlineGame from "@/pages/hiq/online-game";
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

import { StoreProvider } from "./contexts/StoreContext";
import { SportProvider } from "./contexts/SportContext";

function AppRoutes() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  useEffect(() => {
    const handleMessage = async (event: any) => {
      try {
        const message = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        const { type, payload } = message || {};

        if (type === 'FCM_TOKEN') {
          const token = payload?.token;
          if (token) {
            console.log("📲 FCM Token Received:", token);
            localStorage.setItem('fcm_token', token);

            // 클립보드 복사
            try { await navigator.clipboard.writeText(token); } catch { }

            // 서버로 토큰 전송
            try {
              await apiRequest('/api/hiq/push-token', {
                method: 'POST',
                body: { token }
              });
              console.log("✅ 토큰 서버 저장 완료");
            } catch (err) {
              console.warn("⚠️ 토큰 서버 저장 실패:", err);
            }
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

      {/* HiQ 기능 페이지들 */}
      <Route path="/register" component={HiqRegister} />
      <Route path="/dashboard" component={HiqDashboard} />
      <Route path="/friends" component={HiqFriends} />
      <Route path="/club" component={HiqClub} />
      <Route path="/club/create" component={HiqCreateClub} />
      <Route path="/club/:id" component={HiqClubDetail} />
      <Route path="/join/:code" component={HiqJoin} />
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
      <Route path="/history" component={HiqHistory} />
      <Route path="/ranking" component={HiqRanking} />
      <Route path="/menu" component={HiqMenu} />
      <Route path="/admin" component={HiqAdmin} />
      <Route path="/simulation" component={HiqSimulation} />

      {/* Partner (SaaS) Pages */}
      <Route path="/partner/login" component={PartnerLogin} />
      <Route path="/partner/dashboard" component={PartnerDashboard} />
      <Route path="/partner/settings" component={PartnerSettings} />
      <Route path="/partner/create-tournament" component={CreateTournament} />
      <Route path="/partner/subscription" component={PartnerSubscription} />
      <Route path="/admin/dashboard" component={AdminDashboard} />

      {/* 호환성 라우트 */}
      <Route path="/hiq" component={HiqLanding} />
      <Route path="/hiq/dashboard" component={HiqDashboard} />
      <Route path="/online-game" component={HiqOnlineGame} />

      {/* 404 페이지 */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <StoreProvider>
        <SportProvider>
          <AppRoutes />
          <Toaster />
        </SportProvider>
      </StoreProvider>
    </QueryClientProvider>
  );
}

export default App;
