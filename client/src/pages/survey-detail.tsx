import { useState, useEffect, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { QRCodeSVG } from "qrcode.react";

import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest } from "@/lib/queryClient";
import MobileHeader from "@/components/mobile-header";
import BottomNav from "@/components/bottom-nav";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Survey, SurveyQuestion } from "@shared/schema";
import RewardBadge from "@/components/reward-badge";
import { SEOHead } from "@/components/seo-head";
import ShareSurvey from "@/components/share-survey";

export default function SurveyDetail() {
  const { id, slug } = useParams();
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [responses, setResponses] = useState<Record<number, any>>({});
  const qrCodeRef = useRef<HTMLDivElement>(null);

  // 각 질문 타입별 독립적인 상태 관리를 위한 초기화
  const initializeResponse = (questionId: number, type: string) => {
    if (!responses[questionId]) {
      switch (type) {
        case 'multiple_choice':
          return [];
        case 'ranking':
          return {};
        default:
          return "";
      }
    }
    return responses[questionId];
  };
  const [timeRemaining, setTimeRemaining] = useState<string>("");

  // slug가 있으면 slug로 조회, 없으면 기존 ID로 조회 (호환성)
  const surveyEndpoint = slug ? `/api/survey/by-slug/${slug}` : `/api/surveys/${id}`;

  const { data: survey, isLoading } = useQuery<Survey & { questions: SurveyQuestion[] }>({
    queryKey: [surveyEndpoint],
  });

  // Simple Auth 사용자 참여 상태 확인 (최적화된 단일 요청)
  const { data: participations } = useQuery({
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

  const hasParticipated = participations?.some((p: any) =>
    (p.surveyId === parseInt(id!) || p.survey_id === parseInt(id!)) && p.completedAt
  );

  // 참여 완료 상태로 블러 효과 및 완료 메시지 표시

  const isPublicSurvey = survey?.category === 'enterprise';

  const participateMutation = useMutation({
    mutationFn: async () => {
      console.log('🔄 Starting survey participation for ID:', id);
      const apiUrl = isPublicSurvey
        ? `/api/public-surveys/${id}/participate`
        : `/api/surveys/${id}/participate`;

      console.log(`🎯 Using ${isPublicSurvey ? 'public' : 'member'} API:`, apiUrl);

      const response = await apiRequest(apiUrl, {
        method: "POST",
        body: {},
      });
      console.log('✅ Survey participation response:', response);
      return response;
    },
    onSuccess: (data) => {
      console.log('✅ Survey participation successful');
      if (!isPublicSurvey) {
        // Optimistically update participations cache
        const queryKey = ["/api/auth/user/participations", user?.id];
        queryClient.setQueryData(queryKey, (old: any[] | undefined) => {
          const newParticipation = {
            surveyId: parseInt(id!),
            completedAt: new Date().toISOString(),
            ...data
          };
          return old ? [...old, newParticipation] : [newParticipation];
        });

        // Also invalidate for safety
        queryClient.invalidateQueries({ queryKey: ["/api/auth/user/participations"] });
      }
    },
    onError: (error: any) => {
      console.error('❌ Survey participation error:', error);

      // 공개 설문은 에러가 발생하지 않아야 함
      if (isPublicSurvey) {
        toast({
          title: "오류",
          description: "설문 참여를 시작할 수 없습니다",
          variant: "destructive",
        });
        return;
      }

      // 이미 참여한 설문인 경우 특별 처리
      if (error?.message === "이미 참여한 설문입니다." || error?.status === 400) {
        toast({
          title: "이미 참여한 설문",
          description: "이 설문은 이미 완료하셨습니다",
          variant: "default",
        });
        queryClient.invalidateQueries({ queryKey: ["/api/auth/user/participations"] });
        return;
      }

      // 권한 부족 에러 처리 (403)
      if (error?.status === 403 || error?.needsAuth) {
        const errorMessage = error?.response?.data?.error || "프로필 인증이 필요합니다";
        toast({
          title: "프로필 인증 필요",
          description: errorMessage,
          variant: "destructive",
        });
        setLocation("/profile-setup");
        return;
      }

      toast({
        title: "오류",
        description: "설문 참여를 시작할 수 없습니다",
        variant: "destructive",
      });
    },
  });

  const submitMutation = useMutation({
    mutationFn: async (surveyResponses: any[]) => {
      const apiUrl = isPublicSurvey
        ? `/api/public-surveys/${id}/responses`
        : `/api/surveys/${id}/responses`; // Fixed: Remove /auth from path to match server routes.ts

      console.log(`🎯 Submitting to ${isPublicSurvey ? 'public' : 'member'} API:`, apiUrl);

      const response = await apiRequest(apiUrl, {
        method: "POST",
        body: { responses: surveyResponses },
      });
      return response;
    },
    onSuccess: (data) => {
      // Use survey reward or data from response, defaulting to survey setting if response is generic
      const pointsEarned = data?.experienceGained || data?.pointsEarned || survey?.experienceReward || (survey?.category === 'politics' ? 50 : 30);
      const description = pointsEarned > 0
        ? `${pointsEarned}XP를 획득했습니다!`
        : "소중한 의견 감사합니다!";

      toast({
        title: "설문 완료!",
        description,
      });

      if (!isPublicSurvey) {
        // Optimistically update participations cache for immediate UI overlay
        const queryKey = ["/api/auth/user/participations", user?.id];
        queryClient.setQueryData(queryKey, (old: any[] | undefined) => {
          const newParticipation = {
            surveyId: parseInt(id!),
            completedAt: new Date().toISOString(),
            pointsEarned
          };
          // Filter out any potential duplicates of the same surveyId
          const filtered = (old || []).filter((p: any) => p.surveyId !== parseInt(id!));
          return [...filtered, newParticipation];
        });

        queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
        queryClient.invalidateQueries({ queryKey: ["/api/auth/user/participations"] });
      }

      // Delay navigation slightly to let the user see the "Completed" state if they stay for a split second
      setTimeout(() => {
        setLocation("/surveys");
      }, 1500);
    },
    onError: (error) => {
      // 공개 설문은 에러가 발생하지 않아야 함
      if (isPublicSurvey) {
        toast({
          title: "오류",
          description: "설문 응답을 제출할 수 없습니다",
          variant: "destructive",
        });
        return;
      }

      // 회원 전용 설문 에러 처리
      if ((error as any)?.needsAuth || (error as any)?.status === 403) {
        toast({
          title: "프로필 인증 필요",
          description: "설문 제출은 프로필 인증 후 가능합니다",
          variant: "destructive",
        });
        setLocation("/profile-setup");
        return;
      }
      toast({
        title: "오류",
        description: "설문 응답을 제출할 수 없습니다",
        variant: "destructive",
      });
    },
  });

  // QR 코드 다운로드 함수
  const downloadQRCode = () => {
    const svg = qrCodeRef.current?.querySelector('svg');
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    canvas.width = 512;
    canvas.height = 512;

    img.onload = () => {
      ctx?.drawImage(img, 0, 0);
      canvas.toBlob((blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `survey-${id}-qrcode.png`;
          link.click();
          URL.revokeObjectURL(url);
          toast({
            title: "QR 코드 다운로드",
            description: "QR 코드가 저장되었습니다",
          });
        }
      });
    };

    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  // 단일 선택 응답 처리
  const handleSingleChoiceChange = (questionId: number, value: string) => {
    setResponses(prev => ({
      ...prev,
      [questionId]: value,
    }));
  };

  // 다중 선택 응답 처리  
  const handleMultipleChoiceChange = (questionId: number, option: string, checked: boolean) => {
    setResponses(prev => {
      const currentValues = Array.isArray(prev[questionId]) ? prev[questionId] : [];
      let newValues;

      if (checked === true) {
        // 선택: 배열에 추가 (중복 방지)
        newValues = currentValues.includes(option) ? currentValues : [...currentValues, option];
      } else {
        // 해제: 배열에서 제거
        newValues = currentValues.filter((v: string) => v !== option);
      }

      console.log(`🔄 Multiple choice updated:`, {
        questionId,
        option,
        checked,
        currentValues,
        newValues
      });

      return {
        ...prev,
        [questionId]: newValues,
      };
    });
  };

  // 텍스트 응답 처리
  const handleTextChange = (questionId: number, value: string) => {
    setResponses(prev => ({
      ...prev,
      [questionId]: value,
    }));
  };

  const handleRankingChange = (questionId: number, option: string, rank: string) => {
    setResponses(prev => {
      const currentRankings = prev[questionId] || {};
      const newRankings = { ...currentRankings };

      if (rank && rank !== "") {
        // 기존에 이 순위를 선택한 다른 옵션이 있다면 제거
        Object.keys(newRankings).forEach(existingOption => {
          if (newRankings[existingOption] === rank && existingOption !== option) {
            delete newRankings[existingOption];
          }
        });

        // 현재 옵션에 새 순위 설정
        newRankings[option] = rank;
      } else {
        // 빈 값 선택시 해당 옵션의 순위 제거
        if (newRankings[option]) {
          delete newRankings[option];
        }
      }

      console.log(`🔄 Ranking updated:`, {
        questionId,
        option,
        rank,
        newRankings
      });

      return {
        ...prev,
        [questionId]: newRankings
      };
    });
  };

  const handleSubmit = async () => {
    if (!survey) return;

    // Validate all questions are answered
    const unansweredQuestions = survey.questions.filter(q => !responses[q.id]);
    if (unansweredQuestions.length > 0) {
      toast({
        title: "미완성 설문",
        description: "모든 질문에 답변해주세요",
        variant: "destructive",
      });
      return;
    }

    // Prepare responses for submission
    const surveyResponses = survey.questions.map(question => ({
      questionId: question.id,
      answer: responses[question.id],
    }));

    try {
      // 1. Submit Answers First (Server checks if participation exists, so this must come first)
      await submitMutation.mutateAsync(surveyResponses);

      // 2. Then Mark as Participated & Claim Reward
      if (participateMutation.isIdle) {
        await participateMutation.mutateAsync();
      }
    } catch (error) {
      console.error("Survey submission failed sequence:", error);
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'fun': return 'yellow';
      case 'life': return 'green';
      case 'deep': return 'red';
      default: return 'gray';
    }
  };

  const getCategoryName = (category: string) => {
    switch (category) {
      case 'fun': return '🎉 재미';
      case 'life': return '🏠 생활';
      case 'deep': return '🔍 심층';
      case 'location': return '📍 내 지역';
      case 'policy': return '🏛️ 정책';
      default: return '📋 설문';
    }
  };

  // 남은시간 계산 함수
  const calculateTimeRemaining = (endDate: string) => {
    const now = new Date().getTime();
    const end = new Date(endDate).getTime();
    const diff = end - now;

    if (diff <= 0) {
      return "투표 마감";
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (days > 0) {
      return `${days}일 ${hours}시간`;
    } else if (hours > 0) {
      return `${hours}시간 ${minutes}분`;
    } else if (minutes > 0) {
      return `${minutes}분`;
    } else {
      return "1분 미만";
    }
  };

  // 남은시간 업데이트 (1분마다)
  useEffect(() => {
    if (survey?.votingEndDate) {
      const updateTime = () => {
        setTimeRemaining(calculateTimeRemaining(survey.votingEndDate!.toString()));
      };

      updateTime(); // 즉시 실행
      const interval = setInterval(updateTime, 60000); // 1분마다 업데이트

      return () => clearInterval(interval);
    } else if (survey) {
      // 종료일이 없으면 무기한
      setTimeRemaining("무기한");
    }
  }, [survey?.votingEndDate]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black text-white">
        <MobileHeader />
        <div className="max-w-md mx-auto px-6 pt-8">
          <div className="animate-pulse space-y-6">
            <div className="h-64 bg-white/5 border border-white/10 rounded-3xl"></div>
            <div className="h-96 bg-white/5 border border-white/10 rounded-3xl"></div>
            <div className="h-96 bg-white/5 border border-white/10 rounded-3xl"></div>
          </div>
        </div>
        <BottomNav />
      </div>
    );
  }

  if (!survey) {
    return (
      <div className="min-h-screen bg-black text-white">
        <MobileHeader />
        <div className="max-w-md mx-auto px-6 pt-24 text-center">
          <div className="glass-card p-12 border border-white/10">
            <div className="w-20 h-20 bg-white/5 rounded-3xl flex items-center justify-center mx-auto mb-6">
              <i className="fas fa-search text-white/20 text-3xl"></i>
            </div>
            <h2 className="text-2xl font-black mb-2 tracking-tighter">설문을 찾을 수 없습니다</h2>
            <p className="text-white/40 text-sm font-medium mb-8">요청하신 설문이 존재하지 않거나 종료되었을 수 있습니다.</p>
            <Button
              onClick={() => setLocation("/")}
              className="w-full h-14 rounded-2xl bg-purple-600 hover:bg-purple-700 text-white font-black transition-all"
            >
              홈으로 돌아가기
            </Button>
          </div>
        </div>
        <BottomNav />
      </div>
    );
  }

  const colorClass = getCategoryColor(survey.category);

  const surveyDetailStructuredData = survey ? {
    "@context": "https://schema.org",
    "@type": "Survey",
    "name": survey.title,
    "description": survey.description || "",
    "author": {
      "@type": "Organization",
      "name": "Polli"
    },
    "url": survey.canonicalUrl || `https://polli.replit.app/poll/${survey.slug || survey.id}`,
    "dateCreated": survey.createdAt,
    "category": getCategoryName(survey.category),
    "aggregateRating": {
      "@type": "AggregateRating",
      "ratingValue": "4.5",
      "reviewCount": "100"
    }
  } : {};

  return (
    <div className="min-h-screen bg-black text-white selection:bg-purple-500/30">
      {survey && (
        <SEOHead
          title={survey.seoTitle || `${survey.title} - ${getCategoryName(survey.category)} | Polli 설문조사`}
          description={survey.seoDescription || survey.description || `${getCategoryName(survey.category)} 카테고리의 설문조사에 참여하고 포인트를 획득하세요. ${survey.questions?.length || 0}개의 질문으로 구성된 설문입니다.`}
          keywords={survey.seoKeywords?.join(', ') || `${survey.title}, ${getCategoryName(survey.category)}, 설문 참여, 설문조사, 투표 참여, 포인트 획득`}
          url={survey.canonicalUrl || `https://polli.replit.app/poll/${survey.slug || survey.id}`}
          image={survey.ogImage || `https://polli.replit.app/api/og-image?title=${encodeURIComponent(survey.title)}&category=${survey.category}`}
          type="article"
          structuredData={surveyDetailStructuredData}
        />
      )}

      {/* Dynamic Background Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-purple-600/20 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute top-[20%] -right-[10%] w-[35%] h-[35%] bg-blue-600/10 rounded-full blur-[100px]" />
        <div className="absolute -bottom-[10%] left-[20%] w-[40%] h-[40%] bg-pink-600/10 rounded-full blur-[120px] animate-pulse-slow" />
      </div>

      <MobileHeader />

      <main className="max-w-md mx-auto pb-24 relative z-10">
        {/* Survey Header */}
        <section className="px-6 py-8">
          <div className="glass-card p-8 border border-white/10 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 rounded-full blur-3xl -z-10 group-hover:bg-purple-500/20 transition-all duration-500" />

            <div className="flex flex-col gap-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] px-2 py-1 rounded-lg font-black uppercase tracking-widest border border-purple-500/30 bg-purple-500/10 text-purple-400`}>
                    {getCategoryName(survey.category)}
                  </span>
                  {survey.isAnonymous && (
                    <span className="text-[10px] px-2 py-1 rounded-lg font-black uppercase tracking-widest bg-white/5 text-white/40 border border-white/10">
                      <i className="fas fa-lock mr-1"></i> 익명
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[11px] font-bold text-white/40">
                  <i className="fas fa-clock text-[10px]"></i>
                  <span>{timeRemaining || "계산 중..."}</span>
                </div>
              </div>

              <h1 className="text-3xl font-black text-white tracking-tighter leading-tight mb-2">
                {survey.title}
              </h1>

              {survey.description && (
                <p className="text-sm text-white/40 font-medium leading-relaxed mb-4">
                  {survey.description}
                </p>
              )}
              {survey.newsSourceUrl && (
                <div className="mb-4">
                  <a
                    href={survey.newsSourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-white hover:bg-white/90 text-black text-sm font-black rounded-xl transition-all shadow-lg shadow-white/10"
                  >
                    <i className="fas fa-newspaper text-xs"></i>
                    기사 보기
                  </a>
                </div>
              )}

              {/* AI 기사 분석 */}
              {(survey.aiAnalysisSummary || (survey.aiAnalysisPros && survey.aiAnalysisPros.length > 0) || (survey.aiAnalysisCons && survey.aiAnalysisCons.length > 0)) && (
                <div className="mt-8 space-y-4">
                  <div className="glass-card p-6 border border-white/10 bg-white/5">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
                        <i className="fas fa-robot text-purple-400 text-sm"></i>
                      </div>
                      <h2 className="text-sm font-black text-white/80 tracking-widest uppercase">AI ANALYSIS</h2>
                    </div>

                    {/* 간략 요약 */}
                    {survey.aiAnalysisSummary && (
                      <p className="text-sm text-white/60 font-medium leading-relaxed mb-4">
                        {survey.aiAnalysisSummary}
                      </p>
                    )}

                    {/* 한 줄 요약 */}
                    {survey.aiAnalysisOneLiner && (
                      <div className="pt-4 border-t border-white/10">
                        <p className="text-sm text-white font-bold leading-snug">
                          <span className="text-blue-400 mr-2">💡</span>
                          {survey.aiAnalysisOneLiner}
                        </p>
                      </div>
                    )}

                    {/* 키워드 */}
                    {survey.aiAnalysisKeywords && survey.aiAnalysisKeywords.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-4">
                        {survey.aiAnalysisKeywords.map((keyword, idx) => (
                          <span
                            key={idx}
                            className="px-3 py-1 bg-white/5 text-white/40 border border-white/5 rounded-lg text-[10px] font-black uppercase tracking-wider"
                          >
                            #{keyword}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 장점/단점 */}
                  <div className="grid grid-cols-1 gap-3">
                    {survey.aiAnalysisPros && survey.aiAnalysisPros.length > 0 && (
                      <div className="glass-card p-5 border-emerald-500/20 bg-emerald-500/5">
                        <div className="flex items-center gap-2 mb-3">
                          <i className="fas fa-check-circle text-emerald-400 text-xs"></i>
                          <h3 className="text-xs font-black text-emerald-400 uppercase tracking-widest">장점</h3>
                        </div>
                        <ul className="space-y-2">
                          {survey.aiAnalysisPros.slice(0, 3).map((pro, idx) => (
                            <li key={idx} className="text-xs text-white/60 font-medium flex items-start gap-2">
                              <span className="text-emerald-400/40">•</span>
                              <span className="flex-1">{pro}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {survey.aiAnalysisCons && survey.aiAnalysisCons.length > 0 && (
                      <div className="glass-card p-5 border-red-500/20 bg-red-500/5">
                        <div className="flex items-center gap-2 mb-3">
                          <i className="fas fa-exclamation-circle text-red-400 text-xs"></i>
                          <h3 className="text-xs font-black text-red-400 uppercase tracking-widest">단점</h3>
                        </div>
                        <ul className="space-y-2">
                          {survey.aiAnalysisCons.slice(0, 3).map((con, idx) => (
                            <li key={idx} className="text-xs text-white/60 font-medium flex items-start gap-2">
                              <span className="text-red-400/40">•</span>
                              <span className="flex-1">{con}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between mb-4 pt-4 border-t border-white/5">
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1.5 text-[11px] font-bold text-white/30 uppercase tracking-widest">
                    <i className="fas fa-clock text-[10px]"></i>
                    약 {Math.ceil(survey.questions.length * 0.5)}분
                  </span>
                </div>
                <div className="px-3 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20 text-[11px] font-black text-purple-400">
                  +{survey.experienceReward || 0} XP
                </div>
              </div>

              <div className="flex justify-center">
                <ShareSurvey survey={survey} />
              </div>

              {/* 기업 설문일 경우 QR 코드 표시 */}
              {survey.category === 'enterprise' && (
                <div className="mt-8 pt-8 border-t border-white/10">
                  <div className="text-center">
                    <h3 className="text-xs font-black text-white/40 uppercase tracking-widest mb-6 flex items-center justify-center gap-2">
                      <i className="fas fa-qrcode text-purple-500"></i>
                      QR Code Share
                    </h3>
                    <div
                      ref={qrCodeRef}
                      className="inline-block p-4 bg-white rounded-2xl shadow-xl shadow-purple-500/10"
                    >
                      <QRCodeSVG
                        value={`${window.location.origin}/survey/${id}`}
                        size={200}
                        level="H"
                        includeMargin={true}
                      />
                    </div>
                    <div className="mt-6">
                      <Button
                        onClick={downloadQRCode}
                        className="h-12 px-6 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-white text-xs font-black uppercase tracking-widest transition-all"
                        data-testid="button-download-qr"
                      >
                        <i className="fas fa-download mr-2"></i>
                        Download QR
                      </Button>
                    </div>
                    <p className="text-[10px] text-white/20 font-bold uppercase tracking-widest mt-4">
                      Scan to join this survey instantly
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* 이미 참여한 설문 표시 */}
        {hasParticipated && (
          <section className="px-6 mb-8">
            <div className="glass-card p-6 border-emerald-500/20 bg-emerald-500/10 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                <i className="fas fa-check text-white text-xl"></i>
              </div>
              <div>
                <h4 className="font-black text-white tracking-tight">설문 참여 완료!</h4>
                <p className="text-xs text-white/40 font-medium">이미 이 설문에 참여하셨습니다.</p>
              </div>
            </div>
          </section>
        )}

        {/* Survey Questions */}
        <section className="px-6 mb-8">
          <div className={`space-y-6 ${hasParticipated ? 'blur-sm pointer-events-none opacity-40' : ''}`}>
            {survey?.questions?.map((question, index) => {
              const lines = question.question.split('\n\n');
              const hasCategory = lines[0]?.match(/^[📝📞🌟😊🚗🏘️🏛️💰🐕💝]/);
              const categoryHeader = hasCategory ? lines[0] : null;
              const actualQuestion = hasCategory ? lines.slice(1).join('\n\n') : question.question;

              const previousQuestion = index > 0 ? survey.questions[index - 1] : null;
              const previousCategory = previousQuestion?.question.split('\n\n')[0];
              const isNewSection = !previousCategory || previousCategory !== categoryHeader;

              return (
                <div key={question.id}>
                  {isNewSection && categoryHeader && (
                    <div className="mb-6 mt-10 first:mt-0 px-2">
                      <h2 className="text-xl font-black text-white tracking-tight">
                        {categoryHeader}
                      </h2>
                      <div className="h-1.5 w-12 bg-purple-600 rounded-full mt-2 shadow-lg shadow-purple-500/20" />
                    </div>
                  )}

                  <div className="glass-card p-8 border border-white/10 relative overflow-hidden group">
                    <div className="mb-8">
                      <div className="flex items-center gap-2 mb-4">
                        <span className="text-[10px] font-black bg-purple-600 text-white px-3 py-1 rounded-lg tracking-widest uppercase">
                          Question {index + 1}
                        </span>
                      </div>
                      <h3 className="text-xl font-black text-white tracking-tighter leading-tight whitespace-pre-wrap">
                        {actualQuestion}
                      </h3>
                    </div>

                    <div className="space-y-4">

                      {question.type === 'single_choice' && (
                        <div className="space-y-3">
                          {(question.options as string[])?.map((option, idx) => {
                            const isSelected = responses[question.id] === option;
                            return (
                              <label
                                key={`single-${question.id}-${idx}-${option.replace(/\s+/g, '_')}`}
                                htmlFor={`single-radio-${question.id}-${idx}-${option.replace(/\s+/g, '_')}`}
                                className={`relative flex items-center p-5 rounded-2xl border transition-all duration-300 cursor-pointer group/opt
                              ${isSelected
                                    ? 'bg-purple-600/10 border-purple-500 shadow-[0_0_20px_rgba(168,85,247,0.2)]'
                                    : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20'
                                  }
                            `}
                              >
                                <input
                                  type="radio"
                                  name={`question-${question.id}`}
                                  value={option}
                                  id={`single-radio-${question.id}-${idx}-${option.replace(/\s+/g, '_')}`}
                                  checked={isSelected}
                                  onChange={(e) => handleSingleChoiceChange(question.id, e.target.value)}
                                  className="sr-only"
                                />
                                <div className={`flex-shrink-0 w-6 h-6 rounded-full border-2 mr-4 flex items-center justify-center transition-all duration-300
                              ${isSelected
                                    ? 'border-purple-500 bg-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.5)]'
                                    : 'border-white/20'
                                  }`}>
                                  {isSelected && (
                                    <i className="fas fa-check text-[10px] text-white"></i>
                                  )}
                                </div>
                                <span className={`flex-1 font-bold text-base tracking-tight transition-colors
                              ${isSelected ? 'text-white' : 'text-white/60 group-hover/opt:text-white/80'}
                            `}>
                                  {option}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      )}

                      {question.type === 'multiple_choice' && (
                        <div className="space-y-3">
                          {(question.options as string[])?.map((option, idx) => {
                            const isSelected = (initializeResponse(question.id, 'multiple_choice') as string[]).includes(option);
                            return (
                              <label
                                key={`multiple-${question.id}-${idx}`}
                                className={`relative flex items-center p-5 rounded-2xl border transition-all duration-300 cursor-pointer group/opt
                                  ${isSelected
                                    ? 'bg-purple-600/10 border-purple-500 shadow-[0_0_20px_rgba(168,85,247,0.2)]'
                                    : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20'
                                  }
                                `}
                              >
                                <Checkbox
                                  checked={isSelected}
                                  onCheckedChange={(checked) => handleMultipleChoiceChange(question.id, option, checked as boolean)}
                                  className="mr-4 data-[state=checked]:bg-purple-500 data-[state=checked]:border-purple-500"
                                />
                                <span className={`flex-1 font-bold text-base tracking-tight transition-colors
                                  ${isSelected ? 'text-white' : 'text-white/60 group-hover/opt:text-white/80'}
                                `}>
                                  {option}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      )}

                      {question.type === 'dropdown' && (
                        <select
                          value={responses[question.id] || ""}
                          onChange={(e) => handleSingleChoiceChange(question.id, e.target.value)}
                          aria-label="답변 선택"
                          className="w-full p-5 bg-white/5 border border-white/10 rounded-2xl text-white font-bold focus:border-purple-500 focus:outline-none transition-all appearance-none"
                        >
                          <option value="" className="bg-gray-900">선택해주세요</option>
                          {(question.options as string[])?.map((option, idx) => (
                            <option key={idx} value={option} className="bg-gray-900">
                              {option}
                            </option>
                          ))}
                        </select>
                      )}

                      {question.type === 'rating_scale' && (
                        <div className="space-y-6">
                          <div className="flex justify-between items-center text-[10px] font-black text-white/20 uppercase tracking-[0.2em]">
                            <span>{(question.ratingScale as any)?.min || 1}점 (최소)</span>
                            <span>{(question.ratingScale as any)?.max || 5}점 (최대)</span>
                          </div>
                          <div className="flex justify-between gap-2">
                            {Array.from({ length: ((question.ratingScale as any)?.max || 5) - ((question.ratingScale as any)?.min || 1) + 1 }, (_, i) => {
                              const value = ((question.ratingScale as any)?.min || 1) + i;
                              const isSelected = responses[question.id] === value;
                              return (
                                <button
                                  key={i}
                                  type="button"
                                  onClick={() => handleSingleChoiceChange(question.id, value)}
                                  className={`flex-1 h-14 rounded-xl border flex items-center justify-center font-black transition-all duration-300
                                    ${isSelected
                                      ? 'bg-purple-600 border-purple-500 text-white shadow-lg shadow-purple-500/20'
                                      : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10 hover:text-white hover:border-white/20'}
                                  `}
                                >
                                  {value}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {question.type === 'ranking' && (
                        <div className="space-y-3">
                          <div className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em] mb-4">
                            순위 선택 (1위부터 순서대로)
                          </div>
                          {(question.options as string[])?.map((option, idx) => {
                            const currentRankings = initializeResponse(question.id, 'ranking') as Record<string, string>;
                            const selectedRank = currentRankings[option] || "";

                            return (
                              <div key={idx} className="flex items-center gap-4 bg-white/5 border border-white/10 p-5 rounded-2xl hover:bg-white/10 transition-all group/rank">
                                <select
                                  value={selectedRank}
                                  onChange={(e) => handleRankingChange(question.id, option, e.target.value)}
                                  aria-label={`${option} 순위 선택`}
                                  className="w-24 p-2.5 bg-purple-600 text-white border-none rounded-xl font-black text-sm focus:outline-none shadow-lg shadow-purple-500/10 cursor-pointer"
                                >
                                  <option value="">순위</option>
                                  {Array.from({ length: (question.options as string[]).length }, (_, i) => {
                                    const rank = (i + 1).toString();
                                    const isDisabled = Object.values(currentRankings).includes(rank) && selectedRank !== rank;
                                    return <option key={rank} value={rank} disabled={isDisabled}>{rank}위</option>;
                                  })}
                                </select>
                                <span className="flex-1 font-bold text-white tracking-tight group-hover/rank:translate-x-1 transition-transform">{option}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {question.type === 'text' && (
                        <Textarea
                          placeholder="여기에 답변을 입력해 주세요..."
                          value={responses[question.id] || ""}
                          onChange={(e) => handleTextChange(question.id, e.target.value)}
                          className="min-h-[140px] bg-white/5 border-white/10 rounded-2xl text-white font-medium p-5 focus:border-purple-500 focus:ring-1 focus:ring-purple-500/20 transition-all placeholder:text-white/20"
                        />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Submit Button */}
        <section className="px-6 mb-12">
          {hasParticipated ? (
            <div className="flex flex-col gap-4">
              <div className="glass-card p-6 border-emerald-500/20 bg-emerald-500/10 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                  <i className="fas fa-check text-white text-xl"></i>
                </div>
                <div>
                  <h4 className="font-black text-white tracking-tight">설문 참여 완료!</h4>
                  <p className="text-xs text-white/40 font-medium">이미 이 설문에 참여하셨습니다.</p>
                </div>
              </div>
              <Button
                onClick={() => setLocation(`/survey-result/${id}`)}
                className="w-full h-16 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 text-white font-black text-lg transition-all"
              >
                <i className="fas fa-chart-bar mr-2"></i>
                결과 확인하기
              </Button>
            </div>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={submitMutation.isPending || participateMutation.isPending}
              className="w-full h-16 rounded-2xl bg-purple-600 hover:bg-purple-700 text-white font-black text-lg shadow-lg shadow-purple-500/30 transition-all active:scale-[0.98] disabled:opacity-50"
            >
              {submitMutation.isPending ? (
                <div className="flex items-center gap-3">
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>제출 중...</span>
                </div>
              ) : (
                <>설문 완료하기 (+{survey.experienceReward || (survey.category === 'politics' ? 50 : 30)} XP)</>
              )}
            </Button>
          )}
        </section>
      </main>

      <BottomNav />
    </div >
  );
}
