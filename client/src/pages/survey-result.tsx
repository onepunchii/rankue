import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import MobileHeader from "@/components/mobile-header";
import BottomNav from "@/components/bottom-nav";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import ChartComponents from "@/components/chart-components";
import ShareSurvey from "@/components/share-survey";
import { Survey } from "@shared/schema";
import { SEOHead } from "@/components/seo-head";
import { apiRequest } from "@/lib/queryClient";
import { queryKeys } from "@/lib/queryKeys";

export default function SurveyResult() {
  const { id } = useParams();
  const surveyId = parseInt(id!);

  const { data: survey, isLoading: surveyLoading } = useQuery<Survey & { questions: any[] }>({
    queryKey: [queryKeys.SURVEY_DETAIL(surveyId)],
    queryFn: () => apiRequest(queryKeys.SURVEY_DETAIL(surveyId)),
  });

  const { data: analytics = [], isLoading: analyticsLoading } = useQuery<any[]>({
    queryKey: [queryKeys.SURVEY_ANALYTICS(surveyId)],
    queryFn: () => apiRequest(queryKeys.SURVEY_ANALYTICS(surveyId)),
  });

  const { data: stats } = useQuery<{ totalParticipants: number; completed: number }>({
    queryKey: [queryKeys.SURVEY_STATS(surveyId)],
    queryFn: () => apiRequest(queryKeys.SURVEY_STATS(surveyId)),
  });

  const { data: demographics } = useQuery<any>({
    queryKey: [queryKeys.SURVEY_DEMOGRAPHICS(surveyId)],
    queryFn: () => apiRequest(queryKeys.SURVEY_DEMOGRAPHICS(surveyId)),
  });

  if (surveyLoading || analyticsLoading) {
    return (
      <div className="min-h-screen bg-black">
        <MobileHeader />
        <div className="max-w-md mx-auto p-4 flex flex-col items-center justify-center min-h-[60vh]">
          <div className="animate-spin w-8 h-8 border-2 border-white/10 border-t-purple-500 rounded-full mb-4"></div>
          <p className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em]">데이터 인텔리전스 동기화 중...</p>
        </div>
        <BottomNav />
      </div>
    );
  }

  if (!survey) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center p-8">
        <div className="w-20 h-20 rounded-3xl bg-white/5 flex items-center justify-center mb-6">
          <i className="fas fa-ghost text-2xl text-white/20"></i>
        </div>
        <h3 className="text-xl font-black text-white italic tracking-tighter uppercase mb-2">데이터 파편을 찾을 수 없음</h3>
        <p className="text-xs text-white/40 uppercase tracking-widest text-center mb-8">요청하신 분석 보고서를 사용할 수 없거나 아카이브되었습니다.</p>
        <Link href="/results">
          <Button className="h-12 px-8 bg-white text-black hover:bg-purple-600 hover:text-white font-black rounded-2xl transition-all">
            분석 허브로 돌아가기
          </Button>
        </Link>
      </div>
    );
  }

  const getCategoryInfo = (category: string) => {
    switch (category) {
      case 'fun': return { name: '재미 투표', color: 'yellow', bgColor: 'bg-yellow-500' };
      case 'life': return { name: '생활 투표', color: 'green', bgColor: 'bg-green-500' };
      case 'deep': return { name: '심층 분석', color: 'red', bgColor: 'bg-red-500' };
      case 'location': return { name: '지역 투표', color: 'blue', bgColor: 'bg-blue-500' };
      case 'policy': return { name: '국가 정책', color: 'emerald', bgColor: 'bg-emerald-500' };
      default: return { name: '설문조사', color: 'gray', bgColor: 'bg-gray-500' };
    }
  };

  const categoryInfo = getCategoryInfo(survey.category);
  const totalParticipants = stats?.totalParticipants || 0;
  const completionRate = totalParticipants > 0 ? Math.round(((stats?.completed || 0) / totalParticipants) * 100) : 0;

  const resultStructuredData = survey ? {
    "@context": "https://schema.org",
    "@type": "AnalysisNewsArticle",
    "headline": `${survey.title} - 설문 결과 분석`,
    "description": `${survey.title} 설문조사의 참여 결과와 통계 분석입니다.`,
    "author": {
      "@type": "Organization",
      "name": "Polli"
    },
    "publisher": {
      "@type": "Organization",
      "name": "Polli",
      "url": "https://polli.replit.app"
    },
    "url": `https://polli.replit.app/survey/${survey.id}/result`,
    "datePublished": survey.createdAt,
    "mainEntity": {
      "@type": "Dataset",
      "name": `${survey.title} 설문 데이터`,
      "description": `총 ${stats?.totalParticipants || 0}명이 참여한 설문 결과`,
      "creator": {
        "@type": "Organization",
        "name": "Polli"
      }
    }
  } : {};

  return (
    <div className="min-h-screen bg-black transition-colors relative overflow-hidden">
      {/* Background Blobs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] bg-purple-600/10 blur-[120px] rounded-full animate-pulse"></div>
        <div className="absolute bottom-[20%] left-[-10%] w-[40%] h-[40%] bg-blue-600/10 blur-[120px] rounded-full"></div>
      </div>

      <SEOHead
        title={`${survey.title} - 설문 결과 | Polli 설문조사 분석`}
        description={`${survey.title} 설문조사의 결과를 확인하세요. 총 ${stats?.totalParticipants || 0}명이 참여했으며, 완료율은 ${completionRate}%입니다. 상세한 통계와 분석 결과를 제공합니다.`}
        keywords={`${survey.title}, 설문 결과, 설문 분석, 통계, 데이터 분석, ${categoryInfo.name}`}
        url={`https://polli.replit.app/survey/${survey.id}/result`}
        type="article"
        structuredData={resultStructuredData}
      />

      <MobileHeader />

      <main className="max-w-md mx-auto pb-24 relative z-10">
        {/* Navigation */}
        <section className="px-6 py-4 flex items-center justify-between sticky top-0 bg-black/40 backdrop-blur-xl border-b border-white/5 z-20">
          <Link href="/results">
            <button className="flex items-center space-x-2 text-white/40 hover:text-white transition-all group">
              <i className="fas fa-arrow-left text-xs group-hover:-translate-x-1 transition-transform"></i>
              <span className="text-[10px] font-black uppercase tracking-widest">분석 리포트 허브</span>
            </button>
          </Link>
          <div className="flex items-center space-x-3">
            <ShareSurvey survey={survey} />
          </div>
        </section>

        {/* Hero Section */}
        <section className="px-8 pt-12 pb-14 text-center">
          <div className="inline-flex items-center px-3 py-1 bg-purple-600/20 border border-purple-500/20 rounded-lg mb-8">
            <span className="text-[8px] font-black text-purple-400 uppercase tracking-[0.2em]">{categoryInfo.name} 분석 보고서</span>
          </div>

          <h1 className="text-3xl font-black text-white italic tracking-tighter leading-[1] mb-8 uppercase">
            {survey.title}
          </h1>

          <p className="text-sm text-white/40 font-bold leading-relaxed max-w-[90%] mx-auto mb-10 uppercase tracking-tight">
            {survey.description}
          </p>

          {survey.newsSourceUrl && (
            <a
              href={survey.newsSourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center space-x-3 px-8 py-4 bg-white/5 border border-white/10 hover:bg-white/10 text-white rounded-2xl transition-all group"
            >
              <i className="fas fa-newspaper text-xs text-purple-400 group-hover:scale-110 transition-transform"></i>
              <span className="text-xs font-black uppercase tracking-widest">분석 원문 보기</span>
            </a>
          )}
        </section>

        {/* Stats Grid */}
        <section className="px-6 mb-12">
          <div className="glass-card-strong border border-white/10 p-8 rounded-[2rem] relative overflow-hidden">
            <div className="flex items-center space-x-3 mb-10">
              <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-500/20 flex items-center justify-center">
                <i className="fas fa-chart-pie text-purple-400"></i>
              </div>
              <h3 className="text-[10px] font-black text-white/60 uppercase tracking-widest">통합 지표 분석</h3>
            </div>

            <div className="grid grid-cols-3 gap-8">
              <div className="space-y-1">
                <div className="text-[9px] text-white/20 font-black uppercase tracking-widest">참여자</div>
                <div className="text-2xl font-black text-white italic tracking-tighter">{totalParticipants}</div>
              </div>
              <div className="space-y-1">
                <div className="text-[9px] text-white/20 font-black uppercase tracking-widest">완료</div>
                <div className="text-2xl font-black text-white italic tracking-tighter">{stats?.completed || 0}</div>
              </div>
              <div className="space-y-1 text-right">
                <div className="text-[9px] text-purple-500/40 font-black uppercase tracking-widest">완료율</div>
                <div className="text-2xl font-black text-purple-500 italic tracking-tighter">{completionRate}%</div>
              </div>
            </div>

            <div className="mt-10 pt-8 border-t border-white/5 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <i className="fas fa-gem text-xs text-purple-500 animate-pulse"></i>
                <span className="text-[9px] text-white/40 font-black uppercase tracking-widest">보상 임계치</span>
              </div>
              <div className="text-base font-black text-white italic tracking-tighter">
                {survey.experienceReward || 0} <span className="text-[9px] not-italic text-white/40 ml-1 uppercase">EXP 포인트</span>
              </div>
            </div>
          </div>
        </section>

        {/* Analytic Segments */}
        <section className="px-6 space-y-12">
          <div className="flex items-center space-x-4 mb-4">
            <h3 className="text-xs font-black text-white/40 uppercase tracking-[0.3em]">항목별 상세 분석</h3>
            <div className="h-px flex-1 bg-white/5"></div>
          </div>

          {analytics.length > 0 ? (
            <div className="space-y-10">
              {analytics.map((result, index) => {
                const lines = result.question?.split('\n\n') || [];
                const hasCategory = lines[0]?.match(/^[📝📞🌟😊🚗🏘️🏛️💰🐕💝]/);
                const categoryHeader = hasCategory ? lines[0] : null;
                const actualQuestion = hasCategory ? lines.slice(1).join('\n\n') : result.question;

                const previousResult = index > 0 ? analytics[index - 1] : null;
                const previousCategory = previousResult?.question?.split('\n\n')[0];
                const isNewSection = !previousCategory || previousCategory !== categoryHeader;

                return (
                  <div key={result.questionId || index} className="space-y-6">
                    {/* Section Label */}
                    {isNewSection && categoryHeader && (
                      <div className="pt-8 first:pt-0">
                        <div className="inline-flex items-center space-x-3 px-3 py-1 bg-white/5 border border-white/5 rounded-full mb-6">
                          <span className="text-[8px] font-black text-white/60 tracking-[0.2em] uppercase">{categoryHeader} 섹션</span>
                        </div>
                      </div>
                    )}

                    <div className="glass-card-strong border border-white/10 p-8 rounded-[2rem] overflow-hidden relative group">
                      <div className="absolute top-0 right-0 p-10 opacity-[0.02] pointer-events-none group-hover:opacity-[0.05] transition-opacity select-none">
                        <span className="text-9xl font-black">Q{index + 1}</span>
                      </div>

                      <div className="relative z-10">
                        <div className="mb-10">
                          <div className="flex items-start justify-between gap-6 mb-2">
                            <h4 className="text-lg font-black text-white leading-[1.1] uppercase tracking-tighter max-w-[85%]">
                              {actualQuestion}
                            </h4>
                          </div>
                          <div className="flex items-center space-x-3">
                            <div className="w-1.5 h-1.5 rounded-full bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.5)]"></div>
                            <span className="text-[9px] font-black text-white/20 uppercase tracking-[0.2em]">{result.totalResponses || 0}개의 응답 분석됨</span>
                          </div>
                        </div>

                        {result.type === 'single_choice' || result.type === 'multiple_choice' ? (
                          <div className="space-y-6">
                            {result.results && Object.keys(result.results).length > 0 ? (
                              <>
                                {/* Highlight Card */}
                                {(() => {
                                  const sortedResults = Object.entries(result.results)
                                    .map(([option, count]) => ({ option, count: count as number }))
                                    .sort((a, b) => b.count - a.count);
                                  const topChoice = sortedResults[0];
                                  const topPercentage = result.totalResponses > 0 ?
                                    Math.round((topChoice.count / result.totalResponses) * 100) : 0;

                                  return (
                                    <div className="bg-purple-500/10 border border-purple-500/20 rounded-2xl p-6 relative overflow-hidden group/top">
                                      <div className="absolute top-0 right-0 p-4 opacity-10 group-hover/top:scale-110 transition-transform">
                                        <i className="fas fa-crown text-2xl text-purple-400"></i>
                                      </div>
                                      <div className="relative z-10 space-y-4">
                                        <div className="text-[8px] font-black text-purple-400 uppercase tracking-[0.2em]">우세한 여론</div>
                                        <div className="flex items-end justify-between">
                                          <div className="text-xl font-black text-white uppercase leading-none max-w-[70%]">{topChoice.option}</div>
                                          <div className="text-4xl font-black text-white italic tracking-tighter leading-none">{topPercentage}%</div>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })()}

                                <div className="space-y-4">
                                  {Object.entries(result.results)
                                    .map(([option, count]) => ({ option, count: count as number }))
                                    .sort((a, b) => b.count - a.count)
                                    .map(({ option, count }, idx) => {
                                      const percentage = result.totalResponses > 0 ?
                                        Math.round((count / result.totalResponses) * 100) : 0;

                                      return (
                                        <div key={option} className="bg-white/5 border border-white/5 rounded-2xl p-6 hover:bg-white/10 transition-all group/opt relative active:scale-[0.98]">
                                          <div className="flex items-center justify-between mb-4">
                                            <span className="text-[11px] font-black text-white/70 uppercase group-hover/opt:text-white transition-colors">{option}</span>
                                            <span className="text-lg font-black text-white italic leading-none">{percentage}%</span>
                                          </div>
                                          <div className="w-full bg-white/5 rounded-full h-1.5 overflow-hidden">
                                            <div
                                              className="bg-purple-600 h-full rounded-full transition-all duration-1000 shadow-[0_0_12px_rgba(147,51,234,0.4)] w-[var(--progress-width)]"
                                              style={{ "--progress-width": `${percentage}%` } as React.CSSProperties}
                                            ></div>
                                          </div>
                                          <div className="mt-2 text-right">
                                            <span className="text-[8px] text-white/20 font-black uppercase tracking-widest">{count} 응답 수집됨</span>
                                          </div>
                                        </div>
                                      );
                                    })}
                                </div>
                              </>
                            ) : (
                              <div className="bg-white/5 border border-white/5 rounded-2xl p-10 text-center">
                                <i className="fas fa-database text-white/10 text-xl mb-4"></i>
                                <p className="text-[9px] text-white/20 font-black uppercase tracking-widest">응답 데이터를 가공 중입니다...</p>
                              </div>
                            )}
                          </div>
                        ) : result.type === 'text' ? (
                          <div className="bg-white/5 border border-white/5 rounded-3xl p-8 text-center group/text hover:border-white/20 transition-all">
                            <i className="fas fa-brain text-purple-400/40 text-2xl mb-6 group-hover/text:scale-110 transition-transform"></i>
                            <div className="space-y-2">
                              <span className="text-[9px] font-black text-purple-400 uppercase tracking-[0.2em] mb-2 block">NLP 자연어 분석 진행 중</span>
                              <p className="text-xs text-white/40 font-bold uppercase leading-relaxed">
                                {result.totalResponses || 0}개의 정성적 응답이 의미론적 통찰을 위해 처리되고 있습니다.
                              </p>
                            </div>
                          </div>
                        ) : (
                          <div className="bg-white/5 border border-white/5 rounded-2xl p-8 text-center">
                            <p className="text-[9px] text-white/20 font-black uppercase tracking-widest uppercase">암호화 보호 데이터</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="glass-card-strong border border-white/10 p-20 text-center rounded-[2.5rem]">
              <div className="w-20 h-20 rounded-3xl bg-white/5 flex items-center justify-center mx-auto mb-8 animate-pulse">
                <i className="fas fa-radar text-3xl text-white/10"></i>
              </div>
              <h4 className="text-[10px] font-black text-white/30 uppercase tracking-[0.3em] mb-2">데이터 수집 위성 가동 중...</h4>
              <p className="text-[8px] text-white/10 font-black uppercase tracking-widest">실시간 데이터 동기화 적용 중</p>
            </div>
          )}
        </section>

        {/* Demographics Area */}
        {demographics && demographics.stats && demographics.stats.totalParticipants > 0 && (
          <section className="px-6 mt-20 mb-12">
            <div className="flex items-center space-x-4 mb-10">
              <h3 className="text-xs font-black text-white/40 uppercase tracking-[0.3em]">참여자 아키타이프</h3>
              <div className="h-px flex-1 bg-white/5"></div>
            </div>

            <div className="glass-card-strong border border-white/10 p-8 rounded-[2rem] space-y-12">
              {/* Age Archetypes */}
              <div className="space-y-6">
                <div className="flex items-center space-x-3">
                  <i className="fas fa-history text-[10px] text-purple-400"></i>
                  <span className="text-[10px] font-black text-white uppercase tracking-widest">세대별 코호트 분석</span>
                </div>
                <div className="grid gap-5">
                  {Object.entries(demographics.stats?.byAge || {}).map(([age, count]: [string, any]) => (
                    <div key={age} className="space-y-2">
                      <div className="flex items-center justify-between text-[11px] font-black text-white/60 uppercase">
                        <span>{age}</span>
                        <span className="italic text-white">{demographics.percentages?.byAge?.[age] || 0}%</span>
                      </div>
                      <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-white opacity-40 rounded-full transition-all duration-1000 w-[var(--demographic-width)]"
                          style={{ "--demographic-width": `${demographics.percentages?.byAge?.[age] || 0}%` } as React.CSSProperties}
                        ></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Gender Fluidity */}
              <div className="space-y-6">
                <div className="flex items-center space-x-3">
                  <i className="fas fa-venus-mars text-[10px] text-purple-400"></i>
                  <span className="text-[10px] font-black text-white uppercase tracking-widest">성별 분포</span>
                </div>
                <div className="flex gap-4">
                  {Object.entries(demographics.stats?.byGender || {}).map(([gender, count]: [string, any]) => (
                    <div key={gender} className="flex-1 bg-white/5 border border-white/5 p-5 rounded-2xl text-center flex flex-col items-center justify-center space-y-2">
                      <div className="text-[9px] font-black text-white/20 uppercase tracking-[0.2em]">{gender}</div>
                      <div className="text-xl font-black text-white italic tracking-tighter">{demographics.percentages?.byGender?.[gender] || 0}%</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Geo Mapping */}
              <div className="space-y-6">
                <div className="flex items-center space-x-3">
                  <i className="fas fa-map-marked-alt text-[10px] text-purple-400"></i>
                  <span className="text-[10px] font-black text-white uppercase tracking-widest">지역별 거점</span>
                </div>
                <div className="space-y-4">
                  {Object.entries(demographics.stats?.byRegion || {})
                    .sort(([, a], [, b]) => (b as number) - (a as number))
                    .slice(0, 3)
                    .map(([region, count]: [string, any]) => (
                      <div key={region} className="flex items-center justify-between p-4 bg-white/5 border border-white/5 rounded-2xl">
                        <span className="text-xs font-black text-white uppercase tracking-tighter">{region}</span>
                        <div className="flex items-center space-x-4">
                          <div className="w-24 h-1 bg-white/5 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-purple-500 rounded-full shadow-[0_0_8px_rgba(168,85,247,0.4)] w-[var(--region-width)]"
                              style={{ "--region-width": `${demographics.percentages?.byRegion?.[region] || 0}%` } as React.CSSProperties}
                            ></div>
                          </div>
                          <span className="text-[11px] font-black text-purple-400 italic">
                            {demographics.percentages?.byRegion?.[region] || 0}%
                          </span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Intelligence Summary */}
        <section className="px-6 mt-16 pb-12">
          <div className="glass-card-strong border border-white/20 p-10 rounded-[2.5rem] bg-gradient-to-br from-purple-500/10 to-transparent">
            <div className="flex items-center space-x-4 mb-8">
              <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center">
                <i className="fas fa-infinity text-black text-xl"></i>
              </div>
              <div>
                <h4 className="text-base font-black text-white uppercase italic tracking-tighter">종합적 인사이트</h4>
                <div className="text-[9px] font-black text-purple-400 uppercase tracking-[0.3em]">AI 기반 데이터 융합 분석</div>
              </div>
            </div>

            <p className="text-sm text-white/70 font-bold uppercase leading-[1.6] tracking-tight mb-8">
              본 분석은 현재 표본 모집단 사이에서 {totalParticipants >= 100 ? '강력한' : '발전 중인'} 여론 일치성을 나타내고 있습니다.
              {completionRate}%의 데이터 무결성 스코어를 바탕으로, 수집된 행동 패턴은
              {categoryInfo.name} 분야에서 {completionRate >= 80 ? ' 매우 정교하고 신뢰할 수 있는 정보 제공 의지' : ' 표준적 참여 수준'}를
              보여줍니다. {demographics?.insights?.mostCommonAge ? `주요 영향력은 ${demographics.insights.mostCommonAge} 아키타이프에서 기인합니다.` : ''}
            </p>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-black/40 border border-white/10 rounded-2xl text-center">
                <div className="text-[9px] font-black text-white/20 uppercase tracking-widest mb-1">데이터 신뢰도</div>
                <div className="text-lg font-black text-white italic">{totalParticipants >= 50 ? '높음' : '보통'}</div>
              </div>
              <div className="p-4 bg-black/40 border border-white/10 rounded-2xl text-center">
                <div className="text-[9px] font-black text-white/20 uppercase tracking-widest mb-1">여론 변동성</div>
                <div className="text-lg font-black text-white italic">{completionRate >= 70 ? '안정적' : '유동적'}</div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <BottomNav />
    </div>
  );
}