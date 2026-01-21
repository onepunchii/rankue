import { Switch, Route } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/not-found";

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
import HiqJoin from "@/pages/hiq/join";
import HiqSimulation from "@/pages/hiq/simulation";
import HiqOnlineGame from "@/pages/hiq/online-game";

function Router() {
  return (
    <Switch>
      {/* 메인 랜딩 페이지 */}
      <Route path="/" component={HiqLanding} />

      {/* HiQ 기능 페이지들 */}
      <Route path="/register" component={HiqRegister} />
      <Route path="/dashboard" component={HiqDashboard} />
      <Route path="/friends" component={HiqFriends} />
      <Route path="/join/:code" component={HiqJoin} />
      <Route path="/game/result" component={HiqGameResult} />
      <Route path="/game/:id" component={HiqScoreboard} />
      <Route path="/history" component={HiqHistory} />
      <Route path="/ranking" component={HiqRanking} />
      <Route path="/menu" component={HiqMenu} />
      <Route path="/admin" component={HiqAdmin} />
      <Route path="/simulation" component={HiqSimulation} />

      {/* 기존 /hiq 링크로 접속해도 작동하도록 호환성 유지 (선택사항) */}
      <Route path="/hiq" component={HiqLanding} />
      <Route path="/hiq/dashboard" component={HiqDashboard} />
      <Route path="/online-game" component={HiqOnlineGame} />

      {/* 404 페이지 */}
      <Route component={NotFound} />
    </Switch>
  );
}

import { StoreProvider } from "./contexts/StoreContext";

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <StoreProvider>
        <Router />
        <Toaster />
      </StoreProvider>
    </QueryClientProvider>
  );
}

export default App;
