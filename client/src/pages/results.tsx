import { useState, useEffect, useRef, useCallback } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import MobileHeader from "@/components/mobile-header";
import BottomNav from "@/components/bottom-nav";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Survey } from "@shared/schema";
import ChartComponents from "@/components/chart-components";
import { SEOHead } from "@/components/seo-head";

function FeaturedResult({ survey }: { survey: Survey }) {
  const { data: stats } = useQuery<{ totalParticipants: number; completed: number }>({
    queryKey: [`/api/surveys/${survey.id}/stats`],
  });

  const { data: analytics = [] } = useQuery<any[]>({
    queryKey: [`/api/surveys/${survey.id}/analytics`],
  });

  const getTimeAgo = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) return `${diffDays}d ago`;
    if (diffHours > 0) return `${diffHours}h ago`;
    return 'Just now';
  };

  const firstQuestion = analytics[0];
  const chartData = firstQuestion?.results && Object.keys(firstQuestion.results).length > 0
    ? Object.entries(firstQuestion.results).map(([option, count], idx) => ({
      name: option,
      value: count as number,
      color: ['rgba(168, 85, 247, 1)', 'rgba(139, 92, 246, 1)', 'rgba(124, 58, 237, 1)', 'rgba(109, 40, 217, 1)'][idx % 4]
    }))
    : [{ name: 'No Data', value: 1, color: 'rgba(255, 255, 255, 0.1)' }];

  return (
    <section className="px-4 mb-10">
      <div className="flex items-center justify-between mb-6 px-2">
        <h2 className="text-lg font-black text-white italic tracking-tight flex items-center text-left">
          <i className="fas fa-crown mr-3 text-purple-500"></i>
          FEATURED REPORT
        </h2>
      </div>
      <div className="glass-card border border-white/10 overflow-hidden shadow-2xl">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-black text-white leading-tight text-left">
              {survey.title}
            </h3>
            <span className="text-[10px] font-black bg-purple-600/20 text-purple-400 px-3 py-1 rounded-lg border border-purple-500/20 uppercase tracking-widest shrink-0 ml-4">
              {survey.votingEndDate ? getTimeAgo(new Date(survey.votingEndDate)) : 'Active'}
            </span>
          </div>

          {firstQuestion?.results && Object.keys(firstQuestion.results).length > 0 ? (
            <div className="space-y-4 mb-8">
              <div className="text-sm font-black text-white/40 uppercase tracking-widest mb-6 text-left">
                Primary Question Analytics
              </div>

              <div className="space-y-3">
                {Object.entries(firstQuestion.results)
                  .sort(([, a], [, b]) => (b as number) - (a as number))
                  .slice(0, 3)
                  .map(([option, count], idx) => {
                    const resultsObj = firstQuestion.results as Record<string, number>;
                    const totalResponses = Object.values(resultsObj).reduce((sum: number, c) => sum + c, 0);
                    const percentage = totalResponses > 0 ? Math.round(((count as number) / totalResponses) * 100) : 0;
                    const colors = ['bg-purple-500', 'bg-blue-500', 'bg-indigo-500'];

                    return (
                      <div key={option} className="bg-white/5 border border-white/5 rounded-2xl p-5 hover:bg-white/10 transition-all cursor-default text-left">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-sm font-black text-white/80">
                            {option}
                          </span>
                          <div className="flex items-center space-x-2">
                            <span className="text-lg font-black text-white italic">{percentage}%</span>
                          </div>
                        </div>
                        <div className="w-full bg-white/5 rounded-full h-1.5 overflow-hidden">
                          <div
                            className={`${colors[idx]} h-full rounded-full transition-all duration-1000 shadow-[0_0_10px_rgba(168,85,247,0.3)]`}
                            style={{ width: `${percentage}%` }}
                          ></div>
                        </div>
                        <div className="mt-2 text-right">
                          <span className="text-[10px] text-white/20 font-bold uppercase tracking-widest">{count as number} RESPONSES</span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          ) : (
            <div className="bg-white/5 border border-white/5 rounded-2xl p-10 mb-8 text-center">
              <div className="animate-spin w-8 h-8 border-2 border-white/10 border-t-purple-500 rounded-full mx-auto mb-4"></div>
              <p className="text-xs text-white/20 font-black uppercase tracking-widest">Compiling Analytics...</p>
            </div>
          )}

          <div className="pt-6 border-t border-white/5">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center space-x-4">
                <div className="text-left">
                  <div className="text-[9px] text-white/20 font-black uppercase tracking-widest mb-1">Users</div>
                  <div className="text-lg font-black text-white italic leading-none">{stats?.totalParticipants || 0}</div>
                </div>
                <div className="text-left">
                  <div className="text-[9px] text-white/20 font-black uppercase tracking-widest mb-1">Rate</div>
                  <div className="text-lg font-black text-white italic leading-none">
                    {stats?.totalParticipants ? Math.round(((stats.completed || 0) / stats.totalParticipants) * 100) : 0}%
                  </div>
                </div>
              </div>
              <Link href={`/survey-result/${survey.id}`}>
                <Button
                  className="h-12 px-6 bg-white text-black hover:bg-purple-600 hover:text-white font-black text-xs rounded-xl transition-all shadow-xl shadow-white/5 uppercase tracking-tighter"
                >
                  Full Report
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function Results() {
  const [searchTerm, setSearchTerm] = useState("");
  const observerTarget = useRef<HTMLDivElement>(null);

  // 무한 스크롤 쿼리
  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage
  } = useInfiniteQuery({
    queryKey: ['/api/surveys/completed'],
    queryFn: async ({ pageParam = 1 }) => {
      const response = await fetch(`/api/surveys/completed?page=${pageParam}&limit=20`);
      if (!response.ok) throw new Error('Failed to fetch surveys');
      return response.json();
    },
    getNextPageParam: (lastPage) => lastPage.hasMore ? lastPage.page + 1 : undefined,
    initialPageParam: 1,
  });

  // 무한 스크롤 관찰자
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 }
    );

    const currentTarget = observerTarget.current;
    if (currentTarget) {
      observer.observe(currentTarget);
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget);
      }
    };
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const { data: todayParticipants = 0 } = useQuery<number>({
    queryKey: ["/api/stats/today-participants"],
    select: (data: any) => data?.count || 0,
  });

  const { data: categoryCounts = {} } = useQuery<{ [key: string]: number }>({
    queryKey: ["/api/surveys/category-counts"],
  });

  // 모든 페이지의 설문 병합
  const allSurveys = data?.pages.flatMap(page => page.surveys) || [];

  // 검색 필터 적용
  const filteredSurveys = allSurveys.filter(survey => {
    const matchesSearch = survey.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      survey.description?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });

  // 첫 번째 설문을 featured로 표시
  const featuredSurvey = allSurveys[0];

  // Calculate total surveys and find most popular category
  const totalSurveys = Object.values(categoryCounts).reduce((sum, count) => sum + count, 0);
  const mostPopularCategory = Object.entries(categoryCounts).reduce((max, [category, count]) =>
    count > (categoryCounts[max] || 0) ? category : max, 'life');

  const getCategoryDisplayName = (category: string) => {
    switch (category) {
      case 'fun': return 'Fun Poll';
      case 'life': return 'Life Poll';
      case 'deep': return 'Deep Poll';
      case 'location': return '내 지역';
      default: return 'Survey';
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black text-white relative flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-white/5 border-t-purple-500 rounded-full mx-auto mb-6"></div>
          <p className="text-sm text-white/40 font-black uppercase tracking-[0.2em]">Synchronizing Data...</p>
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white relative overflow-hidden">
      <SEOHead
        title="설문 결과 - Polli"
        description="완료된 설문의 결과를 확인하고 다양한 의견을 살펴보세요"
        keywords="설문결과,투표결과,여론조사,통계,분석"
      />

      {/* Background Blobs */}
      <div className="fixed top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-purple-600/10 blur-[120px] rounded-full animate-pulse"></div>
        <div className="absolute bottom-[-5%] right-[-5%] w-[40%] h-[40%] bg-blue-600/10 blur-[100px] rounded-full animate-pulse blur-delay-2000"></div>
      </div>

      <MobileHeader />

      <main className="relative z-10 max-w-md mx-auto pb-24 pt-8">
        {/* Header */}
        <section className="px-6 mb-10">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-black text-white mb-2 tracking-tighter uppercase italic">REPORT CENTER</h1>
            <p className="text-sm text-white/40 font-bold uppercase tracking-widest">Public Opinion Analytics</p>
          </div>

          {/* Search Bar */}
          <div className="relative group">
            <Input
              type="text"
              placeholder="Search by Title or Keyword..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-14 h-14 w-full rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl text-white placeholder:text-white/20 focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 transition-all font-medium"
            />
            <i className="fas fa-search absolute left-5 top-1/2 transform -translate-y-1/2 text-white/20 group-focus-within:text-purple-500 transition-colors"></i>
          </div>
        </section>

        {/* Featured Result */}
        {featuredSurvey && (
          <div className="mb-8">
            <FeaturedResult survey={featuredSurvey} />
          </div>
        )}

        <section className="px-6 mb-10">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-black text-white italic tracking-tight flex items-center">
              <i className="fas fa-list-ul mr-3 text-white/20"></i>
              ALL REPORTS
            </h2>
            <span className="text-[10px] font-black bg-white/5 text-white/40 px-3 py-1 rounded-lg border border-white/10 uppercase tracking-widest">{filteredSurveys.length} TOTAL</span>
          </div>

          {filteredSurveys.length > 0 ? (
            <>
              <div className="flex flex-col gap-[15px]">
                {filteredSurveys.map((survey) => (
                  <ResultCard key={survey.id} survey={survey} />
                ))}
              </div>

              {/* 무한 스크롤 관찰자 타겟 */}
              <div ref={observerTarget} className="h-10 flex items-center justify-center">
                {isFetchingNextPage && (
                  <div className="flex items-center space-x-2 text-gray-500">
                    <i className="fas fa-spinner fa-spin"></i>
                    <span className="text-sm">불러오는 중...</span>
                  </div>
                )}
              </div>

              {/* 모두 불러옴 표시 */}
              {!hasNextPage && allSurveys.length > 0 && (
                <div className="text-center py-4">
                  <span className="text-sm text-gray-500">모든 결과를 불러왔습니다</span>
                </div>
              )}
            </>
          ) : (
            <div className="glass-card border border-white/10 p-12 text-center shadow-2xl">
              <div className="w-20 h-20 bg-white/5 rounded-3xl flex items-center justify-center mx-auto mb-8">
                <i className="fas fa-search text-3xl text-white/10"></i>
              </div>
              <h3 className="text-xl font-black text-white mb-2 tracking-tight">
                {searchTerm ? 'NO MATCHES FOUND' : 'NO COMPLETED SURVEYS'}
              </h3>
              <p className="text-sm text-white/40 font-medium mb-8 leading-relaxed">
                {searchTerm
                  ? 'Refine your search parameters or explore other keywords.'
                  : 'Wait for active polls to end to view their comprehensive analytics.'
                }
              </p>
              {searchTerm && (
                <Button
                  onClick={() => {
                    setSearchTerm('');
                  }}
                  className="w-full h-14 bg-white text-black hover:bg-purple-600 hover:text-white font-black rounded-2xl transition-all shadow-xl shadow-white/5"
                >
                  RESET DISCOVERY
                </Button>
              )}
            </div>
          )}
        </section>

        {/* Analytics Summary */}
        <section className="px-6 mb-10 pb-12">
          <div className="glass-card border border-white/10 p-8 shadow-2xl">
            <div className="flex items-center space-x-3 mb-8">
              <i className="fas fa-chart-pie text-purple-500"></i>
              <h3 className="text-lg font-black text-white italic tracking-tight uppercase">Platform Stats</h3>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-8">
              <div className="bg-white/5 border border-white/5 p-6 rounded-2xl text-center">
                <div className="text-3xl font-black text-white italic mb-1">{totalSurveys}</div>
                <div className="text-[10px] text-white/30 font-black uppercase tracking-widest">Total Reports</div>
              </div>
              <div className="bg-white/5 border border-white/5 p-6 rounded-2xl text-center">
                <div className="text-3xl font-black text-white italic mb-1">{todayParticipants}</div>
                <div className="text-[10px] text-white/30 font-black uppercase tracking-widest">Today Views</div>
              </div>
            </div>

            <div className="pt-6 border-t border-white/5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-white/30 font-black uppercase tracking-widest">Hottest Category</span>
                <span className="text-xs font-black bg-purple-600/20 text-purple-400 px-4 py-1.5 rounded-xl border border-purple-500/20 uppercase tracking-[0.1em]">
                  {getCategoryDisplayName(mostPopularCategory)}
                </span>
              </div>
            </div>
          </div>
        </section>
      </main>

      <BottomNav />
    </div>
  );
}



function ResultCard({ survey }: { survey: Survey }) {
  const { data: stats } = useQuery<{ totalParticipants: number; completed: number }>({
    queryKey: [`/api/surveys/${survey.id}/stats`],
  });

  const getCategoryName = (category: string) => {
    switch (category) {
      case 'fun': return 'Fun Poll';
      case 'life': return 'Life Poll';
      case 'deep': return 'Deep Poll';
      case 'location': return '내 지역';
      default: return 'Survey';
    }
  };

  const getTimeAgo = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) return `${diffDays}d ago`;
    if (diffHours > 0) return `${diffHours}h ago`;
    return 'Just now';
  };

  return (
    <Link href={`/survey-result/${survey.id}`}>
      <div className="glass-card-light border border-white/5 bg-white/[0.02] p-6 hover:bg-white/5 transition-all group shadow-xl cursor-pointer mb-2">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center space-x-3 mb-4">
              <span className="text-[10px] font-black bg-white/5 text-white/40 px-2.5 py-1 rounded-lg border border-white/5 uppercase tracking-widest">
                {getCategoryName(survey.category)}
              </span>
              <span className="text-[8px] font-black bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/20 uppercase">
                COMPLETED
              </span>
            </div>
            <h4 className="text-base font-black text-white leading-tight mb-4 group-hover:text-purple-400 transition-colors">
              {survey.title}
            </h4>
            <div className="flex items-center space-x-6">
              <div className="flex items-center space-x-2">
                <i className="fas fa-users text-[10px] text-white/20"></i>
                <span className="text-[11px] font-black text-white italic">{stats?.totalParticipants || 0}</span>
              </div>
              <div className="flex items-center space-x-2">
                <i className="fas fa-clock text-[10px] text-white/20"></i>
                <span className="text-[11px] font-bold text-white/40 uppercase tracking-tighter">
                  {survey.votingEndDate ? getTimeAgo(new Date(survey.votingEndDate)) : 'Active'}
                </span>
              </div>
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center group-hover:bg-purple-600 transition-all shadow-lg group-hover:shadow-purple-500/20 shrink-0 ml-4">
            <i className="fas fa-chart-bar text-xs text-white/40 group-hover:text-white"></i>
          </div>
        </div>
      </div>
    </Link>
  );
}
