import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import MobileHeader from "@/components/mobile-header";
import BottomNav from "@/components/bottom-nav";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import ChartComponents from "@/components/chart-components";
import { Survey } from "@shared/schema";

export default function SurveyDetailResult() {
  const { id } = useParams();
  const surveyId = parseInt(id!);

  const { data: survey, isLoading: surveyLoading } = useQuery<Survey & { questions: any[] }>({
    queryKey: [`/api/surveys/${surveyId}`],
  });

  const { data: analytics = [], isLoading: analyticsLoading } = useQuery<any[]>({
    queryKey: [`/api/surveys/${surveyId}/analytics`],
  });

  const { data: stats } = useQuery<{ totalParticipants: number; completed: number }>({
    queryKey: [`/api/surveys/${surveyId}/stats`],
  });

  if (surveyLoading || analyticsLoading) {
    return (
      <div className="min-h-screen bg-background dark:bg-gray-900">
        <MobileHeader />
        <div className="max-w-md mx-auto p-4">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
            <div className="h-32 bg-gray-200 dark:bg-gray-700 rounded-2xl"></div>
            <div className="h-64 bg-gray-200 dark:bg-gray-700 rounded-2xl"></div>
            <div className="h-40 bg-gray-200 dark:bg-gray-700 rounded-2xl"></div>
          </div>
        </div>
        <BottomNav />
      </div>
    );
  }

  if (!survey) {
    return (
      <div className="min-h-screen bg-background dark:bg-gray-900">
        <MobileHeader />
        <div className="max-w-md mx-auto p-4 text-center pt-20">
          <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
            <i className="fas fa-exclamation-triangle text-gray-400 text-xl"></i>
          </div>
          <h3 className="text-lg font-semibold text-gray-600 dark:text-gray-300 mb-2">설문을 찾을 수 없습니다</h3>
          <Link href="/surveys">
            <Button className="mt-4">설문 목록으로 돌아가기</Button>
          </Link>
        </div>
        <BottomNav />
      </div>
    );
  }

  const getCategoryInfo = (category: string) => {
    switch (category) {
      case 'fun': return { name: 'Fun Poll', color: 'yellow', bgColor: 'bg-yellow-500', icon: 'fas fa-smile' };
      case 'life': return { name: 'Life Poll', color: 'green', bgColor: 'bg-green-500', icon: 'fas fa-heart' };
      case 'deep': return { name: 'Deep Poll', color: 'red', bgColor: 'bg-red-500', icon: 'fas fa-user-secret' };
      case 'location': return { name: '내 지역', color: 'blue', bgColor: 'bg-blue-500', icon: 'fas fa-map-marker-alt' };
      case 'policy': return { name: '국가 정책조사', color: 'emerald', bgColor: 'bg-emerald-500', icon: 'fas fa-landmark' };
      default: return { name: 'Survey', color: 'gray', bgColor: 'bg-gray-500', icon: 'fas fa-poll' };
    }
  };

  const categoryInfo = getCategoryInfo(survey.category);
  const completionRate = stats?.totalParticipants ? Math.round((stats.completed / stats.totalParticipants) * 100) : 0;

  return (
    <div className="min-h-screen bg-background dark:bg-gray-900 transition-colors">
      <MobileHeader />
      
      <main className="max-w-md mx-auto pb-20">
        {/* Header */}
        <section className="px-4 py-6">
          <div className="flex items-center justify-between mb-6">
            <Link href="/surveys">
              <Button variant="ghost" size="sm" className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
                <i className="fas fa-arrow-left mr-2"></i>
                뒤로
              </Button>
            </Link>
            <div className="flex space-x-2">
              <Button variant="ghost" size="sm" className="text-yellow-500 hover:text-yellow-600">
                <i className="fas fa-share-alt mr-2"></i>
                공유
              </Button>
              <Button variant="ghost" size="sm" className="text-blue-500 hover:text-blue-600">
                <i className="fas fa-download mr-2"></i>
                저장
              </Button>
            </div>
          </div>
        </section>

        {/* Survey Info Card */}
        <section className="px-4 mb-6">
          <Card className="shadow-soft border-0 bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900">
            <CardContent className="p-6">
              <div className="flex items-start space-x-4">
                <div className={`w-12 h-12 ${categoryInfo.bgColor} rounded-2xl flex items-center justify-center`}>
                  <i className={`${categoryInfo.icon} text-white text-lg`}></i>
                </div>
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-2">
                    <Badge className={`${categoryInfo.bgColor} text-white border-0`}>
                      {categoryInfo.name}
                    </Badge>
                    <Badge variant="outline" className="bg-green-50 text-green-600 border-green-200 dark:bg-green-900/20 dark:text-green-400">
                      완료
                    </Badge>
                  </div>
                  <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{survey.title}</h1>
                  <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{survey.description}</p>
                </div>
              </div>

              <div className="mt-6 pt-6 border-t border-gray-100 dark:border-gray-700">
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-500">{stats?.totalParticipants || 0}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">총 참여자</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-500">{completionRate}%</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">완료율</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-yellow-500">{survey.points}P</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">리워드</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Detailed Question Analysis */}
        <section className="px-4 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-gray-800 dark:text-white">상세 분석</h3>
            <Badge variant="outline" className="text-xs">
              {analytics.length}개 질문
            </Badge>
          </div>
          
          <div className="space-y-4">
            {analytics.map((result, index) => {
              // 질문 텍스트에서 카테고리 헤더 파싱
              const lines = result.question?.split('\n\n') || [];
              const hasCategory = lines[0]?.match(/^[📝📞🌟😊🚗🏘️🏛️💰🐕💝]/);
              const categoryHeader = hasCategory ? lines[0] : null;
              const actualQuestion = hasCategory ? lines.slice(1).join('\n\n') : result.question;
              
              // 이전 질문과 카테고리가 다른지 확인 (새 섹션 시작)
              const previousResult = index > 0 ? analytics[index - 1] : null;
              const previousCategory = previousResult?.question?.split('\n\n')[0];
              const isNewSection = !previousCategory || previousCategory !== categoryHeader;
              
              // 카테고리별 색상 정의
              const getCategoryStyle = (header: string | null) => {
                if (!header) return 'shadow-soft overflow-hidden';
                if (header.includes('📝')) return 'shadow-soft overflow-hidden border border-blue-200 dark:border-blue-800';
                if (header.includes('📞')) return 'shadow-soft overflow-hidden border border-emerald-200 dark:border-emerald-800';
                if (header.includes('🌟')) return 'shadow-soft overflow-hidden border border-amber-200 dark:border-amber-800';
                if (header.includes('😊')) return 'shadow-soft overflow-hidden border border-pink-200 dark:border-pink-800';
                if (header.includes('🚗')) return 'shadow-soft overflow-hidden border border-cyan-200 dark:border-cyan-800';
                if (header.includes('🏘️')) return 'shadow-soft overflow-hidden border border-violet-200 dark:border-violet-800';
                if (header.includes('🏛️')) return 'shadow-soft overflow-hidden border border-indigo-200 dark:border-indigo-800';
                if (header.includes('💰')) return 'shadow-soft overflow-hidden border border-green-200 dark:border-green-800';
                if (header.includes('🐕')) return 'shadow-soft overflow-hidden border border-orange-200 dark:border-orange-800';
                if (header.includes('💝')) return 'shadow-soft overflow-hidden border border-rose-200 dark:border-rose-800';
                return 'shadow-soft overflow-hidden';
              };
              
              return (
                <div key={result.questionId}>
                  {/* 카테고리 헤더 (새 섹션 시작시에만 표시) */}
                  {isNewSection && categoryHeader && (
                    <div className="mb-3 mt-6 first:mt-0">
                      <h2 className="text-lg font-bold text-gray-700 dark:text-gray-200 px-1">
                        {categoryHeader}
                      </h2>
                      <div className="h-1 w-16 bg-gradient-to-r from-pink-500 to-purple-500 rounded-full mt-2"></div>
                    </div>
                  )}
                  
                  <Card className={getCategoryStyle(categoryHeader)}>
                    <CardContent className="p-0">
                      {/* Question Header */}
                      <div className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-700 px-6 py-4 border-b border-gray-100 dark:border-gray-600">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center space-x-2 mb-2">
                              <span className="w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-xs font-semibold">
                                {index + 1}
                              </span>
                              <Badge variant="outline" className="text-xs">
                                {result.type === 'single_choice' ? '단일 선택' : 
                                 result.type === 'multiple_choice' ? '다중 선택' : '텍스트'}
                              </Badge>
                            </div>
                            <h4 className="font-semibold text-gray-900 dark:text-white text-sm leading-relaxed whitespace-pre-wrap">
                              {actualQuestion}
                            </h4>
                          </div>
                          <div className="text-right ml-4">
                            <div className="text-sm font-semibold text-gray-600 dark:text-gray-300">
                              {result.totalResponses}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">응답</div>
                          </div>
                        </div>
                      </div>

                      {/* Question Results */}
                      <div className="p-6">
                    {result.type === 'single_choice' || result.type === 'multiple_choice' ? (
                      <div className="space-y-4">
                        {/* Visualization */}
                        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                          <ChartComponents.BarChart 
                            data={Object.entries(result.results).map(([option, count], idx) => ({
                              name: option,
                              value: count as number,
                              color: ['#FFB800', '#4CAF50', '#FF6B6B', '#2196F3', '#9C27B0', '#FF9800'][idx % 6]
                            }))}
                          />
                        </div>
                        
                        {/* Detailed Breakdown */}
                        <div className="space-y-3">
                          {Object.entries(result.results)
                            .sort(([,a], [,b]) => (b as number) - (a as number))
                            .map(([option, count], idx) => {
                              const percentage = Math.round((count as number / result.totalResponses) * 100);
                              const isTop = idx === 0;
                              return (
                                <div key={option} className={`p-3 rounded-lg border ${isTop ? 'bg-yellow-50 border-yellow-200 dark:bg-yellow-900/10 dark:border-yellow-800' : 'bg-white border-gray-100 dark:bg-gray-800 dark:border-gray-700'}`}>
                                  <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center space-x-2">
                                      {isTop && <i className="fas fa-crown text-yellow-500 text-sm"></i>}
                                      <span className="font-medium text-gray-900 dark:text-white text-sm">
                                        {option}
                                      </span>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                      <span className="font-bold text-gray-900 dark:text-white">
                                        {count}명
                                      </span>
                                      <span className="text-sm text-gray-500 dark:text-gray-400">
                                        ({percentage}%)
                                      </span>
                                    </div>
                                  </div>
                                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                                    <div 
                                      className={`h-2 rounded-full ${isTop ? 'bg-yellow-500' : 'bg-blue-500'}`}
                                      style={{ width: `${percentage}%` }}
                                    ></div>
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      </div>
                    ) : (
                      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                        <div className="flex items-center space-x-3 mb-3">
                          <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                            <i className="fas fa-comment text-white text-sm"></i>
                          </div>
                          <div>
                            <h5 className="font-semibold text-blue-700 dark:text-blue-300">
                              텍스트 응답 분석
                            </h5>
                            <p className="text-sm text-blue-600 dark:text-blue-400">
                              {result.totalResponses}개의 텍스트 응답이 수집되었습니다
                            </p>
                          </div>
                        </div>
                        <div className="text-xs text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30 rounded p-2">
                          💡 텍스트 응답은 개별적으로 검토되며, 키워드 분석 및 감정 분석을 통해 인사이트를 제공합니다.
                        </div>
                      </div>
                    )}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              );
            })}
          </div>
        </section>

        {/* Advanced Insights */}
        <section className="px-4 mb-6">
          <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-4">고급 인사이트</h3>
          
          <div className="space-y-4">
            {/* Participation Analysis */}
            <Card className="shadow-soft border-l-4 border-l-blue-500">
              <CardContent className="p-4">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/20 rounded-full flex items-center justify-center">
                    <i className="fas fa-chart-line text-blue-500 text-lg"></i>
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-gray-900 dark:text-white mb-1">참여도 분석</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {completionRate >= 80 ? '🎉 매우 높은 완료율! 참여자들이 설문에 높은 관심을 보였습니다.' : 
                       completionRate >= 60 ? '👍 양호한 완료율을 보이고 있습니다.' : 
                       '💡 완료율 개선을 위한 설문 최적화를 고려해보세요.'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Time Analysis */}
            <Card className="shadow-soft border-l-4 border-l-green-500">
              <CardContent className="p-4">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center">
                    <i className="fas fa-clock text-green-500 text-lg"></i>
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-gray-900 dark:text-white mb-1">소요 시간</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      평균 완료 시간: 약 {Math.max(1, Math.ceil((survey.questions?.length || 3) * 0.5))}분 
                      • 적정 길이의 설문으로 평가됩니다
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Category Performance */}
            <Card className="shadow-soft border-l-4 border-l-yellow-500">
              <CardContent className="p-4">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-yellow-100 dark:bg-yellow-900/20 rounded-full flex items-center justify-center">
                    <i className={`${categoryInfo.icon} text-yellow-500 text-lg`}></i>
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-gray-900 dark:text-white mb-1">{categoryInfo.name} 성과</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {survey.category === 'fun' ? '재미있는 주제로 높은 참여도를 이끌어냈습니다!' :
                       survey.category === 'life' ? '일상 생활과 관련된 실용적인 인사이트를 제공했습니다.' :
                       survey.category === 'deep' ? '깊이 있는 주제로 의미 있는 데이터를 수집했습니다.' :
                       '지역별 특성을 잘 반영한 설문이었습니다.'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Action Buttons */}
        <section className="px-4 mb-6">
          <div className="grid grid-cols-2 gap-3">
            <Link href="/surveys">
              <Button variant="outline" className="w-full">
                <i className="fas fa-list mr-2"></i>
                다른 설문 보기
              </Button>
            </Link>
            <Button className="w-full bg-yellow-500 hover:bg-yellow-600 text-white">
              <i className="fas fa-plus mr-2"></i>
              설문 만들기
            </Button>
          </div>
        </section>
      </main>

      <BottomNav />
    </div>
  );
}