import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from "recharts";

// 어드민 API 요청 함수 (세션 기반)
const adminFetch = async (url: string) => {
  const response = await fetch(url, {
    credentials: 'include', // 세션 쿠키 포함
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch: ${response.statusText}`);
  }

  return response.json();
};

export function AdminDashboard() {
  const { data: dashboardStats, isLoading: isDashboardLoading } = useQuery({
    queryKey: ["/api/admin/dashboard-stats"],
    queryFn: () => adminFetch("/api/admin/dashboard-stats"),
  });

  const { data: surveyStats, isLoading: isSurveyLoading } = useQuery({
    queryKey: ["/api/admin/survey-stats"],
    queryFn: () => adminFetch("/api/admin/survey-stats"),
  });

  const { data: userStats, isLoading: isUserLoading } = useQuery({
    queryKey: ["/api/admin/user-stats"],
    queryFn: () => adminFetch("/api/admin/user-stats"),
  });

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

  // 로딩 상태 처리
  if (isDashboardLoading || isSurveyLoading || isUserLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-lg">데이터를 불러오는 중...</div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* 헤더 */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">대시보드</h1>
          <p className="text-gray-600">Polli 플랫폼 전체 현황을 확인하세요</p>
        </div>

        {/* 통계 카드 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">총 설문 수</CardTitle>
              <i className="fas fa-poll text-blue-600"></i>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{dashboardStats?.totalSurveys || 0}</div>
              <p className="text-xs text-muted-foreground">
                +{dashboardStats?.newSurveysThisMonth || 0} 이번 달
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">총 참여 수</CardTitle>
              <i className="fas fa-users text-green-600"></i>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{dashboardStats?.totalParticipations || 0}</div>
              <p className="text-xs text-muted-foreground">
                +{dashboardStats?.newParticipationsThisMonth || 0} 이번 달
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">활성 사용자</CardTitle>
              <i className="fas fa-user-friends text-purple-600"></i>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{dashboardStats?.activeUsers || 0}</div>
              <p className="text-xs text-muted-foreground">
                최근 7일간
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">평균 참여율</CardTitle>
              <i className="fas fa-chart-line text-orange-600"></i>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{dashboardStats?.averageParticipationRate || 0}%</div>
              <p className="text-xs text-muted-foreground">
                전체 설문 기준
              </p>
            </CardContent>
          </Card>
        </div>

        {/* 차트 섹션 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 일별 참여 추이 */}
          <Card>
            <CardHeader>
              <CardTitle>일별 참여 추이</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={dashboardStats?.dailyParticipations || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="count" stroke="#8884d8" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* 카테고리별 설문 분포 */}
          <Card>
            <CardHeader>
              <CardTitle>카테고리별 설문 분포</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={surveyStats?.categoryDistribution || []}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="count"
                  >
                    {(surveyStats?.categoryDistribution || []).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* 사용자 통계 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 연령대별 사용자 분포 */}
          <Card>
            <CardHeader>
              <CardTitle>연령대별 사용자 분포</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={userStats?.ageDistribution || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="ageGroup" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="count" fill="#0088FE" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* 성별 분포 */}
          <Card>
            <CardHeader>
              <CardTitle>성별 사용자 분포</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={userStats?.genderDistribution || []}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="count"
                  >
                    {(userStats?.genderDistribution || []).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* 최근 활동 */}
        <Card>
          <CardHeader>
            <CardTitle>최근 설문 활동</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {dashboardStats?.recentSurveys?.map((survey) => (
                <div key={survey.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <h4 className="font-medium">{survey.title}</h4>
                    <p className="text-sm text-gray-600">
                      {survey.category} • {survey.participantCount}명 참여
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">{survey.createdAt}</p>
                    <p className="text-xs text-gray-500">{survey.createdBy}</p>
                  </div>
                </div>
              )) || (
                <p className="text-gray-500 text-center py-4">최근 활동이 없습니다.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}