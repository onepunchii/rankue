import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import MobileHeader from "@/components/mobile-header";
import BottomNav from "@/components/bottom-nav";
import ChartComponents from "@/components/chart-components";
import { SEOHead } from "@/components/seo-head";

interface AnalyticsData {
  overview: {
    totalSurveys: number;
    totalParticipants: number;
    averageCompletionRate: number;
    totalResponses: number;
    activeUsersToday: number;
    newUsersToday: number;
  };
  surveysByCategory: Array<{
    category: string;
    count: number;
    participants: number;
  }>;
  participationTrend: Array<{
    date: string;
    participants: number;
    completions: number;
  }>;
  topSurveys: Array<{
    id: number;
    title: string;
    participants: number;
    completionRate: number;
    category: string;
  }>;
  userDemographics: {
    age: Array<{ range: string; count: number }>;
    gender: Array<{ gender: string; count: number }>;
    location: Array<{ city: string; count: number }>;
  };
  engagementMetrics: {
    avgTimePerSurvey: number;
    returnUserRate: number;
    shareRate: number;
    mobilevVsDesktop: Array<{ platform: string; count: number }>;
  };
}

export default function AnalyticsDashboard() {
  const [timeRange, setTimeRange] = useState("7d");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [accessDenied, setAccessDenied] = useState(false);

  const { data: analytics, isLoading, error } = useQuery<AnalyticsData>({
    queryKey: ["/api/analytics/dashboard", timeRange, selectedCategory],
    queryFn: async () => {
      const response = await fetch(`/api/analytics/dashboard?timeRange=${timeRange}&category=${selectedCategory}`);
      if (response.status === 403) {
        setAccessDenied(true);
        throw new Error('Admin access required');
      }
      if (!response.ok) throw new Error('Failed to fetch analytics data');
      return response.json();
    },
  });

  if (accessDenied) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-pink-50 via-purple-50 to-indigo-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center">
        <Card className="glass-card max-w-md mx-auto">
          <CardContent className="p-8 text-center">
            <i className="fas fa-shield-alt text-4xl text-red-500 mb-4"></i>
            <h2 className="text-xl font-bold text-red-600 mb-2">접근 권한 없음</h2>
            <p className="text-gray-600 dark:text-gray-400">
              분석 대시보드는 관리자만 접근할 수 있습니다.
            </p>
            <Button 
              variant="outline" 
              className="mt-4"
              onClick={() => window.history.back()}
            >
              돌아가기
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const analyticsStructuredData = {
    "@context": "https://schema.org",
    "@type": "AnalysisNewsArticle",
    "headline": "Polli 분석 대시보드",
    "description": "설문조사 플랫폼의 상세한 사용자 참여 분석과 통계",
    "author": {
      "@type": "Organization",
      "name": "Polli"
    },
    "publisher": {
      "@type": "Organization",
      "name": "Polli",
      "url": "https://polli.replit.app"
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background dark:bg-gray-900">
        <SEOHead
          title="분석 대시보드 - Polli | 설문조사 통계 및 분석"
          description="폴리 플랫폼의 설문조사 참여 통계, 사용자 분석, 트렌드 데이터를 확인하세요. 실시간 대시보드로 상세한 인사이트를 제공합니다."
          keywords="분석 대시보드, 설문 통계, 사용자 분석, 데이터 시각화, 참여율 분석"
          structuredData={analyticsStructuredData}
        />
        <MobileHeader />
        <div className="max-w-7xl mx-auto p-4">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/3"></div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-32 bg-gray-200 dark:bg-gray-700 rounded-2xl"></div>
              ))}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-64 bg-gray-200 dark:bg-gray-700 rounded-2xl"></div>
              ))}
            </div>
          </div>
        </div>
        <BottomNav />
      </div>
    );
  }

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'fun': return 'bg-yellow-500';
      case 'life': return 'bg-green-500';
      case 'deep': return 'bg-red-500';
      case 'location': return 'bg-blue-500';
      default: return 'bg-gray-500';
    }
  };

  const getCategoryName = (category: string) => {
    switch (category) {
      case 'fun': return 'Fun Poll';
      case 'life': return 'Life Poll';
      case 'deep': return 'Deep Poll';
      case 'location': return '내 지역';
      default: return category;
    }
  };

  return (
    <div className="min-h-screen bg-background dark:bg-gray-900">
      <SEOHead
        title="분석 대시보드 - Polli | 설문조사 통계 및 분석"
        description="폴리 플랫폼의 설문조사 참여 통계, 사용자 분석, 트렌드 데이터를 확인하세요. 실시간 대시보드로 상세한 인사이트를 제공합니다."
        keywords="분석 대시보드, 설문 통계, 사용자 분석, 데이터 시각화, 참여율 분석"
        structuredData={analyticsStructuredData}
      />
      <MobileHeader />
      
      <main className="max-w-7xl mx-auto p-4 pb-20">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-800 dark:text-white">분석 대시보드</h1>
            <p className="text-gray-600 dark:text-gray-400">플랫폼 성과와 사용자 참여 분석</p>
          </div>
          
          <div className="flex gap-3">
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1d">오늘</SelectItem>
                <SelectItem value="7d">7일</SelectItem>
                <SelectItem value="30d">30일</SelectItem>
                <SelectItem value="90d">90일</SelectItem>
              </SelectContent>
            </Select>
            
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체</SelectItem>
                <SelectItem value="fun">Fun Poll</SelectItem>
                <SelectItem value="life">Life Poll</SelectItem>
                <SelectItem value="deep">Deep Poll</SelectItem>
                <SelectItem value="location">내 지역</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Overview Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-6">
          <Card className="glass-card">
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-blue-600">{analytics?.overview.totalSurveys || 0}</div>
              <div className="text-sm text-gray-600 dark:text-gray-400">총 설문</div>
            </CardContent>
          </Card>
          
          <Card className="glass-card">
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-green-600">{analytics?.overview.totalParticipants || 0}</div>
              <div className="text-sm text-gray-600 dark:text-gray-400">총 참여자</div>
            </CardContent>
          </Card>
          
          <Card className="glass-card">
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-purple-600">{analytics?.overview.averageCompletionRate || 0}%</div>
              <div className="text-sm text-gray-600 dark:text-gray-400">완료율</div>
            </CardContent>
          </Card>
          
          <Card className="glass-card">
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-orange-600">{analytics?.overview.totalResponses || 0}</div>
              <div className="text-sm text-gray-600 dark:text-gray-400">총 응답</div>
            </CardContent>
          </Card>
          
          <Card className="glass-card">
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-pink-600">{analytics?.overview.activeUsersToday || 0}</div>
              <div className="text-sm text-gray-600 dark:text-gray-400">오늘 활성 사용자</div>
            </CardContent>
          </Card>
          
          <Card className="glass-card">
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-indigo-600">{analytics?.overview.newUsersToday || 0}</div>
              <div className="text-sm text-gray-600 dark:text-gray-400">오늘 신규 사용자</div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="trends" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="trends">트렌드</TabsTrigger>
            <TabsTrigger value="surveys">설문 분석</TabsTrigger>
            <TabsTrigger value="users">사용자 분석</TabsTrigger>
            <TabsTrigger value="engagement">참여도</TabsTrigger>
          </TabsList>
          
          <TabsContent value="trends" className="space-y-6">
            {/* Participation Trend */}
            <Card className="glass-card">
              <CardHeader>
                <CardTitle>참여 트렌드</CardTitle>
              </CardHeader>
              <CardContent>
                <ChartComponents.LineChart
                  data={analytics?.participationTrend || []}
                  xKey="date"
                  yKeys={["participants", "completions"]}
                  colors={["#3b82f6", "#10b981"]}
                />
              </CardContent>
            </Card>
            
            {/* Category Distribution */}
            <Card className="glass-card">
              <CardHeader>
                <CardTitle>카테고리별 분포</CardTitle>
              </CardHeader>
              <CardContent>
                <ChartComponents.PieChart
                  data={analytics?.surveysByCategory?.map(item => ({
                    name: getCategoryName(item.category),
                    value: item.count
                  })) || []}
                />
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="surveys" className="space-y-6">
            {/* Top Performing Surveys */}
            <Card className="glass-card">
              <CardHeader>
                <CardTitle>인기 설문 TOP 10</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {analytics?.topSurveys?.map((survey, index) => (
                    <div key={survey.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold text-sm">
                          {index + 1}
                        </div>
                        <div>
                          <h4 className="font-medium">{survey.title}</h4>
                          <Badge className={getCategoryColor(survey.category)} variant="secondary">
                            {getCategoryName(survey.category)}
                          </Badge>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold text-blue-600">{survey.participants}</div>
                        <div className="text-sm text-gray-500">{survey.completionRate}% 완료</div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            
            {/* Category Performance */}
            <Card className="glass-card">
              <CardHeader>
                <CardTitle>카테고리별 성과</CardTitle>
              </CardHeader>
              <CardContent>
                <ChartComponents.BarChart
                  data={analytics?.surveysByCategory?.map(item => ({
                    name: getCategoryName(item.category),
                    surveys: item.count,
                    participants: item.participants
                  })) || []}
                  xKey="name"
                  yKeys={["surveys", "participants"]}
                  colors={["#f59e0b", "#3b82f6"]}
                />
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="users" className="space-y-6">
            {/* Age Demographics */}
            <Card className="glass-card">
              <CardHeader>
                <CardTitle>연령별 분포</CardTitle>
              </CardHeader>
              <CardContent>
                <ChartComponents.BarChart
                  data={analytics?.userDemographics?.age || []}
                  xKey="range"
                  yKeys={["count"]}
                  colors={["#8b5cf6"]}
                />
              </CardContent>
            </Card>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Gender Demographics */}
              <Card className="glass-card">
                <CardHeader>
                  <CardTitle>성별 분포</CardTitle>
                </CardHeader>
                <CardContent>
                  <ChartComponents.PieChart
                    data={analytics?.userDemographics?.gender?.map(item => ({
                      name: item.gender === 'male' ? '남성' : item.gender === 'female' ? '여성' : '기타',
                      value: item.count
                    })) || []}
                  />
                </CardContent>
              </Card>
              
              {/* Location Demographics */}
              <Card className="glass-card">
                <CardHeader>
                  <CardTitle>지역별 분포</CardTitle>
                </CardHeader>
                <CardContent>
                  <ChartComponents.PieChart
                    data={analytics?.userDemographics?.location?.slice(0, 8) || []}
                  />
                </CardContent>
              </Card>
            </div>
          </TabsContent>
          
          <TabsContent value="engagement" className="space-y-6">
            {/* Engagement Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="glass-card">
                <CardHeader>
                  <CardTitle>평균 설문 시간</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-blue-600">
                    {Math.round((analytics?.engagementMetrics?.avgTimePerSurvey || 0) / 60)}분
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                    사용자당 평균 설문 참여 시간
                  </p>
                </CardContent>
              </Card>
              
              <Card className="glass-card">
                <CardHeader>
                  <CardTitle>재방문율</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-green-600">
                    {analytics?.engagementMetrics?.returnUserRate || 0}%
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                    7일 내 재방문 사용자 비율
                  </p>
                </CardContent>
              </Card>
              
              <Card className="glass-card">
                <CardHeader>
                  <CardTitle>공유율</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-purple-600">
                    {analytics?.engagementMetrics?.shareRate || 0}%
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                    설문 공유한 사용자 비율
                  </p>
                </CardContent>
              </Card>
            </div>
            
            {/* Platform Usage */}
            <Card className="glass-card">
              <CardHeader>
                <CardTitle>플랫폼별 사용량</CardTitle>
              </CardHeader>
              <CardContent>
                <ChartComponents.PieChart
                  data={analytics?.engagementMetrics?.mobilevVsDesktop?.map(item => ({
                    name: item.platform === 'mobile' ? '모바일' : '데스크톱',
                    value: item.count
                  })) || []}
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
      
      <BottomNav />
    </div>
  );
}