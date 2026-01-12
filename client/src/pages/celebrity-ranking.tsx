import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useSearch } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Minus, Trophy, Calendar, Vote, Search, Plus, UserPlus } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import LightPillar from "@/components/ui/light-pillar";
import { motion, AnimatePresence } from "framer-motion";

interface Category {
  id: number;
  name: string;
  description?: string;
  icon: string;
  color: string;
  isActive: boolean;
  sortOrder: number;
}

interface Celebrity {
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
  success: boolean;
  message: string;
  userVoteCount?: number;
}

const CelebrityRanking = () => {
  const search = useSearch();
  const urlParams = new URLSearchParams(search);
  const categoryParam = urlParams.get('category');

  // 초기 탭과 카테고리 설정
  const getInitialTab = (categoryId: number) => {
    if (categoryId >= 1 && categoryId <= 9) return 'music';
    if ([10, 11, 14, 15].includes(categoryId)) return 'entertainment';
    if ([12, 13, 16, 17].includes(categoryId)) return 'others';
    return 'music';
  };

  const initialCategoryId = categoryParam ? parseInt(categoryParam) : 1;
  const [selectedCategory, setSelectedCategory] = useState<number>(initialCategoryId);
  const [selectedTab, setSelectedTab] = useState<string>(getInitialTab(initialCategoryId));
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
  const userLevel = user?.level || 0;
  const usedVotes = Object.values(userVotes).filter(voted => voted).length;
  const remainingVotes = Math.max(0, userLevel - usedVotes);
  const voteProgress = userLevel > 0 ? (usedVotes / userLevel) * 100 : 0;

  // Helper functions
  const getCurrentMonthString = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  };

  const isCurrentMonth = viewingMonth === getCurrentMonthString();

  // 카테고리 목록 조회
  const { data: categories = [], isLoading: categoriesLoading } = useQuery<Category[]>({
    queryKey: ["/api/music/categories"],
  });

  // 선택된 카테고리의 셀럽 목록 조회
  const { data: celebrities = [], isLoading: celebritiesLoading } = useQuery<Celebrity[]>({
    queryKey: ["/api/music/artists", selectedCategory],
    enabled: !!selectedCategory,
  });

  // 사용자 투표 현황 조회
  const { data: userVoteStatus } = useQuery<Record<number, boolean>>({
    queryKey: ["/api/music/user-votes"],
  });

  // 월별 1위 조회 (현재 월이 아닌 경우)
  const { data: monthlyWinner } = useQuery<Celebrity>({
    queryKey: ["/api/music/monthly-winner", selectedCategory, viewingMonth],
    enabled: !!selectedCategory && !isCurrentMonth,
  });

  // 투표 뮤테이션
  const voteMutation = useMutation({
    mutationFn: async (celebrityId: number) => {
      const response = await apiRequest(`/api/music/vote`, {
        method: "POST",
        body: { artistId: celebrityId, categoryId: selectedCategory },
      });
      return response as VoteResponse;
    },
    onSuccess: (data, celebrityId) => {
      if (data.success) {
        // 로컬 상태 업데이트
        setUserVotes(prev => ({ ...prev, [celebrityId]: true }));

        // 관련 쿼리 무효화
        queryClient.invalidateQueries({ queryKey: ["/api/music/artists", selectedCategory] });
        queryClient.invalidateQueries({ queryKey: ["/api/music/user-votes"] });

        toast({
          title: "투표 완료!",
          description: data.message,
        });
      } else {
        toast({
          title: "투표 실패",
          description: data.message,
          variant: "destructive",
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "투표 실패",
        description: error.message || "투표 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    },
  });

  // 사용자 투표 상태 동기화
  useEffect(() => {
    if (userVoteStatus) {
      setUserVotes(userVoteStatus);
    } else {
      setUserVotes({});
    }
  }, [userVoteStatus]);



  // 랭킹 변화 아이콘 및 텍스트
  const getRankChange = (current: number, previous: number) => {
    if (previous === 0 || previous === current) {
      return { type: "same", icon: <Minus className="w-3 h-3" />, text: "-" };
    } else if (current < previous) {
      return { type: "up", icon: <TrendingUp className="w-3 h-3 text-emerald-500" />, text: `▲${previous - current}` };
    } else {
      return { type: "down", icon: <TrendingDown className="w-3 h-3 text-red-500" />, text: `▼${current - previous}` };
    }
  };

  // 순위별 아이콘
  const getRankIcon = (rank: number) => {
    if (rank === 1) return "👑";
    if (rank === 2) return "🥈";
    if (rank === 3) return "🥉";
    return rank.toString();
  };

  // 선택된 카테고리 정보
  const category = categories.find(cat => cat.id === selectedCategory) || categories[0];

  // 카테고리별 이모지 매핑
  const getCategoryEmoji = (categoryId: number) => {
    const emojiMap: Record<number, string> = {
      1: "🎤", // 남자 아이돌
      2: "✨", // 여자 아이돌
      3: "🎵", // 트로트
      4: "👥", // 혼성 그룹
      5: "🎸", // 남자 솔로
      6: "🌟", // 여자 솔로
      7: "🎸", // 밴드/락
      8: "🎧", // 힙합/R&B
      9: "🌍", // 팝/외국 아티스트
      10: "🎬", // 배우
      11: "😂", // 개그맨
      12: "🏛️", // 정치인
      13: "⚽", // 스포츠
      14: "📺", // 방송인
      15: "📸", // 모델
      16: "👨‍🍳", // 요리사
      17: "✍️", // 작가
    };
    return emojiMap[categoryId] || "⭐";
  };

  // 탭별 카테고리 분류 (통합됨)
  const getTabCategories = (tab: string) => {
    // 탭 구분 없이 전체 카테고리 반환
    return categories;
  };

  // 탭 변경 시 첫 번째 카테고리로 자동 선택
  const handleTabChange = (tab: string) => {
    setSelectedTab(tab);
    const tabCategories = getTabCategories(tab);
    if (tabCategories.length > 0) {
      setSelectedCategory(tabCategories[0].id);
    }
  };

  // 인기 카테고리 판별
  const isPopularCategory = (categoryId: number) => {
    return [1, 2, 10, 11].includes(categoryId); // 남자아이돌, 여자아이돌, 배우, 개그맨
  };

  // 통합 검색 기능
  const performSearch = (term: string) => {
    if (!term.trim()) {
      setSearchResults({ celebrities: [], categories: [] });
      setShowSearchResults(false);
      setShowAddPersonRequest(false);
      return;
    }

    // 카테고리 검색
    const matchedCategories = categories.filter(cat =>
      cat.name.toLowerCase().includes(term.toLowerCase())
    );

    // 인물 검색 (allCelebrities가 로드되어 있어야 함)
    // 여기서는 간단히 celebrities(현재 목록)에서 검색하거나 
    // 전체 목록을 가져오는 로직이 필요하지만, 
    // 기존 코드의 allCelebrities를 활용
    const matchedCelebrities = allCelebrities.filter((celebrity: Celebrity) =>
      celebrity.name.toLowerCase().includes(term.toLowerCase())
    );

    setSearchResults({
      celebrities: matchedCelebrities,
      categories: matchedCategories
    });

    setShowSearchResults(true);
    setShowAddPersonRequest(matchedCelebrities.length === 0 && matchedCategories.length === 0);
  };

  // 인물 선택 시 카테고리 자동 변경 및 하이라이트
  const selectCelebrity = (celebrity: Celebrity) => {
    const category = categories.find(cat => cat.id === celebrity.categoryId);
    if (category) {
      const newTab = getInitialTab(celebrity.categoryId);
      setSelectedTab(newTab);
      setSelectedCategory(celebrity.categoryId);

      setShowSearchResults(false);
      setSearchTerm('');

      setHighlightedCelebrity(celebrity.id);
      setTimeout(() => setHighlightedCelebrity(null), 3000);

      setTimeout(() => {
        const element = document.getElementById(`celebrity-${celebrity.id}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 500);
    }
  };

  // 검색 상태 관리
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [searchResults, setSearchResults] = useState<{ celebrities: Celebrity[], categories: Category[] }>({ celebrities: [], categories: [] });
  const [showSearchResults, setShowSearchResults] = useState<boolean>(false);
  const [highlightedCelebrity, setHighlightedCelebrity] = useState<number | null>(null);
  const [showAddPersonRequest, setShowAddPersonRequest] = useState<boolean>(false);

  // 전체 인물 데이터 (검색용)
  const { data: allCelebrities = [] } = useQuery<Celebrity[]>({
    queryKey: ['/api/music/all-artists'],
    enabled: searchTerm.length > 0
  });

  // 외부 클릭 핸들러
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showSearchResults) {
        const target = event.target as Element;
        if (!target.closest('.search-container')) {
          setShowSearchResults(false);
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showSearchResults]);

  if (categoriesLoading) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6">
        <LightPillar topColor="#10B981" bottomColor="#0891B2" intensity={1.5} rotationSpeed={0.5} />
        <div className="relative z-10 w-12 h-12 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin mb-4"></div>
        <p className="relative z-10 text-[10px] font-black text-white/30 uppercase tracking-widest animate-pulse">데이터 로딩 중...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white selection:bg-emerald-500/30">
      <div className="fixed inset-0 w-full h-full z-0 pointer-events-none">
        <LightPillar
          topColor="#EC4899"
          bottomColor="#831843"
          intensity={1.0}
          rotationSpeed={0.3}
        />
      </div>
      <div className="fixed inset-0 bg-black/60 z-0 pointer-events-none"></div>

      {/* Header */}
      <div className="fixed top-0 left-0 right-0 z-50 p-4 bg-gradient-to-b from-black/80 to-transparent backdrop-blur-sm">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <Link href="/">
            <Button variant="ghost" className="text-white/80 hover:text-white hover:bg-white/10 rounded-full h-10 w-10 p-0">
              <ChevronLeft className="h-5 w-5" />
            </Button>
          </Link>
          <span className="text-lg font-black italic tracking-tight">CELEBRITY BATTLE</span>
          <Link href="/create-vote-topic">
            <Button variant="ghost" className="text-white/80 hover:text-white hover:bg-white/10 rounded-full h-10 w-10 p-0">
              <Plus className="h-6 w-6" />
            </Button>
          </Link>
        </div>
      </div>

      <main className="relative z-10 max-w-md mx-auto px-6 pt-20 pb-32">
        {/* Month Navigation */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card-strong bg-black/40 backdrop-blur-xl rounded-2xl p-2 mb-6 flex items-center justify-between border border-white/10"
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              const [year, month] = viewingMonth.split('-').map(Number);
              const prevDate = new Date(year, month - 2, 1);
              setViewingMonth(`${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`);
            }}
            className="text-white/60 hover:text-white hover:bg-white/10 rounded-xl w-10 h-10 p-0"
          >
            <ChevronLeft className="w-5 h-5" />
          </Button>

          <div className="text-center">
            <h2 className="text-sm font-black text-white">
              {new Date(viewingMonth + '-01').toLocaleDateString('ko-KR', {
                year: 'numeric',
                month: 'long'
              })}
            </h2>
            <p className={`text-[10px] font-bold tracking-widest uppercase ${isCurrentMonth ? 'text-emerald-400' : 'text-white/40'}`}>
              {isCurrentMonth ? '● LIVE VOTING' : 'FINISHED'}
            </p>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              const [year, month] = viewingMonth.split('-').map(Number);
              const nextDate = new Date(year, month, 1);
              const nextMonth = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`;
              if (nextMonth <= getCurrentMonthString()) {
                setViewingMonth(nextMonth);
              }
            }}
            disabled={viewingMonth >= getCurrentMonthString()}
            className="text-white/60 hover:text-white hover:bg-white/10 rounded-xl w-10 h-10 p-0 disabled:opacity-30"
          >
            <ChevronRight className="w-5 h-5" />
          </Button>
        </motion.div>

        {/* Tab Navigation */}
        <div className="mb-6">
          {/* Search Bar */}
          <div className="mb-4 relative search-container z-30">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-4 h-4 text-white/40" />
              <input
                type="text"
                placeholder="카테고리 또는 인물 검색..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  performSearch(e.target.value);
                }}
                onFocus={() => searchTerm && setShowSearchResults(true)}
                className="w-full pl-12 pr-4 py-3 bg-black/20 backdrop-blur-md border border-white/10 rounded-2xl text-sm text-white placeholder-white/40 focus:outline-none focus:ring-1 focus:ring-purple-500/50 focus:border-purple-500/50 transition-all duration-300"
              />
            </div>

            {/* Search Results Dropdown */}
            {showSearchResults && (searchResults.celebrities.length > 0 || searchResults.categories.length > 0) && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-[#1A1A1A] border border-white/10 rounded-2xl shadow-2xl z-50 max-h-60 overflow-y-auto overflow-hidden">
                {/* Categories */}
                {searchResults.categories.length > 0 && (
                  <div className="p-2 border-b border-white/10">
                    <div className="text-[10px] font-bold text-white/40 mb-2 px-2 uppercase tracking-wider">카테고리</div>
                    {searchResults.categories.map(category => (
                      <button
                        key={category.id}
                        onClick={() => {
                          const newTab = getInitialTab(category.id);
                          setSelectedTab(newTab);
                          setSelectedCategory(category.id);
                          setShowSearchResults(false);
                          setSearchTerm('');
                        }}
                        className="w-full flex items-center space-x-3 p-2 hover:bg-white/10 rounded-xl text-left transition-colors"
                      >
                        <span className="text-xl">{getCategoryEmoji(category.id)}</span>
                        <span className="text-sm font-bold text-white">{category.name}</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Celebrities */}
                {searchResults.celebrities.length > 0 && (
                  <div className="p-2">
                    <div className="text-[10px] font-bold text-white/40 mb-2 px-2 uppercase tracking-wider">인물</div>
                    {searchResults.celebrities.map(celebrity => (
                      <button
                        key={celebrity.id}
                        onClick={() => selectCelebrity(celebrity)}
                        className="w-full flex items-center space-x-3 p-2 hover:bg-white/10 rounded-xl text-left transition-colors"
                      >
                        <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-full flex items-center justify-center">
                          <span className="text-white text-[10px] font-bold">
                            {celebrity.name.charAt(0)}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-bold text-white truncate">
                            {celebrity.name}
                          </div>
                          <div className="text-xs text-white/40">
                            {categories.find(cat => cat.id === celebrity.categoryId)?.name}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Add Person Request */}
            {showAddPersonRequest && searchTerm.trim() && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-[#1A1A1A] border border-white/10 rounded-2xl shadow-2xl z-50 p-4">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-full flex items-center justify-center">
                    <UserPlus className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-bold text-white">
                      "{searchTerm}" 인물을 찾을 수 없어요
                    </div>
                    <div className="text-xs text-white/40">
                      목록에 추가를 요청하시겠어요?
                    </div>
                  </div>
                  <Button
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg px-3 text-xs"
                    onClick={() => {
                      toast({
                        title: "요청 완료",
                        description: `"${searchTerm}" 인물 추가 요청이 전송되었습니다.`,
                      });
                      setShowAddPersonRequest(false);
                      setSearchTerm('');
                    }}
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    요청
                  </Button>
                </div>
              </div>
            )}
          </div>



        </div>

        {/* Category Grid */}
        <div className="grid grid-cols-4 gap-2 mb-8">
          {getTabCategories(selectedTab)
            .filter(cat => !showSearchResults && cat.name.toLowerCase().includes(searchTerm.toLowerCase()))
            .map((cat) => {
              const categoryEmoji = getCategoryEmoji(cat.id);
              const isSelected = selectedCategory === cat.id;
              const isPopular = isPopularCategory(cat.id);

              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`
                  relative p-3 rounded-2xl transition-all duration-300 flex flex-col items-center gap-2
                  ${isSelected
                      ? 'bg-black/80 border border-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.3)]'
                      : 'bg-black/40 border border-white/10 hover:bg-black/60'
                    }
                `}
                >
                  {isPopular && (
                    <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
                  )}
                  <span className="text-2xl filter drop-shadow-lg">{categoryEmoji}</span>
                  <span className={`text-[10px] font-bold text-center leading-tight ${isSelected ? 'text-purple-300' : 'text-white/60'
                    }`}>
                    {cat.name.replace('남자 아이돌', '남돌').replace('여자 아이돌', '여돌').replace('팝/외국 아티스트', '해외')}
                  </span>
                </button>
              );
            })}
        </div>

        {/* Content Area */}
        <Tabs value={selectedCategory.toString()} onValueChange={(value) => setSelectedCategory(Number(value))} className="w-full">
          {categories.map((category) => (
            <TabsContent key={category.id} value={category.id.toString()} className="mt-0 focus:outline-none">

              {/* Voting Stats Card */}
              <div className="glass-card-strong bg-black/40 backdrop-blur-xl border border-white/10 shadow-2xl p-5 rounded-[24px] mb-6 relative overflow-hidden">
                <div className="relative z-10 flex items-end justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-1.5 mb-1">
                      <h3 className="text-sm font-black text-white italic tracking-wide">나의 투표권</h3>
                      <span className="text-base">🗳️</span>
                    </div>
                    <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">
                      {user ? `LEVEL ${userLevel} MEMBER` : "GUEST (로그인 필요)"}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-3xl font-black text-emerald-400 drop-shadow-[0_0_10px_rgba(52,211,153,0.5)]">{remainingVotes}</span>
                    <span className="text-xs font-bold text-white/60 ml-1">매 남음</span>
                  </div>
                </div>

                {/* Progress */}
                <div className="w-full bg-black/40 rounded-full h-1.5 overflow-hidden mb-2">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${voteProgress}%` }}
                    className="h-full bg-gradient-to-r from-emerald-400 to-teal-500"
                  />
                </div>
                <div className="flex justify-between text-[9px] font-bold text-white/30">
                  <span>사용 {usedVotes}</span>
                  <span>전체 {userLevel}</span>
                </div>

                <div className="mt-3 text-center bg-emerald-500/10 rounded-lg py-1.5 border border-emerald-500/20">
                  <p className="text-[10px] text-emerald-400 font-bold">
                    ✨ 열심히 투표하고 레벨업하면 투표권 추가 지급! 🎁
                  </p>
                </div>
              </div>

              {/* Monthly Winner Banner (Past) */}
              {!isCurrentMonth && monthlyWinner && (
                <div className="glass-card-strong p-6 rounded-[24px] mb-6 border border-white/10 bg-black/40 backdrop-blur-xl">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-full bg-gradient-to-br from-amber-300 to-yellow-600 flex items-center justify-center shadow-lg border-2 border-amber-200/50">
                      <Trophy className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="text-amber-400 font-bold text-xs mb-1 tracking-widest uppercase">{viewingMonth} WINNER</h3>
                      <p className="text-xl font-black text-white">{monthlyWinner.name}</p>
                      <p className="text-xs text-white/50">{monthlyWinner.currentMonthVotes.toLocaleString()}표 획득</p>
                    </div>
                  </div>
                </div>
              )}

              {/* List */}
              {celebritiesLoading ? (
                <div className="py-20 flex flex-col items-center justify-center">
                  <div className="w-10 h-10 border-4 border-purple-500/30 border-t-purple-500 rounded-full animate-spin mb-4"></div>
                </div>
              ) : celebrities.length === 0 ? (
                <div className="text-center py-20 px-6 glass-card-light rounded-[32px] border border-white/5">
                  <div className="text-4xl mb-4 opacity-50">{getCategoryEmoji(category.id)}</div>
                  <h3 className="text-lg font-bold text-white mb-2">데이터가 없습니다</h3>
                  <p className="text-sm text-white/40">아직 등록된 인물이 없습니다.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {celebrities.map((celebrity: Celebrity, index: number) => {
                    const rankChange = getRankChange(celebrity.currentRank, celebrity.previousRank);
                    const hasVoted = userVotes[celebrity.id];
                    const rank = index + 1;

                    // Rank 1 Special Card
                    if (rank === 1) {
                      return (
                        <div key={celebrity.id} id={`celebrity-${celebrity.id}`} className="relative mb-6">
                          <div className="absolute inset-0 bg-gradient-to-br from-amber-500/20 to-yellow-600/10 blur-xl rounded-[32px]"></div>
                          <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="relative bg-black/40 backdrop-blur-xl border border-amber-500/20 p-6 rounded-[32px] overflow-hidden shadow-2xl"
                          >
                            {celebrity.imageUrl && (
                              <div className="absolute inset-0 z-0">
                                <img src={celebrity.imageUrl} alt={celebrity.name} className="w-full h-full object-cover opacity-30 blur-sm scale-110" />
                                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/80 to-transparent"></div>
                              </div>
                            )}

                            <div className="relative z-10 flex flex-col items-center text-center">
                              <div className="mb-4 relative">
                                <div className="w-24 h-24 rounded-full p-1 bg-gradient-to-br from-amber-300 via-yellow-500 to-amber-700 shadow-[0_0_30px_rgba(251,191,36,0.4)]">
                                  <div className="w-full h-full rounded-full bg-black flex items-center justify-center overflow-hidden border-4 border-black">
                                    {celebrity.imageUrl ? (
                                      <img src={celebrity.imageUrl} alt={celebrity.name} className="w-full h-full object-cover" />
                                    ) : (
                                      <span className="text-4xl">👑</span>
                                    )}
                                  </div>
                                </div>
                                <div className="absolute -bottom-3 left-1/2 transform -translate-x-1/2 bg-amber-500 text-white text-[10px] font-black px-3 py-1 rounded-full border-2 border-black uppercase tracking-wider shadow-lg">
                                  1st Place
                                </div>
                              </div>

                              <h3 className="text-2xl font-black text-white mb-1 drop-shadow-md">{celebrity.name}</h3>
                              {celebrity.agency && <p className="text-sm text-white/60 mb-4">{celebrity.agency}</p>}

                              <div className="flex items-center gap-2 mb-6">
                                <Badge className="bg-white/10 hover:bg-white/10 text-white border-0 px-3 py-1 backdrop-blur-md">
                                  <Vote className="w-3 h-3 mr-1 text-amber-400" />
                                  {celebrity.currentMonthVotes.toLocaleString()}표
                                </Badge>
                              </div>

                              <Button
                                onClick={() => voteMutation.mutate(celebrity.id)}
                                disabled={hasVoted || voteMutation.isPending || remainingVotes <= 0}
                                className={`w-full h-12 rounded-xl text-sm font-bold shadow-lg transition-all ${hasVoted
                                  ? 'bg-white/10 text-white/40'
                                  : 'bg-gradient-to-r from-amber-500 to-yellow-600 hover:from-amber-400 hover:to-yellow-500 text-white shadow-amber-900/40'
                                  }`}
                              >
                                {user ? (hasVoted ? "투표 완료" : "투표하기") : "로그인 필요"}
                              </Button>
                            </div>
                          </motion.div>
                        </div>
                      );
                    }

                    // Rank 2 & 3
                    if (rank <= 3) {
                      const isSecond = rank === 2;
                      const borderColor = isSecond ? "border-gray-400/30" : "border-orange-400/30";
                      const rankColor = isSecond ? "text-gray-300" : "text-orange-300";

                      return (
                        <motion.div
                          key={celebrity.id}
                          layout
                          id={`celebrity-${celebrity.id}`}
                          className={`bg-black/20 backdrop-blur-lg shadow-lg p-4 rounded-[24px] border ${borderColor} flex items-center gap-4`}
                        >
                          <div className={`w-12 h-12 rounded-full flex items-center justify-center font-black text-xl italic ${rankColor} bg-white/5 border border-white/10`}>
                            {rank}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="text-white font-bold">{celebrity.name}</h3>
                              {rankChange.icon}
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-white/40">{celebrity.agency}</span>
                              <span className="text-xs font-bold text-white/60">{celebrity.currentMonthVotes.toLocaleString()}표</span>
                            </div>
                          </div>
                          <Button
                            size="sm"
                            onClick={() => voteMutation.mutate(celebrity.id)}
                            disabled={hasVoted || voteMutation.isPending || remainingVotes <= 0}
                            className={`rounded-xl px-4 h-9 text-xs font-bold ${hasVoted ? 'bg-white/5 text-white/30' : 'bg-white/10 hover:bg-white/20 text-white'
                              }`}
                          >
                            {user ? (hasVoted ? "완료" : "투표") : "로그인"}
                          </Button>
                        </motion.div>
                      );
                    }

                    // Rank 4+
                    return (
                      <div key={celebrity.id} id={`celebrity-${celebrity.id}`} className="flex items-center py-3 px-2 border-b border-white/5 last:border-0 hover:bg-white/[0.02] rounded-xl transition-colors">
                        <div className="w-8 flex-shrink-0 text-center text-sm font-bold text-white/30 italic mr-3">
                          {rank}
                        </div>
                        <div className="flex-1 min-w-0 mr-4">
                          <div className="flex items-center gap-2 mb-0.5">
                            <h3 className="text-sm font-medium text-white/90 truncate">{celebrity.name}</h3>
                            {rankChange.type !== 'same' && (
                              <span className={`text-[9px] ${rankChange.type === 'up' ? 'text-emerald-500' : 'text-red-500'}`}>
                                {rankChange.text.replace('▲', '↑').replace('▼', '↓')}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-white/40">
                            <span className="truncate">{celebrity.agency || category.name}</span>
                            <span className="w-0.5 h-0.5 rounded-full bg-white/30"></span>
                            <span>{celebrity.currentMonthVotes.toLocaleString()}표</span>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => voteMutation.mutate(celebrity.id)}
                          disabled={hasVoted || voteMutation.isPending || remainingVotes <= 0}
                          className={`h-8 rounded-lg px-3 text-[10px] font-bold ${hasVoted ? 'bg-transparent text-white/20 border border-white/5' : 'bg-black/40 hover:bg-black/60 text-white border border-white/10'
                            }`}
                        >
                          {user ? (hasVoted ? "완료" : "투표") : "로그인"}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>

        {/* Footer Notice */}
        <div className="mt-8 text-center">
          <p className="text-[10px] text-white/20 font-medium">
            투표는 매월 1일 00:00에 리셋됩니다.
          </p>
        </div>
      </main>
    </div>
  );
};

export default CelebrityRanking;