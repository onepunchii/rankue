import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";

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

export function DatabaseStatus() {
  const { data: dbStatus, isLoading, error, refetch } = useQuery({
    queryKey: ["/api/admin/db-status"],
    queryFn: () => adminFetch("/api/admin/db-status"),
  });

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-lg">데이터베이스 상태를 확인하는 중...</div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">데이터베이스 상태</h1>
            <p className="text-gray-600">PostgreSQL 데이터베이스 연결 및 상태 확인</p>
          </div>
          <Button onClick={() => refetch()} disabled={isLoading}>
            <i className="fas fa-sync-alt mr-2"></i>
            새로고침
          </Button>
        </div>

        {/* 연결 상태 카드 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              {error ? (
                <>
                  <i className="fas fa-exclamation-triangle text-red-500 mr-2"></i>
                  데이터베이스 연결 오류
                </>
              ) : dbStatus?.status === "connected" ? (
                <>
                  <i className="fas fa-check-circle text-green-500 mr-2"></i>
                  데이터베이스 연결 정상
                </>
              ) : (
                <>
                  <i className="fas fa-question-circle text-yellow-500 mr-2"></i>
                  상태 확인 중
                </>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {error ? (
              <div className="space-y-2">
                <p className="text-red-600">연결 오류가 발생했습니다:</p>
                <code className="bg-red-50 p-2 rounded text-sm block">
                  {error.message}
                </code>
              </div>
            ) : dbStatus ? (
              <div className="space-y-4">
                <div>
                  <p className="text-green-600 font-medium">{dbStatus.message}</p>
                  <p className="text-sm text-gray-500">
                    마지막 확인: {new Date(dbStatus.timestamp).toLocaleString('ko-KR')}
                  </p>
                </div>

                {/* 데이터베이스 통계 */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <div className="flex items-center">
                      <i className="fas fa-poll text-blue-600 text-xl mr-3"></i>
                      <div>
                        <h3 className="font-medium text-gray-900">총 설문 수</h3>
                        <p className="text-2xl font-bold text-blue-600">
                          {dbStatus.stats?.totalSurveys?.toLocaleString() || 0}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-green-50 p-4 rounded-lg">
                    <div className="flex items-center">
                      <i className="fas fa-users text-green-600 text-xl mr-3"></i>
                      <div>
                        <h3 className="font-medium text-gray-900">총 사용자 수</h3>
                        <p className="text-2xl font-bold text-green-600">
                          {dbStatus.stats?.totalUsers?.toLocaleString() || 0}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-purple-50 p-4 rounded-lg">
                    <div className="flex items-center">
                      <i className="fas fa-chart-line text-purple-600 text-xl mr-3"></i>
                      <div>
                        <h3 className="font-medium text-gray-900">총 참여 수</h3>
                        <p className="text-2xl font-bold text-purple-600">
                          {dbStatus.stats?.totalParticipations?.toLocaleString() || 0}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 연결 정보 */}
                <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                  <h3 className="font-medium text-gray-900 mb-2">연결 정보</h3>
                  <div className="space-y-1 text-sm text-gray-600">
                    <p><strong>데이터베이스:</strong> PostgreSQL (Neon)</p>
                    <p><strong>ORM:</strong> Drizzle ORM</p>
                    <p><strong>상태:</strong> <span className="text-green-600 font-medium">정상 작동</span></p>
                  </div>
                </div>
              </div>
            ) : (
              <p>데이터를 불러오는 중...</p>
            )}
          </CardContent>
        </Card>

        {/* 테이블 목록 */}
        <Card>
          <CardHeader>
            <CardTitle>주요 테이블 목록</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <h4 className="font-medium text-gray-900">사용자 관련</h4>
                <ul className="space-y-1 text-sm text-gray-600">
                  <li><i className="fas fa-table mr-2"></i>profiles (회원 프로필)</li>
                  <li><i className="fas fa-table mr-2"></i>sessions (세션 관리)</li>
                </ul>
              </div>

              <div className="space-y-2">
                <h4 className="font-medium text-gray-900">설문 관련</h4>
                <ul className="space-y-1 text-sm text-gray-600">
                  <li><i className="fas fa-table mr-2"></i>surveys (설문 정보)</li>
                  <li><i className="fas fa-table mr-2"></i>survey_questions (설문 질문)</li>
                  <li><i className="fas fa-table mr-2"></i>survey_responses (설문 응답)</li>
                  <li><i className="fas fa-table mr-2"></i>user_survey_participation (참여 기록)</li>
                </ul>
              </div>

              <div className="space-y-2">
                <h4 className="font-medium text-gray-900">게임화 시스템</h4>
                <ul className="space-y-1 text-sm text-gray-600">
                  <li><i className="fas fa-table mr-2"></i>lottery_tickets (로또 티켓)</li>
                  <li><i className="fas fa-table mr-2"></i>lottery_draws (로또 추첨)</li>
                </ul>
              </div>

              <div className="space-y-2">
                <h4 className="font-medium text-gray-900">콘텐츠 관련</h4>
                <ul className="space-y-1 text-sm text-gray-600">
                  <li><i className="fas fa-table mr-2"></i>assembly_bills (국회 법률안)</li>
                  <li><i className="fas fa-table mr-2"></i>friend_referrals (친구 추천)</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}