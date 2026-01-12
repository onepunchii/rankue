import { useState, useEffect, useRef } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import MobileHeader from "@/components/mobile-header";
import BottomNav from "@/components/bottom-nav";
import SurveyCard from "@/components/survey-card";
import { SEOHead } from "@/components/seo-head";
import { Button } from "@/components/ui/button";
import { Survey } from "@shared/schema";

type SortType = 'recent' | 'timeLeft';

export default function Surveys() {
  const { user } = useAuth();
  const [hideCompleted, setHideCompleted] = useState(false);
  const [sortBy, setSortBy] = useState<SortType>('recent');
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // 무한 스크롤 데이터 로딩
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    refetch,
  } = useInfiniteQuery({
    queryKey: ["/api/surveys/paginated", sortBy],
    queryFn: async ({ pageParam = 1 }) => {
      const response = await fetch(`/api/surveys/paginated?page=${pageParam}&limit=20&sortBy=${sortBy}`);
      if (!response.ok) throw new Error('Failed to fetch surveys');
      return response.json();
    },
    getNextPageParam: (lastPage) => {
      return lastPage.hasMore ? lastPage.page + 1 : undefined;
    },
    initialPageParam: 1,
  });

  // Simple Auth 사용자 참여 데이터 가져오기
  const { data: userParticipations = [] } = useQuery({
    queryKey: ["/api/auth/user/participations", user?.id],
    queryFn: async () => {
      const token = document.cookie.split('polli_token=')[1]?.split(';')[0] || '';
      const response = await fetch(`/api/auth/user/participations`, {
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${token}`,
        }
      });
      if (!response.ok) throw new Error('Failed to fetch participations');
      return response.json();
    },
    staleTime: 5000,
    enabled: !!user && !user.isGuest,
    refetchOnWindowFocus: false,
  });

  // 참여한 설문 ID 목록 (Map to handle potential casing differences)
  const participatedSurveyIds = userParticipations.map((p: any) => p.surveyId || p.survey_id);

  // 모든 설문 통합
  const allSurveys = data?.pages.flatMap(page => page.surveys) || [];
  const totalCount = data?.pages[0]?.total || 0;

  // 참여완료 설문 필터링
  const displaySurveys = hideCompleted
    ? allSurveys.filter(survey => !participatedSurveyIds.includes(survey.id))
    : allSurveys;

  // Intersection Observer로 무한 스크롤 구현
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 }
    );

    const currentRef = loadMoreRef.current;
    if (currentRef) {
      observer.observe(currentRef);
    }

    return () => {
      if (currentRef) {
        observer.unobserve(currentRef);
      }
    };
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black text-white selection:bg-purple-500/30">
        <MobileHeader />
        <div className="fixed inset-0 flex items-center justify-center z-50">
          <div className="flex flex-col items-center gap-6 animate-in fade-in zoom-in duration-500">
            <div className="relative w-20 h-20">
              {/* Outer Glow Ring */}
              <div className="absolute inset-0 border-[6px] border-purple-500/10 rounded-full"></div>
              {/* Animated Gradient Spinner */}
              <div className="absolute inset-0 border-[6px] border-t-purple-500 border-r-indigo-400 border-b-transparent border-l-transparent rounded-full animate-spin shadow-[0_0_30px_rgba(168,85,247,0.4)]"></div>
              {/* Inner Counter-Rotating Ring */}
              <div className="absolute inset-3 border-4 border-t-indigo-400 border-l-purple-500 border-b-transparent border-r-transparent rounded-full animate-spin opacity-40 [animation-direction:reverse] [animation-duration:1.5s]"></div>
            </div>
            <div className="space-y-2 text-center">
              <h2 className="text-xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-indigo-400">
                POLLI DISCOVERY
              </h2>
              <div className="flex justify-center gap-1.5 opacity-50">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce [animation-delay:0ms]"></span>
                <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce [animation-delay:200ms]"></span>
                <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce [animation-delay:400ms]"></span>
              </div>
            </div>
          </div>
        </div>
        <BottomNav />
      </div>
    );
  }

  const surveysStructuredData = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "name": "설문조사 목록",
    "description": "다양한 카테고리의 설문조사에 참여하고 포인트를 획득하세요",
    "url": "https://polli.replit.app/surveys",
    "mainEntity": {
      "@type": "ItemList",
      "numberOfItems": totalCount,
      "itemListElement": allSurveys.slice(0, 10).map((survey, index) => ({
        "@type": "ListItem",
        "position": index + 1,
        "item": {
          "@type": "Survey",
          "name": survey.title,
          "description": survey.description,
          "url": `https://polli.replit.app/survey/${survey.id}`
        }
      }))
    }
  };

  return (
    <div className="min-h-screen bg-black text-white selection:bg-purple-500/30">
      <SEOHead
        title="설문조사 목록 - Polli | 다양한 설문에 참여하고 포인트 획득"
        description="폴리에서 제공하는 다양한 카테고리의 설문조사에 참여하세요. 최신 설문을 확인하고 포인트를 획득하세요."
        keywords="설문조사 목록, 최신 설문, 투표 참여, 포인트 적립"
        structuredData={surveysStructuredData}
      />

      {/* Dynamic Background Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-purple-600/20 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute top-[20%] -right-[10%] w-[35%] h-[35%] bg-blue-600/10 rounded-full blur-[100px]" />
        <div className="absolute -bottom-[10%] left-[20%] w-[40%] h-[40%] bg-pink-600/10 rounded-full blur-[120px] animate-pulse-slow" />
      </div>

      <MobileHeader />

      <main className="max-w-md mx-auto pb-24 relative z-10">
        {/* Header Section */}
        <section className="px-6 py-8">
          <div className="glass-card p-8 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 rounded-full blur-3xl -z-10 group-hover:bg-purple-500/20 transition-all duration-500" />

            <div className="flex flex-col gap-6">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-3xl font-black text-white tracking-tighter mb-1">전체 설문</h1>
                  <p className="text-sm text-white/40 font-medium">최신 트렌드를 확인하세요</p>
                </div>
                <div
                  className="w-14 h-14 rounded-xl bg-purple-600 flex items-center justify-center shadow-lg shadow-purple-500/30"
                >
                  <i className="fas fa-poll text-white text-xl"></i>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex-1 px-4 py-3 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between">
                  <span className="text-xs font-bold text-white/40 uppercase tracking-widest">TOTAL</span>
                  <span className="text-xl font-black text-purple-400">{totalCount}개</span>
                </div>

                <button
                  onClick={() => setHideCompleted(!hideCompleted)}
                  className={`flex-1 h-12 rounded-xl flex items-center justify-center gap-2 border transition-all duration-300 font-bold text-sm
                    ${hideCompleted
                      ? 'bg-purple-600 border-purple-500 text-white shadow-lg shadow-purple-500/20'
                      : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                    }`}
                >
                  <i className={`${hideCompleted ? 'fas fa-eye-slash' : 'fas fa-eye'}`}></i>
                  {hideCompleted ? '참여제외' : '전체보기'}
                </button>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => setSortBy('recent')}
                  className={`flex-1 h-14 rounded-2xl flex items-center justify-center gap-2 transition-all duration-500 border ${sortBy === 'recent'
                    ? 'bg-purple-600/10 border-purple-500/20 text-purple-400 shadow-[0_0_25px_rgba(168,85,247,0.15)] ring-1 ring-purple-500/20'
                    : 'bg-white/5 border-white/5 text-white/20'
                    }`}
                >
                  <i className={`fas fa-clock text-xs ${sortBy === 'recent' ? 'animate-pulse' : ''}`}></i>
                  <span className="font-black italic tracking-tighter text-sm uppercase">최신등록순</span>
                </button>
                <button
                  onClick={() => setSortBy('timeLeft')}
                  className={`flex-1 h-14 rounded-2xl flex items-center justify-center gap-2 transition-all duration-500 border ${sortBy === 'timeLeft'
                    ? 'bg-indigo-600/10 border-indigo-500/20 text-indigo-400 shadow-[0_0_25px_rgba(99,102,241,0.15)] ring-1 ring-indigo-500/20'
                    : 'bg-white/5 border-white/5 text-white/20'
                    }`}
                >
                  <i className={`fas fa-hourglass-half text-xs ${sortBy === 'timeLeft' ? 'animate-bounce' : ''}`}></i>
                  <span className="font-black italic tracking-tighter text-sm uppercase">마감임박순</span>
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Survey List */}
        <section className="px-6 space-y-4">
          {displaySurveys.map((survey, index) => (
            <div key={survey.id} className="relative">
              <SurveyCard
                survey={survey}
                isParticipated={participatedSurveyIds.includes(survey.id)}
              />

              {sortBy === 'recent' && index < 3 && (
                <div className="absolute top-4 right-4 pointer-events-none">
                  <div className="px-2 py-0.5 rounded-full bg-purple-500 text-[10px] font-black text-white shadow-lg shadow-purple-500/20">
                    NEW
                  </div>
                </div>
              )}
            </div>
          ))}
        </section>

        {/* 로딩 인디케이터 (Premium Scroll Spinner) */}
        <div ref={loadMoreRef} className="py-20 text-center relative overflow-hidden">
          {isFetchingNextPage ? (
            <div className="flex flex-col items-center justify-center gap-5">
              <div className="relative w-14 h-14">
                {/* Outer Glow Ring */}
                <div className="absolute inset-0 border-4 border-white/5 rounded-full"></div>
                {/* Animated Gradient Spinner */}
                <div className="absolute inset-0 border-4 border-t-cyan-400 border-r-purple-500 border-b-transparent border-l-transparent rounded-full animate-spin shadow-[0_0_20px_rgba(34,211,238,0.3)]"></div>
                {/* Inner Counter-Rotating Ring */}
                <div className="absolute inset-2 border-2 border-t-purple-500 border-l-cyan-400 border-b-transparent border-r-transparent rounded-full animate-spin opacity-40" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }}></div>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-black text-cyan-400/60 tracking-[0.4em] uppercase animate-pulse italic">
                  Refreshing Lists
                </p>
                <div className="flex justify-center gap-1.5">
                  <span className="w-1 h-1 rounded-full bg-cyan-400/40 animate-bounce" style={{ animationDelay: '0ms' }}></span>
                  <span className="w-1 h-1 rounded-full bg-cyan-400/40 animate-bounce" style={{ animationDelay: '200ms' }}></span>
                  <span className="w-1 h-1 rounded-full bg-cyan-400/40 animate-bounce" style={{ animationDelay: '400ms' }}></span>
                </div>
              </div>
            </div>
          ) : hasNextPage ? (
            <Button
              onClick={() => fetchNextPage()}
              className="bg-white/5 border border-white/10 text-white/40 hover:text-white hover:bg-white/10 rounded-2xl px-10 h-14 font-black italic tracking-tighter transition-all"
            >
              SHOW MORE SURVEYS
            </Button>
          ) : displaySurveys.length > 0 ? (
            <div className="flex flex-col items-center gap-4">
              <div className="h-[1px] w-12 bg-white/10"></div>
              <p className="text-[10px] font-black text-white/20 uppercase tracking-[0.5em] italic">
                End of discoveries
              </p>
            </div>
          ) : null}
        </div>

        {displaySurveys.length === 0 && !isLoading && (
          <div className="glass-card text-center py-20 px-8">
            <div
              className="w-20 h-20 rounded-[2rem] bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mx-auto mb-6 shadow-2xl"
            >
              <i className="fas fa-search text-2xl text-purple-400"></i>
            </div>
            <h3 className="text-xl font-black text-white mb-2 tracking-tight">설문이 없습니다</h3>
            <p className="text-sm text-white/40 leading-relaxed">
              {hideCompleted ? '모든 설문에 참여하셨습니다!' : '곧 새로운 설문이 추가될 예정입니다.'}
            </p>
          </div>
        )}
      </main>

      <BottomNav />
    </div >
  );
}
