import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useState } from "react";

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

export function AdminSurveys() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");

  const { data: surveys, isLoading, refetch } = useQuery({
    queryKey: ["/api/admin/surveys", searchTerm, selectedCategory],
    queryFn: () => adminFetch(`/api/admin/surveys?search=${searchTerm}&category=${selectedCategory}`),
  });

  const { data: stats } = useQuery({
    queryKey: ["/api/admin/survey-stats"],
    queryFn: () => adminFetch("/api/admin/survey-stats"),
  });

  const handleDeleteSurvey = async (surveyId: number) => {
    if (!confirm('정말로 이 설문을 삭제하시겠습니까?')) return;
    
    try {
      await fetch(`/api/admin/surveys/${surveyId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      refetch();
    } catch (error) {
      console.error('설문 삭제 오류:', error);
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'fun': return 'bg-yellow-100 text-yellow-800';
      case 'life': return 'bg-green-100 text-green-800';
      case 'deep': return 'bg-red-100 text-red-800';
      case 'politics': return 'bg-blue-100 text-blue-800';
      case 'policy': return 'bg-emerald-100 text-emerald-800';
      case 'location': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getCategoryName = (category: string) => {
    switch (category) {
      case 'fun': return '재미 설문';
      case 'life': return '라이프 설문';
      case 'deep': return '딥 설문';
      case 'politics': return '정치 설문';
      case 'policy': return '정책 설문';
      case 'location': return '지역 설문';
      default: return category;
    }
  };

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-lg">설문 데이터를 불러오는 중...</div>
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
            <h1 className="text-2xl font-bold text-gray-900">설문 관리</h1>
            <p className="text-gray-600">전체 설문 조회, 수정, 삭제</p>
          </div>
          <Button onClick={() => refetch()}>
            <i className="fas fa-sync-alt mr-2"></i>
            새로고침
          </Button>
        </div>

        {/* 통계 카드 */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center">
                  <i className="fas fa-poll text-blue-600 text-xl mr-3"></i>
                  <div>
                    <p className="text-sm text-gray-600">총 설문 수</p>
                    <p className="text-2xl font-bold text-blue-600">
                      {stats.totalSurveys?.toLocaleString() || 0}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center">
                  <i className="fas fa-eye text-green-600 text-xl mr-3"></i>
                  <div>
                    <p className="text-sm text-gray-600">활성 설문</p>
                    <p className="text-2xl font-bold text-green-600">
                      {stats.activeSurveys?.toLocaleString() || 0}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center">
                  <i className="fas fa-users text-purple-600 text-xl mr-3"></i>
                  <div>
                    <p className="text-sm text-gray-600">총 참여 수</p>
                    <p className="text-2xl font-bold text-purple-600">
                      {stats.totalParticipations?.toLocaleString() || 0}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center">
                  <i className="fas fa-chart-line text-orange-600 text-xl mr-3"></i>
                  <div>
                    <p className="text-sm text-gray-600">평균 참여</p>
                    <p className="text-2xl font-bold text-orange-600">
                      {stats.averageParticipation?.toFixed(1) || '0.0'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* 필터 및 검색 */}
        <Card>
          <CardHeader>
            <CardTitle>설문 필터</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              <div className="flex-1">
                <Input
                  placeholder="설문 제목으로 검색..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <select
                className="px-3 py-2 border rounded-md"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
              >
                <option value="all">모든 카테고리</option>
                <option value="fun">재미 설문</option>
                <option value="life">라이프 설문</option>
                <option value="deep">딥 설문</option>
                <option value="politics">정치 설문</option>
                <option value="policy">정책 설문</option>
                <option value="location">지역 설문</option>
              </select>
            </div>
          </CardContent>
        </Card>

        {/* 설문 목록 */}
        <Card>
          <CardHeader>
            <CardTitle>설문 목록</CardTitle>
          </CardHeader>
          <CardContent>
            {surveys && surveys.length > 0 ? (
              <div className="space-y-4">
                {surveys.map((survey: any) => (
                  <div key={survey.id} className="border rounded-lg p-4 hover:bg-gray-50">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="font-medium text-gray-900">
                            {survey.title}
                          </h3>
                          <Badge className={getCategoryColor(survey.category)}>
                            {getCategoryName(survey.category)}
                          </Badge>
                          {survey.isActive === false && (
                            <Badge variant="secondary">비활성</Badge>
                          )}
                        </div>
                        
                        <p className="text-sm text-gray-600 mb-3">
                          {survey.description}
                        </p>

                        <div className="flex items-center gap-4 text-sm text-gray-500">
                          <span>
                            <i className="fas fa-user mr-1"></i>
                            작성자: {survey.createdBy || '시스템'}
                          </span>
                          <span>
                            <i className="fas fa-users mr-1"></i>
                            참여: {survey.participantCount || 0}명
                          </span>
                          <span>
                            <i className="fas fa-calendar mr-1"></i>
                            생성: {new Date(survey.createdAt).toLocaleDateString('ko-KR')}
                          </span>
                          {survey.endDate && (
                            <span>
                              <i className="fas fa-clock mr-1"></i>
                              마감: {new Date(survey.endDate).toLocaleDateString('ko-KR')}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex gap-2 ml-4">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.open(`/survey/${survey.id}`, '_blank')}
                        >
                          <i className="fas fa-eye mr-1"></i>
                          보기
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-red-600 hover:text-red-700"
                          onClick={() => handleDeleteSurvey(survey.id)}
                        >
                          <i className="fas fa-trash mr-1"></i>
                          삭제
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <i className="fas fa-poll text-gray-400 text-4xl mb-4"></i>
                <p className="text-gray-500">검색 조건에 맞는 설문이 없습니다.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}