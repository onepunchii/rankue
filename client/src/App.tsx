import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { AuthProvider } from "@/contexts/AuthContext";
import CustomHelmetProvider from "@/components/HelmetProvider";
import NotFound from "@/pages/not-found";


import Home from "@/pages/home";
import SurveyDetail from "@/pages/survey-detail";
import Category from "@/pages/category";
import Results from "@/pages/results";
import Profile from "@/pages/profile";
import Persona from "@/pages/persona";
import Surveys from "@/pages/surveys";
import SurveyResult from "@/pages/survey-result";
import SurveyDetailResult from "@/pages/survey-detail-result";
import DemographicSetup from "@/pages/demographic-setup";
import ProfileSetup from "@/pages/profile-setup";
import ProfileEdit from "@/pages/profile-edit";
import EnterpriseResearch from "@/pages/enterprise-research";
import AnalyticsDashboard from "@/pages/analytics-dashboard";
import PoliticsCategory from "@/pages/category/politics";

import PolicyForum from "@/pages/policy-forum";
import CelebrityBattle from "@/pages/celebrity-battle";
import MusicRanking from "@/pages/music-ranking";
import CelebrityRanking from "@/pages/celebrity-ranking";
import CelebrityAdmin from "@/pages/celebrity-admin";
import CreateVoteTopic from "@/pages/create-vote-topic";

// Admin pages
import { AdminLogin } from "@/pages/admin/login";
import { AdminDashboard } from "@/pages/admin/dashboard";
import { DatabaseStatus } from "@/pages/admin/database-status";
import { AdminSurveys } from "@/pages/admin/surveys";
import { AdminAnalytics } from "@/pages/admin/analytics";
import { AdminTargeting } from "@/pages/admin/targeting";
import { AdminNotifications } from "@/pages/admin/notifications";
import { AdminUsers } from "@/pages/admin/users";
import { AdminAbuseDetection } from "@/pages/admin/abuse-detection";
import { AdminSettings } from "@/pages/admin/settings";
import AdminRewards from "@/pages/admin/rewards";
import AdminIntegration from "@/pages/admin/integration";
import AdminRewardsAnalytics from "@/pages/admin/rewards-analytics";
import GangnamDashboard from "@/pages/gangnam-dashboard";
import GangnamLogin from "@/pages/gangnam-login";

import PolliDemoSetup from "@/pages/polli-demo-setup";
import NewsPage from "@/pages/news";
import NewsViewer from "@/pages/news-viewer";
import Statistics from "@/pages/statistics";
import LightPillar from "@/components/ui/light-pillar";

// SEO Pages
import About from "@/pages/about";
import Politics from "@/pages/politics";
import Entertainment from "@/pages/entertainment";
// Assembly pages
import AssemblyRankings from "@/pages/assembly-rankings";
import MyDistrict from "@/pages/my-district";
import BillTracker from "@/pages/bill-tracker";
import PoliticianDetail from "@/pages/PoliticianDetail";
// Blog components will be created later
// import BlogList from "@/pages/blog-list";
// import BlogPost from "@/pages/blog-post";
// import BlogCategory from "@/pages/blog-category";

function Router() {

  return (
    <Switch>



      {/* SEO 최적화 페이지들 */}
      <Route path="/about" component={About} />
      <Route path="/politics" component={Politics} />
      <Route path="/entertainment" component={Entertainment} />

      {/* PolliAuth 시스템: 모든 사용자 접근 가능한 페이지들 */}
      <Route path="/" component={Home} />
      <Route path="/home" component={Home} />
      <Route path="/profile" component={Profile} />
      <Route path="/persona" component={Persona} />
      <Route path="/surveys" component={Surveys} />
      <Route path="/news" component={NewsPage} />
      <Route path="/news/view" component={NewsViewer} />
      <Route path="/news-viewer" component={NewsViewer} />

      {/* SEO 친화적인 URL 구조 */}
      <Route path="/poll/:slug" component={SurveyDetail} />
      <Route path="/poll/:slug/result" component={SurveyResult} />
      <Route path="/poll/:slug/analytics" component={SurveyDetailResult} />

      {/* 기존 호환성 유지 (리디렉션용) */}
      <Route path="/survey/:id" component={SurveyDetail} />
      <Route path="/survey-result/:id" component={SurveyResult} />
      <Route path="/survey/:id/result" component={SurveyResult} />
      <Route path="/survey-detail-result/:id" component={SurveyDetailResult} />

      {/* 블로그 섹션 - 추후 구현 */}
      {/* <Route path="/blog" component={BlogList} />
      <Route path="/blog/:slug" component={BlogPost} />
      <Route path="/blog/category/:category" component={BlogCategory} /> */}

      <Route path="/politics" component={PoliticsCategory} />
      <Route path="/category/politics" component={PoliticsCategory} />

      <Route path="/policy-forum" component={PolicyForum} />
      <Route path="/celebrity-battle" component={CelebrityBattle} />
      <Route path="/music-ranking" component={MusicRanking} />
      <Route path="/celebrity-ranking" component={CelebrityRanking} />
      <Route path="/create-vote-topic" component={CreateVoteTopic} />
      <Route path="/celebrity-admin" component={CelebrityAdmin} />

      {/* Assembly ON pages */}
      <Route path="/assembly-rankings" component={AssemblyRankings} />
      <Route path="/my-district" component={MyDistrict} />
      <Route path="/bill-tracker" component={BillTracker} />

      {/* Politician Detail pages */}
      <Route path="/politician/assembly/:id" component={() => <PoliticianDetail type="assembly" />} />
      <Route path="/politician/local-council/:id" component={() => <PoliticianDetail type="local_council" />} />

      <Route path="/category/:category" component={Category} />
      <Route path="/results" component={Results} />
      <Route path="/demographic-setup" component={DemographicSetup} />
      <Route path="/profile-setup" component={ProfileSetup} />
      <Route path="/profile-edit" component={ProfileEdit} />
      <Route path="/polli-demo-setup" component={PolliDemoSetup} />
      <Route path="/enterprise-research" component={EnterpriseResearch} />
      <Route path="/analytics" component={AnalyticsDashboard} />
      <Route path="/statistics" component={Statistics} />


      {/* Gangnam routes */}
      <Route path="/gangnam-login" component={GangnamLogin} />

      {/* Admin routes */}
      <Route path="/admin" component={AdminDashboard} />
      <Route path="/admin/login" component={AdminLogin} />
      <Route path="/admin/dashboard" component={AdminDashboard} />
      <Route path="/admin/database-status" component={DatabaseStatus} />
      <Route path="/admin/surveys" component={AdminSurveys} />
      <Route path="/admin/analytics" component={AdminAnalytics} />
      <Route path="/admin/targeting" component={AdminTargeting} />
      <Route path="/admin/notifications" component={AdminNotifications} />
      <Route path="/admin/users" component={AdminUsers} />
      <Route path="/admin/abuse-detection" component={AdminAbuseDetection} />
      <Route path="/admin/settings" component={AdminSettings} />
      <Route path="/admin/rewards" component={AdminRewards} />
      <Route path="/admin/analytics-rewards" component={AdminRewardsAnalytics} />
      <Route path="/admin/integration" component={AdminIntegration} />
      <Route path="/admin/gangnam-dashboard" component={GangnamDashboard} />

      {/* 메인 페이지 라우팅 제거: 위에서 이미 처리됨 */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  // Initialize push notifications
  usePushNotifications();

  return (
    <CustomHelmetProvider>
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <LightPillar
          className="w-full h-full"
          mixBlendMode="normal"
          bottomColor="#ff0000"
          intensity={0.9}
          glowAmount={0.001}
          noiseIntensity={0}
          pillarRotation={106}
        />
      </div>
      <div className="relative z-10 w-full min-h-screen">
        <AuthProvider>
          <QueryClientProvider client={queryClient}>
            <TooltipProvider>
              <Toaster />
              <Router />
            </TooltipProvider>
          </QueryClientProvider>
        </AuthProvider>
      </div>
    </CustomHelmetProvider>
  );
}

export default App;
