import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Minus, Trophy, Users, Calendar, Vote } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

interface MusicCategory {
  id: number;
  name: string;
  description?: string;
  icon: string;
  color: string;
  isActive: boolean;
  sortOrder: number;
}

interface MusicArtist {
  id: number;
  name: string;
  categoryId: number;
  imageUrl?: string;
  description?: string;
  debutYear?: number;
  agency?: string;
  currentMonthVotes: number;
  totalVotes: number;
  currentRank: number;
  previousRank: number;
  isActive: boolean;
}

interface VoteResponse {
  message: string;
}

const MusicRanking = () => {
  const [selectedCategory, setSelectedCategory] = useState<number>(1);
  const [userVotes, setUserVotes] = useState<Record<number, boolean>>({});
  const [viewingMonth, setViewingMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const simpleAuthUser = user;

  // 투표용지 계산 변수들
  const userLevel = user?.level || 1;
  const usedVotes = Object.values(userVotes).filter(voted => voted).length;
  const remainingVotes = Math.max(0, userLevel - usedVotes);
  const voteProgress = userLevel > 0 ? (usedVotes / userLevel) * 100 : 0;

  // Helper functions
  const getCurrentMonth = () => {
    return new Date().getMonth() + 1;
  };

  const getCurrentMonthString = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  };

  const isCurrentMonth = viewingMonth === getCurrentMonthString();

  // 카테고리 목록 조회
  const { data: categories = [], isLoading: categoriesLoading } = useQuery<MusicCategory[]>({
    queryKey: ["/api/music/categories"],
  });

  // 선택된 카테고리의 아티스트 목록 조회
  const { data: artists = [], isLoading: artistsLoading } = useQuery<MusicArtist[]>({
    queryKey: ["/api/music/artists", selectedCategory],
    enabled: !!selectedCategory,
  });

  // 사용자 투표 현황 조회
  const { data: userVoteStatus } = useQuery<Record<number, boolean>>({
    queryKey: ["/api/music/user-votes", selectedCategory],
    enabled: !!selectedCategory,
  });

  // 월별 1위 조회 (현재 월이 아닌 경우)
  const { data: monthlyWinner } = useQuery<MusicArtist>({
    queryKey: ["/api/music/monthly-winner", selectedCategory, viewingMonth],
    enabled: !!selectedCategory && !isCurrentMonth,
  });

  // 투표하기 뮤테이션
  const voteMutation = useMutation({
    mutationFn: async (artistId: number) => {
      return await apiRequest(`/api/music/vote`, {
        method: "POST",
        body: JSON.stringify({ artistId, categoryId: selectedCategory }),
      });
    },
    onSuccess: (data: VoteResponse, artistId: number) => {
      toast({
        title: "투표 완료!",
        description: data.message,
      });

      // 캐시 무효화
      queryClient.invalidateQueries({ queryKey: ["/api/music/artists", selectedCategory] });
      queryClient.invalidateQueries({ queryKey: ["/api/music/user-votes", selectedCategory] });

      // 로컬 상태 업데이트
      setUserVotes(prev => ({ ...prev, [artistId]: true }));
    },
    onError: (error: Error) => {
      toast({
        title: "투표 실패",
        description: "투표 처리 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    },
  });

  // 첫 번째 카테고리를 기본 선택
  useEffect(() => {
    if (categories.length > 0 && !selectedCategory) {
      setSelectedCategory(categories[0].id);
    }
  }, [categories, selectedCategory]);

  // 사용자 투표 상태 업데이트
  useEffect(() => {
    if (userVoteStatus) {
      setUserVotes(userVoteStatus);
    }
  }, [userVoteStatus]);

  const getRankChange = (current: number, previous: number) => {
    if (previous === 0) return { type: "new", text: "NEW" };
    if (current < previous) return { type: "up", text: `↑${previous - current}` };
    if (current > previous) return { type: "down", text: `↓${current - previous}` };
    return { type: "same", text: "-" };
  };

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1: return <Trophy className="w-4 h-4 text-yellow-500" />;
      case 2: return <Trophy className="w-4 h-4 text-gray-400" />;
      case 3: return <Trophy className="w-4 h-4 text-amber-600" />;
      default: return <span className="w-4 h-4 flex items-center justify-center text-xs font-bold">{rank}</span>;
    }
  };

  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth());

  const getMonthName = (monthStr: string) => {
    const [year, month] = monthStr.split('-');
    return `${year}년 ${parseInt(month)}월`;
  };

  const navigateMonth = (direction: 'prev' | 'next') => {
    const [year, month] = viewingMonth.split('-').map(Number);
    const date = new Date(year, month - 1); // month - 1 because Date uses 0-based months

    if (direction === 'prev') {
      date.setMonth(date.getMonth() - 1);
    } else {
      date.setMonth(date.getMonth() + 1);
    }

    const newMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    setViewingMonth(newMonth);
  };

  // 투표 남은 시간 계산 (매월 말일 기준)
  const getVotingTimeLeft = () => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    // 다음 달 1일 00:00:00 구하기
    const nextMonth = new Date(currentYear, currentMonth + 1, 1, 0, 0, 0);
    const timeDiff = nextMonth.getTime() - now.getTime();

    if (timeDiff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0 };

    const days = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((timeDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((timeDiff % (1000 * 60)) / 1000);

    return { days, hours, minutes, seconds };
  };

  // 실시간 타이머를 위한 상태
  const [timeLeft, setTimeLeft] = useState(getVotingTimeLeft());

  // 1초마다 남은 시간 업데이트
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(getVotingTimeLeft());
    }, 1000);

    return () => clearInterval(timer);
  }, []);



  if (categoriesLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-50 dark:from-gray-900 dark:to-gray-800">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto mb-4"></div>
            <p className="text-gray-600 dark:text-gray-400">로딩 중...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-gray-900 dark:to-gray-800">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-200/20 dark:border-gray-700/20">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Link href="/celebrity-battle">
                <Button variant="ghost" size="sm" className="text-gray-700 dark:text-gray-300 hover:bg-white/50 dark:hover:bg-gray-700/50 p-2 rounded-lg backdrop-blur-sm">
                  <ChevronLeft className="w-5 h-5" />
                </Button>
              </Link>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">🎵 인기 투표</h1>
            </div>
            <div className="bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm px-3 py-1 rounded-full">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{getCurrentMonth()}월</span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-3 py-4">
        {/* Categories Tabs */}
        <Tabs value={selectedCategory.toString()} onValueChange={(value) => setSelectedCategory(parseInt(value))}>
          <div className="mb-6 overflow-x-auto scrollbar-hide">
            <TabsList className="flex w-max min-w-full bg-white/40 dark:bg-gray-800/40 backdrop-blur-md rounded-2xl p-2">
              {categories.map((category: MusicCategory) => {
                // 카테고리별 아이콘 매핑
                const getIcon = (name: string) => {
                  switch (name) {
                    case "남자 아이돌": return "👦";
                    case "여자 아이돌": return "👧";
                    case "혼성 그룹": return "👯";
                    case "남자 솔로": return "👨";
                    case "여자 솔로": return "👩";
                    case "밴드/락": return "🎸";
                    case "힙합/R&B": return "🎤";
                    case "트로트": return "🎻";
                    case "팝/외국 아티스트": return "🌍";
                    default: return "🎵";
                  }
                };

                return (
                  <TabsTrigger
                    key={category.id}
                    value={category.id.toString()}
                    className="flex items-center space-x-2 text-sm font-medium rounded-xl whitespace-nowrap px-4 py-3 mx-1 data-[state=active]:bg-white/90 dark:data-[state=active]:bg-gray-700/90 data-[state=active]:text-gray-900 dark:data-[state=active]:text-white text-gray-600 dark:text-gray-400 transition-all duration-300 backdrop-blur-sm"
                  >
                    <span className="text-lg">{getIcon(category.name)}</span>
                    <span>{category.name}</span>
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </div>

          {categories.map((category: MusicCategory) => (
            <TabsContent key={category.id} value={category.id.toString()}>
              {/* First Place Winner Banner */}
              {(artists.length > 0 || (!isCurrentMonth && monthlyWinner)) && (
                <Card className="mb-6 bg-white/70 dark:bg-gray-800/60 backdrop-blur-md border-0 overflow-hidden relative">
                  {/* Celebration Animation */}
                  <div className="absolute inset-0 pointer-events-none overflow-hidden">
                    {/* Fireworks Animation */}
                    <div className="absolute top-4 left-1/4 w-2 h-2 bg-yellow-400 rounded-full animate-ping"></div>
                    <div className="absolute top-6 right-1/3 w-1.5 h-1.5 bg-pink-400 rounded-full animate-pulse" style={{ animationDelay: '0.5s' }}></div>
                    <div className="absolute top-8 left-1/2 w-2.5 h-2.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '1s' }}></div>
                    <div className="absolute top-3 right-1/4 w-1 h-1 bg-green-400 rounded-full animate-ping" style={{ animationDelay: '1.5s' }}></div>
                    <div className="absolute top-7 left-3/4 w-2 h-2 bg-purple-400 rounded-full animate-pulse" style={{ animationDelay: '2s' }}></div>

                    {/* Floating Stars */}
                    <div className="absolute top-2 left-8 text-yellow-400 animate-bounce text-sm" style={{ animationDelay: '0.3s' }}>⭐</div>
                    <div className="absolute top-4 right-8 text-pink-400 animate-pulse text-xs" style={{ animationDelay: '1.2s' }}>✨</div>
                    <div className="absolute top-6 left-16 text-blue-400 animate-ping text-xs" style={{ animationDelay: '0.8s' }}>💫</div>
                    <div className="absolute top-3 right-16 text-purple-400 animate-bounce text-sm" style={{ animationDelay: '1.8s' }}>🌟</div>

                    {/* Confetti Particles */}
                    <div className="absolute top-1 left-1/3 w-1 h-3 bg-red-400 transform rotate-45 animate-pulse" style={{ animationDelay: '0.7s' }}></div>
                    <div className="absolute top-2 right-1/2 w-1 h-2 bg-orange-400 transform -rotate-45 animate-ping" style={{ animationDelay: '1.3s' }}></div>
                    <div className="absolute top-5 left-2/3 w-1.5 h-1.5 bg-cyan-400 transform rotate-12 animate-bounce" style={{ animationDelay: '0.9s' }}></div>
                  </div>

                  <CardContent className="p-6 relative z-10">
                    <div className="text-center">
                      {/* Header with Navigation */}
                      <div className="flex items-center justify-between mb-4">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigateMonth('prev')}
                          className="text-gray-600 dark:text-gray-400 hover:bg-white/50 dark:hover:bg-gray-700/50 p-2 rounded-lg"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </Button>

                        <div className="flex items-center space-x-2">
                          <span className="text-2xl animate-bounce">🏆</span>
                          <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                            {category.name} 1위
                          </h2>
                        </div>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigateMonth('next')}
                          className="text-gray-600 dark:text-gray-400 hover:bg-white/50 dark:hover:bg-gray-700/50 p-2 rounded-lg"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </Button>
                      </div>

                      {/* Winner Info */}
                      <div className="bg-white/80 dark:bg-gray-900/50 rounded-2xl p-5 backdrop-blur-sm mb-4">
                        {isCurrentMonth ? (
                          // 현재 월 데이터
                          <>
                            <div className="flex items-center justify-center space-x-2 mb-2">
                              <span className="text-2xl font-black text-gray-900 dark:text-white">
                                {artists[0]?.name || "준비중"}
                              </span>
                              <span className="text-xl">👑</span>
                            </div>

                            <div className="flex items-center justify-center space-x-4 text-sm">
                              <div className="flex items-center space-x-1">
                                <Vote className="w-4 h-4 text-blue-500" />
                                <span className="font-bold text-gray-900 dark:text-white">
                                  {artists[0]?.currentMonthVotes || 0}표
                                </span>
                              </div>
                              {artists[0]?.agency && (
                                <div className="flex items-center space-x-1">
                                  <span className="text-gray-600 dark:text-gray-400">|</span>
                                  <span className="text-gray-700 dark:text-gray-300">
                                    {artists[0].agency}
                                  </span>
                                </div>
                              )}
                            </div>
                          </>
                        ) : (
                          // 이전/다음 월 데이터
                          <>
                            <div className="flex items-center justify-center space-x-2 mb-2">
                              <span className="text-2xl font-black text-gray-900 dark:text-white">
                                {monthlyWinner?.name || "데이터 없음"}
                              </span>
                              <span className="text-xl">👑</span>
                            </div>

                            {monthlyWinner && (
                              <div className="flex items-center justify-center space-x-4 text-sm">
                                <div className="flex items-center space-x-1">
                                  <Trophy className="w-4 h-4 text-yellow-500" />
                                  <span className="font-bold text-gray-900 dark:text-white">
                                    {monthlyWinner.totalVotes}표
                                  </span>
                                </div>
                                {monthlyWinner.agency && (
                                  <div className="flex items-center space-x-1">
                                    <span className="text-gray-600 dark:text-gray-400">|</span>
                                    <span className="text-gray-700 dark:text-gray-300">
                                      {monthlyWinner.agency}
                                    </span>
                                  </div>
                                )}
                              </div>
                            )}
                          </>
                        )}
                      </div>

                      {/* Monthly Champion Badge with Countdown */}
                      <div className="mt-3 space-y-2">
                        <div className="inline-flex items-center space-x-1 bg-gradient-to-r from-blue-500/10 to-purple-500/10 backdrop-blur-sm px-3 py-1 rounded-full border border-blue-200/30 dark:border-purple-400/30">
                          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                            🎉 월간 챔피언 | {getMonthName(viewingMonth)}
                          </span>
                        </div>

                        {/* Countdown Timer (only for current month) */}
                        {isCurrentMonth && (
                          <div className="inline-flex items-center space-x-1 bg-gradient-to-r from-red-500/10 to-orange-500/10 backdrop-blur-sm px-3 py-1 rounded-full border border-red-200/30 dark:border-orange-400/30">
                            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                              ⏰ 투표 남은 시간: {timeLeft.days}일 {timeLeft.hours}시 {timeLeft.minutes}분 {timeLeft.seconds}초
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Voting Ticket Display */}
              {(artists.length > 0 || (!isCurrentMonth && monthlyWinner)) && (
                <Card className="mb-6 bg-white/50 dark:bg-gray-800/40 backdrop-blur-md border-0">
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                          <span className="text-white text-sm">🗳️</span>
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-gray-900 dark:text-white">투표용지</h3>
                          <p className="text-xs text-gray-600 dark:text-gray-400">레벨당 1매 지급</p>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="flex items-center space-x-1">
                          <span className="text-lg font-bold text-blue-600 dark:text-blue-400">
                            {remainingVotes}
                          </span>
                          <span className="text-sm text-gray-600 dark:text-gray-400">매</span>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-500">
                          Lv.{userLevel} ({usedVotes}/{userLevel} 사용)
                        </p>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-gray-600 dark:text-gray-400">투표 진행률</span>
                        <span className="text-gray-600 dark:text-gray-400">
                          {Math.round(voteProgress)}% ({usedVotes}/{userLevel})
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                        <div
                          className="bg-gradient-to-r from-blue-500 to-purple-600 h-2 rounded-full transition-all duration-300"
                          style={{
                            width: `${voteProgress}%`
                          }}
                        ></div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Empty state for no artists */}
              {artists.length === 0 && (
                <Card className="mb-6 bg-white/60 dark:bg-gray-800/50 backdrop-blur-md border-0">
                  <CardContent className="p-8 text-center">
                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center mx-auto mb-4">
                      <span className="text-2xl">{category.icon}</span>
                    </div>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                      {category.name} 랭킹
                    </h2>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      곧 멋진 {category.name} 아티스트들이 등장할 예정이에요!
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* Artists Ranking */}
              {artistsLoading ? (
                <div className="text-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto mb-4"></div>
                  <p className="text-gray-600 dark:text-gray-400">아티스트 목록을 불러오는 중...</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {artists.length === 0 ? (
                    <Card className="bg-gradient-to-r from-pink-50 to-purple-50 dark:from-pink-900/20 dark:to-purple-900/20 border-pink-200/50 dark:border-purple-700/50">
                      <CardContent className="p-6 text-center">
                        <div className="text-pink-400 mb-3">
                          <i className="fas fa-music text-3xl"></i>
                        </div>
                        <h3 className="text-base font-bold text-gray-700 dark:text-gray-300 mb-2">
                          🎵 준비 중이에요
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          곧 멋진 {category.name} 아티스트들이 등장할 예정이에요! ✨
                        </p>
                      </CardContent>
                    </Card>
                  ) : (
                    artists.map((artist: MusicArtist, index: number) => {
                      const rankChange = getRankChange(artist.currentRank, artist.previousRank);
                      const hasVoted = userVotes[artist.id];
                      const rank = index + 1; // 실제 순위 (1부터 시작)

                      // 순위별 스타일 정의 (플랫 디자인)
                      const getCardStyle = (rank: number) => {
                        if (rank === 1) {
                          return {
                            cardClass: "bg-white/80 dark:bg-gray-800/70 backdrop-blur-md border-0 hover:bg-white/90 dark:hover:bg-gray-800/80 transition-all duration-300",
                            padding: "p-4",
                            rankSize: "w-10 h-10",
                            rankBg: "bg-gradient-to-br from-yellow-400 to-amber-500",
                            nameSize: "text-lg font-bold",
                            voteSize: "text-base font-bold",
                            agencySize: "text-sm",
                            buttonClass: "bg-transparent border-2 border-yellow-400 hover:bg-yellow-400 hover:text-white text-yellow-600 dark:text-yellow-400 font-medium disabled:bg-green-50 disabled:border-green-200 disabled:text-green-700 disabled:hover:bg-green-50",
                            iconSize: "text-lg"
                          };
                        } else if (rank === 2) {
                          return {
                            cardClass: "bg-white/70 dark:bg-gray-800/60 backdrop-blur-md border-0 hover:bg-white/80 dark:hover:bg-gray-800/70 transition-all duration-300",
                            padding: "p-3",
                            rankSize: "w-9 h-9",
                            rankBg: "bg-gradient-to-br from-gray-400 to-slate-500",
                            nameSize: "text-base font-bold",
                            voteSize: "text-sm font-bold",
                            agencySize: "text-sm",
                            buttonClass: "bg-transparent border-2 border-gray-400 hover:bg-gray-400 hover:text-white text-gray-600 dark:text-gray-400 font-medium disabled:bg-green-50 disabled:border-green-200 disabled:text-green-700 disabled:hover:bg-green-50",
                            iconSize: "text-base"
                          };
                        } else if (rank === 3) {
                          return {
                            cardClass: "bg-white/70 dark:bg-gray-800/60 backdrop-blur-md border-0 hover:bg-white/80 dark:hover:bg-gray-800/70 transition-all duration-300",
                            padding: "p-3",
                            rankSize: "w-9 h-9",
                            rankBg: "bg-gradient-to-br from-orange-400 to-amber-500",
                            nameSize: "text-base font-bold",
                            voteSize: "text-sm font-bold",
                            agencySize: "text-sm",
                            buttonClass: "bg-transparent border-2 border-orange-400 hover:bg-orange-400 hover:text-white text-orange-600 dark:text-orange-400 font-medium disabled:bg-green-50 disabled:border-green-200 disabled:text-green-700 disabled:hover:bg-green-50",
                            iconSize: "text-base"
                          };
                        } else {
                          return {
                            cardClass: "bg-white/60 dark:bg-gray-800/50 backdrop-blur-md border-0 hover:bg-white/70 dark:hover:bg-gray-800/60 transition-all duration-300",
                            padding: "p-2.5",
                            rankSize: "w-8 h-8",
                            rankBg: "bg-gradient-to-br from-blue-100 to-purple-100 dark:from-blue-900/50 dark:to-purple-900/50",
                            nameSize: "text-sm font-medium",
                            voteSize: "text-xs font-medium",
                            agencySize: "text-xs",
                            buttonClass: "bg-transparent border border-blue-300 hover:bg-blue-50 text-blue-600 dark:text-blue-400 text-xs disabled:bg-green-50 disabled:border-green-200 disabled:text-green-700 disabled:hover:bg-green-50",
                            iconSize: "text-sm"
                          };
                        }
                      };

                      const style = getCardStyle(rank);

                      return (
                        <Card key={artist.id} className={style.cardClass}>
                          <CardContent className={style.padding}>
                            <div className="flex items-center space-x-3">
                              {/* Rank */}
                              <div className="flex flex-col items-center space-y-1">
                                <div className={`flex items-center justify-center ${style.rankSize} rounded-full ${style.rankBg} ${rank <= 3 ? 'shadow-lg' : ''}`}>
                                  <span className={`${style.iconSize} font-bold text-white`}>
                                    {getRankIcon(rank)}
                                  </span>
                                </div>
                                {rankChange.type !== "same" && (
                                  <Badge
                                    variant={rankChange.type === "up" ? "default" : rankChange.type === "down" ? "destructive" : "secondary"}
                                    className="text-xs px-2 py-0.5 rounded-full bg-white/90 dark:bg-gray-700/90 backdrop-blur-sm border-0"
                                  >
                                    {rankChange.text}
                                  </Badge>
                                )}
                              </div>

                              {/* Artist Info */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between">
                                  <div className="flex-1 min-w-0">
                                    <h3 className={`${style.nameSize} font-bold text-gray-900 dark:text-white mb-1 truncate`}>
                                      {artist.name}
                                      {rank === 1 && <span className="ml-2">👑</span>}
                                      {rank === 2 && <span className="ml-2">🥈</span>}
                                      {rank === 3 && <span className="ml-2">🥉</span>}
                                    </h3>
                                    {artist.agency && rank <= 3 && (
                                      <p className={`${style.agencySize} text-gray-500 dark:text-gray-400 mb-1 truncate`}>
                                        {artist.agency}
                                      </p>
                                    )}
                                    <div className="flex items-center space-x-2 text-xs">
                                      <div className="flex items-center space-x-1">
                                        <Vote className="w-3 h-3 text-blue-500" />
                                        <span className={`font-bold text-gray-900 dark:text-white ${style.voteSize}`}>
                                          {artist.currentMonthVotes}표
                                        </span>
                                      </div>
                                      {artist.agency && (
                                        <div className="flex items-center space-x-1">
                                          <span className="text-gray-400">|</span>
                                          <span className="text-gray-600 dark:text-gray-400 text-xs">
                                            {artist.agency}
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                  </div>

                                  {/* Vote Button */}
                                  <Button
                                    size="sm"
                                    onClick={() => voteMutation.mutate(artist.id)}
                                    disabled={
                                      hasVoted ||
                                      voteMutation.isPending ||
                                      remainingVotes <= 0
                                    }
                                    className={`${style.buttonClass} rounded-xl px-3 py-2 transition-all duration-300 text-xs font-medium backdrop-blur-sm`}
                                  >
                                    {voteMutation.isPending ? (
                                      <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-current"></div>
                                    ) : hasVoted ? (
                                      "투표 완료"
                                    ) : remainingVotes <= 0 ? (
                                      "용지 부족"
                                    ) : (
                                      "투표"
                                    )}
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })
                  )}
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>

        {/* Monthly Reset Notice */}
        <Card className="mt-6 bg-white/50 dark:bg-gray-800/40 backdrop-blur-md border-0">
          <CardContent className="p-4 text-center">
            <div className="flex items-center justify-center space-x-2">
              <Calendar className="w-4 h-4 text-blue-500" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                매월 1일 00:00 투표 리셋
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default MusicRanking;