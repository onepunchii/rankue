import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import MobileHeader from "@/components/mobile-header";
import BottomNav from "@/components/bottom-nav";
import { SEOHead } from "@/components/seo-head";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import GuestRestrictionModal from "@/components/GuestRestrictionModal";
import { useToast } from "@/hooks/use-toast";
import { Search, Loader2 } from "lucide-react";

interface NewsArticle {
  id: string;
  title: string;
  description: string;
  link: string;
  provider: string;
  pubDate: string;
  category: string;
  hasAnalysis?: boolean;
}

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));

  if (diffInMinutes < 60) {
    return `${diffInMinutes}분 전`;
  } else if (diffInMinutes < 1440) {
    return `${Math.floor(diffInMinutes / 60)}시간 전`;
  } else {
    return `${Math.floor(diffInMinutes / 1440)}일 전`;
  }
}

function getCategoryColor(category: string): string {
  switch (category) {
    case '정치':
      return 'text-red-400';
    case '경제':
      return 'text-blue-400';
    case '사회':
      return 'text-green-400';
    case '토론': // 이슈/토론
      return 'text-purple-400';
    case '랭킹':
      return 'text-rose-400';
    case '생활/문화':
    case '기타':
      return 'text-amber-400';
    case 'IT/과학':
      return 'text-cyan-400';
    case '세계':
      return 'text-indigo-400';
    default:
      return 'text-gray-400';
  }
}

// Helper to clean HTML entities and tags
function cleanText(text: string): string {
  if (!text) return "";
  return text
    .replace(/<[^>]*>?/gm, '') // Remove HTML tags
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

export default function NewsPage() {
  const [, setLocation] = useLocation();
  const [selectedCategory, setSelectedCategory] = useState<string>("전체");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [limit, setLimit] = useState(50);
  const [generatingPoll, setGeneratingPoll] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [isGuestModalOpen, setIsGuestModalOpen] = useState(false);
  const { toast } = useToast();

  // Debouncing search query to avoid heavy server load
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
      setLimit(50); // Reset limit on search
    }, 600);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    setLimit(50); // Reset limit on category change
  }, [selectedCategory]);

  const { data: newsArticles = [], isLoading, isFetching } = useQuery<NewsArticle[]>({
    queryKey: ["/api/news", selectedCategory, debouncedQuery, limit],
    queryFn: async () => {
      const url = new URL("/api/news", window.location.origin);
      if (selectedCategory !== "전체") url.searchParams.append("category", selectedCategory);
      if (debouncedQuery) url.searchParams.append("q", debouncedQuery);
      url.searchParams.append("limit", limit.toString());

      const res = await fetch(url.toString());
      if (!res.ok) throw new Error("Failed to fetch news");
      return res.json();
    },
    refetchInterval: 6 * 60 * 60 * 1000,
    staleTime: 60 * 1000, // Reduced staleTime for search freshness
  });

  // Infinite Scroll Observer logic
  useEffect(() => {
    if (isLoading || isFetching) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && newsArticles.length >= limit) {
          setLimit((prev) => prev + 20);
        }
      },
      { threshold: 0.1 }
    );

    const sentinel = document.getElementById("scroll-sentinel");
    if (sentinel) observer.observe(sentinel);

    return () => observer.disconnect();
  }, [newsArticles.length, limit, isLoading, isFetching]);

  const { data: existingSurveys = [] } = useQuery({
    queryKey: ["/api/surveys"],
  });

  const generateSurveyMutation = useMutation({
    mutationFn: async ({ newsTitle, newsDescription, newsSourceUrl }: { newsTitle: string; newsDescription?: string; newsSourceUrl?: string }) => {
      return await apiRequest("/api/surveys/generate-from-news", {
        method: "POST",
        body: { newsTitle, newsDescription, newsSourceUrl }
      });
    },
    onSuccess: (data) => {
      toast({
        title: "AI 설문이 생성되었습니다!",
        description: "새로운 설문에 참여해보세요."
      });
      setGeneratingPoll(null);
      queryClient.invalidateQueries({ queryKey: ["/api/surveys"] });
      setLocation('/surveys');
    },
    onError: (error: any) => {
      console.error("AI 설문 생성 실패:", error);
      setGeneratingPoll(null);
      if (error.message?.includes("프로필 인증") || error.status === 403) {
        setIsGuestModalOpen(true);
      } else {
        toast({
          variant: "destructive",
          title: "설문 생성에 실패했습니다",
          description: error.message || "오류가 발생했습니다."
        });
      }
    }
  });

  const isArticleAlreadyUsed = (article: NewsArticle): boolean => {
    if (!existingSurveys || !Array.isArray(existingSurveys) || existingSurveys.length === 0) return false;
    if (article.link) {
      if (existingSurveys.some((survey: any) => survey.newsSourceUrl === article.link)) return true;
    }
    return false;
  };

  const handleGeneratePoll = (article: NewsArticle, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!user || user.isGuest) {
      setIsGuestModalOpen(true);
      return;
    }

    if (isArticleAlreadyUsed(article)) {
      toast({
        variant: "destructive",
        title: "이미 생성된 투표입니다",
        description: "이 기사로는 이미 투표가 생성되어 있습니다."
      });
      return;
    }

    setGeneratingPoll(article.id);
    generateSurveyMutation.mutate({
      newsTitle: cleanText(article.title),
      newsDescription: cleanText(article.description),
      newsSourceUrl: article.link
    });
  };

  const categories = ["전체", "랭킹", "토론", "정치", "경제", "사회", "기타"];

  return (
    <div className="min-h-screen bg-black text-white">
      <SEOHead
        title="실시간 뉴스 | Polli 설문조사"
        description="최신 뉴스를 확인하고 AI 기반 설문조사를 생성하세요."
        keywords="실시간 뉴스, AI 설문생성, 뉴스 투표"
        url="https://polli.replit.app/news"
        type="website"
      />
      <MobileHeader />

      <main className="max-w-md mx-auto pb-32">
        <section className="px-6 py-8">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-between mb-8"
          >
            <div>
              <div className="flex items-center space-x-2 mb-2">
                <div className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-pulse"></div>
                <span className="text-[10px] font-black text-purple-500/60 uppercase tracking-[0.2em]">Live Update</span>
              </div>
              <h1 className="text-3xl font-black italic uppercase tracking-tighter">실시간 뉴스</h1>
            </div>
            <div className="text-right">
              <div className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-1">자동 수집</div>
              <div className="flex items-center justify-end space-x-1 text-xs font-black text-white/60">
                <i className="fas fa-clock text-[10px]"></i>
                <span className="italic">1시간마다</span>
              </div>
            </div>
          </motion.div>

          {/* Search Bar - Aesthetic & Functional */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative mb-6"
          >
            <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
              {isFetching ? (
                <Loader2 className="w-4 h-4 text-purple-500 animate-spin" />
              ) : (
                <Search className="w-4 h-4 text-white/30" />
              )}
            </div>
            <Input
              type="text"
              placeholder="제목 또는 내용으로 뉴스 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white/5 border-white/10 rounded-2xl pl-11 pr-4 py-6 text-sm font-medium placeholder:text-white/20 focus:bg-white/10 focus:border-purple-500/50 transition-all duration-300 shadow-2xl"
            />
          </motion.div>

          <div className="flex space-x-2 overflow-x-auto pb-4 scrollbar-hide">
            {categories.map((category, idx) => (
              <motion.button
                key={category}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: idx * 0.05 }}
                onClick={() => setSelectedCategory(category)}
                className={`flex-shrink-0 px-5 py-2.5 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all duration-300 ${selectedCategory === category
                  ? 'bg-purple-600 text-white shadow-[0_0_20px_rgba(147,51,234,0.3)]'
                  : 'bg-white/5 text-white/40 border border-white/5 hover:bg-white/10'
                  }`}
              >
                {category}
              </motion.button>
            ))}
          </div>
        </section>

        <section className="px-6">
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-40 w-full glass-card-light animate-pulse rounded-3xl" />
              ))}
            </div>
          ) : newsArticles.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="glass-card-light p-12 text-center rounded-3xl border border-white/5"
            >
              <i className="fas fa-newspaper text-3xl text-white/10 mb-4 h-12 w-12 flex items-center justify-center mx-auto bg-white/5 rounded-2xl"></i>
              <p className="text-sm font-bold text-white/30 uppercase tracking-widest leading-relaxed">
                {debouncedQuery ? `'${debouncedQuery}'에 대한 기사가 없습니다` : "해당 카테고리의 뉴스가 없습니다"}
              </p>
            </motion.div>
          ) : (
            <div className="space-y-5">
              <AnimatePresence mode="popLayout">
                {newsArticles.map((article, idx) => (
                  <motion.div
                    key={article.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ delay: Math.min(idx * 0.1, 0.5) }}
                  >
                    <Card
                      className="glass-card-light border-white/5 bg-white/[0.02] overflow-hidden rounded-3xl group hover:bg-white/[0.05] transition-all duration-500 shadow-2xl cursor-pointer"
                      onClick={() => {
                        const url = article.link;
                        if (url) {
                          setLocation(`/news/view?url=${encodeURIComponent(url)}`);
                        }
                      }}
                    >
                      <CardContent className="p-6">
                        <div className="flex items-start justify-between mb-4">
                          <span className={`text-[9px] font-black px-3 py-1 rounded-lg border border-white/5 uppercase tracking-widest ${getCategoryColor(article.category)}`}>
                            {article.category}
                          </span>
                          <div className="flex items-center space-x-3 text-[10px] font-bold text-white/30 italic">
                            <div className="flex items-center space-x-1.5">
                              {article.hasAnalysis && (
                                <div className="flex items-center justify-center w-4 h-4 bg-purple-500/10 rounded-full border border-purple-500/20">
                                  <i className="fas fa-brain text-[8px] text-purple-400"></i>
                                </div>
                              )}
                              <span>{article.provider}</span>
                            </div>
                            <span className="w-1 h-1 bg-white/10 rounded-full"></span>
                            <span>{formatTimeAgo(article.pubDate)}</span>
                          </div>
                        </div>
                        <h3 className="text-base font-black text-white leading-snug mb-3 group-hover:text-purple-400 transition-colors">{cleanText(article.title)}</h3>
                        {article.description && (
                          <p className="text-xs font-medium text-white/40 leading-relaxed line-clamp-2 mb-5">{cleanText(article.description)}</p>
                        )}
                        <div className="flex items-center justify-between pt-5 border-t border-white/5">
                          <button
                            className="flex items-center space-x-2 text-[10px] font-black text-white/40 hover:text-white transition-colors uppercase tracking-widest"
                            onClick={(e) => {
                              e.stopPropagation();
                              window.open(article.link, '_blank', 'noopener,noreferrer');
                            }}
                          >
                            <i className="fas fa-external-link-alt text-[8px]"></i>
                            <span>Read Article</span>
                          </button>
                          {isArticleAlreadyUsed(article) ? (
                            <div className="flex items-center space-x-1.5 text-[10px] font-black text-emerald-500/80 uppercase tracking-widest bg-emerald-500/5 px-3 py-1.5 rounded-xl border border-emerald-500/10">
                              <i className="fas fa-check-double"></i>
                              <span>Generated</span>
                            </div>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="bg-purple-600/10 hover:bg-purple-600 border border-purple-500/20 text-purple-400 hover:text-white h-9 px-4 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg hover:shadow-purple-500/20 disabled:opacity-30"
                              disabled={generatingPoll === article.id}
                              onClick={(e) => handleGeneratePoll(article, e)}
                            >
                              {generatingPoll === article.id ? (
                                <div className="flex items-center">
                                  <i className="fas fa-spinner fa-spin mr-2"></i>
                                  Creating...
                                </div>
                              ) : (
                                <div className="flex items-center">
                                  <i className="fas fa-brain mr-2"></i>
                                  속마음 기사
                                </div>
                              )}
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </AnimatePresence>

              {/* Infinite Scroll Sentinel & Loader */}
              <div id="scroll-sentinel" className="pt-8 pb-12 flex justify-center">
                {isFetching && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex flex-col items-center space-y-3"
                  >
                    <div className="w-8 h-8 relative">
                      <div className="absolute inset-0 border-2 border-purple-500/20 rounded-full"></div>
                      <div className="absolute inset-0 border-2 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
                    </div>
                    <span className="text-[10px] font-black text-purple-500/60 uppercase tracking-widest italic">Loading More...</span>
                  </motion.div>
                )}
              </div>
            </div>
          )}
        </section>
      </main>

      <GuestRestrictionModal
        isOpen={isGuestModalOpen}
        onClose={() => setIsGuestModalOpen(false)}
        feature="AI 설문 생성"
        description="AI 설문 생성은 회원만 사용할 수 있습니다. 회원가입하고 다양한 기능을 이용해보세요!"
      />
      <BottomNav />
    </div>
  );
}