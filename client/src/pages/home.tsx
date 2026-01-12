import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Link, useLocation } from "wouter";
import CountUp from "@/components/ui/count-up";
// Clean Auth 시스템 제거 - Simple Auth로 통합

import MobileHeader from "@/components/mobile-header";
import BottomNav from "@/components/bottom-nav";
import CategoryCard from "@/components/category-card";
import SurveyCard from "@/components/survey-card";
import LocationPrompt from "@/components/location-prompt";
import NewsCarousel from "@/components/news-carousel";
import PointSendModal from "@/components/point-send-modal";
import RewardsModal from "@/components/rewards-modal";
import PointHistoryModal from "@/components/point-history-modal";
import { SEOHead } from "@/components/seo-head";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Survey } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import GuestWarningBanner from "@/components/GuestWarningBanner";
import { Eye, EyeOff, CheckCircle, XCircle, History, ArrowRight } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { motion } from "framer-motion";
import PartyLogo from "@/components/PartyLogo";
import { filterActiveOnly } from "@/utils/survey-filters";
import { DotLottieReact } from '@lottiefiles/dotlottie-react';
import { useHomeDashboard } from "@/hooks/useHomeDashboard";
import BentoGridSection from "@/components/BentoGridSection";
import CelebrityBentoGrid from "@/components/CelebrityBentoGrid";


export default function Home() {
  // Simple Auth 시스템만 사용
  const { user, refreshUser } = useAuth();
  const [, setLocation] = useLocation();
  const [showLocationPrompt, setShowLocationPrompt] = useState(false);
  const [showLotteryExpanded, setShowLotteryExpanded] = useState(false);
  const [selectedNumbers, setSelectedNumbers] = useState<number[]>([]);
  const [showPointSend, setShowPointSend] = useState(false);
  const [showRewards, setShowRewards] = useState(false);
  const [showPointHistory, setShowPointHistory] = useState(false);
  const [timeUntilDraw, setTimeUntilDraw] = useState('');
  const [showTrendingSection, setShowTrendingSection] = useState(true);
  const [currentStreak, setCurrentStreak] = useState(0);
  const [weeklyChallenge, setWeeklyChallenge] = useState({ completed: 0, target: 10 });
  const [showParticipantsExpanded, setShowParticipantsExpanded] = useState(true);

  // Supabase Data Fetching (Optimized)
  const { data: dashboardData, loading: dashboardLoading } = useHomeDashboard();

  const [directUserParticipations, setDirectUserParticipations] = useState<any[]>([]);
  const [visibleTicketCount, setVisibleTicketCount] = useState(5); // 초기에 5개 표시
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showHistoryModal, setShowHistoryModal] = useState(false);


  const { data: lotteryHistory = [] } = useQuery<any[]>({ queryKey: ['/api/lottery/history'] });
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  // Simple Auth 폼 상태
  const [isLoading, setIsLoading] = useState(false);

  // 첫 방문자 감지 및 랜딩 페이지 리디렉션
  useEffect(() => {
    // 프로필 완료 직후 플래그 체크
    const justCompleted = localStorage.getItem('profileJustCompleted');
    if (justCompleted) {
      localStorage.removeItem('profileJustCompleted');
      // 사용자 데이터 강제 새로고침
      refreshUser();
      return;
    }

    // 온보딩 완료 플래그 확인 - 이것이 없으면 새로운 사용자
    const onboardingCompleted = localStorage.getItem('onboardingCompleted');

    // 온보딩을 완료하지 않은 새로운 사용자라면 랜딩 페이지로 리디렉션
    if (!onboardingCompleted) {
      // 온보딩 완료 플래그를 바로 설정하여 무한 루프 방지
      localStorage.setItem('onboardingCompleted', 'true');
      setLocation('/landing');
      return;
    }
  }, [setLocation, refreshUser]);

  // 로또 추첨까지 남은 시간 계산 (매일 자정 00:00 기준)
  useEffect(() => {
    const updateCountdown = () => {
      const now = new Date();

      // 다음 추첨 시간 (다음날 00:00:00)
      const nextDraw = new Date(now);
      nextDraw.setDate(nextDraw.getDate() + 1);
      nextDraw.setHours(0, 0, 0, 0);

      const timeDiff = nextDraw.getTime() - now.getTime();

      if (timeDiff <= 0) {
        setTimeUntilDraw("추첨 진행중");
        return;
      }

      const hours = Math.floor(timeDiff / (1000 * 60 * 60));
      const minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((timeDiff % (1000 * 60)) / 1000);

      setTimeUntilDraw(`${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);

    return () => clearInterval(interval);
  }, []);

  // Unused query removed
  // const { data: popularSurveys = [], isLoading: surveysLoading } = useQuery<Survey[]>({
  //   queryKey: ["/api/surveys/popular"],
  //   retry: false,
  // });

  // 카테고리별 활성 설문 수 조회
  const { data: categoryCounts = {} } = useQuery({
    queryKey: ["/api/surveys/category-counts"],
    queryFn: async () => {
      const response = await fetch('/api/surveys/category-counts', {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch category counts');
      return response.json();
    }
  });

  // Simple Auth 사용자 참여 데이터 가져오기
  const fetchUserParticipations = useCallback(async () => {
    if (!user || user.isGuest) return;

    try {
      // Get token from Supabase session in localStorage
      let token = '';
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('sb-') && key.includes('auth-token')) {
          const sessionData = localStorage.getItem(key);
          if (sessionData) {
            try {
              const session = JSON.parse(sessionData);
              token = session?.access_token || '';
            } catch (e) {
              console.error('Failed to parse session:', e);
            }
          }
          break;
        }
      }

      const response = await fetch(`/api/auth/user/participations?direct=${Date.now()}`, {
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });

      if (!response.ok) throw new Error('Failed to fetch participations');
      const data = await response.json();
      setDirectUserParticipations(data);
    } catch (error) {
      console.error('Error fetching user participations:', error);
      setDirectUserParticipations([]);
    }
  }, [user]);

  // 컴포넌트 마운트 시와 user 변경 시 참여 데이터 가져오기
  useEffect(() => {
    fetchUserParticipations();
  }, [fetchUserParticipations]);

  // Simple Auth 사용자 참여 데이터 (React Query)
  const { data: userParticipations = [], refetch: refetchParticipations } = useQuery({
    queryKey: ["/api/auth/user/participations", user?.id],
    queryFn: async () => {
      // Get token from Supabase session in localStorage
      let token = '';
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('sb-') && key.includes('auth-token')) {
          const sessionData = localStorage.getItem(key);
          if (sessionData) {
            try {
              const session = JSON.parse(sessionData);
              token = session?.access_token || '';
            } catch (e) {
              console.error('Failed to parse session:', e);
            }
          }
          break;
        }
      }

      const response = await fetch(`/api/auth/user/participations?rq=${Date.now()}`, {
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Cache-Control': 'no-cache',
        }
      });
      if (!response.ok) throw new Error('Failed to fetch participations');
      return response.json();
    },
    staleTime: 0,
    gcTime: 0,
    enabled: !!user && !user.isGuest,
    refetchOnWindowFocus: false,
    retry: false, // Don't retry on failure to prevent infinite loading
  });


  // 주기적으로 참여 데이터 업데이트
  // DISABLED: Causing infinite 401 errors, will re-enable after fixing token validation
  /*
  useEffect(() => {
    const interval = setInterval(() => {
      fetchUserParticipations();
    }, 5000); // 5초마다 업데이트

    return () => clearInterval(interval);
  }, [fetchUserParticipations]);
  */

  // CleanAuth에서 사용자 정보를 직접 가져옴 (중복 쿼리 제거)

  // 직접 가져온 데이터를 우선 사용, React Query 데이터는 백업
  const finalUserParticipations = directUserParticipations.length > 0 ? directUserParticipations : userParticipations;

  // 참여한 설문 ID 목록 생성 (Optimized structure: [{ surveyId, completedAt }])
  const participatedSurveyIds = finalUserParticipations.map((p: any) => p.surveyId);

  // 참여한 설문 ID 목록으로 블러 효과 적용

  // Supabase optimization: Use dashboardData instead of separate query
  const todayParticipantsCount = dashboardData?.today_participants || 0;

  // 최신 정책 설문 3개 가져오기
  const latestPolicySurveys = dashboardData?.latest_surveys || [];

  // 국회 ON 대시보드 데이터 가져오기
  const assemblyDashboard = {
    monthlyChampion: dashboardData?.top_politician || null
  };
  const localCouncilStats: any = null;



  const todayDraw = dashboardData?.next_lottery_draw || null;



  const createManualTicketMutation = useMutation({
    mutationFn: async (numbers: number[]) => {
      // DEBUG: Log to confirm start
      addLog("티켓 생성 요청 시작! (MutationFn init)");

      const roundId = dashboardData?.next_lottery_draw?.id || 1;
      addLog(`전송 데이터: Round ${roundId}, Numbers: ${numbers.join(',')}`);

      try {
        // 토큰 가져오기 디버깅 (Robust Logic)
        addLog("인증 토큰 확인 중... (Robust)");

        let token: string | null = null;

        // 1. SDK Attempt with Timeout
        try {
          const sessionPromise = supabase.auth.getSession();
          const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 2000));
          const { data } = await Promise.race([sessionPromise, timeoutPromise]) as any;
          token = data?.session?.access_token;
          if (token) addLog("SDK Session에서 토큰 획득 성공");
        } catch (e) {
          addLog("SDK Session 실패/타임아웃 -> LocalStorage 시도");
        }

        // 2. LocalStorage Fallback
        if (!token) {
          addLog("LocalStorage 검색 중...");
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('sb-') && key.includes('auth-token')) {
              try {
                const sessionData = JSON.parse(localStorage.getItem(key) || '{}');
                token = sessionData.access_token;
                if (token) {
                  addLog("LocalStorage 복구 성공: " + key);
                  break;
                }
              } catch (e) { }
            }
          }
        }

        if (!token) {
          addLog("토큰 확보 실패. 로그인이 필요합니다.");
          throw new Error("No Token");
        }
        addLog("토큰 확보 완료 (" + token.substring(0, 10) + "...). Fetch 시작...");

        const res = await fetch("/api/lottery/create-ticket", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify({
            roundId,
            numbers
          })
        });

        addLog(`Fetch 완료. 응답 코드: ${res.status}`);

        if (!res.ok) {
          const errText = await res.text();
          addLog(`서버 에러 응답: ${errText}`);
          throw new Error(errText || "서버 에러");
        }

        const json = await res.json();
        addLog(`정상 응답 JSON: ${JSON.stringify(json)}`);
        return json;

      } catch (err: any) {
        addLog(`전송 실패 (에러): ${err.message}`);
        throw err;
      }
    },
    onSuccess: (data, variables) => {
      setShowSuccessModal(true);
      console.log("[Home] Mutation Success");
      setIsCreatingTicket(false); // Force state release
      toast({
        title: "로또 티켓 생성 완료",
        description: `선택번호: ${variables.join(', ')} - 내일 00:00에 추첨됩니다!`,
      });
      setSelectedNumbers([]);
      // 로또 티켓 데이터 새로고침 (올바른 키 사용)
      queryClient.invalidateQueries({ queryKey: ['/api/lottery/tickets'] });
      // 사용자 정보 새로고침 (티켓 수 감소 반영)
      queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });

      if (refreshUser) refreshUser();
      if (refetchTickets) refetchTickets();

      // 강제 새로고침을 위한 약간의 지연 (서버 DB 반영 시간 고려)
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['/api/lottery/tickets'] });
        queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
        if (refreshUser) refreshUser();
        if (refetchTickets) refetchTickets();
      }, 500);
    },
    onError: (error: any) => {
      console.error("[Home] Mutation Error:", error);
      setIsCreatingTicket(false); // Force state release
      toast({
        title: "안내",
        description: error.message || "로또 티켓 생성에 실패했습니다.",
        variant: "destructive",
      });
    },
  });

  const totalParticipations = finalUserParticipations.length;
  const totalPoints = 0; // TODO: get from user state
  const consecutiveDays = 42; // This would be calculated based on participation history

  const toggleNumber = (number: number) => {
    if (selectedNumbers.includes(number)) {
      setSelectedNumbers(selectedNumbers.filter(n => n !== number));
    } else if (selectedNumbers.length < 5) {
      setSelectedNumbers([...selectedNumbers, number].sort((a, b) => a - b));
    }
  };

  // 자동 번호 생성 함수
  const generateRandomNumbers = () => {
    const numbers: number[] = [];
    while (numbers.length < 5) {
      const randomNum = Math.floor(Math.random() * 40) + 1;
      if (!numbers.includes(randomNum)) {
        numbers.push(randomNum);
      }
    }
    const sortedNumbers = numbers.sort((a, b) => a - b);
    setSelectedNumbers(sortedNumbers);

    // 자동 선택 완료 피드백
    toast({
      className: "bg-[#0F0F1A]/95 border-purple-500/20 backdrop-blur-xl text-white !p-0 overflow-hidden block", // !p-0로 기본 패딩 제거, block으로 flex 레이아웃 해제
      description: (
        <div className="relative w-full p-4">
          {/* 배경 그라데이션 - 전체 영역 커버 */}
          <div className="absolute inset-0 bg-gradient-to-r from-purple-500/10 via-transparent to-blue-500/5 pointer-events-none" />

          <div className="flex flex-col gap-4 relative z-10 w-full">
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500/20 to-blue-500/20 flex items-center justify-center border border-white/10 shadow-lg shadow-purple-500/10 shrink-0">
                  <i className="fas fa-bolt text-purple-400 text-sm animate-pulse"></i>
                </div>
                <div>
                  <h4 className="font-black text-white text-base tracking-tight">자동 선택 완료</h4>
                  <p className="text-xs text-white/50 font-medium">행운의 번호 5개가 선택되었습니다!</p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-center gap-2 p-3 rounded-xl bg-black/40 border border-white/5 shadow-inner w-full">
              {sortedNumbers.map((n) => (
                <span key={n} className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-xs font-bold text-white border border-white/10 shadow-sm">
                  {n}
                </span>
              ))}
            </div>
          </div>
        </div>
      ),
      duration: 3000,
    });
  };

  /* DEBUG SYSTEM - Console Only */
  const addLog = (msg: string) => {
    console.log(`[LotteryDebug] ${msg}`);
  };

  const [isCreatingTicket, setIsCreatingTicket] = useState(false);
  const handleCreateTicket = async (e?: React.MouseEvent) => {
    addLog("handleCreateTicket 진입! (버튼 클릭됨)");

    // 폼 제출 방지 (새로고침 방지)
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    // 게스트 사용자 체크
    if (!user || user.isGuest) {
      addLog("유저/게스트 체크 실패");
      toast({
        title: "프로필 설정이 필요합니다",
        description: "로또 기능은 프로필 설정 후 사용할 수 있습니다. 프로필 설정하고 로또 티켓 5장을 받으세요!",
        variant: "destructive",
      });
      return;
    }

    // 보유 티켓 수량 체크
    if ((user.availableLotteryTickets || 0) <= 0) {
      addLog("티켓 부족 실패");
      toast({
        title: "보유 티켓 부족",
        description: "사용 가능한 로또 티켓이 없습니다. 레벨업하면 더 많은 티켓을 받을 수 있어요!",
        variant: "destructive",
      });
      return;
    }

    // 이미 생성 중이면 중복 실행 방지
    if (createManualTicketMutation.isPending) {
      addLog("Pending 상태 발견 -> 강제 Reset 실행");
      createManualTicketMutation.reset();
    }

    if (selectedNumbers.length !== 5) {
      addLog("번호 5개 아님");
      const remaining = 5 - selectedNumbers.length;
      toast({
        title: "번호를 더 선택해주세요",
        description: `${remaining}개의 번호를 더 선택하시면 로또 티켓이 생성됩니다.`,
        variant: "destructive",
      });
      return;
    }

    addLog(`User: ${user?.id}, Tickets: ${user?.availableLotteryTickets}`);
    addLog("모든 체크 통과! Mutation 호출 시도...");

    try {
      addLog("Calling mutation...");
      await createManualTicketMutation.mutateAsync(selectedNumbers);
    } catch (e: any) {
      console.error("[Home] Ticket creation failed:", e);
      addLog("Mutation 호출 중 예외 발생: " + e.message);
    }
  };

  // 컴포넌트 마운트 시 mutation 리셋
  useEffect(() => {
    if (createManualTicketMutation.isPending) {
      addLog("Mount 시 Pending 리셋 실행");
      createManualTicketMutation.reset();
    }
  }, []);

  // 나의 티켓 조회 (Robust Fetch 적용)
  const { data: myTickets = [], refetch: refetchTickets } = useQuery({
    queryKey: ['/api/lottery/tickets'],
    queryFn: async () => {
      // Robust Token Retrieval (Clone of mutationFn logic)
      let token: string | null = null;
      try {
        const sessionPromise = supabase.auth.getSession();
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 1500));
        const { data } = await Promise.race([sessionPromise, timeoutPromise]) as any;
        token = data?.session?.access_token;
      } catch (e) { }

      if (!token) {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith('sb-') && key.includes('auth-token')) {
            try {
              const sessionData = JSON.parse(localStorage.getItem(key) || '{}');
              token = sessionData.access_token;
              if (token) break;
            } catch (e) { }
          }
        }
      }

      if (!token) throw new Error("No token found");

      const res = await fetch('/api/lottery/tickets', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Failed to fetch tickets");
      return await res.json();
    },
    enabled: !!user && !user.isGuest,
  });

  const lotteryTickets = myTickets;

  // 로또 티켓 상태 확인 함수 (수정된 로직 - 시계 표시)
  const getTicketStatus = (ticket: any, draw?: any) => {

    const now = new Date();
    const ticketDrawDate = new Date(ticket.drawDate || ticket.draw_date);

    // drawDate가 유효하지 않은 경우 createdAt + 1일로 계산
    let effectiveDrawDate = ticketDrawDate;
    if (isNaN(ticketDrawDate.getTime())) {
      effectiveDrawDate = new Date(ticket.createdAt || ticket.created_at);
      effectiveDrawDate.setDate(effectiveDrawDate.getDate() + 1);
      effectiveDrawDate.setHours(0, 0, 0, 0); // 자정
    }

    // 추첨일이 아직 안 됐으면 카운트다운
    if (now < effectiveDrawDate) {
      const diffMs = effectiveDrawDate.getTime() - now.getTime();
      const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
      const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      return (
        <span className="flex items-center gap-1">
          <i className="fas fa-clock text-[9px] animate-pulse"></i>
          {diffHrs}시간 {diffMins}분 전
        </span>
      );
    }

    // 추첨일이 지났으면 결과 확인
    const isWinner = ticket.isWinner ?? ticket.is_winner;
    const prizeAmount = ticket.prizeAmount ?? ticket.prize_amount ?? 0;
    const rank = ticket.rank ?? 0;

    if (isWinner === true) {
      return rank > 0 ? `${rank}등 당첨! (+${prizeAmount.toLocaleString()}P)` : `당첨! (+${prizeAmount.toLocaleString()}P)`;
    } else if (isWinner === false) {
      return "낙첨 (다음 기회에)";
    }

    // 추첨일이 지났는데 아직 결과가 결정되지 않았으면
    return "결과 처리중";
  };

  const getTicketBadgeColor = (ticket: any, draw?: any) => {
    const now = new Date();
    const ticketDrawDate = new Date(ticket.drawDate || ticket.draw_date);

    // drawDate가 유효하지 않은 경우 createdAt + 1일로 계산
    let effectiveDrawDate = ticketDrawDate;
    if (isNaN(ticketDrawDate.getTime())) {
      effectiveDrawDate = new Date(ticket.createdAt || ticket.created_at);
      effectiveDrawDate.setDate(effectiveDrawDate.getDate() + 1);
      effectiveDrawDate.setHours(0, 0, 0, 0);
    }

    if (now < effectiveDrawDate) {
      return "bg-blue-500/10 text-blue-400 border-blue-500/20";
    }

    const isWinner = ticket.isWinner ?? ticket.is_winner;
    if (isWinner === true) {
      return "bg-green-500/20 text-green-400 border-green-500/30";
    } else if (isWinner === false) {
      return "bg-gray-500/10 text-gray-500 border-gray-500/10";
    }

    return "bg-orange-500/10 text-orange-400 border-orange-500/20";
  };



  const homeStructuredData = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "name": "Polli",
    "description": "블록체인 기반 설문조사 플랫폼으로 재미있는 설문에 참여하고 포인트를 획득하세요",
    "url": "https://polli.replit.app",
    "applicationCategory": "SocialNetworkingApplication",
    "operatingSystem": "Web",
    "offers": {
      "@type": "Offer",
      "price": "0",
      "priceCurrency": "KRW"
    },
    "aggregateRating": {
      "@type": "AggregateRating",
      "ratingValue": "4.8",
      "ratingCount": "1250"
    }
  };

  return (
    <div className="min-h-screen bg-transparent transition-colors">
      <SEOHead
        title="Polli - 참여는 가볍게, 신뢰는 무겁게! | 블록체인 설문조사 플랫폼"
        description="블록체인 기반 설문조사 플랫폼 폴리에서 재미있는 설문에 참여하고 포인트를 획득하세요. AI 자동 생성 설문, 실시간 뉴스 투표, 로또 시스템까지 모든 것이 준비되어 있습니다."
        keywords="설문조사, 투표, 블록체인, 포인트, 리워드, AI, 뉴스, 로또, 익명투표, 지역설문, 폴리, polli"
        structuredData={homeStructuredData}
      />
      <MobileHeader />
      <main className="max-w-md mx-auto pb-20">


        {/* Profile Setup Banner - Show for guest users to encourage authentication */}
        {
          (!user || user.isGuest) && (
            <section className="px-4 mt-6 mb-2">
              <div className="glass-card p-6 relative overflow-hidden border border-white/10 bg-black/20 backdrop-blur-xl">
                <div className="flex flex-col gap-5 z-10 relative">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center shadow-inner shrink-0 border border-white/10">
                      <i className="fas fa-user-plus text-white text-xl"></i>
                    </div>
                    <div>
                      <h3 className="font-bold text-xl mb-1 text-white tracking-tight">프로필 설정 하기</h3>
                      <p className="text-sm text-white/60">설정하고 폴리의 모든 기능을 자유롭게 사용해보세요</p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-2 bg-white/5 self-start px-3 py-1.5 rounded-xl border border-white/10">
                      <div className="w-6 h-6 rounded-lg bg-yellow-400/20 flex items-center justify-center">
                        <i className="fas fa-gift text-yellow-400 text-xs"></i>
                      </div>
                      <span className="text-xs font-bold text-white/90">프로필 설정 시 로또 티켓 5장 즉시 지급!</span>
                    </div>

                    <Link href="/profile-setup" className="block w-full">
                      <button className="w-full py-4 px-6 rounded-2xl bg-white/10 text-white font-extrabold text-base border border-white/20 shadow-xl hover:bg-white/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2 backdrop-blur-xl">
                        <span>프로필 설정 시작하기</span>
                        <i className="fas fa-chevron-right text-xs"></i>
                      </button>
                    </Link>

                    <div className="flex items-center justify-center gap-4">
                      <span className="text-[11px] text-white/40 flex items-center gap-1.5">
                        <i className="fas fa-shield-alt"></i>
                        철저한 100% 익명 보장
                      </span>
                      <span className="w-1 h-1 rounded-full bg-white/20"></span>
                      <span className="text-[11px] text-white/40 flex items-center gap-1.5">
                        <i className="fas fa-check-circle"></i>
                        간편한 원클릭 가입
                      </span>
                    </div>
                  </div>
                </div>

                {/* Subtle Background Glows */}
                <div className="absolute -right-20 -top-20 w-40 h-40 bg-white/5 rounded-full blur-3xl pointer-events-none"></div>
                <div className="absolute -left-10 -bottom-10 w-32 h-32 bg-primary/20 rounded-full blur-3xl pointer-events-none"></div>
              </div>
            </section>
          )
        }

        {/* Simplified Stats Header */}
        {/* Simplified Stats Header */}
        <section className="px-4 pt-6 pb-4">
          <div className="glass-card p-5 relative overflow-hidden">
            <div className="flex justify-between items-start z-10 relative">
              <div>
                <h2 className="text-sm font-medium text-muted-foreground mb-1">오늘의 참여자</h2>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold tracking-tight text-foreground">
                    <CountUp
                      to={todayParticipantsCount}
                      from={0}
                      separator=","
                      direction="up"
                      duration={1.5}
                      className="count-up-text"
                    />
                  </span>
                  <span className="text-sm font-medium text-primary">명</span>
                </div>
              </div>

              <div className="flex items-center gap-1.5 bg-primary/10 px-2.5 py-1 rounded-full border border-primary/20">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                </span>
                <span className="text-xs font-semibold text-primary">LIVE</span>
              </div>
            </div>

            {/* Minimalist View: No Buttons */}

            {/* Background Decoration */}
            <div className="absolute -right-8 -top-8 w-32 h-32 bg-primary/10 rounded-full blur-3xl pointer-events-none"></div>
            <div className="absolute -left-8 -bottom-8 w-24 h-24 bg-secondary/20 rounded-full blur-2xl pointer-events-none"></div>
          </div>
        </section>



        {/* Premium Lottery Card - Repositioned Here */}
        <section id="polli-lottery-section" className="px-4 mb-6 pt-2">
          <div className="glass-card p-6 relative overflow-hidden border border-white/10 bg-black/20 backdrop-blur-xl">
            {/* Background Animation - strictly non-interactive, only visible when collapsed */}
            {!showLotteryExpanded && (
              <div className="absolute inset-0 h-full w-full opacity-30 pointer-events-none z-0 overflow-hidden">
                <DotLottieReact
                  src="https://lottie.host/ce974c74-c7a1-4028-924e-4612820e30e9/eyHZW5hNJU.lottie"
                  loop
                  autoplay
                  className="w-full h-full object-cover"
                />
              </div>
            )}

            {/* Minimal Background Decoration */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/5 rounded-full blur-[60px] transform translate-x-10 -translate-y-10 pointer-events-none"></div>
            <div className="absolute bottom-0 left-0 w-24 h-24 bg-purple-500/5 rounded-full blur-[40px] transform -translate-x-10 translate-y-10 pointer-events-none"></div>

            <div className="flex items-center justify-between mb-4 relative z-10">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center shadow-lg shrink-0 border border-white/10">
                  <i className="fas fa-gem text-muted-foreground text-lg"></i>
                </div>
                <div>
                  <p className="text-xl font-bold text-foreground">폴리 로또</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowHistoryModal(true)}
                className="bg-white/10 hover:bg-white/20 text-white rounded-full h-10 w-10 border border-white/10 shadow-lg transition-all"
              >
                <History className="w-5 h-5" />
              </Button>
            </div>

            <Dialog open={showHistoryModal} onOpenChange={setShowHistoryModal}>
              <DialogContent className="max-w-sm bg-[#1a1a1a]/95 backdrop-blur-xl border-white/10 text-white p-6 rounded-3xl">
                <DialogHeader className="mb-4">
                  <DialogTitle className="text-lg font-bold flex items-center gap-2">
                    <History className="w-5 h-5 text-purple-400" />
                    로또 당첨 기록
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                  {lotteryHistory?.map((draw: any, i: number) => (
                    <div key={draw.id} className="bg-white/5 p-4 rounded-xl border border-white/5 hover:bg-white/10 transition-colors">
                      <div className="flex justify-between items-center mb-3">
                        <span className="text-xs font-medium text-gray-400">
                          {new Date(draw.drawDate || draw.createdAt).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                          <span className="text-[10px] text-gray-400">당첨 {draw.winnersCount || 0}명</span>
                        </div>
                      </div>
                      <div className="flex justify-center gap-2">
                        {Array.isArray(draw.winningNumbers) ? draw.winningNumbers.map((n: number, idx: number) => (
                          <div key={idx} className="w-8 h-8 rounded-full bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-sm font-bold text-purple-300 shadow-sm">
                            {n}
                          </div>
                        )) : (
                          <span className="text-xs text-muted-foreground">번호 불러오기 실패</span>
                        )}
                      </div>
                      <div className="mt-3 pt-3 border-t border-white/5 flex justify-between text-[10px] text-gray-500">
                        <span>총 참여 {draw.totalParticipants || 0}명</span>
                        <span>회차: {draw.id}회</span>
                      </div>
                    </div>
                  ))}
                  {(!lotteryHistory || lotteryHistory.length === 0) && (
                    <div className="text-center py-10 text-gray-500">
                      <History className="w-12 h-12 mx-auto mb-3 opacity-20" />
                      <p className="text-sm">아직 추첨 기록이 없습니다.</p>
                      <p className="text-xs text-muted-foreground mt-1">오늘 밤 첫 추첨이 진행됩니다!</p>
                    </div>
                  )}
                </div>
              </DialogContent>
            </Dialog>

            <div className="grid grid-cols-2 gap-3 mb-4 relative z-10">
              <div className="bg-white/5 backdrop-blur-sm p-4 text-center rounded-xl border border-white/10">
                <div className="flex items-center justify-center mb-1">
                  <i className="fas fa-clock text-muted-foreground text-xs"></i>
                </div>
                <div className="text-xl font-bold text-foreground">{timeUntilDraw}</div>
                {/* Time to Draw removed */}
              </div>
              <div className="bg-white/5 backdrop-blur-sm p-4 text-center rounded-xl border border-white/10">
                <div className="flex items-center justify-center mb-1">
                  <i className="fas fa-coins text-muted-foreground text-xs"></i>
                </div>
                <div className="text-xl font-bold text-foreground">50,000 Point</div>
                {/* Prize Pool removed */}
              </div>
            </div>

            <div className="text-center relative z-10">
              <Button
                onClick={() => {
                  setShowLotteryExpanded(!showLotteryExpanded);
                  if (!showLotteryExpanded) {
                    setVisibleTicketCount(5); // Reset to initial count when opening
                  }
                }}
                className={`w-full py-4 rounded-xl font-bold text-sm transition-all active:scale-[0.98] flex items-center justify-center gap-2 ${showLotteryExpanded
                  ? 'bg-white/10 text-white border border-white/20'
                  : 'bg-white/10 hover:bg-white/20 text-white border border-white/20 shadow-xl'
                  }`}
              >
                <i className={`fas ${showLotteryExpanded ? 'fa-chevron-up' : 'fa-ticket-alt'} text-xs text-muted-foreground`}></i>
                {showLotteryExpanded ? '접기' : '로또 참여하기'}
              </Button>
            </div>

            {!showLotteryExpanded && (
              <div className="mt-4 text-center relative z-10">
                <p className="text-[10px] text-muted-foreground">
                  설문 참여로 레벨업하면 로또 티켓을 받을 수 있어요!
                </p>
              </div>
            )}

            {/* 확장된 로또 섹션 */}
            {showLotteryExpanded && (
              <div className="mt-6 space-y-6 animate-in slide-in-from-top-2 duration-300 relative z-10">
                {/* 내 티켓 정보 */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-white/5 p-4 text-center rounded-xl border border-white/10">
                    <div className="text-lg font-bold text-foreground">
                      {user?.availableLotteryTickets !== undefined ? user.availableLotteryTickets : 0}
                    </div>
                    <div className="text-[10px] text-muted-foreground font-medium">보유 티켓</div>
                  </div>
                  <div className="bg-white/5 p-4 text-center rounded-xl border border-white/10">
                    <div className="text-lg font-bold text-foreground">
                      {Array.isArray(lotteryTickets) ? lotteryTickets.filter((t: any) => t.isWinner).length : 0}
                    </div>
                    <div className="text-[10px] text-muted-foreground font-medium">당첨 횟수</div>
                  </div>
                  <div className="bg-white/5 p-4 text-center rounded-xl border border-white/10">
                    <div className="text-lg font-bold text-foreground">
                      {Array.isArray(lotteryTickets) ?
                        lotteryTickets.filter((t: any) => t.isWinner).reduce((sum: number, t: any) => sum + (t.prizeAmount || 0), 0).toLocaleString()
                        : 0}
                    </div>
                    <div className="text-[10px] text-muted-foreground font-medium">총 당첨금(P)</div>
                  </div>
                </div>

                {/* 오늘의 당첨 번호 */}
                {todayDraw && (todayDraw as any).winningNumbers && (
                  <div className="bg-white/5 backdrop-blur-sm p-4 rounded-xl border border-white/10">
                    <h4 className="font-bold text-foreground mb-3 text-center text-sm">오늘의 당첨 번호</h4>
                    <div className="flex justify-center gap-2 mb-3">
                      {(todayDraw as any).winningNumbers.map((num: number, index: number) => (
                        <div
                          key={index}
                          className="w-10 h-10 bg-white/10 text-white rounded-full flex items-center justify-center text-sm font-bold border border-white/20 shadow-md"
                        >
                          {num}
                        </div>
                      ))}
                    </div>
                    <div className="text-center text-[10px] text-muted-foreground">
                      참가자: {(todayDraw as any).totalParticipants || 0}명 | 당첨자: {(todayDraw as any).winnersCount || 0}명
                    </div>
                  </div>
                )}

                {/* 수동 번호 선택 */}
                <div className="bg-white/5 backdrop-blur-sm p-4 rounded-xl border border-white/10">
                  <h4 className="font-bold text-foreground mb-3 text-center text-sm">수동 번호 선택</h4>

                  <div className="mb-4">
                    <div className="text-center mb-2">
                      <span className="text-xs text-muted-foreground">선택된 번호: {selectedNumbers.length}/5</span>
                    </div>
                    <div className="flex justify-center gap-2 mb-4">
                      {selectedNumbers.map((num, index) => (
                        <div
                          key={index}
                          className="w-8 h-8 text-white rounded-full flex items-center justify-center text-xs font-bold shadow-md border border-white/20 bg-purple-600"
                        >
                          {num}
                        </div>
                      ))}
                      {Array.from({ length: 5 - selectedNumbers.length }, (_, index) => (
                        <div
                          key={`empty-${index}`}
                          className="w-8 h-8 border-2 border-dashed border-white/20 rounded-full flex items-center justify-center"
                        >
                          <span className="text-muted-foreground text-[10px]">?</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-8 gap-1 mb-4">
                    {Array.from({ length: 40 }, (_, i) => i + 1).map((number) => (
                      <button
                        key={number}
                        onClick={() => toggleNumber(number)}
                        className={`
                              w-8 h-8 rounded-lg text-xs font-medium transition-all duration-200 border
                              ${selectedNumbers.includes(number)
                            ? 'text-white border-white/40 shadow-md scale-105 bg-purple-600/80'
                            : 'bg-white/5 text-muted-foreground border-white/10 hover:bg-white/10'
                          }
                            `}
                      >
                        {number}
                      </button>
                    ))}
                  </div>

                  <div className="flex gap-2 mb-4">
                    <Button
                      onClick={generateRandomNumbers}
                      disabled={createManualTicketMutation.isPending}
                      variant="ghost"
                      className="flex-1 bg-white/5 border border-white/10 rounded-xl font-bold text-[11px] text-foreground hover:bg-white/10 h-auto py-3"
                    >
                      <i className="fas fa-dice mr-2 text-muted-foreground"></i>
                      자동 선택
                    </Button>
                    <Button
                      onClick={() => setSelectedNumbers([])}
                      variant="ghost"
                      className="flex-1 bg-white/5 border border-white/10 rounded-xl font-bold text-[11px] text-foreground hover:bg-white/10 h-auto py-3"
                    >
                      <i className="fas fa-redo mr-2 text-muted-foreground"></i>
                      초기화
                    </Button>
                  </div>

                  <div className="flex gap-2">
                    {/* Button을 div로 변경하여 form submit 완전 차단 */}
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={(e) => handleCreateTicket(e as any)}
                      className={`
                        w-full text-white border border-white/20 shadow-xl rounded-xl font-bold text-sm transition-all py-4 flex items-center justify-center cursor-pointer select-none
                        ${(selectedNumbers.length !== 5 || createManualTicketMutation.isPending || isCreatingTicket || !user || (user?.availableLotteryTickets || 0) <= 0)
                          ? 'bg-white/5 opacity-50 cursor-not-allowed'
                          : 'bg-white/10 hover:bg-white/20'
                        }
                      `}
                    >
                      {(createManualTicketMutation.isPending || isCreatingTicket) ? (
                        <>
                          <i className="fas fa-spinner fa-spin mr-2 text-muted-foreground"></i>
                          생성 중...
                        </>
                      ) : (
                        <>
                          <i className="fas fa-ticket-alt mr-2 text-muted-foreground"></i>
                          지금 바로 티켓 생성
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* 내 티켓 목록 */}
                <div className="bg-white/5 backdrop-blur-sm p-4 rounded-xl border border-white/10">
                  <h4 className="font-bold text-foreground mb-3 text-sm">생성한 로또 티켓</h4>
                  {lotteryTickets.length > 0 ? (
                    <div className="space-y-2 max-h-80 overflow-y-auto">
                      {lotteryTickets.slice(0, visibleTicketCount).map((ticket: any) => (
                        <div key={ticket.id} className="flex items-center justify-between p-3 bg-white/5 border border-white/10 rounded-xl">
                          <div className="flex-1">
                            <div className="flex items-center gap-1 mb-1">
                              {(typeof ticket.numbers === 'string' ? JSON.parse(ticket.numbers) : ticket.numbers).map((num: number, index: number) => (
                                <div
                                  key={index}
                                  className="w-6 h-6 text-white rounded-full flex items-center justify-center text-[10px] font-bold border border-white/20 bg-purple-600/60"
                                >
                                  {num}
                                </div>
                              ))}
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                              {(ticket.createdAt || ticket.created_at) ? new Date(ticket.createdAt || ticket.created_at).toLocaleDateString('ko-KR', {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric'
                              }) : '날짜 불명'} 생성
                              {(ticket.isManualSelection || ticket.is_manual_selection) && ' • 수동선택'}
                            </div>
                          </div>
                          <Badge className={`${getTicketBadgeColor(ticket, todayDraw)} rounded-lg px-2 py-1 text-[10px] font-medium border border-white/10 bg-white/10`}>
                            {getTicketStatus(ticket, todayDraw)}
                          </Badge>
                        </div>
                      ))}
                      {lotteryTickets.length > visibleTicketCount && (
                        <div className="text-center mt-3">
                          <Button
                            variant="ghost"
                            className="text-xs hover:bg-white/5 w-full text-muted-foreground py-2 h-auto"
                            onClick={() => setVisibleTicketCount(prev => Math.min(prev + 5, lotteryTickets.length))}
                          >
                            <i className="fas fa-chevron-down mr-2"></i>
                            더보기 ({lotteryTickets.length - visibleTicketCount}개 더)
                          </Button>
                        </div>
                      )}
                      {visibleTicketCount >= lotteryTickets.length && lotteryTickets.length > 5 && (
                        <div className="text-center mt-3">
                          <Button
                            variant="ghost"
                            className="text-xs hover:bg-white/5 text-muted-foreground py-2 h-auto"
                            onClick={() => setVisibleTicketCount(5)}
                          >
                            <i className="fas fa-chevron-up mr-2"></i>
                            접기
                          </Button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-6">
                      <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3 bg-white/10 border border-white/10">
                        <i className="fas fa-ticket-alt text-lg text-muted-foreground"></i>
                      </div>
                      <p className="text-muted-foreground font-medium text-xs">아직 생성한 티켓이 없습니다</p>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        번호를 선택해서 티켓을 생성하세요!
                      </p>
                    </div>
                  )}
                </div>

                {/* 로또 안내 */}
                <div className="bg-white/5 backdrop-blur-sm p-4 rounded-xl border border-white/10">
                  <h4 className="font-bold text-foreground mb-3 text-center text-sm">시스템 안내</h4>
                  <div className="grid grid-cols-1 gap-2 text-[10px] text-muted-foreground">
                    <div className="flex items-center space-x-2">
                      <div className="w-1 h-1 rounded-full bg-purple-500"></div>
                      <span>레벨업 시마다 수동 티켓 1장 지급</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="w-1 h-1 rounded-full bg-purple-500"></div>
                      <span>매일 자정 00:00 자동 추첨</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="w-1 h-1 rounded-full bg-purple-500"></div>
                      <span>5개: 50,000P, 4개: 5,000P, 3개: 500P</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="w-1 h-1 rounded-full bg-purple-500"></div>
                      <span>신규가입 5장, 레벨업 1장, 친구초대 3장</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="w-1 h-1 rounded-full bg-purple-500"></div>
                      <span>보유 티켓 1장당 로또 1회 생성 가능</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Profile Setup Banner - Show for guest users to encourage authentication */}


        {/* News Carousel */}
        <NewsCarousel />



        {/* Bento Grid Dashboard */}
        <BentoGridSection assemblyDashboard={assemblyDashboard} localCouncilStats={localCouncilStats} />




        {/* Celebrity Battle Bento Grid */}
        <CelebrityBentoGrid />






        {/* Standalone Enterprise Research Section */}
        <section className="px-4 mb-8">
          <Link href="/enterprise-research">
            <div className="glass-card p-6 relative overflow-hidden border border-white/10 bg-black/50 backdrop-blur-xl rounded-[2rem] group cursor-pointer transition-all duration-300">
              <div className="flex items-center justify-between relative z-10">
                <div className="flex items-center space-x-4">
                  <div className="w-14 h-14 bg-black/40 rounded-2xl flex items-center justify-center border border-white/10 group-hover:bg-white/10 transition-all duration-500">
                    <i className="fas fa-building text-white/80 text-xl"></i>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-xl font-bold text-white tracking-tight">기업조사 참여하기</h3>
                      <div className="bg-black/30 px-2 py-0.5 rounded-md border border-white/10">
                        <span className="text-[10px] font-black text-white/40 uppercase tracking-widest italic">PREMIUM</span>
                      </div>
                    </div>
                    <p className="text-sm text-white/30 font-medium">
                      소비자 동향 파악 및 신제품 설문 참여
                    </p>
                  </div>
                </div>

                <div className="flex flex-col items-end justify-center">
                  <ArrowRight className="w-5 h-5 text-white/20 group-hover:text-white/40 transition-colors" />
                </div>
              </div>
            </div>
          </Link>
        </section>


        {/* Bottom Copy */}
        <section className="px-4 mb-6">
          <div className="text-center py-8">
            <div className="text-sm text-gray-500 dark:text-gray-400 space-y-2">
              <p>🎯 참여는 가볍게, 신뢰는 무겁게!</p>
              <p>설문 참여하고 포인트 받아 다양한 혜택을 누려보세요</p>
              <div className="flex items-center justify-center space-x-4 mt-4 text-xs font-medium">
                <span className="bg-white/5 px-2 py-1 rounded-lg border border-white/5">🏆 레벨업 시스템</span>
                <span>•</span>
                <span className="bg-white/5 px-2 py-1 rounded-lg border border-white/5">🎁 로또 시스템</span>
                <span>•</span>
                <span className="bg-white/5 px-2 py-1 rounded-lg border border-white/5">💰 포인트 리워드</span>
              </div>
            </div>
          </div>
        </section>
      </main>

      <BottomNav />

      {/* Modals */}
      {
        showLocationPrompt && (
          <LocationPrompt
            onLocationSet={(city, district) => {
              setShowLocationPrompt(false);
              setLocation(`/category/location?city=${encodeURIComponent(city)}&district=${encodeURIComponent(district)}`);
            }}
            onSkip={() => {
              setShowLocationPrompt(false);
              setLocation('/category/location');
            }}
          />
        )
      }

      {
        showPointSend && (
          <PointSendModal
            onClose={() => setShowPointSend(false)}
            onSuccess={() => {
              setShowPointSend(false);
              queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
            }}
          />
        )
      }

      {
        showRewards && (
          <RewardsModal
            onClose={() => setShowRewards(false)}
            onSuccess={() => {
              setShowRewards(false);
              queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
            }}
          />
        )
      }

      {
        showPointHistory && (
          <PointHistoryModal
            onClose={() => setShowPointHistory(false)}
          />
        )
      }

      {/* Lottery Success Modal */}
      <Dialog open={showSuccessModal} onOpenChange={setShowSuccessModal}>
        <DialogContent className="max-w-sm rounded-[24px] bg-[#0F0F1A] border border-white/10 p-0 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-purple-500/20 via-transparent to-blue-500/10 pointer-events-none" />

          <div className="p-8 pb-6 flex flex-col items-center text-center relative z-10">
            {/* Lottie Animation or Icon */}
            <div className="w-24 h-24 mb-6 relative">
              <div className="absolute inset-0 bg-purple-500/20 blur-xl rounded-full animate-pulse" />
              <div className="relative w-full h-full bg-gradient-to-tr from-purple-500 to-indigo-500 rounded-2xl flex items-center justify-center shadow-lg shadow-purple-500/30">
                <i className="fas fa-ticket-alt text-4xl text-white transform rotate-12"></i>
              </div>
              <div className="absolute -top-2 -right-2">
                <div className="bg-yellow-400 text-black text-[10px] font-black px-2 py-0.5 rounded-full shadow-lg animate-bounce">
                  LUCKY!
                </div>
              </div>
            </div>

            <DialogTitle className="text-2xl font-black text-white mb-2 tracking-tight">
              티켓 발급 완료!
            </DialogTitle>

            <p className="text-white/60 text-sm leading-relaxed mb-6 font-medium">
              행운의 번호가 안전하게 저장되었습니다.<br />
              <span className="text-purple-400 font-bold">내일 00:00</span> 추첨 결과를 기대해주세요!
            </p>

            <div className="w-full bg-white/5 rounded-xl p-4 border border-white/10 mb-6">
              <p className="text-xs text-white/40 mb-2 uppercase tracking-widest font-bold">SELECTED NUMBERS</p>
              <div className="flex justify-center gap-2">
                {selectedNumbers.map((num) => (
                  <div key={num} className="w-8 h-8 rounded-full bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-sm font-bold text-purple-200">
                    {num}
                  </div>
                ))}
              </div>
            </div>

            <Button
              onClick={() => setShowSuccessModal(false)}
              className="w-full h-12 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-purple-500/25 transition-all duration-300"
            >
              확인
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div >
  );
}
