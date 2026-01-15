// Optimize: Critical Path Components are imported normally
import MobileHeader from "@/components/mobile-header";
import { Link, useLocation } from "wouter";
import { SEOHead } from "@/components/seo-head";
import { useAuth } from "@/contexts/AuthContext";
import { usePWA } from "@/contexts/PWAContext";
import { useHomeDashboard } from "@/hooks/useHomeDashboard";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useCallback, Suspense, lazy } from "react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/queryKeys";
import BottomNav from "@/components/bottom-nav";
import CountUp from "@/components/ui/count-up";
import { DotLottieReact } from '@lottiefiles/dotlottie-react';

// Optimize: Lazy Load Heavy Components
const NewsCarousel = lazy(() => import("@/components/news-carousel"));
const CategoryCard = lazy(() => import("@/components/category-card"));
const SurveyCard = lazy(() => import("@/components/survey-card"));
const LocationPrompt = lazy(() => import("@/components/location-prompt"));
const PointSendModal = lazy(() => import("@/components/point-send-modal"));
const RewardsModal = lazy(() => import("@/components/rewards-modal"));
const PointHistoryModal = lazy(() => import("@/components/point-history-modal"));
const CelebrityBentoGrid = lazy(() => import("@/components/CelebrityBentoGrid"));
const BentoGridSection = lazy(() => import("@/components/BentoGridSection"));
// BalanceGameCard needs to be compatible with lazy loading (default export)
const BalanceGameCard = lazy(() => import("@/components/BalanceGameCard").then(module => ({ default: module.BalanceGameCard })));

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Survey } from "@shared/schema";
import GuestWarningBanner from "@/components/GuestWarningBanner";
import { Eye, EyeOff, CheckCircle, XCircle, History, ArrowRight, ChevronRight, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { motion, AnimatePresence } from "framer-motion";
import PartyLogo from "@/components/PartyLogo";
import { filterActiveOnly } from "@/utils/survey-filters";
import type { BalanceGame } from "@shared/schema";

// Types
interface BrainStats {
  level: number;
  ratings: any;
  topPercent: number;
}

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
  const { scheduleNotification } = usePWA();

  // Fetch Brain Stats for Banner
  const { data: brainStats } = useQuery<BrainStats>({
    queryKey: [queryKeys.AUTH_USER_STATS],
    queryFn: () => apiRequest(queryKeys.AUTH_USER_STATS),
    enabled: !!user && !user.isGuest,
  });

  const getTierName = (level: number) => {
    const tiers = ["Bronze", "Silver", "Gold", "Platinum", "Diamond"];
    return tiers[level - 1] || "Unranked";
  };

  const getTierColor = (level: number) => {
    const colors = [
      "text-amber-600",
      "text-slate-300",
      "text-yellow-400",
      "text-cyan-400",
      "text-purple-400"
    ];
    return colors[level - 1] || "text-white/50";
  };

  // Balance Game Logic
  // const [balanceGameIndex, setBalanceGameIndex] = useState(0); // Removed index-based logic

  /* 밸런스 게임 - Fetch Standardized API */
  const { data: balanceGames = [], refetch: refetchBalanceGames } = useQuery<BalanceGame[]>({
    queryKey: [queryKeys.BALANCE_GAMES],
    queryFn: () => apiRequest(queryKeys.BALANCE_GAMES),
    retry: false
  });

  // Fetch user's vote history to filter out already played games
  const { data: myVotes = [], refetch: refetchMyVotes } = useQuery<any[]>({
    queryKey: [queryKeys.BALANCE_GAMES_MY_VOTES],
    queryFn: () => apiRequest(queryKeys.BALANCE_GAMES_MY_VOTES),
    enabled: !!user && !user.isGuest,
    retry: false
  });

  // Validated Voted IDs (Server + Local Session)
  const [localVotedIds, setLocalVotedIds] = useState<Set<number>>(new Set());

  // Filter games: Exclude if in server votes OR local session votes
  const unvotedGames = balanceGames.filter(g => {
    // Check Server Data
    const playedOnServer = myVotes.some(v => v.gameId === g.id);
    // Check Local Session
    const playedLocally = localVotedIds.has(g.id);
    return !playedOnServer && !playedLocally;
  });

  // Always show the first unvoted game
  const currentBalanceGame = unvotedGames[0];

  const handleBalanceGameVote = async (gameId: number, choice: 'A' | 'B') => {
    try {
      await apiRequest(`/api/balance-games/${gameId}/vote`, {
        method: "POST",
        body: { choice }
      });

      // Update counts silently if needed
      refetchBalanceGames();
      // We don't strictly need to refetchMyVotes immediately because we use localVotedIds for standard UX

      // Local Notification Trigger for PWA experience
      scheduleNotification(
        "⏰ 투표 결과가 도착했습니다!",
        {
          body: `'${currentBalanceGame.title}' 게임의 최신 득표 내역을 확인해보세요!`,
          icon: '/favicon.ico',
          badge: '/favicon.ico'
        },
        5000 // In a real scenario, this would be set to the D-Day/Result time
      );

      // Auto-advance after 1.5s
      setTimeout(() => {
        setLocalVotedIds(prev => {
          const next = new Set(prev);
          next.add(gameId);
          return next;
        });

        // Also Trigger visual success feedback/toast if desired? 
        // User just wants next card.
      }, 1500);

    } catch (e: any) {
      if (e.message.includes('ALREADY_VOTED') || e.code === 'ALREADY_VOTED') {
        toast({
          title: "이미 참여하셨습니다.",
          variant: "destructive",
          className: "bg-black/90 backdrop-blur-xl border border-red-500/20 text-white shadow-2xl"
        });
        // If already voted, maybe we should also skip it cleanly?
        // Let's force skip it so they don't get stuck.
        setLocalVotedIds(prev => {
          const next = new Set(prev);
          next.add(gameId);
          return next;
        });
      } else {
        toast({ title: "투표 실패", description: "로그인이 필요합니다.", variant: "destructive" });
      }
    }
  };

  // Supabase Data Fetching (Optimized)
  const { data: dashboardData, loading: dashboardLoading } = useHomeDashboard();

  const [directUserParticipations, setDirectUserParticipations] = useState<any[]>([]);
  const { toast } = useToast();
  const queryClient = useQueryClient();



  // Simple Auth 폼 상태
  const [isLoading, setIsLoading] = useState(false);



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
    queryKey: [queryKeys.SURVEYS_CATEGORY_COUNTS],
    queryFn: () => apiRequest(queryKeys.SURVEYS_CATEGORY_COUNTS),
  });

  // Simple Auth 사용자 참여 데이터 가져오기
  const fetchUserParticipations = useCallback(async () => {
    if (!user || user.isGuest) return;

    try {
      const data = await apiRequest(`${queryKeys.AUTH_USER_PARTICIPATIONS}?direct=${Date.now()}`);
      setDirectUserParticipations(data || []);
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
  const { data: userParticipations = [], refetch: refetchParticipations } = useQuery<any[]>({
    queryKey: [queryKeys.AUTH_USER_PARTICIPATIONS],
    queryFn: () => apiRequest(queryKeys.AUTH_USER_PARTICIPATIONS),
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

        const res = await apiRequest(queryKeys.LOTTERY_CREATE_TICKET, {
          method: "POST",
          body: {
            roundId,
            numbers
          }
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
      // setShowSuccessModal(true);
      console.log("[Home] Mutation Success");
      setIsCreatingTicket(false); // Force state release
      toast({
        title: "로또 티켓 생성 완료",
        description: `선택번호: ${variables.join(', ')} - 내일 00:00에 추첨됩니다!`,
      });
      setSelectedNumbers([]);
      // 로또 티켓 데이터 새로고침 (올바른 키 사용)
      queryClient.invalidateQueries({ queryKey: [queryKeys.LOTTERY_TICKETS] });
      // 사용자 정보 새로고침 (티켓 수 감소 반영)
      queryClient.invalidateQueries({ queryKey: [queryKeys.AUTH_USER] });

      if (refreshUser) refreshUser();
      // if (refetchTickets) refetchTickets();

      // 강제 새로고침을 위한 약간의 지연 (서버 DB 반영 시간 고려)
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: [queryKeys.LOTTERY_TICKETS] });
        queryClient.invalidateQueries({ queryKey: [queryKeys.AUTH_USER] });
        if (refreshUser) refreshUser();
        // if (refetchTickets) refetchTickets();
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
        <style>{`
          @keyframes float-slow {
            0%, 100% { transform: translateY(0px); }
            50% { transform: translateY(-10px); }
          }
          @keyframes float-medium {
            0%, 100% { transform: translateY(0px); }
            50% { transform: translateY(-8px); }
          }
          @keyframes float-fast {
            0%, 100% { transform: translateY(0px); }
            50% { transform: translateY(-6px); }
          }
          @keyframes shadow-pulse {
            0%, 100% { transform: translateX(-50%) scale(1); opacity: 0.4; }
            50% { transform: translateX(-50%) scale(0.8); opacity: 0.2; }
          }
          .animate-float-slow { animation: float-slow 3s ease-in-out infinite; }
          .animate-float-medium { animation: float-medium 2.5s ease-in-out infinite; }
          .animate-float-fast { animation: float-fast 2s ease-in-out infinite; }
          .animate-shadow-pulse { animation: shadow-pulse 3s ease-in-out infinite; }
        `}</style>
        {/* Lotto 540 Banner */}
        <div className="px-4 mb-6">
          <div onClick={() => setLocation('/lotto')} className="w-full relative overflow-hidden rounded-3xl bg-black border border-white/20 shadow-lg shadow-purple-900/20 group cursor-pointer hover:scale-[1.02] transition-transform duration-300">
            {/* Background Effects (Stars/Glow) */}
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-30 animate-pulse"></div>
            <div className="absolute top-[-50%] left-[-20%] w-[150%] h-[150%] bg-gradient-to-t from-transparent via-white/5 to-transparent rotate-45 pointer-events-none"></div>

            {/* Content Container */}
            <div className="relative z-10 w-full h-full flex flex-col items-center justify-center py-6">

              {/* White Text Header */}
              <h3 className="text-4xl font-extrabold italic tracking-tighter mb-6 relative z-20 text-white drop-shadow-lg">
                LOTTO 540
              </h3>

              {/* 3D Floating Balls Container */}
              <div className="flex items-center gap-6 relative z-10">

                {/* Ball 5 (Gold) - Floating Up/Down */}
                <div className="relative animate-float-slow" style={{ animationDelay: '0s' }}>
                  <div className="w-16 h-16 rounded-full flex items-center justify-center relative shadow-xl" style={{
                    background: 'radial-gradient(circle at 30% 30%, #ffd700, #d4af37, #8a6e05)',
                    boxShadow: 'inset -5px -5px 15px rgba(0,0,0,0.3), 0 10px 20px rgba(0,0,0,0.4)'
                  }}>
                    <div className="absolute top-2 left-3 w-4 h-3 bg-white/40 rounded-full blur-[2px] transform -rotate-45"></div>
                    <span className="text-3xl font-black text-[#5c4900] drop-shadow-md">5</span>
                  </div>
                  {/* Shadow */}
                  <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-10 h-2 bg-black/40 rounded-[100%] blur-sm animate-shadow-pulse"></div>
                </div>

                {/* Ball 4 (Blue) - Floating with Delay */}
                <div className="relative animate-float-medium top-4" style={{ animationDelay: '0.3s' }}>
                  <div className="w-16 h-16 rounded-full flex items-center justify-center relative shadow-xl" style={{
                    background: 'radial-gradient(circle at 30% 30%, #60a5fa, #2563eb, #1e3a8a)',
                    boxShadow: 'inset -5px -5px 15px rgba(0,0,0,0.3), 0 10px 20px rgba(0,0,0,0.4)'
                  }}>
                    <div className="absolute top-2 left-3 w-4 h-3 bg-white/40 rounded-full blur-[2px] transform -rotate-45"></div>
                    <span className="text-3xl font-black text-white drop-shadow-md">4</span>
                  </div>
                  <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-10 h-2 bg-black/40 rounded-[100%] blur-sm animate-shadow-pulse" style={{ animationDelay: '0.3s' }}></div>
                </div>

                {/* Ball 0 (Red) - Floating with Delay */}
                <div className="relative animate-float-fast" style={{ animationDelay: '0.6s' }}>
                  <div className="w-16 h-16 rounded-full flex items-center justify-center relative shadow-xl" style={{
                    background: 'radial-gradient(circle at 30% 30%, #f87171, #dc2626, #7f1d1d)',
                    boxShadow: 'inset -5px -5px 15px rgba(0,0,0,0.3), 0 10px 20px rgba(0,0,0,0.4)'
                  }}>
                    <div className="absolute top-2 left-3 w-4 h-3 bg-white/40 rounded-full blur-[2px] transform -rotate-45"></div>
                    <span className="text-3xl font-black text-white drop-shadow-md">0</span>
                  </div>
                  <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-10 h-2 bg-black/40 rounded-[100%] blur-sm animate-shadow-pulse" style={{ animationDelay: '0.6s' }}></div>
                </div>

              </div>



            </div>
          </div>
        </div>


        {/* Profile Setup Banner - Show for guest users to encourage authentication */}


        {/* News Carousel */}
        <Suspense fallback={<div className="h-48 rounded-3xl bg-white/5 animate-pulse mx-4 mt-6" />}>
          <div className="mt-6">
            <NewsCarousel />
          </div>
        </Suspense>



        {/* Bento Grid Dashboard */}
        {/* Bento Grid Dashboard */}
        <Suspense fallback={<div className="h-64 rounded-3xl bg-white/5 animate-pulse mx-4 mt-6" />}>
          <BentoGridSection assemblyDashboard={assemblyDashboard} localCouncilStats={localCouncilStats} />
        </Suspense>

        {/* Celebrity Battle Bento Grid */}
        <Suspense fallback={<div className="h-64 rounded-3xl bg-white/5 animate-pulse mx-4 mt-6" />}>
          <CelebrityBentoGrid />
        </Suspense>

        {/* Brain Ranking Banner */}
        {/* Brain Ranking Banner */}
        <div className="px-4 mb-8 mt-6">
          <Link href="/brain-ranking">
            <div className="w-full relative overflow-hidden rounded-[2rem] bg-black border border-white/10 shadow-lg shadow-indigo-900/20 group cursor-pointer hover:border-indigo-500/50 transition-all duration-300">
              {/* Background Effects */}
              <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>

              <div className="relative z-10 flex items-center justify-between py-10 px-8">
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xs font-bold text-indigo-400 tracking-wider">MY RANK</span>
                    <span className={`text-2xl font-black italic sans-serif ${brainStats ? getTierColor(brainStats.level) : 'text-white/50'}`}>
                      {brainStats ? getTierName(brainStats.level) : 'Unranked'}
                    </span>
                  </div>
                  <h3 className="text-3xl font-extrabold text-white mb-2 tracking-tight">
                    Brain Rank
                  </h3>
                  <p className="text-sm text-white/60 font-medium leading-relaxed">
                    나의 지능 티어는 몇 단계일까요?<br />
                    지금 바로 측정해보세요!
                  </p>
                </div>

                {/* Lottie Animation */}
                <div className="w-32 h-32 flex items-center justify-center">
                  <DotLottieReact
                    src="https://lottie.host/ce2c81ab-10a8-47ea-a6a7-b41dadb05faa/VQFzZlqtdZ.lottie"
                    loop
                    autoplay
                  />
                </div>
              </div>
            </div>
          </Link>
        </div>

        {/* Balance Game Section */}
        {/* Balance Game Section - Single Card Stack View */}
        {balanceGames.length > 0 && (
          <section className="px-4 mb-10">
            <div className="flex items-center justify-between mb-4 px-1">
              <div>
                <h2 className="text-lg font-bold text-white leading-none">밸런스 게임</h2>
                <p className="text-[10px] text-white/50 font-medium mt-0.5">
                  매일 새로운 주제로 토론해보세요!
                </p>
              </div>
              <Link href="/balance-game/archive">
                <Button variant="ghost" size="sm" className="text-[11px] font-bold px-3 py-1 h-8 text-white/40 hover:text-white bg-white/5 border border-white/5 hover:border-white/10 rounded-full transition-all">
                  모두보기
                </Button>
              </Link>
            </div>

            {/* Balance Game 2.0 (Lazy Loaded) */}
            <Suspense fallback={<div className="h-48 rounded-3xl bg-white/5 animate-pulse mx-4 mt-6" />}>
              <div className="mt-6">
                <AnimatePresence mode="wait">
                  {currentBalanceGame ? (
                    <motion.div
                      key={currentBalanceGame.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -100 }}
                      transition={{ duration: 0.3 }}
                    >
                      <BalanceGameCard
                        game={currentBalanceGame}
                        onVote={handleBalanceGameVote}
                      />
                    </motion.div>
                  ) : (
                    <div className="hidden" /> // No game available
                  )}
                </AnimatePresence>
              </div>
            </Suspense>
          </section>
        )}



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

        {/* Footer Section */}
        <div className="mt-auto px-4 pb-6">
          <div className="flex items-center justify-center gap-4 py-6 border-t border-white/5">
            <Link href="/privacy" className="text-[10px] text-white/30 hover:text-white/60 transition-colors">개인정보처리방침</Link>
            <span className="w-px h-2 bg-white/10"></span>
            <Link href="/terms" className="text-[10px] text-white/30 hover:text-white/60 transition-colors">이용약관</Link>
          </div>

          {/* Bottom Nav Placeholder for spacing */}
          <div className="h-16" />
        </div>
      </main>

      <BottomNav />

      {/* Lazy Load Modals */}
      <Suspense fallback={null}>
        {showLocationPrompt && (
          <LocationPrompt
            onLocationSet={(city, district) => {
              console.log("Location set:", city, district);
              setShowLocationPrompt(false);
              queryClient.invalidateQueries({ queryKey: [queryKeys.AUTH_USER] });
            }}
            onSkip={() => setShowLocationPrompt(false)}
          />
        )}

        {showPointSend && (
          <PointSendModal
            onClose={() => setShowPointSend(false)}
            onSuccess={() => {
              setShowPointSend(false);
              queryClient.invalidateQueries({ queryKey: [queryKeys.AUTH_USER] });
            }}
          />
        )}

        {
          showRewards && (
            <RewardsModal
              onClose={() => setShowRewards(false)}
              onSuccess={() => {
                setShowRewards(false);
                queryClient.invalidateQueries({ queryKey: [queryKeys.AUTH_USER] });
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
      </Suspense>

    </div >
  );
}
